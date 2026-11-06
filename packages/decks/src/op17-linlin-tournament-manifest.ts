import type { DeckManifest } from "./index.js";

/**
 * Yellow Charlotte Linlin (OP17-099): the list pilot "Namik" registered for
 * [OP17.5] ChinoizeCup #121, an online event of 64 played on Monday 12 Oct
 * 2026; the pilot dropped at 2-2, so the list has no placing.
 *
 * Source: Limitless TCG's standings for that event,
 * https://play.limitlesstcg.com/tournament/6ac7870a85920e4d253669db/standings,
 * whose API carries the whole fifty as card counts, retrieved 2026-11-06. Every
 * identity is stamped from Bandai's cardlist pages already, so the audit needs
 * no entry for it.
 *
 * It is the Leader's `recommended` list: of the Charlotte Linlin builds in the
 * learned model's training pool it is the one that model wins most with
 * against the meta field. Same Leader as "(Yellow) Charlotte Linlin - Official
 * Feature Deck", so the same rules policy pilots both.
 *
 * Against that list it adds 3 EB04-058 Borsalino, 4 OP11-106 Zeus, 4 OP14-104
 * Gecko Moria, 4 OP15-113 Roronoa Zoro, 4 OP16-119 Marshall.D.Teach. It drops 4
 * OP17-106 Charlotte Smoothie, 4 OP17-111 Charlotte Mont-d'or, 2 OP17-115, 4
 * ST20-003 Charlotte Brulee. It changes the count of OP17-102 Charlotte Oven 4
 * to 3, OP17-104 Charlotte Cracker 4 to 2, OP17-110 Charlotte Perospero 4 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op17LinlinTournamentManifest: DeckManifest = {
  id: "(Yellow) Charlotte Linlin - ChinoizeCup #121",
  format: "standard",
  leader: "OP17-099",
  recommended: true,
  cards: {
    "EB04-058": 3,
    "OP11-106": 4,
    "OP14-104": 4,
    "OP15-113": 4,
    "OP16-119": 4,
    "OP17-102": 3,
    "OP17-103": 4,
    "OP17-104": 2,
    "OP17-107": 4,
    "OP17-109": 4,
    "OP17-110": 2,
    "OP17-112": 4,
    "OP17-113": 4,
    "OP17-114": 4,
  },
};
