/**
 * The match view: the board, everything you can do to it, and the loop that
 * lets the AI take its turn.
 *
 * By far the largest screen, and the one that shares the least -- which is why
 * docs/proposals/web-screen-modules.md moved it last. It is built as a factory
 * rather than as bare `render(state, ctx)` functions on purpose: roughly sixty
 * internal helpers read the same state, and threading two arguments through all
 * of them (and their call sites) would be a large diff with plenty of room for
 * a silently-wrong argument. Closing over `state` and `ctx` once gives the same
 * unit boundary -- nothing here touches a global, and a test can drive it with
 * a state it built itself -- with no call-site churn at all.
 */
import {
  printedClauses,
  printedText,
  requireKnownCard,
} from "@one-piece-sim/cards";
import type {
  EffectOption,
  GameObservation,
  GrantedKeywordObservation,
  LegalAction,
  LifeCardObservation,
  PlayerId,
  PublicEvent,
} from "@one-piece-sim/protocol";
import type { ClockView, MatchResult } from "@one-piece-sim/protocol";
import type { ControllerKind, MatchGame } from "../controller.js";
import { buildDiagnosticsJsonl } from "../diagnostics.js";
import { assetUrl } from "../assets.js";
import {
  automaticNoticeTitle,
  automaticSteps,
  clauseQuote,
  costOverlay,
  counterEventSummary,
  defenseStopsAttack,
  destinationVerb,
  donPaymentUnsettled,
  lookedAtCards,
  moveInOrder,
  optionalEffectSummary,
  opponentCounterCardsForLatestBattle,
  picturedSummary,
  resolvingClauseMarker,
  allocateDonReturn,
  clampDonReturn,
  donReturnPlan,
  totalDonReturned,
  type DonReturnPool,
} from "../battle-ui.js";
import { escapeHtml, renderCardText } from "../card-text.js";
import {
  cardLabel,
  collectCardInstances,
  formatCompactStat,
  reorderAction,
  restrictionClause,
  seat,
  seatOwns,
  type CardInstanceNames,
  GRANTED_KEYWORD_CONSEQUENCE,
} from "@one-piece-sim/engine-core";
import {
  renderHistoryHeader,
  renderHistoryList,
  type HistoryModel,
  type HistoryStep,
} from "../battle-history.js";
import {
  renderCardOverview,
  renderRuleText,
  type CardDetailState,
  type ObservedPowerDetails,
  type ObservedRemovalImmunity,
} from "../dialogs.js";
import { icon, hydrateIcons } from "../icons.js";
import { REPLAY_PACE_MS } from "../replay.js";
import { feedbackJsonl, withFlag } from "../scorer-review.js";
import { nextPaceMs, paceLabel } from "../simulate.js";
import { boardViewer } from "../viewer.js";
import { downloadText } from "../dom.js";
import type {
  AiResult,
  BattleNoticeEvent,
  BattleState,
  LookNotice,
} from "./battle-state.js";

/** The live match, as a holder the battle view can also clear. */
export interface MatchHolder {
  /**
   * The match on screen, local or online.
   *
   * Typed as `MatchGame` rather than as the local controller so the board has
   * one code path for both. What the two cannot both do is in
   * `MatchGame.capabilities`, and this screen reads it rather than assuming.
   */
  game: MatchGame | null;
}

/** What the battle view shares rather than owns. */
export interface BattleContext {
  match: MatchHolder;
  /** The worker that answers for an AI seat. */
  worker: Worker;
  /** The shared card-detail popup's state (see ../dialogs.ts). */
  cardDetail: CardDetailState;
  applyTheme(): void;
  goHome(): void;
  /**
   * The board has just been painted from the position it shows. Called on
   * every paint, including the ones this screen makes for itself after an
   * action, so a caller that remembers the match (see ../match-resume.ts) sees
   * every position and not only the first.
   */
  onBoardPainted(): void;
  /**
   * Stop watching and pilot `seat` from the position on screen, out of either
   * a replay or a simulation. The board cannot do this itself: the seat's
   * controller is part of the match config, so taking over is a new controller
   * built from the same actions.
   */
  takeSeat(seat: PlayerId): void;
  renderCardDetailDialog(powerDetails?: ObservedPowerDetails): string;
  bindCardDetailDialog(rerender: () => void): void;
  /** Where the board is painted. */
  app: HTMLElement;
}

export interface BattleScreen {
  /** Paint the board and wire it up. */
  render(): void;
  /** Drop any card/DON selection, for a caller leaving the match. */
  clearSelection(): void;
  /**
   * Take in a position that arrived from a server, with the steps that produced
   * it, and redraw. For an online match; a local one applies its own actions.
   */
  absorbFrame(): void;
  /**
   * Repaint just the clock.
   *
   * A clock has to move every second, and the board must not: repainting it
   * would rebuild every card in the DOM once a second and take any open menu
   * with it. So the caller ticks this instead.
   */
  tickClock(): void;
}

/**
 * A DON!! payment as one decision: where the DON!! come from, and how big the
 * payment is allowed to be.
 *
 * The two printed shapes reach this from opposite ends. "Return 1 or more"
 * asks the size first, and the DON!! are all still on the field while it is
 * asked. A printed `DON!! −N` has no size to ask about: the engine has already
 * taken the DON!! cheapest-first and asks only which pool each one came out
 * of, so by the time this renders the field is short of them.
 */
interface DonReturnComposition {
  /** The card whose clause is being paid, which is what the modal is about. */
  sourceCardNumber: string;
  rows: readonly { pool: DonReturnPool; label: string; note: string }[];
  /** The payment sizes the engine will accept, ascending. */
  counts: readonly number[];
  /** Whether the DON!! have already left the field, a fixed cost having paid. */
  prepaid: boolean;
}

/**
 * "Base power 8000", or "Base power stays 7000" when a higher "becomes"
 * effect already in force outranked this one (rule 4-9-2-1) -- the chip names
 * the number the card is at, not the one an outranked effect asked for.
 */
function basePowerSetLabel(
  event: Extract<PublicEvent, { type: "base-power-set" }>,
  lead: string,
): string {
  return event.outrankedBy === undefined
    ? `${lead} ${formatCompactStat(event.basePower)}`
    : `${lead} stays ${formatCompactStat(event.outrankedBy)}`;
}
export function createBattleScreen(
  state: BattleState,
  ctx: BattleContext,
): BattleScreen {
  /** The pending beat of a playing replay; see {@link scheduleReplay}. */
  let replayTimer: number | null = null;

  /**
   * The spectator's half of the board, whichever mode put it there: a trace
   * being watched back, or a simulated match being watched play out. Null
   * while somebody at the table is playing.
   */
  function spectating(): { viewer: PlayerId } | null {
    return state.replay ?? state.simulation;
  }

  function viewerFor(controller: MatchGame): PlayerId {
    // Shared with the theme, which paints the two halves of the table for the
    // same two seats: see `viewer.ts` for the rule and why it lives there.
    return boardViewer(
      controller.config,
      spectating()?.viewer ?? null,
      controller.activeObservation.activePlayer,
    );
  }

  function renderGame(): void {
    if (!ctx.match.game) {
      ctx.goHome();
      return;
    }
    let active = ctx.match.game.activeObservation;
    // A Block step with nothing to block is not a decision, so it is taken for
    // the player rather than shown as a one-button modal.
    //
    // Offline this can loop: `act` returns the next position, so several forced
    // passes clear in one pass of this function. Online it must not -- the
    // position does not change until the server sends a frame, and looping here
    // would send the same action forever. Sending it once is enough: the frame
    // that answers re-renders, and this runs again on the new position.
    const forcedPass = () =>
      active.phase === "block" &&
      active.legalActions.length === 1 &&
      active.legalActions[0]?.type === "pass"
        ? active.legalActions[0]
        : null;
    // A replay supplies every action from the file, including the forced
    // passes the board took for the player when the match was played. Taking
    // one here would apply it twice and put the rest of the file out of step.
    if (state.replay) {
      // Nothing: the file is the only thing that advances a replay.
    } else if (ctx.match.game.capabilities.appliesImmediately) {
      for (let pass = forcedPass(); pass; pass = forcedPass()) {
        ctx.match.game.act(pass.actionId);
        clearMainSelection();
        active = ctx.match.game.activeObservation;
      }
    } else {
      const pass = forcedPass();
      if (pass) ctx.match.game.act(pass.actionId);
    }
    const viewer = viewerFor(ctx.match.game);
    // A payment the player has already composed answers its own pool prompts.
    // Returning here rather than falling through: `performAction` re-renders,
    // and the next prompt -- locally the very next position, online the next
    // frame -- comes back through this same check until the plan runs out.
    if (spendDonReturnPlan(active)) return;
    const observation = ctx.match.game.observe(viewer);
    const playerIsActive = active.activePlayer === viewer;
    const actions = active.legalActions;
    const endTurnAction =
      active.phase === "main" && playerIsActive
        ? actions.find((action) => action.type === "pass")
        : undefined;
    const hasOtherActions = actions.some((action) => action.type !== "pass");
    const decisionMode =
      active.phase !== "main" ||
      active.winner !== null ||
      actions.some((action) => action.type === "resolve-effect");
    // Only a decision the game is still waiting on can be stashed: a selected
    // card's X closes it outright, so there is nothing to come back to.
    const hasChoiceSurface = decisionMode;
    // Stashing only hides an existing surface; once that surface is gone (a
    // turn or phase change cleared decisionMode, say) there is nothing left to
    // "Review choice" back to, and the flag would otherwise strand card clicks
    // on the detail-preview branch in `selectCard` with no way back.
    if (state.choiceModalHidden && !hasChoiceSurface)
      state.choiceModalHidden = false;
    // One X per modal, and it always means "close this". A decision the game is
    // still waiting on comes back through "Review choice"; a card you merely
    // selected has nothing to come back to, so its X clears the selection.
    const minimizeChoice = `<button class="choice-modal-close" id="hide-choice-modal" type="button" title="Close">${icon("x", "Close")}</button>`;
    // The faces the look showed, above the pick it leads to. A search that
    // matched nothing has no pick to sit above, so it gets the standalone
    // surface below instead -- otherwise the one case where the player learns
    // *only* information would be the one case that shows them nothing.
    const lookStrip = state.lookNotice
      ? renderLookNotice(state.lookNotice)
      : "";
    // A spectator gets none of this. Every surface below is a seat's own:
    // either it answers a decision -- and nobody watching has one to answer,
    // because the file or the agent in the seat is answering them -- or it
    // reports an action to the player whose board just moved, and waits to be
    // acknowledged before the next one lands.
    //
    // A watched game has nobody to acknowledge it. It is also the one board
    // where the report is a wall: the notice gathers a turn's worth of events
    // into a sheet of paper over the middle of the table, which is where the
    // game being watched is. The history is the same account, in a panel that
    // is opened rather than one that arrives, so that is where a watcher reads
    // what an agent just did.
    //
    // The exception is the end of the game, which is not a question either and
    // is the one thing a watched board has to say for itself: the agents stop,
    // and without it nothing on screen says the match is over or who won it.
    const watchedNotice =
      spectating() && state.spectatorNotice
        ? renderSpectatorNotice(state.spectatorNotice, viewer, observation)
        : "";
    const commandSurface = spectating()
      ? active.phase === "finished"
        ? `<aside class="command-surface decision-modal">${renderActions(actions, playerIsActive, active)}</aside>`
        : renderReplayReview()
      : state.opponentNotice
        ? `<aside class="command-surface decision-modal opponent-action-modal" role="dialog" aria-modal="true" aria-labelledby="opponent-action-title">${renderOpponentNotice(state.opponentNotice, viewer, observation, "Opponent action")}</aside>`
        : state.automaticNotice
          ? `<aside class="command-surface decision-modal opponent-action-modal" role="dialog" aria-modal="true" aria-labelledby="opponent-action-title">${renderOpponentNotice(state.automaticNotice, viewer, observation, state.automaticNoticeTitle ?? "Fired on its own")}</aside>`
          : state.choiceModalHidden
            ? ""
            : decisionMode
              ? `<aside class="command-surface decision-modal dismissable-choice-modal ${playerIsActive ? "" : "waiting-modal"}">${minimizeChoice}${lookStrip}${renderActions(actions, playerIsActive, active)}</aside>`
              : state.mainSelection
                ? `<aside class="command-surface decision-modal dismissable-choice-modal card-action-modal ${boardTargeting() ? "targeting-bar" : state.targetMode === "activate-main" ? "target-picker" : ""}">${renderMainSelection(active)}</aside>`
                : "";
    // History must not show the private side of an opponent's search: the raw
    // controller stream carries `card-revealed` events with a `visibleTo`, which
    // only the searcher is entitled to see (OP15-118 Enel's look-and-add).
    const trace = ctx.match.game.trace();
    const historySteps: HistoryStep[] = [
      ...viewerEvents(trace.initialEvents, viewer).map((event) => ({
        event,
        actionCount: 0,
      })),
      ...trace.checkpoints.flatMap((checkpoint, index) =>
        viewerEvents(checkpoint.events, viewer).map((event) => ({
          event,
          actionCount: index + 1,
        })),
      ),
    ];
    const history: HistoryModel = {
      steps: historySteps,
      records: state.llmDebugRecords,
      viewer,
      names: instanceNames(historySteps, observation),
      canRewind: ctx.match.game.capabilities.rewind,
      // In a replay the file still holds every action, so going back to an
      // earlier point throws nothing away and the button is not a reset.
      rewindVerb: state.replay ? "Jump" : "Reset",
    };
    ctx.app.innerHTML = `
    <div class="game-shell phase-${active.phase}">
      <main class="table ${boardTargeting() ? "targeting" : ""}" aria-label="Game board">
        ${renderOpponent(observation, active, viewer, revealedOpponentHand())}
        ${renderSelf(observation, active, viewer)}
      </main>
      ${renderBoardHub(active, observation, viewer, endTurnAction, hasOtherActions, playerIsActive)}
      ${boardTargeting() ? "" : renderHandToggle(observation, active)}
      ${renderTopbar(viewer)}
      ${renderSessionResult(ctx.match.game.result ?? null, viewer)}
      ${state.battleNotice ? renderBattleNotice(state.battleNotice, viewer, active) : ""}
      ${state.historyOpen ? renderHistoryModal(history) : ""}
      ${watchedNotice}
      ${commandSurface}
      ${lookStrip && commandSurface === "" && !state.choiceModalHidden ? `<aside class="command-surface decision-modal look-notice-modal" role="dialog" aria-modal="true" aria-labelledby="look-notice-title">${lookStrip}<button class="action-button secondary" id="dismiss-look" type="button"><b>Continue</b></button></aside>` : ""}
      ${state.choiceModalHidden && hasChoiceSurface && !noticeOnScreen() ? `<button class="review-choice-button" id="review-choice" type="button">${icon("maximize-2", "Review choice")}<span>Review choice</span></button>` : ""}
      ${renderTrashInspector(observation)}
      ${state.handOpen ? renderHandSheet(state.handOpen, observation, active) : ""}
      ${ctx.renderCardDetailDialog(inspectedPowerDetails(observation))}
      ${renderRewindConfirmDialog()}
    </div>`;
    bindGameEvents();
    ctx.applyTheme();
    hydrateIcons();
    restoreHistoryScroll();
    ctx.onBoardPainted();
    scheduleAi();
    scheduleReplay();
  }

  /**
   * Put the history back where the reader left it.
   *
   * The modal is rebuilt from scratch on every render -- several times a turn
   * while an agent plays -- so without this the reader would be thrown back to
   * the newest entry every time the opponent moved, mid-sentence. The list runs
   * newest first, so "following the match" is the top of it: held there while
   * they are at the top, and held still the moment they scroll down to read
   * something older.
   */
  function restoreHistoryScroll(): void {
    const list = document.querySelector<HTMLElement>(
      ".history-modal .history-list",
    );
    if (!list) return;
    list.scrollTop = state.historyPinnedToLatest ? 0 : state.historyScroll;
    list.addEventListener("scroll", () => {
      state.historyPinnedToLatest = list.scrollTop < 48;
      state.historyScroll = list.scrollTop;
    });
  }

  /**
   * Both clocks, and the countdown on the one that is running.
   *
   * A server-run match has a real time limit, so not showing it would be a rule
   * the player cannot see. Rendered from the frame's absolute deadline rather
   * than from a number counting down in the page: the deadline is the server's,
   * and a frame that arrived late must not extend it.
   */
  function renderClock(clock: ClockView | null, viewer: PlayerId): string {
    if (!clock) return "";
    const remaining = (seat: PlayerId): number => {
      const bank = clock.bankMs[seat];
      // The seat on the clock is spending its bank right now; the deadline is
      // the only thing that knows how much of it is left.
      if (!clock.running || clock.deadlineMs === null) return bank;
      const onClock = seat === activeSeatOnClock(clock, viewer);
      return onClock ? Math.max(0, clock.deadlineMs - Date.now()) : bank;
    };
    const face = (ms: number): string => {
      const total = Math.ceil(ms / 1000);
      return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, "0")}`;
    };
    const opponent: PlayerId = viewer === "p1" ? "p2" : "p1";
    return `<div class="match-clock" aria-label="Time remaining">
      <span class="clock-you ${clock.running && activeSeatOnClock(clock, viewer) === viewer ? "clock-ticking" : ""}"><small>You</small><b>${face(remaining(viewer))}</b></span>
      <span class="clock-them ${clock.running && activeSeatOnClock(clock, viewer) === opponent ? "clock-ticking" : ""}"><small>Them</small><b>${face(remaining(opponent))}</b></span>
    </div>`;
  }

  /** Whose clock is running, which is whose decision it is. */
  function activeSeatOnClock(
    clock: ClockView,
    viewer: PlayerId,
  ): PlayerId | null {
    if (!clock.running || !ctx.match.game) return null;
    return ctx.match.game.activeObservation.activePlayer === viewer
      ? viewer
      : viewer === "p1"
        ? "p2"
        : "p1";
  }

  /**
   * How an online match ended, when the engine does not say so itself.
   *
   * A resignation, a timeout and a no-show leave the position alone -- the board
   * still looks playable -- so this is the only thing on screen that says the
   * match is over. Drawn as a modal, not a banner, because there is nothing left
   * to do on the board behind it.
   */
  function renderSessionResult(
    result: MatchResult | null,
    viewer: PlayerId,
  ): string {
    // An ending the engine reached is already drawn by the board itself.
    if (
      !result ||
      result.reason === "life" ||
      result.reason === "deck-exhaustion"
    ) {
      return "";
    }
    const outcome =
      result.winner === null
        ? "No result"
        : result.winner === viewer
          ? "You win"
          : "You lose";
    const because = {
      resign:
        result.winner === viewer ? "Your opponent resigned." : "You resigned.",
      timeout:
        result.winner === viewer
          ? "Your opponent ran out of time."
          : "You ran out of time.",
      "no-show": "Your opponent never sat down.",
      superseded:
        "The server was updated, so this match could not be finished. Nobody wins it.",
      "time-limit":
        "This match hit the ninety-minute limit, so it ends with no winner.",
    }[result.reason];
    // The action list arrives with the result, so the end of the match is the
    // first and only moment this seat can save a replayable record of it -- and
    // the server keeps none, so it is the only copy there will be.
    const exportTrace = ctx.match.game?.capabilities.trace
      ? `<button class="action-button secondary" id="match-over-trace" type="button"><b>Download trace</b></button>`
      : "";
    return `<aside class="command-surface decision-modal match-over-modal" role="dialog" aria-modal="true" aria-labelledby="match-over-title">
      <h2 id="match-over-title">${escapeHtml(outcome)}</h2>
      <p class="muted">${escapeHtml(because)}</p>
      ${exportTrace}
      <button class="action-button" id="match-over-exit" type="button"><b>Back to the menu</b></button>
    </aside>`;
  }

  /* -------------------------------------------------------------------------
     Replay

     A loaded trace can be watched instead of resumed: the file's actions are
     played back one at a time with both hands face up, and whoever is watching
     can stop at any point and pilot the rest. The match is an ordinary
     controller holding the actions applied so far, so how far the replay has
     got is simply how many of them it holds, and jumping about in it is the
     same rewind the history already offers.
     ---------------------------------------------------------------------- */

  /** How much of the file has been applied, which is the replay's position. */
  function appliedActionCount(): number {
    return ctx.match.game?.trace().checkpoints.length ?? 0;
  }

  /**
   * The strip that drives a replay: where it is, the way through it, and the
   * way out of it.
   *
   * In the top bar rather than on the seam, because it belongs to the file
   * being watched and not to the position -- and because the hub below is the
   * player's, and in a replay there is no player.
   */
  function renderReplayBar(): string {
    const replay = state.replay;
    if (!replay || !ctx.match.game) return "";
    const applied = appliedActionCount();
    const total = replay.actions.length;
    const atEnd = applied >= total;
    const current = [...replay.turns]
      .reverse()
      .find((start) => start.actionCount <= applied);
    const options = replay.turns
      .map(
        (start) =>
          `<option value="${start.actionCount}" ${start === current ? "selected" : ""}>Turn ${start.turn} — ${escapeHtml(seat(start.player, replay.viewer))}</option>`,
      )
      .join("");
    return `<div class="spectator-bar replay-bar" aria-label="Replay controls">
      <span class="spectator-tag">Replay</span>
      <button class="text-button" type="button" id="replay-back" ${applied === 0 ? "disabled" : ""} title="Back one action">${icon("skip-back", "Back one action")}</button>
      <button class="text-button replay-play" type="button" id="replay-play" ${atEnd ? "disabled" : ""} aria-pressed="${String(replay.playing)}" title="${replay.playing ? "Pause" : "Play"}">${replay.playing ? icon("pause", "Pause") : icon("play", "Play")}</button>
      <button class="text-button" type="button" id="replay-forward" ${atEnd ? "disabled" : ""} title="Forward one action">${icon("skip-forward", "Forward one action")}</button>
      <span class="replay-position">${applied} / ${total}</span>
      <select class="replay-turn" id="replay-turn" aria-label="Jump to a turn">${options}</select>
      <button class="text-button" type="button" id="replay-swap" title="Watch from the other seat">${icon("arrow-left-right", "Watch from the other seat")}</button>
      <button class="text-button spectator-takeover" type="button" id="replay-takeover" title="Take this seat and play on from here">${icon("hand", "Pilot from here")}<span class="spectator-takeover-label">Pilot from here</span></button>
    </div>`;
  }

  /**
   * The move the replay is about to play, for reviewing it: who makes it,
   * what it is, and -- on a trace from the System-1 trainer -- what the model
   * thought of every option and of its chances. The move can be flagged as a
   * misplay from here; see `scorer-review.ts`.
   *
   * A strip rather than a modal: the file makes the move, so there is nothing
   * to answer, and the board it is judged on has to stay in view.
   */
  function renderReplayReview(): string {
    const replay = state.replay;
    const game = ctx.match.game;
    if (!replay || !game) return "";
    const index = appliedActionCount();
    const actionId = replay.actions[index];
    if (!actionId) return "";
    if (replay.flagging === index) return renderFlagDialog(index, actionId);
    const player = game.activeObservation.activePlayer;
    const legal = game.observe(player).legalActions;
    const summary = (id: string) =>
      legal.find((action) => action.actionId === id)?.summary ?? id;
    const note = replay.review?.notes[index] ?? null;
    const flag = replay.flags.find((entry) => entry.actionIndex === index);
    const percent = (p: number) => `${Math.round(p * 100)}%`;
    const estimate = note
      ? `<span class="replay-review-estimate">Its win estimate ${percent(note.winProbability)}, ${note.drop > 0 ? "down" : "up"} ${Math.abs(Math.round(note.drop * 100))} points by its next move</span>`
      : "";
    const options = note
      ? `<ol class="replay-review-options">${[...note.options]
          .sort((a, b) => b.p - a.p)
          .slice(0, 5)
          .map(
            (option) =>
              `<li class="${option.actionId === actionId ? "chosen" : ""}"><span>${escapeHtml(summary(option.actionId))}</span><b>${percent(option.p)}</b></li>`,
          )
          .join("")}</ol>`
      : `<p class="replay-review-move">${escapeHtml(summary(actionId))}</p>`;
    const download = replay.flags.length
      ? `<button class="text-button" type="button" id="replay-feedback">${icon("download", "")}Download ${replay.flags.length} flag${replay.flags.length === 1 ? "" : "s"}</button>`
      : "";
    return `<aside class="replay-review" aria-label="The next move">
      <p class="replay-review-head"><b>Next: ${escapeHtml(seat(player, replay.viewer))}</b>${estimate}${flag ? `<span class="replay-review-flagged">Flagged</span>` : ""}</p>
      ${options}
      <div class="replay-review-actions">
        <button class="action-button secondary" type="button" id="replay-flag">${icon("flag", "")}${flag ? "Edit flag" : "Flag this move"}</button>
        <button class="text-button" type="button" id="replay-hide-hand" aria-pressed="${String(replay.hideOtherHand)}">${replay.hideOtherHand ? "Show their hand" : "Hide their hand"}</button>
        ${download}
      </div>
    </aside>`;
  }

  /** The flag dialog for the move at `index`: what it should have been, and why. */
  function renderFlagDialog(index: number, actionId: string): string {
    const replay = state.replay!;
    const game = ctx.match.game!;
    const player = game.activeObservation.activePlayer;
    const legal = game.observe(player).legalActions;
    const flag = replay.flags.find((entry) => entry.actionIndex === index);
    const chosen =
      legal.find((action) => action.actionId === actionId)?.summary ?? actionId;
    const alternatives = legal
      .filter((action) => action.actionId !== actionId)
      .map(
        (action) =>
          `<label class="replay-flag-option"><input type="radio" name="replay-flag-preferred" value="${escapeHtml(action.actionId)}" ${flag?.preferred === action.actionId ? "checked" : ""}> ${escapeHtml(action.summary)}</label>`,
      )
      .join("");
    return `<aside class="command-surface decision-modal replay-flag-modal" role="dialog" aria-modal="true" aria-labelledby="replay-flag-title">
      <h2 id="replay-flag-title">Flag this move</h2>
      <p class="muted">${escapeHtml(seat(player, replay.viewer))} played <b>${escapeHtml(chosen)}</b>. What should it have played?</p>
      <fieldset class="replay-flag-options">
        ${alternatives}
        <label class="replay-flag-option"><input type="radio" name="replay-flag-preferred" value="" ${flag && flag.preferred === null ? "checked" : ""}> Not sure: only that this was wrong</label>
      </fieldset>
      <label class="replay-flag-note">Why <span class="muted">(optional)</span><textarea id="replay-flag-note" rows="2">${escapeHtml(flag?.note ?? "")}</textarea></label>
      <div class="replay-flag-buttons">
        <button class="action-button" type="button" id="replay-flag-save"><b>Save flag</b></button>
        ${flag ? `<button class="action-button secondary" type="button" id="replay-flag-remove">Remove flag</button>` : ""}
        <button class="text-button" type="button" id="replay-flag-cancel">Cancel</button>
      </div>
    </aside>`;
  }

  /**
   * The press whose synthesised click has not arrived yet: when it happened,
   * and where. Null once that click has come and gone. See {@link onPress}.
   */
  let pendingPress: { at: number; x: number; y: number } | null = null;

  /**
   * Swallow the click a touch screen makes out of a press this board has
   * already answered.
   *
   * A finger's press is followed by a click synthesised from the touch point
   * and hit-tested afresh -- so it lands on whatever is under the finger by
   * then, which after a press that redrew the board is not what was pressed.
   * It has arrived on the new copy of the button, undoing a Pause; and on the
   * backdrop of the sheet the press had just opened, closing it again. So the
   * echo is caught at the document rather than at any one control: what it
   * lands on is exactly what cannot be predicted.
   *
   * Matched on where as well as when. A click a moment later somewhere else is
   * a second intention -- the next thing the reader went on to press -- and
   * swallowing that is how a guard on time alone eats the tap after every one
   * it was meant to protect. Capture, so the echo never reaches the surface
   * underneath it.
   */
  document.addEventListener(
    "click",
    (event) => {
      if (!pendingPress) return;
      const echo =
        event.timeStamp - pendingPress.at < 700 &&
        Math.abs(event.clientX - pendingPress.x) <= 8 &&
        Math.abs(event.clientY - pendingPress.y) <= 8;
      pendingPress = null;
      if (!echo) return;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  /**
   * Bind a control that has to work while the board under it is repainting.
   *
   * Every action redraws the board, which replaces these buttons, and a paint
   * landing between a press and its release leaves the two halves of the click
   * on different elements, one of them no longer in the document -- so no click
   * event is delivered at all. At the faster beat that is most presses, and
   * Pause was the control it cost. Acting on the press is what makes a strip
   * usable while the thing it drives is running.
   *
   * The click listener stays for the keyboard, which activates a button with a
   * click and no press before it. A touch screen's echo of the press never
   * reaches it -- see the capture handler above.
   */
  function onPress(selector: string, run: () => void): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      pendingPress = {
        at: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
      };
      run();
    });
    element.addEventListener("click", () => {
      run();
    });
  }

  /** Apply the next action in the file; stop the playback if there is none. */
  function replayStep(): void {
    const replay = state.replay;
    const game = ctx.match.game;
    if (!replay || !game) return;
    const next = replay.actions[appliedActionCount()];
    if (next === undefined) {
      replay.playing = false;
      renderGame();
      return;
    }
    try {
      game.act(next);
    } catch (error) {
      // The file replayed cleanly on the way in, so a refusal here is the
      // board's own doing rather than a bad trace -- say so and stop, instead
      // of hammering the same illegal action at the engine once a beat.
      replay.playing = false;
      window.alert(error instanceof Error ? error.message : String(error));
    }
    clearMainSelection();
    renderGame();
  }

  /** Go to a point in the file, forwards or back. */
  function replayJumpTo(actionCount: number): void {
    const replay = state.replay;
    const game = ctx.match.game;
    if (!replay || !game) return;
    const target = Math.max(0, Math.min(actionCount, replay.actions.length));
    const applied = appliedActionCount();
    if (target < applied) game.rewindTo(target);
    else for (let count = applied; count < target; count += 1) replayStep();
    clearMainSelection();
    renderGame();
  }

  /**
   * The playback clock. One timer at a time, cleared and re-armed by every
   * paint: the paint is what a landed action ends with, so the next beat is
   * measured from the board the watcher is actually looking at.
   */
  function scheduleReplay(): void {
    if (replayTimer !== null) {
      window.clearTimeout(replayTimer);
      replayTimer = null;
    }
    const replay = state.replay;
    if (!replay?.playing || !ctx.match.game) return;
    if (
      appliedActionCount() >= replay.actions.length ||
      ctx.match.game.activeObservation.phase === "finished"
    ) {
      replay.playing = false;
      return;
    }
    replayTimer = window.setTimeout(() => {
      replayTimer = null;
      replayStep();
    }, REPLAY_PACE_MS);
  }

  /* -------------------------------------------------------------------------
     Simulation

     Two agents playing each other, watched. The match is the ordinary local
     one and the seats are piloted the way any non-human seat is, so nothing
     here advances the board: what the strip below drives is the pace the next
     action is *asked for* at, and whether it is asked for at all.
     ---------------------------------------------------------------------- */

  /**
   * The strip that drives a simulation, in the same place and the same dress
   * as a replay's.
   *
   * Three of its controls are the replay's and mean the same thing -- stop,
   * watch from the other side, sit down -- so they are drawn the same. What it
   * cannot offer is the ones that read a file: a simulated action was decided
   * rather than read out of one, so there is nothing to step back to, and
   * `rewindTo` would throw away the only copy of what there is. The history's
   * Reset is still there for a watcher who wants the position back rather than
   * the game.
   */
  function renderSimulationBar(): string {
    const simulation = state.simulation;
    if (!simulation || !ctx.match.game) return "";
    const over = ctx.match.game.activeObservation.phase === "finished";
    const playing = simulation.playing && !over;
    return `<div class="spectator-bar simulate-bar" aria-label="Simulation controls">
      <span class="spectator-tag">Simulate</span>
      <button class="text-button replay-play" type="button" id="simulate-play" ${over ? "disabled" : ""} aria-pressed="${String(playing)}" title="${playing ? "Pause" : "Play"}">${playing ? icon("pause", "Pause") : icon("play", "Play")}</button>
      <button class="text-button simulate-pace" type="button" id="simulate-pace" ${over ? "disabled" : ""} title="How fast the agents play">${escapeHtml(paceLabel(simulation.paceMs))}</button>
      <span class="replay-position">${appliedActionCount()} action${appliedActionCount() === 1 ? "" : "s"}</span>
      <button class="text-button" type="button" id="simulate-swap" title="Watch from the other seat">${icon("arrow-left-right", "Watch from the other seat")}</button>
      <button class="text-button spectator-takeover" type="button" id="simulate-takeover" ${over ? "disabled" : ""} title="Take this seat and play on from here">${icon("hand", "Pilot from here")}<span class="spectator-takeover-label">Pilot from here</span></button>
    </div>`;
  }

  function phaseLabel(phase: GameObservation["phase"]): string {
    if (phase === "mulligan") return "Game Setup";
    if (phase === "finished") return "Game Complete";
    return "Main Phase";
  }

  /**
   * The board's chrome, as one cluster on the seam.
   *
   * All of this used to be two things: a white band across the middle of the
   * table carrying the turn and End turn, and a box in the top-right corner
   * carrying the brand, the history and the trace. The band cut the sea in half
   * -- one chart is drawn across both halves now, and a white rule through the
   * middle of it read as a cut rather than a horizon.
   *
   * So the chrome is the brand mark and a cell of the same honeycomb on each of
   * its three left-hand faces: the history above, End turn on the flat face,
   * the trace below. The hexagon is a hexagon, so those faces are real -- every
   * cell sits one cell-width along its face's own normal, and they meet edge to
   * edge. The cluster stands at the right edge with its cells inboard of the
   * mark, which is the corner the board has least to say in.
   *
   * The turn is not part of the cluster at all: it reads along the seam,
   * centred, where the band used to say it large.
   */
  function renderBoardHub(
    active: GameObservation,
    observation: GameObservation,
    viewer: PlayerId,
    endTurnAction: LegalAction | undefined,
    hasOtherActions: boolean,
    playerIsActive: boolean,
  ): string {
    /* One cell, always drawn: End turn while it is yours to end, and the same
       hexagon saying what the board is doing instead when it is not. It held
       nothing between turns before, and a control that comes and goes is one a
       player has to look for -- the state belongs in the cell, not in whether
       there is a cell.

       Nobody watching has a turn to end. The viewer's side is still the active
       one every other turn, so without this the cell offers a live `data-action`
       for a seat an agent is playing or a file has already played -- a click
       that takes a decision out from under whatever is driving the board. */
    const command =
      endTurnAction && !spectating()
        ? `<button class="hub-face end-turn-button ${hasOtherActions ? "end-turn-available" : "end-turn-ready"}" data-action="${escapeHtml(endTurnAction.actionId)}" title="End turn">End turn</button>`
        : `<button class="hub-face hub-waiting" type="button" disabled title="${!playerIsActive && active.phase !== "finished" ? "Waiting for the opponent" : "Nothing to end yet"}">Waiting</button>`;
    return `<div class="board-hub">
      <button class="hub-brand" id="new-game" type="button" title="New match" aria-label="New match"><svg class="brand-mark small"><use href="#brand-hex" /></svg></button>
      <button class="hub-face hub-history" id="history-toggle" type="button" title="Match history" aria-pressed="${state.historyOpen}">${icon("history", "Match history")}</button>
      ${renderHubSecondary()}
      <div class="hub-command">${command}</div>
    </div>
    <p class="turn-status"><span>Turn ${active.turn}</span><b>${active.activePlayer === viewer ? "Your turn" : "Opponent turn"}</b></p>`;
  }

  /* The lower-left cell is the match's own secondary control. A local match
     can export its trace; an online match cannot -- the server holds the
     record -- and what it offers instead is to resign. Neither match has both,
     so they take the same face rather than growing the cluster a cell.

     It is drawn at every width. It used to be `desktop-secondary`, hidden
     below 760px, which on a phone meant a trace could not be exported from
     the board it was recorded on -- and, once an online match took the same
     face, that a phone could not resign at all. The cluster has the room: the
     cell stands on a face the mark already owns. */
  function renderHubSecondary(): string {
    const game = ctx.match.game!;
    if (game.capabilities.trace) {
      return `<button class="hub-face hub-trace" id="trace" type="button" title="Export trace">${icon("download", "Export trace")}</button>`;
    }
    if (game.resign) {
      return `<button class="hub-face hub-trace" id="resign" type="button" title="Resign">${icon("flag", "Resign")}</button>`;
    }
    return "";
  }

  /* The strip across the top holds what belongs to the match rather than to
     the board: the replay or simulation controls, and an online match's
     clock. Drawn only when there is something to put in it. */
  function renderTopbar(viewer: PlayerId): string {
    const clock = renderClock(ctx.match.game!.clock ?? null, viewer);
    const bar = `${renderReplayBar()}${renderSimulationBar()}${clock}`;
    return bar ? `<header class="topbar">${bar}</header>` : "";
  }

  /**
   * The other seat's hand, face up, while the board is a spectator's.
   *
   * Read through `observe` as that seat rather than off this viewer's
   * observation, which withholds it -- the engine's hidden-information rule is
   * not bent for the board, the board asks the other side's question. Null in
   * a match somebody is playing, where the same read would be cheating.
   */
  function revealedOpponentHand(): GameObservation["self"]["hand"] | null {
    const game = ctx.match.game;
    const watched = spectating();
    if (!game || !watched || state.replay?.hideOtherHand) return null;
    return game.observe(watched.viewer === "p1" ? "p2" : "p1").self.hand;
  }

  function renderOpponent(
    observation: GameObservation,
    active: GameObservation,
    viewer: PlayerId,
    revealedHand: GameObservation["self"]["hand"] | null = null,
  ): string {
    const side = observation.opponent;
    return `<section class="player-board opponent-board ${active.activePlayer !== viewer ? "active-side" : ""}">
    <div class="mat-frame"><div class="player-mat">
      <div class="life-zone">${renderLife(side.life)}</div>
      <div class="character-row">${renderBoard(side.board, active)}</div>
      <div class="mat-leader">${renderLeader(side.leader, viewer === "p1" ? "p2" : "p1", active, side.onPlayNegated)}</div>
      <div class="mat-stage">${renderStage(side.stage)}</div>
      ${renderDeckPile(side.deckCount)}${renderTrashButton("opponent", side.trash)}${renderDonDeck(side.donDeckCount)}
      <div class="cost-area" aria-label="${side.activeDon} active, ${side.restedDon} rested, ${side.donDeckCount} in DON!! deck">${renderCostArea(side.activeDon, side.restedDon)}</div>
    </div></div>
    <div class="hand-zone opponent-hand-zone">${revealedHand ? renderRevealedHand(revealedHand) : renderHiddenHand(side.handCount)}</div>
    ${
      // On a phone the far hand is a count on the edge of their half, because
      // a fan of backs never said more than the number. Face up it says a
      // great deal more, and the fan is the one thing a phone has no room to
      // draw -- so while it is face up the count is the button that lifts it.
      revealedHand
        ? `<button class="opponent-hand-count opponent-hand-toggle" id="opponent-hand-toggle" type="button" aria-expanded="${String(state.handOpen === "opponent")}" aria-label="Show their hand, ${side.handCount} card${side.handCount === 1 ? "" : "s"}, face up">${icon("hand", "")}<b>${side.handCount}</b></button>`
        : `<p class="opponent-hand-count" aria-hidden="true">${icon("hand", "")}<b>${side.handCount}</b></p>`
    }
  </section>`;
  }

  function renderSelf(
    observation: GameObservation,
    active: GameObservation,
    viewer: PlayerId,
  ): string {
    const side = observation.self;
    return `<section class="player-board self-board ${active.activePlayer === viewer ? "active-side" : ""}">
    <div class="mat-frame"><div class="player-mat">
      <div class="life-zone">${renderLife(side.life)}</div>
      <div class="character-row">${renderBoard(side.board, active, true)}</div>
      <div class="mat-leader">${renderLeader(side.leader, viewer, active, side.onPlayNegated)}</div>
      <div class="mat-stage">${renderStage(side.stage)}</div>
      ${renderDeckPile(side.deckCount)}${renderTrashButton("self", side.trash)}${renderDonDeck(side.donDeckCount)}
      <button class="cost-area ${active.phase === "main" && activeController() === "human" && active.legalActions.some((action) => action.type === "attach-don") ? "actionable-source" : ""} ${state.mainSelection?.kind === "don" ? "selected-source" : ""}" id="active-don" type="button" aria-label="${side.activeDon} active, ${side.restedDon} rested, ${side.donDeckCount} in DON!! deck">${renderCostArea(side.activeDon, side.restedDon)}</button>
    </div></div>
    <div class="hand-zone">${renderHand(side.hand, active)}</div>
  </section>`;
  }

  function renderTrashButton(
    side: "self" | "opponent",
    trash: readonly { cardNumber: string; name: string }[],
  ): string {
    const owner = side === "self" ? "your" : "opponent's";
    const count = trash.length;
    const topCard = trash[trash.length - 1];
    const topDefinition = topCard ? requireKnownCard(topCard.cardNumber) : null;
    return `<button class="trash-zone-button" type="button" data-inspect-trash="${side}" aria-label="Inspect ${owner} trash, ${count} card${count === 1 ? "" : "s"}"><span class="trash-pile">${
      topCard
        ? `${count > 1 ? `<span class="trash-card-back"></span>` : ""}<span class="trash-top-face">${renderCard(
            {
              instanceId: `trash-top-${side}`,
              cardNumber: topCard.cardNumber,
              name: topCard.name,
              ...(topDefinition && topDefinition.cost !== null
                ? { cost: topDefinition.cost }
                : {}),
            },
            null,
            "mini",
            false,
          )}</span>`
        : `<span class="trash-empty-slot"></span>`
    }</span><small>Trash</small><b>${count}</b></button>`;
  }

  /**
   * The cost area, as the mat prints it: one row of DON!! cards, upright while
   * active and turned a quarter turn once rested.
   *
   * This replaces three fanned piles labelled Active / Rested / Deck, and then
   * the two counts that outlived them. The piles said the same thing as the
   * cards do, but as a HUD panel parked in the board row, and they needed a
   * track three piles wide -- which is what crowded the deck and the trash out
   * of the middle of the row. Orientation is the whole readout now: upright is
   * spendable, turned is spent, and both are legible at a glance from across
   * the board. The figures live on in the zone's accessible name, which is the
   * one reader that cannot see which way a card is lying.
   */
  function renderCostArea(activeDon: number, restedDon: number): string {
    const slot = (kind: "active" | "rested"): string =>
      `<span class="don-slot ${kind}"><span class="don-card"></span></span>`;
    const cards = [
      ...Array.from({ length: activeDon }, () => slot("active")),
      ...Array.from({ length: restedDon }, () => slot("rested")),
    ].join("");
    const empty = `<span class="don-slot active"><span class="don-card pile-empty"></span></span>`;
    /* How many cards the row holds, which is the one thing its CSS cannot work
       out for itself: from it the row divides the width it has between them, so
       a full cost area closes up into a pile instead of the cards shrinking. */
    return `<span class="cost-area-label">Cost area</span><span class="cost-dons" style="--don-count:${Math.max(activeDon + restedDon, 1)}">${cards || empty}</span>`;
  }

  /** The DON!! deck: its own face-down pile at the outer edge of the cost row. */
  function renderDonDeck(count: number): string {
    return `<div class="don-deck-zone" title="${count} cards in the DON!! deck" aria-label="${count} cards in DON!! deck"><span class="don-deck-pile don-slot"><span class="don-card ${count ? "" : "pile-empty"}"></span></span><small>DON!! deck</small><b>${count}</b></div>`;
  }

  /**
   * Your hand, in rows of five.
   *
   * One fan of everything held was fine at five cards and unreadable at nine:
   * the overlap tightened until every card behind the front one was a sliver of
   * border. Five is what the character area holds and what a fan reads at, so a
   * sixth card starts a second row rather than squeezing the first -- and the
   * rows stack away from the player, leaving the row nearest them the one that
   * was drawn first.
   */
  /**
   * A card in hand, flagged when playing it now would drop the `[On Play]` it
   * prints.
   *
   * The Leader already says the side is switched off, but the hand is where
   * the decision is made, and "which of these five plays loses its clause" is
   * not answerable from a badge on the Leader. Only cards that print an
   * `[On Play]` are marked: on a vanilla body the rule costs nothing, and a
   * badge on every card in hand says nothing about any of them.
   */
  function handCard(
    card: GameObservation["self"]["hand"][number],
    active: GameObservation,
  ): string {
    const loses =
      active.self.onPlayNegated &&
      printedClauses(card.cardNumber).includes("[On Play]");
    return renderCard(loses ? { ...card, onPlayNegated: true } : card, active);
  }

  function renderHand(
    hand: GameObservation["self"]["hand"],
    active: GameObservation,
  ): string {
    const rows = hand.length > 5 ? [hand.slice(0, 5), hand.slice(5)] : [hand];
    return `<div class="hand-cards ${rows.length > 1 ? "hand-two-rows" : ""}">${rows
      .map(
        (row) =>
          `<div class="hand-row">${row.map((card) => handCard(card, active)).join("")}</div>`,
      )
      .join("")}</div>`;
  }

  /**
   * Their hand as a spectator sees it: the same rows of five, face up and
   * inert. Inert because none of it is this viewer's to act on -- a face with
   * the board's own click hooks would offer a card the engine has no action
   * for.
   */
  function renderRevealedHand(hand: GameObservation["self"]["hand"]): string {
    const shown = hand.length > 5 ? [hand.slice(0, 5), hand.slice(5)] : [hand];
    return `<div class="opponent-hand-fan revealed-hand ${shown.length > 1 ? "hand-two-rows" : ""}" aria-label="Opponent hand, face up: ${hand.length} card${hand.length === 1 ? "" : "s"}">${shown
      .map(
        (row) =>
          // Interactive, with no observation behind it: there is no action to
          // take on a card in somebody else's hand, but a watcher looking at
          // one is the whole reason it is face up.
          `<div class="hand-row">${row.map((card) => renderCard(card, null, "normal")).join("")}</div>`,
      )
      .join("")}</div>`;
  }

  /** Their hand: the same rows of five, face down. */
  function renderHiddenHand(count: number): string {
    const shown = Math.min(count, 10);
    const rows = shown > 5 ? [5, shown - 5] : [shown];
    return `<div class="opponent-hand-fan ${rows.length > 1 ? "hand-two-rows" : ""}" aria-label="Opponent hand: ${count} cards">${rows
      .map(
        (backs) =>
          `<div class="hand-row">${Array.from({ length: backs }, () => `<span class="physical-card-back"></span>`).join("")}</div>`,
      )
      .join("")}</div>`;
  }

  /**
   * The phone's way to the hand: one button on the seam, opposite the hub,
   * with the count and whether anything in it can be played right now.
   *
   * Drawn at every width and shown only below 760px (responsive.css), where
   * the hand is off the table so the mat can have the whole half. The board
   * used to keep the hand under the mat there, and the two shared a half that
   * was already too short for either: the mat's cards came out a thumbnail
   * tall and the hand a row of slivers. A card that can be played lights the
   * button the way it would light the card, so a hidden hand still says when
   * it has a move.
   */
  function renderHandToggle(
    observation: GameObservation,
    active: GameObservation,
  ): string {
    const hand = observation.self.hand;
    const playable =
      active.phase === "main" &&
      activeController() === "human" &&
      hand.some((card) => sourceActions(active, card.instanceId).length > 0);
    return `<button class="hand-toggle ${playable ? "hand-playable" : ""}" id="hand-toggle" type="button" aria-expanded="${String(state.handOpen === "self")}" aria-label="Show hand, ${hand.length} card${hand.length === 1 ? "" : "s"}${playable ? ", a card can be played" : ""}">${icon("hand", "")}<b>${hand.length}</b></button>`;
  }

  /**
   * The hand, lifted off the table to be read: one row per card, the card
   * beside its own printed text. A card small enough to share a screen with
   * four others cannot carry legible text on its face, and reading the hand
   * is what the sheet is for -- so the words stand beside the face rather
   * than on it. The card keeps the fan's `[data-card]` markup, so a tap
   * selects it exactly as a click on the fan does, and `selectCard` closes
   * the sheet because the card's own panel is what comes next.
   */
  function renderHandSheet(
    which: NonNullable<BattleState["handOpen"]>,
    observation: GameObservation,
    active: GameObservation,
  ): string {
    // The far seat's is only ever asked for while nobody at the table is
    // playing, so it is read through `observe` as that seat -- the same read
    // the face-up fan makes at wider widths, and by the same rule: the engine
    // decides what a seat may see, so the board asks the other side's question
    // rather than reaching past it.
    const theirs = which === "opponent";
    const hand = theirs
      ? (revealedOpponentHand() ?? [])
      : observation.self.hand;
    const title = theirs ? "Their hand" : "Your hand";
    return `<div class="card-detail-backdrop hand-sheet-backdrop" data-close-hand-sheet><aside class="hand-sheet" role="dialog" aria-modal="true" aria-label="${title}"><header><p class="eyebrow">${title}</p><span>${hand.length} card${hand.length === 1 ? "" : "s"}</span><button class="card-detail-close" data-close-hand-sheet title="Close">${icon("x", "Close")}</button></header>${
      hand.length
        ? `<div class="hand-sheet-cards">${hand
            .map(
              (card) =>
                // No offers under a card in somebody else's hand: there is
                // nothing to take on one, and the row is a card to read.
                `<div class="hand-sheet-entry">${handCard(card, active)}<div class="hand-sheet-text rule-card"><strong>${escapeHtml(card.name)}</strong>${renderRuleText(card.cardNumber)}</div>${theirs ? "" : renderHandSheetActions(card, active)}</div>`,
            )
            .join("")}</div>`
        : `<p class="hand-sheet-empty">No cards in hand.</p>`
    }</aside></div>`;
  }

  /**
   * What this card in hand is offering, under its own printed text.
   *
   * Playing a card is a decision made out of the text -- what it costs against
   * what it does -- and on a phone the text is only in the sheet. Sending the
   * reader back to the table to find the card and open its panel put the whole
   * width of the board between the sentence and the button that acts on it, so
   * the button comes to the sentence instead. The panel is still there for a
   * card already in play, and still the place a target is chosen: an offer that
   * needs one opens it from here exactly as it does from the fan
   * (`data-open-targets`, with the sheet's own handler selecting the card
   * first).
   */
  function renderHandSheetActions(
    card: { instanceId: string; cardNumber: string },
    active: GameObservation,
  ): string {
    // Only ever this player's own offers: while the opponent is the one being
    // asked, the legal actions are theirs and name none of these cards.
    if (activeController() !== "human") return "";
    const source = sourceActions(active, card.instanceId);
    if (!source.length) return "";
    const countOfType = new Map<LegalAction["type"], number>();
    for (const action of source)
      countOfType.set(action.type, (countOfType.get(action.type) ?? 0) + 1);
    return `<div class="action-list hand-sheet-actions" data-hand-actions-instance="${escapeHtml(card.instanceId)}" data-hand-actions-card="${escapeHtml(card.cardNumber)}">${renderSourceActionButtons(source, countOfType, active, card.instanceId)}</div>`;
  }

  function renderDeckPile(count: number): string {
    return `<div class="deck-pile" title="${count} cards in deck"><span class="physical-card-back"></span><small>Deck</small><b>${count}</b></div>`;
  }

  /**
   * The Life stack as the cards it actually is, top-first.
   *
   * The previous version keyed the face-up cards by a `"top" | "bottom" |
   * "middle"` label and looked them up per slot, which silently collapsed two
   * face-up cards that shared a label and could draw one at the wrong depth. The
   * observation now carries the stack in order, so each slot renders whatever is
   * actually at that depth: a real card when it is face-up, a back when it is not.
   */
  /**
   * The Life cards a viewer may name, in the `{instanceId, cardNumber, name}`
   * shape the card-lookup helpers index on. Face-down slots have no identity, so
   * they are not candidates for "which card is this instance id".
   */
  function faceUpLifeCards(
    life: readonly LifeCardObservation[],
  ): Array<{ instanceId: string; cardNumber: string; name: string }> {
    return life.flatMap((card) =>
      card.faceUp && card.instanceId && card.cardNumber && card.name
        ? [
            {
              instanceId: card.instanceId,
              cardNumber: card.cardNumber,
              name: card.name,
            },
          ]
        : [],
    );
  }

  function renderLife(life: readonly LifeCardObservation[]): string {
    const faceUpCount = life.filter((card) => card.faceUp).length;
    const label = `${life.length} Life${faceUpCount ? `, ${faceUpCount} face-up` : ""}`;
    const slots = life
      .map((card, index) => {
        const depth =
          index === 0
            ? "top"
            : index === life.length - 1
              ? "bottom"
              : `position ${index + 1}`;
        // Face-up Life is public information, so it opens the card detail dialog
        // like any other readable card. Face-down slots stay inert backs.
        return card.faceUp && card.instanceId && card.cardNumber && card.name
          ? `<button class="life-slot face-up" type="button" style="--stack:${index}" data-inspect-card="${escapeHtml(card.cardNumber)}" title="${escapeHtml(card.name)} — face-up ${depth} Life card" aria-label="View ${escapeHtml(card.name)} details, face-up ${depth} Life card">${renderCard(
              {
                instanceId: card.instanceId,
                cardNumber: card.cardNumber,
                name: card.name,
              },
              null,
              "normal",
              false,
            )}</button>`
          : `<span class="life-slot" style="--stack:${index}" title="Face-down Life card (${depth})"><span class="physical-card-back"></span></span>`;
      })
      .join("");
    return `<div class="life-stack ${faceUpCount ? "has-face-up" : ""}" aria-label="${label}"><span class="life-slots">${slots}</span><b>${life.length}</b></div>`;
  }

  function renderLeader(
    leader: GameObservation["self"]["leader"],
    player: PlayerId,
    active: GameObservation,
    /** This side's `[On Play]` effects are being dropped. Drawn on the Leader
        because the rule is on the player and the Leader is the only card on
        the mat that is always there to carry it. */
    onPlayNegated = false,
  ): string {
    return renderCard(
      {
        ...leader,
        instanceId: `${player}-leader`,
        cost: 0,
        ...(onPlayNegated ? { onPlayNegated: true } : {}),
      },
      active,
      "leader",
    );
  }

  function renderStage(stage: GameObservation["self"]["stage"]): string {
    return stage
      ? renderCard(
          { ...stage, counter: 0 },
          ctx.match.game?.activeObservation ?? null,
          "stage",
        )
      : `<div class="empty-slot"><span>Stage</span></div>`;
  }

  function renderBoard(
    board: GameObservation["self"]["board"],
    active: GameObservation,
    owned = false,
  ): string {
    return Array.from({ length: 5 }, (_, index) =>
      board[index]
        ? renderCard(board[index], active, "normal", true, owned)
        : `<div class="empty-slot character"><span>Character</span></div>`,
    ).join("");
  }

  /**
   * `optionId` is opaque by contract, and its second segment is not always the
   * source: OP15-058 Enel's Leader encodes its *target* there, so parsing the id
   * filed the Leader's ability under whichever Character it was aimed at. Every
   * `activate-main` names its source, so match on that instead.
   */
  function sourceActions(
    observation: GameObservation,
    instanceId: string,
  ): LegalAction[] {
    return observation.legalActions.filter((action) => {
      if (action.type === "play-card")
        return action.cardInstanceId === instanceId;
      if (action.type === "attack")
        return action.attackerInstanceId === instanceId;
      if (action.type !== "activate-main") return false;
      return action.sourceInstanceId === instanceId;
    });
  }

  /**
   * Which of the two board-aimed offers is being aimed right now, if either.
   *
   * An attack and a DON!! attachment both name a card that is on the board, so
   * both are answered there. A Main activation is not always aimed at a board
   * card at all, so it keeps its own list and never puts the board in this
   * mode.
   */
  function boardTargeting(): "attack" | "attach-don" | null {
    return state.targetMode === "attack" || state.targetMode === "attach-don"
      ? state.targetMode
      : null;
  }

  /** The action a click on this card would take while the board is the question. */
  function targetAction(
    observation: GameObservation,
    instanceId: string,
  ): LegalAction | undefined {
    const mode = boardTargeting();
    if (mode === "attach-don")
      return observation.legalActions.find(
        (action) =>
          action.type === "attach-don" &&
          action.targetInstanceId === instanceId,
      );
    if (mode === "attack" && state.mainSelection?.kind === "card") {
      const attackerInstanceId = state.mainSelection.instanceId;
      return observation.legalActions.find(
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === attackerInstanceId &&
          action.targetInstanceId === instanceId,
      );
    }
    return undefined;
  }

  function renderCard(
    card: {
      instanceId: string;
      cardNumber: string;
      name: string;
      cost?: number;
      /** The engine's price for this card: its hand price in hand, its
          `currentCost` on the field. Absent wherever no observation is behind
          the face -- a catalog preview, the top of a trash pile. */
      currentCost?: number;
      power?: number;
      currentPower?: number;
      counter?: number;
      rested?: boolean;
      blocker?: boolean;
      attachedDon?: number;
      playedTurn?: number;
      cannotAttackUntilTurn?: number;
      cannotAttackSourceCardNumber?: string;
      cannotRestUntilTurn?: number;
      cannotRestSourceCardNumber?: string;
      cannotRefreshUntilTurn?: number;
      negated?: boolean;
      /**
       * Set on a face whose side has its `[On Play]` effects switched off --
       * OP09-081 Marshall.D.Teach's Leader, permanently on its own side and
       * for a turn on the side it pays to switch off.
       *
       * Nothing else on the board can say it. The rule is written on the
       * player, not on any card, so the only evidence of it is a Character
       * landing and its printed clause quietly not happening.
       */
      onPlayNegated?: boolean;
      grantedKeywords?: readonly GrantedKeywordObservation[];
    },
    active: GameObservation | null,
    size = "normal",
    interactive = true,
    /** Set for the viewer's own Characters, whose legal actions are on the observation. */
    owned = false,
  ): string {
    const definition = requireKnownCard(card.cardNumber);
    const basePower = card.power ?? definition.power;
    const power = card.currentPower ?? basePower;
    const powerModified =
      power !== null && basePower !== null && power !== basePower;
    const powerDirection =
      powerModified && power > basePower ? "increased" : "decreased";
    // The printed cost is on the art itself (the face's own `card-top b` is
    // hidden for exactly that reason), so the badge is drawn over it and only
    // when the engine disagrees with it.
    const cost = costOverlay(card.cost, card.currentCost);
    const attachedDon = card.attachedDon ?? 0;
    const actions =
      active && active.phase === "main" && activeController() === "human"
        ? sourceActions(active, card.instanceId)
        : [];
    const isSelected =
      state.mainSelection?.kind === "card" &&
      state.mainSelection.instanceId === card.instanceId;
    // While the board is the question, a card that can answer it says so on
    // its own face -- lit, and named as such for a reader who cannot see the
    // highlight.
    const targetOffer =
      interactive && active ? targetAction(active, card.instanceId) : undefined;
    const targetLabel = targetOffer
      ? targetOffer.type === "attack"
        ? ", legal attack target"
        : ", legal DON!! recipient"
      : "";
    const color = definition.colors?.[0]?.toLowerCase() ?? "neutral";
    const battleRole =
      active?.activeBattle?.attackerInstanceId === card.instanceId
        ? "attacking"
        : active?.activeBattle?.targetInstanceId === card.instanceId
          ? "attack-target"
          : "";
    const battleLabel =
      battleRole === "attacking"
        ? ", attacking"
        : battleRole === "attack-target"
          ? ", attack target"
          : "";
    const blockerLabel = card.blocker ? ", Blocker ready" : "";
    const attackLocked =
      active !== null &&
      card.cannotAttackUntilTurn !== undefined &&
      card.cannotAttackUntilTurn >= active.turn;
    const attackLockSourceName = card.cannotAttackSourceCardNumber
      ? requireKnownCard(card.cannotAttackSourceCardNumber).name
      : undefined;
    const attackLockLabel = attackLocked
      ? `, cannot attack through turn ${card.cannotAttackUntilTurn}${attackLockSourceName ? ` (held by ${attackLockSourceName})` : ""}`
      : "";
    // Resting is the cost of both attacking and blocking, so a Character that
    // cannot be rested is an active body with no legal action at all -- which
    // on the board is indistinguishable from one that simply has nothing to do.
    const restLocked =
      active !== null &&
      card.cannotRestUntilTurn !== undefined &&
      card.cannotRestUntilTurn >= active.turn;
    const restLockSourceName = card.cannotRestSourceCardNumber
      ? requireKnownCard(card.cannotRestSourceCardNumber).name
      : undefined;
    const restLockLabel = restLocked
      ? `, cannot be rested through turn ${card.cannotRestUntilTurn}${restLockSourceName ? ` (held by ${restLockSourceName})` : ""}`
      : "";
    // A Character held down by something like Lightning Dragon is rested and
    // otherwise ordinary: without a badge the only clue is that it silently
    // failed to stand up in the Refresh Phase.
    const refreshLocked =
      active !== null &&
      card.cannotRefreshUntilTurn !== undefined &&
      card.cannotRefreshUntilTurn >= active.turn;
    const refreshLockLabel = refreshLocked
      ? `, stays rested through turn ${card.cannotRefreshUntilTurn}`
      : "";
    // A Character cannot attack on the turn it was played unless it has [Rush].
    // Nothing on the card says so: it stands there active, with a power and no
    // attack action, which reads exactly like an opponent's effect holding it
    // down. Shown only while attacks are actually on offer, so a Character with
    // granted [Rush] -- which the printed keywords do not know about -- is never
    // labelled by the mere absence of an action mid-resolution.
    const summoningSick =
      owned &&
      active !== null &&
      active.phase === "main" &&
      activeController() === "human" &&
      card.playedTurn === active.turn &&
      card.rested === false &&
      !attackLocked &&
      !actions.some((action) => action.type === "attack") &&
      active.legalActions.some((action) => action.type === "attack");
    const summoningSickLabel = summoningSick
      ? ", played this turn, cannot attack until your next turn"
      : "";
    // A negated Character keeps its printed text on the card and runs none of it,
    // so the board is the only place that can say so.
    const negatedLabel = card.negated ? ", effects negated" : "";
    const onPlayNegatedLabel = card.onPlayNegated
      ? ", [On Play] effects negated"
      : "";
    // Granted keywords are the mirror image: nothing on the card prints them,
    // and the only evidence of one is the Character doing something its text
    // says it cannot -- attacking the turn it landed, most often.
    const granted = card.grantedKeywords ?? [];
    const grantedLabel = granted.length
      ? `, granted ${granted.map((grant) => grant.keyword).join(" and ")} through turn ${Math.max(...granted.map((grant) => grant.expiresAtTurn))}`
      : "";
    const donLabel = attachedDon
      ? `, ${attachedDon} DON!! attached, ${formatCompactStat(power ?? 0)} power`
      : "";
    const costLabel = cost ? `, ${cost.title.toLowerCase()}` : "";
    const art = assetUrl(card.cardNumber);
    const element = interactive ? "button" : "div";
    const clickTitle = targetOffer
      ? targetOffer.type === "attack"
        ? `Attack ${card.name}`
        : `Attach ${state.donAttachCount} DON!! to ${card.name}`
      : `Select ${card.name}`;
    const attributes = interactive
      ? `data-card="${escapeHtml(card.cardNumber)}" data-instance="${escapeHtml(card.instanceId)}" title="${escapeHtml(clickTitle)}"`
      : `role="img"`;
    const flags = [
      attackLocked
        ? `<span class="attack-lock-badge" title="${attackLockSourceName ? `${escapeHtml(attackLockSourceName)} — ` : ""}Cannot attack through turn ${card.cannotAttackUntilTurn}">Can't attack</span>`
        : "",
      restLocked
        ? `<span class="rest-lock-badge" title="${restLockSourceName ? `${escapeHtml(restLockSourceName)} — ` : ""}Cannot be rested through turn ${card.cannotRestUntilTurn}, so it cannot attack or use [Blocker]">Can't rest</span>`
        : "",
      refreshLocked
        ? `<span class="refresh-lock-badge" title="Will not become active in the Refresh Phase through turn ${card.cannotRefreshUntilTurn}">Stays rested</span>`
        : "",
      summoningSick
        ? `<span class="summoning-sick-badge" title="Played this turn — a Character cannot attack on the turn it is played unless it has [Rush]">Can't attack yet</span>`
        : "",
      card.negated
        ? `<span class="negated-badge" title="This Character's own effects are negated for the turn">Negated</span>`
        : "",
      card.onPlayNegated
        ? `<span class="on-play-off-badge" title="${
            size === "leader"
              ? "This side's [On Play] effects are negated — a Character played now lands with its [On Play] doing nothing"
              : "Your [On Play] effects are negated — play this card now and its [On Play] will not resolve"
          }">No [On Play]</span>`
        : "",
      ...granted.map(
        (grant) =>
          `<span class="granted-keyword-badge" title="Granted [${grant.keyword}] through turn ${grant.expiresAtTurn} — ${GRANTED_KEYWORD_CONSEQUENCE[grant.keyword]}">${grant.keyword}</span>`,
      ),
    ].filter(Boolean);
    return `<${element} class="game-card ${size} ${card.rested ? "rested" : ""} ${attackLocked ? "attack-locked" : ""} ${restLocked ? "rest-locked" : ""} ${refreshLocked ? "refresh-locked" : ""} ${attachedDon ? "has-don" : ""} ${actions.length && !boardTargeting() ? "actionable-source" : ""} ${targetOffer ? "valid-target" : ""} ${isSelected ? "selected-source" : ""} ${battleRole} ${art ? "has-art" : ""}" ${attributes} style="--card-color:var(--${color})${art ? `;--card-art:url('${art}')` : ""}" aria-label="${escapeHtml(card.name)}${battleLabel}${blockerLabel}${attackLockLabel}${restLockLabel}${refreshLockLabel}${summoningSickLabel}${negatedLabel}${onPlayNegatedLabel}${grantedLabel}${donLabel}${targetLabel}${costLabel}">
    <span class="card-top"><b>${card.cost ?? "L"}</b><small>${escapeHtml(card.cardNumber)}</small></span>
    ${cost ? `<span class="cost-overlay ${cost.direction}" title="${escapeHtml(cost.title)}"><small>C</small><b>${cost.cost}</b></span>` : ""}
    ${card.blocker ? `<span class="blocker-badge" title="Blocker ready">${icon("shield", "Blocker ready")}</span>` : ""}
    ${flags.length ? `<span class="card-flags">${flags.join("")}</span>` : ""}
    ${attachedDon ? `<span class="don-badge" title="${attachedDon} DON!! attached"><small>DON!!</small><b>×${attachedDon}</b></span>` : ""}
    <strong>${escapeHtml(card.name)}</strong>
    ${
      powerModified
        ? `<span class="power-overlay ${powerDirection}" title="Power ${powerDirection} from ${formatCompactStat(basePower)} to ${formatCompactStat(power)}"><small>P</small><b>${formatCompactStat(power)}</b></span>`
        : ""
    }
  </${element}>`;
  }

  function renderActions(
    actions: readonly LegalAction[],
    playerIsActive: boolean,
    active: GameObservation,
  ): string {
    if (active.phase === "finished")
      return `<div class="result"><p class="eyebrow">Match complete</p><h2>${active.winner?.toUpperCase()} wins</h2><p>${active.resultReason?.replace("-", " ")}</p><button class="primary" id="result-new">New match</button></div>`;
    if (!playerIsActive)
      return `<div class="waiting"><span class="compass"></span><h2>Opponent thinking</h2><p>The board will advance automatically.</p></div>`;
    const effectAction = actions.find(
      (action) => action.type === "resolve-effect",
    );
    // A DON!! payment is titled for the DON!! deck the cards are going to, not
    // for "cost". The card's own cost is the number printed on it, which was
    // paid to put it on the board; this is a price its text asks for
    // afterwards, and naming it "cost" made the modal read as a bill for
    // something already settled.
    const composing = donReturnComposition(actions, active);
    const title =
      active.phase === "mulligan"
        ? active.viewer === active.turnPlayer
          ? "Keep this opening hand? (You go first)"
          : "Keep this opening hand? (You go second)"
        : composing
          ? "Return DON!! to your DON!! deck"
          : // Several cards answering one event: the source the pending effect
            // names is just the first of them, so the title says what is
            // being decided instead of crediting one card.
            effectAction?.optionId.startsWith("reaction:")
            ? "Choose which effect resolves first"
            : effectAction
              ? `Resolve ${requireKnownCard(effectAction.sourceCardNumber).name}'s card effect`
              : phaseLabel(active.phase);
    const listedActions =
      active.phase === "main"
        ? actions.filter((action) => action.type !== "pass")
        : actions;
    // The opening hand is the one hand a player has to read whole before
    // choosing, so on a phone it is read the way the hand sheet is read: one
    // card to a row, its printed text beside it. The text is drawn at every
    // width and shown only below 760px (responsive.css), where the row of
    // faces gives way to that column -- a face small enough to sit five
    // across carries no legible words.
    const mulliganHand =
      active.phase === "mulligan"
        ? `<div class="mulligan-hand-preview" aria-label="Opening hand">${active.self.hand
            .map(
              (card) =>
                `<div class="mulligan-hand-entry"><button class="mulligan-card-inspect" type="button" data-inspect-card="${escapeHtml(card.cardNumber)}" aria-label="View ${escapeHtml(card.name)} details">${renderCard(card, null, "mulligan-preview", false)}</button><div class="mulligan-card-text rule-card"><strong>${escapeHtml(card.name)}</strong>${renderRuleText(card.cardNumber)}</div></div>`,
            )
            .join("")}</div>`
        : "";
    if (composing) {
      return `<div class="actions-heading"><div><h2>${escapeHtml(title)}</h2></div></div>${renderDonReturnComposer(composing, active)}`;
    }
    const ordering = listedActions.find(
      (action) =>
        action.type === "resolve-effect" && action.option.kind === "order",
    );
    if (ordering) {
      return `<div class="actions-heading"><div><h2>${escapeHtml(title)}</h2></div></div>${renderBottomOrder(ordering)}`;
    }
    const hasCardChoices = listedActions.some(
      (action) => actionChoiceCard(action, active) !== null,
    );
    const decisionContext = renderEffectDecisionContext(listedActions);
    const clause = effectAction ? renderEffectClause(effectAction, active) : "";
    // No second X in the heading: it never had a handler, and the surface's own
    // close button in the corner is the one that does the closing.
    return `<div class="actions-heading"><div><h2>${escapeHtml(title)}</h2>${clause}</div></div>${decisionContext}${mulliganHand}${renderTriggerContext(active)}${renderBattleContext(active)}<div class="action-list ${hasCardChoices ? "card-choice-list" : ""}">${listedActions.map((action) => renderActionButton(action, active)).join("") || `<p class="muted">No other legal actions.</p>`}</div>`;
  }

  /**
   * Answers one pool prompt from the composed payment, if there is one to
   * answer. True when it acted, and the caller should stand down.
   *
   * The plan is a queue, not a set of answers: the engine stops asking as soon
   * as only one pool could supply the rest, so what is left over is dropped
   * when the payment ends. A plan entry with no matching offer is dropped too,
   * and the whole plan with it -- the board has moved since it was composed,
   * and guessing again would spend a DON!! the player did not pick. The prompt
   * then draws as it always did, which is the honest fallback.
   */
  function spendDonReturnPlan(active: GameObservation): boolean {
    const draft = state.donReturn;
    if (!draft) return false;
    const prompts = active.legalActions.filter(
      (action): action is Extract<LegalAction, { type: "resolve-effect" }> =>
        action.type === "resolve-effect" && action.option.kind === "don-return",
    );
    if (prompts.length === 0) {
      // The payment is over once nothing about it is on offer. Its own count
      // prompt is exempt: that is this decision still waiting to be made.
      if (listedDonReturnCounts(active.legalActions).length === 0) {
        state.donReturn = null;
      }
      return false;
    }
    const wanted = draft.plan[0];
    const match = prompts.find(
      (action) =>
        action.option.kind === "don-return" &&
        donReturnPoolKey(action.option) === wanted,
    );
    if (!match) {
      draft.plan = [];
      return false;
    }
    draft.plan = draft.plan.slice(1);
    performAction(match.actionId);
    return true;
  }

  /** The offered "how many DON!! go back" options, if that is the decision. */
  function listedDonReturnCounts(
    actions: readonly LegalAction[],
  ): Extract<LegalAction, { type: "resolve-effect" }>[] {
    return actions.filter(
      (action): action is Extract<LegalAction, { type: "resolve-effect" }> =>
        action.type === "resolve-effect" &&
        action.option.kind === "don-return-count",
    );
  }

  /** The offered "which pool did this DON!! come out of" prompts. */
  function listedDonReturnPools(
    actions: readonly LegalAction[],
  ): Extract<LegalAction, { type: "resolve-effect" }>[] {
    return actions.filter(
      (action): action is Extract<LegalAction, { type: "resolve-effect" }> =>
        action.type === "resolve-effect" && action.option.kind === "don-return",
    );
  }

  /**
   * The DON!! payment on the table, whichever printed shape asked for it.
   *
   * A `DON!! −2` and a "return 1 or more" are one decision to make and were
   * two surfaces to make it on: only the second is offered as a count, so only
   * the second reached the composer, and a fixed cost fell back to one modal
   * per DON!! titled after a cost the player had already paid to play the card.
   * The difference between them is where the numbers come from, which is all
   * this has to reconcile.
   */
  function donReturnComposition(
    actions: readonly LegalAction[],
    observation: GameObservation,
  ): DonReturnComposition | null {
    const counts = listedDonReturnCounts(actions);
    if (counts.length > 0) {
      return {
        sourceCardNumber: counts[0]!.sourceCardNumber,
        rows: donReturnPoolRows(observation, viewerFor(ctx.match.game!)),
        counts: counts
          .map((action) =>
            action.option.kind === "don-return-count" ? action.option.count : 0,
          )
          .sort((first, second) => first - second),
        prepaid: false,
      };
    }
    const prompts = listedDonReturnPools(actions);
    const first = prompts[0]?.option;
    if (!first || first.kind !== "don-return") return null;
    return {
      sourceCardNumber: prompts[0]!.sourceCardNumber,
      rows: donReturnPromptRows(prompts),
      // One size only: the cost is printed. `remaining` is the DON!! still
      // waiting to be placed, and this prompt is raised before any of them
      // are, so on the surface it is the whole payment.
      counts: [first.remaining],
      prepaid: true,
    };
  }

  /** The same, read off the position the board is drawing. */
  function currentDonReturnComposition(): DonReturnComposition | null {
    const game = ctx.match.game;
    if (!game) return null;
    return donReturnComposition(
      game.activeObservation.legalActions,
      game.activeObservation,
    );
  }

  /** The pool an offered `don-return` option names, as the composer keys them. */
  function donReturnPoolKey(
    option: Extract<EffectOption, { kind: "don-return" }>,
  ): string {
    return option.pool === "attached" && option.card
      ? option.card.instanceId
      : option.pool;
  }

  /**
   * Where this player's DON!! are, cheapest-first.
   *
   * The same order `donReturnPools` offers them in, which is also the order the
   * engine takes them in when nobody chooses -- so the composer's untouched
   * default is the payment that would have been made anyway.
   *
   * Derived from the observation rather than from offered actions because the
   * pools have to be on screen *before* the count is submitted, and the engine
   * does not offer them until after. Every figure here is this player's own
   * public board. A pool that turns out not to be offered is not a
   * disagreement to reconcile: the plan entry simply finds no match and the
   * decision is handed back to the player.
   */
  function donReturnPoolRows(
    observation: GameObservation,
    viewer: PlayerId,
  ): { pool: DonReturnPool; label: string; note: string }[] {
    const self = observation.self;
    return [
      {
        pool: { key: "rested", available: self.restedDon },
        label: "Rested DON!!",
        note: "already spent this turn",
      },
      {
        pool: { key: "active", available: self.activeDon },
        label: "Active DON!!",
        note: "you could still spend these",
      },
      {
        pool: {
          key: `${viewer}-leader`,
          available: self.leader.attachedDon,
        },
        label: `On ${self.leader.name}`,
        note: "−1000 power each",
      },
      ...self.board.map((card) => ({
        pool: { key: card.instanceId, available: card.attachedDon },
        label: `On ${card.name}`,
        note: "−1000 power each",
      })),
    ].filter((row) => row.pool.available > 0);
  }

  /**
   * The same rows for a payment already made, read off the prompts.
   *
   * A printed `DON!! −N` is paid before the player is asked where from: the
   * DON!! are in the DON!! deck and the pools on the board are short of them,
   * so the observation can no longer say what there was to choose between.
   * Each offer reports what its own pool held before the cost was paid, which
   * is what the split is over. Offered in `donReturnPools` order, which is the
   * cheapest-first order the plan is drawn from.
   */
  function donReturnPromptRows(
    prompts: readonly Extract<LegalAction, { type: "resolve-effect" }>[],
  ): { pool: DonReturnPool; label: string; note: string }[] {
    return prompts.flatMap((action) => {
      const option = action.option;
      if (option.kind !== "don-return") return [];
      const pool = {
        key: donReturnPoolKey(option),
        available: option.available,
      };
      if (option.pool === "rested") {
        return [
          { pool, label: "Rested DON!!", note: "already spent this turn" },
        ];
      }
      if (option.pool === "active") {
        return [
          { pool, label: "Active DON!!", note: "you could still spend these" },
        ];
      }
      return [
        {
          pool,
          label: `On ${option.card?.name ?? "a Character"}`,
          note: "−1000 power each",
        },
      ];
    });
  }

  /**
   * The whole DON!! payment in one surface: which DON!! go back, and how the
   * field looks once they have.
   *
   * The engine asks a "return 1 or more" as two decisions -- how many, and
   * then one prompt per DON!! about which pool it came out of -- because the
   * second is only answerable once the first is. Asked that way on screen they
   * were two unrelated-looking modals, the second titled after a cost the
   * player had already paid to put the card on the board. A printed `DON!! −N`
   * raises only that second decision, and it draws here too: it is the same
   * question about the same DON!!, and it was the one card in the deck whose
   * payment looked nothing like its neighbour's.
   *
   * There is no separate count control: the size of the payment is the sum of
   * what the pools are giving up, and a stepper for the total beside steppers
   * for its parts was two ways to say one number, each able to move the other.
   * For a fixed cost the sum cannot move at all, and the steppers are how a
   * DON!! is moved from one pool to another.
   */
  function renderDonReturnComposer(
    composition: DonReturnComposition,
    observation: GameObservation,
  ): string {
    const { rows, counts, sourceCardNumber } = composition;
    const pools = rows.map((row) => row.pool);
    const floor = counts[0] ?? 1;
    const ceiling = counts[counts.length - 1] ?? 1;
    // A different card asking is a different payment, so a half-composed one
    // is dropped rather than carried onto it -- the same reading `bottomOrder`
    // takes of a half-made order. It opens on the payment the engine would
    // have made by itself: the cheapest DON!! first, up to the printed floor.
    if (state.donReturn?.sourceCardNumber !== sourceCardNumber) {
      state.donReturn = {
        sourceCardNumber,
        manual: allocateDonReturn(pools, floor, {}),
        plan: [],
      };
    }
    const draft = state.donReturn;
    const allocation = clampDonReturn(pools, draft.manual, ceiling);
    const total = totalDonReturned(allocation);
    const taken = (key: string) => allocation[key] ?? 0;
    const poolList = rows
      .map((row) => {
        const count = taken(row.pool.key);
        return `<li class="don-pool-row ${count > 0 ? "taking" : ""}">
        <span class="don-pool-name"><b>${escapeHtml(row.label)}</b><small>${row.pool.available} there · ${escapeHtml(row.note)}</small></span>
        <span class="don-quantity" role="group" aria-label="${escapeHtml(`DON!! to return from ${row.label}`)}">
          <button data-don-pool-less="${escapeHtml(row.pool.key)}" type="button" title="Return one fewer from here" ${count <= 0 ? "disabled" : ""}>${icon("minus", "Return one fewer")}</button>
          <output aria-live="polite">${count}</output>
          <button data-don-pool-more="${escapeHtml(row.pool.key)}" type="button" title="Return one more from here" ${count >= row.pool.available || total >= ceiling ? "disabled" : ""}>${icon("plus", "Return one more")}</button>
        </span>
      </li>`;
      })
      .join("");
    // What the field looks like once it is paid. The DON!! deck grows by the
    // payment, which is the half of this trade a player cannot see anywhere
    // else -- and for the "1 or more" clauses the size of it is the whole
    // decision, since OP09-061's Leader refunds two DON!! for two or more.
    // A fixed cost has already moved its DON!! there, so only an unpaid
    // payment is still to be added.
    //
    // An unpaid payment reads its pools off the rows. A paid one cannot: a
    // row counts only the DON!! that were on the field when the cost was paid,
    // and a reaction to the payment -- that same Leader's refund -- can have
    // added DON!! since, which are on the field but could not have paid. So it
    // starts from the field as it stands, gives back what the engine's own
    // pick took, and takes the plan's.
    const enginePick = composition.prepaid
      ? allocateDonReturn(pools, floor, {})
      : {};
    const onField = (key: string) =>
      key === "active"
        ? observation.self.activeDon
        : key === "rested"
          ? observation.self.restedDon
          : 0;
    const left = (key: string) =>
      composition.prepaid
        ? onField(key) + (enginePick[key] ?? 0) - taken(key)
        : (rows.find((row) => row.pool.key === key)?.pool.available ?? 0) -
          taken(key);
    const donDeck =
      observation.self.donDeckCount + (composition.prepaid ? 0 : total);
    const payable = counts.includes(total);
    const short = composition.prepaid
      ? `Choose ${floor} DON!!`
      : `Choose at least ${floor} DON!!`;
    return `<ul class="don-pool-list">${poolList}</ul>
    <p class="don-return-summary">Afterwards: <b>${left("active")}</b> active · <b>${left("rested")}</b> rested · <b>${donDeck}</b> in your DON!! deck</p>
    <div class="action-list"><button class="action-button don-return-confirm" id="don-return-confirm" type="button" ${payable ? "" : "disabled"}><b>${payable ? `Return ${total} DON!!` : short}</b></button></div>`;
  }

  /**
   * The looked-at cards, in the order the deck held them.
   *
   * Every face is shown, not just the ones the effect can take: the printed
   * text is "look at 5", and a strip filtered down to the legal picks would
   * tell the player their deck's top is only ever what they were allowed to
   * fetch. Rendered non-interactively -- a `card-revealed` names a card, not an
   * instance, and there is nothing to click here anyway.
   */
  function renderLookNotice(look: LookNotice): string {
    const source = requireKnownCard(look.sourceCardNumber);
    return `<section class="look-notice" aria-label="Cards looked at"><p class="eyebrow" id="look-notice-title">${escapeHtml(source.name)} · looked at ${look.cardNumbers.length} card${look.cardNumbers.length === 1 ? "" : "s"}</p><div class="look-notice-cards">${look.cardNumbers
      .map((cardNumber) =>
        renderCard(
          {
            instanceId: "",
            cardNumber,
            name: requireKnownCard(cardNumber).name,
          },
          null,
          "look-preview",
          false,
        ),
      )
      .join("")}</div></section>`;
  }

  /**
   * The order the leftovers of a search will go to the bottom of the deck in.
   *
   * One action, so one panel and one submission: the engine offers the order
   * the cards were looked at and takes any permutation of it, and the arrows
   * below build that permutation before anything is spent. Left is placed
   * first, which is what puts it deepest -- the same thing the summary says in
   * words, because the picture alone cannot say which end of the deck this is.
   */
  function renderBottomOrder(action: LegalAction): string {
    if (action.type !== "resolve-effect" || action.option.kind !== "order")
      return "";
    const { cards } = action.option;
    const order = bottomOrderFor(action.actionId, cards.length);
    const slots = order
      .map((cardIndex, position) => {
        const card = cards[cardIndex]!;
        const move = (delta: number, label: string, glyph: string) =>
          `<button class="bottom-order-move" type="button" data-order-move="${position},${delta}" ${position + delta < 0 || position + delta >= order.length ? "disabled" : ""} aria-label="Move ${escapeHtml(card.name)} ${label}">${glyph}</button>`;
        return `<li class="bottom-order-slot">${renderCard({ instanceId: card.instanceId, cardNumber: card.cardNumber, name: card.name }, null, "order-preview", false)}<div class="bottom-order-controls">${move(-1, "earlier", "&#8592;")}<span>${position + 1}</span>${move(1, "later", "&#8594;")}</div></li>`;
      })
      .join("");
    const chosen = reorderAction(action, order);
    return `<p class="bottom-order-note">Placed left to right, so the leftmost card ends up deepest in your deck.</p><ol class="bottom-order">${slots}</ol><div class="action-list bottom-order-confirm"><button class="action-button resolve-effect" data-action="${escapeHtml(chosen.actionId)}"><b>Place them in this order</b></button></div>`;
  }

  /** The order on screen: whatever the arrows have made of the offer so far. */
  function bottomOrderFor(actionId: string, count: number): number[] {
    const stored = state.bottomOrder;
    if (
      stored &&
      stored.actionId === actionId &&
      stored.order.length === count
    ) {
      return stored.order;
    }
    return Array.from({ length: count }, (_, index) => index);
  }

  /**
   * Which side of the battle on the table the effect's own card is on.
   *
   * The timing marker follows the source, not the viewer: OP15-059 Amazon is a
   * defender that puts a choice to the attacker, and quoting its clause as a
   * `[When Attacking]` because the reader is attacking would name the wrong
   * half of the card.
   */
  function clauseTiming(
    sourceCardNumber: string,
    observation: GameObservation,
  ): "attacking" | "defending" | null {
    const battle = observation.activeBattle;
    if (!battle) return null;
    const mine = (instanceId: string): boolean =>
      instanceId === `${observation.viewer}-leader` ||
      observation.self.board.some((card) => card.instanceId === instanceId) ||
      observation.self.stage?.instanceId === instanceId;
    const sourceIsMine =
      observation.self.leader.cardNumber === sourceCardNumber ||
      observation.self.board.some(
        (card) => card.cardNumber === sourceCardNumber,
      ) ||
      observation.self.stage?.cardNumber === sourceCardNumber;
    const viewerAttacks = mine(battle.attackerInstanceId);
    return sourceIsMine === viewerAttacks ? "attacking" : "defending";
  }

  /**
   * The printed clause the modal is resolving, under its title.
   *
   * "Resolve Lucy's card effect" over a row of card faces says which card is
   * asking and nothing about what it wants. The clause is the sentence the
   * player would read off the card -- and a Leader never leaves the mat, so
   * the modal is the only place it can be read at the moment it matters.
   *
   * The marker alone when no text pack is loaded: the shipped build has none
   * (printed text is a runtime asset), and *when* an ability fired is still
   * more than the title said.
   */
  function renderEffectClause(
    action: Extract<LegalAction, { type: "resolve-effect" }>,
    observation: GameObservation,
  ): string {
    const marker = resolvingClauseMarker(
      printedClauses(action.sourceCardNumber),
      clauseTiming(action.sourceCardNumber, observation),
    );
    if (!marker) return "";
    const effect = printedText(action.sourceCardNumber)?.effect;
    const quote = effect ? clauseQuote(effect, marker) : undefined;
    return `<p class="effect-clause"><b>${escapeHtml(marker)}</b>${quote ? ` ${renderCardText(quote)}` : ""}</p>`;
  }

  function renderEffectDecisionContext(
    actions: readonly LegalAction[],
  ): string {
    const effectActions = actions.filter(
      (action): action is Extract<LegalAction, { type: "resolve-effect" }> =>
        action.type === "resolve-effect",
    );
    const sourceCardNumber = effectActions[0]?.sourceCardNumber;
    if (sourceCardNumber !== "OP13-042") return "";
    const cardChoices = effectActions.filter(
      (action) => action.option.kind === "card",
    );
    const choosingDiscard = cardChoices.some(
      (action) =>
        action.option.kind === "card" && action.option.zone === "hand",
    );
    if (choosingDiscard)
      return `<section class="effect-step" aria-label="Effect step 1 of 2"><p class="eyebrow">Step 1 of 2 · Draw and trash</p><strong>Choose exactly 1 card from your hand to trash.</strong><span>Your 2 cards have already been drawn. Step 2 will distribute rested DON!!.</span></section>`;
    const choosingCharacter = cardChoices.some(
      (action) =>
        action.option.kind === "card" && action.option.zone === "board",
    );
    if (choosingCharacter)
      return `<section class="effect-step" aria-label="Effect step 2 of 2"><p class="eyebrow">Step 2 of 2 · Distribute rested DON!!</p><strong>Choose up to 1 Character to receive up to 2 rested DON!!.</strong><span>The Leader choice is complete. Choose no more cards to skip this Character.</span></section>`;
    return `<section class="effect-step" aria-label="Effect step 2 of 2"><p class="eyebrow">Step 2 of 2 · Distribute rested DON!!</p><strong>Give your Leader up to 2 rested DON!!?</strong><span>Apply to give the DON!!, or skip. You will choose up to 1 Character next.</span></section>`;
  }

  function renderActionButton(
    action: LegalAction,
    observation: GameObservation,
  ): string {
    if (action.type === "mulligan-decision")
      return `<button class="action-button mulligan-decision mulligan-${action.decision === "keep" ? "keep" : "redraw"}" data-action="${escapeHtml(action.actionId)}"><b>${action.decision === "keep" ? "Keep these cards" : "Draw a new hand"}</b></button>`;
    const effectCard = effectOptionCard(action, observation);
    const classes = `${action.type} ${action.type === "pass" ? "secondary" : ""} ${actionStateClass(action, observation)}`;
    if (effectCard)
      return withCardInspector(
        effectCard.cardNumber,
        effectCard.name,
        `<button class="action-button action-card-choice effect-card-choice ${classes}" data-action="${escapeHtml(action.actionId)}">${renderCard(effectCard, null, "effect-preview", false)}<b>${escapeHtml(effectChoiceSummary(action, observation, effectCard.name))}</b></button>`,
      );
    const choiceCard = actionChoiceCard(action, observation);
    if (choiceCard)
      return withCardInspector(
        choiceCard.cardNumber,
        choiceCard.name,
        `<button class="action-button action-card-choice ${classes}" data-action="${escapeHtml(action.actionId)}">${renderCard(choiceCard, null, "action-choice-preview", false)}<b>${escapeHtml(picturedSummary(actionSummary(action, observation), choiceCard.name))}</b></button>`,
      );
    const summary =
      action.type === "resolve-effect"
        ? optionalEffectSummary(
            actionSummary(action, observation),
            action.sourceCardNumber,
          )
        : actionSummary(action, observation);
    return `<button class="action-button ${classes}" data-action="${escapeHtml(action.actionId)}">${action.type === "resolve-effect" || action.type === "resolve-trigger" ? "" : `<span>${actionTypeLabel(action.type)}</span>`}<b>${escapeHtml(summary)}</b></button>`;
  }

  /**
   * A card choice, with a way to read the card it is offering.
   *
   * The face on the button is the size of a thumbnail and its printed text is
   * unreadable at that size, so a modal that asks which Event to spend was
   * asking about cards the player could not read without closing it. The
   * button itself takes the action, which is why the inspector is a sibling
   * rather than a control inside it -- a button inside a button is not
   * markup a browser will honour.
   */
  function withCardInspector(
    cardNumber: string,
    cardName: string,
    button: string,
  ): string {
    return `<div class="action-choice-cell">${button}<button class="choice-inspect" type="button" data-inspect-card="${escapeHtml(cardNumber)}" title="Read ${escapeHtml(cardName)}" aria-label="Read ${escapeHtml(cardName)}">${icon("search", `Read ${cardName}`)}</button></div>`;
  }

  /**
   * What the button says over the card it is picturing.
   *
   * The engine's own summary for a card choice is "Choose <name>", and beside
   * a face that already prints the name it says nothing at all. Where the
   * engine reports where the card is going -- which it does exactly when that
   * move is the whole of the choice -- the verb replaces it: "Trash" over a
   * picture of Fire Fist is the decision in one word.
   */
  function effectChoiceSummary(
    action: LegalAction,
    observation: GameObservation,
    cardName: string,
  ): string {
    if (
      action.type === "resolve-effect" &&
      action.sourceCardNumber === "OP13-042" &&
      action.option.kind === "card"
    ) {
      if (action.option.zone === "hand") return `Trash ${cardName}`;
      if (action.option.zone === "board") return `Give DON!! to ${cardName}`;
    }
    // The face names the card and the title names the decision, so the
    // engine's full sentence would say both again under every card.
    if (
      action.type === "resolve-effect" &&
      action.optionId.startsWith("reaction:")
    ) {
      return "Resolve first";
    }
    if (action.type === "resolve-effect" && action.destination) {
      const verb = destinationVerb(action.destination);
      if (verb) return verb;
    }
    return actionSummary(action, observation);
  }

  function effectOptionCard(
    action: LegalAction,
    observation: GameObservation,
  ): {
    instanceId: string;
    cardNumber: string;
    name: string;
    cost?: number;
  } | null {
    if (
      action.type !== "resolve-effect" ||
      action.optionId === "skip" ||
      action.optionId.endsWith(":skip")
    )
      return null;
    const instanceId = action.optionId.split(":").at(-1) ?? action.optionId;
    const visibleCard = [
      ...observation.self.hand,
      ...observation.self.board,
      ...(observation.self.stage ? [observation.self.stage] : []),
      ...faceUpLifeCards(observation.self.life),
      ...observation.opponent.board,
      ...(observation.opponent.stage ? [observation.opponent.stage] : []),
      ...faceUpLifeCards(observation.opponent.life),
    ].find((card) => card.instanceId === instanceId);
    if (visibleCard) return visibleCard;
    if (!action.optionCardNumber) return null;
    const definition = requireKnownCard(action.optionCardNumber);
    return {
      instanceId,
      cardNumber: action.optionCardNumber,
      name: definition.name,
      ...(definition.cost === null ? {} : { cost: definition.cost }),
    };
  }

  function visibleObservationCard(
    instanceId: string,
    observation: GameObservation,
  ): Parameters<typeof renderCard>[0] | null {
    if (instanceId === `${observation.viewer}-leader`) {
      return {
        instanceId,
        ...observation.self.leader,
      };
    }
    if (instanceId.endsWith("-leader")) {
      return {
        instanceId,
        ...observation.opponent.leader,
      };
    }
    return (
      [
        ...observation.self.hand,
        ...observation.self.board,
        ...(observation.self.stage ? [observation.self.stage] : []),
        ...faceUpLifeCards(observation.self.life),
        ...observation.opponent.board,
        ...(observation.opponent.stage ? [observation.opponent.stage] : []),
        ...faceUpLifeCards(observation.opponent.life),
      ].find((card) => card.instanceId === instanceId) ?? null
    );
  }

  function actionChoiceCard(
    action: LegalAction,
    observation: GameObservation,
  ): Parameters<typeof renderCard>[0] | null {
    if (action.type === "resolve-effect")
      return effectOptionCard(action, observation);
    const instanceId =
      action.type === "play-card" || action.type === "counter"
        ? action.cardInstanceId
        : action.type === "activate-counter-event"
          ? action.eventInstanceId
          : action.type === "attach-don" || action.type === "attack"
            ? action.targetInstanceId
            : action.type === "activate-main"
              ? action.targetInstanceId
              : action.type === "block"
                ? action.blockerInstanceId
                : action.type === "resolve-trigger" &&
                    action.optionId !== "skip" &&
                    action.optionId !== "activate"
                  ? action.optionId
                  : undefined;
    return instanceId ? visibleObservationCard(instanceId, observation) : null;
  }

  /**
   * `selectedInstanceId` is the card the modal is already previewing at full
   * size. An action on that same card -- playing the card you just picked out
   * of hand, most of them -- would otherwise repeat its art inside the button,
   * which buys nothing and costs the tall `target-card-choice` layout that
   * pushed the only action below the modal's fold.
   *
   * `soleOfItsType` says nothing else on this list is the same kind of action,
   * and with the card itself beside the button the summary is then pure
   * repetition: "Play Thousand Sunny [ST31-005] (cost 1 DON!!)" next to a
   * preview that prints the name, the number and the cost. Such a button
   * collapses to its label. The summary stays wherever it is still telling
   * the reader something -- an action on a *different* card, or two options of
   * the same type that only their summaries tell apart.
   */
  function renderContextActionButton(
    action: LegalAction,
    observation: GameObservation,
    options: {
      selectedInstanceId?: string;
      soleOfItsType?: boolean;
      soleTypeOnCard?: boolean;
      /**
       * Keep the target's face even when the target *is* the selected card.
       * The reasoning above holds only where the modal is already previewing
       * that card beside the button; the target picker is a list and nothing
       * else, so there dropping the face would leave a row of bare sentences.
       */
      alwaysPictureTarget?: boolean;
      /**
       * Label the row with which card it is aimed at rather than with the kind
       * of action it is. In the picker the kind is already the heading, and
       * every row shares it; what tells two rows apart is the target -- and
       * two of them can carry the same name, one Leader and one Character, so
       * the role goes in the label with it.
       */
      pickerRow?: boolean;
    } = {},
  ): string {
    const {
      selectedInstanceId,
      soleOfItsType = false,
      soleTypeOnCard = false,
      alwaysPictureTarget = false,
      pickerRow = false,
    } = options;
    const choice = actionChoiceCard(action, observation);
    const targetCard =
      choice && choice.instanceId === selectedInstanceId && !alwaysPictureTarget
        ? null
        : choice;
    const sourceCard = selectedInstanceId
      ? visibleObservationCard(selectedInstanceId, observation)
      : null;
    if (targetCard) {
      // The type eyebrow is dropped when several offers on this card are all
      // of the same type: four buttons each headed ACTIVATE MAIN, under a card
      // whose printed [Activate: Main] clause is quoted above them, told the
      // reader nothing on the fourth reading that they did not have on the
      // first. A lone button repeats nothing, so it keeps its heading -- it is
      // the only thing naming which of the card's clauses is on offer.
      const eyebrow = pickerRow
        ? `<span>${escapeHtml(pickerTargetName(observation, targetCard))}</span>`
        : soleTypeOnCard
          ? ""
          : `<span>${actionTypeLabel(action.type)}</span>`;
      return `<button class="action-button target-card-choice ${action.type}" data-action="${escapeHtml(action.actionId)}">${renderCard(targetCard, null, "action-target-preview", false)}${eyebrow}<b>${escapeHtml(picturedSummary(actionSummary(action, observation), targetCard.name, sourceCard?.name))}</b></button>`;
    }
    if (soleOfItsType) {
      return `<button class="action-button context-action-plain ${action.type}" data-action="${escapeHtml(action.actionId)}"><b>${escapeHtml(actionName(action.type))}</b></button>`;
    }
    return `<button class="action-button ${action.type}" data-action="${escapeHtml(action.actionId)}"><span>${actionTypeLabel(action.type)}</span><b>${escapeHtml(actionSummary(action, observation))}</b></button>`;
  }

  function actionStateClass(
    action: LegalAction,
    observation: GameObservation,
  ): string {
    if (action.type === "resolve-effect")
      return action.optionId === "skip" || action.optionId.endsWith(":skip")
        ? "effect-pass"
        : "effect-add";
    if (action.type === "resolve-trigger" && action.optionId === "skip")
      return "trigger-pass";
    if (
      counterDefenseHolds(observation) &&
      (action.type === "counter" || action.type === "activate-counter-event")
    )
      return "counter-extra";
    // The panel used to also print "Defense holds · no more counters needed"
    // above the list. The Pass button reads "Defense wins" and is lit green:
    // the sentence was the same fact a third time.
    if (counterDefenseHolds(observation) && action.type === "pass")
      return "counter-resolve-ready";
    return "";
  }

  type TargetPickerKind = NonNullable<BattleState["targetMode"]>;

  /**
   * Whether this kind of offer is answered in a second modal rather than
   * listed outright in the first.
   *
   * An attack always is: it is the turn's most committing move, and one
   * Character with five legal targets used to fill the card's own panel with
   * five near-identical buttons before the reader had decided to attack at
   * all. A Main activation qualifies once it has more than one target or
   * option to weigh; a single one is a button whose label is the whole
   * decision, and a modal in front of it would ask a question with one answer.
   */
  function picksTargetsSeparately(
    type: LegalAction["type"],
    count: number,
  ): type is TargetPickerKind {
    return type === "attack" || (type === "activate-main" && count > 1);
  }

  /** The first step: one button per offer, collapsed to one per *kind* for
   *  the kinds whose targets are chosen in the picker. */
  function renderSourceActionButtons(
    source: readonly LegalAction[],
    countOfType: ReadonlyMap<LegalAction["type"], number>,
    observation: GameObservation,
    selectedInstanceId: string,
  ): string {
    const groupTypes = new Set(
      [...countOfType]
        .filter(([type, count]) => picksTargetsSeparately(type, count))
        .map(([type]) => type),
    );
    const plain = source.filter((action) => !groupTypes.has(action.type));
    const plainTypes = new Set(plain.map((action) => action.type));
    // The eyebrow is dropped only when the whole list is several offers of one
    // kind: naming that kind on every row tells the reader nothing they did
    // not have on the first row. A group button in the list breaks that, since
    // then the eyebrows are what tell the two kinds apart.
    const soleTypeOnCard =
      groupTypes.size === 0 && plainTypes.size === 1 && plain.length > 1;
    const rendered = new Set<LegalAction["type"]>();
    return source
      .map((action) => {
        const count = countOfType.get(action.type) ?? 0;
        if (picksTargetsSeparately(action.type, count)) {
          if (rendered.has(action.type)) return "";
          rendered.add(action.type);
          return renderTargetGroupButton(action.type, count);
        }
        return renderContextActionButton(action, observation, {
          selectedInstanceId,
          soleOfItsType: count === 1,
          soleTypeOnCard,
        });
      })
      .join("");
  }

  /**
   * A target's name as a picker row has to say it: with the role that tells a
   * Leader from the Character of the same name, which several decks print.
   * Falls back to the card's own name for a target the board cannot place --
   * a card in hand or in Life.
   */
  function pickerTargetName(
    observation: GameObservation,
    card: { instanceId: string; name: string },
  ): string {
    const placed = observationCardName(observation, card.instanceId);
    return placed === "Card" ? card.name : placed;
  }

  function renderTargetGroupButton(
    type: TargetPickerKind,
    count: number,
  ): string {
    // "Attack" hands the board over rather than opening a list, so the count
    // is what the reader is being told is waiting for them out there.
    const noun = type === "attack" ? "target" : "option";
    return `<button class="action-button target-group ${type}" data-open-targets="${type}"><span>${count} ${noun}${count === 1 ? "" : "s"}</span><b>${escapeHtml(actionName(type))}</b></button>`;
  }

  /**
   * The second step for an offer the board cannot ask: a Main activation whose
   * options may name a card in hand, in Life, or no card at all. Cancel returns
   * to the card rather than to the board, so a mistaken click on the ability
   * costs one click and never an activation.
   */
  function renderTargetPicker(
    type: TargetPickerKind,
    sourceName: string,
    selectedInstanceId: string,
    offers: readonly LegalAction[],
    observation: GameObservation,
  ): string {
    const heading = `<div class="actions-heading"><div><p class="eyebrow">${escapeHtml(actionName(type))}</p><h2>${escapeHtml(sourceName)}</h2></div><button id="clear-selection" title="Close card actions">${icon("x", "Close")}</button></div>`;
    const copy = `<p class="context-copy">Choose which of the ${offers.length} option${offers.length === 1 ? "" : "s"} to activate.</p>`;
    const buttons = offers
      .map((action) =>
        renderContextActionButton(action, observation, {
          selectedInstanceId,
          // Every row here is the same kind of offer, and the heading above
          // them names it once.
          soleTypeOnCard: true,
          alwaysPictureTarget: true,
          pickerRow: true,
        }),
      )
      .join("");
    return `${heading}${copy}<div class="action-list target-picker-list">${buttons}${renderPickerBackButton()}</div>`;
  }

  /**
   * What is left of the panel once the board is holding the question: who is
   * aiming, what at, and the way back. It sits in a corner so the table it is
   * asking about is uncovered, and says how many cards are lit -- a player who
   * has not spotted the highlight yet at least knows to go looking for it.
   */
  function renderTargetingBar(
    kind: "attack" | "attach-don",
    sourceName: string,
    targetCount: number,
  ): string {
    const eyebrow =
      kind === "attack" ? "Attack" : `DON!! \u00d7${state.donAttachCount}`;
    const plural = targetCount === 1 ? "" : "s";
    const copy =
      kind === "attack"
        ? `Click what ${sourceName} attacks. ${targetCount} legal target${plural} lit, the rest of the board dimmed.`
        : `Click the card to attach ${state.donAttachCount} DON!! to. ${targetCount} legal recipient${plural} lit.`;
    return `<div class="actions-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(kind === "attack" ? sourceName : "Choose a recipient")}</h2></div><button id="clear-selection" title="Close card actions">${icon("x", "Close")}</button></div><p class="context-copy">${escapeHtml(copy)}</p><div class="action-list"><button class="action-button secondary" id="cancel-targeting"><span>targeting</span><b>${kind === "attack" ? "Cancel attack" : "Cancel attach"}</b></button></div>`;
  }

  function renderPickerBackButton(): string {
    return `<button class="action-button secondary picker-back" id="cancel-targeting"><span>back</span><b>Cancel</b></button>`;
  }

  function renderMainSelection(observation: GameObservation): string {
    if (!state.mainSelection) return "";
    if (state.mainSelection.kind === "don") {
      const targets = observation.legalActions.filter(
        (action) => action.type === "attach-don",
      );
      const availableDon = observation.self.activeDon;
      state.donAttachCount = Math.min(state.donAttachCount, availableDon);
      if (state.targetMode === "attach-don")
        return renderTargetingBar("attach-don", "Active DON!!", targets.length);
      return `<div class="actions-heading"><div><p class="eyebrow">DON!! area</p><h2>Active DON!!</h2></div><button id="clear-selection" title="Cancel selection">${icon("x", "Cancel")}</button></div><p class="context-copy">Attach ${state.donAttachCount} active DON!! to a Leader or Character.</p><div class="don-quantity" role="group" aria-label="DON!! to attach"><button id="decrease-don" type="button" title="Attach one fewer DON!!" ${state.donAttachCount <= 1 ? "disabled" : ""}>${icon("minus", "Decrease DON!!")}</button><output aria-live="polite">${state.donAttachCount}</output><button id="increase-don" type="button" title="Attach one more DON!!" ${state.donAttachCount >= availableDon ? "disabled" : ""}>${icon("plus", "Increase DON!!")}</button></div><div class="action-list"><button class="action-button attach-don" data-open-targets="attach-don"><span>DON!! ×${state.donAttachCount}</span><b>Choose recipient</b></button></div>`;
    }
    const card = requireKnownCard(state.mainSelection.cardNumber);
    const selectedInstanceId = state.mainSelection.instanceId;
    const source = sourceActions(observation, selectedInstanceId);
    // How many of each kind this card is offering: one of a kind is a choice
    // its label already makes, several are told apart by their summaries.
    const countOfType = new Map<LegalAction["type"], number>();
    for (const action of source)
      countOfType.set(action.type, (countOfType.get(action.type) ?? 0) + 1);
    const picker = state.targetMode;
    if (picker === "attack")
      return renderTargetingBar(
        "attack",
        card.name,
        source.filter((action) => action.type === "attack").length,
      );
    if (picker) {
      const offers = source.filter((action) => action.type === picker);
      return renderTargetPicker(
        picker,
        card.name,
        selectedInstanceId,
        offers,
        observation,
      );
    }
    const powerDetails = observedPowerDetails(
      observation,
      state.mainSelection.instanceId,
    );
    const removalImmunity = observedRemovalImmunity(
      observation,
      state.mainSelection.instanceId,
      state.mainSelection.cardNumber,
    );
    const attackRestriction = observedAttackRestriction(
      observation,
      state.mainSelection.instanceId,
    );
    const restRestriction = observedRestRestriction(
      observation,
      state.mainSelection.instanceId,
    );
    const preview = {
      instanceId: state.mainSelection.instanceId,
      cardNumber: state.mainSelection.cardNumber,
      name: card.name,
      ...(card.cost === null ? {} : { cost: card.cost }),
      ...(typeof powerDetails?.currentPower === "number"
        ? { currentPower: powerDetails.currentPower }
        : {}),
      // The preview is the same face the hand and the board draw, so it
      // carries the same cost overlay: a card selected out of hand for 3
      // should not go back to reading 6 the moment it is pictured.
      ...(typeof powerDetails?.currentCost === "number"
        ? { currentCost: powerDetails.currentCost }
        : {}),
    };
    // Name first, number after it: the name is what you clicked on, and the
    // number is the footnote that tells two printings apart.
    const heading = `<div class="actions-heading"><h2>${escapeHtml(card.name)} · ${escapeHtml(card.cardNumber)}</h2><button id="clear-selection" title="Close card actions">${icon("x", "Close")}</button></div>`;
    const restrictionNote = attackRestriction
      ? `<p class="context-copy attack-restriction-note">${escapeHtml(attackRestriction.sourceName ?? "An opponent's effect")} prevented this card from attacking through turn ${attackRestriction.untilTurn}.</p>`
      : "";
    const restRestrictionNote = restRestriction
      ? `<p class="context-copy attack-restriction-note">${escapeHtml(restRestriction.sourceName ?? "An opponent's effect")} prevented this card from being rested through turn ${restRestriction.untilTurn} — so it cannot attack or use [Blocker] until then.</p>`
      : "";
    // The badge on the face has room for three words; picking the card up is
    // where the play is actually decided, so this is where the sentence goes.
    const onPlayNegatedNote =
      observation.self.onPlayNegated &&
      observation.self.hand.some(
        (held) => held.instanceId === selectedInstanceId,
      ) &&
      printedClauses(card.cardNumber).includes("[On Play]")
        ? `<p class="context-copy attack-restriction-note">Your [On Play] effects are negated — play this card now and its [On Play] will not resolve.</p>`
        : "";
    const actionList = source.length
      ? `<div class="action-list context-actions">${renderSourceActionButtons(source, countOfType, observation, selectedInstanceId)}</div>`
      : "";
    // The card reads as the same three columns the card-detail popup uses,
    // with what is true only right now -- the effects acting on it, the
    // actions it is offering -- in the text column under the text those
    // effects are amending.
    const artColumn = `<div class="selection-card-preview">${renderCard(preview, null, "selection-preview", false)}</div>`;
    return `${heading}${renderCardOverview(
      state.mainSelection.cardNumber,
      artColumn,
      {
        ...(powerDetails ? { powerDetails } : {}),
        ...(removalImmunity ? { removalImmunity } : {}),
        notes: `${restrictionNote}${restRestrictionNote}${onPlayNegatedNote}`,
        actions: actionList,
      },
    )}`;
  }

  interface ObservedAttackRestriction {
    untilTurn: number;
    sourceName?: string;
  }

  /**
   * Why this Character can't attack right now, when an effect (not summoning
   * sickness) is the reason -- the board itself only shows the "Can't attack"
   * badge, not who caused it or how long it lasts.
   */
  function observedAttackRestriction(
    observation: GameObservation,
    instanceId: string,
  ): ObservedAttackRestriction | undefined {
    const entry = [
      ...observation.self.board,
      ...observation.opponent.board,
    ].find((card) => card.instanceId === instanceId);
    if (entry?.cannotAttackUntilTurn === undefined) return undefined;
    if (entry.cannotAttackUntilTurn < observation.turn) return undefined;
    return {
      untilTurn: entry.cannotAttackUntilTurn,
      ...(entry.cannotAttackSourceCardNumber
        ? {
            sourceName: requireKnownCard(entry.cannotAttackSourceCardNumber)
              .name,
          }
        : {}),
    };
  }

  /**
   * Why this Character can't attack or block right now, when an effect bars it
   * from being *rested* -- the cost both of those pay.
   *
   * This one is easy to miss on the board: the Character is active, unrested
   * and fully powered, and the card-detail panel simply says it has no legal
   * actions.
   */
  function observedRestRestriction(
    observation: GameObservation,
    instanceId: string,
  ): ObservedAttackRestriction | undefined {
    const entry = [
      ...observation.self.board,
      ...observation.opponent.board,
    ].find((card) => card.instanceId === instanceId);
    if (entry?.cannotRestUntilTurn === undefined) return undefined;
    if (entry.cannotRestUntilTurn < observation.turn) return undefined;
    return {
      untilTurn: entry.cannotRestUntilTurn,
      ...(entry.cannotRestSourceCardNumber
        ? {
            sourceName: requireKnownCard(entry.cannotRestSourceCardNumber).name,
          }
        : {}),
    };
  }

  /**
   * The power breakdown for the card in the card-detail popup, when that card
   * is one in play. The popup is raised from the board whenever a click cannot
   * select -- while a choice modal is stashed, most often -- and printed power
   * alone leaves an effect like OP12-073's board-wide +1000 with nothing on
   * screen to explain it.
   */
  function inspectedPowerDetails(
    observation: GameObservation,
  ): ObservedPowerDetails | undefined {
    const instanceId = ctx.cardDetail.cardDetailInstance;
    if (!instanceId) return undefined;
    return observedPowerDetails(observation, instanceId);
  }

  function observedPowerDetails(
    observation: GameObservation,
    instanceId: string,
  ): ObservedPowerDetails | undefined {
    // Attached DON!! survives into the opponent's turn but only adds power on
    // its controller's, so whose card this is decides whether the breakdown
    // may bill it -- see `attachedDonApplies`.
    const yourTurn = observation.turnPlayer === observation.viewer;
    if (instanceId === `${observation.viewer}-leader`)
      return { ...observation.self.leader, attachedDonApplies: yourTurn };
    if (instanceId.endsWith("-leader"))
      return { ...observation.opponent.leader, attachedDonApplies: !yourTurn };
    const own = observation.self.board.find(
      (card) => card.instanceId === instanceId,
    );
    if (own) return { ...own, attachedDonApplies: yourTurn };
    const theirs = observation.opponent.board.find(
      (card) => card.instanceId === instanceId,
    );
    if (theirs) return { ...theirs, attachedDonApplies: !yourTurn };
    return observedHandCardDetails(observation, instanceId);
  }

  /**
   * What a card in the viewer's hand costs *right now*, for the same tile that
   * gives a board card its live cost.
   *
   * Nothing in hand has power the board can move, so every power field here is
   * empty and the popup falls back to the printed figure. The price is the
   * part that moves: ST33-004 Borsalino is a 6 the engine charges 3 for on the
   * turn an effect trashed a card from its controller's hand, and the panel
   * printed the 6 -- next to a "Play card" button that worked on three DON!!,
   * which is a rules engine and a UI telling a player two different things.
   */
  function observedHandCardDetails(
    observation: GameObservation,
    instanceId: string,
  ): ObservedPowerDetails | undefined {
    const card = observation.self.hand.find(
      (entry) => entry.instanceId === instanceId,
    );
    if (!card) return undefined;
    return {
      currentPower: null,
      currentCost: card.currentCost,
      attachedDon: 0,
      attachedDonApplies: false,
      powerModifiers: [],
      staticPowerModifiers: [],
    };
  }

  function observedRemovalImmunity(
    observation: GameObservation,
    instanceId: string,
    cardNumber: string,
  ): ObservedRemovalImmunity | undefined {
    if (cardNumber !== "OP15-060" && cardNumber !== "OP15-118")
      return undefined;
    const owner =
      instanceId === `${observation.viewer}-leader` ||
      observation.self.board.some((card) => card.instanceId === instanceId)
        ? observation.self
        : instanceId.endsWith("-leader") ||
            observation.opponent.board.some(
              (card) => card.instanceId === instanceId,
            )
          ? observation.opponent
          : undefined;
    if (!owner) return undefined;
    const fieldDon =
      owner.activeDon +
      owner.restedDon +
      owner.leader.attachedDon +
      owner.board.reduce((total, card) => total + card.attachedDon, 0);
    return { active: fieldDon <= 6, fieldDon };
  }

  function observationCardName(
    observation: GameObservation,
    instanceId: string,
  ): string {
    if (instanceId === `${observation.viewer}-leader`)
      return `${observation.self.leader.name} (Leader)`;
    if (instanceId.endsWith("-leader"))
      return `${observation.opponent.leader.name} (Leader)`;
    const card = [
      ...observation.self.board,
      ...observation.opponent.board,
    ].find((candidate) => candidate.instanceId === instanceId);
    return card ? `${card.name} (Character)` : "Card";
  }

  function actionSummary(
    action: LegalAction,
    observation: GameObservation,
  ): string {
    if (action.type === "counter") {
      const card = observation.self.hand.find(
        (candidate) => candidate.instanceId === action.cardInstanceId,
      );
      if (card) {
        return `Counter +${formatCompactStat(card.counter)}`;
      }
    }
    if (action.type === "activate-counter-event") {
      const event = observation.self.hand.find(
        (candidate) => candidate.instanceId === action.eventInstanceId,
      );
      const summary = event
        ? counterEventSummary(event.cardNumber, action.counterPower)
        : "";
      if (summary) return summary;
    }
    if (
      action.type === "pass" &&
      observation.phase === "counter" &&
      observation.activeBattle
    ) {
      // The powers are already on screen in the battle context above, and the
      // button's own eyebrow already reads PASS -- so this line only has to say
      // which way those numbers fall.
      const battle = observation.activeBattle;
      const defensePower = battle.targetPower + battle.counterPower;
      return defenseStopsAttack(battle.attackPower, defensePower)
        ? "Defense wins"
        : "Attack wins";
    }
    // `resolve-trigger` used to be rewritten here, because the engine's offer
    // named its target `p1-card-12` and this screen had a card name to hand.
    // The engine now names the card itself and adds whether the target can still
    // attack, which this rewrite would throw away -- and a human choosing
    // between a power reduction and a card in hand wants that as much as an
    // agent does.
    return action.summary;
  }

  function renderTriggerContext(observation: GameObservation): string {
    if (
      observation.phase !== "trigger" ||
      !observation.pendingTriggerCardNumber
    )
      return "";
    const card = requireKnownCard(observation.pendingTriggerCardNumber);
    const trigger = printedText(card.cardNumber)?.trigger;
    const triggerText = !card.rules.hasTrigger
      ? "This card has no printed Trigger text."
      : trigger
        ? renderCardText(trigger)
        : "This card has a Trigger; its text is not in the loaded asset pack.";
    return `<section class="trigger-context"><p class="eyebrow">Revealed from Life</p><div><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml(card.cardNumber)}</span></div><p class="card-text">${triggerText}</p></section>`;
  }

  function renderBattleContext(observation: GameObservation): string {
    const battle = observation.activeBattle;
    if (!battle) return "";
    const defensePower = battle.targetPower + battle.counterPower;
    return `<div class="battle-context" aria-label="Current attack"><div><span>Attacker</span><strong>${escapeHtml(observationCardName(observation, battle.attackerInstanceId))}</strong><b>${formatCompactStat(battle.attackPower)}</b></div><i>${icon("swords", "attacks")}</i><div><span>Target</span><strong>${escapeHtml(observationCardName(observation, battle.targetInstanceId))}</strong><b>${formatCompactStat(defensePower)}</b>${battle.counterPower > 0 ? `<small>+${formatCompactStat(battle.counterPower)} counter</small>` : ""}</div>${renderOpponentCounterCards(observation)}</div>`;
  }

  function renderOpponentCounterCards(observation: GameObservation): string {
    const counters = opponentCounterCardsForLatestBattle(
      observation.publicEvents,
      observation.viewer,
    );
    if (!counters.length) return "";
    return `<div class="opponent-counter-cards" aria-label="Opponent counters"><span>Opponent counters</span>${counters
      .map(({ cardNumber, power }) => {
        const card = requireKnownCard(cardNumber);
        const art = assetUrl(cardNumber);
        return `<div class="counter-chip${art ? " has-art" : ""}"${art ? ` style="--counter-art:url('${art}')"` : ""}><span class="counter-chip-art"></span><span class="counter-chip-label"><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(cardNumber)}</small></span><b>${power === undefined ? "Event" : `+${formatCompactStat(power)}`}</b></div>`;
      })
      .join("")}</div>`;
  }

  function counterDefenseHolds(observation: GameObservation): boolean {
    const battle = observation.activeBattle;
    return (
      observation.phase === "counter" &&
      battle !== null &&
      defenseStopsAttack(
        battle.attackPower,
        battle.targetPower + battle.counterPower,
      )
    );
  }

  function renderBattleNotice(
    event: BattleNoticeEvent,
    viewer: PlayerId,
    observation: GameObservation,
  ): string {
    if (event.type === "attack-redirected")
      return `<div class="battle-notice blocked" role="status" aria-live="assertive"><span>Target changed</span><strong>${escapeHtml(observationCardName(observation, event.targetInstanceId))} takes the attack</strong><small>Block step begins</small><button id="dismiss-battle-notice" title="Dismiss battle result">${icon("x", "Dismiss battle result")}</button></div>`;
    if (event.type === "attack-blocked")
      return `<div class="battle-notice blocked" role="status" aria-live="assertive"><span>Attack blocked</span><strong>${escapeHtml(observationCardName(observation, event.blockerInstanceId))} intercepted</strong><small>Counter step begins</small><button id="dismiss-battle-notice" title="Dismiss battle result">${icon("x", "Dismiss battle result")}</button></div>`;
    const labels = {
      defended: ["Attack stopped", "Defense held"],
      "character-ko": ["Character K.O.'d", "Attack connected"],
      damage: ["Life hit", "Damage dealt"],
      "game-win": ["Final hit", "Game won"],
    } as const;
    const [title, detail] = labels[event.outcome];
    const perspective =
      event.attackerPlayerId === viewer ? detail : `${detail} by opponent`;
    return `<div class="battle-notice ${event.outcome}" role="status" aria-live="assertive"><span>${title}</span><strong>${perspective}</strong><small>${formatCompactStat(event.attackPower)} attack · ${formatCompactStat(event.defensePower)} defense</small><button id="dismiss-battle-notice" title="Dismiss battle result">${icon("x", "Dismiss battle result")}</button>${renderOpponentCounterCards(observation)}</div>`;
  }

  function actionTypeLabel(type: LegalAction["type"]): string {
    return type.replaceAll("-", " ");
  }

  /**
   * What an action is called when its label is the whole button.
   *
   * Named where the printed card names it -- "Activate: Main" is the keyword
   * in the card's own text -- rather than by the engine's action type, which
   * is an id and reads like one. Anything not listed falls back to the type
   * with its first letter raised, which is already how the eyebrows read.
   */
  function actionName(type: LegalAction["type"]): string {
    const named: Partial<Record<LegalAction["type"], string>> = {
      "play-card": "Play card",
      "activate-main": "Activate: Main",
      "activate-counter-event": "Activate: Counter",
      counter: "Counter",
      block: "Block",
      attack: "Attack",
    };
    const label = actionTypeLabel(type);
    return named[type] ?? `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }

  function renderTrashInspector(observation: GameObservation): string {
    if (!state.trashInspector) return "";
    const cards = observation[state.trashInspector].trash;
    const title =
      state.trashInspector === "self" ? "Your trash" : "Opponent's trash";
    return `<div class="card-detail-backdrop trash-inspector-backdrop" data-close-trash-inspector><aside class="trash-inspector-dialog" role="dialog" aria-modal="true" aria-label="${title}"><button class="card-detail-close" data-close-trash-inspector title="Close">${icon("x", "Close")}</button><header><p class="eyebrow">Public zone</p><h2>${title}</h2><span>${cards.length} card${cards.length === 1 ? "" : "s"}</span></header>${
      cards.length
        ? `<div class="trash-card-list">${cards
            .map((card, index) => {
              const definition = requireKnownCard(card.cardNumber);
              return `<button type="button" class="trash-card" data-inspect-trash-card="${escapeHtml(card.cardNumber)}" aria-label="View ${escapeHtml(card.name)} details">${renderCard(
                {
                  instanceId: `trash-${state.trashInspector}-${index}`,
                  cardNumber: card.cardNumber,
                  name: card.name,
                  ...(definition.cost === null
                    ? {}
                    : { cost: definition.cost }),
                },
                null,
                "trash-preview",
                false,
              )}<span><b>${escapeHtml(card.name)}</b><small>${escapeHtml(card.cardNumber)}</small></span></button>`;
            })
            .join("")}</div>`
        : `<p class="trash-empty">No cards in trash.</p>`
    }</aside></div>`;
  }

  /**
   * The history, as the one modal it is now: the steps and, when a model was
   * piloting, the calls that chose them.
   *
   * A modal rather than the side drawer the step list used to live in, because
   * it now has to hold a provider payload as well as a one-line step, and the
   * old 22rem column could show neither well.
   */
  function renderHistoryModal(history: HistoryModel): string {
    return `<div class="card-detail-backdrop history-modal-backdrop" data-close-history><aside class="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title"><button class="card-detail-close" data-close-history title="Close">${icon("x", "Close")}</button><section class="history">${renderHistoryHeader(history, "history-modal-title")}${renderHistoryList(history)}</section></aside></div>`;
  }

  /**
   * Instance ids to card numbers, so the log can say which card attacked which.
   *
   * Built from the steps themselves rather than the board, because most of what
   * a history names has already left it. The observation is seeded in for what
   * no step states: the two Leaders.
   */
  function instanceNames(
    steps: readonly HistoryStep[],
    observation: GameObservation,
  ): CardInstanceNames {
    const opponent: PlayerId = observation.viewer === "p1" ? "p2" : "p1";
    return collectCardInstances(
      steps.map((step) => step.event),
      [
        [`${observation.viewer}-leader`, observation.self.leader.cardNumber],
        [`${opponent}-leader`, observation.opponent.leader.cardNumber],
        ...[...observation.self.board, ...observation.opponent.board].map(
          (card): [string, string] => [card.instanceId, card.cardNumber],
        ),
      ],
    );
  }

  function renderRewindConfirmDialog(): string {
    const pending = state.pendingRewind;
    if (pending === null) return "";
    const discarded = `The ${pending.discards} entr${pending.discards === 1 ? "y" : "ies"} after it ${pending.discards === 1 ? "is" : "are"} discarded, and can't be recovered.`;
    return `<div class="card-detail-backdrop" data-cancel-rewind><aside class="card-detail-dialog rewind-confirm-dialog" role="dialog" aria-modal="true" aria-label="Confirm reset"><h2>${icon("rotate-ccw", "Reset")}Reset the match to here?</h2><blockquote class="rewind-confirm-point">${escapeHtml(pending.label)}</blockquote><p>The match goes back to just after that. ${discarded}</p><div class="rewind-confirm-actions"><button class="secondary" data-cancel-rewind>Cancel</button><button class="primary" data-confirm-rewind>Reset</button></div></aside></div>`;
  }

  function renderOpponentNotice(
    events: readonly PublicEvent[],
    viewer: PlayerId,
    observation: GameObservation,
    title: string,
  ): string {
    // The body scrolls, the button does not. A long turn -- five steps of a
    // search, say -- pushed OK below the fold, and the only way to dismiss the
    // panel was to scroll to the end of a report the reader had already read.
    return `<div class="opponent-action-content"><div class="opponent-action-body"><h2 id="opponent-action-title">${escapeHtml(title)}</h2>${renderOpponentActionSteps(events, observation, viewer)}</div><div class="opponent-action-footer"><button class="primary" id="acknowledge-opponent-action">OK</button></div></div>`;
  }

  /**
   * The same report, for somebody who is only watching.
   *
   * Three differences, all of them because nobody here is being asked
   * anything. It is drawn on the half of the table that acted, so the seat is
   * said by where the panel is rather than by whose turn it is. It has no OK,
   * because there is nothing to acknowledge and the next action will replace
   * it. And it is inert -- no dialog role, no pointer events -- so it neither
   * takes the focus nor stands between a watcher and the board underneath.
   */
  function renderSpectatorNotice(
    notice: NonNullable<BattleState["spectatorNotice"]>,
    viewer: PlayerId,
    observation: GameObservation,
  ): string {
    const side = notice.actor === viewer ? "on-self" : "on-opponent";
    return `<aside class="spectator-notice ${side}" aria-live="polite">
      <p class="spectator-notice-seat">${escapeHtml(seat(notice.actor, viewer))}</p>
      ${renderOpponentActionSteps(notice.events, observation, viewer)}
    </aside>`;
  }

  /**
   * A step with no card of its own to draw: the turn ending, DON!! being set
   * active, Life being spent. A mark and the few words that say it.
   *
   * Every other step is drawn beside its card, so this is the only place the
   * panel still writes one out, and the phrase carries the numbers no picture
   * can (how much power, how many DON!!, how much Life is left).
   *
   * Cards the opponent moved without showing are drawn rather than named:
   * covers in the opponent's colour, one per card, which is what makes "drew
   * 2" and "drew 5" look different at a glance.
   */
  function renderNoticeNote(step: NoticeStep): string {
    const covers = step.covers
      ? `<span class="notice-covers" aria-hidden="true">${Array.from(
          { length: Math.min(step.covers, 6) },
          () => `<span class="physical-card-back opponent-cover"></span>`,
        ).join("")}${step.covers > 6 ? `<b>×${step.covers}</b>` : ""}</span>`
      : "";
    return `<div class="notice-step"><span class="notice-step-mark">${icon(step.icon, "")}</span><span class="notice-step-label">${escapeHtml(step.label)}</span>${covers}</div>`;
  }

  /**
   * " · via Nami" -- the card whose effect caused the step, when that is not the
   * card the step happened to. Both faces are already printed above the list, so
   * this only has to say which of them acted.
   */
  function viaSource(
    cardNumber: string | null,
    sourceCardNumber: string,
  ): string {
    return sourceCardNumber && sourceCardNumber !== cardNumber
      ? ` · via ${cardLabel(sourceCardNumber)}`
      : "";
  }

  /**
   * A step with a cause and a subject: the card whose effect fired, the mark
   * and verb for what it did, and the card it happened to.
   *
   * Written as a sentence -- "Rested X.Drake · via Monkey.D.Luffy" -- this was
   * the hardest line in the panel to read, because the panel prints every card
   * of the turn in one row above and the reader has to match names to faces to
   * find out which one acted. Drawn as cause → effect, the two faces are the
   * sentence and the middle column only has to carry the verb.
   *
   * A step whose subject cannot be drawn at all falls back to the written line,
   * which still names both cards.
   */
  interface NoticePair {
    sourceCardNumber: string;
    /** What the step landed on: a face, or cards the opponent never showed. */
    affected: NoticeSubject;
    /** The mark for this kind of step. */
    icon: string;
    /** The verb alone: the two sides are drawn either side of it. */
    label: string;
    /** What each side is called. An attack has sharper words for it. */
    roles: readonly [string, string];
  }

  /**
   * The right-hand side of a pair.
   *
   * A card the opponent moved without showing has no face to print -- adding
   * the top of their Life to their hand is the whole point of OP10-103's
   * [On Play] and the reader is not entitled to see which card it was -- so
   * that side is drawn as covers, the same mark the written steps use for a
   * draw. A step still pairs in that case: which card *did* it is exactly what
   * the panel is being asked, and the cover says the rest.
   */
  type NoticeSubject =
    { kind: "card"; cardNumber: string } | { kind: "covers"; count: number };

  function noticePair(
    event: PublicEvent,
    observation: GameObservation,
  ): NoticePair | null {
    // An attack is the same shape -- one card acting on another -- and was
    // already drawn this way before effects were. It names its two sides for
    // what they are, and finds them by instance rather than by card number.
    if (event.type === "attack-declared") {
      const attacker = visibleObservationCard(
        event.attackerInstanceId,
        observation,
      );
      const target = visibleObservationCard(
        event.targetInstanceId,
        observation,
      );
      if (!attacker || !target) return null;
      return {
        sourceCardNumber: attacker.cardNumber,
        affected: { kind: "card", cardNumber: target.cardNumber },
        icon: "swords",
        label: `Attacked for ${formatCompactStat(event.power)}`,
        roles: ["Attacker", "Target"],
      };
    }
    // Optional source fields are omitted rather than set to undefined, so the
    // `in` check is the whole test.
    if (!("sourceCardNumber" in event) || !event.sourceCardNumber) return null;
    const verb = pairVerb(event);
    if (!verb) return null;
    const affected = pairSubject(event, observation);
    if (!affected) return null;
    // A card acting on itself is one face, not a pair: ST23-004 resting itself
    // for its own [Activate: Main] has no second card to point an arrow at.
    if (
      affected.kind === "card" &&
      (affected.cardNumber === event.sourceCardNumber ||
        !isPrintableCard(affected.cardNumber))
    )
      return null;
    if (!isPrintableCard(event.sourceCardNumber)) return null;
    return {
      sourceCardNumber: event.sourceCardNumber,
      affected,
      roles: ["Source", "Affected"],
      ...verb,
    };
  }

  /** What a step landed on, however that event happens to name it. */
  function pairSubject(
    event: PublicEvent,
    observation: GameObservation,
  ): NoticeSubject | null {
    if (event.type === "cards-drawn")
      return { kind: "covers", count: event.count };
    // A redacted move is still one card, and drawing it as one cover is what
    // makes "added a card to hand" and "drew two" different pictures.
    if (event.type === "card-moved" && event.cardNumber === null)
      return { kind: "covers", count: 1 };
    if ("targetCardNumber" in event)
      return { kind: "card", cardNumber: event.targetCardNumber };
    if ("cardNumber" in event && typeof event.cardNumber === "string")
      return { kind: "card", cardNumber: event.cardNumber };
    if ("targetInstanceId" in event) {
      const card = visibleObservationCard(event.targetInstanceId, observation);
      return card ? { kind: "card", cardNumber: card.cardNumber } : null;
    }
    return null;
  }

  /** The mark and the verb for a paired step, or null if it does not pair. */
  function pairVerb(
    event: PublicEvent,
  ): Pick<NoticePair, "icon" | "label"> | null {
    switch (event.type) {
      case "character-ko":
        return { icon: "skull", label: "K.O.'d" };
      case "character-rested":
        return { icon: "refresh-cw", label: "Rested" };
      case "card-revealed":
        return { icon: "eye", label: "Revealed" };
      case "power-changed":
        return {
          icon: "zap",
          label: `${event.amount > 0 ? "+" : "−"}${formatCompactStat(Math.abs(event.amount))} power`,
        };
      case "base-power-set":
        return {
          icon: "zap",
          label: basePowerSetLabel(event, "Base power"),
        };
      case "keyword-granted":
        return { icon: "zap", label: `Granted [${event.keyword}]` };
      case "attack-prevented":
        return { icon: "ban", label: "Stopped from attacking" };
      case "refresh-prevented":
        return { icon: "ban", label: "Kept rested" };
      case "rest-prevented":
        // "Barred from resting" rather than "cannot be rested": resting is the
        // cost of attacking and of [Blocker], so what the reader needs from the
        // row is that the Character can do neither, not the zone rule.
        return { icon: "ban", label: "Barred from resting" };
      case "effect-negated":
        return { icon: "ban", label: "Negated" };
      case "cards-drawn":
        return { icon: "hand", label: `Drew ${event.count}` };
      case "card-moved":
        // The written step names the destination ("To hand"), because there the
        // card is the subject of its own row. Here the *source* card is, so the
        // phrase has to be something it did.
        return {
          icon: cardMovedStep(event).icon,
          label:
            event.to === "hand"
              ? "Added to hand"
              : event.to === "trash"
                ? "Sent to trash"
                : event.to === "deck"
                  ? `Put on ${event.position ?? "top"} of deck`
                  : event.to === "life"
                    ? `Put on ${event.position ?? "top"} of Life`
                    : event.to === "board"
                      ? "Put onto the field"
                      : `Moved to ${ZONE_LABEL[event.to] ?? event.to}`,
        };
      default:
        return null;
    }
  }

  function isPrintableCard(cardNumber: string): boolean {
    try {
      requireKnownCard(cardNumber);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * One row of the panel: a step, or every repeat of the same step at once.
   *
   * `times` is how many identical steps this row stands for -- three cards put
   * on the bottom of the deck by one effect is one thing that happened, and it
   * was drawn as three identical rows of the same Leader doing the same verb.
   * The affected side carries the count, because that is the side there is
   * more than one of.
   */
  function renderNoticePair(pair: NoticePair, times: number): string {
    const affected =
      pair.affected.kind === "card"
        ? `${times > 1 ? `${times} × ` : ""}${cardLabel(pair.affected.cardNumber)}`
        : pair.affected.count === 1
          ? "a card the opponent did not show"
          : `${pair.affected.count} cards the opponent did not show`;
    return `<div class="opponent-action-pair" role="group" aria-label="${escapeHtml(`${cardLabel(pair.sourceCardNumber)} — ${pair.label} — ${affected}`)}">${renderOpponentActionCard(pair.sourceCardNumber, pair.roles[0])}<span class="pair-direction" aria-hidden="true"><span class="pair-direction-mark">${icon(pair.icon, "")}</span><b>${escapeHtml(pair.label)}</b><i>→</i></span>${renderNoticeSubject(pair.affected, pair.roles[1], times)}</div>`;
  }

  /**
   * The affected side: a card face, or covers for cards never shown.
   *
   * A cover carries no caption. There is nothing to say about a card the
   * opponent did not show that the stack of backs has not already said, and
   * "Face-down card" under it was a line of text that only ever repeated the
   * picture -- and got cut in half doing it.
   */
  function renderNoticeSubject(
    subject: NoticeSubject,
    role: string,
    times: number,
  ): string {
    if (subject.kind === "card")
      return renderOpponentActionCard(subject.cardNumber, role, times);
    const label =
      subject.count === 1
        ? "One card the opponent did not show"
        : `${subject.count} cards the opponent did not show`;
    return `<figure class="opponent-action-card opponent-cover-card" role="img" aria-label="${escapeHtml(label)}"><span class="cover-stack" aria-hidden="true">${Array.from(
      { length: Math.min(subject.count, 4) },
      () => `<span class="physical-card-back opponent-cover"></span>`,
    ).join(
      "",
    )}${subject.count > 1 ? `<b class="opponent-action-count">×${subject.count}</b>` : ""}</span></figure>`;
  }

  interface NoticeStep {
    /** The mark for this kind of step. */
    icon: string;
    /** The step in as few words as still say it. */
    label: string;
    /** Cards with no face to show: drawn as covers, one per card. */
    covers?: number;
  }

  /**
   * The mark and the phrase for one step.
   *
   * Deliberately not `eventText`: that writes a sentence for a log, where the
   * cards are not on screen and every one of them has to be named. Here they
   * are, so this says the part the picture leaves out.
   */
  function noticeStep(
    event: PublicEvent,
    observation: GameObservation,
    viewer: PlayerId,
  ): NoticeStep {
    switch (event.type) {
      case "game-created":
        return { icon: "play", label: "Game started" };
      case "mulligan-decided":
        return {
          icon: "rotate-ccw",
          label: event.decision === "keep" ? "Kept their hand" : "Mulliganed",
        };
      case "setup-complete":
        return { icon: "check", label: "Setup complete" };
      case "card-played":
        return { icon: "plus", label: `Played ${cardLabel(event.cardNumber)}` };
      case "stage-played":
        return {
          icon: "plus",
          label: `Played ${cardLabel(event.cardNumber)} as a Stage`,
        };
      case "event-activated":
        return {
          icon: "zap",
          label: `Activated ${cardLabel(event.cardNumber)}`,
        };
      case "ability-triggered":
        return {
          icon: "sparkles",
          label: event.noEffect
            ? `${cardLabel(event.sourceCardNumber)} fired with nothing to do`
            : `${cardLabel(event.sourceCardNumber)} fired on its own`,
        };
      case "ability-activated":
        return {
          icon: "zap",
          label: `Activated ${cardLabel(event.sourceCardNumber)}`,
        };
      case "card-revealed":
        return {
          icon: "eye",
          label: `Revealed ${cardLabel(event.cardNumber)}${viaSource(event.cardNumber, event.sourceCardNumber)}`,
        };
      case "cards-drawn":
        return { icon: "hand", label: "Drew", covers: event.count };
      case "card-moved":
        return cardMovedStep(event);
      case "character-ko":
        return {
          icon: "skull",
          label: `K.O.'d ${cardLabel(event.cardNumber)}${viaSource(event.cardNumber, event.sourceCardNumber)}`,
        };
      case "character-trashed":
        return {
          icon: "trash-2",
          label: `Trashed ${cardLabel(event.cardNumber)} to make room`,
        };
      case "character-rested":
        return {
          icon: "refresh-cw",
          label: `Rested ${cardLabel(event.cardNumber)}${viaSource(event.cardNumber, event.sourceCardNumber)}`,
        };
      case "characters-refreshed":
        return {
          icon: "refresh-cw",
          label: `Refreshed ${event.cardInstanceIds.length}`,
        };
      case "don-attached":
        return {
          icon: "coins",
          label: `Attached ${event.count} DON!! to ${observationCardName(observation, event.targetInstanceId)}`,
        };
      case "don-activated":
        return { icon: "coins", label: `${event.count} DON!! set active` };
      case "don-added":
        // Always an effect -- the DON!! phase moves its two with no event at
        // all -- so a `don-added` with no card beside it read as if the rules
        // had handed them over. It is the step OP09-061's Leader pays its ramp
        // refund with, and that refund is the reason to return two DON!!.
        return {
          icon: "coins",
          label: `Added ${event.count} ${event.rested ? "rested" : "active"} DON!!${viaSource(null, event.sourceCardNumber)}`,
        };
      case "don-returned":
        return {
          icon: "coins",
          label: `Returned ${event.count} DON!! to the DON!! deck${viaSource(null, event.sourceCardNumber)}`,
        };
      case "attack-declared":
        return {
          icon: "swords",
          label: `Attacked for ${formatCompactStat(event.power)}`,
        };
      case "attack-blocked":
        return { icon: "shield", label: "Blocked the attack" };
      case "attack-redirected":
        return { icon: "shield", label: "Changed the attack target" };
      case "counter-used":
        return {
          icon: "shield",
          label: `Countered for ${formatCompactStat(event.power)}`,
        };
      case "battle-resolved":
        return {
          icon: event.outcome === "defended" ? "shield" : "swords",
          label:
            event.outcome === "defended"
              ? `Attack stopped (${formatCompactStat(event.attackPower)} vs ${formatCompactStat(event.defensePower)})`
              : event.outcome === "character-ko"
                ? "Attack K.O.'d a Character"
                : event.outcome === "game-win"
                  ? "The final hit"
                  : "Attack dealt 1 damage",
        };
      case "damage-taken":
        return {
          icon: "heart",
          label: `${seat(event.playerId, viewer)} took damage — ${event.lifeRemaining} Life left`,
        };
      case "life-flipped":
        return {
          icon: "eye",
          label: `Life card turned ${event.faceUp ? "face-up" : "face-down"}`,
        };
      case "power-changed":
        return {
          icon: "zap",
          label: `${observationCardName(observation, event.targetInstanceId)} ${event.amount > 0 ? "+" : "−"}${formatCompactStat(Math.abs(event.amount))} power`,
        };
      case "base-power-set":
        return {
          icon: "zap",
          label: `${observationCardName(observation, event.targetInstanceId)} ${basePowerSetLabel(event, "base power")}`,
        };
      case "keyword-granted":
        return {
          icon: "zap",
          label: `${observationCardName(observation, event.targetInstanceId)} gained [${event.keyword}]`,
        };
      case "attack-prevented":
        return {
          icon: "ban",
          label: `${observationCardName(observation, event.targetInstanceId)} cannot attack through turn ${event.expiresAtTurn}`,
        };
      case "refresh-prevented":
        return {
          icon: "ban",
          label: `${observationCardName(observation, event.targetInstanceId)} stays rested through turn ${event.expiresAtTurn}`,
        };
      case "rest-prevented":
        return {
          icon: "ban",
          label: `${observationCardName(observation, event.targetInstanceId)} cannot be rested through turn ${event.expiresAtTurn} — so it can neither attack nor block`,
        };
      case "effect-negated":
        return {
          icon: "ban",
          label: `${cardLabel(event.targetCardNumber)}'s effects negated`,
        };
      case "player-restricted":
        return {
          icon: "ban",
          label: `${restrictionClause(event, seat(event.playerId, viewer), seatOwns(event.playerId, viewer))} through turn ${event.untilTurn}`,
        };
      case "turn-ended":
        return { icon: "check", label: "Ended the turn" };
      case "extra-turn-granted":
        return {
          icon: "rotate-ccw",
          label: `${seat(event.playerId, viewer)} will take an extra turn`,
        };
      case "game-ended":
        return {
          icon: "crown",
          label: `${seat(event.winner, viewer)} won by ${event.reason.replace("-", " ")}`,
        };
    }
  }

  /**
   * A card that changed zones: the mark says where it went, and a card the
   * opponent never showed is drawn as a cover rather than named.
   */
  function cardMovedStep(
    event: Extract<PublicEvent, { type: "card-moved" }>,
  ): NoticeStep {
    const covers = event.cardNumber === null ? 1 : 0;
    const where =
      event.to === "deck"
        ? `To the ${event.position ?? "top"} of the deck`
        : event.to === "life"
          ? `To the ${event.position ?? "top"} of Life`
          : event.to === "hand"
            ? "To hand"
            : event.to === "trash"
              ? "To trash"
              : event.to === "board"
                ? "To the field"
                : `To ${ZONE_LABEL[event.to] ?? event.to}`;
    const mark =
      event.to === "deck"
        ? "layers"
        : event.to === "life"
          ? "heart"
          : event.to === "hand"
            ? "hand"
            : event.to === "trash"
              ? "trash-2"
              : "plus";
    return { icon: mark, label: where, ...(covers ? { covers } : {}) };
  }

  /** Zone names this screen has no phrase of its own for. */
  const ZONE_LABEL: Readonly<Record<string, string>> = {
    stage: "the Stage",
    leader: "the Leader",
    revealed: "the revealed cards",
  };

  function renderOpponentActionCard(
    cardNumber: string,
    role?: string,
    times = 1,
  ): string {
    // Falls back to the drawn CSS face when there is no art, the way every other
    // card surface here does. Returning "" instead meant an art-free build --
    // `pnpm web:build --no-art`, which is what CI runs -- showed the opponent's
    // action with no card at all, and left five e2e tests unable to pass without
    // 600 image fetches.
    const art = assetUrl(cardNumber);
    const card = requireKnownCard(cardNumber);
    const color = card.colors?.[0]?.toLowerCase() ?? "neutral";
    // The caption prints the number, not the name. The face above it is
    // already the name, at a size a name is legible at; the caption's column is
    // five rem wide, so a printed name arrived as "Dracule Miha..." -- less
    // identifying than the number it was crowding out.
    return `<figure class="opponent-action-card"><button class="game-card ${art ? "has-art" : ""}" type="button" style="--card-color:var(--${color})${art ? `;--card-art:url('${art}')` : ""}" data-inspect-card="${escapeHtml(card.cardNumber)}" aria-label="View ${escapeHtml(card.name)} details"><span class="card-top"><small>${card.cardNumber}</small></span><strong>${escapeHtml(card.name)}</strong>${times > 1 ? `<b class="opponent-action-count">×${times}</b>` : ""}</button><figcaption>${role ? `<span>${role}</span>` : ""}<small>${card.cardNumber}</small></figcaption></figure>`;
  }

  /**
   * A step with one card in it, and what happened to that card.
   *
   * The phrase never names the card: its face is drawn right beside it, and
   * "Played Kouzuki Oden" printed next to a picture of Kouzuki Oden was the
   * duplication the separate block of text underneath existed to create.
   */
  interface NoticeSingle {
    cardNumber: string;
    /** The mark for this kind of step. */
    icon: string;
    /** The verb alone -- the card beside it is the subject. */
    label: string;
  }

  function noticeSingle(
    event: PublicEvent,
    observation: GameObservation,
    viewer: PlayerId,
  ): NoticeSingle | null {
    const single = singleStep(event, observation, viewer);
    return single && isPrintableCard(single.cardNumber) ? single : null;
  }

  /** The card and the verb for a one-card step, or null if it has no card. */
  function singleStep(
    event: PublicEvent,
    observation: GameObservation,
    viewer: PlayerId,
  ): NoticeSingle | null {
    switch (event.type) {
      case "card-played":
        return { cardNumber: event.cardNumber, icon: "plus", label: "Played" };
      case "stage-played":
        return {
          cardNumber: event.cardNumber,
          icon: "plus",
          label: "Played as a Stage",
        };
      case "event-activated":
        return {
          cardNumber: event.cardNumber,
          icon: "zap",
          label: "Activated",
        };
      case "ability-triggered":
        // The card that acted, with no arrow: what it went on to do is the
        // step under this one, drawn against whatever it landed on.
        return {
          cardNumber: event.sourceCardNumber,
          icon: "sparkles",
          label: event.noEffect
            ? "Fired with nothing to do"
            : "Fired on its own",
        };
      case "ability-activated":
        // Same shape as the marker above it, and the same reason: the card
        // that acted, with what it did listed underneath.
        return {
          cardNumber: event.sourceCardNumber,
          icon: "zap",
          label: "Activated",
        };
      case "counter-used":
        return {
          cardNumber: event.cardNumber,
          icon: "shield",
          label: `Countered for ${formatCompactStat(event.power)}`,
        };
      case "character-trashed":
        return {
          cardNumber: event.cardNumber,
          icon: "trash-2",
          label: "Trashed to make room",
        };
      case "character-ko":
        return { cardNumber: event.cardNumber, icon: "skull", label: "K.O.'d" };
      case "character-rested":
        return {
          cardNumber: event.cardNumber,
          icon: "refresh-cw",
          label: "Rested",
        };
      case "card-revealed":
        return { cardNumber: event.cardNumber, icon: "eye", label: "Revealed" };
      case "card-moved": {
        if (event.cardNumber === null) return null;
        // Same phrase the written note used -- there the card was the subject
        // of its own line, and beside its face it still is.
        const step = cardMovedStep(event);
        return {
          cardNumber: event.cardNumber,
          icon: step.icon,
          label: step.label,
        };
      }
      case "life-flipped":
        // Only a card turned face-up has an identity to draw; turning one back
        // face-down publishes nothing, so that stays a written note.
        return event.cardNumber === null
          ? null
          : {
              cardNumber: event.cardNumber,
              icon: "eye",
              label: "Turned face-up in Life",
            };
      case "attack-blocked": {
        const blocker = visibleObservationCard(
          event.blockerInstanceId,
          observation,
        );
        return blocker
          ? {
              cardNumber: blocker.cardNumber,
              icon: "shield",
              label: "Blocked the attack",
            }
          : null;
      }
      case "attack-redirected":
        return {
          cardNumber: event.sourceCardNumber,
          icon: "shield",
          label: "Changed the attack target",
        };
      case "don-attached": {
        const target = visibleObservationCard(
          event.targetInstanceId,
          observation,
        );
        return target
          ? {
              cardNumber: target.cardNumber,
              icon: "coins",
              label: `Given ${event.count} DON!!`,
            }
          : null;
      }
      case "don-activated":
        return {
          cardNumber: event.sourceCardNumber,
          icon: "coins",
          label: `Set ${event.count} DON!! active`,
        };
      case "don-added":
        return {
          cardNumber: event.sourceCardNumber,
          icon: "coins",
          label: `Added ${event.count} ${event.rested ? "rested" : "active"} DON!!`,
        };
      case "don-returned":
        return {
          cardNumber: event.sourceCardNumber,
          icon: "coins",
          label: `Returned ${event.count} DON!!`,
        };
      case "power-changed": {
        const target = visibleObservationCard(
          event.targetInstanceId,
          observation,
        );
        return target
          ? {
              cardNumber: target.cardNumber,
              icon: "zap",
              label: `${event.amount > 0 ? "+" : "−"}${formatCompactStat(Math.abs(event.amount))} power`,
            }
          : null;
      }
      case "base-power-set": {
        const target = visibleObservationCard(
          event.targetInstanceId,
          observation,
        );
        return target
          ? {
              cardNumber: target.cardNumber,
              icon: "zap",
              label: basePowerSetLabel(event, "Base power"),
            }
          : null;
      }
      case "keyword-granted":
        return {
          cardNumber: event.targetCardNumber,
          icon: "zap",
          label: `Gained [${event.keyword}]`,
        };
      case "attack-prevented":
        return {
          cardNumber: event.targetCardNumber,
          icon: "ban",
          label: `Cannot attack through turn ${event.expiresAtTurn}`,
        };
      case "refresh-prevented":
        return {
          cardNumber: event.targetCardNumber,
          icon: "ban",
          label: `Stays rested through turn ${event.expiresAtTurn}`,
        };
      case "rest-prevented":
        return {
          cardNumber: event.targetCardNumber,
          icon: "ban",
          label: `Cannot be rested through turn ${event.expiresAtTurn}`,
        };
      case "effect-negated":
        return {
          cardNumber: event.targetCardNumber,
          icon: "ban",
          label: "Effects negated",
        };
      // A restriction lands on a player, so the far side of the arrow is not a
      // card and this is a single rather than a pair. The card is still the
      // news: the whole question a reader has is which card did this to them.
      case "player-restricted":
        return {
          cardNumber: event.sourceCardNumber,
          icon: "ban",
          label: `${restrictionClause(event, seat(event.playerId, viewer), seatOwns(event.playerId, viewer))} through turn ${event.untilTurn}`,
        };
      default:
        return null;
    }
  }

  /**
   * One card, one mark, one verb: the same row a pair is, with nothing on the
   * far side of the arrow because the step had nothing on the far side.
   */
  /**
   * One card, and everything that clause did through it.
   *
   * The verbs stack beside a single face rather than each getting a face of
   * their own. A Leader's `[Activate: Main]` is the shape that forces it:
   * OP14-020 Dracule Mihawk rests a card, stands three DON!! up and takes the
   * turn's plays away, and drawn a card apiece that is the same Leader printed
   * three times down a panel capped at `46rem` -- which pushed the third step,
   * the one no other surface reports, under the fold.
   */
  function renderNoticeSingleGroup(
    cardNumber: string,
    entries: readonly { icon: string; label: string; times: number }[],
  ): string {
    const label = `${cardLabel(cardNumber)} — ${entries
      .map(
        (entry) => `${entry.label}${entry.times > 1 ? ` ×${entry.times}` : ""}`,
      )
      .join(", ")}`;
    // The count belongs to the verb once there is more than one of them: a
    // "×2" under the face would not say which of the steps happened twice.
    const cardTimes = entries.length === 1 ? (entries[0]?.times ?? 1) : 1;
    const actions = entries
      .map(
        (entry) =>
          `<span class="single-action"><span class="pair-direction-mark">${icon(entry.icon, "")}</span><b>${escapeHtml(entry.label)}${entries.length > 1 && entry.times > 1 ? ` ×${entry.times}` : ""}</b></span>`,
      )
      .join("");
    return `<div class="opponent-action-single" role="group" aria-label="${escapeHtml(label)}">${renderOpponentActionCard(cardNumber, undefined, cardTimes)}<span class="single-actions" aria-hidden="true">${actions}</span></div>`;
  }

  /** One row of the panel, and how many identical steps it stands for. */
  type NoticeRow = { key: string; times: number } & (
    | { kind: "pair"; pair: NoticePair }
    | {
        kind: "single";
        cardNumber: string;
        entries: { icon: string; label: string; times: number }[];
      }
    | { kind: "note"; step: NoticeStep }
  );

  /**
   * Every step of the opponent's turn, in the order it happened, each drawn
   * beside the card it happened to.
   *
   * One list, not a strip of faces with a report underneath. The panel used to
   * print every card of the turn in a row and then say what happened to them in
   * a separate block of text below, which named each card twice -- once as a
   * face, once in a sentence -- and left the reader matching the names back to
   * the faces to work out which card did what. A step now carries its own card:
   * a pair keeps its two faces either side of the verb, a step with one card
   * puts the mark and the verb beside that card, and only a step with no card
   * at all is still written as a line.
   */
  function renderOpponentActionSteps(
    events: readonly PublicEvent[],
    observation: GameObservation,
    viewer: PlayerId,
  ): string {
    /** Identical steps collapse into the row they first appeared as: three
        cards put on the bottom of the deck by one effect is one thing that
        happened, and was drawn as three identical rows of it. */
    const rows: NoticeRow[] = [];
    for (const event of events) {
      // The engine always follows this outcome with the `character-ko` it
      // caused, and that step draws the attacker, the skull and the Character
      // it killed. "Attack K.O.'d a Character" above that picture only says
      // again, in words, what the row underneath already shows.
      if (event.type === "battle-resolved" && event.outcome === "character-ko")
        continue;
      // A step with a cause and a subject -- an attack, or an effect landing on
      // another card -- draws both its cards itself, either side of the verb.
      const pair = noticePair(event, observation);
      if (pair) {
        const subject =
          pair.affected.kind === "card" ? pair.affected.cardNumber : "covers";
        const key = `pair|${pair.sourceCardNumber}|${pair.icon}|${pair.label}|${subject}`;
        const seen = rows.find((row) => row.key === key);
        if (!seen || seen.kind !== "pair") {
          rows.push({ kind: "pair", key, pair, times: 1 });
          continue;
        }
        seen.times += 1;
        // Covers count cards rather than steps: two steps of one hidden card
        // each are one stack of two, not a stack of one marked "×2".
        if (
          seen.pair.affected.kind === "covers" &&
          pair.affected.kind === "covers"
        ) {
          seen.pair = {
            ...seen.pair,
            affected: {
              kind: "covers",
              count: seen.pair.affected.count + pair.affected.count,
            },
          };
        }
        continue;
      }
      const single = noticeSingle(event, observation, viewer);
      if (single) {
        // Grouped by card, not by step: every verb one clause applied through
        // the same card belongs under that card's one face.
        const key = `single|${single.cardNumber}`;
        const seen = rows.find((row) => row.key === key);
        if (seen && seen.kind === "single") {
          const entry = seen.entries.find(
            (candidate) =>
              candidate.icon === single.icon &&
              candidate.label === single.label,
          );
          if (entry) entry.times += 1;
          else
            seen.entries.push({
              icon: single.icon,
              label: single.label,
              times: 1,
            });
          continue;
        }
        rows.push({
          kind: "single",
          key,
          cardNumber: single.cardNumber,
          entries: [{ icon: single.icon, label: single.label, times: 1 }],
          times: 1,
        });
        continue;
      }
      // A written note is never collapsed: with no card to count on, two of
      // them are two things that happened at two points in the turn.
      rows.push({
        kind: "note",
        key: `note|${rows.length}`,
        step: noticeStep(event, observation, viewer),
        times: 1,
      });
    }
    if (rows.length === 0) return "";
    return `<div class="opponent-action-steps" aria-label="Steps in opponent action">${rows
      .map((row) =>
        row.kind === "pair"
          ? renderNoticePair(row.pair, row.times)
          : row.kind === "single"
            ? renderNoticeSingleGroup(row.cardNumber, row.entries)
            : renderNoticeNote(row.step),
      )
      .join("")}</div>`;
  }

  function bindGameEvents(): void {
    ctx.bindCardDetailDialog(renderGame);
    document.querySelector("#new-game")?.addEventListener("click", () => {
      ctx.goHome();
    });
    document.querySelector("#result-new")?.addEventListener("click", () => {
      ctx.goHome();
    });
    if (ctx.match.game?.capabilities.rewind) {
      // Hovering or focusing a Reset marks everything it would discard, so the
      // cost of the click is on screen before it is paid rather than in a
      // count in the dialog that follows it.
      // Not `data-action`: that attribute is the board's own "perform this
      // engine action" hook, bound over the whole document below, and a row
      // carrying it made every click on a line an illegal action.
      const groups = [
        ...document.querySelectorAll<HTMLElement>(
          ".history-group[data-history-group]",
        ),
      ];
      // By action, not by row: a turn handover is two entries of one action, and
      // both survive a reset to it.
      const preview = (from: number | null) => {
        // Nothing is discarded by a jump, so nothing is marked as going.
        if (state.replay) return;
        for (const group of groups) {
          group.classList.toggle(
            "discarding",
            from !== null && Number(group.dataset.historyGroup) > from,
          );
        }
      };
      document
        .querySelectorAll<HTMLElement>(".history-reset[data-history-action]")
        .forEach((button) => {
          const target = Number(button.dataset.historyAction);
          button.addEventListener("pointerenter", () => {
            preview(target);
          });
          button.addEventListener("pointerleave", () => {
            preview(null);
          });
          button.addEventListener("focus", () => {
            preview(target);
          });
          button.addEventListener("blur", () => {
            preview(null);
          });
          button.addEventListener("click", () => {
            // A replay's entries are jumps, not resets: the file still holds
            // everything after the point being jumped to, so there is nothing
            // to warn about and nothing to confirm.
            if (state.replay) {
              replayJumpTo(target);
              return;
            }
            state.pendingRewind = {
              actionCount: target,
              label: button.dataset.historyLabel ?? "",
              discards: Number(button.dataset.historyDiscards ?? 0),
            };
            renderGame();
          });
        });
      // The modal is rebuilt several times a turn while an agent plays, and the
      // rebuild drops the marks -- with the pointer still resting on the button
      // that asked for them, so no `pointerenter` comes to put them back. The
      // hovered button is read off the fresh DOM instead.
      const hovered = document.querySelector<HTMLElement>(
        ".history-reset:hover, .history-reset:focus",
      );
      if (hovered) preview(Number(hovered.dataset.historyAction));
    }
    document
      .querySelectorAll<HTMLElement>("[data-cancel-rewind]")
      .forEach((element) => {
        element.addEventListener("click", (event) => {
          if (
            element.classList.contains("card-detail-backdrop") &&
            event.target !== element
          )
            return;
          state.pendingRewind = null;
          renderGame();
        });
      });
    document
      .querySelector("[data-confirm-rewind]")
      ?.addEventListener("click", () => {
        if (!ctx.match.game || state.pendingRewind === null) return;
        const rewindTo = state.pendingRewind.actionCount;
        ctx.match.game.rewindTo(rewindTo);
        // The calls that chose the discarded actions go with them: they are
        // shown under the step they produced, and that step no longer exists.
        state.llmDebugRecords = state.llmDebugRecords.filter(
          (record) => (record.actionCount ?? 0) <= rewindTo,
        );
        state.pendingRewind = null;
        state.agentSession += 1;
        state.workerSequence += 1;
        state.aiPending = false;
        state.prefetchedAiResult = null;
        state.opponentNotice = null;
        state.automaticNotice = null;
        state.automaticNoticeTitle = null;
        state.heldAutomaticNotice = null;
        state.heldAutomaticNoticeTitle = null;
        state.lookNotice = null;
        state.bottomOrder = null;
        clearMainSelection();
        renderGame();
      });
    onPress("#replay-play", () => {
      if (!state.replay) return;
      state.replay.playing = !state.replay.playing;
      // Rendering is what arms the clock, and what redraws the button.
      renderGame();
    });
    onPress("#replay-forward", () => {
      if (!state.replay) return;
      state.replay.playing = false;
      replayStep();
    });
    onPress("#replay-back", () => {
      if (!state.replay) return;
      state.replay.playing = false;
      replayJumpTo(appliedActionCount() - 1);
    });
    onPress("#replay-swap", () => {
      if (!state.replay) return;
      state.replay.viewer = state.replay.viewer === "p1" ? "p2" : "p1";
      renderGame();
    });
    document
      .querySelector<HTMLSelectElement>("#replay-turn")
      ?.addEventListener("change", (event) => {
        if (!state.replay) return;
        state.replay.playing = false;
        replayJumpTo(Number((event.target as HTMLSelectElement).value));
      });
    onPress("#replay-takeover", () => {
      if (!state.replay) return;
      ctx.takeSeat(state.replay.viewer);
    });
    onPress("#replay-flag", () => {
      if (!state.replay) return;
      state.replay.playing = false;
      state.replay.flagging = appliedActionCount();
      renderGame();
    });
    onPress("#replay-flag-cancel", () => {
      if (!state.replay) return;
      state.replay.flagging = null;
      renderGame();
    });
    onPress("#replay-flag-remove", () => {
      const replay = state.replay;
      if (!replay) return;
      replay.flags = replay.flags.filter(
        (flag) => flag.actionIndex !== replay.flagging,
      );
      replay.flagging = null;
      renderGame();
    });
    onPress("#replay-flag-save", () => {
      const replay = state.replay;
      const game = ctx.match.game;
      if (!replay || !game || replay.flagging === null) return;
      const actionId = replay.actions[replay.flagging];
      if (!actionId) return;
      const picked = document.querySelector<HTMLInputElement>(
        'input[name="replay-flag-preferred"]:checked',
      );
      replay.flags = withFlag(replay.flags, {
        actionIndex: replay.flagging,
        player: game.activeObservation.activePlayer,
        actionId,
        preferred: picked?.value ? picked.value : null,
        note:
          document
            .querySelector<HTMLTextAreaElement>("#replay-flag-note")
            ?.value.trim() ?? "",
      });
      replay.flagging = null;
      renderGame();
    });
    onPress("#replay-hide-hand", () => {
      if (!state.replay) return;
      state.replay.hideOtherHand = !state.replay.hideOtherHand;
      renderGame();
    });
    onPress("#replay-feedback", () => {
      const replay = state.replay;
      const game = ctx.match.game;
      if (!replay || !game) return;
      const rules = game.trace().rules;
      downloadText(
        "open-optcg-feedback.jsonl",
        feedbackJsonl({
          config: game.config,
          ...(rules ? { rules } : {}),
          actions: replay.actions,
          checkpoint: replay.review?.checkpoint ?? null,
          flags: replay.flags,
          exportedAt: new Date().toISOString(),
        }),
      );
    });
    onPress("#simulate-play", () => {
      if (!state.simulation) return;
      state.simulation.playing = !state.simulation.playing;
      // A request is usually already out when the button is pressed -- it went
      // out on the paint the last action ended with -- so a pause that only
      // stopped asking would still let one more action land on the board
      // somebody has just stopped. Cancelling it is what makes Pause mean the
      // position on screen.
      if (!state.simulation.playing) discardPendingAiAnswer();
      // Rendering is what asks for the next action, and what redraws the
      // button.
      renderGame();
    });
    onPress("#simulate-pace", () => {
      if (!state.simulation) return;
      state.simulation.paceMs = nextPaceMs(state.simulation.paceMs);
      renderGame();
    });
    onPress("#simulate-swap", () => {
      if (!state.simulation) return;
      state.simulation.viewer = state.simulation.viewer === "p1" ? "p2" : "p1";
      renderGame();
    });
    onPress("#simulate-takeover", () => {
      if (!state.simulation) return;
      ctx.takeSeat(state.simulation.viewer);
    });
    document.querySelector("#history-toggle")?.addEventListener("click", () => {
      state.historyOpen = !state.historyOpen;
      // Opened afresh, the history shows the newest entry, whatever the reader
      // had scrolled to the last time it was up.
      state.historyPinnedToLatest = true;
      renderGame();
    });
    document
      .querySelectorAll<HTMLElement>("[data-close-history]")
      .forEach((element) => {
        element.addEventListener("click", (event) => {
          // A click inside the dialog reached the backdrop by bubbling, and
          // must not close what the reader is scrolling through.
          if (
            element.classList.contains("history-modal-backdrop") &&
            event.target !== element
          )
            return;
          state.historyOpen = false;
          renderGame();
        });
      });
    document
      .querySelectorAll<HTMLElement>("[data-inspect-trash]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          state.trashInspector = button.dataset.inspectTrash as
            "self" | "opponent";
          renderGame();
        });
      });
    document.querySelector("#hand-toggle")?.addEventListener("click", () => {
      state.handOpen = state.handOpen === "self" ? null : "self";
      renderGame();
    });
    // Pressed rather than clicked: in a simulation this button is redrawn by
    // every action the agents take, and a click whose two halves land either
    // side of a repaint is never delivered. See `onPress`.
    onPress("#opponent-hand-toggle", () => {
      state.handOpen = state.handOpen === "opponent" ? null : "opponent";
      renderGame();
    });
    document
      .querySelectorAll<HTMLElement>("[data-close-hand-sheet]")
      .forEach((element) => {
        element.addEventListener("click", (event) => {
          // The backdrop closes on its own clicks only: a tap on a card inside
          // the sheet bubbles up here and must not shut the sheet before the
          // card's own handler has had it.
          if (
            element.classList.contains("hand-sheet-backdrop") &&
            event.target !== element
          )
            return;
          state.handOpen = null;
          renderGame();
        });
      });
    // The sheet's own offers are the card's offers, so a tap on one makes the
    // card the selection before the shared handlers below act on the button:
    // an offer that opens a target picker needs the panel to know whose picker
    // it is, and every offer leaves the sheet behind either way. Registered
    // ahead of those handlers, and rendering nothing itself, so the action's
    // own handler is what draws the result.
    document
      .querySelectorAll<HTMLElement>(
        ".hand-sheet-actions [data-action], .hand-sheet-actions [data-open-targets]",
      )
      .forEach((button) => {
        const list = button.closest<HTMLElement>(".hand-sheet-actions")!;
        button.addEventListener("click", () => {
          state.handOpen = null;
          state.mainSelection = {
            kind: "card",
            instanceId: list.dataset.handActionsInstance!,
            cardNumber: list.dataset.handActionsCard!,
          };
          state.battleNotice = null;
          state.historyOpen = false;
        });
      });
    document
      .querySelectorAll<HTMLElement>("[data-close-trash-inspector]")
      .forEach((element) => {
        element.addEventListener("click", (event) => {
          if (
            element.classList.contains("trash-inspector-backdrop") &&
            event.target !== element
          )
            return;
          state.trashInspector = null;
          renderGame();
        });
      });
    document
      .querySelectorAll<HTMLElement>("[data-inspect-trash-card]")
      .forEach((card) => {
        card.addEventListener("click", () => {
          ctx.cardDetail.cardDetailCard = card.dataset.inspectTrashCard!;
          // A card in the trash is not in play, so no live power applies.
          ctx.cardDetail.cardDetailInstance = null;
          state.trashInspector = null;
          renderGame();
        });
      });
    document
      .querySelector("#match-over-exit")
      ?.addEventListener("click", () => {
        ctx.goHome();
      });
    document.querySelector("#resign")?.addEventListener("click", () => {
      // A confirm, because there is no undo online and a misclick would hand the
      // opponent the game.
      if (!window.confirm("Resign this match? Your opponent wins.")) return;
      ctx.match.game?.resign?.();
    });
    for (const id of ["#trace", "#match-over-trace"]) {
      document.querySelector(id)?.addEventListener("click", () => {
        if (!ctx.match.game) return;
        // The trace is the single artefact for saving a match: the engine trace
        // with every model call joined onto the decision that produced it.
        // Loading that file back from the lobby resumes the match from this one
        // file.
        downloadText(
          "open-optcg-trace.jsonl",
          buildDiagnosticsJsonl({
            trace: ctx.match.game.trace(),
            llmRecords: structuredClone(state.llmDebugRecords),
            exportedAt: new Date().toISOString(),
          }),
        );
      });
    }
    document
      .querySelector("#clear-selection")
      ?.addEventListener("click", () => {
        clearMainSelection();
        state.choiceModalHidden = false;
        renderGame();
      });
    document
      .querySelector("#hide-choice-modal")
      ?.addEventListener("click", () => {
        state.choiceModalHidden = true;
        renderGame();
      });
    document.querySelector("#review-choice")?.addEventListener("click", () => {
      state.choiceModalHidden = false;
      renderGame();
    });
    document
      .querySelector("#cancel-targeting")
      ?.addEventListener("click", () => {
        state.targetMode = null;
        renderGame();
      });
    document.querySelector("#decrease-don")?.addEventListener("click", () => {
      state.donAttachCount = Math.max(1, state.donAttachCount - 1);
      renderGame();
    });
    // A pool the player adjusts becomes one they have spoken for, and stays
    // spoken for while they move the others: without recording the figure the
    // cheapest-first fill would take the DON!! straight back off them.
    for (const [attribute, delta] of [
      ["data-don-pool-less", -1],
      ["data-don-pool-more", 1],
    ] as const) {
      for (const button of document.querySelectorAll<HTMLElement>(
        `[${attribute}]`,
      )) {
        button.addEventListener("click", () => {
          const draft = state.donReturn;
          const key = button.getAttribute(attribute);
          const composition = currentDonReturnComposition();
          if (!draft || !key || !composition) return;
          const current = clampDonReturn(
            composition.rows.map((row) => row.pool),
            draft.manual,
            Number.MAX_SAFE_INTEGER,
          );
          draft.manual = {
            ...draft.manual,
            [key]: (current[key] ?? 0) + delta,
          };
          renderGame();
        });
      }
    }
    document
      .querySelector("#don-return-confirm")
      ?.addEventListener("click", () => {
        const draft = state.donReturn;
        const game = ctx.match.game;
        const composition = currentDonReturnComposition();
        if (!draft || !game || !composition) return;
        const pools = composition.rows.map((row) => row.pool);
        const allocation = clampDonReturn(
          pools,
          draft.manual,
          Number.MAX_SAFE_INTEGER,
        );
        draft.plan = donReturnPlan(pools, allocation);
        const chosen = game.activeObservation.legalActions.find(
          (action) =>
            action.type === "resolve-effect" &&
            action.option.kind === "don-return-count" &&
            action.option.count === totalDonReturned(allocation),
        );
        if (chosen) {
          performAction(chosen.actionId);
          return;
        }
        // A fixed `DON!! −N` has no count to submit -- the pool prompts are
        // already on offer -- so the plan starts answering them here rather
        // than waiting for a frame that will never come.
        if (composition.prepaid) spendDonReturnPlan(game.activeObservation);
      });
    document.querySelector("#increase-don")?.addEventListener("click", () => {
      if (!ctx.match.game) return;
      state.donAttachCount = Math.min(
        ctx.match.game.activeObservation.self.activeDon,
        state.donAttachCount + 1,
      );
      renderGame();
    });
    document
      .querySelector("#dismiss-battle-notice")
      ?.addEventListener("click", () => {
        state.battleNotice = null;
        renderGame();
      });
    document
      .querySelectorAll<HTMLElement>("[data-order-move]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const offer = ctx.match.game?.activeObservation.legalActions.find(
            (action) =>
              action.type === "resolve-effect" &&
              action.option.kind === "order",
          );
          if (offer?.type !== "resolve-effect" || offer.option.kind !== "order")
            return;
          const [position, delta] = (button.dataset.orderMove ?? "")
            .split(",")
            .map(Number);
          if (position === undefined || delta === undefined) return;
          state.bottomOrder = {
            actionId: offer.actionId,
            order: moveInOrder(
              bottomOrderFor(offer.actionId, offer.option.cards.length),
              position,
              delta,
            ),
          };
          renderGame();
        });
      });
    document.querySelector("#dismiss-look")?.addEventListener("click", () => {
      state.lookNotice = null;
      renderGame();
    });
    document
      .querySelector("#acknowledge-opponent-action")
      ?.addEventListener("click", () => {
        state.opponentNotice = null;
        state.automaticNotice = null;
        state.automaticNoticeTitle = null;
        // If the next move was already decided while this modal was up, it plays
        // off the click instead of being asked for now, so the player only spends
        // the pacing beat rather than another round trip.
        const prefetched = state.prefetchedAiResult;
        state.prefetchedAiResult = null;
        if (prefetched) playPrefetchedAiResult(prefetched);
        else renderGame();
      });
    document
      .querySelectorAll<HTMLElement>("[data-open-targets]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          state.targetMode = button.dataset
            .openTargets as typeof state.targetMode;
          state.battleNotice = null;
          renderGame();
        });
      });
    document
      .querySelectorAll<HTMLElement>("[data-action]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          performAction(button.dataset.action!);
        });
      });
    document.querySelectorAll<HTMLElement>("[data-card]").forEach((card) => {
      card.addEventListener("click", () => {
        selectCard(card.dataset.card!, card.dataset.instance!);
      });
    });
    document.querySelector("#active-don")?.addEventListener("click", () => {
      if (!ctx.match.game || activeController() !== "human") return;
      if (
        ctx.match.game.activeObservation.phase === "main" &&
        ctx.match.game.activeObservation.legalActions.some(
          (action) => action.type === "attach-don",
        )
      ) {
        state.mainSelection = { kind: "don" };
        state.donAttachCount = 1;
        state.targetMode = null;
        state.historyOpen = false;
        renderGame();
      }
    });
    document.querySelector(".table")?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-card], #active-don")) return;
      // While the board is being aimed at, the table itself is the way out:
      // clicking past every lit card is the gesture for "none of these", and
      // it steps back to the panel that made the offer rather than dropping
      // the selection entirely.
      if (boardTargeting()) {
        state.targetMode = null;
        renderGame();
        return;
      }
      if (state.mainSelection) {
        clearMainSelection();
        renderGame();
      }
    });
  }

  function selectCard(cardNumber: string, instanceId: string): void {
    if (!ctx.match.game) return;
    const observation = ctx.match.game.activeObservation;
    // Whatever the pick leads to -- the card's panel, a look at its face, an
    // answer to the board -- it is on the table, not in the sheet.
    state.handOpen = null;
    // A watcher's click is a look at the card and nothing else: the panel a
    // pick normally opens is a seat's own controls, and a spectator has no
    // seat. Without this a click set a selection whose panel is never drawn,
    // so every card on a watched board was dead to the touch.
    if (spectating()) {
      ctx.cardDetail.cardDetailCard = cardNumber;
      ctx.cardDetail.cardDetailInstance = instanceId;
      renderGame();
      return;
    }
    if (state.choiceModalHidden) {
      ctx.cardDetail.cardDetailCard = cardNumber;
      ctx.cardDetail.cardDetailInstance = instanceId;
      renderGame();
      return;
    }
    // While the board is the question, a click on it answers it: a lit card
    // takes the action, and any other card is "none of these" and steps back
    // to the panel -- one click to correct, never a declared attack.
    const boardMode = boardTargeting();
    if (boardMode) {
      const action = targetAction(observation, instanceId);
      if (!action) {
        state.targetMode = null;
        renderGame();
      } else if (boardMode === "attach-don") {
        performDonAttachments(instanceId);
      } else {
        performAction(action.actionId);
      }
      return;
    }
    state.battleNotice = null;
    state.mainSelection = { kind: "card", instanceId, cardNumber };
    state.historyOpen = false;
    renderGame();
  }

  function clearMainSelection(): void {
    state.mainSelection = null;
    state.targetMode = null;
    state.donAttachCount = 1;
  }

  /**
   * Drops or redacts events the viewer is not entitled to see, mirroring the
   * engine's `observe` filter. The controller's raw observation carries every
   * event as seen by whichever player the engine happened to observe as (the
   * acting player, not necessarily this viewer), including private looks (a
   * `card-revealed` with a `visibleTo` set, like OP15-118 Enel's search) and
   * private gains (a `card-moved` with an `identityVisibleTo` set, like OP06-106
   * Kouzuki Hiyori's Life-to-hand pull); the opponent notice is built from that
   * raw stream, so without this it would leak the card.
   */
  function viewerEvents(
    events: readonly PublicEvent[],
    viewer: PlayerId,
  ): readonly PublicEvent[] {
    return events
      .filter(
        (event) =>
          event.type !== "card-revealed" ||
          event.visibleTo === undefined ||
          event.visibleTo === viewer,
      )
      .map((event) =>
        event.type === "card-moved" &&
        event.identityVisibleTo !== undefined &&
        event.identityVisibleTo !== viewer
          ? { ...event, cardInstanceId: null, cardNumber: null }
          : event,
      );
  }

  function performDonAttachments(targetInstanceId: string): void {
    if (!ctx.match.game) return;
    try {
      // One at a time against a server. Each attachment is its own action at its
      // own revision, so a loop would send several for the position before them
      // and the server would rightly reject all but the first. The player clicks
      // again; the count picker is a local convenience, not a rule.
      const attachments = ctx.match.game.capabilities.appliesImmediately
        ? state.donAttachCount
        : 1;
      for (let attached = 0; attached < attachments; attached += 1) {
        const action = ctx.match.game.activeObservation.legalActions.find(
          (candidate) =>
            candidate.type === "attach-don" &&
            candidate.targetInstanceId === targetInstanceId,
        );
        if (!action) break;
        ctx.match.game.act(action.actionId);
      }
      clearMainSelection();
      renderGame();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Fold one action's consequences into what the board is showing.
   *
   * Split out of `performAction` because an action is not always something this
   * page did. Locally every action comes through the click that caused it --
   * the player's, and the agent's, which the worker hands back the same way.
   * Online the opponent's actions arrive as frames from the server with no
   * click behind them, and this used to run only on click: the board redrew to
   * the new position with no "here is what they did" modal and no battle
   * result. Same derivation, two callers.
   */
  /**
   * Whether a panel the player has not acknowledged is holding the screen.
   *
   * The agent's pacing reads this: a move that lands while a notice is up
   * moves the board out from under a report of the board.
   *
   * Never while the board is a spectator's. The notices are still derived --
   * they are what the history is written from -- but none of them is drawn for
   * somebody who is only watching, so a notice counted here would be a modal
   * nobody can see waiting on a dismissal nobody can give, and the agents
   * would stop dead behind it.
   */
  function noticeOnScreen(): boolean {
    if (spectating()) return false;
    return state.opponentNotice !== null || state.automaticNotice !== null;
  }

  function absorbAction(
    actor: PlayerId,
    viewer: PlayerId,
    newEvents: readonly PublicEvent[],
  ): void {
    // A watcher gets one report for both seats and none of the surfaces a
    // player answers. Replaced rather than appended: the panel is what just
    // happened, and the next action is what happens next -- a turn's worth of
    // steps gathered into one sheet is the wall this is drawn small to avoid.
    // Nothing is held back either, because nothing here is waiting to be read
    // before the game may go on.
    if (spectating()) {
      if (newEvents.length > 0)
        state.spectatorNotice = { actor, events: newEvents };
      state.opponentNotice = null;
      state.automaticNotice = null;
      state.automaticNoticeTitle = null;
      state.heldAutomaticNotice = null;
      state.heldAutomaticNoticeTitle = null;
      state.lookNotice = null;
      state.battleNotice = null;
      return;
    }
    const opponentActed = actor !== viewer;
    // Appended, not replaced, while a notice is still on screen.
    //
    // Offline the opponent is an agent that does not move until the player
    // dismisses the modal. Online they are a person taking their turn at their
    // own pace, and a second action arriving before the first was read used to
    // overwrite it -- the player dismissed one notice having never seen the
    // other, on a board that had already moved twice.
    state.opponentNotice =
      opponentActed && newEvents.length > 0
        ? [...(state.opponentNotice ?? []), ...newEvents]
        : opponentActed
          ? state.opponentNotice
          : null;
    // The player's own action can still move the board without them: their
    // Leader answering a `DON!! −N`, an [On K.O.] paying out on a Character
    // they just killed. Those steps used to be drawn straight onto the board
    // with nothing to say they had happened -- the modal is the same one the
    // opponent's turn gets, because it answers the same question.
    //
    // Held back while the DON!! that paid for it is still being named: the
    // engine takes the cheapest DON!! up front and asks which pool each came
    // out of once the action has resolved, so the Leader's answer to the
    // payment is reported before the payment itself has been made. The steps
    // wait, and the next action -- one of the pool prompts -- either holds
    // them again or puts them up.
    const automatic = opponentActed
      ? null
      : [
          ...(state.heldAutomaticNotice ?? []),
          ...(automaticSteps(newEvents) ?? []),
        ];
    const steps = automatic && automatic.length > 0 ? automatic : null;
    const unsettled =
      !opponentActed &&
      donPaymentUnsettled(ctx.match.game?.activeObservation.legalActions ?? []);
    state.heldAutomaticNotice = unsettled ? steps : null;
    state.automaticNotice = unsettled ? null : steps;
    // Decided here rather than at render, because the marker that says which
    // kind of ability these steps came from is dropped from the steps. Held
    // alongside them for the same reason they are, so steps that wait out a
    // DON!! payment still come up under the heading they were given.
    const title =
      state.heldAutomaticNoticeTitle ?? automaticNoticeTitle(newEvents);
    state.heldAutomaticNoticeTitle = unsettled && steps ? title : null;
    state.automaticNoticeTitle = !unsettled && steps ? title : null;
    // Cleared and re-derived every action: the strip belongs to the look that
    // just happened, so the pick that follows it takes it back off screen.
    state.lookNotice = opponentActed ? null : lookedAtCards(newEvents, viewer);
    state.battleNotice = opponentActed
      ? null
      : ([...newEvents]
          .reverse()
          .find(
            (event): event is BattleNoticeEvent =>
              event.type === "attack-blocked" ||
              event.type === "attack-redirected" ||
              event.type === "battle-resolved",
          ) ?? null);
  }

  function performAction(actionId: string): void {
    if (!ctx.match.game) return;
    try {
      const before = ctx.match.game.activeObservation;
      const viewer = viewerFor(ctx.match.game);
      ctx.match.game.act(actionId);
      // The choice this order belonged to is spent, whatever it was -- and
      // whether or not the events for it have arrived yet, so this sits
      // outside the branch below rather than inside `absorbAction`.
      state.bottomOrder = null;
      // Online, `act` has sent a request and nothing else: the events belong to
      // the *previous* action until the server answers, so reading them here
      // would show the last thing that happened as though it were this one.
      // `absorbFrame` does it when the answer arrives, for both seats' actions.
      if (ctx.match.game.capabilities.appliesImmediately) {
        absorbAction(
          before.activePlayer,
          viewer,
          viewerEvents(ctx.match.game.latestActionEvents, viewer),
        );
      }
      clearMainSelection();
      state.choiceModalHidden = false;
      renderGame();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * A position arrived from the server: show what got us here, then redraw.
   *
   * The caller is whatever is holding the socket; see `MatchGame.lastActionActor`
   * for why the actor has to come with the events.
   */
  function absorbFrame(): void {
    const game = ctx.match.game;
    if (!game) return;
    const actor = game.lastActionActor;
    const viewer = viewerFor(game);
    if (actor) {
      absorbAction(
        actor,
        viewer,
        viewerEvents(game.latestActionEvents, viewer),
      );
      if (actor !== viewer) state.choiceModalHidden = false;
      // If that action handed the decision over, its steps go to the history
      // drawer and not into a modal.
      //
      // The modal exists so the board cannot move under a player who has not
      // read it, and offline that costs nothing: the agent does not act until it
      // is dismissed. Online the opponent is a person and the clock is running
      // -- this player's clock, now that it is their decision -- so a modal over
      // their own options would charge them time to close. Their turn, their
      // screen; the history drawer holds the record.
      if (game.activeObservation.activePlayer === viewer) {
        state.opponentNotice = null;
      }
    }
    renderGame();
  }

  function activeController(): ControllerKind | null {
    if (!ctx.match.game) return null;
    return ctx.match.game.config[
      `${ctx.match.game.activeObservation.activePlayer}Controller`
    ];
  }

  /**
   * Drop the answer an agent is working on, and any that has already arrived.
   *
   * The sequence number is the cancel: a worker message tagged with an old one
   * is ignored when it lands, so nothing has to be waited for.
   */
  function discardPendingAiAnswer(): void {
    state.workerSequence += 1;
    state.aiPending = false;
    state.prefetchedAiResult = null;
  }

  function scheduleAi(): void {
    // Nothing pilots a seat in a replay: the file already decided every action,
    // and an agent asked for one here would play the match a second time,
    // over the top of the one being watched.
    if (state.replay) return;
    // A paused simulation asks for nothing: the seats are agents, so a request
    // sent here is the board playing on without anybody watching it.
    const simulation = state.simulation;
    if (simulation && !simulation.playing) return;
    if (
      !ctx.match.game ||
      state.aiPaused ||
      state.aiPending ||
      state.prefetchedAiResult ||
      ctx.match.game.activeObservation.phase === "finished"
    )
      return;
    const controller = activeController();
    if (!controller || controller === "human") return;
    // An online opponent is a person on the other end of the network. Nothing in
    // this page pilots them, and starting an agent for them would play their
    // turn for them.
    if (!ctx.match.game.capabilities.ai || controller === "online") return;
    state.aiPending = true;
    const observation = ctx.match.game.activeObservation;
    const player = observation.activePlayer;
    const id = ++state.workerSequence;
    // The pause exists so a move does not land the instant the last one did. An
    // unacknowledged modal is already that pause, so ask right away instead --
    // and a watched simulation sets its own beat, which is the whole of what
    // its pace control does.
    const delay = noticeOnScreen() ? 0 : (simulation?.paceMs ?? 420);
    window.setTimeout(() => {
      if (id !== state.workerSequence) return;
      ctx.worker.postMessage({
        id,
        agentKey: `${state.agentSession}:${observation.gameId}:${player}:${controller}`,
        controller,
        deckId: ctx.match.game?.config[player === "p1" ? "p1Deck" : "p2Deck"],
        opponentDeckId:
          ctx.match.game?.config[player === "p1" ? "p2Deck" : "p1Deck"],
        dossierDeckId:
          ctx.match.game?.config[player === "p1" ? "p1Dossier" : "p2Dossier"],
        opponentDossierDeckId:
          ctx.match.game?.config[player === "p1" ? "p2Dossier" : "p1Dossier"],
        deckManifest:
          ctx.match.game?.config[
            player === "p1" ? "p1CustomDeck" : "p2CustomDeck"
          ],
        opponentDeckManifest:
          ctx.match.game?.config[
            player === "p1" ? "p2CustomDeck" : "p1CustomDeck"
          ],
        llmProxyUrl: new URL("/api/llm/complete", location.href).href,
        seed: ctx.match.game?.config.seed,
        observation,
      });
    }, delay);
  }

  /**
   * The index the next action will take, which a model call is recorded against
   * before that action is applied. See {@link LlmDebugRecord.actionCount}.
   */
  function pendingActionCount(): number {
    return (ctx.match.game?.trace().checkpoints.length ?? 0) + 1;
  }

  /** Play a worker answer, or report why the AI stopped. Always re-renders. */
  function applyAiResult(result: AiResult): void {
    if (result.error) {
      if (ctx.match.game) {
        state.llmDebugRecords.push({
          timestamp: new Date().toISOString(),
          turn: ctx.match.game.activeObservation.turn,
          player: ctx.match.game.activeObservation.activePlayer,
          // The call is recorded before its action is applied, so the action it
          // was deciding is the one after every checkpoint so far. That index is
          // what puts the call under its own step in the history.
          actionCount: pendingActionCount(),
          error: result.error,
          ...(result.reasoning ? { reasoning: result.reasoning } : {}),
          ...(result.rawExchange ? { rawExchange: result.rawExchange } : {}),
        });
      }
      state.aiPaused = true;
      // The strip must not go on showing a game in progress once the seat
      // driving it has stopped.
      if (state.simulation) state.simulation.playing = false;
      window.alert(`Local AI stopped: ${result.error}`);
      renderGame();
      return;
    }
    if (result.actionId && result.rawExchange && ctx.match.game) {
      state.llmDebugRecords.push({
        timestamp: new Date().toISOString(),
        turn: ctx.match.game.activeObservation.turn,
        player: ctx.match.game.activeObservation.activePlayer,
        actionCount: pendingActionCount(),
        actionId: result.actionId,
        ...(result.reasoning ? { reasoning: result.reasoning } : {}),
        rawExchange: result.rawExchange,
      });
    }
    if (result.actionId) performAction(result.actionId);
    else renderGame();
  }

  /**
   * Play an answer that was parked behind an acknowledged modal, after the same
   * beat a freshly asked one would have taken.
   *
   * The beat is what the click buys back, not the round trip: the modal has to be
   * seen closing before the next one opens, or a second click lands on a notice
   * that appeared under the cursor and dismisses it unread.
   */
  function playPrefetchedAiResult(result: AiResult): void {
    // Nothing may ask for another move while this one is waiting to land.
    state.aiPending = true;
    // Undo, a new game, and an import all bump the sequence, which cancels this.
    const id = state.workerSequence;
    renderGame();
    window.setTimeout(() => {
      if (id !== state.workerSequence) return;
      state.aiPending = false;
      applyAiResult(result);
    }, 420);
  }

  ctx.worker.addEventListener("message", (event: MessageEvent<AiResult>) => {
    if (event.data.id !== state.workerSequence) return;
    state.aiPending = false;
    // Park the answer rather than re-rendering: the modal on screen is describing
    // the state this answer was asked about, and the player may be reading it or
    // have a card open on top of it.
    if (noticeOnScreen()) {
      state.prefetchedAiResult = event.data;
      return;
    }
    applyAiResult(event.data);
  });
  ctx.worker.addEventListener("error", () => {
    state.aiPending = false;
    state.prefetchedAiResult = null;
    state.aiPaused = true;
    renderGame();
  });

  /**
   * Redraw the clock in place.
   *
   * Replaces one element rather than the board, so a menu the player has open
   * stays open and no card is rebuilt. Silent when there is no clock or no
   * board on screen, which is every local match and every menu screen.
   */
  function tickClock(): void {
    const clock = ctx.match.game?.clock;
    const element = document.querySelector(".match-clock");
    if (!clock || !element || !ctx.match.game) return;
    element.outerHTML = renderClock(clock, viewerFor(ctx.match.game));
  }

  return {
    render: renderGame,
    clearSelection: clearMainSelection,
    tickClock,
    absorbFrame,
  };
}
