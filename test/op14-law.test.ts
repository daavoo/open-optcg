import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * The (Red) Trafalgar Law feature deck's two lines, played through its own
 * list: the Leader's base-power swap arming a body whose text pays out at
 * 5000 power. Each card's clause has its own test in `op14.test.ts`; these pin
 * the swap reaching those clauses, which is the whole plan of the deck and
 * the part a per-card test on a neutral board cannot show.
 */
const table = (seed: string) =>
  scenario()
    .decks(
      "(Red) Trafalgar Law - Official Feature Deck",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

const canAttackWith = (
  game: { legalActions: () => readonly { type: string }[] },
  attackerInstanceId: string,
) =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "attack" &&
        (action as { attackerInstanceId?: string }).attackerInstanceId ===
          attackerInstanceId,
    );

describe("OP14-001 Trafalgar Law's swap, into the deck's 5000-power clauses", () => {
  covers("OP14-001", "[Activate: Main]");
  covers("OP14-002", "[When Attacking]");
  covers("OP14-004", "static");

  it("lends Zoro's 8000 to Urouge, whose attack then draws and K.O.s", () => {
    const game = table("op14-law-urouge")
      .withBoard("p1", [
        character("urouge", "OP14-002"),
        character("zoro", "OP14-015"),
      ])
      .withBoard("p2", [character("small", "OP14-013")])
      .withDeckTop("p1", [instance("draw-1", "OP14-007")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "urouge" });
    game.play({ type: "resolve-effect", optionId: "zoro" });
    expect(currentPower(game.state, "p1", "urouge")).toBe(8000);

    game.play({
      type: "attack",
      attackerInstanceId: "urouge",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "small" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "draw-1",
    );
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("gives a Cavendish played this turn [Rush] off Law's 10000", () => {
    const game = table("op14-law-cavendish")
      .withBoard("p1", [character("law", "OP14-009")])
      .withHand("p1", [instance("cavendish", "OP14-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-004" });
    expect(hasKeyword(game.state, "p1", "cavendish", "Rush")).toBe(false);
    expect(canAttackWith(game, "cavendish")).toBe(false);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "cavendish" });
    game.play({ type: "resolve-effect", optionId: "law" });

    expect(currentPower(game.state, "p1", "cavendish")).toBe(10000);
    expect(hasKeyword(game.state, "p1", "cavendish", "Rush")).toBe(true);
    expect(canAttackWith(game, "cavendish")).toBe(true);
  });
});
