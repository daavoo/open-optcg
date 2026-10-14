import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * The (Red/Blue) Nefeltari Vivi feature deck: the clauses its fifty brings
 * into the coverage gate, and the Leader line the deck is built around.
 *
 * `test/eb03.test.ts` already drives the EB-03 half of the list; what is here
 * is the four clauses from other sets no shipped deck had claimed, and the
 * Leader's [Rush] and −2000 against the deck's own [On Play] bodies.
 *
 * Built on the Vivi deck against the Rebecca deck with `bareTable()` emptying
 * both, so each position holds only the cards its clause needs.
 */
const VIVI = "(Red/Blue) Nefeltari Vivi - Official Feature Deck";
const REBECCA = "(Blue) Rebecca - Official Feature Deck";

const table = (seed: string) =>
  scenario()
    .decks(VIVI, REBECCA)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const effectOptions = (game: Game) =>
  game
    .legalActions()
    .flatMap((action) =>
      action.type === "resolve-effect" && action.optionId
        ? [action.optionId]
        : [],
    );

/** Resolve the rest of an open effect, taking the first offer at each step. */
const settle = (game: Game) => {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
};

describe("OP13-012 Nefeltari Vivi", () => {
  covers("OP13-012", "[On Play]");

  const digging = (seed: string) =>
    table(seed)
      .withHand("p1", [instance("digger", "OP13-012")])
      .withDeckTop("p1", [
        // {Alabasta}, cost 5: offered.
        instance("nami", "EB03-006"),
        // {Goa Kingdom}: neither type.
        instance("brothers", "OP13-007"),
        // {Alabasta} but cost 1, under the printed "cost of 2 or more".
        instance("small-vivi", "OP13-012"),
        // {Straw Hat Crew}, cost 4: offered.
        instance("chopper", "OP10-011"),
        // The fifth card, outside the four looked at.
        instance("fifth", "EB03-024"),
      ])
      .build();

  it("offers only the {Alabasta} and {Straw Hat Crew} cards of cost 2 or more", () => {
    const game = digging("op13-012-filter");

    game.play({ type: "play-card", cardNumber: "OP13-012" });

    const offered = effectOptions(game);
    expect(offered).toContain("nami");
    expect(offered).toContain("chopper");
    expect(offered).not.toContain("brothers");
    expect(offered).not.toContain("small-vivi");
    expect(offered).not.toContain("fifth");
  });

  it("adds the chosen card to hand and puts the other three on the bottom", () => {
    const game = digging("op13-012-add");
    const deckBefore = game.state.players.p1.deck.length;

    game.play({ type: "play-card", cardNumber: "OP13-012" });
    game.play({ type: "resolve-effect", optionId: "nami" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toContain("nami");
    const deck = ids(game.state.players.p1.deck);
    expect(deck).toHaveLength(deckBefore - 1);
    expect(deck[0]).toBe("fifth");
    expect(new Set(deck.slice(-3))).toEqual(
      new Set(["brothers", "small-vivi", "chopper"]),
    );
  });
});

describe("OP13-054 Yamato", () => {
  covers("OP13-054", "[On Play]");

  const yamato = (seed: string, life: number) =>
    table(seed)
      .withLife("p1", copies(life, "OP13-011", "life"))
      .withDeckTop("p1", copies(3, "OP13-011", "draw"))
      .withHand("p1", [instance("yamato", "OP13-054")])
      .build();

  it("draws two at 3 Life, then gives the Leader a rested DON!!", () => {
    const game = yamato("op13-054-draw", 3);
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "OP13-054" });
    // Playing Yamato rested five DON!!, so there is one to give.
    settle(game);

    // One card left hand to be played, two came in.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1 + 2);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("does nothing at 4 Life", () => {
    const game = yamato("op13-054-healthy", 4);
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "OP13-054" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
  });
});

describe("OP10-011 Tony Tony.Chopper", () => {
  covers("OP10-011", "[Opponent's Turn]", "[Blocker]");

  const chopper = (seed: string) =>
    table(seed)
      .withBoard("p1", [character("chopper", "OP10-011")])
      .withBoard("p2", [character("attacker", "OP10-054")])
      .withDeckTop("p2", copies(3, "OP10-054", "p2-deck"))
      .build();

  it("is 4000 on its own turn and 6000 on the opponent's", () => {
    const game = chopper("op10-011-power");

    expect(currentPower(game.state, "p1", "chopper")).toBe(4000);
    game.pass();
    expect(currentPower(game.state, "p1", "chopper")).toBe(6000);
  });

  it("blocks an attack aimed at the Leader and takes it at 6000", () => {
    const game = chopper("op10-011-block");
    const lifeBefore = game.state.players.p1.life.length;

    expect(hasKeyword(game.state, "p1", "chopper", "Blocker")).toBe(true);
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(game.state.phase).toBe("block");
    game.play(
      (action) =>
        action.type === "block" && action.blockerInstanceId === "chopper",
    );
    while (game.state.phase === "counter") game.pass();

    // A 5000 attacker into a 6000 blocker: Chopper stays, rested, and the
    // Leader took nothing.
    expect(ids(game.state.players.p1.board)).toEqual(["chopper"]);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
  });
});

describe("EB03-001 Nefeltari Vivi's line with the deck's [On Play] bodies", () => {
  covers("EB03-001", "[Activate: Main]");
  covers("OP09-009", "[On Play]");
  covers("OP06-007", "[On Play]");

  it("gives a Shanks played this turn [Rush] after its K.O. resolves", () => {
    const game = table("eb03-001-shanks")
      .withHand("p1", [instance("shanks", "OP06-007")])
      .withBoard("p2", [character("victim", "OP10-054")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-007" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);
    expect(game.state.players.p2.board).toEqual([]);

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "shanks" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "shanks", "Rush")).toBe(true);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "shanks",
        ),
    ).toBe(true);
  });

  it("shrinks an 8000 body into reach of Benn.Beckman's 6000-or-less trash", () => {
    const game = table("eb03-001-beckman")
      .withHand("p1", [instance("beckman", "OP09-009")])
      // EB03-026 Boa Hancock, an 8000 body with no protection of its own.
      .withBoard("p2", [character("big", "EB03-026")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "big" });
    settle(game);
    expect(currentPower(game.state, "p2", "big")).toBe(6000);

    game.play({ type: "play-card", cardNumber: "OP09-009" });
    game.play({ type: "resolve-effect", optionId: "big" });
    settle(game);

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.trash)).toContain("big");
  });

  it("leaves an 8000 body out of Benn.Beckman's reach without the −2000", () => {
    const game = table("eb03-001-beckman-unreached")
      .withHand("p1", [instance("beckman", "OP09-009")])
      .withBoard("p2", [character("big", "EB03-026")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-009" });
    expect(effectOptions(game)).not.toContain("big");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["big"]);
  });
});
