import { it } from "vitest";
import { loadedPrintedTextCount } from "@one-piece-sim/cards";

/**
 * Whether this checkout holds the printed-text cache (see docs/asset-packs.md).
 *
 * The repository commits no card text, so a test that asserts on the words --
 * a clause's exact wording, a label that quotes it, a prompt that carries it
 * -- can only run where `pnpm reference:audit` has written the cache. On a
 * fresh clone and in CI's per-push jobs it has not; the weekly reference
 * check runs the suite with it. Everything that decides rules reads the
 * derived `CardRules` and never needs this.
 */
export function hasPrintedText(): boolean {
  return loadedPrintedTextCount() > 0;
}

/** `it`, skipped where the checkout has no printed text. */
export function itWithText(name: string, fn: () => void | Promise<void>): void {
  it.skipIf(!hasPrintedText())(name, fn);
}
