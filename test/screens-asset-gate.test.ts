import { describe, expect, it } from "vitest";
import {
  render,
  renderSetting,
  type AssetGateContext,
} from "../packages/web/src/screens/asset-gate.js";

function ctx(overrides: Partial<AssetGateContext> = {}): AssetGateContext {
  return {
    assets: () => ({ images: 0, textCards: 0 }),
    loadAssets: async () => {},
    assetNotice: () => null,
    folderPicker: true,
    ...overrides,
  };
}

describe("asset gate", () => {
  it("offers the folder the downloader fills, and no zip, where a folder can be picked", () => {
    const html = render(ctx());
    expect(html).toContain("data-asset-folder");
    expect(html).toContain("webkitdirectory");
    expect(html).toContain("Load asset folder");
    expect(html).not.toContain("data-asset-zip");
    expect(html).toContain("data-asset-downloader");
  });

  it("offers a zip instead where a folder cannot be picked", () => {
    const html = render(ctx({ folderPicker: false }));
    expect(html).toContain("data-asset-zip");
    expect(html).toContain('accept=".zip');
    expect(html).not.toContain("webkitdirectory");
    expect(html).toContain("zip the folder");
  });

  it("is a page of its own, with nothing to play on it", () => {
    const html = render(ctx());
    expect(html).toContain("Load the card art and text");
    expect(html).not.toContain("data-home-mode");
    expect(html).not.toContain("setup-form");
  });

  it("prints what is loaded, and the notice from the last load", () => {
    const html = render(
      ctx({
        assets: () => ({ images: 0, textCards: 40 }),
        assetNotice: () => "That pack is missing the card images",
      }),
    );
    expect(html).toContain("printed text for 40 cards");
    expect(html).toContain("home-assets-notice");
    expect(html).toContain("missing the card images");
    expect(render(ctx())).not.toContain("home-assets-notice");
  });

  it("prints the same single control as the Configure dialog's setting", () => {
    expect(renderSetting(ctx())).toContain("data-asset-folder");
    expect(renderSetting(ctx())).not.toContain("data-asset-zip");
    expect(renderSetting(ctx({ folderPicker: false }))).toContain(
      "data-asset-zip",
    );
  });
});
