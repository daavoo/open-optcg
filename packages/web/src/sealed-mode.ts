import {
  openPacks,
  requireSealedExpansion,
  sealedExpansion,
  sealedPoolIsBuildable,
  DEFAULT_SEALED_EXPANSION,
  SEALED_EXPANSIONS,
  SEALED_PACK_COUNT,
  type SealedPool,
} from "@one-piece-sim/decks";

/**
 * Pack counts to try, in order, when the seeded 6-pack draw can't reach 40
 * playable cards yet.
 *
 * Every expansion in `SEALED_EXPANSIONS` is fully implemented, so this never
 * reaches past the first entry today. It stays as the safety net for the window
 * in which a new expansion is being landed: opening more packs from the same
 * seed is the same fallback `test/sealed.test.ts` uses to exercise the format
 * ahead of full coverage, and each larger count continues the same seeded draw
 * rather than restarting it, so the first 6 packs of a 10-pack pool are
 * identical to a genuine 6-pack pool.
 */
const PACK_COUNT_ESCALATION: readonly number[] = [
  SEALED_PACK_COUNT,
  8,
  10,
  14,
  20,
  28,
  40,
];

export interface OpenedSealedPool {
  readonly pool: SealedPool;
  /** How many packs it took to reach a buildable pool -- >6 only while coverage is incomplete. */
  readonly packsOpened: number;
}

export function openSealedPool(
  seed: string,
  expansion: string = DEFAULT_SEALED_EXPANSION,
): OpenedSealedPool {
  let attempt: OpenedSealedPool | undefined;
  for (const packCount of PACK_COUNT_ESCALATION) {
    const pool = openPacks(seed, packCount, expansion);
    attempt = { pool, packsOpened: packCount };
    if (sealedPoolIsBuildable(pool).buildable) return attempt;
  }
  return attempt!;
}

/**
 * A pool that contains exactly an imported deck list, nothing more --
 * bypasses booster opening entirely. `validateSealedDeck` checks a deck's
 * quantities against `poolCounts(pool)`, so a pool built from the deck's own
 * cards makes every quantity satisfy "at most what's opened" by construction;
 * the only way it can still fail validation is the ordinary reasons (wrong
 * card count, an unknown or unimplemented card).
 */
export function poolFromDeckList(
  cards: Readonly<Record<string, number>>,
  expansion: string = DEFAULT_SEALED_EXPANSION,
): SealedPool {
  const flattened = Object.entries(cards).flatMap(([cardNumber, quantity]) =>
    Array<string>(quantity).fill(cardNumber),
  );
  return {
    seed: "imported",
    expansion: requireSealedExpansion(expansion).code,
    packCount: 0,
    packs: [],
    cards: flattened,
  };
}

/**
 * The expansion an imported list came out of, read off its cards.
 *
 * An imported list carries no expansion of its own, and the one it is filed
 * under decides what the builder says it is and which pool the AI opens against
 * it. Deciding by majority rather than by the first card, because sealed permits
 * a list that mixes sets -- the pool is what constrains a deck, and an imported
 * list *is* its own pool (see {@link poolFromDeckList}) -- so the answer is
 * "which expansion is this mostly", not "which set is card one from".
 */
export function expansionOfDeckList(
  cards: Readonly<Record<string, number>>,
): string {
  const counts = new Map<string, number>();
  for (const [cardNumber, quantity] of Object.entries(cards)) {
    const code = cardNumber.slice(0, cardNumber.indexOf("-"));
    if (!sealedExpansion(code)) continue;
    counts.set(code, (counts.get(code) ?? 0) + quantity);
  }
  // Ties broken by expansion order, so the same list always files the same way.
  let best = DEFAULT_SEALED_EXPANSION;
  let bestCount = 0;
  for (const { code } of SEALED_EXPANSIONS) {
    const count = counts.get(code) ?? 0;
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}
