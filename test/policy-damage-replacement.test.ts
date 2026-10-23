import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import {
  character,
  copies,
  covers,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * EB05-052 Gloriosa's "if you would take damage, you may trash this Character
 * instead" is offered with the replacement first, so the generic fallback --
 * first option that is not a decline -- traded a 6000-power body for every
 * point of damage. The rule takes the damage unless it would end the game.
 */
describe("a damage replacement is paid only when the damage is lethal", () => {
  covers("EB05-052", "static");

  /** p2 attacks p1's Leader; p1 has Gloriosa on the field. */
  const gloriosa = (seed: string, life: number) =>
    scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [character("gloriosa", "EB05-052")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .withLife("p1", copies(life, "FIX-001", "p1-life"))
      .build();

  /** Attacks the Leader and passes the defence, to the replacement prompt. */
  function toReplacement(game: Game): void {
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    let guard = 0;
    while (
      (game.state.phase === "block" || game.state.phase === "counter") &&
      game.state.pendingEffect === null
    ) {
      if (guard++ > 10) throw new Error("the defence never ended");
      game.pass();
    }
    expect(game.state.pendingEffect?.kind).toBe("damage-replacement");
  }

  it("takes the damage while there is Life to take it from", async () => {
    const game = gloriosa("policy-damage-replacement-life", 2);
    toReplacement(game);

    const chosen = await new RegistryRulesAgent("EB05-010").chooseAction(
      observe(game.state, "p1"),
    );

    expect("optionId" in chosen ? chosen.optionId : undefined).toBe("skip");
  });

  it("trashes the Character when the damage would lose the game", async () => {
    const game = gloriosa("policy-damage-replacement-lethal", 0);
    toReplacement(game);

    const chosen = await new RegistryRulesAgent("EB05-010").chooseAction(
      observe(game.state, "p1"),
    );

    expect("optionId" in chosen ? chosen.optionId : undefined).toBe(
      "replace:gloriosa",
    );
  });
});
