import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  currentPower,
  getLegalActions,
  type BoardCard,
  type GameState,
} from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

/**
 * Covers the limits that `analysis/op15-nami-2026-08-08.md` and
 * `analysis/op16-enel-2026-08-08.md` recorded as unfixed, one test each, so a
 * regression reintroduces a named defect rather than an anonymous failure.
 */

const character = (
  instanceId: string,
  cardNumber: string,
  overrides: Partial<BoardCard> = {},
): BoardCard => ({
  instanceId,
  cardNumber,
  rested: false,
  playedTurn: 1,
  attachedDon: [],
  powerModifiers: [],
  ...overrides,
});

function submit(
  state: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
): GameState {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  expect(action, "no matching legal action").toBeDefined();
  return applyAction(state, { ...action!, revision: state.revision }).state;
}

function board(p1Deck: string, p2Deck: string): GameState {
  const state = createGame({
    gameId: "limits",
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed: "limits-seed",
  });
  state.phase = "main";
  state.turn = 6;
  setTurnPlayer(state, "p1");
  for (const playerId of ["p1", "p2"] as const) {
    Object.assign(state.players[playerId], {
      hand: [],
      board: [],
      stage: null,
      activeDon: [],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
    });
  }
  state.players.p1.life = state.players.p1.deck.splice(0, 4);
  state.players.p2.life = state.players.p2.deck.splice(0, 4);
  return state;
}

describe("[When Attacking] programs", () => {
  it("gives Ohm's target -1000 power under the DON!! ceiling", () => {
    let state = board(
      "(Purple) Enel - Official Feature Deck",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    state.players.p1.board = [character("ohm", "OP15-061")];
    state.players.p1.activeDon = ["d1"];
    state.players.p2.board = [character("brook", "ST31-003")];
    const before = currentPower(state, "p2", "brook");

    state = submit(
      state,
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "ohm",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "card" &&
        action.option.card.instanceId === "brook",
    );

    expect(currentPower(state, "p2", "brook")).toBe(before - 1_000);
  });

  it("does nothing above the ceiling", () => {
    let state = board(
      "(Purple) Enel - Official Feature Deck",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    state.players.p1.board = [character("ohm", "OP15-061")];
    state.players.p1.activeDon = Array.from(
      { length: 8 },
      (_, index) => `d${index}`,
    );
    state.players.p2.board = [character("brook", "ST31-003")];

    state = submit(
      state,
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "ohm",
    );

    // No choice is offered; the defender goes straight to the Block window.
    expect(
      getLegalActions(state, state.activePlayer).some(
        (action) => action.type === "resolve-effect",
      ),
    ).toBe(false);
  });

  it("does not prompt for an optional target when the opponent has no Characters", () => {
    let state = board(
      "(Purple) Enel - Official Feature Deck",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    state.players.p1.board = [character("ohm", "OP15-061")];
    state.players.p1.activeDon = ["d1"];

    state = submit(
      state,
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "ohm",
    );

    expect(
      getLegalActions(state, state.activePlayer).some(
        (action) => action.type === "resolve-effect",
      ),
    ).toBe(false);
  });
});

describe("[Activate: Main] programs", () => {
  it("lets P-096 Girl give a rested DON!! to a [Nami] Character", () => {
    let state = board(
      "(Blue/Yellow) Nami - Official Feature Deck",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    state.players.p1.board = [
      character("girl", "P-096"),
      character("nami", "EB03-053"),
    ];
    state.players.p1.restedDon = ["r1"];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" && action.sourceInstanceId === "girl",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "card" &&
        action.option.card.instanceId === "nami",
    );

    expect(
      state.players.p1.board.find((card) => card.instanceId === "nami")
        ?.attachedDon,
    ).toHaveLength(1);
    // Once per turn.
    expect(
      getLegalActions(state, "p1").some(
        (action) =>
          action.type === "activate-main" && action.sourceInstanceId === "girl",
      ),
    ).toBe(false);
  });

  it("names the source on every Main activation, Leader ones included", () => {
    const state = board(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    );
    state.players.p1.board = [character("brook", "ST31-003")];
    state.players.p1.restedDon = ["r1", "r2"];
    state.players.p1.leaderAttachedDon = ["l1"];

    const activations = getLegalActions(state, "p1").filter(
      (action) => action.type === "activate-main",
    );
    expect(activations.length).toBeGreaterThan(0);
    for (const action of activations) {
      // The whole point: no policy should ever need to parse `optionId`.
      expect(action.sourceCardNumber).toBeTruthy();
      expect(action.sourceInstanceId).toBeTruthy();
    }
  });
});

describe("a Trigger is only offered when it can act", () => {
  it("withholds Rayleigh's Trigger above three opposing Life", () => {
    const state = board(
      "(Blue/Yellow) Nami - Official Feature Deck",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    state.players.p2.board = [character("brook", "ST31-003")];
    state.players.p1.life = state.players.p1.deck.splice(0, 1);
    state.players.p1.life[0] = {
      instanceId: "ray-life",
      cardNumber: "OP14-108",
    };
    setTurnPlayer(state, "p2");
    state.players.p2.activeDon = ["d1", "d2"];
    // p2 has four Life, so Rayleigh's "opponent has 3 or less Life" fails.
    expect(state.players.p2.life).toHaveLength(4);

    const attacked = submit(
      state,
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p1-leader",
    );
    let resolved = submit(attacked, (action) => action.type === "pass");
    resolved = submit(resolved, (action) => action.type === "pass");

    const triggers = getLegalActions(resolved, resolved.activePlayer).filter(
      (action) => action.type === "resolve-trigger",
    );
    // Only "take it into hand" -- no dud activation to decline.
    expect(triggers.every((action) => action.optionId === "skip")).toBe(true);
  });
});

describe("removal immunity covers every way off the field", () => {
  const immuneBoard = (): GameState => {
    const state = board(
      "(Purple) Enel - Official Feature Deck",
      "(Blue) Kuzan - Starter Deck 33",
    );
    state.players.p1.activeDon = ["e1"];
    state.players.p1.board = [
      character("enel", "OP15-118"),
      character("ohm", "OP15-061"),
    ];
    return state;
  };

  it("keeps the 6-cost Enel out of a deck-bottom effect's targets", () => {
    const state = immuneBoard();
    state.pendingEffect = {
      kind: "bottom-deck-character",
      playerId: "p2",
      targetPlayerId: "p1",
      sourceCardNumber: "EB04-026",
      sourceInstanceId: "src",
      eligibleInstanceIds: ["enel", "ohm"],
      remaining: 1,
    };
    setTurnPlayer(state, "p2");

    const options = getLegalActions(state, "p2").filter(
      (action) => action.type === "resolve-effect",
    );
    expect(options.some((action) => action.optionId === "ohm")).toBe(true);
    expect(options.some((action) => action.optionId === "enel")).toBe(false);
  });

  it("keeps it out of a move-to-Life effect's targets", () => {
    const state = immuneBoard();
    state.pendingEffect = {
      kind: "move-character-to-life",
      playerId: "p2",
      targetPlayerId: "p1",
      sourceCardNumber: "P-085",
      sourceInstanceId: "src",
      eligibleInstanceIds: ["enel", "ohm"],
    };
    setTurnPlayer(state, "p2");

    const options = getLegalActions(state, "p2").filter(
      (action) => action.type === "resolve-effect",
    );
    expect(options.some((action) => action.optionId.endsWith(":ohm"))).toBe(
      true,
    );
    expect(options.some((action) => action.optionId.endsWith(":enel"))).toBe(
      false,
    );
  });
});

describe("Counter Events respect their own target restriction", () => {
  const attackedBy = (blocker?: BoardCard): GameState => {
    const state = board(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Purple) Enel - Official Feature Deck",
    );
    setTurnPlayer(state, "p1");
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p2.activeDon = ["e1"];
    state.players.p2.hand = [{ instanceId: "thor", cardNumber: "OP15-075" }];
    if (blocker) state.players.p2.board = [blocker];
    return state;
  };

  it("adds El Thor's power when the battle target is an [Enel] card", () => {
    let state = attackedBy();
    state = submit(
      state,
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p2-leader",
    );
    state = submit(state, (action) => action.type === "pass");
    state = submit(state, (action) => action.type === "activate-counter-event");

    expect(state.activeAttack?.counterPower).toBe(2_000);
  });

  it("is not offered when the battle target is not an [Enel] card", () => {
    // Blocking with Vinsmoke Reiju puts the battle on a card El Thor cannot
    // name, so the Event is never offered instead of buffing it anyway.
    let state = attackedBy(character("reiju", "OP12-063"));
    state = submit(
      state,
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p2-leader",
    );
    state = submit(
      state,
      (action) =>
        action.type === "block" && action.blockerInstanceId === "reiju",
    );

    expect(
      getLegalActions(state, state.activePlayer).find(
        (action) => action.type === "activate-counter-event",
      ),
    ).toBeUndefined();
  });
});

describe("Divine Departure has a [Main] half", () => {
  it("rests five DON!! and strips 8000 power once DON!! has been given", () => {
    let state = board(
      "(Purple) Enel - Official Feature Deck",
      "(Blue) Kuzan - Starter Deck 33",
    );
    state.players.p1.activeDon = ["a", "b", "c", "d", "e"];
    state.players.p1.board = [
      character("ohm", "OP15-061", { attachedDon: ["given"] }),
    ];
    state.players.p1.hand = [
      { instanceId: "departure", cardNumber: "OP13-076" },
    ];
    state.players.p2.board = [character("borsalino", "OP12-050")];
    const before = currentPower(state, "p2", "borsalino");

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === "departure",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "card" &&
        action.option.card.instanceId === "borsalino",
    );

    expect(state.players.p1.activeDon).toHaveLength(0);
    expect(state.players.p1.restedDon).toHaveLength(5);
    expect(currentPower(state, "p2", "borsalino")).toBe(before - 8_000);
  });

  it("is not offered without five active DON!!", () => {
    const state = board(
      "(Purple) Enel - Official Feature Deck",
      "(Blue) Kuzan - Starter Deck 33",
    );
    state.players.p1.activeDon = ["a", "b", "c", "d"];
    state.players.p1.hand = [
      { instanceId: "departure", cardNumber: "OP13-076" },
    ];

    expect(
      getLegalActions(state, "p1").some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "departure",
      ),
    ).toBe(false);
  });
});

describe("a program can name its own card", () => {
  it("plays Belo Betty off her own Trigger under the right Leader", () => {
    // {Revolutionary Army} Leader and five or less Life between both players.
    const state = board(
      "(Red/Black) Sabo - Starter Deck 35",
      "(Red) Monkey.D.Luffy - Starter Deck 31",
    );
    state.players.p1.life = state.players.p1.deck.splice(0, 2);
    state.players.p2.life = state.players.p2.deck.splice(0, 2);
    state.players.p1.life[0] = {
      instanceId: "betty-life",
      cardNumber: "OP09-112",
    };
    setTurnPlayer(state, "p2");
    state.players.p2.activeDon = ["d1", "d2"];

    const attacked = submit(
      state,
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p1-leader",
    );
    let resolved = submit(attacked, (action) => action.type === "pass");
    resolved = submit(resolved, (action) => action.type === "pass");

    const activation = getLegalActions(resolved, resolved.activePlayer).find(
      (action) =>
        action.type === "resolve-trigger" && action.optionId !== "skip",
    );
    expect(activation, "Belo Betty's Trigger should be offered").toBeDefined();
    const played = applyAction(resolved, {
      ...activation!,
      revision: resolved.revision,
    }).state;

    // She is on the board, and not also duplicated into the trash.
    expect(
      played.players.p1.board.some((card) => card.cardNumber === "OP09-112"),
    ).toBe(true);
    expect(
      played.players.p1.trash.filter((card) => card.cardNumber === "OP09-112"),
    ).toHaveLength(0);
  });
});
