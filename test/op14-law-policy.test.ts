import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Red) Trafalgar Law's rules: when the Leader swaps and which two bodies it
 * swaps, and OP14-009's trash-two guard.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const LAW = "(Red) Trafalgar Law - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP14-001";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  seat: "p1" | "p2" = "p1",
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, seat));
}

const table = (seed: string) =>
  scenario()
    .decks(LAW, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

const leaderSwap = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceInstanceId === "p1-leader";

const optionOf = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

describe("the Leader's swap", () => {
  it("holds the swap between two bodies that can both still attack", async () => {
    const game = table("law-swap-hold")
      .withBoard("p1", [
        character("bege", "OP14-003", { playedTurn: 1 }),
        character("luffy", "OP14-013", { playedTurn: 1 }),
      ])
      // No active DON!!, so nothing in hand competes with the two lines.
      .withDonDeck("p1", 10)
      .build();

    expect(game.legalActions().some(leaderSwap)).toBe(true);
    expect(leaderSwap(await chosen(game))).toBe(false);
    expect(leaderSwap(await chosen(game, "p1", ["op14-law-swap"]))).toBe(true);
  });

  it("swaps once a body played this turn has power to lend", async () => {
    const game = table("law-swap-fire")
      .withBoard("p1", [
        character("bege", "OP14-003", { playedTurn: 1 }),
        character("drake", "OP14-016", { playedTurn: 11 }),
      ])
      .withDonDeck("p1", 10)
      .build();

    expect(leaderSwap(await chosen(game))).toBe(true);
  });

  it("lends the idle body's power to the ready body it adds the most to", async () => {
    const game = table("law-swap-pair")
      .withBoard("p1", [
        character("bege", "OP14-003", { playedTurn: 1 }),
        character("luffy", "OP14-013", { playedTurn: 1 }),
        character("drake", "OP14-016", { playedTurn: 11 }),
      ])
      .withDonDeck("p1", 10)
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    // Luffy prints 0 and Bege 2000, so X.Drake's 7000 adds more to Luffy.
    // Offered first, Bege is what the ladder takes.
    expect(optionOf(await chosen(game))).toBe("luffy");
    expect(optionOf(await chosen(game, "p1", ["op14-law-swap"]))).toBe("bege");
    game.play({ type: "resolve-effect", optionId: "luffy" });
    expect(optionOf(await chosen(game))).toBe("drake");
  });
});

describe("OP14-009 Law's guard", () => {
  const underAttack = (seed: string, life: number) => {
    const game = table(seed)
      .withLife(
        "p1",
        copies(life, "OP14-007", `${seed}-life`).map((card) =>
          instance(card.instanceId, card.cardNumber),
        ),
      )
      .withBoard("p1", [
        character("zoro", "OP14-015"),
        character("law", "OP14-009"),
      ])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withHand("p1", copies(2, "OP14-005", "fodder"))
      // p2 draws on the way into its turn.
      .withDeckTop("p2", copies(3, "ST34-002", "p2-deck"))
      .build();
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    return game;
  };

  it("keeps the two cards above one Life", async () => {
    const game = underAttack("law-guard-high", 3);

    expect(optionOf(await chosen(game))).not.toBe("apply");
    expect(optionOf(await chosen(game, "p1", ["op14-law-guard"]))).toBe(
      "apply",
    );
  });

  it("pays at one Life, and lends the Leader the biggest base on the board", async () => {
    const game = underAttack("law-guard-low", 1);

    expect(optionOf(await chosen(game))).toBe("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder-1" });
    game.play({ type: "resolve-effect", optionId: "fodder-2" });

    // Zoro is offered first at 8000; Law's own 10000 is the bigger base.
    expect(optionOf(await chosen(game))).toBe("law");
  });
});
