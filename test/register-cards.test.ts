import { describe, expect, it } from "vitest";
import { cards, registerCards, type CardRecord } from "@one-piece-sim/cards";
import { resolveDeck, STARTER_DECK_IDS } from "@one-piece-sim/decks";
import { GameService } from "@one-piece-sim/engine-core";

/**
 * `registerCards` is how an app built on the published engine adds cards the
 * engine does not ship. The card here is the host's own: a vanilla body with
 * `[Blocker]`, the one kind of clause that needs no engine code to run.
 */
const hostBlocker: CardRecord = {
  cardNumber: "HOST-001",
  name: "Host Blocker",
  category: "character",
  cost: 1,
  power: 3000,
  counter: 1000,
  colors: ["Red"],
  types: ["Host"],
  attribute: "Strike",
  effect: "[Blocker]",
  trigger: "",
};

describe("registerCards", () => {
  registerCards([hostBlocker]);

  it("derives a registered card's rules the way the audit does", () => {
    expect(cards.require("HOST-001").rules.keywords).toEqual(["Blocker"]);
  });

  it("refuses a card number the engine already ships", () => {
    const deck = resolveDeck(STARTER_DECK_IDS[0]);
    const shipped = deck.cards[0]!;
    const before = cards.require(shipped);
    expect(() => {
      registerCards([{ ...hostBlocker, cardNumber: shipped }]);
    }).toThrow(`CARD_ALREADY_SHIPPED: ${shipped}`);
    expect(cards.require(shipped)).toBe(before);
  });

  it("plays a registered card through GameService, Blocker included", () => {
    const opponent = resolveDeck(STARTER_DECK_IDS[0]);
    const host = {
      ...opponent,
      cards: opponent.cards.map((card, index) =>
        index < 8 ? "HOST-001" : card,
      ),
    };
    let plays = 0;
    let blocks = 0;
    for (const seed of ["register-a", "register-b"]) {
      const service = new GameService();
      let view = service.create({ p1: host, p2: opponent, seed });
      for (let step = 0; view.phase !== "finished" && step < 5000; step++) {
        const hostAction = view.legalActions.find(
          (action) =>
            (action.type === "play-card" || action.type === "block") &&
            action.summary.includes("Host Blocker"),
        );
        if (hostAction?.type === "play-card") plays++;
        if (hostAction?.type === "block") blocks++;
        const action = hostAction ?? view.legalActions[0]!;
        view = service.act(view.gameId, view.revision, action.actionId);
      }
      expect(view.phase).toBe("finished");
    }
    expect(plays).toBeGreaterThan(0);
    expect(blocks).toBeGreaterThan(0);
  });
});
