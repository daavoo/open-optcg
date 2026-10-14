import { describe, expect, it } from "vitest";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";

/**
 * The OP-17 Blue Rocks D. Xebec Open OPTCG list.
 *
 * Every identity in it is driven elsewhere: the feature deck's tests cover the
 * OP-17 cards, and `test/op17-clauses.test.ts` and `test/op17-xebec.test.ts`
 * cover OP08-051 Buckin, the one card the feature deck does not run.
 */

const LIST = "(Blue) Rocks.D.Xebec - Open OPTCG";

describe("the Blue Xebec Open OPTCG list", () => {
  it("is a legal 50 under the OP17-039 Leader, shelved under Meta", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP17-039");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});
