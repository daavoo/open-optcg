import type { DeckManifest } from "./index.js";

/**
 * Red/Purple Gol.D.Roger (OP13-003): the list pilot "RubenTr" took to 1st, 6-0,
 * at an online OPTCGSim event (Europe) on 22 Apr 2026.
 *
 * Source: onepiecetopdecks.com's English OP-15/EB-04 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op15-eb04-deck-list-adventure-on-kamis-island/
 * (entry "PR Roger", 1st Place, optcgsim(6-0), 4/22/2026), retrieved
 * 2026-10-17. Every identity is stamped from Bandai's cardlist pages already,
 * so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Gol.D.Roger builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Red/Purple) Gol.D.Roger - Official Feature
 * Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 3 EB04-007 Roronoa Zoro, 3 OP09-004 Shanks, 2
 * OP09-118 Gol.D.Roger, 3 OP13-007 Ace & Sabo & Luffy, 4 P-107 Gol.D.Roger, 3
 * ST18-001 Uso-Hachi, 2 ST23-001 Uta. It drops 2 OP13-060 Amatsuki Toki, 4
 * OP13-062 Crocus, 4 OP13-066 Silvers Rayleigh, 4 OP13-064 Gol.D.Roger. It
 * changes the count of OP13-061 Inuarashi 4 to 2, OP13-063 Kouzuki Oden 4 to 3,
 * OP13-071 Nekomamushi 4 to 3, OP13-076 Divine Departure 4 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op13RogerTournamentManifest: DeckManifest = {
  id: "(Red/Purple) Gol.D.Roger - 1st Place OPTCGSim 2026-04-22",
  format: "standard",
  leader: "OP13-003",
  recommended: true,
  cards: {
    "EB04-007": 3,
    "OP09-004": 3,
    "OP09-118": 2,
    "OP13-007": 3,
    "OP13-061": 2,
    "OP13-063": 3,
    "OP13-065": 4,
    "OP13-067": 4,
    "OP13-068": 4,
    "OP13-071": 3,
    "OP13-072": 4,
    "OP13-075": 4,
    "OP13-076": 2,
    "P-107": 4,
    "ST18-001": 3,
    "ST23-001": 2,
  },
};
