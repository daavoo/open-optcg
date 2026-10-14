import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Green) Jinbe's rules: the one-card Counter save on the Leader, the Counter
 * saves for its bodies, and what the searches take.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const JINBE = "(Green) Jinbe - Official Feature Deck";
/** Teach, a control deck, so no matchup module intercepts and no aggro gate opens. */
const OPPONENT = "(Black/Yellow) Marshall.D.Teach - Official Feature Deck";
const LEADER = "OP11-021";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const optionIdOf = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(JINBE, OPPONENT)
    .seed(seed)
    .atTurn(11, { active })
    .bareTable()
    .withLeader("p1", LEADER);

describe("the one-card Counter save", () => {
  const leaderHit = (hand: ReturnType<typeof instance>[]) =>
    table("jinbe-counter", "p2")
      .withLife("p1", copies(5, "OP11-032", "p1-life"))
      .withBoard("p2", [character("attacker", "OP17-093")])
      .withHand("p1", hand)
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

  it("spends a card the hand cannot cast to stop a survivable Leader hit", async () => {
    // 6000 into the 5000 Leader is a 1001 shortfall that Bird Neptunian's 2000
    // closes alone. At 5 Life nothing else in the agent would stop the hit;
    // next turn's DON!! goes to Hody Jones, so Bird is not the card the turn
    // casts.
    const game = leaderHit([
      instance("hody", "OP06-035"),
      instance("bird", "OP11-033"),
      instance("jinbe", "OP11-031"),
    ]);

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op11-jinbe-counter"])).type).not.toBe(
      "counter",
    );
  });
});

describe("the Character saves", () => {
  it("spends a 2000 to keep Hody Jones on the board", async () => {
    // 9000 into the 8000 Hody is a 1001 shortfall: one card past the generic
    // step's 1000 ceiling for a Character, and inside the 3000 Hody is worth.
    const game = table("jinbe-defend", "p2")
      .withLife("p1", copies(5, "OP11-032", "p1-life"))
      .withBoard("p1", [character("hody", "OP06-035", { rested: true })])
      .withBoard("p2", [character("attacker", "OP17-093")])
      .withHand("p1", [
        instance("bird", "OP11-033"),
        instance("jinbe", "OP11-031"),
      ])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "hody",
          attackPower: 9_000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op11-jinbe-defend"])).type).not.toBe(
      "counter",
    );
  });
});

describe("the searches", () => {
  it("takes Fisher Tiger over the vanilla Surume off Shirahoshi", async () => {
    const game = table("jinbe-search")
      .withBoard("p1", [character("shirahoshi", "OP11-030")])
      .withDeckTop("p1", [
        instance("surume", "OP11-032"),
        instance("tiger", "OP11-035"),
        instance("smoker", "OP10-030"),
        instance("tashigi", "OP10-032"),
        instance("camie", "OP06-025"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "shirahoshi" });

    expect(optionIdOf(await chosen(game))).toBe("tiger");
    expect(optionIdOf(await chosen(game, ["search:op11-jinbe"]))).toBe(
      "surume",
    );
  });
});
