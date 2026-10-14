import { describe, expect, it } from "vitest";
import { currentPower, hasKeyword } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * STARTER DECK -Ace & Newgate- [ST-22].
 *
 * `packages/cards/src/st22.ts` explains where the records come from. The deck's
 * currency is the "Whitebeard Pirates" type in two places: five cards reveal
 * the top of the deck and pay out on an on-type card, and four more ask for
 * on-type cards shown from hand. So most positions here stack the deck top
 * with a named hit or a named miss and assert both.
 *
 * Every position seats two format starter decks and puts the card under test
 * in a zone with a `with*` setter; the ST-22 Leader is set with `withLeader`
 * where a clause reads it.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting at 10 DON!!, both boards bare. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting, so p1's cards are the ones defending. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

/** On-type filler, no printed text: ST22-004 Elmy. */
const ON_TYPE = "ST22-004";
/** Off-type filler, no printed text that fires here: OP01-016 Nami. */
const OFF_TYPE = "OP01-016";

function offered(game: Game): string[] {
  return game
    .legalActions()
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/**
 * Answers every pending prompt: the first of `picks` on offer (each used
 * once), else `apply`, else whatever is offered first.
 */
function drive(game: Game, ...picks: string[]) {
  const queue = [...picks];
  for (let guard = 0; guard < 40 && game.state.pendingEffect; guard++) {
    const options = offered(game);
    const index = queue.findIndex((id) => options.includes(id));
    const pick =
      index >= 0
        ? queue.splice(index, 1)[0]!
        : options.includes("apply")
          ? "apply"
          : options[0]!;
    game.play({ type: "resolve-effect", optionId: pick });
  }
}

const ids = (cards: readonly { instanceId: string }[]) =>
  cards.map((card) => card.instanceId);

const activation = (game: Game, cardNumber: string) =>
  game
    .legalActions()
    .filter(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === cardNumber,
    );

const activate = (game: Game, cardNumber: string) =>
  game.play(
    (action) =>
      action.type === "activate-main" && action.sourceCardNumber === cardNumber,
  );

describe("ST22-001 Ace & Newgate (Leader)", () => {
  covers("ST22-001", "[Activate: Main]");

  it("draws the top card and puts the shown card on top in its place", () => {
    const game = table("st22-001-filter")
      .withLeader("p1", "ST22-001")
      .withHand("p1", [instance("shown", ON_TYPE)])
      .withDeckTop("p1", [
        instance("top", OFF_TYPE),
        instance("next", OFF_TYPE),
      ])
      .build();

    activate(game, "ST22-001");
    drive(game, "shown");

    expect(ids(game.state.players.p1.hand)).toEqual(["top"]);
    expect(ids(game.state.players.p1.deck).slice(0, 2)).toEqual([
      "shown",
      "next",
    ]);
    expect(activation(game, "ST22-001")).toEqual([]);
  });

  it("is not offered with no Whitebeard Pirates card in hand", () => {
    const game = table("st22-001-no-reveal")
      .withLeader("p1", "ST22-001")
      .withHand("p1", [instance("off", OFF_TYPE)])
      .withDeckTop("p1", [instance("top", OFF_TYPE)])
      .build();

    expect(activation(game, "ST22-001")).toEqual([]);
  });
});

describe("ST22-002 Izo", () => {
  it("adds an on-type card from the top five, never another Izo", () => {
    covers("ST22-002", "[On Play]");
    const game = table("st22-002-search")
      .withHand("p1", [instance("izo", "ST22-002")])
      .withDeckTop("p1", [
        instance("other-izo", "ST22-002"),
        instance("off-1", OFF_TYPE),
        instance("hit", ON_TYPE),
        instance("off-2", OFF_TYPE),
        instance("off-3", OFF_TYPE),
        instance("sixth", ON_TYPE),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST22-002" });
    const options = offered(game);
    expect(options).toContain("hit");
    expect(options).not.toContain("other-izo");
    drive(game, "hit");

    expect(ids(game.state.players.p1.hand)).toEqual(["hit"]);
    // The four left behind go under the deck; the sixth card is now on top.
    expect(ids(game.state.players.p1.deck)[0]).toBe("sixth");
    expect(ids(game.state.players.p1.deck).slice(1).sort()).toEqual(
      ["off-1", "off-2", "off-3", "other-izo"].sort(),
    );
  });

  it("trashes itself on the opponent's attack to draw one and bottom one", () => {
    covers("ST22-002", "[On Your Opponent's Attack]");
    const game = defending("st22-002-attack")
      .withBoard("p1", [character("izo", "ST22-002")])
      .withHand("p1", [instance("held", OFF_TYPE)])
      .withDeckTop("p1", [
        instance("drawn", ON_TYPE),
        instance("under", ON_TYPE),
      ])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    drive(game, "apply", "held");

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.trash)).toContain("izo");
    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
    expect(ids(game.state.players.p1.deck)).toEqual(["under", "held"]);
  });
});

describe("ST22-003 Edward.Newgate", () => {
  it("prints [Double Attack]", () => {
    covers("ST22-003", "[Double Attack]");
    const game = table("st22-003-keyword")
      .withBoard("p1", [character("newgate", "ST22-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "newgate", "Double Attack")).toBe(true);
  });

  it("draws two when the revealed top card is Whitebeard Pirates", () => {
    covers("ST22-003", "[On Play]");
    const game = table("st22-003-hit")
      .withHand("p1", [instance("newgate", "ST22-003")])
      .withDeckTop("p1", [
        instance("hit", ON_TYPE),
        instance("second", OFF_TYPE),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST22-003" });
    drive(game);

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["hit", "second"]);
  });

  it("draws nothing on a miss, and the miss stays on top", () => {
    const game = table("st22-003-miss")
      .withHand("p1", [instance("newgate", "ST22-003")])
      .withDeckTop("p1", [
        instance("miss", OFF_TYPE),
        instance("second", ON_TYPE),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST22-003" });
    drive(game);

    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p1.deck)).toEqual(["miss", "second"]);
  });
});

describe("ST22-005 Kouzuki Oden", () => {
  it("trashes two cards from hand instead of being K.O.'d by an effect", () => {
    covers("ST22-005", "static");
    const game = table("st22-005-replace")
      .withHand("p1", [instance("kingdom-come", "EB01-059")])
      .withBoard("p2", [character("oden", "ST22-005")])
      .withHand("p2", [instance("a", OFF_TYPE), instance("b", OFF_TYPE)])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-059" });
    drive(game, "oden", "replace:oden", "a", "b");

    expect(ids(game.state.players.p2.board)).toEqual(["oden"]);
    expect(ids(game.state.players.p2.trash).sort()).toEqual(["a", "b"]);
  });

  it("is not offered with only one card in hand to pay", () => {
    const game = table("st22-005-short")
      .withHand("p1", [instance("kingdom-come", "EB01-059")])
      .withBoard("p2", [character("oden", "ST22-005")])
      .withHand("p2", [instance("a", OFF_TYPE)])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-059" });
    drive(game, "oden");

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.hand)).toEqual(["a"]);
  });

  it("rests three DON!! and returns a Character to set itself active", () => {
    covers("ST22-005", "[Activate: Main]");
    const game = table("st22-005-restand")
      .withBoard("p1", [
        character("oden", "ST22-005", { rested: true }),
        character("elmy", ON_TYPE),
      ])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    activate(game, "ST22-005");
    drive(game, "elmy");

    const oden = game.state.players.p1.board.find(
      (card) => card.instanceId === "oden",
    );
    expect(oden?.rested).toBe(false);
    expect(ids(game.state.players.p1.hand)).toEqual(["elmy"]);
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 3);
    expect(activation(game, "ST22-005")).toEqual([]);
  });

  it("is not offered while active, or with nothing else to return", () => {
    const active = table("st22-005-active")
      .withBoard("p1", [
        character("oden", "ST22-005"),
        character("elmy", ON_TYPE),
      ])
      .build();
    expect(activation(active, "ST22-005")).toEqual([]);

    const alone = table("st22-005-alone")
      .withBoard("p1", [character("oden", "ST22-005", { rested: true })])
      .build();
    expect(activation(alone, "ST22-005")).toEqual([]);
  });
});

describe("ST22-006 Jozu", () => {
  covers("ST22-006", "[On Play]");

  it("draws two and trashes one on a hit", () => {
    const game = table("st22-006-hit")
      .withHand("p1", [instance("jozu", "ST22-006")])
      .withDeckTop("p1", [
        instance("hit", ON_TYPE),
        instance("second", OFF_TYPE),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST22-006" });
    drive(game, "second");

    expect(ids(game.state.players.p1.hand)).toEqual(["hit"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["second"]);
  });

  it("keeps the hand whole on a miss", () => {
    const game = table("st22-006-miss")
      .withHand("p1", [
        instance("jozu", "ST22-006"),
        instance("held", OFF_TYPE),
      ])
      .withDeckTop("p1", [instance("miss", OFF_TYPE)])
      .build();

    game.play({ type: "play-card", cardNumber: "ST22-006" });
    drive(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["held"]);
    expect(game.state.players.p1.trash).toEqual([]);
  });
});

describe("ST22-007 Squard", () => {
  covers("ST22-007", "[Activate: Main]");

  it("gives a rested DON!! on a hit", () => {
    const game = table("st22-007-hit")
      .withBoard("p1", [character("squard", "ST22-007")])
      .withDon("p1", { rested: 2 })
      .withDeckTop("p1", [instance("hit", ON_TYPE)])
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    activate(game, "ST22-007");
    drive(game, "squard");

    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore - 1);
    expect(currentPower(game.state, "p1", "squard")).toBe(3_000);
    expect(ids(game.state.players.p1.deck)).toEqual(["hit"]);
    expect(activation(game, "ST22-007")).toEqual([]);
  });

  it("gives nothing on a miss", () => {
    const game = table("st22-007-miss")
      .withBoard("p1", [character("squard", "ST22-007")])
      .withDon("p1", { rested: 2 })
      .withDeckTop("p1", [instance("miss", OFF_TYPE)])
      .build();
    const restedBefore = game.state.players.p1.restedDon.length;

    activate(game, "ST22-007");
    drive(game, "squard");

    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore);
  });

  it("is not offered with no rested DON!!", () => {
    const game = table("st22-007-none")
      .withBoard("p1", [character("squard", "ST22-007")])
      .build();

    expect(activation(game, "ST22-007")).toEqual([]);
  });
});

describe("ST22-009 Vista", () => {
  covers("ST22-009", "[Blocker]");

  it("blocks", () => {
    const game = defending("st22-009-block")
      .withBoard("p1", [character("vista", "ST22-009")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "vista",
        ),
    ).toBe(true);
  });
});

describe("ST22-011 Whitey Bay", () => {
  covers("ST22-011", "[On Play]", "[Your Turn]");

  it("shows two on-type cards for +2000 on a Whitebeard Pirates Leader", () => {
    const game = table("st22-011-buff")
      .withLeader("p1", "ST22-001")
      .withHand("p1", [
        instance("whitey", "ST22-011"),
        instance("a", ON_TYPE),
        instance("b", ON_TYPE),
      ])
      .build();
    const before = currentPower(game.state, "p1", "p1-leader");

    game.play({ type: "play-card", cardNumber: "ST22-011" });
    drive(game, "a", "b");

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 2_000);
    // Shown, not spent.
    expect(ids(game.state.players.p1.hand).sort()).toEqual(["a", "b"]);
  });

  it("buys nothing behind a Leader of another type", () => {
    const game = table("st22-011-off-leader")
      .withHand("p1", [
        instance("whitey", "ST22-011"),
        instance("a", ON_TYPE),
        instance("b", ON_TYPE),
      ])
      .build();
    const before = currentPower(game.state, "p1", "p1-leader");

    game.play({ type: "play-card", cardNumber: "ST22-011" });
    drive(game, "a", "b");

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before);
  });
});

describe("ST22-012 Marco", () => {
  it("trashes a card from hand instead of being K.O.'d by an effect", () => {
    covers("ST22-012", "static");
    const game = table("st22-012-replace")
      .withHand("p1", [instance("kingdom-come", "EB01-059")])
      .withBoard("p2", [character("marco", "ST22-012")])
      .withHand("p2", [instance("a", OFF_TYPE)])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-059" });
    drive(game, "marco", "replace:marco", "a");

    expect(ids(game.state.players.p2.board)).toEqual(["marco"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["a"]);
  });

  it("does not answer a removal that is not a K.O.", () => {
    // ST22-017 Fire Fist puts a cost-5-or-less Character under the deck,
    // which is not a K.O.: the hand card stays where it is.
    const game = table("st22-012-bury")
      .withHand("p1", [
        instance("fire-fist", "ST22-017"),
        instance("a", ON_TYPE),
        instance("b", ON_TYPE),
      ])
      .withBoard("p2", [character("marco", "ST22-012")])
      .withHand("p2", [instance("held", OFF_TYPE)])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST22-017" });
    drive(game, "a", "b", "marco");

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.deck).at(-1)).toBe("marco");
    expect(ids(game.state.players.p2.hand)).toEqual(["held"]);
  });

  it("gains +1000 through the opponent's next turn on a hit", () => {
    covers("ST22-012", "[When Attacking]");
    const game = table("st22-012-attack")
      .withBoard("p1", [character("marco", "ST22-012")])
      .withDeckTop("p1", [instance("hit", ON_TYPE)])
      // Life to take, so the hit does not end the game.
      .withLife("p2", [instance("p2-life", OFF_TYPE)])
      .build();

    game.play({ type: "attack", attackerInstanceId: "marco" });
    drive(game);
    expect(currentPower(game.state, "p1", "marco")).toBe(6_000);

    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    drive(game);
    game.pass();
    // The opponent's turn: the buff still stands.
    expect(game.state.activePlayer).toBe("p2");
    expect(currentPower(game.state, "p1", "marco")).toBe(6_000);
  });

  it("gains nothing on a miss", () => {
    const game = table("st22-012-miss")
      .withBoard("p1", [character("marco", "ST22-012")])
      .withDeckTop("p1", [instance("miss", OFF_TYPE)])
      .build();

    game.play({ type: "attack", attackerInstanceId: "marco" });
    drive(game);

    expect(currentPower(game.state, "p1", "marco")).toBe(5_000);
  });
});

describe("ST22-015 I Am Whitebeard!!", () => {
  covers("ST22-015", "[Main]");

  it("plays Newgate behind the Leader, then a Life card buys +2000", () => {
    const game = table("st22-015-full")
      .withLeader("p1", "ST22-001")
      .withHand("p1", [
        instance("event", "ST22-015"),
        instance("newgate", "ST22-003"),
      ])
      .withLife("p1", [
        instance("life-top", OFF_TYPE),
        instance("life-2", OFF_TYPE),
      ])
      .withDeckTop("p1", [instance("miss", OFF_TYPE)])
      .build();
    const before = currentPower(game.state, "p1", "p1-leader");

    game.play({ type: "activate-main", cardNumber: "ST22-015" });
    drive(game, "newgate", "life-top");

    expect(ids(game.state.players.p1.board)).toEqual(["newgate"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["life-top"]);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 2_000);
  });

  it("plays nothing behind another Leader, and declining the Life buys nothing", () => {
    const game = table("st22-015-off-leader")
      .withHand("p1", [
        instance("event", "ST22-015"),
        instance("newgate", "ST22-003"),
      ])
      .withLife("p1", [instance("life-top", OFF_TYPE)])
      .build();
    const before = currentPower(game.state, "p1", "p1-leader");

    game.play({ type: "activate-main", cardNumber: "ST22-015" });
    drive(game, "skip");

    expect(game.state.players.p1.board).toEqual([]);
    expect(ids(game.state.players.p1.hand)).toEqual(["newgate"]);
    expect(ids(game.state.players.p1.life)).toEqual(["life-top"]);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before);
  });
});

describe("ST22-016 Take That Back!! Take Back What You Said!!", () => {
  it("adds 4000 to the battle on a hit and nothing on a miss", () => {
    covers("ST22-016", "[Counter]");
    for (const [top, expected] of [
      [ON_TYPE, 4_000],
      [OFF_TYPE, 0],
    ] as const) {
      const game = defending(`st22-016-${expected}`)
        .withHand("p1", [instance("counter", "ST22-016")])
        .withDeckTop("p1", [instance("top", top)])
        .build();

      game.play({ type: "attack", targetInstanceId: "p1-leader" });
      while (game.state.phase === "block") game.pass();
      const before = currentPower(game.state, "p1", "p1-leader");
      game.play({ type: "activate-counter-event", cardNumber: "ST22-016" });
      drive(game);

      expect(
        (game.state.activeAttack?.counterPower ?? 0) +
          currentPower(game.state, "p1", "p1-leader") -
          before,
      ).toBe(expected);
    }
  });

  it("draws a card as a [Trigger]", () => {
    covers("ST22-016", "[Trigger]");
    const game = defending("st22-016-trigger")
      .withLife("p1", [instance("trigger", "ST22-016")])
      .withDeckTop("p1", [instance("drawn", OFF_TYPE)])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    drive(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["drawn"]);
  });
});

describe("ST22-017 Fire Fist", () => {
  it("shows two on-type cards to draw one and bury a cost-5 Character", () => {
    covers("ST22-017", "[Main]");
    const game = table("st22-017-main")
      .withHand("p1", [
        instance("fire-fist", "ST22-017"),
        instance("a", ON_TYPE),
        instance("b", ON_TYPE),
      ])
      .withDeckTop("p1", [instance("drawn", OFF_TYPE)])
      .withBoard("p2", [character("target", "ST22-010")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST22-017" });
    drive(game, "a", "b", "target");

    expect(ids(game.state.players.p1.hand).sort()).toEqual(["a", "b", "drawn"]);
    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.deck).at(-1)).toBe("target");
  });

  it("does nothing without the two cards to show", () => {
    const game = table("st22-017-unpaid")
      .withHand("p1", [
        instance("fire-fist", "ST22-017"),
        instance("a", ON_TYPE),
      ])
      .withDeckTop("p1", [instance("drawn", OFF_TYPE)])
      .withBoard("p2", [character("target", "ST22-010")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST22-017" });
    drive(game, "target");

    expect(ids(game.state.players.p1.hand)).toEqual(["a"]);
    expect(ids(game.state.players.p2.board)).toEqual(["target"]);
  });

  it("returns a cost-3-or-less Character to its owner's hand as a [Trigger]", () => {
    covers("ST22-017", "[Trigger]");
    const game = defending("st22-017-trigger")
      .withLife("p1", [instance("trigger", "ST22-017")])
      .withBoard("p2", [character("small", "ST22-004")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    drive(game, "small");

    expect(game.state.players.p2.board).toEqual([]);
    expect(ids(game.state.players.p2.hand)).toContain("small");
  });
});
