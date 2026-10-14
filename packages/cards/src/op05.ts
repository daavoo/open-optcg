import type { CardRecord } from "./index.js";
import { op05CardRecords } from "./generated-op05.js";

/**
 * OP05 "Awakening of the New Era" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569105), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op05.ts`
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
export const op05Cards: readonly CardRecord[] = op05CardRecords;
