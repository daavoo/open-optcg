import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Blue/Purple) Sanji's rules: which Event the Leader's DON!! −1 activates and
 * whether there is one worth it, which half of Boeuf Burst to take, and the
 * opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const SANJI = "(Blue/Purple) Sanji - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP12-041";

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
    .decks(SANJI, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    // One DON!! for the Leader's −1 and a rested Leader, so the activation is
    // the only thing on offer besides ending the turn.
    .withDonDeck("p1", 9)
    .withRestedLeader("p1");

const leaderActivation = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceInstanceId === "p1-leader";

const optionIdOf = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

describe("the Leader's activation", () => {
  it("is not taken with only a Gum-Gum Giant to activate", async () => {
    const game = table("sanji-gate")
      .withHand("p1", [instance("giant", "OP09-078")])
      .build();

    expect(game.legalActions().some(leaderActivation)).toBe(true);
    expect(leaderActivation(await chosen(game))).toBe(false);
    expect(leaderActivation(await chosen(game, ["op12-sanji-gate"]))).toBe(
      true,
    );
  });

  it("activates Boeuf Burst rather than the Gum-Gum Giant ahead of it", async () => {
    const game = table("sanji-event")
      .withHand("p1", [
        instance("giant", "OP09-078"),
        instance("boeuf", "OP12-060"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(optionIdOf(await chosen(game))).toBe("boeuf");
    expect(optionIdOf(await chosen(game, ["op12-sanji-event"]))).toBe("giant");
  });

  it("does not spend the activation on a Gum-Gum Lightning with nothing to K.O.", async () => {
    const game = table("sanji-event-lightning")
      .withHand("p1", [instance("lightning", "OP09-077")])
      .withBoard("p2", [character("big", "OP12-065")])
      .build();

    expect(leaderActivation(await chosen(game))).toBe(false);
  });
});

describe("Boeuf Burst", () => {
  const cast = (seed: string, board: ReturnType<typeof character>[]) => {
    const game = scenario()
      .decks(SANJI, OPPONENT)
      .seed(seed)
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("boeuf", "OP12-060")])
      .withBoard("p2", board)
      .build();
    game.play({ type: "activate-main", cardNumber: "OP12-060" });
    return game;
  };

  it("draws 2 when there is nothing to bounce", async () => {
    const game = cast("sanji-boeuf-draw", []);

    expect(optionIdOf(await chosen(game))).toBe("draw");
    expect(optionIdOf(await chosen(game, ["op12-sanji-boeuf"]))).toBe("bounce");
  });

  it("bounces a 4-cost", async () => {
    const game = cast("sanji-boeuf-bounce", [
      character("katakuri", "ST34-002"),
    ]);

    expect(optionIdOf(await chosen(game))).toBe("bounce");
  });
});

describe("the opening hand", () => {
  it("keeps a Charlotte Pudding and sends back a hand of Counters", async () => {
    const keep = scenario()
      .decks(SANJI, OPPONENT)
      .seed("sanji-mulligan")
      .withHand("p1", [
        instance("pudding", "OP12-071"),
        instance("reiju", "OP12-063"),
        instance("zeff", "OP12-072"),
        instance("a", "OP09-078"),
        instance("b", "OP12-059"),
      ])
      .build();
    const ship = scenario()
      .decks(SANJI, OPPONENT)
      .seed("sanji-mulligan")
      .withHand("p1", [
        instance("reiju", "OP12-063"),
        instance("zeff", "OP12-072"),
        instance("ivankov", "OP12-065"),
        instance("a", "OP09-078"),
        instance("b", "OP12-059"),
      ])
      .build();

    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;
    expect(decisionOf(await chosen(keep))).toBe("keep");
    expect(decisionOf(await chosen(ship))).toBe("mulligan");
  });
});
