import type { DeckManifest } from "./index.js";

/**
 * Red Shanks (OP09-001): the list Gustavo Mejía took to 1st at a Store Battle
 * in Panama on 29 Jun 2026.
 *
 * Source: onepiecetopdecks.com's English OP-16 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/
 * (entry "Red Shanks", 1st Place, SB, 6/29/2026), retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Shanks builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. Same Leader as "(Red) Shanks - Starter Deck 23", so the same
 * rules policy pilots both.
 *
 * Against that list it adds 3 OP06-007 Shanks, 4 OP09-002 Uta, 3 OP09-004
 * Shanks, 4 OP09-009 Benn.Beckman, 4 OP12-008 Shanks, 4 OP13-007 Ace & Sabo &
 * Luffy, 4 OP16-012 Benn.Beckman, 3 PRB02-001 Koby, 3 PRB02-002 Trafalgar Law,
 * 2 PRB02-003 Lucky.Roux. It drops 4 OP09-006 Howling Gab, 4 OP09-010 Bonk
 * Punch, 4 OP09-012 Monster, 4 OP09-013 Yasopp, 4 OP09-014 Limejuice, 4
 * OP09-016 Rockstar, 2 ST23-003 Benn.Beckman, 4 ST23-004 Monkey.D.Luffy, 4
 * ST23-005 Yasopp. It changes the count of OP09-015 Lucky.Roux 4 to 3, OP09-020
 * Come On!! We'll Fight You!! 4 to 3, ST23-002 Shanks 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op09ShanksTournamentManifest: DeckManifest = {
  id: "(Red) Shanks - 1st Place Store Battle 2026-06-29",
  format: "standard",
  leader: "OP09-001",
  recommended: true,
  cards: {
    "OP06-007": 3,
    "OP09-002": 4,
    "OP09-004": 3,
    "OP09-009": 4,
    "OP09-011": 4,
    "OP09-015": 3,
    "OP09-020": 3,
    "OP12-008": 4,
    "OP13-007": 4,
    "OP16-012": 4,
    "PRB02-001": 3,
    "PRB02-002": 3,
    "PRB02-003": 2,
    "ST23-001": 2,
    "ST23-002": 4,
  },
};
