import type { CardRecord } from "./index.js";
import { op07CardRecords } from "./generated-op07.js";

/**
 * OP07 "500 Years in the Future" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569107), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op07.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op07Cards: readonly CardRecord[] = op07CardRecords;
