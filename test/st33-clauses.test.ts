import { describe, expect, it } from "vitest";
import {
  effectiveCost,
  getLegalActions,
  type GameState,
} from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The ST33 clauses `test/st33.test.ts` does not drive through the engine.
 *
 * Several of them are exercised there only as agent decisions -- the test hands
 * `St33RulesAgent` a `pendingEffect` it assembled itself and asserts which
 * option it picks, which is evidence about the policy and not about the clause.
 * These drive the same clauses from a played card.
 */

const DECK = "(Blue) Kuzan - Starter Deck 33";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("EB04-026 Bluegrass On Play", () => {
  covers("EB04-026", "[On Play]");

  it("EB04-026:positive bottom-decks a cost-1 Character", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("eb04-026-positive")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("bluegrass", "EB04-026")])
      .withBoard("p2", [
        character("nami", "OP01-016"),
        character("brook", "ST31-003"),
      ])
      .withDeckTop("p2", [instance("p2-top", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-026" });
    // Nami costs 1 and Brook 2, so only Nami is in reach.
    expect(effectOptions(game.state)).toEqual(["nami", "done"]);
    game.play({ type: "resolve-effect", optionId: "nami" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "brook",
    ]);
    expect(game.state.players.p2.deck.at(-1)).toMatchObject({
      instanceId: "nami",
    });
  });

  it("EB04-026:boundary leaves a cost-2 Character alone", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("eb04-026-boundary")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("bluegrass", "EB04-026")])
      .withBoard("p2", [character("brook", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-026" });
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "brook",
    ]);
  });
});

describe("OP12-043 Kuzan", () => {
  covers("OP12-043", "[On Play]", "static");

  it("OP12-043:positive trashes a card to stop a Character attacking", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op12-043-positive")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("kuzan", "OP12-043"),
        instance("fodder", "OP12-045"),
      ])
      .withBoard("p2", [character("blocker", "ST31-002", { rested: true })])
      .withDon("p1", { active: 6 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-043" });
    // The hand cost is optional, so declining it is offered alongside paying.
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "blocker" });

    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "fodder",
    ]);
    expect(game.state.pendingEffect).toBeNull();

    // The lock is what the clause buys: on their turn, that Character cannot
    // declare an attack.
    game.pass();
    const attackers = game
      .legalActions("p2")
      .flatMap((action) =>
        action.type === "attack" ? [action.attackerInstanceId] : [],
      );
    expect(attackers).not.toContain("blocker");
  });

  it("OP12-043:boundary gains its +1 field cost only at five cards in hand", () => {
    // The layer raises the cost of the *Character*, which is what "cost 8 or
    // more" effects read; it deliberately leaves the play cost at 6.
    const boardCost = (hand: number): number | undefined => {
      const game = scenario()
        .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
        .seed(`op12-043-hand-${hand}`)
        .atTurn(5, { active: "p1" })
        .bareTable()
        .withBoard("p1", [character("kuzan", "OP12-043")])
        .withHand(
          "p1",
          Array.from({ length: hand }, (_, index) =>
            instance(`filler-${index}`, "OP12-045"),
          ),
        )
        .build();
      const kuzan = game.state.players.p1.board[0];
      if (!kuzan) throw new Error("Kuzan is not on the board");
      return effectiveCost(game.state, "p1", kuzan);
    };
    expect(boardCost(4)).toBe(6);
    expect(boardCost(5)).toBe(7);
  });
});

describe("OP12-057 Ice Block Pheasant Peck", () => {
  covers("OP12-057", "[Counter]", "[Trigger]");

  it("OP12-057:positive adds +4000 in the battle and trashes a card", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op12-057-counter")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [
        instance("ice-block", "OP12-057"),
        instance("fodder", "OP12-045"),
      ])
      .withDon("p1", { active: 1 })
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "ice-block" });
    // The Leader is the only card that can take the +4000, so the engine grants
    // it without a decision and asks only for the trash.
    expect(game.state.activeAttack?.counterPower).toBe(4000);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    // The discard is the printed cost's second half, not optional: "[printed text omitted -- pnpm card:text <card>]"
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual(
      [],
    );
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual(
      expect.arrayContaining(["OP12-057", "OP12-045"]),
    );
  });

  it("OP12-057:positive trashes a card to draw one off the Life Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op12-057-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withHand("p2", [instance("fodder", "OP12-045")])
      .withLife("p2", [instance("life-trigger", "OP12-057")])
      .withDeckTop("p2", [instance("drawn", "OP12-052")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    expect(game.state.phase).toBe("trigger");

    // Taking the Trigger rather than the Life card, then paying its optional
    // trash to draw.
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    // The trigger draw, not the Life card: taking the Trigger trashes it.
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
    expect(
      game.state.players.p2.hand.map((card) => card.instanceId),
    ).not.toContain("fodder");
    // The Trigger card itself goes to the trash with the card it charged.
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "life-trigger",
      "fodder",
    ]);
    // The Trigger interrupted p1's attack; resolving it hands the turn back.
    // The draw arm of the trash step used to skip the handback, leaving p2
    // active in their opponent's Main phase with a full set of legal attacks.
    expect(game.state.activePlayer).toBe("p1");
    expect(game.state.phase).toBe("main");
    expect(game.state.turnPlayerId).toBe("p1");
  });

  it("OP12-057:positive declining the trash also hands the turn back", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op12-057-trigger-skip")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withHand("p2", [instance("fodder", "OP12-045")])
      .withLife("p2", [instance("life-trigger", "OP12-057")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.activePlayer).toBe("p1");
    expect(game.state.phase).toBe("main");
  });
});

describe("EB04-028 Ice Time Trigger", () => {
  covers("EB04-028", "[Trigger]");

  it("EB04-028:positive returns a cost-5 Character to its owner's hand", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("eb04-028-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("jinbe", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "EB04-028")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    expect(game.state.phase).toBe("trigger");

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST31-002",
    );
  });
});

describe("ST33-002 Sakazuki On K.O.", () => {
  covers("ST33-002", "[On K.O.]");

  it("ST33-002:positive free-plays a cost-4 Navy body when it is K.O.'d in battle", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("st33-002-on-ko")
      .atTurn(5, { active: "p1" })
      .bareTable()
      // 6000 power beats Sakazuki's 5000, so the battle K.O.s it.
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withBoard("p2", [character("sakazuki", "ST33-002", { rested: true })])
      .withHand("p2", [
        instance("bluegrass", "EB04-026"),
        instance("garp", "ST33-005"),
      ])
      .build();
    const donBefore = game.state.players.p2.activeDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "sakazuki",
    });
    game.pass();
    game.pass();

    // The K.O.'d card's controller chooses, and only the cost-4 body is in
    // reach -- Garp costs 6. The free play spends no DON!!.
    expect(effectOptions(game.state)).toEqual(["bluegrass", "skip"]);
    game.play({ type: "resolve-effect", optionId: "bluegrass" });
    expect(game.state.players.p2.board.map((card) => card.cardNumber)).toEqual([
      "EB04-026",
    ]);
    expect(game.state.players.p2.activeDon).toHaveLength(donBefore);
  });
});

describe("OP12-046 Zephyr(Navy) Activate: Main", () => {
  covers("OP12-046", "[Activate: Main]");

  it("OP12-046:positive trashes itself to return a cost-5 Character", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op12-046-activate")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("zephyr", "OP12-046", { playedTurn: 1 })])
      .withBoard("p2", [
        character("jinbe", "ST31-002"),
        character("big-luffy", "ST31-004"),
      ])
      .build();

    // One offer, not one per target: the target is the choice the activation
    // opens. Jinbe costs 5 and the 7-cost Luffy is out of reach, so it is the
    // only card that choice can name.
    const activations = game
      .legalActions()
      .filter((action) => action.type === "activate-main");
    expect(activations.map((action) => action.optionId)).toEqual([
      "mechanic-main:zephyr",
    ]);

    game.submit(activations[0]!);
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big-luffy",
    ]);
    expect(game.state.players.p2.hand.map((card) => card.cardNumber)).toContain(
      "ST31-002",
    );
    // The cost is the Character itself.
    expect(game.state.players.p1.board).toEqual([]);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP12-046",
    ]);
  });
});
