import type { DeckManifest } from "./index.js";

/**
 * Red Edward.Newgate, the deck that pays for its defence a card at a time.
 *
 * Source: Bandai's own feature deck
 * https://en.onepiece-cardgame.com/feature/deck/deck_113.php -- "(Red)
 * Edward.Newgate", published 28 Aug 2026 and retrieved 4 Sep 2026.
 * Transcribed slot for slot from the card-list images on that page, so the 50
 * below is the published 50 and not a reading of one. Two products, no others:
 * fourteen of the sixteen slots are OP-17, and the remaining two -- OP16-118
 * Portgas.D.Ace and OP16-021 Moby Dick -- are the OP-16 cards the page lists
 * under "Products Used in This Deck".
 *
 * ## Why this list and not the tournament one
 *
 * There is a tournament build, and it is worth being precise about what
 * shipping Bandai's instead costs. onepiecetopdecks' English OP-17 page
 * (retrieved 4 Sep 2026) carries two Red Newgate lists: Jonathan Chao, 2nd at
 * 5-1 in the USA on 28 Aug 2026, and Asher, 6th at 5-1 in Europe on 2 Sep
 * 2026. They agree with each other far more than either agrees with Bandai.
 * Both go to four OP17-017 where this list runs two, both keep the four-ofs of
 * OP17-003, OP17-005, OP17-008, OP17-009, OP16-021, OP16-118 and OP17-019, and
 * both cut five of Bandai's slots outright: OP17-002 Atmos, OP17-007 Kouzuki
 * Oden, OP17-013 Portgas.D.Ace, OP17-015 Marco and OP17-016 Rakuyo. In their
 * place go OP13-007, EB04-007, OP09-118 and -- list-specific -- OP09-015,
 * OP16-003 and OP04-016 for Chao's, PRB02-003 and OP11-018 for Asher's.
 *
 * So the field's read is that this deck wants more Counter and fewer bodies
 * with conditional text, and the Counter count is the one number to compare
 * against if this list is ever replaced. It is not replaced here for two
 * reasons. Bandai's is first-party provenance and the standard the Nami,
 * Teach, Enel, Xebec, Kaido, Yamato and Bonney lists in this directory are
 * already held to. And three of the identities the field plays -- OP09-015,
 * OP09-118 and PRB02-003 -- have no card record in `packages/cards/src` at
 * all, only block icons, so the tournament 50 is an OP-09 and PRB-02 import
 * plus their mechanics rather than a manifest edit.
 *
 * ## What the deck does
 *
 * The Leader turns cards in hand into power. Its
 * `[On Your Opponent's Attack]` is once per turn and costs one card off the
 * top of the hand, and what it buys is +4000 for the rest of the turn on the
 * Leader or on any one Character -- no restriction on the target, which is
 * the largest and the loosest instance of a template OP-17 prints five times:
 * OP17-064 King buys +2000, OP17-072 Black Maria and OP17-049 Charlotte
 * Linlin +1000, and the other Edward.Newgate with the clause -- OP17-040, a
 * {Rocks Pirates} Character -- buys +3000 and only for a Leader. So the deck's
 * defence is not priced in Counter cards but in *any* card.
 *
 * That is what lets the list be as Counter-poor as it is. Seven of the
 * fourteen deck slots -- twenty-six of the fifty cards -- can do nothing in a
 * battle at all: OP17-002 Atmos, OP17-003 Izo, OP17-005 Edward.Newgate,
 * OP17-007 Kouzuki Oden and OP17-008 Jozu print no Counter, OP17-019 is a
 * `[Main]` Event and OP16-021 Moby Dick is a Stage. Over half the deck is
 * uncounterable on paper and worth 4000 in practice, once per turn.
 *
 * The two cheap slots that are not are the same idea written onto bodies:
 * OP17-002 Atmos and OP17-009 Haruta both gain +3000 on the opponent's turn,
 * so they defend at 9000 and 8000 while attacking at 6000 and 5000. This deck
 * has no interest in what its Characters attack for.
 *
 * On top of that floor the deck raises the number the 4000 is added to.
 * OP17-008 Jozu and OP17-005 Edward.Newgate both set the Leader's *base*
 * power to 8000 through the opponent's next end phase -- not a turn-scoped
 * buff but a new base, so it survives into the turn the opponent attacks
 * into. An 8000 Leader plus one trashed card is a 12000 defence for one card,
 * repeatable every turn, and that is the whole game plan: be un-attackable
 * while the board grows.
 *
 * The board grows off two engines rather than off DON!!:
 *
 *  - **OP17-007 Kouzuki Oden** deploys a second Character of 6000 power or
 *    less out of hand for free when it lands, {Land of Wano} or {Whitebeard
 *    Pirates}, and the intended partner is OP17-003 Izo -- a 6000 that shrinks
 *    one rested opposing Character by 6000 on the way in and, printing
 *    `[Rush: Character]`, can attack the turn it arrives. Seven DON!! for two
 *    bodies, a removal and an attack is the deck's tempo turn.
 *  - **OP16-118 Portgas.D.Ace** searches {Whitebeard Pirates} out of the deck
 *    both when it enters and when it dies, and OP17-019 looks five deep for
 *    one. That refills the hand Oden empties, and -- because the Leader eats
 *    a card per turn -- refilling the hand *is* refilling the defence. The
 *    two are the same resource here, which is the thing to understand about
 *    piloting this deck: a search is a Counter.
 *
 * Both of those Leader-base clauses, and Izo's and OP17-013's debuffs, are
 * gated on the Leader: Jozu and OP17-013 want a Leader *named*
 * Edward.Newgate, Oden and Izo want that or a {Land of Wano} Leader, and
 * OP17-005 wants a monocolored one. This
 * mono-Red list satisfies every one of them. It is the reason three of these
 * four cards are in this deck and not in `op16-ace-manifest.ts`, which shares
 * five other identities with it: behind OP16-001 Portgas.D.Ace, Oden deploys
 * nothing, Jozu sets no base power and OP17-013 debuffs nobody. OP17-005 is
 * the one whose gate is colour rather than name, and it is in both lists.
 *
 * OP17-005's own price is set by the opponent. With anything at 10000 power or
 * more on the other side of the table it costs 4 less, which in this format is
 * most turns after the fourth, so the 12000 body lands on 6 DON!! with 4 left
 * over for the Leader's clause and a Counter.
 *
 * ## Its relationship to the Red Ace list
 *
 * `op16-ace-manifest.ts` is the same card type behind a different Leader, and
 * the two are worth reading together because they share five identities
 * (OP17-004, OP17-005, OP17-006, OP17-016, OP16-021) and almost nothing else.
 * OP16-001 Ace grants Rush to an 8000 it just played and races; OP17-001
 * Newgate buys 4000 of defence with a card and does not. The shared five are
 * the cards that are good in both a race and a grind -- the big bodies and the
 * Stage -- and the divergence is everywhere the two decks spend their hand:
 * Ace's hand is reveal fuel it keeps, Newgate's is fuel it burns.
 *
 * ## The off-set slots
 *
 * Two, both stamped by the OP-16 set-level pass in `tools/audit-cards`, so
 * this deck needs no entry there: OP16-118 Portgas.D.Ace and OP16-021 Moby
 * Dick. Both are already in the pool for `op16-ace-manifest.ts`.
 *
 * ## How it measures
 *
 * Enters the upper half of `docs/rules-map/deck-standings-featured.csv`, over 13.2 turns a game. That turn
 * count is the one number in the row that reads like the deck's own plan: it
 * is among the longest of any deck above even, and the decks that take longer
 * are below it.
 *
 * `pnpm deck:ab` over the same field puts its two worst matchups at 18.0%
 * against `eb04-bonney-manifest.ts` and 24.0% against
 * `op16-ace-manifest.ts` -- the two decks that need not attack into the
 * Leader's ability to win. Bonney spends its own Life rather than taking this
 * deck's, and Red Ace shares the big bodies while racing with them.
 *
 * The number is a real read on the deck rather than on a gap, which was not
 * true when this list was first added: the Leader's own
 * `[On Your Opponent's Attack]` was 100% unpiloted and the generic ladder paid
 * for it on every attack. See `packages/agents/src/rules/decks/
 * op17-newgate-policy.ts`, which fixed that.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other community manifests do: `deck-provenance.ts` reads the card
 * list and `index.ts` re-exports from `deck-provenance.ts`, so the reverse
 * import would be a cycle.
 */
export const op17NewgateManifest: DeckManifest = {
  id: "(Red) Edward.Newgate - Official Feature Deck",
  featuredOn: { page: 113, posted: "2026-08-28" },
  format: "standard",
  leader: "OP17-001",
  cards: {
    "OP17-004": 4,
    "OP17-016": 4,
    "OP17-002": 2,
    "OP17-003": 4,
    "OP17-009": 2,
    "OP16-118": 4,
    "OP17-015": 2,
    "OP17-008": 4,
    "OP17-013": 2,
    "OP17-006": 4,
    "OP17-007": 4,
    "OP17-005": 4,
    "OP17-017": 2,
    "OP17-019": 4,
    "OP16-021": 4,
  },
};
