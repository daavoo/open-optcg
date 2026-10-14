import type { DeckManifest } from "./index.js";

/**
 * OP-11 Green Jinbe, the {Fish-Man} deck that rests the opponent's board and
 * keeps its own bodies standing.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 12 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_066.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from. The
 * OP-14 (Blue) Jinbe is a different Leader and a different deck.
 *
 * ## What the deck does
 *
 * OP11-021's [End of Your Turn], at 6 or fewer cards in hand, sets one
 * {Fish-Man} or {Merfolk} Character and one DON!! active. The Character comes
 * back to block, and the DON!! pays on the opponent's turn: for a 1-cost
 * Counter Event such as OP11-039 Vagabond Drill, or for the DON!! that
 * OP11-024 Aladine and OP11-035 Fisher Tiger rest to put a body into play from
 * hand when the opponent's effect K.O.s them. OP10-032 Tashigi rests itself
 * instead of another green Character leaving the field to an opponent's
 * effect.
 *
 * OP11-030 Shirahoshi and OP06-025 Camie dig, and the Leader can set
 * Shirahoshi active again after it rests to search. OP10-030 Smoker refunds a
 * DON!!. The rest of the deck rests the opposing board: OP11-031 Jinbe,
 * OP11-035 Fisher Tiger, OP11-029 Charlotte Praline, OP06-035 Hody Jones and
 * OP11-038 Gum-Gum Elephant Gatling all rest a Character, Hody can rest DON!!
 * instead, and OP11-031's [Activate: Main] lets a body played this turn attack
 * Characters. OP11-032 Surume and OP11-033 Bird Neptunian are vanilla.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op11JinbeManifest: DeckManifest = {
  id: "(Green) Jinbe - Official Feature Deck",
  featuredOn: { page: 66, posted: "2025-06-06" },
  format: "standard",
  leader: "OP11-021",
  cards: {
    "OP06-025": 4,
    "OP11-030": 4,
    "OP10-032": 4,
    "OP11-029": 2,
    "OP11-024": 4,
    "OP10-030": 4,
    "OP11-032": 4,
    "OP11-031": 4,
    "OP11-033": 4,
    "OP11-035": 4,
    "OP06-035": 4,
    "OP11-038": 4,
    "OP11-039": 4,
  },
};
