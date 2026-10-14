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
 * EXTRA BOOSTER -MEMORIAL COLLECTION- [EB-01], as a whole-set import.
 *
 * `packages/cards/src/eb01.ts` explains where the records come from; this file
 * holds the behaviour. One of the set's 61 identities was already in the pool as
 * a card a community deck plays -- EB01-048 Laboon, in the ST-27 Teach list --
 * and it prints no clause, so what is here is the 63 clauses the other cards
 * print.
 *
 * ## The rules the import added
 *
 * Three, each because a printed clause could not otherwise be expressed:
 * `trash-life-down-to` (EB01-059 and EB01-060, whose price is every Life card
 * above the first), an `operator` on `deck-top-cost` (EB01-029 asks for a band
 * where the Big Mom guessing package asks for an exact cost), and
 * `differentColorFromBinding` (EB01-020, whose target is coloured by the card
 * the same program just bounced). Every one is driven from the card here rather
 * than from the primitive: a rule that fires in a unit test and never in a game
 * is not support.
 *
 * ## Why no deck
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter. That is the
 * documented shape for a card outside a manifest, and it is also why nothing
 * here asserts on win rates: the set import moves no deck's standing.
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

/**
 * Take the apply branch of an `optional` prompt, if one is open.
 *
 * The engine elides the apply/skip prompt where declining and applying are
 * indistinguishable, so asking is more robust than hard-coding `"apply"`.
 */
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

const boardNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.cardNumber);

const handNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].hand.map((card) => card.cardNumber);

const trashNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].trash.map((card) => card.cardNumber);

/** Field DON!! -- the cost area, both piles, which is what `DON!! −N` spends. */
const fieldDon = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].activeDon.length +
  game.state.players[player].restedDon.length;

describe("EB01-002 Izo", () => {
  covers("EB01-002", "[On Play]", "[On Your Opponent's Attack]");

  it("gives a rested DON!! to the Leader when it lands", () => {
    const game = table("eb01-002-on-play")
      .withHand("p1", [instance("izo", "EB01-002")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-002" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("trashes a card on defence to shrink the attacking Leader", () => {
    const game = defending("eb01-002-defence")
      .withLeader("p1", "FIX-LEADER-ODEN")
      .withBoard("p1", [character("izo", "EB01-002")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withHand("p1", [instance("fuel", "FIX-001")])
      .build();

    const before = currentPower(game.state, "p2", "p2-leader");
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(before - 2_000);
    expect(trashNumbers(game, "p1")).toContain("FIX-001");
  });

  it("gives nothing behind a Leader of neither type", () => {
    const game = defending("eb01-002-wrong-leader")
      .withBoard("p1", [character("izo", "EB01-002")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withHand("p1", [instance("fuel", "FIX-001")])
      .build();

    const before = currentPower(game.state, "p2", "p2-leader");
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    settle(game);

    // The cost is paid before the Leader gate is read, which is the printed
    // order: the card is gone and nothing is debuffed.
    expect(trashNumbers(game, "p1")).toContain("FIX-001");
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(before);
  });
});

describe("EB01-003 Kid & Killer", () => {
  covers("EB01-003", "[When Attacking]");

  it("grows by 2000 once the opponent is down to 2 Life", () => {
    const game = table("eb01-003-low-life")
      .withBoard("p1", [character("kid", "EB01-003")])
      .withLife("p2", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "kid",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(currentPower(game.state, "p1", "kid")).toBe(7_000);
  });

  it("stays at printed power while the opponent is still high", () => {
    const game = table("eb01-003-high-life")
      .withBoard("p1", [character("kid", "EB01-003")])
      .withLife("p2", 4)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "kid",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(currentPower(game.state, "p1", "kid")).toBe(5_000);
  });
});

describe("EB01-004 Koza", () => {
  covers("EB01-004", "[When Attacking]");

  it("shrinks its own Leader by 5000 to take 3000 off a Character", () => {
    const game = table("eb01-004-trade")
      .withBoard("p1", [character("koza", "EB01-004")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    const leaderBefore = currentPower(game.state, "p1", "p1-leader");
    const victimBefore = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "koza",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(
      leaderBefore - 5_000,
    );
    expect(currentPower(game.state, "p2", "victim")).toBe(victimBefore - 3_000);
  });

  it("cannot pay with a Leader that has already attacked", () => {
    // The cost names "your 1 active Leader", so a Leader that swung first has
    // nothing to give -- which is what stops the clause being free on a turn
    // the Leader attacks too.
    const game = table("eb01-004-rested-leader")
      .withBoard("p1", [character("koza", "EB01-004")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .withRestedLeader("p1")
      .build();

    const victimBefore = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "koza",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(victimBefore);
  });
});

describe("EB01-006 Tony Tony.Chopper", () => {
  covers("EB01-006", "[When Attacking]");

  it("takes 3000 off a Character once it carries 2 DON!!", () => {
    const game = table("eb01-006-paid")
      .withBoard("p1", [character("chopper", "EB01-006")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .withGivenDon("p1", "chopper", 2)
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before - 3_000);
  });

  it("does nothing on one DON!!", () => {
    const game = table("eb01-006-underpaid")
      .withBoard("p1", [character("chopper", "EB01-006")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .withGivenDon("p1", "chopper", 1)
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before);
  });
});

describe("EB01-012 Cavendish", () => {
  covers("EB01-012", "[On Play]", "[When Attacking]");

  it("sets 2 DON!! active on play behind a {Supernovas} Leader", () => {
    const game = table("eb01-012-on-play")
      .withLeader("p1", "OP10-099")
      .withHand("p1", [instance("cavendish", "EB01-012")])
      .withDon("p1", { rested: 4 })
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "EB01-012" });
    settle(game);

    // Five DON!! pay for the body and two come back, so the cost area is three
    // down rather than five.
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 5 + 2);
  });

  it("does nothing while another [Cavendish] is already out", () => {
    const game = table("eb01-012-duplicate")
      .withLeader("p1", "OP10-099")
      .withBoard("p1", [character("twin", "EB01-012")])
      .withHand("p1", [instance("cavendish", "EB01-012")])
      .withDon("p1", { rested: 4 })
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "EB01-012" });
    settle(game);

    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 5);
  });

  it("sets 2 DON!! active again when it attacks", () => {
    const game = table("eb01-012-attacking")
      .withLeader("p1", "OP10-099")
      .withBoard("p1", [character("cavendish", "EB01-012")])
      .withDon("p1", { rested: 4 })
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "cavendish",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(game.state.players.p1.activeDon.length).toBe(activeBefore + 2);
  });
});

describe("EB01-015 Scratchmen Apoo", () => {
  covers("EB01-015", "[On Play]");

  it("rests a 2-cost Character", () => {
    const game = table("eb01-015-rest")
      .withHand("p1", [instance("apoo", "EB01-015")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-015" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")?.rested).toBe(true);
  });

  it("does not reach a 3-cost body", () => {
    const game = table("eb01-015-too-big")
      .withHand("p1", [instance("apoo", "EB01-015")])
      .withBoard("p2", [character("big", "ST26-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-015" });
    settle(game);

    expect(boardCard(game, "p2", "big")?.rested).toBeFalsy();
  });
});

describe("EB01-023 Edward Weevil", () => {
  covers("EB01-023", "[On Play]");

  it("draws a card", () => {
    const game = table("eb01-023-draw")
      .withHand("p1", [instance("weevil", "EB01-023")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-023" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("EB01-027 Mr.1(Daz.Bonez)", () => {
  covers("EB01-027", "[On Play]");

  it("draws 2 and then trashes 1, so the spent card may be one just drawn", () => {
    const game = table("eb01-027-filter")
      .withHand("p1", [instance("daz", "EB01-027")])
      .withDeckTop("p1", [
        instance("drawn-a", "FIX-001"),
        instance("drawn-b", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-027" });
    // Both drawn cards are in hand by the time the trash asks, which is the
    // whole point of the order.
    expect(effectOptions(game.state)).toContain("drawn-a");
    game.play({ type: "resolve-effect", optionId: "drawn-a" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(trashNumbers(game, "p1")).toContain("FIX-001");
  });
});

describe("EB01-031 Kalifa", () => {
  covers("EB01-031", "[On Play]");

  it("pays the DON!! and adds nothing behind a Leader without the type", () => {
    // No {Water Seven} Leader is printed in the pool, so the gate can only be
    // driven shut from here. What the test pins is the half that is not
    // conditional: the DON!! −1 is paid before the condition is read.
    const game = table("eb01-031-gate-shut")
      .withHand("p1", [instance("kalifa", "EB01-031")])
      .withTrash("p1", [instance("target", "FIX-002")])
      .build();

    const donBefore = fieldDon(game, "p1");
    game.play({ type: "play-card", cardNumber: "EB01-031" });
    applyOptional(game);
    settle(game);

    expect(fieldDon(game, "p1")).toBe(donBefore - 1);
    expect(handNumbers(game, "p1")).not.toContain("FIX-002");
  });
});

describe("EB01-033 Blueno", () => {
  covers("EB01-033", "[On Play]");

  it("pays the DON!! and plays nothing behind a Leader without the type", () => {
    const game = table("eb01-033-gate-shut")
      .withHand("p1", [
        instance("blueno", "EB01-033"),
        instance("partner", "EB01-049"),
      ])
      .build();

    const donBefore = fieldDon(game, "p1");
    game.play({ type: "play-card", cardNumber: "EB01-033" });
    applyOptional(game);
    settle(game);

    expect(fieldDon(game, "p1")).toBe(donBefore - 1);
    expect(boardNumbers(game, "p1")).not.toContain("EB01-049");
  });
});

describe("EB01-035 Ms. Monday", () => {
  covers("EB01-035", "[On Play]", "[Trigger]");

  it("buffs a card by 1000 behind a Baroque Works Leader", () => {
    const game = table("eb01-035-buff")
      .withLeader("p1", "OP14-079")
      .withHand("p1", [instance("monday", "EB01-035")])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "play-card", cardNumber: "EB01-035" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 1_000);
  });

  it("buffs nothing behind another Leader", () => {
    const game = table("eb01-035-wrong-leader")
      .withHand("p1", [instance("monday", "EB01-035")])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "play-card", cardNumber: "EB01-035" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before);
  });

  it("plays itself off a Life card for DON!! −1", () => {
    const game = table("eb01-035-trigger")
      .withLife("p2", [instance("life-monday", "EB01-035")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("EB01-035");
  });
});

describe("EB01-043 Spandine", () => {
  covers("EB01-043", "[On Play]");

  it("buries 3 CP cards to bring a CP body back rested", () => {
    const game = table("eb01-043-recur")
      .withHand("p1", [instance("spandine", "EB01-043")])
      .withTrash("p1", [
        instance("cp-a", "OP05-093"),
        instance("cp-b", "OP07-080"),
        instance("cp-c", "OP07-086"),
        instance("cp-target", "OP07-086"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-043" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cp-a" });
    game.play({ type: "resolve-effect", optionId: "cp-b" });
    game.play({ type: "resolve-effect", optionId: "cp-c" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("OP07-086");
    expect(
      game.state.players.p1.board.find(
        (card) => card.instanceId === "cp-target",
      )?.rested,
    ).toBe(true);
  });

  it("cannot part-pay from a trash holding only two CP cards", () => {
    const game = table("eb01-043-short")
      .withHand("p1", [instance("spandine", "EB01-043")])
      .withTrash("p1", [
        instance("cp-a", "OP05-093"),
        instance("cp-b", "OP07-080"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-043" });
    applyOptional(game);
    settle(game);

    expect(trashNumbers(game, "p1")).toContain("OP05-093");
    expect(boardNumbers(game, "p1")).toEqual(["EB01-043"]);
  });
});

describe("EB01-046 Brook", () => {
  covers("EB01-046", "[On Play]", "[When Attacking]");

  it("shrinks a 1-drop to 0 cost and then K.O.s it with the same clause", () => {
    // The order is the card: the cost debuff runs first, so the body it just
    // knocked to 0 is a legal target for the K.O. behind it. Nothing in the
    // pool is printed at cost 0, which makes this the only way the second half
    // ever fires.
    const game = table("eb01-046-combo")
      .withHand("p1", [instance("brook", "EB01-046")])
      .withBoard("p2", [character("cheap", "EB02-017")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-046" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    const shrunk = boardCard(game, "p2", "cheap")!;
    expect(effectiveCost(game.state, "p2", shrunk)).toBe(0);
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settle(game);

    expect(boardCard(game, "p2", "cheap")).toBeUndefined();
  });

  it("runs the same clause again when it attacks", () => {
    const game = table("eb01-046-attacking")
      .withBoard("p1", [character("brook", "EB01-046")])
      .withBoard("p2", [character("cheap", "EB02-017")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "brook",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settle(game);

    expect(boardCard(game, "p2", "cheap")).toBeUndefined();
  });
});

describe("EB01-045 Brook", () => {
  covers("EB01-045", "[On Play]");

  it("gains [Rush] only while the opponent has a cost-0 Character", () => {
    // The same interaction EB01-046 sets up: a 1-drop knocked to 0 is what
    // turns this clause on, because the pool prints nothing at cost 0.
    const game = table("eb01-045-rush")
      .withHand("p1", [
        instance("setup", "EB01-046"),
        instance("brook", "EB01-045"),
      ])
      .withBoard("p2", [character("cheap", "EB02-017")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-046" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    // Decline the K.O., so the 0-cost body is still there for the next play.
    // An "up to 1" choose declines with `done`, not with the `skip` an
    // `optional` prompt takes.
    game.play({ type: "resolve-effect", optionId: "done" });
    settle(game);

    game.play({ type: "play-card", cardNumber: "EB01-045" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "brook",
        ),
    ).toBe(true);
  });

  it("cannot attack the turn it lands against an ordinary board", () => {
    const game = table("eb01-045-no-rush")
      .withHand("p1", [instance("brook", "EB01-045")])
      .withBoard("p2", [character("ordinary", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-045" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "brook",
        ),
    ).toBe(false);
  });
});

describe("EB01-049 T-Bone", () => {
  covers("EB01-049", "[On Play]");

  it("K.O.s a 2-cost Character", () => {
    const game = table("eb01-049-ko")
      .withHand("p1", [instance("tbone", "EB01-049")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-049" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });
});

describe("EB01-052 Viola", () => {
  covers("EB01-052", "[On Play]");

  it("turns the controller's face-up Life cards back down", () => {
    const game = table("eb01-052-hide")
      .withHand("p1", [instance("viola", "EB01-052")])
      .withLife("p1", [
        instance("shown", "FIX-001", { faceUp: true }),
        instance("hidden", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-052" });
    game.play({ type: "resolve-effect", optionId: "hide" });
    settle(game);

    expect(game.state.players.p1.life.every((card) => !card.faceUp)).toBe(true);
  });

  it("offers looking at the opponent's Life as the other branch", () => {
    const game = table("eb01-052-look")
      .withHand("p1", [instance("viola", "EB01-052")])
      .withLife("p2", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-052" });

    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["look", "hide"]),
    );
    game.play({ type: "resolve-effect", optionId: "look" });
    settle(game);

    // The Life area is unchanged in size: the branch reorders, it does not take.
    expect(game.state.players.p2.life).toHaveLength(3);
  });
});

describe("EB01-053 Gastino", () => {
  covers("EB01-053", "[On Play]", "[Trigger]");

  it("buries a 3-cost Character face-up in the opponent's Life", () => {
    const game = table("eb01-053-life")
      .withHand("p1", [instance("gastino", "EB01-053")])
      .withBoard("p2", [character("victim", "ST26-002")])
      .withLife("p2", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-053" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    game.play({ type: "resolve-effect", optionId: "top" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
    expect(game.state.players.p2.life).toHaveLength(3);
    expect(game.state.players.p2.life[0]?.faceUp).toBe(true);
  });

  it("splits −3000 across two of the opponent's cards off a Life card", () => {
    const game = table("eb01-053-trigger")
      .withBoard("p1", [character("victim-a", "FIX-002")])
      .withLife("p2", [instance("life-gastino", "EB01-053")])
      .build();

    // p2 is the Life owner, so the Trigger debuffs p1's cards.
    const before = currentPower(game.state, "p1", "victim-a");
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim-a" });
    settle(game);

    expect(currentPower(game.state, "p1", "victim-a")).toBe(before - 3_000);
  });
});

describe("EB01-054 Gan.Fall", () => {
  covers("EB01-054", "[On Play]");

  it("K.O.s a 3-cost body once the opponent is down to 1 Life", () => {
    const game = table("eb01-054-low")
      .withHand("p1", [instance("ganfall", "EB01-054")])
      .withBoard("p2", [character("victim", "ST26-002")])
      .withLife("p2", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-054" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("does nothing while the opponent is still on 2 Life", () => {
    const game = table("eb01-054-high")
      .withHand("p1", [instance("ganfall", "EB01-054")])
      .withBoard("p2", [character("victim", "ST26-002")])
      .withLife("p2", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-054" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });
});

describe("EB01-056 Charlotte Flampe", () => {
  covers("EB01-056", "[On Play]");

  it("takes a Life card into hand to draw one", () => {
    const game = table("eb01-056-life")
      .withHand("p1", [instance("flampe", "EB01-056")])
      .withLife("p1", [
        instance("edge-top", "FIX-001"),
        instance("edge-bottom", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-056" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "edge-top" });
    settle(game);

    // The Life card is kept and a card drawn on top of it: net +2 cards for
    // one Life.
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(2);
  });
});

describe("EB01-061 Mr.2.Bon.Kurei(Bentham)", () => {
  covers("EB01-061", "[On Play]", "[When Attacking]");

  it("adds an active DON!! when it lands", () => {
    const game = table("eb01-061-ramp")
      .withHand("p1", [instance("bentham", "EB01-061")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-061" });
    settle(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("copies what the opposing Character is worth on this turn, not its dormant DON!!", () => {
    const game = table("eb01-061-copy")
      .withBoard("p1", [character("bentham", "EB01-061")])
      .withBoard("p2", [character("big", "FIX-002")])
      .withGivenDon("p2", "big", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "bentham",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "big" });
    settle(game);

    // The two DON!! cards stay under p2's Character until p2's next Refresh,
    // but grant their +1000 during p2's turn only (CR 6-5-5-2) and this clause
    // resolves on p1's. 4000 is what that body blocks and battles at, so 4000
    // is what "becomes the same as" copies -- `currentPower`'s
    // `includeAttachedDon` default reads 6000 here and answers no question the
    // game asks.
    expect(currentPower(game.state, "p2", "big", false)).toBe(4_000);
    expect(currentPower(game.state, "p1", "bentham")).toBe(4_000);
  });
});

describe("EB01-001 Kouzuki Oden (Leader)", () => {
  covers("EB01-001", "[When Attacking]", "static");

  it("gains +1000 behind a 5-cost {Land of Wano} Character", () => {
    const game = table("eb01-001-buff")
      .withLeader("p1", "EB01-001")
      .withBoard("p1", [character("wano", "OP06-107")])
      .withGivenDon("p1", "p1-leader", 1)
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 1_000);
  });

  it("gains nothing with no 5-cost {Land of Wano} body out", () => {
    const game = table("eb01-001-no-body")
      .withLeader("p1", "EB01-001")
      .withGivenDon("p1", "p1-leader", 1)
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before);
  });

  it("holds the buff through the opponent's turn", () => {
    // "until the start of your next turn" has to survive the opponent's whole
    // turn -- the defensive half of the clause, and what separates it from a
    // "during this turn" buff. Read against a control rather than against a
    // constant: the DON!! that paid for the clause also moves the Leader's
    // power, and on a different clock.
    const swing = (seed: string, withBody: boolean) => {
      const game = table(seed)
        .withLeader("p1", "EB01-001")
        .withBoard("p1", withBody ? [character("wano", "OP06-107")] : [])
        .withGivenDon("p1", "p1-leader", 1)
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "p1-leader",
        targetInstanceId: "p2-leader",
      });
      declineDefence(game);
      settle(game);
      game.pass();
      return currentPower(game.state, "p1", "p1-leader");
    };

    expect(swing("eb01-001-holds", true)).toBe(
      swing("eb01-001-holds-control", false) + 1_000,
    );
  });
});

describe("EB01-007 Yamato", () => {
  covers("EB01-007", "[Activate: Main]");

  it("hands a rested DON!! to a Character", () => {
    const game = table("eb01-007-give")
      .withBoard("p1", [
        character("yamato", "EB01-007"),
        character("target", "FIX-002"),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-007" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "target")?.attachedDon).toHaveLength(1);
  });

  it("is not offered with no rested DON!! to give", () => {
    const game = table("eb01-007-nothing-rested")
      .withBoard("p1", [character("yamato", "EB01-007")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB01-007",
        ),
    ).toBe(false);
  });

  it("only fires once in a turn", () => {
    const game = table("eb01-007-once")
      .withBoard("p1", [
        character("yamato", "EB01-007"),
        character("target", "FIX-002"),
      ])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-007" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB01-007",
        ),
    ).toBe(false);
  });
});

describe("EB01-011 Mini-Merry (Stage)", () => {
  covers("EB01-011", "[Activate: Main]");

  it("rests itself and buries a 1000-power body to draw", () => {
    const game = table("eb01-011-draw")
      .withStage("p1", { instanceId: "merry", cardNumber: "EB01-011" })
      .withBoard("p1", [character("small", "OP10-065")])
      .withHand("p1", [])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-011" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(boardCard(game, "p1", "small")).toBeUndefined();
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("reaches only a body printed at exactly 1000 power", () => {
    const game = table("eb01-011-wrong-power")
      .withStage("p1", { instanceId: "merry", cardNumber: "EB01-011" })
      .withBoard("p1", [character("big", "FIX-002")])
      .withHand("p1", [])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-011" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "big")).toBeDefined();
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("EB01-013 Kouzuki Hiyori", () => {
  covers("EB01-013", "[Activate: Main]");

  it("trashes itself for a {Land of Wano} body and a card", () => {
    const game = table("eb01-013-convert")
      .withBoard("p1", [character("hiyori", "EB01-013")])
      .withHand("p1", [instance("wano", "OP06-107")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-013" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "wano" });
    settle(game);

    expect(trashNumbers(game, "p1")).toContain("EB01-013");
    expect(boardNumbers(game, "p1")).toContain("OP06-107");
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("still draws when the hand holds nothing to play", () => {
    const game = table("eb01-013-draw-only")
      .withBoard("p1", [character("hiyori", "EB01-013")])
      .withHand("p1", [])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-013" });
    applyOptional(game);
    settle(game);

    expect(trashNumbers(game, "p1")).toContain("EB01-013");
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("EB01-016 Bingoh", () => {
  covers("EB01-016", "[Activate: Main]");

  it("rests itself to K.O. a rested 1-drop", () => {
    const game = table("eb01-016-ko")
      .withBoard("p1", [character("bingoh", "EB01-016")])
      .withBoard("p2", [character("victim", "EB02-017", { rested: true })])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-016" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "bingoh")?.rested).toBe(true);
    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("does not reach an active 1-drop", () => {
    const game = table("eb01-016-active")
      .withBoard("p1", [character("bingoh", "EB01-016")])
      .withBoard("p2", [character("victim", "EB02-017")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-016" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeDefined();
  });
});

describe("EB01-030 Loguetown (Stage)", () => {
  covers("EB01-030", "[Activate: Main]", "[Trigger]");

  it("buries itself and a hand card to draw 2", () => {
    const game = table("eb01-030-draw")
      .withStage("p1", { instanceId: "loguetown", cardNumber: "EB01-030" })
      .withHand("p1", [instance("cost", "FIX-001")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-030" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    settle(game);

    expect(game.state.players.p1.stage).toBeFalsy();
    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("is not offered on an empty hand", () => {
    const game = table("eb01-030-no-hand")
      .withStage("p1", { instanceId: "loguetown", cardNumber: "EB01-030" })
      .withHand("p1", [])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB01-030",
        ),
    ).toBe(false);
  });

  it("plays itself off a Life card", () => {
    const game = table("eb01-030-trigger")
      .withLife("p2", [instance("life-stage", "EB01-030")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.stage?.cardNumber).toBe("EB01-030");
  });
});

describe("EB01-040 Kyros (Leader)", () => {
  covers("EB01-040", "[Activate: Main]");

  it("turns a Life card face-up to K.O. a cost-0 Character", () => {
    // Nothing in the pool is printed at cost 0, so the target has to be made:
    // EB01-046 Brook's cost debuff is what puts a body in range.
    const game = table("eb01-040-ko")
      .withLeader("p1", "EB01-040")
      .withHand("p1", [instance("setup", "EB01-046")])
      .withBoard("p2", [character("cheap", "EB02-017")])
      .withLife("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "EB01-046" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    game.play({ type: "resolve-effect", optionId: "done" });
    settle(game);

    game.play({ type: "activate-main", cardNumber: "EB01-040" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p2", "cheap")).toBeUndefined();
    expect(game.state.players.p1.life.some((card) => card.faceUp)).toBe(true);
    // The Life card is turned over, not spent.
    expect(game.state.players.p1.life).toHaveLength(3);
  });

  it("is not offered on 0 Life", () => {
    const game = table("eb01-040-no-life")
      .withLeader("p1", "EB01-040")
      .withLife("p1", 0)
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB01-040",
        ),
    ).toBe(false);
  });
});

describe("EB01-042 Scarlet", () => {
  covers("EB01-042", "[Activate: Main]");

  it("trashes itself for a rested {Dressrosa} body and a cost debuff", () => {
    const game = table("eb01-042-convert")
      .withBoard("p1", [character("scarlet", "EB01-042")])
      .withHand("p1", [instance("dressrosa", "ST36-001")])
      .withBoard("p2", [character("victim", "ST26-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-042" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "dressrosa" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(trashNumbers(game, "p1")).toContain("EB01-042");
    expect(boardNumbers(game, "p1")).toContain("ST36-001");
    expect(
      game.state.players.p1.board.find((card) => card.cardNumber === "ST36-001")
        ?.rested,
    ).toBe(true);
    const victim = boardCard(game, "p2", "victim")!;
    expect(effectiveCost(game.state, "p2", victim)).toBe(1);
  });
});

describe("EB01-044 Funkfreed", () => {
  covers("EB01-044", "[Activate: Main]");

  it("rests itself to give a [Spandam] +3000", () => {
    const game = table("eb01-044-buff")
      .withBoard("p1", [
        character("funkfreed", "EB01-044"),
        character("spandam", "OP07-086"),
      ])
      .build();

    const before = currentPower(game.state, "p1", "spandam");
    game.play({ type: "activate-main", cardNumber: "EB01-044" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "spandam" });
    settle(game);

    expect(boardCard(game, "p1", "funkfreed")?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "spandam")).toBe(before + 3_000);
  });

  it("finds nothing to buff on a board with no [Spandam]", () => {
    const game = table("eb01-044-no-spandam")
      .withBoard("p1", [
        character("funkfreed", "EB01-044"),
        character("other", "FIX-002"),
      ])
      .build();

    const before = currentPower(game.state, "p1", "other");
    game.play({ type: "activate-main", cardNumber: "EB01-044" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "other")).toBe(before);
  });
});

describe("EB01-009 Just Shut Up and Come with Us!!!!", () => {
  covers("EB01-009", "[Counter]");

  it("digs five deep and puts an {Animal} body down mid-battle", () => {
    const game = defending("eb01-009-counter")
      .withHand("p1", [instance("event", "EB01-009")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withDeckTop("p1", [
        instance("animal", "ST26-002"),
        instance("filler-a", "FIX-001"),
        instance("filler-b", "FIX-001"),
        instance("filler-c", "FIX-001"),
        instance("filler-d", "FIX-001"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-009" });
    game.play({ type: "resolve-effect", optionId: "animal" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("ST26-002");
  });
});

describe("EB01-010 There's No Way You Could Defeat Me!!", () => {
  covers("EB01-010", "[Counter]", "[Trigger]");

  it("K.O.s a 6000-power body from the Counter step", () => {
    const game = defending("eb01-010-counter")
      .withHand("p1", [instance("event", "EB01-010")])
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("victim", "OP05-093"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-010" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("reads base power, so a pumped body is still in range", () => {
    const game = defending("eb01-010-base")
      .withHand("p1", [instance("event", "EB01-010")])
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("victim", "OP05-093"),
      ])
      .withGivenDon("p2", "victim", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-010" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("reaches a band lower off a Life card", () => {
    // The Trigger stops at 5000 where the Counter reaches 6000, which is the
    // usual split: the half paid for with a card from hand is the stronger one.
    const game = table("eb01-010-trigger")
      .withBoard("p1", [character("safe", "OP05-093")])
      .withLife("p2", [instance("life-event", "EB01-010")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    // A 6000 body is over the Trigger's 5000 ceiling, so the clause resolves
    // to nothing and it survives -- where the same card's [Counter] reaches it.
    expect(boardCard(game, "p1", "safe")).toBeDefined();
  });
});

describe("EB01-019 Off-White", () => {
  covers("EB01-019", "[Counter]");

  it("adds 4000 to the battle and digs for a Donquixote body", () => {
    const game = defending("eb01-019-counter")
      .withHand("p1", [instance("event", "EB01-019")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withDeckTop("p1", [
        instance("doffy", "OP10-067"),
        instance("filler-a", "FIX-001"),
        instance("filler-b", "FIX-001"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-019" });

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    game.play({ type: "resolve-effect", optionId: "doffy" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("OP10-067");
  });
});

describe("EB01-028 Gum-Gum Champion Rifle", () => {
  covers("EB01-028", "[Counter]", "[Trigger]");

  it("adds 2000 and bounces an active Character behind an {Impel Down} Leader", () => {
    const game = defending("eb01-028-counter")
      .withLeader("p1", "OP16-022")
      .withHand("p1", [instance("event", "EB01-028")])
      .withBoard("p2", [
        character("attacker", "FIX-002"),
        character("bystander", "FIX-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-028" });

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    settle(game);

    // The attacker is rested, so the only active Character is the bystander.
    expect(boardCard(game, "p2", "bystander")).toBeUndefined();
  });

  it("adds nothing behind another Leader", () => {
    const game = defending("eb01-028-wrong-leader")
      .withHand("p1", [instance("event", "EB01-028")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-028" });

    expect(game.state.activeAttack?.counterPower).toBe(0);
  });

  it("bottoms a 3-cost Character off a Life card", () => {
    const game = table("eb01-028-trigger")
      .withBoard("p1", [character("victim", "ST26-002")])
      .withLife("p2", [instance("life-event", "EB01-028")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
    expect(game.state.players.p1.deck.at(-1)?.cardNumber).toBe("ST26-002");
  });
});

describe("EB01-029 Sorry. I'm a Goner.", () => {
  covers("EB01-029", "[Counter]", "[Trigger]");

  it("saves a Character when the revealed card costs 4 or more", () => {
    const game = defending("eb01-029-hit")
      .withHand("p1", [instance("event", "EB01-029")])
      .withBoard("p1", [character("saved", "FIX-002")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withDeckTop("p1", [instance("expensive", "ST31-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-029" });
    game.play({ type: "resolve-effect", optionId: "saved" });
    settle(game);

    expect(boardCard(game, "p1", "saved")).toBeUndefined();
    expect(handNumbers(game, "p1")).toContain("FIX-002");
  });

  it("does nothing when the revealed card is cheap", () => {
    const game = defending("eb01-029-miss")
      .withHand("p1", [instance("event", "EB01-029")])
      .withBoard("p1", [character("stuck", "FIX-002")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withDeckTop("p1", [instance("cheap", "FIX-001")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-029" });
    settle(game);

    expect(boardCard(game, "p1", "stuck")).toBeDefined();
  });

  it("returns an 8-cost Character to hand off a Life card", () => {
    const game = table("eb01-029-trigger")
      .withBoard("p1", [character("victim", "FIX-002")])
      .withLife("p2", [instance("life-event", "EB01-029")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
    expect(handNumbers(game, "p1")).toContain("FIX-002");
  });
});

describe("EB01-038 Oh Come My Way", () => {
  covers("EB01-038", "[Counter]", "[Trigger]");

  it("points the attack at a Character behind a Baroque Works Leader", () => {
    const game = defending("eb01-038-redirect")
      .withLeader("p1", "OP14-079")
      .withHand("p1", [instance("event", "EB01-038")])
      .withBoard("p1", [character("shield", "FIX-002")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-038" });
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
    game.play({ type: "resolve-effect", optionId: "shield" });
    settle(game);

    expect(game.state.activeAttack?.targetInstanceId).toBe("shield");
  });

  it("draws 2 for DON!! −1 off a Life card", () => {
    const game = table("eb01-038-trigger")
      .withLife("p2", [instance("life-event", "EB01-038")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p2.hand.length).toBe(handBefore + 2);
  });
});

describe("EB01-050 ...I Want to Live!!", () => {
  covers("EB01-050", "[Counter]");

  it("puts a card back on top of Life once the trash is 30 deep", () => {
    const game = defending("eb01-050-live")
      .withHand("p1", [instance("event", "EB01-050")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withTrash(
        "p1",
        Array.from({ length: 30 }, (_unused, index) =>
          instance(`fill-${index}`, "FIX-001"),
        ),
      )
      .withLife("p1", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-050" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("does nothing on a shallower trash", () => {
    const game = defending("eb01-050-shallow")
      .withHand("p1", [instance("event", "EB01-050")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withTrash("p1", [instance("one", "FIX-001")])
      .withLife("p1", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "EB01-050" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(1);
  });
});

describe("EB01-020 Chambres", () => {
  covers("EB01-020", "[Main]", "[Trigger]");

  it("bounces a Character to play a cheaper one of a different colour", () => {
    const game = table("eb01-020-swap")
      .withLeader("p1", "OP10-099")
      .withHand("p1", [
        instance("event", "EB01-020"),
        // ST36-004 Bartolomeo is a 1-cost Black Character; the bounced body is
        // Red, so the colour filter admits it.
        instance("replacement", "ST36-004"),
      ])
      .withBoard("p1", [character("bounced", "ST31-003")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-020" });
    game.play({ type: "resolve-effect", optionId: "bounced" });
    game.play({ type: "resolve-effect", optionId: "replacement" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("ST31-003");
    expect(boardNumbers(game, "p1")).toContain("ST36-004");
  });

  it("refuses a replacement that shares the bounced card's colour", () => {
    const game = table("eb01-020-same-colour")
      .withLeader("p1", "OP10-099")
      .withHand("p1", [
        instance("event", "EB01-020"),
        // ST31-003 Brook is Red, the same colour as the body being returned.
        instance("same", "ST31-003"),
      ])
      .withBoard("p1", [character("bounced", "ST31-003")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-020" });
    game.play({ type: "resolve-effect", optionId: "bounced" });
    settle(game);

    expect(boardNumbers(game, "p1")).not.toContain("ST31-003");
  });

  it("is not offered at all behind a Leader without the type", () => {
    // The whole program is one `if`, so the offer is withheld rather than
    // made and resolved to nothing -- otherwise a rules agent spends the card
    // on an empty effect.
    const game = table("eb01-020-wrong-leader")
      .withHand("p1", [instance("event", "EB01-020")])
      .withBoard("p1", [character("safe", "ST31-003")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB01-020",
        ),
    ).toBe(false);
  });
});

describe("EB01-039 Conquerer of Three Worlds Ragnaraku", () => {
  covers("EB01-039", "[Main]", "[Trigger]");

  it("pays DON!! −1 to K.O. an 8-cost Character", () => {
    const game = table("eb01-039-ko")
      .withHand("p1", [instance("event", "EB01-039")])
      .withBoard("p2", [character("victim", "EB04-038")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-039" });
    applyOptional(game);
    // `DON!! −N` asks which pile pays before the effect it bought runs.
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("adds an active DON!! off a Life card", () => {
    const game = table("eb01-039-trigger")
      .withLife("p2", [instance("life-event", "EB01-039")])
      .withDonDeck("p2", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.donDeck).toHaveLength(1);
  });
});

describe("EB01-051 Finger Pistol", () => {
  covers("EB01-051", "[Main]", "[Trigger]");

  it("mills 2 to K.O. a 5-cost Character", () => {
    const game = table("eb01-051-ko")
      .withHand("p1", [instance("event", "EB01-051")])
      .withBoard("p2", [character("victim", "OP10-067")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "activate-main", cardNumber: "EB01-051" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
    // Two milled plus the Event itself.
    expect(game.state.players.p1.trash.length).toBe(trashBefore + 3);
  });

  it("runs the same [Main] off a Life card", () => {
    const game = table("eb01-051-trigger")
      .withBoard("p1", [character("victim", "OP10-067")])
      .withLife("p2", [instance("life-event", "EB01-051")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("EB01-059 Kingdom Come", () => {
  covers("EB01-059", "[Main]", "[Trigger]");

  it("K.O.s any Character and burns its own Life down to one", () => {
    const game = table("eb01-059-burn")
      .withHand("p1", [instance("event", "EB01-059")])
      .withBoard("p2", [character("huge", "EB04-038")])
      .withLife("p1", 4)
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-059" });
    game.play({ type: "resolve-effect", optionId: "huge" });
    settle(game);

    expect(boardCard(game, "p2", "huge")).toBeUndefined();
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("burns the Life even with nothing to K.O.", () => {
    const game = table("eb01-059-no-target")
      .withHand("p1", [instance("event", "EB01-059")])
      .withLife("p1", 3)
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-059" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("leaves a player already on 1 Life alone", () => {
    const game = table("eb01-059-floor")
      .withHand("p1", [instance("event", "EB01-059")])
      .withLife("p1", 1)
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-059" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("reads both seats' Life as the ceiling off a Life card", () => {
    // The ceiling moves the wrong way for the player holding it: the Trigger
    // fires as Life is being lost, so the board it can answer shrinks.
    const game = table("eb01-059-trigger")
      .withBoard("p1", [character("victim", "ST26-002")])
      .withLife("p1", 3)
      .withLife("p2", [instance("life-event", "EB01-059")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "victim")).toBeUndefined();
  });
});

describe("EB01-060 Did Someone Say...Kami?", () => {
  covers("EB01-060", "[Main]", "[Trigger]");

  it("plays an [Enel] and burns its own Life down to one", () => {
    const game = table("eb01-060-enel")
      .withHand("p1", [
        instance("event", "EB01-060"),
        instance("enel", "OP15-118"),
      ])
      .withLife("p1", 4)
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-060" });
    game.play({ type: "resolve-effect", optionId: "enel" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("OP15-118");
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("draws 2 and trashes 1 off a Life card", () => {
    const game = table("eb01-060-trigger")
      .withLife("p2", [instance("life-event", "EB01-060")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.hand.length).toBe(handBefore + 1);
  });
});

describe("EB01-021 Hannyabal (Leader)", () => {
  covers("EB01-021", "[End of Your Turn]");

  it("returns an {Impel Down} body for an active DON!!", () => {
    const game = table("eb01-021-ramp")
      .withLeader("p1", "EB01-021")
      .withBoard("p1", [character("jailer", "ST30-014")])
      .withDonDeck("p1", 2)
      .build();

    game.pass();
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "jailer" });
    settle(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(boardCard(game, "p1", "jailer")).toBeUndefined();
  });

  it("does not reach a 1-cost {Impel Down} body", () => {
    const game = table("eb01-021-too-cheap")
      .withLeader("p1", "EB01-021")
      .withBoard("p1", [character("cheap", "OP10-065")])
      .withDonDeck("p1", 2)
      .build();

    game.pass();
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });
});

describe("EB01-022 Inazuma", () => {
  covers("EB01-022", "[End of Your Turn]");

  it("draws 2 on an empty hand", () => {
    const game = table("eb01-022-refill")
      .withBoard("p1", [character("inazuma", "EB01-022")])
      .withHand("p1", [])
      .build();

    game.pass();
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("draws nothing on a full hand", () => {
    const game = table("eb01-022-full")
      .withBoard("p1", [character("inazuma", "EB01-022")])
      .withHand("p1", [
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
        instance("c", "FIX-001"),
      ])
      .build();

    game.pass();
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(3);
  });
});

describe("EB01-036 Minochihuahua", () => {
  covers("EB01-036", "[On K.O.]");

  it("adds a rested DON!! when it dies behind an {Impel Down} Leader", () => {
    const game = defending("eb01-036-death")
      .withLeader("p1", "OP16-022")
      .withBoard("p1", [character("mino", "EB01-036")])
      .withHand("p2", [instance("removal", "EB01-051")])
      .withDonDeck("p1", 2)
      .build();

    // Driven from across the table: the Event's K.O. names the opponent's
    // board, so p2 is the seat that can point it at this Character.
    game.play({ type: "activate-main", cardNumber: "EB01-051" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "mino" });
    settle(game);

    expect(boardCard(game, "p1", "mino")).toBeUndefined();
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.restedDon.length).toBeGreaterThan(0);
  });
});

describe("EB01-008 LittleOars Jr.", () => {
  covers("EB01-008", "static");

  it("trashes an Event from hand instead of being K.O.'d", () => {
    const game = table("eb01-008-save")
      .withBoard("p2", [character("oars", "EB01-008")])
      .withHand("p2", [instance("shield", "EB01-010")])
      .withHand("p1", [instance("removal", "EB01-059")])
      .withLife("p1", 2)
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-059" });
    game.play({ type: "resolve-effect", optionId: "oars" });
    game.play({
      type: "resolve-effect",
      optionId: "replace:oars",
    });
    settle(game);

    expect(boardCard(game, "p2", "oars")).toBeDefined();
    expect(trashNumbers(game, "p2")).toContain("EB01-010");
  });

  it("cannot pay with a Character in hand", () => {
    const game = table("eb01-008-wrong-cost")
      .withBoard("p2", [character("oars", "EB01-008")])
      .withHand("p2", [instance("body", "FIX-002")])
      .withHand("p1", [instance("removal", "EB01-059")])
      .withLife("p1", 2)
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-059" });
    game.play({ type: "resolve-effect", optionId: "oars" });
    settle(game);

    expect(boardCard(game, "p2", "oars")).toBeUndefined();
  });
});

describe("EB01-014 Sanji", () => {
  covers("EB01-014", "[Your Turn]");

  it("gains 1000 for every 3 rested DON!! once it carries a DON!!", () => {
    const game = table("eb01-014-rested")
      .withBoard("p1", [character("sanji", "EB01-014")])
      .withGivenDon("p1", "sanji", 1)
      .withDon("p1", { rested: 6 })
      .build();

    // Printed 5000, +1000 for the DON!! given, +2000 for six rested.
    expect(currentPower(game.state, "p1", "sanji")).toBe(8_000);
  });

  it("pays nothing for the first two rested DON!!", () => {
    const game = table("eb01-014-floor")
      .withBoard("p1", [character("sanji", "EB01-014")])
      .withGivenDon("p1", "sanji", 1)
      .withDon("p1", { rested: 2 })
      .build();

    expect(currentPower(game.state, "p1", "sanji")).toBe(6_000);
  });

  it("gains nothing without a DON!! of its own", () => {
    const game = table("eb01-014-unpaid")
      .withBoard("p1", [character("sanji", "EB01-014")])
      .withDon("p1", { rested: 6 })
      .build();

    expect(currentPower(game.state, "p1", "sanji")).toBe(5_000);
  });
});

describe("EB01-058 Mont Blanc Cricket", () => {
  covers("EB01-058", "[Your Turn]");

  it("gains 2000 while its own side is down to 2 Life", () => {
    const game = table("eb01-058-behind")
      .withBoard("p1", [character("cricket", "EB01-058")])
      .withGivenDon("p1", "cricket", 1)
      .withLife("p1", 2)
      .build();

    expect(currentPower(game.state, "p1", "cricket")).toBe(6_000);
  });

  it("gains nothing while still on 3 Life", () => {
    const game = table("eb01-058-ahead")
      .withBoard("p1", [character("cricket", "EB01-058")])
      .withGivenDon("p1", "cricket", 1)
      .withLife("p1", 3)
      .build();

    expect(currentPower(game.state, "p1", "cricket")).toBe(4_000);
  });
});

describe("EB01-047 Laboon", () => {
  covers("EB01-047", "static");

  it("draws and trashes when any Character is K.O.'d", () => {
    const game = table("eb01-047-watch")
      .withBoard("p1", [character("laboon", "EB01-047")])
      .withBoard("p2", [character("victim", "OP10-067")])
      .withHand("p1", [instance("removal", "EB01-051")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-051" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    // Drew 1 and trashed 1, so the hand is level -- the Event that started it
    // has left, and the net is the card quality rather than the count.
    expect(boardCard(game, "p2", "victim")).toBeUndefined();
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("only fires once in a turn", () => {
    const game = table("eb01-047-once")
      .withBoard("p1", [character("laboon", "EB01-047")])
      .withBoard("p2", [
        character("first", "OP10-067"),
        // Rested, so p1's Leader can attack it, and small enough to lose.
        character("second", "FIX-002", { rested: true }),
      ])
      .withHand("p1", [instance("removal", "EB01-051")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB01-051" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "first" });
    settle(game);
    const afterFirst = game.state.players.p1.hand.length;

    // A second Character dies in the same turn, in battle this time.
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "second",
    });
    declineDefence(game);
    settle(game);

    expect(boardCard(game, "p2", "second")).toBeUndefined();
    expect(game.state.players.p1.hand).toHaveLength(afterFirst);
  });
});

describe("PRB02-006 Roronoa Zoro", () => {
  covers("PRB02-006", "[Opponent's Turn]", "[Blocker]");

  it("rests another Character instead when an opposing Character rests it", () => {
    // EB03-061 Uta rests "your opponent's DON!! cards or Characters with a
    // cost of 4 or less" from its own `[Activate: Main]`, which is an opposing
    // *Character's* effect on the opponent's turn -- exactly the two halves
    // the printed sentence names.
    const game = defending("prb02-006-instead")
      .withBoard("p1", [
        character("zoro", "PRB02-006"),
        character("other", "FIX-002"),
      ])
      .withBoard("p2", [character("uta", "EB03-061")])
      .withDon("p2", { rested: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-061" });
    game.play({ type: "resolve-effect", optionId: "zoro" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "other" });
    settle(game);

    expect(boardCard(game, "p1", "zoro")?.rested).toBe(false);
    expect(boardCard(game, "p1", "other")?.rested).toBe(true);
  });

  it("stays rested when its controller declines the swap", () => {
    // The clause is a "you may", so declining is a real branch: the rest that
    // was replaced stands, and no other Character is spent for it.
    const game = defending("prb02-006-decline")
      .withBoard("p1", [
        character("zoro", "PRB02-006"),
        character("other", "FIX-002"),
      ])
      .withBoard("p2", [character("uta", "EB03-061")])
      .withDon("p2", { rested: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-061" });
    game.play({ type: "resolve-effect", optionId: "zoro" });
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(boardCard(game, "p1", "zoro")?.rested).toBe(true);
    expect(boardCard(game, "p1", "other")?.rested).toBe(false);
  });
});
