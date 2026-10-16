/**
 * Plays rules agent against rules agent across the whole selectable catalog and
 * writes every real decision (two or more legal actions) as rendered text.
 *
 * This is the behaviour-cloning corpus and the source of the token-budget
 * statistics that size the model. Each line is one game: the decisions of both
 * seats in order, with the index the rules agent chose and the game's result,
 * so a value target can be joined without a second pass.
 *
 *   pnpm exec tsx ml/bridge/dump.ts \
 *     --games 200 --shard 0/12 --out ml/data/corpus-x/shard-00.jsonl.gz
 *
 * Deck pairings walk every ordered pair of distinct training decks (`decks.ts`) in turn,
 * so a shard of N games covers the catalog evenly rather than by chance.
 *
 * With `--prune`, each decision offers what the scorer's seat is offered: the
 * provably dominated actions (`dominance.ts`) are dropped, as `server.ts`
 * drops them, so the model scores the options it was trained on
 * (`sys1.census`). A decision left with one option is not written, and one
 * where the rules agent chose a dropped action is written with `chosen: -1`
 * and the action's text as `dominated`.
 */
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGzip } from "node:zlib";
import { parseArgs } from "node:util";
import { TRAINING_DECK_IDS } from "./decks.js";
import { playRulesGame } from "./rules-game.js";
import {
  RENDER_VERSION,
  renderDecision,
} from "../../packages/agents/src/scorer/render.js";
import { prunedActions } from "../../packages/agents/src/scorer/dominance.js";

const { values } = parseArgs({
  options: {
    games: { type: "string", default: "50" },
    shard: { type: "string", default: "0/1" },
    out: { type: "string" },
    seed: { type: "string", default: "sys1" },
    prune: { type: "boolean", default: false },
  },
});

const [shardIndex, shardCount] = values.shard.split("/").map(Number) as [
  number,
  number,
];
const games = Number(values.games);
const out =
  values.out ?? `ml/data/corpus/shard-${shardIndex}.jsonl.gz`;

const pairs: [string, string][] = [];
for (const p1 of TRAINING_DECK_IDS)
  for (const p2 of TRAINING_DECK_IDS) if (p1 !== p2) pairs.push([p1, p2]);

mkdirSync(dirname(out), { recursive: true });
const gzip = createGzip();
gzip.pipe(createWriteStream(out));

let decisions = 0;
const started = performance.now();

for (let local = 0; local < games; local += 1) {
  const game = local * shardCount + shardIndex;
  const [p1Deck, p2Deck] = pairs[game % pairs.length]!;
  const seed = `${values.seed}-${game}`;
  const records: unknown[] = [];
  const { state, actions } = await playRulesGame(
    p1Deck,
    p2Deck,
    `sys1-${game}`,
    seed,
    (observation, chosen) => {
      const pruned = values.prune
        ? prunedActions(observation)
        : new Set<number>();
      if (observation.legalActions.length - pruned.size > 1) {
        const rendered = renderDecision(observation);
        const index = observation.legalActions.findIndex(
          (action) => action.actionId === chosen.actionId,
        );
        const kept = rendered.actions.flatMap((_, i) =>
          pruned.has(i) ? [] : [i],
        );
        records.push({
          seat: observation.viewer,
          turn: observation.turn,
          state: rendered.state,
          actions: kept.map((i) => rendered.actions[i]!),
          chosen: kept.indexOf(index),
          ...(pruned.has(index) ? { dominated: rendered.actions[index] } : {}),
        });
      }
      return chosen;
    },
  );
  decisions += records.length;
  gzip.write(
    `${JSON.stringify({
      game,
      seed,
      p1: p1Deck,
      p2: p2Deck,
      render: RENDER_VERSION,
      winner: state.winner,
      truncated: state.phase !== "finished",
      actions,
      decisions: records,
    })}\n`,
  );
  if ((local + 1) % 10 === 0) {
    const seconds = (performance.now() - started) / 1000;
    process.stderr.write(
      `shard ${shardIndex}: ${local + 1}/${games} games, ${decisions} decisions, ${(decisions / seconds).toFixed(0)}/s\n`,
    );
  }
}

gzip.end();
