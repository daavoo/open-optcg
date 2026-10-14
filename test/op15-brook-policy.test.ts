import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Green/Black) Brook's deck budget: the Leader and three of the fifty's
 * bodies trash off the top of the deck, and the rule is what stops the seat
 * trashing the deck below what the game still needs.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const BROOK = "(Green/Black) Brook - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP15-022";
const BUDGET = "op15-brook-deck-budget";

type Game = ReturnType<ReturnType<typeof scenario>["build"]>;

async function chosen(
  game: Game,
  disable: readonly string[] = [],
): Promise<LegalAction> {
  const agent = new RegistryRulesAgent(LEADER, { disableModules: disable });
  return agent.chooseAction(observe(game.state, "p1"));
}

function describeAction(action: LegalAction): string {
  if (action.type === "resolve-effect") return action.optionId;
  if (action.type === "activate-main")
    return `activate:${action.sourceInstanceId}`;
  if (action.type === "play-card") return `play:${action.cardInstanceId}`;
  return action.type;
}

/**
 * A deck of `deck` cards, and an opponent on `life` Life. OP15-089 Franky is
 * the deck's own vanilla, so the cards milled change nothing but the counts.
 */
const table = (seed: string, deck: number, life: number) =>
  scenario()
    .decks(BROOK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withDeckTop("p1", copies(deck, "OP15-089", "deck"))
    .withDeckTop("p2", copies(life, "ST34-004", "life"))
    .withLife("p2", life);

describe("the Leader's mill", () => {
  it("trashes 4 while the deck stays deep enough", async () => {
    const game = table("brook-leader-deep", 14, 2)
      .withDonDeck("p1", 10)
      .build();

    expect(describeAction(await chosen(game))).toBe("activate:p1-leader");
  });

  it("holds the mill when it would leave fewer than ten cards", async () => {
    const game = table("brook-leader-thin", 13, 2)
      .withDonDeck("p1", 10)
      .build();

    expect(describeAction(await chosen(game))).not.toBe("activate:p1-leader");
    expect(describeAction(await chosen(game, [BUDGET]))).toBe(
      "activate:p1-leader",
    );
  });

  it("empties the deck on the turn the next hit wins", async () => {
    // The opponent has no Life left, so the set-active the Leader grants on
    // an empty deck is a hit that ends the game before the deck-out loss at
    // the end of the turn.
    const game = table("brook-leader-finish", 3, 0)
      .withDonDeck("p1", 10)
      .build();

    expect(describeAction(await chosen(game))).toBe("activate:p1-leader");
  });
});

describe("the bodies that mill on the way in", () => {
  const sanji = (seed: string, deck: number) =>
    table(seed, deck, 2)
      .withHand("p1", [instance("sanji", "OP15-081")])
      .withDon("p1", { active: 1 })
      .build();

  it("plays OP15-081 Sanji while its 5 leave the deck deep enough", async () => {
    expect(describeAction(await chosen(sanji("brook-sanji-deep", 15)))).toBe(
      "play:sanji",
    );
  });

  it("holds OP15-081 Sanji when its 5 would leave fewer than ten", async () => {
    const game = sanji("brook-sanji-thin", 14);

    expect(describeAction(await chosen(game))).not.toBe("play:sanji");
    expect(describeAction(await chosen(game, [BUDGET]))).toBe("play:sanji");
  });

  it("declines Pirates Docking Six's 3-card cost when the deck is thin", async () => {
    const game = table("brook-docking-thin", 12, 2)
      .withHand("p1", [instance("docking", "OP15-088")])
      .withTrash("p1", [instance("chopper", "OP15-085")])
      .withDon("p1", { active: 5 })
      .build();
    game.play({ type: "play-card", cardInstanceId: "docking" });

    expect((await chosen(game)).summary).toMatch(/^Don't apply/);
    expect((await chosen(game, [BUDGET])).summary).not.toMatch(/^Don't apply/);
  });
});

describe("the card a trash-reaching clause takes", () => {
  const TRASH = "op15-brook-trash-choice";

  it("has OP15-086 Nami play Luffy back, not the first card offered", async () => {
    const game = table("brook-nami-luffy", 20, 2)
      .withHand("p1", [instance("nami", "OP15-086")])
      .withTrash("p1", [
        instance("robin", "OP15-087"),
        instance("luffy", "OP15-092"),
      ])
      .withDon("p1", { active: 8 })
      .build();
    game.play({ type: "play-card", cardInstanceId: "nami" });

    expect(describeAction(await chosen(game))).toBe("luffy");
    expect(describeAction(await chosen(game, [TRASH]))).toBe("robin");
  });

  it("has OP15-085 Chopper fetch Luffy over Pirates Docking Six", async () => {
    const game = table("brook-chopper-luffy", 20, 2)
      .withBoard("p1", [character("chopper", "OP15-085")])
      .withTrash("p1", [
        instance("docking", "OP15-088"),
        instance("luffy", "OP15-092"),
      ])
      .withDonDeck("p1", 10)
      .build();
    game.play({ type: "activate-main", sourceInstanceId: "chopper" });

    expect(describeAction(await chosen(game))).toBe("luffy");
    expect(describeAction(await chosen(game, [TRASH]))).toBe("docking");
  });
});

describe("OP15-032 Brook's set-active", () => {
  const RESTAND = "op15-brook-restand";

  it("is not spent on a rested 5000 body", async () => {
    const game = table("brook-restand-small", 20, 2)
      .withBoard("p1", [
        character("brook", "OP15-032"),
        character("lola", "OP15-082", { rested: true }),
      ])
      .withDonDeck("p1", 10)
      .build();

    expect(describeAction(await chosen(game))).not.toBe("activate:brook");
    expect(describeAction(await chosen(game, [RESTAND]))).toBe(
      "activate:brook",
    );
  });

  it("sets the biggest rested attacker active", async () => {
    const game = table("brook-restand-luffy", 20, 2)
      .withBoard("p1", [
        character("brook", "OP15-032"),
        character("lola", "OP15-082", { rested: true }),
        character("luffy", "OP15-092", { rested: true }),
      ])
      .withTrash("p1", copies(10, "OP15-089", "trash"))
      .withDonDeck("p1", 10)
      .build();

    expect(describeAction(await chosen(game))).toBe("activate:brook");
    game.play({ type: "activate-main", sourceInstanceId: "brook" });
    expect(describeAction(await chosen(game))).toBe("luffy");
    expect(describeAction(await chosen(game, [RESTAND]))).toBe("lola");
  });
});

describe("the Counter step", () => {
  it("spends Counter to keep Luffy, which the generic step leaves to die", async () => {
    const game = scenario()
      .decks(BROOK, OPPONENT)
      .seed("brook-counter-luffy")
      .atTurn(11, { active: "p2" })
      .bareTable()
      .withDeckTop("p1", copies(20, "OP15-089", "deck"))
      .withLife("p1", 3)
      // Rested, as it is after attacking: only a rested Character can be
      // attacked.
      .withBoard("p1", [character("luffy", "OP15-092", { rested: true })])
      .withTrash("p1", copies(10, "OP15-089", "trash"))
      .withHand("p1", [instance("laboon", "OP15-035")])
      // 9000 into a 9000 Luffy, which a tie K.O.s: one Counter card saves it.
      .withBoard("p2", [character("attacker", "OP15-089")])
      .withGivenDon("p2", "attacker", 3)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "luffy",
    });
    while (game.state.phase === "block") game.pass();

    expect((await chosen(game)).type).toBe("counter");
    expect((await chosen(game, ["op15-brook-counter"])).type).toBe("pass");
  });
});
