import type { DeckManifest } from "./index.js";

/**
 * Black/Yellow Gecko Moria (OP14-080): the list pilot "RaigekiMax" took to 5th
 * of 63 (5-1) at [EGB] ChinoizeCup #120, an online event played on Wednesday 7
 * Oct 2026.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6abcff56783097f8dcb74097/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-10-17. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Gecko Moria builds in the
 * learned model's training pool it is the one that model wins most with against
 * the meta field. Same Leader as "(Black/Yellow) Gecko Moria - Official Feature
 * Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 1 OP06-090 Dr. Hogback, 4 OP06-091 Victoria Cindry,
 * 2 OP13-113 Lilith, 2 OP14-096 Ground Death, 4 OP15-084 Dr. Hogback, 2
 * OP15-113 Roronoa Zoro, 4 OP17-109 Charlotte Pudding. It drops 4 OP14-081
 * Spider Mice, 2 OP14-089 Ryuma, 2 OP14-108 Silvers Rayleigh, 4 PRB02-014 Sabo,
 * 2 OP14-117 Brick Bat. It changes the count of OP14-097 Hurry Up and Make Me
 * the Pirate King! 4 to 2, OP14-109 Victoria Cindry 4 to 1.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op14MoriaTournamentManifest: DeckManifest = {
  id: "(Black/Yellow) Gecko Moria - 5th Place ChinoizeCup #120",
  format: "standard",
  leader: "OP14-080",
  recommended: true,
  cards: {
    "OP06-090": 1,
    "OP06-091": 4,
    "OP13-113": 2,
    "OP14-096": 2,
    "OP14-097": 2,
    "OP14-100": 4,
    "OP14-102": 4,
    "OP14-104": 4,
    "OP14-109": 1,
    "OP14-110": 4,
    "OP14-111": 4,
    "OP14-112": 4,
    "OP15-084": 4,
    "OP15-113": 2,
    "OP17-109": 4,
    "PRB02-013": 4,
  },
};
