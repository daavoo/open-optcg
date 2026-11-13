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
 * (../get-cards-bookmarklet.ts). Opened from here, the card list sends the
 * pack straight back to this tab; opened any other way, it saves a zip the
 * player hands to the page, which is also how a phone gets the cards.
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

const CARDLIST_BUTTON = `<button class="home-assets-help" type="button" data-bandai-cardlist>Bandai's card list</button>`;

/** The steps and the zip control, wherever the gate's ask is printed. */
function renderSteps(ctx: AssetGateContext): string {
  return `<ol>
          <li>Drag <a class="home-assets-load asset-gate-bookmarklet" data-get-cards draggable="true">${icon("bookmark-plus", "")}<span>Get cards</span></a> to your bookmarks bar. <em data-get-cards-hint hidden>Drag it, don't click it.</em>
            <span class="asset-gate-aside">No bar? Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> on a Mac). Can't drag? <button class="home-assets-help" type="button" data-copy-bookmarklet>Copy the bookmark</button> and paste it as a new bookmark's URL. <span data-copy-status aria-live="polite"></span></span>
            <textarea class="asset-gate-code" data-bookmarklet-code readonly rows="3" hidden aria-label="The Get cards bookmark: copy this and paste it as a bookmark's address"></textarea></li>
          <li>Open ${CARDLIST_BUTTON} and click the bookmark there.</li>
          <li>Wait a few minutes. The cards appear here.</li>
        </ol>
        <div class="home-assets">
          ${renderStatus(ctx)}
          ${ZIP_CONTROL}
        </div>`;
}

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
        ${renderSteps(ctx)}
      </section>
      ${footer.render()}
    </main>`;
}

/** Whether the pack in has more cards than it lacks: then only those are asked for. */
function onlyMissing(ctx: AssetGateContext): number {
  const missing = ctx.missingArt().length;
  return missing > 0 && ctx.assets().images > missing ? missing : 0;
}

/**
 * The same ask printed on a page that shows itself before the cards are in
 * (the pre-release lobby), whose play buttons stay disabled until they are.
 * A player whose pack predates the set is asked only for the cards it lacks.
 */
export function renderPanel(ctx: AssetGateContext): string {
  const missing = onlyMissing(ctx);
  if (missing > 0) {
    return `<section class="asset-gate-panel asset-gate-inline" aria-label="Card text and art">
      <h2>Get the new cards first</h2>
      <ol>
        <li>Open <button class="home-assets-help" type="button" data-get-missing>Bandai's card list</button> and click your Get cards bookmark.</li>
        <li>Wait a minute. The ${missing} new cards appear here.</li>
      </ol>
    </section>`;
  }
  return `<section class="asset-gate-panel asset-gate-inline" aria-label="Card text and art">
      <h2>Get the cards first</h2>
      ${renderSteps(ctx)}
    </section>`;
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
 * and the bookmark run there fetches just them (see `missingCardsUrl`). Only
 * while the pack holds more than it lacks: a pack missing most of the cards
 * wants replacing whole, which the zip control below already does.
 */
function renderMissing(ctx: AssetGateContext): string {
  const missing = onlyMissing(ctx);
  if (missing === 0) return "";
  const cards = `${missing} card${missing === 1 ? "" : "s"}`;
  return `<p class="home-assets-missing">${cards} ${missing === 1 ? "has" : "have"} no art yet.
      <button class="home-assets-help" type="button" data-get-missing>Get ${missing === 1 ? "it" : "them"}</button>, then click your Get cards bookmark.</p>`;
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
  // Opened in script rather than an `<a href>`, for the same reason. Without
  // `noopener`: the card list keeps a handle on this tab, which is how the
  // downloader hands the cards back (`listenForGetCards`). Across origins that
  // handle can post messages to this tab or send it to another address; the
  // app reads only the pack message, and only from Bandai's origin.
  document
    .querySelectorAll<HTMLElement>("[data-bandai-cardlist]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        window.open(BANDAI_CARDLIST_URL, "_blank");
      });
    });
  document
    .querySelectorAll<HTMLElement>("[data-get-missing]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        window.open(
          missingCardsUrl(BANDAI_CARDLIST_URL, ctx.missingArt()),
          "_blank",
        );
      });
    });
}

export function bind(ctx: AssetGateContext): void {
  bindControls(ctx);
  footer.bind();
}
