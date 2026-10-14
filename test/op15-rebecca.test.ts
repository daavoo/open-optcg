import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Blue) Rebecca feature deck: the clauses its fifty brings into the
 * coverage gate, and the Leader line the deck is built around.
 *
 * Built on the Rebecca deck against the Lucy deck -- the other {Dressrosa}
 * feature list -- with `bareTable()` emptying both, so each position holds only
 * the cards its clause needs.
 */
const table = (seed: string) =>
  scenario()
    .decks(
      "(Blue) Rebecca - Official Feature Deck",
      "(Red/Blue) Lucy - Official Feature Deck",
    )
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

/**
 * Decline the block and Counter steps of a declared attack, so the battle
 * resolves. A loop because the engine skips a step the defender has no options
 * for.
 */
const declineDefence = (game: {
  state: { phase: string };
  pass: () => unknown;
}) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

describe("OP15-039 Rebecca's replay line", () => {
  const leaderActivationOffered = (game: {
    legalActions: () => readonly { type: string; sourceInstanceId?: string }[];
  }) =>
    game
      .legalActions()
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "p1-leader",
      );

  it("is not offered again once the Leader is rested", () => {
    // The clause is not [Once Per Turn], so "rest this Leader" is the only
    // thing that stops a second use. This pins the bug where a rested Leader
    // kept offering the activation and a rules agent looped on it until the
    // game's action cap, drawing every game the deck played.
    const game = table("rebecca-rested")
      .withBoard("p1", [
        character("bounced", "OP15-053"),
        character("stays", "OP15-040"),
      ])
      .withHand("p1", [instance("three", "OP10-054")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "bounced" });
    game.play({ type: "resolve-effect", optionId: "three" });

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(leaderActivationOffered(game)).toBe(false);
  });

  it("is not offered with no {Dressrosa} Character on the board to return", () => {
    const game = table("rebecca-empty-board")
      .withBoard("p1", [character("outsider", "ST32-004")])
      .withHand("p1", [instance("three", "OP10-054")])
      .build();

    expect(leaderActivationOffered(game)).toBe(false);
  });

  it("plays only a cost-3 {Dressrosa} Character, never the 1- or 7-cost", () => {
    const game = table("rebecca-exact-cost")
      .withBoard("p1", [character("bounced", "OP15-053")])
      .withHand("p1", [
        instance("three", "OP10-054"),
        instance("seven", "OP10-046"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "bounced" });

    // The bounced 1-cost Rebecca is back in hand and is {Dressrosa} too, but
    // the printed "a cost of 3" is exact: only Blue Gilly is offered.
    const offered = game
      .legalActions()
      .flatMap((action) =>
        action.type === "resolve-effect" && action.optionId
          ? [action.optionId]
          : [],
      );
    expect(offered).toContain("three");
    expect(offered).not.toContain("seven");
    expect(offered).not.toContain("bounced");
  });

  it("replays a Kyros that has already attacked, and it takes [Rush] again", () => {
    const game = table("rebecca-kyros-replay")
      .withBoard("p1", [
        character("kyros", "OP15-042", { rested: true, playedTurn: 11 }),
      ])
      .withHand("p1", [instance("fodder", "OP10-054")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "kyros" });
    game.play({ type: "resolve-effect", optionId: "kyros" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });

    const kyros = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP15-042",
    );
    expect(kyros?.rested).toBe(false);
    expect(hasKeyword(game.state, "p1", kyros!.instanceId, "Rush")).toBe(true);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === kyros!.instanceId,
        ),
    ).toBe(true);
  });
});

describe("OP10-045 Cavendish", () => {
  covers("OP10-045", "[When Attacking]");

  it("draws two and trashes one when it attacks", () => {
    const game = table("op10-045")
      .withBoard("p1", [character("cavendish", "OP10-045", { playedTurn: 1 })])
      .withHand("p1", [instance("kept", "OP15-053")])
      .withDeckTop("p1", copies(3, "OP10-054", "drawn"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "cavendish",
      targetInstanceId: "p2-leader",
    });
    // The trash is mandatory, and either card just drawn is a legal pick.
    game.play({ type: "resolve-effect", optionId: "drawn-1" });

    expect(ids(game.state.players.p1.hand)).toEqual(["kept", "drawn-2"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["drawn-1"]);
  });
});

describe("OP15-041 Orlumbus", () => {
  covers("OP15-041", "[On K.O.]", "[Activate: Main]");

  it("buries one of your Characters to gain [Rush] on the turn it lands", () => {
    const game = table("op15-041-main")
      .withBoard("p1", [
        character("orlumbus", "OP15-041", { playedTurn: 11 }),
        character("spent", "OP15-053"),
      ])
      .build();

    expect(hasKeyword(game.state, "p1", "orlumbus", "Rush")).toBe(false);
    game.play({ type: "activate-main", sourceInstanceId: "orlumbus" });
    // Orlumbus itself is a legal cost: the printed "1 of your Characters" has
    // no exclusion.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-effect" && action.optionId === "orlumbus",
        ),
    ).toBe(true);
    game.play({ type: "resolve-effect", optionId: "spent" });

    expect(ids(game.state.players.p1.board)).toEqual(["orlumbus"]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("spent");
    expect(hasKeyword(game.state, "p1", "orlumbus", "Rush")).toBe(true);
    // [Once Per Turn]: the activation is not offered a second time.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "orlumbus",
        ),
    ).toBe(false);
  });

  it("draws a card when it is K.O.'d", () => {
    const game = table("op15-041-ko")
      .withBoard("p1", [character("orlumbus", "OP15-041", { rested: true })])
      .withBoard("p2", [character("killer", "OP15-046")])
      .withDeckTop("p1", copies(2, "OP10-054", "drawn"))
      .withDeckTop("p2", copies(3, "OP10-054", "p2-deck"))
      .build();

    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "orlumbus",
    });
    declineDefence(game);

    expect(ids(game.state.players.p1.trash)).toContain("orlumbus");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn-1"]);
  });
});

describe("OP15-047 Sanji", () => {
  covers("OP15-047", "[On Play]", "[Blocker]");

  it("makes one of your Characters [Unblockable] this turn", () => {
    const game = table("op15-047-play")
      .withBoard("p1", [character("attacker", "OP10-054")])
      .withHand("p1", [instance("sanji", "OP15-047")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP15-047" });
    game.play({ type: "resolve-effect", optionId: "attacker" });

    expect(hasKeyword(game.state, "p1", "attacker", "Unblockable")).toBe(true);
    expect(hasKeyword(game.state, "p1", "sanji", "Unblockable")).toBe(false);
  });

  it("blocks an attack aimed at the Leader", () => {
    const game = table("op15-047-block")
      .withBoard("p1", [character("sanji", "OP15-047")])
      .withBoard("p2", [character("attacker", "OP10-054")])
      .withDeckTop("p2", copies(3, "OP10-054", "p2-deck"))
      .build();

    expect(hasKeyword(game.state, "p1", "sanji", "Blocker")).toBe(true);
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(game.state.phase).toBe("block");
    expect(
      game.legalActions().some((action) => action.summary.includes("Sanji")),
    ).toBe(true);
  });
});

describe("OP15-051 Monkey.D.Luffy", () => {
  covers("OP15-051", "[Opponent's Turn]");

  it("is +3000 on the opponent's turn behind a {Dressrosa} Leader", () => {
    const game = table("op15-051")
      .withBoard("p1", [character("luffy", "OP15-051")])
      .withDeckTop("p2", copies(3, "OP10-054", "p2-deck"))
      .build();

    // Its own turn: the printed 4000.
    expect(currentPower(game.state, "p1", "luffy")).toBe(4000);
    game.pass();
    expect(currentPower(game.state, "p1", "luffy")).toBe(7000);
  });

  it("stays at 4000 behind a Leader without the type", () => {
    const game = table("op15-051-off")
      .withLeader("p1", "ST32-001")
      .withBoard("p1", [character("luffy", "OP15-051")])
      .withDeckTop("p2", copies(3, "OP10-054", "p2-deck"))
      .build();

    game.pass();
    expect(currentPower(game.state, "p1", "luffy")).toBe(4000);
  });
});
