import { DOSSIER_DECK_IDS } from "@one-piece-sim/agents/llm-dossiers";
import {
  deckManifests,
  SEALED_LEADER,
  SELECTABLE_DECK_IDS,
  type DeckManifest,
} from "@one-piece-sim/decks";
import type { PlayerId } from "@one-piece-sim/protocol";
import { closeCatalogMenus, EMPTY_CATALOG_FILTER } from "./catalog.js";
import { hydrateIcons } from "./icons.js";
import {
  bindCardDetailDialog,
  bindImportDialog,
  renderCardDetailDialog,
  renderImportDialog,
  toggleAppDialog,
  type ObservedPowerDetails,
} from "./dialogs.js";
import * as llmSettings from "./llm-settings.js";
import type { LlmSettingsContext, LlmSettingsState } from "./llm-settings.js";
import { valueOfOptional } from "./dom.js";
import {
  deckLabel,
  deckLeaderName,
  dossierDeckIdFor,
  leaderColors,
  type SavedDeck,
} from "./deck-labels.js";
import {
  BrowserGameController,
  type MatchConfig,
  type MatchGame,
  type SavedMatch,
} from "./controller.js";
import { inspectExportedMatch, type RawLlmRecord } from "./diagnostics.js";
import { parseScorerReview, type ScorerReview } from "./scorer-review.js";
import { forgetMatch, rememberMatch, resumableMatch } from "./match-resume.js";
import { replayTurnStarts, replayViewer, takeoverConfig } from "./replay.js";
import { beginSimulation } from "./simulate.js";
import { boardViewer } from "./viewer.js";
import {
  applyAssetAnchors,
  assetSummary,
  assetsReady,
  cacheAssetFiles,
  loadBuiltInPrintedText,
  restoreCachedAssets,
} from "./assets.js";
import {
  loadedPrintedTextPack,
  onPrintedTextChange,
} from "@one-piece-sim/cards";
import * as analyticsScreen from "./screens/analytics.js";
import type { AnalyticsContext, AnalyticsState } from "./screens/analytics.js";
import * as editorScreen from "./screens/editor.js";
import type { EditorContext, EditorState } from "./screens/editor.js";
import * as sealedScreen from "./screens/sealed.js";
import type { SealedContext, SealedState } from "./screens/sealed.js";
import * as assetGateScreen from "./screens/asset-gate.js";
import type { AssetGateContext } from "./screens/asset-gate.js";
import * as homeScreen from "./screens/home.js";
import type { HomeContext } from "./screens/home.js";
import * as setupScreen from "./screens/setup.js";
import type { SeatPilot, SetupContext } from "./screens/setup.js";
import {
  heldSeat,
  initialOnlineState,
  type OnlineState,
  onlineAvailable,
  OnlineMatch,
  rememberSeat,
  serverOrigin,
} from "./online.js";
import { createBattleScreen, type BattleContext } from "./screens/battle.js";
import {
  initialBattleState,
  type BattleState,
} from "./screens/battle-state.js";

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("MISSING_APP_ROOT");
const app: HTMLDivElement = appElement;

/*
 * ---------------------------------------------------------------------------
 * What this file is now
 *
 * The split described in docs/proposals/web-screen-modules.md is done: every
 * screen lives in `screens/`, and what is left here is the wiring the proposal
 * said should be left here -- build the store, hand each screen the slice it
 * owns plus a context of what it shares, and route between them.
 *
 * Where state lives, and why:
 *
 * - This file's `Store` holds only what two or more screens touch, or what
 *   names the single source of truth for what is on screen: the live match,
 *   the AI worker, the saved decks, the two lobby deck picks (analytics shows
 *   the same selects), LLM capability (sealed reports it too), and the shared
 *   card-detail and import dialog state.
 *
 * - Each screen's own state is a slice defined by that screen, not here:
 *   BattleState in screens/battle-state.ts, EditorState in screens/editor.ts,
 *   SealedState in screens/sealed.ts, AnalyticsState in screens/analytics.ts.
 *   Home and setup own none -- setup's local state is the DOM (the seed field,
 *   the starting-player select), read back on submit.
 *
 * A screen reaches nothing global. Anything it needs but does not own arrives
 * through its `*Context`, which is also the list of couplings worth arguing
 * about when one of these screens changes.
 * ---------------------------------------------------------------------------
 */

// LlmCapability and LlmDebugRecord moved to ./llm-settings.js
// AiResult, MainSelection and BattleState moved to ./screens/battle-state.js

const llmDeps: LlmSettingsContext = {
  onCapabilityChanged: () => {
    // Only the constructed lobby has anything to re-sync: its opponent deck
    // select narrows to dossier decks when the LLM seat is picked. The
    // lobby's own form is the one to re-sync, so require it.
    if (document.querySelector("#setup-form"))
      setupScreen.updateControllerUi(setupDeps);
  },
};

function llmUnreachable(): boolean {
  return llmSettings.unreachable(store.llm);
}
/**
 * Named decks the user saved from the deck editor, keyed by their `CUSTOM-`
 * id. Every save is written to localStorage, so a deck outlives the session
 * and shows up as an option in the deck selects next time the page opens.
 */
const SAVED_DECKS_KEY = "open-optcg.saved-decks";
const SAVED_DECK_ID_COUNTER_KEY = "open-optcg.saved-decks.counter";

// SavedDeck moved to ./deck-labels.js

function loadSavedDecks(): Record<string, SavedDeck> {
  try {
    const raw = localStorage.getItem(SAVED_DECKS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const decks: Record<string, SavedDeck> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (
        !id.startsWith("CUSTOM-") ||
        typeof value !== "object" ||
        value === null
      )
        continue;
      const entry = value as {
        name?: unknown;
        deck?: unknown;
        dossier?: unknown;
      };
      if (typeof entry.name !== "string") continue;
      const deck = entry.deck;
      if (typeof deck !== "object" || deck === null) continue;
      const manifest = deck as {
        id?: unknown;
        leader?: unknown;
        cards?: unknown;
      };
      if (
        typeof manifest.id !== "string" ||
        typeof manifest.leader !== "string" ||
        typeof manifest.cards !== "object" ||
        manifest.cards === null
      )
        continue;
      decks[id] = {
        name: entry.name,
        deck: manifest as DeckManifest,
        // Left absent, not defaulted, when storage holds no pick: absent means
        // "follow the Leader", which is what a deck saved before this choice
        // existed should keep doing.
        ...(typeof entry.dossier === "string"
          ? { dossier: entry.dossier }
          : {}),
      };
    }
    return decks;
  } catch {
    return {};
  }
}

function persistSavedDecks(): void {
  try {
    localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(store.savedDecks));
  } catch {
    // Storage full or blocked — the deck still works for this session.
  }
}

/** Where each seat starts, and where it falls back to when the deck it was
    set to is deleted. */
const DEFAULT_SETUP_DECKS: Record<PlayerId, string> = {
  p1: "(Red) Monkey.D.Luffy - Starter Deck 31",
  p2: "(Yellow) Eustass Kid - Starter Deck 36",
};

/**
 * Forget a deck the player saved.
 *
 * A seat set to it cannot stay there -- the deck is about to stop existing --
 * so it falls back to that seat's default, and the analytics page forgets the
 * games it played: their results are about a deck nobody can open again.
 */
function deleteSavedDeck(deckId: string): void {
  if (!store.savedDecks[deckId]) return;
  // In place, not a fresh object: every screen's context holds a reference to
  // this same record, so reassigning it would leave them all on the old one.
  Reflect.deleteProperty(store.savedDecks, deckId);
  persistSavedDecks();
  for (const seat of ["p1", "p2"] as const) {
    if (store.setupDecks[seat] === deckId) {
      store.setupDecks[seat] = DEFAULT_SETUP_DECKS[seat];
    }
  }
  if (store.lastRulesOpponentDeck === deckId) {
    store.lastRulesOpponentDeck = null;
  }
  analyticsScreen.forgetSimulated(
    store.analytics,
    (game) => game.firstDeck === deckId || game.secondDeck === deckId,
  );
}

/** A fresh, unique `CUSTOM-` id that no saved deck already owns. */
function nextCustomDeckId(): string {
  let counter = Number(localStorage.getItem(SAVED_DECK_ID_COUNTER_KEY) ?? "0");
  let id: string;
  do {
    counter += 1;
    id = `CUSTOM-${counter.toString(36).toUpperCase()}`;
  } while (store.savedDecks[id]);
  try {
    localStorage.setItem(SAVED_DECK_ID_COUNTER_KEY, String(counter));
  } catch {
    // Ignore: the id still works for this session.
  }
  return id;
}

/**
 * The decks the LLM seat can pilot, which the opponent deck picker narrows to
 * whenever the LLM is the opponent controller.
 *
 * The shipped decks with a curated strategy dossier, plus every deck the
 * player saved that borrows one -- a home-brew ST31 is piloted by ST31's plan
 * (see {@link dossierDeckIdFor}). Computed per call rather than once at load:
 * saving or deleting a deck changes the answer.
 */
function llmPilotableDeckIds(): readonly string[] {
  return [
    ...SELECTABLE_DECK_IDS.filter((deckId) => DOSSIER_DECK_IDS.has(deckId)),
    ...Object.keys(store.savedDecks).filter((deckId) =>
      dossierDeckIdFor(deckId, store.savedDecks),
    ),
  ];
}

// Sealed mode's SealedRun and state live in ./screens/sealed.js

/** The deck editor's state, reset each time it's opened. */
// EditorState moved to ./screens/editor.js

// SealedState moved to ./screens/sealed.js
// AnalyticsState moved to ./screens/analytics.js

/**
 * Root state, shared across two or more screens or naming the single source
 * of truth for what's on screen, plus one slice per screen
 * (docs/proposals/web-screen-modules.md, migration step 2 -- see the state
 * inventory comment near the top of this file for how each field was sorted).
 */
interface Store {
  /**
   * The match on screen, local or online.
   *
   * `MatchGame` rather than the local controller: the board reads both through
   * the same members, and what they cannot both do is in `capabilities`.
   */
  game: MatchGame | null;
  worker: Worker;
  savedDecks: Record<string, SavedDeck>;
  setupDecks: Record<PlayerId, string>;
  /** Whether an LLM opponent can run, probed from the server. Read-only from
      the browser's side -- credentials and model come from the server's
      environment or its CLI flags, never from a page. */
  llm: LlmSettingsState;
  /** The opponent deck that was picked while Heuristics piloted, restored
      if the player switches the controller back off LLM. */
  lastRulesOpponentDeck: string | null;
  /** Who plays each seat in a local match. Two agents is a match to watch;
      two people is one screen passed between them. */
  seatPilots: Record<PlayerId, SeatPilot>;
  /** The card shown in the "Card details" popup — shared by the deck
      editor's catalog and any in-game card that's clickable but not
      actionable, like a mulligan preview. The two screens never render at
      once, so one field is simpler than threading a duplicate through both. */
  cardDetailCard: string | null;
  /** The board instance the popup was raised from, when the card is in play.
      See `CardDetailState`. */
  cardDetailInstance: string | null;
  /** Whether the "Import a deck list" modal is open. */
  importDialogOpen: boolean;
  /** The deck list textarea's contents, kept in state so an import error
      (which re-renders the whole page) doesn't wipe out what the player
      typed. */
  importDraft: string;
  /** Which screen opened the import dialog, so one shared dialog can apply
      the parsed list to either the constructed deck editor or a sealed run. */
  importTarget: "editor" | "sealed";
  /** Parse-error text shown inside the import dialog itself. */
  importMessage: string;
  battle: BattleState;
  editor: EditorState;
  sealed: SealedState;
  analytics: AnalyticsState;
  online: OnlineState;
}

const store: Store = {
  game: null,
  worker: new Worker(
    URL.createObjectURL(
      new Blob([__WORKER_SOURCE__], { type: "text/javascript" }),
    ),
  ),
  savedDecks: loadSavedDecks(),
  setupDecks: { ...DEFAULT_SETUP_DECKS },
  online: initialOnlineState(serverOrigin()),
  llm: llmSettings.initialState(),
  lastRulesOpponentDeck: null,
  seatPilots: { p1: "you", p2: "ai" },
  cardDetailCard: null,
  cardDetailInstance: null,
  importDialogOpen: false,
  importDraft: "",
  importTarget: "editor",
  importMessage: "",
  battle: initialBattleState(),
  editor: {
    target: null,
    deck: null,
    filter: { ...EMPTY_CATALOG_FILTER },
    sort: "cost",
    message: "",
    deckName: "",
    savedDeckId: null,
    dossier: null,
    catalogScrollTop: 0,
    stage: "edit",
    leaderDialogOpen: false,
    nameDialogOpen: false,
    nameMessage: "",
    replaceConfirmedFor: null,
    overviewOpen: true,
  },
  sealed: sealedScreen.emptyState(),
  analytics: analyticsScreen.emptyState(),
};

function randomSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `match-${values[0]!.toString(16)}${values[1]!.toString(16)}`;
}

/** Whose deck colours each half of the mat: yours and theirs. */
function matDecks(): { self: DeckManifest; opponent: DeckManifest } {
  const deckFor = (player: PlayerId, deckId: string): DeckManifest =>
    (deckId.startsWith("CUSTOM-") || deckId.startsWith("SEALED-")
      ? (store.game?.config[`${player}CustomDeck`] ??
        store.savedDecks[deckId]?.deck)
      : deckManifests[deckId]) ??
    deckManifests["(Red) Monkey.D.Luffy - Starter Deck 31"]!;
  if (!store.game) {
    const p1Deck =
      valueOfOptional("p1-deck") ?? "(Red) Monkey.D.Luffy - Starter Deck 31";
    const p2Deck =
      valueOfOptional("p2-deck") ?? "(Yellow) Eustass Kid - Starter Deck 36";
    return {
      self: deckFor("p1", p1Deck),
      opponent: deckFor("p2", p2Deck),
    };
  }
  // The seat the board is drawn from, not "the human seat": with a person in
  // both of them the board changes hands at the turn, and the mat has to go
  // with it or the second player plays their turn on the first one's colours.
  // A spectator's fixed side is the same question and the same answer.
  const self = boardViewer(
    store.game.config,
    store.battle.replay?.viewer ?? store.battle.simulation?.viewer ?? null,
    store.game.activeObservation.activePlayer,
  );
  return {
    self: deckFor(self, store.game.config[`${self}Deck`]),
    opponent: deckFor(
      self === "p1" ? "p2" : "p1",
      store.game.config[self === "p1" ? "p2Deck" : "p1Deck"],
    ),
  };
}

/**
 * A Leader may bring its own mat art rather than take the colour recipe. This
 * is the pairing: a Leader's card number to the key its art is filed under, in
 * packages/web/src/assets/sprite-<key>.webp and in styles/mat-skins.css. A
 * Leader that names no art keeps the colour mat, which is most of them.
 *
 * Keyed on the Leader rather than the deck list because the mat belongs to the
 * Leader: a custom or sealed deck built around one sits on the same mat as the
 * shipped list does, which is what a player picking that Leader expects.
 */
const LEADER_MATS: Readonly<Record<string, string>> = {
  "ST21-001": "ST31",
  "OP17-039": "XEBEC",
  "OP14-020": "MIHAWK",
};

function setMat(
  attribute: "data-self-mat" | "data-opp-mat",
  mat?: string,
): void {
  const root = document.documentElement;
  if (mat === undefined) root.removeAttribute(attribute);
  else root.setAttribute(attribute, mat);
}

function applyTheme(): void {
  const decks = matDecks();
  const [self, selfSecondary] = leaderColors(decks.self);
  const [opponent, opponentSecondary] = leaderColors(decks.opponent);
  document.documentElement.dataset.theme = self;
  document.documentElement.dataset.themeSecondary = selfSecondary;
  document.documentElement.dataset.themeDual = String(self !== selfSecondary);
  document.documentElement.dataset.oppTheme = opponent;
  document.documentElement.dataset.oppThemeSecondary = opponentSecondary;
  document.documentElement.dataset.oppThemeDual = String(
    opponent !== opponentSecondary,
  );
  // Absent, not empty: the wash in mat-skins.css keys off the attribute being
  // there at all, so a deck with no painting must not leave one behind.
  setMat("data-self-mat", LEADER_MATS[decks.self.leader]);
  setMat("data-opp-mat", LEADER_MATS[decks.opponent.leader]);
  // The Sealed Leader answers to every colour, so its mat and card back get a
  // genuine six-colour treatment instead of the two leader colours other
  // decks pick a mat theme from.
  document.documentElement.toggleAttribute(
    "data-self-rainbow",
    decks.self.leader === SEALED_LEADER,
  );
  document.documentElement.toggleAttribute(
    "data-opp-rainbow",
    decks.opponent.leader === SEALED_LEADER,
  );
  applyAssetAnchors();
}

function goHome(): void {
  showHome();
}

/* ---------------------------------------------------------------------------
   The match view

   The board itself lives in ./screens/battle.ts. It is built once, closing
   over the battle slice it owns plus the pieces it shares -- the live match,
   the AI worker, the card-detail popup, the theme and the way home.
   ------------------------------------------------------------------------ */

const battleDeps: BattleContext = {
  match: store,
  worker: store.worker,
  cardDetail: store,
  applyTheme,
  goHome,
  takeSeat,
  onBoardPainted: () => {
    // After the paint, not before: the board may still take a forced pass or
    // two on its way to the screen, and the position remembered should be the
    // one shown. Only a local match: online the server holds the position and
    // online.ts remembers the seat.
    // Not a replay: the remembered match is the one to be picked back up, and
    // a trace being watched is nobody's match to resume.
    if (store.game instanceof BrowserGameController && !store.battle.replay)
      rememberMatch(localStorage, store.game);
  },
  renderCardDetailDialog: (powerDetails?: ObservedPowerDetails) =>
    renderCardDetailDialog(store, powerDetails),
  bindCardDetailDialog: (rerender) => {
    bindCardDetailDialog(store, rerender);
  },
  app,
};

const battle = createBattleScreen(store.battle, battleDeps);

function renderGame(): void {
  battle.render();
}

function clearMainSelection(): void {
  battle.clearSelection();
}

/** What the asset controls say under the status line after a load attempt. */
let assetNotice: string | null = null;
/** Why the remembered match could not be resumed, until the next attempt. */
let resumeNotice: string | null = null;
/**
 * Where to go once the gate has its pack: the lobby, or the seat a link named.
 * Null once the gate is passed, which is what tells a later load (a newer pack,
 * from the Configure dialog) to re-render the lobby instead.
 */
let afterAssetGate: (() => void) | null = null;

const assetGateDeps: AssetGateContext = {
  assets: assetSummary,
  loadAssets: async (files) => {
    assetNotice = files.some((file) => /\.zip$/i.test(file.name))
      ? "Unpacking the zip…"
      : `Loading ${files.length} file${files.length === 1 ? "" : "s"}…`;
    rerenderAssets();
    try {
      const before = assetSummary();
      const after = await cacheAssetFiles(files);
      assetNotice =
        after.images === before.images && after.textCards === before.textCards
          ? "Nothing in that pack was recognised. It should hold a printed-text.json and images named by card number."
          : assetsReady()
            ? null
            : "That pack is missing the card images or the printed text; load the zip the Get cards bookmark saved.";
    } catch {
      assetNotice = "That could not be read as an asset pack.";
    }
    applyAssetAnchors();
    const next = afterAssetGate;
    if (next && assetsReady()) {
      afterAssetGate = null;
      next();
      return;
    }
    rerenderAssets();
  },
  assetNotice: () => assetNotice,
};

/** Shows the gate, or the lobby again when a load came from its dialog. */
function rerenderAssets(): void {
  if (afterAssetGate) showAssetGate(afterAssetGate);
  else showHome();
}

/**
 * Nothing is played without the card art and text: until both are in, the
 * gate is the whole app, and `next` runs once they are.
 */
function showAssetGate(next: () => void): void {
  afterAssetGate = next;
  app.innerHTML = assetGateScreen.render(assetGateDeps);
  assetGateScreen.bind(assetGateDeps);
  hydrateIcons();
}

/**
 * The ways to play the landing page offers. 1v1 is the staple; sealed is one
 * format beside it, listed rather than hardcoded so another set's sealed or a
 * limited-time event is an entry here plus a screen, not a rewrite of the
 * page (see ./screens/home.ts).
 */
const homeDeps: HomeContext = {
  assetGate: assetGateDeps,
  resumable: () => {
    const remembered = resumableMatch(localStorage);
    if (!remembered) return null;
    const { config } = remembered.save;
    // Leaders rather than deck ids: "Monkey.D.Luffy vs Eustass Kid" fits a
    // phone's banner where two full deck names do not, and a deck the player
    // built keeps the name they gave it.
    const name = (deck: string): string => {
      const leader = deckLeaderName(deck, store.savedDecks);
      return leader === "—" ? deckLabel(deck, store.savedDecks) : leader;
    };
    return {
      turn: remembered.turn,
      p1Deck: name(config.p1Deck),
      p2Deck: name(config.p2Deck),
    };
  },
  resume: () => {
    const remembered = resumableMatch(localStorage);
    if (!remembered) return;
    resumeNotice = null;
    try {
      resetBattleUiState();
      loadSave(remembered.save);
    } catch (error) {
      // A save from a build whose rules have since changed replays into an
      // illegal action somewhere in the middle. The file was right when it was
      // written; this build simply cannot reach the same position, and the
      // offer is dropped rather than made again on the next visit.
      forgetMatch(localStorage);
      store.game = null;
      resumeNotice = `That match could not be picked up again: ${error instanceof Error ? error.message : String(error)}`;
      showHome();
    }
  },
  resumeNotice: () => resumeNotice,
  modes: [
    {
      id: "1v1",
      icon: "swords",
      title: "1v1 match",
      blurb:
        "Pick two decks, choose an opponent (heuristics or LLM), and play a full match.",
      art: true,
      open: () => {
        showSetup();
      },
    },
    {
      id: "sealed",
      icon: "sparkles",
      title: "Sealed",
      blurb:
        "Open boosters from any supported set, build a 40-card deck, and play a seeded match.",
      art: true,
      open: () => {
        showSealedLobby();
      },
    },
  ],
};

/** Leaving a match for any menu screen abandons the AI's turn loop: bump the
    sequence so a late worker answer is discarded, and drop anything queued. */
function leaveMatch(): void {
  stopClockTick();
  store.battle.replay = null;
  store.battle.simulation = null;
  // A match the player walks away from is a match they are still seated at, as
  // far as the server is concerned -- the clock keeps running. Closing the
  // socket says so plainly rather than leaving it open on a screen nobody is
  // looking at; the seat is still remembered, so they can come back to it.
  if (store.game instanceof OnlineMatch) store.game.close();
  store.battle.agentSession += 1;
  store.battle.workerSequence += 1;
  store.battle.aiPending = false;
  store.battle.prefetchedAiResult = null;
  store.game = null;
  clearMainSelection();
  store.battle.choiceModalHidden = false;
  store.cardDetailCard = null;
  store.cardDetailInstance = null;
}

/**
 * The landing page is the 1v1 lobby.
 *
 * 1v1 is the one mode that ships, so a player lands on it rather than on a
 * choice of one. The fan of modes -- sealed beside 1v1 -- stays
 * as code behind `#modes`, for the formats that are not shipped yet and the
 * tests that drive them; nothing on the page leads there.
 */
function showHome(): void {
  if (window.location.hash !== "#modes") {
    showSetup();
    return;
  }
  leaveMatch();
  app.innerHTML = homeScreen.render(homeDeps);
  // Bound before the icons are hydrated, not after: binding is what points
  // each painted mode card at its image, and a mode with no painting is
  // rewritten there as a composed card whose icon still needs hydrating.
  homeScreen.bind(homeDeps);
  hydrateIcons();
}

/** The lobby's online slice: a seat-link match, and the way back to it. */
const onlineDeps = {
  state: store.online,
  rejoin: () => {
    const seat = heldSeat();
    if (!seat) {
      store.online.heldSeat = false;
      renderSetup();
      return;
    }
    store.online.error = null;
    beginOnlineMatch({ ...seat });
  },
};

const setupDeps: SetupContext = {
  savedDecks: store.savedDecks,
  setupDecks: store.setupDecks,
  online: onlineDeps,
  llmPilotableDeckIds,
  // A box rather than a bare field: the screen both reads and clears this, and
  // it has to outlive its own re-render, so it cannot be a local.
  lastRulesOpponentDeck: {
    get value() {
      return store.lastRulesOpponentDeck;
    },
    set value(next: string | null) {
      store.lastRulesOpponentDeck = next;
    },
  },
  seatPilots: store.seatPilots,
  refreshLobby: () => {
    renderSetup();
  },
  llmAvailable: () => store.llm.capability?.available !== false,
  scorerAvailable: () => __SCORER_AVAILABLE__,
  llmReady: () => llmSettings.ready(store.llm),
  llmProbePending: () => store.llm.capability === null,
  llmUnavailableMessage: () => llmSettings.unavailableMessage(store.llm),
  refreshLlmCapability: () => llmSettings.refreshCapability(store.llm, llmDeps),
  redirectToLlmDocsIfUnreachable: (selectId, fallback) =>
    llmSettings.redirectToDocsIfUnreachable(store.llm, selectId, fallback),
  renderLlmStatus: (visible) =>
    llmSettings.renderStatus(store.llm, visible, { hostSaves: true }),
  saveLlmSettings: () => llmSettings.saveIfChanged(store.llm, llmDeps),
  bindLlmSettings: () => {
    llmSettings.bindSettings(store.llm, llmDeps);
  },
  randomSeed,
  applyTheme,
  beginMatch,
  bindTraceImport: bindImport,
  landing: {
    render: () => homeScreen.renderLanding(homeDeps),
    bind: () => {
      homeScreen.bindLanding(homeDeps);
    },
  },
  simulateMatchup: (games) => {
    showAnalytics();
    analyticsScreen.simulate(store.analytics, analyticsDeps, games);
  },
  editDeck: (target, basedOn) => {
    openDeckEditor(target, basedOn);
  },
  deleteDeck: deleteSavedDeck,
};

/* ---------------------------------------------------------------------------
   Online play
   --------------------------------------------------------------------------- */

/**
 * The clock's second hand.
 *
 * Only the clock is repainted, not the board: a board rebuilt once a second
 * would take any open menu with it. Runs only while an online match is on
 * screen.
 */
let clockTick: number | null = null;

function stopClockTick(): void {
  if (clockTick !== null) window.clearInterval(clockTick);
  clockTick = null;
}

function renderSetup(): void {
  app.innerHTML = setupScreen.render(setupDeps);
  hydrateIcons();
  setupScreen.bind(setupDeps);
}

function showSetup(): void {
  leaveMatch();
  store.online.error = null;
  store.online.connecting = null;
  // A seat held from before -- a refresh, a closed tab, a dropped connection --
  // is the first thing to try. The referee treats a second socket with the same
  // token as a reconnect, so this puts the player back in their game.
  const seat = heldSeat();
  if (seat) {
    beginOnlineMatch({ ...seat });
    return;
  }
  renderSetup();
}

/** Seat the player at a match: from a seat link, or back at a held seat. */
function beginOnlineMatch(assignment: {
  matchId: string;
  seat: PlayerId;
  token: string;
  opponentDeckId: string;
  /** Set when coming back to a held seat, whose deck may not be the one the
      lobby is currently showing. */
  ownDeckId?: string;
}): void {
  const ownDeckId = assignment.ownDeckId ?? store.setupDecks.p1;
  const match = new OnlineMatch({
    matchId: assignment.matchId,
    seat: assignment.seat,
    token: assignment.token,
    ownDeckId,
    opponentDeckId: assignment.opponentDeckId,
    onChange: () => {
      // A match the player has already left behind still gets its messages
      // until the socket closes; they are not about anything on screen.
      if (store.game !== match) return;
      if (match.status === "error") {
        store.online.error = match.error;
        store.online.connecting = null;
        store.game = null;
        stopClockTick();
        // Only when the seat itself is gone -- a refused token, a rules
        // mismatch, a match the server no longer has. A connection that
        // dropped is not that: the referee holds the seat for its token while
        // the clock runs, so the seat stays and the lobby offers it back.
        // Throwing it away here was how a flaky network became a loss.
        if (match.seatLost) rememberSeat(null);
        store.online.heldSeat = heldSeat() !== null;
        match.close();
        renderSetup();
        return;
      }
      // A finished match is no longer a seat to come back to, but it stays on
      // screen: the result modal is the only thing that says how it ended, since
      // a resignation or a timeout leaves the position looking playable.
      if (match.status === "finished") {
        rememberSeat(null);
        store.online.heldSeat = false;
        stopClockTick();
        if (match.ready) {
          renderGame();
          return;
        }
        // Ended before a position ever arrived -- a no-show against an opponent
        // who never appeared. There is no board to draw it on.
        store.online.connecting = null;
        store.online.error =
          match.result?.reason === "no-show"
            ? "Your opponent never sat down."
            : "That match is over.";
        store.game = null;
        renderSetup();
        return;
      }
      if (match.status === "reconnecting") {
        store.online.connecting = "connecting";
        renderSetup();
        return;
      }
      // Nothing to draw a board with yet: the lobby holds the screen and says
      // what the match is waiting for.
      if (!match.ready || match.status === "waiting-for-opponent") {
        store.online.connecting =
          match.status === "waiting-for-opponent"
            ? "waiting-for-opponent"
            : "connecting";
        renderSetup();
        return;
      }
      store.online.connecting = null;
      // Not `renderGame`: a frame is an action arriving, and the board has to be
      // told whose it was before it redraws over it.
      battle.absorbFrame();
      // A refusal is reported after the board is correct again, the same way the
      // local board reports an engine error -- and over a board the player can
      // carry on from, rather than by sending them back to the lobby.
      const refused = match.takeRefusal();
      if (refused) window.alert(refused);
    },
  });
  resetBattleUiState();
  store.online.connecting = "connecting";
  store.online.error = null;
  store.game = match;
  // Remembered before connecting, so a refresh during the handshake still finds
  // the seat.
  rememberSeat({
    matchId: assignment.matchId,
    seat: assignment.seat,
    token: assignment.token,
    ownDeckId,
    opponentDeckId: assignment.opponentDeckId,
  });
  store.online.heldSeat = true;
  match.connect();
  stopClockTick();
  clockTick = window.setInterval(() => {
    if (store.game === match) battle.tickClock();
  }, 1000);
  applyTheme();
  renderSetup();
}

/** Pull the lobby's two deck fields into {@link Store.setupDecks}. */
function readDeckSelects(): void {
  store.setupDecks.p1 = valueOfOptional("p1-deck") ?? store.setupDecks.p1;
  store.setupDecks.p2 = valueOfOptional("p2-deck") ?? store.setupDecks.p2;
}

/** Starts `config` and switches to the board. Shared by the constructed lobby
    and sealed mode, which build their `MatchConfig` very differently but both
    land here to reset the same per-match UI state. */
/**
 * Clear the per-match UI, whoever is about to referee the match.
 *
 * Shared by the local lobby and the online one: a stale notice or a leftover
 * selection from the previous game is the same bug either way.
 */
function resetBattleUiState(): void {
  store.battle.llmDebugRecords.splice(0);
  store.battle.prefetchedAiResult = null;
  store.battle.opponentNotice = null;
  store.battle.lookNotice = null;
  clearMainSelection();
  store.battle.choiceModalHidden = false;
  store.cardDetailCard = null;
  store.cardDetailInstance = null;
}

function beginMatch(config: MatchConfig): void {
  store.game = new BrowserGameController(config);
  // A match with an agent in both seats is one nobody at this page is playing,
  // so the board watches it rather than waiting on it. Read off the config
  // rather than passed in, so every route to a match answers it the same way.
  store.battle.simulation = beginSimulation(config);
  resetBattleUiState();
  applyTheme();
  renderGame();
}

/**
 * Open the deck editor for one seat.
 *
 * `basedOn` is the deck to load: a saved deck opens as itself, and a format
 * deck opens as a copy to build from -- which is how the lobby's picker doubles
 * as a way to read a preset list. Without it the editor opens empty, with no
 * Leader and no cards: "build your own deck" used to start as a copy of
 * whatever was selected, which meant deleting fifty cards before adding one.
 */
function openDeckEditor(target: PlayerId, basedOn?: string): void {
  readDeckSelects();
  store.editor.target = target;
  const saved = basedOn ? store.savedDecks[basedOn] : undefined;
  const manifest =
    basedOn && !saved ? deckManifests[basedOn] : (saved?.deck ?? undefined);
  store.editor.deck = manifest
    ? { leader: manifest.leader, cards: { ...manifest.cards } }
    : { leader: "", cards: {} };
  store.editor.savedDeckId = saved && basedOn ? basedOn : null;
  // Null, not the saved deck's own pick, whenever that deck had none: null is
  // "follow the Leader", and a deck saved before the choice existed -- or a
  // preset opened to build from -- should keep doing exactly that.
  store.editor.dossier = saved?.dossier ?? null;
  // Named only when the deck already has a name of its own. A copy of a preset,
  // like a deck from scratch, is named in the save dialog.
  store.editor.deckName = saved?.name ?? "";
  store.editor.filter = { ...EMPTY_CATALOG_FILTER };
  closeCatalogMenus();
  store.editor.message = "";
  store.editor.nameMessage = "";
  store.editor.replaceConfirmedFor = null;
  store.editor.nameDialogOpen = false;
  // No Leader means no card pool, so a deck started from nothing opens on the
  // choice of how to get one, ahead of the editor itself.
  store.editor.stage = store.editor.deck.leader ? "edit" : "choose";
  store.editor.leaderDialogOpen = false;
  store.cardDetailCard = null;
  store.cardDetailInstance = null;
  store.editor.catalogScrollTop = 0;
  renderEditor();
}

/* ---------------------------------------------------------------------------
   Sealed mode

   The page itself lives in ./screens/sealed.ts; this is the wiring that
   gives it the store slice it owns plus the shared pieces (LLM capability,
   the shared dialogs, match launch, navigation) it does not.
   ------------------------------------------------------------------------ */

const sealedDeps: SealedContext = {
  llmUnreachable,
  llmReady: () => llmSettings.ready(store.llm),
  llmAvailable: () => store.llm.capability?.available !== false,
  llmUnavailableMessage: () => llmSettings.unavailableMessage(store.llm),
  refreshLlmCapability: () => llmSettings.refreshCapability(store.llm, llmDeps),
  redirectToLlmDocsIfUnreachable: (selectId) =>
    llmSettings.redirectToDocsIfUnreachable(store.llm, selectId),
  renderLlmStatus: (visible) => llmSettings.renderStatus(store.llm, visible),
  bindLlmSettings: () => {
    llmSettings.bindSettings(store.llm, llmDeps);
  },
  renderCardDetailDialog: (powerDetails?: ObservedPowerDetails) =>
    renderCardDetailDialog(store, powerDetails),
  bindCardDetailDialog: (rerender) => {
    bindCardDetailDialog(store, rerender);
  },
  renderImportDialog: () => renderImportDialog(store),
  bindImportDialog: (hostRerender, onImported) => {
    bindImportDialog(store, hostRerender, onImported);
  },
  openImportDialog: () => {
    store.importTarget = "sealed";
    store.importDialogOpen = true;
    store.importMessage = "";
  },
  applyTheme,
  beginMatch,
  randomSeed,
  learnedSealedPolicyAvailable: () => __LEARNED_SEALED_POLICY_AVAILABLE__,
  rerender: () => {
    if (store.sealed.run) renderSealedBuilder();
    else showSealedLobby();
  },
  goHome,
};

function showSealedLobby(): void {
  store.game = null;
  clearMainSelection();
  store.sealed.message = "";
  app.innerHTML = sealedScreen.renderLobby(store.sealed, sealedDeps);
  hydrateIcons();
  sealedScreen.bindLobby(store.sealed, sealedDeps);
}

function renderSealedBuilder(): void {
  if (!store.sealed.run) {
    showSealedLobby();
    return;
  }
  store.sealed.catalogScrollTop =
    document.querySelector<HTMLElement>(".card-catalog")?.scrollTop ??
    store.sealed.catalogScrollTop;
  sealedScreen.normalizeOpponentController(store.sealed, sealedDeps);
  app.innerHTML = sealedScreen.renderBuilder(store.sealed, sealedDeps);
  hydrateIcons();
  sealedScreen.bindBuilder(store.sealed, sealedDeps);
  const catalog = document.querySelector<HTMLElement>(".card-catalog");
  if (catalog) catalog.scrollTop = store.sealed.catalogScrollTop;
}

const editorDeps: EditorContext = {
  savedDecks: store.savedDecks,
  setupDecks: store.setupDecks,
  renderCardDetailDialog: (powerDetails?: ObservedPowerDetails) =>
    renderCardDetailDialog(store, powerDetails),
  bindCardDetailDialog: (rerender) => {
    bindCardDetailDialog(store, rerender);
  },
  clearCardDetail: () => {
    store.cardDetailCard = null;
    store.cardDetailInstance = null;
  },
  renderImportDialog: () => renderImportDialog(store),
  bindImportDialog: (hostRerender, onImported) => {
    bindImportDialog(store, hostRerender, onImported);
  },
  openImportDialog: () => {
    store.importTarget = "editor";
    store.importDialogOpen = true;
    store.importMessage = "";
  },
  nextCustomDeckId,
  persistSavedDecks,
  forgetSimulatedFor: (deckId) => {
    analyticsScreen.forgetSimulated(
      store.analytics,
      (game) => game.firstDeck === deckId || game.secondDeck === deckId,
    );
  },
  rerender: renderEditor,
  goToSetup: showSetup,
};

function renderEditor(): void {
  if (!store.editor.target || !store.editor.deck) {
    showSetup();
    return;
  }
  store.editor.catalogScrollTop =
    document.querySelector<HTMLElement>(".card-catalog")?.scrollTop ??
    store.editor.catalogScrollTop;
  const { theme, secondaryTheme } = editorScreen.editorTheme(store.editor);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themeSecondary = secondaryTheme;
  document.documentElement.dataset.themeDual = String(theme !== secondaryTheme);
  app.innerHTML = editorScreen.render(store.editor, editorDeps);
  hydrateIcons();
  editorScreen.bind(store.editor, editorDeps);
  const catalog = document.querySelector<HTMLElement>(".card-catalog");
  if (catalog) catalog.scrollTop = store.editor.catalogScrollTop;
}

/* ---------------------------------------------------------------------------
   Matchup analytics

   The lobby picks two decks; this page plays the games the reader picks between them in
   the analytics worker, both turn orders, and reads the result. The decks are
   changed only in the lobby, so the page has no selects of its own.

   The page itself lives in ./screens/analytics.ts; this is the wiring that
   gives it the store slice it owns plus the shared pieces (the card-detail
   dialog, navigation) it does not.
   ------------------------------------------------------------------------ */

const analyticsDeps: AnalyticsContext = {
  setupDecks: store.setupDecks,
  savedDecks: store.savedDecks,
  renderCardDetailDialog: (powerDetails?: ObservedPowerDetails) =>
    renderCardDetailDialog(store, powerDetails),
  bindCardDetailDialog: (rerender) => {
    bindCardDetailDialog(store, rerender);
  },
  rerender: renderAnalytics,
  goToSetup: showSetup,
  randomSeed,
  scorerAvailable: () => __SCORER_AVAILABLE__,
};

function showAnalytics(): void {
  store.game = null;
  clearMainSelection();
  readDeckSelects();
  renderAnalytics();
}

function renderAnalytics(): void {
  app.innerHTML = analyticsScreen.render(store.analytics, analyticsDeps);
  hydrateIcons();
  analyticsScreen.bind(store.analytics, analyticsDeps);
  applyTheme();
}

/**
 * A file that has been read and parsed, waiting on the one thing the file
 * cannot say: whether it is to be played on from or watched back.
 */
let pendingImport: {
  match: SavedMatch;
  llmRecords: readonly RawLlmRecord[];
  review: ScorerReview | null;
} | null = null;

function bindImport(buttonSelector: string, inputSelector: string): void {
  const input = document.querySelector<HTMLInputElement>(inputSelector);
  document.querySelector(buttonSelector)?.addEventListener("click", () => {
    input?.click();
  });
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file)
      void file
        .text()
        .then((text) => {
          pendingImport = {
            ...inspectExportedMatch(text),
            review: parseScorerReview(text),
          };
          askHowToLoad(pendingImport.match);
        })
        .catch((error: unknown) => {
          window.alert(error instanceof Error ? error.message : String(error));
        });
    // Cleared so that picking the same file twice in a row still fires a
    // change event, which is the only signal this input gives.
    input.value = "";
  });
  document.querySelector("#trace-pilot")?.addEventListener("click", () => {
    const imported = pendingImport;
    pendingImport = null;
    toggleAppDialog("trace-load-choice", false);
    if (imported) loadSave(imported.match, imported.llmRecords);
  });
  document.querySelector("#trace-replay")?.addEventListener("click", () => {
    const imported = pendingImport;
    pendingImport = null;
    toggleAppDialog("trace-load-choice", false);
    if (imported)
      loadReplay(imported.match, imported.llmRecords, imported.review);
  });
}

/** The dialog, with the file it is about named in it. */
function askHowToLoad(save: SavedMatch): void {
  const summary = document.querySelector("#trace-choice-summary");
  if (summary) {
    const count = save.actions.length;
    summary.textContent = `${deckLabel(save.config.p1Deck, store.savedDecks)} against ${deckLabel(save.config.p2Deck, store.savedDecks)} — ${String(count)} action${count === 1 ? "" : "s"}.`;
  }
  toggleAppDialog("trace-load-choice", true);
}

function loadSave(
  save: SavedMatch,
  importedRecords: readonly RawLlmRecord[] = [],
): void {
  store.battle.replay = null;
  store.battle.agentSession += 1;
  store.battle.workerSequence += 1;
  store.battle.aiPending = false;
  store.battle.prefetchedAiResult = null;
  store.battle.llmDebugRecords.splice(
    0,
    store.battle.llmDebugRecords.length,
    ...importedRecords,
  );
  store.game = BrowserGameController.load(save);
  store.battle.simulation = beginSimulation(save.config);
  store.battle.aiPaused = false;
  store.battle.opponentNotice = null;
  store.battle.lookNotice = null;
  clearMainSelection();
  store.cardDetailCard = null;
  store.cardDetailInstance = null;
  // A loaded diagnostics export is usually being loaded *to read the calls*,
  // so open the history when it has any: the calls are in it, under the steps
  // they chose.
  store.battle.historyOpen = importedRecords.length > 0;
  renderGame();
}

/**
 * Open a trace as a spectator: the same match, wound back to before its first
 * action, with the file's action list beside it for the board to play back.
 *
 * Loaded and then wound back rather than dealt and left empty, because loading
 * is what proves the file replays under this build at all -- a stale trace says
 * so here, in one sentence, instead of stopping halfway through a game someone
 * is watching.
 */
function loadReplay(
  save: SavedMatch,
  importedRecords: readonly RawLlmRecord[] = [],
  review: ScorerReview | null = null,
): void {
  let controller: BrowserGameController;
  try {
    controller = BrowserGameController.load(save);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
    return;
  }
  const turns = replayTurnStarts(controller.trace().checkpoints);
  controller.rewindTo(0);
  store.game = controller;
  store.battle.simulation = null;
  store.battle.replay = {
    actions: [...save.actions],
    turns,
    playing: false,
    viewer: replayViewer(save.config),
    review,
    flags: [],
    hideOtherHand: false,
    flagging: null,
  };
  store.battle.agentSession += 1;
  store.battle.workerSequence += 1;
  store.battle.aiPending = false;
  store.battle.prefetchedAiResult = null;
  store.battle.aiPaused = false;
  store.battle.llmDebugRecords.splice(
    0,
    store.battle.llmDebugRecords.length,
    ...importedRecords,
  );
  store.battle.opponentNotice = null;
  store.battle.lookNotice = null;
  store.battle.historyOpen = false;
  clearMainSelection();
  store.cardDetailCard = null;
  store.cardDetailInstance = null;
  applyTheme();
  renderGame();
}

/**
 * Sit down at `seat` in the position on screen and play the rest, out of
 * either a replay or a simulation.
 *
 * A new controller rather than a flag on this one: which seat is a person's is
 * part of the match config, and the config is what the agents, the board and a
 * trace exported afterwards all read. The actions applied so far are replayed
 * into it, so the position is the one on screen -- and the rest of the file,
 * where there is one, is simply not played.
 */
function takeSeat(seat: PlayerId): void {
  const game = store.game;
  if (!(game instanceof BrowserGameController)) return;
  if (!store.battle.replay && !store.battle.simulation) return;
  const played = game.save().actions;
  const resumed = new BrowserGameController(takeoverConfig(game.config, seat));
  for (const actionId of played) resumed.act(actionId);
  store.game = resumed;
  store.battle.replay = null;
  store.battle.simulation = null;
  store.battle.agentSession += 1;
  store.battle.workerSequence += 1;
  store.battle.aiPending = false;
  store.battle.prefetchedAiResult = null;
  store.battle.aiPaused = false;
  store.battle.opponentNotice = null;
  store.battle.automaticNotice = null;
  store.battle.lookNotice = null;
  clearMainSelection();
  applyTheme();
  renderGame();
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !store.battle.mainSelection) return;
  // Escape steps back one level, the same distance Cancel does: out of the
  // board that is being aimed at first, and only then out of the selection.
  if (store.battle.targetMode) store.battle.targetMode = null;
  else clearMainSelection();
  renderGame();
});

/**
 * Hands the loaded pack to the AI worker, which cannot read one for itself.
 *
 * A worker is a separate realm, so the text this thread loaded is not text it
 * holds: an LLM seat builds its own deck list there, from the manifest, and
 * without this it went out as names and stats -- while the engine, on this
 * thread, put the words of every *visible* card in the same prompt. The seat
 * read its opponent's cards and not its own.
 *
 * Posted on every change rather than with each decision: the pack is the whole
 * card pool, the decisions are hundreds a match, and `LlmAgent` renders its
 * deck list once when it is constructed. Worker messages are delivered in
 * order, so a pack loaded before the match starts is in place before the first
 * decision asks for it.
 */
function postPrintedText(): void {
  const printedText = loadedPrintedTextPack();
  if (Object.keys(printedText).length === 0) return;
  store.worker.postMessage({ printedText });
}

// Text arriving mid-match -- a pack loaded in another tab, or restored late --
// changes what every open card popup and Counter chip should say, and is text
// the worker's agents have to be told about.
onPrintedTextChange(() => {
  postPrintedText();
  if (store.game) renderGame();
});

/**
 * A seat link: `/play#m=<match>&s=<seat>&t=<token>`.
 *
 * This is "play a friend from a link" -- one person builds a match and sends the
 * other their half. The token is in the fragment rather than the query so it
 * stays out of request logs and `Referer` headers on the way, and it is read
 * here and then wiped from the address bar, so a screenshot of the tab does not
 * hand the seat to whoever sees it.
 */
function seatFromLink(): {
  matchId: string;
  seat: PlayerId;
  token: string;
} | null {
  // A build with no match server cannot sit at any seat, and a link naming one
  // is a link copied off the deploy that issued it. Left in the address bar
  // rather than consumed and wiped, so it is still there to paste where it
  // works.
  if (!onlineAvailable()) return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const matchId = params.get("m");
  const seat = params.get("s");
  const token = params.get("t");
  if (!matchId || !token || (seat !== "p1" && seat !== "p2")) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return { matchId, seat, token };
}

/* Before the browser's own cache is read, so a pack the player imported still
   overrides a bundled build's text card for card. */
loadBuiltInPrintedText();

void restoreCachedAssets().then(() => {
  // Read before the gate, because reading it wipes it from the address bar: a
  // player who follows a seat link before loading a pack still lands at that
  // seat once the pack is in.
  const link = seatFromLink();
  const start = (): void => {
    if (!link) {
      goHome();
      return;
    }
    // Straight to the board. The deck ids are the match's to state -- they
    // arrive in `welcome` -- so the lobby has nothing to ask about first.
    beginOnlineMatch({ ...link, opponentDeckId: "" });
  };
  if (assetsReady()) start();
  else showAssetGate(start);
});
