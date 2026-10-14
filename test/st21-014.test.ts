import { describe, expect, it } from "vitest";
import { getLegalActions, hasKeyword } from "@one-piece-sim/engine-core";
import { cardFacts, requireKnownCard } from "@one-piece-sim/cards";
import { character, scenario, type Game } from "./support/index.js";

/**
 * Written against `test/support`. `[When Attacking]` gifts a rested DON!!, so
 * every scenario here is "an empty table, this many rested DON!!, attack" --
 * `bareTable()` states that premise once instead of assembling it per test.
 */
function table(options: { rested?: number; board?: string[] } = {}): Game {
  let builder = scenario()
    .decks("(Red) Monkey.D.Luffy - Starter Deck 31", "FIXTURE-BLUE")
    .seed("st21-014-seed")
    .atTurn(3, { active: "p1" })
    .bareTable()
    .withBoard(
      "p1",
      (options.board ?? ["luffy:ST21-014"]).map((entry) => {
        const [instanceId = "", cardNumber = ""] = entry.split(":");
        return character(instanceId, cardNumber);
      }),
    );
  if (options.rested !== undefined) {
    builder = builder.withDon("p1", { rested: options.rested });
  }
  return builder.build();
}

const LUFFY_AND_JINBE = ["luffy:ST21-014", "jinbe:ST31-002"];

function effectOptions(game: Game): string[] {
  return getLegalActions(game.state, game.state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("ST21-014 Monkey.D.Luffy", () => {
  it("registers as an implemented Red Straw Hat Crew body with Rush", () => {
    const luffy = requireKnownCard("ST21-014");

    expect(luffy.types).toEqual(["The Four Emperors", "Straw Hat Crew"]);
    expect(luffy.colors).toContain("Red");
    expect(luffy.attribute).toBe("Strike");
    expect(luffy.rules.clauses).toContain("[When Attacking]");
    expect(cardFacts("ST21-014").cost).toBe(5);
    expect(cardFacts("ST21-014").power).toBe(6000);
    expect(cardFacts("ST21-014").counter).toBe(0);
    // Unconditional printed Rush is derived from text.
    expect(cardFacts("ST21-014").keywords).toContain("Rush");
  });

  it("is a Rush body with no attached DON!!", () => {
    const game = table();

    expect(hasKeyword(game.state, "p1", "luffy", "Rush")).toBe(true);
    expect(
      game
        .legalActions("p1")
        .filter(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "luffy",
        ).length,
    ).toBeGreaterThan(0);
  });

  it("gives 1 rested DON!! to a chosen Character on attack", () => {
    const game = table({ rested: 2, board: LUFFY_AND_JINBE });
    const [given, kept] = game.state.players.p1.restedDon;

    game.play({ type: "attack", attackerInstanceId: "luffy" });

    // The [When Attacking] gift suspends before the Block window: options are
    // the Leader, every Character (including Luffy himself), and decline.
    expect(effectOptions(game)).toEqual([
      "p1-leader",
      "luffy",
      "jinbe",
      "skip",
    ]);
    game.play({ type: "resolve-effect", optionId: "jinbe" });

    expect(game.state.players.p1.restedDon).toEqual([kept]);
    expect(
      game.state.players.p1.board.find((entry) => entry.instanceId === "jinbe")
        ?.attachedDon,
    ).toEqual([given]);
    expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
    expect(game.state.pendingEffect).toBeNull();
  });

  it("can give the rested DON!! to the Leader instead", () => {
    const game = table({ rested: 1 });
    const [given] = game.state.players.p1.restedDon;

    game.play({ type: "attack", attackerInstanceId: "luffy" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(game.state.players.p1.restedDon).toEqual([]);
    expect(game.state.players.p1.leaderAttachedDon).toEqual([given]);
    expect(
      game.state.players.p1.board.find((entry) => entry.instanceId === "luffy")
        ?.attachedDon,
    ).toEqual([]);
  });

  it("declining the gift leaves every DON!! where it was", () => {
    const game = table({ rested: 2, board: LUFFY_AND_JINBE });
    const rested = [...game.state.players.p1.restedDon];

    game.play({ type: "attack", attackerInstanceId: "luffy" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.restedDon).toEqual(rested);
    expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
    expect(
      game.state.players.p1.board.find((entry) => entry.instanceId === "jinbe")
        ?.attachedDon,
    ).toEqual([]);
    expect(game.state.pendingEffect).toBeNull();
  });

  it("moves at most one rested DON!! even with several available", () => {
    const game = table({ rested: 3, board: LUFFY_AND_JINBE });

    game.play({ type: "attack", attackerInstanceId: "luffy" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });

    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(
      game.state.players.p1.board.find((entry) => entry.instanceId === "jinbe")
        ?.attachedDon,
    ).toHaveLength(1);
  });

  it("offers no gift choice when there is no rested DON!!", () => {
    const game = table({ board: LUFFY_AND_JINBE });

    game.play({ type: "attack", attackerInstanceId: "luffy" });

    // No rested DON!! to give: the attack goes straight to the Block window.
    expect(effectOptions(game)).toEqual([]);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
  });
});
