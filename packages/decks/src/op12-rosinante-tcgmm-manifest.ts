import type { DeckManifest } from "./index.js";

/**
 * Purple/Yellow Donquixote Rosinante (OP12-061) as the EB-05 field builds it:
 * the list ranked 9th in TCG Match Making's EB05 Weekly Power Rankings of 12
 * Nov 2026, drawn from high-rank online play (stats at
 * https://stats.tcgmatchmaking.com/). The post is a power ranking rather than
 * an event's results and names no pilot, so the id carries the ranking and its
 * date rather than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 12th" post
 * of 12 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-12. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * The only shipped list behind OP12-061: no product or feature deck fronts
 * the Leader. It is marked `recommended` so the Leader keeps its list when a
 * second one ships. FlyestRaven's ChinoizeCup #125 2nd-place list, "(Purple/
 * Yellow) Donquixote Rosinante - 2nd Place ChinoizeCup #125", trains as a list
 * of its own in `ml/bridge/decks.ts` with Car D. Kaizoku's TCGplayer list as
 * its variant; `op12-rosinante-policy.ts` holds the Leader's opening hand for
 * all of them, and the `midrange` root pilots the rest. Every card it plays
 * runs its printed text already (`mechanics/op12-rosinante.ts` and the cards'
 * own sets).
 *
 * Against FlyestRaven's list it adds 4 OP12-108 Donquixote Rosinante, 2
 * OP16-064 Koby, 1 ST10-010 Trafalgar Law, 1 OP09-077 Gum-Gum Lightning and 1
 * OP17-114 Sweet 3 Generals, and drops the purple flex -- OP10-065 and
 * EB05-034 Sugar, EB03-062 Trafalgar Law, OP07-076 and OP13-076.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op12RosinanteTcgmmManifest: DeckManifest = {
  id: "(Purple/Yellow) Donquixote Rosinante - TCG Match Making EB05 2026-11-12 #9",
  format: "standard",
  leader: "OP12-061",
  recommended: true,
  cards: {
    "EB04-038": 4,
    "EB04-058": 4,
    "EB05-040": 4,
    "OP09-077": 1,
    "OP12-108": 4,
    "OP12-115": 4,
    "OP15-078": 4,
    "OP16-064": 4,
    "OP16-065": 4,
    "OP16-078": 4,
    "OP17-114": 1,
    "P-088": 4,
    "P-093": 4,
    "ST10-010": 4,
  },
};
