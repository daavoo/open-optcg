import type { CardRecord } from "./index.js";
import { op16CardRecords } from "./generated-op16.js";

/**
 * OP16 "Uta's Song" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569116), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op16.ts`.
 * This file only declares what the engine does with them.
 *
 * Fourteen of these identities predate the import: they are what the
 * `OP16-LUFFY-IMPELDOWN`, `OP16-NAMI-6738` and `OP16-ENEL-SHONEN` decks play,
 * and they were hand-authored beside those decks before the set had a primary
 * record. The import replaced the hand-typed text, which had drifted from the
 * printed wording on five cards; `docs/op15-op16-import.md` records what moved.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op16Cards: readonly CardRecord[] = op16CardRecords;
