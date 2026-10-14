import type { DeckManifest } from "./index.js";

/**
 * OP-10 Blue/Black Usopp, the {Dressrosa} control deck that plays a long game
 * and keeps its bodies on the board.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 12 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_058.php
 * -- with the four identities that have since rotated replaced, so the id
 * carries the "- Official Feature Deck" suffix the shelf derives from and
 * `featuredOn` names the page the other thirty-eight cards come from.
 *
 * ## Substitutions
 *
 * Bandai posted the list in March 2025, before block 1 left Standard on
 * 1 April 2026, and four of its identities are block-1 printings with no
 * re-blocking. Each is replaced, copy for copy, by a Standard-legal
 * {Dressrosa} card of the same cost doing the same job:
 *
 * - OP04-092 Rebecca x4 (1 cost, digs three for a {Dressrosa} card) ->
 *   OP15-040 Viola x4, the same dig with a 2000 Counter.
 * - OP04-089 Bartolomeo x4 (3-cost [Blocker]) -> OP15-047 Sanji x4.
 * - OP04-080 Gyats x2 (1 cost, 2000 Counter) -> OP15-052 Leo x2, a 2000
 *   Counter that also keeps a Character on the field.
 * - OP05-081 One-Legged Toy Soldier x2 (2 cost, 2000 Counter, a cost
 *   debuff) -> OP10-083 Kouzuki Momonosuke x2, the same three things.
 *
 * OP04-077, OP04-083 and OP04-096 are OP-04 printings too, but Bandai's
 * block-number ruling keeps them Standard-legal, so they are played as listed.
 *
 * ## What the deck does
 *
 * The Leader adds +1 cost to every {Dressrosa} Character of cost 2 or more,
 * which lifts the board out of "cost N or less" removal, and draws when one
 * is removed on the opponent's turn. OP10-057 Leo and OP10-095 Roronoa Zoro
 * rest the Leader or the Stage to dig or to K.O., and OP04-096 Corrida
 * Coliseum lets the bodies attack Characters the turn they land. OP04-083 and
 * OP10-049 Sabo and OP10-090 Franky keep the board alive, and the finish is
 * OP10-058 Rebecca putting OP10-046 Kyros and a second body down at once.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op10UsoppManifest: DeckManifest = {
  id: "(Blue/Black) Usopp - Official Feature Deck",
  featuredOn: { page: 58, posted: "2025-03-21" },
  format: "standard",
  leader: "OP10-042",
  cards: {
    "OP15-052": 2,
    "OP15-040": 4,
    "OP10-057": 4,
    "OP04-077": 4,
    "OP10-083": 2,
    "OP10-043": 2,
    "OP15-047": 4,
    "OP10-049": 2,
    "OP10-090": 3,
    "OP10-095": 4,
    "OP04-083": 4,
    "OP10-118": 3,
    "OP10-046": 4,
    "OP10-058": 4,
    "OP04-096": 4,
  },
};
