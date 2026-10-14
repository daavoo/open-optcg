import type { DeckManifest } from "./index.js";

/**
 * OP-12 Red Silvers Rayleigh, the low-cost Event deck whose Leader pays its
 * own clause by revealing two Events from hand.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 4 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_073.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP12-001 forbids any card of cost 5 or more, so the fifty tops out at
 * OP12-015 Monkey.D.Luffy's 4. Its [Activate: Main] gives +2000 to a Character
 * of 4000 base power or less once a turn, paid by revealing two Events from
 * hand rather than by spending them -- and the same reveal is the price of
 * OP12-003 Crocus, OP12-004 Kouzuki Oden, OP12-009 Jinbe, OP12-013 Hatchan and
 * Luffy. Sixteen of the fifty are the four Haki Events, so the hand is built to
 * hold two: OP12-006 Shakuyaku and OP12-014 Boa Hancock look at five for a red
 * Event, and OP12-017 Color of Observation Haki looks at four for one or for a
 * 3-or-more-cost Character.
 *
 * The three Haki Events and OP12-016 also each give active DON!! to a
 * [Silvers Rayleigh] on their [Main], and three of them print a +2000
 * [Counter], so the cards held for the reveal are the deck's defence too.
 * Hatchan and Hancock give rested DON!!, Luffy gains +2000 with two given
 * DON!! across the board, and OP12-007 Shanks and OP12-012 Buggy hand [Rush]
 * and [Blocker] to the {Roger Pirates} bodies: the deck attacks wide with
 * small Characters rather than with one large one.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op12RayleighManifest: DeckManifest = {
  id: "(Red) Silvers Rayleigh - Official Feature Deck",
  featuredOn: { page: 73, posted: "2025-08-22" },
  format: "standard",
  leader: "OP12-001",
  cards: {
    "OP12-006": 4,
    "OP12-013": 4,
    "OP12-003": 4,
    "OP12-004": 4,
    "OP12-007": 4,
    "OP12-012": 2,
    "OP12-014": 4,
    "OP12-009": 4,
    "OP12-015": 4,
    "OP12-016": 4,
    "OP12-017": 4,
    "OP12-018": 4,
    "OP12-019": 4,
  },
};
