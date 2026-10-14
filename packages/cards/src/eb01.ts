import type { CardRecord } from "./index.js";
import { eb01CardRecords } from "./generated-eb01.js";

/**
 * EXTRA BOOSTER -MEMORIAL COLLECTION- [EB-01] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-eb01.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * Like EB-02 and EB-03, the extra booster has a series page of its own
 * (569201), so its 61 cards are read from one file. Every one of them is
 * stamped block 2, so the whole set is Standard-legal under the current floor
 * -- which is what made it the largest remaining hole in the pool. Before this
 * import a single identity reached the registry through the community pass
 * (EB01-048 Laboon, read from the page of the ST-27 deck that plays it); the
 * set-level record supersedes it, because it is the one that carries the
 * printed rarity.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const eb01Cards: readonly CardRecord[] = eb01CardRecords;
