import type { DeckManifest } from "./index.js";

/**
 * OP-14 Blue/Yellow Boa Hancock, the deck that plays its Characters out of
 * its own Life.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 28 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_090.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP14-041's first clause draws a card whenever a Character is played on the
 * opponent's turn, and the list is built so that happens off its own Life:
 * forty-one of the forty-nine carry a [Trigger]. Twenty of them (OP14-113
 * Marguerite, OP14-114 Ran, OP14-115 Rindo, OP14-105 Gorgon Sisters, OP14-107
 * Shakuyaku) play themselves under a {Kuja Pirates} Leader, which OP14-041 is,
 * and ten more (EB04-027 and OP14-112 Boa Hancock, OP14-118) play a [Trigger]
 * Character out of hand instead. Every damage the opponent deals is a likely
 * Character and, through the Leader, a card.
 *
 * The Leader's second clause, at [DON!! x1] once a turn, takes the top of the
 * opponent's Life into their hand when a 5000-base-power {Amazon Lily} or
 * {Kuja Pirates} Character is K.O.'d, which is what the page means by it
 * deterring attacks on those bodies. OP13-052 Boa Marigold plays OP07-051 Boa
 * Hancock out of hand for one cost less, and OP14-108 Silvers Rayleigh K.O.s a
 * 7000-base-power Character once the opponent is at 3 Life or fewer, from hand
 * or off a [Trigger]. OP14-112 Boa Hancock gains a Life card and takes one of
 * theirs on the way in. OP13-113 Lilith and OP14-113 Marguerite dig the
 * [Trigger] and Kuja pieces; Ran and Gorgon Sisters hand out rested DON!!.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op14HancockManifest: DeckManifest = {
  id: "(Blue/Yellow) Boa Hancock - Official Feature Deck",
  featuredOn: { page: 90, posted: "2026-01-16" },
  format: "standard",
  leader: "OP14-041",
  cards: {
    "OP13-113": 4,
    "OP14-113": 4,
    "OP14-114": 4,
    "EB04-027": 2,
    "OP13-052": 4,
    "OP14-115": 4,
    "PRB02-017": 4,
    "OP07-051": 4,
    "OP14-108": 4,
    "OP14-112": 4,
    "OP14-118": 4,
    "OP14-105": 4,
    "OP14-107": 4,
  },
};
