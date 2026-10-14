import { describe, expect, it } from "vitest";
import {
  applyAction,
  canonicalJson,
  createGame,
  getLegalActions,
  observe,
} from "@one-piece-sim/engine-core";
import { resolveDeck } from "@one-piece-sim/decks";
import { sha256Hex, sha256HexPortable } from "@one-piece-sim/protocol";

/**
 * The implementation `canonicalJson` replaced: rebuild the value with sorted
 * keys, then let `JSON.stringify` write it. It is kept here as the reference
 * because the hash of every recorded trace and fixture was computed through it,
 * so "identical text" is the property, not "equivalent JSON".
 */
function reference(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonicalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(canonicalize(value));
}

describe("canonicalJson", () => {
  it("writes the shapes JSON.stringify treats specially the way it did", () => {
    const cases: unknown[] = [
      null,
      0,
      -0,
      1e21,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "",
      'quote " and \\ backslash and   line',
      true,
      [],
      {},
      [undefined, null, () => 1, Symbol("s"), 3],
      { dropped: undefined, kept: null, fn() {}, [Symbol("k")]: 1, z: 1, a: 2 },
      { b: { d: [1, { f: 2, e: 1 }], c: 3 }, a: [] },
      // Integer-like keys enumerate first, in numeric order, whatever the sort
      // said -- because the reference's `Object.fromEntries` copy did.
      {
        z: 1,
        "10": "ten",
        "2": "two",
        "0": "zero",
        a: 2,
        "01": "not an index",
      },
      { "4294967294": "last index", "4294967295": "a string key", b: 1 },
      // Case and punctuation, where `localeCompare` and code-unit order differ.
      { Zed: 1, alpha: 2, _under: 3, "p1-leader": 4, p1: 5, P1: 6 },
      { when: new Date(0), tally: new Map([["a", 1]]) },
      [[[]], [{}], [[null]]],
    ];
    for (const value of cases) {
      expect(canonicalJson(value)).toBe(reference(value));
    }
  });

  it("matches the reference on every state and observation of a played game", () => {
    let state = createGame({
      gameId: "canonical",
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "canonical-json",
    });
    let steps = 0;
    while (state.phase !== "finished" && steps < 400) {
      expect(canonicalJson(state)).toBe(reference(state));
      expect(canonicalJson(observe(state, "p1"))).toBe(
        reference(observe(state, "p1")),
      );
      const legal = getLegalActions(state, state.activePlayer);
      // The last offered action tends to be the one that does something.
      const chosen = legal[legal.length - 1]!;
      state = applyAction(state, { ...chosen, revision: state.revision }).state;
      steps += 1;
    }
    expect(steps).toBeGreaterThan(50);
    expect(canonicalJson(state)).toBe(reference(state));
  });

  it("digests the same whichever SHA-256 the runtime supplies", () => {
    // Under Node the hash is the platform's; everywhere else it is the
    // JavaScript one. Every recorded trace compares against these values, so
    // the two must never be allowed to drift.
    const state = createGame({
      gameId: "digest",
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
      seed: "digest-parity",
    });
    for (const text of ["", "a", "héllo ✓ 🏴‍☠️", canonicalJson(state)]) {
      expect(sha256Hex(text)).toBe(sha256HexPortable(text));
    }
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
