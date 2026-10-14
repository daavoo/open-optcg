import type { DeckManifest } from "./index.js";

/**
 * OP-15 Blue Rebecca, the {Dressrosa} deck whose Leader develops instead of
 * attacking.
 *
 * Source: Bandai's own featured deck for this Leader, retrieved
 * 26 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_098.php --
 * so the fifty is a published list rather than a described core, and the id
 * carries the "- Official Feature Deck" suffix the shelf derives from.
 *
 * ## What the deck does
 *
 * OP15-039 cannot attack. Its [Activate: Main] rests it and returns one of
 * your {Dressrosa} Characters to hand to play a {Dressrosa} Character of cost
 * exactly 3 out of hand for nothing. It is not printed once per turn, but it
 * rests the Leader, so it is once a turn in practice. The bounce is the price,
 * and the fifty is built so the price is small: twelve 1-costs -- OP15-053
 * Rebecca and OP15-040 Viola, whose [On Play] digs for a {Dressrosa} card, and
 * OP15-052 Leo -- go back to hand to be replayed for one DON!!, and twenty
 * 3-costs are what the Leader puts down in their place.
 *
 * The 3-costs are the attackers. OP15-042 Kyros buys itself [Rush] off a card
 * from hand and returns from the trash when K.O.'d, so a Kyros that has already
 * swung can be bounced and replayed to swing again; OP15-041 Orlumbus buys the
 * same [Rush] with a body to the bottom of the deck; OP15-047 Sanji makes one
 * attacker unblockable, OP15-051 Luffy is 7000 on the opponent's turn, and
 * OP10-054 Blue Gilly is a vanilla 5000. Above them, OP10-045 Cavendish draws
 * off its own attack, and the 7-costs OP10-046 Kyros and OP15-046 Sabo -- which
 * casts a {Dressrosa} Event for free -- come down off the DON!! the Leader's
 * free play left unspent, beside the 5-cost OP10-060 Barrier-Barrier Pistol.
 * OP15-052 Leo also trades a body at the bottom of the deck for a Character the
 * opponent's effect would have taken.
 *
 * The Bandai page's prose says the Leader plays "a cost of 3 or less"; the
 * printed text, and so the engine, says "a cost of 3".
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the OP-16 manifests do: `deck-provenance.ts` reads the card list and
 * `index.ts` re-exports from `deck-provenance.ts`, so the reverse import would
 * be a cycle.
 */
export const op15RebeccaManifest: DeckManifest = {
  id: "(Blue) Rebecca - Official Feature Deck",
  featuredOn: { page: 98, posted: "2026-04-03" },
  format: "standard",
  leader: "OP15-039",
  cards: {
    "OP15-040": 4,
    "OP15-052": 4,
    "OP15-053": 4,
    "OP10-054": 4,
    "OP15-041": 4,
    "OP15-042": 4,
    "OP15-047": 4,
    "OP15-051": 4,
    "OP10-045": 4,
    "OP10-046": 2,
    "OP15-046": 4,
    "OP10-059": 4,
    "OP10-060": 4,
  },
};
