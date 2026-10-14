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

const character = (
  instanceId: string,
  cardNumber: string,
  options: {
    rested?: boolean;
    playedTurn?: number;
    attachedDon?: string[];
  } = {},
) => ({
  instanceId,
  cardNumber,
  rested: options.rested ?? false,
  playedTurn: options.playedTurn ?? 1,
  attachedDon: options.attachedDon ?? [],
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
    gameId: "st31-st33-policy",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Blue) Kuzan - Starter Deck 33"),
    seed: "st31-st33-policy-seed",
  });
  for (const playerId of ["p1", "p2"] as const) {
    expect(state.activePlayer).toBe(playerId);
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

describe("ST31 vs ST33 matchup policy", () => {
  it("preserves an exact-cost Luffy play instead of attaching Leader DON", async () => {
    const state = matchupState();
    state.players.p1.hand = [card("luffy", "ST31-004")];
    state.players.p1.activeDon = Array.from(
      { length: 7 },
      (_, index) => `active-${index}`,
    );
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "luffy",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("exact-cost");
  });

  it("attacks Leader for lethal before a rested ST33 Character", async () => {
    const state = matchupState();
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.board = [character("luffy", "ST31-004")];
    state.players.p2.life = [];
    state.players.p2.board = [character("garp", "ST33-005", { rested: true })];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "p2-leader",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("lethal");
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
    state.players.p1.board = [character("sanji", "ST31-001", { rested: true })];
    state.players.p2.leaderRested = true;
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "sanji",
      attackPower: 3_000,
      counterPower: 0,
    });
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "counter",
      cardInstanceId: "counter",
    });
  });

  it("opens the Leader's gift for an attacker above the 7000 threshold", async () => {
    const state = matchupState();
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.restedDon = ["rested-a", "rested-b"];
    state.players.p1.board = [character("jinbe", "ST31-002")];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      optionId: "mechanic-main:p1-leader",
    });
    // The amount is not this decision's to make any more: the clause gives
    // what the rested pile holds, up to two. Only the recipient is still open.
    expect(agent.lastDecision?.reasons.join(" ")).toContain("every rested DON");
  });
});
