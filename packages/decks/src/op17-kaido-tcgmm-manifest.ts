import type { DeckManifest } from "./index.js";

/**
 * Purple Kaido (OP17-058) as the EB-05 field builds it: the list ranked 5th in
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
 * It is the Leader's `recommended` list, over Bandai's feature deck, which
 * stays on its own shelf unmarked. It replaces "(Purple) Kaido - Open OPTCG" as
 * the Leader's Community list -- a shelf carries one list per Leader -- and
 * that list stays a training list in `ml/bridge/decks.ts` under its id.
 * `op17-kaido-policy.ts` pilots it.
 *
 * Against that list it adds 1 EB04-040 Flame Dragon Torch, 4 EB05-037 Black
 * Maria, 4 OP15-069 Nola and 1 OP17-060 Ulti & Page One. It drops 3 OP07-076
 * Slow-Slow Beam Sword, 2 OP08-074 Black Maria, 2 OP08-077 Conquest of the Sea,
 * 4 OP17-062 Kaido, 3 OP17-063 Kaido and 3 ST34-004 Charlotte Linlin. It
 * changes the count of EB04-030 Kaido 2 to 4, OP15-078 Mamaragan 3 to 4,
 * OP17-061 Lead Performers 3 to 4, OP17-065 Queen 2 to 4, OP17-074 Yamato 4 to
 * 3 and OP17-075 X.Drake 2 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op17KaidoTcgmmManifest: DeckManifest = {
  id: "(Purple) Kaido - TCG Match Making EB05 2026-11-12 #5",
  format: "standard",
  leader: "OP17-058",
  recommended: true,
  cards: {
    "EB04-030": 4,
    "EB04-031": 4,
    "EB04-032": 4,
    "EB04-040": 1,
    "EB05-037": 4,
    "OP07-077": 4,
    "OP15-069": 4,
    "OP15-078": 4,
    "OP17-060": 1,
    "OP17-061": 4,
    "OP17-065": 4,
    "OP17-073": 4,
    "OP17-074": 3,
    "OP17-075": 4,
    "OP17-076": 1,
  },
};
