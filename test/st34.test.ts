import { describe, expect, it } from "vitest";
import {
  applyAction,
  battleAttackPower,
  createGame,
  createOnKoEffect,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { St34RulesAgent } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";
import { covers, fabricatedAttack, setTurnPlayer } from "./support/index.js";

import { resolveDeck } from "@one-piece-sim/decks";

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
  if (!action) throw new Error("Missing expected legal action");
  return action;
}

function submit(state: GameState, action: LegalAction): GameState {
  return applyAction(state, { ...action, revision: state.revision }).state;
}

function scenario(): GameState {
  let state = createGame({
    gameId: "st34-scenario",
    p1: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
    p2: resolveDeck("FIXTURE-RED"),
    seed: "st34-fixed-seed",
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
  state.turn = 5;
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
      deck: [],
      // Not empty: a seat on 0 Life loses to the next attack that connects, so
      // `lethal-close` reads a board built this way as a turn to end the game on
      // and removes every play. Both seats hold Life so the position poses the
      // ordinary turn these tests are about.
      life: Array.from({ length: 4 }, (_, index) =>
        card(`${playerId}-life-${index}`, "ST34-005"),
      ),
      board: [],
      stage: null,
      trash: [],
      donDeck: Array.from(
        { length: 10 },
        (_, index) => `${playerId}-deck-don-${index}`,
      ),
      activeDon: Array.from(
        { length: 10 },
        (_, index) => `${playerId}-active-don-${index}`,
      ),
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
      activateDonAtEndOfTurn: 0,
    });
  }
  return state;
}

describe("implemented ST34 rules", () => {
  covers("ST34-003", "[On Play]");
  it("deals ST34 and searches the top three with Brulee", () => {
    let state = scenario();
    state.players.p1.hand = [card("brulee", "ST34-003")];
    state.players.p1.deck = [
      card("linlin", "ST34-004"),
      card("fixture", "FIX-001"),
      card("cracker", "ST34-002"),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "brulee",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "search-select:linlin",
      ),
    );

    expect(state.players.p1.hand).toContainEqual(card("linlin", "ST34-004"));
    expect(state.players.p1.deck.map((entry) => entry.instanceId)).toEqual([
      "fixture",
      "cracker",
    ]);
  });

  covers("ST34-002", "[On Play]");
  it("ramps and K.O.s a cost-2 Character with Cracker", () => {
    let state = scenario();
    state.players.p1.hand = [card("cracker", "ST34-002")];
    state.players.p2.board = [character("target", "FIX-002")];
    const donDeckBefore = state.players.p1.donDeck.length;

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "cracker",
      ),
    );
    expect(state.players.p1.donDeck).toHaveLength(donDeckBefore - 1);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );

    expect(state.players.p2.board).toHaveLength(0);
    expect(state.players.p2.trash).toContainEqual(card("target", "FIX-002"));
  });

  covers("ST34-004", "[On Play]");
  it("pays Linlin's cost, adds Life, and sets base power to 0", () => {
    let state = scenario();
    state.players.p1.hand = [
      card("linlin", "ST34-004"),
      card("discard", "ST34-005"),
    ];
    state.players.p1.deck = [card("life", "ST34-003")];
    state.players.p2.board = [character("target", "FIX-002")];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "linlin",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "discard",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );

    // Face-down Life is a bare instance: `faceUp` is written only when true,
    // so setup-dealt and effect-added Life cards have one representation.
    expect(state.players.p1.life).toContainEqual(card("life", "ST34-003"));
    expect(observe(state, "p2").self.board[0]?.currentPower).toBe(0);
  });

  covers("EB03-032", "[On Play]", "[Your Turn]");
  covers("EB03-035", "[On Play]");
  it("boosts Katakuri with Flampe and ramps with Pudding", () => {
    let state = scenario();
    state.players.p1.hand = [card("flampe", "EB03-032")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "flampe",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "p1-leader",
      ),
    );
    expect(observe(state, "p1").self.leader.currentPower).toBe(7000);

    state = scenario();
    state.players.p1.hand = [card("pudding", "EB03-035")];
    const donDeckBefore = state.players.p1.donDeck.length;
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "pudding",
      ),
    );
    expect(state.players.p1.donDeck).toHaveLength(donDeckBefore - 1);
  });

  covers("EB03-035", "[Blocker]");
  covers("OP11-065", "static");
  it("offers Pudding and conditional Anana as Blockers", () => {
    const state = scenario();
    state.phase = "block";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.board = [
      character("anana", "OP11-065"),
      character("pudding", "EB03-035"),
    ];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });

    const blockers = getLegalActions(state, "p1")
      .filter((action) => action.type === "block")
      .map((action) => action.blockerInstanceId);

    expect(blockers).toEqual(expect.arrayContaining(["anana", "pudding"]));
  });

  covers("OP11-066", "[Activate: Main]");
  covers("OP11-071", "[Activate: Main]");
  it("resolves Oven and Perospero cost guesses", () => {
    let state = scenario();
    state.players.p1.board = [character("oven", "OP11-066")];
    state.players.p2.deck = [card("top", "FIX-001")];
    state.players.p2.board = [character("target", "FIX-002")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-main:oven",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost-1",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(state.players.p2.board).toHaveLength(0);

    state = scenario();
    state.players.p1.board = [character("perospero", "OP11-071")];
    state.players.p1.hand = [card("discard", "ST34-005")];
    state.players.p1.deck = [card("draw", "ST34-003")];
    state.players.p2.deck = [card("top", "FIX-002")];
    const activeBefore = state.players.p1.activeDon.length;
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-main:perospero",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "discard",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost-2",
      ),
    );
    expect(state.players.p1.hand).toContainEqual(card("draw", "ST34-003"));
    expect(state.players.p1.activeDon).toHaveLength(activeBefore + 1);
  });

  covers("OP11-062", "[When Attacking]");
  covers("ST34-001", "[Your Turn]");
  it("uses the Leader ability and triggers Character Katakuri's ramp", () => {
    let state = scenario();
    state.players.p1.board = [character("katakuri", "ST34-001")];
    state.players.p1.restedDon = ["returned"];
    state.players.p1.activeDon = [];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "p1-leader",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );

    expect(battleAttackPower(state)).toBe(6000);
    expect(state.players.p1.restedDon).toHaveLength(2);
  });

  it("loses attached attack power when paying the Leader's DON cost", () => {
    let state = scenario();
    state.players.p1.activeDon = [];
    state.players.p1.leaderAttachedDon = ["attached"];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "p1-leader",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );

    expect(battleAttackPower(state)).toBe(6000);
  });

  covers("ST34-005", "[When Attacking]");
  it("pays Tamago's DON cost and K.O.s a 2000-power Character", () => {
    let state = scenario();
    state.players.p1.board = [character("tamago", "ST34-005")];
    state.players.p2.board = [character("target", "FIX-001")];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "tamago",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );

    expect(state.players.p2.board).toHaveLength(0);
  });

  covers("OP11-079", "[Counter]");
  it("resolves the successful guess Counter Event", () => {
    let state = scenario();
    state.phase = "counter";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.hand = [card("event", "OP11-079")];
    state.players.p1.activeDon = ["active"];
    state.players.p2.deck = [card("top", "ST31-004")];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 9000,
      counterPower: 0,
    });

    state = submit(
      state,
      requireAction(
        state,
        (action) => action.type === "activate-counter-event",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost:7",
      ),
    );

    expect(state.activeAttack?.counterPower).toBe(5000);
  });

  covers("OP11-079", "[Trigger]");
  it("resolves Event Triggers and both On K.O. free-play effects", () => {
    let state = scenario();
    state.phase = "trigger";
    // p1 acts -- it is resolving its own Trigger -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.deck = [card("draw", "ST34-003")];
    state.pendingTrigger = {
      playerId: "p1",
      card: card("event", "OP11-079"),
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      ),
    );
    expect(state.players.p1.hand).toContainEqual(card("draw", "ST34-003"));

    state = scenario();
    state.players.p1.hand = [card("daifuku", "OP11-068")];
    const katakuriEffect = createOnKoEffect(
      state,
      "p1",
      card("katakuri", "ST34-001"),
      "p2",
    );
    expect(katakuriEffect).toMatchObject({
      kind: "free-play",
      eligibleInstanceIds: ["daifuku"],
    });

    state.players.p1.hand = [card("cracker", "ST34-002")];
    state.players.p1.restedDon = ["cost"];
    state.players.p2.activeDon = [
      "opponent-don-1",
      "opponent-don-2",
      "opponent-don-3",
      "opponent-don-4",
    ];
    // P-090 Smoothie is an "[Opponent's Turn]" free-play, so the fabricated
    // attack has to bring the turn it implies with it: p2 is attacking, which
    // only ever happens on p2's turn.
    state.turnPlayerId = "p2";
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "smoothie",
      attackPower: 5000,
      counterPower: 0,
    });
    const smoothieEffect = createOnKoEffect(
      state,
      "p1",
      card("smoothie", "P-090"),
      "p2",
    );
    expect(smoothieEffect).toMatchObject({
      kind: "free-play",
      eligibleInstanceIds: ["cracker"],
      returnDon: 1,
    });
  });

  covers("OP11-081", "[Main]", "[Trigger]");
  it("plays Cognac Mama-Mash and resolves its active-DON Trigger", () => {
    let state = scenario();
    state.players.p1.hand = [card("event", "OP11-081")];
    state.players.p2.deck = [card("top", "ST31-004")];
    state.players.p2.board = [character("target", "ST31-004")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-event:event",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost-7",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(state.players.p2.board).toHaveLength(0);

    state = scenario();
    state.phase = "trigger";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.activeDon = [];
    state.pendingTrigger = {
      playerId: "p1",
      card: card("trigger", "OP11-081"),
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      ),
    );
    expect(state.players.p1.activeDon).toHaveLength(1);
  });

  it.each(["OP11-079", "OP11-081"])(
    "offers %s as a Trigger after real Life damage",
    (cardNumber) => {
      let state = scenario();
      setTurnPlayer(state, "p2");
      state.players.p1.life = [card("trigger", cardNumber)];
      state.players.p1.activeDon = [];
      state.players.p2.activeDon = [];

      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p2-leader" &&
            action.targetInstanceId === "p1-leader",
        ),
      );
      state = submit(
        state,
        requireAction(state, (action) => action.type === "pass"),
      );
      state = submit(
        state,
        requireAction(state, (action) => action.type === "pass"),
      );

      expect(state.phase).toBe("trigger");
      expect(state.pendingTrigger?.card.cardNumber).toBe(cardNumber);
      expect(getLegalActions(state, "p1")).toContainEqual(
        expect.objectContaining({
          type: "resolve-trigger",
          optionId: "activate",
        }),
      );
    },
  );

  covers("OP11-062", "[On Your Opponent's Attack]");
  it("offers defending Katakuri after an attacker's pending effect", () => {
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("small", "FIX-001", true)];
    state.players.p2.board = [character("tamago", "ST34-005")];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "tamago" &&
          action.targetInstanceId === "p1-leader",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("st34-don-minus-ko");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );

    expect(state.activePlayer).toBe("p1");
    expect(state.pendingEffect).toMatchObject({
      kind: "katakuri-leader",
      playerId: "p1",
    });
  });

  it("skips the Leader DON cost without Character Katakuri", async () => {
    let state = scenario();
    state.players.p1.activeDon = [];
    state.players.p1.restedDon = ["cost"];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "p1-leader",
      ),
    );

    const action = await new St34RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "skip",
    });
  });

  it("guesses ST31's modal cost 1", async () => {
    const state = scenario();
    state.players.p2.leaderCardNumber = "ST21-001";
    state.pendingEffect = {
      kind: "st34-guess-cost",
      playerId: "p1",
      targetPlayerId: "p2",
      sourceCardNumber: "OP11-066",
      sourceInstanceId: "oven",
      outcome: "oven",
      resumePhase: "main",
      resumePlayerId: "p1",
    };

    const action = await new St34RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "cost:1",
    });
  });

  it("prioritizes Cracker's ramp over a low-impact Character", async () => {
    const state = scenario();
    state.players.p1.activeDon = ["a", "b", "c", "d"];
    state.players.p1.hand = [
      card("cracker", "ST34-002"),
      card("tamago", "ST34-005"),
    ];

    const action = await new St34RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "cracker",
    });
  });
});
