import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Purple) Donquixote Doflamingo's redirect: whether the Leader pays its
 * DON!! -1, and which body the attack is moved onto.
 *
 * Each case is pinned against the module disabled as well, so the test says
 * what the generic ladder would have done -- pay on every attack -- beside
 * what the rule does.
 */

const DOFLAMINGO = "(Purple) Donquixote Doflamingo - Official Feature Deck";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";
const LEADER = "OP14-060";
const MODULE = "op14-doflamingo-redirect";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const optionOf = (action: LegalAction): string | undefined =>
  action.type === "resolve-effect" ? action.optionId : undefined;

/** p2's 6000 Kouzuki Oden swings at p1's Leader. */
const attacked = (seed: string, board: ReturnType<typeof character>[]) => {
  const game = scenario()
    .decks(DOFLAMINGO, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withBoard("p1", board)
    .withLife("p1", copies(3, "OP14-073", "life"))
    .withBoard("p2", [character("attacker", "ST32-002")])
    .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
    .build();
  game.pass();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  return game;
};

describe("OP14-060's redirect", () => {
  it("pays to move the attack onto a body it cannot beat, and names that body", async () => {
    const game = attacked("doflamingo-redirect-wall", [
      character("dellinger", "OP14-067"),
      character("machvise", "OP14-073"),
    ]);

    expect(optionOf(await chosen(game))).toBe("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(optionOf(await chosen(game))).toBe("machvise");
  });

  it("moves it onto an [On K.O.] body when nothing survives", async () => {
    const game = attacked("doflamingo-redirect-payoff", [
      character("pica", "OP14-071"),
      character("dellinger", "OP14-067"),
    ]);

    expect(optionOf(await chosen(game))).toBe("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(optionOf(await chosen(game))).toBe("dellinger");
  });

  it("keeps its DON!! when the only landing is a body that dies for nothing", async () => {
    // Pica is a 6000 with no [On K.O.]: the attacker wins the tie, so moving
    // the attack trades a DON!! and a body for one Life card.
    const game = attacked("doflamingo-redirect-hold", [
      character("pica", "OP14-071"),
    ]);

    expect(optionOf(await chosen(game))).toBe("skip");
    expect(optionOf(await chosen(game, [MODULE]))).toBe("apply");
  });
});

/** p1 at turn 11 with every DON!! active and an empty table. */
const main = (seed: string) =>
  scenario()
    .decks(DOFLAMINGO, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLife("p1", copies(3, "OP14-073", "life"))
    .withLife("p2", copies(3, "ST32-005", "p2-life"));

const pickedCard = (action: LegalAction): string | undefined =>
  action.type === "resolve-effect" && action.option.kind === "card"
    ? action.option.card.cardNumber
    : undefined;

describe("the deck's search table", () => {
  it("takes Monet over the other Donquixote Pirates cards OP10-078 finds", async () => {
    const game = main("doflamingo-search")
      .withHand("p1", [instance("event", "OP10-078")])
      .withDeckTop("p1", [
        instance("sugar", "OP10-065"),
        instance("dellinger", "OP14-067"),
        instance("monet", "OP14-074"),
      ])
      .build();
    game.play({ type: "activate-main", cardNumber: "OP10-078" });

    expect(pickedCard(await chosen(game))).toBe("OP14-074");
    expect(pickedCard(await chosen(game, ["search:op14-doflamingo"]))).not.toBe(
      "OP14-074",
    );
  });
});

describe("Monet's [On K.O.] trash", () => {
  it("spends a spent searcher, not the finisher", async () => {
    const game = main("doflamingo-monet-trash")
      .withBoard("p1", [character("monet", "OP14-074", { rested: true })])
      .withHand("p1", [
        instance("finisher", "OP14-069"),
        instance("searcher", "OP10-065"),
      ])
      .withDeckTop("p1", [
        instance("draw-1", "OP14-069"),
        instance("draw-2", "OP10-071"),
      ])
      .withBoard("p2", [character("attacker", "ST32-002")])
      .withDeckTop("p2", copies(3, "ST32-005", "p2-deck"))
      .build();
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "monet",
    });
    // Decline every defence until Monet's trash is the decision on the table.
    while (
      !game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" &&
            action.sourceCardNumber === "OP14-074" &&
            action.option.kind === "card",
        )
    ) {
      const actions = game.legalActions();
      game.submit(
        actions.find((action) => action.type === "pass") ??
          actions.find(
            (action) =>
              action.type === "resolve-effect" && action.option.kind === "skip",
          ) ??
          actions[0]!,
      );
    }

    expect(pickedCard(await chosen(game))).toBe("OP10-065");
    expect(pickedCard(await chosen(game, ["op14-doflamingo-trash"]))).not.toBe(
      "OP10-065",
    );
  });
});

describe("OP14-069's branch", () => {
  const cast = (seed: string, board: ReturnType<typeof character>[]) => {
    const game = main(seed)
      .withHand("p1", [instance("finisher", "OP14-069")])
      .withBoard("p2", board)
      .build();
    game.play({ type: "play-card", cardNumber: "OP14-069" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (
      !game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" && action.option.kind === "mode",
        )
    ) {
      game.submit(
        game.legalActions().find((action) => action.type === "resolve-effect")!,
      );
    }
    return game;
  };
  const modeOf = (action: LegalAction) =>
    action.type === "resolve-effect" && action.option.kind === "mode"
      ? action.option.mode
      : undefined;

  it("locks three attackers rather than K.O. one", async () => {
    const game = cast("doflamingo-lock", [
      character("a", "ST32-002"),
      character("b", "ST32-002"),
      character("c", "ST32-004"),
    ]);

    expect(modeOf(await chosen(game))).toBe("lock");
    expect(modeOf(await chosen(game, ["op14-doflamingo-finisher"]))).toBe("ko");
  });

  it("K.O.s when the lock would hold fewer than three", async () => {
    const game = cast("doflamingo-ko", [
      character("a", "ST32-002"),
      character("b", "ST32-004"),
    ]);

    expect(modeOf(await chosen(game))).toBe("ko");
  });
});
