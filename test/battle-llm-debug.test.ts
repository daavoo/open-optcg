import { describe, expect, it } from "vitest";
import {
  callSummary,
  hasNormalizedPayloads,
} from "../packages/web/src/battle-llm-debug.js";
import type { LlmDebugRecord } from "../packages/web/src/llm-settings.js";

function record(overrides: Partial<LlmDebugRecord> = {}): LlmDebugRecord {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    turn: 1,
    player: "p2",
    ...overrides,
  };
}

describe("what a model call says", () => {
  it("reports the action it chose", () => {
    expect(callSummary(record({ actionId: "play-ST31-001" }))).toMatchObject({
      actionId: "play-ST31-001",
      turn: 1,
      player: "p2",
    });
  });

  it("reports a failure as a failure, not as a decision", () => {
    const summary = callSummary(record({ error: "timed out" }));
    expect(summary.error).toBe("timed out");
    expect(summary.actionId).toBeUndefined();
  });

  it("carries the provider summary the record was stamped with", () => {
    expect(
      callSummary(record({ actionId: "a", reasoning: "Trading up on power." }))
        .reasoningSummary,
    ).toBe("Trading up on power.");
  });

  it("reads the reasoning out of a provider response", () => {
    const summary = callSummary(
      record({
        actionId: "a",
        rawExchange: {
          request: { model: "test", input: [] },
          response: {
            output_text: JSON.stringify({
              chosen: ["a"],
              reasoning: "Keep the opening hand.",
            }),
          },
        },
      }),
    );
    expect(summary.reasoning).toBe("Keep the opening hand.");
  });

  it("reads the turn plan out of a provider response", () => {
    const summary = callSummary(
      record({
        actionId: "a",
        rawExchange: {
          request: { model: "test", input: [] },
          response: {
            output_text: JSON.stringify({
              turnPlan: ["attach 2 DON!! to board-1", "attack op-leader"],
              actionIds: ["a"],
              reasoning: "Their hand cannot cover 3001.",
            }),
          },
        },
      }),
    );
    expect(summary.plan).toEqual([
      "attach 2 DON!! to board-1",
      "attack op-leader",
    ]);
    expect(summary.reasoning).toBe("Their hand cannot cover 3001.");
  });

  it("reads the turn plan out of a normalized response too", () => {
    const summary = callSummary(
      record({
        actionId: "a",
        payloadSource: "normalized",
        rawExchange: {
          request: { note: "normalized" },
          response: { turnPlan: ["attack op-leader with leader"] },
        },
      }),
    );
    expect(summary.plan).toEqual(["attack op-leader with leader"]);
  });

  it("still reads a plan an older trace wrote under `plan`", () => {
    // The field was renamed to match the answer's own; a trace exported before
    // that is still the artefact a bug report arrives as.
    const summary = callSummary(
      record({
        actionId: "a",
        rawExchange: {
          request: { model: "test", input: [] },
          response: {
            output_text: JSON.stringify({
              plan: ["attack later"],
              actionIds: ["a"],
              reasoning: "Develop first.",
            }),
          },
        },
      }),
    );
    expect(summary.plan).toEqual(["attack later"]);
  });

  it("treats an empty turn plan as no plan", () => {
    // Every own-turn answer carries the field, and a Counter step's is empty:
    // a heading over nothing would appear on most calls in the match.
    const summary = callSummary(
      record({
        actionId: "a",
        rawExchange: {
          request: { model: "test", input: [] },
          response: {
            output_text: JSON.stringify({
              turnPlan: [],
              actionIds: ["a"],
              reasoning: "Nothing reaches.",
            }),
          },
        },
      }),
    );
    expect(summary.plan).toBeUndefined();
  });

  it("joins a legacy trace's separate plan and rationale", () => {
    const summary = callSummary(
      record({
        actionId: "a",
        rawExchange: {
          request: { model: "test", input: [] },
          response: {
            output_text: JSON.stringify({
              chosen: ["a"],
              rationale: "Keep the opening hand.",
              turnPlan: "Curve out, hold the Counter.",
            }),
          },
        },
      }),
    );
    expect(summary.reasoning).toBe(
      "Curve out, hold the Counter.\n\nKeep the opening hand.",
    );
  });

  it("reads it out of a legacy trace's normalized response too", () => {
    // A normalized payload puts the fields at the top level of the response
    // rather than inside the provider's output text.
    const summary = callSummary(
      record({
        actionId: "a",
        payloadSource: "normalized",
        rawExchange: {
          request: { note: "normalized" },
          response: { rationale: "Attack the Leader." },
        },
      }),
    );
    expect(summary.reasoning).toBe("Attack the Leader.");
  });

  it("does not print a legacy trace's aliased summary twice", () => {
    // Before the split, a provider that returned no summary left the answer's
    // own reasoning stamped on the record as if it were one.
    const summary = callSummary(
      record({
        actionId: "a",
        reasoning: "Attack the Leader.",
        payloadSource: "normalized",
        rawExchange: {
          request: { note: "normalized" },
          response: { rationale: "Attack the Leader." },
        },
      }),
    );
    expect(summary.reasoning).toBe("Attack the Leader.");
    expect(summary.reasoningSummary).toBeUndefined();
  });

  it("says nothing it was not given", () => {
    const summary = callSummary(record({ actionId: "a" }));
    expect(summary.reasoning).toBeUndefined();
    expect(summary.reasoningSummary).toBeUndefined();
  });

  it("reports which calls carry normalized rather than exact payloads", () => {
    expect(
      hasNormalizedPayloads([
        record({ actionId: "a", payloadSource: "exact" }),
      ]),
    ).toBe(false);
    expect(
      hasNormalizedPayloads([
        record({ actionId: "a", payloadSource: "exact" }),
        record({ actionId: "b", payloadSource: "normalized" }),
      ]),
    ).toBe(true);
  });
});
