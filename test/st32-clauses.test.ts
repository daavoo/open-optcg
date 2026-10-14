import { describe, expect, it } from "vitest";
import { getLegalActions, type GameState } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The ST32 clauses `test/st32.test.ts` leaves uncovered.
 *
 * A separate file rather than more cases in that one: its scaffolding is the
 * hand-rolled `scenario()` that predates `test/support`, and importing the
 * builder there would collide with it. New cases go through the builder, so
 * they reach their position through the engine's own actions.
 */

const DECK = "(Green) Roronoa Zoro - Starter Deck 32";

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("ST32-005 Roronoa Zoro", () => {
  covers("ST32-005", "[On Play]", "[Rush: Character]");

  it("ST32-005:positive rests a cost-2 Character and can attack Characters at once", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("st32-005-positive")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("zoro", "ST32-005")])
      .withBoard("p2", [
        character("brook", "ST31-003"),
        character("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST32-005" });
    // Brook costs 2 and Jinbe 5, so only Brook is a legal rest target; "skip"
    // is the printed "up to 1".
    expect(effectOptions(game.state)).toEqual(["brook", "skip"]);
    game.play({ type: "resolve-effect", optionId: "brook" });
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "brook")
        ?.rested,
    ).toBe(true);

    // [Rush: Character] is the whole point of the body: played this turn, it may
    // attack a Character -- the one its own [On Play] just rested, since only
    // rested Characters are legal targets -- but never the Leader.
    const targets = game
      .legalActions()
      .flatMap((action) =>
        action.type === "attack" && action.attackerInstanceId === "zoro"
          ? [action.targetInstanceId]
          : [],
      );
    expect(targets).toContain("brook");
    expect(targets).not.toContain("p2-leader");
  });

  it("ST32-005:boundary offers no rest target when every Character costs more than 2", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("st32-005-boundary")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("zoro", "ST32-005")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST32-005" });
    // With no legal target the clause has no decision to offer at all, so the
    // Character resolves onto the board and play returns to the main phase.
    expect(game.state.pendingEffect).toBeNull();
    expect(effectOptions(game.state)).toEqual([]);
    expect(game.state.players.p2.board.map((card) => card.rested)).toEqual([
      false,
    ]);
  });
});

describe("OP12-027 Koushirou Blocker", () => {
  covers("OP12-027", "[Blocker]");

  it("OP12-027:positive becomes the target of the attack and rests", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op12-027-blocker")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withBoard("p2", [character("koushirou", "OP12-027")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "koushirou" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("koushirou");
    expect(
      game.state.players.p2.board.find(
        (card) => card.instanceId === "koushirou",
      )?.rested,
    ).toBe(true);
  });

  it("OP12-027:boundary cannot block again once it is rested", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op12-027-rested")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withBoard("p2", [character("koushirou", "OP12-027", { rested: true })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    expect(
      game.legalActions("p2").filter((action) => action.type === "block"),
    ).toEqual([]);
  });
});

describe("OP15-036 Ryuma When Attacking", () => {
  covers("OP15-036", "[When Attacking]");

  it("OP15-036:positive K.O.s a rested cost-4 Character on the attack", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op15-036-attacking")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("ryuma", "OP15-036", { playedTurn: 1 })])
      .withBoard("p2", [
        character("franky", "OP11-012", { rested: true }),
        character("jinbe", "ST31-002", { rested: true }),
      ])
      .withLife("p2", [instance("p2-life", "ST31-003")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "ryuma",
      targetInstanceId: "p2-leader",
    });
    // Franky costs 4 and Jinbe 5, so the clause reaches only Franky.
    expect(effectOptions(game.state)).toEqual(["franky", "skip"]);
    game.play({ type: "resolve-effect", optionId: "franky" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "jinbe",
    ]);
  });
});
