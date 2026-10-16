import { requireKnownCard } from "@one-piece-sim/cards";
import {
  deckFormat,
  deckManifests,
  deckShelf,
  starterDeckNumber,
  type DeckManifest,
} from "@one-piece-sim/decks";
import { escapeHtml } from "./card-text.js";

/** A deck the user saved from the deck editor, keyed by its `CUSTOM-` id. */
export interface SavedDeck {
  name: string;
  deck: DeckManifest;
}

/** Whose deck colours a mat half or a chip: the leader's own, falling back to
    a second colour or "red" if it names none. */
export function leaderColors(deck: DeckManifest): [string, string] {
  const colors = requireKnownCard(deck.leader).colors?.map((color) =>
    color.toLowerCase(),
  ) ?? ["red"];
  return [colors[0] ?? "red", colors[1] ?? colors[0] ?? "red"];
}

export function deckManifestFor(
  deck: string,
  savedDecks: Record<string, SavedDeck>,
): DeckManifest | undefined {
  return savedDecks[deck]?.deck ?? deckManifests[deck];
}

/**
 * A shipped deck's id as a screen prints it.
 *
 * Every id but a tournament list reads as its own label already. A placing id
 * carries the event in the words the event itself uses -- "- 1st Place EU
 * Championship 26-27 S1" -- which is the longest suffix any shelf has, and on
 * a tile it crowds out the Leader name appended after it. "Place" and
 * "Championship" are the two words in it that tell no two lists apart: on the
 * Community shelf an ordinal is a placing, so the short form keeps the
 * placing and the event and drops the rest.
 */
export function deckDisplayName(deckId: string): string {
  if (deckShelf(deckId) !== "tournament") return deckId;
  return deckId
    .replace(/ - (\d+(?:st|nd|rd|th)) Place /, " - $1 ")
    .replace(/\bChampionships? /, "");
}

/** Prose name for a deck: a saved one by what the user called it, the rest by ID. */
export function deckLabel(
  deck: string,
  savedDecks: Record<string, SavedDeck>,
): string {
  const saved = savedDecks[deck];
  if (saved) return saved.name;
  if (!deck.startsWith("CUSTOM-")) return deckDisplayName(deck);
  const leader = deckLeaderName(deck, savedDecks);
  return leader === "—" ? "Custom deck" : leader;
}

export function deckLeaderName(
  deck: string,
  savedDecks: Record<string, SavedDeck>,
): string {
  const manifest = deckManifestFor(deck, savedDecks);
  return manifest ? requireKnownCard(manifest.leader).name : "—";
}

/** The Leader under the name: its number and colours, which the deck ID in the
    select above does not say and a custom deck has no other way to state, plus
    the constructed format the list is built for -- a shipped list is not
    necessarily tournament-legal today, and this is where it says so. */
export function deckLeaderLine(
  deck: string,
  savedDecks: Record<string, SavedDeck>,
): string {
  const manifest = deckManifestFor(deck, savedDecks);
  if (!manifest) return "No deck";
  const leader = requireKnownCard(manifest.leader);
  const format = deckFormat(manifest) === "extra" ? "Extra" : "Standard";
  return `${leader.cardNumber} · ${leader.colors?.join("/") ?? "No colour"} · ${format}`;
}

export function deckAccent(
  deck: string,
  savedDecks: Record<string, SavedDeck>,
): string {
  const manifest = deckManifestFor(deck, savedDecks);
  return manifest ? leaderColors(manifest)[0] : "neutral";
}

/**
 * A name short enough for a chip or a headline: a saved deck by what the user
 * called it, a starter deck by its product number, anything else by its Leader.
 *
 * A deck ID names the colours, the Leader and the product, which is a column's
 * worth of words; the chip beside it already carries the colour and the full
 * name is its tooltip. A starter's number is shorter than its Leader and is what
 * tells the two Luffy starters apart.
 */
export function deckShortName(
  deck: string,
  savedDecks: Record<string, SavedDeck>,
): string {
  const saved = savedDecks[deck];
  if (saved) return saved.name;
  const starter = starterDeckNumber(deck);
  if (starter !== undefined) return `ST${String(starter).padStart(2, "0")}`;
  const leader = deckLeaderName(deck, savedDecks);
  return leader === "—" ? deckLabel(deck, savedDecks) : leader;
}

export function deckChip(
  deck: string,
  savedDecks: Record<string, SavedDeck>,
): string {
  const label =
    deck.startsWith("CUSTOM-") && !savedDecks[deck]
      ? "CUSTOM"
      : deckShortName(deck, savedDecks);
  return `<span class="deck-chip" data-deck-color="${deckAccent(deck, savedDecks)}" title="${escapeHtml(deckLabel(deck, savedDecks))}">${escapeHtml(label)}</span>`;
}
