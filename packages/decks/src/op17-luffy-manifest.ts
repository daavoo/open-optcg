import type { DeckManifest } from "./index.js";

/**
 * OP-17 Black Monkey D. Luffy, the Elbaph giants deck.
 *
 * Source: Bandai's own featured deck list for this Leader, retrieved
 * 16 Sep 2026 -- https://en.onepiece-cardgame.com/feature/deck/deck_109.php --
 * which is why the id carries the "Official Feature Deck" suffix that
 * `deckShelf` reads. Corroborated on the archetype by
 * https://www.thornberrymedia.com/post/best-op-17-leaders, which ranks OP17-079
 * third of the six new Leaders and names the Loki-and-search shell this list
 * runs.
 *
 * ## What the deck does
 *
 * Every giant in the list prints "this Character gains +12 cost", and almost
 * every Straw Hat in it prints "[printed text omitted -- pnpm card:text OP17-079]". So the deck's real cost curve and its printed one are different
 * documents: OP17-089 Jaguar.D.Saul costs 4 and sits on the board at 16, which
 * switches on +3000 power for six different 2-drops at once. The Leader adds
 * the other half, granting [Blocker] to everything at 12 or more, so the same
 * giants that turn the small bodies on are also the wall.
 *
 * Note that the enabling clause reads "there is", not "you have": an opposing
 * giant switches these on too, which `anyCharacterWithCost` in
 * `static-abilities.ts` implements by scanning both boards. Two of the cheap
 * enablers -- OP17-081 Gerd and OP17-094 Rodo -- gate their +12 on an {Elbaph}
 * Leader instead of being unconditional, which this Leader is.
 *
 * OP17-085 Dorry and OP17-092 Brogy fetch each other and then lock further
 * Character plays for the turn, so they are the one pair in the list whose
 * ordering against the rest of the curve actually matters. Bandai's list runs
 * four of each rather than three, so the lock is reached more often than the
 * count alone suggests.
 *
 * The one Event is OP17-096, a [Counter] worth 4000 -- twice the largest
 * ordinary Counter card in the format, which is what makes the deck able to
 * defend a giant it does not want to trade.
 *
 * Pure OP17: no off-set slot, so every identity comes from
 * `generated-op17.ts`.
 */
export const op17LuffyManifest: DeckManifest = {
  id: "(Black) Monkey.D.Luffy - Official Feature Deck",
  featuredOn: { page: 109, posted: "2026-08-28" },
  format: "standard",
  leader: "OP17-079",
  cards: {
    "OP17-080": 4,
    "OP17-081": 4,
    "OP17-082": 2,
    "OP17-084": 2,
    "OP17-085": 4,
    "OP17-086": 4,
    "OP17-087": 4,
    "OP17-089": 4,
    "OP17-091": 2,
    "OP17-092": 4,
    "OP17-093": 4,
    "OP17-094": 2,
    "OP17-095": 4,
    "OP17-096": 2,
    "OP17-119": 4,
  },
};
