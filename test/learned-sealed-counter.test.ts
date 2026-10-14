import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  type GameState,
} from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

const input = {
  gameId: "learned-counter-test",
  p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
  p2: resolveDeck("FIXTURE-BLUE"),
  seed: "learned-counter-seed",
};

function submit(
  state: GameState,
  action: ReturnType<typeof getLegalActions>[number],
): GameState {
  return applyAction(state, {
    ...action,
    revision: state.revision,
  }).state;
}

function requireAction(
  state: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
): ReturnType<typeof getLegalActions>[number] {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  if (!action) {
    throw new Error(
      `Missing expected legal action: ${getLegalActions(
        state,
        state.activePlayer,
      )
        .map((candidate) => candidate.summary)
        .join(" | ")}`,
    );
  }
  return action;
}

function scenario(): GameState {
  const state = createGame(input);
  state.turn = 3;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  state.pendingEffect = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  Object.assign(p1, {
    hand: [],
    deck: [],
    board: [],
    stage: null,
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p1-active-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderPowerModifiers: [],
    leaderRested: false,
  });
  Object.assign(p2, {
    hand: [],
    deck: [],
    board: [],
    stage: null,
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p2-active-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderPowerModifiers: [],
    leaderRested: false,
  });
  return state;
}

function character(
  instanceId: string,
  cardNumber: string,
  input: { rested?: boolean; playedTurn?: number; attachedDon?: string[] } = {},
) {
  return {
    instanceId,
    cardNumber,
    rested: input.rested ?? false,
    playedTurn: input.playedTurn ?? 1,
    attachedDon: input.attachedDon ?? [],
    powerModifiers: [],
  };
}

describe("counter phase over-counter guard", () => {
  it("stops offering ordinary Counter cards once the defense already exceeds the attack", () => {
    const state = scenario();
    // p1 attacks p2's Leader with a 6000-power attacker (OP17-002 Atmos).
    // p2's Leader (FIX-LEADER-B) is 5000, so the shortfall is
    // 6000 - 5000 + 1 = 1001.
    state.players.p1.board = [character("attacker", "OP17-002")]; // 6000 power
    state.players.p2.hand = [
      { instanceId: "c1", cardNumber: "OP17-072" }, // counter 1000
      { instanceId: "c2", cardNumber: "OP17-072" }, // counter 1000
      { instanceId: "c3", cardNumber: "OP17-024" }, // counter 1000
      { instanceId: "c4", cardNumber: "OP17-021" }, // counter 2000
    ];

    let after = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "attacker" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    // p1 passes block (no blockers), then p2 is in the counter phase.
    after = submit(
      after,
      requireAction(after, (action) => action.type === "pass"),
    );
    expect(after.phase).toBe("counter");
    expect(after.activePlayer).toBe("p2");

    // Before any counter, all four cards are offered.
    let legal = getLegalActions(after, "p2");
    expect(legal.filter((action) => action.type === "counter")).toHaveLength(4);

    // Spend the single 2000-counter card (c4): 5000 + 2000 = 7000 > 6000, so
    // the defense now exceeds the attack and the shortfall is 0.
    after = submit(
      after,
      requireAction(
        after,
        (action) => action.type === "counter" && action.cardInstanceId === "c4",
      ),
    );
    expect(after.phase).toBe("counter");

    // The engine must no longer offer the remaining ordinary Counter cards --
    // they would add nothing. Only pass-counter (and any Counter Events) remain.
    legal = getLegalActions(after, "p2");
    expect(legal.filter((action) => action.type === "counter")).toHaveLength(0);
    expect(
      legal.some(
        (action) =>
          action.type === "pass" && action.actionId.endsWith(":pass-counter"),
      ),
    ).toBe(true);
  });

  it("keeps only the Counter Events that do something besides add power", () => {
    const state = scenario();
    // The same 6000 attack into a 5000 Leader, but p2 holds two Counter
    // Events and a 2000-Counter card to get past the threshold with.
    state.players.p1.board = [character("attacker", "OP17-002")];
    state.players.p2.hand = [
      { instanceId: "c1", cardNumber: "OP17-021" }, // counter 2000
      // OP17-078: +4000 with no `target` filter, so it reaches this Leader
      // regardless of who it is -- unlike OP17-036, which only matters
      // behind a Shanks Leader and would otherwise never be offered at all.
      { instanceId: "power-only", cardNumber: "OP17-078" },
      { instanceId: "and-a-debuff", cardNumber: "OP17-017" },
    ];

    let after = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "attacker" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    after = submit(
      after,
      requireAction(after, (action) => action.type === "pass"),
    );

    // While the attack still lands, both Events are on offer.
    const contested = getLegalActions(after, "p2").filter(
      (action) => action.type === "activate-counter-event",
    );
    expect(contested.map((action) => action.eventInstanceId).sort()).toEqual([
      "and-a-debuff",
      "power-only",
    ]);

    after = submit(
      after,
      requireAction(
        after,
        (action) => action.type === "counter" && action.cardInstanceId === "c1",
      ),
    );

    // Past the threshold, OP17-036 would only raise a defense that already
    // holds. OP17-017 also gives the attacker -2000 power for the turn, which
    // outlives this battle, so it stays.
    const settled = getLegalActions(after, "p2").filter(
      (action) => action.type === "activate-counter-event",
    );
    expect(settled.map((action) => action.eventInstanceId)).toEqual([
      "and-a-debuff",
    ]);
  });
});
