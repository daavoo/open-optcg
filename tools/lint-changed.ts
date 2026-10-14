/**
 * `pnpm lint:changed` -- eslint over the TypeScript files this branch touches,
 * for the edit loop. `pnpm lint` over the whole tree is still the gate; this is
 * seconds instead of a minute because the typed-lint project service only has
 * to resolve what changed.
 */
import { spawnSync } from "node:child_process";

const git = (...args: string[]): string[] => {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").filter(Boolean);
};

const base =
  spawnSync("git", ["merge-base", "HEAD", "origin/main"], {
    encoding: "utf8",
  }).stdout.trim() || "HEAD";

const changed = new Set([
  ...git("diff", "--name-only", "--diff-filter=ACMR", base),
  ...git("diff", "--name-only", "--diff-filter=ACMR", "--cached"),
  ...git("diff", "--name-only", "--diff-filter=ACMR"),
  ...git("ls-files", "--others", "--exclude-standard"),
]);

const files = [...changed].filter((file) => file.endsWith(".ts")).sort();
if (files.length === 0) {
  console.log("no changed TypeScript files");
  process.exit(0);
}

console.log(`eslint ${files.length} changed file(s)`);
const result = spawnSync("eslint", files, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
