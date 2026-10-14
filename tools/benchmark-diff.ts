/**
 * Paired diff of two `pnpm deck:benchmark` reports for one deck.
 *
 * The benchmark is deterministic in its seeds, so two runs of the same
 * configuration against different builds play the *same games* -- which makes
 * them paired samples, not independent ones. Comparing only the summary win
 * rates throws that pairing away and reports a confidence interval roughly
 * three times wider than the data supports.
 *
 * This joins the two reports game by game on (seed, p1Deck, p2Deck) and counts
 * the games the change flipped. The z is McNemar's: concordant games carry no
 * information about the change and are excluded rather than folded into the
 * variance.
 *
 * Usage:
 *   pnpm benchmark:diff --deck ST32 before.json after.json
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BenchmarkReport } from "../packages/cli/src/deck-benchmark.js";

interface Options {
  deck: string;
  before: string;
  after: string;
}

function parse(argv: string[]): Options {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const [key, inline] = argument.slice(2).split("=", 2);
    if (!key) continue;
    const next = argv[index + 1];
    if (inline !== undefined) flags.set(key, inline);
    else if (next && !next.startsWith("--")) flags.set(key, argv[++index]!);
    else flags.set(key, "true");
  }
  const [before, after] = positional;
  if (!before || !after)
    throw new Error("Usage: benchmark:diff --deck ST32 before.json after.json");
  return {
    deck: flags.get("deck") ?? "(Green) Roronoa Zoro - Starter Deck 32",
    before,
    after,
  };
}

async function load(path: string): Promise<BenchmarkReport> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as BenchmarkReport;
}

const key = (game: { seed: string; p1Deck: string; p2Deck: string }): string =>
  `${game.seed}|${game.p1Deck}|${game.p2Deck}`;

function mcNemarZ(afterOnly: number, beforeOnly: number): number {
  const discordant = afterOnly + beforeOnly;
  if (discordant === 0) return 0;
  return (afterOnly - beforeOnly) / Math.sqrt(discordant);
}

const significance = (z: number): string =>
  Math.abs(z) >= 2.576 ? "**" : Math.abs(z) >= 1.96 ? "*" : "";

interface Tally {
  games: number;
  beforeWins: number;
  afterWins: number;
  afterOnly: number;
  beforeOnly: number;
}

const emptyTally = (): Tally => ({
  games: 0,
  beforeWins: 0,
  afterWins: 0,
  afterOnly: 0,
  beforeOnly: 0,
});

function row(label: string, tally: Tally): Record<string, string | number> {
  const z = mcNemarZ(tally.afterOnly, tally.beforeOnly);
  const rate = (wins: number) =>
    `${((wins / Math.max(1, tally.games)) * 100).toFixed(1)}%`;
  return {
    matchup: label,
    games: tally.games,
    before: rate(tally.beforeWins),
    after: rate(tally.afterWins),
    delta: `${(((tally.afterWins - tally.beforeWins) / Math.max(1, tally.games)) * 100).toFixed(1)}pt`,
    flipped: `+${tally.afterOnly}/-${tally.beforeOnly}`,
    z: z.toFixed(2),
    sig: significance(z),
  };
}

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2));
  const [before, after] = await Promise.all([
    load(options.before),
    load(options.after),
  ]);
  const afterByKey = new Map(after.games.map((game) => [key(game), game]));

  const byOpponent = new Map<string, Tally>();
  const overall = emptyTally();
  let unmatched = 0;

  for (const beforeGame of before.games) {
    const afterGame = afterByKey.get(key(beforeGame));
    if (!afterGame) {
      unmatched += 1;
      continue;
    }
    if (!beforeGame.completed || !afterGame.completed) continue;
    const opponent =
      beforeGame.p1Deck === options.deck
        ? beforeGame.p2Deck
        : beforeGame.p1Deck;
    if (
      beforeGame.p1Deck !== options.deck &&
      beforeGame.p2Deck !== options.deck
    )
      continue;
    const tally = byOpponent.get(opponent) ?? emptyTally();
    const beforeWon = beforeGame.winnerDeck === options.deck;
    const afterWon = afterGame.winnerDeck === options.deck;
    for (const target of [tally, overall]) {
      target.games += 1;
      if (beforeWon) target.beforeWins += 1;
      if (afterWon) target.afterWins += 1;
      if (afterWon && !beforeWon) target.afterOnly += 1;
      if (beforeWon && !afterWon) target.beforeOnly += 1;
    }
    byOpponent.set(opponent, tally);
  }

  const rows = [...byOpponent.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([opponent, tally]) => row(`${options.deck} vs ${opponent}`, tally));
  rows.push(row("ALL", overall));

  console.log(
    `\nPaired diff for ${options.deck}: ${options.before} -> ${options.after}`,
  );
  if (unmatched > 0)
    console.log(`${unmatched} games in the before report had no paired game.`);
  console.table(rows);
  console.log(
    "z is McNemar on flipped games only; * p<0.05, ** p<0.01. Concordant games carry no signal.",
  );
}

await main();
