import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import { character, scenario } from "./support/index.js";

/**
 * ST-30 Red/Green Luffy & Ace's attack sequencing.
 *
 * Each test pins one judgement `chooseGenericRules` got wrong on its own -- it
 * takes every attack it is given, in the order offered. These are what stops
 * the rule silently ceasing to fire, which a win rate cannot see.
 */
const DECK = "(Red/Green) Luffy & Ace - Starter Deck 30";
// ST-34 Katakuri throughout so no matchup module can intercept.
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

function attacks(deck: string, opponent: string) {
  return scenario()
    .decks(deck, opponent)
    .seed("st30-luffy-ace-policy")
    .atTurn(11, { active: "p1" })
    .bareTable();
}

describe("ST-30 Luffy & Ace deck policy", () => {
  it("declares ST30-012 first, so its [When Attacking] clears the Blocker", async () => {
    // Two legal attackers and an active [Blocker] across the table. ST30-012's
    // rest lasts the turn, so it has to swing before the body it clears for.
    const game = attacks(DECK, OPPONENT)
      .withBoard("p1", [
        character("jozu", "ST30-005"),
        character("blocker-rester", "ST30-012"),
      ])
      // ST31-002 Jinbe prints [Blocker]. No active DON!!, so powering up is not
      // on offer, and the Leader already rested, so it is not an attacker
      // either: the rule orders the *Character* attacks.
      .withBoard("p2", [character("wall", "ST31-002")])
      .withDon("p1", { rested: 10 })
      .withRestedLeader("p1")
      .build();
    const observation = observe(game.state, "p1");
    const agent = new RegistryRulesAgent("ST30-001");
    const chosen = await agent.chooseAction(observation);
    expect(chosen.type).toBe("attack");
    expect(
      chosen.type === "attack" ? chosen.attackerInstanceId : undefined,
    ).toBe("blocker-rester");
  });

  it("still attacks when ST30-012 is on the board but cannot swing", async () => {
    // A standing [Blocker], and an ST30-012 that was played this turn: the rule
    // scores nothing, so the other attacker is back on the table rather than
    // the turn being stranded.
    const game = attacks(DECK, OPPONENT)
      .withBoard("p1", [
        character("jozu", "ST30-005"),
        character("blocker-rester", "ST30-012", { playedTurn: 11 }),
      ])
      // ST31-002 Jinbe prints [Blocker]. No active DON!!, so powering up is not
      // on offer, and the Leader already rested, so it is not an attacker
      // either: the rule orders the *Character* attacks.
      .withBoard("p2", [character("wall", "ST31-002")])
      .withDon("p1", { rested: 10 })
      .withRestedLeader("p1")
      .build();
    const observation = observe(game.state, "p1");
    const agent = new RegistryRulesAgent("ST30-001");
    const chosen = await agent.chooseAction(observation);
    expect(chosen.type).toBe("attack");
    expect(
      chosen.type === "attack" ? chosen.attackerInstanceId : undefined,
    ).toBe("jozu");
  });
});
