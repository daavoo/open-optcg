import { describe, expect, it } from "vitest";
import { currentPower, observe } from "@one-piece-sim/engine-core";

import { scenario } from "./support/index.js";

/**
 * How long a given DON!! card lasts, and how long what it buys lasts -- which
 * are two different durations, and conflating them is a mistake this repository
 * has now made in both directions.
 *
 * - **Comprehensive Rules 6-5-5-2.** A card gains +1000 "during your turn" for
 *   each DON!! given to it. The power is gone once your turn ends, so a given
 *   DON!! never defends.
 * - **Comprehensive Rules 6-2-3.** The DON!! *card* stays under the card it was
 *   given to until your next Refresh Phase, where it returns rested. So it is
 *   still counted by a `[DON!! xN]` condition (8-3-2-3) on the opponent's turn,
 *   and it is still unavailable to pay for anything there.
 *
 * The engine has always played both correctly -- `battle.ts` prices a defender
 * with `includeAttachedDon: false`, `legal-actions` does the same for an attack
 * target and a Counter, and `observe` gates the field on
 * `viewer === turnPlayer`. What was wrong was every sentence describing it: the
 * attach action's own summary and the LLM agent's instructions both told the
 * reader the +1000 "holds through the opponent's turn", and the test that was
 * here asserted it too -- by reading `currentPower`'s ungated default, which is
 * the one caller in the codebase that does not answer the question the game
 * asks.
 *
 * Hence the battle below. A helper's return value was never the claim worth
 * pinning; whether the attack connects is.
 */
describe("a given DON!! card", () => {
  it("does not defend: the attack lands as if the DON!! were not there", () => {
    const game = scenario()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 3 })
      .withGivenDon("p1", "p1-leader", 1)
      .build();

    game.pass();

    // p2's turn. Both Leaders are 5000 printed, and p1's has a DON!! under it.
    // If the +1000 defended, a 5000 attack would bounce; the attacker wins
    // ties, so it connects instead and p1 loses a Life card.
    expect(game.state.turnPlayerId).toBe("p2");
    const before = game.state.players.p1.life.length;
    const attack = game.action({
      type: "attack",
      targetInstanceId: "p1-leader",
    });
    expect(attack.summary).toContain("5000 attack vs 5000 defense");

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    // Decline the block, then the Counter window, spending nothing: the Life
    // card has to be lost to the attack alone.
    game.play({ type: "pass" });
    game.play({ type: "pass" });

    expect(game.state.players.p1.life.length).toBe(before - 1);
  });

  it("is still attached on the opponent's turn, and still unspendable", () => {
    const game = scenario()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 3 })
      .withGivenDon("p1", "p1-leader", 1)
      .build();

    const active = game.state.players.p1.activeDon.length;

    game.pass();

    // 6-2-3: the card has not gone back to the cost area, so it is neither
    // counted as power against the attacker nor available to pay for a
    // [Counter] Event. That combination is the whole cost of a late
    // attachment.
    expect(game.state.players.p1.leaderAttachedDon.length).toBe(1);
    expect(game.state.players.p1.activeDon.length).toBe(active);
    expect(observe(game.state, "p2").opponent.leader.currentPower).toBe(5000);
  });

  it("returns to the cost area at its controller's own Refresh", () => {
    const game = scenario()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 3 })
      .withGivenDon("p1", "p1-leader", 1)
      .build();

    const bare = currentPower(game.state, "p1", "p1-leader", false);
    const active = game.state.players.p1.activeDon.length;

    game.pass();
    game.pass();

    expect(game.state.turnPlayerId).toBe("p1");
    expect(game.state.players.p1.leaderAttachedDon).toEqual([]);
    expect(game.state.players.p1.activeDon.length).toBeGreaterThan(active);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(bare);
  });

  it("says both durations in the action that offers it", () => {
    const game = scenario()
      .atTurn(5, { active: "p1" })
      .withDon("p1", { active: 3 })
      .build();

    const attach = game.action({ type: "attach-don" });

    // The power, and separately the card: a label that gives only the second
    // reads as a promise of defence that 6-5-5-2 does not make.
    expect(attach.summary).toContain("+1000 power during this turn only");
    expect(attach.summary).toContain("stays under it until your next Refresh");
    expect(attach.summary).toContain("cannot pay for a [Counter] Event");
  });
});
