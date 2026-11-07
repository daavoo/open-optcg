import { describe, expect, it } from "vitest";
import {
  deckDisplayName,
  deckManifests,
  deckShelf,
  isRecommendedDeck,
  loadDeck,
  recommendedDeckFor,
  validateDeck,
} from "@one-piece-sim/decks";

/**
 * The Miracle Luffy EB05 list, a second Community list under OP13-001.
 *
 * Every card it plays is driven in its set's card tests already; what this
 * file holds is that the list sits where the shelf and the picker expect: a
 * Standard-legal fifty on the Community shelf beside the Leader's Open OPTCG
 * list, which stays the one the app offers, with the two told apart by the
 * counter the display name gives a second list on one shelf.
 */

const LIST = "(Red/Green) Monkey.D.Luffy - Miracle Luffy EB05";
const RECOMMENDED = "(Red/Green) Monkey.D.Luffy - Open OPTCG";
const LEADER = "OP13-001";

describe("the Miracle Luffy EB05 list", () => {
  it("is a Standard-legal 50 under OP13-001 on the Community shelf", () => {
    const manifest = deckManifests[LIST]!;
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(manifest.leader).toBe(LEADER);
    expect(validateDeck(manifest)).toEqual({
      cardCount: 50,
      format: "standard",
      errors: [],
    });
    expect(deckShelf(LIST)).toBe("tournament");
  });

  it("leaves the Open OPTCG list as the one the app offers for the Leader", () => {
    expect(deckManifests[RECOMMENDED]?.leader).toBe(LEADER);
    expect(deckShelf(RECOMMENDED)).toBe("tournament");
    expect(isRecommendedDeck(LIST)).toBe(false);
    expect(isRecommendedDeck(RECOMMENDED)).toBe(true);
    expect(recommendedDeckFor(LEADER)).toBe(RECOMMENDED);
  });

  it("is named as the Leader's second list on the shelf", () => {
    expect(deckDisplayName(RECOMMENDED)).toBe("Monkey.D.Luffy (Red/Green)");
    expect(deckDisplayName(LIST)).toBe("Monkey.D.Luffy (Red/Green) (2)");
  });
});
