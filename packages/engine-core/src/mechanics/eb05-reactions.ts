/**
 * The "when X happens" clauses EB-05 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const eb05ReactionRules: readonly ReactionRule[] = [
  // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
  // -- Blue and Purple: EB05-021 to EB05-040 --
  // -- Black and Yellow: EB05-041 to EB05-060 --
];
