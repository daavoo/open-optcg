/**
 * Bulk rules-vs-rules OP17 sealed simulation, aggregated into a per-card
 * pick-rate report: for every card that showed up in an opened pool, how often
 * the auto-builder kept it, and how the seats that kept it fared against the
 * seats that cut it. See `packages/cli/src/sealed-analysis.ts` for the
 * association-not-causation caveat this inherits from `analytics.ts`.
 *
 * `--builder grape` (default `heuristic`) points both seats at
 * `autoBuildSealedDeckGrape` instead of the plain curve-only heuristic.
 *
 * Usage:
 *   pnpm sealed:analysis [--seeds 200] [--seed-prefix sealed-analysis]
 *     [--builder heuristic|grape] [--max-actions 800] [--min-games 3]
 *     [--top 25] [--output report.json] [--json]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DECK_BUILDERS,
  MIN_CARD_SAMPLE_GAMES,
  impactRows,
  runSealedAnalysis,
  summarizeCardPicks,
  usageRows,
  type CardPickStatistics,
  type SealedAnalysisSummary,
} from "../packages/cli/src/sealed-analysis.js";

interface CliOptions {
  [key: string]: string | boolean | undefined;
}

function parseOptions(arguments_: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (!argument.startsWith("--")) continue;
    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    if (!rawKey) continue;
    if (inlineValue !== undefined) options[rawKey] = inlineValue;
    else if (arguments_[index + 1] && !arguments_[index + 1]!.startsWith("--"))
      options[rawKey] = arguments_[++index]!;
    else options[rawKey] = true;
  }
  return options;
}

function optionValue(
  options: CliOptions,
  key: string,
  fallback: string,
): string {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`--${key} requires a value`);
  return value;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

const options = parseOptions(process.argv.slice(2));
const seeds = positiveInteger(optionValue(options, "seeds", "200"), "--seeds");
const seedPrefix = optionValue(options, "seed-prefix", "sealed-analysis");
const maxActions = positiveInteger(
  optionValue(options, "max-actions", "800"),
  "--max-actions",
);
const minGames = positiveInteger(
  optionValue(options, "min-games", String(MIN_CARD_SAMPLE_GAMES)),
  "--min-games",
);
const top = positiveInteger(optionValue(options, "top", "25"), "--top");
const builderName = optionValue(options, "builder", "heuristic");
const deckBuilder = DECK_BUILDERS[builderName];
if (!deckBuilder) {
  throw new Error(
    `--builder must be one of ${Object.keys(DECK_BUILDERS).join(", ")} (got "${builderName}")`,
  );
}

let lastPercent = -1;
const { games, failures } = await runSealedAnalysis({
  seeds,
  seedPrefix,
  maxActions,
  deckBuilder,
  onProgress(completed, total) {
    const percent = Math.floor((completed / total) * 100);
    if (percent !== lastPercent && (percent % 5 === 0 || completed === total)) {
      process.stderr.write(`\r${completed}/${total} games (${percent}%)`);
      lastPercent = percent;
    }
  },
});
process.stderr.write("\n");

if (failures.length > 0) {
  process.stderr.write(
    `${failures.length} seed(s) threw instead of finishing (engine bug, not a stalemate):\n`,
  );
  for (const failure of failures)
    process.stderr.write(`  ${failure.seed}: ${failure.message}\n`);
}

const summary = summarizeCardPicks(games);

if (typeof options.output === "string") {
  const filePath = resolve(options.output);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({ builder: builderName, summary, games, failures }, null, 2)}\n`,
  );
  process.stdout.write(`Wrote ${games.length} games to ${filePath}\n`);
}

if (options.json) {
  process.stdout.write(
    `${JSON.stringify({ builder: builderName, summary, games, failures }, null, 2)}\n`,
  );
} else {
  process.stdout.write(`builder: ${builderName}\n`);
  printReport(summary, top, minGames);
}

function printReport(
  report: SealedAnalysisSummary,
  topCount: number,
  minimumGames: number,
): void {
  process.stdout.write(
    `${report.completed}/${report.games} games completed (${report.incomplete} incomplete), ` +
      `avg ${report.averageTurns} turns / ${report.averageActions} actions\n\n`,
  );
  process.stdout.write(
    "Win-rate delta is an association, not a pick order: a card correlates with\n" +
      "winning partly because of what else its pool held, and the auto-builder's\n" +
      "curve heuristic decides what gets cut here, not a human drafting it. Treat\n" +
      "this as a hint of what to prioritize when a real pack drops the card, not a\n" +
      "guarantee.\n\n",
  );

  const impact = impactRows(report.cards, minimumGames).slice(0, topCount);
  process.stdout.write(
    `Top ${impact.length} by win-rate delta (kept vs cut, min ${minimumGames} decided games each side):\n`,
  );
  console.table(impact.map(formatRow));

  const usage = usageRows(report.cards).slice(0, topCount);
  process.stdout.write(`\nTop ${usage.length} most-often-kept cards:\n`);
  console.table(usage.map(formatRow));
}

function formatRow(card: CardPickStatistics) {
  return {
    card: card.cardNumber,
    poolGames: card.poolGames,
    pickRate: `${(card.pickRate * 100).toFixed(1)}%`,
    kept: `${card.winsIncluded}/${card.deckGamesDecided} (${(card.winRateIncluded * 100).toFixed(1)}%)`,
    cut: `${card.winsCut}/${card.cutGamesDecided} (${(card.winRateCut * 100).toFixed(1)}%)`,
    delta: `${(card.delta * 100).toFixed(1)}pp`,
    plays: card.plays,
    attacks: card.attacks,
    blocks: card.blocks,
  };
}
