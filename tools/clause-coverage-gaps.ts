/**
 * Printed clauses that no test covers yet, and why that is accepted for now.
 *
 * Keyed `<cardNumber>:<clause>`. This is a shrinking list, not a place to park
 * work: `pnpm coverage:clauses --check` fails on a clause that is neither
 * covered nor listed here, and fails again once a listed clause *is* covered,
 * so an entry cannot outlive the gap it describes.
 *
 * Every value says what would let the entry be removed.
 */
export const clauseCoverageGaps: Readonly<Record<string, string>> = {};
