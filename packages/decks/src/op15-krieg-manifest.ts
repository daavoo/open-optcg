import type { DeckManifest } from "./index.js";

/**
 * OP-15 Red/Green Krieg, the format's DON!!-giving lock deck.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 18 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_095.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * It wins by handing the opponent their own DON!! cards. Giving a DON!! card
 * to an opponent's Character takes it out of the cost area they pay from, and
 * this Leader turns the pile into a lock: at [Activate: Main] it rests a
 * Character carrying two or more given DON!! cards, and at [DON!! x1] on the
 * opponent's turn -- while only {East Blue} Characters stand on its own field
 * -- every opposing Character is 2000 smaller, which is what makes a rested
 * body stay dead to the deck's own attacks.
 *
 * Almost every body gives DON!! on the way in or on demand. OP15-015 Higuma
 * and OP15-028 Meowban Brothers give one for a single cost, OP15-025 Kuro two
 * and OP15-008 Krieg three, and the three [Activate: Main] engines
 * (OP15-003 Alvida, OP15-017 Morgan, OP15-023 Arlong) pay one given rested
 * DON!! to hand another back out every turn. Two of the three ways to keep a
 * body down through the Refresh Phase are here too: OP15-023 Arlong's [On K.O.]
 * and OP15-038, whose other half is a +4000 [Counter] for the Leader's own
 * name.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op15KriegManifest: DeckManifest = {
  id: "(Red/Green) Krieg - Official Feature Deck",
  featuredOn: { page: 95, posted: "2026-04-03" },
  format: "standard",
  leader: "OP15-001",
  cards: {
    "OP15-009": 4,
    "OP15-015": 4,
    "OP15-026": 4,
    "OP15-028": 4,
    "OP15-011": 4,
    "OP15-023": 4,
    "OP15-003": 4,
    "OP15-017": 4,
    "OP15-007": 4,
    "OP15-025": 4,
    "OP15-008": 4,
    "OP15-037": 4,
    "OP15-038": 2,
  },
};
