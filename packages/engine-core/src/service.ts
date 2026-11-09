import type {
  LegalAction,
  PlayerId,
  ResolvedDeck,
  TimeLimit,
} from "@one-piece-sim/protocol";
import {
  applyOfferedAction,
  cloneTransitionEvent,
  createGame,
  getLegalActions,
  notifyCallbacks,
  observe,
  type Callback,
  type GameTransitionEvent,
} from "./engine.js";
import { EngineError } from "./errors.js";
import { assertGameStateInvariants } from "./invariants.js";
import { findOfferedAction } from "./offered-action.js";
import type { GameState } from "./model.js";
import {
  describeStampMismatch,
  rulesStamp,
  type RulesStamp,
} from "./provenance.js";
import {
  simulateAction,
  simulateLine,
  toGameAction,
  type Plan,
  type Simulate,
} from "./simulate.js";

/** What `GameService.save` returns and `restore` takes. */
export interface SavedGame {
  rules: RulesStamp;
  state: GameState;
}

export class GameService {
  readonly #games = new Map<string, GameState>();
  /**
   * The legal actions of the state each game currently holds, derived once.
   *
   * Every transition asked the same question of the same state three times:
   * the observation that offered the actions, the `act` that looked the chosen
   * one up, and each one-ply simulation the agent ran before choosing. The
   * entry is keyed by the state object itself, so a state this service has
   * replaced is never answered from a stale list; a state is a value the
   * service alone holds, so nothing edits one under the entry.
   */
  readonly #legal = new Map<
    string,
    { state: GameState; actions: LegalAction[] }
  >();
  readonly #callbacks: readonly Callback<GameTransitionEvent>[];
  #sequence = 0;

  constructor(options?: {
    callbacks?: readonly Callback<GameTransitionEvent>[];
  }) {
    this.#callbacks = options?.callbacks ?? [];
  }

  create(params: {
    /** Already-resolved decks; see `createGame`. */
    p1: ResolvedDeck;
    p2: ResolvedDeck;
    seed: string;
    seedMode?: "seat" | "matchup";
    startingPlayer?: PlayerId | "random";
    timeLimit?: TimeLimit;
  }) {
    const gameId = `g-${++this.#sequence}`;
    const state = createGame({ gameId, ...params });
    this.#games.set(gameId, state);
    return this.observeActive(gameId, state);
  }

  observe(gameId: string, playerId: PlayerId) {
    const state = this.requireGame(gameId);
    return playerId === state.activePlayer
      ? this.observeActive(gameId, state)
      : observe(state, playerId);
  }

  /**
   * One-ply lookahead for `playerId`: what they would see after `actionId`.
   * Returns undefined for an action that is not currently legal.
   */
  simulate(gameId: string, playerId: PlayerId, actionId: string) {
    const state = this.requireGame(gameId);
    return simulateAction(
      state,
      actionId,
      playerId,
      this.legalActions(gameId, state),
    );
  }

  /** A simulator bound to one game and seat, for handing to an agent. */
  simulatorFor(gameId: string, playerId: PlayerId): Simulate {
    return (actionId) => this.simulate(gameId, playerId, actionId);
  }

  /**
   * A resumable planner bound to one game and seat.
   *
   * Same hidden-information guarantee as `simulatorFor`: every node in the
   * returned line reports only what `playerId` would see.
   */
  plannerFor(gameId: string, playerId: PlayerId): Plan {
    return (actionId) =>
      simulateLine(this.requireGame(gameId), actionId, playerId);
  }

  act(gameId: string, revision: number, actionId: string) {
    const state = this.requireGame(gameId);
    const legal = findOfferedAction(this.legalActions(gameId, state), actionId);
    if (!legal) {
      throw new EngineError("ILLEGAL_ACTION", `Unknown action: ${actionId}`);
    }
    const action = toGameAction(legal, revision);
    // `legal` came from `getLegalActions(state)` just above, which is what
    // lets this skip `applyAction`'s own derivation of the same list.
    const result = applyOfferedAction(state, action, legal);
    this.#games.set(gameId, result.state);
    notifyCallbacks(
      this.#callbacks,
      {
        previousState: state,
        action,
        legalAction: legal,
        result,
      },
      cloneTransitionEvent,
    );
    return this.observeActive(gameId, result.state);
  }

  /**
   * A game as a value to store, for a host that checkpoints games -- to resume
   * one after a restart, a reconnect or on another server. The state is plain
   * JSON; the stamp records the rules and card data it was played under.
   */
  save(gameId: string): SavedGame {
    return { rules: rulesStamp(), state: this.requireGame(gameId) };
  }

  /**
   * Resumes a game `save` produced, and shows the seat to act what it may do.
   *
   * A save from different rules or card data is refused by name: its next
   * actions were offered by an engine that may no longer offer them, the same
   * reason `replayActions` refuses a stale recording.
   */
  // Typed as storage hands it back: a save written by hand, or by a tool that
  // dropped the stamp, is refused rather than resumed on trust.
  restore(saved: { rules?: RulesStamp; state: GameState }) {
    const mismatch = saved.rules
      ? describeStampMismatch(saved.rules)
      : "The save carries no rules stamp.";
    if (mismatch) throw new EngineError("INCOMPATIBLE_SAVE", mismatch);
    const { state } = saved;
    assertGameStateInvariants(state);
    if (this.#games.has(state.gameId)) {
      throw new EngineError(
        "ILLEGAL_ACTION",
        `Game ${state.gameId} is already running here.`,
      );
    }
    this.#games.set(state.gameId, state);
    // A restored `g-N` id must never be handed out again by `create`.
    const sequence = /^g-(\d+)$/.exec(state.gameId)?.[1];
    if (sequence) this.#sequence = Math.max(this.#sequence, Number(sequence));
    return this.observeActive(state.gameId, state);
  }

  private observeActive(gameId: string, state: GameState) {
    return observe(
      state,
      state.activePlayer,
      undefined,
      this.legalActions(gameId, state),
    );
  }

  private legalActions(gameId: string, state: GameState): LegalAction[] {
    const cached = this.#legal.get(gameId);
    if (cached && cached.state === state) return cached.actions;
    const actions = getLegalActions(state, state.activePlayer);
    this.#legal.set(gameId, { state, actions });
    return actions;
  }

  private requireGame(gameId: string): GameState {
    const state = this.#games.get(gameId);
    if (!state)
      throw new EngineError("ILLEGAL_ACTION", `Unknown game: ${gameId}`);
    return state;
  }
}
