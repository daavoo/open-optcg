/**
 * The command line for `launcher/verify.ts`.
 *
 *   pnpm bridge:verify [--tag bridge-v1]
 *
 * Exits non-zero with the list of what is missing, so it can gate a release
 * and be run by hand before announcing one.
 */
import { Github } from "./optcgsim/github.js";
import { BRIDGE_TAG_PREFIX } from "./optcgsim/launcher/install.js";
import { verifyRelease } from "./optcgsim/launcher/verify.js";

const args = process.argv.slice(2);
const at = args.indexOf("--tag");
const wanted = at >= 0 ? args[at + 1] : undefined;

const github = new Github("daavoo/open-optcg");
const release = wanted
  ? await github.release(wanted)
  : await github.newest(BRIDGE_TAG_PREFIX);
if (!release) {
  console.error(
    wanted
      ? `no release ${wanted}`
      : `no ${BRIDGE_TAG_PREFIX}* release on GitHub`,
  );
  process.exit(1);
}

const result = await verifyRelease(github, release);
if (result.ok) {
  const platforms = Object.keys(result.manifest?.plugin ?? {}).join(", ");
  console.log(
    `${release.tag} is complete: launcher, manifest and plugin for ${platforms}` +
      (result.manifest?.model ? `, checked with ${result.manifest.model}` : ""),
  );
} else {
  console.error(`${release.tag} is not installable:`);
  for (const problem of result.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
