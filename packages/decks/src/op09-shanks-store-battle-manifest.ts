import type { DeckManifest } from "./index.js";

/**
 * Red Shanks (OP09-001): the list "Doffy" took to 1st (4-0) at a Store Battle
 * at Ludotrotter Charleroi, a 14-player event in Belgium on 13 Jun 2026.
 *
 * Source: onepiecetopdecks.com's English OP-16 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/
 * (entry "Red Shanks", 1st (4-0), SB, 6/13/2026, Belgium, whose `deckgen`
 * record carries the whole fifty), retrieved 2026-10-17 and again 2026-11-25.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Shanks builds the learned
 * model was trained on, played into the meta field on the same seeds, it is
 * the one that model wins most with, ahead of "(Red) Shanks - 1st Place Store
 * Battle 2026-06-29", which it replaces on the shelf and which stays a
 * training-only list in `ml/bridge/decks.ts`. Same Leader as "(Red) Shanks -
 * Starter Deck 23", so the same rules policy pilots both.
 *
 * Against the 29 Jun list it adds 4 OP16-018 Rockstar and drops 3 PRB02-001
 * Koby and 3 PRB02-002 Trafalgar Law. It changes the count of OP06-007 Shanks
 * 3 to 2, OP09-004 Shanks 3 to 4, OP09-015 Lucky.Roux 3 to 4, OP09-020 Come
 * On!! We'll Fight You!! 3 to 4, OP13-007 Ace & Sabo & Luffy 4 to 3 and
 * ST23-001 Uta 2 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op09ShanksStoreBattleManifest: DeckManifest = {
  id: "(Red) Shanks - 1st Place Store Battle 2026-06-13",
  format: "standard",
  leader: "OP09-001",
  recommended: true,
  cards: {
    "OP06-007": 2,
    "OP09-002": 4,
    "OP09-004": 4,
    "OP09-009": 4,
    "OP09-011": 4,
    "OP09-015": 4,
    "OP09-020": 4,
    "OP12-008": 4,
    "OP13-007": 3,
    "OP16-012": 4,
    "OP16-018": 4,
    "PRB02-003": 2,
    "ST23-001": 3,
    "ST23-002": 4,
  },
};
