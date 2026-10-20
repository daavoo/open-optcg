import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BrowserGameController,
  newLocalMatch,
} from "../packages/web/src/controller.js";
import { rulesSeatLeader } from "../packages/web/src/rules-seat.js";
import { deckManifests, SEALED_LEADER } from "@one-piece-sim/decks";
import { registeredDecks } from "@one-piece-sim/agents/local";
import { rulesStamp } from "@one-piece-sim/engine-core";
import {
  STANDARD_TIME_LIMIT,
  TIME_LIMIT_ADDITIONAL_TURNS,
} from "@one-piece-sim/protocol";
import type { MatchConfig } from "../packages/web/src/controller.js";

const config = {
  p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
  p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
  p1Controller: "human",
  p2Controller: "rules",
  seed: "web-controller-test",
  startingPlayer: "p1",
} as const;

describe("BrowserGameController", () => {
  it("starts and restores a match with a custom deck manifest", () => {
    const customConfig = {
      ...config,
      p1Deck: "CUSTOM-P1",
      p1CustomDeck: {
        id: "CUSTOM-P1",
        leader: "ST21-001",
        cards: {
          "ST31-005": 4,
          "ST31-004": 4,
          "ST31-001": 4,
          "ST31-002": 4,
          "ST31-003": 4,
          "OP01-016": 4,
          "OP11-003": 4,
          "OP11-009": 4,
          "OP11-012": 4,
          "OP14-015": 4,
          "ST23-004": 2,
          "P-101": 4,
          "OP04-016": 4,
        },
      },
    } as const;

    const controller = new BrowserGameController(customConfig);
    const restored = BrowserGameController.load(controller.save());

    expect(restored.activeObservation.stateHash).toBe(
      controller.activeObservation.stateHash,
    );
  });

  it("restores a deterministic save and undoes by replaying an action prefix", () => {
    const controller = new BrowserGameController(config);
    const initialHash = controller.activeObservation.stateHash;
    const keep = controller.activeObservation.legalActions.find(
      (action) =>
        action.type === "mulligan-decision" && action.decision === "keep",
    );
    expect(keep).toBeDefined();
    controller.act(keep!.actionId);
    expect(controller.latestActionEvents).toHaveLength(1);
    expect(controller.latestActionEvents[0]?.type).toBe("mulligan-decided");

    const saved = controller.save();
    const restored = BrowserGameController.load(saved);
    expect(restored.activeObservation.stateHash).toBe(
      controller.activeObservation.stateHash,
    );
    expect(restored.trace().checkpoints).toEqual(
      controller.trace().checkpoints,
    );

    restored.undo();
    expect(restored.activeObservation.stateHash).toBe(initialHash);
    expect(restored.save().actions).toEqual([]);
  });

  // Regression: `observe` withholds per seat, so `publicEvents` has a different
  // length for each of them, and deltas used to be sliced out of whichever seat
  // `GameService.act` happened to return -- the new active player's. A private
  // look put the two projections out of step, and from then on every action
  // that handed the decision over recorded no events while the next one
  // recorded a delta that replayed events already charged to an earlier
  // action. On screen that was an "Opponent action" modal narrating several
  // turns' worth of steps the opponent had not just taken.
  it("charges every event to exactly one action, across handovers", () => {
    const lines = readFileSync(
      "fixtures/replay/enel-private-search.jsonl",
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const header = lines[0]!;
    const actions = lines
      .filter((line) => line["kind"] === "decision")
      .map((line) => line["actionId"] as string);

    const controller = BrowserGameController.load({
      version: 1,
      config: header["config"] as MatchConfig,
      actions,
    });
    const trace = controller.trace();

    // The contract `TraceCheckpoint.events` documents: concatenating the
    // deltas in order rebuilds the whole log, so no event is dropped and none
    // is counted twice. `p1` is the human seat this trace was played from,
    // which is the projection the deltas are measured in.
    expect([
      ...trace.initialEvents,
      ...trace.checkpoints.flatMap((checkpoint) => checkpoint.events),
    ]).toEqual(controller.observe("p1").publicEvents);
  });
});

describe("the time limit a match is played under", () => {
  it("starts every new local match timed at the limit training uses", () => {
    const fresh = newLocalMatch(config);
    expect(fresh.timeLimit).toEqual(STANDARD_TIME_LIMIT);
    expect(STANDARD_TIME_LIMIT).toEqual({ turns: 20 });

    const controller = new BrowserGameController(fresh);
    expect(controller.activeObservation.timeLimit).toMatchObject({
      calledOnTurn: STANDARD_TIME_LIMIT.turns,
      called: false,
    });
    // The save carries the limit, so the match resumes and replays timed.
    const saved = controller.save();
    expect(saved.config.timeLimit).toEqual(STANDARD_TIME_LIMIT);
    expect(
      BrowserGameController.load(saved).activeObservation.timeLimit,
    ).toMatchObject({ calledOnTurn: STANDARD_TIME_LIMIT.turns });
  });

  it("loads a save without the field untimed, as it was played", () => {
    // `config` has no `timeLimit`: the shape of every save and trace the app
    // wrote before it started timing its matches.
    const played = new BrowserGameController(config);
    const keep = played.activeObservation.legalActions.find(
      (action) =>
        action.type === "mulligan-decision" && action.decision === "keep",
    )!;
    played.act(keep.actionId);
    const saved = played.save();
    expect(saved.config).not.toHaveProperty("timeLimit");

    const loaded = BrowserGameController.load(saved);
    expect(loaded.activeObservation).not.toHaveProperty("timeLimit");
    expect(loaded.activeObservation.stateHash).toBe(
      played.activeObservation.stateHash,
    );
  });

  it("ends a new local match on time once it runs past the limit", () => {
    // Both seats keep their hands and end every turn: nobody takes a Life, so
    // only the limit can finish the game.
    const controller = new BrowserGameController(newLocalMatch(config));
    for (let step = 0; step < 500; step += 1) {
      const observation = controller.activeObservation;
      if (observation.phase === "finished") break;
      const action =
        observation.legalActions.find(
          (candidate) =>
            candidate.type === "pass" ||
            (candidate.type === "mulligan-decision" &&
              candidate.decision === "keep"),
        ) ?? observation.legalActions[0]!;
      controller.act(action.actionId);
    }
    const final = controller.activeObservation;
    expect(final.phase).toBe("finished");
    expect(final.resultReason).toBe("time");
    expect(final.turn).toBe(
      STANDARD_TIME_LIMIT.turns + TIME_LIMIT_ADDITIONAL_TURNS,
    );
  });
});

describe("saved match provenance", () => {
  it("stamps the rules a save was made under", () => {
    const controller = new BrowserGameController({
      p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
      p2Deck: "(Green) Roronoa Zoro - Starter Deck 32",
      p1Controller: "human",
      p2Controller: "rules",
      seed: "provenance",
      startingPlayer: "p1",
    });

    // Without this a trace is an action list with nothing to date it, and a
    // rules change turns every trace in the wild into "illegal at r43".
    expect(controller.save().rules).toEqual(rulesStamp());
  });

  it("explains an incompatible trace instead of failing mid-replay", () => {
    expect(() =>
      BrowserGameController.load({
        version: 1,
        config: {
          p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
          p2Deck: "(Green) Roronoa Zoro - Starter Deck 32",
          p1Controller: "human",
          p2Controller: "rules",
          seed: "provenance",
          startingPlayer: "p1",
        },
        // An action that cannot be legal at r0, as a trace from another rules
        // version would eventually produce.
        actions: ["r0:attack:p1-leader:p2-leader"],
        rules: {
          rulesVersion: "st31-st32-1.0",
          cardDataHash: "0".repeat(64),
          programHash: "0".repeat(64),
        },
      }),
    ).toThrow(/made under rules st31-st32-1\.0/);
  });
});

/**
 * The browser's rules seat and the policy registry, checked against each other.
 *
 * This is the gate the bug that prompted these tests got through: the worker
 * resolved its rules agent from a hand-written switch over six deck ids, so
 * every OP-set deck the app shipped played with no deck policy, and nothing
 * failed -- a generic agent still returns legal actions, so the only symptom was
 * a seat playing badly. Deriving the seat from the manifest is the fix; this is
 * what keeps the two lists from drifting apart again.
 */
describe("the browser's rules seat", () => {
  it("resolves every shipped deck to its own Leader", () => {
    for (const [deckId, manifest] of Object.entries(deckManifests)) {
      expect(rulesSeatLeader(deckId)).toBe(manifest.leader);
    }
  });

  it("plays a registered policy for every shipped deck that has one", () => {
    const registered = registeredDecks();
    const withoutPolicy = Object.entries(deckManifests)
      .filter(([, manifest]) => registered.includes(manifest.leader))
      .filter(([deckId]) => !registered.includes(rulesSeatLeader(deckId) ?? ""))
      .map(([deckId]) => deckId);
    expect(withoutPolicy).toEqual([]);
  });

  it("keys a sealed deck on the Leader its policies are registered under", () => {
    // Sealed manifests are made per seed and never appear in `deckManifests`,
    // so the manifest lookup cannot answer for them.
    expect(rulesSeatLeader("SEALED-abc123")).toBe(SEALED_LEADER);
  });

  it("has no Leader for a deck it was told nothing about", () => {
    // The generic agent is the caller's fallback; what matters here is that this
    // says so rather than inventing a Leader.
    expect(rulesSeatLeader("NOT-A-DECK")).toBeNull();
  });

  it("prefers a custom deck's own manifest over the shipped table", () => {
    expect(
      rulesSeatLeader("CUSTOM-P1", {
        id: "CUSTOM-P1",
        leader: "OP16-080",
        cards: {},
      }),
    ).toBe("OP16-080");
  });
});
