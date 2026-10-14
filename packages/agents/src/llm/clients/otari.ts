import {
  GatewayTimeoutError,
  OtariClient,
  OtariError,
  RateLimitError,
  UpstreamProviderError,
} from "@mozilla-ai/otari";
import { readResponsesResult, responsesRequestBody } from "./openai.js";
import {
  isTransientTransportError,
  withTransientRetry,
  type LlmChatClient,
  type LlmChatRequest,
  type LlmChatResponse,
} from "./types.js";

export interface OtariChatClientOptions {
  /**
   * A provider-prefixed model ID, e.g. `openai:gpt-5.6` or
   * `anthropic:claude-sonnet-4-5`. The gateway routes on the prefix, so the
   * same client reaches any provider it has a key for.
   */
  model: string;
  /** Platform token (`tk_...`). Defaults to `OTARI_AI_TOKEN`. */
  platformToken?: string;
  /** Gateway root for a self-hosted deployment. Defaults to `GATEWAY_API_BASE`. */
  apiBase?: string;
  /** Virtual key for a self-hosted gateway. Defaults to `GATEWAY_API_KEY`. */
  apiKey?: string;
  temperature?: number;
  maxRetries?: number;
  /** See `OpenAiChatClientOptions.reasoningSummary`. */
  reasoningSummary?: "auto" | "concise" | "detailed" | null;
  /**
   * Cost-attribution label the gateway records per request.
   *
   * The gateway strips it before forwarding upstream and reports it on platform
   * usage, so spend can be sliced per benchmark run or per match without
   * standing up OpenTelemetry -- which is the reason to route a playtest through
   * the gateway rather than straight at a provider.
   */
  sessionLabel?: string;
  /** Injected transport. The single seam the tests mock. */
  fetch?: typeof globalThis.fetch;
}

/**
 * A gateway error worth retrying.
 *
 * The gateway sits between this process and the provider, so it adds its own
 * failure surface: an upstream 5xx it surfaces as `UpstreamProviderError`, its
 * own timeout as `GatewayTimeoutError`. Both are the gateway saying "not now",
 * not "never", so they get the same treatment a provider 5xx already got.
 * `AuthenticationError`, `ModelNotFoundError`, `InsufficientFundsError`, and
 * `UnsupportedCapabilityError` are configuration, and retrying them only makes
 * the run take longer to fail.
 */
function isTransientOtariError(error: unknown): boolean {
  // Gateway errors reach here already wrapped by `describeGatewayError`, so that
  // the retry warning is readable; classify the original underneath it.
  const gateway =
    error instanceof Error && error.cause instanceof OtariError
      ? error.cause
      : error;
  if (
    gateway instanceof GatewayTimeoutError ||
    gateway instanceof UpstreamProviderError ||
    gateway instanceof RateLimitError
  ) {
    return true;
  }
  if (gateway instanceof OtariError) {
    return gateway.statusCode !== undefined && gateway.statusCode >= 500;
  }
  return isTransientTransportError(error);
}

/**
 * Error bodies the gateway sent, keyed by the exact `Response` they came from.
 *
 * `@mozilla-ai/otari@0.4.0` builds its error message by interpolating the parsed
 * error body into a string, so every failure arrives as the literal
 * `"[object Object]"` and the body it was built from is already consumed --
 * `originalError.response.text()` throws `Body has already been read`. A run that
 * dies on a context-length error is then indistinguishable from one that dies on
 * a bad token.
 *
 * Since this client supplies the `fetch` the SDK uses, it can read a clone of
 * every failing response on the way past and file it under the `Response`
 * instance. The error the SDK throws carries that same instance on
 * `originalError`, so the lookup recovers the real message with no guessing about
 * which concurrent request it belonged to.
 */
const gatewayErrorBodies = new WeakMap<Response, string>();

const snakeToCamel = (key: string): string =>
  key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

/**
 * Remove the duplicate camelCase keys the SDK adds to its own request body.
 *
 * `client.response()` runs the params through `ResponsesRequestFromJSON` (which
 * adds a camelCase alias beside each snake_case field) and then through the
 * generated `ToJSON` (which re-derives the snake_case field but leaves the alias
 * in place). Four aliases survive onto the wire: `promptCacheKey`,
 * `maxOutputTokens`, `previousResponseId`, and `topP`.
 *
 * The gateway validates against a pydantic model with `extra="forbid"`, so any
 * one of them fails the whole request:
 *
 *     1 validation error for ResponsesParams
 *     promptCacheKey
 *       Extra inputs are not permitted
 *
 * That makes `prompt_cache_key` unusable through this SDK, and prompt caching is
 * the difference between re-billing a whole game's history on every decision and
 * reading it back. Dropping any camelCase key that duplicates a snake_case
 * sibling fixes it without hardcoding the four names, so a future alias is
 * covered too. Remove once the SDK stops round-tripping its own params.
 */
function withoutDuplicateAliases(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return body;
  }
  const record = parsed as Record<string, unknown>;
  // Only an alias derived from a key that is actually present gets dropped, so a
  // caller who deliberately sent a camelCase field on its own keeps it.
  const drop = new Set<string>();
  for (const key of Object.keys(record)) {
    const alias = snakeToCamel(key);
    if (alias !== key && Object.hasOwn(record, alias)) drop.add(alias);
  }
  if (drop.size === 0) return body;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(record).filter(([key]) => !drop.has(key)),
    ),
  );
}

/**
 * The transport seam: fixes the outgoing body, remembers incoming error bodies.
 *
 * Both jobs exist only because of `@mozilla-ai/otari@0.4.0` quirks; see
 * `withoutDuplicateAliases` and `gatewayErrorBodies` above.
 */
function gatewayFetch(inner: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const patched =
      init && typeof init.body === "string"
        ? { ...init, body: withoutDuplicateAliases(init.body) }
        : init;
    const response = await inner(input, patched);
    if (!response.ok) {
      try {
        gatewayErrorBodies.set(response, await response.clone().text());
      } catch {
        // A body that cannot be cloned is not worth failing the request over;
        // the wrapper below still reports the class and status.
      }
    }
    return response;
  };
}

/** The gateway's own words for a failure, when they survived. */
function gatewayErrorDetail(error: OtariError): string | undefined {
  const response = (error as { originalError?: { response?: unknown } })
    .originalError?.response;
  const body =
    response instanceof Response ? gatewayErrorBodies.get(response) : undefined;
  if (!body) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    const record = parsed as {
      error?: { message?: unknown } | null;
      detail?: unknown;
    };
    const message = record.error?.message ?? record.detail;
    return typeof message === "string" ? message : body;
  } catch {
    return body;
  }
}

/**
 * Re-throw a gateway error with a message that says what happened.
 *
 * The class and `statusCode` are trustworthy even when the message is not, so
 * they are always reported; the recovered body is appended when available. The
 * original is kept as `cause` so nothing is lost.
 */
function describeGatewayError(error: unknown): unknown {
  if (!(error instanceof OtariError)) return error;
  const detail = gatewayErrorDetail(error);
  const status = error.statusCode === undefined ? "" : ` ${error.statusCode}`;
  return Object.assign(
    new Error(
      `OTARI_GATEWAY_ERROR: ${error.name}${status}${detail ? `: ${detail}` : ""}`,
    ),
    { cause: error },
  );
}

/**
 * An `LlmChatClient` that reaches a model through the otari gateway.
 *
 * The gateway exposes the same `/v1/responses` contract this project already
 * targets, so the request body and the result reader are shared verbatim with
 * `OpenAiChatClient` -- the reasoning-item replay, the explicit cache
 * breakpoints, and the strict `legal_action` schema that constrains `actionIds`
 * to the legal enum all survive the hop. What changes is the routing: one token
 * reaches every provider, and each request carries a cost label.
 */
export class OtariChatClient implements LlmChatClient {
  readonly #client: OtariClient;
  readonly #model: string;
  readonly #temperature: number | undefined;
  readonly #maxRetries: number;
  readonly #sessionLabel: string | undefined;
  readonly #reasoningSummary: OtariChatClientOptions["reasoningSummary"];

  constructor(options: OtariChatClientOptions) {
    this.#reasoningSummary = options.reasoningSummary;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#client = new OtariClient({
      ...(options.platformToken
        ? { platformToken: options.platformToken }
        : {}),
      ...(options.apiBase ? { apiBase: options.apiBase } : {}),
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      fetch: gatewayFetch(options.fetch ?? globalThis.fetch),
    });
    this.#model = options.model;
    this.#temperature = options.temperature;
    this.#sessionLabel = options.sessionLabel;
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
    const gatewayBody = {
      ...body,
      ...(this.#sessionLabel ? { session_label: this.#sessionLabel } : {}),
    };
    const result = await withTransientRetry(
      this.#maxRetries,
      isTransientOtariError,
      async () => {
        // The gateway SDK takes no per-call signal, so honour the deadline the
        // caller set by racing it. Without this a hung request would outlive the
        // turn timeout the web server and the benchmarks rely on.
        const call = this.#client.response(
          gatewayBody as { model: string; input: unknown },
        );
        try {
          return await (request.signal
            ? raceSignal(call, request.signal)
            : call);
        } catch (error) {
          throw describeGatewayError(error);
        }
      },
    );
    return readResponsesResult(result, gatewayBody);
  }
}

function raceSignal<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return Promise.race([
    operation,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          reject(abortError(signal));
        },
        { once: true },
      );
    }),
  ]);
}

/**
 * Abort rejections must not look transient.
 *
 * `withTransientRetry` walks `cause` for socket codes, and a `DOMException`
 * named `TimeoutError` carries none, so a plain abort reason is already
 * classified correctly -- but a caller-supplied `signal.reason` could be
 * anything, so the abort is wrapped in an error the classifier reads as final.
 */
function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return Object.assign(new Error("LLM_ABORTED"), {
    cause: reason instanceof Error ? reason.message : String(reason),
  });
}
