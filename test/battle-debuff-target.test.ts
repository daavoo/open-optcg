import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import { character, copies, scenario } from "./support/index.js";

/**
 * A power debuff raised during a battle goes on the card in the battle.
 *
 * OP17-058 Kaido's Leader pays `DON!! -1` for -2000 on an opposing Character,
 * on either player's attack. The deck's defence policy decides *whether* to pay
 * by asking whether 2000 flips the battle in front of it; the *target* then
 * fell to `chooseStrongestOpponentTarget`, which named the biggest body on the
 * board -- in 232 of 340 offers over a 126-game probe, a body outside the
 * battle. `LegalAction.modifiesPower` is what lets the generic ladder tell a
 * debuff from a K.O., and `chooseBattleDebuffTarget` is the rule that reads it.
 */
const KAIDO_LEADER = "OP17-058";
const KAIDO_DECK = "(Purple) Kaido - Official Feature Deck";
const ACE_DECK = "(Red) Portgas.D.Ace - Official Feature Deck";

/** Ace attacks Kaido's Leader with a 6000 Luffy while a 10000 Newgate stands by. */
function luffySwingsPastNewgate() {
  const game = scenario()
    .decks(KAIDO_DECK, ACE_DECK)
    .seed("battle-debuff-target")
    .bareTable()
    .atTurn(6, { active: "p2" })
    .withLife("p1", copies(4, "OP17-075", "p1-life"))
    .withLife("p2", copies(4, "OP16-015", "p2-life"))
    .withBoard("p2", [
      character("luffy", "OP16-015", { playedTurn: 4 }),
      character("newgate", "OP16-003", { playedTurn: 4 }),
    ])
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "luffy",
    targetInstanceId: "p1-leader",
  });
  return game;
}

describe("a battle debuff names the card in the battle", () => {
  it("says on the offer that the choice is a -2000 for this turn", async () => {
    const game = luffySwingsPastNewgate();
    const agent = new RegistryRulesAgent(KAIDO_LEADER);
    // The Leader's DON!! -1 is offered first; the defence policy pays it,
    // because 6000 - 2000 no longer reaches a 5000 Leader.
    const pay = await agent.chooseAction(observe(game.state, "p1"));
    expect(pay).toMatchObject({ type: "resolve-effect", optionId: "apply" });
    game.submit(pay);

    const targets = game
      .legalActions("p1")
      .filter(
        (action) =>
          action.type === "resolve-effect" && action.option.kind === "card",
      );
    expect(targets.length).toBe(2);
    for (const target of targets) {
      expect(
        target.type === "resolve-effect" ? target.modifiesPower : undefined,
      ).toEqual({ amount: -2000, expiresThisTurn: true });
    }
  });

  it("puts the -2000 on the attacking Luffy, not on the bigger Newgate", async () => {
    const game = luffySwingsPastNewgate();
    const agent = new RegistryRulesAgent(KAIDO_LEADER);
    game.submit(await agent.chooseAction(observe(game.state, "p1")));

    const chosen = await agent.chooseAction(observe(game.state, "p1"));

    expect(chosen).toMatchObject({
      type: "resolve-effect",
      option: { kind: "card", card: { instanceId: "luffy" } },
    });
  });
});
