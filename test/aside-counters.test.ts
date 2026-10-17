import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { GenericRulesAgent, isAsideCounter } from "@one-piece-sim/agents/local";
import { createRulesAgent } from "../packages/cli/src/agent-factory.js";
import { character, copies, scenario } from "./support/index.js";

/**
 * Counters onto a card other than the one being attacked (Bandai's rules Q&A,
 * Keywords 4) are offered after every other Counter-step offer, and the
 * shipped agents leave them out -- so the offers a pilot weighs, and so its
 * choice, are what they were before they existed.
 */
const counterStep = () => {
  const game = scenario()
    .decks("FIXTURE-RED", "FIXTURE-BLUE")
    .seed("aside-counters")
    .atTurn(3, { active: "p1" })
    .bareTable()
    .withBoard("p1", [character("attacker", "FIX-002")])
    .withGivenDon("p1", "attacker", 2)
    .withBoard("p2", [character("bystander", "FIX-001")])
    .withHand("p2", copies(2, "FIX-001", "counter"))
    .withLife("p2", copies(2, "FIX-001", "p2-life"))
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p2-leader",
  });
  while (game.state.phase !== "counter") game.pass();
  return game;
};

describe("Counters onto another card", () => {
  it("are offered after every other Counter-step offer, the pass included", () => {
    const game = counterStep();
    const actions = game.legalActions();
    const firstAside = actions.findIndex(isAsideCounter);
    const pass = actions.findIndex((action) => action.type === "pass");

    expect(firstAside).toBeGreaterThan(pass);
    expect(actions.slice(firstAside).every(isAsideCounter)).toBe(true);
    // Each hand card, onto the one card the attack is not aimed at.
    expect(actions.filter(isAsideCounter)).toHaveLength(2);
  });

  it("are never taken by a rules agent", async () => {
    const game = counterStep();
    const observation = observe(game.state, "p2");
    for (const agent of [
      new GenericRulesAgent(),
      createRulesAgent("FIXTURE-BLUE"),
    ]) {
      const action = await agent.chooseAction(observation);
      expect(isAsideCounter(action)).toBe(false);
    }
  });

  it("leave the defender's own Counter offers as they were", () => {
    const game = counterStep();
    const ownCounters = game
      .legalActions()
      .filter((action) => action.type === "counter" && !isAsideCounter(action));
    expect(ownCounters.map((action) => action.actionId)).toEqual([
      `r${game.state.revision}:counter:counter-1`,
      `r${game.state.revision}:counter:counter-2`,
    ]);
    // A card still in hand answers both kinds of offer.
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "counter-1",
      "counter-2",
    ]);
  });
});
