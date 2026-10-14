import { describe, expect, it } from "vitest";
import { getLegalActions, type GameState } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The two ST34 [On K.O.] clauses `test/st34.test.ts` checks by calling
 * `createOnKoEffect` directly.
 *
 * That asserts the effect the constructor *would* build; it does not put the
 * card on a board, K.O. it in a battle, and take the resulting decision -- so it
 * cannot catch the K.O. never reaching the hook, or the free play being offered
 * to the wrong seat. These drive both from a declared attack.
 */

const DECK = "(Purple) Charlotte Katakuri - Starter Deck 34";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("ST34-001 Charlotte Katakuri On K.O.", () => {
  covers("ST34-001", "[On K.O.]");

  it("ST34-001:positive free-plays an 8000-power body when it is K.O.'d in battle", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("st34-001-on-ko")
      .atTurn(5, { active: "p1" })
      .bareTable()
      // 9000 power beats Katakuri's 7000, so the battle K.O.s it.
      .withBoard("p1", [character("big-luffy", "ST31-004", { playedTurn: 1 })])
      .withBoard("p2", [character("katakuri", "ST34-001", { rested: true })])
      .withHand("p2", [
        instance("daifuku", "OP11-068"),
        instance("linlin", "ST34-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "big-luffy",
      targetInstanceId: "katakuri",
    });
    // The ST34 Leader's [On Your Opponent's Attack] asks first; declining it
    // keeps this test about Katakuri.
    game.play({ type: "resolve-effect", optionId: "skip" });
    game.pass();
    game.pass();

    // Daifuku is 7000 power; the 12000-power Linlin is out of the clause's
    // reach, and the choice belongs to Katakuri's controller.
    expect(game.state.activePlayer).toBe("p2");
    expect(effectOptions(game.state)).toEqual(["daifuku", "skip"]);
    game.play({ type: "resolve-effect", optionId: "daifuku" });
    expect(game.state.players.p2.board.map((card) => card.cardNumber)).toEqual([
      "OP11-068",
    ]);
  });

  it("ST34-001:boundary offers nothing playable when the hand is all oversized", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("st34-001-boundary")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("big-luffy", "ST31-004", { playedTurn: 1 })])
      .withBoard("p2", [character("katakuri", "ST34-001", { rested: true })])
      .withHand("p2", [instance("linlin", "ST34-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "big-luffy",
      targetInstanceId: "katakuri",
    });
    game.play({ type: "resolve-effect", optionId: "skip" });
    game.pass();
    game.pass();

    expect(game.state.players.p2.board).toEqual([]);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "linlin",
    ]);
  });
});

describe("P-090 Charlotte Smoothie Opponent's Turn On K.O.", () => {
  covers("P-090", "[Opponent's Turn]", "[On K.O.]");

  it("P-090:positive returns a DON!! to play a body within the opponent's DON!! count", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("p-090-on-ko")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("big-luffy", "ST31-004", { playedTurn: 1 })])
      .withBoard("p2", [character("smoothie", "P-090", { rested: true })])
      .withHand("p2", [
        instance("brulee", "ST34-003"),
        instance("cracker", "ST34-002"),
      ])
      .build();
    const donBefore = game.state.players.p2.activeDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "big-luffy",
      targetInstanceId: "smoothie",
    });
    game.play({ type: "resolve-effect", optionId: "skip" });
    game.pass();
    game.pass();

    // The clause is [Opponent's Turn] only, and this is p1's turn, so it is
    // live: p2 pays DON!! −1 and plays a body costing no more than p1's DON!!.
    expect(game.state.activePlayer).toBe("p2");
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["brulee", "cracker"]),
    );
    game.play({ type: "resolve-effect", optionId: "cracker" });
    expect(
      game.state.players.p2.board.map((card) => card.cardNumber),
    ).toContain("ST34-002");
    expect(game.state.players.p2.activeDon.length).toBe(donBefore - 1);
  });
});
