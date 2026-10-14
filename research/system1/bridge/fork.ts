/**
 * Replays recorded rules-agent games to one decision each, makes a different
 * move there, and lets the rules agents finish the game: what would have
 * happened had the rules agent followed the model at that one decision.
 *
 *   pnpm exec tsx research/system1/bridge/fork.ts --targets forks/targets.jsonl \
 *     --shard 0/12 --out forks/result-00.jsonl
 *
 * Each target (written by `sys1.forks pick`) names a game of a `dump.ts
 * --prune` corpus by its seed and decks, the index of one of its recorded
 * decisions, the option text the rules agent chose there and the one to play
 * instead. The game is replayed with `playRulesGame`, the loop `dump.ts`
 * recorded it with, counting decisions the way `--prune` records them; a
 * target whose recorded option is not the one the replay reaches is reported
 * as `diverged` and not played on.
 */
import { createWriteStream, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { playRulesGame } from "./rules-game.js";
import { renderDecision } from "../../../packages/agents/src/scorer/render.js";
import { prunedActions } from "../../../packages/agents/src/scorer/dominance.js";

interface Target {
  id: number;
  seed: string;
  p1: string;
  p2: string;
  decision: number;
  rules: string;
  model: string;
}

const { values } = parseArgs({
  options: {
    targets: { type: "string" },
    shard: { type: "string", default: "0/1" },
    out: { type: "string" },
  },
});
const [shardIndex, shardCount] = values.shard.split("/").map(Number) as [
  number,
  number,
];
const targets = readFileSync(values.targets!, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Target)
  .filter((target) => target.id % shardCount === shardIndex);
const out = createWriteStream(values.out!);
const started = performance.now();

for (const [done, target] of targets.entries()) {
  let recorded = 0;
  let status: "forked" | "diverged" | "unreached" = "unreached";
  const { state, actions } = await playRulesGame(
    target.p1,
    target.p2,
    `fork-${target.id}`,
    target.seed,
    (observation, chosen) => {
      const pruned = prunedActions(observation);
      if (observation.legalActions.length - pruned.size <= 1) return chosen;
      const index = recorded;
      recorded += 1;
      if (index !== target.decision) return chosen;
      const rendered = renderDecision(observation);
      const played = observation.legalActions.findIndex(
        (action) => action.actionId === chosen.actionId,
      );
      const instead = rendered.actions.findIndex(
        (text, i) => !pruned.has(i) && text === target.model,
      );
      if (rendered.actions[played] !== target.rules || instead < 0) {
        status = "diverged";
        return chosen;
      }
      status = "forked";
      return observation.legalActions[instead]!;
    },
  );
  out.write(
    `${JSON.stringify({
      id: target.id,
      status,
      winner: state.winner,
      truncated: state.phase !== "finished",
      actions,
    })}\n`,
  );
  if ((done + 1) % 50 === 0) {
    const seconds = (performance.now() - started) / 1000;
    process.stderr.write(
      `shard ${shardIndex}: ${done + 1}/${targets.length} forks, ${((done + 1) / seconds).toFixed(1)}/s\n`,
    );
  }
}
out.end();
