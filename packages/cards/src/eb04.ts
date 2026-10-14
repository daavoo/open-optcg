import type { CardRecord } from "./index.js";
import { eb04CardRecords } from "./generated-eb04.js";

/**
 * EXTRA BOOSTER -EGGHEAD CRISIS- [EB-04] identities.
 *
 * Printed data comes from Bandai's own card list, through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-eb04.ts`
 * like every other set. This file only declares what the engine does with
 * them; edit the pipeline, not the records.
 *
 * ## Why the import reads two pages
 *
 * Bandai gives the extra booster no series page of its own. Its 61 cards are
 * listed alongside two boosters instead -- 31 on the OP14 page (series
 * 569114) and 30 on the OP15 page (series 569115) -- so the audit's EB04
 * entry is the only one that reads more than one file. Before this import the
 * pool carried the 15 identities the Bonney feature deck and three community
 * decks happened to play, each read from the page of the deck that plays it;
 * the set-level record supersedes those, because it is the one that carries
 * the printed rarity and the wording from the card's own listing.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const eb04Cards: readonly CardRecord[] = eb04CardRecords;
