import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Blue/Black) Usopp's rules: what Leo and Viola take, what Leo's and Sabo's
 * trashes give up, Rebecca's reveal, the Counter step, and the rest costs.
 *
 * Each case is pinned twice -- once as the decision the seat makes, and once
 * with the module disabled -- so the test states what the seat would have
 * done without the rule as well as what the rule does.
 */

const USOPP = "(Blue/Black) Usopp - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP10-042";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
  seat: "p1" | "p2" = "p1",
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, seat));
}

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(USOPP, OPPONENT)
    .seed(seed)
    .atTurn(11, { active })
    .bareTable()
    .withLeader("p1", LEADER);

const optionIdOf = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

describe("the searches", () => {
  it("Leo takes Kyros over an Ideo offered first", async () => {
    const game = table("usopp-search")
      .withHand("p1", [instance("leo", "OP10-057")])
      .withStage("p1", instance("coliseum", "OP04-096"))
      .withDeckTop("p1", [
        instance("ideo", "OP04-077"),
        instance("kyros", "OP10-046"),
        instance("blank-a", "ST34-002"),
        instance("blank-b", "ST34-002"),
        instance("blank-c", "ST34-002"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP10-057" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "coliseum" });

    expect(optionIdOf(await chosen(game))).toBe("kyros");
    // The format's search-blocker ranks Ideo, a [Blocker], first.
    expect(optionIdOf(await chosen(game, ["op10-usopp-search"]))).toBe("ideo");
  });
});

describe("the trashes", () => {
  it("OP04-083 Sabo trashes an Ideo, not the Zoro ahead of it in hand", async () => {
    const game = table("usopp-discard")
      .withHand("p1", [
        instance("sabo", "OP04-083"),
        instance("zoro", "OP10-095"),
        instance("ideo", "OP04-077"),
      ])
      .withDeckTop("p1", [
        instance("drawn-a", "OP10-046"),
        instance("drawn-b", "OP10-058"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP04-083" });

    expect(optionIdOf(await chosen(game))).toBe("ideo");
    expect(optionIdOf(await chosen(game, ["op10-usopp-discard"]))).toBe("zoro");
  });
});

describe("Rebecca's reveal", () => {
  it("reveals Kyros first, not the Franky ahead of it in hand", async () => {
    const game = table("usopp-rebecca")
      .withHand("p1", [
        instance("rebecca", "OP10-058"),
        instance("franky", "OP10-090"),
        instance("momo", "OP10-083"),
        instance("kyros", "OP10-046"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP10-058" });

    expect(optionIdOf(await chosen(game))).toBe("kyros");
    expect(optionIdOf(await chosen(game, ["op10-usopp-rebecca"]))).toBe(
      "franky",
    );
  });

  it("pairs a revealed Kyros with a 4-or-less rather than a second big body", async () => {
    const game = table("usopp-rebecca-pair")
      .withHand("p1", [
        instance("rebecca", "OP10-058"),
        instance("kyros", "OP10-046"),
        instance("luffy", "OP10-118"),
        instance("franky", "OP10-090"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP10-058" });
    game.play({ type: "resolve-effect", optionId: "kyros" });

    // Luffy costs 6, so revealed beside Kyros only one of the two is played.
    expect(optionIdOf(await chosen(game))).toBe("franky");
  });
});

describe("the Counter step", () => {
  it("spends two Counters to keep Kyros alive", async () => {
    const game = table("usopp-counter", "p2")
      .withBoard("p1", [character("kyros", "OP10-046", { rested: true })])
      .withHand("p1", [
        instance("moocy-a", "OP10-043"),
        instance("moocy-b", "OP10-043"),
      ])
      .withBoard("p2", [character("issho", "OP12-082")])
      // `bareTable` leaves no Life, and at 0 Life the generic step saves no
      // Character at all.
      .withLife("p1", [
        instance("life-a", "OP04-077"),
        instance("life-b", "OP04-077"),
        instance("life-c", "OP04-077"),
        instance("life-d", "OP04-077"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "issho",
      targetInstanceId: "kyros",
    });
    // No [Blocker] on the board, so the Block step offers only `pass`.
    while (game.state.phase === "block") game.pass();
    expect(game.state.phase).toBe("counter");

    // 10000 into 9000: 2000 short, a whole Counter card past the default cap.
    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op10-usopp-counter"])).type).toBe("pass");
  });
});

describe("the rest costs", () => {
  const zoro = (seed: string, target: boolean) => {
    let builder = table(seed)
      .withHand("p1", [instance("zoro", "OP10-095")])
      .withStage("p1", instance("coliseum", "OP04-096"));
    if (target)
      builder = builder.withBoard("p2", [character("small", "ST34-002")]);
    const game = builder.build();
    game.play({ type: "play-card", cardNumber: "OP10-095" });
    return game;
  };

  it("rests Corrida Coliseum rather than the Leader", async () => {
    const game = zoro("usopp-rest-stage", true);
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(optionIdOf(await chosen(game))).toBe("coliseum");
    expect(optionIdOf(await chosen(game, ["op10-usopp-rest-stage"]))).toBe(
      "p1-leader",
    );
  });

  it("declines Zoro's rest with nothing of cost 4 or less to K.O.", async () => {
    const game = zoro("usopp-dead-rest", false);

    expect(optionIdOf(await chosen(game))).toBe("skip");
    expect(optionIdOf(await chosen(game, ["op10-usopp-dead-rest"]))).toBe(
      "apply",
    );
  });
});
