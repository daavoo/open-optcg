import type { DeckManifest } from "./index.js";

/**
 * OP-17 Purple Kaido, the format's DON!!-ramp deck, as Bandai publishes it.
 *
 * Source: the official ONE PIECE CARD GAME feature deck
 * https://en.onepiece-cardgame.com/feature/deck/deck_110.php -- "(Purple)
 * Kaido - Recommended Deck", retrieved 1 Sep 2026, whose own blurb is
 * "Overwhelm your opponent with a legion of high-cost Characters in this
 * Animal Kingdom deck focused on making the most of your DON!! cards!".
 * Transcribed card-for-card, so the 50 below is the published 50 and not a
 * reading of one.
 *
 * ## Why this list and not the guide's
 *
 * This file previously carried the OPDeckGuide mini-guide list
 * (https://opdeckguide.com/deck-guides/kaido-op17/, retrieved 26 Aug 2026),
 * chosen when no tournament build existed. Two things have changed since.
 * Bandai published this deck, which is a first-party provenance the guide list
 * cannot match and the same standard the Nami, Teach, Enel and Xebec lists in
 * this directory are already held to. And the guide list's own policy file had
 * concluded, after four rejected play rules, that "the gap is in the 50, not in
 * the ladder" -- so the 50 is the thing left to change.
 *
 * The two lists share the core every source agrees on: four EB04-032 Queen,
 * four EB04-031 King, four OP17-073 Basil Hawkins, four OP17-074 Yamato, and
 * the two cost-10 Kaidos. Bandai's differs in three ways that all point the
 * same direction -- more of what the deck is trying to do, less of what it was
 * hedging with:
 *
 *  - **the top end goes to four-of.** OP17-062 Kaido 3 -> 4, OP17-063 Kaido
 *    2 -> 4, OP17-061 Lead Performers 3 -> 4, OP17-069 Jack 2 -> 3, OP17-065
 *    Queen 2 -> 3. All eight published tournament lists also run four
 *    OP17-062, so this is the field's read as well as Bandai's.
 *  - **the ramp moves onto bodies and into the attack step.** OP17-068 Sasaki
 *    (3-cost, 4000, 2000 Counter) turns two dead cards into two rested DON!!
 *    *while attacking*, which is the trade OP17-077 Kundali Dragon Swarm made
 *    off a body and for a whole card; OP17-060 Ulti & Page One adds an active
 *    DON!! and K.O.s a 3000 on the way in. OP17-078 Drunken Dragon Bagua keeps
 *    the bulk-ramp Event at two copies and adds a `[Counter]` +4000 the old
 *    Event did not have.
 *  - **the off-set slots are gone.** ST18-001 Uso-Hachi, ST34-004 Charlotte
 *    Linlin, OP15-078 Mamaragan, OP07-077 and EB04-030 Kaido are all cut;
 *    every card here is OP-17 apart from the two EB-04 ramp engines. The
 *    {Straw Hat Crew} body in an {Animal Kingdom Pirates} deck that
 *    `op17-xebec-manifest.ts` flags as a trap goes with them.
 *
 * EB04-030 Kaido and OP07-077 stay in the card pool and in
 * `packages/cards/src/op17-kaido.ts` -- a hand-authored definition takes its
 * `officialTextHash` from the audit pass that still lists them, so dropping
 * them from this 50 does not drop them from the reference stamp.
 *
 * ## What the deck does
 *
 * Ramp, then out-scale. Standard DON!! progression puts a deck at 10 DON!! on
 * turn 10-ish; this one gets there several turns early and spends the
 * difference on 12000-power bodies the opponent cannot answer. Four ramp
 * engines stack:
 *
 *  - EB04-032 Queen turns two active DON!! into one rested DON!! that counts
 *    toward next turn's total (its `[Activate: Main]`), which is the turn-2
 *    play the curve is built on.
 *  - EB04-031 King adds one active *and* one rested DON!! every turn from
 *    turn 6, and is the card the curve depends on -- the archetype's weakness
 *    list is "highly dependent on playing 6c King exactly on curve", which is
 *    what OP17-061's deploy clause is for in this list.
 *  - OP17-073 Basil Hawkins and OP17-074 Yamato buy a DON!! on a body;
 *    OP17-060 Ulti & Page One buys an active one and removes a 3000.
 *  - OP17-068 Sasaki and OP17-078 Drunken Dragon Bagua convert cards in hand
 *    into rested DON!!, which is how a hand of uncastable 10-drops becomes a
 *    turn.
 *
 * The Leader itself is not a ramp card: "DON!! −1: give 1 opposing Character
 * −2000 power" spends a DON!! from the field, once per turn, on either
 * player's attack. It is removal support and Counter maths, and it is also the
 * trigger the deck's best card watches -- OP17-062 Kaido's "when a DON!! card
 * on your field is returned to your DON!! deck, add 1 active DON!! and set 1
 * as active" pays the Leader's cost straight back and then some.
 *
 * ## The tension the list is built around
 *
 * Fifteen of the fifty print no Counter, and eleven of those cost 9 or 10. A
 * hand holding two of them on turn 4 is a hand of two cards. Bandai's answer
 * is different from the guide's: instead of four OP17-076 as raw Counter
 * density, this list runs two OP17-076 and two OP17-078 -- whose `[Counter]`
 * is +4000, not +1000 -- plus four OP17-075 X.Drake and four OP17-068 Sasaki
 * as 2000-Counter bodies, and four OP17-063 Kaido, whose printed clause gives
 * every Counter-less Character in hand a +1000 Counter. The bricks are still
 * bricks; there are simply more cards next to them that are not.
 *
 * ## The off-set slots
 *
 * Two, both in `packages/cards/src/op17-kaido.ts`: EB04-031 King and EB04-032
 * Queen. EB-04 is listed on the OP14 reference page rather than one of its
 * own, which is how `tools/audit-cards` reaches it.
 */
export const op17KaidoManifest: DeckManifest = {
  id: "(Purple) Kaido - Official Feature Deck",
  featuredOn: { page: 110, posted: "2026-08-28" },
  format: "standard",
  leader: "OP17-058",
  cards: {
    "EB04-032": 4,
    "OP17-075": 4,
    "OP17-068": 4,
    "OP17-073": 4,
    "OP17-074": 4,
    "EB04-031": 4,
    "OP17-060": 4,
    "OP17-061": 4,
    "OP17-065": 3,
    "OP17-069": 3,
    "OP17-062": 4,
    "OP17-063": 4,
    "OP17-076": 2,
    "OP17-078": 2,
  },
};
