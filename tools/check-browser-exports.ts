import { build } from "esbuild";

const browserEntries = [
  "@one-piece-sim/protocol",
  "@one-piece-sim/cards",
  "@one-piece-sim/decks",
  "@one-piece-sim/engine-core",
  "@one-piece-sim/agents",
  "@one-piece-sim/agents/local",
  "@one-piece-sim/agents/llm-dossiers",
] as const;

const forbiddenInput =
  /(^|[/\\])(openai|crypto-browserify|stream-browserify|buffer|process)([/\\]|$)|(^|:)node:/i;

for (const entry of browserEntries) {
  const result = await build({
    stdin: {
      contents: `import * as exported from ${JSON.stringify(entry)}; globalThis.__openOptcgBrowserCheck = exported;`,
      resolveDir: process.cwd(),
      sourcefile: `${entry.replaceAll("/", "-")}.ts`,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    tsconfigRaw: { compilerOptions: {} },
    treeShaking: false,
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const forbidden = Object.keys(result.metafile.inputs).filter((input) =>
    forbiddenInput.test(input),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `${entry} includes forbidden browser dependencies: ${forbidden.join(", ")}`,
    );
  }
  if (
    result.outputFiles.length !== 1 ||
    result.outputFiles[0]!.contents.length === 0
  ) {
    throw new Error(`${entry} did not produce a browser bundle`);
  }
  console.log(`Browser export valid: ${entry}`);
}

/**
 * Entry points that must stay out of the browser bundle.
 *
 * Each one reaches a provider directly, so resolving any of them in the browser
 * would ship an API key holder to the client -- the web build talks to the
 * server's `/complete` proxy instead. `chat-client` is here because it imports
 * both transports to choose between them.
 */
const serverOnlyEntries = [
  "@one-piece-sim/agents/llm",
  "@one-piece-sim/agents/otari",
  "@one-piece-sim/agents/chat-client",
];

for (const entry of serverOnlyEntries) {
  let rejected = false;
  try {
    await build({
      stdin: {
        contents: `import "${entry}";`,
        resolveDir: process.cwd(),
        sourcefile: "forbidden-browser-entry.ts",
        loader: "ts",
      },
      bundle: true,
      platform: "browser",
      write: false,
      tsconfigRaw: { compilerOptions: {} },
      logLevel: "silent",
    });
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error(`Browser build unexpectedly resolved ${entry}`);
  }
  console.log(`Browser export correctly rejects: ${entry}`);
}
