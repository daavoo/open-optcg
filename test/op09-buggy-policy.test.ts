import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Blue) Buggy's rules: the Leader's [Activate: Main] before any hard cast,
 * which body the deck's free plays put down, which cards its draw-and-trash
 * spends, which Characters the Counter step defends, and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const BUGGY = "(Blue) Buggy - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP09-042";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

/** Ten active DON!! and a rested Leader, so nothing attacks first. */
const table = (seed: string) =>
  scenario()
    .decks(BUGGY, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withRestedLeader("p1");

const leaderActivation = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceInstanceId === "p1-leader";

const optionIdOf = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

/** Four Characters already at cost 5 or more: OP09-051's fifth stays. */
const fourFiveCosts = () => [
  character("croc", "OP09-046", { playedTurn: 1 }),
  character("mihawk", "OP09-048", { playedTurn: 1 }),
  character("cabaji", "OP09-045", { playedTurn: 1 }),
  character("crocodile", "P-082", { playedTurn: 1 }),
];

describe("the Leader's activation", () => {
  it("is taken before a castable 5-cost while an 8-cost waits in hand", async () => {
    const game = table("buggy-leader-first")
      .withHand("p1", [
        instance("cabaji", "OP09-045"),
        instance("cm", "ST25-003"),
        instance("fodder", "OP09-057"),
      ])
      .build();

    expect(leaderActivation(await chosen(game))).toBe(true);
    expect((await chosen(game, ["op09-buggy-leader"])).type).toBe("play-card");
  });

  it("is not forced with nothing in hand worth more than five DON!!", async () => {
    const game = table("buggy-leader-nothing")
      .withHand("p1", [
        instance("cabaji", "OP09-045"),
        instance("fodder", "OP09-057"),
      ])
      .build();

    expect((await chosen(game)).type).toBe("play-card");
  });

  it("does not count OP09-051 Buggy as a target on a board it would leave", async () => {
    const game = table("buggy-leader-bounce")
      .withHand("p1", [
        instance("cabaji", "OP09-045"),
        instance("buggy", "OP09-051"),
        instance("fodder", "OP09-057"),
      ])
      .build();

    expect((await chosen(game)).type).toBe("play-card");
  });
});

describe("which body the Leader puts down", () => {
  /** The Leader activated and its trash cost paid, so the play is next. */
  const atThePlay = (seed: string, board: ReturnType<typeof fourFiveCosts>) => {
    const game = table(seed)
      .withBoard("p1", board)
      .withHand("p1", [
        instance("fodder", "OP09-057"),
        instance("buggy", "OP09-051"),
        instance("cm", "ST25-003"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    if (game.legalActions().some((action) => optionIdOf(action) === "apply")) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }
    game.play({ type: "resolve-effect", optionId: "fodder" });
    return game;
  };

  it("plays Crocodile & Mihawk rather than a Buggy that would leave", async () => {
    const game = atThePlay("buggy-pick-cm", []);

    expect(optionIdOf(await chosen(game))).toBe("cm");
    expect(optionIdOf(await chosen(game, ["op09-buggy-play-pick"]))).toBe(
      "buggy",
    );
  });

  it("plays OP09-051 Buggy once four 5-costs are out", async () => {
    const game = atThePlay("buggy-pick-buggy", fourFiveCosts());

    expect(optionIdOf(await chosen(game))).toBe("buggy");
  });
});

describe("what the deck trashes", () => {
  it("trashes a spent searcher to Mihawk's draw, not the 8-cost ahead of it", async () => {
    const game = table("buggy-discard")
      .withHand("p1", [
        instance("mihawk", "OP09-048"),
        instance("cm", "ST25-003"),
        instance("galdino", "OP09-056"),
      ])
      .withDeckTop("p1", copies(2, "OP09-046", "drawn"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP09-048" });

    expect(optionIdOf(await chosen(game))).toBe("galdino");
    expect(optionIdOf(await chosen(game, ["op09-buggy-discard"]))).toBe("cm");
  });
});

describe("the Counter step", () => {
  /**
   * p2's Character swinging at ST25-003 Crocodile & Mihawk (7000), with one
   * 2000 Counter in p1's hand and Life to spare.
   */
  const atCrocMihawk = (seed: string, attackPower: number) =>
    scenario()
      .decks(BUGGY, OPPONENT)
      .seed(seed)
      .atTurn(10, { active: "p2" })
      .withLife("p1", 4)
      .withHand("p1", [instance("mohji", "ST25-005")])
      .withBoard("p1", [character("cm", "ST25-003")])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "cm",
          attackPower,
          counterPower: 0,
        },
        "counter",
      )
      .build();

  it("spends a 2000 Counter to keep Crocodile & Mihawk", async () => {
    const game = atCrocMihawk("buggy-counter", 8_000);

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op09-buggy-counter"])).type).toBe("pass");
  });

  it("lets it go when saving it takes more than 3000", async () => {
    const game = atCrocMihawk("buggy-counter-big", 11_000);

    expect((await chosen(game)).type).toBe("pass");
  });
});

describe("the opening hand", () => {
  it("keeps a 4- or 5-cost body and ships a hand without one", async () => {
    const keep = scenario()
      .decks(BUGGY, OPPONENT)
      .seed("buggy-mulligan")
      .withHand("p1", [
        instance("alvida", "ST25-001"),
        instance("buggy", "OP09-051"),
        instance("cm", "ST25-003"),
        instance("a", "OP09-057"),
        instance("b", "PRB02-009"),
      ])
      .build();
    const ship = scenario()
      .decks(BUGGY, OPPONENT)
      .seed("buggy-mulligan")
      .withHand("p1", [
        instance("buggy", "OP09-051"),
        instance("cm", "ST25-003"),
        instance("croc", "OP09-046"),
        instance("a", "OP09-057"),
        instance("b", "PRB02-009"),
      ])
      .build();

    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;
    expect(decisionOf(await chosen(keep))).toBe("keep");
    expect(decisionOf(await chosen(ship))).toBe("mulligan");
  });
});
