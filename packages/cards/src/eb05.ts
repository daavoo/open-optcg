import type { CardRecord } from "./index.js";
import { eb05CardRecords } from "./generated-eb05.js";

/**
 * EXTRA BOOSTER -ONE PIECE HEROINES EDITION vol.2- [EB-05] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-eb05.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * Like EB-03 the extra booster has a series page of its own (569205), so its
 * 61 cards are read from one file.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const eb05Cards: readonly CardRecord[] = eb05CardRecords;
