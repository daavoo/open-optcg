/**
 * Replays a recorded sim game through the bridge without the sim.
 *
 *   pnpm optcgsim:replay <game>.sim.jsonl [--until N] [--model path]
 *
 * A `.sim.jsonl` holds every table the sim showed the bridge and the move it
 * was sent back. Fed to the bridge again in order, the same tables get the
 * same answers for as long as the bridge's code has not changed what it says,
 * so the engine's game is rebuilt exactly as it was -- which is what lets a
 * place the two games parted be looked at, or a fix for it tried, in seconds.
 *
 * The replay stops at the first table the bridge now answers differently:
 * the sim's later tables followed from the old answer, not the new one.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Decider } from "./decide.js";
import { modelCacheDir } from "./paths.js";
import { resolveModel } from "./model-source.js";
import { Recorder } from "./recorder.js";
import type { SimMove, TableSnapshot } from "./snapshot.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const file = args.find((arg) => arg.endsWith(".jsonl"));
if (!file) {
  console.error("usage: pnpm optcgsim:replay <game>.sim.jsonl [--until N]");
  process.exit(1);
}
const until = Number(flag("until") ?? Number.POSITIVE_INFINITY);
const model = await resolveModel({
  ...(flag("model") ? { modelPath: flag("model")! } : {}),
  cacheDir: modelCacheDir(),
  log: (line) => {
    console.log(`model: ${line}`);
  },
});
const decider = new Decider(model);
const directory = mkdtempSync(join(tmpdir(), "optcgsim-replay-"));
const recorder = new Recorder(directory, decider);

interface Row {
  snapshot?: TableSnapshot;
  move?: SimMove;
}
const rows = readFileSync(file, "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as Row);

let parted = 0;
for (const [index, row] of rows.entries()) {
  if (index > until || !row.snapshot) continue;
  if (!row.move) {
    recorder.observe(row.snapshot);
    continue;
  }
  const decision = await recorder.decide(row.snapshot);
  const same = JSON.stringify(decision.move) === JSON.stringify(row.move);
  const step = row.snapshot.step.kind;
  if (decision.record.status === "diverged" && parted === 0) {
    parted = index;
    console.log(`#${index} the games part: ${decision.record.why ?? ""}`);
  }
  if (!same) {
    console.log(
      `#${index} turn ${row.snapshot.turn} ${row.snapshot.seat} ${step}: the bridge now answers differently`,
    );
    console.log(`  then: ${JSON.stringify(row.move)}`);
    console.log(
      `  now:  ${JSON.stringify(decision.move)} (${decision.summary})`,
    );
    break;
  }
}
console.log(
  parted > 0
    ? `first parted at #${parted}; the replay's files are in ${directory}`
    : `no parting up to where the replay stopped; files in ${directory}`,
);
