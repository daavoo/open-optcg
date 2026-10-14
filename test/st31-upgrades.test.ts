import { describe, expect, it } from "vitest";
import { cardFacts, requireKnownCard } from "@one-piece-sim/cards";
import {
  createOnKoResult,
  currentPower,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { character, scenario } from "./support/index.js";

/**
 * Written against `test/support` -- the builder reaches turn 3 and turn 4 by
 * passing, so "only on its controller's turn" is checked against two positions
 * a real game produces rather than by reassigning `activePlayer`.
 */
function board(cardNumber: string, turn: number): GameState {
  return scenario()
    .decks("(Red) Monkey.D.Luffy - Starter Deck 31", "FIXTURE-BLUE")
    .seed("st31-upgrades-seed")
    .atTurn(turn)
    .withBoard("p1", [character("upgrade", cardNumber)])
    .build().state;
}

const P1_TURN = 3;
const P2_TURN = 4;

describe("ST31 online upgrade card support", () => {
  it("registers Zoro as a playable Straw Hat with Rush", () => {
    const zoro = requireKnownCard("OP01-025");

    expect(zoro.types).toContain("Straw Hat Crew");
    expect(cardFacts("OP01-025").keywords).toContain("Rush");
  });

  it("applies Sanji's power only on its controller's turn", () => {
    expect(
      currentPower(board("OP10-005", P1_TURN), "p1", "upgrade", false),
    ).toBe(6000);
    expect(
      currentPower(board("OP10-005", P2_TURN), "p1", "upgrade", false),
    ).toBe(3000);
  });

  it("draws exactly one card when Sanji is K.O.'d", () => {
    const state = board("OP10-005", P1_TURN);
    const handCount = state.players.p1.hand.length;

    const result = createOnKoResult(
      state,
      "p1",
      { instanceId: "upgrade", cardNumber: "OP10-005" },
      "p2",
    );

    expect(result.pending).toBeNull();
    expect(state.players.p1.hand).toHaveLength(handCount + 1);
  });

  it("makes Chopper a 6k blocker only on the opponent's turn", () => {
    const ownTurn = board("OP10-011", P1_TURN);
    expect(hasKeyword(ownTurn, "p1", "upgrade", "Blocker")).toBe(true);
    expect(currentPower(ownTurn, "p1", "upgrade", false)).toBe(4000);

    expect(
      currentPower(board("OP10-011", P2_TURN), "p1", "upgrade", false),
    ).toBe(6000);
  });
});
