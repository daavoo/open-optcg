import type { CardDefinition } from "@one-piece-sim/cards";
import { requireKnownCard } from "@one-piece-sim/cards";
import {
  autoBuildSealedDeckGrape,
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
  catalogFilterIsEmpty,
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
}

export function emptyState(): SealedState {
  return {
    run: null,
    expansion: DEFAULT_SEALED_EXPANSION,
    filter: { ...EMPTY_CATALOG_FILTER },
    sort: "cost",
    message: "",
    catalogScrollTop: 0,
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
function currentExpansion(state: SealedState): SealedExpansion {
  return (
    SEALED_EXPANSIONS.find((expansion) => expansion.code === state.expansion) ??
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
function boosterChoice(expansion: SealedExpansion): string {
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

export function renderLobby(state: SealedState, ctx: SealedContext): string {
  const expansion = currentExpansion(state);
  state.expansion = expansion.code;
  return `<main class="setup-shell sealed-shell">
    <header class="setup-topbar">
      <button class="brand-home" type="button" id="sealed-home">
        <svg class="brand-mark small"><use href="#brand-hex" /></svg>
        <span class="setup-wordmark">Open OPTCG</span>
        <span class="sr-only">Home</span>
      </button>
    </header>
    <form class="menu-card setup-form" id="sealed-form">
      ${boosterChoice(expansion)}
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
    currentExpansion(state).code,
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
  // What the filters are narrowing: everything opened that the deck has not
  // already taken every copy of.
  const undrafted = poolCards.filter(
    (card) =>
      (opened.get(card.cardNumber) ?? 0) - (run.deck[card.cardNumber] ?? 0) > 0,
  );
  const availableCards = undrafted.filter((card) =>
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
      <label>Opponent controller
        <select id="p2-controller">
          <option value="rules" ${run.opponentController === "rules" ? "selected" : ""}>Heuristics</option>
          ${
            ctx.scorerAvailable()
              ? `<option value="scorer" ${run.opponentController === "scorer" ? "selected" : ""}>Learned model</option>`
              : ""
          }
        </select>
      </label>
      ${packNote("Opponent's pool", run.opponentPacksOpened)}
      <button class="primary wide" id="sealed-start" ${validation.errors.length ? "disabled" : ""}>${icon("play", "Start match")}Start match</button>
      ${state.message ? `<p class="editor-message">${escapeHtml(state.message)}</p>` : ""}
    </aside>
    <section class="card-catalog">
      <section class="deck-card-section"><div class="catalog-heading"><div><p class="eyebrow">Current deck</p><h2>${deckCards.length} unique cards</h2></div></div>
        <div class="catalog-list deck-card-list">${deckCards.map((card) => renderQuantity(card)).join("")}</div>
      </section>
      <section class="pool-card-section"><div class="catalog-heading">${renderCatalogFilters("sealed", state.filter, state.sort, poolCards)}${renderCatalogCount(availableCards.length, undrafted.length, state.filter)}</div>
        <div class="catalog-list pool-card-list">${availableCards.map((card) => renderQuantity(card)).join("") || `<p class="catalog-empty">${catalogFilterIsEmpty(state.filter) ? "Every card you opened is already in the deck." : "No available cards match these filters."}</p>`}</div>
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
  document.querySelector("#p2-controller")?.addEventListener("change", () => {
    if (state.run) {
      state.run.opponentController = valueOf("p2-controller") as Exclude<
        ControllerKind,
        "human"
      >;
    }
    ctx.rerender();
  });
  document
    .querySelector("#sealed-auto-build")
    ?.addEventListener("click", () => {
      if (!state.run) return;
      state.run.deck = { ...autoBuildSealedDeckGrape(state.run.pool).cards };
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
    startMatch(state, ctx);
  });
}

export function startMatch(state: SealedState, ctx: SealedContext): void {
  if (!state.run) return;
  const run = state.run;
  if (validateSealedDeck({ cards: run.deck }, run.pool).errors.length) return;
  const p1 = sealedDeckManifest({ cards: run.deck }, run.pool);
  const opponentDeck = autoBuildSealedDeckGrape(run.opponentPool);
  const p2 = sealedDeckManifest(opponentDeck, run.opponentPool);
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
