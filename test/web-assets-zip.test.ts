import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { unpackAssetZip } from "../packages/web/src/assets.js";

/**
 * A zip is the pack format a phone can hand the hosted page, so what comes out
 * of one must be exactly what a folder pick would have produced: images keyed
 * by basename with a real MIME type, the text pack as JSON, and nothing else.
 */
describe("asset pack zip", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const zip = zipSync({
    "open-optcg-assets/printed-text.json": strToU8(
      JSON.stringify({ version: 1, cards: {} }),
    ),
    "open-optcg-assets/art/ST31-001.webp": [png, { level: 0 }],
    "open-optcg-assets/art/nested/OP01-016.PNG": png,
    "open-optcg-assets/art/manifest.json": strToU8("{}"),
    "open-optcg-assets/art/notes.txt": strToU8("ignored"),
    "__MACOSX/open-optcg-assets/art/._ST31-001.webp": png,
    "open-optcg-assets/.DS_Store": png,
  });

  it("flattens entries to basenames and types them by extension", () => {
    const files = unpackAssetZip(zip);
    const byName = new Map(files.map((file) => [file.name, file.type]));
    expect(byName.get("ST31-001.webp")).toBe("image/webp");
    expect(byName.get("OP01-016.PNG")).toBe("image/png");
    expect(byName.get("printed-text.json")).toBe("application/json");
    expect(byName.get("manifest.json")).toBe("application/json");
  });

  it("drops what is not an image or JSON, and Finder's shadow entries", () => {
    const names = unpackAssetZip(zip).map((file) => file.name);
    expect(names).not.toContain("notes.txt");
    expect(names).not.toContain(".DS_Store");
    expect(names).not.toContain("._ST31-001.webp");
    expect(names).toHaveLength(4);
  });

  it("rejects a file that is not a zip", () => {
    expect(() => unpackAssetZip(strToU8("not a zip"))).toThrow();
  });
});
