import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, instance, scenario } from "./support/index.js";

/**
 * ST-30's deck policy: one judgement, pinned twice.
 *
 * Once as the decision the seat makes, and once with the rule disabled, so the
 * test states the default the rule replaces as well as the rule -- a rule that
 * quietly stopped firing would otherwise leave both halves green.
 */

const ST30 = "(Red/Green) Luffy & Ace - Starter Deck 30";
/** Katakuri, so nothing in the field intercepts ahead of the deck module. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "ST30-001";

async function chosen(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

describe("ST-30 spends a Counter card to keep its anthem standing", () => {
  /**
   * ST30-003 Edward.Newgate under attack, with two other 6000-base bodies of
   * its own on the board -- so what dies with it is +1000 on each of them, not
   * just its own 6000. That is what `characterDefensePower` is being raised
   * for; at the default price of one ordinary Counter card the seat declines.
   */
  const underAttack = (seed: string, defender: string) => {
    const game = scenario()
      .decks(ST30, OPPONENT)
      .seed(seed)
      .atTurn(12, { active: "p2" })
      .withHand("p1", [instance("jozu", "ST30-005")])
      // Rested, because an active Character cannot be attacked at all.
      .withBoard("p1", [
        character("newgate", "ST30-003", { rested: true }),
        character("marco", "ST30-008", { rested: true }),
        character("crocodile", "ST30-010", { rested: true }),
      ])
      // A 7000 into a 6000: one 2000 Counter card covers the shortfall, so the
      // decision is whether the body is worth the card rather than arithmetic.
      .withBoard("p2", [character("attacker", "ST34-001")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: defender,
    });
    while (game.state.phase === "block") game.pass();
    return game;
  };

  it("counters for Newgate, which is making the rest of the board bigger", async () => {
    const game = underAttack("st30-anthem", "newgate");
    expect(game.state.phase).toBe("counter");

    const action = await chosen(game);
    expect(action.type).toBe("counter");
    if (action.type !== "counter") throw new Error("unreachable");
    expect(action.cardInstanceId).toBe("jozu");
  });

  it("lets an ordinary 6000 die rather than spend the card", async () => {
    // ST30-008 Marco is a body the deck can simply put down again, and nothing
    // else on the board shrinks when it goes -- the ordinary price, which one
    // Counter card does not beat.
    const game = underAttack("st30-ordinary", "marco");
    expect(game.state.phase).toBe("counter");

    const action = await chosen(game);
    expect(action.type).toBe("pass");
  });

  it("declines for Newgate too once the rule is off", async () => {
    // `chooseGenericCounter` ships an empty protected set, so an unpiloted seat
    // spends nothing to save any Character at all. This is the default.
    const game = underAttack("st30-anthem-off", "newgate");
    const action = await chosen(game, ["st30-luffy-ace-defense"]);
    expect(action.type).toBe("pass");
  });
});
