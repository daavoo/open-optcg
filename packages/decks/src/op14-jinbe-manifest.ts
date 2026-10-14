import type { DeckManifest } from "./index.js";

/**
 * OP-14 Blue Jinbe, the deck that pays for DON!! with cards from hand.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 28 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_089.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP14-040's [Activate: Main] trashes a card from hand to give up to two rested
 * DON!! to a {Fish-Man} or {Merfolk} Leader or Character, and it is not once
 * per turn: every card in hand is a potential two DON!!, which is what lets a
 * board of 2- and 3-cost bodies attack above its cost. The discard is also the
 * deck's switch. OP14-045 Kuroobi and OP14-049 Jinbe gain [Rush] once a card
 * has been trashed from hand by an effect that turn, and OP14-056 Wadatsumi, a
 * body that cannot attack, has that restriction negated by the same trash.
 *
 * The rest of the list refills the hand the Leader spends. OP14-042 Arlong
 * digs four, OP14-050 Chew draws one, OP14-043 Aladine and OP14-047 Shirahoshi
 * put a 3-cost Fish-Man or Merfolk into play from hand, and Aladine, Kuroobi
 * and OP14-051 Hatchan draw on their way out. OP14-054 Fisher Tiger draws three
 * but trims the hand to five at the end of each turn, so the Leader's
 * discards are what keep that trim from costing anything. OP14-049 Jinbe is
 * the top end: two rested DON!! to draw two and bounce a Character of cost 7
 * or less, then [Rush] the same turn. OP14-046 Koala trashes itself for +2000,
 * OP14-057 pumps the whole board by 1000, and OP14-058 is a free play and a
 * 6000-base-power bounce on the Main, or a +3000 Counter that draws.
 *
 * OP14-055 The Macro Gang is a vanilla 3-cost Fish-Man.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op14JinbeManifest: DeckManifest = {
  id: "(Blue) Jinbe - Official Feature Deck",
  featuredOn: { page: 89, posted: "2026-01-16" },
  format: "standard",
  leader: "OP14-040",
  cards: {
    "OP14-042": 4,
    "OP14-050": 4,
    "OP14-051": 4,
    "OP14-046": 4,
    "OP14-045": 4,
    "OP14-056": 4,
    "OP14-043": 4,
    "OP14-047": 4,
    "OP14-055": 4,
    "OP14-054": 4,
    "OP14-049": 4,
    "OP14-057": 2,
    "OP14-058": 4,
  },
};
