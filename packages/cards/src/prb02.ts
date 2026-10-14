import type { CardRecord } from "./index.js";
import { prb02CardRecords } from "./generated-prb02.js";

/**
 * PREMIUM BOOSTER -ONE PIECE CARD GAME- [PRB-02] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-prb02.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * The premium booster is small -- 18 cards on series page 569302 -- and that
 * page was already in the reference snapshot before this import, because four
 * of its identities are played by decks the community pass reads. Those four
 * came in one at a time through that pass; the set-level record supersedes
 * them, because it is the one that carries the printed rarity.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const prb02Cards: readonly CardRecord[] = prb02CardRecords;
