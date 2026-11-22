/**
 * Building the launcher as one executable.
 *
 * Bundles `cli.ts` into one CommonJS file and embeds it in a copy of the
 * running Node binary with Node's single-executable-application support, so a
 * player runs one file with no Node, no pnpm and no checkout. The bundle is
 * CommonJS because SEA's runtime only evaluates a CommonJS main.
 *
 * The output is for the machine that builds it: a SEA binary carries the Node
 * runtime it was copied from, so a macOS build does not run on Windows.
 * `bridge-release.ts` therefore takes one binary per platform from whoever
 * built it, the same way it takes the plugin DLL.
 *
 * macOS refuses to run a modified binary, so its code signature is stripped
 * before the blob is injected and re-signed ad hoc afterwards.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

export interface SeaBinary {
  /** The executable, named for the host platform. */
  path: string;
  /** The CommonJS bundle that was embedded. */
  bundle: string;
}

/** Builds the SEA binary for the host platform into `outDir`. */
export async function buildSeaBinary(
  outDir: string,
  log: (line: string) => void = () => {},
): Promise<SeaBinary> {
  const directory = resolve(outDir);
  mkdirSync(directory, { recursive: true });

  const bundle = join(directory, "launcher.cjs");
  await build({
    entryPoints: ["tools/optcgsim/launcher/cli.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outfile: bundle,
    logLevel: "warning",
  });
  log(`bundle: ${bundle}`);

  const config = join(directory, "sea-config.json");
  const blob = join(directory, "sea-prep.blob");
  writeFileSync(
    config,
    `${JSON.stringify(
      { main: bundle, output: blob, disableExperimentalSEAWarning: true },
      null,
      2,
    )}\n`,
  );
  run("node", ["--experimental-sea-config", config]);
  log(`blob: ${blob}`);

  const path = join(
    directory,
    process.platform === "win32"
      ? "open-optcg-bridge.exe"
      : "open-optcg-bridge",
  );
  copyFileSync(process.execPath, path);

  const macos = process.platform === "darwin";
  if (macos) run("codesign", ["--remove-signature", path]);
  run("npx", [
    "--yes",
    "postject",
    path,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ...(macos ? ["--macho-segment-name", "NODE_SEA"] : []),
  ]);
  if (macos) run("codesign", ["--sign", "-", path]);

  log(`binary: ${path}`);
  return { path, bundle };

  function run(command: string, commandArgs: string[]): void {
    try {
      execFileSync(command, commandArgs, { stdio: "inherit" });
    } catch (error) {
      // A half-injected binary is worse than none: it exists and does not run.
      rmSync(path, { force: true });
      throw new Error(
        `${command} ${commandArgs[0]} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}
