import type { CardRecord } from "./index.js";
import { op17CardRecords } from "./generated-op17.js";

/**
 * OP17 "The World's Strongest Warrior" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569117), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op17.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * ## Why it was hand-authored until 2026-08-21
 *
 * Bandai published OP17 on neither its English nor its Asia-English cardlist
 * for the first year of the set's life, so there was no primary source to
 * audit against. The 119
 * records were hand-imported from the egman secondary source
 * (https://deckbuilder.egmanevents.com), corrected by hand against the
 * official SAMPLE preview images, and carried nine type-casing splits, three
 * replacement characters and six curly apostrophes that had to be normalized
 * before clause markers would match. Bandai listing the set replaced all of
 * that with one parse, and the primary text corrected far more than the
 * hand-audit had found: see `docs/op17-primary-source-corrections.md` for what
 * moved, including two cards whose printed numbers were simply wrong.
 *
 * `test/card-data-consistency.test.ts` still holds the registry-wide
 * invariants the hand import taught us to check.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op17Cards: readonly CardRecord[] = op17CardRecords;
