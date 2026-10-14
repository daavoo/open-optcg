import type { DeckManifest } from "./index.js";

/**
 * OP-16 Black/Yellow Marshall.D.Teach, transcribed from the Champion decklist
 * Bandai published for Season 2's Zagreb, Croatia regional.
 *
 * Read off the published decklist card grid: sixteen identities behind
 * OP16-080, summing to a legal 50 with three one-ofs (OP15-113 Roronoa Zoro,
 * OP16-103 Van Augur, OP16-106 Sanjuan.Wolf). The one-ofs are the part of the
 * transcription worth naming, because they are where this list departs from the
 * shells the published guides describe -- shonentcg's OP-16 guide records "four
 * copies each of Van Augur, Vasco Shot, and Doc Q" as the week-one standard, and
 * Bandai's own feature deck for this Leader (deck_107) runs 4 Sanjuan.Wolf, 2
 * Van Augur and no Zoro, Baby 5, Borsalino or Black Rope Dragon Twister at all.
 * The Champion list keeps the full four of Doc Q and Vasco Shot -- the two
 * bodies whose `[On K.O.]` pays the redirect back -- and spends the rest of
 * those slots on the Yellow Life package (EB04-058 Borsalino, OP15-113 Zoro) and
 * on OP12-112 Baby 5, whose Trigger draws 2 behind a multicoloured Leader.
 *
 * Every identity is in the pool: the OP-16 Blackbeard package and the Leader
 * come from the set import, OP15-113/EB04-058 were already carried by
 * `OP16-NAMI-6738` and OP12-112 by `OP12-ROSINANTE-AYASHIZO`, and the five
 * OP-09/EB-04 identities were added for this list in
 * `packages/cards/src/op16-teach.ts`.
 *
 * See `deckStrategyDossier("(Black/Yellow) Marshall.D.Teach - Official Feature Deck")` for how it is piloted, and
 * `packages/agents/src/rules/decks/op16-teach-policy.ts` for the rules seat.
 *
 * Lives in its own module for the same reason every other manifest does:
 * `deck-provenance.ts` reads the card list without importing `index.ts`.
 */
export const op16TeachManifest: DeckManifest = {
  id: "(Black/Yellow) Marshall.D.Teach - Official Feature Deck",
  format: "standard",
  leader: "OP16-080",
  cards: {
    "OP09-093": 4,
    "OP16-119": 4,
    "OP16-108": 4,
    "OP09-086": 4,
    "OP15-113": 1,
    "OP16-103": 1,
    "OP16-104": 4,
    "OP16-106": 1,
    "OP16-109": 4,
    "OP16-110": 4,
    "EB04-058": 4,
    "OP12-112": 4,
    "OP16-116": 2,
    "EB04-059": 2,
    "OP09-099": 4,
    "OP09-096": 3,
  },
};
