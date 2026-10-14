import type { CardRecord } from "./index.js";
import { st24CardRecords } from "./generated-st24.js";

/**
 * ULTRA DECK -The Monster Trio- [ST-24] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-st24.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * Its page was already in the reference snapshot before this import, read for
 * the two identities community decks play; the set-level records supersede
 * those, because they are the ones that carry the printed rarity.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const st24Cards: readonly CardRecord[] = st24CardRecords;
