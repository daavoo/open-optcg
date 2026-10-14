import type { DeckManifest } from "./index.js";

/**
 * ST-22 "Ace & Newgate", Bandai's Blue Whitebeard Pirates starter deck,
 * exactly as sold.
 *
 * Source: Bandai's own card list for the product
 * (https://en.onepiece-cardgame.com/cardlist/?series=569022), which is the 17
 * identities below and nothing else, and the deck's per-slot counts from the
 * structure-deck list in the egman secondary source the audit already reads.
 * Both are in the 2026-08-22 reference snapshot, and every one of the 17 is
 * stamped `sourceMatch: true`. Bandai's product page gives the total -- 51
 * cards across 17 identities -- and not the split.
 *
 * cardgamebase's list for the product
 * (https://cardgamebase.com/one-piece-st22-decklist-card-list/) agrees on
 * twelve slots and swaps two pairs: ST22-005 Oden and ST22-009 Vista at 4,
 * ST22-010 Ace and ST22-014 A.O. at 2. The egman split is the one kept,
 * because it is the shape every Bandai starter in that feed has -- each of a
 * product's Super Rares ships at exactly 2, and Oden is one of ST-22's two.
 *
 * Unlike ST31-36 this is not part of the format `generated.ts` is built from,
 * so it is a hand-authored manifest. The whole list is its own set: no
 * reprint from a booster, and no identity shared with another shipped deck.
 *
 * ## What the deck does
 *
 * Every card but the five vanillas reads the "Whitebeard Pirates" type, in one
 * of two ways. Five reveal the top card of the deck and pay out on an on-type
 * card -- Newgate and Jozu draw, Squard hands out a rested DON!!, Marco keeps
 * +1000 through the opponent's turn, and the Counter Event is +4000 or
 * nothing. Four more ask for on-type cards *shown* from hand, which spends
 * nothing. All 16 of the deck's main-deck identities carry the type, so a
 * reveal misses only on an empty deck -- and the Leader's own activation puts
 * a known on-type card back on top, which is what makes the next reveal a
 * certainty rather than a likelihood.
 *
 * ST22-005 Kouzuki Oden is the deck's top end: an 8000 body that answers any
 * removal with two cards from hand, and sets itself active again for three
 * DON!! and a cheap body bounced -- which also replays that body's [On Play].
 * ST22-003 Edward.Newgate is the finisher, a 10000 [Double Attack].
 *
 * ## What it is not
 *
 * A tuned list. It is a precon, shipped as a deck rather than as a benchmark
 * target.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason every other hand-authored manifest does: `deck-provenance.ts` reads
 * the card list and `index.ts` re-exports from `deck-provenance.ts`, so the
 * reverse import would be a cycle.
 */
export const st22AceNewgateManifest: DeckManifest = {
  id: "(Blue) Ace & Newgate - Starter Deck 22",
  leader: "ST22-001",
  cards: {
    "ST22-002": 2,
    "ST22-003": 2,
    "ST22-004": 4,
    "ST22-005": 2,
    "ST22-006": 4,
    "ST22-007": 4,
    "ST22-008": 4,
    "ST22-009": 2,
    "ST22-010": 4,
    "ST22-011": 4,
    "ST22-012": 4,
    "ST22-013": 4,
    "ST22-014": 4,
    "ST22-015": 2,
    "ST22-016": 2,
    "ST22-017": 2,
  },
};
