/**
 * Install the published packages the way a stranger would, and run their READMEs.
 *
 *   pnpm packages:check             # build, pack, install, typecheck, run
 *   pnpm packages:check --offline   # skip the model README, which downloads
 *                                   # the newest model-* release (~12 MB)
 *
 * Builds both packages and packs them with `pnpm pack`, which resolves the
 * `workspace:` ranges -- these are the tarballs the publish workflow uploads.
 * Installs them into an empty project outside the workspace, and takes the
 * first `ts` code block of each README as that project's source. A README example that does not typecheck against the
 * published declarations, or does not finish a game, fails the check -- the
 * same thing that would happen to someone copying it.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const offline = process.argv.includes("--offline");
const run = (command: string, args: string[], cwd: string) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });

run("pnpm", ["packages:build"], root);

const project = await mkdtemp(join(tmpdir(), "open-optcg-check-"));
for (const pkg of ["open-optcg", "open-optcg-model"]) {
  run(
    "pnpm",
    ["pack", "--pack-destination", project],
    join(root, "packages", pkg),
  );
}
const tarballs = (await readdir(project)).filter((name) =>
  name.endsWith(".tgz"),
);

await writeFile(
  join(project, "package.json"),
  JSON.stringify({ name: "check", private: true, type: "module" }),
);
await writeFile(
  join(project, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2023",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noUncheckedIndexedAccess: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      skipLibCheck: false,
      types: ["node"],
    },
    include: ["*.ts"],
  }),
);
run(
  "npm",
  [
    "install",
    "--silent",
    "--no-audit",
    "--no-fund",
    ...tarballs.map((name) => `./${name}`),
    "@types/node@22",
  ],
  project,
);

const examples: { file: string; runs: boolean }[] = [];
for (const [pkg, runs] of [
  ["open-optcg", true],
  ["open-optcg-model", !offline],
] as const) {
  const readme = await readFile(
    join(root, "packages", pkg, "README.md"),
    "utf8",
  );
  const code = /```ts\n([\s\S]*?)```/.exec(readme)?.[1];
  if (!code) throw new Error(`${pkg}/README.md has no ts code block`);
  const file = `${pkg}-readme.ts`;
  await writeFile(join(project, file), code);
  examples.push({ file, runs });
}

run(join(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], project);
for (const { file, runs } of examples) {
  if (runs) run(process.execPath, [file], project);
  else console.log(`skipped running ${file} (--offline)`);
}
console.log(`Packages check passed in ${project}`);
