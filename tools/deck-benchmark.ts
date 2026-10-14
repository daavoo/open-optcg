import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  isShardWorker,
  parseShard,
  reportShardProgress,
  reportShardResult,
  resolveJobs,
  runShards,
  shardGroups,
  stripFlags,
  type Shard,
} from "./shard.js";
import {
  BENCHMARK_DECK_IDS,
  BENCHMARK_SCHEMA_VERSION,
  benchmarkPairs,
  defaultBenchmarkDecks,
  filterReport,
  mergeShardedReports,
  runBenchmark,
  summarizeGames,
  type BenchmarkFilter,
  type BenchmarkDeckId,
  type BenchmarkReport,
} from "../packages/cli/src/deck-benchmark.js";

const args = process.argv.slice(2);
const command = args[0];

if (command === "run") await runCommand(args.slice(1));
else if (command === "report") await reportCommand(args.slice(1));
else printUsage(command ? `Unknown command: ${command}` : undefined);

async function runCommand(arguments_: string[]): Promise<void> {
  const options = parseOptions(arguments_);
  const focusDeck = options.deck ? requireDeck(options.deck) : undefined;
  const mode = options.all ? "all-vs-all" : "one-vs-all";
  if (mode === "one-vs-all" && !focusDeck) {
    printUsage("run requires --deck <ID> or --all");
    return;
  }
  const seedsPerMatchup = positiveInteger(
    optionValue(options, "seeds", "100"),
    "--seeds",
  );
  const maxActions = positiveInteger(
    optionValue(options, "max-actions", "800"),
    "--max-actions",
  );
  const field = optionValue(options, "field", "roster");
  if (field !== "format" && field !== "roster") {
    printUsage("--field takes format or roster");
    return;
  }
  const opponents =
    options["opponents"] === undefined
      ? undefined
      : optionValue(options, "opponents", "")
          .split(",")
          .filter(Boolean)
          .map(requireDeck);
  const seedPrefix = optionValue(options, "seed-prefix", "rules-benchmark");
  const rulesVersion = optionValue(options, "rules-version", "current");
  const decks =
    opponents && focusDeck
      ? [focusDeck, ...opponents.filter((deck) => deck !== focusDeck)]
      : defaultBenchmarkDecks(mode, focusDeck, field);
  // Derived, not a constant: `15` was hardcoded here for the six-deck field and
  // silently under-reported the moment the roster grew.
  const pairs = benchmarkPairs(mode, decks, focusDeck);
  const shard = parseShard(options.shard);
  // This process's share, not the field's: as one shard of a matrix run the
  // progress line should count the games this machine actually plays.
  const totalGames = shardGroups(pairs, shard).length * seedsPerMatchup * 2;
  const jobs = resolveJobs(options.jobs, shardGroups(pairs, shard).length);
  const common = {
    mode,
    ...(focusDeck ? { focusDeck } : {}),
    decks,
    seedsPerMatchup,
    seedPrefix,
    rulesVersion,
    maxActions,
  } as const;

  const report =
    jobs > 1
      ? await runSharded(common, pairs, jobs, arguments_, totalGames, shard)
      : await runBenchmark({
          ...common,
          ...(shard ? { shard } : {}),
          onProgress: shardAwareProgress(totalGames),
        });
  process.stderr.write("\n");
  await outputReport(report, options.output, Boolean(options.json), true);
  if (report.summary.incomplete > 0) process.exitCode = 1;
}

/**
 * Progress printer. A forked worker reports its own count up its IPC channel and
 * prints nothing, so four workers do not interleave four carriage returns on one
 * line. A top-level `--shard` run has no parent to report to, so it prints.
 */
function shardAwareProgress(
  totalGames: number,
): (completed: number, total: number) => void {
  if (isShardWorker())
    return (completed) => {
      reportShardProgress(completed);
    };
  let lastPercent = -1;
  return (completed, total) => {
    const percent = Math.floor((completed / total) * 100);
    if (percent !== lastPercent && (percent % 5 === 0 || completed === total)) {
      process.stderr.write(`\r${completed}/${totalGames} games (${percent}%)`);
      lastPercent = percent;
    }
  };
}

/**
 * Runs the benchmark across `jobs` worker processes and reassembles one report.
 *
 * The result is identical to a single-process run, not merely equivalent: every
 * game is a pure function of its decks, seed and seat, and `mergeShardedReports`
 * restores canonical matchup order before the summary is recomputed. The one
 * observable difference is `createdAt`, which the parent stamps.
 */
async function runSharded(
  common: Omit<Parameters<typeof runBenchmark>[0], "onProgress" | "shard">,
  pairs: readonly [BenchmarkDeckId, BenchmarkDeckId][],
  jobs: number,
  arguments_: readonly string[],
  totalGames: number,
  shard: Shard | undefined,
): Promise<BenchmarkReport> {
  // The worker re-parses the run's own flags, so pass them through minus the
  // ones the parent owns: how the run is split, and where the report is written.
  const reports = await runShards<BenchmarkReport>({
    arguments: ["run", ...stripFlags(arguments_, ["jobs", "shard", "output"])],
    jobs,
    totalGames,
    ...(shard ? { shard } : {}),
  });
  const games = mergeShardedReports(reports, pairs);
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    rulesVersion: common.rulesVersion,
    createdAt: new Date().toISOString(),
    configuration: {
      mode: common.mode,
      focusDeck: common.focusDeck ?? null,
      decks: [...(common.decks ?? [])],
      seedsPerMatchup: common.seedsPerMatchup,
      pairedSeats: true,
      seedPrefix: common.seedPrefix,
      maxActions: common.maxActions ?? 800,
    },
    summary: summarizeGames(games),
    games,
  };
}

async function reportCommand(arguments_: string[]): Promise<void> {
  const input = arguments_.find((argument) => !argument.startsWith("--"));
  if (!input) {
    printUsage("report requires an input JSON file");
    return;
  }
  const options = parseOptions(
    arguments_.filter((argument) => argument !== input),
  );
  const parsed: unknown = JSON.parse(await readFile(resolve(input), "utf8"));
  if (!isBenchmarkReport(parsed)) throw new Error("Invalid benchmark report");
  const report = parsed;
  const filter: BenchmarkFilter = {
    ...(options.deck ? { deck: requireDeck(options.deck) } : {}),
    ...(options.opponent ? { opponent: requireDeck(options.opponent) } : {}),
    ...(options.seat ? { seat: requireSeat(options.seat) } : {}),
    ...(options.winner ? { winner: requireDeck(options.winner) } : {}),
    ...(options.incomplete ? { incompleteOnly: true } : {}),
  };
  if ((filter.opponent || filter.seat) && !filter.deck)
    throw new Error("--opponent and --seat require --deck");
  await outputReport(
    filterReport(report, filter),
    options.output,
    Boolean(options.json),
    false,
  );
}

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

async function outputReport(
  report: BenchmarkReport,
  output: string | boolean | undefined,
  json: boolean,
  jsonWithoutOutput: boolean,
): Promise<void> {
  if (isShardWorker()) {
    // Its rows go to the parent, which merges them and owns all of this run's
    // output; anything written here would be a second report.
    reportShardResult(report);
    return;
  }
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (typeof output === "string") {
    const filePath = resolve(output);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, serialized);
    process.stdout.write(
      `Wrote ${report.summary.games} games to ${filePath}\n`,
    );
  }
  if (json || (!output && jsonWithoutOutput)) process.stdout.write(serialized);
  else printSummary(report);
}

function printSummary(report: BenchmarkReport): void {
  process.stdout.write(
    `${report.rulesVersion}: ${report.summary.completed}/${report.summary.games} completed, ${report.summary.incomplete} incomplete\n`,
  );
  console.table(
    report.summary.decks.map((deck) => ({
      deck: deck.deck,
      games: deck.games,
      wins: deck.wins,
      losses: deck.losses,
      incomplete: deck.incomplete,
      winRate: `${(deck.winRate * 100).toFixed(1)}%`,
      p1: `${deck.p1Wins}/${deck.p1Games}`,
      p2: `${deck.p2Wins}/${deck.p2Games}`,
      starts: `${deck.startedWins}/${deck.startedGames}`,
      avgTurns: deck.averageTurns,
    })),
  );
  console.table(
    report.summary.matchups.map((matchup) => {
      const [left, right] = matchup.decks;
      return {
        matchup: `${left} vs ${right}`,
        games: matchup.games,
        incomplete: matchup.incomplete,
        left: `${left} ${matchup.wins[left] ?? 0} (${((matchup.winRates[left] ?? 0) * 100).toFixed(1)}%)`,
        right: `${right} ${matchup.wins[right] ?? 0} (${((matchup.winRates[right] ?? 0) * 100).toFixed(1)}%)`,
      };
    }),
  );
}

function requireDeck(value: string | boolean): BenchmarkDeckId {
  if (
    typeof value !== "string" ||
    !BENCHMARK_DECK_IDS.includes(value as BenchmarkDeckId)
  )
    throw new Error(
      `Unknown deck '${String(value)}'; use ${BENCHMARK_DECK_IDS.join(", ")}`,
    );
  return value as BenchmarkDeckId;
}

function requireSeat(value: string | boolean): "p1" | "p2" {
  if (value !== "p1" && value !== "p2")
    throw new Error("--seat must be p1 or p2");
  return value;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${flag} must be a positive integer`);
  return parsed;
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

function isBenchmarkReport(value: unknown): value is BenchmarkReport {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === BENCHMARK_SCHEMA_VERSION &&
    "summary" in value &&
    "games" in value &&
    Array.isArray(value.games)
  );
}

function printUsage(error?: string): void {
  if (error) process.stderr.write(`${error}\n\n`);
  process.stderr.write(`Usage:
  pnpm deck:benchmark run --deck ST31 [--seeds 100] [--field roster|format]
    [--opponents ID,ID] [--rules-version v1] [--output report.json]
  pnpm deck:benchmark run --all [--seeds 100] [--jobs 4] [--output report.json]
  pnpm deck:benchmark report <report.json> [--deck ST31] [--opponent ST32] [--seat p1|p2]
    [--winner ST31] [--incomplete] [--output filtered.json] [--json]\n`);
  process.exitCode = 1;
}
