import { describe, expect, it } from "vitest";
import {
  deckDisplayName,
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
import type { SavedDeck } from "../packages/web/src/deck-labels.js";

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
  it("names a shipped deck by its Leader and colours, and only once", () => {
    // The name is the Leader's, so the Leader suffix a custom deck needs is
    // never added to it.
    expect(deckLabel({}, LUFFY_ST31)).toBe("Monkey.D.Luffy (Red)");
    for (const deckId of SELECTABLE_DECK_IDS) {
      expect(deckLabel({}, deckId)).toBe(deckDisplayName(deckId));
    }
  });

  it("names a Leader by its printed name, nickname and all", () => {
    expect(deckLabel({}, KID_ST36)).toBe('Eustass"Captain"Kid (Yellow)');
  });

  it("keeps a shipped list's origin as the tile's tooltip, and filters on it", () => {
    const enel =
      "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: false,
    });
    const tile = html.slice(tileIndex(html, enel));
    expect(tile).toMatch(/^[^>]*title="2nd Place EU Championship 26-27 S1"/);
    const wrap = html.lastIndexOf("data-deck-filter=", tileIndex(html, enel));
    expect(html.slice(wrap, html.indexOf(">", wrap))).toContain(
      "2nd place eu championship 26-27 s1",
    );
  });

  it("still names the Leader for a deck whose own name does not", () => {
    expect(deckLabel(savedDecks, "CUSTOM-1")).toBe("MyST31 · Monkey.D.Luffy");
  });

  it("labels a deck it cannot resolve by its id alone", () => {
    expect(deckLabel({}, "CUSTOM-gone")).toBe("CUSTOM-gone");
  });

  it("prints the same label in the select as on the tiles", () => {
    const html = selectField(savedDecks, "p1-deck", "Your deck", LUFFY_ST31);
    expect(html).toContain(`>Monkey.D.Luffy (Red)</option>`);
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
    // A grid narrowed to a fixed list lists no saved deck to delete and
    // reaches nothing that could edit one.
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
      tournament: "Community",
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
    const euFinal =
      "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";
    expect(deckShelf(euFinal)).toBe("tournament");
    expect(shelfOf(html, euFinal)).toBe("Community");
    expect(html.indexOf("<h3>Your decks</h3>")).toBeLessThan(
      html.indexOf('data-shelf-label="Community"'),
    );
    expect(html.indexOf('data-shelf-label="Community"')).toBeLessThan(
      html.indexOf('data-shelf-label="Official Featured"'),
    );
    // The Mihawk list that placed 3rd at the same event sits on the shelf
    // too, after the one that placed 2nd: the shelf keeps its declared order,
    // and the ids are declared by placing.
    const euThird =
      "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1";
    expect(deckShelf(euThird)).toBe("tournament");
    expect(shelfOf(html, euThird)).toBe("Community");
    expect(tileIndex(html, euFinal)).toBeLessThan(tileIndex(html, euThird));
    // A list transcribed from a tournament aggregator without a placing in
    // its id sits on the same shelf: it was read from an event too, and there
    // is no other shelf for a list that is neither a product nor Bandai's.
    const elbaph = "(Red/Black) Sabo - OP17 Elbaph List";
    expect(deckShelf(elbaph)).toBe("tournament");
    expect(shelfOf(html, elbaph)).toBe("Community");
    expect(html.indexOf("Community Decks")).toBe(-1);
  });

  it("orders the two lists from the same final by their placing", () => {
    // Both are from the Europe Championship 26-27 Season 1 Final at Utrecht,
    // so the shelf reads as the standings of that event did. The order comes
    // from `TOURNAMENT_DECK_IDS` rather than from parsing the placing out of
    // the id, which is why the two entries are adjacent there.
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const first =
      "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";
    const second =
      "(Green) Dracule Mihawk - 3rd Place EU Championship 26-27 S1";

    expect(deckShelf(second)).toBe("tournament");
    expect(shelfOf(html, second)).toBe("Community");
    expect(tileIndex(html, first)).toBeLessThan(tileIndex(html, second));
  });

  it("does not mark or lead with a Leader's recommended list", () => {
    // Two lists share OP14-041. The ChinoizeCup list is the one the app hands
    // a player for that Leader, but that says nothing about it against the
    // other Leaders on its shelf, so it neither wears a mark nor moves to the
    // front: Community is ordered by the standings alone.
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const tuned = "(Blue/Yellow) Boa Hancock - 25th Place ChinoizeCup #105";
    const feature = "(Blue/Yellow) Boa Hancock - Official Feature Deck";
    expect(shelfOf(html, tuned)).toBe("Community");
    expect(shelfOf(html, feature)).toBe("Official Featured");
    const community = html.indexOf('data-shelf-label="Community"');
    expect(html.indexOf("data-deck-id=", community)).not.toBe(
      tileIndex(html, tuned),
    );
    expect(html).not.toContain("Recommended");
  });

  it("groups the select the same way, saved decks first", () => {
    const html = selectField(savedDecks, "p1-deck", "Your deck", LUFFY_ST31);
    expect(html.indexOf('<optgroup label="Your decks">')).toBeLessThan(
      html.indexOf('<optgroup label="Official Featured">'),
    );
    expect(html).not.toContain('<optgroup label="Your decks"></optgroup>');
  });

  it("keeps a narrowed list's saved decks on the player's own shelf", () => {
    // An explicit list can name a saved deck; it is still the player's deck,
    // and belongs where their decks are.
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

  it("offers Community, Official Featured and Starters, and opens on Community", () => {
    const html = deckPickerDialog({}, "p1", "Your deck", LUFFY_ST31, {
      offerBuilder: true,
    });
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map(
      (match) => match[1],
    );
    expect(tabs).toEqual(["Community", "Official Featured", "Starters"]);
    expect(html).toMatch(
      /id="p1-deck-tab-meta" aria-controls="p1-deck-shelf-meta" aria-selected="true"/,
    );
    expect(panelOf(html, "Community")).not.toMatch(/<section[^>]*hidden/);
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
    for (const label of ["Community", "Official Featured", "Starters"]) {
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
