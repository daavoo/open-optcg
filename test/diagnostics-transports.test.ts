import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsJsonl,
  inspectExportedMatch,
} from "../packages/web/src/diagnostics.js";
import type { MatchTrace } from "../packages/web/src/controller.js";

/** Only the fields these tests read; the exported shape is wider. */
interface DiagnosticsLine {
  kind?: string;
  llm?: {
    chosen?: string[];
    reasoning?: string;
    observation?: unknown;
    usage?: unknown;
    systemPrompt?: string;
  };
}

const OBSERVATION = {
  request: "choose_action",
  state: { turn: 3, viewer: "p1" },
};
const DECISION = '{"reasoning":"Nothing to gain.","actionIds":["r5:pass"]}';

const trace: MatchTrace = {
  version: 1,
  config: {
    p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
    p2Deck: "(Purple) Enel - Official Feature Deck",
    p1Controller: "llm",
    p2Controller: "llm",
    seed: "s",
    startingPlayer: "p1",
  },
  actions: ["r5:pass"],
  initialEvents: [],
  checkpoints: [
    {
      revision: 6,
      actionId: "r5:pass",
      turn: 3,
      player: "p1",
      stateHash: "hash",
      events: [],
    },
  ],
};

function exported(rawExchange: { request: unknown; response: unknown }) {
  const jsonl = buildDiagnosticsJsonl({
    trace,
    llmRecords: [
      {
        timestamp: "2026-08-17T00:00:00.000Z",
        turn: 3,
        player: "p1",
        actionId: "r5:pass",
        rawExchange,
      },
    ],
    exportedAt: "2026-08-17T00:00:01.000Z",
  });
  const lines = jsonl
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DiagnosticsLine);
  return {
    header: lines.find((line) => line.kind === "header"),
    decision: lines.find((line) => line.kind === "decision"),
    inspected: inspectExportedMatch(jsonl),
  };
}

describe("diagnostics reads every transport's exchange", () => {
  it("parses an OpenAI Responses exchange", () => {
    const { decision } = exported({
      request: {
        model: "gpt-5.6-luna",
        input: [
          { role: "system", content: "rules" },
          { role: "user", content: JSON.stringify(OBSERVATION) },
        ],
        text: { format: { schema: { type: "object" } } },
      },
      response: {
        id: "resp_1",
        output_text: DECISION,
        usage: { input_tokens: 10 },
      },
    });
    expect(decision?.llm?.chosen).toEqual(["r5:pass"]);
    expect(decision?.llm?.reasoning).toBe("Nothing to gain.");
    expect(decision?.llm?.observation).toBeDefined();
    expect(decision?.llm?.usage).toEqual({ input_tokens: 10 });
  });

  it("parses a Chat Completions exchange", () => {
    const { decision } = exported({
      request: {
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: "rules" },
          { role: "user", content: JSON.stringify(OBSERVATION) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { schema: { type: "object" } },
        },
      },
      response: {
        id: "chatcmpl_1",
        choices: [{ message: { role: "assistant", content: DECISION } }],
        usage: { prompt_tokens: 12 },
      },
    });
    expect(decision?.llm?.chosen).toEqual(["r5:pass"]);
    expect(decision?.llm?.reasoning).toBe("Nothing to gain.");
    expect(decision?.llm?.usage).toEqual({ prompt_tokens: 12 });
  });

  it("parses a Gemini generateContent exchange", () => {
    const { decision } = exported({
      request: {
        model: "gemini-3.7-flash",
        systemInstruction: { parts: [{ text: "rules" }] },
        contents: [
          { role: "user", parts: [{ text: JSON.stringify(OBSERVATION) }] },
        ],
        generationConfig: { responseSchema: { type: "object" } },
      },
      response: {
        candidates: [{ content: { parts: [{ text: DECISION }] } }],
        usageMetadata: { promptTokenCount: 13, cachedContentTokenCount: 12 },
      },
    });
    expect(decision?.llm?.chosen).toEqual(["r5:pass"]);
    expect(decision?.llm?.reasoning).toBe("Nothing to gain.");
    expect(decision?.llm?.observation).toBeDefined();
    expect(decision?.llm?.usage).toEqual({
      promptTokenCount: 13,
      cachedContentTokenCount: 12,
    });
  });

  it("names the cache when Gemini's system prompt was uploaded", () => {
    const { decision, header } = exported({
      request: {
        model: "gemini-3.7-flash",
        cachedContent: "cachedContents/abc",
        contents: [
          { role: "user", parts: [{ text: JSON.stringify(OBSERVATION) }] },
        ],
      },
      response: { candidates: [{ content: { parts: [{ text: DECISION }] } }] },
    });
    expect(decision?.llm?.chosen).toEqual(["r5:pass"]);
    // The prompt is not in the request, so the export says where it went
    // rather than reporting the decision as having had no system prompt.
    expect(header?.llm?.systemPrompt).toContain("cachedContents/abc");
    expect(decision?.llm?.observation).toBeDefined();
  });

  it("recovers records from a Gemini export the same way as an OpenAI one", () => {
    const { inspected } = exported({
      request: {
        model: "gemini-3.7-flash",
        systemInstruction: { parts: [{ text: "rules" }] },
        contents: [
          { role: "user", parts: [{ text: JSON.stringify(OBSERVATION) }] },
        ],
      },
      response: { candidates: [{ content: { parts: [{ text: DECISION }] } }] },
    });
    expect(inspected.llmRecords).toHaveLength(1);
    expect(inspected.llmRecords[0]?.actionId).toBe("r5:pass");
    expect(inspected.llmRecords[0]?.payloadSource).toBe("exact");
  });
});
