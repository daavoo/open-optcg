import type { PlayerId } from "@one-piece-sim/protocol";
import { escapeHtml } from "../card-text.js";
import {
  DEFAULT_RUN_GAMES,
  RUN_GAME_OPTIONS,
  type RunGames,
} from "./analytics.js";
import {
  newLocalMatch,
  type ControllerKind,
  type MatchConfig,
} from "../controller.js";
import type { SavedDeck } from "../deck-labels.js";
import {
  bindDeckPickerShelves,
  deckChoiceButton,
  deckPickerDialog,
} from "../deck-select.js";
import { bindAppDialogDismissal, toggleAppDialog } from "../dialogs.js";
import { hydrateIcons, icon } from "../icons.js";
import { valueOf } from "../dom.js";
import * as footer from "./footer.js";

/**
 * The 1v1 lobby: two decks, who plays each, and the seed.
 *
 * It owns no state of its own -- the deck picks live in the root store
 * because the analytics page shows the same two selects. What is local to this
 * screen is entirely in the DOM (the seed field, the starting-player select),
 * read back on submit.
 */
/** Who plays a seat: the person at this screen, or an agent. */
export type SeatPilot = "you" | "ai";

export interface SetupContext {
  savedDecks: Record<string, SavedDeck>;
  setupDecks: Record<PlayerId, string>;
  /** Write `setupDecks` to storage, so the next visit opens on these picks. */
  persistSetupDecks(): void;
  /**
   * Who plays each seat: the person at this screen, or an agent.
   *
   * Both seats, because either can be either. Two agents is a match to watch;
   * two people is one table and two players taking it in turns, which the
   * board already supports -- it draws whichever seat is active, and hidden
   * information stays hidden from the other one.
   *
   * Held in the root store for the reason the deck picks are: it is the
   * choice a player comes back to, and a screen module that owned it would
   * forget it on every re-render.
   */
  seatPilots: Record<PlayerId, SeatPilot>;
  /** Redraw the lobby. The pilot choice changes the whole form -- both column
      headings, the opponent's pilot card and the word on the start cell -- so
      it is a repaint rather than four elements patched in place. */
  refreshLobby(): void;
  /** Whether this build carries the learned scorer, see `__SCORER_AVAILABLE__`. */
  scorerAvailable(): boolean;

  randomSeed(): string;
  applyTheme(): void;
  beginMatch(config: MatchConfig): void;
  bindTraceImport(buttonSelector: string, inputSelector: string): void;

  /**
   * What the landing page prints around the lobby: the match to pick back up
   * above the decks, and the asset pack setting for the Configure dialog (see
   * renderLanding in home.ts). The lobby *is* the
   * landing page -- 1v1 is the one mode that ships -- so the pieces that used
   * to have a page of their own are printed here. Optional, because the
   * lobby is also reached from the deck editor and the analytics page, where
   * neither belongs.
   */
  landing?: {
    render(): { above: string; settings: string };
    bind(): void;
  };
  /** Opens the matchup analytics page on the two decks this form has picked,
      already playing `games` of them. */
  simulateMatchup(games: RunGames): void;
  /** Opens the deck editor for `target`. With `basedOn`, that deck is loaded
      to read or to build from; without it, the editor starts empty. */
  editDeck(target: PlayerId, basedOn?: string): void;
  /** Forgets a deck the player saved, and anything that pointed at it. Only a
      saved deck is ever passed: a format deck is not the player's to remove. */
  deleteDeck(deckId: string): void;
}

/**
 * The agent an AI seat gets: the learned model wherever the build carries one,
 * as the strongest pilot there is, and the rules agent only in a build without
 * it. The player never picks between them -- the rules agents are a
 * development tool, reached from the CLI.
 */
function browserAgent(ctx: SetupContext): ControllerKind {
  return ctx.scorerAvailable() ? "scorer" : "rules";
}

/** Each seat's pilot is chosen on its heading, but the match config reads
    both off the form, so each travels as a hidden field. */
function fixedControllerField(id: string, kind: ControllerKind): string {
  return `<input type="hidden" id="${id}" value="${kind}" />`;
}

/**
 * A seat's heading, which is also the choice of who plays it.
 *
 * The heading is nothing but the choice: which side of the seam a deck sits
 * on already says whose it is, so the two words carry the column on their
 * own, lettered like the versus mark between them. The word that is not in
 * force is dimmed rather than boxed -- the choice is legible at a glance and
 * costs the drawing nothing.
 *
 * Either seat takes either answer. Two agents is a match to watch or a run to
 * simulate; two people is one screen passed between them.
 */
function renderSeatHeading(seat: PlayerId, pilot: SeatPilot): string {
  const side = seat === "p1" ? "left" : "right";
  const option = (value: SeatPilot, label: string, title: string): string =>
    `<button class="seat-pilot-option${pilot === value ? " picked" : ""}" type="button" data-seat-pilot="${seat}" data-pilot="${value}" aria-pressed="${String(pilot === value)}" title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
  return `<p class="deck-column-label seat-heading">
    <span class="seat-pilot" role="group" aria-label="Who plays the ${side} deck">
      ${option("you", "You", `Play the ${side} deck yourself`)}<span class="seat-pilot-slash" aria-hidden="true">/</span>${option("ai", "AI", `Let an agent play the ${side} deck`)}
    </span>
  </p>`;
}

export function render(ctx: SetupContext): string {
  const pilots = ctx.seatPilots;
  const landing = ctx.landing?.render() ?? {
    above: "",
    settings: "",
  };
  const simulating = pilots.p1 === "ai" && pilots.p2 === "ai";
  const start = renderStartCell(simulating);
  return `
    <main class="setup-shell">
      <div class="lobby-main">
        ${landing.above}
        <form class="setup-form lobby-form" id="setup-form">
          <div class="deck-columns lobby-columns">
            <div class="deck-column" data-seat="p1">
              ${renderSeatHeading("p1", pilots.p1)}
              ${deckChoiceButton(ctx.savedDecks, "p1", ctx.setupDecks.p1)}
            </div>
            ${renderSeam()}
            <div class="deck-column" data-seat="p2">
              ${renderSeatHeading("p2", pilots.p2)}
              ${deckChoiceButton(ctx.savedDecks, "p2", ctx.setupDecks.p2)}
            </div>
          </div>
          ${renderHub(start)}
          ${fixedControllerField("p1-controller", pilots.p1 === "ai" ? browserAgent(ctx) : "human")}
          ${fixedControllerField("p2-controller", pilots.p2 === "ai" ? browserAgent(ctx) : "human")}
          <input type="file" id="trace-input" accept=".json,.jsonl,application/json" hidden />
        </form>
      </div>
      ${footer.render()}
      ${renderOwnPicker(ctx)}
      ${renderOpponentPicker(ctx)}
      ${renderMatchupDialog(ctx, landing.settings)}
      ${renderTraceChoiceDialog()}
      ${simulating ? renderAgentsChoiceDialog() : ""}
    </main>`;
}

/**
 * What a loaded trace is for: playing on from where it stopped, or watching it
 * back.
 *
 * Asked after the file is picked rather than as two buttons in the hub,
 * because it is one question about one file -- and the answer is not a
 * property of the trace: the same agent-versus-agent game is worth watching
 * and worth taking over. The summary line is written in when the file is read;
 * the dialog itself ships empty because nothing has been picked yet.
 */
function renderTraceChoiceDialog(): string {
  return `<div class="app-dialog-backdrop" id="trace-load-choice" hidden>
    <div class="app-dialog trace-choice" role="dialog" aria-modal="true" aria-labelledby="trace-choice-title">
      <h2 id="trace-choice-title">Load this match</h2>
      <p class="muted" id="trace-choice-summary"></p>
      <div class="trace-choice-options">
        <button class="primary" type="button" id="trace-pilot">${icon("play", "")}Pilot it</button>
        <button class="secondary" type="button" id="trace-replay">${icon("eye", "")}Watch it back</button>
      </div>
      <p class="muted trace-choice-note">Piloting drops you in at the end of the file, playing your own seat. Watching plays the file back from the start with both hands face up, and you can take a seat at any point.</p>
      <button class="text-button" type="button" data-close-dialog="trace-load-choice">Cancel</button>
    </div>
  </div>`;
}

/**
 * What two agents are for: one game to watch, or a run of them to read the
 * pairing from.
 *
 * Asked when the play cell is pressed rather than offered as a cell of its
 * own, because both answers start from the same two decks and the same two
 * agents -- the difference is how many games, and whether anyone looks at
 * them one by one.
 */
function renderAgentsChoiceDialog(): string {
  const games = DEFAULT_RUN_GAMES;
  const size = (option: RunGames): string =>
    `<button class="run-size-option${option === games ? " picked" : ""}" type="button" data-simulate-size="${option}" aria-pressed="${String(option === games)}">${option}</button>`;
  return `<div class="app-dialog-backdrop" id="agents-choice" hidden>
    <div class="app-dialog agents-choice" role="dialog" aria-modal="true" aria-labelledby="agents-choice-title">
      <h2 id="agents-choice-title">AI vs AI</h2>
      <div class="trace-choice-options">
        <button class="secondary" type="button" id="agents-watch">${icon("eye", "")}Watch 1 game</button>
        <button class="primary" type="button" id="agents-simulate" data-games="${games}">${icon("chart-column", "")}<span>Simulate ${games} games</span></button>
      </div>
      <p class="agents-choice-size">Games to simulate <span class="run-size" role="group" aria-label="Games to simulate">${RUN_GAME_OPTIONS.map(size).join("")}</span></p>
      <p class="muted agents-choice-note">Watching plays one game on the board, both hands face up. Simulating plays the pairing in the background and reports who wins it and which cards carried it.</p>
      <button class="text-button" type="button" data-close-dialog="agents-choice">Cancel</button>
    </div>
  </div>`;
}

/**
 * The seam between the two seats.
 *
 * A painted mark rather than type, and the one piece of the page that says what
 * the two cards are to each other. It is an anchor like every other painted
 * surface (`--art-vs`, docs/art-anchors.md), so a build without the image draws
 * the two letters instead and the layout does not move.
 */
function renderSeam(): string {
  return `<span class="lobby-vs" role="img" aria-label="versus"></span>`;
}

/**
 * The lobby's controls, as the same honeycomb the board wears, in the same
 * place: a cluster at the middle of the right edge, three cells hanging off the
 * mark's left faces.
 *
 * The board is what a player sees for the rest of the session, so the lobby
 * puts its controls where the board keeps them -- configure on the upper
 * diagonal, the command on the flat face, the trace cell on the lower one --
 * and starting a match is the command cell. The mark is the middle cell and is
 * not a button: the lobby has no topbar, so there is nowhere for a second mark
 * to go.
 *
 * Simulating the pairing has no cell: it is one of the two things a match
 * between two agents can be, so it is asked for when the play cell is pressed
 * with AI on both seats.
 */
function renderHub(startCell: string): string {
  return `<div class="lobby-hub board-hub" role="group" aria-label="Match controls">
    <span class="hub-brand" aria-hidden="true"><svg class="brand-mark"><use href="#brand-hex" /></svg></span>
    <button class="hub-face hub-configure" type="button" id="open-matchup-config" title="Configure matchup">${icon("settings", "Configure matchup")}</button>
    ${startCell}
    <button class="hub-face hub-load hub-trace" type="button" id="load-trace" title="Load match from trace">${icon("file-up", "Load match from trace")}</button>
  </div>`;
}

/**
 * The play cell on the hub's flat face: one word on the cell, the title saying
 * what pressing it does, and a wrapper so the cell sits on the mark's flat face
 * the way the board's End turn does (`.hub-command`, shell.css).
 *
 * With nobody at the table it does not start a match anyone is in, it asks
 * what two agents are to do.
 */
function renderStartCell(simulating: boolean): string {
  const label = simulating ? "AI vs AI" : "Start match";
  return `<span class="hub-command"><button class="hub-face hub-play" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" type="submit">Play</button></span>`;
}

function renderOwnPicker(ctx: SetupContext): string {
  return deckPickerDialog(
    ctx.savedDecks,
    "p1",
    "Your deck",
    ctx.setupDecks.p1,
    {
      offerBuilder: true,
    },
  );
}

/** The opponent's picker, re-rendered on its own when a deck goes away. */
function renderOpponentPicker(ctx: SetupContext): string {
  return deckPickerDialog(
    ctx.savedDecks,
    "p2",
    "Opponent deck",
    ctx.setupDecks.p2,
    {
      offerBuilder: true,
    },
  );
}

/**
 * Everything about the match that is not a deck or a pilot: who goes first,
 * and the seed.
 *
 * In a dialog rather than on the form, because these are the settings a
 * player changes once and then leaves alone, while the decks are what they come
 * back to change every match. The fields keep their ids -- the submit handler
 * reads them by id, from wherever they are on the page.
 */
function renderMatchupDialog(
  ctx: SetupContext,
  /** The asset pack, as a setting: what the landing page hands this dialog. */
  assets: string,
): string {
  return `<div class="app-dialog-backdrop" id="matchup-config" hidden>
    <div class="app-dialog" role="dialog" aria-modal="true" aria-label="Configure matchup">
      <div class="app-dialog-head">
        <h2>Configure matchup</h2>
        <button class="text-button" type="button" data-close-dialog="matchup-config">${icon("x", "Close")}Close</button>
      </div>
      <label>Starting player
        <select id="starting-player">
          <option value="random">Seeded random</option>
          <option value="p1">Left deck</option>
          <option value="p2">Right deck</option>
        </select>
      </label>
      <label>Seed
        <input id="seed" value="${ctx.randomSeed()}" spellcheck="false" />
      </label>
      ${assets}
      <div class="app-dialog-actions">
        <button class="primary" type="button" id="matchup-done" data-close-dialog="matchup-config">${icon("check", "Done")}Done</button>
      </div>
    </div>
  </div>`;
}

/**
 * Point a seat at a deck: the hidden field the form reads, the button that
 * shows the choice, and the mat colours that follow from the Leader.
 */
function setDeck(ctx: SetupContext, seat: PlayerId, deckId: string): void {
  ctx.setupDecks[seat] = deckId;
  ctx.persistSetupDecks();
  const field = document.querySelector<HTMLInputElement>(`#${seat}-deck`);
  if (field) field.value = deckId;
  const choice = field?.closest(".deck-choice");
  if (choice) {
    choice.outerHTML = deckChoiceButton(ctx.savedDecks, seat, deckId);
    bindDeckChoice(ctx, seat);
  }
  document
    .querySelectorAll<HTMLElement>(`#${seat}-deck-picker [data-pick-deck]`)
    .forEach((tile) => {
      const picked = tile.dataset.deckId === deckId;
      tile.classList.toggle("picked", picked);
      tile.setAttribute("aria-pressed", String(picked));
    });
  ctx.applyTheme();
}

/**
 * Re-render one seat's grid and rebind it, for whatever it still contains.
 */
function refreshPicker(ctx: SetupContext, seat: PlayerId): void {
  const picker = document.querySelector(`#${seat}-deck-picker`);
  if (!picker) return;
  const wasOpen = !picker.hasAttribute("hidden");
  picker.outerHTML =
    seat === "p2" ? renderOpponentPicker(ctx) : renderOwnPicker(ctx);
  bindPicker(ctx, seat);
  // `icon()` emits a placeholder that lucide swaps for an `<svg>`, and this
  // markup is new since the page was hydrated -- without this the re-rendered
  // dialog's Close and edit buttons lose their glyphs.
  hydrateIcons();
  if (wasOpen) toggleAppDialog(`${seat}-deck-picker`, true);
  ctx.applyTheme();
}

function bindDeckChoice(ctx: SetupContext, seat: PlayerId): void {
  document
    .querySelector(`[data-open-picker="${seat}"]`)
    ?.addEventListener("click", () => {
      toggleAppDialog(`${seat}-deck-picker`, true);
    });
}

/**
 * Wire one seat's picker: the shelf tabs and their filters, a tile sets the
 * deck and closes, the builder tile hands over to the deck editor.
 */
function bindPicker(ctx: SetupContext, seat: PlayerId): void {
  const picker = document.querySelector(`#${seat}-deck-picker`);
  if (!picker) return;
  bindDeckPickerShelves(picker);
  picker.querySelectorAll<HTMLElement>("[data-pick-deck]").forEach((tile) => {
    tile.addEventListener("click", () => {
      setDeck(ctx, seat, tile.dataset.deckId ?? ctx.setupDecks[seat]);
      toggleAppDialog(`${seat}-deck-picker`, false);
    });
  });
  picker.querySelectorAll<HTMLElement>("[data-edit-deck]").forEach((tile) => {
    tile.addEventListener("click", () => {
      // A tile's pencil opens that deck; the builder tile carries no deck id
      // and so opens an empty editor.
      ctx.editDeck(tile.dataset.editDeck as PlayerId, tile.dataset.deckId);
    });
  });
  picker.querySelectorAll<HTMLElement>("[data-delete-deck]").forEach((bin) => {
    bin.addEventListener("click", () => {
      const deckId = bin.dataset.deleteDeck;
      if (!deckId) return;
      const label = ctx.savedDecks[deckId]?.name ?? deckId;
      // Asked, because there is no undo: the deck lives in this browser's
      // storage and nothing else has a copy of it.
      if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
      ctx.deleteDeck(deckId);
      // Either seat can have been set to the deck that just went away, and
      // both grids still list it, so both are rebuilt from what is left.
      for (const target of ["p1", "p2"] as const) {
        setDeck(ctx, target, ctx.setupDecks[target]);
        refreshPicker(ctx, target);
      }
    });
  });
}

/**
 * Pressing play. Two agents are asked what they are for first -- one game to
 * watch, or a run to simulate -- and anything else starts at once.
 */
function submitForm(ctx: SetupContext, event: Event): void {
  event.preventDefault();
  if (ctx.seatPilots.p1 === "ai" && ctx.seatPilots.p2 === "ai") {
    toggleAppDialog("agents-choice", true);
    return;
  }
  startFromForm(ctx);
}

function startFromForm(ctx: SetupContext): void {
  const p1Deck = valueOf("p1-deck");
  const p2Deck = valueOf("p2-deck");
  const config = newLocalMatch({
    p1Deck,
    p2Deck,
    ...(p1Deck.startsWith("CUSTOM-") && ctx.savedDecks[p1Deck]
      ? { p1CustomDeck: ctx.savedDecks[p1Deck].deck }
      : {}),
    ...(p2Deck.startsWith("CUSTOM-") && ctx.savedDecks[p2Deck]
      ? { p2CustomDeck: ctx.savedDecks[p2Deck].deck }
      : {}),
    // Read off the form rather than off the pilot choice: the fields are what
    // the match config has always been assembled from, and a seat that is
    // yours carries `human` in the one the heading wrote it to.
    p1Controller: valueOf("p1-controller") as ControllerKind,
    p2Controller: valueOf("p2-controller") as ControllerKind,
    seed: valueOf("seed").trim() || ctx.randomSeed(),
    seedMode: "matchup",
    startingPlayer: valueOf("starting-player") as PlayerId | "random",
  });
  ctx.beginMatch(config);
}

export function bind(ctx: SetupContext): void {
  footer.bind();
  document.querySelector("#setup-form")?.addEventListener("submit", (event) => {
    submitForm(ctx, event);
  });
  ctx.bindTraceImport("#load-trace", "#trace-input");
  document.querySelector("#agents-watch")?.addEventListener("click", () => {
    toggleAppDialog("agents-choice", false);
    startFromForm(ctx);
  });
  const simulate = document.querySelector<HTMLElement>("#agents-simulate");
  // The size is patched in place rather than repainted: it is a choice inside
  // an open dialog, and a repaint of the lobby would close it.
  document
    .querySelectorAll<HTMLElement>("[data-simulate-size]")
    .forEach((option) => {
      option.addEventListener("click", () => {
        const games = option.dataset.simulateSize ?? "";
        document
          .querySelectorAll<HTMLElement>("[data-simulate-size]")
          .forEach((other) => {
            const picked = other === option;
            other.classList.toggle("picked", picked);
            other.setAttribute("aria-pressed", String(picked));
          });
        if (!simulate) return;
        simulate.dataset.games = games;
        const label = simulate.querySelector("span:not(.sr-only)");
        if (label) label.textContent = `Simulate ${games} games`;
      });
    });
  simulate?.addEventListener("click", () => {
    const games = Number(simulate.dataset.games);
    const picked = RUN_GAME_OPTIONS.find((value) => value === games);
    if (picked === undefined) return;
    toggleAppDialog("agents-choice", false);
    ctx.simulateMatchup(picked);
  });
  document
    .querySelectorAll<HTMLElement>("[data-seat-pilot]")
    .forEach((option) => {
      option.addEventListener("click", () => {
        const seat = option.dataset.seatPilot as PlayerId;
        const pilot = option.dataset.pilot as SeatPilot;
        if (ctx.seatPilots[seat] === pilot) return;
        ctx.seatPilots[seat] = pilot;
        ctx.refreshLobby();
      });
    });
  document
    .querySelector("#open-matchup-config")
    ?.addEventListener("click", () => {
      toggleAppDialog("matchup-config", true);
    });
  ctx.landing?.bind();
  for (const seat of ["p1", "p2"] as const) {
    bindDeckChoice(ctx, seat);
    bindPicker(ctx, seat);
  }
  bindAppDialogDismissal();
  ctx.applyTheme();
}
