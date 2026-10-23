import type { DeckManifest } from "./index.js";

/**
 * Red Trafalgar Law as the first EB-05 field builds it: the list pilot
 * "FenoHS" took to 9th of 120 at ChinoizeCup #125, an online event played on
 * Tuesday 20 Oct 2026 that allowed EB-05 cards ahead of their 30 Oct English
 * release. It is the best-placed OP14-001 list across the three EB-05 events.
 *
 * Source: Limitless TCG's standings for that event, retrieved 23 Oct 2026 --
 * https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings
 * -- whose API carries the whole fifty as card counts.
 *
 * Same Leader as Bandai's feature deck, so `op14-law-policy.ts` pilots both.
 * The Leader swaps the base power of two {Supernovas} or {Heart Pirates}
 * Characters once a turn; what the EB-05 field changed is what it swaps and
 * what refills the board:
 *
 * - **EB05-001 Jewelry Bonney** is the turn-five play. A 7000 {Supernovas}
 *   body whose [On Play], under a {Supernovas} Leader, draws 2 and plays two
 *   Characters of 2000 power or less from hand, and whose once-a-turn
 *   activation shrinks a 6000-or-bigger Leader or Character until the end of
 *   the opponent's next turn. Its 7000 base is what the Leader lends to
 *   OP14-002 Urouge and OP14-004 Cavendish.
 * - **EB05-006 Miss Buckingham Stussy** turns a Life card into +3000 or
 *   −4000 once a turn: the deck's removal and reach.
 * - **The Red-Haired package.** PRB02-003 Lucky.Roux is a [Blocker] that
 *   pitches a big Character for 2 cards, OP09-009 Benn.Beckman trashes a
 *   Character of 6000 or less, and OP17-005 Edward.Newgate sets the
 *   monocoloured Leader's base power to 8000 through the opponent's turn.
 * - **OP14-006 Shachi & Penguin and OP13-007 Ace & Sabo & Luffy** fill the
 *   cheap slots: a {Heart Pirates} swap partner, and a −3000.
 * - **No OP14-003, OP14-005, OP14-007, OP14-015, OP14-016 or OP14-018.**
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op14LawTournamentManifest: DeckManifest = {
  id: "(Red) Trafalgar Law - 9th Place ChinoizeCup #125",
  format: "standard",
  leader: "OP14-001",
  cards: {
    "OP14-010": 4,
    "OP14-013": 4,
    "OP13-007": 2,
    "OP14-004": 4,
    "OP14-011": 4,
    "EB05-006": 4,
    "OP14-006": 2,
    "OP14-002": 4,
    "PRB02-003": 4,
    "OP14-014": 2,
    "EB05-001": 4,
    "OP09-009": 2,
    "OP14-009": 3,
    "OP17-005": 3,
    "OP14-019": 4,
  },
};
