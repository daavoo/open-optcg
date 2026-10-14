import { printedClauses, type ClauseId } from "@one-piece-sim/cards";

/**
 * Declares which printed clauses of a card the surrounding tests exercise.
 *
 * ```ts
 * describe("ST36-002 Killer", () => {
 *   covers("ST36-002", "[On Play]", "[Trigger]");
 *   it("adds a DON!! when the Leader has the type", () => { ... });
 * });
 * ```
 *
 * `pnpm coverage:clauses --check` reads these annotations off disk and fails on
 * a printed clause no test claims, which is what makes "a new card ships with
 * tests for all of its effects" a gate rather than a habit. Statically, so a
 * deleted test file is a failure rather than a clause that quietly stops being
 * required.
 *
 * The call is not decoration: it throws when the card does not print the clause,
 * so an annotation cannot survive the card text changing under it, and a
 * copy-pasted `covers()` cannot claim coverage the file does not have.
 *
 * Put it at the top of the `describe` whose assertions drive the clause. One
 * clause may be listed by several files -- a card that only misbehaves against
 * another specific card belongs in whichever file owns that interaction.
 */
export function covers(cardNumber: string, ...clauses: ClauseId[]): void {
  const printed = printedClauses(cardNumber);
  if (clauses.length === 0) {
    throw new Error(
      `covers("${cardNumber}") declares no clause; printed: ${printed.join(", ") || "(none)"}`,
    );
  }
  for (const clause of clauses) {
    if (!printed.includes(clause)) {
      throw new Error(
        `covers("${cardNumber}", "${clause}"): ${cardNumber} does not print that clause; printed: ${printed.join(", ") || "(none)"}`,
      );
    }
  }
}
