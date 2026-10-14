import {
  isTransientTransportError,
  withTransientRetry,
  type LlmChatClient,
  type LlmChatRequest,
  type LlmChatResponse,
  type ReasoningEffort,
} from "./types.js";

/**
 * The native Gemini transport, for `generateContent` and explicit caching.
 *
 * Gemini is reachable through its OpenAI-compatible endpoint with no new code,
 * and that path already gets *implicit* caching -- automatic, prefix-based, on
 * by default for 2.5 and newer. What it cannot do is name a cache: explicit
 * `CachedContent` is not exposed there, and the docs are explicit that it needs
 * `generateContent`. This transport exists for that difference.
 *
 * Explicit caching is off by default because it buys almost nothing here, not
 * because it costs anything. That reasoning has been rewritten once already:
 * the original measurement compared a named cache against a whole game's
 * conversation replayed into every request, and there is no such conversation
 * any more -- a decision is now the system instruction and one board.
 *
 * Re-measured against that shape with `pnpm llm:bench`, on `gemini-3.7-flash`:
 * implicit caching reads ~12,090 of a ~15,000-token request, and a named cache
 * reads ~12,445. The token difference is one cold call per game and nothing
 * worth a flag.
 *
 * The latency difference may be worth more, and is why this default is left
 * alone rather than settled. Naming the cache took the median decision from
 * 15.3s to 11.4s, and from 9.2s to 8.0s once a thinking level was also set --
 * the same direction in both pairs of a 2x2. But implicit caching also *misses*
 * sometimes where a named cache cannot: 20 of 24 calls hit against 24 of 24.
 * n=24 with a tail reaching 74s cannot separate those two explanations, and
 * this file has already been rewritten once for reading too much into a small
 * sample. Flipping the default wants an A/B of its own.
 *
 * What is *not* the reason: `systemInstruction` being invisible to the implicit
 * cache. It is cached, and measurement says so.
 *
 * Two shapes differ from the OpenAI contract and are converted here rather than
 * anywhere the agent can see:
 *
 * - Roles. Gemini has `user` and `model`, no `assistant` and no `system` turn;
 *   the system prompt is a separate `systemInstruction` field, which is also
 *   what makes it cacheable on its own.
 * - The response schema. `responseSchema` takes an OpenAPI subset that has
 *   `enum` but no `pattern`, so the action ID is constrained to a string and
 *   the shape is left to the prompt's own output contract and the agent's
 *   correction round. Listing the legal IDs in an enum would constrain it
 *   properly and change the request on every decision -- which is precisely
 *   what cost 271,000,000 uncached input tokens on the OpenAI path.
 */
export interface GeminiChatClientOptions {
  /** A bare model ID, e.g. `gemini-3.7-flash`. */
  model: string;
  apiKey?: string;
  /** Defaults to Google's public endpoint. */
  baseURL?: string;
  temperature?: number;
  maxRetries?: number;
  /**
   * Thinking budget in tokens, passed through as `thinkingConfig`.
   *
   * A hand override, and it beats the per-request thinking level; omitted
   * leaves the level, or the model's default when there is no level either.
   * The model treats it as a hint rather than a cap -- 512 measured 218
   * thinking tokens and 4096 measured 881, while `-1` asks for as much as the
   * model wants and measured 2122.
   */
  thinkingBudget?: number;
  /**
   * Whether to ask for thought summaries, as `thinkingConfig.includeThoughts`.
   *
   * Spelled like the Responses option so one `createChatClient` argument means
   * the same thing on every transport, though Gemini has no verbosity levels to
   * choose between: any setting but `null` is on. On by default, matching the
   * Responses default -- the model is thinking either way, and this is the only
   * part of it that ever comes back.
   *
   * Costs output tokens, which are what decide latency, so a batch run that
   * nobody will read passes `null`.
   */
  reasoningSummary?: "auto" | "concise" | "detailed" | null;
  /**
   * Upload the system instruction once and reference it by name.
   *
   * Off by default: naming a cache suppresses the implicit caching that covers
   * the whole conversation, and that costs more than the named cache saves --
   * see the measurement above. A cache below the model's minimum token count is
   * refused by the API, so a failure here falls back to sending the instruction
   * inline -- implicit caching still applies to it -- rather than failing the
   * run.
   */
  explicitCache?: boolean;
  /** Cache lifetime. Long enough for a game, short enough not to hoard storage. */
  cacheTtlSeconds?: number;
  /** Injected transport. The single seam the tests mock. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_CACHE_TTL_SECONDS = 1800;

interface GeminiPart {
  text: string;
  /** Set on the parts that are the model's thinking rather than its answer. */
  thought?: boolean;
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

/** The answer's shape. `pattern` is not in Gemini's schema subset; see above. */
const RESPONSE_SCHEMA = {
  type: "object",
  // Plan, reasoning, then the actions, the same as every other transport: the
  // answer's own account of the decision is the one the trace viewer shows,
  // and thought parts are opt-in beside it. See `responsesRequestBody`.
  properties: {
    turnPlan: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
    actionIds: { type: "array", items: { type: "string" }, minItems: 1 },
  },
  required: ["turnPlan", "reasoning", "actionIds"],
} as const;

function textOf(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content.flatMap((block) => {
    const text = (block as { text?: unknown } | null)?.text;
    return typeof text === "string" ? [text] : [];
  });
  return parts.length > 0 ? parts.join("") : undefined;
}

/**
 * The conversation as Gemini turns, and the system prompt separately.
 *
 * Everything the agent holds -- the replayed items and this decision's messages
 * -- goes through one pass, because the system prompt arrives as a `system`
 * message on the first call and as a replayed item on every call after it.
 */
export function toGeminiRequest(request: LlmChatRequest): {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
} {
  const items = request.messages.map(({ role, content }) => ({
    role,
    content,
  }));
  const system: string[] = [];
  const contents: GeminiContent[] = [];
  for (const item of items) {
    const record = item as { role?: unknown; content?: unknown } | null;
    const role = record?.role;
    if (typeof role !== "string") continue;
    const text = textOf(record?.content);
    if (text === undefined) continue;
    if (role === "system") {
      system.push(text);
      continue;
    }
    contents.push({
      role: role === "assistant" || role === "model" ? "model" : "user",
      parts: [{ text }],
    });
  }
  return {
    ...(system.length > 0
      ? { systemInstruction: { parts: system.map((text) => ({ text })) } }
      : {}),
    contents,
  };
}

export class GeminiChatClient implements LlmChatClient {
  readonly #options: GeminiChatClientOptions;
  readonly #fetch: typeof globalThis.fetch;
  readonly #maxRetries: number;
  readonly #baseURL: string;
  /** The named cache for this client's system instruction, once created. */
  #cacheName: string | undefined;
  /** Set when the API refuses to cache, so a run stops asking every call. */
  #cacheUnavailable = false;

  constructor(options: GeminiChatClientOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  /** The cache this client is using, for a caller that wants to log it. */
  get cacheName(): string | undefined {
    return this.#cacheName;
  }

  async complete(request: LlmChatRequest): Promise<LlmChatResponse> {
    const { systemInstruction, contents } = toGeminiRequest(request);
    const cacheName =
      systemInstruction && this.#useExplicitCache()
        ? await this.#ensureCache(systemInstruction, request.signal)
        : undefined;
    const body: Record<string, unknown> = {
      contents,
      // The instruction lives in the cache or in the request, never both: the
      // API rejects a request that sets it alongside `cachedContent`.
      ...(cacheName
        ? { cachedContent: cacheName }
        : systemInstruction
          ? { systemInstruction }
          : {}),
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        ...(this.#options.temperature === undefined
          ? {}
          : { temperature: this.#options.temperature }),
        ...thinkingConfig(this.#options, request.reasoningEffort),
      },
    };
    const result = await withTransientRetry(
      this.#maxRetries,
      isTransientGeminiError,
      () =>
        this.#post(
          `/models/${this.#options.model}:generateContent`,
          body,
          request.signal,
        ),
    );
    return readGeminiResult(result, body);
  }

  #useExplicitCache(): boolean {
    return (this.#options.explicitCache ?? false) && !this.#cacheUnavailable;
  }

  /**
   * The cache name for this system instruction, creating it on first use.
   *
   * A cache is tied to the model and the content, and this client is fixed to
   * both, so one name serves every call it will ever make. A rejected creation
   * is remembered rather than retried: the usual cause is an instruction below
   * the model's minimum cacheable size, which will not change mid-run.
   */
  async #ensureCache(
    systemInstruction: { parts: GeminiPart[] },
    signal: AbortSignal | undefined,
  ): Promise<string | undefined> {
    if (this.#cacheName) return this.#cacheName;
    try {
      const created = await this.#post(
        "/cachedContents",
        {
          model: `models/${this.#options.model}`,
          systemInstruction,
          ttl: `${this.#options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS}s`,
          displayName: "open-optcg-decision-prompt",
        },
        signal,
      );
      const name = (created as { name?: unknown }).name;
      if (typeof name !== "string") throw new Error("MISSING_CACHE_NAME");
      this.#cacheName = name;
      return name;
    } catch (error) {
      this.#cacheUnavailable = true;
      console.warn(
        `GEMINI_EXPLICIT_CACHE_UNAVAILABLE: ${
          error instanceof Error ? error.message : String(error)
        }; sending the system instruction inline for the rest of this run.`,
      );
      return undefined;
    }
  }

  /** Releases the named cache. Caches also expire on their own TTL. */
  async deleteCache(): Promise<void> {
    if (!this.#cacheName) return;
    const name = this.#cacheName;
    this.#cacheName = undefined;
    const response = await this.#fetch(`${this.#baseURL}/${name}`, {
      method: "DELETE",
      headers: this.#headers(),
    });
    if (!response.ok && response.status !== 404) {
      console.warn(`GEMINI_CACHE_DELETE_${response.status}: ${name}`);
    }
  }

  #headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(this.#options.apiKey
        ? { "x-goog-api-key": this.#options.apiKey }
        : {}),
    };
  }

  async #post(
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseURL}${path}`, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw Object.assign(
        new Error(`GEMINI_${response.status}: ${detail.slice(0, 400)}`),
        { status: response.status },
      );
    }
    return (await response.json()) as unknown;
  }
}

function isTransientGeminiError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && (status === 429 || status >= 500)) {
    return true;
  }
  return isTransientTransportError(error);
}

/**
 * How hard to think, in the three levels this API names.
 *
 * The agent decides per decision -- a Counter step with three options does not
 * need what a Main Phase with thirty does -- and every other transport forwards
 * that. This one used to drop it, so Gemini ran at its own default on every
 * call. Measured with `pnpm llm:bench` on `gemini-3.7-flash`, that default is
 * `high`, and leaving it there was the larger half of why a Gemini decision
 * took 15.3s against the Responses path's 8.8s.
 *
 * Only `low` and `medium` are mapped down. `none` has no spelling here -- the
 * API rejects `none` and `minimal` on this model -- so it maps to `low` rather
 * than silently becoming the default, which is the one outcome the caller
 * certainly did not ask for.
 */
const THINKING_LEVELS: Record<ReasoningEffort, "low" | "medium" | "high"> = {
  none: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high",
};

/**
 * `thinkingConfig`, or nothing when no part of it is set.
 *
 * An empty `thinkingConfig` is not the same as an absent one to the API, and
 * every part has to stay omittable: an absent one leaves the model's default,
 * which is what a caller that says nothing should get.
 *
 * `thinkingBudget` wins over the request's level when both are set, because it
 * is only ever set by hand -- `GEMINI_THINKING_BUDGET` -- and an override that
 * loses to a default is not an override. The two are separate knobs on this
 * model rather than two spellings of one: a budget is a token count the model
 * treats as a hint, measured at 218 thinking tokens for 512 and 881 for 4096
 * on a real decision, against 284 for `thinkingLevel: low`.
 */
function thinkingConfig(
  options: GeminiChatClientOptions,
  effort: ReasoningEffort | undefined,
): {
  thinkingConfig?: Record<string, unknown>;
} {
  const config = {
    ...(effort ? { thinkingLevel: THINKING_LEVELS[effort] } : {}),
    ...(options.thinkingBudget === undefined
      ? {}
      : { thinkingBudget: options.thinkingBudget }),
    ...(options.reasoningSummary ? { includeThoughts: true } : {}),
  };
  return Object.keys(config).length > 0 ? { thinkingConfig: config } : {};
}

export function readGeminiResult(
  result: unknown,
  body: unknown,
): LlmChatResponse {
  const candidate = (
    result as { candidates?: { content?: { parts?: GeminiPart[] } }[] } | null
  )?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  // Thoughts arrive as parts of the same message, flagged rather than
  // separated. Joining every part -- which is what this did before thoughts
  // were asked for -- would paste the thinking in front of the JSON answer and
  // fail the parse.
  const content = parts
    .filter((part) => !part.thought)
    .map((part) => part.text)
    .join("");
  const reasoningSummary = parts
    .filter((part) => part.thought)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
  if (content.length === 0) {
    throw new Error(
      `GEMINI_EMPTY_RESPONSE: ${JSON.stringify(result).slice(0, 300)}`,
    );
  }
  return {
    content,
    ...(reasoningSummary ? { reasoningSummary } : {}),
    rawExchange: { request: body, response: result },
  };
}
