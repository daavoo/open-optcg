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
    ...overrides,
  };
}

describe("asset gate", () => {
  it("takes the zip the bookmark saves, and nothing else", () => {
    const html = render(ctx());
    expect(html).toContain("data-asset-zip");
    expect(html).toContain('accept=".zip');
    expect(html).not.toContain("webkitdirectory");
    expect(html).not.toContain("data-asset-folder");
    expect(html).not.toContain("data-asset-help");
  });

  it("offers the Get cards bookmark, with its href left to bind()", () => {
    const html = render(ctx());
    expect(html).toContain("data-get-cards");
    expect(html).toContain("data-bandai-cardlist");
    // build-web.ts refuses an external href in the artifact.
    expect(html).not.toMatch(/href=["'](?!#)/);
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

  it("prints the same control as the Configure dialog's setting", () => {
    expect(renderSetting(ctx())).toContain("data-asset-zip");
    expect(renderSetting(ctx())).not.toContain("data-asset-folder");
  });
});
