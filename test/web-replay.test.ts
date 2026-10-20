import { describe, expect, it } from "vitest";
import {
  replayTurnStarts,
  replayViewer,
  takeoverConfig,
} from "../packages/web/src/replay.js";
import { BrowserGameController } from "../packages/web/src/controller.js";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import type { MatchConfig } from "../packages/web/src/controller.js";

const config: MatchConfig = {
  p1Deck: "(Red) Monkey.D.Luffy - Starter Deck 31",
  p2Deck: "(Yellow) Eustass Kid - Starter Deck 36",
  p1Controller: "rules",
  p2Controller: "rules",
  seed: "web-replay-test",
  startingPlayer: "p1",
};

/** A whole game played by two rules agents, as a trace would record it. */
async function playedMatch(actions = 40): Promise<BrowserGameController> {
  const controller = new BrowserGameController(config);
  const agents = {
    p1: createRulesAgent(config.p1Deck),
    p2: createRulesAgent(config.p2Deck),
  } as const;
  for (let taken = 0; taken < actions; taken += 1) {
    const observation = controller.activeObservation;
    if (observation.phase === "finished") break;
    const chosen = await agents[observation.activePlayer].chooseAction(
      controller.observe(observation.activePlayer),
    );
    controller.act(chosen.actionId);
  }
  return controller;
}

describe("replayTurnStarts", () => {
  it("names each turn once, at the action it begins with", async () => {
    const starts = replayTurnStarts((await playedMatch()).trace().checkpoints);

    expect(starts[0]).toEqual({ turn: 1, player: "p1", actionCount: 0 });
    expect(starts.map((start) => start.turn)).toEqual([
      ...new Set(starts.map((start) => start.turn)),
    ]);
    // Turns run upwards, and each starts after the one before it.
    for (const [index, start] of starts.entries()) {
      if (index === 0) continue;
      expect(start.turn).toBeGreaterThan(starts[index - 1]!.turn);
      expect(start.actionCount).toBeGreaterThan(starts[index - 1]!.actionCount);
    }
  });

  it("puts the position of a turn where that turn's first action was taken", async () => {
    const played = await playedMatch();
    const saved = played.save();
    const checkpoints = played.trace().checkpoints;
    const starts = replayTurnStarts(checkpoints);

    for (const start of starts) {
      expect(checkpoints[start.actionCount]?.turn).toBe(start.turn);
      // Winding a match back to that point leaves the engine on that turn,
      // which is what jumping to a turn promises. A fresh controller per jump,
      // because a rewind drops the actions it wound past.
      const controller = BrowserGameController.load(saved);
      expect(controller.rewindTo(start.actionCount).turn).toBe(start.turn);
    }
  });

  it("is jumped around in from the file, not from the match", async () => {
    // Rewinding truncates the controller's own action list, so what a replay
    // plays forward has to be the file's list -- which is why the replay state
    // keeps it rather than reading it back off the match.
    const played = await playedMatch();
    const saved = played.save();
    const controller = BrowserGameController.load(saved);
    const end = controller.activeObservation.stateHash;

    controller.rewindTo(3);
    expect(controller.save().actions).toHaveLength(3);
    for (const actionId of saved.actions.slice(3)) controller.act(actionId);

    expect(controller.activeObservation.stateHash).toBe(end);
  });

  it("has no turns for a file with no actions", () => {
    expect(replayTurnStarts([])).toEqual([]);
  });
});

describe("replayViewer", () => {
  it("watches from the seat the trace was recorded at", () => {
    expect(replayViewer({ ...config, p1Controller: "human" })).toBe("p1");
    expect(replayViewer({ ...config, p2Controller: "human" })).toBe("p2");
  });

  it("watches an agent-versus-agent trace from p1", () => {
    expect(replayViewer(config)).toBe("p1");
  });
});

describe("takeoverConfig", () => {
  it("seats the watcher and leaves the other agent alone", () => {
    const taken = takeoverConfig(config, "p2");

    expect(taken.p2Controller).toBe("human");
    expect(taken.p1Controller).toBe("rules");
    // Everything the position depends on is untouched, so the actions played
    // so far still replay into the new match.
    expect(taken.seed).toBe(config.seed);
    expect(taken.startingPlayer).toBe(config.startingPlayer);
    expect(taken.p1Deck).toBe(config.p1Deck);
  });

  it("gives a rules agent the seat it cannot pilot", () => {
    // Two human seats in one page is a seat nothing here can play.
    expect(
      takeoverConfig({ ...config, p2Controller: "human" }, "p1").p2Controller,
    ).toBe("rules");
  });

  it("replays the actions taken so far into the seat that was taken over", async () => {
    const watched = await playedMatch();
    const played = watched.save().actions;
    const resumed = new BrowserGameController(takeoverConfig(config, "p1"));
    for (const actionId of played) resumed.act(actionId);

    // The same position, reached the same way: only who is to pilot it next
    // has changed.
    expect(resumed.activeObservation.stateHash).toBe(
      watched.activeObservation.stateHash,
    );
  });
});
