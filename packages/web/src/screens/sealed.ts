import type { CardDefinition } from "@one-piece-sim/cards";
import { requireKnownCard } from "@one-piece-sim/cards";
import {
  autoBuildSealedDeckBest,
  playablePoolCards,
  poolCounts,
  requireSealedExpansion,
  sealedDeckManifest,
  validateSealedDeck,
  DEFAULT_SEALED_EXPANSION,
  SEALED_DECK_SIZE,
  SEALED_EXPANSIONS,
  SEALED_LEADER,
  SEALED_PACK_COUNT,
  type DeckManifest,
  type SealedExpansion,
  type SealedPool,
} from "@one-piece-sim/decks";
import {
  expansionOfDeckList,
  openSealedPool,
  poolFromDeckList,
} from "../sealed-mode.js";
import {
  newLocalMatch,
  type ControllerKind,
  type MatchConfig,
} from "../controller.js";
import { exportDeckList, type EditableDeck } from "../deck-editor.js";
import {
  bindCatalogFilters,
  closeCatalogMenus,
  EMPTY_CATALOG_FILTER,
  matchesCatalogFilter,
  renderCatalogCard,
  renderCatalogCount,
  renderCatalogFilters,
  sortCatalogCards,
  type CatalogFilter,
  type CatalogSortKey,
} from "../catalog.js";
import { assetUrl } from "../assets.js";
import { escapeHtml } from "../card-text.js";
import { icon } from "../icons.js";
import { bindAppDialogDismissal, toggleAppDialog } from "../dialogs.js";
import { downloadText, valueOf } from "../dom.js";
import * as footer from "./footer.js";
import { GET_CARDS_DIALOG } from "./asset-gate.js";
import {
  createSwissEvent,
  eventComplete,
  losses,
  opponentWinRate,
  pendingAiTables,
  recordResult,
  roundComplete,
  standings,
  wins,
  yourOpponent,
  yourTable,
  swissPlayers,
  SWISS_ROUNDS,
  SWISS_ROUND_OPTIONS,
  YOU,
  type SwissEvent,
  type SwissTable,
} from "../swiss.js";
import type { Seat } from "../analytics.js";
import type { HeadlessTable } from "../swiss-tables.js";

/** What the lobby's Start leads to: one match, or a Swiss pod. */
export type SealedFormat = "single" | "swiss";

export interface SealedRun {
  readonly seed: string;
  readonly pool: SealedPool;
  readonly packsOpened: number;
  readonly opponentSeed: string;
  readonly opponentPool: SealedPool;
  readonly opponentPacksOpened: number;
  /** The player's deck in progress: card number to copy count. */
  deck: Record<string, number>;
  opponentController: Exclude<ControllerKind, "human">;
}

/** The sealed builder's state, reset each time a sealed run begins. */
export interface SealedState {
  run: SealedRun | null;
  /**
   * The expansion the lobby is set to. Outlives a run, the way the 1v1 lobby's
   * deck picks do, so coming back from a match reopens on the same boosters.
   */
  expansion: string;
  /** What the available pool is narrowed by: the two search boxes, the
      colours and the cost bounds. */
  filter: CatalogFilter;
  sort: CatalogSortKey;
  message: string;
  catalogScrollTop: number;
  format: SealedFormat;
  /** How many rounds a Swiss event entered from this run will last. */
  swissRounds: number;
  /** The Swiss event the run's deck is entered in, once it has started. */
  event: SwissEvent | null;
  /** The person's table whose match is on the board, until it is recorded. */
  playingTable: SwissTable | null;
}

/** The pieces this screen shares with the rest of the app: the shared
    dialogs, and navigation and match-launch it does not own. */
export interface SealedContext {
  renderCardDetailDialog(): string;
  bindCardDetailDialog(rerender: () => void): void;
  renderImportDialog(): string;
  bindImportDialog(
    hostRerender: () => void,
    onImported: (parsed: EditableDeck) => void,
  ): void;
  openImportDialog(): void;
  applyTheme(): void;
  beginMatch(config: MatchConfig): void;
  randomSeed(): string;
  /** Whether the System-1 scorer can pilot a seat; see `setup.ts`. */
  scorerAvailable(): boolean;
  /** Re-renders whichever sealed view (lobby or builder) is on screen. */
  rerender(): void;
  goHome(): void;
  /**
   * The pre-release page's set (`prerelease.ts`): the lobby opens that set's
   * packs and offers no other.
   */
  lockedExpansion?: string | null;
  /**
   * Plays AI-against-AI tables off the main thread, resolving each table's
   * winning seat (null at the action ceiling); see `swiss-tables.ts`.
   */
  /**
   * Whether the card art and text are in. The pre-release lobby shows itself
   * without them and asks for them, through {@link renderGetCards}, when the
   * player goes to play; the other sealed screens sit behind the app's gate.
   */
  cardsReady?(): boolean;
  /** The dialog that asks for the cards; see `renderDialog` in ./asset-gate.ts. */
  renderGetCards?(): string;
  bindGetCards?(): void;
  playTables(
    tables: readonly HeadlessTable[],
    seedPrefix: string,
    pilot: Exclude<ControllerKind, "human">,
  ): Promise<Array<Seat | null>>;
}

export function emptyState(): SealedState {
  return {
    run: null,
    expansion: DEFAULT_SEALED_EXPANSION,
    filter: { ...EMPTY_CATALOG_FILTER },
    sort: "cost",
    message: "",
    catalogScrollTop: 0,
    format: "single",
    swissRounds: SWISS_ROUNDS,
    event: null,
    playingTable: null,
  };
}

/**
 * The lobby's pick, falling back to the newest when the stored code names an
 * expansion this build no longer ships.
 *
 * Every build offers every expansion, the sealed-only demo included. That cut
 * used to be narrowed to one, because it base64'd its card art into a single
 * HTML file at roughly 20 MB a set; it now serves art beside the page like the
 * hosted build does (`artBesidePage` in `tools/build-web.ts`), so there is no
 * page-weight reason left to show a reader less than the app has.
 */
function currentExpansion(
  state: SealedState,
  locked?: string | null,
): SealedExpansion {
  const code = locked ?? state.expansion;
  return (
    SEALED_EXPANSIONS.find((expansion) => expansion.code === code) ??
    SEALED_EXPANSIONS.at(-1)!
  );
}

/**
 * The art key a booster pack's photo is stored under.
 *
 * A pseudo card number, so the pack photo rides the card-art path already in
 * place -- fetched into gitignored `local-art/` by `tools/download-deck-art.ts`,
 * inlined or copied beside the page by `tools/build-web.ts` -- rather than
 * needing a second one. `-PACK` cannot collide with a real card: every printed
 * number ends in three digits.
 */
export function packArtKey(expansion: SealedExpansion): string {
  return `${expansion.code}-PACK`;
}

/** The pack itself: the official photo where the build has it, the drawn pack
    in `styles/sealed.css` where it doesn't. */
function packImage(expansion: SealedExpansion): string {
  const art = assetUrl(packArtKey(expansion));
  return `<span class="booster-pack ${art ? "has-art" : ""}"${art ? ` style="--booster-art:url('${art}')"` : ""} aria-hidden="true">
    <span class="booster-pack-code">${escapeHtml(expansion.productCode)}</span>
  </span>`;
}

/**
 * Product code, what a run of it costs, and whether it is the newest, as the
 * pills that ride under an expansion's title in the picker's tiles.
 *
 * They are a comparison aid, so they live where expansions are compared. On
 * the chosen card there is one expansion and nothing to weigh it against: the
 * pack art prints the set code, and the button under it already says how many
 * packs are about to be opened.
 */
function tags(expansion: SealedExpansion, latest: boolean): string {
  return `<span class="booster-tags">
    <span class="booster-tag code">${escapeHtml(expansion.productCode)}</span>
    <span class="booster-tag">${SEALED_PACK_COUNT} packs &rarr; ${SEALED_DECK_SIZE} cards</span>
    ${latest ? `<span class="booster-tag latest">Newest set</span>` : ""}
  </span>`;
}

/**
 * The chosen expansion, as one card that is entirely the button that changes
 * it: the screen chooses one opaque thing before a single primary action, so
 * the choice and the control that changes it are the same surface.
 */
function boosterChoice(expansion: SealedExpansion, locked: boolean): string {
  if (locked)
    return `<div class="booster-choice">
    <span class="booster-choice-head">
      <strong>${escapeHtml(expansion.productCode)} pre-release</strong>
    </span>
    <span class="booster-choice-body">
      ${packImage(expansion)}
      <span class="booster-choice-swap">${SEALED_PACK_COUNT} packs, a ${SEALED_DECK_SIZE}-card deck, the rainbow Luffy leads it</span>
    </span>
  </div>`;
  return `<button class="booster-choice" type="button" data-open-booster-picker aria-haspopup="dialog">
    <span class="booster-choice-head">
      <strong>${escapeHtml(expansion.title)}</strong>
    </span>
    <span class="booster-choice-body">
      ${packImage(expansion)}
      <span class="booster-choice-swap">Pick a different expansion</span>
    </span>
  </button>`;
}

/** The grid the expansion is picked from: every booster sealed supports, as the
    pack it is sold in. Same modal the 1v1 lobby picks a deck in. */
function boosterPickerDialog(state: SealedState): string {
  const selected = currentExpansion(state).code;
  const tiles = SEALED_EXPANSIONS.map(
    (expansion) => `<button
      class="booster-tile${expansion.code === selected ? " picked" : ""}"
      type="button"
      data-pick-expansion="${escapeHtml(expansion.code)}"
      aria-pressed="${expansion.code === selected}"
    >
      ${packImage(expansion)}
      <span class="booster-tile-name">${escapeHtml(expansion.title)}</span>
      ${tags(expansion, expansion.code === DEFAULT_SEALED_EXPANSION)}
    </button>`,
  ).join("");
  return `<div class="app-dialog-backdrop" id="booster-picker" hidden>
    <div class="app-dialog deck-picker" role="dialog" aria-modal="true" aria-label="Booster expansion">
      <div class="app-dialog-head">
        <h2>Booster expansion</h2>
        <button class="text-button" type="button" data-close-dialog="booster-picker">${icon("x", "Close")}Close</button>
      </div>
      <div class="booster-picker-grid">${tiles}</div>
    </div>
  </div>`;
}

/** One match against one AI, or a Swiss event: the choice the lobby makes
    before any pack is opened, since it decides what Start leads to. */
function formatChoice(format: SealedFormat): string {
  const option = (value: SealedFormat, title: string, detail: string) =>
    `<label class="sealed-format-option${format === value ? " picked" : ""}">
      <input type="radio" name="sealed-format" value="${value}" ${format === value ? "checked" : ""} />
      <strong>${title}</strong><span>${detail}</span>
    </label>`;
  return `<fieldset class="sealed-format">
    <legend class="sr-only">Format</legend>
    ${option("single", "One match", "Build, then play one AI")}
    ${option("swiss", `Swiss, ${SWISS_ROUNDS} rounds`, `${swissPlayers(SWISS_ROUNDS)} players, paired by record`)}
  </fieldset>`;
}

/**
 * The pre-release page's lobby: the pack on the table and a button per Swiss
 * length. A pre-release is a Swiss event of sealed decks, so the length of the
 * event is the one choice left before the packs are opened.
 */
function renderPrereleaseLobby(
  expansion: SealedExpansion,
  ctx: SealedContext,
): string {
  const ready = ctx.cardsReady?.() ?? true;
  const buttons = SWISS_ROUND_OPTIONS.map(
    (rounds) =>
      `<button class="prerelease-rounds" type="button" data-swiss-rounds="${rounds}"><strong>${rounds}</strong><span>${rounds === 1 ? "round" : "rounds"}</span><small>${swissPlayers(rounds)} players</small></button>`,
  ).join("");
  // Until the cards are in, the way to get them leads: a player new to the
  // page has none, and a round button then opens the same dialog.
  const getCards = ready
    ? ""
    : `<button class="prerelease-get-cards" type="button" data-open-get-cards>${icon("bookmark-plus", "")}Get the card art and text first</button>`;
  return `<main class="setup-shell sealed-shell prerelease-lobby">
    <header class="setup-topbar">
      <button class="brand-home" type="button" id="sealed-home">
        <svg class="brand-mark small"><use href="#brand-hex" /></svg>
        <span class="setup-wordmark">Open OPTCG</span>
        <span class="sr-only">Home</span>
      </button>
    </header>
    <section class="prerelease-stage">
      ${packImage(expansion)}
      <h1>${escapeHtml(expansion.productCode)} pre-release</h1>
      <p>Open ${SEALED_PACK_COUNT} packs and build ${SEALED_DECK_SIZE} cards. Swiss runs until one player is unbeaten, so more rounds means a bigger field.</p>
      ${getCards}
      <div class="prerelease-round-buttons" role="group" aria-label="Swiss rounds">${buttons}</div>
    </section>
    ${footer.render()}
    ${ready ? "" : (ctx.renderGetCards?.() ?? "")}
  </main>`;
}

export function renderLobby(state: SealedState, ctx: SealedContext): string {
  const locked = Boolean(ctx.lockedExpansion);
  const expansion = currentExpansion(state, ctx.lockedExpansion);
  state.expansion = expansion.code;
  if (locked) return renderPrereleaseLobby(expansion, ctx);
  return `<main class="setup-shell sealed-shell">
    <header class="setup-topbar">
      <button class="brand-home" type="button" id="sealed-home">
        <svg class="brand-mark small"><use href="#brand-hex" /></svg>
        <span class="setup-wordmark">Open OPTCG</span>
        <span class="sr-only">Home</span>
      </button>
    </header>
    <form class="menu-card setup-form" id="sealed-form">
      ${boosterChoice(expansion, locked)}
      ${formatChoice(state.format)}
      <button class="primary wide" type="submit">${icon("sparkles", "Open packs")}Open ${SEALED_PACK_COUNT} packs</button>
      <button class="text-button wide" type="button" id="sealed-import">${icon("file-up", "Import a deck")}Import a ${SEALED_DECK_SIZE}-card list instead</button>
    </form>
    ${footer.render()}
    ${boosterPickerDialog(state)}
    ${ctx.renderImportDialog()}
  </main>`;
}

export function bindLobby(state: SealedState, ctx: SealedContext): void {
  footer.bind();
  document
    .querySelector("#sealed-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      startRun(state, ctx);
    });
  document
    .querySelectorAll<HTMLInputElement>("input[name=sealed-format]")
    .forEach((input) => {
      input.addEventListener("change", () => {
        state.format = input.value as SealedFormat;
        ctx.rerender();
      });
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-swiss-rounds]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (!(ctx.cardsReady?.() ?? true)) {
          toggleAppDialog(GET_CARDS_DIALOG, true);
          return;
        }
        state.format = "swiss";
        state.swissRounds = Number(button.dataset.swissRounds);
        startRun(state, ctx);
      });
    });
  document
    .querySelector("[data-open-get-cards]")
    ?.addEventListener("click", () => {
      toggleAppDialog(GET_CARDS_DIALOG, true);
    });
  ctx.bindGetCards?.();
  document.querySelectorAll("[data-open-booster-picker]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleAppDialog("booster-picker", true);
    });
  });
  document
    .querySelectorAll<HTMLElement>("[data-pick-expansion]")
    .forEach((tile) => {
      tile.addEventListener("click", () => {
        state.expansion = tile.dataset.pickExpansion!;
        // Picking an expansion changes the choice card's title, pills, pack and
        // brief, which is most of the screen -- cheaper to redraw it than to
        // patch it.
        toggleAppDialog("booster-picker", false);
        ctx.rerender();
      });
    });
  document.querySelector("#sealed-import")?.addEventListener("click", () => {
    ctx.openImportDialog();
    ctx.rerender();
  });
  ctx.bindImportDialog(
    () => {
      ctx.rerender();
    },
    (parsed) => {
      startRunFromImport(state, ctx, parsed);
    },
  );
  document.querySelector("#sealed-home")?.addEventListener("click", () => {
    ctx.goHome();
  });
  bindAppDialogDismissal();
}

/**
 * The strongest pilot this build can actually offer, which is the same
 * reasoning the 1v1 lobby's default follows: the learned model where the build
 * carries one, the heuristic agent otherwise.
 *
 * Exported because a run started while the capability probe was still in
 * flight has to be re-answered when it lands, and the answer must not drift
 * from the one a fresh run gets.
 */
export function strongestPilot(
  ctx: Pick<SealedContext, "scorerAvailable">,
): Exclude<ControllerKind, "human"> {
  return ctx.scorerAvailable() ? "scorer" : "rules";
}

export function beginRun(
  state: SealedState,
  ctx: SealedContext,
  pool: SealedPool,
  packsOpened: number,
  deck: Record<string, number>,
  message = "",
): void {
  const opponentSeed = ctx.randomSeed();
  // The AI opens the player's expansion, not the lobby's: an imported list can
  // be filed under a set the lobby is not currently showing, and a sealed match
  // is two pools from the same boosters or it is not sealed.
  const { pool: opponentPool, packsOpened: opponentPacksOpened } =
    openSealedPool(opponentSeed, pool.expansion);
  state.run = {
    seed: pool.seed,
    pool,
    packsOpened,
    opponentSeed,
    opponentPool,
    opponentPacksOpened,
    deck,
    opponentController: strongestPilot(ctx),
  };
  state.event = null;
  state.playingTable = null;
  state.filter = { ...EMPTY_CATALOG_FILTER };
  closeCatalogMenus();
  state.message = message;
  state.catalogScrollTop = 0;
  ctx.applyTheme();
  ctx.rerender();
}

function startRun(state: SealedState, ctx: SealedContext): void {
  const { pool, packsOpened } = openSealedPool(
    ctx.randomSeed(),
    currentExpansion(state, ctx.lockedExpansion).code,
  );
  beginRun(state, ctx, pool, packsOpened, {});
}

/**
 * "Import a deck" bypasses booster opening entirely: the imported list
 * becomes both the deck and the pool it was drawn from (see
 * `poolFromDeckList`), so `validateSealedDeck` only ever rejects it for the
 * ordinary reasons -- wrong card count, an unknown or unimplemented card --
 * never for exceeding what was opened.
 */
function startRunFromImport(
  state: SealedState,
  ctx: SealedContext,
  parsed: EditableDeck,
): void {
  if (parsed.leader !== SEALED_LEADER) {
    throw new Error(
      `A sealed deck list must include exactly "1x ${SEALED_LEADER}" as its Leader.`,
    );
  }
  // Filed under the expansion the list is mostly from rather than the lobby's
  // pick, since the list is its own pool and the lobby's boosters had no part
  // in it. That is also what the AI's pool is then opened from.
  const expansion = expansionOfDeckList(parsed.cards);
  const pool = poolFromDeckList(parsed.cards, expansion);
  const validation = validateSealedDeck({ cards: parsed.cards }, pool);
  if (validation.errors.length) throw new Error(validation.errors.join(" "));
  state.expansion = expansion;
  beginRun(state, ctx, pool, 0, { ...parsed.cards }, "Deck list imported.");
}

/** Corrects a run's opponent controller if it names one this build can't
    offer -- called before every render, since a learned model fetched after
    the page drew can fail to arrive after the run began. */
export function normalizeOpponentController(
  state: SealedState,
  ctx: SealedContext,
): void {
  if (!state.run) return;
  if (!ctx.scorerAvailable() && state.run.opponentController === "scorer")
    state.run.opponentController = "rules";
}

export function renderBuilder(state: SealedState, ctx: SealedContext): string {
  if (!state.run) return "";
  const run = state.run;
  const validation = validateSealedDeck({ cards: run.deck }, run.pool);
  const playable = playablePoolCards(run.pool);
  const opened = poolCounts(run.pool);
  const poolCards = sortCatalogCards(
    [...playable.keys()].map((cardNumber) => requireKnownCard(cardNumber)),
    state.sort,
  );
  const deckCards = poolCards.filter(
    (card) => (run.deck[card.cardNumber] ?? 0) > 0,
  );
  // The pool shows every card opened, in the deck or not, so a card stays
  // where it was found while copies move in and out of the deck above it.
  const availableCards = poolCards.filter((card) =>
    matchesCatalogFilter(card, state.filter),
  );
  const renderQuantity = (card: CardDefinition): string => {
    const quantity = run.deck[card.cardNumber] ?? 0;
    const max = opened.get(card.cardNumber) ?? 0;
    return `<article class="catalog-card ${quantity ? "in-deck" : ""}" data-colors="${card.colors?.join(" ") ?? ""}">
      <button class="game-card catalog-card-face ${assetUrl(card.cardNumber) ? "has-art" : ""}" style="--card-color:var(--${card.colors?.[0]?.toLowerCase() ?? "neutral"})${assetUrl(card.cardNumber) ? `;--card-art:url('${assetUrl(card.cardNumber)}')` : ""}" data-inspect-card="${card.cardNumber}" aria-label="View ${escapeHtml(card.name)} details">
        <span class="card-top"><b>${card.cost ?? "L"}</b><small>${card.cardNumber}</small></span>
        <strong>${escapeHtml(card.name)}</strong>
      </button>
      <div class="catalog-card-caption"><span class="catalog-card-meta"><span class="card-number">${card.cardNumber}</span><span class="card-pool-count" title="${max} opened from your pool">×${max}</span></span><strong>${escapeHtml(card.name)}</strong></div>
      <div class="quantity-control"><button data-sealed-decrease="${card.cardNumber}" title="Remove ${escapeHtml(card.name)}" ${quantity === 0 ? "disabled" : ""}>${icon("minus", "Remove one")}</button><output>${quantity}</output><button data-sealed-increase="${card.cardNumber}" title="Add ${escapeHtml(card.name)}" ${quantity >= max ? "disabled" : ""}>${icon("plus", "Add one")}</button></div>
    </article>`;
  };
  const expansion = requireSealedExpansion(run.pool.expansion);
  const packNote = (label: string, packsOpened: number): string =>
    packsOpened > SEALED_PACK_COUNT
      ? `<p class="sealed-pack-note">${label}: opened ${packsOpened} packs, not ${SEALED_PACK_COUNT} -- ${escapeHtml(expansion.code)} card coverage isn't complete yet, so the default draw couldn't reach ${SEALED_DECK_SIZE} playable cards on its own.</p>`
      : "";
  const sealedLeader = requireKnownCard(SEALED_LEADER);
  return `<main class="deck-editor-shell">
    <header class="deck-editor-header"><button class="text-button" id="sealed-builder-back">${icon("arrow-left", "Back")}Back</button><div><p class="eyebrow">${escapeHtml(expansion.productCode)} sealed &middot; ${escapeHtml(expansion.title)}</p><h1>Build your deck</h1></div><div class="deck-count ${validation.cardCount === SEALED_DECK_SIZE ? "valid" : ""}"><b>${validation.cardCount}</b><span>/ ${SEALED_DECK_SIZE} cards</span></div></header>
    <aside class="deck-editor-tools">
      <div class="editor-leader-card">${renderCatalogCard(sealedLeader, 0, false)}<div class="leader-summary"><span>All colours</span><strong>${escapeHtml(sealedLeader.name)}</strong></div></div>
      ${packNote("Your pool", run.packsOpened)}
      <button class="secondary wide" id="sealed-auto-build">${icon("sparkles", "Auto-build")}Auto-build a deck</button>
      <button class="secondary wide" id="sealed-export">${icon("download", "Export deck list")}Export deck list</button>
      <div class="deck-rule-status ${validation.errors.length ? "invalid" : "valid"}"><strong>${validation.errors.length ? "Deck needs attention" : "Ready to play"}</strong>${validation.errors.length ? `<ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : `<p>${SEALED_DECK_SIZE} cards, all from your opened pool.</p>`}</div>
      ${packNote("Opponent's pool", run.opponentPacksOpened)}
      <button class="primary wide" id="sealed-start" ${validation.errors.length ? "disabled" : ""}>${state.format === "swiss" ? `${icon("swords", "Enter the event")}Enter the event` : `${icon("play", "Start match")}Start match`}</button>
      ${state.message ? `<p class="editor-message">${escapeHtml(state.message)}</p>` : ""}
    </aside>
    <section class="card-catalog">
      <section class="deck-card-section"><div class="catalog-heading"><div><p class="eyebrow">Current deck</p><h2>${deckCards.length} unique cards</h2></div></div>
        <div class="catalog-list deck-card-list">${deckCards.map((card) => renderQuantity(card)).join("")}</div>
      </section>
      <section class="pool-card-section"><div class="catalog-heading">${renderCatalogFilters("sealed", state.filter, state.sort, poolCards)}${renderCatalogCount(availableCards.length, poolCards.length, state.filter)}</div>
        <div class="catalog-list pool-card-list">${availableCards.map((card) => renderQuantity(card)).join("") || `<p class="catalog-empty">No cards in your pool match these filters.</p>`}</div>
      </section>
    </section>
    ${ctx.renderCardDetailDialog()}
  </main>`;
}

export function bindBuilder(state: SealedState, ctx: SealedContext): void {
  document
    .querySelector("#sealed-builder-back")
    ?.addEventListener("click", () => {
      state.run = null;
      ctx.goHome();
    });
  document.querySelector("#sealed-export")?.addEventListener("click", () => {
    if (state.run) {
      downloadText(
        `open-optcg-sealed-${state.run.pool.expansion}-deck.txt`,
        exportDeckList({ leader: SEALED_LEADER, cards: state.run.deck }),
      );
    }
  });
  ctx.bindCardDetailDialog(() => {
    ctx.rerender();
  });
  document
    .querySelector("#sealed-auto-build")
    ?.addEventListener("click", () => {
      if (!state.run) return;
      state.run.deck = { ...autoBuildSealedDeckBest(state.run.pool).cards };
      ctx.rerender();
    });
  bindCatalogFilters("sealed", state.filter, () => {
    ctx.rerender();
  });
  document.querySelector("#sealed-sort")?.addEventListener("change", () => {
    state.sort = valueOf("sealed-sort") as CatalogSortKey;
    ctx.rerender();
  });
  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-sealed-increase], [data-sealed-decrease]",
    )
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (!state.run) return;
        const cardNumber =
          button.dataset.sealedIncrease ?? button.dataset.sealedDecrease!;
        const delta = button.dataset.sealedIncrease ? 1 : -1;
        const max = poolCounts(state.run.pool).get(cardNumber) ?? 0;
        const next = (state.run.deck[cardNumber] ?? 0) + delta;
        if (next > 0 && next <= max) state.run.deck[cardNumber] = next;
        else if (next <= 0) {
          state.run.deck = Object.fromEntries(
            Object.entries(state.run.deck).filter(
              ([existing]) => existing !== cardNumber,
            ),
          );
        }
        ctx.rerender();
      });
    });
  document.querySelector("#sealed-start")?.addEventListener("click", () => {
    if (state.format === "swiss") enterEvent(state, ctx);
    else startMatch(state, ctx);
  });
}

export function startMatch(state: SealedState, ctx: SealedContext): void {
  if (!state.run) return;
  const run = state.run;
  if (validateSealedDeck({ cards: run.deck }, run.pool).errors.length) return;
  const p1 = sealedDeckManifest({ cards: run.deck }, run.pool);
  const opponentDeck = autoBuildSealedDeckBest(run.opponentPool);
  launchMatch(
    state,
    ctx,
    p1,
    sealedDeckManifest(opponentDeck, run.opponentPool),
  );
}

function launchMatch(
  state: SealedState,
  ctx: SealedContext,
  p1: DeckManifest,
  p2: DeckManifest,
): void {
  const run = state.run!;
  const config = newLocalMatch({
    p1Deck: p1.id,
    p2Deck: p2.id,
    p1CustomDeck: p1,
    p2CustomDeck: p2,
    p1Controller: "human",
    p2Controller: run.opponentController,
    seed: ctx.randomSeed(),
    startingPlayer: "random",
  });
  ctx.beginMatch(config);
}

/* --- The Swiss event ------------------------------------------------------- */

/** Enters the built deck in a new event and opens its first round. */
function enterEvent(state: SealedState, ctx: SealedContext): void {
  if (!state.run) return;
  const run = state.run;
  if (validateSealedDeck({ cards: run.deck }, run.pool).errors.length) return;
  state.event = createSwissEvent(
    ctx.randomSeed(),
    run.pool,
    run.deck,
    state.swissRounds,
  );
  state.playingTable = null;
  playAiTables(state, ctx);
  ctx.rerender();
}

/**
 * Plays the current round's AI-against-AI tables and records them as they
 * come in. Under the learned model when it is the opponent; the rules agents
 * stand in when the model cannot be run in the worker, so a round is never
 * left unplayed.
 */
function playAiTables(state: SealedState, ctx: SealedContext): void {
  const event = state.event;
  if (!event) return;
  const tables = pendingAiTables(event);
  if (!tables.length) return;
  const round = event.rounds.length;
  const pilot = state.run?.opponentController ?? "rules";
  const headless = tables.map((table) => ({
    first: event.players[table.a]!.deck,
    second: event.players[table.b]!.deck,
  }));
  const seedPrefix = `${event.seed}:round-${round}`;
  const record = (results: Array<Seat | null>) => {
    if (state.event !== event) return;
    results.forEach((winner, index) => {
      const table = tables[index]!;
      settle(
        state,
        ctx,
        table,
        winner === "first" ? table.a : winner === "second" ? table.b : -1,
      );
    });
    // The person may be mid-match: the board is theirs until they leave it,
    // and the event screen picks the results up then.
    if (!state.playingTable) ctx.rerender();
  };
  ctx
    .playTables(headless, seedPrefix, pilot)
    .catch(() =>
      pilot === "rules"
        ? Promise.reject(new Error("The other tables could not be played."))
        : ctx.playTables(headless, seedPrefix, "rules"),
    )
    .then(record, (error: unknown) => {
      if (state.event !== event) return;
      state.message = error instanceof Error ? error.message : String(error);
      if (!state.playingTable) ctx.rerender();
    });
}

/** Records one table and, when that pairs a new round, starts its AI tables. */
function settle(
  state: SealedState,
  ctx: SealedContext,
  table: SwissTable,
  winner: number,
): void {
  if (!state.event || table.winner !== null) return;
  if (recordResult(state.event, table, winner)) playAiTables(state, ctx);
}

/** Puts the person's table of the current round on the board. */
function playRound(state: SealedState, ctx: SealedContext): void {
  const event = state.event;
  if (!event || eventComplete(event)) return;
  const table = yourTable(event);
  if (table.winner !== null) return;
  state.playingTable = table;
  launchMatch(
    state,
    ctx,
    event.players[YOU]!.deck,
    event.players[yourOpponent(event)]!.deck,
  );
}

/**
 * Whether a Swiss round's match is the one on the board, so leaving it goes
 * back to the event rather than home.
 */
export function playingEventRound(state: SealedState): boolean {
  return state.event !== null && state.playingTable !== null;
}

/**
 * Records the person's match: a win when their seat (p1) won it, a loss
 * otherwise -- leaving a round's match before it ends concedes it, as at a
 * table.
 */
export function finishRound(
  state: SealedState,
  ctx: SealedContext,
  winner: "p1" | "p2" | null,
): void {
  const table = state.playingTable;
  state.playingTable = null;
  if (!state.event || !table) return;
  const opponent = table.a === YOU ? table.b : table.a;
  settle(state, ctx, table, winner === "p1" ? YOU : opponent);
}

function record(event: SwissEvent, seat: number): string {
  return `${wins(event, seat)}&ndash;${losses(event, seat)}`;
}

function tableResult(event: SwissEvent, table: SwissTable): string {
  const name = (seat: number) =>
    `<span class="${seat === YOU ? "you" : ""}">${escapeHtml(event.players[seat]!.name)}</span>`;
  const outcome =
    table.winner === null
      ? `<span class="swiss-pending">playing</span>`
      : table.winner === -1
        ? `<span class="swiss-pending">no winner</span>`
        : `${escapeHtml(event.players[table.winner]!.name)} won`;
  return `<li>${name(table.a)} <span class="swiss-vs">vs</span> ${name(table.b)} <span class="swiss-outcome">${outcome}</span></li>`;
}

export function renderEvent(state: SealedState): string {
  const event = state.event;
  if (!event) return "";
  const expansion = requireSealedExpansion(event.expansion);
  const done = eventComplete(event);
  const roundNumber = event.rounds.length;
  const mine = yourTable(event);
  const ranking = standings(event);
  const place = ranking.indexOf(YOU) + 1;
  const waitingOnOthers =
    mine.winner !== null && !roundComplete(event.rounds.at(-1)!);
  const headline = done
    ? `You finished ${place}${ordinal(place)} of ${event.players.length}, ${record(event, YOU)}`
    : `Round ${roundNumber} of ${event.roundCount}`;
  const action = done
    ? `<button class="primary wide" id="swiss-new">${icon("sparkles", "New event")}Open new packs</button>`
    : waitingOnOthers
      ? `<p class="swiss-note">Waiting for the other tables to finish round ${roundNumber}&hellip;</p>`
      : `<p class="swiss-note">Your table: <strong>${escapeHtml(event.players[yourOpponent(event)]!.name)}</strong> (${record(event, yourOpponent(event))})</p>
         <button class="primary wide" id="swiss-play">${icon("play", "Play round")}Play round ${roundNumber}</button>
         <p class="swiss-note small">Leaving a match before it ends concedes it.</p>`;
  const rows = ranking
    .map(
      (seat, index) =>
        `<tr class="${seat === YOU ? "you" : ""}"><td>${index + 1}</td><td>${escapeHtml(event.players[seat]!.name)}</td><td>${record(event, seat)}</td><td>${(opponentWinRate(event, seat) * 100).toFixed(0)}%</td></tr>`,
    )
    .join("");
  const rounds = event.rounds
    .map(
      (round, index) =>
        `<section class="swiss-round"><h3>Round ${index + 1}</h3><ul>${round.map((table) => tableResult(event, table)).join("")}</ul></section>`,
    )
    .reverse()
    .join("");
  return `<main class="setup-shell sealed-shell swiss-shell">
    <header class="setup-topbar">
      <button class="text-button" type="button" id="swiss-leave">${icon("arrow-left", "Leave the event")}Leave the event</button>
    </header>
    <section class="menu-card swiss-card">
      <p class="eyebrow">${escapeHtml(expansion.productCode)} sealed &middot; Swiss</p>
      <h1>${headline}</h1>
      ${action}
      ${state.message ? `<p class="editor-message">${escapeHtml(state.message)}</p>` : ""}
      <table class="swiss-standings">
        <thead><tr><th>#</th><th>Player</th><th>Record</th><th title="Opponents' win rate">OMW</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${rounds}
    </section>
    ${footer.render()}
  </main>`;
}

function ordinal(place: number): string {
  return place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th";
}

export function bindEvent(state: SealedState, ctx: SealedContext): void {
  footer.bind();
  document.querySelector("#swiss-play")?.addEventListener("click", () => {
    playRound(state, ctx);
  });
  const leave = () => {
    state.event = null;
    state.playingTable = null;
    state.run = null;
    state.message = "";
    ctx.goHome();
  };
  document.querySelector("#swiss-new")?.addEventListener("click", leave);
  document.querySelector("#swiss-leave")?.addEventListener("click", leave);
}
