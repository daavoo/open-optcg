import type { DeckManifest } from "./index.js";

/**
 * Blue Buggy (OP09-042) as the EB-05 field builds it: the list ranked 3rd in
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
 * stays on its own shelf unmarked. It replaces "(Blue) Buggy - 12th Place
 * ChinoizeCup #124" as the Leader's Community list -- a shelf carries one list
 * per Leader -- and that list stays a training list in `ml/bridge/decks.ts`
 * under its id. `op09-buggy-policy.ts` pilots it.
 *
 * Against that list it adds 4 OP12-049 Buggy and 2 OP16-051 Mohji & Cabaji. It
 * drops 2 EB03-021 Alvida, 2 EB05-028 Boa Hancock and 2 ST33-004 Borsalino. It
 * changes the count of OP06-058 Gravity Blade Raging Tiger 2 to 4, OP09-048
 * Dracule Mihawk 4 to 3 and ST25-001 Alvida 4 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op09BuggyTcgmmManifest: DeckManifest = {
  id: "(Blue) Buggy - TCG Match Making EB05 2026-11-12 #3",
  format: "standard",
  leader: "OP09-042",
  recommended: true,
  cards: {
    "EB05-021": 4,
    "OP06-058": 4,
    "OP09-048": 3,
    "OP09-051": 4,
    "OP09-056": 4,
    "OP09-057": 4,
    "OP12-049": 4,
    "OP16-051": 2,
    "OP16-056": 4,
    "P-084": 2,
    "ST25-001": 3,
    "ST25-002": 4,
    "ST25-003": 4,
    "ST25-005": 4,
  },
};
