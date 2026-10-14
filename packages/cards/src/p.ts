import type { CardRecord } from "./index.js";
import { pCardRecords } from "./generated-p.js";

/**
 * The `P-` promotional cards identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-p.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * These are not a set. They are printed one at a time, in event packs,
 * tournament kits and magazine inserts, and Bandai lists them together on one
 * page because there is nowhere else to put them. What they share is a rarity
 * and a number prefix, not a product, a colour or a block -- so nothing here
 * reads as a set's design, and the module exists only because the audit needs
 * one output per series entry.
 *
 * Several were in the pool before this import, read off the page for the decks
 * that play them; the set-level records supersede those, because they are the
 * ones that carry the printed rarity.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const pCards: readonly CardRecord[] = pCardRecords;
