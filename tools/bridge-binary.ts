/**
 * The launcher as one executable: `pnpm bridge:binary`.
 *
 *   pnpm bridge:binary [--out dist/bridge]
 *
 * See `tools/optcgsim/launcher/sea.ts` for what it builds and why. macOS
 * players want the `.app` around it instead: `pnpm bridge:app`.
 */
import { resolve } from "node:path";
import { buildSeaBinary } from "./optcgsim/launcher/sea.js";

const args = process.argv.slice(2);
const at = args.indexOf("--out");
const outDir = resolve(
  at >= 0 ? (args[at + 1] ?? "dist/bridge") : "dist/bridge",
);

const { path } = await buildSeaBinary(outDir, (line) => {
  console.log(line);
});
console.log(`run \`${path} status\` to check it`);
