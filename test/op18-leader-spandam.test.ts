import { describe, expect, it } from "vitest";

import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * OP18-079 Spandam (Leader), edge by edge: what pays the cost, what does not,
 * when the activation is offered, and where the Life card lands. Printed text:
 * `pnpm card:text OP18-079`. The happy path and the "no CP card" refusal live
 * in `op18-yellow.test.ts`; this file pins everything around them.
 */
const SPANDAM = "OP18-079";
/** A vanilla card with no type including "CP". */
const FILLER = "OP08-099";
/** {CP6} OP18-102 Jerry, vanilla. */
const CP6 = "OP18-102";
/** {CP0} OP07-084 Gismonda: a CP type other than CP9. */
const CP0 = "OP07-084";
/** {Former CP9} OP08-091 Who's.Who: "CP" inside a longer type. */
const FORMER_CP9 = "OP08-091";
/** {CP9} OP07-094 Shave: an Event, which a hand cost may trash all the same. */
const CP9_EVENT = "OP07-094";

const table = (seed: string, active: "p1" | "p2" = "p1") =>
  scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed(seed)
    .atTurn(active === "p1" ? 11 : 12, { active })
    .bareTable()
    .withLeader("p1", SPANDAM);

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const hand = (...cardNumbers: string[]) =>
  cardNumbers.map((cardNumber, index) => instance(`hand-${index}`, cardNumber));

/** Spandam with `cards` in hand, a known deck top and one Life card. */
const spandam = (seed: string, cards: string[] = [CP6]) =>
  table(seed)
    .withHand("p1", hand(...cards))
    .withDeckTop("p1", [instance("top", FILLER), ...copies(3, FILLER)])
    .withLife("p1", [instance("life-0", FILLER)])
    .withLife("p2", [instance("p2-life-0", FILLER)])
    .withDeckTop("p2", copies(4, FILLER, "p2-deck"));

const offered = (game: Game, player: "p1" | "p2" = "p1"): boolean =>
  game
    .legalActions(player)
    .some(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === "p1-leader",
    );

function effectOptions(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Activates the Leader, trashes `cost` and takes the deck's top card. */
function activate(game: Game, cost = "hand-0", take = "top"): void {
  game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
  game.play({ type: "resolve-effect", optionId: cost });
  game.play({ type: "resolve-effect", optionId: take });
}

describe("OP18-079 Spandam (Leader): the cost", () => {
  covers("OP18-079", "[Activate: Main]");

  it("asks for the CP card to trash and offers only CP cards, with no way to skip it", () => {
    const game = spandam("spandam-cost-pick", [FILLER, CP6, CP0]).build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    const options = effectOptions(game);
    expect(options).toEqual(expect.arrayContaining(["hand-1", "hand-2"]));
    expect(options).not.toContain("hand-0");
    expect(options).not.toContain("done");
    expect(options).not.toContain("skip");

    // The player picks which CP card goes: the second one, here.
    game.play({ type: "resolve-effect", optionId: "hand-2" });
    game.play({ type: "resolve-effect", optionId: "top" });
    const p1 = game.state.players.p1;
    expect(ids(p1.trash)).toEqual(["hand-2"]);
    expect(ids(p1.hand)).toEqual(["hand-0", "hand-1"]);
  });

  it.each([
    ["{CP0}", CP0],
    ["{Former CP9}", FORMER_CP9],
    ["{CP9} Event", CP9_EVENT],
  ])("a %s card in hand pays the trash", (_label, cardNumber) => {
    const game = spandam(`spandam-type-${cardNumber}`, [cardNumber]).build();

    expect(offered(game)).toBe(true);
    activate(game);
    expect(ids(game.state.players.p1.trash)).toEqual(["hand-0"]);
    expect(ids(game.state.players.p1.life)).toEqual(["top", "life-0"]);
  });

  it("rests exactly two active DON!! and leaves the rest active", () => {
    const game = spandam("spandam-don-two").build();
    const before = game.state.players.p1;
    const active = before.activeDon.length;
    const rested = before.restedDon.length;

    activate(game);
    const p1 = game.state.players.p1;
    expect(p1.activeDon).toHaveLength(active - 2);
    expect(p1.restedDon).toHaveLength(rested + 2);
  });

  it("is offered with exactly two active DON!!, and spends both", () => {
    const game = spandam("spandam-don-exact")
      .withDon("p1", { rested: 8 })
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(2);

    expect(offered(game)).toBe(true);
    activate(game);
    expect(game.state.players.p1.activeDon).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(10);
  });

  it("is not offered with one active DON!! and the rest rested", () => {
    const game = spandam("spandam-don-rested")
      .withDon("p1", { rested: 9 })
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(1);

    expect(offered(game)).toBe(false);
  });

  it("is not offered when the DON!! are given to the Leader rather than active", () => {
    const game = spandam("spandam-don-given")
      .withDon("p1", { leaderAttached: 9 })
      .build();
    expect(game.state.players.p1.activeDon).toHaveLength(1);

    expect(offered(game)).toBe(false);
  });

  it("is not offered while the Leader is rested", () => {
    const game = spandam("spandam-rested").withRestedLeader("p1").build();

    expect(offered(game)).toBe(false);
  });

  it("is not offered once the Leader has attacked this turn", () => {
    const game = spandam("spandam-after-attack").build();
    expect(offered(game)).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    while (game.state.phase !== "main" && game.state.phase !== "finished") {
      // p2 declines every defence step; p1 passes any Trigger window.
      game.submit(game.legalActions()[game.legalActions().length - 1]!);
    }
    expect(game.state.turnPlayerId).toBe("p1");
    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(offered(game)).toBe(false);
  });

  it("leaves the Leader unable to attack for the rest of the turn", () => {
    const game = spandam("spandam-no-attack-after").build();
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p1-leader",
        ),
    ).toBe(true);

    activate(game);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });

  it("is not once per turn: using it records no once-per-turn key", () => {
    // No card in the pool sets a CP9 Leader active mid-turn, so a second use
    // cannot be reached by legal play; what is pinned is that the first use
    // spends no [Once Per Turn] -- only the Leader's rest holds it to once.
    const game = spandam("spandam-no-opt", [CP6, CP0]).build();
    const before = [...game.state.oncePerTurn];

    activate(game);
    expect(game.state.oncePerTurn).toEqual(before);
    expect(offered(game)).toBe(false);
  });
});

describe("OP18-079 Spandam (Leader): the Life card", () => {
  covers("OP18-079", "[Activate: Main]");

  it("puts the deck's top card on top of Life, face-down, and nowhere else", () => {
    const game = spandam("spandam-face-down").build();
    const deckBefore = game.state.players.p1.deck.length;

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    // Only the top card is on offer, plus declining.
    expect(effectOptions(game).filter((id) => id !== "done")).toEqual(["top"]);
    game.play({ type: "resolve-effect", optionId: "top" });

    // The public event hides which card moved: it went face-down.
    expect(game.events).toContainEqual({
      type: "card-moved",
      playerId: "p1",
      cardInstanceId: null,
      cardNumber: null,
      from: "deck",
      to: "life",
      position: "top",
      sourceCardNumber: SPANDAM,
    });
    const p1 = game.state.players.p1;
    expect(ids(p1.life)).toEqual(["top", "life-0"]);
    expect(p1.life[0]?.faceUp).not.toBe(true);
    expect(p1.deck).toHaveLength(deckBefore - 1);
    expect(ids(p1.hand)).toEqual([]);
  });

  it("has no Life cap: five Life become six", () => {
    const game = table("spandam-six-life")
      .withHand("p1", hand(CP6))
      .withDeckTop("p1", [instance("top", FILLER), ...copies(3, FILLER)])
      .withLife(
        "p1",
        [0, 1, 2, 3, 4].map((index) => instance(`life-${index}`, FILLER)),
      )
      .build();

    activate(game);
    expect(ids(game.state.players.p1.life)).toEqual([
      "top",
      "life-0",
      "life-1",
      "life-2",
      "life-3",
      "life-4",
    ]);
  });

  it("works with no Life at all", () => {
    const game = table("spandam-zero-life")
      .withHand("p1", hand(CP6))
      .withDeckTop("p1", [instance("top", FILLER), ...copies(3, FILLER)])
      .build();
    expect(game.state.players.p1.life).toHaveLength(0);

    activate(game);
    expect(ids(game.state.players.p1.life)).toEqual(["top"]);
  });

  it("with an empty deck the cost is still payable, and Life is unchanged", () => {
    // "Up to 1": the cost does not depend on there being a card to add.
    const game = table("spandam-empty-deck")
      .withHand("p1", hand(CP6))
      .withLife("p1", [instance("life-0", FILLER)])
      .build();
    expect(game.state.players.p1.deck).toHaveLength(0);

    expect(offered(game)).toBe(true);
    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    for (const option of effectOptions(game)) {
      expect(option).toBe("done");
    }
    if (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "done" });
    }

    const p1 = game.state.players.p1;
    expect(p1.leaderRested).toBe(true);
    expect(ids(p1.trash)).toEqual(["hand-0"]);
    expect(ids(p1.life)).toEqual(["life-0"]);
  });
});

describe("OP18-079 Spandam (Leader): when it is offered", () => {
  covers("OP18-079", "[Activate: Main]");

  it("is not offered on the opponent's turn", () => {
    const game = table("spandam-their-turn", "p2")
      .withHand("p1", hand(CP6))
      .withDeckTop("p1", copies(4, FILLER))
      .withLife("p1", [instance("life-0", FILLER)])
      .build();
    expect(game.state.turnPlayerId).toBe("p2");

    expect(offered(game, "p1")).toBe(false);
    expect(offered(game, "p2")).toBe(false);
  });

  it("is not offered while the Leader's effects are negated", () => {
    const game = spandam("spandam-negated").withNegated("p1-leader").build();

    expect(offered(game)).toBe(false);
  });

  it("is offered alongside a Character of the same table without touching it", () => {
    const game = spandam("spandam-board")
      .withBoard("p1", [character("jerry", CP6)])
      .build();

    // A CP Character on the board is not in hand, so it does not pay.
    activate(game);
    expect(ids(game.state.players.p1.board)).toEqual(["jerry"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["hand-0"]);
  });

  it("is not paid by a CP Character on the board when the hand holds none", () => {
    const game = spandam("spandam-board-only", [FILLER])
      .withBoard("p1", [character("jerry", CP6)])
      .build();

    expect(offered(game)).toBe(false);
  });
});
