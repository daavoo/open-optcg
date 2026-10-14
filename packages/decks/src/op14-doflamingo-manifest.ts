import type { DeckManifest } from "./index.js";

/**
 * OP-14 Purple Donquixote Doflamingo, the deck that redirects attacks onto
 * bodies whose [On K.O.] pays it back.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 28 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_091.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP14-060's [On Your Opponent's Attack] spends one DON!! to move the attack
 * onto the Leader or a {Donquixote Pirates} Character, and most of the list is
 * a body that wants to be that target. OP14-067 Dellinger returns the DON!!
 * and digs five when it is K.O.'d, OP14-074 Monet draws two and returns two,
 * OP14-072 Baby 5 adds a Life card, and OP14-063 Sugar plays a 5-or-less
 * {Donquixote Pirates} Character from hand once the opponent has six DON!!.
 * OP14-061 Vergo swaps a removal for a DON!! returned to the deck, and
 * OP14-068 Trebol adds one back, rested, the first time a DON!! goes back on
 * the opponent's turn -- which the Leader's own DON!! -1 does.
 *
 * The rest keeps the DON!! count up while the Leader spends it: Monet, Baby 5
 * and Sugar add one active on play, OP14-071 Pica adds one at the end of each
 * turn, OP10-071 Doflamingo adds one on the opponent's attack and plays a
 * 5-or-less {Donquixote Pirates} Character from hand, and OP14-076 Ever White
 * adds one rested or is a +3000 Counter. OP10-065 Sugar and OP10-078 dig for
 * the pieces, OP14-073 Machvise is the vanilla 6-cost, and OP14-069
 * Doflamingo is the finisher: DON!! -3 to K.O. an 8-or-less Character or keep
 * three 7-or-less Characters from resting through the opponent's next turn.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other OP-14 manifests do: `deck-provenance.ts` reads the card list
 * and `index.ts` re-exports from `deck-provenance.ts`, so the reverse import
 * would be a cycle.
 */
export const op14DoflamingoManifest: DeckManifest = {
  id: "(Purple) Donquixote Doflamingo - Official Feature Deck",
  featuredOn: { page: 91, posted: "2026-01-16" },
  format: "standard",
  leader: "OP14-060",
  cards: {
    "OP10-065": 4,
    "OP14-067": 4,
    "OP14-063": 4,
    "OP14-072": 4,
    "OP14-061": 4,
    "OP14-068": 4,
    "OP14-071": 4,
    "OP14-074": 4,
    "OP14-073": 4,
    "OP10-071": 4,
    "OP14-069": 4,
    "OP10-078": 4,
    "OP14-076": 2,
  },
};
