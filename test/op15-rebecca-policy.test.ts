import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Blue) Rebecca's rules: the Leader's swap, the two [Rush] costs, and the
 * opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const REBECCA = "(Blue) Rebecca - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP15-039";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

function describeAction(action: LegalAction): string {
  if (action.type === "resolve-effect") return action.optionId;
  if (action.type === "activate-main")
    return `activate:${action.sourceInstanceId}`;
  if (action.type === "attack") return `attack:${action.attackerInstanceId}`;
  return action.type;
}

const table = (seed: string, turn = 11) =>
  scenario()
    .decks(REBECCA, OPPONENT)
    .seed(seed)
    .atTurn(turn, { active: "p1" })
    .bareTable();

describe("the Leader's swap", () => {
  it("holds the swap while the only body on the board is still to attack", async () => {
    const game = table("rebecca-hold")
      .withBoard("p1", [character("ready", "OP10-054", { playedTurn: 1 })])
      .withHand("p1", [instance("three", "OP15-047")])
      // No active DON!!, so the Sanji cannot be paid for and the swap is the
      // first rung the ladder reaches.
      .withDonDeck("p1", 10)
      .build();

    expect(describeAction(await chosen(game))).toBe("attack:ready");
    expect(describeAction(await chosen(game, ["op15-rebecca-leader"]))).toBe(
      "activate:p1-leader",
    );
  });

  it("holds the swap with no cost-3 to play in the returned body's place", async () => {
    const game = table("rebecca-no-play")
      .withBoard("p1", [character("fodder", "OP15-053")])
      .withHand("p1", [instance("seven", "OP15-046")])
      .withDonDeck("p1", 10)
      .build();

    const decision = describeAction(await chosen(game));
    expect(decision).not.toBe("activate:p1-leader");
    expect(describeAction(await chosen(game, ["op15-rebecca-leader"]))).toBe(
      "activate:p1-leader",
    );
  });

  it("returns the 1-cost digger rather than a Character that can still attack", async () => {
    const game = table("rebecca-bounce")
      .withBoard("p1", [
        character("ready", "OP10-054", { playedTurn: 1 }),
        character("fodder", "OP15-053"),
      ])
      .withHand("p1", [instance("three", "OP15-047")])
      .withDonDeck("p1", 10)
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    expect(describeAction(await chosen(game))).toBe("fodder");
  });

  it("does not trade a fresh 7-cost down to a cost-3", async () => {
    const game = table("rebecca-no-trade-down")
      .withBoard("p1", [character("sabo", "OP15-046", { playedTurn: 11 })])
      .withHand("p1", [instance("three", "OP15-047")])
      .withDonDeck("p1", 10)
      .build();

    expect(describeAction(await chosen(game))).not.toBe("activate:p1-leader");
    expect(describeAction(await chosen(game, ["op15-rebecca-leader"]))).toBe(
      "activate:p1-leader",
    );
  });

  it("plays Kyros off the swap when a card is left to pay its [Rush]", async () => {
    const game = table("rebecca-kyros-first")
      .withBoard("p1", [character("fodder", "OP15-053")])
      .withHand("p1", [
        instance("gilly", "OP10-054"),
        instance("kyros", "OP15-042"),
        instance("spare", "OP15-052"),
      ])
      .withDonDeck("p1", 10)
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    expect(describeAction(await chosen(game))).toBe("kyros");
  });
});

describe("the [Rush] costs", () => {
  it("does not put a Character on the bottom of the deck for Orlumbus's [Rush]", async () => {
    const game = table("rebecca-orlumbus")
      .withBoard("p1", [
        character("orlumbus", "OP15-041", { playedTurn: 11 }),
        character("fodder", "OP15-052"),
      ])
      .build();

    expect(describeAction(await chosen(game))).not.toBe("activate:orlumbus");
    expect(describeAction(await chosen(game, ["op15-rebecca-orlumbus"]))).toBe(
      "activate:orlumbus",
    );
  });

  it("does not trash a card for Kyros's [Rush] on a turn no one may attack", async () => {
    const game = table("rebecca-kyros-dead", 1)
      .withHand("p1", [
        instance("kyros", "OP15-042"),
        instance("spare", "OP15-052"),
      ])
      .withDonDeck("p1", 7)
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-042" });
    expect(describeAction(await chosen(game))).toBe("skip");
    expect(describeAction(await chosen(game, ["op15-rebecca-kyros"]))).toBe(
      "apply",
    );
  });
});

describe("the choices the ladder answered by offer order", () => {
  it("digs Kyros over a vanilla cost-3 with Viola", async () => {
    const game = table("rebecca-search")
      .withHand("p1", [instance("viola", "OP15-040")])
      .withDeckTop("p1", [
        instance("gilly", "OP10-054"),
        instance("kyros", "OP15-042"),
        instance("leo", "OP15-052"),
      ])
      .withDonDeck("p1", 5)
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-040" });
    expect(describeAction(await chosen(game))).toBe("kyros");
    expect(describeAction(await chosen(game, ["search:op15-rebecca"]))).toBe(
      "gilly",
    );
  });

  it("trashes the search Event rather than Kyros off Cavendish's draw", async () => {
    const game = table("rebecca-discard")
      .withBoard("p1", [character("cavendish", "OP10-045", { playedTurn: 1 })])
      .withHand("p1", [
        instance("kyros", "OP15-042"),
        instance("search", "OP10-059"),
      ])
      .withDeckTop("p1", [
        instance("d1", "OP15-042"),
        instance("d2", "OP15-040"),
      ])
      .withDeckTop("p2", [instance("p2-top", "ST34-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "cavendish",
      targetInstanceId: "p2-leader",
    });
    expect(describeAction(await chosen(game))).toBe("search");
    expect(describeAction(await chosen(game, ["op15-rebecca-discard"]))).toBe(
      "kyros",
    );
  });

  it("plays the 1-cost the swap returns before a dearer body", async () => {
    const game = table("rebecca-fuel")
      .withHand("p1", [
        instance("cavendish", "OP10-045"),
        instance("rebecca", "OP15-053"),
        instance("three", "OP15-047"),
      ])
      .withDonDeck("p1", 6)
      .build();

    const play = await chosen(game);
    expect(play.type === "play-card" && play.cardInstanceId).toBe("rebecca");
    const ladder = await chosen(game, ["op15-rebecca-fuel-first"]);
    expect(ladder.type === "play-card" && ladder.cardInstanceId).not.toBe(
      "rebecca",
    );
  });
});

describe("the Counter phase", () => {
  it("spends the Counter line that saves a 7-cost Sabo", async () => {
    const game = scenario()
      .decks(REBECCA, OPPONENT)
      .seed("rebecca-counter")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withBoard("p1", [
        character("sabo", "OP15-046", { playedTurn: 1, rested: true }),
      ])
      .withHand("p1", [instance("viola", "OP15-040")])
      .withLife("p1", copies(4, "OP10-054", "life"))
      .withBoard("p2", [character("attacker", "OP10-046", { playedTurn: 1 })])
      .withGivenDon("p2", "attacker", 1)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "sabo",
    });
    while (game.state.phase === "block") game.pass();

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op15-rebecca-counter"])).type).toBe("pass");
  });
});
