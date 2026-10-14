/**
 * Wraps `tools/download-assets.ts` as a standalone executable with Node's
 * single-executable-application support, the same way `tools/package-app.ts`
 * wraps the game. Output: `dist/app/open-optcg-assets-<platform>-<arch>`.
 *
 * sharp stays out of the bundle -- it is a native module that
 * `download-deck-art.ts` loads only to convert art, which the downloader never
 * does: it stores each image as Bandai serves it.
 */
import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const workDir = join(root, "dist", "assets-downloader");
const outDir = join(root, "dist", "app");
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const platform =
  process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
      : "linux";
const BINARY_NAME = `open-optcg-assets-${platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`;

function run(command: string, args: string[], quiet = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: quiet ? "ignore" : "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function codesign(target: string, remove: boolean): Promise<void> {
  if (process.platform !== "darwin") return;
  try {
    await run(
      "codesign",
      remove
        ? ["--remove-signature", target]
        : ["--sign", "-", "--force", "--timestamp=none", target],
      true,
    );
  } catch {
    // An unsigned binary still runs locally.
  }
}

await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const bundle = join(workDir, "download-assets.cjs");
await build({
  entryPoints: [join(root, "tools/assets-entry.ts")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["sharp"],
  minify: false,
  logLevel: "info",
});

const configFile = join(workDir, "sea-config.json");
const blob = join(workDir, "sea-prep.blob");
await writeFile(
  configFile,
  `${JSON.stringify(
    {
      main: bundle,
      output: blob,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    },
    null,
    2,
  )}\n`,
);
await run(process.execPath, ["--experimental-sea-config", configFile]);

const executable = join(outDir, BINARY_NAME);
await copyFile(process.execPath, executable);
await chmod(executable, 0o755);
await codesign(executable, true);
const postject = createRequire(import.meta.url).resolve("postject/dist/cli.js");
await run(process.execPath, [
  postject,
  executable,
  "NODE_SEA_BLOB",
  blob,
  "--sentinel-fuse",
  SEA_FUSE,
  ...(process.platform === "darwin"
    ? ["--macho-segment-name", "NODE_SEA"]
    : []),
]);
await chmod(executable, 0o755);
await codesign(executable, false);
console.log(`Packaged ${executable}`);

// A browser download drops the executable bit, and macOS then has nothing to
// double-click. `ditto` zips the binary with the bit kept, Finder unzips it on
// a double-click, and the binary opens in Terminal, where its progress shows.
if (process.platform === "darwin") {
  const zip = `${executable}.zip`;
  await rm(zip, { force: true });
  await run("ditto", ["-c", "-k", "--keepParent", executable, zip]);
  console.log(`Release asset ${zip}`);
}
