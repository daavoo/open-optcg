import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, copies, instance, scenario } from "./support/index.js";

/**
 * (Black) Yamato's rules: when OP16-098 swaps, what its own [On Play]
 * trashes, and holding an 8-cost Yamato in hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const YAMATO = "(Black) Yamato - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP16-079";

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
    .decks(YAMATO, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    // Named Life with no [Trigger], so the Leader's attack is not lethal.
    .withLife("p2", copies(3, "OP16-088", "life"));

/**
 * Spend the Leader's attack, which the ladder declares ahead of any
 * activation, so the decision left is the one under test.
 */
function attackWithLeader(game: Game): void {
  game.play({
    type: "attack",
    attackerInstanceId: "p1-leader",
    targetInstanceId: "p2-leader",
  });
  while (game.state.activePlayer !== "p1" || game.state.phase !== "main") {
    const actions = game.legalActions();
    // Katakuri's Leader offers its defender a DON!! return mid-battle.
    game.submit(
      actions.find((action) => action.type === "pass") ??
        actions.find((action) => action.summary.startsWith("Skip")) ??
        actions[0]!,
    );
  }
}

const activates = (instanceId: string) => (action: LegalAction) =>
  action.type === "activate-main" && action.sourceInstanceId === instanceId;

describe("OP16-098's swap", () => {
  it("is held while the 6-cost can still attack", async () => {
    const game = table("yamato-swap-attack-first")
      .withBoard("p1", [character("six", "OP16-098", { playedTurn: 1 })])
      .withTrash("p1", [instance("eight", "OP16-096")])
      .withDonDeck("p1", 10)
      .build();
    attackWithLeader(game);

    expect(activates("six")(await chosen(game))).toBe(false);
    expect(activates("six")(await chosen(game, ["op16-yamato-swap"]))).toBe(
      true,
    );
  });

  it("fires once the 6-cost has attacked and an 8-cost is in the trash", async () => {
    const game = table("yamato-swap-fire")
      .withBoard("p1", [character("six", "OP16-098", { rested: true })])
      .withTrash("p1", [instance("eight", "OP16-096")])
      .withDonDeck("p1", 10)
      .build();
    attackWithLeader(game);

    expect(activates("six")(await chosen(game))).toBe(true);
  });
});

describe("OP16-098's [On Play] trash", () => {
  it("trashes an 8-cost Yamato when the trash has none", async () => {
    const game = table("yamato-setup")
      .withHand("p1", [
        instance("six", "OP16-098"),
        instance("filler", "OP16-088"),
        instance("eight", "OP16-097"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP16-091")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-098" });
    const choice = await chosen(game);
    expect(choice.type === "resolve-effect" && choice.optionId).toBe("eight");
  });
});

describe("an 8-cost Yamato in hand", () => {
  it("is not cast while OP16-098 can play it out of the trash", async () => {
    const game = table("yamato-hold-eight")
      .withHand("p1", [
        instance("eight", "OP16-096"),
        instance("six", "OP16-098"),
      ])
      .build();

    const castsEight = (action: LegalAction) =>
      action.type === "play-card" && action.summary.includes("[OP16-096]");
    expect(game.legalActions().some(castsEight)).toBe(true);
    expect(castsEight(await chosen(game))).toBe(false);
    expect(castsEight(await chosen(game, ["op16-yamato-hold-eight"]))).toBe(
      true,
    );
  });
});

const optionChosen = (action: LegalAction) =>
  action.type === "resolve-effect" ? action.optionId : action.type;

describe("what a trash play brings back", () => {
  it("OP16-099 plays OP16-098 back ahead of a bigger body", async () => {
    const game = table("yamato-revive")
      .withHand("p1", [instance("chains", "OP16-099")])
      .withTrash("p1", [
        instance("nami", "OP16-091"),
        instance("kinemon", "OP16-082"),
        instance("six", "OP16-098"),
      ])
      .withDeckTop("p1", copies(5, "ST34-005", "milled"))
      .build();

    game.play({ type: "activate-main", cardNumber: "OP16-099" });
    while (!game.legalActions().some((a) => optionChosen(a) === "six")) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }

    expect(optionChosen(await chosen(game))).toBe("six");
  });

  it("takes the biggest attacker when OP16-098 is not there", async () => {
    const game = table("yamato-revive-power")
      .withHand("p1", [instance("chains", "OP16-099")])
      .withTrash("p1", [
        instance("nami", "OP16-091"),
        instance("kinemon", "OP16-082"),
      ])
      .withDeckTop("p1", copies(5, "ST34-005", "milled"))
      .build();

    game.play({ type: "activate-main", cardNumber: "OP16-099" });
    while (!game.legalActions().some((a) => optionChosen(a) === "kinemon")) {
      game.play({ type: "resolve-effect", optionId: "apply" });
    }

    expect(optionChosen(await chosen(game))).toBe("kinemon");
  });
});

describe("what OP16-097 recovers", () => {
  it("takes OP16-098 back when the hand has none", async () => {
    const game = table("yamato-recover")
      .withHand("p1", [instance("yamato", "OP16-097")])
      .withTrash("p1", [
        instance("luffy", "OP16-095"),
        instance("six", "OP16-098"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-097" });
    expect(optionChosen(await chosen(game))).toBe("six");
  });
});

describe("what Nami keeps from the top 4", () => {
  it("keeps OP16-098 and leaves the 8-cost to be trashed", async () => {
    const game = table("yamato-dig")
      .withHand("p1", [instance("nami", "OP16-091")])
      .withDeckTop("p1", [
        instance("eight", "OP16-096"),
        instance("six", "OP16-098"),
        ...copies(2, "ST34-005", "miss"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-091" });
    expect(optionChosen(await chosen(game))).toBe("six");
  });

  it("with OP16-098 already in hand, takes anything but the 8-cost", async () => {
    const game = table("yamato-dig-held")
      .withHand("p1", [
        instance("nami", "OP16-091"),
        instance("held", "OP16-098"),
      ])
      .withDeckTop("p1", [
        instance("eight", "OP16-096"),
        instance("kinemon", "OP16-082"),
        ...copies(2, "ST34-005", "miss"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-091" });
    expect(optionChosen(await chosen(game))).toBe("kinemon");
  });
});

describe("the Counter window", () => {
  it("spends a 1000 Counter other than OP16-098", async () => {
    const game = scenario()
      .decks(YAMATO, OPPONENT)
      .seed("yamato-counter")
      .atTurn(4, { active: "p2" })
      .bareTable()
      .withHand("p1", [
        instance("six", "OP16-098"),
        instance("nami", "OP16-091"),
      ])
      .withBoard("p2", [character("attacker", "ST34-005")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 6000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    const choice = await chosen(game);
    expect(choice.type).toBe("counter");
    expect(choice.summary).toContain("Nami");
    const unprotected = await chosen(game, ["op16-yamato-counter"]);
    expect(unprotected.summary).toContain("OP16-098");
  });
});
