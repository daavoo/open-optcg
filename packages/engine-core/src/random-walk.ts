import { applyAction, getLegalActions } from "./engine.js";
import { assertGameStateInvariants } from "./invariants.js";
import type { GameAction, GameState } from "./model.js";
import { nextInt, seedRng } from "./rng.js";

export interface LegalActionWalkResult {
  state: GameState;
  actions: GameAction[];
  completed: boolean;
}

export function walkLegalActions(
  initialState: GameState,
  seed: string,
  maxActions: number,
): LegalActionWalkResult {
  let state = structuredClone(initialState);
  let rng = seedRng(seed);
  const actions: GameAction[] = [];
  assertGameStateInvariants(state);

  while (state.phase !== "finished" && actions.length < maxActions) {
    const legalActions = getLegalActions(state, state.activePlayer);
    if (legalActions.length === 0) {
      throw new Error(
        `LEGAL_WALK_STALLED: seed=${seed} revision=${state.revision} phase=${state.phase}`,
      );
    }
    const choice = nextInt(rng, legalActions.length);
    rng = choice.state;
    const action = {
      ...legalActions[choice.value]!,
      revision: state.revision,
    } as GameAction;
    state = applyAction(state, action).state;
    actions.push(action);
  }

  return { state, actions, completed: state.phase === "finished" };
}
