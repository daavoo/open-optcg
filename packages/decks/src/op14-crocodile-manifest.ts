import type { DeckManifest } from "./index.js";

/**
 * OP-14 Black Crocodile, the {Baroque Works} deck that drains an opponent's
 * Character to 0 cost instead of K.O.ing it.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 28 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_092.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP14-079's first clause stops this deck's own effects removing an opposing
 * Character from the field, so nothing in the list K.O.s or bounces one. Its
 * [Activate: Main] K.O.s one of your own {Baroque Works} Characters to give an
 * opposing Character -10 cost for the turn and optionally mill two, and most of
 * the list reads a Character at cost 0 (or 8 or more) on the field: OP14-090
 * Mr.1 rests a 0-cost Character and may attack Characters the turn it is
 * played, OP14-094 Mr.5 draws two, OP14-120 Crocodile draws one after locking
 * an attacker, and OP14-083 Ms. Wednesday takes 3000 power off a 0-cost body.
 *
 * The Leader's K.O. is fuel as much as cost. OP14-091 Mr.2's [On K.O.] plays
 * a 5-or-less {Baroque Works} body from hand or trash (Bandai's line swaps it
 * for Mr.1), OP14-085 Goldenweek draws and trashes, OP14-088 MerryChristmas
 * draws, and OP14-120 replays itself from the trash for a card from hand.
 * OP14-084 Ms. All Sunday plays a 4-or-less and a 1-cost {Baroque Works}
 * Character back from the trash; OP14-087 Miss.Valentine and OP14-099
 * Disappointed? dig for pieces and fill the trash on the way. OP14-092 Mr.3
 * shuffles three trash cards back instead of being K.O.'d on the opponent's
 * turn, OP14-086 Doublefinger raises the Baroque Works costs at 7 trash, and
 * OP14-096 Ground Death negates a 5-or-less body -- any body, once the Leader
 * has drained it -- or counters +4000 at 10 trash.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op14CrocodileManifest: DeckManifest = {
  id: "(Black) Crocodile - Official Feature Deck",
  featuredOn: { page: 92, posted: "2026-01-16" },
  format: "standard",
  leader: "OP14-079",
  cards: {
    "OP14-087": 4,
    "OP14-091": 4,
    "OP14-092": 4,
    "OP14-086": 2,
    "OP14-094": 4,
    "OP14-090": 4,
    "OP14-084": 4,
    "OP14-120": 4,
    "OP14-099": 4,
    "OP14-096": 4,
    "OP14-085": 4,
    "OP14-083": 4,
    "OP14-088": 4,
  },
};
