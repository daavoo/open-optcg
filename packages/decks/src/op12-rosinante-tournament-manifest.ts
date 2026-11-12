import type { DeckManifest } from "./index.js";

/**
 * Purple/Yellow Donquixote Rosinante (OP12-061): FlyestRaven's list, 2nd of
 * 120 (6-1) at [EB05] ChinoizeCup #125 on 20 Oct 2026, an online event that
 * allowed EB-05 ahead of its English release.
 *
 * Source: Limitless TCG's standings and decklist for the event,
 * https://play.limitlesstcg.com/tournament/6ad092328a8383117e3ec30c/standings,
 * retrieved 2026-10-23. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list and its only shipped one. It trained
 * as a list of its own before it shipped, and it is the build of this Leader
 * the learned model wins most with against the meta field: Car D. Kaizoku's
 * list from TCGplayer's EB-05 deck article, a training variant of this one,
 * swaps three 1-ofs for 2 OP09-077 Gum-Gum Lightning and a third OP16-064
 * Koby.
 *
 * ## What the deck does
 *
 * Four names of Trafalgar Law at cost 4 -- P-093 and EB04-038 Rosinante & Law
 * add a DON!! while the deck holds no more than the opponent, ST10-010 trashes
 * two cards from a hand of 7 or more, P-088 is a +2000 Counter -- around the
 * {Navy} and {Donquixote Pirates} searchers (OP10-065 Sugar, OP16-064 Koby,
 * OP16-078 Marineford) and removal that spends DON!!: OP16-065 Sakazuki's
 * −6000, EB05-034 Sugar's −4000. The Leader takes 2 off the next big Law for a
 * DON!!, and keeps a Law from a K.O. once a turn for the top Life card.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op12RosinanteTournamentManifest: DeckManifest = {
  id: "(Purple/Yellow) Donquixote Rosinante - 2nd Place ChinoizeCup #125",
  format: "standard",
  leader: "OP12-061",
  recommended: true,
  cards: {
    "EB03-062": 1,
    "EB04-038": 4,
    "EB04-058": 4,
    "EB05-034": 2,
    "EB05-040": 4,
    "OP07-076": 1,
    "OP10-065": 4,
    "OP12-115": 4,
    "OP13-076": 1,
    "OP15-078": 4,
    "OP16-064": 2,
    "OP16-065": 4,
    "OP16-078": 4,
    "P-088": 4,
    "P-093": 4,
    "ST10-010": 3,
  },
};
