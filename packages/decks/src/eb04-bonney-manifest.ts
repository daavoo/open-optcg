import type { DeckManifest } from "./index.js";

/**
 * Red/Yellow Jewelry Bonney, Bandai's own feature deck for the Egghead
 * package.
 *
 * Source: `https://en.onepiece-cardgame.com/feature/deck/deck_101.php`, the
 * publisher's own decklist page, transcribed slot for slot. The quantities sum
 * to exactly 50 behind one Leader, which `validateDeckCardRows` re-asserts.
 *
 * ## What the deck does
 *
 * Every other deck in this repo protects its Life. This one spends it, and the
 * Leader is what makes that a plan rather than a loss:
 * "[printed text omitted -- pnpm card:text <card>]" turns a 5000 Leader into a 7000 one exactly when the opponent has
 * pushed it to the edge, and "[printed text omitted -- pnpm card:text <card>]" is the free ride down: while the Leader is still healthy the
 * activation trades a Life card for a card in hand, and once it is at 1 the
 * second half switches off and the first half's +2000 switches on.
 *
 * So the Life total is a resource with a floor, and the list is built around
 * where that floor sits:
 *
 *  - **At 2 or less Life**, the yellow bodies start paying Life *back*.
 *    EB04-054 Bartholomew Kuma and EB04-058 Borsalino each put a card from the
 *    deck on top of Life on play, OP12-119 Kuma buys one for a card from hand
 *    and again from the grave on the opponent's turn, and EB04-052 Sanji's
 *    `[On K.O.]` replaces itself with a yellow body out of hand. The deck is
 *    not racing to zero; it is holding at one or two and refilling.
 *  - **At 1 or less Life**, the payoffs turn on. The Leader is at 7000 on
 *    defence, EB04-061 Monkey.D.Luffy costs nine instead of ten, and OP07-107
 *    Franky's `[Trigger]` puts itself onto the board for free -- which is what
 *    makes taking damage with four of them in the deck a threat rather than a
 *    concession.
 *  - **At 0 Life**, EB04-056 Pacifista gains [Blocker] under a [Jewelry Bonney]
 *    Leader: four 1-cost 2000-Counter bodies that become four chump blockers
 *    on the turn the deck would otherwise die.
 *
 * The red half is the clock the yellow half buys time for. EB04-002 Jewelry
 * Bonney is the 1-drop that digs four for an {Egghead} or {Straw Hat Crew}
 * card, and EB04-007 Roronoa Zoro is the 7-cost 9000 that hands the Leader
 * +2000 across the turn and can pick off an 8000-power Character the turn it
 * lands. OP13-108 Jewelry Bonney is the top end: 10000 with [Rush] under an
 * {Egghead} Leader, at the cost of giving the opponent a card from their own
 * Life -- which this deck is happy to pay because it is the one deck in the
 * field that does not mind the race being short.
 *
 * OP07-114 "[printed text omitted -- pnpm card:text OP07-114]" is the second
 * searcher and the reason the {Egghead} count matters: 46 of the 50 slots
 * carry the type, so digging five for one is close to a guaranteed hit.
 *
 * ## Where the cards come from
 *
 * Nine off-set slots live in `packages/cards/src/eb04-bonney.ts`: EB04-001,
 * EB04-007, EB04-052, EB04-054, EB04-056, EB04-061, OP07-107, OP07-114 and
 * ST29-010. EB04-058 and EB03-053 come from `op16-nami.ts`, and EB04-002,
 * OP12-119 and OP13-108 from the EB-04, OP-12 and OP-13 set-level passes, so
 * their data is already in the pool.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason every other community manifest does: `deck-provenance.ts` reads the
 * card list and `index.ts` re-exports from `deck-provenance.ts`, so the
 * reverse import would be a cycle.
 */
export const eb04BonneyManifest: DeckManifest = {
  id: "(Red/Yellow) Jewelry Bonney - Official Feature Deck",
  featuredOn: { page: 101, posted: "2026-04-03" },
  format: "standard",
  leader: "EB04-001",
  cards: {
    "EB04-002": 4,
    "EB04-007": 4,
    "EB04-052": 4,
    "EB04-054": 2,
    "EB04-056": 4,
    "EB04-058": 4,
    "EB04-061": 4,
    "EB03-053": 4,
    "OP07-107": 4,
    "OP07-114": 4,
    "OP12-119": 4,
    "OP13-108": 4,
    "ST29-010": 4,
  },
};
