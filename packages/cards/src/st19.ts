import type { CardRecord } from "./index.js";
import { st19CardRecords } from "./generated-st19.js";

/**
 * ULTRA DECK -Smoker- [ST-19] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-st19.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * Every identity here was in the pool only as a block icon a reprint on
 * another page carries: nothing read this page until now.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const st19Cards: readonly CardRecord[] = st19CardRecords;
