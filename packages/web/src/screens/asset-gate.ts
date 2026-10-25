import { escapeHtml } from "../card-text.js";
import { bookmarklet, missingCardsUrl } from "../get-cards-bookmarklet.js";
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
 * pack is in, which is where a newer one is loaded after a new set -- or just
 * the cards that set added, through `missingArt`.
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
  /** Cards with no image yet; see `missingCardArt()` in ../assets.ts. */
  missingArt: () => readonly string[];
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
        <ol>
          <li>Drag <a class="home-assets-load asset-gate-bookmarklet" data-get-cards draggable="true">${icon("bookmark-plus", "")}<span>Get cards</span></a> to your bookmarks bar. <em data-get-cards-hint hidden>Drag it, rather than click it here: it runs on Bandai's page.</em>
            <span class="asset-gate-aside">No bookmarks bar? Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> on a Mac) to show it. Can't drag? <button class="home-assets-help" type="button" data-copy-bookmarklet>Copy the bookmark</button>, add a new bookmark and paste it as the address (URL). <span data-copy-status aria-live="polite"></span></span>
            <textarea class="asset-gate-code" data-bookmarklet-code readonly rows="3" hidden aria-label="The Get cards bookmark: copy this and paste it as a bookmark's address"></textarea></li>
          <li>Open <button class="home-assets-help" type="button" data-bandai-cardlist>Bandai's card list</button> and click the bookmark there. It saves the cards as a zip. That takes a few minutes: you can switch to other tabs meanwhile. If that tab is closed, run the bookmark again and it carries on where it stopped.</li>
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
    ${renderMissing(ctx)}
    ${ZIP_CONTROL}
  </div>`;
}

/**
 * After a new set, the pack a player loaded lacks its cards. Rather than the
 * whole pack again, the card list is opened with those numbers on the link,
 * and the bookmark run there saves a zip of just them (see
 * `missingCardsUrl`). Only while the pack holds more than it lacks: a pack
 * missing most of the cards wants replacing whole, which the zip control
 * below already does.
 */
function renderMissing(ctx: AssetGateContext): string {
  const missing = ctx.missingArt().length;
  if (missing === 0 || ctx.assets().images <= missing) return "";
  const cards = `${missing} card${missing === 1 ? "" : "s"}`;
  return `<p class="home-assets-missing">${cards} ${missing === 1 ? "has" : "have"} no art yet, usually a set added since your pack.
      <button class="home-assets-help" type="button" data-get-missing>Get only ${missing === 1 ? "that card" : `those ${missing}`}</button>
      opens Bandai's card list: click your Get cards bookmark there, then load the zip it saves here.</p>`;
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
  // A page cannot create a bookmark itself (no browser offers that any
  // more), so where dragging is not possible the player makes one and pastes
  // the code in. Where the clipboard is refused, the code is shown selected
  // for copying by hand.
  document
    .querySelectorAll<HTMLElement>("[data-copy-bookmarklet]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest("li");
        const status = item?.querySelector<HTMLElement>("[data-copy-status]");
        const code = item?.querySelector<HTMLTextAreaElement>(
          "[data-bookmarklet-code]",
        );
        const showCode = () => {
          if (!code) return;
          code.value = bookmarklet();
          code.hidden = false;
          code.select();
          if (status) status.textContent = "Copy the code below instead.";
        };
        // Inside the promise, so a page with no clipboard at all (one served
        // over plain http) lands in the same fallback as a refusal.
        Promise.resolve()
          .then(() => navigator.clipboard.writeText(bookmarklet()))
          .then(() => {
            if (status) status.textContent = "Copied.";
          }, showCode);
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
  document
    .querySelectorAll<HTMLElement>("[data-get-missing]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        window.open(
          missingCardsUrl(BANDAI_CARDLIST_URL, ctx.missingArt()),
          "_blank",
          "noopener",
        );
      });
    });
}

export function bind(ctx: AssetGateContext): void {
  bindControls(ctx);
  footer.bind();
}
