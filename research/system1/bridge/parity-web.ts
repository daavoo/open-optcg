/**
 * The in-browser scorer against the MLX model it was exported from.
 *
 *   .venv/bin/python -m sys1.export_web checkpoints/play <pack> --parity data/parity-web.json
 *   pnpm exec tsx research/system1/bridge/parity-web.ts <pack> research/system1/data/parity-web.json
 *
 * Reports the largest probability gap per decision, whether the top action
 * agrees, and the forward time -- the number that decides whether the plain
 * TypeScript path is fast enough to play against.
 */
import { readFileSync } from "node:fs";
import { ScorerAgent, type ScorerPack } from "@one-piece-sim/agents/scorer";

const [packPath, samplesPath] = process.argv.slice(2);
const pack = JSON.parse(readFileSync(packPath!, "utf8")) as ScorerPack;
const samples = JSON.parse(readFileSync(samplesPath!, "utf8")) as Array<{
  state: string;
  actions: string[];
  probs: number[];
  value: number;
}>;
const agent = new ScorerAgent(pack);
let worst = 0;
let agree = 0;
let elapsed = 0;
let tokens = 0;
for (const sample of samples) {
  const packed = agent.packRendered(sample);
  const started = performance.now();
  const { probs, value } = await agent.score(packed);
  elapsed += performance.now() - started;
  tokens += packed.ids.length;
  const gap = Math.max(...probs.map((p, i) => Math.abs(p - sample.probs[i]!)));
  worst = Math.max(worst, gap, Math.abs(value - sample.value) / 2);
  const top = (xs: number[]) => xs.indexOf(Math.max(...xs));
  if (top(probs) === top(sample.probs)) agree += 1;
}
console.log(
  `${samples.length} decisions: top action agrees ${agree}/${samples.length}, ` +
    `worst probability gap ${worst.toFixed(4)}, ` +
    `${(elapsed / samples.length).toFixed(0)} ms per decision (${(tokens / samples.length).toFixed(0)} tokens)`,
);
