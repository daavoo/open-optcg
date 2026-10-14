import { describe, expect, it } from "vitest";
import { hasKeyword } from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * The (Blue/Yellow) Boa Hancock feature deck: the clauses its fifty brings
 * into the coverage gate.
 *
 * `test/op14.test.ts` already drives the Leader and the OP-14 half of the
 * list, and the PRB-02, EB-04 and OP-07 Hancocks have their own files; what is
 * here is the two OP-13 cards no shipped deck had claimed, OP13-113 Lilith and
 * OP13-052 Boa Marigold.
 *
 * Built on the Hancock deck against the Vivi deck with `bareTable()` emptying
 * both, so each position holds only the cards its clause needs.
 */
const HANCOCK = "(Blue/Yellow) Boa Hancock - Official Feature Deck";
const VIVI = "(Red/Blue) Nefeltari Vivi - Official Feature Deck";

const table = (seed: string) =>
  scenario()
    .decks(HANCOCK, VIVI)
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

/** Pass the opponent's attack into p1's Leader through block and Counter. */
const takeAHit = (game: Game) => {
  game.pass();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

describe("OP13-113 Lilith", () => {
  covers("OP13-113", "[On Play]", "[Trigger]");

  const deckTop = [
    // A [Trigger]: offered.
    instance("shakuyaku", "OP14-107"),
    // A [Trigger], but named Lilith: excluded by name.
    instance("second-lilith", "OP13-113"),
    // No [Trigger]: not offered.
    instance("marigold", "OP13-052"),
    // A [Trigger]: offered.
    instance("rayleigh", "OP14-108"),
    // The fifth card, outside the four looked at.
    instance("fifth", "OP14-114"),
  ];

  it("offers only the [Trigger] cards other than Lilith among the top four", () => {
    const game = table("op13-113-filter")
      .withHand("p1", [instance("lilith", "OP13-113")])
      .withDeckTop("p1", deckTop)
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-113" });

    const offered = effectOptions(game);
    expect(offered).toContain("shakuyaku");
    expect(offered).toContain("rayleigh");
    expect(offered).not.toContain("second-lilith");
    expect(offered).not.toContain("marigold");
    expect(offered).not.toContain("fifth");
  });

  it("adds the chosen card and puts the other three on the bottom", () => {
    const game = table("op13-113-add")
      .withHand("p1", [instance("lilith", "OP13-113")])
      .withDeckTop("p1", deckTop)
      .build();
    const deckBefore = game.state.players.p1.deck.length;

    game.play({ type: "play-card", cardNumber: "OP13-113" });
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["rayleigh"]);
    const deck = ids(game.state.players.p1.deck);
    expect(deck).toHaveLength(deckBefore - 1);
    expect(deck[0]).toBe("fifth");
    expect(new Set(deck.slice(-3))).toEqual(
      new Set(["shakuyaku", "second-lilith", "marigold"]),
    );
  });

  it("runs the same dig off its [Trigger] when taken as damage", () => {
    const game = table("op13-113-trigger")
      .withLife("p1", [
        instance("life-lilith", "OP13-113"),
        instance("life-spare", "OP14-114"),
      ])
      .withDeckTop("p1", deckTop)
      .withBoard("p2", [character("attacker", "OP06-007")])
      .withDeckTop("p2", copies(3, "OP13-011", "p2-deck"))
      .build();

    takeAHit(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });

    const offered = effectOptions(game);
    expect(offered).toContain("shakuyaku");
    expect(offered).not.toContain("second-lilith");
    expect(offered).not.toContain("marigold");

    game.play({ type: "resolve-effect", optionId: "shakuyaku" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toContain("shakuyaku");
    expect(ids(game.state.players.p1.trash)).toContain("life-lilith");
  });
});

describe("OP13-052 Boa Marigold", () => {
  covers("OP13-052", "[On Play]", "[Blocker]");

  const hand = [
    instance("marigold", "OP13-052"),
    // A [Boa Hancock] of cost 6: offered.
    instance("hancock-6", "OP07-051"),
    // A [Boa Hancock] of cost 9: over the printed "cost of 6 or less".
    instance("hancock-9", "OP14-112"),
    // Cost 6 but not named [Boa Hancock].
    instance("rayleigh", "OP14-108"),
  ];

  it("plays a [Boa Hancock] of cost 6 or less from hand for free", () => {
    const game = table("op13-052-play").withHand("p1", hand).build();

    game.play({ type: "play-card", cardNumber: "OP13-052" });
    const activeDon = game.state.players.p1.activeDon.length;

    const offered = effectOptions(game);
    expect(offered).toContain("hancock-6");
    expect(offered).not.toContain("hancock-9");
    expect(offered).not.toContain("rayleigh");

    game.play({ type: "resolve-effect", optionId: "hancock-6" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["marigold", "hancock-6"]);
    // The play is the effect's, so no further DON!! was rested for it.
    expect(game.state.players.p1.activeDon).toHaveLength(activeDon);
  });

  it("plays nothing when the Leader is not [Boa Hancock]", () => {
    const game = table("op13-052-gate")
      .withLeader("p1", "EB03-001")
      .withHand("p1", hand)
      .build();

    game.play({ type: "play-card", cardNumber: "OP13-052" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["marigold"]);
    expect(ids(game.state.players.p1.hand)).toContain("hancock-6");
  });

  it("blocks an attack aimed at the Leader", () => {
    const game = table("op13-052-block")
      .withBoard("p1", [character("marigold", "OP13-052")])
      .withBoard("p2", [character("attacker", "OP06-007")])
      .withDeckTop("p2", copies(3, "OP13-011", "p2-deck"))
      .build();
    const lifeBefore = game.state.players.p1.life.length;

    expect(hasKeyword(game.state, "p1", "marigold", "Blocker")).toBe(true);
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(game.state.phase).toBe("block");
    game.play(
      (action) =>
        action.type === "block" && action.blockerInstanceId === "marigold",
    );
    while (game.state.phase === "counter") game.pass();

    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});
