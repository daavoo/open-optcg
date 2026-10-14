/**
 * Which constructed format each shipped deck is built for, and whether its
 * identities hold up in it.
 *
 * `--check` fails on a deck that declares Standard and names a printing that
 * has rotated out; without it, every deck is dumped with its format and the
 * block icons its identities carry. The rule is the same one
 * `pnpm decks:provenance:check` enforces -- both read
 * `blockIconLegality` over the same rows -- so this adds no second opinion,
 * only a report grouped by deck rather than by row.
 *
 * Legality is per printing: a card is Standard-legal when any one of its
 * printings sits in a block at or above the floor, or carries the `X` icon
 * that never rotates. The floor is dated and per region; see
 * `packages/cards/src/block-icons.ts`.
 */
import {
  STANDARD_FLOORS,
  DEFAULT_FORMAT_REGION,
  blockPrintingSnapshot,
} from "@one-piece-sim/cards";
import { deckFormatReport } from "@one-piece-sim/decks";

const checkOnly = process.argv.includes("--check");
const reports = deckFormatReport().sort((left, right) =>
  left.deckId.localeCompare(right.deckId),
);
const floor = STANDARD_FLOORS[DEFAULT_FORMAT_REGION];
const failing = reports.filter((report) => report.illegal.length > 0);

if (!checkOnly) {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        snapshot: blockPrintingSnapshot,
        region: DEFAULT_FORMAT_REGION,
        standardFloor: floor,
        decks: reports,
      },
      null,
      2,
    )}\n`,
  );
} else if (failing.length === 0) {
  const standard = reports.filter(
    (report) => report.format === "standard",
  ).length;
  process.stdout.write(
    `Deck formats valid: ${standard} Standard, ${reports.length - standard} Extra, against the block ${floor.block} floor of ${floor.effectiveFrom}\n`,
  );
} else {
  for (const report of failing) {
    for (const card of report.illegal) {
      process.stderr.write(
        `${report.deckId}:${card.cardNumber}: ${card.reason}\n`,
      );
    }
    process.stderr.write(
      `${report.deckId}: declares "${report.format}" -- declare "extra" or replace the rotated-out slots\n`,
    );
  }
  process.exitCode = 1;
}
