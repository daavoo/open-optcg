import type { DeckManifest } from "./index.js";

/**
 * Purple Donquixote Doflamingo (OP14-060): the list pilot "Neck310" took to
 * 1st, 4-0, at a Store Battle in Germany on 30 Jan 2026.
 *
 * Source: onepiecetopdecks.com's English OP-14/EB-04 deck-list page,
 * https://onepiecetopdecks.com/deck-list/english-op-14-eb-04-deck-list-the-azure-sea-seven/
 * (entry "Purple Doffy", 1st Place, SB(4-0), 1/30/2026), retrieved 2026-10-17.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Donquixote Doflamingo builds in
 * the learned model's training pool it is the one that model wins most with
 * against the meta field. Same Leader as "(Purple) Donquixote Doflamingo -
 * Official Feature Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 2 EB04-038 Rosinante & Law, 4 OP07-076 Slow-Slow
 * Beam Sword, 3 OP10-072 Donquixote Rosinante, 4 OP13-076 Divine Departure, 2
 * OP14-078 Bullet String. It drops 4 OP14-071 Pica, 4 OP14-073 Machvise, 2
 * OP14-076 Ever White. It changes the count of OP10-078 I Do Not Forgive Those
 * Who Laugh at My Family!!! 4 to 2, OP14-069 Donquixote Doflamingo 4 to 3,
 * OP14-072 Baby 5 4 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op14DoflamingoTournamentManifest: DeckManifest = {
  id: "(Purple) Donquixote Doflamingo - 1st Place Store Battle 2026-01-30",
  format: "standard",
  leader: "OP14-060",
  recommended: true,
  cards: {
    "EB04-038": 2,
    "OP07-076": 4,
    "OP10-065": 4,
    "OP10-071": 4,
    "OP10-072": 3,
    "OP10-078": 2,
    "OP13-076": 4,
    "OP14-061": 4,
    "OP14-063": 4,
    "OP14-067": 4,
    "OP14-068": 4,
    "OP14-069": 3,
    "OP14-072": 2,
    "OP14-074": 4,
    "OP14-078": 2,
  },
};
