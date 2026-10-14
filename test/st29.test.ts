import { describe, expect, it } from "vitest";
import { currentPower, getLegalActions } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * STARTER DECK -Yellow Gecko Moria- [ST-29], as a whole-product import.
 *
 * `packages/cards/src/st29.ts` explains where the records come from; this file
 * holds the behaviour. Eight of the seventeen cards print a `[Trigger]` and
 * four of those put the card itself on the board for free, which is the
 * product: its Life stack is a second hand, and most of its other clauses open
 * as that stack shrinks.
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter -- the documented
 * shape for a card outside a manifest, and why nothing here asserts on a win
 * rate.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase, with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" });

/** p2 acting, for the clauses that only open on the opponent's turn. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

const boardNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.cardNumber);

/** The Leader three of the product's Triggers name. */
const LUFFY = "ST29-001";

describe("ST29-001 Monkey.D.Luffy (Leader)", () => {
  covers("ST29-001", "[When Attacking]");

  it("cycles a card on the swing once it is down to two Life", () => {
    const game = table("st29-001-cycle")
      .withLeader("p1", LUFFY)
      .withLife("p1", 2)
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    settle(game);

    // One drawn and one trashed, so the hand is the size it was.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
    expect(game.state.players.p1.trash.length).toBeGreaterThan(0);
  });

  it("cycles nothing while its Life is still high", () => {
    const game = table("st29-001-high-life")
      .withLeader("p1", LUFFY)
      .withLife("p1", 4)
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    settle(game);
    declineDefence(game);

    expect(game.state.players.p1.trash).toHaveLength(trashBefore);
  });
});

describe("ST29-002 Usopp", () => {
  covers("ST29-002", "[On Play]", "[When Attacking]");

  it("rests a body inside the opponent's own Life total", () => {
    const game = table("st29-002-on-play")
      .withHand("p1", [instance("usopp", "ST29-002")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .withLife("p2", 5)
      .build();

    game.play({ type: "play-card", cardNumber: "ST29-002" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")?.rested).toBe(true);
  });

  it("reaches nothing once the opponent's Life has fallen below the cost", () => {
    // The ceiling is the opponent's Life total, so the clause closes exactly as
    // the deck's own Life payoffs open -- a 5-cost body is out of reach at two
    // Life.
    const game = table("st29-002-narrow")
      .withHand("p1", [instance("usopp", "ST29-002")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .withLife("p2", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "ST29-002" });
    settle(game);

    expect(boardCard(game, "p2", "victim")?.rested).toBe(false);
  });

  it("rests again on the swing", () => {
    const game = table("st29-002-when-attacking")
      .withBoard("p1", [character("usopp", "ST29-002")])
      .withBoard("p2", [character("victim", "ST29-013")])
      .withLife("p2", 5)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "usopp",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")?.rested).toBe(true);
  });
});

describe("ST29-003 Kaku", () => {
  covers("ST29-003", "static", "[Trigger]");

  it("gains 1000 while its controller is level on Life", () => {
    const game = table("st29-003-level")
      .withBoard("p1", [character("kaku", "ST29-003")])
      .withLife("p1", 3)
      .withLife("p2", 3)
      .build();

    expect(currentPower(game.state, "p1", "kaku")).toBe(6_000);
  });

  it("gains nothing while it is ahead on Life", () => {
    const game = table("st29-003-ahead")
      .withBoard("p1", [character("kaku", "ST29-003")])
      .withLife("p1", 4)
      .withLife("p2", 2)
      .build();

    expect(currentPower(game.state, "p1", "kaku")).toBe(5_000);
  });

  it("K.O.s a 3-cost body off a Life card", () => {
    const game = table("st29-003-trigger")
      .withLife("p2", [instance("kaku", "ST29-003")])
      .withBoard("p1", [character("victim", "ST29-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("ST29-004 Sanji", () => {
  covers("ST29-004", "[On Play]", "[Trigger]");

  it("digs four deep for a Straw Hat card", () => {
    const game = table("st29-004-dig")
      .withHand("p1", [instance("sanji", "ST29-004")])
      .withDeckTop("p1", [instance("prize", "ST29-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST29-004" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST29-005",
    );
  });

  it("trashes a card from hand to play itself off a Life card", () => {
    const game = table("st29-004-trigger")
      .withLife("p2", [instance("sanji", "ST29-004")])
      .withHand("p2", [instance("fuel", "FIX-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("ST29-004");
  });

  it("plays nothing off a Life card with an empty hand", () => {
    const game = table("st29-004-no-fuel")
      .withLife("p2", [instance("sanji", "ST29-004")])
      .withHand("p2", [])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(boardNumbers(game, "p2")).not.toContain("ST29-004");
  });
});

describe("the three Triggers that play themselves behind the named Leader", () => {
  covers("ST29-005", "[Trigger]");
  covers("ST29-008", "[Trigger]");
  covers("ST29-009", "[Trigger]");

  it.each(["ST29-005", "ST29-008", "ST29-009"])(
    "%s comes down for free",
    (cardNumber) => {
      const game = table(`st29-self-play-${cardNumber}`)
        .withLeader("p2", LUFFY)
        .withLife("p2", [instance("body", cardNumber)])
        .build();

      game.play({ type: "attack", targetInstanceId: "p2-leader" });
      declineDefence(game);
      game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
      settle(game);

      expect(boardNumbers(game, "p2")).toContain(cardNumber);
    },
  );

  it("stays off the board behind another Leader", () => {
    // The gate is the Leader's *name*: an {Egghead} Leader that is not this one
    // fires none of the three, and the card joins the hand as an unactivated
    // Life card would.
    const game = table("st29-self-play-wrong-leader")
      .withLeader("p2", "ST10-003")
      .withLife("p2", [instance("body", "ST29-005")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    settle(game);

    // The engine withholds the *activate* branch of a Trigger whose program
    // provably cannot change the state, so the only thing on offer is taking
    // the Life card to hand.
    expect(
      game
        .legalActions("p2")
        .filter((action) => action.type === "resolve-trigger")
        .map((action) => action.summary),
    ).not.toContain("Activate Trigger");
    expect(boardNumbers(game, "p2")).not.toContain("ST29-005");
  });
});

describe("ST29-007 Tony Tony.Chopper", () => {
  covers("ST29-007", "[On K.O.]", "[Trigger]");

  it("swaps a Life card for a card from hand when it dies", () => {
    const game = table("st29-007-on-ko")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("chopper", "ST29-007")])
      .build();

    const lifeBefore = game.state.players.p2.life.length;
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "chopper" });
    applyOptional(game);
    settle(game);

    // One Life card out to hand and one card from hand back on top: the total
    // is unchanged and the top of the stack is now a card its owner picked.
    expect(game.state.players.p2.life).toHaveLength(lifeBefore);
  });

  it("buffs a [Monkey.D.Luffy] card off a Life card", () => {
    const game = table("st29-007-trigger")
      .withLeader("p2", LUFFY)
      .withLife("p2", [instance("chopper", "ST29-007")])
      .build();

    const before = currentPower(game.state, "p2", "p2-leader");
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(before + 2_000);
  });
});

describe("ST29-008 Nami", () => {
  covers("ST29-008", "static");

  it("turns a Life card face-up instead of an Egghead body dying", () => {
    const game = table("st29-008-save")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [
        character("nami", "ST29-008"),
        character("victim", "ST29-010"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "replace:nami" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
    expect(
      game.state.players.p2.life.filter((card) => card.faceUp),
    ).toHaveLength(1);
  });

  it("saves nothing once every Life card is already face-up", () => {
    // The price is information, so it is payable only while there is a
    // face-down Life card left to turn -- which is what keeps a replacement
    // with no `[Once Per Turn]` from being free forever.
    const game = table("st29-008-spent")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [
        character("nami", "ST29-008"),
        character("victim", "ST29-010"),
      ])
      .withLife("p2", [{ ...instance("shown", "FIX-001"), faceUp: true }])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });
});

describe("ST29-009 Nico Robin", () => {
  covers("ST29-009", "[Blocker]");

  it("blocks", () => {
    const game = defending("st29-009-block")
      .withBoard("p1", [character("robin", "ST29-009")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "robin",
        ),
    ).toBe(true);
  });
});

describe("ST29-011 Brook", () => {
  covers("ST29-011", "[Blocker]");

  it("blocks", () => {
    const game = defending("st29-011-block")
      .withBoard("p1", [character("brook", "ST29-011")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "brook",
        ),
    ).toBe(true);
  });
});

describe("ST29-012 Monkey.D.Luffy", () => {
  covers("ST29-012", "[Activate: Main]", "[Trigger]");

  it("moves a rested DON!! onto a [Monkey.D.Luffy] card", () => {
    const game = table("st29-012-gift")
      .withLeader("p1", LUFFY)
      .withBoard("p1", [character("luffy", "ST29-012")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "ST29-012" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("is not offered with no rested DON!! to move", () => {
    const game = table("st29-012-nothing-rested")
      .withLeader("p1", LUFFY)
      .withBoard("p1", [character("luffy", "ST29-012")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST29-012",
        ),
    ).toBe(false);
  });

  it("plays itself off a Life card with no gate at all", () => {
    const game = table("st29-012-trigger")
      .withLife("p2", [instance("luffy", "ST29-012")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("ST29-012");
  });
});

describe("ST29-013 Rob Lucci", () => {
  covers("ST29-013", "[Trigger]");

  it("K.O.s a body inside both Life totals added together", () => {
    // Both totals are read as the Trigger resolves: four of the attacker's own
    // Life cards, and none left on the side that revealed it.
    const game = table("st29-013-trigger")
      .withLife("p1", 4)
      .withLife("p2", [instance("lucci", "ST29-013")])
      .withBoard("p1", [character("victim", "ST29-003")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("ST29-014 Roronoa Zoro", () => {
  covers("ST29-014", "[Activate: Main]", "[Rush: Character]");

  it("attacks a Character the turn it lands, but not the Leader", () => {
    const game = table("st29-014-rush")
      .withHand("p1", [instance("zoro", "ST29-014")])
      .withBoard("p2", [{ ...character("target", "ST29-010"), rested: true }])
      .build();

    game.play({ type: "play-card", cardNumber: "ST29-014" });
    settle(game);

    const attacker = game.state.players.p1.board.at(-1)!;
    const targets = game
      .legalActions("p1")
      .flatMap((action) =>
        action.type === "attack" &&
        action.attackerInstanceId === attacker.instanceId
          ? [action.targetInstanceId]
          : [],
      );
    expect(targets).toEqual(["target"]);
  });

  it("trashes a [Trigger] card for a card and a rested DON!!", () => {
    const game = table("st29-014-activate")
      .withBoard("p1", [character("zoro", "ST29-014")])
      .withHand("p1", [instance("trig", "ST29-012")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "ST29-014" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "trig" });
    game.play({ type: "resolve-effect", optionId: "zoro" });
    settle(game);

    expect(boardCard(game, "p1", "zoro")?.attachedDon).toHaveLength(1);
    // One card spent and one drawn: the hand is the size it was.
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("is not offered with no [Trigger] card in hand", () => {
    const game = table("st29-014-no-trigger")
      .withBoard("p1", [character("zoro", "ST29-014")])
      .withHand("p1", [instance("plain", "FIX-001")])
      .withDon("p1", { rested: 2 })
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST29-014",
        ),
    ).toBe(false);
  });
});

describe("ST29-015 Raw Heat Strike", () => {
  covers("ST29-015", "[Counter]", "[Trigger]");

  it("adds 2000 and debuffs the other side from one Life", () => {
    const game = defending("st29-015-counter")
      .withHand("p1", [instance("strike", "ST29-015")])
      .withLife("p1", 1)
      .build();

    const before = currentPower(game.state, "p2", "p2-leader");
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST29-015" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(before - 2_000);
  });

  it("adds the power but no debuff above one Life", () => {
    const game = defending("st29-015-no-debuff")
      .withHand("p1", [instance("strike", "ST29-015")])
      .withLife("p1", 3)
      .build();

    const before = currentPower(game.state, "p2", "p2-leader");
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST29-015" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(before);
  });

  it("draws a card off a Life card", () => {
    const game = table("st29-015-trigger")
      .withLife("p2", [instance("strike", "ST29-015")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    // Activating the Trigger sends the Event to the trash rather than to hand,
    // so the only card that arrives is the drawn one.
    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
  });
});

describe("ST29-016 Kizaru!!", () => {
  covers("ST29-016", "[Main]", "[Counter]");

  it("makes the named Leader unblockable for the turn", () => {
    const game = table("st29-016-main")
      .withLeader("p1", LUFFY)
      .withHand("p1", [instance("kizaru", "ST29-016")])
      .withBoard("p2", [character("blocker", "ST29-011")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST29-016" });
    settle(game);
    game.play({ type: "attack", targetInstanceId: "p2-leader" });

    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("is not offered behind another Leader", () => {
    // The engine withholds an Event whose program provably cannot change the
    // state, so a DON!! is never spent on a name gate that is closed.
    const game = table("st29-016-wrong-leader")
      .withLeader("p1", "ST10-003")
      .withHand("p1", [instance("kizaru", "ST29-016")])
      .withBoard("p2", [character("blocker", "ST29-011")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST29-016",
        ),
    ).toBe(false);
  });

  it("adds 3000 to the Leader as a Counter", () => {
    const game = defending("st29-016-counter")
      .withHand("p1", [instance("kizaru", "ST29-016")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST29-016" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
  });
});

describe("ST29-017 Iai Death Lion Song", () => {
  covers("ST29-017", "[Counter]", "[Trigger]");

  it("adds 4000 and K.O.s a 3-cost body from two Life", () => {
    const game = defending("st29-017-counter")
      .withHand("p1", [instance("iai", "ST29-017")])
      .withLife("p1", 2)
      .withBoard("p2", [character("victim", "ST29-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST29-017" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("K.O.s nothing above two Life", () => {
    const game = defending("st29-017-no-ko")
      .withHand("p1", [instance("iai", "ST29-017")])
      .withLife("p1", 4)
      .withBoard("p2", [character("victim", "ST29-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST29-017" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });

  it("draws two and trashes one off a Life card", () => {
    const game = table("st29-017-trigger")
      .withLife("p2", [instance("iai", "ST29-017")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    // Two drawn and one trashed, and the Event itself goes to the trash rather
    // than to hand: net +1.
    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
  });
});
