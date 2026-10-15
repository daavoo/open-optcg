/**
 * Builds `dist/get-cards.js`, the in-browser asset downloader the bookmarklet
 * loads (see `tools/get-cards.ts`), and prints the bookmarklet itself.
 *
 *   pnpm get-cards:build
 *
 * The card numbers are baked in rather than the card registry bundled: the
 * script needs only the list, and the registry is megabytes of rules.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
import { wantedCards } from "./download-assets.js";
import { bookmarklet } from "../packages/web/src/get-cards-bookmarklet.js";

const root = process.cwd();
const out = join(root, "dist", "get-cards.js");
await mkdir(join(root, "dist"), { recursive: true });
const result = await build({
  entryPoints: [join(root, "tools", "get-cards.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: out,
  define: { __WANTED_CARDS__: JSON.stringify(wantedCards()) },
  metafile: true,
  logLevel: "warning",
});
const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`Wrote ${out} (${Math.round(bytes / 1024)} KB)`);
console.log(`Bookmarklet:\n${bookmarklet()}`);
