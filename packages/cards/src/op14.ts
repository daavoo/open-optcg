import type { CardRecord } from "./index.js";
import { op14CardRecords } from "./generated-op14.js";

/**
 * OP14 "Extreme Battle!!" booster identities.
 *
 * Printed data comes from Bandai's own card list
 * (https://en.onepiece-cardgame.com/cardlist/?series=569114), through
 * `pnpm reference:fetch` + `pnpm reference:audit` into `generated-op14.ts`.
 * That page lists EB04 alongside OP14, so the audit filters on the `OP14-`
 * prefix; this file only declares what the engine does with the result.
 *
 * ## Why the set arrived in two halves
 *
 * Seven OP14 identities were in the pool long before the set was: they are what
 * `OP16-NAMI-6738` and `OP12-ROSINANTE-AYASHIZO` happen to play, plus OP14-015
 * Roronoa Zoro from the ST31-36 format pool. Their *behaviour* stays in the
 * modules named after those decks -- `mechanics/op16-nami.ts`,
 * `mechanics/op12-rosinante.ts`, `static-abilities.ts` and `actions/attack.ts`
 * -- the same split OP15 kept when its Enel identities stayed in
 * `mechanics/op16-enel.ts`. Their *records* are replaced here, because a card
 * number must have one source of truth and this is the one carrying the
 * primary-text provenance stamp and the printed rarity.
 */

/**
 * Every record, as the pipeline produced it.
 *
 * There is no per-card support flag to apply: a printed clause the engine does
 * not run is declared in `unimplemented-clauses.ts` and held to a ratchet by
 * `test/card-support.test.ts`, so a card in this set either runs its text or
 * names the clause it drops.
 */
export const op14Cards: readonly CardRecord[] = op14CardRecords;
