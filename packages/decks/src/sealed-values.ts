/**
 * The sealed auto-builder that reads measured card values: keep the pool's
 * forty highest-valued copies.
 *
 * A value is win-rate points per copy against the average card in a sealed
 * deck, as the learned model plays the set: the coefficient of a ridge
 * logistic regression of the winner on the two decks' card counts, over
 * model-against-itself games between random, GRAPE-built and mixed 40-card
 * decks from freshly opened pools. Random decks are what make it a value and
 * not a taste: whether a card is in one is close to chance, so its
 * coefficient is not borrowed from the builder that kept it. The fit is
 * additive, so the forty best copies are also the forty that maximise it.
 *
 * The values belong to one model on one set and are refit when either
 * changes. An expansion without a table is built by GRAPE, as before.
 */
import {
  autoBuildSealedDeckGrape,
  playablePoolCards,
  SEALED_DECK_SIZE,
  type RankedSealedCandidate,
  type SealedDeck,
  type SealedPool,
} from "./sealed.js";
import { OP18_CARD_VALUES } from "./sealed-values-op18.js";

/** Expansion -> card number -> win-rate points per copy. */
export const SEALED_CARD_VALUES: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = {
  OP18: OP18_CARD_VALUES,
};

export function hasSealedCardValues(expansion: string): boolean {
  return expansion in SEALED_CARD_VALUES;
}

/**
 * Every playable copy in the pool, best first by measured value, ties to the
 * lower card number. A card the table does not list counts as average, which
 * is what a value of 0 means. `score` is the negated value, lower being
 * better as in the other rankings.
 */
export function rankSealedPoolCandidatesValue(
  pool: SealedPool,
): RankedSealedCandidate[] {
  const values = SEALED_CARD_VALUES[pool.expansion] ?? {};
  const candidates: RankedSealedCandidate[] = [];
  for (const [cardNumber, count] of playablePoolCards(pool))
    for (let copy = 0; copy < count; copy += 1)
      candidates.push({ cardNumber, score: -(values[cardNumber] ?? 0) });
  return candidates.sort(
    (left, right) =>
      left.score - right.score ||
      left.cardNumber.localeCompare(right.cardNumber),
  );
}

/** The deck the app builds for a pool: by value where the set has a table,
    by GRAPE where it does not. */
export function autoBuildSealedDeckBest(pool: SealedPool): SealedDeck {
  if (!hasSealedCardValues(pool.expansion))
    return autoBuildSealedDeckGrape(pool);
  const cards: Record<string, number> = {};
  for (const candidate of rankSealedPoolCandidatesValue(pool).slice(
    0,
    SEALED_DECK_SIZE,
  ))
    cards[candidate.cardNumber] = (cards[candidate.cardNumber] ?? 0) + 1;
  return { cards };
}
