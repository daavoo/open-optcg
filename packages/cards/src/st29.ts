import type { CardRecord } from "./index.js";
import { st29CardRecords } from "./generated-st29.js";

/**
 * STARTER DECK -Monkey.D.Luffy- [ST-29] identities: the Yellow {Egghead}
 * Straw Hat Crew product.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-st29.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * Its page was already in the reference snapshot before this import, read for
 * the one identity a community deck plays; the set-level record supersedes
 * that one, because it is the one that carries the printed rarity.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const st29Cards: readonly CardRecord[] = st29CardRecords;
