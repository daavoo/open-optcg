import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LlmChatClient, LlmChatRequest } from "@one-piece-sim/agents/llm";
import {
  defaultLlmLogPath,
  LlmJsonlRecorder,
} from "../packages/cli/src/llm-jsonl.js";

describe("LLM JSONL recorder", () => {
  it("records exact messages, response, model, and game context", async () => {
    const directory = mkdtempSync(join(tmpdir(), "one-piece-llm-"));
    const filePath = join(directory, "requests.jsonl");
    const recorder = new LlmJsonlRecorder(filePath);
    const client: LlmChatClient = {
      async complete() {
        return {
          content: '{"actionId":"r12:pass"}',
          reasoningSummary: "Passing preserves resources.",
        };
      },
    };
    const messages: LlmChatRequest["messages"] = [
      { role: "system", content: "Choose a legal action." },
      {
        role: "user",
        content: JSON.stringify({
          state: {
            gameId: "g-1",
            revision: 12,
            viewer: "p2",
            turn: 6,
            phase: "main",
          },
          legalActions: [{ actionId: "r12:pass" }],
        }),
      },
    ];

    await recorder.wrap(client, "p2", "test-model").complete({ messages });

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      version: 1,
      sequence: 1,
      controller: "p2",
      model: "test-model",
      context: {
        gameId: "g-1",
        revision: 12,
        viewer: "p2",
        turn: 6,
        phase: "main",
      },
      request: { messages },
      response: {
        content: '{"actionId":"r12:pass"}',
        reasoningSummary: "Passing preserves resources.",
      },
    });
  });

  it("derives a companion path from the engine trace", () => {
    expect(defaultLlmLogPath("debug/match.json")).toBe("debug/match.llm.jsonl");
    expect(defaultLlmLogPath("debug/match")).toBe("debug/match.llm.jsonl");
  });
});
