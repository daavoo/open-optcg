import type { DeckManifest } from "./index.js";

/**
 * Green/Yellow Nico Robin (EB05-010) as the EB-05 field builds it: the list
 * ranked 4th in TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026,
 * drawn from high-rank online play (stats at
 * https://stats.tcgmatchmaking.com/). The post is a power ranking rather than
 * an event's results and names no pilot, so the id carries the ranking and its
 * date rather than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 12th" post
 * of 12 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-12. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list. It replaces "(Green/Yellow) Nico Robin
 * - TCG Match Making EB05 #6" as the Leader's Community list -- a shelf carries
 * one list per Leader -- and that list stays a training list in
 * `ml/bridge/decks.ts` under its id. `eb05-robin-policy.ts` pilots it.
 *
 * Against that list it adds 4 EB05-057 Nojiko, 4 OP09-106 Nico Olvia, 2
 * OP13-031 Trafalgar Law, 4 OP13-113 Lilith and 2 OP14-118 You'll Frighten
 * Me... ♡. It drops 2 EB04-058 Borsalino, 4 OP12-112 Baby 5, 4 OP17-102
 * Charlotte Oven and 4 OP17-107 Charlotte Daifuku. It changes the count of
 * OP06-115 You're the One Who Should Disappear. 2 to 1, OP17-022 Shanks 2 to 3
 * and OP17-112 Charlotte Linlin 4 to 2.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const eb05RobinTcgmmManifest: DeckManifest = {
  id: "(Green/Yellow) Nico Robin - TCG Match Making EB05 2026-11-12 #4",
  format: "standard",
  leader: "EB05-010",
  recommended: true,
  cards: {
    "EB04-018": 4,
    "EB05-016": 4,
    "EB05-050": 4,
    "EB05-052": 4,
    "EB05-055": 4,
    "EB05-057": 4,
    "OP06-115": 1,
    "OP09-106": 4,
    "OP13-031": 2,
    "OP13-113": 4,
    "OP14-118": 2,
    "OP17-022": 3,
    "OP17-109": 4,
    "OP17-112": 2,
    "OP17-114": 4,
  },
};
