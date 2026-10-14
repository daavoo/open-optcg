import type { DeckManifest } from "./index.js";

/**
 * OP-12 Black/Yellow Koala, the {Revolutionary Army} deck whose bodies grow
 * to 8 cost once they are on the field.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 4 Oct 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_069.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP12-081 draws a card each time it attacks the opponent's Leader with two
 * Characters of cost 8 or more on the field. Three 4-cost {Revolutionary
 * Army} bodies print +4 cost under a {Revolutionary Army} Leader -- OP12-093
 * Morley, OP12-095 Lindbergh and OP12-089 Hack, the last with [Blocker] -- so
 * a 4-cost play counts as 8. OP12-085 Karasu (+3) and OP12-100 Sabo (+3 at 3
 * or fewer Life) reach 8 from 5, OP12-087 Nico Robin reaches 9 from 6 under
 * this Leader, OP12-119 Bartholomew Kuma's [On Play] lifts its 6 by 2 for a
 * turn cycle, and OP12-094 Monkey.D.Dragon is printed at 8. OP12-086 Koala
 * and OP12-097 Captains Assembled dig for those bodies.
 *
 * The Leader's second clause is the late game: once a turn, when the opponent
 * plays a base-8-or-more Character or plays one off a Character's effect, they
 * take their top Life card into hand. OP12-094 Monkey.D.Dragon recycles three
 * {Revolutionary Army} cards from the trash to play a 6-or-less back, which is
 * where Kuma and Robin come from a second time.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op12KoalaManifest: DeckManifest = {
  id: "(Black/Yellow) Koala - Official Feature Deck",
  featuredOn: { page: 69, posted: "2025-08-22" },
  format: "standard",
  leader: "OP12-081",
  cards: {
    "OP12-086": 4,
    "OP12-090": 4,
    "OP12-089": 4,
    "OP12-093": 4,
    "OP12-095": 4,
    "OP12-083": 4,
    "OP12-085": 2,
    "OP12-100": 4,
    "OP12-087": 4,
    "OP12-119": 4,
    "OP12-094": 4,
    "OP12-097": 4,
    "OP12-098": 4,
  },
};
