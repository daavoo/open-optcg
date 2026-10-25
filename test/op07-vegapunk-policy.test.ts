import { describe, expect, it } from "vitest";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import { observe } from "@one-piece-sim/engine-core";
import type { LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario } from "./support/index.js";

/** (Yellow) Vegapunk's rules: the opening hand. */

const VEGAPUNK = "(Yellow) Vegapunk - 1st Place Store Battle 2026-06-19";
/** Katakuri, so no matchup module intercepts ahead of the deck's own rules. */
const OPPONENT = "(Purple) Charlotte Katakuri - Starter Deck 34";
const LEADER = "OP07-097";

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

/** Four {Egghead} bodies the Leader can play, none of which finds the next card. */
const bodies = [
  instance("shaka", "OP07-101"),
  instance("atlas", "OP07-098"),
  instance("edison", "OP07-100"),
  instance("pythagoras", "OP07-105"),
];

const opening = (fifth: ReturnType<typeof instance>) =>
  scenario()
    .decks(VEGAPUNK, OPPONENT)
    .seed("vegapunk-mulligan")
    .withHand("p1", [...bodies, fifth])
    .build();

describe("the opening hand", () => {
  it("keeps Lilith, the Vegapunk body or a digging Event", async () => {
    for (const opener of [
      instance("lilith", "OP07-111"),
      instance("vegapunk", "EB02-056"),
      instance("mind", "OP07-114"),
      instance("dereshi", "OP09-117"),
    ]) {
      expect(decisionOf(await chosen(opening(opener)))).toBe("keep");
    }
  });

  it("ships a hand of bodies with nothing to find the next one", async () => {
    const game = opening(instance("nami", "OP08-106"));

    expect(decisionOf(await chosen(game))).toBe("mulligan");
  });
});

/** Late enough that every DON!! is on the field, with nothing else in the way. */
const table = (seed: string) =>
  scenario()
    .decks(VEGAPUNK, OPPONENT)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", LEADER);

const optionInstance = (action: LegalAction) =>
  action.type === "resolve-effect" && action.option.kind === "card"
    ? action.option.card.instanceId
    : undefined;

describe("the Leader's activation", () => {
  it("runs before the hand is hard-cast", async () => {
    const game = table("vegapunk-leader-first")
      .withHand("p1", [
        instance("franky", "OP07-107"),
        instance("shaka", "OP07-101"),
      ])
      .build();

    const action = await chosen(game);
    expect(action.type).toBe("activate-main");
    expect(
      action.type === "activate-main" ? action.sourceCardNumber : undefined,
    ).toBe(LEADER);
    expect((await chosen(game, ["op07-vegapunk-leader-first"])).type).toBe(
      "play-card",
    );
  });

  it("selects the body whose [Trigger] plays it, not the first in hand", async () => {
    const game = table("vegapunk-leader-pick")
      .withHand("p1", [
        instance("vegapunk", "EB02-056"),
        instance("shaka", "OP07-101"),
      ])
      .build();
    game.play({ type: "activate-main", summary: LEADER });

    expect(optionInstance(await chosen(game))).toBe("shaka");
    expect(
      optionInstance(await chosen(game, ["op07-vegapunk-leader-pick"])),
    ).toBe("vegapunk");
  });

  it("banks the card face-up on Life rather than playing it", async () => {
    const game = table("vegapunk-leader-mode")
      .withHand("p1", [instance("shaka", "OP07-101")])
      .build();
    game.play({ type: "activate-main", summary: LEADER });
    game.play({ type: "resolve-effect", optionId: "shaka" });

    const mode = (action: LegalAction) =>
      action.type === "resolve-effect" && action.option.kind === "mode"
        ? action.option.mode
        : undefined;
    expect(mode(await chosen(game))).toBe("life");
    expect(mode(await chosen(game, ["op07-vegapunk-leader-mode"]))).toBe(
      "play",
    );
  });
});

describe("a Leader hit onto a banked body", () => {
  it("is let through rather than blocked", async () => {
    const game = table("vegapunk-take-the-trigger")
      .withLife("p1", [
        instance("life-a", "OP07-107"),
        instance("life-b", "OP07-107"),
      ])
      .withHand("p1", [instance("atlas", "OP07-098")])
      .withBoard("p1", [character("shaka", "OP07-101")])
      // p2 draws to start its turn, and bareTable() left its deck empty.
      .withDeckTop("p2", [instance("their-draw", "ST34-002")])
      .build();
    game.play({ type: "activate-main", summary: LEADER });
    game.play({ type: "resolve-effect", optionId: "atlas" });
    game.play({ type: "resolve-effect", optionId: "life" });
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    // Katakuri's Leader offers its DON!! return on the attack.
    while (game.state.activePlayer === "p2") game.play({ summary: "Skip" });

    expect(game.state.phase).toBe("block");
    expect((await chosen(game)).type).toBe("pass");
    expect((await chosen(game, ["op07-vegapunk-take-the-trigger"])).type).toBe(
      "block",
    );
  });
});

describe("a search", () => {
  it("takes the body worth most banked, not the first in the look", async () => {
    const game = table("vegapunk-search")
      .withHand("p1", [instance("lilith", "OP07-111")])
      .withDeckTop("p1", [
        instance("franky", "OP07-107"),
        instance("edison", "OP07-100"),
        instance("atlas", "OP07-098"),
        instance("filler-a", "OP07-107"),
        instance("filler-b", "OP07-107"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP07-111" });

    expect(optionInstance(await chosen(game))).toBe("atlas");
    expect(optionInstance(await chosen(game, ["op07-vegapunk-search"]))).toBe(
      "franky",
    );
  });
});

describe("the Egghead Stage", () => {
  it("sets the rested [Blocker] active, not the first rested body", async () => {
    const game = table("vegapunk-stage")
      .withStage("p1", instance("egghead", "OP07-117"))
      .withBoard("p1", [
        character("atlas", "OP07-098", { rested: true }),
        character("shaka", "OP07-101", { rested: true }),
      ])
      .withLife("p1", 3)
      .build();

    game.pass();

    expect(optionInstance(await chosen(game))).toBe("shaka");
    expect(
      optionInstance(await chosen(game, ["op07-vegapunk-stage"])),
    ).not.toBe("shaka");
  });
});
