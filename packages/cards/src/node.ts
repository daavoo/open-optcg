import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPrintedText, parsePrintedTextPack } from "./text.js";

/**
 * The printed-text cache on disk, for tests and tools running under Node.
 *
 * `pnpm reference:audit` writes `packages/cards/printed-text.json` from the
 * reference pages it parsed; the file is gitignored because the words in it
 * are Bandai's. A test that quotes card text, the card scaffolder, and the LLM
 * fixture tools load it through here. The browser never does: a player loads
 * the same file as an asset pack instead.
 */
export const PRINTED_TEXT_CACHE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "printed-text.json",
);

/**
 * Loads the cache if it is on disk; the count loaded, 0 when it is not.
 * Absent is normal for a fresh clone, so nothing here fails -- a test that
 * needs the text skips itself when this returns 0.
 */
export function loadPrintedTextCache(
  path: string = PRINTED_TEXT_CACHE,
): number {
  if (!existsSync(path)) return 0;
  const pack = parsePrintedTextPack(readFileSync(path, "utf8"));
  return loadPrintedText(pack.cards);
}
