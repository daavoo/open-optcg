import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { build, transform } from "esbuild";

/**
 * `--with-art` inlines whatever card art is already on this machine. Nothing is
 * fetched: the build never talks to the network, so that the artifact the
 * project publishes is provably free of Bandai's images and the only way art
 * reaches a machine is a person running `pnpm art:download` or
 * `pnpm assets:download` on their own copy.
 * The default build draws the card faces in CSS and expects the player to load
 * an asset pack into the app.
 *
 * Bare, it reads both folders those two commands write, in the order
 * `CARD_ART_ROOTS` names -- the same "look where a pack is already likely to
 * be" search `--with-text` does. They hold overlapping and separately-aged
 * copies of the same images, and a card missing from one is usually only
 * missing because that folder predates the card; taking the union means a deck
 * imported since the last `art:download --all` still gets its faces.
 * `--with-art=<dir>` reads one folder (its images and per-set subfolders) and nothing else.
 */
const artFlag = process.argv.find(
  (argument) => argument === "--with-art" || argument.startsWith("--with-art="),
);
const withArt = Boolean(artFlag);
const artPackPath = artFlag?.includes("=")
  ? artFlag.slice(artFlag.indexOf("=") + 1)
  : undefined;
if (process.argv.includes("--no-art")) {
  console.warn(
    "--no-art is now the default; pass --with-art to inline local art.",
  );
}

/**
 * `--with-text` inlines a printed-text pack, the same way `--with-art` inlines
 * images: a personal build only, and nothing is fetched. Bare, it reads the
 * repository's own gitignored cache (`packages/cards/printed-text.json`, what
 * `pnpm reference:fetch` + `pnpm reference:audit` write);
 * `--with-text=<file-or-folder>` reads a pack from anywhere -- an
 * `open-optcg-assets` folder from `pnpm assets:download`, or another
 * checkout's cache.
 *
 * A missing file is an error rather than a quiet omission. The flag says the
 * text is wanted, and a build that shipped without it would only be found out
 * by opening a card popup on whatever machine the file had been carried to.
 */
const textFlag = process.argv.find(
  (argument) =>
    argument === "--with-text" || argument.startsWith("--with-text="),
);
const textPackPath = textFlag?.includes("=")
  ? textFlag.slice(textFlag.indexOf("=") + 1)
  : undefined;
/**
 * Where this build's match server is, and whether it has one at all.
 *
 * Online play needs a server, and the standalone file has none. A page cannot
 * tell at runtime whether the origin serving it has a Worker behind it -- both
 * are its own origin over https -- so the build says which it is.
 *
 * `--match-server` alone means "the origin serving this page", which is the
 * deploy `wrangler.toml` describes. `--match-server=https://…` names another,
 * for an app hosted apart from its server. Absent, the build has no server and
 * a seat link is left in the address bar rather than opened against nothing.
 *
 * A build with a server is written as `dist/pages/index.html`, the directory
 * `wrangler.toml` serves in front of the Worker. It is the same art-free
 * bundle as the standalone file: the deploy publishes nothing of Bandai's, and
 * a player loads an asset pack into the app exactly as they do offline.
 */
const matchServer =
  process.argv
    .find((argument) => argument.startsWith("--match-server="))
    ?.slice("--match-server=".length) ??
  (process.argv.includes("--match-server") ? "self" : "");

const root = process.cwd();
const outputDir = join(root, matchServer ? "dist/pages" : "dist");
const webRoot = join(root, "packages/web/src");
const assetRoot = join(webRoot, "assets");
/**
 * Where a `--with-art` build looks for card art, most-specific first: the
 * repository's own gitignored cache that `pnpm art:download` fills, then the
 * player-facing pack `pnpm assets:download` builds. Each is a folder of
 * per-set subfolders, of images, or both. The first root holding a card number wins, so a file
 * deliberately dropped into `local-art/` still overrides the pack.
 */
const cardArtRoots = artPackPath
  ? [resolve(root, artPackPath)]
  : [join(root, "local-art"), join(root, "open-optcg-assets/art")];

/**
 * Build-time image asset anchors. Drop a file named after an anchor into
 * packages/web/src/assets/ and it is inlined as that surface; otherwise the
 * surface keeps its drawn CSS placeholder. Mirrors SURFACE_ANCHORS in
 * packages/web/src/assets.ts, which does the same thing at runtime.
 */
const ART_ANCHORS: Readonly<Record<string, string>> = {
  "mat-self": "--art-mat-self",
  "mat-opponent": "--art-mat-opponent",
  /* Per-deck mats, keyed by the set the Leader comes from: mat-st31.jpg
     paints either half of the table whose Leader is an ST31 card. */
  "mat-st31": "--art-mat-st31",
  /* Mat sprites: art a deck lays over its colour mat, placed by
     mat-skins.css rather than painted into the mat itself. */
  "sprite-st31": "--art-sprite-st31",
  "sprite-xebec": "--art-sprite-xebec",
  "sprite-mihawk": "--art-sprite-mihawk",
  table: "--art-table",
  chart: "--art-chart",
  "card-back": "--art-card-back",
  "don-back": "--art-don-back",
  "card-frame": "--art-card-frame",
  "card-slot": "--art-card-slot",
  "character-area": "--art-character-area",
  "hand-tray": "--art-hand-tray",
  don: "--art-don",
  life: "--art-life",
  brand: "--art-brand",
  lobby: "--art-lobby",
  home: "--art-home",
  "menu-card": "--art-menu-card",
  "mode-1v1": "--art-mode-1v1",
  "mode-sealed": "--art-mode-sealed",
  "end-turn": "--art-end-turn",
  vs: "--art-vs",
};
const IMAGE_MEDIA_TYPES: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/**
 * The stylesheet, as one minified string.
 *
 * `styles/index.css` is the running order: esbuild resolves its `@import`s and
 * concatenates them in the order written, so the cascade is exactly what the
 * file lists. A stylesheet nothing imports is the one failure this split makes
 * possible -- the file is there, the rules are not -- so it is checked for
 * rather than left to be noticed on screen.
 */
async function buildStylesheet(): Promise<string> {
  const stylesRoot = join(webRoot, "styles");
  const entry = join(stylesRoot, "index.css");
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    write: false,
  });
  const index = await readFile(entry, "utf8");
  const orphans = (await readdir(stylesRoot))
    .filter((name) => name.endsWith(".css") && name !== "index.css")
    .filter((name) => !index.includes(`@import "./${name}"`));
  if (orphans.length) {
    throw new Error(`WEB_STYLESHEET_NOT_IMPORTED: ${orphans.join(", ")}`);
  }
  return result.outputFiles[0]!.text;
}

async function buildArtAnchorCss(): Promise<string> {
  let entries: string[];
  try {
    entries = await readdir(assetRoot);
  } catch {
    return "";
  }
  const declarations: string[] = [];
  for (const entry of entries.sort()) {
    const extension = extname(entry).toLowerCase();
    const mediaType = IMAGE_MEDIA_TYPES[extension];
    const anchor = ART_ANCHORS[entry.slice(0, -extension.length)];
    if (!mediaType || !anchor) continue;
    const data = await readFile(join(assetRoot, entry));
    declarations.push(
      `${anchor}:url("data:${mediaType};base64,${data.toString("base64")}")`,
    );
    console.log(`Inlined ${entry} as ${anchor}`);
  }
  return declarations.length ? `:root{${declarations.join(";")}}\n` : "";
}

/** Collects card number -> the file on disk holding that card's art. */
async function readCardArtDir(
  directoryPath: string,
  files: Record<string, string>,
): Promise<void> {
  for (const entry of await readdir(directoryPath)) {
    const extension = extname(entry).toLowerCase();
    if (!IMAGE_MEDIA_TYPES[extension]) continue;
    const cardNumber = entry.slice(0, -extension.length).toUpperCase();
    /* First root wins: `cardArtRoots` is ordered by precedence. */
    files[cardNumber] ??= join(directoryPath, entry);
  }
}

/** Every card one art root holds, added to `files` if not already claimed. */
async function readCardArtRoot(
  artRoot: string,
  files: Record<string, string>,
): Promise<number> {
  const before = Object.keys(files).length;
  let directories;
  try {
    directories = await readdir(artRoot, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    await readCardArtDir(join(artRoot, directory.name), files);
  }
  /* And the images directly in it: `pnpm assets:download` writes its art
     flat, one file per card, where `pnpm art:download` writes per-set
     subfolders. */
  await readCardArtDir(artRoot, files);
  return Object.keys(files).length - before;
}

/** Every card `cardArtRoots` holds, as card number -> file on disk. */
async function collectCardArtFiles(): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const artRoot of cardArtRoots) {
    const added = await readCardArtRoot(artRoot, files);
    if (added) console.log(`Found art for ${added} cards in ${artRoot}`);
  }
  return files;
}

/**
 * Card number -> the `data:` URI the app loads that card's art from, for a
 * `--with-art` personal build. Empty by default: the published artifact holds
 * no card art, and the app reads whatever the player imports at runtime
 * (`packages/web/src/assets.ts`) through the same `assetUrl` lookup.
 */
async function buildLocalCardArt(): Promise<Record<string, string>> {
  const art: Record<string, string> = {};
  if (!withArt) return art;
  const files = await collectCardArtFiles();
  /* Same reasoning as the text pack below: the flag says the art is wanted, so
     an empty search is an error rather than a quiet art-free build that is
     only found out by opening the page. */
  if (!Object.keys(files).length) {
    throw new Error(
      `WEB_ART_NOT_FOUND: looked in ${cardArtRoots.join(", ")}\n` +
        "  pnpm art:download --all   writes local-art/all/\n" +
        "  pnpm assets:download      writes open-optcg-assets/art/\n" +
        "  --with-art=<dir>          reads a folder you already have",
    );
  }
  for (const [cardNumber, file] of Object.entries(files)) {
    const mediaType = IMAGE_MEDIA_TYPES[extname(file).toLowerCase()]!;
    const data = await readFile(file);
    art[cardNumber] = `data:${mediaType};base64,${data.toString("base64")}`;
  }
  return art;
}

/**
 * The printed text to inline, as card number -> the two printed fields, or
 * null for the default build. Only `effect` and `trigger`: `loadPrintedText`
 * keeps nothing else, and a pack's `name` is informational.
 */
async function buildBuiltInPrintedText(): Promise<Record<
  string,
  { effect: string; trigger: string }
> | null> {
  if (!textFlag) return null;
  /* Bare, both places a pack is already likely to be: the repository's own
     cache, and the folder `pnpm assets:download` writes by default. Naming a
     path skips the search. */
  const candidates = textPackPath
    ? [textPackPath, join(textPackPath, "printed-text.json")]
    : [
        join(root, "packages/cards/printed-text.json"),
        join(root, "open-optcg-assets/printed-text.json"),
      ];
  for (const candidate of candidates) {
    let source;
    try {
      source = await readFile(candidate, "utf8");
    } catch {
      continue;
    }
    const parsed: unknown = JSON.parse(source);
    const cards =
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { version?: unknown }).version === 1
        ? (parsed as { cards?: unknown }).cards
        : null;
    if (typeof cards !== "object" || cards === null) {
      throw new Error(`WEB_TEXT_PACK_INVALID: ${candidate}`);
    }
    const text: Record<string, { effect: string; trigger: string }> = {};
    for (const [cardNumber, entry] of Object.entries(
      cards as Record<string, { effect?: string; trigger?: string }>,
    )) {
      text[cardNumber] = {
        effect: entry.effect ?? "",
        trigger: entry.trigger ?? "",
      };
    }
    console.log(
      `Inlined printed text for ${Object.keys(text).length} cards from ${candidate}`,
    );
    return text;
  }
  /* Says what to do rather than only what is missing: this is the one error a
     person meets while trying to make a copy of the app for themselves, and
     the pack it wants is a command away in either direction. */
  throw new Error(
    `WEB_TEXT_PACK_NOT_FOUND: looked in ${candidates.join(", ")}\n` +
      "  pnpm assets:download   writes open-optcg-assets/printed-text.json\n" +
      "  pnpm reference:fetch && pnpm reference:audit   writes the repository's own cache\n" +
      "  --with-text=<file-or-folder>   reads a pack you already have",
  );
}

async function buildWorker(
  entry: string,
  emptyError: string,
  define?: Record<string, string>,
): Promise<string> {
  const result = await build({
    entryPoints: [join(webRoot, entry)],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    minify: true,
    logLevel: "silent",
    ...(define ? { define } : {}),
  });
  const source = result.outputFiles[0]?.text;
  if (!source) throw new Error(emptyError);
  return source;
}

/**
 * The trained OP17 sealed policy (`ml/python/export_web_policy.py`), inlined
 * into `worker.ts` -- where `LearnedSealedAgent` actually runs -- rather than
 * the main bundle, so a build without it still produces a working artifact:
 * the "Learned model" opponent option just isn't offered (`main.ts` never
 * reads the weights directly).
 */
const learnedSealedPolicy = await readFile(
  join(webRoot, "learned-sealed-policy.json"),
  "utf8",
).catch(() => null);
console.log(
  learnedSealedPolicy
    ? `Inlined the learned OP17 sealed policy (${Math.round(Buffer.byteLength(learnedSealedPolicy) / 1024)} KB)`
    : "No learned-sealed-policy.json found; run ml/python/export_web_policy.py " +
        '(the "Learned model" sealed opponent will be unavailable)',
);

/**
 * The System-1 scorer's model pack (`research/system1/sys1/export_web.py`).
 * Gitignored, since at ~12 MB it would weigh down every clone: `pnpm
 * model:fetch` downloads the published one from the newest `model-*` release,
 * which is what the hosted page's build does.
 *
 * Inlined into the workers by default, so the one file plays the learned
 * model with no network at all -- a page saved to disk included. With
 * `--external-model` (the hosted page) it is written beside the page as
 * `learned-model.json` instead, and the page fetches it after it has drawn,
 * keeping it in the browser's Cache Storage (`packages/web/src/learned-model.ts`):
 * inlined, it was most of the page's weight, and twice over, once per worker.
 */
const externalModel = process.argv.includes("--external-model");
const scorerPack = await readFile(
  join(webRoot, "scorer-model.json"),
  "utf8",
).catch(() => null);
if (scorerPack) {
  const header = JSON.parse(scorerPack) as { source?: string };
  console.log(
    `${externalModel ? "Linked" : "Inlined"} the System-1 scorer from ${header.source ?? "?"} (${Math.round(Buffer.byteLength(scorerPack) / 1024)} KB)`,
  );
}

/**
 * Deck adapters over that pack (`research/system1/sys1/export_adapter.py`),
 * from `packages/web/src/scorer-adapters/`: gitignored and published like the
 * pack. One trained over a different pack would play nonsense, so it is left
 * out and named.
 */
const adaptersRoot = join(webRoot, "scorer-adapters");
const scorerSource = scorerPack
  ? (JSON.parse(scorerPack) as { source?: string }).source
  : undefined;
const scorerAdapters: string[] = [];
for (const file of (await readdir(adaptersRoot).catch(() => [])).sort()) {
  if (!file.endsWith(".json")) continue;
  const text = await readFile(join(adaptersRoot, file), "utf8");
  const adapter = JSON.parse(text) as {
    base?: string;
    deck?: { id?: string };
  };
  if (!scorerSource || adapter.base !== scorerSource) {
    console.log(
      `Left out the ${adapter.deck?.id ?? file} adapter: trained over ${adapter.base ?? "?"}, the pack is ${scorerSource ?? "absent"}`,
    );
    continue;
  }
  scorerAdapters.push(text);
  console.log(
    `${externalModel ? "Linked" : "Inlined"} the ${adapter.deck?.id ?? file} deck adapter (${Math.round(Buffer.byteLength(text) / 1024)} KB)`,
  );
}

/** The pack and adapters as one file, and its content hash as the version. */
const learnedModelFile =
  scorerPack && externalModel
    ? `{"pack":${scorerPack},"adapters":[${scorerAdapters.join(",")}]}`
    : null;
const learnedModel = learnedModelFile
  ? {
      url: "learned-model.json",
      version: createHash("sha256")
        .update(learnedModelFile)
        .digest("hex")
        .slice(0, 16),
    }
  : null;
const inlinePack = learnedModel ? null : scorerPack;
const inlineAdapters = learnedModel ? [] : scorerAdapters;

const workerSource = await buildWorker("worker.ts", "EMPTY_WEB_WORKER_BUNDLE", {
  __LEARNED_SEALED_POLICY__: learnedSealedPolicy ?? "null",
  __SCORER_PACK__: inlinePack ?? "null",
  __SCORER_ADAPTERS__: `[${inlineAdapters.join(",")}]`,
  __SCORER_PACK_BY_MESSAGE__: learnedModel ? "true" : "false",
});
// The matchup page's games can be played by the learned model, so its
// worker carries the same pack and adapters as the game worker.
const analyticsWorkerSource = await buildWorker(
  "analytics-worker.ts",
  "EMPTY_ANALYTICS_WORKER_BUNDLE",
  {
    __SCORER_PACK__: inlinePack ?? "null",
    __SCORER_ADAPTERS__: `[${inlineAdapters.join(",")}]`,
    __SCORER_PACK_BY_MESSAGE__: learnedModel ? "true" : "false",
  },
);

const builtInCardArt = await buildLocalCardArt();
const builtInPrintedText = await buildBuiltInPrintedText();

const appBuild = await build({
  entryPoints: [join(webRoot, "main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  write: false,
  minify: true,
  define: {
    __WORKER_SOURCE__: JSON.stringify(workerSource),
    __ANALYTICS_WORKER_SOURCE__: JSON.stringify(analyticsWorkerSource),
    __BUILT_IN_CARD_ART__: JSON.stringify(builtInCardArt),
    __BUILT_IN_PRINTED_TEXT__: JSON.stringify(builtInPrintedText),
    __MATCH_SERVER__: JSON.stringify(matchServer),
    __LEARNED_SEALED_POLICY_AVAILABLE__: learnedSealedPolicy ? "true" : "false",
    __SCORER_AVAILABLE__: scorerPack ? "true" : "false",
    __LEARNED_MODEL__: JSON.stringify(learnedModel),
  },
  logLevel: "silent",
});
const appSource = appBuild.outputFiles[0]?.text;
if (!appSource) throw new Error("EMPTY_WEB_APP_BUNDLE");

/**
 * Three voices: Bricolage Grotesque shouts, Instrument Sans speaks,
 * IBM Plex Mono counts. The first two ship as variable weight axes.
 *
 * Roboto and Roboto Condensed are a fourth, narrower job: the landing page's
 * mode cards are printed in the type a real card is, and that is what a real
 * card uses.
 */
const fontRoot = join(root, "node_modules");
const variableFaces: readonly [
  family: string,
  weights: string,
  file: string,
][] = [
  [
    "Bricolage Grotesque",
    "200 800",
    "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  ],
  [
    "Instrument Sans",
    "400 700",
    "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
  ],
];
const staticFaces: readonly [family: string, weight: number, file: string][] = [
  [
    "IBM Plex Mono",
    400,
    "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
  ],
  [
    "IBM Plex Mono",
    500,
    "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
  ],
  [
    "IBM Plex Mono",
    600,
    "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2",
  ],
  ["Roboto", 400, "@fontsource/roboto/files/roboto-latin-400-normal.woff2"],
  ["Roboto", 700, "@fontsource/roboto/files/roboto-latin-700-normal.woff2"],
  [
    "Roboto Condensed",
    700,
    "@fontsource/roboto-condensed/files/roboto-condensed-latin-700-normal.woff2",
  ],
];

const [
  template,
  styleSheet,
  iconSource,
  artAnchorCss,
  variableData,
  staticData,
] = await Promise.all([
  readFile(join(webRoot, "index.html"), "utf8"),
  buildStylesheet(),
  readFile(join(root, "tools/assets/app-icon.svg"), "utf8"),
  buildArtAnchorCss(),
  Promise.all(
    variableFaces.map(([, , file]) => readFile(join(fontRoot, file))),
  ),
  Promise.all(staticFaces.map(([, , file]) => readFile(join(fontRoot, file)))),
]);

const fontFaces = [
  ...variableFaces.map(
    ([family, weights], index) =>
      `@font-face{font-family:"${family}";font-style:normal;font-weight:${weights};font-display:swap;src:url("data:font/woff2;base64,${variableData[index]!.toString("base64")}") format("woff2-variations")}`,
  ),
  ...staticFaces.map(
    ([family, weight], index) =>
      `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("data:font/woff2;base64,${staticData[index]!.toString("base64")}") format("woff2")}`,
  ),
].join("\n");

/**
 * The faces first and the art anchors last, either side of the authored
 * stylesheet that `buildStylesheet` has already bundled and minified. Order is
 * the point of the sandwich: the anchors are `none` in styles/art-anchors.css
 * and only the trailing block, written from what `assets/` actually holds,
 * turns one into an image. Both generated halves get their own minify pass, so
 * the inlined fonts and images do not carry quotes the browser does not need.
 */
const minifyGenerated = async (source: string) =>
  source
    ? (await transform(source, { loader: "css", minify: true })).code
    : source;
const css = [
  await minifyGenerated(fontFaces),
  styleSheet,
  await minifyGenerated(artAnchorCss),
].join("\n");
/**
 * The tab icon, as a data URI: the artifact is one file with no external
 * fetches, so `tools/assets/app-icon.svg` is inlined here rather than shipped
 * beside the page. Comments and indentation
 * go first -- they are for the reader of the source file, not the browser.
 */
const favicon = `data:image/svg+xml,${encodeURIComponent(
  iconSource
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim(),
)}`;

const html = template
  .replace("__APP_ICON__", () => favicon)
  .replace("__APP_CSS__", () => css)
  .replace("__APP_JS__", () => appSource.replaceAll("</script", "<\\/script"));

if (/(?:src|href)=["'](?!data:|#)/i.test(html)) {
  throw new Error("WEB_ARTIFACT_HAS_EXTERNAL_RUNTIME_FILE");
}
if (!/<link rel="icon" href="data:image\/svg\+xml,/.test(html)) {
  throw new Error("WEB_ARTIFACT_MISSING_INLINE_FAVICON");
}
if (!html.includes(workerSource.slice(0, 80))) {
  throw new Error("WEB_ARTIFACT_MISSING_INLINE_WORKER");
}
if (!html.includes(analyticsWorkerSource.slice(0, 80))) {
  throw new Error("WEB_ARTIFACT_MISSING_INLINE_ANALYTICS_WORKER");
}

const output = join(outputDir, matchServer ? "index.html" : "open-optcg.html");
await mkdir(outputDir, { recursive: true });
await writeFile(output, html);
if (learnedModelFile && learnedModel) {
  await writeFile(join(outputDir, learnedModel.url), learnedModelFile);
  console.log(
    `Wrote ${join(outputDir, learnedModel.url)} (version ${learnedModel.version}); serve it beside the page`,
  );
}
console.log(
  `Built ${output} (${Buffer.byteLength(html).toLocaleString()} bytes, ${Object.keys(builtInCardArt).length} card images, ${builtInPrintedText ? `${Object.keys(builtInPrintedText).length} cards of printed text` : "no printed text"})`,
);
