import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Green/Yellow) Shirahoshi's rules: the Leader's play before any hard cast
 * and which body it plays, where the turn's DON!! goes, which cards are held
 * until the Leader's Life card can pay for them, and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const SHIRAHOSHI = "(Green/Yellow) Shirahoshi - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP11-022";

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
    .decks(SHIRAHOSHI, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

const isLeaderActivation = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceCardNumber === LEADER;

describe("the Leader's activation", () => {
  it("is taken before hard-casting the {Neptunian} it could play for one DON!!", async () => {
    const game = table("shirahoshi-leader-first")
      .withHand("p1", [instance("scaled", "OP11-026")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .build();

    expect(isLeaderActivation(await chosen(game))).toBe(true);
    expect(await chosen(game, ["op11-shirahoshi-leader"])).toMatchObject({
      type: "play-card",
      cardInstanceId: "scaled",
    });
  });

  it("does not hold up the hand when the top Life card is already face-up", async () => {
    const game = table("shirahoshi-leader-face-up")
      .withHand("p1", [instance("scaled", "OP11-026")])
      .withLife("p1", [instance("life-1", "ST31-003", { faceUp: true })])
      .build();

    expect(await chosen(game)).toMatchObject({
      type: "play-card",
      cardInstanceId: "scaled",
    });
  });
});

describe("which body the Leader plays", () => {
  it("plays the 6-cost Scaled Neptunian over the 4-cost Spotted Neptunian", async () => {
    const game = table("shirahoshi-leader-pick")
      .withHand("p1", [
        instance("spotted", "OP11-036"),
        instance("scaled", "OP11-026"),
      ])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    while (
      game.state.pendingEffect &&
      !game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" && action.optionId === "scaled",
        )
    ) {
      const options = game
        .legalActions()
        .filter((action) => action.type === "resolve-effect");
      game.submit(
        options.find(
          (action) =>
            action.optionId === "apply" || action.optionId === "life-1",
        ) ?? options[0]!,
      );
    }

    expect(await chosen(game)).toMatchObject({ optionId: "scaled" });
    expect(await chosen(game, ["op11-shirahoshi-leader-pick"])).toMatchObject({
      optionId: "spotted",
    });
  });
});

describe("where the DON!! goes", () => {
  it("is never given to a Leader that cannot attack", async () => {
    const game = table("shirahoshi-leader-don")
      .withBoard("p1", [character("scaled", "OP11-026", { rested: true })])
      .withLife("p1", [instance("life-1", "ST31-003", { faceUp: true })])
      .build();

    const choice = await chosen(game);
    expect(
      choice.type === "attach-don" && choice.targetInstanceId === "p1-leader",
    ).toBe(false);
    expect(await chosen(game, ["op11-shirahoshi-leader-don"])).toMatchObject({
      type: "attach-don",
      targetInstanceId: "p1-leader",
    });
  });
});

describe("cards held for the Life card", () => {
  it("holds Otohime while the top Life card is face-down", async () => {
    const game = table("shirahoshi-otohime")
      .withHand("p1", [instance("otohime", "OP11-100")])
      .withLife("p1", [instance("life-1", "ST31-003")])
      .build();

    expect(await chosen(game)).not.toMatchObject({
      type: "play-card",
      cardInstanceId: "otohime",
    });
    expect(await chosen(game, ["op11-shirahoshi-otohime"])).toMatchObject({
      type: "play-card",
      cardInstanceId: "otohime",
    });
  });

  it("declines Zeus's Life card with nothing on the opposing field to K.O.", async () => {
    const atZeus = (seed: string, opposing: ReturnType<typeof character>[]) => {
      const game = table(seed)
        .withHand("p1", [instance("zeus", "OP11-106")])
        .withLife("p1", [instance("life-1", "ST31-003")])
        .withBoard("p2", opposing)
        .build();
      game.play({ type: "play-card", cardNumber: "OP11-106" });
      return game;
    };

    const empty = atZeus("shirahoshi-zeus-empty", []);
    expect(await chosen(empty)).toMatchObject({ optionId: "skip" });
    expect(await chosen(empty, ["op11-shirahoshi-zeus"])).toMatchObject({
      optionId: "apply",
    });

    const target = atZeus("shirahoshi-zeus-target", [
      character("five", "ST14-010"),
    ]);
    expect(await chosen(target)).toMatchObject({ optionId: "apply" });
  });
});

describe("the opening hand", () => {
  it("keeps OP11-030 Shirahoshi or Spotted Neptunian and ships a hand with neither", async () => {
    const hand = (opener: string) =>
      scenario()
        .decks(SHIRAHOSHI, OPPONENT)
        .seed("shirahoshi-mulligan")
        .withHand("p1", [
          instance("opener", opener),
          instance("a", "OP11-026"),
          instance("b", "OP11-031"),
          instance("c", "ST16-004"),
          instance("d", "OP11-115"),
        ])
        .build();

    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;
    expect(decisionOf(await chosen(hand("OP11-030")))).toBe("keep");
    expect(decisionOf(await chosen(hand("OP11-036")))).toBe("keep");
    expect(decisionOf(await chosen(hand("OP11-103")))).toBe("mulligan");
  });
});
