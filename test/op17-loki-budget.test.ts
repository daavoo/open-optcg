import { describe, expect, it } from "vitest";
import { effectiveCost } from "@one-piece-sim/engine-core";
import { character, covers, scenario } from "./support/index.js";

describe("OP17-119 Loki's budget reads current cost", () => {
  covers("OP17-119", "[On Play]");
  // Pins a reported K.O. of a 4-cost Franky that OP09-061's Leader had raised
  // to 5: the budget is charged at the cost the board shows, so a DON!! given
  // to that Leader on its own turn still lifts the Character out of reach when
  // Loki lands on the next one.
  it("excludes a Character OP09-061 raised past the budget", () => {
    const game = scenario()
      .decks(
        "(Black) Monkey.D.Luffy - Official Feature Deck",
        "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
      )
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withLeader("p2", "OP09-061")
      .withDon("p2", { active: 4 })
      .withDon("p1", { active: 6 })
      .withHand("p1", [character("loki", "OP17-119")])
      .withDeckTop("p1", [character("draw", "OP17-032")])
      .withBoard("p2", [
        character("franky", "OP09-072"), // 4 printed
        character("limejuice", "OP17-032"), // 1 printed
        character("kyo", "OP17-045"), // 2 printed
      ])
      .build();
    game.play(
      (action) =>
        action.type === "attach-don" && action.summary.includes("OP09-061"),
    );
    game.pass();

    const costs = Object.fromEntries(
      game.state.players.p2.board.map((card) => [
        card.instanceId,
        effectiveCost(game.state, "p2", card),
      ]),
    );
    expect(costs).toEqual({ franky: 5, limejuice: 2, kyo: 3 });

    game.play({ type: "play-card", cardNumber: "OP17-119" });
    // Franky at 5 is never on offer; either of the others is, and so is
    // stopping, because the clause is "any number".
    const offered = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId)
      .sort();
    expect(offered).toEqual(["done", "kyo", "limejuice"]);

    game.play({ type: "resolve-effect", optionId: "kyo" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "franky",
      "limejuice",
    ]);
  });
});
