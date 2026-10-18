import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Black/Yellow) Gecko Moria's rules: whether the Leader's [Activate: Main] is
 * worth taking and which of your own bodies it K.O.s, whether its
 * [When Attacking] is worth three cards, which body comes back from the trash,
 * which Characters the Counter step defends, and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const MORIA = "(Black/Yellow) Gecko Moria - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP14-080";

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
    .decks(MORIA, OPPONENT)
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

describe("the Leader's activation", () => {
  it("is not taken with only a Gecko Moria and the Blocker to K.O.", async () => {
    const game = table("moria-gate")
      .withBoard("p1", [
        character("moria", "PRB02-013", { playedTurn: 1 }),
        character("cindry", "OP14-109", { playedTurn: 1 }),
      ])
      .build();

    expect(game.legalActions().some(leaderActivation)).toBe(true);
    expect(leaderActivation(await chosen(game))).toBe(false);
    expect(leaderActivation(await chosen(game, ["op14-moria-gate"]))).toBe(
      true,
    );
  });

  it("is taken with Dr. Hogback to spend and a body in the trash for it", async () => {
    const game = table("moria-gate-open")
      .withBoard("p1", [character("hogback", "OP14-110", { playedTurn: 1 })])
      .withTrash("p1", [instance("kumacy", "OP14-102")])
      .build();

    expect(leaderActivation(await chosen(game))).toBe(true);
  });

  it("K.O.s Dr. Hogback rather than the Gecko Moria ahead of it", async () => {
    const game = table("moria-fodder")
      .withBoard("p1", [
        character("moria", "PRB02-013", { playedTurn: 1 }),
        character("hogback", "OP14-110", { playedTurn: 1 }),
      ])
      .withTrash("p1", [instance("kumacy", "OP14-102")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });

    expect(optionIdOf(await chosen(game))).toBe("hogback");
    expect(optionIdOf(await chosen(game, ["op14-moria-fodder"]))).toBe("moria");
  });
});

describe("the Leader's [When Attacking]", () => {
  const atBank = (seed: string, trash: ReturnType<typeof instance>[]) => {
    const game = scenario()
      .decks(MORIA, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", copies(3, "OP14-104", "big"))
      .withDeckTop("p1", [instance("banked", "OP14-109")])
      .withTrash("p1", trash)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    return game;
  };

  it("keeps the hand once the trash already holds a body to play back", async () => {
    const game = atBank("moria-bank-full", [instance("kumacy", "OP14-102")]);

    expect(optionIdOf(await chosen(game))).toBe("skip");
    expect(optionIdOf(await chosen(game, ["op14-moria-bank"]))).toBe("apply");
  });

  it("pays it while the trash has nothing for the [Trigger]s", async () => {
    const game = atBank("moria-bank-empty", []);

    expect(optionIdOf(await chosen(game))).toBe("apply");
  });
});

describe("which body comes back from the trash", () => {
  it("a [Trigger] plays Perona, whose [On Play] stops a second attacker", async () => {
    const game = scenario()
      .decks(MORIA, OPPONENT)
      .seed("moria-revival")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withLife("p1", [
        instance("kumacy", "OP14-102"),
        instance("spare", "OP14-109"),
      ])
      .withTrash("p1", [
        instance("mice", "OP14-081"),
        instance("perona", "OP14-111"),
      ])
      .withBoard("p2", [
        character("attacker", "ST34-002"),
        character("second", "ST34-002"),
      ])
      .withDeckTop("p2", copies(3, "ST34-002", "p2-deck"))
      .build();
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", optionId: "activate" });

    expect(optionIdOf(await chosen(game))).toBe("perona");
    expect(optionIdOf(await chosen(game, ["op14-moria-revival"]))).toBe("mice");
  });
});

describe("the Counter step", () => {
  /**
   * p2's Character swinging at OP14-104 Gecko Moria (10000), with one Kumacy
   * -- a 2000 Counter -- in p1's hand and Life to spare.
   */
  const atMoria = (seed: string, attackPower: number) =>
    scenario()
      .decks(MORIA, OPPONENT)
      .seed(seed)
      .atTurn(10, { active: "p2" })
      .withLife("p1", 4)
      .withHand("p1", [instance("kumacy", "OP14-102")])
      .withBoard("p1", [character("moria", "OP14-104")])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "moria",
          attackPower,
          counterPower: 0,
        },
        "counter",
      )
      .build();

  it("spends a 2000 Counter to keep the 10000 Gecko Moria", async () => {
    const game = atMoria("moria-counter", 11_000);

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op14-moria-counter"])).type).toBe("pass");
  });

  it("lets it go when saving it takes more than 3000", async () => {
    const game = atMoria("moria-counter-big", 14_000);

    expect((await chosen(game)).type).toBe("pass");
  });
});

describe("the opening hand", () => {
  it("keeps Hurry Up or Spider Mice and ships a hand with neither", async () => {
    const keep = scenario()
      .decks(MORIA, OPPONENT)
      .seed("moria-mulligan")
      .withHand("p1", [
        instance("hurry", "OP14-097"),
        instance("moria", "OP14-104"),
        instance("hancock", "OP14-112"),
        instance("a", "PRB02-014"),
        instance("b", "OP14-108"),
      ])
      .build();
    const ship = scenario()
      .decks(MORIA, OPPONENT)
      .seed("moria-mulligan")
      .withHand("p1", [
        instance("moria", "OP14-104"),
        instance("hancock", "OP14-112"),
        instance("perona", "OP14-111"),
        instance("a", "PRB02-014"),
        instance("b", "OP14-108"),
      ])
      .build();

    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;
    expect(decisionOf(await chosen(keep))).toBe("keep");
    expect(decisionOf(await chosen(ship))).toBe("mulligan");
  });
});
