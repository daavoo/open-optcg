import {
  ChatCompletionsChatClient,
  STRUCTURED_OUTPUT_MODES,
  type StructuredOutputMode,
} from "./chat-completions.js";
import { GeminiChatClient } from "./gemini.js";
import { OpenAiChatClient } from "./openai.js";
import { OtariChatClient } from "./otari.js";
import type { LlmChatClient } from "./types.js";

export interface ChatClientEnv {
  LLM_MODEL?: string | undefined;
  LLM_PROVIDER?: string | undefined;
  LLM_BASE_URL?: string | undefined;
  /**
   * Which contract the endpoint at `LLM_BASE_URL` serves: `responses` (the
   * default) or `chat` for `/chat/completions`.
   *
   * An OpenAI-compatible proxy usually serves both and routes by model --
   * OpenCode Zen sends GPT models to `/responses` and DeepSeek, Kimi and the
   * rest to `/chat/completions` -- so the endpoint alone cannot say which one a
   * given model wants.
   */
  LLM_API?: string | undefined;
  /** Set when the endpoint rejects `response_format: json_schema`. */
  LLM_STRUCTURED_OUTPUTS?: string | undefined;
  /**
   * `true` puts Gemini's system instruction in a named cache. Off by default
   * because naming a cache turns off the implicit caching that covers the whole
   * conversation; `GeminiChatClientOptions.explicitCache` carries the numbers.
   */
  LLM_EXPLICIT_CACHE?: string | undefined;
  /** Gemini thinking budget in tokens; unset leaves the model default. */
  GEMINI_THINKING_BUDGET?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  /** Preferred over `OPENAI_API_KEY` when `LLM_API=gemini`. */
  GEMINI_API_KEY?: string | undefined;
  OTARI_AI_TOKEN?: string | undefined;
  GATEWAY_API_BASE?: string | undefined;
  GATEWAY_API_KEY?: string | undefined;
}

export interface ChatClientOptions {
  model: string;
  /** Cost-attribution label, forwarded only by the gateway transport. */
  sessionLabel?: string;
  /**
   * A credential supplied per request rather than by the environment -- the web
   * server's lobby key. A `tk_`-prefixed value is a gateway platform token, so
   * it also selects the transport; anything else is a provider key.
   */
  credential?: string;
  /** See `OpenAiChatClientOptions.reasoningSummary`. */
  reasoningSummary?: "auto" | "concise" | "detailed" | null;
  env?: ChatClientEnv;
}

/**
 * The provider key the selected transport should use.
 *
 * Each provider names its own key, and `OPENAI_API_KEY` holding a Google key
 * reads like a mistake in a `.env` a person has to maintain. `LLM_API` already
 * says which contract is in play, so it can say which key too. The generic name
 * stays as the fallback: a proxy that fronts many providers -- OpenCode Zen,
 * a gateway -- issues one key of its own regardless of the model behind it.
 *
 * Exported because the web server reports whether a key is configured before it
 * builds a client, and that answer has to be the same one this makes.
 */
export function environmentApiKey(env: ChatClientEnv): string | undefined {
  if (env.LLM_API?.toLowerCase() === "gemini") {
    return env.GEMINI_API_KEY ?? env.OPENAI_API_KEY;
  }
  return env.OPENAI_API_KEY;
}

/**
 * The starting response format, when the environment pins one.
 *
 * Only a floor is worth setting by hand: the client discovers a ceiling itself
 * by stepping down when an endpoint refuses. `false` is kept as a spelling of
 * `off` because that is what the variable meant before there were three modes.
 */
function structuredOutputMode(value: string | undefined): {
  structuredOutputs?: StructuredOutputMode;
} {
  const normalised = value?.toLowerCase();
  if (normalised === undefined) return {};
  if (normalised === "false" || normalised === "off") {
    return { structuredOutputs: "off" };
  }
  return STRUCTURED_OUTPUT_MODES.includes(normalised as StructuredOutputMode)
    ? { structuredOutputs: normalised as StructuredOutputMode }
    : {};
}

/**
 * The chat client the environment selects.
 *
 * Five call sites used to each repeat the same `OpenAiChatClient` construction
 * with the same three `process.env` reads, which is why adding a second
 * transport goes through one function instead. The gateway is chosen by
 * `LLM_PROVIDER=otari`, or implicitly whenever gateway credentials are the only
 * ones present -- so an `OTARI_AI_TOKEN` in the environment is enough to route a
 * benchmark through it without editing a command. `LLM_API=chat` picks the
 * `/chat/completions` transport for a proxy that serves a model only there.
 */
export function createChatClient(options: ChatClientOptions): LlmChatClient {
  const env = options.env ?? process.env;
  const provider = env.LLM_PROVIDER?.toLowerCase();
  const platformToken = options.credential?.startsWith("tk_")
    ? options.credential
    : env.OTARI_AI_TOKEN;
  const gatewayCredentials = Boolean(
    platformToken ?? env.GATEWAY_API_BASE ?? env.GATEWAY_API_KEY,
  );
  const providerKey = options.credential?.startsWith("tk_")
    ? undefined
    : (options.credential ?? environmentApiKey(env));
  const useGateway =
    provider === "otari" ||
    (provider === undefined && !providerKey && gatewayCredentials);
  if (useGateway) {
    return new OtariChatClient({
      model: options.model,
      ...(platformToken ? { platformToken } : {}),
      ...(env.GATEWAY_API_BASE ? { apiBase: env.GATEWAY_API_BASE } : {}),
      ...(env.GATEWAY_API_KEY ? { apiKey: env.GATEWAY_API_KEY } : {}),
      ...(options.sessionLabel ? { sessionLabel: options.sessionLabel } : {}),
      ...(options.reasoningSummary === undefined
        ? {}
        : { reasoningSummary: options.reasoningSummary }),
    });
  }
  // Gemini's own contract, for the explicit cache its OpenAI-compatible
  // endpoint does not expose. `LLM_BASE_URL` is optional here: unlike a proxy,
  // the native endpoint has a published default.
  if (env.LLM_API?.toLowerCase() === "gemini") {
    return new GeminiChatClient({
      model: options.model,
      ...(providerKey ? { apiKey: providerKey } : {}),
      ...(env.LLM_BASE_URL ? { baseURL: env.LLM_BASE_URL } : {}),
      ...(env.LLM_EXPLICIT_CACHE?.toLowerCase() === "true"
        ? { explicitCache: true }
        : {}),
      ...(env.GEMINI_THINKING_BUDGET
        ? { thinkingBudget: Number(env.GEMINI_THINKING_BUDGET) }
        : {}),
      ...(options.reasoningSummary === undefined
        ? {}
        : { reasoningSummary: options.reasoningSummary }),
    });
  }
  // `/chat/completions` is opt-in rather than sniffed from the model name: a
  // proxy's model IDs are its own, and guessing wrong fails every request.
  if (env.LLM_API?.toLowerCase() === "chat") {
    if (!env.LLM_BASE_URL)
      throw new Error("LLM_BASE_URL is required for LLM_API=chat");
    return new ChatCompletionsChatClient({
      model: options.model,
      baseURL: env.LLM_BASE_URL,
      ...(providerKey ? { apiKey: providerKey } : {}),
      ...structuredOutputMode(env.LLM_STRUCTURED_OUTPUTS),
    });
  }
  return new OpenAiChatClient({
    model: options.model,
    ...(providerKey ? { apiKey: providerKey } : {}),
    ...(env.LLM_BASE_URL ? { baseURL: env.LLM_BASE_URL } : {}),
    ...(options.reasoningSummary === undefined
      ? {}
      : { reasoningSummary: options.reasoningSummary }),
  });
}
