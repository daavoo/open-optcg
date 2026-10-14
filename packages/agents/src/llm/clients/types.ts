export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * How hard the provider thinks before answering.
 *
 * Per-request rather than per-client because the cost is per decision: a
 * Counter step choosing between three cards does not need what a Main Phase
 * with thirty legal actions needs. Omitted leaves the provider default.
 */
export type ReasoningEffort =
  "none" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * What `turnPlan` is for, in the words the model reads.
 *
 * Here rather than in one transport because the field is part of the answer's
 * contract, and a description that drifts between transports is a different
 * agent per provider. The doctrine around it -- when to continue a plan and
 * when a revision is earned -- is in the system prompt's Planning Loop, which
 * is the only place long enough to say it.
 */
export const TURN_PLAN_DESCRIPTION =
  "The steps of your plan for this turn that are still to come, this action's own step first. Empty on the opponent's turn and whenever you are holding to a plan already shown to you unchanged; a non-empty list replaces the plan you were shown.";

export interface LlmChatRequest {
  messages: readonly LlmChatMessage[];
  promptCacheKey?: string;
  signal?: AbortSignal;
  reasoningEffort?: ReasoningEffort;
  /**
   * The exact action IDs that are legal right now.
   *
   * Supplied so the response schema can constrain `actionIds` to an enum: a
   * model cannot then return an ID that does not exist. A run was lost to
   * `r77-pass-counter` -- the right action, written with a hyphen where the ID
   * uses a colon -- and no amount of prompt wording makes that impossible the
   * way a schema does.
   */
  allowedActionIds?: readonly string[];
}

export interface LlmChatResponse {
  content: string;
  reasoningSummary?: string;
  rawExchange?: { request: unknown; response: unknown };
}

export interface LlmChatClient {
  complete(request: LlmChatRequest): Promise<LlmChatResponse>;
}

const TRANSIENT_SOCKET_CODES = new Set([
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

/**
 * The SDK retries the request phase, but a socket closing while the response
 * body is being read escapes as a raw `TypeError: terminated` (UND_ERR_SOCKET)
 * that it never retries. Treat those as transient so one blip cannot end a run.
 *
 * Exported because the transport is no longer only the OpenAI SDK: a gateway
 * client raises its own error classes, but the socket underneath fails the same
 * way, so it reuses this cause-walk rather than reimplementing the code list.
 */
export function isTransientTransportError(error: unknown): boolean {
  for (
    let current: unknown = error, depth = 0;
    current instanceof Error && depth < 5;
    current = current.cause, depth += 1
  ) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_SOCKET_CODES.has(code)) {
      return true;
    }
    if (
      current.message === "terminated" ||
      current.message === "fetch failed"
    ) {
      return true;
    }
  }
  return false;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

export async function withTransientRetry<T>(
  maxRetries: number,
  isTransient: (error: unknown) => boolean,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !isTransient(error)) throw error;
      const delayMs = 500 * 2 ** attempt;
      console.warn(
        `LLM_TRANSIENT_RETRY: ${
          error instanceof Error ? error.message : String(error)
        } (attempt ${attempt + 1}/${maxRetries}); retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }
}
