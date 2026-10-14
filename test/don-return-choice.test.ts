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
 * `DON!! −N` reads "[printed text omitted -- pnpm card:text <card>]", and which cards those are is the controller's
 * call. The engine still takes the cheapest DON!! the moment the cost is paid --
 * every "[printed text omitted -- pnpm card:text <card>]" check in the Enel list depends on
 * the total being right immediately -- and then hands back the choice of where
 * they came from before anyone can act again.
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

/** A purple board on turn 6 with nothing on it but what each test puts there. */
function scenario(): GameState {
  const state = createGame({
    gameId: "don-return-choice",
    p1: resolveDeck("(Purple) Enel - Official Feature Deck"),
    p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    seed: "don-return-choice",
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
  state.players.p2.board = [character("p2-target", "ST31-002")];
  return state;
}

/** OP05-077 Gamma Knife: cost 2, then `DON!! −1` to give −5000 power. */
function gammaKnife(state: GameState): GameState {
  state.players.p1.hand = [{ instanceId: "gamma", cardNumber: "OP05-077" }];
  return submit(
    state,
    (action) =>
      action.type === "activate-main" && action.sourceCardNumber === "OP05-077",
  );
}

const pools = (state: GameState) => ({
  active: state.players.p1.activeDon.length,
  rested: state.players.p1.restedDon.length,
  deck: state.players.p1.donDeck.length,
});

describe("DON!! −N asks which DON!! goes back", () => {
  it("offers each pool that could supply one, cheapest first", () => {
    const state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3"];
    state.players.p1.donDeck = ["d4", "d5", "d6"];
    const played = gammaKnife(state);

    // Two DON!! paid the cost and the DON!! −1 took a third off the field, so
    // the totals are already settled: 1 active, 1 rested, 4 in the DON!! deck.
    expect(pools(played)).toEqual({ active: 1, rested: 1, deck: 4 });
    expect(played.pendingEffect?.kind).toBe("return-don");
    expect(played.activePlayer).toBe("p1");
    expect(
      getLegalActions(played, "p1").map((action) =>
        action.type === "resolve-effect" && action.option.kind === "don-return"
          ? action.option.pool
          : action.type,
      ),
    ).toEqual(["rested", "active"]);
  });

  it("moves the returned DON!! when a different pool is named", () => {
    const state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3"];
    state.players.p1.donDeck = ["d4", "d5", "d6"];
    const placed = submit(
      gammaKnife(state),
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "return-don:active",
    );

    // The active DON!! went back instead, leaving both cost DON!! rested --
    // what a pilot saving rested DON!! for the Leader's gift actually wants.
    expect(pools(placed)).toEqual({ active: 0, rested: 2, deck: 4 });
  });

  it("keeps the automatic pick when that pool is the one named", () => {
    const state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3"];
    state.players.p1.donDeck = ["d4", "d5", "d6"];
    const placed = submit(
      gammaKnife(state),
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "return-don:rested",
    );

    expect(pools(placed)).toEqual({ active: 1, rested: 1, deck: 4 });
  });

  it("hands back the decision the cost interrupted", () => {
    const state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3"];
    state.players.p1.donDeck = ["d4", "d5", "d6"];
    const placed = submit(
      gammaKnife(state),
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "return-don:rested",
    );

    // Gamma Knife still has to pick whose Character loses 5000 power. Parking
    // that decision while the DON!! is placed must not drop it.
    expect(placed.pendingEffect?.sourceCardNumber).toBe("OP05-077");
    expect(placed.phase).toBe("main");
    expect(
      getLegalActions(placed, "p1").some(
        (action) =>
          action.type === "resolve-effect" &&
          action.option.kind === "card" &&
          action.option.card.instanceId === "p2-target",
      ),
    ).toBe(true);
  });

  it("offers DON!! given to a Character, at the cost of its power", () => {
    const state = scenario();
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.restedDon = ["d3"];
    state.players.p1.donDeck = ["d4"];
    state.players.p1.board = [
      character("shura", "OP15-067", { attachedDon: ["d5", "d6"] }),
    ];
    const before = currentPower(state, "p1", "shura");

    const played = gammaKnife(state);
    const offered = getLegalActions(played, "p1").flatMap((action) =>
      action.type === "resolve-effect" && action.option.kind === "don-return"
        ? [action.option]
        : [],
    );
    expect(offered.map((option) => option.pool)).toContain("attached");
    expect(
      offered.find((option) => option.pool === "attached")?.card?.instanceId,
    ).toBe("shura");

    const placed = submit(
      played,
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "return-don:shura",
    );
    expect(placed.players.p1.board[0]?.attachedDon).toHaveLength(1);
    expect(currentPower(placed, "p1", "shura")).toBe(before - 1000);
    // The rested DON!! the engine had provisionally taken is back on the field.
    expect(placed.players.p1.restedDon.length).toBe(3);
  });

  it("stays silent when only one pool could have supplied the DON!!", () => {
    const state = scenario();
    // Two DON!! exactly: both pay Gamma Knife's cost and rest, so the DON!! −1
    // can only come from the rested pile and there is nothing to decide.
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.donDeck = ["d3"];
    const played = gammaKnife(state);

    expect(pools(played)).toEqual({ active: 0, rested: 1, deck: 2 });
    expect(played.pendingEffect?.kind).not.toBe("return-don");
  });
});
