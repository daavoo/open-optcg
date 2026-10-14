import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Black/Yellow) Koala's rules: whether Nico Robin's [On Play] is worth a card,
 * which Characters the Counter step defends, and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const KOALA = "(Black/Yellow) Koala - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP12-081";

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

describe("Nico Robin's [On Play]", () => {
  /** Robin played behind Koala, with a card to pitch and `held` cards in p2's hand. */
  const atRobin = (seed: string, held: number) => {
    const game = scenario()
      .decks(KOALA, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [
        instance("robin", "OP12-087"),
        instance("pitch", "OP12-083"),
      ])
      .withHand("p2", copies(held, "ST34-002", "p2-hand"))
      .build();
    game.play({ type: "play-card", cardNumber: "OP12-087" });
    return game;
  };

  it("is declined into an opponent holding 4: the card would buy nothing", async () => {
    const game = atRobin("koala-robin-short", 4);

    expect(optionIdOf(await chosen(game))).toBe("skip");
    expect(optionIdOf(await chosen(game, ["op12-koala-robin"]))).toBe("apply");
  });

  it("is paid into an opponent holding 5", async () => {
    const game = atRobin("koala-robin-full", 5);

    expect(optionIdOf(await chosen(game))).toBe("apply");
  });
});

describe("the Counter step", () => {
  /**
   * p2's Character swinging at `target` (5000 power) for 6000, with Belo Betty
   * -- a 2000 Counter -- in p1's hand and Life to spare.
   */
  const atBody = (seed: string, target: string) =>
    scenario()
      .decks(KOALA, OPPONENT)
      .seed(seed)
      .atTurn(10, { active: "p2" })
      .withLife("p1", 4)
      .withHand("p1", [instance("betty", "OP12-090")])
      .withBoard("p1", [character("body", target)])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "body",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

  it("spends a 2000 Counter to keep Morley, which counts as cost 8", async () => {
    const game = atBody("koala-counter", "OP12-093");

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op12-koala-counter"])).type).toBe("pass");
  });

  it("lets Inazuma go: at cost 5 it is not a body the Leader counts", async () => {
    const game = atBody("koala-counter-inazuma", "OP12-083");

    expect((await chosen(game)).type).toBe("pass");
  });
});

describe("the opening hand", () => {
  it("keeps a 4-cost body that counts as 8 and ships a hand with no opener", async () => {
    const keep = scenario()
      .decks(KOALA, OPPONENT)
      .seed("koala-mulligan")
      .withHand("p1", [
        instance("morley", "OP12-093"),
        instance("dragon", "OP12-094"),
        instance("inazuma", "OP12-083"),
        instance("kuma", "OP12-119"),
        instance("fist", "OP12-098"),
      ])
      .build();
    const ship = scenario()
      .decks(KOALA, OPPONENT)
      .seed("koala-mulligan")
      .withHand("p1", [
        instance("dragon", "OP12-094"),
        instance("inazuma", "OP12-083"),
        instance("kuma", "OP12-119"),
        instance("fist", "OP12-098"),
        instance("robin", "OP12-087"),
      ])
      .build();

    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;
    expect(decisionOf(await chosen(keep))).toBe("keep");
    expect(decisionOf(await chosen(ship))).toBe("mulligan");
  });
});
