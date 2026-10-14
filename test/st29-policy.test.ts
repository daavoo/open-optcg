import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { instance, scenario } from "./support/index.js";

/**
 * ST-29's deck policy: one judgement, pinned twice.
 *
 * Once as the decision the seat makes, and once with the rule disabled, so the
 * test states the default the rule replaces as well as the rule. A rule that
 * quietly stopped firing would otherwise leave both halves green -- the failure
 * `audit-deck-policy` records ST-33 collapsing 22.8pt through with all
 * seventeen of its tests passing.
 *
 * The assertion is on the chosen action, not on the game it leads to: the rule
 * is worth points across thousands of games and none of them in particular.
 */

const ST29 = "(Yellow) Monkey.D.Luffy - Starter Deck 29";
/** Katakuri, so nothing in the field intercepts ahead of the deck module. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "ST29-001";

async function chosen(
  game: ReturnType<ReturnType<typeof scenario>["build"]>,
  disable: readonly string[] = [],
) {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

describe("ST-29 pays a trash cost with a [Counter] Event, not a body", () => {
  /**
   * Hand order and the rule disagree at both ends: ST29-008 Nami is offered
   * first and is a Character, and the +4000 [Counter] Event is offered last.
   */
  const mixedHand = () => [
    instance("nami", "ST29-008"),
    instance("zoro", "ST29-014"),
    instance("stussy", "ST29-006"),
    instance("lion-song", "ST29-017"),
  ];

  /**
   * The Leader's [When Attacking] draw-and-trash fires only at 2 or less Life,
   * so the position that raises this decision is the one the rule is about.
   */
  const attacking = (seed: string) =>
    scenario()
      .decks(ST29, OPPONENT)
      .seed(seed)
      .atTurn(9, { active: "p1" })
      .withLife("p1", 2)
      .withHand("p1", mixedHand());

  it("pitches the Event and keeps every body", async () => {
    const game = attacking("st29-pitch").build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });

    const action = await chosen(game);
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    if (action.option.kind !== "card") throw new Error("expected a card");
    expect(action.option.card.cardNumber).toBe("ST29-017");
  });

  it("pitches whatever hand order offers first once the rule is off", async () => {
    const game = attacking("st29-pitch-off").build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });

    const action = await chosen(game, ["st29-luffy-pitch"]);
    if (action.type !== "resolve-effect") throw new Error("unreachable");
    if (action.option.kind !== "card") throw new Error("expected a card");
    // Nami, because it is the first card in hand and nothing else was
    // choosing. This is the default the pitch order replaces.
    expect(action.option.card.cardNumber).toBe("ST29-008");
  });
});
