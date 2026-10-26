import { describe, expect, it } from "vitest";
import {
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
 * Each Leader's best-measured build, shipped as its Community list.
 *
 * Every card these lists play is driven in its set's card tests; what this
 * file holds is that each is the list the shelf and the picker expect: a
 * Standard-legal fifty on the Community shelf, its Leader's recommended list
 * over the product or feature deck that shares the Leader, which stays on its
 * own shelf unmarked.
 */
const LISTS: ReadonlyArray<readonly [list: string, other: string | null]> = [
  [
    "(Yellow) Monkey.D.Luffy - 1st Place Store Battle 2026-07-15",
    "(Yellow) Monkey.D.Luffy - Starter Deck 29",
  ],
  [
    "(Purple) Charlotte Katakuri - 1st Place Store Battle 2026-08-02",
    "(Purple) Charlotte Katakuri - Starter Deck 34",
  ],
  [
    "(Purple) Monkey.D.Luffy - 1st Place Store Battle 2025-07-01",
    "(Purple) Monkey.D.Luffy - Starter Deck 18",
  ],
  [
    "(Yellow) Eustass Kid - ChinoizeCup #104",
    "(Yellow) Eustass Kid - Starter Deck 36",
  ],
  [
    "(Green/Yellow) Shirahoshi - 3rd Place ChinoizeCup #125",
    "(Green/Yellow) Shirahoshi - Official Feature Deck",
  ],
  [
    "(Blue/Purple) Sanji - ChinoizeCup #116",
    "(Blue/Purple) Sanji - Official Feature Deck",
  ],
  [
    "(Green/Yellow) Yamato - 1st Place Pirates Party 2026-09-20",
    "(Green/Yellow) Yamato - Official Feature Deck",
  ],
  ["(Yellow) Vegapunk - 1st Place Store Battle 2026-06-19", null],
  [
    "(Red) Shanks - 1st Place Store Battle 2026-06-29",
    "(Red) Shanks - Starter Deck 23",
  ],
  [
    "(Red/Purple) Gol.D.Roger - 1st Place OPTCGSim 2026-04-22",
    "(Red/Purple) Gol.D.Roger - Official Feature Deck",
  ],
  [
    "(Red/Blue) Nefeltari Vivi - 1st Place Store Battle 2026-05-28",
    "(Red/Blue) Nefeltari Vivi - Official Feature Deck",
  ],
  [
    "(Purple) Donquixote Doflamingo - 1st Place Store Battle 2026-01-30",
    "(Purple) Donquixote Doflamingo - Official Feature Deck",
  ],
  [
    "(Black/Yellow) Koala - 30th Place ChinoizeCup #113",
    "(Black/Yellow) Koala - Official Feature Deck",
  ],
  [
    "(Black/Yellow) Gecko Moria - 5th Place ChinoizeCup #120",
    "(Black/Yellow) Gecko Moria - Official Feature Deck",
  ],
  [
    "(Green) Shanks - 16th Place Rumble League #9",
    "(Green) Shanks - Official Feature Deck",
  ],
  ["(Purple) Enel - 1st Place Store Battle 2026-04-11", null],
  [
    "(Red) Silvers Rayleigh - 4th Place ChinoizeCup #124",
    "(Red) Silvers Rayleigh - Official Feature Deck",
  ],
  [
    "(Red/Yellow) Jewelry Bonney - 13th Place ChinoizeCup #104",
    "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
  ],
  [
    "(Blue) Jinbe - 11th Place ChinoizeCup #120",
    "(Blue) Jinbe - Official Feature Deck",
  ],
  [
    "(Red/Blue) Portgas.D.Ace - 1st Place OPTCGSim 2026-06-01",
    "(Red/Blue) Portgas.D.Ace - Official Feature Deck",
  ],
  ["(Yellow) Enel - TCG Match Making OP17.5 #3", null],
  [
    "(Green/Purple) Monkey.D.Luffy - 1st Place Store Championship 2026-04-25",
    "(Green/Purple) Monkey.D.Luffy - Official Feature Deck",
  ],
];

describe.each(LISTS)("%s", (list, other) => {
  const manifest = deckManifests[list]!;

  it("is a Standard-legal 50 on the Community shelf", () => {
    expect(SELECTABLE_DECK_IDS).toContain(list);
    expect(loadDeck(list)).toHaveLength(50);
    expect(validateDeck(manifest)).toEqual({
      cardCount: 50,
      format: "standard",
      errors: [],
    });
    expect(deckShelf(list)).toBe("tournament");
  });

  it("is the list the app offers for its Leader", () => {
    expect(isRecommendedDeck(list)).toBe(true);
    expect(recommendedDeckFor(manifest.leader)).toBe(list);
    if (other) {
      expect(deckManifests[other]?.leader).toBe(manifest.leader);
      expect(deckShelf(other)).not.toBe("tournament");
      expect(isRecommendedDeck(other)).toBe(false);
    }
  });
});

describe("the Community lists the new builds replace", () => {
  // Three Leaders already had a Community list, and a shelf with two lists of
  // one Leader would be two identical tiles. The old lists leave the catalog
  // and stay training lists under their ids, which the meta field,
  // checkpoints and their variants name.
  it.each([
    ["(Purple) Enel - 1st Place EU Championship 26-27 S1", "OP15-058"],
    ["(Yellow) Vegapunk - 1st Place Store Battle", "OP07-097"],
    ["(Yellow) Enel - Open OPTCG", "OP05-098"],
  ])("keeps %s as a training-only list", (id, leader) => {
    expect(SELECTABLE_DECK_IDS).not.toContain(id);
    expect(deckManifests[id]).toBeUndefined();
    const manifest = trainingManifest(id)!;
    expect(manifest.leader).toBe(leader);
    expect(validateDeck(manifest).errors).toEqual([]);
  });
});
