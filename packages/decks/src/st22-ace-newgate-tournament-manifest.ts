import type { DeckManifest } from "./index.js";

/**
 * Blue Ace & Newgate (ST22-001): the list pilot "John Piece TCG" took to 1st,
 * 5-0, at an event hosted by Patriot Games in the United Kingdom on 7 Sep 2025.
 * The source records the event type as "TB" and its legend does not define it.
 *
 * Source: onepiecetopdecks.com's English OP-12 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op-12-deck-list-legacy-of-the-master/
 * (entry "Ace and Newgate", 1st Place, TB(5-0), Patriot Games, 9/7/2025),
 * retrieved 2026-11-15. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Ace & Newgate builds in the
 * learned model's training pool it is the one that model wins most with
 * against the meta field. Same Leader as "(Blue) Ace & Newgate - Starter Deck
 * 22", which keeps its starter shelf, so the same rules policy pilots both.
 *
 * Against that list it adds 4 OP08-040 Atmos, 2 OP08-043 Edward.Newgate, 4
 * OP08-044 Kingdew, 4 OP08-047 Jozu, 4 OP08-052 Portgas.D.Ace, 3 OP10-055
 * Marco, 3 OP12-058 I Will Make Whitebeard the King of the Pirates. It drops 4
 * ST22-004 Elmy, 4 ST22-006 Jozu, 4 ST22-007 Squard, 4 ST22-008 Decalvan
 * Brothers, 2 ST22-009 Vista, 4 ST22-013 LittleOars Jr., 4 ST22-014 A.O., 2
 * ST22-015 I Am Whitebeard!!, 2 ST22-017 Fire Fist. It changes the count of
 * ST22-002 Izo 2 to 4, ST22-003 Edward.Newgate 2 to 4 and ST22-016 Take That
 * Back!! Take Back What You Said!! 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const st22AceNewgateTournamentManifest: DeckManifest = {
  id: "(Blue) Ace & Newgate - 1st Place Patriot Games 2025-09-07",
  format: "standard",
  leader: "ST22-001",
  recommended: true,
  cards: {
    "OP08-040": 4,
    "OP08-043": 2,
    "OP08-044": 4,
    "OP08-047": 4,
    "OP08-052": 4,
    "OP10-055": 3,
    "OP12-058": 3,
    "ST22-002": 4,
    "ST22-003": 4,
    "ST22-005": 2,
    "ST22-010": 4,
    "ST22-011": 4,
    "ST22-012": 4,
    "ST22-016": 4,
  },
};
