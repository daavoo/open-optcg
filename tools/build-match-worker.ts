/**
 * Bundle the match Worker.
 *
 * Used by the Miniflare smoke test, which needs one ES module file to hand to
 * the real runtime, and available on its own (`pnpm referee:build`) to see what
 * the deploy actually weighs -- the design's claim that the kernel fits
 * comfortably inside a Worker is worth being able to check rather than assert.
 */
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildMatchWorker(): Promise<string> {
  const result = await build({
    entryPoints: [join(repoRoot, "packages/referee/src/worker.ts")],
    bundle: true,
    format: "esm",
    // `neutral` rather than `browser` or `node`: workerd is neither, and this is
    // also what fails the build if anything drags a `node:` import in behind
    // the engine -- which is the property the design depends on.
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["import", "default"],
    target: "es2022",
    write: false,
    // Minified, because that is what `wrangler deploy` uploads and the size
    // this reports is only interesting if it is the size that ships.
    minify: true,
    logLevel: "silent",
  });
  const source = result.outputFiles[0]?.text;
  if (!source) throw new Error("EMPTY_MATCH_WORKER_BUNDLE");
  return source;
}

/** Writes the bundle and returns its path. */
export async function writeMatchWorker(directory: string): Promise<string> {
  const source = await buildMatchWorker();
  await mkdir(directory, { recursive: true });
  const path = join(directory, "match-worker.mjs");
  await writeFile(path, source, "utf8");
  return path;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { gzipSync } = await import("node:zlib");
  const { readFile, stat } = await import("node:fs/promises");
  const path = await writeMatchWorker(join(repoRoot, "dist/referee"));
  const { size } = await stat(path);
  // Workers meters the compressed bundle -- 3 MiB on the free plan -- so the
  // gzipped number is the one that decides whether this deploys.
  const compressed = gzipSync(await readFile(path), { level: 9 }).byteLength;
  process.stdout.write(
    `${path}\n${(size / 1024).toFixed(0)} KiB minified, ${(compressed / 1024).toFixed(0)} KiB gzipped\n`,
  );
}
