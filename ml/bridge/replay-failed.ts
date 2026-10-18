/**
 * Replays a game the engine threw on, from `checkpoints/failed-games.jsonl`
 * (written by `sys1/env.py` whenever the bridge reports `failed`), and
 * prints the last few decisions before the throw.
 *
 *   pnpm exec tsx ml/bridge/replay-failed.ts \
 *     ml/checkpoints/failed-games.jsonl [line] [decisions]
 *
 * A failed game carries its spec and every action id taken, and the engine
 * is deterministic from those, so this reaches the same state the rollout did.
 */
import { readFileSync } from "node:fs";
import {
  applyAction,
  createGame,
  observe,
  toGameAction,
} from "@one-piece-sim/engine-core";
import type { TimeLimit } from "@one-piece-sim/protocol";
import { resolveTrainingDeck } from "./decks.js";

interface FailedGame {
  error: string;
  spec: {
    id: number;
    p1: string;
    p2: string;
    seed: string;
    /** Absent from a record written before the bridge played under one. */
    timeLimit?: TimeLimit;
  };
  taken: string[];
}

const [path, line = "0", shown = "6"] = process.argv.slice(2);
const entry = JSON.parse(
  readFileSync(path!, "utf8").split("\n")[Number(line)]!,
) as FailedGame;
const { spec, taken } = entry;
let state = createGame({
  gameId: `sys1-rl-${spec.id}-${spec.seed}`,
  p1: resolveTrainingDeck(spec.p1),
  p2: resolveTrainingDeck(spec.p2),
  seed: spec.seed,
  startingPlayer: "random",
  ...(spec.timeLimit ? { timeLimit: spec.timeLimit } : {}),
});
console.log(`${spec.p1} vs ${spec.p2}, seed ${spec.seed}: ${entry.error}`);
for (const [index, actionId] of taken.entries()) {
  const observation = observe(state, state.activePlayer);
  const action = observation.legalActions.find(
    (candidate) => candidate.actionId === actionId,
  );
  if (!action) throw new Error(`not legal at action ${index}: ${actionId}`);
  if (index >= taken.length - Number(shown)) {
    const board = (player: "p1" | "p2") =>
      state.players[player].board
        .map((card) => `${card.instanceId}=${card.cardNumber}`)
        .join(" ");
    console.log(`\n#${index} ${state.activePlayer} takes ${actionId}`);
    console.log(`  ${action.summary}`);
    console.log(`  p1 board: ${board("p1")}`);
    console.log(`  p2 board: ${board("p2")}`);
    console.log(
      `  offered: ${observation.legalActions.map((a) => a.actionId).join(", ")}`,
    );
  }
  try {
    state = applyAction(state, toGameAction(action, state.revision)).state;
  } catch (error) {
    console.log(
      `\nthrows at action ${index}: ${error instanceof Error ? error.message : String(error)}`,
    );
    break;
  }
}
