import {
  GameService,
  describeStampMismatch,
  rulesStamp,
  type RulesStamp,
} from "@one-piece-sim/engine-core";
import { resolveMatchDecks, type DeckManifest } from "@one-piece-sim/decks";
import type {
  ClockView,
  GameObservation,
  MatchResult,
  PlayerId,
  PublicEvent,
  TimeLimit,
} from "@one-piece-sim/protocol";

export type ControllerKind =
  | "human"
  | "rules"
  /**
   * An LLM seat. The app never starts one: the kind is here because a trace
   * written by the LLM evaluation tools (`pnpm matchup:llm`) names it, and
   * such a trace still loads to be watched back.
   */
  | "llm"
  | "random"
  | "first"
  /** The System-1 scorer running in the worker. See `@one-piece-sim/agents/scorer`. */
  | "scorer"
  /**
   * A person on the other end of a network, refereed by the server.
   *
   * Nothing in the browser pilots this seat, which is the point of naming it:
   * the board must not start an agent for it, and must not expect its
   * observation to be readable.
   */
  | "online";

export interface MatchConfig {
  p1Deck: string;
  p2Deck: string;
  p1CustomDeck?: DeckManifest;
  p2CustomDeck?: DeckManifest;
  /**
   * The deck whose strategy dossier an LLM seat is piloted with, when that is
   * not the deck it is playing. Only the LLM evaluation tools set one, for a
   * list that has no dossier of its own; recorded in the config so that a
   * trace names what the model was actually told.
   */
  p1Dossier?: string;
  p2Dossier?: string;
  p1Controller: ControllerKind;
  p2Controller: ControllerKind;
  seed: string;
  seedMode?: "matchup";
  startingPlayer: PlayerId | "random";
  /**
   * The tournament time limit the game was played under (see `TimeLimit`).
   * The app never sets one; a trace from a timed game -- the training bridge
   * plays under one -- carries it so the replay ends where the game did.
   */
  timeLimit?: TimeLimit;
}

export interface TraceCheckpoint {
  revision: number;
  actionId: string;
  /** Turn and decision owner as they were when this action was chosen. */
  turn: number;
  player: PlayerId;
  stateHash: string;
  /**
   * Only the events this action added, not the whole log so far.
   *
   * `GameObservation.publicEvents` is cumulative, so cloning it per checkpoint
   * made the trace quadratic: a 79-action match stored 3476 event entries for
   * 84 distinct ones. Concatenate the deltas in order to rebuild the full log.
   *
   * Projected through one fixed seat for the whole match -- see
   * `BrowserGameController`'s `#eventViewer`.
   */
  events: readonly PublicEvent[];
}

export interface SavedMatch {
  version: 1;
  config: MatchConfig;
  actions: readonly string[];
  /**
   * The rules this game was played under. See `provenance.ts` in the engine.
   *
   * Optional on the way in, because saves and traces exported before stamping
   * existed are still worth trying; always written on the way out.
   */
  rules?: RulesStamp;
}

export interface MatchTrace extends SavedMatch {
  /**
   * Events the engine emitted while creating the game, before any action.
   *
   * Checkpoints hold per-action deltas, so `game-created` and the opening setup
   * events belong to no action and would otherwise be dropped. Prepend these to
   * the concatenated checkpoint deltas to get the full public log.
   */
  initialEvents: readonly PublicEvent[];
  checkpoints: readonly TraceCheckpoint[];
}

/**
 * What the board screen needs from a match, whoever is refereeing it.
 *
 * `BrowserGameController` and `OnlineMatch` both satisfy this. It exists so the
 * board has one code path: offline the frame arrives because `act` returned,
 * online because the server sent one, and everything above that line is the
 * same. `capabilities` is how the two differ honestly -- an online match cannot
 * take a move back, so the button is not rendered rather than rendered and
 * failing.
 */
export interface MatchGame {
  readonly config: MatchConfig;
  readonly activeObservation: GameObservation;
  readonly latestActionEvents: readonly PublicEvent[];
  readonly canUndo: boolean;
  readonly capabilities: {
    readonly undo: boolean;
    readonly rewind: boolean;
    readonly trace: boolean;
    /** Whether a seat in this match may be piloted by an agent in this page. */
    readonly ai: boolean;
    /**
     * Whether `act` has already changed the position by the time it returns.
     *
     * True locally, false online, where the server decides and sends a frame.
     * The board reads this instead of assuming: code that took a forced action
     * in a loop, re-reading the position each time, would never terminate
     * against a server.
     */
    readonly appliesImmediately: boolean;
  };
  /**
   * The clock, when a server is running one. Absent for a local match, which
   * has no clock at all -- there is nobody to be unfair to.
   */
  readonly clock?: ClockView | null;
  /**
   * How the match ended, when the session decided it rather than the engine.
   *
   * A resignation, a timeout and a no-show are all outcomes the engine knows
   * nothing about: the position is untouched and still looks playable, so
   * without this the board would draw a live game over a match that is over.
   * Null while the game is running, and absent entirely for a local match,
   * whose only ending is one the engine reached.
   */
  readonly result?: MatchResult | null;
  /**
   * Who took the action the latest events belong to.
   *
   * Local matches do not need it: the board applies the action itself and
   * already knows. Online it is the missing half of `latestActionEvents` --
   * without it the board cannot tell its own consequences from its opponent's,
   * which is the difference between "here is what they did" and silence.
   */
  readonly lastActionActor?: PlayerId | null;
  observe(playerId: PlayerId): GameObservation;
  act(actionId: string): unknown;
  /**
   * Give up. Present only where there is an opponent to give up to; a local
   * match against an agent has "New game" instead.
   */
  resign?: () => void;
  rewindTo(actionCount: number): unknown;
  trace(): MatchTrace;
}

export class BrowserGameController {
  #service = new GameService();
  #activeObservation: GameObservation;
  #actions: string[] = [];
  #checkpoints: TraceCheckpoint[] = [];
  #initialEvents: readonly PublicEvent[] = [];
  /**
   * The one seat every event delta is measured and projected through.
   *
   * `observe` withholds what a seat may not see, so `publicEvents` is a
   * different length for each of them. Deltas used to be sliced out of
   * whatever `GameService.act` returned, which is the *new* active player's
   * view -- so any action that handed the decision to the opponent measured
   * "events so far" in one projection and sliced them out of another. Once a
   * private look had put the two projections out of step, the handover action
   * recorded no events at all and the next action recorded a delta that
   * replayed events already charged to an earlier one.
   *
   * Pinning one seat for the whole match is what makes the slice sound. The
   * human's seat, so the projection is the one the player is entitled to;
   * `p1` for AI-vs-AI, where any fixed seat will do and no one needs
   * protecting. Callers still filter for their own viewer on the way out --
   * that pass only ever removes more, so it stays correct either way.
   */
  readonly #eventViewer: PlayerId;
  /** How many of `#eventViewer`'s events are already charged to a checkpoint. */
  #seenEvents = 0;

  constructor(readonly config: MatchConfig) {
    const humans = (["p1", "p2"] as const).filter(
      (player) => config[`${player}Controller`] === "human",
    );
    this.#eventViewer = humans.length === 1 ? humans[0]! : "p1";
    this.#activeObservation = this.#createGame();
    this.#initialEvents = structuredClone(this.#viewerEvents());
    this.#seenEvents = this.#initialEvents.length;
  }

  static load(saved: SavedMatch): BrowserGameController {
    const controller = new BrowserGameController(saved.config);
    try {
      for (const actionId of saved.actions) controller.act(actionId);
    } catch (error) {
      // A trace from an older build fails somewhere in the middle, and the raw
      // failure ("illegal action r43:...") reads as an engine bug in a game the
      // player did nothing wrong in. If the stamp explains it, lead with that.
      const mismatch = describeStampMismatch(saved.rules);
      if (mismatch) {
        throw new Error(
          `${mismatch} Replay stopped after ${String(controller.#actions.length)} of ${String(saved.actions.length)} actions. Nothing is wrong with the file -- it records a game this build can no longer replay exactly.`,
          { cause: error },
        );
      }
      throw error;
    }
    return controller;
  }

  /** Everything a local match can do; see `MatchGame.capabilities`. */
  readonly capabilities = {
    undo: true,
    rewind: true,
    trace: true,
    ai: true,
    appliesImmediately: true,
  } as const;

  get activeObservation(): GameObservation {
    return structuredClone(this.#activeObservation);
  }

  get canUndo(): boolean {
    return this.#actions.length > 0;
  }

  get latestActionEvents(): readonly PublicEvent[] {
    return structuredClone(this.#checkpoints.at(-1)?.events ?? []);
  }

  observe(playerId: PlayerId): GameObservation {
    return this.#service.observe(this.#activeObservation.gameId, playerId);
  }

  act(actionId: string): GameObservation {
    const before = this.#activeObservation;
    const next = this.#service.act(before.gameId, before.revision, actionId);
    this.#activeObservation = next;
    this.#actions.push(actionId);
    const log = this.#viewerEvents();
    this.#checkpoints.push({
      revision: next.revision,
      actionId,
      turn: before.turn,
      player: before.activePlayer,
      stateHash: next.stateHash,
      events: structuredClone(log.slice(this.#seenEvents)),
    });
    this.#seenEvents = log.length;
    return this.activeObservation;
  }

  undo(): GameObservation {
    if (!this.canUndo) return this.activeObservation;
    return this.rewindTo(this.#actions.length - 1);
  }

  /** Restore the state immediately after the requested action prefix. */
  rewindTo(actionCount: number): GameObservation {
    const actions = this.#actions.slice(0, Math.max(0, actionCount));
    this.#service = new GameService();
    this.#activeObservation = this.#createGame();
    this.#initialEvents = structuredClone(this.#viewerEvents());
    this.#seenEvents = this.#initialEvents.length;
    this.#actions = [];
    this.#checkpoints = [];
    for (const actionId of actions) this.act(actionId);
    return this.activeObservation;
  }

  save(): SavedMatch {
    return {
      version: 1,
      config: structuredClone(this.config),
      actions: [...this.#actions],
      rules: rulesStamp(),
    };
  }

  trace(): MatchTrace {
    return {
      ...this.save(),
      initialEvents: structuredClone(this.#initialEvents),
      checkpoints: structuredClone(this.#checkpoints),
    };
  }

  /** The cumulative log as `#eventViewer` is entitled to see it. */
  #viewerEvents(): readonly PublicEvent[] {
    return this.#service.observe(
      this.#activeObservation.gameId,
      this.#eventViewer,
    ).publicEvents;
  }

  #createGame(): GameObservation {
    // A trace of a puzzle attempt, from a build that had puzzle mode, started
    // from a constructed position this build cannot set up. Saying so beats
    // dealing an ordinary game and letting every action in the file turn out
    // to be illegal.
    if ("puzzleId" in this.config) {
      throw new Error(
        "UNKNOWN_PUZZLE: this trace is a puzzle attempt, and this build has no puzzle mode",
      );
    }
    // `MatchConfig` keeps naming decks by id -- it is what a saved match and a
    // trace store -- so this is where those ids become decks for the engine.
    return this.#service.create({
      ...resolveMatchDecks(this.config),
      seed: this.config.seed,
      ...(this.config.seedMode ? { seedMode: this.config.seedMode } : {}),
      startingPlayer: this.config.startingPlayer,
      ...(this.config.timeLimit ? { timeLimit: this.config.timeLimit } : {}),
    });
  }
}
