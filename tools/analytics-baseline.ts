/**
 * Precomputes the deck analytics matrix for the format decks and writes the
 * report that `build-web.ts` inlines into the browser artifact.
 *
 * The page used to run this batch itself, which meant every reader paid for the
 * same 3,600 games and got a different answer per session. Running it here once
 * per policy change makes the built-in matrix instant and identical for
 * everyone; the browser only simulates what is genuinely new, which is a deck
 * the reader just built.
 *
 *   pnpm analytics:baseline [--seeds 100] [--rules-version rules-v1]
 *                          [--output packages/web/src/analytics-baseline.json]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  ANALYTICS_DECK_IDS,
  DEFAULT_MAX_ACTIONS,
  matchupPairs,
  matchupSeed,
  playAnalyticsGame,
  summarizeGames,
  type AnalyticsGame,
} from "../packages/web/src/analytics.js";

const DEFAULT_OUTPUT = "packages/web/src/analytics-baseline.json";

const options = parseOptions(process.argv.slice(2));
const seeds = positiveInteger(options.seeds ?? "100", "--seeds");
const maxActions = positiveInteger(
  options["max-actions"] ?? String(DEFAULT_MAX_ACTIONS),
  "--max-actions",
);
const seedPrefix = options["seed-prefix"] ?? "analytics";
const rulesVersion = options["rules-version"] ?? "current";
const output = resolve(process.cwd(), options.output ?? DEFAULT_OUTPUT);

const decks = [...ANALYTICS_DECK_IDS];
const pairs = matchupPairs(decks);
const total = pairs.length * seeds;
const games: AnalyticsGame[] = [];
const startedAt = Date.now();
let lastPercent = -1;

for (const [firstDeck, secondDeck] of pairs) {
  for (let index = 0; index < seeds; index += 1) {
    games.push(
      await playAnalyticsGame({
        firstDeck,
        secondDeck,
        seed: matchupSeed(seedPrefix, firstDeck, secondDeck, index),
        maxActions,
      }),
    );
    const percent = Math.floor((games.length / total) * 100);
    if (percent !== lastPercent) {
      process.stderr.write(`\r${games.length}/${total} games (${percent}%)`);
      lastPercent = percent;
    }
  }
}
process.stderr.write("\n");

const report = summarizeGames(games, {
  decks,
  rulesVersion,
  seedPrefix,
  seedsPerMatchup: seeds,
  maxActions,
});
const serialized = `${JSON.stringify(report)}\n`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, serialized);

const unfinished = games.filter((game) => game.winner === null).length;
process.stdout.write(
  `Wrote ${relative(process.cwd(), output)} — ${games.length} games over ${pairs.length} ordered pairs, ` +
    `${unfinished} unfinished, ${Math.round((Date.now() - startedAt) / 1000)}s, ` +
    `${Math.round(Buffer.byteLength(serialized) / 1024)} KB\n`,
);
if (unfinished > 0) process.exitCode = 1;

function parseOptions(argv: readonly string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) continue;
    const [key, inline] = argument.slice(2).split("=", 2);
    if (!key) continue;
    parsed[key] = inline ?? argv[++index] ?? "";
  }
  return parsed;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${flag} must be a positive integer`);
  return parsed;
}
