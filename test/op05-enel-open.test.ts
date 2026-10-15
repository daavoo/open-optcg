import { describe, expect, it } from "vitest";
import { deckManifests, deckShelf, loadDeck } from "@one-piece-sim/decks";

/**
 * The OP-05 Yellow Enel Open OPTCG list.
 *
 * Every card it plays is driven by another deck's or set's tests: the Leader
 * by `op05.test.ts`, the Big Mom Pirates by the Linlin feature deck's, and the
 * Life cards by the OP-16 Nami and EB-01 suites.
 */

const LIST = "(Yellow) Enel - Open OPTCG";

describe("the Yellow Enel Open OPTCG list", () => {
  it("is a legal 50 under the OP05-098 Leader, shelved under Community", () => {
    expect(loadDeck(LIST)).toHaveLength(50);
    expect(deckManifests[LIST]?.leader).toBe("OP05-098");
    expect(deckShelf(LIST)).toBe("tournament");
  });
});
