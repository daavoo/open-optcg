import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { St31RulesAgent } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";
import { fabricatedAttack, setTurnPlayer } from "./support/index.js";

const card = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
});

const character = (instanceId: string, cardNumber: string, rested = false) => ({
  instanceId,
  cardNumber,
  rested,
  playedTurn: 1,
  attachedDon: [],
  powerModifiers: [],
});

function requireAction(
  state: GameState,
  predicate: (action: LegalAction) => boolean,
): LegalAction {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  if (!action) throw new Error("MISSING_ACTION");
  return action;
}

function submit(state: GameState, action: LegalAction): GameState {
  return applyAction(state, { ...action, revision: state.revision }).state;
}

function matchupState(): GameState {
  let state = createGame({
    gameId: "st31-st34-policy",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
    seed: "st31-st34-policy-seed",
  });
  for (let playerIndex = 0; playerIndex < 2; playerIndex += 1) {
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "mulligan-decision" && action.decision === "keep",
      ),
    );
  }
  state.turn = 7;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  state.pendingEffect = null;
  state.pendingEffectResume = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];
  for (const playerId of ["p1", "p2"] as const) {
    Object.assign(state.players[playerId], {
      hand: [],
      board: [],
      stage: null,
      trash: [],
      activeDon: [],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
      activateDonAtEndOfTurn: 0,
    });
  }
  return state;
}

describe("ST31 vs ST34 matchup policy", () => {
  it("preserves an exact-cost Luffy play", async () => {
    const state = matchupState();
    state.players.p1.hand = [card("luffy", "ST31-004")];
    state.players.p1.activeDon = Array.from(
      { length: 7 },
      (_, index) => `don-${index}`,
    );

    const action = await new St31RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "luffy",
    });
  });

  it("attacks Leader for lethal before a rested Character", async () => {
    const state = matchupState();
    state.players.p1.board = [character("attacker", "OP11-003")];
    state.players.p2.life = [];
    state.players.p2.board = [character("pudding", "EB03-035", true)];

    const action = await new St31RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "p2-leader",
    });
  });

  it("pressures Leader instead of enabling Character Katakuri", async () => {
    const state = matchupState();
    state.players.p1.board = [character("attacker", "OP11-003")];
    state.players.p2.board = [character("katakuri", "ST34-001", true)];

    const action = await new St31RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "p2-leader",
    });
  });

  it("uses an economical Counter to preserve Sanji", async () => {
    const state = matchupState();
    state.phase = "counter";
    state.players.p1.life = [
      card("life-a", "ST31-003"),
      card("life-b", "ST31-003"),
      card("life-c", "ST31-003"),
    ];
    state.players.p1.hand = [card("counter", "ST31-003")];
    state.players.p1.board = [character("sanji", "ST31-001", true)];
    state.players.p2.leaderRested = true;
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "sanji",
      attackPower: 3000,
      counterPower: 0,
    });

    const action = await new St31RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "counter",
      cardInstanceId: "counter",
    });
  });
});
