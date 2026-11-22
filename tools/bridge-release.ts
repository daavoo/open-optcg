/**
 * Builds the bridge's release assets and puts them on the release page.
 *
 *   pnpm bridge:release --tag bridge-v1
 *                       [--plugin macos=tools/optcgsim/plugin/bin/Release/netstandard2.1/OpenOptcgBridge.dll]
 *                       [--model model-v12] [--out dist/bridge] [--no-publish]
 *
 * The launcher is bundled into one ESM file (`launcher.mjs`) so a player needs
 * no Node, no pnpm and no checkout: the page it serves and the bridge it starts
 * are both inside it, and the model is fetched from the newest `model-*`
 * release at run time rather than carried in the bundle.
 *
 * The plugin DLL cannot be built here. It is compiled against the player's own
 * OPTCGSim and BepInEx assemblies (`OpenOptcgBridge.csproj`), none of which are
 * in this repository or redistributable, so the release takes the DLL from a
 * build the maintainer made on a machine with the sim and names the platform
 * it is for. A tag whose assets are already on GitHub is topped up rather than
 * refused, so the DLLs can be added after CI has published the launcher.
 *
 * The manifest names the `model-*` release the build was checked against, so a
 * support thread can tell which weights a `bridge-*` tag shipped beside.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { build } from "esbuild";
import { Github } from "./optcgsim/github.js";
import {
  binaryAsset,
  pluginAsset,
  platformOf,
  type Platform,
} from "./optcgsim/launcher/platform.js";
import { MODEL_TAG_PREFIX } from "./optcgsim/model-source.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const all = (name: string): string[] =>
  args.flatMap((arg, index) =>
    arg === `--${name}` && args[index + 1] ? [args[index + 1]!] : [],
  );

const tag = flag("tag");
if (!tag || !tag.startsWith("bridge-")) {
  console.error(
    "usage: pnpm bridge:release --tag bridge-v1 [--plugin macos=<dll>] [--binary macos=<exe>] [--model model-vN] [--no-publish]",
  );
  process.exit(1);
}
const outDir = resolve(flag("out") ?? "dist/bridge");
const publish = !args.includes("--no-publish");

// The launcher, in one file. Node built-ins stay external; every workspace
// package is inlined.
mkdirSync(outDir, { recursive: true });
const launcherPath = join(outDir, "launcher.mjs");
await build({
  entryPoints: ["tools/optcgsim/launcher/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: launcherPath,
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
});
console.log(`launcher: ${launcherPath} (${sha256(launcherPath)})`);

// The plugin DLLs, by platform: `--plugin <platform>=<path>`, or the host's
// build output when nothing is named.
const plugins = new Map<Platform, string>();
for (const entry of all("plugin")) {
  const [platform, path] = entry.split("=");
  if (!platform || !path) {
    console.error(`--plugin wants <platform>=<path>, got ${entry}`);
    process.exit(1);
  }
  plugins.set(platform as Platform, resolve(path));
}
if (plugins.size === 0) {
  const built = resolve(
    "tools/optcgsim/plugin/bin/Release/netstandard2.1/OpenOptcgBridge.dll",
  );
  if (existsSync(built)) plugins.set(platformOf(), built);
}
if (plugins.size === 0) {
  console.warn(
    "no plugin DLL: pass --plugin <platform>=<path>, or build it first " +
      "(tools/optcgsim/README.md, step 3)",
  );
}

// The single-file launchers, by platform: `--binary <platform>=<path>`, or the
// host's own build output when nothing is named.
const binaries = new Map<Platform, string>();
for (const entry of all("binary")) {
  const [platform, path] = entry.split("=");
  if (!platform || !path) {
    console.error(`--binary wants <platform>=<path>, got ${entry}`);
    process.exit(1);
  }
  binaries.set(platform as Platform, resolve(path));
}
if (binaries.size === 0) {
  const built = resolve(
    "dist/bridge",
    process.platform === "win32"
      ? "open-optcg-bridge.exe"
      : "open-optcg-bridge",
  );
  if (existsSync(built)) binaries.set(platformOf(), built);
}

const model = flag("model") ?? (await newestModelTag());
const manifest = {
  tag,
  builtAt: new Date().toISOString(),
  /** The model the build was checked with; null when nothing was published. */
  model,
  launcher: { asset: basename(launcherPath), sha256: sha256(launcherPath) },
  plugin: Object.fromEntries(
    [...plugins].map(([platform, path]) => [
      platform,
      { asset: pluginAsset(platform), sha256: sha256(path) },
    ]),
  ),
  binary: Object.fromEntries(
    [...binaries].map(([platform, path]) => [
      platform,
      { asset: binaryAsset(platform), sha256: sha256(path) },
    ]),
  ),
};
const manifestPath = join(outDir, "bridge-manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest: ${manifestPath} (model ${model ?? "none"})`);

if (!publish) {
  console.log("--no-publish: assets are in", outDir);
  process.exit(0);
}

// Copy the DLLs under the name the installer looks for, so the release's asset
// names are the contract and the build path never leaks into it.
const assets = [launcherPath, manifestPath];
for (const [platform, path] of plugins) {
  const target = join(outDir, pluginAsset(platform));
  writeFileSync(target, readFileSync(path));
  assets.push(target);
}
for (const [platform, path] of binaries) {
  const target = join(outDir, binaryAsset(platform));
  writeFileSync(target, readFileSync(path));
  assets.push(target);
}
publishRelease(tag, assets, manifest);

/** Creates the release, or tops up one that already exists. */
function publishRelease(
  releaseTag: string,
  files: string[],
  published: typeof manifest,
): void {
  const notes = [
    "The open-optcg bridge for OPTCGSim: a launcher, the BepInEx plugin, and the learned model.",
    "",
    published.model
      ? `Weights: \`${published.model}\` (fetched at run time).`
      : "Weights: none published yet.",
    "",
    "Install with the launcher (`bridge:launch`), or follow `tools/optcgsim/README.md`.",
  ].join("\n");
  const exists = releaseExists(releaseTag);
  if (exists) {
    console.log(`release ${releaseTag} exists; uploading assets`);
    run("gh", ["release", "upload", releaseTag, ...files, "--clobber"]);
  } else {
    console.log(`creating release ${releaseTag}`);
    run("gh", [
      "release",
      "create",
      releaseTag,
      ...files,
      "--title",
      `Bridge ${releaseTag.replace(/^bridge-/, "")}`,
      "--notes",
      notes,
    ]);
  }
}

function releaseExists(releaseTag: string): boolean {
  try {
    execFileSync("gh", ["release", "view", releaseTag], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function run(command: string, commandArgs: string[]): void {
  execFileSync(command, commandArgs, { stdio: "inherit" });
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function newestModelTag(): Promise<string | null> {
  try {
    return (
      (await new Github("daavoo/open-optcg").newest(MODEL_TAG_PREFIX))?.tag ??
      null
    );
  } catch (error) {
    console.warn(
      `could not read the newest model release: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}
