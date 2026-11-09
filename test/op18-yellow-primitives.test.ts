import { describe, expect, it } from "vitest";
import { executeMechanicProgram } from "@one-piece-sim/engine-core";

import { character, instance, scenario } from "./support/index.js";

/**
 * `activate-trigger`, the node OP18-105 Spandam's [Trigger] runs another
 * card's [Trigger] through. The card-level case is in `op18-yellow.test.ts`;
 * these pin the node itself.
 */
const position = (seed: string) =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP18-079")
    .withBoard("p2", [character("target", "OP18-102")])
    .withHand("p1", [
      instance("kaku", "OP18-099"),
      instance("vanilla", "OP08-099"),
    ])
    .withDeckTop("p1", [
      instance("drawn", "OP08-099"),
      instance("next", "OP08-099"),
    ])
    .build().state;

const run = (seed: string, target: string) => {
  const state = position(seed);
  const result = executeMechanicProgram(
    state,
    {
      sourcePlayerId: "p1",
      source: { instanceId: "asker", cardNumber: "OP18-105" },
    },
    {
      effect: {
        kind: "select",
        selector: { player: "self", zone: "hand", binding: "picked" },
        bind: "picked",
        count: "all",
        effect: { kind: "activate-trigger", binding: "picked" },
      },
    },
    undefined,
    { picked: [target] },
  );
  return { state, result };
};

describe("activate-trigger", () => {
  it("runs the bound card's [Trigger] with that card as its source, leaving it in hand", () => {
    const { state, result } = run("activate-trigger-runs", "kaku");

    // OP18-099's Trigger draws first, then stops at its removal choice.
    expect(state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "kaku",
      "vanilla",
      "drawn",
    ]);
    expect(result.pending).not.toBeNull();
    expect(result.signals).toContainEqual({
      kind: "trigger-activated",
      playerId: "p1",
    });
  });

  it("does nothing for a card with no [Trigger] program", () => {
    const { state, result } = run("activate-trigger-vanilla", "vanilla");

    expect(state.players.p1.hand).toHaveLength(2);
    expect(result.pending).toBeNull();
    expect(result.signals).toEqual([]);
  });
});
