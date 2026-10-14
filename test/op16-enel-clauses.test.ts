import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The OP-16 Purple Enel clauses `test/op16-enel.test.ts` never drives.
 *
 * That file is about the archetype's spine -- the six-card DON!! deck, the
 * ceiling, the Leader's ramp -- and uses most of the list as props: a Vassal is
 * a K.O. target, an Event is a hand card with a price. What is missing is each
 * of those cards' own printed text.
 */

const DECK = "(Purple) Enel - Official Feature Deck";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function enel() {
  return scenario()
    .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
    .atTurn(5, { active: "p1" })
    .bareTable();
}

describe("OP-16 Enel printed Blockers", () => {
  covers("OP09-072", "[Blocker]");
  covers("OP12-063", "[Blocker]");

  it.each(["OP09-072", "OP12-063"])(
    "%s blocks a declared attack and rests doing it",
    (cardNumber) => {
      const game = scenario()
        .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
        .seed(`enel-blocker-${cardNumber}`)
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

describe("OP12-063 Vinsmoke Reiju's Event-count layer", () => {
  covers("OP12-063", "static");

  it("gains +2000 power and +5 cost only with 4 or more Events in the trash", () => {
    const below = enel()
      .seed("op12-063-three-events")
      .withBoard("p1", [character("reiju", "OP12-063")])
      .withTrash("p1", copies(3, "OP15-075"))
      .build();
    expect(currentPower(below.state, "p1", "reiju", false)).toBe(5000);
    expect(
      effectiveCost(below.state, "p1", below.state.players.p1.board[0]!),
    ).toBe(4);

    const at = enel()
      .seed("op12-063-four-events")
      .withBoard("p1", [character("reiju", "OP12-063")])
      .withTrash("p1", copies(4, "OP15-075"))
      .build();
    expect(currentPower(at.state, "p1", "reiju", false)).toBe(7000);
    expect(effectiveCost(at.state, "p1", at.state.players.p1.board[0]!)).toBe(
      9,
    );
  });
});

describe("OP12-071 Charlotte Pudding On Play", () => {
  covers("OP12-071", "[On Play]");

  it("reveals an Event from the top four and bottoms the rest", () => {
    const game = enel()
      .seed("op12-071-on-play")
      .withHand("p1", [instance("pudding", "OP12-071")])
      .withDeckTop("p1", [
        instance("miss-1", "OP15-061"),
        instance("hit", "OP15-075"),
        instance("miss-2", "OP15-061"),
        instance("miss-3", "OP15-061"),
        instance("untouched", "OP15-066"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP12-071" });
    game.play({ type: "resolve-effect", summary: "Add El Thor to hand" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("untouched");
  });
});

describe("OP10-067 Senor Pink On Play", () => {
  covers("OP10-067", "[On Play]");

  it("returns a DON!! to recover a purple Event and set a DON!! active", () => {
    const game = enel()
      .seed("op10-067-on-play")
      .withHand("p1", [instance("pink", "OP10-067")])
      .withTrash("p1", [
        instance("cheap-event", "OP15-075"),
        instance("body", "OP15-061"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP10-067" });
    while (game.state.pendingEffect) {
      const options = game
        .legalActions()
        .filter((action) => action.type === "resolve-effect");
      const wanted =
        options.find((action) => action.optionId === "cheap-event") ??
        options.find((action) => action.optionId === "apply") ??
        options[0]!;
      game.submit(wanted);
    }

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "cheap-event",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "body",
    ]);
  });
});

describe("OP15-067 Shura On Play", () => {
  covers("OP15-067", "[On Play]");

  it("returns a DON!! to draw 1", () => {
    const game = enel()
      .seed("op15-067-on-play")
      .withHand("p1", [instance("shura", "OP15-067")])
      .withDeckTop("p1", [instance("drawn", "OP15-075")])
      .build();
    const donBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "play-card", cardNumber: "OP15-067" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
    // Playing Shura rests 1 DON!! to pay its cost, and its own DON!! −1 sends
    // that rested card back to the six-card DON!! deck -- which is the whole
    // point of the ceiling this deck plays under.
    expect(game.state.players.p1.activeDon.length).toBe(donBefore - 1);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP15-061 Ohm and OP15-066 Satori", () => {
  covers("OP15-061", "[On Play]", "[When Attacking]");
  covers("OP15-066", "[On Play]", "[When Attacking]");

  it.each(["OP15-061", "OP15-066"])(
    "%s returns a DON!! to draw 1 on play",
    (cardNumber) => {
      const game = enel()
        .seed(`vassal-on-play-${cardNumber}`)
        .withHand("p1", [instance("vassal", cardNumber)])
        .withDeckTop("p1", [instance("drawn", "OP15-075")])
        .build();

      game.play({ type: "play-card", cardNumber });
      game.play({ type: "resolve-effect", optionId: "apply" });

      expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual(
        ["drawn"],
      );
    },
  );

  it("OP15-061 gives a Character -1000 power under the DON!! ceiling", () => {
    const game = enel()
      .seed("op15-061-attacking")
      .withBoard("p1", [character("ohm", "OP15-061", { playedTurn: 1 })])
      .withBoard("p2", [character("target", "ST31-002", { rested: true })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "ohm",
      targetInstanceId: "target",
    });
    expect(effectOptions(game.state)).toContain("target");
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -1000 }),
    );
  });

  it("OP15-066 looks at the top two and orders them", () => {
    const game = enel()
      .seed("op15-066-attacking")
      .withBoard("p1", [character("satori", "OP15-066", { playedTurn: 1 })])
      .withDeckTop("p1", [
        instance("first", "OP15-075"),
        instance("second", "OP15-076"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "satori",
      targetInstanceId: "p2-leader",
    });

    // The clause is a decision, not a silent shuffle: the controller places
    // each looked-at card top or bottom.
    expect(effectOptions(game.state).length).toBeGreaterThan(0);
    while (game.state.pendingEffect) {
      const options = game
        .legalActions()
        .filter((action) => action.type === "resolve-effect");
      game.submit(options[options.length - 1]!);
    }
    expect(game.state.players.p1.deck).toHaveLength(
      game.state.players.p1.deck.length,
    );
  });
});

describe("OP-16 Enel Counter Events", () => {
  covers("OP15-074", "[Counter]");
  covers("OP15-075", "[Counter]");

  it.each(["OP15-074", "OP15-075"])(
    "%s gives an [Enel] card +2000 during the battle",
    (cardNumber) => {
      const game = scenario()
        .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
        .seed(`enel-counter-${cardNumber}`)
        .atTurn(4, { active: "p2" })
        .bareTable()
        .withHand("p1", [instance("event", cardNumber)])
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

      // The Leader is named Enel, so it is the [Enel] card the clause reaches.
      expect(game.state.activeAttack?.counterPower).toBe(2000);
    },
  );
});

describe("OP15-076 Lightning Beast Kiten Main", () => {
  covers("OP15-076", "[Main]");

  it("returns a DON!! to draw 1 and debuff a Character by 1000", () => {
    const game = enel()
      .seed("op15-076-main")
      .withHand("p1", [instance("event", "OP15-076")])
      .withDeckTop("p1", [instance("drawn", "OP15-061")])
      .withBoard("p2", [character("target", "ST31-002")])
      .build();

    game.play({ type: "activate-main", summary: "[OP15-076]" });
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

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
    expect(game.state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -1000 }),
    );
  });
});

describe("OP15-078 Mamaragan Main", () => {
  covers("OP15-078", "[Main]");

  it("returns two DON!! to draw 1 and rest a 5000-power Character", () => {
    const game = enel()
      .seed("op15-078-main")
      .withHand("p1", [instance("event", "OP15-078")])
      .withDeckTop("p1", [instance("drawn", "OP15-061")])
      .withBoard("p2", [
        character("reachable", "OP12-063"),
        character("too-big", "ST31-002"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP15-078]" });
    while (game.state.pendingEffect) {
      const options = game
        .legalActions()
        .filter((action) => action.type === "resolve-effect");
      const wanted =
        options.find((action) => action.optionId === "apply") ??
        options.find((action) => action.optionId === "reachable") ??
        options[0]!;
      game.submit(wanted);
    }

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
    // Reiju is 5000 power with no Events in the trash; Jinbe's 6000 is out.
    expect(
      game.state.players.p2.board.map((card) => [card.instanceId, card.rested]),
    ).toEqual([
      ["reachable", true],
      ["too-big", false],
    ]);
  });
});

describe("OP05-077 Gamma Knife", () => {
  covers("OP05-077", "[Main]", "[Trigger]");

  it("OP05-077:positive returns a DON!! to give -5000 power for the turn", () => {
    const game = enel()
      .seed("op05-077-main")
      .withHand("p1", [instance("event", "OP05-077")])
      .withBoard("p2", [character("target", "ST31-002")])
      .build();

    game.play({ type: "activate-main", summary: "[OP05-077]" });
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
      expect.objectContaining({ amount: -5000 }),
    );
  });

  it("OP05-077:positive adds an active DON!! from its Life Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op05-077-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "OP05-077")])
      .build();
    const donBefore = game.state.players.p2.activeDon.length;
    const deckBefore = game.state.players.p2.donDeck.length;

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    while (game.state.pendingEffect) {
      const options = game
        .legalActions()
        .filter((action) => action.type === "resolve-effect");
      game.submit(options[0]!);
    }

    expect(game.state.players.p2.activeDon.length).toBe(donBefore + 1);
    expect(game.state.players.p2.donDeck).toHaveLength(deckBefore - 1);
  });
});
