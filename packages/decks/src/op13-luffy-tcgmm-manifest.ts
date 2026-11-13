import type { DeckManifest } from "./index.js";

/**
 * Red/Green Monkey.D.Luffy (OP13-001) as the green Land of Wano chain as the
 * EB-05 field builds it: the list ranked 2nd in TCG Match Making's EB05 Weekly
 * Power Rankings of 12 Nov 2026, drawn from high-rank online play (stats at
 * https://stats.tcgmatchmaking.com/). The post is a power ranking rather than
 * an event's results and names no pilot, so the id carries the ranking and its
 * date rather than a placing.
 *
 * Source: TCG Match Making's "EB05 Weekly Power Rankings - November 12th" post
 * of 12 Nov 2026 on its Patreon, https://www.patreon.com/tcgmatchmaking,
 * retrieved 2026-11-12. Every identity is stamped from Bandai's cardlist pages
 * already, so the audit needs no entry for it.
 *
 * It is the Leader's `recommended` list. It replaces "(Red/Green)
 * Monkey.D.Luffy - Miracle Luffy EB05" as the Leader's Community list -- a
 * shelf carries one list per Leader -- and that list stays a training list in
 * `ml/bridge/decks.ts` under its id. `op13-luffy-policy.ts` pilots it.
 *
 * Against that list it adds 2 OP10-040 The Weak Do Not Have the Right to Choose
 * How They Die and 2 ST32-001 Kin'emon. It drops 2 OP08-036 Electrical Luna and
 * 4 PRB02-003 Lucky.Roux. It changes the count of OP17-022 Shanks 1 to 3.
 *
 * Lives in its own module for the reason `op16-enel-manifest.ts` gives: so
 * `deck-provenance.ts` can read the list without importing `index.ts`.
 */
export const op13LuffyTcgmmManifest: DeckManifest = {
  id: "(Red/Green) Monkey.D.Luffy - TCG Match Making EB05 2026-11-12 #2",
  format: "standard",
  leader: "OP13-001",
  recommended: true,
  cards: {
    "EB01-013": 4,
    "EB05-001": 4,
    "OP01-055": 3,
    "OP06-033": 4,
    "OP07-022": 4,
    "OP10-040": 2,
    "OP12-023": 4,
    "OP13-016": 4,
    "OP13-031": 4,
    "OP14-031": 4,
    "OP17-022": 3,
    "ST30-004": 4,
    "ST32-001": 2,
    "ST32-002": 4,
  },
};
