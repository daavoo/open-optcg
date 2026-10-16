import { describe, expect, it } from "vitest";
import { parseExportedMatch } from "../packages/web/src/diagnostics.js";
import {
  feedbackJsonl,
  parseScorerReview,
  withFlag,
  type ReviewFlag,
} from "../packages/web/src/scorer-review.js";
import { replayViewer } from "../packages/web/src/replay.js";
import type { MatchConfig } from "../packages/web/src/controller.js";

const config: MatchConfig = {
  p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
  p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
  p1Controller: "scorer",
  p2Controller: "rules",
  seed: "scorer-review-test",
  startingPlayer: "random",
};

/** A trace as `ml/sys1/traces.py` writes one. */
function trainerTrace(): string {
  const header = {
    kind: "header",
    version: 2,
    exportedAt: "2026-09-26T00:00:00.000Z",
    config,
    events: [],
    scorer: { checkpoint: "checkpoints/play", seat: "p1", won: false },
  };
  const decision = (revision: number, player: string, scorer?: object) => ({
    kind: "decision",
    revision,
    actionId: `r${revision}:x`,
    turn: 1,
    player,
    events: [],
    ...(scorer ? { scorer } : {}),
  });
  const note = {
    options: [
      { actionId: "r1:x", p: 0.7 },
      { actionId: "r1:y", p: 0.3 },
    ],
    winProbability: 0.6,
    drop: 0.25,
  };
  return [
    header,
    decision(0, "p1"),
    // A line that is not a decision is not an action and must not shift the rest.
    { kind: "llm-error", timestamp: "t", turn: 1, player: "p2", error: "e" },
    decision(1, "p1", note),
    decision(2, "p2"),
  ]
    .map((line) => JSON.stringify(line))
    .join("\n");
}

describe("parseScorerReview", () => {
  it("puts each note on the action it was written on", () => {
    const text = trainerTrace();
    const review = parseScorerReview(text)!;
    expect(review.notes).toHaveLength(parseExportedMatch(text).actions.length);
    expect(review.notes[0]).toBeNull();
    expect(review.notes[1]?.options[0]).toEqual({ actionId: "r1:x", p: 0.7 });
    expect(review.notes[1]?.drop).toBe(0.25);
    expect(review.notes[2]).toBeNull();
    expect(review).toMatchObject({
      checkpoint: "checkpoints/play",
      seat: "p1",
    });
  });

  it("is null for a trace the model did not annotate", () => {
    const plain = trainerTrace()
      .split("\n")
      .map((line) => {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        delete parsed["scorer"];
        return JSON.stringify(parsed);
      })
      .join("\n");
    expect(parseScorerReview(plain)).toBeNull();
  });
});

describe("feedbackJsonl", () => {
  it("carries everything a flagged position is rebuilt from", () => {
    const flags: ReviewFlag[] = [
      {
        actionIndex: 2,
        player: "p2",
        actionId: "r2:x",
        preferred: null,
        note: "",
      },
      {
        actionIndex: 1,
        player: "p1",
        actionId: "r1:x",
        preferred: "r1:y",
        note: "hold it",
      },
    ];
    const lines = feedbackJsonl({
      config,
      actions: ["r0:x", "r1:x", "r2:x"],
      checkpoint: "checkpoints/play",
      flags,
      exportedAt: "2026-09-26T00:00:00.000Z",
    })
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines[0]).toMatchObject({
      kind: "feedback-header",
      config,
      actions: ["r0:x", "r1:x", "r2:x"],
      checkpoint: "checkpoints/play",
    });
    // In play order, whatever order they were flagged in.
    expect(lines.slice(1).map((line) => line["actionIndex"])).toEqual([1, 2]);
    expect(lines[1]).toMatchObject({
      kind: "flag",
      preferred: "r1:y",
      note: "hold it",
    });
  });
});

describe("withFlag", () => {
  it("replaces the flag already on the same move", () => {
    const first: ReviewFlag = {
      actionIndex: 4,
      player: "p1",
      actionId: "a",
      preferred: null,
      note: "",
    };
    const second = { ...first, preferred: "b" };
    expect(withFlag(withFlag([], first), second)).toEqual([second]);
  });
});

describe("replayViewer", () => {
  it("watches a trainer's trace from the model's seat", () => {
    expect(
      replayViewer({
        ...config,
        p1Controller: "rules",
        p2Controller: "scorer",
      }),
    ).toBe("p2");
  });
});
