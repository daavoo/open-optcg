import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  createOnKoEffect,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { St33RulesAgent } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";
import { covers, fabricatedAttack, setTurnPlayer } from "./support/index.js";

import { resolveDeck } from "@one-piece-sim/decks";

const card = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
});

const character = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
  rested: false,
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
    gameId: "st33-scenario",
    p1: resolveDeck("(Blue) Kuzan - Starter Deck 33"),
    p2: resolveDeck("FIXTURE-RED"),
    seed: "st33-fixed-seed",
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
  state.turn = 3;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  state.pendingEffect = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  Object.assign(state.players.p1, {
    leaderCardNumber: "OP12-040",
    hand: [],
    deck: [],
    board: [],
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p1-don-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderRested: false,
  });
  Object.assign(state.players.p2, {
    hand: [],
    deck: [],
    board: [],
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p2-don-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderRested: false,
  });
  return state;
}

describe("ST33 rules", () => {
  covers("OP12-040", "static");
  covers("ST33-001", "[On Play]");
  it("deals the ST33 deck and resolves Koby with Kuzan's draw", () => {
    let state = scenario();
    state.players.p1.hand = [
      card("koby", "ST33-001"),
      card("cost", "OP12-045"),
    ];
    state.players.p1.deck = [
      card("leader-draw", "OP12-052"),
      card("koby-draw", "OP12-052"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "koby",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost",
      ),
    );
    expect(state.players.p1.hand.map((item) => item.instanceId)).toEqual([
      "leader-draw",
      "koby-draw",
    ]);
    expect(state.players.p1.handTrashedByEffectTurn).toBe(3);
  });

  covers("ST33-003", "[On Play]");
  it("bottom-decks up to two Characters with Smoker", () => {
    let state = scenario();
    state.players.p1.hand = [
      card("smoker", "ST33-003"),
      card("cost", "OP12-045"),
    ];
    state.players.p1.deck = [card("leader-draw", "OP12-052")];
    state.players.p2.board = [
      character("target-a", "ST33-001"),
      character("target-b", "ST33-003"),
    ];
    state = submit(
      state,
      requireAction(state, (action) => action.type === "play-card"),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target-a",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target-b",
      ),
    );
    expect(state.players.p2.board).toHaveLength(0);
    expect(state.players.p2.deck.map((item) => item.instanceId)).toEqual([
      "target-a",
      "target-b",
    ]);
  });

  covers("ST33-005", "[On Play]");
  it("free-plays a Navy Character with Garp", () => {
    let state = scenario();
    state.players.p1.hand = [
      card("garp", "ST33-005"),
      card("jango", "OP12-045"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "garp",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "jango",
      ),
    );
    expect(state.players.p1.board.map((item) => item.instanceId)).toEqual([
      "garp",
      "jango",
    ]);
  });

  covers("ST33-004", "static");
  it("discounts Borsalino after a Navy effect trashes a hand card", () => {
    const state = scenario();
    state.players.p1.hand = [card("borsalino", "ST33-004")];
    state.players.p1.activeDon = ["one", "two", "three"];
    state.players.p1.handTrashedByEffectTurn = state.turn;
    expect(
      getLegalActions(state, "p1").some(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "borsalino",
      ),
    ).toBe(true);
  });

  covers("ST33-004", "static");
  it("reports the discounted hand price in the observation, printed cost beside it", () => {
    const state = scenario();
    state.players.p1.hand = [card("borsalino", "ST33-004")];
    state.players.p1.activeDon = ["one", "two", "three"];
    const full = observe(state, "p1").self.hand[0]!;
    expect(full).toMatchObject({ cost: 6, currentCost: 6 });

    state.players.p1.handTrashedByEffectTurn = state.turn;
    const discounted = observe(state, "p1").self.hand[0]!;
    // The printed number stays put -- the played body is still a 6-cost
    // Character -- and the price the seat is being offered sits beside it.
    expect(discounted).toMatchObject({ cost: 6, currentCost: 3 });
    // Reading the price must not spend the look: the discount is still there
    // for the play itself, and for every later observation.
    expect(observe(state, "p1").self.hand[0]!.currentCost).toBe(3);
  });

  it("offers Sakazuki's Navy free-play when it is K.O.'d", () => {
    const state = scenario();
    state.players.p1.hand = [card("koby", "ST33-001")];
    expect(
      createOnKoEffect(state, "p1", card("sakazuki", "ST33-002"), "p2"),
    ).toMatchObject({
      kind: "free-play",
      eligibleInstanceIds: ["koby"],
      resumePlayerId: "p2",
    });
  });

  covers("ST33-002", "[When Attacking]");
  it("resolves and skips Sakazuki's attack discard at the six-card boundary", () => {
    let state = scenario();
    state.players.p1.board = [character("sakazuki", "ST33-002")];
    state.players.p1.hand = [card("cost", "OP12-045")];
    state.players.p2.hand = Array.from({ length: 6 }, (_, index) =>
      card(`opponent-${index}`, "FIX-001"),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "sakazuki",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("navy-discard");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("opponent-discard");
    expect(state.activePlayer).toBe("p2");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "opponent-0",
      ),
    );
    expect(state.players.p2.hand).toHaveLength(5);

    state = scenario();
    state.players.p1.board = [character("sakazuki", "ST33-002")];
    state.players.p1.hand = [card("cost", "OP12-045")];
    state.players.p2.hand = Array.from({ length: 5 }, (_, index) =>
      card(`opponent-${index}`, "FIX-001"),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "sakazuki",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );
    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.hand).toHaveLength(1);
    expect(state.players.p2.hand).toHaveLength(5);
    expect(state.phase).toBe("block");
  });

  covers("ST33-001", "[Blocker]");
  covers("ST33-004", "[Blocker]");
  covers("OP12-050", "[Blocker]");
  it("recognizes Koby, Borsalino, and Saul as Blockers", () => {
    const state = scenario();
    state.phase = "block";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.board = [
      character("koby", "ST33-001"),
      character("borsalino", "ST33-004"),
      character("saul", "OP12-050"),
    ];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    expect(
      getLegalActions(state, "p1")
        .filter((action) => action.type === "block")
        .map((action) => action.blockerInstanceId),
    ).toEqual(["koby", "borsalino", "saul"]);
  });

  covers("OP12-046", "[On Play]");
  it("batches Zephyr's two discards before Kuzan draws twice", () => {
    let state = scenario();
    // Three cost cards, so which two go is a real choice: with exactly two the
    // clause is `exhaustive` and both are taken without asking.
    state.players.p1.hand = [
      card("zephyr", "OP12-046"),
      card("cost-a", "OP12-045"),
      card("cost-b", "OP12-052"),
      card("cost-c", "OP12-052"),
    ];
    state.players.p1.deck = [
      card("draw-a", "OP12-045"),
      card("draw-b", "OP12-052"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "zephyr",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost-a",
      ),
    );
    expect(state.players.p1.deck).toHaveLength(2);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost-b",
      ),
    );
    expect(state.players.p1.hand.map((item) => item.instanceId)).toEqual([
      "cost-c",
      "draw-a",
      "draw-b",
    ]);
  });

  covers("OP12-047", "[On Play]");
  it("adds up to two Navy cards with Sengoku", () => {
    let state = scenario();
    state.players.p1.hand = [
      card("sengoku", "OP12-047"),
      card("cost", "OP12-052"),
    ];
    state.players.p1.deck = [
      card("leader-draw", "OP12-045"),
      card("navy-a", "ST33-001"),
      card("navy-b", "ST33-003"),
      card("not-navy", "FIX-001"),
      card("self", "OP12-047"),
      card("bottom", "FIX-002"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sengoku",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "navy-a",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "navy-b",
      ),
    );
    expect(state.players.p1.hand.map((item) => item.instanceId)).toEqual([
      "leader-draw",
      "navy-a",
      "navy-b",
    ]);
    expect(state.players.p1.deck.map((item) => item.instanceId)).toEqual([
      "not-navy",
      "self",
      "bottom",
    ]);
  });

  covers("EB04-026", "[When Attacking]");
  it("resolves Bluegrass's attack draw and Navy discard synergy", () => {
    let state = scenario();
    state.players.p1.board = [character("bluegrass", "EB04-026")];
    state.players.p1.deck = [
      card("attack-draw", "OP12-052"),
      card("leader-draw", "OP12-045"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "bluegrass",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "attack-draw",
      ),
    );
    expect(state.players.p1.hand.map((item) => item.instanceId)).toEqual([
      "leader-draw",
    ]);
    expect(state.phase).toBe("block");
    expect(state.activePlayer).toBe("p2");
  });

  covers("EB04-028", "[Main]");
  it("uses Ice Time to discard and lock two opposing Characters", () => {
    let state = scenario();
    state.players.p1.hand = [
      card("ice-time", "EB04-028"),
      card("cost", "OP12-052"),
    ];
    state.players.p1.deck = [card("leader-draw", "OP12-045")];
    state.players.p1.activeDon = state.players.p1.activeDon.slice(0, 5);
    state.players.p2.board = [
      character("target-a", "OP12-045"),
      character("target-b", "OP12-052"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId.startsWith("mechanic-event:"),
      ),
    );
    // "You may trash 1 card from your hand" is an `optional` around the cost,
    // so the yes/no comes first and the card is picked second.
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cost",
      ),
    );
    for (const target of ["target-a", "target-b"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === target,
        ),
      );
    }
    expect(
      state.players.p2.board.map((item) => item.cannotAttackUntilTurn),
    ).toEqual([4, 4]);
  });

  it("free-plays Garp's strongest Navy target", async () => {
    let state = scenario();
    state.players.p1.hand = [
      card("garp", "ST33-005"),
      card("koby", "ST33-001"),
      card("jango", "OP12-045"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "garp",
      ),
    );

    const action = await new St33RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "jango",
    });
  });

  it("attacks with Zephyr before using its trash activation", async () => {
    const state = scenario();
    state.players.p1.leaderRested = true;
    state.players.p1.board = [character("zephyr", "OP12-046")];
    state.players.p2.board = [character("target", "ST31-001")];

    const action = await new St33RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "attack",
      attackerInstanceId: "zephyr",
    });
  });

  it("returns an opposing target with a spent Zephyr", async () => {
    const state = scenario();
    // Turn 3's own DON!!, not the helper's ten: with ten in the cost area a
    // 1000-power Koby can be lifted over the opposing Leader, so `dead-attachment`
    // lets the attachment through and the ladder takes it ahead of the
    // activation this test is about.
    state.players.p1.activeDon = state.players.p1.activeDon.slice(0, 3);
    state.players.p1.leaderRested = true;
    state.players.p1.board = [
      { ...character("zephyr", "OP12-046"), rested: true },
      character("ally", "ST33-001"),
    ];
    state.players.p2.board = [character("target", "ST31-001")];

    const action = await new St33RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "activate-main",
      optionId: "mechanic-main:zephyr",
    });
  });

  it("does not spend Ice Time without two opposing Characters", async () => {
    const state = scenario();
    state.players.p1.hand = [
      card("ice-time", "EB04-028"),
      card("cost", "OP12-052"),
    ];
    state.players.p1.activeDon = state.players.p1.activeDon.slice(0, 5);
    state.players.p2.board = [character("target", "ST31-001")];

    const action = await new St33RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).not.toMatchObject({
      type: "activate-main",
      optionId: "ice-time:ice-time",
    });
  });

  it("does not offer Ice Block without a card for its mandatory discard", () => {
    const state = scenario();
    state.phase = "counter";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.hand = [card("ice-block", "OP12-057")];
    state.players.p1.activeDon = ["don"];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 8000,
      counterPower: 0,
    });

    expect(
      getLegalActions(state, "p1").some(
        (action) => action.type === "activate-counter-event",
      ),
    ).toBe(false);
  });

  it("uses Ice Block when +3000 would be insufficient", async () => {
    const state = scenario();
    state.phase = "counter";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.life = [];
    state.players.p1.hand = [
      card("ice-block", "OP12-057"),
      card("discard", "OP12-045"),
    ];
    state.players.p1.activeDon = ["don"];
    state.players.p2.leaderRested = true;
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 8000,
      counterPower: 0,
    });

    const action = await new St33RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "activate-counter-event",
      eventInstanceId: "ice-block",
    });
  });

  // The three below pin the `effectKind` split. Before it, ST33 identified a
  // search result as "the option carries an optionCardNumber", which held only
  // while the engine set that field on the search branches alone. When
  // `getEffectOptions` began setting it for every option naming a card, that
  // branch answered every effect decision by strategic priority, highest first
  // -- so "which card do I trash?" was answered with the best card in hand.
  it("trashes the least valuable card rather than the best one in hand", async () => {
    let state = scenario();
    state.players.p1.hand = [
      card("koby", "ST33-001"),
      card("garp", "ST33-005"),
      card("jango", "OP12-045"),
    ];
    state.players.p1.deck = [card("leader-draw", "OP12-052")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "koby",
      ),
    );

    const action = await new St33RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "jango",
    });
  });

  it("locks the most important attacker rather than the first one offered", async () => {
    const state = scenario();
    state.players.p1.hand = [
      card("kuzan", "OP12-043"),
      card("cost", "OP12-045"),
    ];
    state.players.p1.deck = [card("leader-draw", "OP12-052")];
    // Board order puts the unranked body first, so taking the first offered
    // option and choosing the real threat give different answers.
    state.players.p2.board = [
      character("cheap", "OP12-052"),
      character("threat", "ST31-001"),
    ];
    state.pendingEffect = {
      kind: "prevent-attack",
      playerId: "p1",
      targetPlayerId: "p2",
      sourceCardNumber: "OP12-043",
      sourceInstanceId: "kuzan",
      eligibleInstanceIds: ["cheap", "threat"],
      remaining: 1,
      expiresAtTurn: state.turn + 1,
    };

    const action = await new St33RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "threat",
    });
  });

  it("still free-plays the strongest body when the effect gives one away", async () => {
    let state = scenario();
    state.players.p1.hand = [
      card("garp", "ST33-005"),
      card("koby", "ST33-001"),
      card("saul", "OP12-050"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "garp",
      ),
    );

    const action = await new St33RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "saul",
    });
  });
});
