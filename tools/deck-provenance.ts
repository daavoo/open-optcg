/**
 * Where each shipped deck's printed text came from, and whether the deck is a
 * legal 50 behind one Leader.
 *
 * `--check` fails on a bad row; without it the rows are dumped as JSON. This
 * does not check test coverage -- `pnpm coverage:clauses --check` does, from
 * the printed text and the `covers()` annotations, which is the only form of
 * evidence that has to exist to pass.
 */
import {
  communityDeckCardRows,
  deckCardRows,
  formatDeckCardRows,
  validateDeckCardRows,
} from "@one-piece-sim/decks";

const checkOnly = process.argv.includes("--check");
const errors = validateDeckCardRows();

if (!checkOnly) {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 2,
        rows: formatDeckCardRows,
        communityRows: communityDeckCardRows,
        errors,
      },
      null,
      2,
    )}\n`,
  );
} else if (errors.length === 0) {
  process.stdout.write(
    `Deck provenance valid: ${deckCardRows.length} identities\n`,
  );
} else {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
}
