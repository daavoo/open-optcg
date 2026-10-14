/**
 * Printed clauses the engine does not run.
 *
 * A card whose text is only partly implemented is more dangerous than a card
 * that is missing entirely: it looks playable, so anything reading the printed
 * text -- a human, a test, an LLM agent building a turn plan -- will plan around
 * a clause that never fires. One match was lost to exactly that, an agent
 * spending eight DON!! on a body for an [On Play] Life gain listed here.
 *
 * `test/card-support.test.ts` holds this list to a ratchet: it may only shrink.
 * `promptCard` in `@one-piece-sim/agents` renders these as an explicit
 * `<unimplemented>` note so an agent never plans around one.
 */
export interface UnimplementedClause {
  cardNumber: string;
  /** The printed timing marker that does not resolve, e.g. `[On Play]`. */
  clause: string;
  /** Why it is not implemented, for whoever picks the work up. */
  reason: string;
}

/**
 * Empty, and meant to stay that way.
 *
 * The last three entries were EB03-055 Nico Robin's `[On K.O.]` and both of
 * OP16-119 Marshall.D.Teach's clauses. Each one needed a primitive the engine did
 * not have -- damage outside the battle steps, a look-at-N binding, an
 * effect-negation layer -- which is the usual reason a clause ends up here.
 * Adding an entry is a reviewable admission that a card in a shipped deck does
 * less than it says; the ratchet in `test/card-support.test.ts` will not let the
 * list grow.
 */
export const UNIMPLEMENTED_CLAUSES: readonly UnimplementedClause[] = [];

/** The clauses of `cardNumber` that the engine will not resolve. */
export function unimplementedClauses(cardNumber: string): readonly string[] {
  return UNIMPLEMENTED_CLAUSES.filter(
    (entry) => entry.cardNumber === cardNumber,
  ).map((entry) => entry.clause);
}
