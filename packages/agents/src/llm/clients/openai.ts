import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { promptRecord } from "../prompt-record.js";
import {
  isTransientTransportError,
  withTransientRetry,
  type LlmChatClient,
  type LlmChatRequest,
  type LlmChatResponse,
  TURN_PLAN_DESCRIPTION,
} from "./types.js";

export interface OpenAiChatClientOptions {
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
  /**
   * Ask for a provider reasoning summary alongside the answer. Off by default.
   *
   * The answer carries its own `reasoning` now, which is what the trace viewer
   * shows, so the summary is redundant where it arrives at all -- and it does
   * not reliably arrive: gpt-5.6 returned `summary: []` on 21 of 25 calls in a
   * recorded match even at `detailed`, including one that thought for 1146
   * tokens. Kept as an opt-in for comparing the provider's account of a
   * decision against the model's own; `null` is accepted as a spelling of off.
   */
  reasoningSummary?: "auto" | "concise" | "detailed" | null;
}

function isTransientOpenAiError(error: unknown): boolean {
  if (error instanceof OpenAI.APIUserAbortError) return false;
  if (
    error instanceof OpenAI.APIConnectionError ||
    error instanceof OpenAI.InternalServerError
  ) {
    return true;
  }
  return isTransientTransportError(error);
}

/**
 * The shape of an action id, enforced by the response schema.
 *
 * The request labels its offers `action-1`, `action-2`, in the order it lists
 * them, and the agent maps the answer back to engine action IDs. So the schema
 * describes a label rather than an engine ID, and the pattern is the same on
 * every call of every game.
 *
 * Constant is the property that matters. This was once an `enum` of the exact
 * legal IDs, which made an illegal choice impossible -- and made every request
 * uncacheable, because the response format is part of the cached prefix and the
 * legal IDs change every decision. Measured against the API, a constant schema
 * reads its whole prefix from cache on the second call while a per-decision
 * enum reads zero, every call, forever; three recorded runs paid full price on
 * 271,000,000 input tokens for it. A label pattern must not drift back into
 * that: it may never be derived from the actions on offer.
 *
 * What a pattern cannot do is tell a well-formed label from an offered one --
 * `action-99` matches when eleven actions are listed. That is what the
 * correction round in `chooseAction` is for; it costs one retry on the rare
 * miss instead of a cache miss on every call.
 */
const ACTION_ID_PATTERN = "^action-[0-9]+$";

/** Content block types a breakpoint may attach to in the Responses API. */
const CACHEABLE_BLOCK_TYPES = new Set([
  "input_text",
  "input_image",
  "input_file",
]);

/**
 * Whether a breakpoint can attach to this item's last content block.
 *
 * Assistant messages render as `output_text` and reasoning items carry no
 * content at all, so neither can hold one; marking them is an API error, not a
 * missed optimisation.
 */
function canCarryBreakpoint(item: unknown): boolean {
  const content = promptRecord(item)?.["content"];
  if (typeof content === "string") return true;
  if (!Array.isArray(content) || content.length === 0) return false;
  const type = promptRecord(content.at(-1))?.["type"];
  return typeof type === "string" && CACHEABLE_BLOCK_TYPES.has(type);
}

/** The item carrying a breakpoint on its last content block, and nowhere else. */
function withBreakpoint(item: unknown, marked: boolean): unknown {
  const record = promptRecord(item);
  const content = record?.["content"];
  if (!record) return item;
  if (typeof content === "string") {
    return marked
      ? {
          ...record,
          content: [
            {
              type: "input_text" as const,
              text: content,
              prompt_cache_breakpoint: { mode: "explicit" as const },
            },
          ],
        }
      : item;
  }
  if (!Array.isArray(content)) return item;
  const blocks: unknown[] = content as unknown[];
  const last = blocks.length - 1;
  return {
    ...record,
    content: blocks.map((block, index): unknown => {
      const fields = promptRecord(block);
      if (!fields) return block;
      const rest: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (key !== "prompt_cache_breakpoint") rest[key] = value;
      }
      return marked && index === last
        ? { ...rest, prompt_cache_breakpoint: { mode: "explicit" as const } }
        : rest;
    }),
  };
}

/**
 * Mark the system message as the cached prefix.
 *
 * A request is two messages and the first of them never changes for the length
 * of a game, so there is exactly one prefix worth writing and it is always in
 * the same place. This used to place three breakpoints and strip older ones,
 * because the conversation grew and each call wanted the previous call's
 * position to stay readable. Nothing grows now: the user message is fresh every
 * time and marking it would write an entry no later request could ever read.
 */
function cacheBreakpoints(items: readonly unknown[]): unknown[] {
  const head = items.findIndex((item) => canCarryBreakpoint(item));
  return items.map((item, index) => withBreakpoint(item, index === head));
}

/**
 * The provider request body for one decision, in OpenAI Responses shape.
 *
 * Extracted from `OpenAiChatClient` because the gateway client sends the same
 * body to the same `/v1/responses` contract. The caching reasoning below is the
 * expensive part to get right, so both transports read from one copy of it
 * rather than drifting apart.
 */
export function responsesRequestBody(
  model: string,
  options: {
    temperature?: number | undefined;
    reasoningSummary?: "auto" | "concise" | "detailed" | null | undefined;
  },
  request: LlmChatRequest,
): { body: Record<string, unknown> } {
  const { temperature } = options;
  const summary = options.reasoningSummary;
  const reasoningSummary = summary ? { summary } : {};
  const explicitCache = /^(?:[a-z-]+:)?gpt-5\.(?:[6-9]|\d{2,})(?:-|$)/.test(
    model,
  );
  const rendered = request.messages.map(({ role, content }) => ({
    role,
    content,
  }));
  const input = explicitCache ? cacheBreakpoints(rendered) : rendered;
  const body = {
    model,
    input,
    ...(temperature === undefined ? {} : { temperature }),
    ...(request.promptCacheKey
      ? { prompt_cache_key: request.promptCacheKey }
      : {}),
    ...(explicitCache
      ? { prompt_cache_options: { mode: "explicit", ttl: "30m" } }
      : {}),
    store: false,
    // Omitted entirely when neither half is set: an empty `reasoning` object
    // says nothing the default does not already say.
    ...(request.reasoningEffort || summary
      ? {
          reasoning: {
            ...(request.reasoningEffort
              ? { effort: request.reasoningEffort }
              : {}),
            ...reasoningSummary,
          },
        }
      : {}),
    text: {
      format: {
        type: "json_schema",
        name: "legal_action",
        strict: true,
        schema: {
          type: "object",
          // The plan, then the reasoning, then the actions: a field generated
          // before the answer is thinking that shapes it, where one generated
          // after is a justification of a choice already made. So the order is
          // the order the decision is made in -- the turn, then why this step
          // of it, then the step. Asked for in the answer rather than taken
          // from the provider's summary because the summary is not reliably
          // returned -- see `reasoningSummary`.
          properties: {
            turnPlan: {
              type: "array",
              items: { type: "string" },
              description: TURN_PLAN_DESCRIPTION,
            },
            reasoning: {
              type: "string",
              description:
                "Why this line, in one or two sentences: the candidate you rejected and what decided it. Written before the action IDs so it is the thinking that produced them.",
            },
            actionIds: {
              type: "array",
              items: { type: "string", pattern: ACTION_ID_PATTERN },
              minItems: 1,
              description:
                "One action ID normally; to give several DON!! to the same target in one response, repeat that attach-don action ID once per DON!! to give; during the counter phase, ordered hand-counter action IDs followed by pass-counter.",
            },
          },
          required: ["turnPlan", "reasoning", "actionIds"],
          additionalProperties: false,
        },
      },
    },
  };
  return { body };
}

/**
 * A Responses result, in the shape both transports have to be read from.
 *
 * The OpenAI SDK returns this typed; the gateway SDK returns `unknown` because
 * the response event stream has no single generated model. Narrowing here means
 * the gateway path validates what it received instead of casting and finding out
 * at the first property access.
 */
interface ResponsesResult {
  output_text?: unknown;
  output?: unknown;
}

/** Read one Responses result into an `LlmChatResponse`. */
export function readResponsesResult(
  result: unknown,
  request: unknown,
): LlmChatResponse {
  const narrowed: ResponsesResult = promptRecord(result) ?? {};
  const content = narrowed.output_text;
  if (typeof content !== "string" || !content) {
    throw new Error("LLM_INVALID_RESPONSE: missing message content");
  }
  const output: readonly unknown[] = Array.isArray(narrowed.output)
    ? (narrowed.output as readonly unknown[])
    : [];
  const reasoningSummary = output
    .map((item) => promptRecord(item))
    .filter((item) => item?.type === "reasoning")
    .flatMap((item): readonly unknown[] =>
      Array.isArray(item?.summary) ? (item.summary as readonly unknown[]) : [],
    )
    .map((part) => promptRecord(part)?.text)
    .map((text) => (typeof text === "string" ? text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
  return {
    content,
    ...(reasoningSummary ? { reasoningSummary } : {}),
    rawExchange: { request, response: result },
  };
}

export class OpenAiChatClient implements LlmChatClient {
  readonly #client: OpenAI;
  readonly #model: string;
  readonly #temperature: number | undefined;
  readonly #maxRetries: number;
  readonly #reasoningSummary: OpenAiChatClientOptions["reasoningSummary"];

  constructor(options: OpenAiChatClientOptions) {
    this.#reasoningSummary = options.reasoningSummary;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#client = new OpenAI({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      maxRetries: this.#maxRetries,
    });
    this.#model = options.model;
    this.#temperature = options.temperature;
  }

  async complete(request: LlmChatRequest): Promise<LlmChatResponse> {
    const { body } = responsesRequestBody(
      this.#model,
      {
        temperature: this.#temperature,
        reasoningSummary: this.#reasoningSummary,
      },
      request,
    );
    const result = await withTransientRetry(
      this.#maxRetries,
      isTransientOpenAiError,
      () =>
        this.#client.responses.create(
          body as unknown as ResponseCreateParamsNonStreaming,
          request.signal ? { signal: request.signal } : undefined,
        ),
    );
    return readResponsesResult(result, body);
  }
}
