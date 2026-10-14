import { describe, expect, it } from "vitest";
import {
  deckManifests,
  deckShelf,
  SELECTABLE_DECK_IDS,
} from "@one-piece-sim/decks";
import {
  deckLabel,
  deckPickerDialog,
  selectField,
} from "../packages/web/src/deck-select.js";
import { escapeHtml } from "../packages/web/src/card-text.js";
import {
  deckDisplayName,
  type SavedDeck,
} from "../packages/web/src/deck-labels.js";

/**
 * Where the picker prints a deck's tile, by the same escaping the renderer uses.
 *
 * `data-deck-id` is an HTML attribute, so a deck id containing `&` -- both of
 * the "Luffy & Ace" lists -- is written as `&amp;` and a raw `indexOf` of the
 * id never matches. That is not a near miss: `indexOf` returns -1, and a
 * `slice(0, -1)` is the whole document, so the shelf lookup below silently
 * reported the *last* heading for every such deck.
 */
const tileIndex = (html: string, deckId: string): number => {
  const at = html.indexOf(`data-deck-id="${escapeHtml(deckId)}"`);
  if (at < 0) throw new Error(`No tile for ${deckId}`);
  return at;
};

const LUFFY_ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const KID_ST36 = "(Yellow) Eustass Kid - Starter Deck 36";

const savedDecks: Record<string, SavedDeck> = {
  "CUSTOM-1": { name: "MyST31", deck: deckManifests[LUFFY_ST31]! },
};

describe("deck labels in the picker and the selects", () => {
  it("does not repeat a Leader the deck id already names", () => {
    // Every format deck id carries its Leader, so the suffix that a custom
    // deck needs was printing it twice: "... Starter Deck 31 · Monkey.D.Luffy".
    expect(deckLabel({}, LUFFY_ST31)).toBe(LUFFY_ST31);
    for (const deckId of SELECTABLE_DECK_IDS) {
      expect(deckLabel({}, deckId)).toBe(deckDisplayName(deckId));
    }
  });

  it("shortens a tournament list's placing and event", () => {
    // The two words a placing id can lose without losing a distinction: on
    // the Meta shelf an ordinal is already a placing, and the event is
    // named by where and when it was held.
    expect(
      deckLabel({}, "(Purple) Enel - 1st Place EU Championship 26-27 S1"),
    ).toBe("(Purple) Enel - 1st EU 26-27 S1");
    expect(
      deckLabel(
        {},
        "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1",
      ),
    ).toBe("(Green) Dracule Mihawk - 3rd EU 26-27 S1");
    // A tournament list whose id carries no placing keeps every word: both
    // substitutions are about a placing suffix, and there is nothing here to
    // shorten.
    const elbaph = "(Red/Black) Sabo - OP17 Elbaph List";
    expect(deckShelf(elbaph)).toBe("tournament");
    expect(deckDisplayName(elbaph)).toBe(elbaph);
  });

  it("matches a Leader whose printed name is punctuated differently", () => {
    // The id says "Eustass Kid"; the card is printed `Eustass"Captain"Kid`.
    expect(deckLabel({}, KID_ST36)).toBe(KID_ST36);
  });

  it("still names the Leader for a deck whose own name does not", () => {
    expect(deckLabel(savedDecks, "CUSTOM-1")).toBe("MyST31 · Monkey.D.Luffy");
  });

  it("labels a deck it cannot resolve by its id alone", () => {
    expect(deckLabel({}, "CUSTOM-gone")).toBe("CUSTOM-gone");
  });

  it("prints the same label in the select as on the tiles", () => {
    const html = selectField(savedDecks, "p1-deck", "Your deck", LUFFY_ST31);
    expect(html).toContain(`>${LUFFY_ST31}</option>`);
    expect(html).toContain(">MyST31 · Monkey.D.Luffy</option>");
  });
});

describe("deleting a saved deck from the picker", () => {
  it("offers a bin on a deck the player saved, and on no other", () => {
    const html = deckPickerDialog(savedDecks, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    expect(html).toContain('data-delete-deck="CUSTOM-1"');
    expect(html).not.toContain(`data-delete-deck="${LUFFY_ST31}"`);
  });

  it("offers none at all where the seat cannot play a deck of the player's own", () => {
    // The LLM seat pilots only decks it has a dossier for, so its grid lists
    // no saved deck to delete and reaches nothing that could edit one.
    const html = deckPickerDialog(savedDecks, "p2", "Opponent deck", KID_ST36, {
      deckIds: [KID_ST36],
      offerBuilder: false,
    });
    expect(html).not.toContain("data-delete-deck");
    expect(html).not.toContain("deck-tile-edit");
  });
});

describe("the shelves the picker groups decks into", () => {
  const shelfOf = (html: string, deckId: string): string => {
    // Which shelf the tile sits on: the last one opened before it.
    const before = html.slice(0, tileIndex(html, deckId));
    const marker = 'data-shelf-label="';
    const at = before.lastIndexOf(marker) + marker.length;
    return before.slice(at, before.indexOf('"', at));
  };

  it("puts the decks the player saved above every shipped one", () => {
    const html = deckPickerDialog(savedDecks, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    expect(html.indexOf("Your decks")).toBeLessThan(
      html.indexOf('data-shelf-label="Official Featured"'),
    );
    expect(shelfOf(html, "CUSTOM-1")).toBe("Your decks");
    expect(html.indexOf('data-deck-id="CUSTOM-1"')).toBeLessThan(
      html.indexOf(`data-deck-id="${LUFFY_ST31}"`),
    );
  });

  it("heads the empty slot with the player's own shelf when they have no decks", () => {
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    expect(html.indexOf("Your decks")).toBeLessThan(
      html.indexOf("deck-tile-builder"),
    );
  });

  it("shelves every shipped deck by where its list came from", () => {
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const labels = {
      official: "Official Featured",
      starter: "Starters",
      tournament: "Meta",
    };
    for (const deckId of SELECTABLE_DECK_IDS) {
      expect(shelfOf(html, deckId)).toBe(labels[deckShelf(deckId)]);
    }
  });

  it("orders the starter shelf by product number, not by string", () => {
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const starters = SELECTABLE_DECK_IDS.filter(
      (deckId) => deckShelf(deckId) === "starter",
    );
    const order = [...starters].sort(
      (left, right) => tileIndex(html, left) - tileIndex(html, right),
    );
    expect(order.map((deckId) => deckId.slice(-2))).toEqual([
      "18",
      "22",
      "23",
      "26",
      "27",
      "29",
      "30",
      "31",
      "32",
      "33",
      "34",
      "35",
      "36",
    ]);
  });

  it("orders the official shelf by the feature page's own posting date", () => {
    // The shelf is Bandai's feature-deck index, and that index is read newest
    // first: the deck a player has just seen announced is the one they came
    // looking for. Within one posting date the page prints its batch by
    // ascending `deck_NNN`, and so does the shelf.
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const official = SELECTABLE_DECK_IDS.filter(
      (deckId) => deckShelf(deckId) === "official",
    );
    const order = [...official].sort(
      (left, right) => tileIndex(html, left) - tileIndex(html, right),
    );
    const stamps = order.map((deckId) => deckManifests[deckId]?.featuredOn);
    expect(stamps.filter(Boolean)).toHaveLength(34);
    for (const [index, entry] of stamps.entries()) {
      const next = stamps[index + 1];
      if (!next) continue;
      // A list of our own carries no entry, and every one of them sits after
      // every transcribed deck rather than interleaving with them.
      expect(entry).toBeDefined();
      expect(
        entry!.posted === next.posted
          ? entry!.page < next.page
          : entry!.posted > next.posted,
      ).toBe(true);
    }
  });

  it("puts a list we built ourselves after every transcribed one", () => {
    // Four decks on this shelf were read from a tournament list or a Champion
    // decklist rather than from the feature page, so there is no posting date
    // to sort them by and none is borrowed from the page's entry for the same
    // Leader -- that is a different fifty cards.
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const undated = SELECTABLE_DECK_IDS.filter(
      (deckId) =>
        deckShelf(deckId) === "official" && !deckManifests[deckId]?.featuredOn,
    );
    const dated = SELECTABLE_DECK_IDS.filter(
      (deckId) =>
        deckShelf(deckId) === "official" && deckManifests[deckId]?.featuredOn,
    );
    expect(undated).toHaveLength(4);
    const lastDated = Math.max(...dated.map((id) => tileIndex(html, id)));
    for (const deckId of undated) {
      expect(tileIndex(html, deckId)).toBeGreaterThan(lastDated);
    }
  });

  it("shelves a list that placed at an event first among the shipped decks", () => {
    // The placing in the id is what puts a list on this shelf: it is the
    // claim a tournament list makes that a guide transcription does not.
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const euFinal = "(Purple) Enel - 1st Place EU Championship 26-27 S1";
    expect(deckShelf(euFinal)).toBe("tournament");
    expect(shelfOf(html, euFinal)).toBe("Meta");
    expect(html.indexOf("<h3>Your decks</h3>")).toBeLessThan(
      html.indexOf('data-shelf-label="Meta"'),
    );
    expect(html.indexOf('data-shelf-label="Meta"')).toBeLessThan(
      html.indexOf('data-shelf-label="Official Featured"'),
    );
    // The Mihawk list that placed 3rd at the same event sits on the shelf
    // too, after the list that won it: the shelf keeps its declared order,
    // and the ids are declared by placing.
    const euThird =
      "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1";
    expect(deckShelf(euThird)).toBe("tournament");
    expect(shelfOf(html, euThird)).toBe("Meta");
    expect(tileIndex(html, euFinal)).toBeLessThan(tileIndex(html, euThird));
    // A list transcribed from a tournament aggregator without a placing in
    // its id sits on the same shelf: it was read from an event too, and there
    // is no other shelf for a list that is neither a product nor Bandai's.
    const elbaph = "(Red/Black) Sabo - OP17 Elbaph List";
    expect(deckShelf(elbaph)).toBe("tournament");
    expect(shelfOf(html, elbaph)).toBe("Meta");
    expect(html.indexOf("Community Decks")).toBe(-1);
  });

  it("orders the two lists from the same final by their placing", () => {
    // Both are from the Europe Championship 26-27 Season 1 Final at Utrecht,
    // so the shelf reads as the standings of that event did: the list that
    // won it, then the one it beat. The order comes from `TOURNAMENT_DECK_IDS`
    // rather than from parsing the placing out of the id, which is why the
    // two entries are adjacent there.
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const first = "(Purple) Enel - 1st Place EU Championship 26-27 S1";
    const second =
      "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";

    expect(deckShelf(second)).toBe("tournament");
    expect(shelfOf(html, second)).toBe("Meta");
    expect(tileIndex(html, first)).toBeLessThan(tileIndex(html, second));
  });

  it("groups the select the same way, saved decks first", () => {
    const html = selectField(savedDecks, "p1-deck", "Your deck", LUFFY_ST31);
    expect(html.indexOf('<optgroup label="Your decks">')).toBeLessThan(
      html.indexOf('<optgroup label="Official Featured">'),
    );
    expect(html).not.toContain('<optgroup label="Your decks"></optgroup>');
  });

  it("keeps a dossier list's saved decks on the player's own shelf", () => {
    // The LLM seat is handed an explicit list that can name a saved deck; it
    // is still the player's deck, and belongs where their decks are.
    const html = deckPickerDialog(savedDecks, "p2", "Opponent deck", KID_ST36, {
      deckIds: ["CUSTOM-1", KID_ST36],
      offerBuilder: false,
    });
    expect(shelfOf(html, "CUSTOM-1")).toBe("Your decks");
    expect(shelfOf(html, KID_ST36)).toBe("Starters");
  });
});

describe("the shelf tabs", () => {
  const panelOf = (html: string, label: string): string => {
    const at = html.indexOf(`data-shelf-label="${label}"`);
    if (at < 0) throw new Error(`No panel for ${label}`);
    return html.slice(
      html.lastIndexOf("<section", at),
      html.indexOf("</section>", at),
    );
  };

  it("offers Meta, Official Featured and Starters, and opens on Meta", () => {
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map(
      (match) => match[1],
    );
    expect(tabs).toEqual(["Meta", "Official Featured", "Starters"]);
    expect(html).toMatch(
      /id="p1-deck-tab-meta" aria-controls="p1-deck-shelf-meta" aria-selected="true"/,
    );
    expect(panelOf(html, "Meta")).not.toMatch(/<section[^>]*hidden/);
    expect(panelOf(html, "Starters")).toMatch(/<section[^>]*hidden/);
    // The player's own shelf is not a tab: it stays in view above them.
    expect(html.indexOf("<h3>Your decks</h3>")).toBeLessThan(
      html.indexOf('role="tablist"'),
    );
  });

  it("gives every tab a filter of its own", () => {
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    for (const label of ["Meta", "Official Featured", "Starters"]) {
      expect(
        panelOf(html, label).match(/data-deck-filter-input/g),
      ).toHaveLength(1);
    }
  });

  it("filters on the Leader's colour and name as well as the label", () => {
    const html = deckPickerDialog(savedDecks, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    // A saved deck's name says nothing about its colour; the filter text does.
    const at = html.indexOf('data-deck-filter="myst31');
    expect(at).toBeGreaterThan(-1);
    const text = html.slice(at, html.indexOf('">', at));
    expect(text).toContain("red");
    expect(text).toContain(deckManifests[LUFFY_ST31]!.leader.toLowerCase());
  });

  it("drops a tab whose shelf is empty and opens on the first left", () => {
    const html = deckPickerDialog(savedDecks, "p2", "Opponent deck", KID_ST36, {
      deckIds: [KID_ST36],
      offerBuilder: false,
    });
    expect(html).not.toContain('id="p2-deck-tab-meta"');
    expect(html).toMatch(/id="p2-deck-tab-starter"[^>]*aria-selected="true"/);
  });
});
