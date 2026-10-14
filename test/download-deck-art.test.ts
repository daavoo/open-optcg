import sharp from "sharp";
import { SEALED_LEADER } from "@one-piece-sim/decks";
import { describe, expect, it } from "vitest";
import {
  artExtension,
  convertArt,
  dedupeAcrossDecks,
  officialImageUrls,
  parseOptions,
  supportedCardNumbers,
} from "../tools/download-deck-art.js";

describe("deck art downloader", () => {
  it("extracts and deduplicates matching official image paths", () => {
    const html = `
      <img data-src="../images/cardlist/card/OP01-016_p9.png?260731">
      <img data-src="../images/cardlist/card/OP01-016_p9.png?260731">
      <img data-src="../images/cardlist/card/OP01-016_p1.png?260731">
      <img data-src="../images/cardlist/card/OP01-017.png?260731">
    `;
    expect(officialImageUrls(html, "OP01-016")).toEqual([
      "../images/cardlist/card/OP01-016_p9.png?260731",
      "../images/cardlist/card/OP01-016_p1.png?260731",
    ]);
  });

  it("creates an import-safe default and needs a target", () => {
    expect(() => parseOptions([])).toThrow("Usage:");
    const options = parseOptions(["(Red) Monkey.D.Luffy - Starter Deck 31"]);
    expect(options.deckIds).toEqual(["(Red) Monkey.D.Luffy - Starter Deck 31"]);
    expect(options.all).toBe(false);
    expect(options.output).toMatch(/local-art$/);
    expect(options.force).toBe(false);
    expect(options.raw).toBe(false);
  });

  it("stores WebP by default and the source format with --raw", () => {
    expect(
      parseOptions(["(Red) Monkey.D.Luffy - Starter Deck 31", "--raw"]).raw,
    ).toBe(true);

    // Converted: one extension for every card, whatever its source format.
    expect(artExtension("ST31-001")).toBe(".webp");
    expect(artExtension(SEALED_LEADER)).toBe(".webp");
    // --raw keeps what the source serves: PNG from Bandai's cardlist, JPEG for
    // the one sealed Leader with no Bandai listing.
    expect(artExtension("ST31-001", true)).toBe(".png");
    expect(artExtension(SEALED_LEADER, true)).toBe(".jpg");
  });

  it("re-encodes fetched art as WebP", async () => {
    // A card-sized image with flat colour, which is the case PNG handles best;
    // if WebP wins here it wins by more on real art.
    const png = await sharp({
      create: {
        width: 480,
        height: 671,
        channels: 3,
        background: "#c02040",
      },
    })
      .png()
      .toBuffer();

    const converted = await convertArt(png);

    // RIFF....WEBP -- the container magic the build's `image/webp` media type
    // promises the browser.
    expect(converted.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(converted.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect((await sharp(converted).metadata()).width).toBe(480);
    expect(converted.length).toBeLessThan(png.length);
  });

  it("downloads every supported card flat with --all", () => {
    const options = parseOptions(["--all"]);
    expect(options.all).toBe(true);
    expect(options.deckIds).toEqual([]);
    // A deck and --all are different destinations, so naming both is a mistake
    // rather than a merge.
    expect(() =>
      parseOptions(["(Red) Monkey.D.Luffy - Starter Deck 31", "--all"]),
    ).toThrow("Usage:");
  });

  it("covers the deck editor's full catalog, not just registered decks", () => {
    const numbers = supportedCardNumbers();

    // A format deck card is included.
    expect(numbers).toContain("ST31-001");
    // A playable card that is not in any registered deck manifest (ST21-003 is
    // implemented but unregistered) is included too -- that is the point of the
    // flat download.
    expect(numbers).toContain("ST21-003");
    expect(numbers).toContain("ST21-014");
    expect(numbers).toContain("ST21-015");
    expect(numbers).toContain("OP10-005");
    // Fixture identities have no official art and are excluded.
    expect(numbers.some((number) => number.startsWith("FIX-"))).toBe(false);
  });

  it("downloads a card shared by two decks only once", () => {
    const reused = new Map<string, string>();
    expect(
      dedupeAcrossDecks(reused, "ST31-001", "/art/ST31/ST31-001.webp"),
    ).toBeNull();
    expect(reused.size).toBe(1);
    expect(
      dedupeAcrossDecks(reused, "ST31-001", "/art/ST32/ST31-001.webp"),
    ).toBe("/art/ST31/ST31-001.webp");
    expect(reused.size).toBe(1);
  });
});
