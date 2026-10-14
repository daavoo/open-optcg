import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { character, scenario } from "./support/index.js";

/**
 * The position a recorded game ended a turn in, and the two facts the
 * observation did not carry.
 *
 * Turn 7, all seven DON!! spent on ST31-004 Monkey.D.Luffy, so they are rested
 * in the cost area: the 9000-power body is summoning-sick, the Leader's gift is
 * behind its `[DON!! x1]` gate with nothing attached, and Thousand Sunny is
 * active with a rested DON!! to hand out. The engine offered the Stage and
 * "end turn", and nothing said the Leader had an ability at all.
 */
function trapPosition() {
  return scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("dormant-leader-gift")
    .atTurn(7, { active: "p1" })
    .withBoard("p1", [character("luffy", "ST31-004", { playedTurn: 7 })])
    .withStage("p1", { instanceId: "sunny", cardNumber: "ST31-005" })
    .withDon("p1", { rested: 7 })
    .build();
}

describe("dormant abilities in the observation", () => {
  it("names the Leader gift its holder cannot use, and what it wants", () => {
    const game = trapPosition();
    const view = observe(game.state, "p1");

    expect(view.self.leader.dormantAbility).toEqual({
      clause: "[Activate: Main]",
      reason: "needs 1 or more DON!! attached to this card",
    });
    // The Stage is available, so it says nothing -- its activation is in
    // `legalActions`, which is where an available ability belongs.
    expect(view.self.stage?.dormantAbility).toBeUndefined();
  });

  it("says a summoning-sick body's [Rush] is its own text's to switch on", () => {
    const view = observe(trapPosition().state, "p1");
    const luffy = view.self.board.find((card) => card.instanceId === "luffy");

    expect(luffy?.summoningSick).toBe(true);
    expect(luffy?.effectiveKeywords).not.toContain("Rush");
    expect(luffy?.conditionalKeywords).toContain("Rush");
  });

  it("withholds the reason from the other seat", () => {
    // A reason can name cards in hand -- OP14-105 Gorgon Sisters pays with
    // particular ones -- so the opponent's copy of the block would answer a
    // question about that hand. Keywords are public and stay on both sides.
    const view = observe(trapPosition().state, "p2");

    // Not merely absent from the data: the opponent's half of the observation
    // has no such field to read.
    expect("dormantAbility" in view.opponent.leader).toBe(false);
    expect(view.opponent.board.some((card) => "dormantAbility" in card)).toBe(
      false,
    );
    expect(
      view.opponent.board.find((card) => card.instanceId === "luffy")
        ?.conditionalKeywords,
    ).toContain("Rush");
  });

  it("stops reporting the gift once the gate is met, and the line it unlocks", () => {
    // The line the recorded game had and did not take: the Stage's rested DON!!
    // to the *Leader* rather than to Luffy satisfies `[DON!! x1]`, the Leader
    // gift then puts 2 more given DON!! on Luffy, and 3 given DON!! across the
    // field is exactly ST31-004's [Rush] condition.
    const game = trapPosition();
    // The Leader can swing; the freshly played 9000 body cannot, which is the
    // whole complaint.
    expect(
      game
        .legalActions("p1")
        .filter(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "luffy",
        ),
    ).toHaveLength(0);

    game.play({ type: "activate-main", sourceCardNumber: "ST31-005" });
    // Both recipients are named "Monkey.D.Luffy" and their summaries are
    // identical, so the option id is what tells the Leader from the Character.
    game.play({ optionId: "p1-leader" });

    const afterStage = observe(game.state, "p1");
    expect(afterStage.self.leader.dormantAbility).toBeUndefined();

    game.play({ type: "activate-main", sourceCardNumber: "ST21-001" });
    game.play({ optionId: "luffy" });

    const armed = observe(game.state, "p1");
    const luffy = armed.self.board.find((card) => card.instanceId === "luffy");
    expect(luffy?.effectiveKeywords).toContain("Rush");
    expect(luffy?.summoningSick).toBeUndefined();
    expect(
      armed.legalActions.filter(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "luffy",
      ),
    ).not.toHaveLength(0);
  });
});
