import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  observe,
  simulateLine,
  toGameAction,
  type GameState,
} from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";

function playTo(predicate: (state: GameState) => boolean): GameState {
  let state: GameState = createGame({
    gameId: "line-1",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
    seed: "line-seed-1",
  });
  for (let step = 0; step < 400; step += 1) {
    if (predicate(state)) return state;
    const actions = getLegalActions(state, state.activePlayer);
    const next = actions[0];
    if (!next || state.phase === "finished") break;
    state = applyAction(state, toGameAction(next, state.revision)).state;
  }
  throw new Error("state not reached");
}

describe("resumable simulation", () => {
  it("extends a line past the first action", () => {
    const state = playTo((candidate) =>
      getLegalActions(candidate, candidate.activePlayer).some(
        (action) => action.type === "attach-don",
      ),
    );
    const seat = state.activePlayer;
    const first = getLegalActions(state, seat).find(
      (action) => action.type === "attach-don",
    )!;

    const line = simulateLine(state, first.actionId, seat);
    expect(line).toBeDefined();
    expect(line?.viewer).toBe(seat);
    // A second step must be reachable, which is the whole point over
    // simulateAction returning a bare observation.
    const second = line?.observation.legalActions[0];
    expect(second).toBeDefined();
    expect(line?.advance(second!.actionId)).toBeDefined();
  });

  it("leaves the caller's state untouched", () => {
    const state = playTo((candidate) =>
      getLegalActions(candidate, candidate.activePlayer).some(
        (action) => action.type === "attach-don",
      ),
    );
    const seat = state.activePlayer;
    const before = observe(state, seat).stateHash;
    const action = getLegalActions(state, seat).find(
      (candidate) => candidate.type === "attach-don",
    )!;

    const line = simulateLine(state, action.actionId, seat);
    line?.advance(line.observation.legalActions[0]!.actionId);

    expect(observe(state, seat).stateHash).toBe(before);
  });

  it("reports every node from the simulating seat only", () => {
    const state = playTo((candidate) =>
      getLegalActions(candidate, candidate.activePlayer).some(
        (action) => action.type === "attach-don",
      ),
    );
    const seat = state.activePlayer;
    const action = getLegalActions(state, seat).find(
      (candidate) => candidate.type === "attach-don",
    )!;

    let line = simulateLine(state, action.actionId, seat);
    for (let depth = 0; depth < 5 && line; depth += 1) {
      expect(line.observation.viewer).toBe(seat);
      // The opponent's hand is never itemised, at any depth.
      expect(line.observation.opponent).not.toHaveProperty("hand");
      line = line.advanceDefault();
    }
  });

  it("returns undefined for an action that is not legal", () => {
    const state = playTo(() => true);
    expect(simulateLine(state, "not-an-action", state.activePlayer)).toBe(
      undefined,
    );
  });
});
