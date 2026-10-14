import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  createOnKoResult,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import { cardFacts, requireKnownCard } from "@one-piece-sim/cards";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

const input = {
  gameId: "st21-015-test",
  p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
  p2: resolveDeck("FIXTURE-BLUE"),
  seed: "st21-015-seed",
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

/** Resolves the On K.O. program's pending choice, if any, for a K.O.'d Zoro. */
function onKoChoices(state: GameState, zoroInstanceId: string): GameState {
  const koResult = createOnKoResult(
    state,
    "p1",
    { instanceId: zoroInstanceId, cardNumber: "ST21-015" },
    "p1",
  );
  state.pendingEffect = koResult.pending;
  return state;
}

describe("ST21-015 Roronoa Zoro", () => {
  it("registers as a Red Straw Hat Crew body with its clauses", () => {
    const zoro = requireKnownCard("ST21-015");

    expect(zoro.types).toContain("Straw Hat Crew");
    expect(zoro.colors).toContain("Red");
    expect(zoro.attribute).toBe("Slash");
    expect(zoro.rules.clauses).toContain("[On K.O.]");
    expect(cardFacts("ST21-015").cost).toBe(4);
    expect(cardFacts("ST21-015").power).toBe(5000);
    expect(cardFacts("ST21-015").counter).toBe(1000);
    // "[printed text omitted -- pnpm card:text ST21-015]" is a granted keyword, not a
    // printed one, so it is the engine's conditional layer that answers for it
    // -- see the next test. `cardFacts` reporting it would hand it over for
    // free at zero attached DON!!.
    expect(cardFacts("ST21-015").keywords).not.toContain("Rush");
    // The [DON!! x2] gate is derived for allocation.
    expect(cardFacts("ST21-015").donRequirement).toBe(2);
  });

  it("gains Rush only with two attached DON!!", () => {
    const state = scenario();
    state.players.p1.board = [
      character("zoro", "ST21-015", { attachedDon: ["d1", "d2"] }),
    ];

    expect(hasKeyword(state, "p1", "zoro", "Rush")).toBe(true);
    state.players.p1.board[0]!.attachedDon = ["d1"];
    expect(hasKeyword(state, "p1", "zoro", "Rush")).toBe(false);
    state.players.p1.board[0]!.attachedDon = [];
    expect(hasKeyword(state, "p1", "zoro", "Rush")).toBe(false);
  });

  it("plays up to 1 qualifying red Character from hand on K.O.", () => {
    let state = scenario();
    state.players.p1.board = [character("zoro", "ST21-015")];
    // OP11-003 Usopp: red, Straw Hat Crew, printed 6000 power.
    state.players.p1.hand = [card("usopp", "OP11-003")];

    state = onKoChoices(state, "zoro");
    expect(state.pendingEffect).not.toBeNull();
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "usopp",
      ),
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.board.map((entry) => entry.cardNumber)).toEqual([
      "ST21-015",
      "OP11-003",
    ]);
    expect(state.players.p1.hand).not.toContainEqual(card("usopp", "OP11-003"));
  });

  it("does not offer [Roronoa Zoro] as an On K.O. target", () => {
    let state = scenario();
    state.players.p1.board = [character("zoro", "ST21-015")];
    // OP01-025 Roronoa Zoro is red, Straw Hat Crew, 5000 power -- excluded by
    // the printed "other than [Roronoa Zoro]".
    state.players.p1.hand = [card("other-zoro", "OP01-025")];

    state = onKoChoices(state, "zoro");
    // With no eligible target the On K.O. resolves to nothing instead of
    // offering a "done" decision: the excluded Zoro is neither offered nor
    // played.
    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.hand).toContainEqual(
      card("other-zoro", "OP01-025"),
    );
    expect(state.players.p1.board).toHaveLength(1);
  });

  it("filters On K.O. targets by color and printed power", () => {
    let state = scenario();
    state.players.p1.board = [character("zoro", "ST21-015")];
    // ST31-004 Luffy is red but 9000 power; FIX-001 has no red color. Neither
    // satisfies "[printed text omitted -- pnpm card:text ST31-004]".
    state.players.p1.hand = [
      card("big-luffy", "ST31-004"),
      card("fixture", "FIX-001"),
      card("usopp", "OP11-003"),
    ];

    state = onKoChoices(state, "zoro");
    const options = getLegalActions(state, "p1")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(options).toContain("usopp");
    expect(options).not.toContain("big-luffy");
    expect(options).not.toContain("fixture");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "usopp",
      ),
    );

    expect(state.players.p1.board.map((entry) => entry.cardNumber)).toEqual([
      "ST21-015",
      "OP11-003",
    ]);
  });

  it("declining the On K.O. play resolves to nothing", () => {
    let state = scenario();
    state.players.p1.board = [character("zoro", "ST21-015")];
    state.players.p1.hand = [card("usopp", "OP11-003")];

    state = onKoChoices(state, "zoro");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "done",
      ),
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.board).toHaveLength(1);
    expect(state.players.p1.hand).toContainEqual(card("usopp", "OP11-003"));
  });

  it("resolves to nothing with no qualifying Character in hand", () => {
    let state = scenario();
    state.players.p1.board = [character("zoro", "ST21-015")];
    state.players.p1.hand = [card("other-zoro", "OP01-025")];

    state = onKoChoices(state, "zoro");
    expect(state.pendingEffect).toBeNull();
    expect(
      getLegalActions(state, "p1").filter(
        (action) => action.type === "resolve-effect",
      ),
    ).toEqual([]);
    expect(state.players.p1.hand).toContainEqual(
      card("other-zoro", "OP01-025"),
    );
  });
});
