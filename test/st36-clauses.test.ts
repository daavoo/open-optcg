import { describe, expect, it } from "vitest";

import { covers, instance, scenario } from "./support/index.js";

/**
 * The two ST36 clauses `test/st36.test.ts` never reaches: Killer's [On Play] --
 * that file only drives its [Trigger] -- and the [Main] half of OP13-116, whose
 * [Trigger] is defined as "activate this card's [Main] effect" and so cannot be
 * evidence for it.
 */

const DECK = "(Yellow) Eustass Kid - Starter Deck 36";

describe("ST36-002 Killer On Play", () => {
  covers("ST36-002", "[On Play]", "[Your Turn]");

  it("ST36-002:positive banks the top card of the deck on Life", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("st36-002-on-play")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("killer", "ST36-002")])
      .withDeckTop("p1", [instance("banked", "OP10-101")])
      .withLife("p1", [instance("life-1", "OP10-101")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST36-002" });
    game.play({ type: "resolve-effect", optionId: "apply" });

    // The card goes on *top* of Life, so it is the next one damage takes.
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "banked",
      "life-1",
    ]);
    expect(
      game.state.players.p1.deck.map((card) => card.instanceId),
    ).not.toContain("banked");
  });

  it("ST36-002:boundary declines the optional Life gain", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("st36-002-declined")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("killer", "ST36-002")])
      .withDeckTop("p1", [instance("banked", "OP10-101")])
      .withLife("p1", [instance("life-1", "OP10-101")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST36-002" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "life-1",
    ]);
  });
});

describe("OP13-116 The One Who Is the Most Free Is the Pirate King!!! Main", () => {
  covers("OP13-116", "[Main]");

  it("OP13-116:positive reveals a Supernovas Character and bottoms the rest", () => {
    const game = scenario()
      .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
      .seed("op13-116-main")
      .atTurn(7, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("event", "OP13-116")])
      .withDeckTop("p1", [
        instance("miss-1", "OP13-116"),
        instance("hit", "OP10-101"),
        instance("miss-2", "OP13-116"),
        instance("miss-3", "OP13-116"),
        instance("miss-4", "OP13-116"),
        instance("untouched", "OP10-101"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[OP13-116]" });
    game.play({ type: "resolve-effect", optionId: "hit" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    // The four Events are not Characters, so only the Character was reachable;
    // the rest go to the bottom and the sixth card was never seen.
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("untouched");
    expect(
      game.state.players.p1.deck.slice(-4).map((card) => card.instanceId),
    ).toEqual(["miss-1", "miss-2", "miss-3", "miss-4"]);
    expect(game.state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP13-116",
    ]);
  });
});
