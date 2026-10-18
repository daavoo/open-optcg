import { describe, expect, it } from "vitest";
import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Cards placed at the bottom of a deck "in any order" are ordered by their
 * owner.
 *
 * Bandai's OP-05 Q&A rules it for OP05-058 It's a Waste of Human Life!!,
 * which buries both sides' Characters: each owner orders their own, the turn
 * player first (`test/faq-op05.test.ts`, OP05-058#2). OP17-041 Wang Zhi
 * prints the same for the opponent's Characters it buries.
 */

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

/** The cards the open `order-to-bottom` offer lists, in its order. */
const orderOffer = (game: Game): string[] => {
  const offer = game
    .legalActions()
    .find(
      (action) =>
        action.type === "resolve-effect" && action.option.kind === "order",
    );
  if (offer?.type !== "resolve-effect" || offer.option.kind !== "order") {
    throw new Error("no order to choose");
  }
  return offer.option.cards.map((card) => card.instanceId);
};

/** Submits the open order offer with its cards in `order`. */
const reorder = (game: Game, order: string): void => {
  const offer = game
    .legalActions()
    .find(
      (action) =>
        action.type === "resolve-effect" && action.option.kind === "order",
    );
  if (!offer || offer.type !== "resolve-effect") {
    throw new Error("no order to choose");
  }
  game.submit({
    ...offer,
    actionId: offer.actionId.replace(/order:[\d,]+$/, order),
    optionId: order,
  });
};

describe("the owner orders the cards placed under their deck", () => {
  it("OP17-041 Wang Zhi's opponent orders their own Characters", () => {
    // OP17-094 Rodo and FIX-001 both print cost 1, and are different cards,
    // so the order is a real decision.
    const game = scenario()
      .decks("FIXTURE-RED", "FIXTURE-BLUE")
      .seed("bottom-order-wang-zhi")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("wang", "OP17-041"),
        instance("spare", "FIX-002"),
      ])
      .withBoard("p2", [
        character("rodo", "OP17-094"),
        character("small", "FIX-001"),
      ])
      .withDeckTop("p2", copies(2, "FIX-002", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-041" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "spare" });

    expect(game.player).toBe("p2");
    expect(orderOffer(game)).toEqual(["rodo", "small"]);
    reorder(game, "order:1,0");

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.deck).slice(-2)).toEqual([
      "small",
      "rodo",
    ]);
  });
});
