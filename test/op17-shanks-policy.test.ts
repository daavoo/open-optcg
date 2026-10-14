import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

/**
 * OP-17 Green Shanks' deck policy.
 *
 * Each test pins one judgement the deck had no policy for at all: every
 * decision fell through to `chooseGenericRules`, which fires the first
 * `activate-main` it is offered whatever that activation costs.
 *
 * The opponent is ST34 so no matchup module can intercept, and because a
 * Character's card number on the opposing board is independent of that deck's
 * list -- the engine resolves printed text globally.
 */

const SHANKS_LEADER = "OP17-020";

const card = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
});

const character = (
  instanceId: string,
  cardNumber: string,
  options: { rested?: boolean; playedTurn?: number } = {},
) => ({
  instanceId,
  cardNumber,
  rested: options.rested ?? false,
  playedTurn: options.playedTurn ?? 1,
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

/** Turn 6, Shanks to act, both boards cleared and ready to be posed. */
function shanksState(): GameState {
  let state = createGame({
    gameId: "op17-shanks-policy",
    p1: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
    p2: resolveDeck("(Green) Shanks - Official Feature Deck"),
    seed: "op17-shanks-policy-seed",
  });
  for (let seat = 0; seat < 2; seat += 1) {
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "mulligan-decision" && action.decision === "keep",
      ),
    );
  }
  state.turn = 6;
  state.phase = "main";
  setTurnPlayer(state, "p2");
  state.pendingEffect = null;
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

const don = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

const shanksAgent = () => new RegistryRulesAgent(SHANKS_LEADER);

describe("OP17 Shanks deck policy", () => {
  it("does not pay the Leader's cost with nothing rested to freeze", async () => {
    // The freeze target is `up to 1`, so the engine offers the activation
    // against an all-active board and the cost -- a card out of hand -- is paid
    // before the empty target choice. The generic policy fired it on turn 2 of
    // a real game and trashed the deck's 10-cost finisher for nothing.
    const state = shanksState();
    state.players.p2.hand = [card("finisher", "OP17-022")];
    state.players.p2.activeDon = don("p2-don", 2);
    state.players.p1.board = [character("active", "ST34-002")];
    const agent = shanksAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action.type).not.toBe("activate-main");
  });

  it("freezes a rested Character worth denying", async () => {
    // The hand card costs more than the DON!! on the field, so no play is on
    // offer and the activation is the decision actually under test.
    const state = shanksState();
    state.players.p2.hand = [card("finisher", "OP17-022")];
    state.players.p2.activeDon = don("p2-don", 2);
    state.players.p1.board = [
      character("rested", "ST34-002", { rested: true }),
    ];
    const agent = shanksAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: SHANKS_LEADER,
    });
  });

  it("does not rest four of its own cards for the Event's Main clause", async () => {
    // OP17-038's printed [Main] cost is "rest 4 of your cards", Leader included.
    // In a traced game the generic policy rested its whole board plus the
    // Leader to rest one opposing Character. The card is kept for its [Counter].
    const state = shanksState();
    state.players.p2.hand = [card("event", "OP17-038")];
    state.players.p2.activeDon = don("p2-don", 4);
    state.players.p2.board = [
      character("a", "OP17-032"),
      character("b", "OP17-026"),
      character("c", "OP17-021"),
    ];
    state.players.p1.board = [character("active", "ST34-002")];
    const agent = shanksAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).not.toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP17-038",
    });
  });

  it("holds the 9-cost K.O. while every opposing Character is active", async () => {
    // ST16-004 only shoots a *rested* Character, so into an all-active board
    // its [On Play] is offered no target at all.
    const state = shanksState();
    state.players.p2.hand = [card("ko", "ST16-004"), card("body", "OP17-031")];
    state.players.p2.activeDon = don("p2-don", 9);
    state.players.p1.board = [character("active", "ST34-002")];
    const agent = shanksAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "body",
    });
  });

  it("plays the 9-cost K.O. once something is rested for it to shoot", async () => {
    const state = shanksState();
    state.players.p2.hand = [card("ko", "ST16-004"), card("body", "OP17-031")];
    state.players.p2.activeDon = don("p2-don", 9);
    state.players.p1.board = [
      character("rested", "ST34-002", { rested: true }),
    ];
    const agent = shanksAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "ko",
    });
  });

  it("does not play a second Crone Oli while one is on the field", async () => {
    // The replacement is gated on a copy being on the field and is not
    // [Once Per Turn], so the first copy already taxes every removal. The
    // second is a 0-power body bought with a 2000 Counter.
    const state = shanksState();
    state.players.p2.hand = [card("oli", "OP17-021")];
    state.players.p2.activeDon = don("p2-don", 1);
    state.players.p2.board = [
      character("first-oli", "OP17-021"),
      character("yasopp", "OP17-031"),
    ];
    state.players.p1.board = [character("active", "ST34-002")];
    const agent = shanksAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).not.toMatchObject({
      type: "play-card",
      cardInstanceId: "oli",
    });
  });
});
