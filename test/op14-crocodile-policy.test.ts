import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Black) Crocodile's rules: whether the Leader's [Activate: Main] is worth
 * taking, which of your own bodies it K.O.s, which Characters the Counter step
 * defends, and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const CROCODILE = "(Black) Crocodile - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP14-079";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const table = (seed: string) =>
  scenario()
    .decks(CROCODILE, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    // No DON!! to spend and a rested Leader, so the activation is the only
    // thing on offer besides ending the turn.
    .withDonDeck("p1", 10)
    .withRestedLeader("p1");

const leaderActivation = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceInstanceId === "p1-leader";

const optionIdOf = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

/** Activate the Leader and accept its "you may", leaving the K.O. choice. */
function atFodderChoice(game: Game): Game {
  game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
  game.play({ type: "resolve-effect", optionId: "apply" });
  return game;
}

describe("the Leader's activation", () => {
  it("is not taken with only the deck's attackers to K.O.", async () => {
    const game = table("crocodile-gate")
      .withBoard("p1", [
        character("gem", "OP14-094", { playedTurn: 1 }),
        character("mr1", "OP14-090", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("victim", "ST34-002")])
      .build();

    expect(game.legalActions().some(leaderActivation)).toBe(true);
    expect(leaderActivation(await chosen(game))).toBe(false);
    expect(leaderActivation(await chosen(game, ["op14-crocodile-gate"]))).toBe(
      true,
    );
  });

  it("is taken with a 1-cost body to spend and a Character to drain", async () => {
    const game = table("crocodile-gate-open")
      .withBoard("p1", [
        character("gem", "OP14-094", { playedTurn: 1 }),
        character("mikita", "OP14-087", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("victim", "ST34-002")])
      .build();

    expect(leaderActivation(await chosen(game))).toBe(true);
  });

  it("with nothing to drain, is taken only for a body whose [On K.O.] pays", async () => {
    const vanilla = table("crocodile-gate-empty")
      .withBoard("p1", [character("mikita", "OP14-087", { playedTurn: 1 })])
      .build();
    expect(leaderActivation(await chosen(vanilla))).toBe(false);

    const paying = table("crocodile-gate-empty-paying")
      .withBoard("p1", [character("goldenweek", "OP14-085", { playedTurn: 1 })])
      .build();
    expect(leaderActivation(await chosen(paying))).toBe(true);
  });
});

describe("which body the Leader K.O.s", () => {
  it("spends Goldenweek's draw rather than Mr.5, the deck's only Blocker", async () => {
    const game = atFodderChoice(
      table("crocodile-fodder")
        .withBoard("p1", [
          character("gem", "OP14-094", { playedTurn: 1 }),
          character("goldenweek", "OP14-085", { playedTurn: 1 }),
        ])
        .withBoard("p2", [character("victim", "ST34-002")])
        .build(),
    );

    expect(optionIdOf(await chosen(game))).toBe("goldenweek");
    expect(optionIdOf(await chosen(game, ["op14-crocodile-fodder"]))).toBe(
      "gem",
    );
  });

  it("spends Mr.2 first while its [On K.O.] has Mr.1 to play", async () => {
    const withMr1 = atFodderChoice(
      table("crocodile-fodder-mr2")
        .withBoard("p1", [
          character("goldenweek", "OP14-085", { playedTurn: 1 }),
          character("bentham", "OP14-091", { playedTurn: 1 }),
        ])
        .withHand("p1", [instance("mr1", "OP14-090")])
        .withBoard("p2", [character("victim", "ST34-002")])
        .build(),
    );
    expect(optionIdOf(await chosen(withMr1))).toBe("bentham");

    // With nothing in hand or trash for it to play, Mr.2 is a 5000 body and
    // Goldenweek's draw is the better K.O.
    const empty = atFodderChoice(
      table("crocodile-fodder-mr2-empty")
        .withBoard("p1", [
          character("bentham", "OP14-091", { playedTurn: 1 }),
          character("goldenweek", "OP14-085", { playedTurn: 1 }),
        ])
        .withBoard("p2", [character("victim", "ST34-002")])
        .build(),
    );
    expect(optionIdOf(await chosen(empty))).toBe("goldenweek");
  });
});

describe("the Counter step", () => {
  /**
   * p2's Character swinging at Mr.5 (6000), with one Goldenweek -- a 2000
   * Counter -- in p1's hand and Life to spare.
   */
  const atMr5 = (seed: string, attackPower: number) =>
    scenario()
      .decks(CROCODILE, OPPONENT)
      .seed(seed)
      .atTurn(10, { active: "p2" })
      .withLife("p1", 4)
      .withHand("p1", [instance("goldenweek", "OP14-085")])
      .withBoard("p1", [character("gem", "OP14-094")])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "gem",
          attackPower,
          counterPower: 0,
        },
        "counter",
      )
      .build();

  it("spends a 2000 Counter to keep Mr.5, the deck's only Blocker", async () => {
    const game = atMr5("crocodile-counter-mr5", 7_000);

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op14-crocodile-counter"])).type).toBe("pass");
  });

  it("lets Mr.5 go when saving it takes more than 3000", async () => {
    const game = atMr5("crocodile-counter-mr5-big", 10_000);

    expect((await chosen(game)).type).toBe("pass");
  });
});

describe("the opening hand", () => {
  it("keeps a 1-cost Baroque Works Character and ships a hand without one", async () => {
    const keep = scenario()
      .decks(CROCODILE, OPPONENT)
      .seed("crocodile-mulligan")
      .withHand("p1", [
        instance("mikita", "OP14-087"),
        instance("croc", "OP14-120"),
        instance("sunday", "OP14-084"),
        instance("a", "OP14-096"),
        instance("b", "OP14-099"),
      ])
      .build();
    const ship = scenario()
      .decks(CROCODILE, OPPONENT)
      .seed("crocodile-mulligan")
      .withHand("p1", [
        instance("croc", "OP14-120"),
        instance("sunday", "OP14-084"),
        instance("gem", "OP14-094"),
        instance("a", "OP14-096"),
        instance("b", "OP14-099"),
      ])
      .build();

    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;
    expect(decisionOf(await chosen(keep))).toBe("keep");
    expect(decisionOf(await chosen(ship))).toBe("mulligan");
  });
});
