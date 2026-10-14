import type { CardRecord } from "./index.js";
import { eb03CardRecords } from "./generated-eb03.js";

/**
 * EXTRA BOOSTER -MEMORIAL COLLECTION- [EB-03] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-eb03.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * Unlike EB-04, the extra booster has a series page of its own (569203), so
 * its 62 cards are read from one file. Before this import the pool carried the
 * six identities four community decks and the sealed pool happened to play,
 * each read from the page of the deck that plays it; the set-level record
 * supersedes those, because it is the one that carries the printed rarity and
 * the wording from the card's own listing.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const eb03Cards: readonly CardRecord[] = eb03CardRecords;
