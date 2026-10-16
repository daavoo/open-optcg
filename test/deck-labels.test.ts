import { describe, expect, it } from "vitest";
import { deckManifests } from "@one-piece-sim/decks";
import {
  deckAccent,
  deckChip,
  deckLabel,
  deckShortName,
  deckLeaderLine,
  deckLeaderName,
  deckManifestFor,
  leaderColors,
  type SavedDeck,
} from "../packages/web/src/deck-labels.js";

const savedDecks: Record<string, SavedDeck> = {
  "CUSTOM-1": {
    name: "My Zoro deck",
    deck: deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
  },
};

describe("deck labels", () => {
  it("resolves a saved deck's manifest before falling back to the format list", () => {
    expect(deckManifestFor("CUSTOM-1", savedDecks)).toBe(
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"],
    );
    expect(deckManifestFor("(Red) Monkey.D.Luffy - Starter Deck 31", {})).toBe(
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"],
    );
    expect(deckManifestFor("CUSTOM-unknown", {})).toBeUndefined();
  });

  it("labels a saved deck by its name, a format deck by its id", () => {
    expect(deckLabel("CUSTOM-1", savedDecks)).toBe("My Zoro deck");
    expect(deckLabel("(Red) Monkey.D.Luffy - Starter Deck 31", {})).toBe(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
  });

  it("falls back to the leader's name, or 'Custom deck', for an unnamed custom deck", () => {
    expect(deckLabel("CUSTOM-unknown", {})).toBe("Custom deck");
  });

  it("reads the leader's name and card line from the resolved manifest", () => {
    const leader =
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!.leader;
    expect(deckLeaderName("CUSTOM-1", savedDecks)).not.toBe("—");
    expect(deckLeaderLine("CUSTOM-1", savedDecks)).toContain(leader);
    expect(deckLeaderLine("CUSTOM-unknown", {})).toBe("No deck");
  });

  it("says which constructed format a shipped list is built for", () => {
    // Every shipped list is Standard now, and the leader line is where a
    // player reads that rather than assuming it. A saved deck built for Extra
    // says so in the same place.
    expect(deckLeaderLine("(Red/Black) Sabo - OP17 Elbaph List", {})).toContain(
      "Standard",
    );
    expect(
      deckLeaderLine("CUSTOM-extra", {
        "CUSTOM-extra": {
          name: "Extra brew",
          deck: {
            id: "CUSTOM-extra",
            leader: "OP14-020",
            cards: { "OP01-055": 4 },
            format: "extra",
          },
        },
      }),
    ).toContain("Extra");
  });

  it("accents an unresolvable deck as neutral", () => {
    expect(deckAccent("CUSTOM-unknown", {})).toBe("neutral");
    expect(deckAccent("(Red) Monkey.D.Luffy - Starter Deck 31", {})).not.toBe(
      "neutral",
    );
  });

  it("renders a chip with the escaped label as its title", () => {
    const chip = deckChip("CUSTOM-1", savedDecks);
    expect(chip).toContain("My Zoro deck");
    expect(chip).toContain('<span class="deck-chip"');
  });

  it("shortens a deck to its starter number or its Leader, for a chip", () => {
    expect(deckShortName("(Red) Monkey.D.Luffy - Starter Deck 31", {})).toBe(
      "ST31",
    );
    expect(deckShortName("(Purple) Enel - Official Feature Deck", {})).toBe(
      "Enel",
    );
    expect(deckShortName("CUSTOM-1", savedDecks)).toBe("My Zoro deck");
    // The full name is still there, as the chip's tooltip.
    const chip = deckChip("(Purple) Enel - Official Feature Deck", {});
    expect(chip).toContain(
      'title="(Purple) Enel - Official Feature Deck">Enel<',
    );
  });

  it("names the deck by its own colours, red as the shared fallback", () => {
    expect(
      leaderColors(deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!)[0],
    ).not.toBe("");
    const [primary, secondary] = leaderColors(
      deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!,
    );
    expect(primary).toBeTruthy();
    expect(secondary).toBeTruthy();
  });
});
