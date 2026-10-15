import { escapeHtml } from "../card-text.js";
import { bookmarklet } from "../get-cards-bookmarklet.js";
import { icon } from "../icons.js";
import * as footer from "./footer.js";

/**
 * The card art and printed text, and the one screen that asks for them.
 *
 * The app ships with neither -- both are Bandai's, and the project distributes
 * only its own work -- and it is not played without them: until a pack is in,
 * this screen is the whole app (see `assetsReady()` in ../assets.ts). The
 * player runs the "Get cards" bookmark on Bandai's card list
 * (../get-cards-bookmarklet.ts), which saves the pack as a zip, and hands
 * that zip to the page: one control, the same on every device.
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
}

const BANDAI_CARDLIST_URL = "https://en.onepiece-cardgame.com/cardlist/";

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

const ZIP_CONTROL = `<label class="home-assets-load">
      ${icon("package-open", "")}<span>Load asset pack (.zip)</span>
      <input type="file" data-asset-zip accept=".zip,application/zip,application/x-zip-compressed" hidden />
    </label>`;

/** The whole app until a pack is in. */
export function render(ctx: AssetGateContext): string {
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
          <li>Drag <a class="home-assets-load asset-gate-bookmarklet" data-get-cards draggable="true">${icon("bookmark-plus", "")}<span>Get cards</span></a> to your bookmarks bar. <em data-get-cards-hint hidden>Drag it, rather than click it here: it runs on Bandai's page.</em></li>
          <li>Open <button class="home-assets-help" type="button" data-bandai-cardlist>Bandai's card list</button> and click the bookmark there. It saves the cards as a zip. That takes a few minutes: you can switch to other tabs meanwhile, but leave that tab open, on that page, until it says it is done.</li>
          <li>Back here, choose <strong>Load asset pack (.zip)</strong> below and pick that zip.</li>
        </ol>
        <p>On a phone or tablet, where bookmarks are awkward, do the first two steps on a computer and move the zip over. The browser keeps the cards for your next visit. Nothing is uploaded anywhere.</p>
        <div class="home-assets">
          ${renderStatus(ctx)}
          ${ZIP_CONTROL}
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
    ${ZIP_CONTROL}
  </div>`;
}

/** Wires the controls wherever they are printed: the gate or the dialog. */
export function bindControls(ctx: AssetGateContext): void {
  document
    .querySelectorAll<HTMLInputElement>("[data-asset-zip]")
    .forEach((input) => {
      input.addEventListener("change", (event) => {
        const picker = event.currentTarget as HTMLInputElement;
        const files = [...(picker.files ?? [])];
        if (files.length > 0) void ctx.loadAssets(files);
      });
    });
  // Set here, not in the markup: the artifact must contain no external `href`
  // at all, which `tools/build-web.ts` enforces. The
  // link is for dragging to the bookmarks bar; clicked on this page it would
  // run against the wrong site, so a click says what to do instead. Its own
  // text is left alone: that text becomes the bookmark's name.
  document.querySelectorAll<HTMLElement>("[data-get-cards]").forEach((link) => {
    link.setAttribute("href", bookmarklet());
    link.addEventListener("click", (event) => {
      event.preventDefault();
      link
        .closest("li")
        ?.querySelector<HTMLElement>("[data-get-cards-hint]")
        ?.removeAttribute("hidden");
    });
  });
  // Opened in script rather than an `<a href>`, for the same reason.
  document
    .querySelectorAll<HTMLElement>("[data-bandai-cardlist]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        window.open(BANDAI_CARDLIST_URL, "_blank", "noopener");
      });
    });
}

export function bind(ctx: AssetGateContext): void {
  bindControls(ctx);
  footer.bind();
}
