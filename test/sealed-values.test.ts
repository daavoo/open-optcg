import { describe, expect, it } from "vitest";
import { cardRegistry } from "@one-piece-sim/cards";
import {
  autoBuildSealedDeckBest,
  autoBuildSealedDeckGrape,
  hasSealedCardValues,
  openPacks,
  playablePoolCards,
  rankSealedPoolCandidatesValue,
  validateSealedDeck,
  SEALED_CARD_VALUES,
  SEALED_DECK_SIZE,
} from "@one-piece-sim/decks";

const values = SEALED_CARD_VALUES.OP18!;
const count = (deck: Record<string, number>) =>
  Object.values(deck).reduce((sum, copies) => sum + copies, 0);

describe("the value-ranked sealed builder", () => {
  it("values only OP-18 cards that are in the registry and are not Leaders", () => {
    for (const cardNumber of Object.keys(values)) {
      expect(cardNumber.startsWith("OP18-")).toBe(true);
      expect(cardRegistry.get(cardNumber)?.category).not.toBe("leader");
    }
  });

  it("builds a legal 40 from every OP-18 pool", () => {
    for (let index = 0; index < 25; index += 1) {
      const pool = openPacks(`values-${index}`, 6, "OP18");
      const deck = autoBuildSealedDeckBest(pool);
      expect(count(deck.cards)).toBe(SEALED_DECK_SIZE);
      expect(validateSealedDeck(deck, pool).errors).toEqual([]);
    }
  });

  it("keeps the pool's highest-valued copies and cuts the lowest", () => {
    const pool = openPacks("values-order", 6, "OP18");
    const deck = autoBuildSealedDeckBest(pool);
    const ranked = rankSealedPoolCandidatesValue(pool);
    const kept = ranked.slice(0, SEALED_DECK_SIZE);
    const cut = ranked.slice(SEALED_DECK_SIZE);
    const worstKept = Math.min(...kept.map((c) => values[c.cardNumber] ?? 0));
    for (const candidate of cut)
      expect(values[candidate.cardNumber] ?? 0).toBeLessThanOrEqual(worstKept);
    const best = [...playablePoolCards(pool).keys()].sort(
      (a, b) => (values[b] ?? 0) - (values[a] ?? 0),
    )[0]!;
    expect(deck.cards[best]).toBeGreaterThan(0);
  });

  it("builds an expansion with no values table by GRAPE", () => {
    expect(hasSealedCardValues("OP17")).toBe(false);
    const pool = openPacks("values-op17", 6, "OP17");
    expect(autoBuildSealedDeckBest(pool)).toEqual(
      autoBuildSealedDeckGrape(pool),
    );
  });
});
