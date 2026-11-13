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
import {
  SEALED_EXPANSIONS,
  SEALED_LEADER,
  SEALED_LEADER_IMAGE_URL,
} from "@one-piece-sim/decks";
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
  define: {
    __WANTED_CARDS__: JSON.stringify(wantedCards()),
    // Art no card list page carries: each sealed set's pack photo and the
    // sealed Leader's, by the key the app files them under.
    __EXTRA_ART__: JSON.stringify({
      ...Object.fromEntries(
        SEALED_EXPANSIONS.map((expansion) => [
          `${expansion.code}-PACK`,
          expansion.packImageUrl,
        ]),
      ),
      [SEALED_LEADER]: SEALED_LEADER_IMAGE_URL,
    }),
    __MAX_IN_FLIGHT__: process.env.GET_CARDS_MAX_IN_FLIGHT ?? "16",
  },
  metafile: true,
  logLevel: "warning",
});
const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`Wrote ${out} (${Math.round(bytes / 1024)} KB)`);
console.log(`Bookmarklet:\n${bookmarklet()}`);
