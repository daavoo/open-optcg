/**
 * The bare observation the format-rule tests score against.
 *
 * `blankState` builds a GameState directly, which `test/support` exists to
 * discourage -- these tests score a rule against a hand-made observation
 * rather than drive the engine to a decision, and that is the one case the
 * builder cannot serve. Kept out of `test/support/` so the distinction stays
 * visible: a test that can use the scenario builder should.
 */
import {
  createGame,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { GameObservation } from "@one-piece-sim/protocol";
import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

export function blankState(): GameState {
  const state = createGame({
    gameId: "format-1",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Blue) Kuzan - Starter Deck 33"),
    seed: "format-seed-1",
  });
  state.phase = "main";
  state.turn = 2;
  setTurnPlayer(state, "p1");
  for (const playerId of ["p1", "p2"] as const) {
    Object.assign(state.players[playerId], {
      hand: [],
      board: [],
      stage: null,
      activeDon: [],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
    });
  }
  return state;
}

export function view(state: GameState): GameObservation {
  return observe(state, "p1");
}
