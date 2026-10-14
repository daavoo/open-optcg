import { describe, expect, it } from "vitest";
import {
  applyAction,
  cloneGameData,
  createGame,
  getLegalActions,
  type GameState,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";

/**
 * `cloneGameData` is `applyAction`'s copy, and so the most executed code in the
 * project. It replaced `structuredClone` for speed, which makes "it copies
 * exactly what `structuredClone` copied" the property worth pinning: a clone
 * that quietly dropped a field would not fail here as a slow test, it would
 * fail somewhere else as a rules bug.
 *
 * The real check is the last one -- a played game, every state compared -- and
 * the unit cases above it are there to name the shapes that would break it.
 */
describe("cloneGameData", () => {
  it("copies plain data the way structuredClone does", () => {
    const value = {
      nested: { list: [1, "two", true, null, { deep: [] as number[] }] },
      absent: undefined,
      zero: 0,
      empty: "",
    };
    const copy = cloneGameData(value);
    expect(copy).toStrictEqual(structuredClone(value));
    // `toStrictEqual` compares own keys, so this is the part it does not say:
    // a key whose value is `undefined` is still a key, and JSON-shaped copying
    // would have lost it.
    expect(Object.keys(copy)).toContain("absent");
  });

  it("copies rather than shares every level it touches", () => {
    const value = { board: [{ don: ["a"] }] };
    const copy = cloneGameData(value);
    expect(copy).not.toBe(value);
    expect(copy.board).not.toBe(value.board);
    expect(copy.board[0]).not.toBe(value.board[0]);
    expect(copy.board[0]!.don).not.toBe(value.board[0]!.don);
  });

  /**
   * The fallback that keeps the narrow fast path honest: a state that one day
   * holds something the field-by-field loop does not understand is copied by
   * `structuredClone` instead of copied wrongly.
   */
  it("hands anything that is not plain data to structuredClone", () => {
    const value = { when: new Date(0), tally: new Map([["a", 1]]) };
    const copy = cloneGameData(value);
    expect(copy.when).toBeInstanceOf(Date);
    expect(copy.when.getTime()).toBe(0);
    expect(copy.tally).toBeInstanceOf(Map);
    expect(copy.tally.get("a")).toBe(1);
    expect(copy.tally).not.toBe(value.tally);
  });

  it("matches structuredClone at every state of a played game", () => {
    let state: GameState = createGame({
      gameId: "clone-parity",
      p1: resolveDeck("FIXTURE-RED"),
      p2: resolveDeck("FIXTURE-BLUE"),
      seed: "clone-parity-seed",
    });
    let compared = 0;
    // Deterministic and deep enough to reach attacks, Counters and triggers:
    // the first offered action, for two hundred transitions or until someone
    // wins.
    for (let step = 0; step < 200 && state.phase !== "finished"; step += 1) {
      expect(cloneGameData(state)).toStrictEqual(structuredClone(state));
      compared += 1;
      const offered = getLegalActions(state, state.activePlayer);
      const next = offered[0];
      if (!next) break;
      state = applyAction(state, { ...next, revision: state.revision }).state;
    }
    expect(compared).toBeGreaterThan(50);
  });
});
