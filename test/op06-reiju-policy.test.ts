import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Blue/Purple) Vinsmoke Reiju's rules: the opening hand, the DON!! parity
 * sequencing its [On Play]s read, OP06-065 Niji's bullet, and which card pays
 * a hand cost.
 *
 * Each judgement is pinned twice -- once as the decision the seat makes, and
 * once with the rule disabled -- so the test states what the generic ladder
 * would have done as well as what the rule does.
 */

const REIJU = "(Blue/Purple) Vinsmoke Reiju - 1st Place Store Battle";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP06-042";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

const decisionOf = (action: LegalAction) =>
  action.type === "mulligan-decision" ? action.decision : action.type;

/** The four non-openers every hand below shares: two big namesakes, Black Maria and Chopper. */
const FILLER = [
  instance("big-ichiji", "OP06-061"),
  instance("big-niji", "OP06-065"),
  instance("maria", "OP08-074"),
  instance("chopper", "OP07-066"),
];

const opening = (fifth: ReturnType<typeof instance>) =>
  scenario()
    .decks(REIJU, OPPONENT)
    .seed("reiju-mulligan")
    .withHand("p1", [...FILLER, fifth])
    .build();

describe("the opening hand", () => {
  it("keeps a hand with OP06-068 Reiju, the 2-cost sibling", async () => {
    expect(
      decisionOf(await chosen(opening(instance("small-reiju", "OP06-068")))),
    ).toBe("keep");
  });

  it("keeps a hand with OP10-063 Sanji, the 1-cost searcher", async () => {
    expect(
      decisionOf(await chosen(opening(instance("sanji", "OP10-063")))),
    ).toBe("keep");
  });

  it("ships a hand with no sibling and no searcher", async () => {
    const game = opening(instance("pudding", "OP06-047"));

    expect(decisionOf(await chosen(game))).toBe("mulligan");
    expect(decisionOf(await chosen(game, ["op06-reiju-mulligan"]))).toBe(
      "keep",
    );
  });
});

/**
 * A late-game table with `p1Field` DON!! active for the Reiju seat and
 * `p2Field` on the opponent's field, so the parity the [On Play]s read is set
 * by the position rather than by the turn count.
 */
const table = (seed: string, p1Field: number, p2Field: number) =>
  scenario()
    .decks(REIJU, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withDonDeck("p1", 10 - p1Field)
    .withDonDeck("p2", 10 - p2Field)
    .withLife("p1", [instance("life-1", "OP06-047")])
    .withLife("p2", [instance("life-2", "OP06-047")])
    .withDeckTop("p1", [
      instance("deck-1", "OP06-078"),
      instance("deck-2", "OP06-078"),
      instance("deck-3", "OP06-078"),
    ]);

const describeAction = (action: LegalAction) => {
  if (action.type === "play-card") return `play ${action.cardInstanceId}`;
  if (action.type === "activate-main")
    return `activate ${action.sourceInstanceId}`;
  if (action.type === "resolve-effect") {
    return action.option.kind === "card"
      ? `pick ${action.option.card.cardNumber}`
      : action.optionId;
  }
  return action.type;
};

describe("DON!! parity before a payoff", () => {
  it("swaps the small Reiju in before playing Chopper from one DON!! ahead", async () => {
    const game = table("reiju-parity", 8, 7)
      .withBoard("p1", [character("small-reiju", "OP06-068")])
      .withTrash("p1", [instance("big-reiju", "OP06-069")])
      .withHand("p1", [instance("chopper", "OP07-066")])
      .build();

    expect(describeAction(await chosen(game))).toBe("activate small-reiju");
    expect(
      describeAction(await chosen(game, ["op06-reiju#parity-before-payoff"])),
    ).toBe("play chopper");
  });

  it("plays the payoff when the field is already level", async () => {
    const game = table("reiju-parity-level", 7, 7)
      .withBoard("p1", [character("small-reiju", "OP06-068")])
      .withTrash("p1", [instance("big-reiju", "OP06-069")])
      .withHand("p1", [instance("chopper", "OP07-066")])
      .build();

    expect(describeAction(await chosen(game))).toBe("play chopper");
  });
});

describe("Black Maria", () => {
  it("waits until the sibling swap her DON!! would switch off is done", async () => {
    const game = table("reiju-maria", 7, 7)
      .withBoard("p1", [
        character("maria", "OP08-074"),
        character("small-niji", "OP06-064"),
      ])
      .withTrash("p1", [instance("big-niji", "OP06-065")])
      .build();

    expect(describeAction(await chosen(game))).toBe("activate small-niji");
    expect(
      describeAction(await chosen(game, ["op06-reiju#black-maria-last"])),
    ).toBe("activate maria");
  });
});

describe("OP06-065 Niji's bullet", () => {
  it("bounces when nothing on the other side costs 2 or less", async () => {
    const game = table("reiju-niji", 7, 7)
      .withHand("p1", [instance("big-niji", "OP06-065")])
      .withBoard("p2", [character("pudding", "OP06-047")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP06-065" });

    expect(describeAction(await chosen(game))).toBe("bounce");
    expect(
      describeAction(await chosen(game, ["op06-reiju#niji-live-mode"])),
    ).toBe("ko");
  });
});

describe("a card from hand for a cost", () => {
  it("trashes the 7-cost Ichiji to the Stage rather than the sibling that plays it", async () => {
    const game = table("reiju-stage", 7, 7)
      .withStage("p1", instance("stage", "OP06-079"))
      .withHand("p1", [
        instance("small-ichiji", "OP06-060"),
        instance("big-ichiji", "OP06-061"),
      ])
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "stage" });
    if (
      game.legalActions().some((action) => describeAction(action) === "apply")
    )
      game.play({ type: "resolve-effect", optionId: "apply" });

    expect(describeAction(await chosen(game))).toBe("pick OP06-061");
    expect(
      describeAction(await chosen(game, ["op06-reiju#trash-the-namesake"])),
    ).toBe("pick OP06-060");
  });
});

describe("a {GERMA} search", () => {
  it("takes the namesake the sibling on the field is missing", async () => {
    const game = table("reiju-search", 7, 7)
      .withBoard("p1", [character("small-reiju", "OP06-068")])
      .withHand("p1", [instance("sanji", "OP10-063")])
      .withDeckTop("p1", [
        instance("small-niji", "OP06-064"),
        instance("big-reiju", "OP06-069"),
        instance("event", "OP06-078"),
        instance("event-2", "OP06-078"),
        instance("event-3", "OP06-078"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP10-063" });

    expect(describeAction(await chosen(game))).toBe("pick OP06-069");
    expect(
      describeAction(await chosen(game, ["op06-reiju#complete-the-pair"])),
    ).toBe("pick OP06-064");
  });
});

describe("a namesake with no return to level the counts", () => {
  it("holds the big Reiju while its draw would not happen and the small one can play it", async () => {
    const game = table("reiju-hold-draw", 8, 7)
      .withHand("p1", [
        instance("big-reiju", "OP06-069"),
        instance("small-reiju", "OP06-068"),
      ])
      .build();

    expect(describeAction(await chosen(game))).toBe("play small-reiju");
    expect(
      describeAction(await chosen(game, ["op06-reiju#hold-reiju-draw"])),
    ).toBe("play big-reiju");
  });

  it("holds the big Niji while its bounce would not happen and the small one can play it", async () => {
    const game = table("reiju-hold-niji", 8, 7)
      .withHand("p1", [
        instance("big-niji", "OP06-065"),
        instance("small-niji", "OP06-064"),
      ])
      .build();

    expect(describeAction(await chosen(game))).toBe("play small-niji");
    expect(
      describeAction(await chosen(game, ["op06-reiju#hold-namesake-payoff"])),
    ).toBe("play big-niji");
  });

  it("plays the big Niji from level, where the bounce works", async () => {
    const game = table("reiju-hold-niji-level", 7, 7)
      .withHand("p1", [
        instance("big-niji", "OP06-065"),
        instance("small-niji", "OP06-064"),
      ])
      .build();

    expect(describeAction(await chosen(game))).toBe("play big-niji");
  });
});
