/**
 * The committed deck standings, and the gate that keeps them current.
 *
 * The benchmark is the only instrument that says whether a rules or policy
 * change made the field better or worse, and as a command someone has to
 * remember to run, it said that to nobody. Committing the numbers makes the
 * answer part of the diff: a mechanic fix that moves Shanks from 29% to 41%
 * shows up as rows moving in a file, and a "harmless" refactor that quietly
 * flips sixty games cannot land looking harmless.
 *
 * `pnpm standings` rewrites the files; `pnpm standings:check` regenerates them
 * into memory and fails when the two disagree, the same shape as
 * `coverage:clauses:check`, `decks:provenance:check` and `fixtures:check`.
 *
 * ## Two divisions, not one field
 *
 * The sweep is two closed round-robins -- `featured` and `starter`, as
 * `deckDivision` splits them -- and each writes its own file. An all-vs-all
 * field has a mean of exactly 50% by construction, so a rate in one is a
 * statement about the field it was measured in: mixing Bandai's precons with
 * built lists made every rate a statement about that mixture rather than about
 * the deck.
 *
 * Two files rather than one with a division column, because a division is
 * refreshable on its own: `pnpm standings --group starter` re-runs nine decks
 * in a third of a minute and leaves the other file untouched in the diff. Each
 * file therefore carries its own rules stamp, and `--check` can say that one
 * division is stale while the other is current -- which the single table could
 * not, since a stale half forced a whole-field re-run.
 *
 * What this gives up is the cross-division matchups: 162 of the 351 pairings a
 * single field played are no longer played at all. Nothing reads per-matchup
 * numbers out of these files -- they carry aggregates -- and `deck:benchmark`
 * still plays the whole roster, so what is actually lost is sweep coverage as a
 * crash net, and the `incomplete` column is where that would show.
 *
 * ## CSV, with the run stamped on every row
 *
 * The files are CSV rather than a rendered table: a row is a record, `--check`
 * parses it back with one split instead of sixty lines of Markdown table
 * parsing, and a spreadsheet opens it. Guidance on how to read the numbers
 * lives in `docs/theorycrafting.md`, because a CSV has nowhere to put prose and
 * a number with its caveat in another file is a number without its caveat.
 *
 * Every row repeats the run's stamp and configuration. It is redundant by
 * design: the file stays reproducible from itself alone, a half-edited file is
 * detectable because its rows disagree, and a stamp change rewriting every row
 * is honest, since a stamp change invalidates every number beside it.
 *
 * Everything in a file has to be a pure function of the build, or every
 * regeneration is a diff and the gate is noise:
 *
 * - No `createdAt`. `BenchmarkReport` stamps one and these files drop it.
 * - `rulesStamp()` instead, which is the question the files actually need
 *   answered -- what rules produced these numbers -- and is content-addressed,
 *   so a file whose stamp does not match the build is self-evidently stale
 *   before anyone reads a single percentage.
 * - The configuration that produced it, so the numbers are reproducible from
 *   the file alone.
 *
 * The incomplete-game count is a tracked column rather than an exit code.
 * `deck:benchmark run` exits 1 when any game hits the action cap, and at the
 * committed seed count some games do; a game that cannot finish is a real
 * finding, but inheriting that exit code would make this check red from day one
 * and say nothing about staleness, which is the only thing it is for.
 *
 * The run splits two ways, and both end at the same files. `--jobs` forks over
 * this machine's cores and merges over an IPC channel. `--shard i/n` with
 * `--shard-out` plays one stripe of every division it was asked for and writes
 * those games, and `--merge` assembles those files instead of playing anything:
 * what CI does, because a division is quadratic in its deck count. The two
 * compose -- a shard still forks over its own cores -- and the merged files are
 * identical to a single process's, not merely equivalent.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deckDivision } from "@one-piece-sim/decks";
import { rulesStamp, type RulesStamp } from "@one-piece-sim/engine-core";
import {
  BENCHMARK_SCHEMA_VERSION,
  benchmarkPairs,
  defaultBenchmarkDecks,
  mergeShardedReports,
  runBenchmark,
  summarizeGames,
  type BenchmarkDeckId,
  type BenchmarkGame,
  type BenchmarkReport,
} from "../packages/cli/src/deck-benchmark.js";
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

/** The divisions, in the order a whole run plays and reports them. */
export const STANDINGS_DIVISIONS = ["featured", "starter"] as const;
export type StandingsDivision = (typeof STANDINGS_DIVISIONS)[number];

export const STANDINGS_PATHS: Record<StandingsDivision, string> = {
  featured: "docs/rules-map/deck-standings-featured.csv",
  starter: "docs/rules-map/deck-standings-starter.csv",
};

/**
 * Seeds per matchup, per division, chosen to hold a row's precision constant.
 *
 * A deck's rate is read off its own row, so what has to stay comparable between
 * the two files -- and with the single 27-deck table these replaced -- is games
 * per deck, not seeds per matchup. The single field gave every deck 26
 * opponents and 260 games at 5 seeds. A division gives each of its decks fewer
 * opponents, so the same precision costs more seeds:
 *
 * | Division | Decks | Opponents | Seeds | Games per deck |
 * | --- | --- | --- | --- | --- |
 * | featured | 20 | 19 | 7 | 266 |
 * | starter | 9 | 8 | 16 | 256 |

 *
 * The featured count moves as that division grows, which is the point of
 * deriving it from games per deck rather than pinning it: at 18 decks 8 seeds
 * gave 272 games, and at 20 the same 8 would give 304 -- a row measured more
 * precisely than the starter rows beside it and than every committed number
 * before it. Seven holds it at 266.
 *
 * At 5 seeds in both, a starter row would rest on 80 games and carry roughly
 * +/-11pp of noise against the +/-6pp the committed numbers have always had --
 * the table would have got quietly worse at the moment it got easier to read.
 *
 * A seed is an index into a per-matchup sequence (`prefix-left-right-N`), so
 * raising the count is additive: the games a lower count played are a prefix of
 * the games a higher one plays, and no committed number moves for having been
 * re-seeded.
 *
 * ## Why five was the single field's number
 *
 * The single table ran at ten seeds until 2026-09-07, and the halving was
 * measured rather than guessed. A 25-deck all-vs-all at ten seeds was split
 * into its two disjoint five-seed halves -- seeds 0-4 against seeds 5-9, 3000
 * games each -- and the two tables compared row by row, each deck's rate then
 * resting on 240 games rather than 480:
 *
 *  - **mean disagreement 2.5pp** across the 25 decks;
 *  - **max 8.8pp**, ST-31 reading 50.8% in one half and 59.6% in the other;
 *  - **15 of 300 ranked pairs inverted**, so 95% of the ordering survives.
 *
 * That is the trade these counts are set to preserve: around 260 games a deck,
 * where reading a row as "is this deck above or below even" is the reading that
 * breaks first, and `docs/theorycrafting.md` says to read the numbers coarsely
 * for exactly that reason.
 *
 * What the counts do *not* touch is `standings:check`. That regenerates on the
 * same seeds and compares the numbers, so both arms play identical games: the
 * gate is no more likely to fail at one count than another. The noise above is
 * in how well the committed numbers estimate a deck's true rate, not in whether
 * two runs of one build agree.
 */
export const STANDINGS_SEEDS: Record<StandingsDivision, number> = {
  // 4 since the thirty-first featured deck, for the reason the starter count
  // below gives: thirty-one decks play thirty opponents each, so 4 seeds is
  // 240 games a deck, where 5 would be 300. At fifty-nine decks 4 seeds is
  // 464 and 3 would be 348, a seed less precision on every row, so the count
  // stays at 4 and the band's ceiling in `test/deck-standings.test.ts` sits
  // at 464.
  featured: 4,
  // The count is set from the division's size, not held fixed across it:
  // thirteen decks play twelve opponents each, so 13 seeds is 312 games a
  // deck, inside the band `test/deck-standings.test.ts` holds.
  starter: 13,
};

export const STANDINGS_MAX_ACTIONS = 800;
export const STANDINGS_SEED_PREFIX = "rules-benchmark";
/**
 * `rulesVersion` as recorded in each file's `benchmarkRulesVersion` column.
 *
 * `deck:benchmark run` defaults to the same literal, which is what keeps a
 * standings run and a hand-run benchmark comparable. The engine's own version
 * is in the rules stamp, which is the authoritative answer to what rules ran.
 */
export const STANDINGS_RULES_VERSION = "current";
/**
 * How far a measured number may drift before a committed file is stale.
 *
 * Five points, against roughly eleven points of per-matchup noise: comfortably
 * inside what re-running the same build can produce on its own, and far below
 * the 30%-vs-80% gaps these files exist to show. A deck that really moved moved
 * further than this.
 *
 * Applied as percentage points to a rate, and as a fraction of the value to a
 * turn average.
 */
export const STANDINGS_TOLERANCE = 0.05;

/** The decks of one division, in the roster's own order. */
export function divisionDecks(
  division: StandingsDivision,
): readonly BenchmarkDeckId[] {
  return defaultBenchmarkDecks("all-vs-all").filter(
    (deck) => deckDivision(deck) === division,
  );
}

function assertDivision(value: string): StandingsDivision {
  const division = STANDINGS_DIVISIONS.find((name) => name === value);
  if (!division)
    throw new Error(
      `--group must be one of ${STANDINGS_DIVISIONS.join(", ")}, not ${value}`,
    );
  return division;
}

export interface StandingsRow {
  deck: BenchmarkDeckId;
  winRate: number;
  wins: number;
  losses: number;
  incomplete: number;
  p1WinRate: number;
  p2WinRate: number;
  startedWinRate: number;
  averageTurns: number;
}

export interface Standings {
  division: StandingsDivision;
  stamp: RulesStamp;
  configuration: {
    decks: number;
    seedsPerMatchup: number;
    seedPrefix: string;
    maxActions: number;
    rulesVersion: string;
  };
  games: number;
  incomplete: number;
  averageTurns: number;
  rows: StandingsRow[];
}

/**
 * The standings a division's report supports, ranked.
 *
 * Sorted by win rate descending so that the diff of a policy change reads as
 * decks moving up and down a file rather than as a reshuffle; ties break on
 * deck id, because two decks on the same win rate must not be able to swap rows
 * between two runs of the same build.
 *
 * The overall win rate is over completed games, as `DeckStatistics.winRate`
 * defines it, while the three seat rates are over all of that seat's games --
 * the report carries the incomplete count per deck but not per seat, so there is
 * no honest way to take it out of a seat denominator. `incomplete` is a column
 * of its own for exactly that reason: it names every deck whose seat rates are
 * diluted, and it is zero for all but the two or three the action cap catches.
 */
export function standingsFromReport(
  division: StandingsDivision,
  report: BenchmarkReport,
  stamp: RulesStamp = rulesStamp(),
): Standings {
  const rows = report.summary.decks
    .map((deck): StandingsRow => ({
      deck: deck.deck,
      winRate: deck.winRate,
      wins: deck.wins,
      losses: deck.losses,
      incomplete: deck.incomplete,
      p1WinRate: rate(deck.p1Wins, deck.p1Games),
      p2WinRate: rate(deck.p2Wins, deck.p2Games),
      startedWinRate: rate(deck.startedWins, deck.startedGames),
      averageTurns: deck.averageTurns,
    }))
    .sort(
      (left, right) =>
        right.winRate - left.winRate || left.deck.localeCompare(right.deck),
    );
  return {
    division,
    stamp,
    configuration: {
      decks: report.configuration.decks.length,
      seedsPerMatchup: report.configuration.seedsPerMatchup,
      seedPrefix: report.configuration.seedPrefix,
      maxActions: report.configuration.maxActions,
      rulesVersion: report.rulesVersion,
    },
    games: report.summary.games,
    incomplete: report.summary.incomplete,
    averageTurns: report.summary.averageTurns,
    rows,
  };
}

/**
 * The columns, in order.
 *
 * Measurements first so the eye reaches the deck and its rate before the run
 * metadata that every row repeats; the metadata is what makes a file readable
 * without its sibling, not what anyone reads.
 */
export const STANDINGS_COLUMNS = [
  "deck",
  "winRatePct",
  "wins",
  "losses",
  "incomplete",
  "p1WinRatePct",
  "p2WinRatePct",
  "startedWinRatePct",
  "averageTurns",
  "division",
  "seedsPerMatchup",
  "seedPrefix",
  "maxActions",
  "benchmarkRulesVersion",
  "rulesVersion",
  "cardDataHash",
  "programHash",
] as const;

/** Renders one division's CSV. Byte-stable for a given build. */
export function renderStandings(standings: Standings): string {
  const run = [
    standings.division,
    String(standings.configuration.seedsPerMatchup),
    standings.configuration.seedPrefix,
    String(standings.configuration.maxActions),
    standings.configuration.rulesVersion,
    standings.stamp.rulesVersion,
    standings.stamp.cardDataHash,
    standings.stamp.programHash,
  ];
  const lines = [
    STANDINGS_COLUMNS.join(","),
    ...standings.rows.map((row) =>
      [
        row.deck,
        percent(row.winRate),
        String(row.wins),
        String(row.losses),
        String(row.incomplete),
        percent(row.p1WinRate),
        percent(row.p2WinRate),
        percent(row.startedWinRate),
        row.averageTurns.toFixed(1),
        ...run,
      ]
        .map(csvField)
        .join(","),
    ),
    "",
  ];
  return lines.join("\n");
}

/**
 * Quotes a field only when it needs it.
 *
 * No shipped deck id contains a comma, a quote or a newline, so in practice
 * this never fires -- but a deck named by somebody else's tournament list is
 * one paste away from containing one, and a standings file that silently gains
 * a column is worse than one that is a little defensive.
 */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function percent(value: number): string {
  return (value * 100).toFixed(1);
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export interface StandingsOptions {
  check: boolean;
  /** Which divisions to run; every one when `--group` is absent. */
  divisions: readonly StandingsDivision[];
  /** Overrides every division's seed count. Undefined means the committed ones. */
  seeds: number | undefined;
  tolerance: number;
  jobs: string | undefined;
  shard: Shard | undefined;
  /**
   * Where this shard writes its games instead of files.
   *
   * A sweep split across machines cannot hand its pieces back over an IPC
   * channel the way `--jobs` does, so a shard writes its divisions' reports and
   * the merge step reads them. Meaningless without `--shard`, and rejected
   * without it: a whole-field run writing a "shard" report is a merge waiting to
   * double-count.
   */
  shardOut: string | undefined;
  /** Directory of `--shard-out` reports to assemble into files. */
  merge: string | undefined;
}

export function parseStandingsOptions(
  arguments_: readonly string[],
): StandingsOptions {
  const value = (key: string): string | undefined => {
    const inline = arguments_.find((argument) =>
      argument.startsWith(`--${key}=`),
    );
    if (inline) return inline.slice(key.length + 3);
    const index = arguments_.indexOf(`--${key}`);
    if (index === -1) return undefined;
    const next = arguments_[index + 1];
    if (!next || next.startsWith("--"))
      throw new Error(`--${key} requires a value`);
    return next;
  };
  const rawSeeds = value("seeds");
  const seeds = rawSeeds === undefined ? undefined : Number(rawSeeds);
  if (seeds !== undefined && (!Number.isInteger(seeds) || seeds < 1))
    throw new Error("--seeds must be a positive integer");
  const rawTolerance = value("tolerance");
  const tolerance =
    rawTolerance === undefined ? STANDINGS_TOLERANCE : Number(rawTolerance);
  if (!Number.isFinite(tolerance) || tolerance < 0)
    throw new Error("--tolerance must be a non-negative number");
  const rawGroup = value("group");
  const divisions =
    rawGroup === undefined
      ? STANDINGS_DIVISIONS
      : [assertDivision(rawGroup.trim())];
  const shard = parseShard(value("shard"));
  const shardOut = value("shard-out");
  const merge = value("merge");
  if (shardOut !== undefined && !shard)
    throw new Error("--shard-out requires --shard");
  if (merge !== undefined && (shard || shardOut !== undefined))
    throw new Error("--merge assembles shards; it does not run one");
  return {
    check: arguments_.includes("--check"),
    divisions,
    seeds,
    tolerance,
    jobs: value("jobs"),
    shard,
    shardOut,
    merge,
  };
}

/** The seed count a division runs at, honouring a `--seeds` override. */
export function seedsFor(
  division: StandingsDivision,
  override: number | undefined,
): number {
  return override ?? STANDINGS_SEEDS[division];
}

/**
 * A line diff of a committed file against the regenerated one, so a red check
 * names the rows that moved instead of only the file that is stale. Set-based
 * rather than a real LCS: the interesting change is always which lines exist,
 * since a file's own ordering is what a policy change rearranges.
 */
export function standingsDiff(committed: string, rendered: string): string {
  const before = new Set(committed.split("\n"));
  const after = new Set(rendered.split("\n"));
  return [
    ...committed
      .split("\n")
      .filter((line) => line !== "" && !after.has(line))
      .map((line) => `-${line}`),
    ...rendered
      .split("\n")
      .filter((line) => line !== "" && !before.has(line))
      .map((line) => `+${line}`),
  ].join("\n");
}

/** One parsed file: the run's constant fields, and the measured rows by deck. */
export interface ParsedStandings {
  fields: Map<string, string>;
  rows: Map<string, StandingsRow>;
}

/**
 * Splits one CSV line, honouring quoted fields.
 *
 * Deliberately not a dependency: the renderer above is the only writer these
 * files ever have, so what has to be read back is exactly what it writes.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? "";
    if (quoted) {
      if (character !== '"') field += character;
      else if (line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      fields.push(field);
      field = "";
    } else field += character;
  }
  fields.push(field);
  return fields;
}

/**
 * Reads a rendered CSV back into numbers.
 *
 * Both sides of `--check` go through this, so the comparison can never disagree
 * with the renderer about what a column means: what is compared is what the file
 * says, in the units it says it in.
 *
 * The run's constant columns are read off the rows and collapsed into `fields`.
 * A file whose rows disagree about the run that produced them is a file
 * somebody edited by hand, so the disagreement is kept rather than resolved:
 * the field records every distinct value it saw, and the exact-match gate then
 * fails on it.
 *
 * The three aggregates -- games, incomplete and the turn average -- are derived
 * rather than stored, because every one of them is a sum over the rows. A game
 * is counted by both of its decks, which is the halving below.
 */
export function parseStandings(csv: string): ParsedStandings {
  const rows = new Map<string, StandingsRow>();
  const constants = new Map<string, Set<string>>();
  const lines = csv.split("\n").filter((line) => line.trim() !== "");
  const header = lines.length > 0 ? parseCsvLine(lines[0] ?? "") : [];
  const index = (name: string): number => header.indexOf(name);
  const runColumns = [
    "division",
    "seedsPerMatchup",
    "seedPrefix",
    "maxActions",
    "benchmarkRulesVersion",
    "rulesVersion",
    "cardDataHash",
    "programHash",
  ];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const cell = (name: string): string => cells[index(name)] ?? "";
    const deck = cell("deck");
    if (deck === "") continue;
    rows.set(deck, {
      deck: deck as BenchmarkDeckId,
      winRate: fromPercent(cell("winRatePct")),
      wins: Number(cell("wins")),
      losses: Number(cell("losses")),
      incomplete: Number(cell("incomplete")),
      p1WinRate: fromPercent(cell("p1WinRatePct")),
      p2WinRate: fromPercent(cell("p2WinRatePct")),
      startedWinRate: fromPercent(cell("startedWinRatePct")),
      averageTurns: Number(cell("averageTurns")),
    });
    for (const column of runColumns) {
      const seen = constants.get(column) ?? new Set<string>();
      seen.add(cell(column));
      constants.set(column, seen);
    }
  }
  const fields = new Map<string, string>();
  for (const [column, seen] of constants)
    fields.set(column, [...seen].sort().join(" / "));
  fields.set("decks", String(rows.size));
  let deckGames = 0;
  let deckIncomplete = 0;
  let turns = 0;
  for (const row of rows.values()) {
    const games = row.wins + row.losses + row.incomplete;
    deckGames += games;
    deckIncomplete += row.incomplete;
    turns += row.averageTurns * games;
  }
  fields.set("games", String(deckGames / 2));
  fields.set("incomplete", String(deckIncomplete / 2));
  fields.set(
    "average turns",
    deckGames === 0 ? "0.0" : (turns / deckGames).toFixed(1),
  );
  return { fields, rows };
}

function fromPercent(cell: string): number {
  return Number(cell) / 100;
}

/**
 * Fields that must match exactly, because none of them is a measurement.
 *
 * A different stamp, a different division, a different configuration or a
 * different number of games is not a file that drifted; it is a file of
 * something else.
 */
const EXACT_FIELDS = [
  "division",
  "rulesVersion",
  "cardDataHash",
  "programHash",
  "benchmarkRulesVersion",
  "decks",
  "seedsPerMatchup",
  "seedPrefix",
  "maxActions",
  "games",
] as const;

export interface StandingsComparison {
  /** True when the committed file has to be regenerated. */
  stale: boolean;
  /** Why, or -- for a pass with movement -- what moved anyway. */
  report: string;
}

/**
 * Compares a committed file against a fresh one, tolerating noise.
 *
 * Rates are held to `tolerance` in percentage points, and counts are compared as
 * rates over their own denominator so that the three or four games the action
 * cap catches cannot fail the gate on their own. Turn averages, which are not
 * rates, are held to the same fraction of themselves.
 *
 * Movement inside tolerance is reported and passes: silently accepting it would
 * make the committed numbers drift arbitrarily far in 5pp steps with nobody ever
 * seeing a step.
 */
export function compareStandings(
  committed: string,
  rendered: string,
  tolerance = STANDINGS_TOLERANCE,
): StandingsComparison {
  const before = parseStandings(committed);
  const after = parseStandings(rendered);
  const breaking: string[] = [];
  const drifted: string[] = [];

  for (const field of EXACT_FIELDS) {
    const left = before.fields.get(field);
    const right = after.fields.get(field);
    if (left !== right)
      breaking.push(
        `${field}: ${left ?? "(missing)"} -> ${right ?? "(missing)"}`,
      );
  }

  const gone = [...before.rows.keys()].filter((deck) => !after.rows.has(deck));
  const added = [...after.rows.keys()].filter((deck) => !before.rows.has(deck));
  for (const deck of gone)
    breaking.push(`-${deck} (no longer in the division)`);
  for (const deck of added) breaking.push(`+${deck} (new to the division)`);

  const games = Number(after.fields.get("games") ?? 0);
  const summary = [
    check("incomplete", before, after, games, tolerance),
    relative("average turns", before, after, tolerance),
  ];
  for (const [deck, right] of after.rows) {
    const left = before.rows.get(deck);
    if (!left) continue;
    const deltas = rowDeltas(left, right, tolerance);
    if (deltas.length === 0) continue;
    const over = deltas.filter((delta) => delta.over);
    (over.length > 0 ? breaking : drifted).push(
      `${deck}: ${deltas.map((delta) => delta.text).join(", ")}`,
    );
  }
  for (const delta of summary) {
    if (!delta) continue;
    (delta.over ? breaking : drifted).push(delta.text);
  }

  const lines: string[] = [];
  if (breaking.length > 0) lines.push(...breaking.map((line) => `- ${line}`));
  if (drifted.length > 0) {
    lines.push(
      `within tolerance (${percentLabel(tolerance)}), no regeneration needed:`,
      ...drifted.map((line) => `  ${line}`),
    );
  }
  return { stale: breaking.length > 0, report: lines.join("\n") };
}

function percentLabel(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface Delta {
  over: boolean;
  text: string;
}

function rowDeltas(
  left: StandingsRow,
  right: StandingsRow,
  tolerance: number,
): Delta[] {
  // The record is the win rate in another unit, so it is compared over the
  // row's own games rather than as a raw count of sixty-odd wins.
  const games = right.wins + right.losses + right.incomplete || 1;
  const deltas = [
    rateDelta("win rate", left.winRate, right.winRate, tolerance),
    rateDelta("p1", left.p1WinRate, right.p1WinRate, tolerance),
    rateDelta("p2", left.p2WinRate, right.p2WinRate, tolerance),
    rateDelta(
      "went first",
      left.startedWinRate,
      right.startedWinRate,
      tolerance,
    ),
    rateDelta("W", left.wins / games, right.wins / games, tolerance),
    rateDelta("L", left.losses / games, right.losses / games, tolerance),
    rateDelta(
      "incomplete",
      left.incomplete / games,
      right.incomplete / games,
      tolerance,
    ),
    relativeDelta("turns", left.averageTurns, right.averageTurns, tolerance),
  ];
  return deltas.filter((delta): delta is Delta => delta !== null);
}

function check(
  field: string,
  before: ParsedStandings,
  after: ParsedStandings,
  games: number,
  tolerance: number,
): Delta | null {
  const left = Number(before.fields.get(field) ?? Number.NaN);
  const right = Number(after.fields.get(field) ?? Number.NaN);
  const denominator = games || 1;
  const delta = rateDelta(
    field,
    left / denominator,
    right / denominator,
    tolerance,
  );
  return (
    delta && { ...delta, text: `${field}: ${String(left)} -> ${String(right)}` }
  );
}

function relative(
  field: string,
  before: ParsedStandings,
  after: ParsedStandings,
  tolerance: number,
): Delta | null {
  const left = Number(before.fields.get(field) ?? Number.NaN);
  const right = Number(after.fields.get(field) ?? Number.NaN);
  const delta = relativeDelta(field, left, right, tolerance);
  return delta && { ...delta, text: `${field}: ${delta.text}` };
}

function rateDelta(
  label: string,
  left: number,
  right: number,
  tolerance: number,
): Delta | null {
  // Rounding to the file's own precision, so a difference the file cannot
  // display is not a difference at all.
  const difference = round(right) - round(left);
  if (difference === 0) return null;
  return {
    over: Math.abs(difference) > tolerance,
    text: `${label} ${percentLabel(round(left))} -> ${percentLabel(round(right))}`,
  };
}

function relativeDelta(
  label: string,
  left: number,
  right: number,
  tolerance: number,
): Delta | null {
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  const difference = Math.abs(right - left);
  if (difference === 0) return null;
  const scale = Math.max(Math.abs(left), Math.abs(right), 1);
  return {
    over: difference / scale > tolerance,
    text: `${label} ${left.toFixed(1)} -> ${right.toFixed(1)}`,
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

/** What one `--shard-out` file holds: a report per division the shard played. */
export type ShardReports = Partial<Record<StandingsDivision, BenchmarkReport>>;

/**
 * Reads the shard reports in `directory` and assembles one division's games.
 *
 * The strict part is the game count. A matrix run that loses a shard -- an
 * artifact that failed to upload, a job that was cancelled -- would otherwise
 * merge cleanly into a file covering four fifths of a division, and every
 * missing matchup would read as a deck that simply was not played. So the
 * expected total is derived from the configuration and checked, and the
 * configuration each shard recorded has to be the one this build would run:
 * shards that disagree about seeds or decks are measuring different things and
 * their rows must not be added together.
 */
export async function readShardReports(
  directory: string,
  division: StandingsDivision,
  common: StandingsRun,
  pairs: readonly [BenchmarkDeckId, BenchmarkDeckId][],
  totalGames: number,
): Promise<BenchmarkGame[]> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (names.length === 0)
    throw new Error(`No shard reports in ${directory}: nothing to merge`);
  const reports: BenchmarkReport[] = [];
  for (const name of names) {
    const path = join(directory, name);
    const shard = JSON.parse(await readFile(path, "utf8")) as ShardReports;
    const report = shard[division];
    if (!report)
      throw new Error(`${path}: no ${division} report: a shard is missing it`);
    const mismatch = configurationMismatch(report, common);
    if (mismatch) throw new Error(`${path} (${division}): ${mismatch}`);
    reports.push(report);
  }
  const games = mergeShardedReports(reports, pairs);
  if (games.length !== totalGames)
    throw new Error(
      `Merged ${String(games.length)} ${division} games from ${String(names.length)} shard reports, expected ${String(totalGames)}: a shard is missing or overlaps another`,
    );
  return games;
}

function configurationMismatch(
  report: BenchmarkReport,
  common: StandingsRun,
): string | undefined {
  // Widened deliberately: the type says this is the current schema, the file on
  // disk was written by whatever revision produced it, and that is the whole
  // question here.
  const schemaVersion: number = report.schemaVersion;
  if (schemaVersion !== BENCHMARK_SCHEMA_VERSION)
    return `benchmark schema ${String(schemaVersion)}, expected ${String(BENCHMARK_SCHEMA_VERSION)}`;
  const configuration = report.configuration;
  if (configuration.seedsPerMatchup !== common.seedsPerMatchup)
    return `${String(configuration.seedsPerMatchup)} seeds per matchup, expected ${String(common.seedsPerMatchup)}`;
  if (configuration.seedPrefix !== common.seedPrefix)
    return `seed prefix ${configuration.seedPrefix}, expected ${common.seedPrefix}`;
  if (configuration.maxActions !== common.maxActions)
    return `maxActions ${String(configuration.maxActions)}, expected ${String(common.maxActions ?? STANDINGS_MAX_ACTIONS)}`;
  const decks = [...(common.decks ?? [])].join(",");
  if (configuration.decks.join(",") !== decks) return "a different deck field";
  return undefined;
}

/** Everything one division's run needs, derived from the options. */
interface DivisionRun {
  division: StandingsDivision;
  common: StandingsRun;
  pairs: [BenchmarkDeckId, BenchmarkDeckId][];
  /** Games the whole division covers, whatever this process plays of it. */
  fieldGames: number;
  /** Games this process plays: its shard's stripe, or all of them. */
  ownGames: number;
  ownPairs: number;
}

function divisionRun(
  division: StandingsDivision,
  options: StandingsOptions,
): DivisionRun {
  const decks = divisionDecks(division);
  const pairs = benchmarkPairs("all-vs-all", decks);
  const seeds = seedsFor(division, options.seeds);
  const ownPairs = shardGroups(pairs, options.shard).length;
  return {
    division,
    common: {
      mode: "all-vs-all",
      decks,
      seedsPerMatchup: seeds,
      seedPrefix: STANDINGS_SEED_PREFIX,
      rulesVersion: STANDINGS_RULES_VERSION,
      maxActions: STANDINGS_MAX_ACTIONS,
    },
    pairs,
    fieldGames: pairs.length * seeds * 2,
    ownGames: ownPairs * seeds * 2,
    ownPairs,
  };
}

async function runStandings(arguments_: readonly string[]): Promise<void> {
  const options = parseStandingsOptions(arguments_);
  const runs = options.divisions.map((division) =>
    divisionRun(division, options),
  );

  if (options.merge !== undefined) {
    const reports = new Map<StandingsDivision, BenchmarkReport>();
    for (const run of runs) {
      const games = await readShardReports(
        options.merge,
        run.division,
        run.common,
        run.pairs,
        run.fieldGames,
      );
      reports.set(run.division, assembleReport(run.common, games));
    }
    await emitStandings(reports, options);
    return;
  }

  const reports = new Map<StandingsDivision, BenchmarkReport>();
  for (const run of runs) {
    const jobs = resolveJobs(options.jobs, run.ownPairs);
    const report =
      jobs > 1
        ? await runSharded(run, jobs, arguments_, options.shard)
        : await runBenchmark({
            ...run.common,
            ...(options.shard ? { shard: options.shard } : {}),
            // A forked worker reports up the IPC channel; a top-level run
            // prints, and a top-level `--shard` run is a top-level run.
            onProgress: isShardWorker()
              ? (completed) => {
                  reportShardProgress(completed);
                }
              : progressPrinter(run.division, run.ownGames),
          });
    reports.set(run.division, report);
  }

  if (isShardWorker()) {
    // Its rows go to the parent, which merges them and owns all of this run's
    // output; writing files here would be a second, partial set. A worker is
    // only ever forked for one division, so it reports that one report.
    const only = [...reports.values()][0];
    reportShardResult(only);
    return;
  }
  process.stderr.write("\n");

  if (options.shardOut !== undefined) {
    // This machine played a slice of each division, so it has no files to
    // render and nothing to compare: it writes its games and `--merge` does the
    // rest.
    const payload: ShardReports = Object.fromEntries(reports);
    const played = [...reports.values()].reduce(
      (total, report) => total + report.summary.games,
      0,
    );
    await writeFile(options.shardOut, `${JSON.stringify(payload)}\n`);
    process.stdout.write(
      `wrote   ${options.shardOut} (${String(played)} games across ${String(reports.size)} divisions)\n`,
    );
    return;
  }
  await emitStandings(reports, options);
}

/** Writes or checks each division's file, whichever the run asked for. */
async function emitStandings(
  reports: ReadonlyMap<StandingsDivision, BenchmarkReport>,
  options: StandingsOptions,
): Promise<void> {
  let stale = false;
  for (const [division, report] of reports) {
    const path = STANDINGS_PATHS[division];
    const rendered = renderStandings(standingsFromReport(division, report));
    const counts = `${String(report.summary.games)} games, ${String(report.summary.incomplete)} incomplete`;
    if (!options.check) {
      await writeFile(path, rendered);
      process.stdout.write(`wrote   ${path} (${counts})\n`);
      continue;
    }
    const committed = await readFile(path, "utf8").catch(() => "");
    if (committed === rendered) {
      process.stdout.write(`ok      ${path} (${counts})\n`);
      continue;
    }
    const comparison = compareStandings(committed, rendered, options.tolerance);
    if (!comparison.stale) {
      process.stdout.write(`ok      ${path} (${counts})\n`);
      if (comparison.report) process.stdout.write(`${comparison.report}\n`);
      continue;
    }
    stale = true;
    process.stdout.write(
      `stale   ${path} -- run \`pnpm standings --group ${division}\`\n`,
    );
    process.stdout.write(`${comparison.report}\n\n`);
    process.stdout.write(`${standingsDiff(committed, rendered)}\n\n`);
  }
  if (stale) process.exitCode = 1;
}

function progressPrinter(
  division: StandingsDivision,
  totalGames: number,
): (completed: number, total: number) => void {
  let lastPercent = -1;
  return (completed, total) => {
    const done = Math.floor((completed / total) * 100);
    if (done === lastPercent) return;
    lastPercent = done;
    process.stderr.write(
      `\r${division} ${String(completed)}/${String(totalGames)} games (${String(done)}%)`,
    );
  };
}

/**
 * Runs one division across `jobs` worker processes and reassembles its report.
 *
 * Identical to a single-process run, not merely equivalent: every game is a pure
 * function of (decks, seed, seat), and `mergeShardedReports` restores canonical
 * matchup order before the summary is recomputed. `createdAt` would have been
 * the one observable difference, and these files drop it.
 */
async function runSharded(
  run: DivisionRun,
  jobs: number,
  arguments_: readonly string[],
  shard: Shard | undefined,
): Promise<BenchmarkReport> {
  const reports = await runShards<BenchmarkReport>({
    // The worker re-parses the run's own flags, so pass them through minus the
    // ones the parent owns: how the run is split, where its output goes, and
    // which division this is -- the parent runs them in turn and a worker is
    // told the one it is for.
    arguments: [
      ...stripFlags(arguments_, [
        "jobs",
        "shard",
        "check",
        "shard-out",
        "group",
      ]),
      `--group=${run.division}`,
    ],
    jobs,
    totalGames: run.ownGames,
    ...(shard ? { shard } : {}),
  });
  return assembleReport(run.common, mergeShardedReports(reports, run.pairs));
}

export type StandingsRun = Omit<
  Parameters<typeof runBenchmark>[0],
  "onProgress" | "shard"
>;

/**
 * One report over `games`, however they were played.
 *
 * The two ways a run can be split -- `--jobs` forks on one machine, `--shard`
 * plus `--merge` across several -- both end here, so a file is a function of
 * its games and nothing else.
 */
function assembleReport(
  common: StandingsRun,
  games: BenchmarkGame[],
): BenchmarkReport {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    rulesVersion: common.rulesVersion,
    // Deliberately empty, and dropped by `standingsFromReport`: a wall-clock
    // stamp is the one thing that would make every regeneration a diff.
    createdAt: "",
    configuration: {
      mode: "all-vs-all",
      focusDeck: null,
      decks: [...(common.decks ?? [])],
      seedsPerMatchup: common.seedsPerMatchup,
      pairedSeats: true,
      seedPrefix: common.seedPrefix,
      maxActions: common.maxActions ?? STANDINGS_MAX_ACTIONS,
    },
    summary: summarizeGames(games),
    games,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runStandings(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
