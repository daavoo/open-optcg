/**
 * One game of rules agent against rules agent, as `dump.ts` plays it, with a
 * hook at every decision that can change the move.
 *
 * `dump.ts` records the games and `fork.ts` replays one of them to a recorded
 * decision and makes a different move there, so both must play the same game
 * from the same seed; sharing the loop is what keeps them in step.
 */
import {
  applyAction,
  createGame,
  observe,
  simulateAction,
  toGameAction,
  type GameState,
} from "@one-piece-sim/engine-core";
import { acceptsSimulator, type Agent } from "@one-piece-sim/agents/local";
import type {
  GameObservation,
  LegalAction,
  PlayerId,
} from "@one-piece-sim/protocol";
import { createTrainingRulesAgent, resolveTrainingDeck } from "./decks.js";

export const MAX_ACTIONS = 1500;

export interface RulesGame {
  state: GameState;
  actions: number;
}

/**
 * Plays `p1Deck` against `p2Deck` from `seed` to the end or `MAX_ACTIONS`.
 * `decide` sees every decision after its rules agent has chosen, and returns
 * the action to apply: the agent's own, or another legal one. The agent is
 * passed too, for a caller that wants to read why it chose.
 */
export async function playRulesGame(
  p1Deck: string,
  p2Deck: string,
  gameId: string,
  seed: string,
  decide: (
    observation: GameObservation,
    chosen: LegalAction,
    agent: Agent,
  ) => LegalAction | Promise<LegalAction>,
): Promise<RulesGame> {
  let state = createGame({
    gameId,
    p1: resolveTrainingDeck(p1Deck),
    p2: resolveTrainingDeck(p2Deck),
    seed,
    startingPlayer: "random",
  });
  const agents: Record<PlayerId, Agent> = {
    p1: createTrainingRulesAgent(p1Deck),
    p2: createTrainingRulesAgent(p2Deck),
  };
  let actions = 0;
  while (state.phase !== "finished" && actions < MAX_ACTIONS) {
    const seat = state.activePlayer;
    const observation = observe(state, seat);
    const agent = agents[seat];
    if (acceptsSimulator(agent)) {
      const frozen = state;
      agent.useSimulator((actionId) => simulateAction(frozen, actionId, seat));
    }
    const chosen = await decide(
      observation,
      await agent.chooseAction(observation),
      agent,
    );
    state = applyAction(state, toGameAction(chosen, state.revision)).state;
    actions += 1;
  }
  return { state, actions };
}
