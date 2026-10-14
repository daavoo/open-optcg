import type { CardRecord } from "./index.js";
import { op13CardRecords } from "./generated-op13.js";

/**
 * OP13 "Carrying On His Will" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569113), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op13.ts`.
 * This file only declares what the engine does with them.
 *
 * Fifteen of these identities predate the import: they are what
 * `OP13-SABO-FLAME` plays, and they arrived through the community-deck pass into
 * `generated.ts` one deck at a time. The set import replaces those records,
 * because a card number must have one source of truth and this is the one
 * carrying the printed rarity a booster slot is filled by.
 *
 * The set is 120 cards rather than the standard 119, and the extra one is a
 * third SEC rather than a seventh Leader -- which is why `test/set-rarity.test.ts`
 * carries a per-set SEC count instead of one shared composition.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op13Cards: readonly CardRecord[] = op13CardRecords;
