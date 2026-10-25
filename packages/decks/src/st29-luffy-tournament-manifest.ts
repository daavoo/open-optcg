import type { DeckManifest } from "./index.js";

/**
 * Yellow Monkey.D.Luffy (ST29-001): the list pilot "Angelito_1023" took to 1st
 * at a Store Battle in England on 15 Jul 2026.
 *
 * Source: onepiecetopdecks.com's English OP-16 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op16-deck-list-the-time-of-battle/
 * (entry "Egghead Luffy", 1st Place, SB, 7/15/2026), retrieved 2026-10-17.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Monkey.D.Luffy builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Yellow) Monkey.D.Luffy - Starter Deck 29",
 * so the same rules policy pilots both.
 *
 * Against that list it adds 3 EB03-053 Nami, 3 EB03-055 Nico Robin, 4 EB04-058
 * Borsalino, 4 OP06-104 Kikunojo, 4 OP07-099 Usopp, 4 OP13-108 Jewelry Bonney,
 * 3 OP15-109 Nico Robin, 3 OP15-113 Roronoa Zoro, 3 OP15-114 Wyper, 2 OP15-119
 * Monkey.D.Luffy, 3 OP16-119 Marshall.D.Teach. It drops 4 ST29-002 Usopp, 4
 * ST29-003 Kaku, 4 ST29-006 Stussy, 2 ST29-007 Tony Tony.Chopper, 2 ST29-008
 * Nami, 4 ST29-010 Franky, 4 ST29-011 Brook, 4 ST29-012 Monkey.D.Luffy, 4
 * ST29-013 Rob Lucci, 2 ST29-014 Roronoa Zoro, 4 ST29-015 Raw Heat Strike, 4
 * ST29-017 Iai Death Lion Song. It changes the count of ST29-004 Sanji 2 to 4,
 * ST29-005 Jinbe 2 to 4, ST29-009 Nico Robin 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const st29LuffyTournamentManifest: DeckManifest = {
  id: "(Yellow) Monkey.D.Luffy - 1st Place Store Battle 2026-07-15",
  format: "standard",
  leader: "ST29-001",
  recommended: true,
  cards: {
    "EB03-053": 3,
    "EB03-055": 3,
    "EB04-058": 4,
    "OP06-104": 4,
    "OP07-099": 4,
    "OP13-108": 4,
    "OP15-109": 3,
    "OP15-113": 3,
    "OP15-114": 3,
    "OP15-119": 2,
    "OP16-119": 3,
    "ST29-004": 4,
    "ST29-005": 4,
    "ST29-009": 4,
    "ST29-016": 2,
  },
};
