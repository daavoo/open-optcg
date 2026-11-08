/**
 * The version the publish workflow is about to ship, for both packages at once.
 *
 *   tsx tools/release-version.ts release v0.2.0   # a tag: check, print 0.2.0
 *   tsx tools/release-version.ts next 418         # main: stamp, print 0.2.1-next.418
 *
 * The two packages move in lockstep: `open-optcg-model` is a peer of
 * `open-optcg` at the same minor, so a release that bumped one and not the
 * other would install a model against an engine it was not built with.
 *
 * `release` changes nothing. It fails unless the tag names the version both
 * package.json files already carry, so a release is always a reviewed bump
 * merged first and tagged after.
 *
 * `next` rewrites both package.json files in the checkout (never committed) to
 * a prerelease of the version main is heading for: the committed version when
 * npm does not have it yet, else the patch after it. A prerelease never
 * satisfies `~0.2.0`, so the model's peer range is pinned to the exact engine
 * prerelease it was built and checked with.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Manifest {
  name: string;
  version: string;
  peerDependencies?: Record<string, string>;
}

const root = process.cwd();
const paths = {
  engine: join(root, "packages/open-optcg/package.json"),
  model: join(root, "packages/open-optcg-model/package.json"),
};
const read = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as Manifest;
const engine = read(paths.engine);
const model = read(paths.model);

if (engine.version !== model.version) {
  throw new Error(
    `open-optcg is ${engine.version} but open-optcg-model is ${model.version}; bump both together`,
  );
}

const [mode, argument] = process.argv.slice(2);
if (mode === "release") {
  if (argument !== `v${engine.version}`) {
    throw new Error(
      `tag ${argument} does not match the packages' version v${engine.version}`,
    );
  }
  const [major, minor] = engine.version.split(".");
  const peer = model.peerDependencies?.["open-optcg"];
  if (peer !== `~${major}.${minor}.0`) {
    throw new Error(
      `open-optcg-model's peer range is ${peer}; expected ~${major}.${minor}.0`,
    );
  }
  console.log(engine.version);
} else if (mode === "next" && argument && /^\d+$/.test(argument)) {
  const base = isPublished(engine.name, engine.version)
    ? bumpPatch(engine.version)
    : engine.version;
  const version = `${base}-next.${argument}`;
  engine.version = version;
  model.version = version;
  model.peerDependencies = { ...model.peerDependencies, "open-optcg": version };
  writeFileSync(paths.engine, `${JSON.stringify(engine, null, 2)}\n`);
  writeFileSync(paths.model, `${JSON.stringify(model, null, 2)}\n`);
  console.log(version);
} else {
  throw new Error(
    "usage: release-version.ts release <tag> | next <run number>",
  );
}

function isPublished(name: string, version: string): boolean {
  try {
    execFileSync("npm", ["view", `${name}@${version}`, "version"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function bumpPatch(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch! + 1}`;
}
