import type { DeckManifest } from "./index.js";

/**
 * Yellow Enel (OP05-098) as the EB-05 field builds it: the list ranked 6th in
 * TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026, drawn from
 * high-rank online play (stats at https://stats.tcgmatchmaking.com/). The post
 * is a power ranking rather than an event's results and names no pilot, so the
 * id carries the ranking and its date rather than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 12th" post
 * of 12 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-12. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list. It replaces "(Yellow) Enel - TCG Match
 * Making OP17.5 #3" as the Leader's Community list -- a shelf carries one list
 * per Leader -- and that list stays a training list in `ml/bridge/decks.ts`
 * under its id. `op05-enel-policy.ts` pilots it.
 *
 * Against that list it adds 2 EB05-060 Take Care of Lilith!!! and 3 OP17-110
 * Charlotte Perospero. It drops 4 OP13-113 Lilith. It changes the count of
 * EB02-052 Enel 2 to 1.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op05EnelTcgmmManifest: DeckManifest = {
  id: "(Yellow) Enel - TCG Match Making EB05 2026-11-12 #6",
  format: "standard",
  leader: "OP05-098",
  recommended: true,
  cards: {
    "EB02-052": 1,
    "EB04-058": 4,
    "EB05-060": 2,
    "OP06-115": 4,
    "OP11-106": 4,
    "OP15-103": 4,
    "OP16-119": 4,
    "OP17-102": 4,
    "OP17-107": 4,
    "OP17-109": 4,
    "OP17-110": 3,
    "OP17-112": 4,
    "OP17-113": 4,
    "OP17-114": 4,
  },
};
