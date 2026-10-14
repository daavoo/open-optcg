/**
 * Why the rules agent made each recorded move that a fork target names.
 *
 *   pnpm exec tsx research/system1/bridge/reasons.ts \
 *     --targets research/system1/data/census-forks/targets.jsonl \
 *     --cluster "(Purple) Kaido - Official Feature Deck" --out reasons.jsonl
 *
 * Replays each target's game to its decision exactly as `fork.ts` does and
 * writes the rules agent's `lastDecision` there: the module that answered and
 * its reason strings. A fork cluster groups positions by what the move *was*;
 * the reason says which branch of the policy chose it, and one cluster can
 * hold a broken branch and a sound one -- Purple Enel's declined Counters
 * split into "cannot save the target" (a pricing bug) and "take nonlethal
 * Life" (a trade the model was no better at), and nothing in the position
 * text told them apart. `sys1.forks reasons` joins this file to the fork
 * results.
 */
import { createWriteStream, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { playRulesGame } from "./rules-game.js";
import { renderDecision } from "../../../packages/agents/src/scorer/render.js";
import { prunedActions } from "../../../packages/agents/src/scorer/dominance.js";

/** The fields of a rules agent's `lastDecision` this reads. */
interface Explained {
  lastDecision?: {
    moduleId?: string;
    reasons: string[];
    narrowedBy?: string[];
  };
}

interface Target {
  id: number;
  cluster: [string, string, string, string];
  seed: string;
  p1: string;
  p2: string;
  decision: number;
  rules: string;
}

const { values } = parseArgs({
  options: {
    targets: { type: "string" },
    cluster: { type: "string", multiple: true },
    out: { type: "string" },
  },
});
const clusters = new Set(values.cluster ?? []);
const targets = readFileSync(values.targets!, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Target)
  .filter((target) => clusters.size === 0 || clusters.has(target.cluster[0]));
const out = createWriteStream(values.out!);

for (const target of targets) {
  let recorded = 0;
  let row: Record<string, unknown> = { id: target.id, status: "unreached" };
  await playRulesGame(
    target.p1,
    target.p2,
    `fork-${target.id}`,
    target.seed,
    (observation, chosen, agent) => {
      if (row.status !== "unreached") return chosen;
      const pruned = prunedActions(observation);
      if (observation.legalActions.length - pruned.size <= 1) return chosen;
      const index = recorded;
      recorded += 1;
      if (index !== target.decision) return chosen;
      const rendered = renderDecision(observation);
      const played = rendered.actions[observation.legalActions.indexOf(chosen)];
      const decision = (agent as Explained).lastDecision;
      row = {
        id: target.id,
        status: played === target.rules ? "reached" : "diverged",
        module: decision?.moduleId ?? null,
        reasons: decision?.reasons ?? [],
        narrowedBy: decision?.narrowedBy ?? [],
        chose: played,
      };
      return chosen;
    },
  );
  out.write(`${JSON.stringify(row)}\n`);
}
out.end();
