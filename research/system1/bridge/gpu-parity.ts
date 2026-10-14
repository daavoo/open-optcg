/**
 * The small scorer's WebGPU blocks (`compact-gpu.ts`) against its CPU pass,
 * and what a decision costs on each, in a real browser window:
 *
 *   pnpm exec tsx research/system1/bridge/gpu-parity.ts \
 *     packages/web/src/scorer-model.json research/system1/checkpoints/aux2-parity.json
 *
 * Headed, because a headless browser has no GPU adapter. Exits non-zero
 * past the tolerance, or when no GPU is found.
 */
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [packPath, samplesPath] = process.argv.slice(2);
if (!packPath || !samplesPath)
  throw new Error("usage: gpu-parity.ts <pack.json> <parity.json>");
const bundle = await build({
  entryPoints: [join(import.meta.dirname, "gpu-parity-harness.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  write: false,
  define: {
    __PACK__: readFileSync(packPath, "utf8"),
    __SAMPLES__: readFileSync(samplesPath, "utf8"),
  },
});
const page = join(mkdtempSync(join(tmpdir(), "gpu-parity-")), "page.html");
writeFileSync(
  page,
  `<!doctype html><meta charset="utf-8"><script>${bundle.outputFiles[0]!.text.replace(/<\/script/g, "<\\/script")}</script>`,
);
const browser = await chromium.launch({
  headless: false,
  args: ["--enable-unsafe-webgpu"],
});
const tab = await browser.newPage();
await tab.goto(pathToFileURL(page).href);
const result = (await tab
  .waitForFunction(() => (window as { result?: unknown }).result, null, {
    timeout: 300_000,
  })
  .then((handle) => handle.jsonValue())) as {
  gpu?: boolean;
  error?: string;
  agree?: number;
  total?: number;
  worstProb?: number;
  worstValue?: number;
  cpuMs?: number;
  gpuMsPerDecision?: Record<string, number>;
};
await browser.close();
if (result.error) throw new Error(result.error);
if (!result.gpu) {
  console.log("no WebGPU adapter in this browser");
  process.exit(1);
}
console.log(
  `${result.agree}/${result.total} same top option; worst probability gap ${result.worstProb!.toFixed(6)}, worst value gap ${result.worstValue!.toFixed(6)}`,
);
console.log(
  `CPU ${result.cpuMs!.toFixed(1)} ms a decision; GPU by batch size: ${Object.entries(
    result.gpuMsPerDecision!,
  )
    .map(([size, ms]) => `${size}: ${ms.toFixed(1)} ms`)
    .join(", ")}`,
);
if (result.worstProb! > 0.001 || result.worstValue! > 0.001) process.exit(1);
