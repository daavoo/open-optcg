import type { DeckManifest } from "./index.js";

/**
 * Red Ace, Bandai's OP-16 feature deck.
 *
 * Source: Bandai's own feature-deck page for the Leader,
 * https://en.onepiece-cardgame.com/feature/deck/deck_102.php (posted 12 Jun
 * 2026, retrieved 20 Sep 2026), transcribed slot for slot -- thirteen distinct
 * cards behind OP16-001, twelve of them four-ofs and OP16-016 Ramba a two-of.
 * The card-usage table on Limitless for the same Leader
 * (https://onepiece.limitlesstcg.com/decks/107/cards) agrees with it on the
 * core: Garp, Luffy, LittleOars Jr., Vista, Marco, Thatch and Moby Dick are
 * the four-ofs everywhere.
 *
 * OP13-007 and OP13-016 come from the community pass in `tools/audit-cards`;
 * every other identity is stamped by the OP-16 set-level pass.
 *
 * ## What the deck does
 *
 * One clause, and everything else feeds it. The Leader prints
 * "[printed text omitted -- pnpm card:text OP16-118]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP16-118]" So the deck does not build a board and then swing next turn: it plays
 * an 8000-or-better Whitebeard Pirates body and attacks with it the same turn,
 * every turn, and the opponent never gets a window where the new threat is
 * only a blocker.
 *
 * That makes "8000 power" the deck's real currency rather than cost, and it is
 * spent three ways at once:
 *
 *  - as a Rush target, which is the Leader's clause above;
 *  - as a *reveal* cost -- OP16-010 and OP16-011 both read "[printed text omitted -- pnpm card:text OP16-011]", and OP16-003 reads two --
 *    so a hand full of 8000s is removal and card flow without spending any of
 *    them;
 *  - as a Counter, because OP16-118 prints "[printed text omitted -- pnpm card:text OP16-118]". Vista and
 *    Marco print no Counter at all and Thatch prints 1000; with one Ace in play
 *    each of them is a 2000 Counter. That is the whole defensive plan, and it
 *    is why the list can be this top-heavy without folding to a race.
 *
 * OP16-015 Monkey.D.Luffy is the card the mulligan looks for. It is not a
 * Whitebeard Pirate, so it is in the list for two other reasons: the Leader
 * names [Monkey.D.Luffy] explicitly as a Rush target, and its
 * "[On Your Opponent's Attack] ... your Leader and this Character's base power
 * becomes 7000" turns a 5000 Leader into a 7000 one for the turn. Its own
 * "−2 cost with 6 or more DON!!" clause prices it at 2 from the mid-game on.
 *
 * Lives in its own module, rather than inline in `index.ts`, for the same
 * reason the other community manifests do: `deck-provenance.ts` reads the card
 * list and `index.ts` re-exports from `deck-provenance.ts`, so the reverse
 * import would be a cycle.
 */
export const op16AceManifest: DeckManifest = {
  id: "(Red) Portgas.D.Ace - Official Feature Deck",
  featuredOn: { page: 102, posted: "2026-06-12" },
  leader: "OP16-001",
  cards: {
    "OP13-007": 4,
    "OP13-016": 4,
    "OP16-010": 4,
    "OP16-015": 4,
    "OP16-017": 4,
    "OP16-118": 4,
    "OP16-011": 4,
    "OP16-014": 4,
    "OP16-016": 2,
    "OP16-004": 4,
    "OP16-003": 4,
    "OP16-005": 4,
    "OP16-021": 4,
  },
};
