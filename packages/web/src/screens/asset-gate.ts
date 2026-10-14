import { escapeHtml } from "../card-text.js";
import { icon } from "../icons.js";
import * as footer from "./footer.js";

/**
 * The card art and printed text, and the one screen that asks for them.
 *
 * The app ships with neither -- both are Bandai's, and the project distributes
 * only its own work -- and it is not played without them: until a pack is in,
 * this screen is the whole app (see `assetsReady()` in ../assets.ts). The
 * player runs the asset downloader, which fills a folder from Bandai's card
 * list, and hands that folder to the page.
 *
 * One way to hand it over per device, not a choice of two: a browser that can
 * pick a folder is offered the folder, which is exactly what the downloader
 * wrote. A phone or tablet cannot pick a folder, so there -- and only there --
 * the control takes a zip of it instead.
 *
 * The same status line and control are printed in the Configure dialog once a
 * pack is in, which is where a newer one is loaded after a new set.
 */
export interface AssetGateContext {
  /** What is loaded so far; see `assetSummary()` in ../assets.ts. */
  assets: () => { images: number; textCards: number };
  /** Loads the files the player picked and re-renders with the new counts. */
  loadAssets: (files: readonly File[]) => Promise<void>;
  /**
   * A one-line note about the last load -- "Loading…", or why it was not a
   * pack -- under the status line; null when there is nothing to say.
   */
  assetNotice: () => string | null;
  /** Whether this browser can pick a folder; see `canPickFolder()`. */
  folderPicker: boolean;
}

// Opened in script rather than an `<a href>`: the artifact must contain no
// external `href` at all, which `tools/build-web.ts` enforces.
const ASSET_PACK_DOCS_URL =
  "https://github.com/daavoo/open-optcg/blob/main/docs/asset-packs.md";
const DOWNLOADER_URL = "https://github.com/daavoo/open-optcg/releases/latest";

/**
 * Whether the folder picker is worth offering here.
 *
 * `webkitdirectory` is the folder picker every desktop browser has under that
 * one name, but mobile Safari and Chrome on Android accept the attribute and
 * still open a file picker, so its presence is not enough: a phone or tablet
 * is told apart by its platform. iPadOS reports itself as a Mac and gives
 * itself away by its touch points.
 */
export function canPickFolder(): boolean {
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (!("webkitdirectory" in document.createElement("input"))) return false;
  const agent = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(agent)) return false;
  return !(/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

function renderStatus(ctx: AssetGateContext): string {
  const { images, textCards } = ctx.assets();
  const loaded =
    images === 0 && textCards === 0
      ? "No card images or printed text loaded yet."
      : `Loaded ${images} image${images === 1 ? "" : "s"} and printed text for ${textCards} card${textCards === 1 ? "" : "s"}.`;
  const notice = ctx.assetNotice();
  return `<p class="home-assets-status">${escapeHtml(loaded)}</p>
    ${notice ? `<p class="home-assets-notice">${escapeHtml(notice)}</p>` : ""}`;
}

function renderControl(ctx: AssetGateContext): string {
  return ctx.folderPicker
    ? `<label class="home-assets-load">
      ${icon("folder-open", "")}<span>Load asset folder</span>
      <input type="file" data-asset-folder webkitdirectory multiple hidden />
    </label>`
    : `<label class="home-assets-load">
      ${icon("package-open", "")}<span>Load asset pack (.zip)</span>
      <input type="file" data-asset-zip accept=".zip,application/zip,application/x-zip-compressed" hidden />
    </label>`;
}

/** The whole app until a pack is in. */
export function render(ctx: AssetGateContext): string {
  const load = ctx.folderPicker
    ? "Choose <strong>Load asset folder</strong> below and pick the folder it filled."
    : "On the computer, zip the folder it filled and move the zip to this device. Then choose <strong>Load asset pack (.zip)</strong> below and pick it.";
  return `
    <main class="setup-shell home-shell asset-gate">
      <header class="setup-topbar">
        <span class="home-brand">
          <svg class="brand-mark small"><use href="#brand-hex" /></svg>
          <span class="setup-wordmark">Open OPTCG</span>
        </span>
      </header>
      <section class="asset-gate-panel" aria-label="Card text and art">
        <h1>Load the card art and text</h1>
        <p>Open OPTCG ships without card images and printed card text, because they belong to Bandai. You download them yourself, from Bandai's own card list, once.</p>
        <ol>
          <li>Get the asset downloader for your computer and run it. It asks where to save the cards. <button class="home-assets-help" type="button" data-asset-downloader>Get the downloader</button></li>
          <li>${load}</li>
        </ol>
        <p>The browser keeps them for your next visit. Nothing is uploaded anywhere.</p>
        <div class="home-assets">
          ${renderStatus(ctx)}
          ${renderControl(ctx)}
          <button class="home-assets-help" type="button" data-asset-help>What is an asset pack?</button>
        </div>
      </section>
      ${footer.render()}
    </main>`;
}

/**
 * The same status and control as a setting, printed in the Configure dialog:
 * for a player who already has a pack it is not a thing to do but a thing they
 * might change, which is what that dialog is.
 */
export function renderSetting(ctx: AssetGateContext): string {
  return `<div class="dialog-assets" data-asset-setting>
    <h3>Card text and art</h3>
    ${renderStatus(ctx)}
    ${renderControl(ctx)}
    <button class="home-assets-help" type="button" data-asset-help>What is an asset pack?</button>
  </div>`;
}

/** Wires the controls wherever they are printed: the gate or the dialog. */
export function bindControls(ctx: AssetGateContext): void {
  document
    .querySelectorAll<HTMLInputElement>("[data-asset-zip], [data-asset-folder]")
    .forEach((input) => {
      input.addEventListener("change", (event) => {
        const picker = event.currentTarget as HTMLInputElement;
        const files = [...(picker.files ?? [])];
        if (files.length > 0) void ctx.loadAssets(files);
      });
    });
  const opens: readonly [string, string][] = [
    ["[data-asset-help]", ASSET_PACK_DOCS_URL],
    ["[data-asset-downloader]", DOWNLOADER_URL],
  ];
  for (const [selector, url] of opens) {
    document.querySelectorAll<HTMLElement>(selector).forEach((button) => {
      button.addEventListener("click", () => {
        window.open(url, "_blank", "noopener");
      });
    });
  }
}

export function bind(ctx: AssetGateContext): void {
  bindControls(ctx);
  footer.bind();
}
