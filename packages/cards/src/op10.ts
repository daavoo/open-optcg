import type { CardRecord } from "./index.js";
import { op10CardRecords } from "./generated-op10.js";

/**
 * OP10 "Royal Blood" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569110), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op10.ts`.
 * This file only declares what the engine does with them.
 *
 * A handful of these identities predate the import: they are what the community
 * decks in `packages/decks/src` happen to play, and they arrived one deck at a
 * time through the community pass into `generated.ts`. The set import replaces
 * those records, because a card number must have one source of truth and this is
 * the one carrying the printed rarity a booster slot is filled by.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op10Cards: readonly CardRecord[] = op10CardRecords;
