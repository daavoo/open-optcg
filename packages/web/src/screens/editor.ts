import type { PlayerId } from "@one-piece-sim/protocol";
import type { DeckFormat } from "@one-piece-sim/cards";
import {
  cardsForLeader,
  deckAnalytics,
  exportDeckList,
  supportedLeaders,
  toManifest,
  validateDeck,
  type DeckAnalytics,
  type EditableDeck,
} from "../deck-editor.js";
import { deckDisplayName, type SavedDeck } from "../deck-labels.js";
import {
  DOSSIER_DECK_IDS,
  dossierDeckIdsForLeader,
} from "@one-piece-sim/agents/llm-dossiers";
import {
  bindCatalogFilters,
  catalogFilterIsEmpty,
  matchesCatalogFilter,
  renderCatalogCard,
  renderCatalogCount,
  renderCatalogFilters,
  sortCatalogCards,
  type CatalogFilter,
  type CatalogSortKey,
} from "../catalog.js";
import { assetSummary, assetUrl } from "../assets.js";
import { escapeHtml } from "../card-text.js";
import { icon } from "../icons.js";
import { downloadText, valueOf } from "../dom.js";
import { deckLabel, renderDeckLeaderPreview } from "../deck-select.js";
import { SELECTABLE_DECK_IDS, deckManifests } from "@one-piece-sim/decks";

/** The deck editor's state, reset each time it's opened. */
export interface EditorState {
  /** Whose deck the editor is currently editing. */
  target: PlayerId | null;
  /**
   * Where in the editor's opening sequence the player is. A deck started from
   * nothing has no card pool until it has a Leader, and the two ways of
   * getting one -- pick a Leader, or copy a shipped deck -- are different
   * enough that they are asked as a choice ("choose") before either selector
   * ("leader", "base") is shown. "edit" is the editor itself, and where a deck
   * opened with a Leader already starts.
   */
  stage: EditorStage;
  deck: EditableDeck | null;
  /** What the available pool is narrowed by: the two search boxes, the
      colours and the cost bounds. */
  filter: CatalogFilter;
  sort: CatalogSortKey;
  message: string;
  /** The name the deck will be saved under, as typed into the save dialog. */
  deckName: string;
  /** The saved deck this editor session is editing, if it already exists. */
  savedDeckId: string | null;
  /**
   * The shipped deck whose dossier the LLM opponent should pilot this list
   * with, as the save dialog currently has it. Null while the player has not
   * touched the control, which is not the same as "none": null follows the
   * Leader, and the empty string is an explicit no dossier.
   */
  dossier: string | null;
  catalogScrollTop: number;
  /** Whether the Leader grid is open over the editor, to change the Leader
      of a deck that already has one. A deck with none is asked through
      {@link stage} instead. */
  leaderDialogOpen: boolean;
  /** Whether the save dialog is open, asking what to call this deck. */
  nameDialogOpen: boolean;
  /** What the save dialog has to say about the name it was given. */
  nameMessage: string;
  /**
   * The name the player was warned already belongs to another saved deck, and
   * so the one whose next save replaces that deck. Null until a save clashes;
   * a different name typed after the warning clashes (or not) afresh.
   */
  replaceConfirmedFor: string | null;
  /**
   * Whether the deck overview panel is expanded.
   *
   * Open to start with: the curve and the Counter split are what a builder
   * checks after every change, and a panel that has to be opened to be read is
   * one nobody reads. Held in state rather than left to `<details>` so it
   * survives the editor's full re-render on each card added.
   */
  overviewOpen: boolean;
}

export type EditorStage = "choose" | "leader" | "base" | "edit";

/** The pieces this screen shares with the rest of the app: cross-screen
    state it mutates in place, and the shared UI primitives, persistence, and
    navigation it does not own. */
export interface EditorContext {
  savedDecks: Record<string, SavedDeck>;
  setupDecks: Record<PlayerId, string>;
  renderCardDetailDialog(): string;
  bindCardDetailDialog(rerender: () => void): void;
  clearCardDetail(): void;
  renderImportDialog(): string;
  bindImportDialog(
    hostRerender: () => void,
    onImported: (parsed: EditableDeck) => void,
  ): void;
  openImportDialog(): void;
  nextCustomDeckId(): string;
  persistSavedDecks(): void;
  /** Drops any simulated analytics games played by the deck under this id --
      a save can replace what that id means. */
  forgetSimulatedFor(deckId: string): void;
  /** Re-renders the page in place: render → hydrate icons → bind → theme. */
  rerender(): void;
  goToSetup(): void;
}

/** The mat theme while editing: the deck's own Leader colours, with no
    opponent to theme against -- unlike {@link applyTheme} elsewhere. */
export function editorTheme(state: EditorState): {
  theme: string;
  secondaryTheme: string;
} {
  const leader = supportedLeaders.find(
    (card) => card.cardNumber === state.deck?.leader,
  );
  const colors = leader?.colors?.map((color) => color.toLowerCase()) ?? ["red"];
  const theme = colors[0] ?? "red";
  return { theme, secondaryTheme: colors[1] ?? theme };
}

export function render(state: EditorState, ctx: EditorContext): string {
  if (!state.target || !state.deck) return "";
  if (state.stage !== "edit") return renderStart(state, ctx);
  const validation = validateDeck(state.deck);
  const leader = supportedLeaders.find(
    (card) => card.cardNumber === state.deck!.leader,
  );
  const pool = cardsForLeader(state.deck.leader);
  const supportedCards = sortCatalogCards(pool, state.sort);
  const deckCards = supportedCards.filter(
    (card) => (state.deck!.cards[card.cardNumber] ?? 0) > 0,
  );
  const poolCards = supportedCards.filter(
    (card) =>
      !state.deck!.cards[card.cardNumber] &&
      matchesCatalogFilter(card, state.filter),
  );
  const leaderCard = leader ? renderCatalogCard(leader, 0, false) : "";
  return `<main class="deck-editor-shell">
    <header class="deck-editor-header"><button class="text-button" id="editor-back">${icon("arrow-left", "Back")}Back</button><div><h1>Deck editor</h1></div><div class="deck-editor-verdict"><div class="deck-rule-status ${validation.errors.length ? "invalid" : "valid"}"><strong>${validation.errors.length ? "Deck needs attention" : "Ready to play"}</strong>${validation.errors.length ? `<ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : `<p>50 cards, legal copies, Leader colors match, and every printing is legal in ${validation.format === "standard" ? "Standard" : "Extra Regulation"}.</p>`}</div><div class="deck-count ${validation.cardCount === 50 ? "valid" : ""}"><b>${validation.cardCount}</b><span>/ 50 cards</span></div>${renderFormatSelect(validation.format)}</div></header>
    <aside class="deck-editor-tools">
      <div class="editor-leader-card">${leaderCard || `<div class="deck-select-preview empty"></div>`}<div class="leader-summary"><span>${leader?.colors?.join(" / ") ?? "No color"}</span><strong>${escapeHtml(leader?.name ?? "Choose a Leader")}</strong></div></div>
      <button class="secondary wide" id="open-leader-picker">${icon("crown", "Choose a Leader")}${leader ? "Change Leader" : "Choose a Leader"}</button>
      <div class="editor-tool-row"><button class="secondary" id="open-import">${icon("file-up", "Import a deck list")}Import</button><button class="secondary" id="export-list">${icon("download", "Export deck list")}Export</button></div>
      ${state.message ? `<p class="editor-message">${escapeHtml(state.message)}</p>` : ""}
      <button class="primary wide" id="save-custom" ${validation.errors.length ? "disabled" : ""}>${icon("save", "Save this deck")}Save this deck</button>
      ${renderOverview(state.deck, state.overviewOpen)}
    </aside>
    <section class="card-catalog">
      <section class="deck-card-section"><div class="catalog-heading"><div><p class="eyebrow">Current deck</p><h2>${deckCards.length} unique cards</h2></div></div>
        <div class="catalog-list deck-card-list">${deckCards
          .map((card) => {
            const quantity = state.deck!.cards[card.cardNumber] ?? 0;
            return renderCatalogCard(card, quantity);
          })
          .join("")}</div>
      </section>
      <section class="pool-card-section"><div class="catalog-heading">${renderCatalogFilters("card", state.filter, state.sort, pool)}${renderCatalogCount(poolCards.length, pool.length - deckCards.length, state.filter)}</div>
        ${renderTextSearchNote(state)}
        <div class="catalog-list pool-card-list">${poolCards.map((card) => renderCatalogCard(card, 0)).join("") || `<p class="catalog-empty">${catalogFilterIsEmpty(state.filter) ? "Every card in this pool is already in the deck." : "No available cards match these filters."}</p>`}</div>
      </section>
    </section>
    ${renderLeaderDialog(state)}
    ${renderNameDialog(state)}
    ${ctx.renderCardDetailDialog()}
    ${ctx.renderImportDialog()}
  </main>`;
}

/** Thousands-separated, so a four-figure Counter total reads as one. */
function grouped(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * What kind of deck this is, beside the cards that make it one.
 *
 * In the tools column rather than a dialog: these are the numbers a builder
 * reacts to while adding and removing cards, and a modal would make checking
 * them a round trip away from the catalog they are about.
 *
 * It answers three archetype questions and refuses the rest. How fast is it --
 * the curve, which is the one picture here and earns the space. How much does
 * it hold back -- the Counter values and the Counter events, which is the
 * difference between a deck that races and one that survives. How focused is
 * it -- what shares the Leader's types or names it, which separates an
 * archetype from a pile of good cards. Everything a builder would read card by
 * card is the deck list two columns to the right; the quiet footer carries the
 * rest as a line of prose rather than a fourth grid of tiles competing with
 * the three that matter.
 *
 * Collapsible, and below the save button, so a short screen still opens on the
 * controls.
 */
function renderOverview(deck: EditableDeck, open: boolean): string {
  const analytics = deckAnalytics(deck);
  return `<section class="deck-overview">
    <button class="deck-overview-toggle" type="button" id="toggle-overview" aria-expanded="${open}" aria-controls="deck-overview-body">
      ${icon("chevron-down", open ? "Hide the deck overview" : "Show the deck overview")}
      <span class="eyebrow">Deck overview</span>
      <span class="deck-overview-average">${analytics.total ? `avg cost ${analytics.averageCost.toFixed(1)}` : "empty"}</span>
    </button>
    <div class="deck-overview-body" id="deck-overview-body" ${open ? "" : "hidden"}>
      ${renderCostCurve(analytics)}
      ${renderOverviewBlock(
        "Counters",
        [
          ["+1000", analytics.counters.plus1000],
          ["+2000", analytics.counters.plus2000],
          ["Events", analytics.counterEvents],
        ],
        `${grouped(analytics.counterPower)} held`,
      )}
      ${renderLeaderSynergy(analytics)}
      ${renderOverviewFooter(analytics)}
    </div>
  </section>`;
}

/**
 * How much of the deck is built around the Leader rather than merely legal
 * beside it.
 *
 * The type count is the archetype question asked plainly: a tribal list reads
 * 50 of 50, and a pile of colour-legal good cards reads single figures. The
 * name count is the same question for the archetypes Bandai wrote by card
 * name instead of by type, and it is dropped rather than shown as a zero,
 * which is what it is for most decks. The Leader's own types sit in the
 * caption because neither figure means anything without them.
 */
function renderLeaderSynergy(analytics: DeckAnalytics): string {
  if (!analytics.leaderTypes.length) return "";
  const rows: (readonly [string, number])[] = [
    ["Shares a type", analytics.sharedType],
  ];
  if (analytics.named) rows.push(["Named", analytics.named]);
  return renderOverviewBlock(
    "Built around your Leader",
    rows,
    analytics.leaderTypes.join(" · "),
    true,
  );
}

/**
 * The figures worth having but not worth a tile: what the deck is made of, and
 * -- for a two-coloured Leader only -- how the list splits between its colours,
 * which is a real question for those decks and no question at all for the rest.
 */
function renderOverviewFooter(analytics: DeckAnalytics): string {
  const { character, event, stage } = analytics.categories;
  const mix = [
    [character, "Characters"],
    [event, "Events"],
    [stage, "Stages"],
    [analytics.blockers, "Blockers"],
    [analytics.triggers, "Triggers"],
  ] as const;
  const split =
    analytics.colors.length > 1
      ? analytics.colors.map(
          ({ color, count }) => [count, color] as readonly [number, string],
        )
      : [];
  const line = (parts: readonly (readonly [number, string])[]) =>
    parts
      .map(
        ([count, label]) => `<span><b>${count}</b> ${escapeHtml(label)}</span>`,
      )
      .join("");
  return `<p class="overview-footer">${line(mix)}</p>
    ${split.length ? `<p class="overview-footer">${line(split)}</p>` : ""}`;
}

/**
 * The cost curve, as bars scaled against the tallest one.
 *
 * Scaled against the deck's own peak rather than a fixed ceiling, because the
 * shape is the question -- whether the deck can act on turn two, whether it
 * has a top end -- and a fixed ceiling flattens every curve into the same
 * stub. The last bucket carries everything at or above its cost, which its
 * label says.
 */
function renderCostCurve(analytics: DeckAnalytics): string {
  const bars = analytics.curve
    .map((bucket) => {
      const height = analytics.peak
        ? Math.round((bucket.count / analytics.peak) * 100)
        : 0;
      return `<div class="cost-bar${bucket.count ? "" : " empty"}" style="--fill:${height}%">
        <span class="cost-bar-track"><b>${bucket.count || ""}</b><i></i></span>
        <span class="cost-bar-label">${bucket.label}</span>
      </div>`;
    })
    .join("");
  const spoken = analytics.curve
    .filter((bucket) => bucket.count)
    .map((bucket) => `${bucket.count} at cost ${bucket.label}`)
    .join(", ");
  return `<div class="cost-curve" role="img" aria-label="Cost curve: ${spoken || "no cards yet"}">${bars}</div>`;
}

/**
 * One labelled group of figures, sized by how many it was given.
 *
 * `note` is the block's own aside: the thing the figures are read against. It
 * shares the caption's line by default, which suits a short total, and takes a
 * line of its own when `noteBelow` says it is a list -- a Leader with three
 * types cannot share a 17rem column with its own caption, and a note that
 * sometimes wraps and sometimes does not is worse than one that never shares.
 */
function renderOverviewBlock(
  caption: string,
  rows: readonly (readonly [string, number])[],
  note = "",
  noteBelow = false,
): string {
  const tiles = rows
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`,
    )
    .join("");
  const aside = note ? `<span>${escapeHtml(note)}</span>` : "";
  return `<div class="overview-block">
    <p class="overview-caption">${escapeHtml(caption)}${noteBelow ? "" : aside}</p>
    ${noteBelow && aside ? `<p class="overview-note">${aside}</p>` : ""}
    <dl class="overview-tiles" style="--tiles:${rows.length}">${tiles}</dl>
  </div>`;
}

/**
 * What a text search can and cannot reach in this build.
 *
 * Printed card text is an asset the player loads, so without a pack the words
 * are simply not here -- and a search that quietly returns nothing looks like
 * a card that does not exist rather than a text pack that is not loaded. What
 * still works without one is worth saying too: the clause markers, the
 * keywords and every bracketed token are derived facts committed with the
 * card, so `DON!!`, `On Play` and `Blocker` all find their cards in a build
 * carrying no text at all.
 */
function renderTextSearchNote(state: EditorState): string {
  if (!state.filter.text.trim()) return "";
  if (assetSummary().textCards > 0) return "";
  return `<p class="catalog-note">No card text loaded, so this searches keywords and timings only -- try <b>DON!!</b>, <b>On Play</b> or <b>Blocker</b>. Load an asset pack to search the printed words.</p>`;
}

/**
 * Which format the deck is being built for.
 *
 * A control rather than a label, because rotation is the one deck-legality
 * rule the builder gets to opt out of: an Extra Regulation deck is a real
 * deck, and the choice is the player's. Standard is the default, so a deck
 * built without touching this is held to the stricter format.
 */
function renderFormatSelect(format: DeckFormat): string {
  const option = (value: DeckFormat, label: string) =>
    `<option value="${value}" ${value === format ? "selected" : ""}>${label}</option>`;
  return `<label class="deck-format-select">Format<select id="editor-format" aria-label="Constructed format">${option("standard", "Standard")}${option("extra", "Extra Regulation")}</select></label>`;
}

/**
 * The way in.
 *
 * A deck started from nothing has no card pool -- the Leader's colours decide
 * what is even on offer -- so the editor cannot open on an empty list. There
 * are two honest ways to get a first Leader: name one, or copy a shipped deck
 * and change it. They lead to different selectors (a grid of Leaders, a grid
 * of decks) and to a different amount of work afterwards, so the choice
 * between them is its own page rather than a tab on one grid, and each
 * selector is a page of its own with a way back to the choice.
 */
function renderStart(state: EditorState, ctx: EditorContext): string {
  const back =
    state.stage === "choose"
      ? `<button class="text-button" id="editor-back">${icon("arrow-left", "Back")}Back</button>`
      : `<button class="text-button" id="editor-start-back">${icon("arrow-left", "Back")}Back</button>`;
  const title =
    state.stage === "choose"
      ? "New deck"
      : state.stage === "leader"
        ? "Choose a Leader"
        : "Choose a base deck";
  const body =
    state.stage === "choose"
      ? renderStartChoice()
      : state.stage === "leader"
        ? `<div class="deck-picker-grid deck-start-grid">${renderLeaderTiles("")}</div>`
        : `<div class="deck-picker-grid deck-start-grid">${renderBaseDeckTiles(ctx)}</div>`;
  return `<main class="deck-editor-shell deck-start-shell" data-stage="${state.stage}">
    <header class="deck-editor-header deck-start-header">${back}<div><p class="eyebrow">Deck editor</p><h1>${title}</h1></div><div></div></header>
    <section class="deck-start-body">${body}</section>
  </main>`;
}

/** The two options, as two large cards: the choice is the whole page. */
function renderStartChoice(): string {
  return `<p class="deck-start-lead">How do you want to start?</p>
    <div class="deck-start-options">
      <button class="deck-start-option" type="button" id="start-from-leader">
        <span class="deck-start-option-art" aria-hidden="true">${icon("crown", "")}</span>
        <strong>Choose a Leader</strong>
        <span>Start from an empty list. The Leader's colours decide which cards you can add.</span>
      </button>
      <button class="deck-start-option" type="button" id="start-from-base">
        <span class="deck-start-option-art" aria-hidden="true">${icon("copy", "")}</span>
        <strong>Choose a base deck</strong>
        <span>Start from a shipped deck, or one of your own, and change what you like. Saving writes a new deck.</span>
      </button>
    </div>`;
}

/** The Leader grid's tiles, shared by the opening selector and the dialog. */
function renderLeaderTiles(chosen: string): string {
  return supportedLeaders
    .map((card) => {
      const art = assetUrl(card.cardNumber);
      const color = card.colors?.[0]?.toLowerCase() ?? "neutral";
      return `<button class="deck-tile ${card.cardNumber === chosen ? "picked" : ""}" type="button" data-pick-leader="${card.cardNumber}" aria-pressed="${card.cardNumber === chosen}">
        <span class="deck-select-preview">
          <span class="game-card deck-select-leader-card ${art ? "has-art" : ""}" style="--card-color:var(--${color})${art ? `;--card-art:url('${art}')` : ""}">
            <span class="card-top"><b>L</b><small>${card.cardNumber}</small></span>
            <strong>${escapeHtml(card.name)}</strong>
          </span>
        </span>
        <span class="deck-tile-name">${escapeHtml(card.name)}<br /><small>${card.cardNumber} · ${escapeHtml(card.colors?.join("/") ?? "")}</small></span>
      </button>`;
    })
    .join("");
}

/**
 * The decks a new deck can be copied from: every shipped format deck, then
 * the player's own saved decks. Drawn with the lobby picker's tiles, since
 * they are the same decks and the player already knows them by that face.
 */
function renderBaseDeckTiles(ctx: EditorContext): string {
  const deckIds = [...SELECTABLE_DECK_IDS, ...Object.keys(ctx.savedDecks)];
  return deckIds
    .map(
      (deckId) =>
        `<button class="deck-tile" type="button" data-pick-base="${escapeHtml(deckId)}">
        ${renderDeckLeaderPreview(ctx.savedDecks, deckId)}
        <span class="deck-tile-name">${escapeHtml(deckLabel(ctx.savedDecks, deckId))}</span>
      </button>`,
    )
    .join("");
}

/** Load a copy of a deck into the editor. A copy, not the deck itself: the
    saved deck stays as it was, and saving this one names a new deck. */
function startFromBase(state: EditorState, ctx: EditorContext, deckId: string) {
  const manifest = ctx.savedDecks[deckId]?.deck ?? deckManifests[deckId];
  if (!manifest) return;
  state.deck = {
    leader: manifest.leader,
    cards: { ...manifest.cards },
    ...(manifest.format ? { format: manifest.format } : {}),
  };
  state.savedDeckId = null;
  state.deckName = "";
  state.dossier = null;
  state.stage = "edit";
}

/**
 * The Leader grid.
 *
 * A Leader is a card, and cards are told apart by their art -- the dropdown
 * this replaces could only print a number and a name. It is also the first
 * decision in a deck rather than one setting among many: the Leader's colours
 * are what the card pool is filtered by, so an empty deck opens here.
 */
function renderLeaderDialog(state: EditorState): string {
  const tiles = renderLeaderTiles(state.deck?.leader ?? "");
  return `<div class="app-dialog-backdrop" id="leader-picker" ${state.leaderDialogOpen ? "" : "hidden"}>
    <div class="app-dialog deck-picker" role="dialog" aria-modal="true" aria-label="Choose a Leader">
      <div class="app-dialog-head">
        <h2>Choose a Leader</h2>
        <button class="text-button" type="button" id="close-leader-picker">${icon("x", "Close")}Close</button>
      </div>
      <div class="deck-picker-grid">${tiles}</div>
    </div>
  </div>`;
}

/**
 * The save dialog: the one place a deck is named, and the one place it is
 * told which plan the AI pilots it under.
 *
 * Naming is part of saving, not part of building, and it has no sensible
 * default -- the Leader's name was one, and it made every deck of that Leader
 * indistinguishable in the picker. So the name is asked for at the moment it is
 * needed, empty, with the save button behind it. The dossier is the opposite
 * case: it does have a sensible default, so it is offered already answered.
 */
function renderNameDialog(state: EditorState): string {
  const replacing =
    state.replaceConfirmedFor !== null &&
    sameDeckName(state.replaceConfirmedFor, state.deckName);
  return `<div class="app-dialog-backdrop" id="deck-name-dialog" ${state.nameDialogOpen ? "" : "hidden"}>
    <form class="app-dialog" id="deck-name-form" role="dialog" aria-modal="true" aria-label="Name this deck">
      <div class="app-dialog-head">
        <h2>Name this deck</h2>
        <button class="text-button" type="button" id="cancel-deck-name">${icon("x", "Cancel")}Cancel</button>
      </div>
      <label>Deck name
        <input id="editor-deck-name" value="${escapeHtml(state.deckName)}" maxlength="40" placeholder="e.g. Red Rush" spellcheck="false" autocomplete="off" />
      </label>
      ${renderDossierSelect(state)}
      ${state.nameMessage ? `<p class="app-dialog-message">${escapeHtml(state.nameMessage)}</p>` : ""}
      <div class="app-dialog-actions">
        <button class="primary" type="submit" id="confirm-deck-name">${icon("save", "Save this deck")}<span id="confirm-deck-name-label">${replacing ? "Replace deck" : "Save deck"}</span></button>
      </div>
    </form>
  </div>`;
}

/**
 * Which shipped deck's strategy dossier the LLM opponent pilots this list
 * with.
 *
 * The engine's own heuristics need no such choice -- a rules seat resolves its
 * policy through the Leader card, so a home-brew ST31 already plays ST31's
 * rules. Only the LLM reads a per-deck dossier, and a deck the player built has
 * none: nothing could have written one for a list that did not exist when the
 * app was built. Borrowing one is what makes a saved deck selectable as the LLM
 * opponent at all.
 *
 * The decks sharing this list's Leader come first and one of them is
 * preselected, because that is almost always the honest answer. The rest are
 * offered below it rather than hidden: a list can be a known archetype under a
 * different Leader, and the player knows their own deck better than its Leader
 * does. "No plan" is last, and is what a Leader no shipped deck plays defaults
 * to -- the LLM will not be offered the deck, which is where this started.
 */
function renderDossierSelect(state: EditorState): string {
  const leader = state.deck?.leader ?? "";
  const matching = dossierDeckIdsForLeader(leader);
  const selected = state.dossier ?? defaultDossier(leader);
  const option = (deckId: string, label: string) =>
    `<option value="${escapeHtml(deckId)}" ${deckId === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
  const others = [...DOSSIER_DECK_IDS].filter(
    (deckId) => !matching.includes(deckId),
  );
  return `<label>AI opponent plays it as
      <select id="editor-deck-dossier">
        ${matching.length ? `<optgroup label="Same Leader">${matching.map((deckId) => option(deckId, deckDisplayName(deckId))).join("")}</optgroup>` : ""}
        <optgroup label="Other decks">${others.map((deckId) => option(deckId, deckDisplayName(deckId))).join("")}</optgroup>
        ${option("", "No plan -- not offered to the LLM opponent")}
      </select>
    </label>
    <p class="app-dialog-note">Only the LLM opponent reads this. The built-in heuristics already play your deck by its Leader.</p>`;
}

/** The dossier a list is saved with when nobody says otherwise. */
function defaultDossier(leader: string): string {
  return dossierDeckIdsForLeader(leader)[0] ?? "";
}

function close(state: EditorState, ctx: EditorContext): void {
  state.target = null;
  ctx.goToSetup();
}

export function bind(state: EditorState, ctx: EditorContext): void {
  document.querySelector("#editor-back")?.addEventListener("click", () => {
    close(state, ctx);
  });
  document
    .querySelector("#editor-start-back")
    ?.addEventListener("click", () => {
      state.stage = "choose";
      ctx.rerender();
    });
  document
    .querySelector("#start-from-leader")
    ?.addEventListener("click", () => {
      state.stage = "leader";
      ctx.rerender();
    });
  document.querySelector("#start-from-base")?.addEventListener("click", () => {
    state.stage = "base";
    ctx.rerender();
  });
  document.querySelectorAll<HTMLElement>("[data-pick-base]").forEach((tile) => {
    tile.addEventListener("click", () => {
      startFromBase(state, ctx, tile.dataset.pickBase ?? "");
      ctx.rerender();
    });
  });
  document
    .querySelector("#open-leader-picker")
    ?.addEventListener("click", () => {
      state.leaderDialogOpen = true;
      ctx.rerender();
    });
  document
    .querySelector("#close-leader-picker")
    ?.addEventListener("click", () => {
      state.leaderDialogOpen = false;
      ctx.rerender();
    });
  document
    .querySelectorAll<HTMLElement>("[data-pick-leader]")
    .forEach((tile) => {
      tile.addEventListener("click", () => {
        if (state.deck) state.deck.leader = tile.dataset.pickLeader ?? "";
        state.leaderDialogOpen = false;
        state.stage = "edit";
        ctx.clearCardDetail();
        ctx.rerender();
      });
    });
  ctx.bindCardDetailDialog(() => {
    ctx.rerender();
  });
  bindCatalogFilters("card", state.filter, () => {
    ctx.rerender();
  });
  document.querySelector("#toggle-overview")?.addEventListener("click", () => {
    state.overviewOpen = !state.overviewOpen;
    ctx.rerender();
  });
  document.querySelector("#editor-format")?.addEventListener("change", () => {
    if (!state.deck) return;
    state.deck.format = valueOf("editor-format") as DeckFormat;
    ctx.rerender();
  });
  document.querySelector("#card-sort")?.addEventListener("change", () => {
    state.sort = valueOf("card-sort") as CatalogSortKey;
    ctx.rerender();
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-increase], [data-decrease]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        if (!state.deck) return;
        const cardNumber = button.dataset.increase ?? button.dataset.decrease!;
        const delta = button.dataset.increase ? 1 : -1;
        const next = (state.deck.cards[cardNumber] ?? 0) + delta;
        if (next > 0) state.deck.cards[cardNumber] = next;
        else {
          state.deck.cards = Object.fromEntries(
            Object.entries(state.deck.cards).filter(
              ([existingCardNumber]) => existingCardNumber !== cardNumber,
            ),
          );
        }
        ctx.rerender();
      });
    });
  document.querySelector("#open-import")?.addEventListener("click", () => {
    ctx.openImportDialog();
    ctx.rerender();
  });
  ctx.bindImportDialog(
    () => {
      ctx.rerender();
    },
    (parsed) => {
      state.deck = parsed;
      state.message = "Deck list imported.";
      ctx.rerender();
    },
  );
  document
    .querySelector("#editor-deck-name")
    ?.addEventListener("input", (event) => {
      state.deckName = (event.currentTarget as HTMLInputElement).value;
      // Typing does not re-render (it would drop the caret), so the button
      // follows the name by hand: it says Replace only for the name warned of.
      const label = document.querySelector("#confirm-deck-name-label");
      if (label)
        label.textContent =
          state.replaceConfirmedFor !== null &&
          sameDeckName(state.replaceConfirmedFor, state.deckName)
            ? "Replace deck"
            : "Save deck";
    });
  document
    .querySelector("#editor-deck-dossier")
    ?.addEventListener("change", (event) => {
      state.dossier = (event.currentTarget as HTMLSelectElement).value;
    });
  document.querySelector("#cancel-deck-name")?.addEventListener("click", () => {
    state.nameDialogOpen = false;
    state.nameMessage = "";
    state.replaceConfirmedFor = null;
    ctx.rerender();
  });
  document
    .querySelector("#deck-name-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveDeck(state, ctx);
    });
  document.querySelector("#export-list")?.addEventListener("click", () => {
    if (state.deck)
      downloadText("open-optcg-deck.txt", exportDeckList(state.deck));
  });
  // Saving asks for the name first: the deck is legal, but it is not yet a
  // thing you can pick from the lobby until it is called something.
  document.querySelector("#save-custom")?.addEventListener("click", () => {
    if (!state.target || !state.deck || validateDeck(state.deck).errors.length)
      return;
    state.nameDialogOpen = true;
    state.nameMessage = "";
    state.replaceConfirmedFor = null;
    ctx.rerender();
    document.querySelector<HTMLInputElement>("#editor-deck-name")?.focus();
  });
}

/** Write the deck under the name the dialog was given, and leave the editor. */
function saveDeck(state: EditorState, ctx: EditorContext): void {
  if (!state.target || !state.deck || validateDeck(state.deck).errors.length)
    return;
  const name = state.deckName.trim();
  if (!name) {
    state.nameMessage = "Give this deck a name before saving.";
    ctx.rerender();
    document.querySelector<HTMLInputElement>("#editor-deck-name")?.focus();
    return;
  }
  const target = saveTargetFor(
    name,
    state.savedDeckId,
    ctx.savedDecks,
    state.replaceConfirmedFor,
  );
  if (target.kind === "clash") {
    state.replaceConfirmedFor = name;
    state.nameMessage = `You already have a deck called "${ctx.savedDecks[target.deckId]!.name}". Save again to replace it, or pick another name to keep both.`;
    ctx.rerender();
    document.querySelector<HTMLInputElement>("#editor-deck-name")?.focus();
    return;
  }
  const deckId =
    target.kind === "replace" ? target.deckId : ctx.nextCustomDeckId();
  // Only an answer that differs from the Leader's own is written down. Storing
  // the default too would freeze it: a deck saved today would keep pointing at
  // whichever list was that Leader's first dossier when it was saved, rather
  // than following the Leader as a later build re-answers the question.
  const dossier = state.dossier;
  ctx.savedDecks[deckId] = {
    name,
    deck: toManifest(state.deck, deckId),
    ...(dossier !== null && dossier !== defaultDossier(state.deck.leader)
      ? { dossier }
      : {}),
  };
  ctx.persistSavedDecks();
  state.savedDeckId = deckId;
  state.nameDialogOpen = false;
  state.replaceConfirmedFor = null;
  ctx.setupDecks[state.target] = deckId;
  // A different list under the same ID invalidates whatever was simulated
  // for it: those games were played by a deck that no longer exists.
  ctx.forgetSimulatedFor(deckId);
  close(state, ctx);
}

/** Two deck names the picker could not tell apart. */
function sameDeckName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Where a save under {@link name} goes. */
export type SaveTarget =
  | { kind: "new" }
  | { kind: "replace"; deckId: string }
  | { kind: "clash"; deckId: string };

/**
 * Which saved deck, if any, a save under this name writes over.
 *
 * A deck is known to the player by its name, so the name decides: saving under
 * the name the deck already has updates it, and saving under a new one is a
 * new deck, leaving the one it was edited from as it was. A name another saved
 * deck already has is a clash until the player has been told so and saved
 * again under it ({@link confirmedFor}); two decks with one name could not be
 * told apart in the picker.
 */
export function saveTargetFor(
  name: string,
  editingId: string | null,
  savedDecks: Record<string, SavedDeck>,
  confirmedFor: string | null,
): SaveTarget {
  if (
    editingId &&
    savedDecks[editingId] &&
    sameDeckName(savedDecks[editingId].name, name)
  )
    return { kind: "replace", deckId: editingId };
  const clash = Object.keys(savedDecks).find((deckId) =>
    sameDeckName(savedDecks[deckId]!.name, name),
  );
  if (!clash) return { kind: "new" };
  return confirmedFor !== null && sameDeckName(confirmedFor, name)
    ? { kind: "replace", deckId: clash }
    : { kind: "clash", deckId: clash };
}
