import type { CardRecord } from "./index.js";
import { op09CardRecords } from "./generated-op09.js";

/**
 * OP09 "Emperors in the New World" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569109), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op09.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * The set is block 3, so every identity here is Standard-legal under the
 * block-2 floor, and it carries the only Nico Robin Leader printed to date.
 *
 * Every printed clause of all 119 is driven by a scenario test: `test/op09.test.ts`
 * for the set, `test/op09-robin.test.ts` for the three the shipped deck plays,
 * and the deck files named in `mechanics/README.md` for the seven that were in
 * the pool before the set was.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op09Cards: readonly CardRecord[] = op09CardRecords;
