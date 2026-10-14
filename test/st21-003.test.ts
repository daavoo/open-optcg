import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  type GameState,
} from "@one-piece-sim/engine-core";
import { cardFacts, requireKnownCard } from "@one-piece-sim/cards";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

const input = {
  gameId: "st21-003-test",
  p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
  p2: resolveDeck("FIXTURE-BLUE"),
  seed: "st21-003-seed",
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

const card = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
});

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

describe("ST21-003 Sanji", () => {
  it("registers as an implemented Straw Hat Crew body with its On Play", () => {
    const sanji = requireKnownCard("ST21-003");

    expect(sanji.types).toContain("Straw Hat Crew");
    expect(sanji.rules.clauses).toContain("[On Play]");
    expect(cardFacts("ST21-003").cost).toBe(2);
    expect(cardFacts("ST21-003").power).toBe(3000);
    expect(cardFacts("ST21-003").counter).toBe(2000);
  });

  it("grants Unblockable to a 6000-power Straw Hat Crew Character on play", () => {
    let state = scenario();
    state.players.p1.hand = [card("sanji", "ST21-003")];
    state.players.p1.board = [
      character("jinbe", "ST31-002"),
      character("brook", "ST31-003"),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );
    // On Play offers the qualifying 6000-power Jinbe (and "done" to decline).
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "jinbe",
      ),
    );

    const jinbe = state.players.p1.board.find(
      (entry) => entry.instanceId === "jinbe",
    );
    const brook = state.players.p1.board.find(
      (entry) => entry.instanceId === "brook",
    );
    expect(jinbe?.unblockableUntilTurn).toBe(3);
    expect(brook?.unblockableUntilTurn).toBeUndefined();
    expect(state.pendingEffect).toBeNull();
  });

  it("counts attached DON!! toward the 6000 power floor", () => {
    let state = scenario();
    state.players.p1.hand = [card("sanji", "ST21-003")];
    // Brook is 3000 base; three attached DON!! lift it to 9000, clearing the
    // floor. Sanji shares the type but stays at 3000 -- a bare Brook would
    // inherit +3000 from its own given-DON layer once the carrier's DON!!
    // count the field, so the second seat is a different body.
    state.players.p1.board = [
      character("carrier", "ST31-003", {
        attachedDon: ["don-a", "don-b", "don-c"],
      }),
      character("bare", "ST31-001"),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );
    const offered = getLegalActions(state, "p1")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(offered).toContain("carrier");
    expect(offered).not.toContain("bare");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "carrier",
      ),
    );

    expect(
      state.players.p1.board.find((entry) => entry.instanceId === "carrier")
        ?.unblockableUntilTurn,
    ).toBe(3);
    expect(
      state.players.p1.board.find((entry) => entry.instanceId === "bare")
        ?.unblockableUntilTurn,
    ).toBeUndefined();
  });

  it("declining the selection grants no Unblockable", () => {
    let state = scenario();
    state.players.p1.hand = [card("sanji", "ST21-003")];
    state.players.p1.board = [character("jinbe", "ST31-002")];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );
    const options = getLegalActions(state, "p1")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(options).toContain("done");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "done",
      ),
    );

    expect(
      state.players.p1.board.find((entry) => entry.instanceId === "jinbe")
        ?.unblockableUntilTurn,
    ).toBeUndefined();
    expect(state.pendingEffect).toBeNull();
  });

  it("resolves to nothing with no eligible target", () => {
    let state = scenario();
    state.players.p1.hand = [card("sanji", "ST21-003")];
    state.players.p1.board = [character("brook", "ST31-003")];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );

    // No 6000-power Straw Hat Crew on board: an empty selection resolves to
    // nothing rather than forcing a pointless "done" decision, and nothing is
    // granted.
    expect(state.pendingEffect).toBeNull();
    expect(
      getLegalActions(state, "p1").filter(
        (action) => action.type === "resolve-effect",
      ),
    ).toEqual([]);
    expect(
      state.players.p1.board.find((entry) => entry.instanceId === "brook")
        ?.unblockableUntilTurn,
    ).toBeUndefined();
  });

  it("silences the opponent's Blockers when the chosen Character attacks", () => {
    let state = scenario();
    state.players.p1.hand = [card("sanji", "ST21-003")];
    state.players.p1.board = [character("jinbe", "ST31-002")];
    state.players.p2.board = [character("brook", "ST31-003")];
    state.players.p2.leaderAttachedDon = ["a", "b", "c"];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "jinbe",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "jinbe",
      ),
    );

    // Brook is a Blocker on the opponent's field, but the attack is
    // unblockable: the only offered action is to pass.
    expect(getLegalActions(state, "p2")).toHaveLength(1);
    expect(getLegalActions(state, "p2")[0]?.type).toBe("pass");
  });

  it("leaves Blockers live when the attack comes from an unchosen Character", () => {
    let state = scenario();
    state.players.p1.hand = [card("sanji", "ST21-003")];
    state.players.p1.board = [
      character("jinbe", "ST31-002"),
      character("attacker", "OP11-003"),
    ];
    state.players.p2.board = [character("brook", "ST31-003")];
    state.players.p2.leaderAttachedDon = ["a", "b", "c"];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "jinbe",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "attacker",
      ),
    );

    const blocks = getLegalActions(state, "p2").filter(
      (action) => action.type === "block",
    );
    expect(blocks.map((action) => action.blockerInstanceId)).toContain("brook");
  });
});
