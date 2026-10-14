import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/**
 * (Red/Blue) Nefeltari Vivi's rules: when the Leader rests for its ability and
 * where its halves go, the bounce targets, the dig, and the opening hand.
 *
 * Each case is pinned twice where the default differs -- once as the decision
 * the seat makes, and once with the module disabled -- so the test states what
 * the generic ladder would have done as well as what the rule does.
 */

const VIVI = "(Red/Blue) Nefeltari Vivi - Official Feature Deck";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "EB03-001";

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
  if (action.type === "attack") return `attack:${action.attackerInstanceId}`;
  return action.type;
}

const table = (seed: string, turn = 11) =>
  scenario()
    .decks(VIVI, OPPONENT)
    .seed(seed)
    .atTurn(turn, { active: "p1" })
    .bareTable();

const leaderActivation = (action: LegalAction) =>
  action.type === "activate-main" && action.sourceInstanceId === "p1-leader";

describe("the Leader's activation", () => {
  it("attacks with the Leader when nothing played this turn needs [Rush]", async () => {
    const game = table("vivi-hold")
      .withBoard("p1", [character("ready", "OP13-011", { playedTurn: 1 })])
      // No active DON!!, so nothing in hand competes with the two lines.
      .withDonDeck("p1", 10)
      .build();

    expect(game.legalActions().some(leaderActivation)).toBe(true);
    expect(leaderActivation(await chosen(game))).toBe(false);
    expect(leaderActivation(await chosen(game, ["eb03-vivi-leader"]))).toBe(
      true,
    );
  });

  it("rests the Leader once a Character played this turn is there to take [Rush]", async () => {
    const game = table("vivi-fire")
      .withBoard("p1", [character("fresh", "OP06-007", { playedTurn: 11 })])
      .withDonDeck("p1", 10)
      .build();

    expect(leaderActivation(await chosen(game))).toBe(true);
  });

  it("gives [Rush] to the largest of the Characters played this turn", async () => {
    const game = table("vivi-rush-target")
      .withBoard("p1", [
        character("ready", "OP09-009", { playedTurn: 1 }),
        character("cobra", "OP13-011", { playedTurn: 11 }),
        character("shanks", "OP06-007", { playedTurn: 11 }),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    // No opposing Character, so the −2000 has nothing to choose and the
    // first open prompt is the [Rush].
    while (
      game.state.pendingEffect &&
      !game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" && action.optionId === "shanks",
        )
    ) {
      game.play({ type: "resolve-effect" });
    }

    expect(describeAction(await chosen(game))).toBe("shanks");
  });

  it("shrinks the rested Character an attacker can then beat, not the bigger active one", async () => {
    const game = table("vivi-shrink-target")
      .withBoard("p1", [character("fresh", "OP09-009", { playedTurn: 11 })])
      .withBoard("p2", [
        character("big", "EB03-026"),
        character("reachable", "OP13-011", { rested: true }),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });

    // An 8000 active Hancock cannot be attacked at all; a rested 6000 Cobra at
    // 4000 is under Beckman's 7000.
    expect(describeAction(await chosen(game))).toBe("reachable");
  });
});

describe("Marguerite's and Hina's bounce", () => {
  it("returns the opposing 7000 Character, not Marguerite herself", async () => {
    const game = table("vivi-marguerite")
      .withHand("p1", [instance("marguerite", "EB03-027")])
      .withBoard("p2", [character("target", "OP09-009")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-027" });

    expect(describeAction(await chosen(game))).toBe("target");
  });

  it("returns nothing rather than one of its own 7000 bodies", async () => {
    const game = table("vivi-marguerite-own")
      .withBoard("p1", [character("beckman", "OP09-009")])
      .withHand("p1", [instance("marguerite", "EB03-027")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-027" });

    const pick = describeAction(await chosen(game));
    expect(["beckman", "marguerite"]).not.toContain(pick);
    // The ladder takes the first card offered, which is one of its own.
    const unruled = describeAction(await chosen(game, ["eb03-vivi-bounce"]));
    expect(["beckman", "marguerite"]).toContain(unruled);
  });

  it("declines Hina's card cost with no opposing 6000 Character", async () => {
    const game = table("vivi-hina")
      .withHand("p1", [
        instance("hina", "EB03-025"),
        instance("spare", "OP13-007"),
      ])
      .withBoard("p2", [character("big", "EB03-026")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-025" });

    const pick = await chosen(game);
    expect(pick.type).toBe("resolve-effect");
    expect(
      pick.type === "resolve-effect" &&
        pick.option.kind === "confirm" &&
        pick.option.choice === "apply",
    ).toBe(false);
  });
});

describe("OP13-012 Vivi's dig", () => {
  it("takes Nami over the vanilla Cobra offered first", async () => {
    const game = table("vivi-dig")
      .withHand("p1", [instance("digger", "OP13-012")])
      .withDeckTop("p1", [
        instance("cobra", "OP13-011"),
        instance("nami", "EB03-006"),
        instance("brothers", "OP13-007"),
        instance("chopper", "OP10-011"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-012" });

    expect(describeAction(await chosen(game))).toBe("nami");
    expect(describeAction(await chosen(game, ["eb03-vivi-search"]))).not.toBe(
      "nami",
    );
  });
});

describe("the opening hand", () => {
  it("keeps an early play beside a 5-cost body, and ships a hand without one", async () => {
    const keep = scenario()
      .decks(VIVI, OPPONENT)
      .seed("vivi-mulligan")
      .withHand("p1", [
        instance("digger", "OP13-012"),
        instance("shanks", "OP06-007"),
        instance("a", "EB03-011"),
        instance("b", "EB03-011"),
        instance("c", "EB03-011"),
      ])
      .build();
    const ship = scenario()
      .decks(VIVI, OPPONENT)
      .seed("vivi-mulligan")
      .withHand("p1", [
        instance("shanks", "OP06-007"),
        instance("beckman", "OP09-009"),
        instance("a", "EB03-011"),
        instance("b", "EB03-011"),
        instance("c", "EB03-011"),
      ])
      .build();

    const decisionOf = (action: LegalAction) =>
      action.type === "mulligan-decision" ? action.decision : action.type;
    expect(decisionOf(await chosen(keep))).toBe("keep");
    expect(decisionOf(await chosen(ship))).toBe("mulligan");
  });
});

describe("the hand-trash costs", () => {
  it("pays the Leader's K.O. replacement with the digger, not Shanks", async () => {
    // EB03-043 Stussy's [On Play] removes a 4-cost body, which the Leader
    // offers to save by trashing a card from hand instead.
    const game = scenario()
      .decks(VIVI, OPPONENT)
      .seed("vivi-discard")
      .atTurn(12, { active: "p2" })
      .withBoard("p1", [character("body", "EB03-035")])
      .withHand("p1", [
        instance("shanks", "OP06-007"),
        instance("digger", "OP13-012"),
      ])
      .withHand("p2", [instance("stussy", "EB03-043")])
      .withTrash("p2", [
        instance("cp-a", "EB03-040"),
        instance("cp-b", "OP13-110"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "EB03-043" });
    for (let guard = 0; guard < 12 && game.state.pendingEffect; guard++) {
      const offered = game
        .legalActions()
        .filter((action) => action.type === "resolve-effect")
        .map((action) => action.optionId);
      if (offered.includes("shanks")) break;
      const pick =
        offered.find((id) => id === "apply") ??
        offered.find((id) => id.startsWith("replace:")) ??
        offered[0]!;
      game.play({ type: "resolve-effect", optionId: pick });
    }

    expect(describeAction(await chosen(game))).toBe("digger");
    expect(describeAction(await chosen(game, ["eb03-vivi-discard"]))).toBe(
      "shanks",
    );
  });
});
