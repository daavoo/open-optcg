import type {
  GameObservation,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";
import { applyOfferedAction, getLegalActions, observe } from "./engine.js";
import { findOfferedAction } from "./offered-action.js";
import type { GameAction, GameState } from "./model.js";

/**
 * Builds the internal `GameAction` for an offered `LegalAction`.
 *
 * This mapping used to exist only inside `GameService.act`; it is shared so
 * that simulation and the live service can never drift apart.
 */
export function toGameAction(legal: LegalAction, revision: number): GameAction {
  const { actionId } = legal;
  switch (legal.type) {
    case "mulligan-decision":
      return {
        type: "mulligan-decision",
        actionId,
        revision,
        decision: legal.decision,
      };
    case "play-card":
      return {
        type: "play-card",
        actionId,
        revision,
        cardInstanceId: legal.cardInstanceId,
      };
    case "resolve-effect":
      return {
        type: "resolve-effect",
        actionId,
        revision,
        optionId: legal.optionId,
      };
    case "attach-don":
      return {
        type: "attach-don",
        actionId,
        revision,
        targetInstanceId: legal.targetInstanceId,
      };
    case "activate-main":
      return {
        type: "activate-main",
        actionId,
        revision,
        optionId: legal.optionId,
      };
    case "attack":
      return {
        type: "attack",
        actionId,
        revision,
        attackerInstanceId: legal.attackerInstanceId,
        targetInstanceId: legal.targetInstanceId,
      };
    case "block":
      return {
        type: "block",
        actionId,
        revision,
        blockerInstanceId: legal.blockerInstanceId,
      };
    case "counter":
      return {
        type: "counter",
        actionId,
        revision,
        cardInstanceId: legal.cardInstanceId,
      };
    case "activate-counter-event":
      return {
        type: "activate-counter-event",
        actionId,
        revision,
        eventInstanceId: legal.eventInstanceId,
      };
    case "resolve-trigger":
      return {
        type: "resolve-trigger",
        actionId,
        revision,
        optionId: legal.optionId,
      };
    case "pass":
      return { type: "pass", actionId, revision };
  }
}

/**
 * Applies one action to a copy of `state` and returns what `viewer` would then
 * see.
 *
 * Hidden information is preserved because the result goes back through
 * `observe`: the caller learns what its own seat would learn (its own draws,
 * its own board), never the opponent's private zones. `applyAction` already
 * clones, so the caller's state is untouched.
 *
 * Returns `undefined` when the action is not currently legal, so a policy can
 * probe freely without guarding every call.
 */
export function simulateAction(
  state: GameState,
  actionId: string,
  viewer: PlayerId,
  /** `state`'s legal actions, when the caller already holds them. */
  legalActions: LegalAction[] = getLegalActions(state, state.activePlayer),
): GameObservation | undefined {
  const legal = findOfferedAction(legalActions, actionId);
  if (!legal) return undefined;
  try {
    const result = applyOfferedAction(
      state,
      toGameAction(legal, state.revision),
      legal,
    );
    return observe(result.state, viewer);
  } catch {
    // Simulation must never be able to break the caller's turn.
    return undefined;
  }
}

/** A bound one-ply simulator handed to agents that ask for one. */
export type Simulate = (actionId: string) => GameObservation | undefined;

/**
 * One node in a hypothetical line of play, resumable to any depth.
 *
 * `simulateAction` can only answer "what does the board look like after this one
 * action", which is why the DON!! lookahead built on it could only ever count
 * the attacks an attachment unlocked.
 * `analysis/architecture-refactor-2026-08-07.md` records that this was the
 * limiting factor rather than the mechanism: "the objective ('count viable
 * attacks after this attachment') is too shallow. The human-test analysis asks
 * for the value of the whole attack *sequence*, which needs deeper search."
 *
 * A line keeps the hypothetical `GameState` alive behind the observation, so a
 * planner can keep going. Hidden information is still safe by construction:
 * every node reports what the *simulating seat* would see, never the opponent's
 * private zones, exactly as `simulateAction` does.
 */
export interface SimulatedLine {
  /** What the simulating seat would see at this node. */
  readonly observation: GameObservation;
  /** Seat the line is being evaluated for. */
  readonly viewer: PlayerId;
  /** Seat whose decision is pending here. */
  readonly decidingPlayer: PlayerId;
  /** Extend the line. Undefined when the action is not legal at this node. */
  advance(actionId: string): SimulatedLine | undefined;
  /**
   * Extend the line by the least committal legal action for whoever is deciding:
   * `pass` when it is offered, otherwise the first legal action.
   *
   * This is how a single-seat planner steps past decisions that are not its own.
   * A planner cannot know how the opponent will block or Counter, so valuing a
   * line as "what it forces the opponent to spend" and stepping their decisions
   * with `pass` is the honest reading: it measures the pressure the line
   * generates, not whether it connects.
   */
  advanceDefault(): SimulatedLine | undefined;
}

function lineFrom(state: GameState, viewer: PlayerId): SimulatedLine {
  return {
    observation: observe(state, viewer),
    viewer,
    decidingPlayer: state.activePlayer,
    advance(actionId: string): SimulatedLine | undefined {
      const next = step(state, actionId);
      return next ? lineFrom(next, viewer) : undefined;
    },
    advanceDefault(): SimulatedLine | undefined {
      const legal = getLegalActions(state, state.activePlayer);
      const chosen = legal.find((action) => action.type === "pass") ?? legal[0];
      if (!chosen) return undefined;
      const next = step(state, chosen.actionId);
      return next ? lineFrom(next, viewer) : undefined;
    },
  };
}

function step(state: GameState, actionId: string): GameState | undefined {
  const legal = findOfferedAction(
    getLegalActions(state, state.activePlayer),
    actionId,
  );
  if (!legal) return undefined;
  try {
    return applyOfferedAction(state, toGameAction(legal, state.revision), legal)
      .state;
  } catch {
    // Simulation must never be able to break the caller's turn.
    return undefined;
  }
}

/**
 * Starts a resumable line by applying `actionId` to a copy of `state`.
 *
 * Returns `undefined` when the action is not currently legal, so a planner can
 * probe freely without guarding every call.
 */
export function simulateLine(
  state: GameState,
  actionId: string,
  viewer: PlayerId,
): SimulatedLine | undefined {
  const next = step(state, actionId);
  return next ? lineFrom(next, viewer) : undefined;
}

/** A bound multi-ply planner handed to agents that ask for one. */
export type Plan = (actionId: string) => SimulatedLine | undefined;

/**
 * Agents that can use lookahead. The runner calls `useSimulator` before each
 * decision; agents without the method simply never see one, so this is additive
 * for every existing agent.
 */
export interface SimulatingAgent {
  useSimulator(simulate: Simulate | undefined): void;
  /** Optional deeper hook. Agents that only want one ply can omit it. */
  usePlanner?(plan: Plan | undefined): void;
}

export function isSimulatingAgent(agent: object): agent is SimulatingAgent {
  return typeof (agent as SimulatingAgent).useSimulator === "function";
}
