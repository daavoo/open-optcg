/**
 * Which policy module decides each deck's decisions, across a benchmark field.
 *
 * `pnpm deck:benchmark` reports who wins. This reports who is *playing*: for
 * every deck in the field, the share of its decisions decided by its own policy,
 * by a shared archetype layer, by the format fundamentals, or by nothing at all
 * -- the fallthrough to `chooseGenericRules`. A deck near the bottom of
 * `deck:benchmark` with a high generic share is not badly tuned, it is unpiloted, and
 * those are different pieces of work.
 *
 * See `packages/cli/src/attribution-census.ts` for what the shapes in this data
 * mean and for the three findings in this repository's history that are visible
 * in it.
 *
 * Usage:
 *   pnpm census                                  # all-vs-all, 10 seeds
 *   pnpm census --seeds 50 --jobs 8
 *   pnpm census --format --seeds 100             # the six format decks only
 *   pnpm census --deck ST33                      # one deck against the format six
 *   pnpm census --json --output analysis/census.json
 *
 * Decks are played in parallel, one worker per core. A shard aggregates its own
 * counters and the parent adds them, so `--jobs` does not change the numbers.
 */
import { mkdir, writeFile } from "node:fs/promises";
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
  benchmarkPairs,
  defaultBenchmarkDecks,
  runBenchmark,
  type BenchmarkDeckId,
} from "../packages/cli/src/deck-benchmark.js";
import {
  AttributionCensus,
  deckPolicyShare,
  genericShare,
  sharedRuleShare,
  type CensusReport,
  type CensusSnapshot,
} from "../packages/cli/src/attribution-census.js";
import { SELECTABLE_DECK_IDS } from "@one-piece-sim/decks";

const args = process.argv.slice(2);
const flags = parseFlags(args);

if (flags.has("help")) {
  printUsage();
} else {
  await main();
}

async function main(): Promise<void> {
  const seedsPerMatchup = positiveInteger(value("seeds", "10"), "--seeds");
  const maxActions = positiveInteger(
    value("max-actions", "800"),
    "--max-actions",
  );
  const seedPrefix = value("seed-prefix", "rules-benchmark");
  const focusDeck = flags.get("deck")
    ? requireDeck(String(flags.get("deck")))
    : undefined;
  const mode = focusDeck ? "one-vs-all" : "all-vs-all";
  // The seed prefix defaults to the benchmark's own, so a census plays exactly
  // the games a `deck:benchmark` run of the same shape played. That is what lets
  // a win rate and an attribution share be read side by side.
  const decks = flags.has("format")
    ? defaultBenchmarkDecks("one-vs-all")
    : defaultBenchmarkDecks(mode, focusDeck);
  const pairs = benchmarkPairs(mode, decks, focusDeck);
  const totalGames = pairs.length * seedsPerMatchup * 2;
  const shard = parseShard(flags.get("shard"));
  // What this process plays, which is the whole field unless it is one shard of
  // a matrix run. `totalGames` stays the field's, because the report is about
  // the field.
  const ownGames = shardGroups(pairs, shard).length * seedsPerMatchup * 2;
  const jobs = resolveJobs(flags.get("jobs"), shardGroups(pairs, shard).length);

  const configuration: CensusReport["configuration"] = {
    mode,
    decks: [...decks],
    seedsPerMatchup,
    seedPrefix,
    maxActions,
  };

  const census =
    jobs > 1
      ? await runSharded(jobs, args, ownGames, shard)
      : await runLocal({
          ...configuration,
          focusDeck,
          shard,
          totalGames: ownGames,
        });

  if (isShardWorker()) {
    reportShardResult(census.snapshot());
    return;
  }
  process.stderr.write("\n");
  const report = census.report(configuration, "current");
  const output = flags.get("output");
  if (typeof output === "string") {
    const path = resolve(output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(`Wrote ${path}\n`);
  }
  if (flags.has("json"))
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else render(report, focusDeck, totalGames);
}

async function runLocal(options: {
  mode: "one-vs-all" | "all-vs-all";
  decks: BenchmarkDeckId[];
  focusDeck: BenchmarkDeckId | undefined;
  seedsPerMatchup: number;
  seedPrefix: string;
  maxActions: number;
  shard: Shard | undefined;
  totalGames: number;
}): Promise<AttributionCensus> {
  const census = new AttributionCensus();
  await runBenchmark({
    mode: options.mode,
    ...(options.focusDeck ? { focusDeck: options.focusDeck } : {}),
    decks: options.decks,
    seedsPerMatchup: options.seedsPerMatchup,
    seedPrefix: options.seedPrefix,
    rulesVersion: "current",
    maxActions: options.maxActions,
    ...(options.shard ? { shard: options.shard } : {}),
    onDecision: (decision) => {
      census.observe(decision);
    },
    onProgress: (completed, total) => {
      if (isShardWorker()) reportShardProgress(completed);
      else {
        const percent = Math.floor((completed / Math.max(1, total)) * 100);
        process.stderr.write(
          `\r${completed}/${options.totalGames} games (${percent}%)`,
        );
      }
    },
  });
  return census;
}

/**
 * Forks one worker per job and adds their counters.
 *
 * A `BenchmarkDecisionObserver` is a closure and cannot cross the IPC boundary,
 * so each worker runs its own census over its own shard of the pairs and reports
 * the counters. Addition is associative, so the merged result is identical to a
 * single-process run -- `test/attribution-census.test.ts` pins that.
 */
async function runSharded(
  jobs: number,
  arguments_: readonly string[],
  totalGames: number,
  shard: Shard | undefined,
): Promise<AttributionCensus> {
  const results = await runShards<CensusSnapshot>({
    arguments: stripFlags(arguments_, ["jobs", "shard", "output", "json"]),
    jobs,
    totalGames,
    ...(shard ? { shard } : {}),
  });
  const merged = new AttributionCensus();
  for (const result of results) merged.absorb(result);
  return merged;
}

function render(
  report: CensusReport,
  focusDeck: BenchmarkDeckId | undefined,
  games: number,
): void {
  const total = report.totals.decisions;
  process.stdout.write(
    `${total.toLocaleString()} decisions over ${report.decks.length} decks, ` +
      `${report.configuration.seedsPerMatchup} seeds per matchup\n\n`,
  );
  process.stdout.write("Who is piloting each deck, least-piloted first:\n");
  console.table(
    report.decks.map((deck) => ({
      deck: shortName(deck.deck),
      decisions: deck.decisions,
      "this deck's own rules": percent(deckPolicyShare(deck)),
      "shared rules": percent(sharedRuleShare(deck)),
      "no rule at all": percent(genericShare(deck)),
    })),
  );

  process.stdout.write(
    "\nA rule shapes a decision by deciding it or by narrowing the candidates:\n" +
      "a `rank`-only deck policy hides all but its preferred line and lets the\n" +
      "generic ladder choose, which is piloting. `no rule at all` is the gap --\n" +
      "the generic ladder answering with nothing scoped to this deck in the way.\n",
  );
  process.stdout.write(
    "\nShare with no rule at all, by phase (forced moves excluded):\n",
  );
  const phases = [
    ...new Set(report.decks.flatMap((deck) => Object.keys(deck.byPhase))),
  ].sort();
  console.table(
    report.decks.map((deck) => {
      const row: Record<string, string> = { deck: shortName(deck.deck) };
      for (const phase of phases) {
        const counts = deck.byPhase[phase];
        const real =
          counts === undefined ? 0 : counts.decisions - counts.forced;
        row[phase] =
          counts === undefined || real === 0
            ? "-"
            : `${percent(counts.generic / real)} of ${real}`;
      }
      return row;
    }),
  );

  // Where a deck's decisions actually live, biggest first. A rule is worth
  // (how often the decision occurs) x (how much a better answer is worth), and
  // only the first factor is knowable before the rule is written. Shown for the
  // focus deck, or for the least-piloted deck when the run had no focus, which
  // is the one an audit is most likely to be about.
  const focus =
    report.decks.find((deck) => deck.deck === focusDeck) ?? report.decks[0];
  if (focus) {
    // `games` counts the whole run. That is this deck's game count only when it
    // played every game, which is what `one-vs-all` means; in `all-vs-all` the
    // per-game column would be wrong, so it is left out rather than guessed.
    const perGame =
      report.configuration.mode === "one-vs-all" && games > 0
        ? games
        : undefined;
    process.stdout.write(
      `\nDecision surface for ${shortName(focus.deck)}, forced moves excluded, biggest first:\n`,
    );
    const rows = Object.entries(focus.bySurface)
      .map(([surface, counts]) => ({
        surface,
        real: counts.decisions - counts.forced,
        generic: counts.generic,
        forced: counts.forced,
      }))
      .filter((row) => row.real > 0)
      .sort((left, right) => right.real - left.real)
      .slice(0, 12);
    console.table(
      Object.fromEntries(
        rows.map((row) => [
          row.surface,
          {
            ...(perGame ? { "per game": (row.real / perGame).toFixed(2) } : {}),
            decisions: row.real,
            "no rule at all": percent(row.generic / row.real),
            "forced, not counted": row.forced,
          },
        ]),
      ),
    );
    process.stdout.write(
      "A big surface with a high `no rule at all` is worth more than a better\n" +
        "answer on a rare one. Start at the top row.\n",
    );
  }

  const silent = report.decks.filter((deck) => deck.silentModules.length > 0);
  if (silent.length > 0) {
    process.stdout.write(
      "\nRegistered for the deck and never reached -- dead weight, or a gate that never opened:\n",
    );
    for (const deck of silent)
      process.stdout.write(
        `  ${shortName(deck.deck)}: ${deck.silentModules.join(", ")}\n`,
      );
  }
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** The deck id less its provenance suffix, so a table fits a terminal. */
function shortName(deck: string): string {
  return deck.split(" - ")[0] ?? deck;
}

function parseFlags(argv: readonly string[]): Map<string, string | boolean> {
  const parsed = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) continue;
    const [key, inline] = argument.slice(2).split("=", 2);
    if (!key) continue;
    const next = argv[index + 1];
    if (inline !== undefined) parsed.set(key, inline);
    else if (next && !next.startsWith("--")) parsed.set(key, argv[++index]!);
    else parsed.set(key, true);
  }
  return parsed;
}

/** A declaration, not a `const` arrow: `main` runs before this line is reached. */
function value(key: string, fallback: string): string {
  const found = flags.get(key);
  return typeof found === "string" ? found : fallback;
}

function positiveInteger(raw: string, label: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function requireDeck(raw: string): BenchmarkDeckId {
  const match = SELECTABLE_DECK_IDS.find(
    (deck) => deck === raw || deck.toLowerCase().includes(raw.toLowerCase()),
  );
  if (!match) throw new Error(`Unknown deck: ${raw}`);
  return match;
}

function printUsage(): void {
  process.stdout.write(
    [
      "Attribution census: which policy module decides each deck's decisions.",
      "",
      "  pnpm census [--seeds 10] [--jobs N] [--format] [--deck ID]",
      "             [--max-actions 800] [--json] [--output path.json]",
      "",
    ].join("\n"),
  );
}
