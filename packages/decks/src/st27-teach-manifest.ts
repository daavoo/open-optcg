import type { DeckManifest } from "./index.js";

/**
 * ST-27 "(Black) Marshall.D.Teach", as Bandai's own recommended list builds it.
 *
 * Source: Bandai's "RECOMMENDED DECKS" feature page for the product
 * (https://en.onepiece-cardgame.com/feature/deck/deck_076.php), which prints
 * the Leader, the thirteen main-deck slots below and their counts, and names
 * the two products it draws on -- ST-27 and PRB-02. That is one step off "the
 * precon exactly as sold": the list swaps four of the starter's own slots for
 * two PRB-02 singles and an EB-01 reprint. It is still not a judgement call of
 * ours, which is the bar {@link STARTER_DECK_IDS} sets -- Bandai published the
 * list, the counts and the reasoning.
 *
 * Every identity is in the 2026-08-22 reference snapshot and stamped
 * `sourceMatch: true`. Eight arrive with the OP-09 set pass; the other five --
 * ST27-003, ST27-005, PRB02-014, PRB02-015 and EB01-048 -- come through the
 * audit's community pass, which reads the ST-27 cardlist page added for this
 * deck and the PRB-02 page that was already fetched. EB01-048 Laboon has no
 * EB-01 page on Bandai's English cardlist at all; its only printing there is
 * the PRB-02 reprint, which is where the audit stamps it from.
 *
 * ## What the deck does
 *
 * It is a removal deck that pays for its removal with its own hand, and the
 * Leader is both halves of that. OP09-081 prints "Your [On Play] effects are
 * negated" -- a flat cost, and the reason the list runs almost no [On Play]
 * text -- against "[Activate: Main] You may trash 1 card from your hand: Your
 * opponent's [On Play] effects are negated until the end of your opponent's
 * next turn." Trashing a card to switch the opponent's [On Play] off is the
 * deck's turn-one play and most of its interaction, and the cards it trashes
 * are not lost: OP09-086 Jesus Burgess is +1000 power for every 4 cards in the
 * trash, PRB02-014 Sabo costs 3 instead of 6 at 15 cards, and ST27-003 Kuzan
 * and ST27-005 Marshall.D.Teach both buy things back out of it.
 *
 * The removal is the other axis, and it is built as a two-card combination
 * rather than as single cards. ST27-005 K.O.s a Character with a cost of 3 or
 * less and OP09-090 Doc Q one with a cost of 1 or less -- both far under the
 * curve on their own. EB01-048 Laboon (−4 cost), OP09-083 Van Augur (−3) and
 * OP09-089 Stronger (−2) are what make those ceilings reach a real body, and
 * all three are repeatable or cheap enough to fire the turn the K.O. does.
 * PRB02-015 Shiryu is the exception that proves it: its [On K.O.] reads a
 * *base* cost of 4 or less, which no debuff can widen, so it is priced as a
 * [Blocker] to be traded rather than as a combination piece.
 *
 * ## What it is not
 *
 * A tuned list. It is Bandai's teaching build for the product, and it is here
 * as a shipped deck rather than as a benchmark target: expect it near the
 * bottom of the starter decks' win rates, beside ST-26.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason every other community manifest does: `deck-provenance.ts` reads the
 * card list and `index.ts` re-exports from `deck-provenance.ts`, so the reverse
 * import would be a cycle.
 */
export const st27TeachManifest: DeckManifest = {
  id: "(Black) Marshall.D.Teach - Starter Deck 27",
  leader: "OP09-081",
  cards: {
    "EB01-048": 2,
    "OP09-083": 4,
    "OP09-086": 4,
    "OP09-089": 4,
    "OP09-090": 4,
    "OP09-093": 4,
    "OP09-095": 4,
    "OP09-096": 4,
    "OP09-099": 4,
    "PRB02-014": 4,
    "PRB02-015": 4,
    "ST27-003": 4,
    "ST27-005": 4,
  },
};
