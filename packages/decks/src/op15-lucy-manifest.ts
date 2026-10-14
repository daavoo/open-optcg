import type { DeckManifest } from "./index.js";

/**
 * OP-15 Red/Blue Lucy, the format's Event-combo deck.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 18 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_096.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * Sixteen of the fifty are Events, and the deck is built to activate them
 * without paying for them. OP15-014 Bartolomeo's [On Play] activates a
 * {Dressrosa} Event of base cost 3 or less out of hand, and OP15-046 Sabo's
 * activates one of any cost -- which is how a 7-cost OP15-020 Fire Fist or a
 * bounce-to-deck OP10-060 Barrier-Barrier Pistol gets cast on a board where
 * the DON!! has already been spent on the body that cast it.
 *
 * The Leader turns that into cards. Its [Activate: Main] draws once a turn
 * after an Event of base cost 3 or more has been activated, so the free
 * activation and the draw are the same play; and its [When Attacking] /
 * [On Your Opponent's Attack] half trashes Events and Stages out of hand for
 * +1000 each, which is what lets an Event-heavy fifty defend at all. Eight of
 * the sixteen Events print no [Counter], and OP15-057 Dressrosa Kingdom is the
 * card that upgrades those from the Leader's +1000 to a real +2000 on any one
 * body.
 *
 * The trash is the other resource. OP15-021 costs 1 instead of 4 once four
 * Events are in it, and OP15-006 Cavendish is +2000 off the same count, so the
 * Events the deck has already spent keep paying.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op15LucyManifest: DeckManifest = {
  id: "(Red/Blue) Lucy - Official Feature Deck",
  featuredOn: { page: 96, posted: "2026-04-03" },
  format: "standard",
  leader: "OP15-002",
  cards: {
    "OP15-040": 4,
    "OP15-052": 2,
    "OP15-053": 4,
    "OP15-006": 4,
    "OP15-014": 4,
    "OP15-048": 4,
    "OP15-046": 4,
    "OP10-059": 2,
    "OP15-019": 2,
    "OP15-055": 4,
    "OP15-021": 4,
    "OP15-054": 2,
    "OP10-060": 2,
    "OP15-020": 4,
    "OP15-057": 4,
  },
};
