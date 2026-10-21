import { describe, expect, it } from "vitest";
import { hasPrintedText } from "./support/printed-text.js";
import {
  GameService,
  applyAction,
  battleAttackPower,
  createGame,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { RulesFirstAgent } from "@one-piece-sim/agents/local";
import { covers, setTurnPlayer } from "./support/index.js";

import { resolveDeck } from "@one-piece-sim/decks";

const input = {
  gameId: "st31-test",
  p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
  p2: resolveDeck("FIXTURE-BLUE"),
  seed: "st31-fixed-seed",
};

function submit(state: GameState, action: LegalAction): GameState {
  return applyAction(state, {
    ...action,
    revision: state.revision,
  }).state;
}

function requireAction(
  state: GameState,
  predicate: (action: LegalAction) => boolean,
): LegalAction {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  if (!action) throw new Error("Missing expected legal action");
  return action;
}

function completeSetup(): GameState {
  let state = createGame(input);
  for (const playerId of ["p1", "p2"] as const) {
    const keep = requireAction(
      state,
      (action) =>
        action.type === "mulligan-decision" && action.decision === "keep",
    );
    expect(state.activePlayer).toBe(playerId);
    state = submit(state, keep);
  }
  return state;
}

function scenario(): GameState {
  const state = completeSetup();
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

function card(instanceId: string, cardNumber: string) {
  return { instanceId, cardNumber };
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

describe("ST31 rules", () => {
  covers("OP01-016", "[On Play]");
  it("searches with Nami and bottoms unselected cards in reveal order", () => {
    let state = scenario();
    state.players.p1.hand = [card("nami", "OP01-016")];
    state.players.p1.deck = [
      card("usopp", "OP11-003"),
      card("brook", "ST31-003"),
      card("zoro", "OP14-015"),
      card("event", "OP13-021"),
      card("sanji", "ST31-001"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "nami",
      ),
    );
    const search = requireAction(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "search-select:usopp",
    );
    const result = applyAction(state, {
      ...search,
      revision: state.revision,
    });
    state = result.state;
    expect(result.state.players.p1.hand).toContainEqual(
      card("usopp", "OP11-003"),
    );
    expect(state.players.p1.deck.map((entry) => entry.instanceId)).toEqual([
      "brook",
      "zoro",
      "event",
      "sanji",
    ]);
    expect(state.pendingEffect).toBeNull();
    expect(result.events).toContainEqual({
      type: "card-revealed",
      playerId: "p1",
      cardNumber: "OP11-003",
      sourceCardNumber: "OP01-016",
    });
  });

  covers("ST31-005", "[On Play]", "[Activate: Main]");
  it("plays and activates Thousand Sunny", () => {
    let state = scenario();
    state.players.p1.hand = [card("sunny", "ST31-005")];
    state.players.p1.deck = [
      card("a", "OP11-003"),
      card("b", "ST31-003"),
      card("c", "OP14-015"),
      card("d", "OP13-021"),
      card("e", "ST31-001"),
    ];
    const playSunny = requireAction(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "sunny",
    );
    expect(playSunny.summary).toBe(
      "Play Thousand Sunny [ST31-005] (cost 1 DON!!)",
    );
    state = submit(state, playSunny);
    expect(state.players.p1.stage?.cardNumber).toBe("ST31-005");
    expect(observe(state, "p1").self.stage?.cost).toBe(1);
    expect(getLegalActions(state, "p1")).toHaveLength(6);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "done",
      ),
    );
    // "Place the rest at the bottom in any order" is its own step.
    while (state.pendingEffect) {
      state = submit(
        state,
        requireAction(state, (action) => action.type === "resolve-effect"),
      );
    }
    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.deck.map((card) => card.instanceId)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    const activation = requireAction(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:sunny",
    );
    state = submit(state, activation);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "p1-leader",
      ),
    );
    expect(state.players.p1.stage?.rested).toBe(true);
    expect(state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  covers("ST31-001", "[On Play]");
  covers("ST31-002", "[On Play]");
  it("draws and free-plays the legal Sanji and Jinbe follow-ups", () => {
    let state = scenario();
    state.players.p1.hand = [card("sanji", "ST31-001")];
    state.players.p1.deck = [card("usopp", "OP11-003")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );
    expect(state.players.p1.hand).toContainEqual(card("usopp", "OP11-003"));
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "usopp",
      ),
    );
    expect(state.players.p1.board.map((entry) => entry.cardNumber)).toEqual([
      "ST31-001",
      "OP11-003",
    ]);

    state = scenario();
    state.players.p1.hand = [
      card("jinbe", "ST31-002"),
      // Jinbe prints "with a cost of 1", not "1 or less": Brook at cost 2 is
      // over the bound, and the Stage is under the "card" wording that would
      // exclude it if the text said "Character".
      card("brook", "ST31-003"),
      card("sunny", "ST31-005"),
    ];
    state.players.p1.deck = [card("small-luffy", "ST23-004")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "jinbe",
      ),
    );
    expect(
      getLegalActions(state, "p1")
        .filter((action) => action.type === "resolve-effect")
        .map((action) => action.optionId),
    ).toEqual(["sunny", "small-luffy", "skip"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "small-luffy",
      ),
    );
    expect(state.players.p1.board.map((entry) => entry.cardNumber)).toEqual([
      "ST31-002",
      "ST23-004",
    ]);
  });

  it("replaces a Character before resolving paid Sanji's On Play", () => {
    let state = scenario();
    state.players.p1.activeDon = state.players.p1.activeDon.slice(1);
    state.players.p1.hand = [card("sanji", "ST31-001")];
    state.players.p1.deck = [card("event", "OP13-021")];
    state.players.p1.board = [
      character("replace-me", "OP11-003", {
        attachedDon: ["p1-active-0"],
      }),
      character("body-2", "ST31-003"),
      character("body-3", "OP14-015"),
      character("body-4", "ST31-002"),
      character("body-5", "ST23-004"),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("character-area-replacement");
    expect(state.players.p1.board).toHaveLength(5);
    expect(state.players.p1.hand).not.toContainEqual(card("sanji", "ST31-001"));

    const replacement = requireAction(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "replace-me",
    );
    const result = applyAction(state, {
      ...replacement,
      revision: state.revision,
    });
    state = result.state;
    expect(state.players.p1.board.map((entry) => entry.instanceId)).toContain(
      "sanji",
    );
    expect(state.players.p1.trash).toContainEqual(
      card("replace-me", "OP11-003"),
    );
    expect(state.players.p1.restedDon).toContain("p1-active-0");
    expect(state.players.p1.hand).toContainEqual(card("event", "OP13-021"));
    expect(result.events).toContainEqual({
      type: "character-trashed",
      playerId: "p1",
      cardInstanceId: "replace-me",
      cardNumber: "OP11-003",
      reason: "character-area-limit",
    });
  });

  it("continues into Jinbe's On Play after Sanji free-plays onto a full area", () => {
    let state = scenario();
    state.players.p1.hand = [card("sanji", "ST31-001")];
    state.players.p1.deck = [
      card("jinbe", "ST31-002"),
      card("small-luffy", "ST23-004"),
    ];
    state.players.p1.board = [
      character("body-1", "OP11-003"),
      character("body-2", "ST31-003"),
      character("body-3", "OP14-015"),
      character("body-4", "OP01-016"),
    ];

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
    expect(state.pendingEffect?.kind).toBe("character-area-replacement");

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "body-1",
      ),
    );
    expect(state.players.p1.board.map((entry) => entry.instanceId)).toContain(
      "jinbe",
    );
    expect(state.players.p1.hand).toContainEqual(
      card("small-luffy", "ST23-004"),
    );
    const jinbeEffect = state.pendingEffect;
    expect(jinbeEffect?.kind).toBe("free-play");
    if (jinbeEffect?.kind !== "free-play") {
      throw new Error("Expected Jinbe's free-play effect");
    }
    expect(jinbeEffect.eligibleInstanceIds).toContain("small-luffy");
  });

  covers("ST21-001", "[Activate: Main]");
  covers("P-101", "[On Play]");
  covers("OP13-021", "[Main]");
  it("moves rested DON with the Leader, Chopper, Sunny, and Gatling Gun", () => {
    let state = scenario();
    state.players.p1.board = [character("target", "OP11-003")];
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.restedDon = ["rested-1", "rested-2", "rested-3"];
    const attachLeader = requireAction(
      state,
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === "p1-leader",
    );
    expect(attachLeader.summary).toBe(
      "Attach 1 DON!! to Monkey.D.Luffy [ST21-001] (Leader, 6000 power) (+1000 power during this turn only; the DON!! stays under it until your next Refresh, so it cannot pay for a [Counter] Event)",
    );
    const attachUsopp = requireAction(
      state,
      (action) =>
        action.type === "attach-don" && action.targetInstanceId === "target",
    );
    expect(attachUsopp.summary).toBe(
      "Attach 1 DON!! to Usopp [OP11-003] (Character, 6000 power, active) (+1000 power during this turn only; the DON!! stays under it until your next Refresh, so it cannot pay for a [Counter] Event)",
    );
    const leaderActivation = requireAction(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:p1-leader",
    );
    expect(leaderActivation.summary).toBe(
      hasPrintedText()
        ? "Activate Monkey.D.Luffy [ST21-001]: [Once Per Turn] Give up to 2 " +
            "rested DON!! cards to 1 of your Characters."
        : "Activate Monkey.D.Luffy [ST21-001]",
    );
    // The recipient is a choice now, not part of the offer: the register this
    // replaced built one action per (target, count) pair.
    state = submit(state, leaderActivation);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(state.players.p1.board[0]?.attachedDon).toEqual([
      "rested-1",
      "rested-2",
    ]);

    state = scenario();
    state.players.p1.hand = [card("chopper", "P-101")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "chopper",
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
    expect(state.players.p1.leaderAttachedDon).toHaveLength(1);

    state = scenario();
    state.players.p1.hand = [card("gatling", "OP13-021")];
    state.players.p1.board = [character("enemy-target", "OP11-003")];
    state.players.p2.board = [character("fixture-target", "FIX-002")];
    const activations = getLegalActions(state, "p1").filter(
      (action) => action.type === "activate-main",
    );
    expect(activations).toHaveLength(1);
    expect(activations[0]).toMatchObject({
      optionId: "mechanic-event:gatling",
    });
    // The summary states the card number and, where the process holds the
    // printed text, the [Main] clause, so choosing does not depend on
    // recalling the card's text from elsewhere.
    expect(activations[0]?.summary).toBe(
      hasPrintedText()
        ? "Activate Gum-Gum Gatling Gun [OP13-021]: Give up to 1 rested DON!! " +
            "card to 1 of your [Monkey.D.Luffy] cards. Then, give up to 1 of " +
            "your opponent's Characters −2000 power during this turn."
        : "Activate Gum-Gum Gatling Gun [OP13-021]",
    );

    state = scenario();
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.restedDon = ["rested-a", "rested-b"];
    state.players.p1.board = [character("sanji", "ST31-001")];
    // One offer, not one per (recipient, count) pair: the recipient is the
    // decision the activation opens, and the count is always the maximum --
    // rested DON!! is dead for the turn wherever it sits, so moving both is
    // never worse than moving one.
    const luffyLeader = requireAction(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "ST21-001",
    );
    state = submit(state, luffyLeader);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "sanji",
      ),
    );
    expect(state.players.p1.board[0]?.attachedDon).toEqual([
      "rested-a",
      "rested-b",
    ]);

    state = scenario();
    state.players.p1.hand = [card("gatling", "OP13-021")];
    state.players.p1.board = [character("enemy-target", "OP11-003")];
    state.players.p2.board = [character("fixture-target", "FIX-002")];
    state = submit(state, activations[0]!);
    expect(
      getLegalActions(state, "p1").map((action) => action.summary),
    ).toEqual(["Give 1 rested DON!! to Monkey.D.Luffy", "Give no DON!!"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "p1-leader",
      ),
    );
    expect(state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(
      getLegalActions(state, "p1").map((action) => action.summary),
    ).toEqual(["Choose Fixture Captain", "Choose no more cards"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "fixture-target",
      ),
    );
    expect(state.players.p2.board[0]?.powerModifiers).toContainEqual({
      amount: -2000,
      expiresAtTurn: 3,
      sourceCardNumber: "OP13-021",
      sourceInstanceId: "gatling",
    });
    expect(state.players.p1.trash).toContainEqual(card("gatling", "OP13-021"));
  });

  covers("ST31-001", "static");
  covers("ST31-004", "static");
  covers("OP14-015", "[Rush]");
  it("offers Rush only when each ST31 condition is met", () => {
    const state = scenario();
    state.players.p1.board = [
      character("sanji-ready", "ST31-001", {
        playedTurn: 3,
        attachedDon: ["a", "b"],
      }),
      character("big-luffy-ready", "ST31-004", { playedTurn: 3 }),
      character("zoro-ready", "OP14-015", { playedTurn: 3 }),
      character("usopp-sick", "OP11-003", { playedTurn: 3 }),
    ];
    state.players.p1.leaderAttachedDon = ["c"];
    const legalActions = getLegalActions(state, "p1");
    const attackers = legalActions
      .filter((action) => action.type === "attack")
      .map((action) => action.attackerInstanceId);
    expect(attackers).toContain("sanji-ready");
    expect(attackers).toContain("big-luffy-ready");
    expect(attackers).toContain("zoro-ready");
    expect(attackers).not.toContain("usopp-sick");
    const leaderAttack = requireAction(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "p1-leader" &&
        action.targetInstanceId === "p2-leader",
    );
    // Including what being hit costs: one of five Life cards is a different
    // decision from the game, and "target is hit" priced them the same. And
    // what declaring now gives up: a succeeding attack used to say nothing
    // about the DON!! left in the cost area, because the note that does is
    // attached to `donToReach`, which exists only while an attack falls short.
    expect(leaderAttack.summary).toBe(
      `Attack Fixture Blue Leader [FIX-LEADER-B] (Leader, 5000 power) with Monkey.D.Luffy [ST21-001] (Leader, 6000 power) (6000 attack vs 5000 defense: target is hit and the defender loses 1 of their 5 Life cards to their hand unless 1001 more Counter power is added, from any number of cards; the Leader can never block and is a legal target whether rested or active, so declaring here costs nothing beyond the attack itself; declaring now leaves ${state.players.p1.activeDon.length} active DON!! unspent, and each one given to this attacker first raises the requirement by 1000, to ${1001 + state.players.p1.activeDon.length * 1000} if all ${state.players.p1.activeDon.length} go here -- DON!! spread over other attackers raises theirs instead)`,
    );
    // The declaration arithmetic, offered before the attack is declared: the
    // power the engine would freeze, and the DON!! that would be wasted by
    // declaring now rather than after the turn's gifts.
    expect(leaderAttack).toMatchObject({
      attackPower: 6000,
      targetPower: 5000,
      counterShortfall: 1001,
      unspentActiveDon: state.players.p1.activeDon.length,
    });
    const pass = legalActions.find((action) => action.type === "pass");
    expect(pass).toMatchObject({
      unspentActiveDon: state.players.p1.activeDon.length,
      availablePlayCount: 0,
      eligibleAttackCount: expect.any(Number) as number,
    });
    // Those same four numbers in the summary, because a caller that reads
    // summaries -- the LLM agent's request is one -- saw only "End turn" and
    // could not tell an expiring DON!! from a turn with nothing left in it.
    expect(pass?.summary).toContain(
      `giving up ${state.players.p1.activeDon.length} active DON!! (which expire unspent)`,
    );
    expect(pass?.summary).toContain("attacks declarable");
    expect(pass?.summary).not.toContain("playable");

    // Spend every DON!! and both notes fall silent rather than saying zero: a
    // line that reports nothing left behind is noise on every attack of every
    // turn that ends with the cost area empty.
    state.players.p1.activeDon = [];
    const spent = getLegalActions(state, "p1");
    const spentAttack = spent.find(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "p1-leader" &&
        action.targetInstanceId === "p2-leader",
    );
    expect(spentAttack?.summary).not.toContain("active DON!!");
    expect(
      spent.find((action) => action.type === "pass")?.summary,
    ).not.toContain("DON!!");
  });

  covers("ST31-004", "[On Play]");
  covers("OP11-009", "[When Attacking]");
  covers("OP14-015", "[When Attacking]");
  covers("ST23-004", "[Activate: Main]");
  it("applies Luffy, Robin, Zoro, and small Luffy power reductions", () => {
    let state = scenario();
    state.players.p1.board = [character("nami", "OP01-016")];
    state.players.p1.stage = {
      instanceId: "sunny",
      cardNumber: "ST31-005",
      rested: false,
    };
    state.players.p1.hand = [card("big-luffy", "ST31-004")];
    state.players.p2.board = [character("enemy", "FIX-002")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "big-luffy",
      ),
    );
    expect(
      getLegalActions(state, "p1").map((action) => action.summary),
    ).toEqual(["Give Fixture Captain -4000 power", "Stop reducing power"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "enemy",
      ),
    );
    expect(state.players.p2.board[0]?.powerModifiers).toContainEqual({
      amount: -4000,
      expiresAtTurn: 3,
      sourceCardNumber: "ST31-004",
      sourceInstanceId: "big-luffy",
    });
    expect(state.pendingEffect).toBeNull();

    state = scenario();
    state.players.p1.board = [
      character("robin", "OP11-009", { attachedDon: ["a", "b"] }),
    ];
    state.players.p2.board = [character("enemy", "EB03-053")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "robin",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "enemy",
      ),
    );
    expect(state.players.p2.board[0]?.powerModifiers).toContainEqual({
      amount: -2000,
      expiresAtTurn: 4,
      sourceCardNumber: "OP11-009",
      sourceInstanceId: "robin",
    });
    expect(observe(state, "p2").self.board[0]).toMatchObject({
      currentPower: 4000,
      powerModifiers: [
        {
          amount: -2000,
          sourceCardNumber: "OP11-009",
          sourceInstanceId: "robin",
        },
      ],
    });
    expect(state.phase).toBe("block");

    state = scenario();
    state.players.p1.board = [character("zoro", "OP14-015")];
    state.players.p2.board = [character("enemy", "FIX-002")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "zoro",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "enemy",
      ),
    );
    expect(state.players.p2.board[0]?.powerModifiers).toContainEqual({
      amount: -1000,
      expiresAtTurn: 3,
      sourceCardNumber: "OP14-015",
      sourceInstanceId: "zoro",
    });

    state = scenario();
    state.players.p1.board = [character("small", "ST23-004")];
    state.players.p2.board = [character("enemy", "FIX-002")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-main:small",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "enemy",
      ),
    );
    expect(state.players.p1.board[0]?.rested).toBe(true);
    expect(state.players.p2.board[0]?.powerModifiers).toContainEqual({
      amount: -1000,
      expiresAtTurn: 3,
      sourceCardNumber: "ST23-004",
      sourceInstanceId: "small",
    });
  });

  covers("ST31-002", "[Blocker]");
  covers("P-101", "[Blocker]");
  covers("ST31-003", "[Opponent's Turn]");
  it("resolves Jinbe, Chopper, and conditional Brook Blockers", () => {
    let state = scenario();
    state.players.p1.board = [character("attacker", "OP11-003")];
    state.players.p2.board = [
      character("jinbe", "ST31-002"),
      character("chopper", "P-101"),
      character("brook", "ST31-003"),
    ];
    state.players.p2.leaderAttachedDon = ["a", "b", "c"];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "attacker",
      ),
    );
    const blockers = getLegalActions(state, "p2")
      .filter((action) => action.type === "block")
      .map((action) => action.blockerInstanceId);
    expect(blockers).toEqual(["jinbe", "chopper", "brook"]);
    expect(observe(state, "p2").self.board.map((card) => card.blocker)).toEqual(
      [true, true, true],
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "block" && action.blockerInstanceId === "brook",
      ),
    );
    expect(state.activeAttack?.targetInstanceId).toBe("brook");
    expect(state.phase).toBe("counter");
    expect(
      observe(state, "p2").self.board.find(
        (card) => card.instanceId === "brook",
      )?.blocker,
    ).toBe(false);

    state = scenario();
    state.players.p1.board = [
      character("attacker", "OP11-003", { attachedDon: ["a", "b"] }),
    ];
    state.players.p2.board = [
      character("brook", "ST31-003", {
        rested: true,
        attachedDon: ["c"],
      }),
    ];
    state.players.p2.leaderAttachedDon = ["d", "e"];
    state.players.p2.hand = [card("franky", "OP11-012")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "attacker" &&
          action.targetInstanceId === "brook",
      ),
    );
    expect(observe(state, "p2").self.board[0]).toMatchObject({
      cost: 2,
      currentPower: 6000,
      blocker: false,
    });
    expect(getLegalActions(state, "p2")).toHaveLength(1);
    expect(getLegalActions(state, "p2")[0]?.type).toBe("pass");
    state = submit(state, getLegalActions(state, "p2")[0]!);
    const counter = requireAction(
      state,
      (action) =>
        action.type === "counter" && action.cardInstanceId === "franky",
    );
    expect(counter.summary).toBe(
      "Counter with Franky [OP11-012] (+2000; defense becomes 8000 vs 8000 attack: still hit; 1 more Counter power needed and the hand cannot reach it)",
    );
  });

  covers("OP04-016", "[Counter]");
  covers("OP11-012", "[Your Turn]");
  it("uses Character and Event counters and triggers Franky once", () => {
    let state = scenario();
    state.players.p1.board = [
      character("attacker", "OP11-003"),
      character("franky", "OP11-012"),
    ];
    state.players.p2.board = [character("other-counter-target", "FIX-002")];
    state.players.p2.hand = [
      card("counter-character", "FIX-001"),
      card("bad-manners", "OP04-016"),
      card("discard", "FIX-002"),
      card("duplicate-discard", "FIX-002"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "attacker",
      ),
    );
    state = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "counter" &&
          action.cardInstanceId === "counter-character",
      ),
    );
    expect(state.activeAttack?.counterPower).toBe(1000);
    expect(
      getLegalActions(state, state.activePlayer).filter(
        (action) => action.type === "activate-counter-event",
      ),
    ).toHaveLength(1);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-counter-event" &&
          action.eventInstanceId === "bad-manners",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("bad-manners-counter");
    // The one hand card, and the decline the printed "you may" allows.
    expect(
      getLegalActions(state, state.activePlayer)
        .filter((action) => action.type === "resolve-effect")
        .map((action) => ("optionId" in action ? action.optionId : "")),
    ).toEqual(["discard", "skip"]);
    const resolve = requireAction(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "discard",
    );
    const resolved = applyAction(state, {
      ...resolve,
      revision: state.revision,
    });
    state = resolved.state;
    // The Event Franky watches: its controller applies the +2000.
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    expect(state.activeAttack?.counterPower).toBe(4000);
    expect(battleAttackPower(state)).toBe(8000);
    // The cost card left a hand for a public trash, so its identity is a
    // `card-moved` step both seats can read -- the opponent's modal shows it.
    expect(resolved.events).toContainEqual({
      type: "card-moved",
      playerId: "p2",
      cardInstanceId: "discard",
      cardNumber: "FIX-002",
      from: "hand",
      to: "trash",
      sourceCardNumber: "OP04-016",
    });
    expect(
      state.players.p1.board.every((entry) =>
        entry.powerModifiers?.some((modifier) => modifier.amount === 2000),
      ),
    ).toBe(true);
  });

  covers("OP04-016", "[Trigger]");
  covers("OP13-021", "[Trigger]");
  it("resolves Bad Manners and Gatling Gun Life Triggers", () => {
    for (const [triggerNumber, amount] of [
      ["OP04-016", -3000],
      ["OP13-021", -2000],
    ] as const) {
      let state = scenario();
      state.players.p1.board = [character("attacker", "OP11-003")];
      state.players.p2.board = [character("trigger-target", "FIX-002")];
      state.players.p2.life = [card("life-trigger", triggerNumber)];
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "attacker" &&
            action.targetInstanceId === "p2-leader",
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
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-trigger" && action.optionId === "attacker",
        ),
      );
      expect(state.players.p1.board[0]?.powerModifiers).toContainEqual({
        amount,
        expiresAtTurn: 3,
        sourceCardNumber: triggerNumber,
        sourceInstanceId: "life-trigger",
      });
      expect(state.players.p2.trash).toContainEqual(
        card("life-trigger", triggerNumber),
      );
      expect(state.phase).toBe("main");
      expect(state.activePlayer).toBe("p1");
    }
  });

  it("keeps opponent hidden zones private in a real ST31 observation", () => {
    const state = completeSetup();
    state.players.p1.leaderAttachedDon = ["visible-leader-don"];
    const view = observe(state, "p1");
    const opponentJson = JSON.stringify(view.opponent);
    for (const hidden of [...state.players.p2.hand, ...state.players.p2.life]) {
      expect(opponentJson).not.toContain(hidden.instanceId);
      expect(opponentJson).not.toContain(hidden.cardNumber);
    }
    expect(view.self.hand).toHaveLength(5);
    expect(view.self.leader).toMatchObject({
      cardNumber: "ST21-001",
      name: "Monkey.D.Luffy",
      attachedDon: 1,
      currentPower: 6000,
    });
  });

  it("keeps given DON through the opponent turn and returns it on refresh", () => {
    let state = scenario();
    state.players.p1.activeDon = [];
    state.players.p1.board = [
      character("brook", "ST31-003", {
        attachedDon: ["given-1", "given-2", "given-3"],
      }),
    ];
    state.players.p1.deck = [card("p1-draw", "OP11-003")];
    state.players.p2.deck = [card("p2-draw", "FIX-001")];
    state = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    expect(state.players.p1.board[0]?.attachedDon).toHaveLength(3);
    state = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    expect(state.activePlayer).toBe("p1");
    expect(state.players.p1.board[0]?.attachedDon).toHaveLength(0);
    expect(state.players.p1.activeDon).toEqual(
      expect.arrayContaining(["given-1", "given-2", "given-3"]),
    );
  });

  it("plays a complete ST31 game through external observations", async () => {
    const service = new GameService();
    let observation = service.create({
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("FIXTURE-BLUE"),
      seed: "st31-fixed-seed",
    });
    const agents = {
      p1: new RulesFirstAgent(),
      p2: new RulesFirstAgent(),
    };
    let steps = 0;
    while (observation.phase !== "finished" && steps < 500) {
      const action =
        await agents[observation.activePlayer].chooseAction(observation);
      observation = service.act(
        observation.gameId,
        observation.revision,
        action.actionId,
      );
      steps += 1;
    }
    expect(observation.phase).toBe("finished");
    expect(observation.winner).not.toBeNull();
    expect(observation.resultReason).toBe("life");
    expect(steps).toBeLessThan(500);
  });
});
