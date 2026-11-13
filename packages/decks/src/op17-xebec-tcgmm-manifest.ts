import type { DeckManifest } from "./index.js";

/**
 * Blue Rocks.D.Xebec (OP17-039) as the EB-05 field builds it: the list ranked
 * 1st in TCG Match Making's EB05 Weekly Power Rankings of 12 Nov 2026, drawn
 * from high-rank online play (stats at https://stats.tcgmatchmaking.com/). The
 * post is a power ranking rather than an event's results and names no pilot, so
 * the id carries the ranking and its date rather than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 12th" post
 * of 12 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-12. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list, over Bandai's feature deck, which
 * stays on its own shelf unmarked. It replaces "(Blue) Rocks.D.Xebec - Open
 * OPTCG" as the Leader's Community list -- a shelf carries one list per Leader
 * -- and that list stays a training list in `ml/bridge/decks.ts` under its id.
 * `op17-xebec-policy.ts` pilots it.
 *
 * Against that list it adds 2 EB05-028 Boa Hancock. It changes the count of
 * OP08-051 Buckin 3 to 2, OP17-042 Kaido 2 to 3, OP17-044 Captain John 2 to 1,
 * OP17-050 Streusen 4 to 2 and OP17-052 Don Marlon 3 to 4.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op17XebecTcgmmManifest: DeckManifest = {
  id: "(Blue) Rocks.D.Xebec - TCG Match Making EB05 2026-11-12 #1",
  format: "standard",
  leader: "OP17-039",
  recommended: true,
  cards: {
    "EB05-028": 2,
    "OP08-051": 2,
    "OP17-040": 4,
    "OP17-042": 3,
    "OP17-044": 1,
    "OP17-045": 4,
    "OP17-046": 4,
    "OP17-048": 4,
    "OP17-049": 4,
    "OP17-050": 2,
    "OP17-052": 4,
    "OP17-054": 4,
    "OP17-055": 4,
    "OP17-056": 4,
    "OP17-118": 4,
  },
};
