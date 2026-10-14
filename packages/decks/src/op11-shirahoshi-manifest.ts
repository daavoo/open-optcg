import type { DeckManifest } from "./index.js";

/**
 * OP-11 Green/Yellow Shirahoshi, the {Neptunian} deck whose Leader cannot
 * attack and plays the bodies instead.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 12 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_065.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP11-022 cannot attack. Once a turn it rests 1 DON!! and turns the top Life
 * card face-up to play a {Neptunian} or [Megalo] from hand with a cost up to
 * the DON!! count on the field -- a 5- or 6-cost body for one DON!!. The cost
 * needs a face-down top Life card, so the list's other half turns it back:
 * OP11-100 Otohime and OP11-108 Neptune on play, OP11-103 Long-Jaw Neptunian
 * and OP11-107 Topknot Neptunian off an [Activate: Main], each paying for a
 * draw, a K.O. or a restand. OP11-030 Shirahoshi and OP11-036 Spotted
 * Neptunian dig for the bodies.
 *
 * The late game is removal: OP11-031 Jinbe rests a 5-or-less, ST16-004 Shanks
 * K.O.s any rested Character, OP11-106 Zeus trades a Life card for a 5-or-less
 * K.O., and OP11-028 Lord of the Coast holds a rested Character down through
 * its owner's next Refresh Phase. OP10-030 Smoker sets a DON!! active to pay
 * for one more play.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op11ShirahoshiManifest: DeckManifest = {
  id: "(Green/Yellow) Shirahoshi - Official Feature Deck",
  featuredOn: { page: 65, posted: "2025-06-06" },
  format: "standard",
  leader: "OP11-022",
  cards: {
    "OP11-030": 4,
    "OP11-100": 4,
    "OP11-106": 4,
    "OP11-112": 4,
    "OP11-028": 2,
    "OP11-036": 4,
    "OP10-030": 4,
    "OP11-103": 4,
    "OP11-107": 4,
    "OP11-108": 4,
    "OP11-026": 4,
    "OP11-031": 4,
    "ST16-004": 2,
    "OP11-115": 2,
  },
};
