import { escapeHtml } from "../card-text.js";
import { bindAppDialogDismissal } from "../dialogs.js";
import { icon } from "../icons.js";
import * as assetGate from "./asset-gate.js";
import type { AssetGateContext } from "./asset-gate.js";
import * as footer from "./footer.js";

/**
 * One way to play, as the landing page offers it.
 *
 * A list rather than hardcoded markup because 1v1 is the staple and
 * everything beside it is a format that comes and goes -- sealed today, a
 * limited-time event later. Adding one should mean adding an entry
 * here and a screen for it, not editing this page's HTML.
 */
export interface HomeMode {
  id: string;
  /** Lucide icon name. */
  icon: string;
  title: string;
  blurb: string;
  /**
   * Whether this mode ships a painted card of its own.
   *
   * The image is a *whole card* -- frame, effect box, type line and name band
   * all in the painting -- so the page shows it and draws nothing of its own.
   * Without one the mode falls back to a card composed here out of the icon,
   * the blurb and the title.
   *
   * The file is not named here: it is `mode-<id>.<ext>` in
   * packages/web/src/assets/, inlined into `--art-mode-<id>` by the build (see
   * docs/art-anchors.md).
   */
  art?: boolean;
  open(): void;
}

export interface HomeContext {
  modes: readonly HomeMode[];
  /** The asset pack, as the Configure dialog's setting. */
  assetGate: AssetGateContext;
  /**
   * The match a reload interrupted, if one is remembered (see
   * ../match-resume.ts): how far in it was and who was playing, as words the
   * banner can print. Null when there is nothing to pick up.
   */
  resumable: () => {
    turn: number;
    p1Deck: string;
    p2Deck: string;
  } | null;
  /** Put the remembered match back on the board. */
  resume: () => void;
  /** Why the last resume did not work, or null. Shown where the offer was. */
  resumeNotice: () => string | null;
}

/**
 * The match whose resume offer the player has already waved away, as the words
 * the modal would print for it.
 *
 * Module state rather than the host's, because it is nothing the app has to
 * remember across a reload: the offer is a modal now, and one that came back
 * the moment its host screen re-rendered -- which the lobby does on every deck
 * pick -- could not be dismissed at all. Dismissing hides the question, it does
 * not throw the match away; a reload asks again.
 *
 * Keyed by the match rather than a bare flag so that walking out of a *second*
 * match still gets offered its way back. The turn is deliberately not part of
 * the key: the same match a turn later is the same question.
 */
let dismissedResume: string | null = null;

/** The key of the offer currently on screen, so dismissing can name it. */
let currentResume: string | null = null;

/**
 * The offer to pick a match back up, as the one thing on the page that asks a
 * question.
 *
 * A modal rather than a banner above the decks: a match already under way is
 * not a fourth control on the lobby, it is a fork -- go back to the board, or
 * set a new match up -- and standing it in the layout meant the lobby opened
 * with a wide dark plate over its two Leaders that nothing could clear. Here it
 * is answered once, either way, and the page behind it is the page.
 *
 * The notice takes the same place when the offer could not be kept: the same
 * modal with nothing to press but Close.
 */
function renderResume(ctx: HomeContext): string {
  const notice = ctx.resumeNotice();
  const match = notice ? null : ctx.resumable();
  if (!notice && !match) return "";
  currentResume = notice
    ? `notice:${notice}`
    : `${match!.p1Deck}|${match!.p2Deck}`;
  if (dismissedResume === currentResume) return "";
  const what = notice
    ? `<p class="home-resume-notice" role="status">${escapeHtml(notice)}</p>`
    : `<p class="home-resume-decks">${escapeHtml(`${match!.p1Deck} vs ${match!.p2Deck}`)}</p>`;
  return `<div class="app-dialog-backdrop resume-backdrop" id="resume-dialog">
    <div class="app-dialog resume-dialog" role="dialog" aria-modal="true" aria-label="Match in progress">
      <div class="app-dialog-head">
        <h2>${notice ? "Could not resume" : "Resume match"}</h2>
        <button class="text-button" type="button" data-close-dialog="resume-dialog" data-dismiss-resume>${icon("x", "Close")}Close</button>
      </div>
      ${notice ? "" : `<p class="home-resume-eyebrow">Match in progress · Turn ${String(match!.turn)}</p>`}
      ${what}
      ${
        notice
          ? ""
          : `<div class="app-dialog-actions">
        <button class="primary" type="button" data-home-resume>${icon("play", "Resume match")}Resume</button>
        <button class="text-button" type="button" data-close-dialog="resume-dialog" data-dismiss-resume>Not now</button>
      </div>`
      }
    </div>
  </div>`;
}

/**
 * One mode, either as the card it was painted as or as a card composed here.
 *
 * A painted mode is *only* its painting: the image already carries the cost
 * bubble, art, effect box, type line and name band, so drawing any of them in
 * HTML would print them twice. All the button adds is the white trim and the
 * shadow that lift the card off the backdrop.
 *
 * The image is an `<img>` rather than a painted background because a
 * background has to be given a shape, and any shape but the file's own crops
 * or letterboxes it. The `src` is filled in by `bind()` -- see `paintCards()`
 * -- because the URL lives in a CSS custom property, which is the one place
 * both the build and a runtime art import can put it.
 *
 * A mode with no painting keeps a card composed of what this page knows: the
 * icon, the effect text and the name band. That is what an art-less build and
 * a mode whose painting has not been drawn yet get.
 */
function renderMode(mode: HomeMode): string {
  // The anchor name is built from the id, so it is spelled out here rather
  // than interpolated blind: anything but a plain slug would be naming an
  // arbitrary CSS property.
  const anchor = /^[a-z0-9-]+$/.test(mode.id) ? `--art-mode-${mode.id}` : "";
  const open = `<button class="home-mode" type="button" data-home-mode="${escapeHtml(mode.id)}"`;
  if (mode.art && anchor)
    // The alt text is the whole accessible name of the button: everything the
    // reader sees is inside the painting.
    return `${open} data-mode-art="${anchor}">
    <img class="home-mode-card" alt="${escapeHtml(mode.title)}" />
  </button>`;
  return `${open} data-composed="">
    <span class="home-mode-art">${icon(mode.icon, mode.title)}</span>
    <span class="home-mode-text">${escapeHtml(mode.blurb)}</span>
    <span class="home-mode-name">${escapeHtml(mode.title)}</span>
  </button>`;
}

/**
 * What the landing page shows around the lobby: the match to pick back up, and
 * the asset pack as a setting inside the Configure dialog. There is no "load a
 * pack" row on the lobby: the lobby is only reached once one is in (see
 * ./asset-gate.ts).
 *
 * The lobby is the landing page now -- 1v1 is the one mode that ships -- so
 * these pieces are printed onto it rather than onto a page of their own. The
 * mode fan below stays as code for the formats that are not shipped yet;
 * `#modes` opens it.
 *
 * Two slots because each belongs to a different part of the page: the offer
 * is a modal over everything, and the setting is a block the lobby hands to
 * its own dialog.
 */
export function renderLanding(ctx: HomeContext): {
  above: string;
  settings: string;
} {
  return {
    above: renderResume(ctx),
    settings: assetGate.renderSetting(ctx.assetGate),
  };
}

export function render(ctx: HomeContext): string {
  return `
    <main class="setup-shell home-shell">
      <header class="setup-topbar">
        <span class="home-brand">
          <svg class="brand-mark small"><use href="#brand-hex" /></svg>
          <span class="setup-wordmark">Open OPTCG</span>
        </span>
        <p class="home-tagline">An open-source project that lets you practice the One Piece Card Game.</p>
      </header>
      <div class="home-main">
        ${renderResume(ctx)}
        <div class="home-modes">
          ${ctx.modes.map(renderMode).join("")}
        </div>
      </div>
      ${footer.render()}
    </main>`;
}

/**
 * Points each painted mode card at its image.
 *
 * The URL only exists as a CSS custom property -- the build inlines one, a
 * runtime art import sets one on `:root` -- so it is read back from the
 * computed style and copied into the `<img>`. An anchor still holding `none`
 * leaves the card unpainted, which the composed fallback covers: the button
 * swaps itself back to text rather than showing a broken image.
 */
function paintCards(ctx: HomeContext): void {
  const styles = getComputedStyle(document.documentElement);
  document
    .querySelectorAll<HTMLImageElement>(".home-mode[data-mode-art] img")
    .forEach((image) => {
      const button = image.closest<HTMLElement>(".home-mode");
      const anchor = button?.dataset.modeArt ?? "";
      const url = /^url\((["']?)(.+)\1\)$/.exec(
        styles.getPropertyValue(anchor).trim(),
      )?.[2];
      if (url) {
        image.src = url;
        return;
      }
      const mode = ctx.modes.find(
        (entry) => entry.id === button?.dataset.homeMode,
      );
      if (button && mode)
        button.outerHTML = renderMode({ ...mode, art: false });
    });
}

/** Wire the two landing pieces, wherever a screen printed them. */
export function bindLanding(ctx: HomeContext): void {
  assetGate.bindControls(ctx.assetGate);
  document
    .querySelector<HTMLElement>("[data-home-resume]")
    ?.addEventListener("click", () => {
      ctx.resume();
    });
  const backdrop = document.querySelector<HTMLElement>("#resume-dialog");
  if (!backdrop) return;
  // Both hosts of this modal, not just the lobby: the mode fan behind `#modes`
  // prints the landing pieces too, and it wires no dialogs of its own. The
  // helper's listeners are named module functions, so calling it again here is
  // not a second copy.
  bindAppDialogDismissal();
  // The shared dialog dismissal (dialogs.ts) hides the element; this is what
  // makes the answer stick, so the host's next re-render does not print the
  // question again. A click on the backdrop counts as one of the two Close
  // buttons, and so does Escape -- the three ways every dialog in this app
  // closes.
  backdrop.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target === backdrop || target?.closest("[data-dismiss-resume]"))
      dismissedResume = currentResume;
  });
  document.addEventListener("keydown", dismissResumeOnEscape);
  // The modal is printed already open, so nothing has moved focus into it.
  // Resume rather than the first button in the markup: it is what the modal is
  // for, and a dialog that opens on its own Close button reads as one already
  // being dismissed. `preventScroll` for the reason toggleAppDialog gives --
  // the lobby is its own scroller and would come back scrolled somewhere else.
  const first =
    backdrop.querySelector<HTMLElement>("[data-home-resume]") ??
    backdrop.querySelector<HTMLElement>("button");
  first?.focus({ preventScroll: true });
}

/** Named, so re-binding the landing pieces cannot stack up a second copy. */
function dismissResumeOnEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") dismissedResume = currentResume;
}

export function bind(ctx: HomeContext): void {
  paintCards(ctx);
  bindLanding(ctx);
  document
    .querySelectorAll<HTMLElement>("[data-home-mode]")
    .forEach((button) => {
      const mode = ctx.modes.find(
        (entry) => entry.id === button.dataset.homeMode,
      );
      if (mode)
        button.addEventListener("click", () => {
          mode.open();
        });
    });
  footer.bind();
}
