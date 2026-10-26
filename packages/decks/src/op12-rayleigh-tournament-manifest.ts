import type { DeckManifest } from "./index.js";

/**
 * Red Silvers Rayleigh (OP12-001): the list pilot "Spartacus2224" took to 4th
 * of 128 (6-1) at [EB05] ChinoizeCup #124, an online event played on Monday 19
 * Oct 2026 that allowed EB-05 cards ahead of their 30 Oct English release.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6ad09157115c12b73a5a4654/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-24. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Silvers Rayleigh builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Red) Silvers Rayleigh - Official Feature
 * Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 4 EB05-004 Baby 5, 4 EB05-008 Luffy, Now's Your
 * Chance, 4 EB05-061 Nami, 4 OP03-008 Buggy, 4 OP10-005 Sanji, 2 OP10-016
 * Monet, 2 ST21-017 Gum-Gum Mole Pistol. It drops 4 OP12-003 Crocus, 4 OP12-004
 * Kouzuki Oden, 4 OP12-007 Shanks, 2 OP12-012 Buggy, 4 OP12-013 Hatchan, 4
 * OP12-019 Color of Arms Haki. It changes the count of OP12-009 Jinbe 4 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op12RayleighTournamentManifest: DeckManifest = {
  id: "(Red) Silvers Rayleigh - 4th Place ChinoizeCup #124",
  format: "standard",
  leader: "OP12-001",
  recommended: true,
  cards: {
    "EB05-004": 4,
    "EB05-008": 4,
    "EB05-061": 4,
    "OP03-008": 4,
    "OP10-005": 4,
    "OP10-016": 2,
    "OP12-006": 4,
    "OP12-009": 2,
    "OP12-014": 4,
    "OP12-015": 4,
    "OP12-016": 4,
    "OP12-017": 4,
    "OP12-018": 4,
    "ST21-017": 2,
  },
};
