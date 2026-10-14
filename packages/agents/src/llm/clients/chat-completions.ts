import {
  isTransientTransportError,
  withTransientRetry,
  type LlmChatClient,
  type LlmChatRequest,
  type LlmChatResponse,
  TURN_PLAN_DESCRIPTION,
} from "./types.js";

/**
 * The Chat Completions transport, for endpoints that do not serve `/responses`.
 *
 * OpenCode Zen -- and every OpenAI-compatible proxy like it -- routes GPT
 * models to `/responses` and everything else, DeepSeek and Kimi and GLM and the
 * rest, to `/chat/completions` only. `OpenAiChatClient` already reaches the
 * first through `baseURL`; this reaches the second, so the choice of model is
 * not also a choice of whether the simulator can talk to it.
 *
 * The two contracts differ in what carries the conversation. `/responses`
 * replays provider-shaped items and this replays plain messages, so the items
 * the agent is holding are converted on the way out and the answer is handed
 * back in the same shape the agent already appends -- the agent does not learn
 * which transport it is on.
 *
 * What is deliberately not sent: `prompt_cache_key`, cache breakpoints and
 * `context_management`. Those are Responses-API fields, and a proxy that
 * caches on this endpoint does it by prefix without being asked.
 */
export interface ChatCompletionsClientOptions {
  model: string;
  /** Root without a trailing slash, e.g. `https://opencode.ai/zen/go/v1`. */
  baseURL: string;
  apiKey?: string;
  temperature?: number;
  maxRetries?: number;
  /**
   * How hard to constrain the answer's shape.
   *
   * A proxy fronts many providers and they do not agree: OpenCode Zen answers
   * a `json_schema` request for DeepSeek with "This response_format type is
   * unavailable now" and fails the whole call. Rather than make the caller know
   * which model supports what, the client starts at `json_schema` and steps
   * down -- `json_object`, then nothing -- the first time an endpoint rejects
   * the format, and stays there. Each step keeps less: the schema keeps a
   * malformed action ID out of the answer, JSON mode keeps the answer parseable,
   * and nothing leaves the prompt's own output contract with the agent's
   * correction round behind it.
   */
  structuredOutputs?: StructuredOutputMode;
  /** Injected transport. The single seam the tests mock. */
  fetch?: typeof globalThis.fetch;
}

/** Strongest first; the client walks down this list as an endpoint refuses. */
export const STRUCTURED_OUTPUT_MODES = [
  "json_schema",
  "json_object",
  "off",
] as const;
export type StructuredOutputMode = (typeof STRUCTURED_OUTPUT_MODES)[number];

/** The action-ID shape, matching the Responses schema. See `llm.ts`. */
const ACTION_ID_PATTERN = "^action-[0-9]+$";

export function chatCompletionsBody(
  model: string,
  options: {
    temperature?: number | undefined;
    structuredOutputs?: StructuredOutputMode | undefined;
  },
  request: LlmChatRequest,
): Record<string, unknown> {
  const mode = options.structuredOutputs ?? "json_schema";
  const messages = request.messages.map(({ role, content }) => ({
    role,
    content,
  }));
  // DeepSeek's JSON mode refuses a prompt that never says "json": "Prompt must
  // contain the word 'json' in some form to use 'response_format' of type
  // 'json_object'." The system prompt's own output contract satisfies it today,
  // so this only fires if that wording ever changes -- but it fires here rather
  // than as a 400 that reads like the endpoint refusing JSON mode outright.
  if (
    mode === "json_object" &&
    !messages.some((m) => /json/i.test(m.content))
  ) {
    const last = messages.at(-1);
    if (last) last.content = `${last.content}\n\nReply with json only.`;
    else messages.push({ role: "user", content: "Reply with json only." });
  }
  return {
    model,
    messages,
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
    ...(request.reasoningEffort
      ? { reasoning_effort: request.reasoningEffort }
      : {}),
    ...(mode === "off"
      ? {}
      : mode === "json_object"
        ? { response_format: { type: "json_object" } }
        : {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "legal_action",
                strict: true,
                schema: {
                  type: "object",
                  // Plan, reasoning, then the actions; see
                  // `responsesRequestBody`. Asking the answer for it is what
                  // makes a decision explicable on an endpoint that returns no
                  // `reasoning_content` of its own.
                  properties: {
                    turnPlan: {
                      type: "array",
                      items: { type: "string" },
                      description: TURN_PLAN_DESCRIPTION,
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "Why this line, in one or two sentences: the candidate you rejected and what decided it.",
                    },
                    actionIds: {
                      type: "array",
                      items: { type: "string", pattern: ACTION_ID_PATTERN },
                      minItems: 1,
                    },
                  },
                  required: ["turnPlan", "reasoning", "actionIds"],
                  additionalProperties: false,
                },
              },
            },
          }),
  };
}

/**
 * Whether this failure is the endpoint refusing the response format itself.
 *
 * Narrow on purpose: a 400 naming the field is a capability answer worth
 * stepping down for, and every other 400 is a real request bug that stepping
 * down would only hide.
 */
export function isResponseFormatRejection(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (status !== 400) return false;
  const message = error instanceof Error ? error.message : String(error);
  // "Prompt must contain the word 'json'" names `response_format` too, but it
  // is a complaint about the prompt, not a capability answer: stepping down for
  // it would turn a one-word fix into a run with no JSON mode at all.
  if (/must contain the word/i.test(message)) return false;
  return /response_format|json_schema|response format/i.test(message);
}

export class ChatCompletionsChatClient implements LlmChatClient {
  readonly #options: ChatCompletionsClientOptions;
  readonly #fetch: typeof globalThis.fetch;
  readonly #maxRetries: number;
  /** Lowered once per endpoint refusal, so one call pays for the discovery. */
  #mode: StructuredOutputMode;

  constructor(options: ChatCompletionsClientOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#mode = options.structuredOutputs ?? "json_schema";
  }

  /** The format this client settled on, for a caller that wants to log it. */
  get structuredOutputMode(): StructuredOutputMode {
    return this.#mode;
  }

  async complete(request: LlmChatRequest): Promise<LlmChatResponse> {
    for (;;) {
      try {
        return await this.#attempt(request);
      } catch (error) {
        const next =
          STRUCTURED_OUTPUT_MODES[
            STRUCTURED_OUTPUT_MODES.indexOf(this.#mode) + 1
          ];
        if (!isResponseFormatRejection(error) || !next) throw error;
        console.warn(
          `LLM_RESPONSE_FORMAT_UNSUPPORTED: ${this.#options.model} refused ` +
            `${this.#mode}; falling back to ${next} for the rest of this run.`,
        );
        this.#mode = next;
      }
    }
  }

  async #attempt(request: LlmChatRequest): Promise<LlmChatResponse> {
    const body = chatCompletionsBody(
      this.#options.model,
      {
        temperature: this.#options.temperature,
        structuredOutputs: this.#mode,
      },
      request,
    );
    const url = `${this.#options.baseURL.replace(/\/$/, "")}/chat/completions`;
    const result = await withTransientRetry(
      this.#maxRetries,
      isTransientChatError,
      async () => {
        const response = await this.#fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(this.#options.apiKey
              ? { authorization: `Bearer ${this.#options.apiKey}` }
              : {}),
          },
          body: JSON.stringify(body),
          ...(request.signal ? { signal: request.signal } : {}),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw Object.assign(
            new Error(
              `CHAT_COMPLETIONS_${response.status}: ${detail.slice(0, 400)}`,
            ),
            { status: response.status },
          );
        }
        return (await response.json()) as unknown;
      },
    );
    return readChatCompletionsResult(result, body);
  }
}

/** A status worth retrying: the endpoint saying "not now" rather than "never". */
function isTransientChatError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && (status === 429 || status >= 500)) {
    return true;
  }
  return isTransientTransportError(error);
}

export function readChatCompletionsResult(
  result: unknown,
  body: Record<string, unknown>,
): LlmChatResponse {
  const choice = (
    result as { choices?: { message?: { content?: unknown } }[] } | null
  )?.choices?.[0];
  const message = choice?.message;
  const content = message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(
      `CHAT_COMPLETIONS_EMPTY_RESPONSE: ${JSON.stringify(result).slice(0, 300)}`,
    );
  }
  // DeepSeek and its relatives return the thinking trace here; the field is
  // absent on endpoints that do not, which reads as no summary.
  const reasoning = (message as { reasoning_content?: unknown })
    .reasoning_content;
  return {
    content,
    ...(typeof reasoning === "string" && reasoning.length > 0
      ? { reasoningSummary: reasoning }
      : {}),
    rawExchange: { request: body, response: result },
  };
}
