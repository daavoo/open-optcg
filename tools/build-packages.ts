/**
 * Build the two published npm packages from the workspace sources.
 *
 *   pnpm packages:build
 *
 * `open-optcg` bundles the engine, protocol, cards and decks behind the entry
 * points in `packages/open-optcg/src`. `open-optcg-model` bundles the learned
 * scorer and imports the engine from `open-optcg` instead of carrying its own
 * copy, so a project that installs both runs one engine and one card table.
 *
 * The workspace packages stay private: their `@one-piece-sim/*` names never
 * reach a published file. In `open-optcg` they are bundled, and its type
 * declarations point at a copy of their declarations under `dist/types/internal`;
 * in `open-optcg-model` they become `open-optcg/*` imports, and the build fails
 * if one names something `open-optcg` does not export.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { build, type Plugin } from "esbuild";

const root = process.cwd();
const ENGINE = join(root, "packages/open-optcg");
const MODEL = join(root, "packages/open-optcg-model");
const ENGINE_ENTRIES = ["engine", "protocol", "cards", "decks"] as const;

/** The workspace package each public `open-optcg` entry point re-exports. */
const PUBLIC_ENTRY: Record<string, string> = {
  "@one-piece-sim/engine-core": "open-optcg/engine",
  "@one-piece-sim/protocol": "open-optcg/protocol",
  "@one-piece-sim/cards": "open-optcg/cards",
  "@one-piece-sim/decks": "open-optcg/decks",
};

/** Where each bundled workspace package's declarations land in `open-optcg`. */
const INTERNAL_TYPES: Record<string, string> = {
  "@one-piece-sim/engine-core": "internal/engine-core/src/index.js",
  "@one-piece-sim/protocol": "internal/protocol/src/index.js",
  "@one-piece-sim/cards": "internal/cards/src/index.js",
  "@one-piece-sim/decks": "internal/decks/src/index.js",
  "@one-piece-sim/agents/scorer": "internal/agents/src/scorer/index.js",
};

const shared = {
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  logLevel: "warning",
  // Mechanics comments quote the clause they implement, and esbuild keeps
  // comments in unminified output. Names and syntax stay readable for stack
  // traces; only whitespace and comments go.
  minifyWhitespace: true,
  legalComments: "none",
  // Raw UTF-8 rather than `\u2019` escapes, so the printed-text check below
  // compares the same characters the text pack holds.
  charset: "utf8",
} as const;

await rm(join(ENGINE, "dist"), { recursive: true, force: true });
await rm(join(MODEL, "dist"), { recursive: true, force: true });

// -- JavaScript ---------------------------------------------------------------

const enginePackage = JSON.parse(
  await readFile(join(ENGINE, "package.json"), "utf8"),
) as { dependencies?: Record<string, string> };
const engineDeps = Object.keys(enginePackage.dependencies ?? {});
await build({
  ...shared,
  entryPoints: ENGINE_ENTRIES.map((name) => join(ENGINE, `src/${name}.ts`)),
  outdir: join(ENGINE, "dist"),
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  external: engineDeps,
});

const imported = new Map<string, Set<string>>();
const toPublicEntry: Plugin = {
  name: "workspace-to-open-optcg",
  setup(plugin) {
    plugin.onResolve({ filter: /^@one-piece-sim\// }, (args) => {
      const target = PUBLIC_ENTRY[args.path];
      // The scorer itself is bundled; any other workspace package is not
      // published, so the model must not reach for it.
      if (args.path === "@one-piece-sim/agents/scorer") return undefined;
      if (!target) {
        throw new Error(
          `${relative(root, args.importer)} imports ${args.path}, which open-optcg does not publish`,
        );
      }
      return { path: target, external: true };
    });
  },
};
const model = await build({
  ...shared,
  entryPoints: [join(MODEL, "src/index.ts")],
  outdir: join(MODEL, "dist"),
  plugins: [toPublicEntry],
  metafile: true,
});
for (const output of Object.values(model.metafile.outputs)) {
  for (const entry of output.imports) {
    if (entry.external) imported.set(entry.path, new Set());
  }
}

// Every name the model imports from `open-optcg` must be one its entry point
// exports; esbuild cannot see across an external import.
const modelJs = await readFile(join(MODEL, "dist/index.js"), "utf8");
for (const match of modelJs.matchAll(
  /import\s*\{([^}]*)\}\s*from\s*"(open-optcg\/[a-z]+)"/g,
)) {
  for (const name of match[1]!.split(",")) {
    const exported = name.trim().split(/\s+as\s+/)[0];
    if (exported) imported.get(match[2]!)?.add(exported);
  }
}
for (const [specifier, names] of imported) {
  const entry = specifier.replace("open-optcg/", "");
  const surface = (await import(join(ENGINE, "dist", `${entry}.js`))) as Record<
    string,
    unknown
  >;
  const missing = [...names].filter((name) => !(name in surface));
  if (missing.length > 0) {
    throw new Error(
      `open-optcg-model imports ${missing.join(", ")} from ${specifier}, which does not export them`,
    );
  }
}

// -- Declarations -------------------------------------------------------------

const scratch = join(root, "dist-tsc/packages-build");
await rm(scratch, { recursive: true, force: true });
const tsconfig = join(scratch, "tsconfig.json");
await mkdir(scratch, { recursive: true });
await writeFile(
  tsconfig,
  JSON.stringify({
    extends: relative(scratch, join(root, "tsconfig.json")),
    compilerOptions: {
      emitDeclarationOnly: true,
      rootDir: relative(scratch, join(root, "packages")),
      outDir: "out",
      types: ["node"],
      // The same reason as `minifyWhitespace` above: a JSDoc block in a
      // mechanics or card file can quote printed text.
      removeComments: true,
    },
    include: [],
    files: [
      ...ENGINE_ENTRIES.map((name) =>
        relative(scratch, join(ENGINE, `src/${name}.ts`)),
      ),
      relative(scratch, join(MODEL, "src/index.ts")),
    ],
  }),
);
execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", tsconfig], {
  stdio: "inherit",
});
const declared = join(scratch, "out");

async function declarations(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".d.ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Rewrite `@one-piece-sim/*` specifiers in every `.d.ts` under `dir`. */
async function rewrite(
  dir: string,
  target: (specifier: string, file: string) => string,
): Promise<void> {
  for (const file of await declarations(dir)) {
    const text = await readFile(file, "utf8");
    const next = text.replace(
      /(from\s+|import\()"(@one-piece-sim\/[a-z/-]+)"/g,
      (_, lead: string, specifier: string) =>
        `${lead}"${target(specifier, file)}"`,
    );
    if (next !== text) await writeFile(file, next);
  }
}

function relativeTo(file: string, path: string): string {
  const rel = relative(dirname(file), path);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

// open-optcg: its entry points, and every workspace package they reach.
const engineTypes = join(ENGINE, "dist/types");
await cp(join(declared, "open-optcg/src"), engineTypes, { recursive: true });
for (const pkg of ["engine-core", "protocol", "cards", "decks"]) {
  await cp(join(declared, pkg), join(engineTypes, "internal", pkg), {
    recursive: true,
  });
}
await rewrite(engineTypes, (specifier, file) => {
  const internal = INTERNAL_TYPES[specifier];
  if (!internal || specifier === "@one-piece-sim/agents/scorer") {
    throw new Error(`${relative(root, file)} declares ${specifier}`);
  }
  return relativeTo(file, join(engineTypes, internal));
});

// open-optcg-model: its entry point and the scorer it bundles. Engine types
// come from `open-optcg`, so a model agent and the game it plays agree on them.
const modelTypes = join(MODEL, "dist/types");
await cp(join(declared, "open-optcg-model/src"), modelTypes, {
  recursive: true,
});
await cp(join(declared, "agents/src/scorer"), join(modelTypes, "scorer"), {
  recursive: true,
});
await rewrite(modelTypes, (specifier, file) => {
  if (specifier === "@one-piece-sim/agents/scorer") {
    return relativeTo(file, join(modelTypes, "scorer/index.js"));
  }
  const target = PUBLIC_ENTRY[specifier];
  if (!target) throw new Error(`${relative(root, file)} declares ${specifier}`);
  return target;
});

// -- Printed text -------------------------------------------------------------

// Printed card text never ships (docs/asset-packs.md). Where this machine has a
// text pack, every printed line long enough to be unambiguous is looked for in
// the output; CI has no pack, so there the check is skipped, not passed.
const textPack = [
  join(root, "packages/cards/printed-text.json"),
  join(root, "open-optcg-assets/printed-text.json"),
].find((path) => existsSync(path));
if (textPack) {
  const pack = JSON.parse(await readFile(textPack, "utf8")) as {
    cards: Record<string, { effect?: string; trigger?: string }>;
  };
  const lines = new Set<string>();
  for (const card of Object.values(pack.cards)) {
    for (const field of [card.effect, card.trigger]) {
      for (const line of field?.split(/\n|\[[^\]]+\]/) ?? []) {
        if (line.trim().length >= 40) lines.add(line.trim().slice(0, 40));
      }
    }
  }
  for (const dir of [join(ENGINE, "dist"), join(MODEL, "dist")]) {
    const entries = await readdir(dir, {
      withFileTypes: true,
      recursive: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = join(entry.parentPath, entry.name);
      const body = await readFile(file, "utf8");
      const found = [...lines].filter((line) => body.includes(line)).length;
      if (found > 0) {
        throw new Error(
          `${relative(root, file)} contains ${found} printed-text line(s)`,
        );
      }
    }
  }
}

console.log(
  `Built open-optcg (${ENGINE_ENTRIES.join(", ")}) and open-optcg-model` +
    (textPack ? "; no printed text in either" : ""),
);
