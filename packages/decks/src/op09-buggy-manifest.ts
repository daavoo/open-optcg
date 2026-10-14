import type { DeckManifest } from "./index.js";

/**
 * OP-09 Blue Buggy, the {Cross Guild} deck that puts big Characters on the
 * field without paying for them.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 4 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_078.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from. The
 * page presents it as the ST-25 Blue Buggy starter upgraded with PRB-02, and
 * all five ST-25 cards are in it at four copies.
 *
 * ## What the deck does
 *
 * The Leader's [Activate: Main] rests five DON!! and trashes a card to play
 * any {Cross Guild} Character from hand, whatever it costs. Everything else is
 * built around landing OP09-051 Buggy that way: a 10-cost, 12000-power body
 * for five DON!!, whose [On Play] puts an opposing Character on the bottom of
 * its deck -- and then puts Buggy there too unless you already have five
 * Characters with a cost of 5 or more.
 *
 * So the early turns assemble cost-5 bodies. ST25-001 Alvida, ST25-002 Cabaji
 * and ST25-005 Mohji are 4-costs that gain +1 cost once two real 5-costs are
 * out, and the last two gain [Blocker] too. OP09-046 Crocodile, ST25-003
 * Crocodile & Mihawk and ST25-004 Buggy put more bodies down from hand, and
 * OP09-048 Mihawk, Alvida and Crocodile & Mihawk keep the hand full enough to
 * feed the Leader's trash cost. Crocodile & Mihawk also takes a card from
 * hand instead of a {Cross Guild} Character leaving the field to an opposing
 * effect, once a turn.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op09BuggyManifest: DeckManifest = {
  id: "(Blue) Buggy - Official Feature Deck",
  featuredOn: { page: 78, posted: "2025-10-03" },
  format: "standard",
  leader: "OP09-042",
  cards: {
    "OP09-056": 4,
    "PRB02-009": 4,
    "ST25-001": 4,
    "ST25-002": 4,
    "ST25-004": 4,
    "ST25-005": 4,
    "OP09-045": 4,
    "P-082": 2,
    "OP09-048": 4,
    "OP09-046": 4,
    "ST25-003": 4,
    "OP09-051": 4,
    "OP09-057": 4,
  },
};
