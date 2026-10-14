/**
 * The small scorer's GPU path against its CPU path, in a browser: built into
 * a page by `gpu-parity.ts`, which reads `window.result`.
 */
import {
  CompactGpu,
  loadCompact,
  requestGpuDevice,
  type CompactDecision,
  type CompactPack,
} from "../../../packages/agents/src/scorer/index.js";

declare const __PACK__: CompactPack;
declare const __SAMPLES__: Array<{ decision: CompactDecision }>;

async function main(): Promise<unknown> {
  const device = await requestGpuDevice();
  if (!device) return { gpu: false };
  const model = loadCompact(__PACK__);
  const gpu = new CompactGpu(device, model);
  const decisions = __SAMPLES__.map((s) => s.decision);
  const cpuStart = performance.now();
  const cpu = decisions.map((d) => model.score(d));
  const cpuMs = (performance.now() - cpuStart) / decisions.length;
  const blocks = (stage: Parameters<typeof gpu.run>[0]) => gpu.run(stage);
  const gpuOut = await model.scoreMany(decisions, blocks);
  let worstProb = 0;
  let worstValue = 0;
  let agree = 0;
  gpuOut.forEach((g, k) => {
    const c = cpu[k]!;
    g.probs.forEach((p, i) => {
      worstProb = Math.max(worstProb, Math.abs(p - c.probs[i]!));
    });
    worstValue = Math.max(worstValue, Math.abs(g.value - c.value));
    const arg = (xs: number[]) => xs.indexOf(Math.max(...xs));
    if (arg(g.probs) === arg(c.probs)) agree += 1;
  });
  const timing: Record<number, number> = {};
  for (const size of [1, 8, 32, 64, 128]) {
    const batch = Array.from(
      { length: size },
      (_, i) => decisions[i % decisions.length]!,
    );
    await model.scoreMany(batch, blocks);
    const start = performance.now();
    for (let r = 0; r < 3; r += 1) await model.scoreMany(batch, blocks);
    timing[size] = (performance.now() - start) / 3 / size;
  }
  return {
    gpu: true,
    agree,
    total: decisions.length,
    worstProb,
    worstValue,
    cpuMs,
    gpuMsPerDecision: timing,
  };
}

main().then(
  (result) => {
    (window as unknown as { result: unknown }).result = result;
  },
  (error: unknown) => {
    (window as unknown as { result: unknown }).result = {
      error: String(error),
    };
  },
);
