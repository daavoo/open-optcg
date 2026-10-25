import type { DeckManifest } from "./index.js";

/**
 * Purple Charlotte Katakuri (OP11-062): the list Luke Tyler took to 1st at a
 * Store Battle in the UK on 2 Aug 2026.
 *
 * Source: onepiecetopdecks.com's English OP-16 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/
 * (entry "Katakuri", 1st Place, SB, 8/2/2026), retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Charlotte Katakuri builds in
 * the learned model's training pool it is the one that model wins most with
 * against the meta field. Same Leader as "(Purple) Charlotte Katakuri - Starter
 * Deck 34", so the same rules policy pilots both.
 *
 * Against that list it adds 4 OP07-077 We're Going to Claim the One Piece!!!, 3
 * OP08-062 Charlotte Katakuri, 1 OP08-069 Charlotte Linlin, 2 OP08-077 Conquest
 * of the Sea, 4 OP11-067 Charlotte Katakuri, 4 OP11-070 Charlotte Pudding, 4
 * OP15-078 Mamaragan, 4 PRB02-010 Charlotte Pudding. It drops 4 EB03-032
 * Charlotte Flampe, 4 OP11-065 Charlotte Anana, 4 OP11-066 Charlotte Oven, 4
 * OP11-071 Charlotte Perospero, 4 OP11-079 When Two Men Are Fighting the Last
 * Thing I Need Is Some Half-Hearted Assistance!!!!, 4 OP11-081 Cognac
 * Mama-Mash, 4 P-090 Charlotte Smoothie. It changes the count of EB03-035
 * Charlotte Pudding 4 to 2, OP11-068 Charlotte Daifuku 4 to 2, ST34-001
 * Charlotte Katakuri 2 to 4, ST34-003 Charlotte Brulee 2 to 4, ST34-004
 * Charlotte Linlin 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op11KatakuriTournamentManifest: DeckManifest = {
  id: "(Purple) Charlotte Katakuri - 1st Place Store Battle 2026-08-02",
  format: "standard",
  leader: "OP11-062",
  recommended: true,
  cards: {
    "EB03-035": 2,
    "OP07-077": 4,
    "OP08-062": 3,
    "OP08-069": 1,
    "OP08-077": 2,
    "OP11-067": 4,
    "OP11-068": 2,
    "OP11-070": 4,
    "OP15-078": 4,
    "PRB02-010": 4,
    "ST34-001": 4,
    "ST34-002": 4,
    "ST34-003": 4,
    "ST34-004": 4,
    "ST34-005": 4,
  },
};
