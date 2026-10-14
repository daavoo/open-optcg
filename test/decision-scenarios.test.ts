import { describe, expect, it } from "vitest";
import { St31RulesAgent } from "@one-piece-sim/agents/local";
import {
  LlmAgent,
  type LlmChatClient,
  type LlmChatRequest,
} from "@one-piece-sim/agents/llm";
import {
  createGame,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

function card(instanceId: string, cardNumber: string) {
  return { instanceId, cardNumber };
}

function luffyFourDonIntoNami(): GameState {
  const state = createGame({
    gameId: "scenario-luffy-four-don",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
    seed: "scenario-luffy-four-don",
  });
  state.turn = 4;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  state.pendingEffect = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];

  Object.assign(state.players.p1, {
    hand: [
      card("brook", "ST31-003"),
      card("franky", "OP11-012"),
      card("sanji", "ST31-001"),
      card("zoro-a", "OP14-015"),
      card("zoro-b", "OP14-015"),
      card("usopp-a", "OP11-003"),
      card("usopp-b", "OP11-003"),
      card("bad-manners", "OP04-016"),
    ],
    board: [
      {
        instanceId: "nami-searcher",
        cardNumber: "OP01-016",
        rested: false,
        playedTurn: 2,
        attachedDon: [],
        powerModifiers: [],
      },
    ],
    stage: {
      instanceId: "sunny",
      cardNumber: "ST31-005",
      rested: false,
    },
    activeDon: ["p1-don-1", "p1-don-2", "p1-don-3", "p1-don-4"],
    restedDon: [],
    leaderAttachedDon: [],
    leaderPowerModifiers: [],
    leaderRested: false,
  });
  Object.assign(state.players.p2, {
    hand: [
      card("nami-hand-1", "OP06-106"),
      card("nami-hand-2", "OP14-102"),
      card("nami-hand-3", "OP14-110"),
      card("nami-hand-4", "OP14-111"),
      card("nami-hand-5", "OP16-056"),
    ],
    board: [],
    stage: null,
    activeDon: [],
    restedDon: [],
    leaderAttachedDon: ["p2-don-1", "p2-don-2", "p2-don-3"],
    leaderPowerModifiers: [],
    leaderRested: true,
  });
  return state;
}

function opensWithUnboostedLeaderAttack(action: LegalAction): boolean {
  return action.type === "attack" && action.attackerInstanceId === "p1-leader";
}

function passesLuffyFourDonScenario(action: LegalAction): boolean {
  return !opensWithUnboostedLeaderAttack(action);
}

class UnboostedLeaderAttackClient implements LlmChatClient {
  async complete(request: LlmChatRequest) {
    // The request lists its actions as `- action-N: <summary>`, and only the
    // Leader is described as one after "with".
    const attack = [
      ...request.messages.at(-1)!.content.matchAll(/^- (action-\d+): (.*)$/gm),
    ].find((match) => /^Attack .* with .* \(Leader,/.test(match[2]!));
    if (!attack) throw new Error("MISSING_UNBOOSTED_LEADER_ATTACK");
    return {
      content: JSON.stringify({
        actionIds: [attack[1]!],
        reasoning: "Attack before allocating DON!!.",
      }),
    };
  }
}

describe("decision scenarios", () => {
  it("buys the closing attack before it attacks, with the opponent at 0 Life", async () => {
    const observation = observe(luffyFourDonIntoNami(), "p1");
    const action = await new St31RulesAgent().chooseAction(observation);

    // The diagnostic this scenario came from was about *ordering*: the LLM opened
    // with an unboosted Leader attack, throwing away the DON!! that would have
    // made it connect. That is the assertion below, and it is the one that
    // matters.
    //
    // It used to also assert the specific alternative -- play Franky for all
    // four DON!! -- and that part was over-specified. The opponent in this
    // position is at **0 Life** with a rested Leader and an empty board, so one
    // connected hit ends the game: DON!! spent on the Leader buys that hit and
    // makes it cost more Counter cards to stop, while a 4-cost body played now
    // has summoning sickness and never attacks at all. The archetype layer's
    // `strategy:red-aggro` rule ("inside kill range a body played now never
    // attacks") is what changed the answer, and the answer it changed it to is
    // better play.
    expect(action).toMatchObject({
      type: "attach-don",
      targetInstanceId: "p1-leader",
    });
    expect(passesLuffyFourDonScenario(action)).toBe(true);
  });

  it("rejects the known-bad LLM opener from the diagnostic", async () => {
    const observation = observe(luffyFourDonIntoNami(), "p1");
    const action = await new LlmAgent(
      new UnboostedLeaderAttackClient(),
    ).chooseAction(observation);

    expect(passesLuffyFourDonScenario(action)).toBe(false);
  });
});
