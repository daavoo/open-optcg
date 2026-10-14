import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Green/Purple) Monkey.D.Luffy's rules: when the Leader's DON!! −2 is worth
 * taking, which card the searches hand over, and which Characters the Counter
 * step defends.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const DECK = "(Green/Purple) Monkey.D.Luffy - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "EB02-010";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const isLeaderActivation = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceCardNumber === LEADER;

const optionIdOf = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

describe("the Leader's DON!! −2", () => {
  /**
   * p1's Main Phase with eight DON!! on the field, four of them rested -- the
   * two the Leader returns and the two it readies -- and an empty hand, so
   * the activation is the only thing the turn has left to spend DON!! on.
   */
  const atActivation = (seed: string, board: string[]) =>
    scenario()
      .decks(DECK, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withLeader("p1", LEADER)
      .withDonDeck("p1", 6)
      .withDon("p1", { rested: 4 })
      .withBoard(
        "p1",
        board.map((cardNumber, index) =>
          character(`body-${index}`, cardNumber),
        ),
      )
      .build();

  it("is declined at eight DON!! with no refund: it costs two next turn", async () => {
    const game = atActivation("eb02-luffy-gate-dry", ["EB02-037"]);

    expect(isLeaderActivation(await chosen(game))).toBe(false);
    expect(
      isLeaderActivation(await chosen(game, ["eb02-luffy#leader-return-gate"])),
    ).toBe(true);
  });

  it("is taken with Sanji & Pudding on the field to refund one", async () => {
    const game = atActivation("eb02-luffy-gate-refund", ["EB02-035"]);

    expect(isLeaderActivation(await chosen(game))).toBe(true);
  });
});

describe("the searches", () => {
  it("take Sanji & Pudding over the card offered first", async () => {
    const game = scenario()
      .decks(DECK, OPPONENT)
      .seed("eb02-luffy-search")
      .atTurn(11, { active: "p1" })
      .withHand("p1", [instance("nami", "EB02-017")])
      .withDeckTop("p1", [
        instance("franky", "EB02-037"),
        instance("pair", "EB02-035"),
        instance("luffy", "EB02-061"),
        instance("uso", "OP05-061"),
        instance("zoro", "EB02-019"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "EB02-017" });

    expect(optionIdOf(await chosen(game))).toBe("pair");
    expect(optionIdOf(await chosen(game, ["search:eb02-luffy"]))).toBe(
      "franky",
    );
  });
});

describe("the Counter step", () => {
  /**
   * p2's Character swinging at `target` for 8000, with OP05-061 Uso-Hachi --
   * a 2000 Counter -- in p1's hand and Life to spare.
   */
  const atBody = (seed: string, target: string) =>
    scenario()
      .decks(DECK, OPPONENT)
      .seed(seed)
      .atTurn(10, { active: "p2" })
      .withLife("p1", 4)
      .withHand("p1", [instance("uso", "OP05-061")])
      .withBoard("p1", [character("body", target)])
      .withBoard("p2", [character("attacker", "ST34-002")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "body",
          attackPower: 8000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

  it("spends a 2000 Counter to keep Sanji & Pudding", async () => {
    const game = atBody("eb02-luffy-counter-pair", "EB02-035");

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["eb02-luffy-counter"])).type).toBe("pass");
  });

  it("lets a body the deck is not built around go", async () => {
    const game = atBody("eb02-luffy-counter-franky", "EB02-019");

    expect((await chosen(game)).type).toBe("pass");
  });
});
