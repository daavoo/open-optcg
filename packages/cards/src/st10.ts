import type { CardRecord } from "./index.js";
import { st10CardRecords } from "./generated-st10.js";

/**
 * ULTRA DECK -The Three Captains- [ST-10] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-st10.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * An Ultra Deck is not a starter: ST-10 ships three Leaders rather than one,
 * and every card in it carries a block icon, so the whole product is
 * Standard-legal. Its page was already in the reference snapshot before this
 * import -- ST10-010 arrived through the community pass, read off it for the
 * deck that plays it -- and the set-level record supersedes that one, because
 * it is the one that carries the printed rarity.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const st10Cards: readonly CardRecord[] = st10CardRecords;
