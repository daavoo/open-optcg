import { describe, expect, it } from "vitest";
import { getLegalActions, type GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * The clauses the (Red/Green) Monkey.D.Luffy list behind OP13-001 is
 * responsible for.
 *
 * A card only enters the clause-coverage gate once a deck ships it, and this
 * list is the first to run the OP13-001 Leader, OP13-027 Sanji, OP13-118
 * Monkey.D.Luffy and OP15-035 Laboon -- so these are the clauses that arrived
 * with it.
 */

const LUFFY = "(Red/Green) Monkey.D.Luffy - Open OPTCG";
const ZORO = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1, behind OP13-001, in its own Main Phase with ten DON!! active. */
const table = (seed: string) =>
  scenario()
    .decks(LUFFY, ZORO)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** p2 attacking into the OP13-001 Leader. */
const defending = (seed: string) =>
  scenario()
    .decks(LUFFY, ZORO)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

function attack(game: Game, targetInstanceId: string) {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId,
  });
}

describe("OP13-001 Monkey.D.Luffy (Leader)", () => {
  covers("OP13-001", "[On Your Opponent's Attack]");

  it("rests the DON!! chosen for +2000 apiece on the Leader", () => {
    // One given to the Leader for the [DON!! x1], three left active.
    const game = defending("op13-001-rest-two")
      .withGivenDon("p1", "p1-leader", 1)
      .withDonDeck("p1", 6)
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();

    attack(game, "p1-leader");
    // "You may": declining keeps the DON!! for a [Counter] Event.
    expect(effectOptions(game.state)).toEqual(["apply", "skip"]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    // Branches that cannot be paid are not offered: three active DON!!, three.
    expect(effectOptions(game.state)).toEqual(["rest-1", "rest-2", "rest-3"]);
    game.play({ type: "resolve-effect", optionId: "rest-2" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(game.state.players.p1.activeDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("raises a {Straw Hat Crew} Character under attack", () => {
    const game = defending("op13-001-straw-hat")
      .withGivenDon("p1", "p1-leader", 1)
      .withDonDeck("p1", 6)
      .withBoard("p1", [character("sanji", "OP13-027", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();

    attack(game, "sanji");
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "rest-1" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });

  it("is not offered for a Character outside the crew", () => {
    // OP15-035 Laboon is an {Animal}: "this Leader or up to 1 of your {Straw
    // Hat Crew} type Characters" cannot reach it, so resting DON!! would buy
    // nothing.
    const game = defending("op13-001-animal")
      .withGivenDon("p1", "p1-leader", 1)
      .withDonDeck("p1", 6)
      .withBoard("p1", [character("laboon", "OP15-035", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();

    attack(game, "laboon");

    expect(effectOptions(game.state)).not.toContain("apply");
    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });

  it("is not offered above five active DON!!", () => {
    const game = defending("op13-001-six-active")
      .withGivenDon("p1", "p1-leader", 1)
      .withDonDeck("p1", 3)
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();

    attack(game, "p1-leader");

    expect(effectOptions(game.state)).not.toContain("apply");
    expect(game.state.players.p1.activeDon).toHaveLength(6);
  });

  it("is not offered without a DON!! given to the Leader", () => {
    const game = defending("op13-001-unpaid")
      .withDonDeck("p1", 7)
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();

    attack(game, "p1-leader");

    expect(effectOptions(game.state)).not.toContain("apply");
  });

  it("rests nothing when declined", () => {
    const game = defending("op13-001-decline")
      .withGivenDon("p1", "p1-leader", 1)
      .withDonDeck("p1", 4)
      .withBoard("p2", [character("attacker", "ST32-004", { playedTurn: 1 })])
      .build();

    attack(game, "p1-leader");
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(game.state.players.p1.activeDon).toHaveLength(5);
    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
  });
});

describe("OP13-027 Sanji", () => {
  covers("OP13-027", "[On Play]", "[End of Your Turn]");

  it("sets two DON!! active on play", () => {
    // Five left active to pay the 5 cost, four already spent.
    const game = table("op13-027-on-play")
      .withDonDeck("p1", 5)
      .withDon("p1", { rested: 4 })
      .withHand("p1", [instance("sanji", "OP13-027")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-027" });
    settle(game);

    // Five paid the cost and two came back: two active, seven rested.
    expect(game.state.players.p1.activeDon).toHaveLength(2);
    expect(game.state.players.p1.restedDon).toHaveLength(7);
  });

  it("sets one DON!! active at the end of the turn behind a Straw Hat Leader", () => {
    const game = table("op13-027-end-of-turn")
      .withDonDeck("p1", 10)
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [character("sanji", "OP13-027", { playedTurn: 1 })])
      .build();

    game.pass();
    settle(game);

    // p1's DON!! at the start of p2's turn: the one Sanji set active.
    expect(game.state.players.p1.activeDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });
});

describe("OP13-118 Monkey.D.Luffy", () => {
  covers("OP13-118", "[On Play]", "[Double Attack]");

  it("sets four DON!! active behind a multicoloured Leader, then locks out big Characters", () => {
    const game = table("op13-118-on-play")
      .withHand("p1", [
        instance("luffy", "OP13-118"),
        // OP13-027 Sanji is a 5-cost body, exactly on the line; OP14-031
        // Nami at 4 is under it.
        instance("sanji", "OP13-027"),
        instance("nami", "OP14-031"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-118" });
    settle(game);

    // Six of ten paid the cost and four came back.
    expect(game.state.players.p1.activeDon).toHaveLength(8);
    const plays = game
      .summaries("p1")
      .filter((summary) => summary.startsWith("Play "));
    expect(plays).toHaveLength(1);
    expect(plays[0]).toContain("OP14-031");
  });

  it("takes two Life cards with one hit", () => {
    const game = table("op13-118-double-attack")
      .withLife("p2", [
        instance("life-a", "ST32-002"),
        instance("life-b", "ST32-002"),
      ])
      .withBoard("p1", [character("luffy", "OP13-118", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    while (game.state.activeAttack || game.state.pendingEffect) game.pass();

    expect(game.state.players.p2.life).toHaveLength(0);
  });
});

describe("OP15-035 Laboon", () => {
  covers("OP15-035", "static");

  const removal = (seed: string) =>
    defending(seed)
      .withLeader("p2", "ST31-001")
      .withHand("p2", [instance("whitey", "OP17-014")]);

  it("rests two of its controller's cards instead of a K.O.", () => {
    const game = removal("op15-035-replace")
      .withBoard("p1", [
        character("laboon", "OP15-035"),
        character("threatened", "OP01-016"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "threatened" });
    game.play({ summary: "Rest 2 of your cards" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "laboon" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "laboon",
      "threatened",
    ]);
    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "laboon")
        ?.rested,
    ).toBe(true);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("answers a bounce as well: removed from the field, not only K.O.'d", () => {
    const game = defending("op15-035-bounce")
      .withHand("p2", [instance("shiryu", "OP14-048")])
      .withBoard("p1", [
        character("laboon", "OP15-035"),
        character("threatened", "OP13-027"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-048" });
    game.play({ type: "resolve-effect", optionId: "threatened" });
    game.play({ summary: "Rest 2 of your cards" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "laboon" });
    settle(game);

    // OP13-027 Sanji is a 7000 base-power body: exactly on the line.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "laboon",
      "threatened",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("does not reach a Character above 7000 base power", () => {
    // EB04-007 Roronoa Zoro is a 9000 body.
    const game = defending("op15-035-too-big")
      .withHand("p2", [instance("shiryu", "OP14-048")])
      .withBoard("p1", [
        character("laboon", "OP15-035"),
        character("zoro", "EB04-007"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP14-048" });
    game.play({ type: "resolve-effect", optionId: "zoro" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "laboon",
    ]);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "zoro",
    ]);
  });

  it("is not offered with only one active card to rest", () => {
    const game = removal("op15-035-short")
      .withRestedLeader("p1")
      .withBoard("p1", [
        character("laboon", "OP15-035", { rested: true }),
        character("threatened", "OP01-016"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-014" });
    game.play({ type: "resolve-effect", optionId: "threatened" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "laboon",
    ]);
  });
});
