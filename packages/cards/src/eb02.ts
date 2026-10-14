import type { CardRecord } from "./index.js";
import { eb02CardRecords } from "./generated-eb02.js";

/**
 * EXTRA BOOSTER -ANIME 25TH COLLECTION- [EB-02] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-eb02.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * Like EB-03 and unlike EB-04, the extra booster has a series page of its own
 * (569202), so its 61 cards are read from one file. Before this import the
 * pool carried the single identity a community deck happened to play
 * (EB02-017), read from the page of that deck rather than from the card's own
 * listing; the set-level record supersedes it, because it is the one that
 * carries the printed rarity.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const eb02Cards: readonly CardRecord[] = eb02CardRecords;
