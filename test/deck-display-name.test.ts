import { describe, expect, it } from "vitest";
import {
  deckDisplayName,
  deckManifests,
  deckShelf,
  nameDeckLists,
  SELECTABLE_DECK_IDS,
} from "@one-piece-sim/decks";

const HANCOCK_FEATURE = "(Blue/Yellow) Boa Hancock - Official Feature Deck";
const HANCOCK_CUP = "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105";

describe("deckDisplayName", () => {
  it("names a shipped list by its Leader and the Leader's colours", () => {
    expect(deckDisplayName(HANCOCK_CUP)).toBe("Boa Hancock (Blue/Yellow)");
    expect(deckDisplayName("(Yellow) Enel - Open OPTCG")).toBe("Enel (Yellow)");
    expect(deckDisplayName("(Red/Black) Sabo - Starter Deck 35")).toBe(
      "Sabo (Red/Black)",
    );
  });

  it("gives two lists behind one Leader on different shelves the same name", () => {
    // The shelf tells them apart; an origin in the name would go stale the
    // day the recommended list is replaced.
    expect(deckShelf(HANCOCK_FEATURE)).not.toBe(deckShelf(HANCOCK_CUP));
    expect(deckDisplayName(HANCOCK_FEATURE)).toBe(deckDisplayName(HANCOCK_CUP));
  });

  it("numbers a second list behind one Leader on one shelf, recommended first", () => {
    const leader = deckManifests[HANCOCK_CUP]!.leader;
    const names = nameDeckLists([
      { id: "a", leader, shelf: "tournament" },
      { id: "b", leader, shelf: "tournament", recommended: true },
      { id: "c", leader, shelf: "tournament" },
      { id: "d", leader, shelf: "official" },
    ]);
    expect(names.get("b")).toBe("Boa Hancock (Blue/Yellow)");
    expect(names.get("a")).toBe("Boa Hancock (Blue/Yellow) (2)");
    expect(names.get("c")).toBe("Boa Hancock (Blue/Yellow) (3)");
    expect(names.get("d")).toBe("Boa Hancock (Blue/Yellow)");
  });

  it("never shows two shipped tiles with one name on one shelf", () => {
    const seen = new Set<string>();
    for (const deckId of SELECTABLE_DECK_IDS) {
      const key = `${deckShelf(deckId)}|${deckDisplayName(deckId)}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("falls back to the id for a deck that is not a shipped list", () => {
    expect(deckDisplayName("CUSTOM-1")).toBe("CUSTOM-1");
    expect(deckDisplayName("FIXTURE-RED")).toBe("FIXTURE-RED");
  });
});
