import { describe, expect, it } from "vitest";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
} from "./support/index.js";

/**
 * The (Green/Black) Brook feature deck: the clauses its fifty brings into the
 * coverage gate.
 *
 * Built on the Brook deck against the Rebecca deck with `bareTable()` emptying
 * both, so each position holds only the cards its clause needs. OP15-089
 * Franky pads the trash: a vanilla {Straw Hat Crew} Character from the deck's
 * own fifty, so a trash count is the only thing it changes.
 */
const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(
      "(Green/Black) Brook - Official Feature Deck",
      "(Blue) Rebecca - Official Feature Deck",
    )
    .seed(seed)
    .atTurn(11, { active })
    .bareTable();

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const offeredOptions = (game: {
  legalActions: () => readonly { type: string; optionId?: string }[];
}) =>
  game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);

describe("OP15-085 Tony Tony.Chopper's recursion", () => {
  covers("OP15-085", "[Activate: Main]");

  it("trashes itself and returns a {Straw Hat Crew} Character from the trash", () => {
    const game = table("brook-chopper")
      .withBoard("p1", [character("chopper", "OP15-085")])
      .withTrash("p1", [
        instance("luffy", "OP15-092"),
        instance("other-chopper", "OP15-085"),
        instance("storm", "OP15-095"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "chopper" });

    // Neither another [Tony Tony.Chopper] nor a non-Character is offered.
    expect(offeredOptions(game)).toEqual(["luffy", "done"]);
    game.play({ type: "resolve-effect", optionId: "luffy" });

    expect(ids(game.state.players.p1.board)).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toEqual(["luffy"]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["chopper", "other-chopper", "storm"]),
    );
  });

  it("is offered on a Chopper that has already attacked", () => {
    // The cost trashes Chopper and does not rest it, so a rested Chopper
    // can pay it. This pins the bug where the activation required an active
    // source and vanished once Chopper had swung.
    const game = table("brook-chopper-rested")
      .withBoard("p1", [character("chopper", "OP15-085", { rested: true })])
      .withTrash("p1", [instance("luffy", "OP15-092")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "chopper" });
    game.play({ type: "resolve-effect", optionId: "luffy" });

    expect(ids(game.state.players.p1.hand)).toEqual(["luffy"]);
  });

  it("still trashes itself but adds nothing under a Leader without the type", () => {
    const game = table("brook-chopper-off")
      // OP15-001 Krieg is East Blue/Krieg Pirates, not {Straw Hat Crew}.
      .withLeader("p1", "OP15-001")
      .withBoard("p1", [character("chopper", "OP15-085")])
      .withTrash("p1", [instance("luffy", "OP15-092")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "chopper" });

    expect(ids(game.state.players.p1.board)).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["chopper", "luffy"]),
    );
  });
});

describe("OP15-095 Gum-Gum Storm", () => {
  covers("OP15-095", "[Main]", "[Counter]");

  const mainPosition = (seed: string, trash: number) =>
    table(seed)
      .withBoard("p1", [character("luffy", "OP15-092")])
      .withHand("p1", [instance("storm", "OP15-095")])
      .withTrash("p1", copies(trash, "OP15-089", "franky"))
      .build();

  // 8-4-2 trashes an Event before its effect resolves, so Gum-Gum Storm is
  // one of its own 15: fourteen in the trash is enough, and thirteen is not.
  it("[Main] gives a {Straw Hat Crew} Character +3000 once it makes 15 in the trash", () => {
    const game = mainPosition("brook-storm-main", 14);
    const activeBefore = game.state.players.p1.activeDon.length;

    game.play({ type: "activate-main", sourceInstanceId: "storm" });
    expect(offeredOptions(game)).toEqual(["p1-leader", "luffy", "done"]);
    game.play({ type: "resolve-effect", optionId: "luffy" });

    expect(game.state.players.p1.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: 3000 }),
    );
    // One DON!! for the cost and one rested for the clause.
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 2);
  });

  it("[Main] is not offered when it would make only 14", () => {
    // The whole program is gated on the count, so the engine withholds an
    // Event that would be trashed for nothing rather than offer it.
    const game = mainPosition("brook-storm-main-short", 13);

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "storm",
        ),
    ).toBe(false);
  });

  const counterPosition = (seed: string, trash: number) =>
    table(seed, "p2")
      .withHand("p1", [instance("storm", "OP15-095")])
      .withTrash("p1", copies(trash, "OP15-089", "franky"))
      .withBoard("p2", [character("attacker", "OP15-042")])
      .build();

  const attackLeader = (game: ReturnType<typeof counterPosition>) => {
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
  };

  it("[Counter] adds 4000 to the battle once it makes 15 in the trash", () => {
    const game = counterPosition("brook-storm-counter", 14);
    attackLeader(game);

    game.play({ type: "activate-counter-event", cardNumber: "OP15-095" });

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("[Counter] is not offered when it would make only 14", () => {
    // A Counter Event that would add no power is withheld, as the [Main] is.
    const game = counterPosition("brook-storm-counter-short", 13);
    attackLeader(game);

    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });
});
