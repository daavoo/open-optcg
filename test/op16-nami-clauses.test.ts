import { describe, expect, it } from "vitest";
import { getLegalActions, type GameState } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The OP-16 Nami clauses `test/op16-nami.test.ts` leaves out: the three printed
 * [Blocker]s, whose cards it only uses as fodder, and Dr. Hogback's two
 * recursion clauses.
 */

const DECK = "(Blue/Yellow) Nami - Official Feature Deck";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("OP-16 Nami printed Blockers", () => {
  covers("PRB02-008", "[Blocker]");
  covers("EB04-058", "[Blocker]");
  covers("OP13-042", "[Blocker]");

  it.each(["PRB02-008", "EB04-058", "OP13-042"])(
    "%s blocks a declared attack and rests doing it",
    (cardNumber) => {
      const game = scenario()
        .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
        .seed(`nami-blocker-${cardNumber}`)
        .atTurn(5, { active: "p1" })
        .bareTable()
        .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
        .withBoard("p2", [character("blocker", cardNumber)])
        .build();

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

describe("OP14-110 Dr. Hogback", () => {
  covers("OP14-110", "[On K.O.]", "[Trigger]");

  it("OP14-110:positive plays a cost-4 [Trigger] Character from the trash when it dies", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op14-110-on-ko")
      .atTurn(5, { active: "p1" })
      .bareTable()
      // 6000 power beats Hogback's 5000, so the battle K.O.s it.
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withBoard("p2", [character("hogback", "OP14-110", { rested: true })])
      .withTrash("p2", [
        instance("kumacy", "OP14-102"),
        instance("moria", "OP14-104"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "hogback",
    });
    game.pass();
    game.pass();

    // Kumacy costs 1 and prints a [Trigger]; the 8-cost Moria is out of reach.
    expect(effectOptions(game.state)).toEqual(["kumacy", "done"]);
    game.play({ type: "resolve-effect", optionId: "kumacy" });
    expect(game.state.players.p2.board.map((card) => card.cardNumber)).toEqual([
      "OP14-102",
    ]);
  });

  it("OP14-110:positive plays a Thriller Bark body rested off its own Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op14-110-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "OP14-110")])
      .withTrash("p2", [instance("kumacy", "OP14-102")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.pass();
    expect(game.state.phase).toBe("trigger");

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "kumacy" });
    }

    // "rested" is the Trigger's own word, and it is the difference between a
    // free blocker and a free body.
    expect(game.state.players.p2.board).toMatchObject([
      { cardNumber: "OP14-102", rested: true },
    ]);
  });
});

describe("OP14-104 Gecko Moria Trigger", () => {
  covers("OP14-104", "[Trigger]");

  it("OP14-104:positive plays a cost-4-or-less Character from the trash", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op14-104-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-trigger", "OP14-104")])
      .withTrash("p2", [
        instance("hogback", "OP14-110"),
        instance("newgate", "OP13-042"),
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

    // Hogback costs 4; the 10-cost Newgate is not a candidate. Unlike
    // Hogback's own Trigger, this one plays the body active.
    expect(effectOptions(game.state)).toEqual(["hogback", "done"]);
    game.play({ type: "resolve-effect", optionId: "hogback" });
    expect(game.state.players.p2.board).toMatchObject([
      { cardNumber: "OP14-110", rested: false },
    ]);
  });
});
