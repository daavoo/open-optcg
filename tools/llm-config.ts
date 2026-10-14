/**
 * The LLM settings a reader can change from the app, and where they are kept.
 *
 * The project's long-standing stance was that a key comes from the server's
 * environment and never from the page, because a key in browser JavaScript is
 * a key given away. That stance is kept where it matters -- the key still lives
 * only on the machine running the server, in a 0600 file, and is never handed
 * back to the browser -- but it can be *set* from the page, so a reader of
 * `pnpm web:serve` does not have to export a variable before every run.
 *
 * The catalogue below is the single source of truth for which providers are
 * offered. The browser does not have its own copy: it renders whatever
 * `/api/llm/capability` reports, so adding a provider here adds it to the
 * dialog.
 */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ChatClientEnv } from "@one-piece-sim/agents/chat-client";

/** How a provider is reached, and what to suggest for it in the dialog. */
export interface ProviderDescriptor {
  id: string;
  label: string;
  /** What the key field is called for this provider, or null when it needs none. */
  keyLabel: string | null;
  /** Whether the reader must supply the endpoint themselves. */
  needsBaseUrl: boolean;
  /** Offered as datalist suggestions; any model id is still accepted. */
  models: readonly string[];
  /** The provider's own documentation for authenticating -- what a key is for
      this provider and where it comes from -- shown as a link above the key
      field. Its docs rather than its key-management console: a reader who has
      never used the provider lands somewhere that explains the key before
      asking them to create one, and the console is one click on from there. */
  keyUrl?: string;
}

/**
 * Every provider the dialog offers, in the order it offers them.
 *
 * All of them reach `createChatClient` through the environment shape it
 * already reads, so nothing here teaches the agents package a new transport --
 * a provider is a name, an endpoint and which contract that endpoint serves.
 */
export const PROVIDERS: readonly ProviderDescriptor[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyLabel: "API key",
    needsBaseUrl: false,
    models: ["gpt-5-mini", "gpt-5", "gpt-5-nano"],
    keyUrl: "https://platform.openai.com/docs/api-reference/authentication",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keyLabel: "API key",
    needsBaseUrl: false,
    models: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    keyUrl: "https://docs.claude.com/en/api/overview",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    keyLabel: "API key",
    needsBaseUrl: false,
    models: ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    keyUrl: "https://ai.google.dev/gemini-api/docs/api-key",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyLabel: "API key",
    needsBaseUrl: false,
    models: ["openai/gpt-5-mini", "anthropic/claude-sonnet-4.5"],
    keyUrl: "https://openrouter.ai/docs/api-reference/authentication",
  },
  {
    id: "ollama",
    label: "Ollama (on this machine)",
    keyLabel: null,
    needsBaseUrl: false,
    models: ["qwen3:8b", "llama3.1:8b"],
  },
  {
    id: "custom",
    label: "Other OpenAI-compatible endpoint",
    keyLabel: "API key",
    needsBaseUrl: true,
    models: [],
  },
];

export function findProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

/** What the reader saved, as it is stored on disk. */
export interface StoredLlmConfig {
  version: 1;
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Where the saved settings live.
 *
 * Under the home directory rather than in the checkout, so a fresh clone or a
 * second worktree keeps the same key. `OPEN_OPTCG_CONFIG_DIR` exists so tests
 * -- and anyone running two configurations -- do not touch the real one.
 */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(
    env.OPEN_OPTCG_CONFIG_DIR ?? join(homedir(), ".open-optcg"),
    "llm.json",
  );
}

export function parseStoredConfig(value: unknown): StoredLlmConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const provider = typeof record.provider === "string" ? record.provider : "";
  const model = typeof record.model === "string" ? record.model.trim() : "";
  if (!findProvider(provider) || !model) return null;
  const apiKey = typeof record.apiKey === "string" ? record.apiKey : undefined;
  const baseUrl =
    typeof record.baseUrl === "string" ? record.baseUrl.trim() : undefined;
  return {
    version: 1,
    provider,
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  };
}

export async function readStoredConfig(
  path: string,
): Promise<StoredLlmConfig | null> {
  try {
    return parseStoredConfig(JSON.parse(await readFile(path, "utf8")));
  } catch {
    // A missing file is the normal first run, and a corrupt one is not worth
    // refusing to start over: either way there are no saved settings.
    return null;
  }
}

export async function writeStoredConfig(
  path: string,
  config: StoredLlmConfig,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  // `writeFile`'s mode only applies when it creates the file, so an existing
  // file keeps whatever it had. Set it every time instead.
  await chmod(path, 0o600);
}

export async function clearStoredConfig(path: string): Promise<void> {
  await rm(path, { force: true });
}

/**
 * Keep the saved key when the reader changes only the model.
 *
 * The page never receives the key back, so it cannot send it again -- an empty
 * key field means "leave it alone". That only holds for the same provider: a
 * key is not portable between them.
 */
export function mergeSavedKey(
  draft: unknown,
  stored: StoredLlmConfig | null,
): unknown {
  if (typeof draft !== "object" || draft === null || Array.isArray(draft)) {
    return draft;
  }
  const record = draft as Record<string, unknown>;
  if (typeof record.apiKey === "string" && record.apiKey.trim()) return record;
  if (!stored?.apiKey || stored.provider !== record.provider) return record;
  return { ...record, apiKey: stored.apiKey };
}

/** The complaint to show the reader, or null when the draft is usable. */
export function validateConfigDraft(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "Nothing to save.";
  const record = value as Record<string, unknown>;
  const provider = findProvider(
    typeof record.provider === "string" ? record.provider : "",
  );
  if (!provider) return "Pick a provider.";
  const model = typeof record.model === "string" ? record.model.trim() : "";
  if (!model) return "Enter a model id.";
  if (model.length > 200) return "That model id is too long.";
  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  if (provider.keyLabel && !apiKey) return `Enter your ${provider.label} key.`;
  if (apiKey.length > 500) return "That key is too long.";
  const baseUrl =
    typeof record.baseUrl === "string" ? record.baseUrl.trim() : "";
  if (provider.needsBaseUrl && !baseUrl) return "Enter the endpoint URL.";
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
    return "The endpoint URL must start with http:// or https://.";
  }
  return null;
}

export function configFromDraft(value: unknown): StoredLlmConfig {
  const complaint = validateConfigDraft(value);
  if (complaint) throw new Error(`INVALID_LLM_CONFIG: ${complaint}`);
  const record = value as Record<string, unknown>;
  const text = (field: unknown): string =>
    typeof field === "string" ? field.trim() : "";
  const apiKey = text(record.apiKey);
  const baseUrl = text(record.baseUrl);
  return {
    version: 1,
    provider: text(record.provider),
    model: text(record.model),
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  };
}

/** What a chat client needs, wherever the settings came from. */
export interface ResolvedLlm {
  model: string;
  credential?: string;
  env: ChatClientEnv;
  /** Which provider id this is, for reporting; "environment" has no id. */
  provider: string | null;
  source: "settings" | "environment" | null;
}

/**
 * The environment shape a saved provider maps onto.
 *
 * Deliberately a fresh object rather than an overlay on `process.env`: a
 * reader who saves Gemini settings should reach Gemini, not a gateway that
 * `OTARI_AI_TOKEN` happened to be left in the environment for.
 */
function providerEnv(config: StoredLlmConfig): ChatClientEnv {
  const key = config.apiKey;
  switch (config.provider) {
    case "openai":
      return { ...(key ? { OPENAI_API_KEY: key } : {}) };
    case "gemini":
      return { LLM_API: "gemini", ...(key ? { GEMINI_API_KEY: key } : {}) };
    case "anthropic":
      return {
        LLM_API: "chat",
        LLM_BASE_URL: "https://api.anthropic.com/v1",
        ...(key ? { OPENAI_API_KEY: key } : {}),
      };
    case "openrouter":
      return {
        LLM_API: "chat",
        LLM_BASE_URL: "https://openrouter.ai/api/v1",
        ...(key ? { OPENAI_API_KEY: key } : {}),
      };
    case "ollama":
      // A local model behind an OpenAI-compatible endpoint. Strict schemas are
      // the first thing small local models refuse, so start a rung down.
      return {
        LLM_API: "chat",
        LLM_BASE_URL: config.baseUrl ?? "http://127.0.0.1:11434/v1",
        LLM_STRUCTURED_OUTPUTS: "json_object",
      };
    default:
      return {
        LLM_API: "chat",
        ...(config.baseUrl ? { LLM_BASE_URL: config.baseUrl } : {}),
        ...(key ? { OPENAI_API_KEY: key } : {}),
      };
  }
}

/**
 * The settings a request should run with.
 *
 * Saved settings win over the environment. The reader chose them in the app
 * after the server started, so treating a stale `LLM_MODEL` as more
 * authoritative would make the dialog look broken; "Use the environment
 * instead" clears them.
 */
export function resolveLlm(
  stored: StoredLlmConfig | null,
  environment: { model: string; apiKey?: string; env?: ChatClientEnv },
): ResolvedLlm {
  if (stored) {
    const provider = findProvider(stored.provider);
    return {
      model: stored.model,
      ...(stored.apiKey ? { credential: stored.apiKey } : {}),
      env: providerEnv(stored),
      provider: stored.provider,
      // A keyless provider (Ollama) is configured as soon as it is saved.
      source: stored.apiKey || provider?.keyLabel === null ? "settings" : null,
    };
  }
  return {
    model: environment.model,
    ...(environment.apiKey ? { credential: environment.apiKey } : {}),
    env: environment.env ?? process.env,
    provider: null,
    source: environment.apiKey ? "environment" : null,
  };
}

/** Enough of a key to recognise it, never enough to use it. */
export function keyHint(apiKey: string | undefined): string | null {
  if (!apiKey) return null;
  return apiKey.length <= 4 ? "····" : `····${apiKey.slice(-4)}`;
}
