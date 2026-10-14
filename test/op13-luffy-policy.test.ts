import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Red/Green) Monkey.D.Luffy's rules: the Leader's DON!!-for-power clause and
 * the opening hand.
 *
 * Each Leader case is pinned twice where the default differs -- once as the
 * decision the seat makes, and once with the module disabled -- so the test
 * states what the generic ladder would have done as well as what the rule
 * does.
 */

const LUFFY = "(Red/Green) Monkey.D.Luffy - Open OPTCG";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP13-001";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

function optionOf(action: LegalAction): string {
  if (action.type !== "resolve-effect") return action.type;
  return action.optionId;
}

/**
 * p2 attacking the OP13-001 Leader with a body of `attackerPower`, p1 holding
 * one DON!! on the Leader and `active` more in the cost area.
 */
function underAttack(seed: string, attacker: string, active: number): Game {
  const game = scenario()
    .decks(LUFFY, OPPONENT)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withGivenDon("p1", "p1-leader", 1)
    .withDonDeck("p1", 9 - active)
    .withLife("p1", copies(4, "EB04-007", "life"))
    .withHand("p1", [instance("hand-a", "OP13-118")])
    .withBoard("p2", [character("attacker", attacker, { playedTurn: 1 })])
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  return game;
}

describe("the Leader's clause buys the battle or nothing", () => {
  // OP11-011 Bins is a 7000 body: the Leader defends at 6000 with its given DON!!
  // on its own turn only, so here it is 5000 and short by 2001.
  it("rests the two DON!! a 7000 attacker needs, where the ladder rests one", async () => {
    const game = underAttack("op13-luffy-two", "OP11-011", 4);
    expect(game.state.activeAttack).toBeTruthy();

    expect(optionOf(await chosen(game))).toBe("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(optionOf(await chosen(game))).toBe("rest-2");
    expect(optionOf(await chosen(game, ["op13-luffy-leader"]))).toBe("rest-1");
  });

  it("declines where every active DON!! still loses and the hand cannot finish it", async () => {
    // One active DON!! buys 2000 against a 2001 shortfall.
    const game = underAttack("op13-luffy-short", "OP11-011", 1);

    expect(optionOf(await chosen(game))).toBe("skip");
    expect(optionOf(await chosen(game, ["op13-luffy-leader"]))).toBe("apply");
  });
});

describe("the Counter phase keeps the refresh engine", () => {
  it("counters to save OP14-022 Usopp, where the generic phase lets it go", async () => {
    // No DON!! on the Leader, so its own clause does not open first. ST32-004
    // ties a 5000 Usopp, so one 1000 Counter saves it.
    const game = scenario()
      .decks(LUFFY, OPPONENT)
      .seed("op13-luffy-counter")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withLife("p1", copies(4, "EB04-007", "life"))
      .withBoard("p1", [character("usopp", "OP14-022", { rested: true })])
      .withHand("p1", [instance("counter", "OP01-016")])
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "usopp",
    });
    while (game.state.phase === "block") game.pass();
    expect(game.state.phase).toBe("counter");

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op13-luffy-counter"])).type).toBe("pass");
  });
});

describe("the opening hand", () => {
  async function decisionFor(hand: ReturnType<typeof instance>[]) {
    const game = scenario()
      .decks(LUFFY, OPPONENT)
      .seed("op13-luffy-mulligan")
      .withHand("p1", hand)
      .allowPartialState()
      .build();
    const action = await chosen(game);
    return action.type === "mulligan-decision" ? action.decision : action.type;
  }

  it("keeps a hand holding a 1-cost Straw Hat search", async () => {
    expect(
      await decisionFor([
        instance("search", "EB02-017"),
        ...copies(4, "EB04-007", "zoro"),
      ]),
    ).toBe("keep");
  });

  it("sends back a hand whose only cheap cards open nothing", async () => {
    expect(
      await decisionFor([
        ...copies(2, "OP15-035", "laboon"),
        ...copies(2, "OP05-038", "charlestone"),
        instance("gatling", "OP06-018"),
      ]),
    ).toBe("mulligan");
  });
});
