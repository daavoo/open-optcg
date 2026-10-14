import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
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
 * STARTER DECK -Big Mom Pirates- [ST-14], as a whole-product import.
 *
 * `packages/cards/src/st14.ts` explains where the records come from; this file
 * holds the behaviour. The product is one idea printed seventeen ways: three
 * cards and a Stage raise the controller's own Characters' costs, and nine
 * more read a cost line back. So most of what is worth testing is the gate,
 * not the payout.
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

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/** Decline the block and Counter steps, so a declared attack resolves. */
const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

const costOfBoardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  effectiveCost(
    game.state,
    player,
    game.state.players[player].board.find(
      (card) => card.instanceId === instanceId,
    )!,
  );

/** An 8-cost body, which is the gate nine of the product's cards read. */
const bigBody = () => character("big", "ST14-012");

describe("ST14-001 Monkey.D.Luffy (Leader)", () => {
  covers("ST14-001", "static");

  it("raises its own Characters' costs once a DON!! is on it", () => {
    const game = table("st14-001-cost")
      .withLeader("p1", "ST14-001")
      .withBoard("p1", [character("body", "FIX-002")])
      .withDon("p1", { leaderAttached: 1 })
      .build();

    expect(costOfBoardCard(game, "p1", "body")).toBe(3);
  });

  it("raises nothing while the Leader is unpaid", () => {
    const game = table("st14-001-unpaid")
      .withLeader("p1", "ST14-001")
      .withBoard("p1", [character("body", "FIX-002")])
      .build();

    expect(costOfBoardCard(game, "p1", "body")).toBe(2);
  });

  it("gains 1000 behind an 8-cost body", () => {
    const game = table("st14-001-power")
      .withLeader("p1", "ST14-001")
      .withBoard("p1", [bigBody()])
      .withDon("p1", { leaderAttached: 1 })
      .build();

    // The Leader's own aura lifts the printed 8 to 9, so the gate is clear
    // twice over; the point of the case is that the Leader reads it at all.
    expect(costOfBoardCard(game, "p1", "big")).toBe(9);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
  });

  it("gains nothing behind a small board", () => {
    const game = table("st14-001-small-board")
      .withLeader("p1", "ST14-001")
      .withBoard("p1", [character("body", "FIX-002")])
      .withDon("p1", { leaderAttached: 1 })
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });
});

describe("ST14-002 Usopp", () => {
  covers("ST14-002", "[When Attacking]");

  it("K.O.s a 4-cost body with a DON!! on it and a big body behind it", () => {
    const game = table("st14-002-ko")
      .withBoard("p1", [character("usopp", "ST14-002"), bigBody()])
      .withBoard("p2", [character("victim", "FIX-002")])
      .withGivenDon("p1", "usopp", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "usopp",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("does nothing with the DON!! but no 8-cost body", () => {
    const game = table("st14-002-no-gate")
      .withBoard("p1", [character("usopp", "ST14-002")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .withGivenDon("p1", "usopp", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "usopp",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    declineDefence(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });

  it("does nothing with the body but no DON!! on it", () => {
    const game = table("st14-002-unpaid")
      .withBoard("p1", [character("usopp", "ST14-002"), bigBody()])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "usopp",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    declineDefence(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });
});

describe("ST14-003 Sanji", () => {
  covers("ST14-003", "[On Play]");

  it("K.O.s a 5-cost body behind a 6-cost one", () => {
    const game = table("st14-003-ko")
      .withHand("p1", [instance("sanji", "ST14-003")])
      .withBoard("p1", [bigBody()])
      .withBoard("p2", [character("victim", "ST14-009")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-003" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("does nothing on an empty board", () => {
    const game = table("st14-003-no-gate")
      .withHand("p1", [instance("sanji", "ST14-003")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-003" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });
});

describe("ST14-004 Jinbe", () => {
  covers("ST14-004", "[Activate: Main]");

  it("gives a black Straw Hat body +2 cost past the opponent's turn", () => {
    const game = table("st14-004-buff")
      .withBoard("p1", [
        character("jinbe", "ST14-004"),
        character("target", "ST14-005"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST14-004" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(costOfBoardCard(game, "p1", "target")).toBe(6);
  });

  it("reaches no off-colour or off-type body", () => {
    // The selector names both halves of the printed filter, so a Fixture
    // Character is not a legal target however cheap it is.
    const game = table("st14-004-off-type")
      .withBoard("p1", [
        character("jinbe", "ST14-004"),
        character("offtype", "FIX-002"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST14-004" });

    expect(effectOptions(game.state)).not.toContain("offtype");
  });

  it("only fires once in a turn", () => {
    const game = table("st14-004-once")
      .withBoard("p1", [
        character("jinbe", "ST14-004"),
        character("target", "ST14-005"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST14-004" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST14-004",
        ),
    ).toBe(false);
  });
});

describe("ST14-006 Nami", () => {
  covers("ST14-006", "[On Play]", "[Blocker]");

  it("blocks", () => {
    const game = defending("st14-006-block")
      .withBoard("p1", [character("nami", "ST14-006")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "nami",
        ),
    ).toBe(true);
  });

  it("draws behind an 8-cost body on a hand that is not full", () => {
    const game = table("st14-006-draw")
      .withHand("p1", [instance("nami", "ST14-006")])
      .withBoard("p1", [bigBody()])
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-006" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("draws nothing from a hand of seven", () => {
    const game = table("st14-006-full-hand")
      .withHand("p1", [
        instance("nami", "ST14-006"),
        ...Array.from({ length: 7 }, (_, index) =>
          instance(`spare-${index}`, "FIX-001"),
        ),
      ])
      .withBoard("p1", [bigBody()])
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-006" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(7);
  });
});

describe("ST14-007 Nico Robin", () => {
  covers("ST14-007", "[On Play]", "[When Attacking]");

  it("drops an opposing Character 5 cost on the way in", () => {
    const game = table("st14-007-on-play")
      .withHand("p1", [instance("robin", "ST14-007")])
      .withBoard("p1", [bigBody()])
      .withBoard("p2", [character("victim", "ST14-009")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-007" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(costOfBoardCard(game, "p2", "victim")).toBe(0);
  });

  it("drops it again on the swing", () => {
    const game = table("st14-007-when-attacking")
      .withBoard("p1", [character("robin", "ST14-007"), bigBody()])
      .withBoard("p2", [character("victim", "ST14-009")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "robin",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(costOfBoardCard(game, "p2", "victim")).toBe(0);
  });

  it("does nothing without an 8-cost body", () => {
    const game = table("st14-007-no-gate")
      .withHand("p1", [instance("robin", "ST14-007")])
      .withBoard("p2", [character("victim", "ST14-009")])
      .build();

    const before = costOfBoardCard(game, "p2", "victim");
    game.play({ type: "play-card", cardNumber: "ST14-007" });
    settle(game);

    expect(costOfBoardCard(game, "p2", "victim")).toBe(before);
  });
});

describe("ST14-008 Haredas", () => {
  covers("ST14-008", "[Activate: Main]");

  it("rests itself for the cost buff and cycles behind an 8-cost body", () => {
    const game = table("st14-008-full")
      .withBoard("p1", [
        character("haredas", "ST14-008"),
        character("target", "ST14-005"),
        bigBody(),
      ])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST14-008" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "haredas")?.rested).toBe(true);
    expect(costOfBoardCard(game, "p1", "target")).toBe(6);
    // Drawn one and trashed one, so the hand is the size it was.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
    expect(game.state.players.p1.trash.length).toBeGreaterThan(0);
  });

  it("buffs without cycling when no body is big enough", () => {
    const game = table("st14-008-no-gate")
      .withBoard("p1", [
        character("haredas", "ST14-008"),
        character("target", "ST14-005"),
      ])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "activate-main", cardNumber: "ST14-008" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(costOfBoardCard(game, "p1", "target")).toBe(6);
    expect(game.state.players.p1.trash).toHaveLength(trashBefore);
  });

  it("is not offered once it is rested", () => {
    const game = table("st14-008-rested")
      .withBoard("p1", [
        { ...character("haredas", "ST14-008"), rested: true },
        character("target", "ST14-005"),
      ])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST14-008",
        ),
    ).toBe(false);
  });
});

describe("ST14-009 Franky", () => {
  covers("ST14-009", "[Opponent's Turn]");

  it("defends 2000 bigger with a DON!! on it behind a 6-cost body", () => {
    const game = defending("st14-009-power")
      .withBoard("p1", [character("franky", "ST14-009"), bigBody()])
      .withGivenDon("p1", "franky", 1)
      .build();

    // 6000 printed, the DON!! on it, and the clause's 2000. `currentPower`
    // counts the DON!! on either turn; what moves between the two cases below
    // is the 2000 the printed `[Opponent's Turn]` gates.
    expect(currentPower(game.state, "p1", "franky")).toBe(9_000);
  });

  it("adds nothing on its own turn", () => {
    const game = table("st14-009-own-turn")
      .withBoard("p1", [character("franky", "ST14-009"), bigBody()])
      .withGivenDon("p1", "franky", 1)
      .build();

    expect(currentPower(game.state, "p1", "franky")).toBe(7_000);
  });

  it("cannot be K.O.'d by the opponent's effect while the clause holds", () => {
    const game = defending("st14-009-immune")
      .withBoard("p1", [character("franky", "ST14-009"), bigBody()])
      .withGivenDon("p1", "franky", 1)
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });

    expect(effectOptions(game.state)).not.toContain("franky");
  });

  it("is a legal K.O. target with no DON!! on it", () => {
    const game = defending("st14-009-unpaid")
      .withBoard("p1", [character("franky", "ST14-009"), bigBody()])
      .withHand("p2", [instance("gatling", "ST10-016")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });

    expect(effectOptions(game.state)).toContain("franky");
  });
});

describe("ST14-011 Heracles", () => {
  covers("ST14-011", "[Activate: Main]");

  it("rests itself to raise a black Straw Hat body's cost", () => {
    const game = table("st14-011-buff")
      .withBoard("p1", [
        character("heracles", "ST14-011"),
        character("target", "ST14-005"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST14-011" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "heracles")?.rested).toBe(true);
    expect(costOfBoardCard(game, "p1", "target")).toBe(6);
  });
});

describe("ST14-012 Monkey.D.Luffy", () => {
  covers("ST14-012", "static");

  it("attacks the turn it lands once a 10-cost body is out", () => {
    // Its own printed 8 plus the Leader's +1 and the Stage's +1 is the line,
    // which is the whole reason the product raises its own costs.
    const game = table("st14-012-rush")
      .withLeader("p1", "ST14-001")
      .withStage("p1", instance("sunny", "ST14-017"))
      .withHand("p1", [instance("luffy", "ST14-012")])
      .withDon("p1", { leaderAttached: 1 })
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-012" });
    settle(game);

    const attacker = game.state.players.p1.board.at(-1)!;
    expect(costOfBoardCard(game, "p1", attacker.instanceId)).toBe(10);
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === attacker.instanceId,
        ),
    ).toBe(true);
  });

  it("cannot attack the turn it lands on a bare board", () => {
    const game = table("st14-012-no-rush")
      .withHand("p1", [instance("luffy", "ST14-012")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-012" });
    settle(game);

    const attacker = game.state.players.p1.board.at(-1)!;
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === attacker.instanceId,
        ),
    ).toBe(false);
  });
});

describe("ST14-014 Gum-Gum Giant Rifle", () => {
  covers("ST14-014", "[Counter]", "[Trigger]");

  it("adds 3000 to the battle behind an 8-cost body", () => {
    const game = defending("st14-014-counter")
      .withBoard("p1", [bigBody()])
      .withHand("p1", [instance("rifle", "ST14-014")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST14-014" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
  });

  it("is not offered at all on a board with no 8-cost body", () => {
    // `powerWhen` is read by the offer as well as by the resolution, so a
    // Counter that would add nothing is never put on the table -- the defender
    // cannot spend a card on a forecast the battle will not honour.
    const game = defending("st14-014-no-gate")
      .withHand("p1", [instance("rifle", "ST14-014")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-counter-event" &&
            action.sourceCardNumber === "ST14-014",
        ),
    ).toBe(false);
  });

  it("recurs a 2-cost body out of the trash off a Life card", () => {
    const game = table("st14-014-trigger")
      .withLife("p2", [instance("rifle", "ST14-014")])
      .withTrash("p2", [instance("corpse", "FIX-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "corpse" });
    settle(game);

    expect(game.state.players.p2.hand.map((card) => card.cardNumber)).toContain(
      "FIX-002",
    );
  });
});

describe("ST14-015 Gum-Gum Diable Three-Swords Style", () => {
  covers("ST14-015", "[Main]", "[Trigger]");

  it("buffs for the turn and K.O.s a 2-cost body behind the gate", () => {
    const game = table("st14-015-main")
      .withHand("p1", [instance("phoenix", "ST14-015")])
      .withBoard("p1", [bigBody()])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST14-015" });
    game.play({ type: "resolve-effect", optionId: "big" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p1", "big")).toBe(13_000);
    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("still buffs with no 8-cost body, and K.O.s nothing", () => {
    const game = table("st14-015-buff-only")
      .withHand("p1", [instance("phoenix", "ST14-015")])
      .withBoard("p1", [character("body", "FIX-002")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST14-015" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settle(game);

    expect(currentPower(game.state, "p1", "body")).toBe(7_000);
    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });

  it("K.O.s a 5-cost body off a Life card", () => {
    const game = table("st14-015-trigger")
      .withLife("p2", [instance("phoenix", "ST14-015")])
      .withBoard("p2", [character("big", "ST14-012")])
      .withBoard("p1", [character("victim", "ST14-009")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("ST14-016 I Have My Crew!!", () => {
  covers("ST14-016", "[Main]", "[Trigger]");

  it("draws and raises any of its controller's Characters", () => {
    const game = table("st14-016-main")
      .withHand("p1", [instance("crew", "ST14-016")])
      .withBoard("p1", [character("offtype", "FIX-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST14-016" });
    game.play({ type: "resolve-effect", optionId: "offtype" });
    settle(game);

    // Not narrowed to black {Straw Hat Crew}, unlike the product's three other
    // cost clauses: this one reaches an off-type body too.
    expect(costOfBoardCard(game, "p1", "offtype")).toBe(5);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("K.O.s a 3-cost body off a Life card", () => {
    const game = table("st14-016-trigger")
      .withLife("p2", [instance("crew", "ST14-016")])
      .withBoard("p1", [character("victim", "ST14-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("ST14-017 Thousand Sunny", () => {
  covers("ST14-017", "[On Play]", "static");

  it("raises every black Straw Hat body its controller has", () => {
    const game = table("st14-017-aura")
      .withStage("p1", instance("sunny", "ST14-017"))
      .withBoard("p1", [
        character("onType", "ST14-005"),
        character("offType", "FIX-002"),
      ])
      .build();

    expect(costOfBoardCard(game, "p1", "onType")).toBe(5);
    expect(costOfBoardCard(game, "p1", "offType")).toBe(2);
  });

  it("draws on arrival behind a Straw Hat Leader", () => {
    const game = table("st14-017-draw")
      .withLeader("p1", "ST14-001")
      .withHand("p1", [instance("sunny", "ST14-017")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-017" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("draws nothing behind another Leader", () => {
    const game = table("st14-017-wrong-leader")
      .withLeader("p1", "ST10-003")
      .withHand("p1", [instance("sunny", "ST14-017")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST14-017" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});
