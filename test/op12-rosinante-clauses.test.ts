import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The OP-12 Rosinante clauses `test/op12-rosinante.test.ts` leaves out.
 *
 * That file is built around the deck's own engine -- the alias clause, the
 * Leader's discount and its K.O. protection -- and never plays most of the
 * supporting list. These drive each of those cards' own printed text.
 */

/**
 * No shipped list fronts OP12-061, so the Leader is set over a shipped Purple
 * deck; every card driven here is placed by hand.
 */
const DECK = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP12-061";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function law() {
  return scenario()
    .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
    .withLeader("p1", LEADER)
    .atTurn(9, { active: "p1" })
    .bareTable();
}

describe("OP-12 Rosinante printed Blockers", () => {
  covers("ST10-010", "[Blocker]");
  covers("EB04-038", "[Blocker]");

  it.each(["ST10-010", "EB04-038"])(
    "%s blocks a declared attack and rests doing it",
    (cardNumber) => {
      const game = scenario()
        .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
        .withLeader("p2", LEADER)
        .seed(`rosinante-blocker-${cardNumber}`)
        .atTurn(5, { active: "p1" })
        .bareTable()
        .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
        .withBoard("p2", [character("blocker", cardNumber)])
        .build();

      expect(hasKeyword(game.state, "p2", "blocker", "Blocker")).toBe(true);
      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "p2-leader",
      });
      game.play({ type: "block", blockerInstanceId: "blocker" });

      expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
      expect(game.state.players.p2.board[0]?.rested).toBe(true);
    },
  );
});

describe("EB03-062 Trafalgar Law", () => {
  covers("EB03-062", "[Rush]", "[Activate: Main]");

  it("EB03-062:positive attacks the turn it is played", () => {
    const game = law()
      .seed("eb03-062-rush")
      .withHand("p1", [instance("law", "EB03-062")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-062" });
    expect(
      game.action({
        type: "attack",
        attackerInstanceId: "law",
        targetInstanceId: "p2-leader",
      }),
    ).toBeDefined();
  });

  it("EB03-062:positive trashes itself and a hand card to bank Life and play a cheaper Law", () => {
    const game = law()
      .seed("eb03-062-activate")
      .withBoard("p1", [character("law", "EB03-062", { playedTurn: 1 })])
      .withHand("p1", [
        instance("fodder", "OP12-112"),
        instance("small-law", "ST10-010"),
      ])
      .withDeckTop("p1", [instance("banked", "OP12-073")])
      .build();

    game.play({ type: "activate-main", summary: "Trafalgar Law" });
    while (game.state.pendingEffect) {
      const options = game
        .legalActions()
        .filter((action) => action.type === "resolve-effect");
      const wanted =
        options.find((action) => action.optionId === "fodder") ??
        options.find((action) => action.optionId === "small-law") ??
        options.find((action) => action.optionId === "apply") ??
        options[0]!;
      game.submit(wanted);
    }

    // The cost is itself plus a hand card; the payoff is a Life card off the
    // deck and a cost-7-or-less [Trafalgar Law] in play.
    expect(game.state.players.p1.life[0]?.instanceId).toBe("banked");
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "ST10-010",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual(
      expect.arrayContaining(["EB03-062", "OP12-112"]),
    );
  });
});

describe("OP09-069 Trafalgar Law On Play", () => {
  covers("OP09-069", "[On Play]");

  it("reveals a cost-2-or-more Heart Pirates card from the top four", () => {
    const game = law()
      .seed("op09-069-on-play")
      .withHand("p1", [instance("law", "OP09-069")])
      .withDeckTop("p1", [
        instance("too-cheap", "OP09-069"),
        instance("hit", "OP12-073"),
        instance("miss", "OP13-076"),
        instance("miss-2", "OP13-076"),
        instance("untouched", "OP12-073"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-069" });
    // The other Law costs 1, under the clause's "cost of 2 or more" floor.
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });

    // "[printed text omitted -- pnpm card:text OP09-069]" -- one
    // action carrying the whole order, offered as the order the look revealed.
    // This seat takes the offer; OP07-022's tests cover rewriting it.
    expect(effectOptions(game.state)).toEqual(["order:0,1,2"]);
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("untouched");
    expect(
      game.state.players.p1.deck.slice(-3).map((card) => card.instanceId),
    ).toEqual(["too-cheap", "miss", "miss-2"]);
  });
});

describe("OP10-065 Sugar Activate: Main", () => {
  covers("OP10-065", "[Activate: Main]");

  it("rests a DON!! and itself to find a Donquixote Pirates card", () => {
    const game = law()
      .seed("op10-065-activate")
      .withBoard("p1", [character("sugar", "OP10-065", { playedTurn: 1 })])
      .withDeckTop("p1", [
        instance("miss", "OP12-073"),
        instance("hit", "OP12-112"),
        instance("miss-2", "OP12-073"),
        instance("miss-3", "OP12-073"),
        instance("miss-4", "OP12-073"),
        instance("untouched", "OP12-073"),
      ])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", summary: "Sugar" });
    // Resting Sugar itself is the optional half of the cost; taking it is what
    // the deck does, and the search follows either way.
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "hit" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 1);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("untouched");
  });
});

describe("OP12-077 Extinguishes All Sound", () => {
  covers("OP12-077", "[Main]", "[Trigger]");

  it("OP12-077:positive buffs a [Trafalgar Law] and turns off the opponent's Blockers", () => {
    const game = law()
      .seed("op12-077-main")
      .withHand("p1", [instance("event", "OP12-077")])
      .withBoard("p1", [character("law", "ST10-010", { playedTurn: 1 })])
      .withBoard("p2", [character("blocker", "ST31-002")])
      .build();

    game.play({ type: "activate-main", summary: "[OP12-077]" });
    game.play({ type: "resolve-effect", optionId: "law" });
    expect(currentPower(game.state, "p1", "law", false)).toBe(7000);

    game.play({
      type: "attack",
      attackerInstanceId: "law",
      targetInstanceId: "p2-leader",
    });
    // Jinbe is an active printed Blocker and still cannot be offered.
    expect(
      game.legalActions("p2").filter((action) => action.type === "block"),
    ).toEqual([]);
  });

  it("OP12-077:positive draws 1 off its Life Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .withLeader("p2", LEADER)
      .seed("op12-077-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "OP12-077")])
      .withDeckTop("p2", [instance("drawn", "OP12-073")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
  });
});

describe("OP12-112 Baby 5 Trigger", () => {
  covers("OP12-112", "[Trigger]");

  it("draws 2 under a multicolored Leader", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .withLeader("p2", LEADER)
      .seed("op12-112-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "OP12-112")])
      .withDeckTop("p2", [
        instance("drawn-a", "OP12-073"),
        instance("drawn-b", "OP12-073"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    // The Rosinante Leader is Purple/Yellow, which is what the clause asks.
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["drawn-a", "drawn-b"]),
    );
  });
});

describe("OP13-076 Divine Departure", () => {
  covers("OP13-076", "[Main]", "[Counter]");

  it("OP13-076:positive rests 5 DON!! to give -8000 power with a given DON!! out", () => {
    const game = law()
      .seed("op13-076-main")
      .withHand("p1", [instance("event", "OP13-076")])
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p2", [character("target", "ST31-004")])
      .build();

    game.play({ type: "activate-main", summary: "[OP13-076]" });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -8000 }),
    );
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });

  it("OP13-076:positive trashes a hand card for +3000 in a battle", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op13-076-counter")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [
        instance("event", "OP13-076"),
        instance("fodder", "OP12-112"),
      ])
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

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
    }

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual(
      expect.arrayContaining(["OP13-076", "OP12-112"]),
    );
  });
});

describe("OP14-061 Vergo", () => {
  covers("OP14-061", "[When Attacking]", "static");

  it("OP14-061:positive returns a DON!! to give -2000 power on the attack", () => {
    const game = law()
      .seed("op14-061-attacking")
      .withBoard("p1", [character("vergo", "OP14-061", { playedTurn: 1 })])
      .withBoard("p2", [character("target", "ST31-002", { rested: true })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "vergo",
      targetInstanceId: "target",
    });
    while (game.state.pendingEffect) {
      const options = game
        .legalActions()
        .filter((action) => action.type === "resolve-effect");
      const wanted =
        options.find((action) => action.optionId === "apply") ??
        options.find((action) => action.optionId === "target") ??
        options[0]!;
      game.submit(wanted);
    }

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000 }),
    );
  });

  it("OP14-061:positive returns a DON!! instead of losing a Donquixote Pirates Character", () => {
    const game = scenario()
      .decks("(Red/Black) Sabo - Starter Deck 35", DECK)
      .withLeader("p2", LEADER)
      .seed("op14-061-replacement")
      .atTurn(9, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("hack", "ST35-001")])
      .withBoard("p2", [
        character("vergo", "OP14-061"),
        // Sugar is 1000 power and {Donquixote Pirates}, so Hack's K.O. reaches
        // it and Vergo's replacement covers it.
        character("threatened", "OP10-065"),
      ])
      .withDon("p2", { active: 1 })
      .build();
    const p2DonBefore = game.state.players.p2.activeDon.length;

    game.play({ type: "play-card", cardNumber: "ST35-001" });
    game.play({ type: "resolve-effect", optionId: "threatened" });

    // The choice belongs to Sugar's controller, who pays a DON!! to keep it.
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", summary: "DON!!" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "vergo",
      "threatened",
    ]);
    expect(game.state.players.p2.activeDon.length).toBe(p2DonBefore - 1);
  });
});

describe("ST18-001 Uso-Hachi On Play", () => {
  covers("ST18-001", "[On Play]");

  it("rests a cost-5-or-less Character with 8 or more DON!! out", () => {
    const game = law()
      .seed("st18-001-on-play")
      .withHand("p1", [instance("uso-hachi", "ST18-001")])
      .withBoard("p2", [
        character("reachable", "ST31-002"),
        character("too-big", "ST31-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST18-001" });
    // Jinbe costs 5, the 7-cost Luffy is out of reach.
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });

    expect(
      game.state.players.p2.board.map((card) => [card.instanceId, card.rested]),
    ).toEqual([
      ["reachable", true],
      ["too-big", false],
    ]);
  });
});
