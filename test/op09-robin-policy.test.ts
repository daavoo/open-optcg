import { describe, expect, it } from "vitest";
import { observe, type GameState } from "@one-piece-sim/engine-core";
import { RegistryRulesAgent } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { instance, scenario, type Game } from "./support/index.js";

/**
 * Purple/Yellow Nico Robin's two effect rules, posed as boards.
 *
 * Both decisions were found by probing the rules seat over the field: which
 * card pays a hand cost, and which card OP16-119 banks, were each answered by
 * the first option the engine offered. Paying the Leader's ramp cost the deck
 * its OP16-119 and its OP17-114 while OP12-112 Baby 5 sat in hand; banking
 * took EB04-058, which prints no Trigger, over a body that plays itself.
 *
 * The real agent is driven rather than one rule ranked in isolation: the
 * rules only `rank`, so what the seat pays is a property of the rule *and*
 * `chooseGenericRules`, and a rank asserted alone would pass while the seat
 * still paid the wrong card.
 */
const DECK = "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1";
const OPPONENT = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** p1 on the Robin list, in its own Main Phase with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(DECK, OPPONENT).seed(seed).atTurn(11, { active: "p1" });

const agent = () => new RegistryRulesAgent("OP09-062");

type EffectAction = Extract<LegalAction, { type: "resolve-effect" }>;

/** The card option the Robin seat picks at the decision in front of it. */
async function chosenCard(state: GameState): Promise<string> {
  const action = (await agent().chooseAction(
    observe(state, "p1"),
  )) as EffectAction;
  expect(action.type).toBe("resolve-effect");
  expect(action.option.kind).toBe("card");
  return action.option.kind === "card" ? action.option.card.instanceId : "";
}

const attackWithLeader = (game: Game) => {
  game.play({
    type: "attack",
    attackerInstanceId: "p1-leader",
    targetInstanceId: "p2-leader",
  });
  game.play({ type: "resolve-effect", optionId: "apply" });
};

describe("which [Trigger] card pays the Leader's ramp", () => {
  it("pays with OP12-112 Baby 5 rather than the plan cards or an aura body", async () => {
    // The probe's worst line: a hand of OP16-119, OP17-114 and OP12-112, and
    // the seat trashed the Teach because it was offered first.
    const game = table("op09-robin-fuel-baby5")
      .bareTable()
      .withDonDeck("p1", 2)
      .withHand("p1", [
        instance("teach", "OP16-119"),
        instance("generals", "OP17-114"),
        instance("baby5", "OP12-112"),
      ])
      .build();
    attackWithLeader(game);

    expect(await chosenCard(game.state)).toBe("baby5");
  });

  it("pays with the textless 4000 body before the ones that do something", async () => {
    // No Baby 5 in hand: OP17-107 Daifuku prints nothing but its Trigger, so
    // it is the fuel, ahead of OP17-109's draw and OP17-106's bank.
    const game = table("op09-robin-fuel-daifuku")
      .bareTable()
      .withDonDeck("p1", 2)
      .withHand("p1", [
        instance("smoothie", "OP17-106"),
        instance("pudding", "OP17-109"),
        instance("daifuku", "OP17-107"),
      ])
      .build();
    attackWithLeader(game);

    expect(await chosenCard(game.state)).toBe("daifuku");
  });

  it("never pays with OP16-119 while any other [Trigger] card is in hand", async () => {
    const game = table("op09-robin-fuel-never-teach")
      .bareTable()
      .withDonDeck("p1", 2)
      .withHand("p1", [
        instance("teach", "OP16-119"),
        instance("perospero", "OP17-110"),
      ])
      .build();
    attackWithLeader(game);

    expect(await chosenCard(game.state)).toBe("perospero");
  });
});

describe("which [Trigger] card pays OP17-109's draw", () => {
  it("is the same order: Baby 5 first", async () => {
    const game = table("op09-robin-pudding-fuel")
      .bareTable()
      .withHand("p1", [
        instance("pudding", "OP17-109"),
        instance("oven", "OP17-102"),
        instance("baby5", "OP12-112"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-109" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(await chosenCard(game.state)).toBe("baby5");
  });
});

describe("which card OP16-119 banks onto Life", () => {
  const teachLooksAt = (seed: string, top: [string, string, string]) => {
    const game = table(seed)
      .bareTable()
      .withHand("p1", [instance("teach", "OP16-119")])
      .withDeckTop("p1", [
        instance("first", top[0]),
        instance("second", top[1]),
        instance("third", top[2]),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP16-119" });
    return game;
  };

  it("banks the body that plays itself over a [Blocker] with no Trigger", async () => {
    // The probe's line: EB04-058 first off the deck, OP17-114 behind it, and
    // the seat banked the Borsalino.
    const game = teachLooksAt("op09-robin-bank-generals", [
      "EB04-058",
      "OP17-112",
      "OP17-114",
    ]);

    expect(await chosenCard(game.state)).toBe("third");
  });

  it("banks OP12-112 Baby 5 when nothing plays itself: two cards behind this Leader", async () => {
    const game = teachLooksAt("op09-robin-bank-baby5", [
      "EB04-058",
      "OP12-112",
      "ST34-003",
    ]);

    expect(await chosenCard(game.state)).toBe("second");
  });

  it("still banks a card with no Trigger rather than nothing", async () => {
    const game = teachLooksAt("op09-robin-bank-anything", [
      "EB04-058",
      "ST34-003",
      "OP17-074",
    ]);
    const lifeBefore = game.state.players.p1.life.length;

    const action = await agent().chooseAction(observe(game.state, "p1"));
    expect(action.type).toBe("resolve-effect");
    if (action.type !== "resolve-effect") return;
    expect(action.option.kind).toBe("card");
    game.submit(action);

    expect(game.state.players.p1.life.length).toBe(lifeBefore + 1);
  });
});
