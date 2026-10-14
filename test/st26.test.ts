import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * ST-26 "Monkey.D.Luffy", the Purple/Black starter deck.
 *
 * Fifteen identities, and only nine of them are new: the deck's OP09 slots
 * were already in the pool with the set, and they are driven by
 * `test/op09.test.ts`. What is here is the five ST26 exclusives, the three
 * OP-05 Straw Hats and ST14-010 Brook, which prints nothing at all.
 *
 * Every position seats the deck itself rather than a pair of starters. That is
 * deliberate for this file: four of the five exclusives pay `DON!! −2`, and the
 * Leader OP09-061 refunds it -- so a test that seated a neutral Leader would be
 * asserting on a cost the deck never actually pays. The Leader's own `+1 cost`
 * aura is live whenever it has DON!! attached, which is why the cost cases
 * below say which side of that they are on.
 */

const ST26 = "(Purple/Black) Monkey.D.Luffy - Starter Deck 26";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

/** ST-26 acting in its own Main Phase, with the full ten DON!! available. */
const table = (seed: string) =>
  scenario().decks(ST26, OPPONENT).seed(seed).atTurn(11, { active: "p1" });

/** The opponent acting, for the clauses that only open on their turn. */
const defending = (seed: string) =>
  scenario().decks(ST26, OPPONENT).seed(seed).atTurn(12, { active: "p2" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Take the apply branch of an `optional` prompt, if one is open. */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

describe("ST26-003 Nico Robin", () => {
  covers("ST26-003", "[On Play]");

  it("returns 2 DON!! for 1 active one, and the Leader refunds the pair", () => {
    const game = table("st26-robin")
      .withHand("p1", [instance("robin", "ST26-003")])
      // Four DON!! back in the deck, so both the card's "add 1" and the
      // Leader's "add 2" have somewhere to draw from. At a full ten on the
      // field the DON!! deck is empty and the refund silently caps.
      .withDonDeck("p1", 4)
      .build();
    const before = game.state.players.p1;
    const deckBefore = before.donDeck.length;
    const fieldBefore = before.activeDon.length + before.restedDon.length;

    game.play({ type: "play-card", cardNumber: "ST26-003" });
    applyOptional(game);
    settle(game);

    const after = game.state.players.p1;
    // Two returned, one added active by Robin, and the Leader's once-per-turn
    // clause answers the same return with one more active and one rested. The
    // 3 DON!! the body itself cost are rested, not gone.
    // Two returned and three added back -- one by Robin, two by the Leader --
    // so the DON!! deck is one lighter and the field one heavier than before
    // the 3-cost body was paid for.
    expect(after.donDeck.length).toBe(deckBefore - 1);
    expect(after.activeDon.length + after.restedDon.length).toBe(
      fieldBefore + 1,
    );
    expect(after.board.map((card) => card.cardNumber)).toContain("ST26-003");
  });

  it("may decline the DON!! return, and then adds no DON!! at all", () => {
    const game = table("st26-robin-declines")
      .withHand("p1", [instance("robin", "ST26-003")])
      .withDonDeck("p1", 4)
      .build();
    const before = game.state.players.p1;
    const deckBefore = before.donDeck.length;
    const fieldBefore = before.activeDon.length + before.restedDon.length;

    game.play({ type: "play-card", cardNumber: "ST26-003" });
    // The whole clause is one `optional`: the DON!! -2 and the add are paid
    // and taken together, so declining leaves the DON!! deck untouched. The
    // Leader's own refund is keyed to DON!! being *returned*, so declining
    // costs that too -- which is the reason a player would ever say no here.
    expect(effectOptions(game.state)).toContain("skip");
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    const after = game.state.players.p1;
    expect(after.donDeck.length).toBe(deckBefore);
    expect(after.activeDon.length + after.restedDon.length).toBe(fieldBefore);
    expect(after.board.map((card) => card.cardNumber)).toContain("ST26-003");
  });
});

describe("OP09-061 Monkey.D.Luffy (Leader), the DON!!-return refund", () => {
  covers("OP09-061", "[Your Turn]");

  /** Answer the "how many DON!! go back" prompt at a chosen count. */
  const returnCount = (game: Game, count: number) => {
    game.play({
      type: "resolve-effect",
      optionId: `return:${String(count)}`,
    });
  };

  const zoroReturning = (seed: string, count: number) => {
    const game = table(seed)
      .withHand("p1", [instance("zoro", "OP09-076")])
      // Four back in the DON!! deck, so both the card's own "add 1" and the
      // Leader's "add 2" have somewhere to draw from.
      .withDonDeck("p1", 4)
      .build();
    game.play({ type: "play-card", cardNumber: "OP09-076" });
    applyOptional(game);
    returnCount(game, count);
    settle(game);
    return game;
  };

  it("pays two DON!! back when two are returned, and nothing when one is", () => {
    // The line Bandai's own guide for this Leader opens with: use OP09-076 to
    // "deliberately return more than two DON!! cards" and the refund pays for
    // it. Returning one is the same card with the refund switched off, which
    // is what makes this the deck's central decision rather than a detail.
    const one = zoroReturning("st26-refund-one", 1);
    const two = zoroReturning("st26-refund-two", 2);

    const fieldOf = (game: Game) =>
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    // Returning one: pay 1, add 1 active -- the field is level. Returning two:
    // pay 2, add 1 active from the card and 1 active + 1 rested from the
    // Leader, so the field is one *up* on the cheaper line.
    expect(fieldOf(two) - fieldOf(one)).toBe(1);
    // The same fact read off the other pile, which is where the refund is
    // unambiguous: returning one takes one out of the DON!! deck and puts one
    // back, so it is level, while returning two takes two out and puts three
    // back. The rested count is *not* the assertion to make -- the payment
    // comes off the rested pile first, so both lines end with the same number
    // of rested DON!! for different reasons.
    expect(
      one.state.players.p1.donDeck.length - two.state.players.p1.donDeck.length,
    ).toBe(1);
  });

  it("pays once a turn, so the second return that turn is full price", () => {
    const game = table("st26-refund-once")
      .withHand("p1", [
        instance("zoro", "OP09-076"),
        instance("robin", "ST26-003"),
      ])
      .withDonDeck("p1", 6)
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-076" });
    applyOptional(game);
    returnCount(game, 2);
    settle(game);
    const afterFirst =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    // ST26-003 pays a fixed DON!! -2, which is also "2 or more returned" -- but
    // the Leader's clause is [Once Per Turn] and has already paid.
    game.play({ type: "play-card", cardNumber: "ST26-003" });
    applyOptional(game);
    settle(game);
    const afterSecond =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    // 3 rested paying the body, 2 returned, 1 added active by Robin, and no
    // refund: the field is down by the two that went back plus the three the
    // body cost, and up by Robin's one.
    expect(afterSecond).toBeLessThan(afterFirst);
  });
});

describe("ST26-004 General Franky", () => {
  covers("ST26-004", "[On Play]");

  it("gives two of the opponent's Characters −2000 for the turn", () => {
    const game = table("st26-franky")
      .withHand("p1", [instance("franky", "ST26-004")])
      .withBoard("p2", [
        character("zoro", "ST32-004"),
        character("brook", "ST14-010"),
      ])
      .build();
    const zoroBefore = currentPower(game.state, "p2", "zoro");
    const brookBefore = currentPower(game.state, "p2", "brook");

    game.play({ type: "play-card", cardNumber: "ST26-004" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p2", "zoro")).toBe(zoroBefore - 2000);
    expect(currentPower(game.state, "p2", "brook")).toBe(brookBefore - 2000);
  });

  it("resolves to nothing when the opponent has no Characters", () => {
    const game = table("st26-franky-empty")
      .withHand("p1", [instance("franky", "ST26-004")])
      .withBoard("p2", [])
      .build();

    game.play({ type: "play-card", cardNumber: "ST26-004" });
    applyOptional(game);
    settle(game);

    // The body still arrives, and the DON!! is not asked for on an empty
    // board -- the "up to 2" is satisfied by naming nothing.
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("ST26-004");
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("ST26-002 Tony Tony.Chopper", () => {
  covers("ST26-002", "[On Play]", "[Blocker]");

  it("carries its printed [Blocker]", () => {
    const game = table("st26-chopper-blocker")
      .withBoard("p1", [character("chopper", "ST26-002")])
      .build();

    expect(hasKeyword(game.state, "p1", "chopper", "Blocker")).toBe(true);
  });

  it("rests a cost-1 Character", () => {
    const game = table("st26-chopper-rest")
      .withHand("p1", [instance("chopper", "ST26-002")])
      .withBoard("p2", [character("cheap", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST26-002" });
    applyOptional(game);
    settle(game);

    const rested = game.state.players.p2.board.find(
      (card) => card.instanceId === "cheap",
    );
    expect(rested?.rested).toBe(true);
  });

  it("offers the opponent's DON!! as the other half of the same choice", () => {
    const game = table("st26-chopper-don")
      .withHand("p1", [instance("chopper", "ST26-002")])
      // Nothing at cost 1 or less on the board, so the Character half of the
      // choice is empty and only the DON!! half is left. That is the shape the
      // card is actually played in on turn three.
      .withBoard("p2", [character("big", "ST26-004")])
      .build();
    const activeBefore = game.state.players.p2.activeDon.length;

    game.play({ type: "play-card", cardNumber: "ST26-002" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p2.activeDon.length).toBe(activeBefore - 1);
    expect(game.state.players.p2.restedDon.length).toBe(1);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "big")
        ?.rested,
    ).toBe(false);
  });
});

describe("ST26-001 Soba Mask", () => {
  covers("ST26-001", "[On Play]", "static");

  it("costs 5 less in hand while a 7000-power San-Gorou is out", () => {
    const game = table("st26-soba-cost")
      .withHand("p1", [instance("soba", "ST26-001")])
      .withBoard("p1", [character("san-gorou", "OP05-065")])
      .build();
    const soba = game.state.players.p1.hand.find(
      (card) => card.instanceId === "soba",
    )!;

    // Printed 7, and no DON!! on the Leader, so the Leader's own +1 cost aura
    // is off and the discount is the only layer.
    expect(effectiveCost(game.state, "p1", soba)).toBe(2);
  });

  it("costs its printed 7 with no [San-Gorou] or [Sanji] body out", () => {
    const game = table("st26-soba-no-discount")
      .withHand("p1", [instance("soba", "ST26-001")])
      .withBoard("p1", [character("brook", "ST14-010")])
      .build();
    const soba = game.state.players.p1.hand.find(
      (card) => card.instanceId === "soba",
    )!;

    expect(effectiveCost(game.state, "p1", soba)).toBe(7);
  });

  it("is not discounted by a body under 7000 base power", () => {
    const game = table("st26-soba-small")
      .withHand("p1", [instance("soba", "ST26-001")])
      // OP09-070 Nami is a 2000 [Straw Hat Crew] body and no Sanji at all; the
      // gate reads the name and the base power, and this fails both.
      .withBoard("p1", [character("nami", "OP09-070")])
      .build();
    const soba = game.state.players.p1.hand.find(
      (card) => card.instanceId === "soba",
    )!;

    expect(effectiveCost(game.state, "p1", soba)).toBe(7);
  });

  it("returns every San-Gorou on the board to hand when it arrives", () => {
    const game = table("st26-soba-bounce")
      .withHand("p1", [instance("soba", "ST26-001")])
      .withBoard("p1", [
        character("san-gorou-1", "OP05-065"),
        character("san-gorou-2", "OP05-065"),
        character("brook", "ST14-010"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST26-001" });
    settle(game);

    const board = game.state.players.p1.board.map((card) => card.instanceId);
    // Both San-Gorou go: the clause is "all of your", not "up to". Brook stays,
    // and Soba Mask itself answers to neither name so it never bounces itself.
    expect(board).not.toContain("san-gorou-1");
    expect(board).not.toContain("san-gorou-2");
    expect(board).toContain("brook");
    expect(
      game.state.players.p1.hand.filter(
        (card) => card.cardNumber === "OP05-065",
      ),
    ).toHaveLength(2);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("ST26-001");
  });
});

describe("ST26-005 Monkey.D.Luffy", () => {
  covers("ST26-005", "[On Play]", "[When Attacking]");

  it("sets the Leader's base power to 7000 on play", () => {
    const game = table("st26-luffy-on-play")
      .withHand("p1", [instance("luffy", "ST26-005")])
      .build();
    // OP09-061 is a printed 5000 Leader, so the clause is worth +2000 here.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);

    game.play({ type: "play-card", cardNumber: "ST26-005" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });

  it("is not offered while the opponent has fewer than 5 DON!!", () => {
    const game = table("st26-luffy-gate")
      .withHand("p1", [instance("luffy", "ST26-005")])
      // Six DON!! back in their deck leaves four on their field, one under the
      // printed gate.
      .withDonDeck("p2", 6)
      .build();

    game.play({ type: "play-card", cardNumber: "ST26-005" });

    // The gate is outside the DON!! −2, so the two DON!! are never offered for
    // a clause that would resolve to nothing.
    expect(effectOptions(game.state)).not.toContain("apply");
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
    // And nothing was paid: the two DON!! are still on the field, rested by
    // the 6-cost body rather than returned to the DON!! deck.
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(10);
  });

  it("fires again from the attack, and the 7000 survives into the opponent's turn", () => {
    const game = table("st26-luffy-attacking")
      .withBoard("p1", [
        character("luffy", "ST26-005", { playedTurn: 1, rested: false }),
      ])
      .build();

    game.play({ type: "attack", attackerInstanceId: "luffy" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);

    // "Until the end of your opponent's next End Phase": still 7000 while they
    // attack into it, which is what makes the clause defensive.
    while (game.state.turn === 11) game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });
});

describe("OP05-066 Jinbe", () => {
  covers("OP05-066", "[Blocker]", "[Opponent's Turn]");

  it("carries its printed [Blocker]", () => {
    const game = table("st26-jinbe-blocker")
      .withBoard("p1", [character("jinbe", "OP05-066")])
      .build();

    expect(hasKeyword(game.state, "p1", "jinbe", "Blocker")).toBe(true);
  });

  it("gains +1000 on the opponent's turn with all ten DON!! on the field", () => {
    const game = defending("st26-jinbe-ten")
      .withBoard("p1", [character("jinbe", "OP05-066")])
      .build();

    expect(currentPower(game.state, "p1", "jinbe")).toBe(7000);
  });

  it("stays at 6000 with nine DON!!, and on its controller's own turn", () => {
    const nine = defending("st26-jinbe-nine")
      .withBoard("p1", [character("jinbe", "OP05-066")])
      .withDonDeck("p1", 1)
      .build();
    expect(currentPower(nine.state, "p1", "jinbe")).toBe(6000);

    const ownTurn = table("st26-jinbe-own-turn")
      .withBoard("p1", [character("jinbe", "OP05-066")])
      .build();
    expect(currentPower(ownTurn.state, "p1", "jinbe")).toBe(6000);
  });
});

describe("OP05-070 Fra-Nosuke", () => {
  covers("OP05-070", "static");

  it("gains [Rush] with a DON!! on it and eight on the field", () => {
    const game = table("st26-franosuke-rush")
      .withBoard("p1", [character("fra", "OP05-070")])
      // Eight on the field, one of them given to Fra-Nosuke: the DON!! it
      // gives itself is still on the field, so the two gates are met by the
      // same eight cards.
      .withDonDeck("p1", 2)
      .withGivenDon("p1", "fra", 1)
      .build();

    expect(hasKeyword(game.state, "p1", "fra", "Rush")).toBe(true);
  });

  it("has no [Rush] without a DON!! of its own, or under eight on the field", () => {
    const noDon = table("st26-franosuke-no-don")
      .withBoard("p1", [character("fra", "OP05-070")])
      .withDonDeck("p1", 2)
      .build();
    expect(hasKeyword(noDon.state, "p1", "fra", "Rush")).toBe(false);

    const thin = table("st26-franosuke-thin")
      .withBoard("p1", [character("fra", "OP05-070")])
      .withDonDeck("p1", 3)
      .withGivenDon("p1", "fra", 1)
      .build();
    expect(hasKeyword(thin.state, "p1", "fra", "Rush")).toBe(false);
  });
});
