import { describe, expect, it } from "vitest";
import { observe } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { character, scenario } from "./support/index.js";

/**
 * `clause-swing`, the format rule that declares an attack for its `[When
 * Attacking]` clause once the turn has nothing else in it.
 *
 * The claim is about timing, not about power: the clause resolves when the
 * attack is *declared*, so `viableAttacks` -- which asks only whether the
 * attacker outpowers its target -- is asking the wrong question of it. Each
 * test poses a board where no attack can win its battle and changes only what
 * the attacker prints.
 *
 * The seat is OP-16 Purple Enel against ST34 Katakuri, whose 5000 Leader no
 * body here can beat. Enel is deliberately not an aggro seat: `strategy:aggro`
 * presses the Leader with hopeless attacks of its own and would answer these
 * boards before this rule was asked. A Character's card number on either board
 * is independent of that deck's list -- the engine resolves printed text
 * globally.
 */

const DECK = "(Purple) Enel - Official Feature Deck";
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP15-058";

const agent = () => new RegistryRulesAgent(LEADER);

/**
 * A turn with nothing left in it but the attack under test.
 *
 * `ballast` is a Character played this turn -- so it cannot attack -- carrying
 * every one of the turn's six DON!!. That empties the cost area, which is what
 * keeps attachment, casting and Enel's own Leader gift off the offer: all three
 * sit above attacks in the ladder and would answer the position first. The
 * Leader is rested for the same reason, and it leaves the body under test at its
 * printed power so the battle stays hopeless.
 */
const spentTurn = (seed: string, subject: string) =>
  scenario()
    .decks(DECK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withBoard("p1", [
      character("ballast", "OP15-062", { playedTurn: 11 }),
      character("subject", subject),
    ])
    .withBoard("p2", [character("wall", "ST31-002")])
    .withGivenDon("p1", "ballast", 6)
    .withRestedLeader("p1")
    .build();

describe("clause-swing", () => {
  it("declares a hopeless attack when the attacker's [When Attacking] pays", async () => {
    // EB04-052 Sanji is a 4000 with a [When Attacking]. The battle is lost
    // before it starts -- 4000 into a 5000 Leader -- and the clause is collected
    // anyway, because it resolves on declaration.
    const game = spentTurn("clause-swing-declares", "EB04-052");

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({
      type: "attack",
      attackerInstanceId: "subject",
    });
  });

  it("still ends the turn when the attacker prints no such clause", async () => {
    // The same hopeless attack from a body with nothing to collect. Resting it
    // buys nothing and costs a Character that is a legal attack target once
    // rested, so the ladder's pass stands.
    const game = spentTurn("clause-swing-no-clause", "OP05-083");

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "pass" });
  });

  it("does not rest a body that can still block", async () => {
    // OP06-009 Shuraiya prints both [Blocker] and a [When Attacking]. Six cards
    // in the pool print both, and they are what the gate exists for: swinging
    // collects the clause and gives up a block on the opponent's turn, which is
    // the more valuable half.
    const game = spentTurn("clause-swing-keeps-the-blocker", "OP06-009");

    const action = await agent().chooseAction(observe(game.state, "p1"));

    expect(action).toMatchObject({ type: "pass" });
  });
});
