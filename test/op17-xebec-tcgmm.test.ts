import { describe, expect, it } from "vitest";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";

/**
 * The TCG Match Making EB05 Blue Rocks D. Xebec list, the Community list
 * behind OP17-039.
 *
 * Every identity in it is driven elsewhere: the feature deck's tests cover the
 * OP-17 cards, `test/op17-clauses.test.ts` and `test/op17-xebec.test.ts`
 * cover OP08-051 Buckin, and the EB-05 card tests cover EB05-028 Boa Hancock:
 * the two cards the feature deck does not run.
 */

const LIST = "(Blue) Rocks.D.Xebec - TCG Match Making EB05 2026-11-12 #1";

describe("the TCG Match Making EB05 Xebec list", () => {
  it("is a legal 50 under the OP17-039 Leader, shelved under Community", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP17-039");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});
