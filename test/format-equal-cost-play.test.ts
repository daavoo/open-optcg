import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";

import { instance, scenario } from "./support/index.js";

/**
 * `equal-cost-play`: at equal printed cost, which card gets developed.
 *
 * The position is `open-optcg-trace(13).jsonl` turn 5, revision 25. The Bonney
 * seat at 1 Life held EB04-058 Borsalino -- a cost-5 6000 [Blocker] whose
 * `[On Play]` banks a card onto Life at 2 or less Life -- beside ST29-010
 * Franky, a cost-5 6000 with no text at all, and played the Franky. Nothing
 * about the two cards entered the choice: "develop the highest-cost legal
 * card" is a stable sort, so a tied band falls to the order the engine offers
 * the hand in, which is hand order.
 */
const DECK = "(Red/Yellow) Jewelry Bonney - Official Feature Deck";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/**
 * Five active DON!! and a hand of two cost-5 bodies, the vanilla one first.
 *
 * `firstInHand` is the point of the fixture: the rule has to beat offer order,
 * so the test is only meaningful while the card it must *not* pick is the one
 * offered first.
 */
function tiedBand(firstInHand: string, secondInHand: string) {
  return scenario()
    .decks(DECK, OPPONENT)
    .seed("equal-cost-play")
    .atTurn(9, { active: "p1" })
    .withLife("p1", 1)
    .withHand("p1", [
      instance("first", firstInHand),
      instance("second", secondInHand),
    ])
    .build();
}

const agent = () => new RegistryRulesAgent("EB04-001");

describe("equal-cost-play develops the better card in a tied cost band", () => {
  it("plays the 6000 [Blocker] over the 6000 vanilla body of the same cost", async () => {
    const game = tiedBand("ST29-010", "EB04-058");
    const observation = observe(game.state, "p1");
    // Only interesting while both are affordable and tied.
    expect(
      observation.legalActions.filter((action) => action.type === "play-card"),
    ).toHaveLength(2);

    const action = await agent().chooseAction(observation);

    expect(action.type).toBe("play-card");
    expect(action.type === "play-card" && action.cardInstanceId).toBe("second");
  });

  it("picks the same card when the hand order is reversed", async () => {
    // The rule is about the cards, so the answer cannot depend on which one
    // the engine happens to offer first.
    const game = tiedBand("EB04-058", "ST29-010");

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type === "play-card" && action.cardInstanceId).toBe("first");
  });

  it("leaves a higher-cost play alone: the band is the ladder's, not this rule's", async () => {
    // The containment that keeps this a tie-break rather than a value table.
    // OP13-108 costs 9 against Borsalino's 5, so the two are not in one band
    // and the ladder's "highest cost wins" still decides.
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("equal-cost-play-bands")
      .atTurn(17, { active: "p1" })
      .withLife("p1", 1)
      .withHand("p1", [
        instance("blocker", "EB04-058"),
        instance("fatty", "OP13-108"),
      ])
      .build();

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action.type === "play-card" && action.cardInstanceId).toBe("fatty");
  });
});
