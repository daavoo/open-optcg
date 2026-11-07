import { describe, expect, it } from "vitest";
import {
  deckDisplayName,
  deckManifests,
  deckShelf,
  isRecommendedDeck,
  loadDeck,
  recommendedDeckFor,
  SELECTABLE_DECK_IDS,
  validateDeck,
} from "@one-piece-sim/decks";
import { trainingManifest } from "../ml/bridge/decks.js";

/**
 * The Miracle Luffy EB05 list, the Community list under OP13-001.
 *
 * Every card it plays is driven in its set's card tests already; what this
 * file holds is that the list sits where the shelf and the picker expect: a
 * Standard-legal fifty on the Community shelf, the one list the app offers for
 * the Leader, named without the counter a second list on one shelf would get.
 * The Open OPTCG list it replaced is a training list under its old id.
 */

const LIST = "(Red/Green) Monkey.D.Luffy - Miracle Luffy EB05";
const REPLACED = "(Red/Green) Monkey.D.Luffy - Open OPTCG";
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

  it("is the one list the app offers for the Leader", () => {
    expect(isRecommendedDeck(LIST)).toBe(true);
    expect(recommendedDeckFor(LEADER)).toBe(LIST);
    expect(
      SELECTABLE_DECK_IDS.filter((id) => deckManifests[id]?.leader === LEADER),
    ).toEqual([LIST]);
  });

  it("is named by its Leader alone on the shelf", () => {
    expect(deckDisplayName(LIST)).toBe("Monkey.D.Luffy (Red/Green)");
  });

  it("leaves the Open OPTCG list a training list under its id", () => {
    expect(deckManifests[REPLACED]).toBeUndefined();
    expect(trainingManifest(REPLACED)?.leader).toBe(LEADER);
  });
});
