import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";

import { character, copies, instance, scenario } from "./support/index.js";

/**
 * `KAIDO_EFFECT_RULES`: the two decisions a probe found this seat answering by
 * first offer, posed as boards.
 */
const LEADER = "OP17-058";
const DECK = "(Purple) Kaido - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";

const agent = () => new RegistryRulesAgent(LEADER);

function kaidoTurn() {
  return scenario()
    .decks(DECK, OPPONENT)
    .seed("op17-kaido-effects")
    .bareTable()
    .atTurn(9, { active: "p1" })
    .withLife("p1", copies(3, "OP17-075", "p1-life"))
    .withLife("p2", copies(3, "ST34-002", "p2-life"));
}

describe("OP17-061 Lead Performers' free play", () => {
  /** Lead Performers on the board, King and a 9-cost Jack in hand. */
  function leadPerformersActivated(fieldDon: number) {
    const game = kaidoTurn()
      .withBoard("p1", [character("lead", "OP17-061", { playedTurn: 7 })])
      .withHand("p1", [
        instance("jack", "OP17-069"),
        instance("king", "EB04-031"),
      ])
      // DON!! moved back into the DON!! deck, so the field count is below the
      // cap and King's two-a-turn still has somewhere to go.
      .withDonDeck("p1", 10 - fieldDon)
      .build();
    // The "you may" prompt is elided: declining it and choosing no card are
    // the same outcome, so the engine offers the card choice directly.
    game.play({ type: "activate-main", sourceInstanceId: "lead" });
    return game;
  }

  it("takes King while the ramp still has somewhere to go", async () => {
    const game = leadPerformersActivated(6);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      option: { kind: "card", card: { instanceId: "king" } },
    });
  });

  it("takes the 10000 body once the DON!! field is at the cap", async () => {
    // At ten DON!! King's two-a-turn adds nothing, so the free play is worth
    // whatever the biggest body is.
    const game = leadPerformersActivated(10);

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      option: { kind: "card", card: { instanceId: "jack" } },
    });
  });
});
