import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import type { LlmChatClient, LlmChatRequest } from "@one-piece-sim/agents/llm";

interface LlmRequestContext {
  gameId?: string;
  revision?: number;
  viewer?: string;
  turn?: number;
  phase?: string;
}

function requestContext(request: LlmChatRequest): LlmRequestContext {
  const content = request.messages.at(-1)?.content;
  if (!content) return {};
  try {
    const payload: unknown = JSON.parse(content);
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("state" in payload)
    ) {
      return {};
    }
    const state = payload.state;
    if (typeof state !== "object" || state === null) return {};
    const fields = state as Record<string, unknown>;
    return {
      ...(typeof fields.gameId === "string" ? { gameId: fields.gameId } : {}),
      ...(typeof fields.revision === "number"
        ? { revision: fields.revision }
        : {}),
      ...(typeof fields.viewer === "string" ? { viewer: fields.viewer } : {}),
      ...(typeof fields.turn === "number" ? { turn: fields.turn } : {}),
      ...(typeof fields.phase === "string" ? { phase: fields.phase } : {}),
    };
  } catch {
    return {};
  }
}

export function defaultLlmLogPath(tracePath: string): string {
  const extension = extname(tracePath);
  return extension
    ? `${tracePath.slice(0, -extension.length)}.llm.jsonl`
    : `${tracePath}.llm.jsonl`;
}

export class LlmJsonlRecorder {
  readonly #filePath: string;
  #sequence = 0;

  constructor(filePath: string) {
    this.#filePath = resolve(filePath);
    mkdirSync(dirname(this.#filePath), { recursive: true });
    writeFileSync(this.#filePath, "");
  }

  wrap(
    client: LlmChatClient,
    controller: string,
    model?: string,
  ): LlmChatClient {
    return {
      complete: async (request) => {
        const sequence = ++this.#sequence;
        const startedAt = new Date();
        try {
          const response = await client.complete(request);
          this.write({
            version: 1,
            sequence,
            timestamp: startedAt.toISOString(),
            controller,
            ...(model ? { model } : {}),
            context: requestContext(request),
            request: { messages: request.messages },
            response,
            durationMs: Date.now() - startedAt.getTime(),
          });
          return response;
        } catch (error) {
          this.write({
            version: 1,
            sequence,
            timestamp: startedAt.toISOString(),
            controller,
            ...(model ? { model } : {}),
            context: requestContext(request),
            request: { messages: request.messages },
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startedAt.getTime(),
          });
          throw error;
        }
      },
    } satisfies LlmChatClient;
  }

  get filePath(): string {
    return this.#filePath;
  }

  private write(record: object): void {
    appendFileSync(this.#filePath, `${JSON.stringify(record)}\n`);
  }
}
