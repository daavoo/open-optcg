import type { DeckManifest } from "./index.js";

/**
 * (Purple) Sengoku, Bandai's own feature deck, transcribed slot for slot.
 *
 * Source: https://en.onepiece-cardgame.com/feature/deck/deck_105.php,
 * retrieved 4 Sep 2026 -- the official list behind OP16-060, published with
 * the OP-16 wave. Thirteen slots, fifty cards, and nothing here is a judgement
 * call: the page prints the quantities and this file repeats them. Card text
 * for every identity is stamped from Bandai's own cardlist pages by
 * `pnpm reference:audit`.
 *
 * The deck is the format's only *ramp* deck, and it ramps in one direction:
 * twelve of the fifty slots -- Rosinante, Sengoku, Garp, Kuzan, Sakazuki,
 * Borsalino -- add DON!! cards from the DON!! deck, and the Leader spends eight
 * *active* DON!! at once to put three differently-named {Admiral} Characters
 * onto the board from hand. That is the whole plan, and it is why the ordinary
 * measure of a curve does not read this list correctly: three of the four
 * seven-cost slots are not top-end, they are the payoff the twelve ramp slots
 * are paying for, and the deck expects to reach them a turn or two before its
 * DON!! count says it should.
 *
 * Two things about the list are worth recording because they look like
 * omissions and are not:
 *
 * - **Four Younger Brother Marine (OP16-062), a card with no printed effect.**
 *   A 5-cost 6000 with 2000 Counter is the list's only body that costs nothing
 *   to deploy and nothing to hold: every other Character here either wants
 *   DON!! on the field or wants to be cast off the Leader. It is the deck's
 *   Counter reserve and its only cheap-to-decide play.
 * - **No searcher above 1 cost, and three separate 5-card digs.** Koby
 *   (OP16-064), Tsuru (OP16-067) and "Buddha" Sengoku (OP16-077) all look 5
 *   deep for {Navy}; the list runs twelve copies between them because reaching
 *   an Admiral matters more than what else the hand holds. Koby is the only one
 *   that does not make you trash a card afterwards, and the only one that
 *   cannot find a second copy of itself.
 *
 * Borsalino (OP16-073) runs at 4 here, where `op16-enel-manifest.ts` records it
 * staying out of the Enel list entirely. Both are right for their Leader: Enel
 * prints a six-card DON!! deck, so a 7-cost is uncastable there, while this
 * Leader's DON!! deck is the standard ten and the whole deck is built to fill
 * it. `test/op16-sengoku.test.ts` pins the difference from this side.
 *
 * Every printing in the 50 is block 4, block 5, or evergreen `X` -- the three
 * Admirals carry `X` -- so the list clears the Standard floor with room, and
 * nothing in it rotates on the next scheduled move.
 *
 * Lives in its own module, rather than inline in `index.ts`, so that
 * `deck-provenance.ts` can read the card list without importing `index.ts` --
 * `index.ts` re-exports from `deck-provenance.ts`, and the reverse import
 * would be a cycle.
 */
export const op16SengokuManifest: DeckManifest = {
  id: "(Purple) Sengoku - Official Feature Deck",
  featuredOn: { page: 105, posted: "2026-06-12" },
  format: "standard",
  leader: "OP16-060",
  cards: {
    "OP16-064": 4,
    "OP16-067": 4,
    "OP16-070": 4,
    "OP16-062": 4,
    "OP16-066": 4,
    "OP16-075": 4,
    "OP16-063": 4,
    "OP16-065": 4,
    "OP16-073": 4,
    "OP15-078": 4,
    "OP16-076": 4,
    "OP16-077": 4,
    "OP16-078": 2,
  },
};
