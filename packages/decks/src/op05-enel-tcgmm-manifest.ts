import type { DeckManifest } from "./index.js";

/**
 * Yellow Enel (OP05-098) as the OP17.5 field builds it: the Yellow Enel list
 * ranked 3rd of the top ten in TCG Match Making's OP17.5 Weekly Power Rankings
 * of 22 Oct 2026, drawn from high-rank online play after the OP14-020 Mihawk
 * ban. The post names no pilot or event, so the id carries the ranking rather
 * than a placing.
 *
 * Source: TCG Match Making's OP17.5 Weekly Power Rankings post of 22 Oct 2026
 * on its Patreon, https://www.patreon.com/tcgmatchmaking, retrieved 2026-10-22.
 * Every identity is stamped from Bandai's cardlist pages already, so the audit
 * needs no entry for it.
 *
 * It is the Leader's `recommended` list: of the Enel builds in the learned
 * model's training pool it is the one that model wins most with against the
 * meta field. It replaces "(Yellow) Enel - Open OPTCG" as the Leader's
 * Community list -- a shelf carries one list per Leader -- and that list stays
 * a training list in `ml/bridge/decks.ts` under its id. The same rules policy
 * pilots both.
 *
 * Against that list it adds 2 EB02-052 Enel, 4 OP13-113 Lilith, 4 OP15-103
 * Genbo, 4 OP17-113 Streusen. It drops 2 EB01-056 Charlotte Flampe, 4 EB01-059
 * Kingdom Come, 2 OP06-117 The Ark Maxim, 4 OP15-113 Roronoa Zoro, 3 OP17-106
 * Charlotte Smoothie. It changes the count of OP17-114 Sweet 3 Generals 3 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op05EnelTcgmmManifest: DeckManifest = {
  id: "(Yellow) Enel - TCG Match Making OP17.5 #3",
  format: "standard",
  leader: "OP05-098",
  recommended: true,
  cards: {
    "EB02-052": 2,
    "EB04-058": 4,
    "OP06-115": 4,
    "OP11-106": 4,
    "OP13-113": 4,
    "OP15-103": 4,
    "OP16-119": 4,
    "OP17-102": 4,
    "OP17-107": 4,
    "OP17-109": 4,
    "OP17-112": 4,
    "OP17-113": 4,
    "OP17-114": 4,
  },
};
