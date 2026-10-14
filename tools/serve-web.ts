/**
 * `pnpm web:serve`: a local host for the web artifact, with the loopback LLM
 * API that keeps an API key on the reader's machine. The LLM opponent needs a
 * server to hold the key and make the calls; everything else in the app runs
 * from the page alone.
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LlmChatClient, LlmChatMessage } from "@one-piece-sim/agents/llm";
import {
  createChatClient,
  environmentApiKey,
} from "@one-piece-sim/agents/chat-client";
import { loadDotEnv } from "./load-env.js";
import {
  clearStoredConfig,
  configFromDraft,
  configPath,
  keyHint,
  mergeSavedKey,
  PROVIDERS,
  readStoredConfig,
  resolveLlm,
  validateConfigDraft,
  writeStoredConfig,
  type StoredLlmConfig,
} from "./llm-config.js";

// Before anything reads `LLM_MODEL` or a provider key below.
loadDotEnv();

const DEFAULT_LLM_TIMEOUT_MS = 120_000;
const root = process.cwd();
const artifact = join(root, "dist/open-optcg.html");
let llmRequestSequence = 0;
const activeLlmRequests = new Map<
  number,
  { startedAt: string; model: string; messageCount: number; timeoutMs: number }
>();
const recentLlmRequests: Array<{
  requestId: number;
  outcome: "completed" | "failed";
  durationMs: number;
  error?: string;
}> = [];

/**
 * One chat client per model, credential and system prompt, rather than per
 * request.
 *
 * A transport can hold state that costs something to build. Gemini's named
 * cache is the one that bites: a client built per request uploads a fresh
 * `CachedContent` on its first call and nothing ever deletes it, which left ten
 * identical 7,873-token caches on one account from a single sitting -- each
 * costing ~4.9s of creation latency on the decision that made it, and storage
 * until its TTL ran out. `promptCacheKey` is the agent's own hash of the system
 * prompt, so it identifies exactly the reuse a transport cares about; a client
 * outlives the request the way it does in the CLI, where one is built per game.
 */
const llmClients = new Map<string, LlmChatClient>();
/** Enough for a few concurrent games; past that the oldest is retired. */
const MAX_POOLED_CLIENTS = 8;

function pooledChatClient(
  key: string,
  build: () => LlmChatClient,
): LlmChatClient {
  const existing = llmClients.get(key);
  if (existing) {
    // Re-insert so eviction is by least-recent use, not by creation.
    llmClients.delete(key);
    llmClients.set(key, existing);
    return existing;
  }
  const client = build();
  llmClients.set(key, client);
  while (llmClients.size > MAX_POOLED_CLIENTS) {
    const [oldestKey, oldest] = [...llmClients][0]!;
    llmClients.delete(oldestKey);
    void releaseChatClient(oldest);
  }
  return client;
}

/**
 * Hands back whatever the transport holds remotely, best-effort.
 *
 * A failure here is worth a line and nothing more: the caches this releases all
 * expire on their own TTL, so the cost of not reaching one is storage for a few
 * more minutes, and the request that triggered the eviction has already been
 * answered.
 */
async function releaseChatClient(client: LlmChatClient): Promise<void> {
  const release = (client as { deleteCache?: () => Promise<void> }).deleteCache;
  if (typeof release !== "function") return;
  try {
    await release.call(client);
  } catch (error) {
    console.warn(
      `[llm] releasing a retired client failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

interface Options {
  port: number;
  /** Where the settings the reader saves from the page are kept. */
  configPath: string;
  llm: {
    model: string;
    environmentApiKey?: string;
    logPath?: string;
    timeoutMs: number;
  };
}

/** The settings saved from the page, or null while the environment is in
    charge. Mutable module state because a POST replaces it mid-run. */
let storedConfig: StoredLlmConfig | null = null;

export function parseServeOptions(args: readonly string[]): Options {
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.slice("--port=".length)) : 4173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`INVALID_PORT: ${portArg ?? port}`);
  }
  const providerKey = environmentApiKey(process.env);
  const timeoutMs = process.env.LLM_TIMEOUT_MS
    ? Number(process.env.LLM_TIMEOUT_MS)
    : DEFAULT_LLM_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error(`INVALID_LLM_TIMEOUT_MS: ${process.env.LLM_TIMEOUT_MS}`);
  }
  const modelArg = args.find((arg) => arg.startsWith("--model="));
  const model = modelArg?.slice("--model=".length).trim();
  if (modelArg && !model) throw new Error(`INVALID_MODEL: ${modelArg}`);
  return {
    port,
    configPath: configPath(process.env),
    llm: {
      // `--model=` wins over `LLM_MODEL`, the usual precedence for an explicit
      // flag over the environment. Settings saved from the page win over both:
      // the reader chose those after the server started.
      model: model ?? process.env.LLM_MODEL ?? "gpt-5-mini",
      // Whichever key the selected transport will look for.
      ...(providerKey ? { environmentApiKey: providerKey } : {}),
      ...(process.env.LLM_LOG_PATH
        ? { logPath: process.env.LLM_LOG_PATH }
        : {}),
      timeoutMs,
    },
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 2_000_000) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function llmRequest(value: unknown): {
  messages: LlmChatMessage[];
  promptCacheKey?: string;
} {
  if (
    typeof value !== "object" ||
    value === null ||
    !("messages" in value) ||
    !Array.isArray(value.messages)
  ) {
    throw new Error("INVALID_LLM_REQUEST");
  }
  const messages = value.messages.map((message: unknown) => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("role" in message) ||
      !("content" in message) ||
      !["system", "user", "assistant"].includes(String(message.role)) ||
      typeof message.content !== "string"
    ) {
      throw new Error("INVALID_LLM_MESSAGE");
    }
    return {
      role: message.role as LlmChatMessage["role"],
      content: message.content,
    };
  });
  const promptCacheKey =
    "promptCacheKey" in value && typeof value.promptCacheKey === "string"
      ? value.promptCacheKey
      : undefined;
  return {
    messages,
    ...(promptCacheKey ? { promptCacheKey } : {}),
  };
}

/**
 * What the page is allowed to know about the LLM setup.
 *
 * Never the key itself: the reader gets the last four characters back, enough
 * to recognise which key is saved and useless to anyone reading the response.
 */
export function capabilityPayload(options: Options): Record<string, unknown> {
  const resolved = resolveLlm(storedConfig, {
    model: options.llm.model,
    ...(options.llm.environmentApiKey
      ? { apiKey: options.llm.environmentApiKey }
      : {}),
  });
  return {
    available: true,
    configured: resolved.source !== null,
    credentialSource: resolved.source,
    model: resolved.model,
    provider: resolved.provider,
    baseUrl: storedConfig?.baseUrl ?? null,
    keyHint: keyHint(storedConfig?.apiKey),
    /** True when the environment could take over if the settings were cleared. */
    environmentConfigured: Boolean(options.llm.environmentApiKey),
    environmentModel: options.llm.model,
    /** The dialog renders this list; it has no catalogue of its own. */
    providers: PROVIDERS,
    editable: true,
    rawLogging: Boolean(options.llm.logPath),
    timeoutMs: options.llm.timeoutMs,
  };
}

async function handleLlmConfig(
  request: IncomingMessage,
  response: ServerResponse,
  options: Options,
): Promise<void> {
  if (request.method === "POST" || request.method === "PUT") {
    const body = mergeSavedKey(await readJsonBody(request), storedConfig);
    const complaint = validateConfigDraft(body);
    if (complaint) {
      json(response, 400, { error: "INVALID_LLM_CONFIG", message: complaint });
      return;
    }
    const next = configFromDraft(body);
    await writeStoredConfig(options.configPath, next);
    storedConfig = next;
    console.log(
      `[llm] settings saved: ${next.provider} ${next.model} (${options.configPath})`,
    );
    json(response, 200, capabilityPayload(options));
    return;
  }
  if (request.method === "DELETE") {
    await clearStoredConfig(options.configPath);
    storedConfig = null;
    console.log("[llm] settings cleared; back to the environment");
    json(response, 200, capabilityPayload(options));
    return;
  }
  json(response, 405, { error: "METHOD_NOT_ALLOWED" });
}

async function handleLlm(
  request: IncomingMessage,
  response: ServerResponse,
  segments: readonly string[],
  options: Options,
): Promise<void> {
  const route = segments[2];
  if (route === "capability" && request.method === "GET") {
    json(response, 200, capabilityPayload(options));
    return;
  }
  if (route === "config") {
    await handleLlmConfig(request, response, options);
    return;
  }
  if (route === "status" && request.method === "GET") {
    json(response, 200, {
      active: [...activeLlmRequests].map(([requestId, details]) => ({
        requestId,
        ...details,
        elapsedMs: Date.now() - new Date(details.startedAt).getTime(),
      })),
      recent: recentLlmRequests,
    });
    return;
  }
  if (route === "complete" && request.method === "POST") {
    const resolved = resolveLlm(storedConfig, {
      model: options.llm.model,
      ...(options.llm.environmentApiKey
        ? { apiKey: options.llm.environmentApiKey }
        : {}),
    });
    if (resolved.source === null) {
      json(response, 503, {
        error: "LLM_NOT_CONFIGURED",
        message:
          "Choose a provider and paste an API key in the app's LLM settings.",
      });
      return;
    }
    const completionRequest = llmRequest(await readJsonBody(request));
    const { messages } = completionRequest;
    const requestId = ++llmRequestSequence;
    const startedAt = new Date();
    const startRecord = {
      version: 1,
      event: "started",
      requestId,
      timestamp: startedAt.toISOString(),
      model: resolved.model,
      messageCount: messages.length,
      timeoutMs: options.llm.timeoutMs,
    };
    activeLlmRequests.set(requestId, {
      startedAt: startedAt.toISOString(),
      model: resolved.model,
      messageCount: messages.length,
      timeoutMs: options.llm.timeoutMs,
    });
    console.log(
      `[llm:${requestId}] started model=${resolved.model} messages=${messages.length} timeoutMs=${options.llm.timeoutMs}`,
    );
    if (options.llm.logPath) {
      await appendFile(options.llm.logPath, `${JSON.stringify(startRecord)}\n`);
    }
    try {
      // A conversation is identified by the prompt it started from; a request
      // that sends no `promptCacheKey` gets a client of its own, which is what
      // every request used to get.
      const conversation =
        completionRequest.promptCacheKey ?? `req-${requestId}`;
      const client = pooledChatClient(
        JSON.stringify([
          resolved.model,
          resolved.credential ?? "",
          conversation,
        ]),
        () =>
          createChatClient({
            model: resolved.model,
            ...(resolved.credential ? { credential: resolved.credential } : {}),
            env: resolved.env,
            sessionLabel: `open-optcg:web:${conversation}`,
          }),
      );
      const result = await client.complete({
        ...completionRequest,
        signal: AbortSignal.timeout(options.llm.timeoutMs),
      });
      const durationMs = Date.now() - startedAt.getTime();
      const record = {
        version: 1,
        event: "completed",
        requestId,
        timestamp: startedAt.toISOString(),
        model: resolved.model,
        durationMs,
        messages,
        result,
      };
      if (options.llm.logPath) {
        await appendFile(options.llm.logPath, `${JSON.stringify(record)}\n`);
      }
      activeLlmRequests.delete(requestId);
      recentLlmRequests.push({ requestId, outcome: "completed", durationMs });
      recentLlmRequests.splice(0, Math.max(0, recentLlmRequests.length - 20));
      console.log(`[llm:${requestId}] completed durationMs=${durationMs}`);
      json(response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt.getTime();
      if (options.llm.logPath) {
        await appendFile(
          options.llm.logPath,
          `${JSON.stringify({ version: 1, event: "failed", requestId, timestamp: startedAt.toISOString(), model: resolved.model, durationMs, messages, error: message })}\n`,
        );
      }
      activeLlmRequests.delete(requestId);
      recentLlmRequests.push({
        requestId,
        outcome: "failed",
        durationMs,
        error: message,
      });
      recentLlmRequests.splice(0, Math.max(0, recentLlmRequests.length - 20));
      console.error(
        `[llm:${requestId}] failed durationMs=${durationMs} error=${message}`,
      );
      json(response, 502, { error: "LLM_REQUEST_FAILED", message });
    }
    return;
  }
  json(response, 404, { error: "NOT_FOUND" });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  options: Options,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[0] === "api" && segments[1] === "llm") {
    await handleLlm(request, response, segments, options);
    return;
  }

  if (segments.length === 0) {
    try {
      const html = await readFile(artifact);
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": html.length,
        "cache-control": "no-store",
      });
      response.end(html);
    } catch {
      json(response, 500, {
        error: "ARTIFACT_MISSING",
        message: "Run pnpm web:build first.",
      });
    }
    return;
  }

  json(response, 404, { error: "NOT_FOUND" });
}

/** Listen on `port`, on loopback only. */
function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    // Loopback only. This process holds an API key and spends it on the
    // reader's behalf, which is not something to expose to a LAN.
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const options = parseServeOptions(args);
  storedConfig = await readStoredConfig(options.configPath);
  const server = createServer((request, response) => {
    void handle(request, response, options).catch((error: unknown) => {
      json(response, 500, {
        error: "SERVER_ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
  await listen(server, options.port);
  console.log(`Open OPTCG on http://127.0.0.1:${options.port}`);
  console.log(`Serving ${artifact}`);
  const capability = capabilityPayload(options);
  console.log(
    capability.configured
      ? `LLM ready (${String(capability.model)}, ${String(capability.credentialSource)})`
      : `LLM not configured; choose a provider in the app's LLM settings`,
  );
  console.log(
    `LLM timeout ${options.llm.timeoutMs}ms; raw log ${options.llm.logPath ?? "disabled (set LLM_LOG_PATH)"}`,
  );
}
