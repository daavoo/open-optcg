import type { DeckManifest } from "./index.js";

/**
 * Red/Blue Portgas.D.Ace (OP13-002): the list pilot "Asce712" took to 1st, 6-0,
 * at an online OPTCGSim event (Europe) on 1 Jun 2026.
 *
 * Source: onepiecetopdecks.com's English OP-16 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/
 * (entry "BR Ace", 1st (6-0), optcgsim, 6/1/2026), retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Portgas.D.Ace builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Red/Blue) Portgas.D.Ace - Official Feature
 * Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 3 EB04-007 Roronoa Zoro, 4 OP07-051 Boa Hancock, 3
 * OP08-047 Jozu, 2 OP09-118 Gol.D.Roger, 2 OP16-003 Edward.Newgate, 2 OP16-004
 * Curiel, 3 OP16-017 LittleOars Jr., 2 OP16-021 Moby Dick, 4 ST22-002 Izo, 4
 * ST22-015 I Am Whitebeard!!, 2 ST23-001 Uta. It drops 4 OP04-016 Bad Manners
 * Kick Course, 4 OP13-007 Ace & Sabo & Luffy, 4 OP13-014 Portgas.D.Rouge, 4
 * OP13-046 Vista, 2 OP13-057 If I Bowed Down to Power, What's the Point in
 * Living?, 4 OP13-119 Portgas.D.Ace, 4 PRB02-002 Trafalgar Law, 4 ST15-002
 * Edward.Newgate. It changes the count of OP13-054 Yamato 4 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op13AceTournamentManifest: DeckManifest = {
  id: "(Red/Blue) Portgas.D.Ace - 1st Place OPTCGSim 2026-06-01",
  format: "standard",
  leader: "OP13-002",
  recommended: true,
  cards: {
    "EB04-007": 3,
    "OP07-051": 4,
    "OP08-047": 3,
    "OP09-118": 2,
    "OP13-016": 4,
    "OP13-042": 4,
    "OP13-043": 4,
    "OP13-054": 3,
    "OP16-003": 2,
    "OP16-004": 2,
    "OP16-017": 3,
    "OP16-021": 2,
    "PRB02-008": 4,
    "ST22-002": 4,
    "ST22-015": 4,
    "ST23-001": 2,
  },
};
