import type { DeckManifest } from "./index.js";

/**
 * OP-14 Black/Yellow Gecko Moria, the {Thriller Bark Pirates} deck that fills
 * its trash on purpose and plays it back out through its Life cards.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 3 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_093.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * Ten of the fourteen slots print the same [Trigger] -- play a {Thriller Bark
 * Pirates} Character with a cost of 4 or less from your trash, rested -- so
 * every Life card the opponent takes is a body back, provided the trash already
 * holds one worth playing. The early turns are spent building that trash:
 * OP14-097 Hurry Up and Make Me the Pirate King! keeps one card of three and
 * trashes the rest, OP14-081 Spider Mice mills three, and the Leader's
 * [When Attacking] trashes three cards from hand to bank the top of the deck
 * as a fresh Life card, which is both fuel and another [Trigger] to flip.
 *
 * OP14-080's [Activate: Main] K.O.s one of your own {Thriller Bark Pirates}
 * Characters for +1000 across the board, and the list is built so that K.O.
 * costs nothing: OP14-110 Dr. Hogback's [On K.O.] plays a 4-or-less [Trigger]
 * Character from the trash, OP14-111 Perona's [On Play]/[On K.O.] stops a
 * 6-or-less attacker twice, OP14-089 Ryuma and OP14-100 Absalom dig on the way
 * out. PRB02-013 and OP14-104 Gecko Moria play a 4-or-less back from the
 * trash, the second optionally onto Life face-up instead. PRB02-014 Sabo is a
 * 2-cost [Blocker] once the trash reaches 15, and OP14-108 Rayleigh and
 * OP14-112 Hancock read a multicolored, Warlord Leader, both of which this is.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op14MoriaManifest: DeckManifest = {
  id: "(Black/Yellow) Gecko Moria - Official Feature Deck",
  featuredOn: { page: 93, posted: "2026-01-16" },
  format: "standard",
  leader: "OP14-080",
  cards: {
    "OP14-081": 4,
    "OP14-102": 4,
    "OP14-089": 2,
    "OP14-100": 4,
    "OP14-109": 4,
    "OP14-110": 4,
    "OP14-111": 4,
    "OP14-108": 2,
    "PRB02-013": 4,
    "PRB02-014": 4,
    "OP14-104": 4,
    "OP14-112": 4,
    "OP14-097": 4,
    "OP14-117": 2,
  },
};
