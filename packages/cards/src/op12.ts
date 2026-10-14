import type { CardRecord } from "./index.js";
import { op12CardRecords } from "./generated-op12.js";

/**
 * OP12 "Legacy of the Master" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569112), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op12.ts`.
 * This file only declares what the engine does with them.
 *
 * Twenty-four of these identities predate the import: they are what
 * `OP12-ROSINANTE-AYASHIZO` plays, and they were hand-authored beside that deck
 * in `op12-rosinante.ts`. Their *behaviour* stays in `mechanics/op12-rosinante.ts`,
 * the same split OP14 and OP15 kept; their *records* are replaced here, because
 * a card number must have one source of truth and this is the one carrying the
 * printed rarity a booster slot is filled by.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op12Cards: readonly CardRecord[] = op12CardRecords;
