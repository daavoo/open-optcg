/**
 * The in-browser small scorer (`compact-model.ts`) against the MLX model it was
 * exported from, on the samples `sys1.export_compact --parity` wrote.
 *
 *   pnpm exec tsx research/system1/bridge/parity-compact.ts \
 *     research/system1/checkpoints/compact-scorer-model.json research/system1/checkpoints/compact-parity.json
 *
 * With a third argument, a deck adapter (`sys1.export_adapter`) applied over
 * the pack, against the samples that export wrote.
 *
 * Loads the pack the way the app does and scores each sample's decision;
 * reports the largest probability and value gaps and how often the two pick
 * the same option. Exits non-zero past the tolerance.
 */
import { readFileSync } from "node:fs";
import {
  loadCompact,
  type CompactAdapter,
  type CompactDecision,
  type CompactPack,
} from "../../../packages/agents/src/scorer/index.js";

const [packPath, samplesPath, adapterPath] = process.argv.slice(2);
if (!packPath || !samplesPath)
  throw new Error(
    "usage: parity-compact.ts <pack.json> <parity.json> [adapter.json]",
  );
const model = loadCompact(
  JSON.parse(readFileSync(packPath, "utf8")) as CompactPack,
  adapterPath
    ? (JSON.parse(readFileSync(adapterPath, "utf8")) as CompactAdapter)
    : undefined,
);
const samples = JSON.parse(readFileSync(samplesPath, "utf8")) as {
  decision: CompactDecision;
  probs: number[];
  value: number;
}[];

const argmax = (xs: number[]) =>
  xs.reduce((best, x, i) => (x > xs[best]! ? i : best), 0);
let worstProb = 0;
let worstValue = 0;
let agree = 0;
const started = performance.now();
for (const sample of samples) {
  const { probs, value } = model.score(sample.decision);
  for (let k = 0; k < probs.length; k += 1)
    worstProb = Math.max(worstProb, Math.abs(probs[k]! - sample.probs[k]!));
  worstValue = Math.max(worstValue, Math.abs(value - sample.value));
  if (argmax(probs) === argmax(sample.probs)) agree += 1;
}
const perDecision = (performance.now() - started) / samples.length;
console.log(
  `${agree}/${samples.length} same top option; worst probability gap ${worstProb.toFixed(4)}, worst value gap ${worstValue.toFixed(4)}; ${perDecision.toFixed(1)} ms a decision`,
);
// Float16 weights against MLX's float32: a few thousandths is the expected noise.
if (worstProb > 0.02 || worstValue > 0.02) process.exit(1);
