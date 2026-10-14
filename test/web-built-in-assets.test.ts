import { describe, expect, it } from "vitest";
import {
  assetSummary,
  loadBuiltInPrintedText,
} from "../packages/web/src/assets.js";

/**
 * A published build carries no card art and no printed text, and both of the
 * hooks that would read them look at a build-time global esbuild substitutes
 * only for a `--with-art` / `--with-text` build. Here, as in a unit test and
 * as in any environment that is not the bundle, those globals do not exist.
 *
 * What is under test is the `typeof` guard that makes that safe. A direct
 * reference to an unsubstituted global throws a ReferenceError, and both of
 * these run during startup -- `loadBuiltInPrintedText` before the browser's
 * asset cache is even read -- so losing the guard does not degrade a published
 * artifact, it stops it booting.
 */
describe("a build with nothing inlined", () => {
  it("loads no printed text rather than throwing", () => {
    expect(loadBuiltInPrintedText()).toBe(0);
  });

  it("reports no assets rather than throwing", () => {
    expect(assetSummary()).toEqual({ images: 0, textCards: 0 });
  });
});
