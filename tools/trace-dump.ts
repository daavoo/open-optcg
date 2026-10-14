/**
 * Writes diagnostics JSONL for games a benchmark report already scored.
 *
 * The gap this closes: `pnpm deck:benchmark` plays thousands of games and
 * records, per game, who won and in how many turns -- and nothing about how the
 * seat played. `pnpm trace:audit` answers exactly that question ("which
 * recurring habit separates a strong pilot from a weak one") and reads v2
 * diagnostics JSONL, which only the web app and `pnpm matchup:llm` produce. So
 * the two ends of the only causal chain a policy audit has -- habit and result
 * -- could not be joined, and every claim about *how* a deck loses its worst
 * matchup rested on reading one game by hand with `pnpm trace:match`.
 *
 * A report row is enough to replay its game exactly: the benchmark is
 * seed-deterministic, and the row carries the seed, both decks and the seat
 * order. This selects rows, replays them through the benchmark's own
 * `playGame`, and writes one trace per game.
 *
 * It replays through that function rather than a loop of its own on purpose. A
 * trace of a slightly different game is worse than no trace, and the ways to
 * drift are not hypothetical: the create call, whether an agent gets a
 * simulator, the action cap. One loop, used by both, cannot drift. The tool
 * asserts the replayed winner and turn count against the row it came from, so a
 * drift that does appear is reported rather than analysed.
 *
 * Usage:
 *   pnpm trace:dump --report analysis/op16-baseline.json \
 *     --deck "(Green/Blue) Monkey.D.Luffy - Official Feature Deck" \
 *     --result lost --opponent "(Red) Monkey.D.Luffy - Starter Deck 31" \
 *     --limit 40 --out analysis/op16-losses
 *   pnpm trace:audit analysis/op16-losses/*.jsonl
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rulesStamp } from "@one-piece-sim/engine-core";
import {
  playGame,
  type BenchmarkCheckpoint,
  type BenchmarkDeckId,
} from "../packages/cli/src/deck-benchmark.js";
import { buildDiagnosticsJsonl } from "../packages/web/src/diagnostics.js";
import type {
  MatchConfig,
  TraceCheckpoint,
} from "../packages/web/src/controller.js";
import type { PublicEvent } from "@one-piece-sim/protocol";

const flags = new Map<string, string>();
for (let index = 0; index < process.argv.length; index += 1) {
  const argument = process.argv[index]!;
  if (!argument.startsWith("--")) continue;
  const [key, inline] = argument.slice(2).split("=", 2);
  if (!key) continue;
  const next = process.argv[index + 1];
  if (inline !== undefined) flags.set(key, inline);
  else if (next && !next.startsWith("--")) flags.set(key, next);
  else flags.set(key, "true");
}

const reportPath = flags.get("report");
const outputDirectory = flags.get("out") ?? "analysis/traces";
const deck = flags.get("deck");
const opponent = flags.get("opponent");
const result = flags.get("result") ?? "all";
const limit = Number(flags.get("limit") ?? "20");
const maxActions = Number(flags.get("max-actions") ?? "1000");

if (!reportPath || !deck) {
  throw new Error(
    'USAGE: pnpm trace:dump --report <report.json> --deck "<deck id>" [--opponent "<deck id>"] [--result won|lost] [--limit 20] [--out dir]',
  );
}
if (result !== "all" && result !== "won" && result !== "lost") {
  throw new Error(`INVALID_RESULT: ${result}; use won, lost or all`);
}

/** The fields of a report row this tool reads. */
interface ReportGame {
  seed: string;
  p1Deck: string;
  p2Deck: string;
  winnerDeck: string | null;
  turns: number;
  completed: boolean;
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
  games?: readonly ReportGame[];
};
const games = report.games ?? [];
if (games.length === 0) throw new Error(`NO_GAMES_IN_REPORT: ${reportPath}`);

const selected = games
  .filter((game) => game.p1Deck === deck || game.p2Deck === deck)
  .filter(
    (game) =>
      opponent === undefined ||
      game.p1Deck === opponent ||
      game.p2Deck === opponent,
  )
  .filter((game) => game.completed)
  .filter((game) => {
    if (result === "all") return true;
    const won = game.winnerDeck === deck;
    return result === "won" ? won : !won;
  })
  .slice(0, limit);

if (selected.length === 0) {
  throw new Error(
    `NO_MATCHING_GAMES: deck=${deck} opponent=${opponent ?? "any"} result=${result}`,
  );
}

mkdirSync(outputDirectory, { recursive: true });
console.log(
  `${selected.length} of ${games.length} games selected; replaying into ${outputDirectory}`,
);

let drifted = 0;
for (const [index, row] of selected.entries()) {
  const initialEvents: PublicEvent[] = [];
  const checkpoints: TraceCheckpoint[] = [];
  const played = await playGame(
    row.p1Deck as BenchmarkDeckId,
    row.p2Deck as BenchmarkDeckId,
    row.seed,
    maxActions,
    undefined,
    {
      onCreate(events) {
        initialEvents.push(...events);
      },
      onCheckpoint(checkpoint: BenchmarkCheckpoint) {
        checkpoints.push(checkpoint);
      },
    },
  );
  // The replay is only worth reading if it is the game the row scored. The
  // benchmark is seed-deterministic, so a mismatch means something moved
  // underneath the report -- the engine, an agent, a registration -- and the
  // right response is to say so, not to analyse a different game.
  if (played.winnerDeck !== row.winnerDeck || played.turns !== row.turns) {
    drifted += 1;
    console.log(
      `  ! ${row.seed}: report says ${row.winnerDeck} on turn ${row.turns}, replay says ${played.winnerDeck} on turn ${played.turns} -- report is stale`,
    );
    continue;
  }
  const config: MatchConfig = {
    p1Deck: row.p1Deck,
    p2Deck: row.p2Deck,
    p1Controller: "rules",
    p2Controller: "rules",
    seed: row.seed,
    startingPlayer: "random",
  };
  const outcome = played.winnerDeck === deck ? "won" : "lost";
  const file = join(
    outputDirectory,
    `game-${String(index).padStart(3, "0")}-${outcome}-t${played.turns}.jsonl`,
  );
  writeFileSync(
    file,
    buildDiagnosticsJsonl({
      trace: {
        version: 1,
        config,
        actions: checkpoints.map((checkpoint) => checkpoint.actionId),
        initialEvents,
        checkpoints,
        // Same stamp the app and `matchup:llm` write, so a stale trace reports
        // itself as stale instead of failing mid-replay.
        rules: rulesStamp(),
      },
      llmRecords: [],
      exportedAt: new Date().toISOString(),
    }),
  );
  console.log(
    `  ${file}  ${outcome} on turn ${played.turns}, ${checkpoints.length} decisions`,
  );
}

console.log(
  drifted === 0
    ? `done: ${selected.length - drifted} traces`
    : `done: ${selected.length - drifted} traces, ${drifted} rows stale`,
);
