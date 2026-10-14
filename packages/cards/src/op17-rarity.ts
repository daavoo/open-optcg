import type { CardRarity } from "./index.js";
import { op17CardRecords } from "./generated-op17.js";

/**
 * OP17 print rarity, for sealed booster-pack generation.
 *
 * Rarity is the one printed fact a sealed pool depends on: a pack is defined
 * by its rarity slots, so without this a "booster" is just a random sample of
 * the set.
 *
 * Sourced from Bandai's card list through `pnpm reference:audit`, which reads
 * the base print's rarity for each card number -- an alt-art reprint is listed
 * again under a collector rarity like `TR`, and that is not what a pack slot
 * fills. The set's composition is `L 6 / C 45 / UC 30 / R 26 / SR 10 / SEC 2`;
 * `test/op17-rarity.test.ts` pins it.
 *
 * Before Bandai listed the set this table was hand-typed from Limitless TCG,
 * which had OP17-011 at R and OP17-069 at C where the primary record says C
 * and UC.
 */
export const OP17_RARITY: Readonly<Record<string, CardRarity>> =
  Object.fromEntries(
    op17CardRecords.map((card) => [card.cardNumber, card.rarity]),
  );

/**
 * Cards whose rarity is inferred rather than sourced.
 *
 * Kept as data so anything reporting a pool can mark them, rather than the
 * caveat living only in a comment nobody reads at the point of use.
 *
 * Empty, and now structurally so: every rarity comes from the primary source
 * with the rest of the card's printed data, so there is nothing left to infer.
 */
export const OP17_INFERRED_RARITY: ReadonlySet<string> = new Set([]);
