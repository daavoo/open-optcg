/**
 * `pnpm test:card ST35` -- run the tests that cover one deck, set or card
 * without waiting for the whole suite.
 *
 * Card tests are named after what they cover (`st35.test.ts`,
 * `op16-enel.test.ts`, `st21-003.test.ts`), so a prefix match on the file name
 * is enough. A card number falls back to its set: `OP17-042` runs `op17*.test.ts`
 * because a single card rarely has a file of its own.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const testDir = join(dirname(fileURLToPath(import.meta.url)), "..", "test");

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error(
    "usage: pnpm test:card <deck|set|card> ...  e.g. pnpm test:card ST35 OP17-042",
  );
  process.exit(2);
}

const files = readdirSync(testDir).filter((name) => name.endsWith(".test.ts"));

const matched = new Set<string>();
const unmatched: string[] = [];
for (const target of targets) {
  const token = target.toLowerCase();
  // "op17-042" also matches "op17.test.ts" and "op17-clauses.test.ts".
  const set = token.split("-")[0] ?? token;
  const hits = files.filter(
    (name) =>
      name.startsWith(token) ||
      name.startsWith(`${set}.`) ||
      name.startsWith(`${set}-`),
  );
  if (hits.length === 0) unmatched.push(target);
  for (const hit of hits) matched.add(join("test", hit));
}

if (unmatched.length > 0) {
  console.error(`no test file matches: ${unmatched.join(", ")}`);
  console.error(
    "Card tests are named after the deck or card they cover; add one as `test/<deck>.test.ts`.",
  );
  process.exit(1);
}

const args = ["run", ...[...matched].sort()];
console.log(`vitest ${args.join(" ")}`);
const result = spawnSync("vitest", args, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
