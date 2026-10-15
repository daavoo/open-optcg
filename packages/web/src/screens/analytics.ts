import { requireKnownCard } from "@one-piece-sim/cards";
import type { DeckManifest } from "@one-piece-sim/decks";
import type { PlayerId } from "@one-piece-sim/protocol";
import { assetUrl } from "../assets.js";
import { escapeHtml } from "../card-text.js";
import { downloadBytes } from "../dom.js";
import { buildSampleDownload, slotPhrase } from "../analytics-sample.js";
import {
  DEFAULT_MAX_ACTIONS,
  headToHead,
  offerSample,
  sampleContents,
  stuckRows,
  summarizeGames,
  usageRows,
  winRateBand,
  winRateRange,
  type AnalyticsGame,
  type CardImpact,
  type HeadToHead,
  type MatrixBand,
  type SampleGame,
} from "../analytics.js";
import type { AnalyticsPilot, AnalyticsResponse } from "../analytics-worker.js";
import {
  deckAccent,
  deckChip,
  deckLabel,
  deckShortName,
  type SavedDeck,
} from "../deck-labels.js";
import { renderDeckLeaderPreview } from "../deck-select.js";
import { icon } from "../icons.js";
import { sendLearnedModel } from "../learned-model.js";
import * as footer from "./footer.js";

/**
 * The matchup page: the lobby's two decks, one button that plays a hundred
 * games between them, and what those games say once every one has finished.
 *
 * Nothing is shown mid-run. The first turn order finishes before the second
 * starts, so a headline drawn as games arrive is a one-seat number that then
 * swings as the other seat comes in -- a result that visibly changes its mind.
 */
export interface AnalyticsState {
  /**
   * The last finished run, for the pairing it was run on, with the won games
   * kept whole for its sample download (at most one per deck and seat).
   */
  result: {
    pair: string;
    games: AnalyticsGame[];
    samples?: SampleGame[];
  } | null;
  /** Games of the run in flight; they become {@link result} only when it ends. */
  pending: AnalyticsGame[];
  /** The run in flight's sample so far, keyed by slot. */
  pendingSamples: Map<string, SampleGame>;
  /** The pairing the run in flight is playing. */
  pendingPair: string;
  runId: number;
  progress: { completed: number; total: number } | null;
  running: boolean;
  message: string;
  /** The simulation workers, made as a run first needs them and then kept. */
  workers: Worker[];
  /** Workers of the run in flight that have not finished their share. */
  playing: number;
  /** Games the next run plays: one of {@link RUN_GAME_OPTIONS}. */
  runGames: RunGames;
}

/** The pieces this screen shares with the rest of the app. Kept stable across
    calls by the caller (main.ts), since {@link bind} closes over it the first
    time it lazily creates the simulation worker. */
export interface AnalyticsContext {
  setupDecks: Record<PlayerId, string>;
  savedDecks: Record<string, SavedDeck>;
  renderCardDetailDialog(): string;
  bindCardDetailDialog(rerender: () => void): void;
  /** Re-renders the page in place: render → hydrate icons → bind → theme. */
  rerender(): void;
  goToSetup(): void;
  /** A fresh seed prefix, so running the same pairing again is a new sample. */
  randomSeed(): string;
  /** Whether the build carries the learned model, which can then pilot a run. */
  scorerAvailable(): boolean;
}

/**
 * Games a run can play, split evenly over the two turn orders. The headline
 * rate's 95% range narrows with the square root of the count -- about ±10
 * points at 100, ±6 at 250, ±4.5 at 500 -- so the choice is a trade the reader
 * makes between waiting and certainty, and the record line states the range
 * each one bought. The card-impact split compares the games a card was used in
 * against the games it was not, and below a hundred one game moves a card's row
 * by several points -- the list reads as a ranking of noise.
 */
export const RUN_GAME_OPTIONS = [100, 250, 500] as const;
export type RunGames = (typeof RUN_GAME_OPTIONS)[number];
/** The quick answer: a few seconds, and the range says how far to trust it. */
export const DEFAULT_RUN_GAMES: RunGames = 100;
/** Most-used rows shown per side; the tail is noise at these sample sizes. */
const CARD_USAGE_ROWS = 4;
/** Stuck-in-hand rows per side: the few slots worth questioning first. */
const CARD_STUCK_ROWS = 3;

/** What the six bands mean once a matchup's win rate is the headline. */
const VERDICT_LABELS: Record<MatrixBand, string> = {
  "warm-3": "Strongly favoured",
  "warm-2": "Favoured",
  "warm-1": "Slight edge",
  "cold-1": "Slight underdog",
  "cold-2": "Unfavoured",
  "cold-3": "Heavily unfavoured",
  empty: "Not simulated",
};

/**
 * The chip a matchup has earned: the band of whichever end of its range sits
 * nearer an even game, so the label is one the games support rather than the
 * one a lucky run's point estimate lands in. A range that still includes 50%
 * has not picked a side.
 */
function verdictBand(head: HeadToHead): MatrixBand {
  const range = winRateRange(head.selfWins, head.selfWins + head.opponentWins);
  if (!range) return "empty";
  if (range.low <= 0.5 && range.high >= 0.5) return winRateBand(head.winRate);
  return winRateBand(range.low > 0.5 ? range.low : range.high);
}

function verdictLabel(head: HeadToHead): string {
  if (head.mirror) return "Turn order alone";
  const range = winRateRange(head.selfWins, head.selfWins + head.opponentWins);
  if (range && range.low <= 0.5 && range.high >= 0.5)
    return "Too close to call";
  return VERDICT_LABELS[verdictBand(head)];
}

/** "likely 59–72%": the range in words, for the record line. */
function rangePhrase(head: HeadToHead): string {
  const range = winRateRange(head.selfWins, head.selfWins + head.opponentWins);
  if (!range) return "";
  return ` · likely ${Math.round(range.low * 100)}–${Math.round(range.high * 100)}%`;
}

export function emptyState(): AnalyticsState {
  return {
    result: null,
    pending: [],
    pendingSamples: new Map(),
    pendingPair: "",
    runId: 0,
    progress: null,
    running: false,
    message: "",
    workers: [],
    playing: 0,
    runGames: DEFAULT_RUN_GAMES,
  };
}

/**
 * The learned model wherever the build has one, and the rules agents where it
 * does not: a matchup reads how the decks fare when played well, so a run is
 * played by the strongest pilot the browser can run.
 */
function pilotOf(ctx: AnalyticsContext): AnalyticsPilot {
  return ctx.scorerAvailable() ? "scorer" : "rules";
}

/**
 * Workers a run is split across: every core but one, whoever pilots. Games
 * share nothing, so a run scales with the cores until they run out -- a
 * rules-agent game is tens of milliseconds, which is still most of a minute
 * for 500 of them on one core. A learned-model worker also runs the gathers
 * between GPU stages on its core, so the cores are what a run scales with
 * until the GPU is saturated, and past that a worker more costs next to
 * nothing. Each learned-model worker decodes its own copy of the model (tens
 * of megabytes), which is what caps the count.
 */
function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(8, cores - 1));
}

/** Drop a finished run something has invalidated -- a deck it played changed. */
export function forgetSimulated(
  state: AnalyticsState,
  stale: (game: AnalyticsGame) => boolean,
): void {
  if (state.result?.games.some(stale)) state.result = null;
}

/** The ordered pairs one matchup reads: both turn orders, or one in a mirror. */
function matchupPairs(self: string, opponent: string): Array<[string, string]> {
  return self === opponent
    ? [[self, self]]
    : [
        [self, opponent],
        [opponent, self],
      ];
}

/** A run's identity: the decks, and who played them. */
function pairKey(
  self: string,
  opponent: string,
  pilot: AnalyticsPilot,
): string {
  return `${self}|${opponent}|${pilot}`;
}

/**
 * Manifests for whichever seats hold a saved deck, keyed by the ID the worker
 * knows it by.
 */
function customDecks(ctx: AnalyticsContext): Record<string, DeckManifest> {
  return Object.fromEntries(
    (["p1", "p2"] as const).flatMap((player): Array<[string, DeckManifest]> => {
      const selected = ctx.setupDecks[player];
      if (!selected.startsWith("CUSTOM-")) return [];
      const deck = ctx.savedDecks[selected]?.deck;
      return deck ? [[selected, deck]] : [];
    }),
  );
}

/* --- Running games --------------------------------------------------------- */

function workerInstances(
  state: AnalyticsState,
  ctx: AnalyticsContext,
  count: number,
): Worker[] {
  while (state.workers.length < count) {
    const worker = new Worker(
      URL.createObjectURL(
        new Blob([__ANALYTICS_WORKER_SOURCE__], { type: "text/javascript" }),
      ),
    );
    worker.addEventListener(
      "message",
      (event: MessageEvent<AnalyticsResponse>) => {
        handleMessage(state, ctx, event.data);
      },
    );
    sendLearnedModel(worker);
    worker.addEventListener("error", () => {
      if (!state.running) return;
      stopSimulation(state);
      state.message = "The simulation stopped unexpectedly.";
      renderIfOpen(ctx);
    });
    state.workers.push(worker);
  }
  return state.workers.slice(0, count);
}

function handleMessage(
  state: AnalyticsState,
  ctx: AnalyticsContext,
  response: AnalyticsResponse,
): void {
  if (response.runId !== state.runId) return;
  // The run's size is set when it starts; each worker reports its own share.
  if (response.type === "started") return;
  if (response.type === "game") {
    state.pending.push(response.game);
    if (response.sample) offerSample(state.pendingSamples, response.sample);
    state.progress = {
      completed: state.pending.length,
      total: state.progress?.total ?? state.pending.length,
    };
    updateProgress(state);
    return;
  }
  if (response.type === "error") {
    stopSimulation(state);
    state.message = response.message;
    renderIfOpen(ctx);
    return;
  }
  state.playing -= 1;
  if (state.playing > 0 && !response.cancelled) return;
  state.running = false;
  state.progress = null;
  if (!response.cancelled) {
    state.result = {
      pair: state.pendingPair,
      games: state.pending,
      samples: [...state.pendingSamples.values()],
    };
  }
  state.pending = [];
  state.pendingSamples = new Map();
  renderIfOpen(ctx);
}

function runSimulation(state: AnalyticsState, ctx: AnalyticsContext): void {
  if (state.running) return;
  const pairs = matchupPairs(ctx.setupDecks.p1, ctx.setupDecks.p2);
  const seeds = state.runGames / pairs.length;
  const pilot = pilotOf(ctx);
  const workers = workerInstances(state, ctx, workerCount());
  state.message = "";
  state.pending = [];
  state.pendingSamples = new Map();
  state.pendingPair = pairKey(ctx.setupDecks.p1, ctx.setupDecks.p2, pilot);
  state.running = true;
  state.runId += 1;
  state.playing = workers.length;
  state.progress = { completed: 0, total: pairs.length * seeds };
  const seedPrefix = ctx.randomSeed();
  workers.forEach((worker, index) => {
    worker.postMessage({
      type: "run",
      runId: state.runId,
      pairs,
      seeds,
      seedPrefix,
      maxActions: DEFAULT_MAX_ACTIONS,
      customDecks: customDecks(ctx),
      pilot,
      shard: { index, count: workers.length },
    });
  });
  ctx.rerender();
}

function downloadSample(state: AnalyticsState, ctx: AnalyticsContext): void {
  const samples = state.result?.samples;
  if (!samples || samples.length === 0) return;
  const download = buildSampleDownload({
    self: ctx.setupDecks.p1,
    opponent: ctx.setupDecks.p2,
    samples,
    pilot: pilotOf(ctx),
    customDecks: customDecks(ctx),
    name: (deck) => deckShortName(deck, ctx.savedDecks),
    exportedAt: new Date().toISOString(),
  });
  downloadBytes(download.filename, download.bytes, "application/zip");
}

/** Leaving the page abandons the run: its games are never shown half-done. */
export function stopSimulation(state: AnalyticsState): void {
  if (!state.running) return;
  for (const worker of state.workers) worker.postMessage({ type: "cancel" });
  state.running = false;
  state.playing = 0;
  state.progress = null;
  state.pending = [];
  state.pendingSamples = new Map();
  state.runId += 1;
}

function updateProgress(state: AnalyticsState): void {
  if (!state.progress) return;
  const { completed, total } = state.progress;
  const bar = document.querySelector<HTMLElement>(".run-progress-bar span");
  if (bar) bar.style.width = `${Math.round((completed / total) * 100)}%`;
  const label = document.querySelector<HTMLElement>(".run-progress b");
  if (label) label.textContent = `${completed} / ${total}`;
}

/**
 * A late message must not paint this page over the lobby or the board, so a
 * render only happens while the page is the one on screen.
 */
function renderIfOpen(ctx: AnalyticsContext): void {
  if (document.querySelector(".matchup-shell")) ctx.rerender();
}

/* --- The page -------------------------------------------------------------- */

export function render(state: AnalyticsState, ctx: AnalyticsContext): string {
  const self = ctx.setupDecks.p1;
  const opponent = ctx.setupDecks.p2;
  const pilot = pilotOf(ctx);
  const shown =
    state.result?.pair === pairKey(self, opponent, pilot) ? state.result : null;
  const games = shown?.games ?? [];
  const head =
    games.length > 0 ? headToHead(summarizeGames(games), self, opponent) : null;
  return `<main class="matchup-shell">
    <header class="setup-topbar">
      <svg class="brand-mark small"><use href="#brand-hex" /></svg>
      <span class="setup-wordmark">Open OPTCG</span>
    </header>
    <section class="menu-card matchup-card">
      <div class="matchup-topline">
        <button class="text-button" id="analytics-back">${icon("arrow-left", "Back to match setup")}Back to setup</button>
        <div class="matchup-title"><p class="eyebrow">AI vs AI</p><h1>Simulate matchup</h1></div>
      </div>
      <div class="deck-columns matchup-decks">
        ${renderMatchupSide(self, ctx)}
        <div class="matchup-versus" aria-hidden="true">vs</div>
        ${renderMatchupSide(opponent, ctx)}
      </div>
      ${renderRunControl(state, shown ? sampleControl(shown.samples ?? [], self, opponent, ctx) : "")}
      ${state.message ? `<p class="analytics-message">${escapeHtml(state.message)}</p>` : ""}
      ${head ? renderMatchupVerdict(head, pilot, ctx) + renderTurnOrder(head, ctx) + renderImpactColumns(head, ctx) : ""}
    </section>
    ${footer.render()}
    ${ctx.renderCardDetailDialog()}
  </main>`;
}

/** A deck as the lobby picked it: read here, changed only back there. */
function renderMatchupSide(deck: string, ctx: AnalyticsContext): string {
  return `<div class="deck-column matchup-side">
    ${renderDeckLeaderPreview(ctx.savedDecks, deck)}
    <p class="deck-leader" data-deck-color="${deckAccent(deck, ctx.savedDecks)}"><b>${escapeHtml(deckLabel(deck, ctx.savedDecks))}</b></p>
  </div>`;
}

function renderRunControl(state: AnalyticsState, download: string): string {
  if (state.running && state.progress) {
    const { completed, total } = state.progress;
    return `<div class="run-progress" role="status">
      <div class="run-progress-bar"><span style="width:${Math.round((completed / total) * 100)}%"></span></div>
      <b>${completed} / ${total}</b>
      <small>Simulating…</small>
    </div>`;
  }
  const size = (games: RunGames): string =>
    `<button class="run-size-option${games === state.runGames ? " picked" : ""}" type="button" data-run-games="${games}" aria-pressed="${String(games === state.runGames)}">${games}</button>`;
  return `<div class="run-control">
    <span class="run-size" role="group" aria-label="Games to simulate">${RUN_GAME_OPTIONS.map(size).join("")}</span>
    <button class="primary" type="button" id="sim-run">${icon("play", `Run ${state.runGames} games`)}Run ${state.runGames} games</button>
    ${download}
  </div>`;
}

/**
 * The finished run's sample download: each deck's first win going first and
 * first win going second, as traces. A slot no game filled is named in the
 * tooltip and counted on the button, so a short download says why it is short.
 */
function sampleControl(
  samples: readonly SampleGame[],
  self: string,
  opponent: string,
  ctx: AnalyticsContext,
): string {
  const { filled, missing } = sampleContents(samples, self, opponent);
  const slots = filled.length + missing.length;
  const name = (deck: string): string => deckShortName(deck, ctx.savedDecks);
  const lines = [
    ...filled.map(({ slot }) => `${name(slot.deck)} ${slotPhrase(slot.seat)}`),
    ...missing.map(
      (slot) => `No game: ${name(slot.deck)} never ${slotPhrase(slot.seat)}`,
    ),
  ];
  const count = missing.length > 0 ? ` (${filled.length} of ${slots})` : "";
  return `<button class="secondary" type="button" id="sim-sample" title="${escapeHtml(lines.join("\n"))}" data-missing="${missing.length}"${filled.length === 0 ? " disabled" : ""}>${icon("download", "Download sample")}Download sample${count}</button>`;
}

function renderMatchupVerdict(
  head: HeadToHead,
  pilot: AnalyticsPilot,
  ctx: AnalyticsContext,
): string {
  const share = Math.round((head.winRate ?? 0.5) * 100);
  const selfLabel = escapeHtml(deckShortName(head.selfDeck, ctx.savedDecks));
  const opponentLabel = escapeHtml(
    deckShortName(head.opponentDeck, ctx.savedDecks),
  );
  return `<div class="matchup-verdict" data-band="${verdictBand(head)}">
    <p class="eyebrow">${head.mirror ? "Mirror · the deck on the play" : `${selfLabel} against ${opponentLabel}`}</p>
    <b>${formatPercent(head.winRate)}</b>
    <span class="verdict-chip">${verdictLabel(head)}</span>
    <p class="verdict-record">${head.selfWins}–${head.opponentWins} in ${head.games} games${pilot === "scorer" ? ", both decks played by the learned model" : ""}${rangePhrase(head)} · ${head.averageTurns.toFixed(1)} turns on average${head.unfinished > 0 ? ` · ${head.unfinished} unfinished` : ""}</p>
    <div class="split-bar" role="img" aria-label="${selfLabel} won ${head.selfWins}, ${opponentLabel} won ${head.opponentWins}">
      <i class="split-self" data-deck-color="${deckAccent(head.selfDeck, ctx.savedDecks)}" style="width:${share}%"></i>
      <i class="split-opponent" data-deck-color="${deckAccent(head.opponentDeck, ctx.savedDecks)}" style="width:${100 - share}%"></i>
    </div>
    <div class="split-legend">
      <span>${head.mirror ? "On the play" : deckChip(head.selfDeck, ctx.savedDecks)}<b>${formatPercent(head.winRate)}</b></span>
      <span><b>${formatPercent(head.winRate === null ? null : 1 - head.winRate)}</b>${head.mirror ? "On the draw" : deckChip(head.opponentDeck, ctx.savedDecks)}</span>
    </div>
  </div>`;
}

/** The split the combined rate hides: the same pairing is two matchups if the
    first turn is worth enough. */
function renderTurnOrder(head: HeadToHead, ctx: AnalyticsContext): string {
  const who = head.mirror
    ? "the deck on the play"
    : escapeHtml(deckShortName(head.selfDeck, ctx.savedDecks));
  return `<div class="turn-order">
    <div class="turn-figure"><p class="eyebrow">On the play</p><b>${formatPercent(head.onPlay)}</b><small>${who} going first</small></div>
    <div class="turn-figure"><p class="eyebrow">On the draw</p><b>${formatPercent(head.onDraw)}</b><small>${who} going second</small></div>
  </div>`;
}

function renderImpactColumns(head: HeadToHead, ctx: AnalyticsContext): string {
  // In a mirror both columns are the same deck, so the seat is the only thing
  // that tells them apart and it has to be what names them.
  return `<div class="impact-columns">
    ${renderCardImpact(head.selfDeck, head.cards.self, head.mirror ? "on the play" : "", ctx)}
    ${renderCardImpact(head.opponentDeck, head.cards.opponent, head.mirror ? "on the draw" : "", ctx)}
  </div>`;
}

function renderCardImpact(
  deck: string,
  cards: readonly CardImpact[],
  seat: string,
  ctx: AnalyticsContext,
): string {
  const ranked = usageRows(cards);
  const used = ranked
    .filter((card) => card.gamesUsed > 0)
    .slice(0, CARD_USAGE_ROWS);
  const shown = new Set(used.map((card) => card.cardNumber));
  const stuck = stuckRows(cards)
    .filter((card) => !shown.has(card.cardNumber))
    .slice(0, CARD_STUCK_ROWS);
  return `<section class="card-impact">
    <h3>${escapeHtml(deckLabel(deck, ctx.savedDecks))} <small>${[seat, "most used"].filter(Boolean).join(" · ")}</small></h3>
    ${
      used.length === 0
        ? `<p class="muted">No card was used in these games.</p>`
        : `<ul>${used.map(usedRow).join("")}</ul>`
    }
    ${
      stuck.length === 0
        ? "<div></div>"
        : `<div><h4>Stuck in hand <small>used least when drawn</small></h4>
           <ul class="impact-stuck">${stuck
             .map((card) =>
               renderCardRow(
                 card,
                 `${card.gamesUsedWhenHeld}/${card.gamesHeld}`,
                 `Used in ${card.gamesUsedWhenHeld} of the ${card.gamesHeld} games it was in hand`,
               ),
             )
             .join("")}</ul></div>`
    }
    ${
      ranked.length === 0
        ? "<div></div>"
        : `<details class="impact-all">
             <summary>Every card <small>${ranked.length} drawn or used</small></summary>
             <ul>${ranked.map(usedRow).join("")}</ul>
           </details>`
    }
  </section>`;
}

/** A row headed by the games the card was used in, of the games decided. */
function usedRow(card: CardImpact): string {
  const games = card.gamesUsed + card.gamesUnused;
  return renderCardRow(
    card,
    `${card.gamesUsed}/${games}`,
    `Used in ${card.gamesUsed} of ${games} games`,
  );
}

/**
 * One card: how many games it was used in out of the games that count -- all
 * of them in the most-used list, the ones it was in hand for in the stuck
 * list -- and how those uses split between plays and Counters, each with the
 * share of those games the deck won. A card kept only as a Counter fills a
 * different slot from one being cast, and one that wins as a Counter and
 * loses when cast is worth more in hand. A game can hold both uses, so the
 * overlap is named: without it the two counts read as if they should sum to
 * the headline.
 */
function renderCardRow(
  card: CardImpact,
  headline: string,
  headlineLabel: string,
): string {
  const definition = requireKnownCard(card.cardNumber);
  const color = definition.colors?.[0]?.toLowerCase() ?? "neutral";
  const art = assetUrl(definition.cardNumber);
  const played = card.gamesPlayed ?? 0;
  const countered = card.gamesCountered ?? 0;
  const both = played + countered - card.gamesUsed;
  const won = (wins: number | undefined, games: number): string =>
    wins === undefined ? "" : `, won ${formatPercent(wins / games)}`;
  const uses = [
    played ? `played in ${played}${won(card.winsPlayed, played)}` : "",
    countered
      ? `as a Counter in ${countered}${won(card.winsCountered, countered)}`
      : "",
    both > 0 ? `both in ${both}` : "",
    card.gamesUsed > 0 && card.gamesUnused > 0
      ? `not used in ${card.gamesUnused}${won(card.winsUnused, card.gamesUnused)}`
      : "",
  ].filter(Boolean);
  return `<li>
    <button class="impact-card" type="button" data-inspect-card="${escapeHtml(card.cardNumber)}" aria-label="View ${escapeHtml(definition.name)} details"><i class="impact-card-art ${art ? "has-art" : ""}" style="--impact-color:var(--${color})${art ? `;--impact-art:url('${art}')` : ""}" aria-hidden="true"></i><span><b>${escapeHtml(definition.name)}</b><small>${card.cardNumber}</small></span></button>
    <span class="impact-delta" title="${headlineLabel}">${headline}</span>
    ${uses.length > 0 ? `<small class="impact-detail">${uses.join(" · ")}</small>` : ""}
  </li>`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function bind(state: AnalyticsState, ctx: AnalyticsContext): void {
  footer.bind();
  ctx.bindCardDetailDialog(() => {
    ctx.rerender();
  });
  document.querySelector("#analytics-back")?.addEventListener("click", () => {
    stopSimulation(state);
    ctx.goToSetup();
  });
  document.querySelector("#sim-run")?.addEventListener("click", () => {
    runSimulation(state, ctx);
  });
  document.querySelector("#sim-sample")?.addEventListener("click", () => {
    downloadSample(state, ctx);
  });
  for (const option of document.querySelectorAll<HTMLElement>(
    "[data-run-games]",
  )) {
    option.addEventListener("click", () => {
      const games = Number(option.dataset.runGames);
      const picked = RUN_GAME_OPTIONS.find((value) => value === games);
      if (picked === undefined || picked === state.runGames) return;
      state.runGames = picked;
      ctx.rerender();
    });
  }
}
