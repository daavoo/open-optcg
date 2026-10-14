import type { CardRecord } from "./index.js";
import { op15CardRecords } from "./generated-op15.js";

/**
 * OP15 "A Fist of Divine Speed" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569115), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op15.ts`.
 * That page lists EB04 alongside OP15, so the audit filters on the `OP15-`
 * prefix; this file only declares what the engine does with the result.
 *
 * ## Why the set arrived in two halves
 *
 * Thirteen OP15 identities were in the pool long before the set was: they are
 * what `OP16-ENEL-SHONEN` and `OP16-NAMI-6738` happen to play, so they were
 * hand-authored into `op16-enel.ts` and `op16-nami.ts` next to the decks that
 * needed them. Importing the series replaced those hand-typed records with the
 * primary text, and brought the other 106 with it.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op15Cards: readonly CardRecord[] = op15CardRecords;
