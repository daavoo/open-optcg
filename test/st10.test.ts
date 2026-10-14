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
 * ULTRA DECK -The Three Captains- [ST-10], as a whole-product import.
 *
 * `packages/cards/src/st10.ts` explains where the records come from; this file
 * holds the behaviour. One of the product's 17 identities was already in the
 * pool as a card a community deck plays -- ST10-010 Trafalgar Law -- and its
 * clause is driven from that deck's tests, so what is here is the other
 * sixteen.
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

/**
 * Pay a `DON!! −N` cost from the active pile.
 *
 * The engine asks which pile the DON!! comes out of before it runs the effect
 * the payment buys, so a test that skips the question resolves the wrong step.
 */
const payDonFromActive = (game: Game) => {
  while (effectOptions(game.state).includes("return-don:active")) {
    game.play({ type: "resolve-effect", optionId: "return-don:active" });
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

const fieldDon = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].activeDon.length +
  game.state.players[player].restedDon.length;

describe("ST10-001 Trafalgar Law (Leader)", () => {
  covers("ST10-001", "[Activate: Main]");

  it("buries a small body and replaces it out of hand", () => {
    const game = table("st10-001-swap")
      .withLeader("p1", "ST10-001")
      .withBoard("p2", [character("small", "FIX-001")])
      .withHand("p1", [instance("body", "FIX-002")])
      .build();

    const deckBefore = game.state.players.p2.deck.length;
    game.play({ type: "activate-main", cardNumber: "ST10-001" });
    applyOptional(game);
    payDonFromActive(game);
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settle(game);

    // Bottom of the owner's deck, not the trash: the body is out of reach of
    // every trash-recursion clause in the pool.
    expect(boardCard(game, "p2", "small")).toBeUndefined();
    expect(game.state.players.p2.deck.length).toBe(deckBefore + 1);
    expect(game.state.players.p2.deck.at(-1)?.cardNumber).toBe("FIX-001");
    expect(boardNumbers(game, "p1")).toContain("FIX-002");
  });

  it("is not offered with fewer than three DON!! on the field", () => {
    const game = table("st10-001-unaffordable")
      .withLeader("p1", "ST10-001")
      .withDonDeck("p1", 8)
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST10-001",
        ),
    ).toBe(false);
  });

  it("only fires once in a turn", () => {
    const game = table("st10-001-once")
      .withLeader("p1", "ST10-001")
      .withBoard("p2", [character("small", "FIX-001")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-001" });
    applyOptional(game);
    payDonFromActive(game);
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST10-001",
        ),
    ).toBe(false);
  });
});

describe("ST10-002 Monkey.D.Luffy (Leader)", () => {
  covers("ST10-002", "[Activate: Main]");

  it("ramps an active DON!! once the cost area is deep", () => {
    const game = table("st10-002-late")
      .withLeader("p1", "ST10-002")
      .withDonDeck("p1", 2)
      .build();

    const before = fieldDon(game, "p1");
    game.play({ type: "activate-main", cardNumber: "ST10-002" });
    settle(game);

    expect(fieldDon(game, "p1")).toBe(before + 1);
  });

  it("ramps with an empty cost area too", () => {
    const game = table("st10-002-early")
      .withLeader("p1", "ST10-002")
      .withDonDeck("p1", 10)
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-002" });
    settle(game);

    expect(fieldDon(game, "p1")).toBe(1);
  });

  it("is not offered in the middle of the curve", () => {
    // The gate is the two ends of the DON!! count and not a threshold, so a
    // board sitting on five is outside it -- the clause is printed to reward
    // spending everything or drawing ahead, and neither has happened. The
    // engine withholds an activation whose program cannot change the state, so
    // the `[Once Per Turn]` use is never spent on nothing.
    const game = table("st10-002-middle")
      .withLeader("p1", "ST10-002")
      .withDonDeck("p1", 5)
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST10-002",
        ),
    ).toBe(false);
  });
});

describe('ST10-003 Eustass"Captain"Kid (Leader)', () => {
  covers("ST10-003", "[Your Turn]", "[When Attacking]");

  it("attacks for 1000 less while it still holds four Life", () => {
    const game = table("st10-003-penalty")
      .withLeader("p1", "ST10-003")
      .withLife("p1", 4)
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(4_000);
  });

  it("attacks at its printed power once it is down to three Life", () => {
    const game = table("st10-003-paid-off")
      .withLeader("p1", "ST10-003")
      .withLife("p1", 3)
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
  });

  it("does not carry the penalty into the opponent's turn", () => {
    // The printed marker is `[Your Turn]`, so the Leader defends at its full
    // power however much Life it is holding.
    const game = defending("st10-003-defending")
      .withLeader("p1", "ST10-003")
      .withLife("p1", 4)
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
  });

  it("buys +2000 for the swing with one DON!!", () => {
    const game = table("st10-003-swing")
      .withLeader("p1", "ST10-003")
      .withLife("p1", 3)
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    applyOptional(game);
    payDonFromActive(game);
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
  });
});

describe("ST10-004 Sanji", () => {
  covers("ST10-004", "[On Play]");

  it("arrives with [Rush] against a 5000-power board", () => {
    const game = table("st10-004-rush")
      .withHand("p1", [instance("sanji", "ST10-004")])
      .withBoard("p2", [character("big", "ST10-008")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST10-004" });
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
    ).toBe(true);
  });

  it("cannot attack on the turn it lands against a small board", () => {
    const game = table("st10-004-no-rush")
      .withHand("p1", [instance("sanji", "ST10-004")])
      .withBoard("p2", [character("small", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST10-004" });
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

describe("ST10-005 Jinbe", () => {
  covers("ST10-005", "[When Attacking]");

  it("takes 2000 off a body when it swings with a DON!! on it", () => {
    const game = table("st10-005-debuff")
      .withBoard("p1", [character("jinbe", "ST10-005")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .withGivenDon("p1", "jinbe", 1)
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before - 2_000);
  });

  it("does nothing with no DON!! given to it", () => {
    const game = table("st10-005-unpaid")
      .withBoard("p1", [character("jinbe", "ST10-005")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    declineDefence(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before);
  });
});

describe("ST10-006 Monkey.D.Luffy", () => {
  covers("ST10-006", "[Rush]", "static");

  it("attacks the turn it is played", () => {
    const game = table("st10-006-rush")
      .withHand("p1", [instance("luffy", "ST10-006")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST10-006" });
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
    ).toBe(true);
  });

  it("does not block, though its text names the keyword", () => {
    // The [Blocker] it prints belongs to the opponent's board: the clause
    // watches them activate one. A card that blocked as well would be a
    // different card at the same price.
    const game = defending("st10-006-not-a-blocker")
      .withBoard("p1", [character("luffy", "ST10-006")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("K.O.s a Character when the opponent blocks", () => {
    const game = table("st10-006-punish")
      .withBoard("p1", [character("luffy", "ST10-006")])
      .withBoard("p2", [
        character("blocker", "ST10-014"),
        character("victim", "FIX-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "blocker" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });
});

describe("ST10-007 Killer", () => {
  covers("ST10-007", "[Your Turn]");

  it("K.O.s a cheap rested body when a DON!! goes back", () => {
    const game = table("st10-007-ko")
      .withLeader("p1", "ST10-003")
      .withLife("p1", 3)
      .withBoard("p1", [character("killer", "ST10-007")])
      .withBoard("p2", [{ ...character("rested", "FIX-001"), rested: true }])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    applyOptional(game);
    payDonFromActive(game);
    game.play({ type: "resolve-effect", optionId: "rested" });
    settle(game);

    expect(boardCard(game, "p2", "rested")).toBeUndefined();
  });

  it("leaves an active Character alone", () => {
    const game = table("st10-007-active-safe")
      .withLeader("p1", "ST10-003")
      .withLife("p1", 3)
      .withBoard("p1", [character("killer", "ST10-007")])
      .withBoard("p2", [character("active", "FIX-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    applyOptional(game);
    payDonFromActive(game);
    settle(game);
    declineDefence(game);

    expect(boardCard(game, "p2", "active")).toBeDefined();
  });
});

describe("ST10-008 Shachi & Penguin", () => {
  covers("ST10-008", "[On Play]");

  it("takes two rested DON!! from behind", () => {
    // Hard-casting it can never satisfy its own gate: the four DON!! the play
    // costs are still on the field when the clause reads them. The position
    // that pays is the one the product is built around -- ST10-001's Leader
    // returns three DON!! to the DON!! deck and plays this for free.
    const game = table("st10-008-ramp")
      .withLeader("p1", "ST10-001")
      .withHand("p1", [instance("pair", "ST10-008")])
      .withDonDeck("p1", 4)
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-001" });
    applyOptional(game);
    payDonFromActive(game);
    game.play({ type: "resolve-effect", optionId: "pair" });
    settle(game);

    expect(fieldDon(game, "p1")).toBe(5);
    expect(game.state.players.p1.restedDon.length).toBeGreaterThanOrEqual(2);
  });

  it("adds nothing with a deep cost area", () => {
    const game = table("st10-008-ahead")
      .withHand("p1", [instance("pair", "ST10-008")])
      .withDonDeck("p1", 2)
      .build();

    const before = fieldDon(game, "p1");
    game.play({ type: "play-card", cardNumber: "ST10-008" });
    settle(game);

    // The 4 the play itself costs stay on the field, rested; nothing arrives.
    expect(fieldDon(game, "p1")).toBe(before);
  });
});

describe("ST10-009 Jean Bart", () => {
  covers("ST10-009", "[On Play]");

  it("trades a rested DON!! for a fresh active one", () => {
    const game = table("st10-009-trade")
      .withHand("p1", [instance("bart", "ST10-009")])
      .withDonDeck("p1", 2)
      .build();

    const before = fieldDon(game, "p1");
    game.play({ type: "play-card", cardNumber: "ST10-009" });
    applyOptional(game);
    settle(game);

    expect(fieldDon(game, "p1")).toBe(before + 1);
  });

  it("can be declined, so the DON!! stays where it is", () => {
    const game = table("st10-009-decline")
      .withHand("p1", [instance("bart", "ST10-009")])
      .withDonDeck("p1", 2)
      .build();

    const before = fieldDon(game, "p1");
    game.play({ type: "play-card", cardNumber: "ST10-009" });
    if (effectOptions(game.state).includes("skip")) {
      game.play({ type: "resolve-effect", optionId: "skip" });
    }
    settle(game);

    expect(fieldDon(game, "p1")).toBe(before);
  });
});

describe("ST10-011 Heat", () => {
  covers("ST10-011", "[Your Turn]");

  it("gains 2000 that survives the opponent's turn", () => {
    const game = table("st10-011-buff")
      .withLeader("p1", "ST10-003")
      .withLife("p1", 3)
      .withBoard("p1", [character("heat", "ST10-011")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    applyOptional(game);
    payDonFromActive(game);
    settle(game);
    declineDefence(game);

    expect(currentPower(game.state, "p1", "heat")).toBe(6_000);
    game.pass();
    expect(currentPower(game.state, "p1", "heat")).toBe(6_000);
  });
});

describe("ST10-012 Bepo", () => {
  covers("ST10-012", "[On Play]", "[When Attacking]");

  it("ramps a rested DON!! while the opponent is ahead", () => {
    const game = table("st10-012-behind")
      .withHand("p1", [instance("bepo", "ST10-012")])
      .withDonDeck("p1", 5)
      .build();

    game.play({ type: "play-card", cardNumber: "ST10-012" });
    settle(game);

    expect(game.state.players.p1.restedDon.length).toBeGreaterThanOrEqual(1);
  });

  it("adds nothing while the two cost areas are level", () => {
    const game = table("st10-012-level")
      .withBoard("p1", [character("bepo", "ST10-012")])
      .build();

    const before = fieldDon(game, "p1");
    game.play({
      type: "attack",
      attackerInstanceId: "bepo",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    declineDefence(game);

    expect(fieldDon(game, "p1")).toBe(before);
  });
});

describe('ST10-013 Eustass"Captain"Kid', () => {
  covers("ST10-013", "[On Play]", "[When Attacking]");

  it("buys the Leader +1000 on the way in", () => {
    const game = table("st10-013-on-play")
      .withHand("p1", [instance("kid", "ST10-013")])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "play-card", cardNumber: "ST10-013" });
    applyOptional(game);
    payDonFromActive(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 1_000);
  });

  it("buys it again on the swing, and the buff outlives the turn", () => {
    const game = table("st10-013-when-attacking")
      .withBoard("p1", [character("kid", "ST10-013")])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({
      type: "attack",
      attackerInstanceId: "kid",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    payDonFromActive(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);
    declineDefence(game);

    game.pass();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 1_000);
  });
});

describe("ST10-014 Wire", () => {
  covers("ST10-014", "[Blocker]", "static");

  it("blocks", () => {
    const game = defending("st10-014-block")
      .withBoard("p1", [character("wire", "ST10-014")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "wire",
        ),
    ).toBe(true);
  });

  it("cycles a card when a DON!! goes back to the DON!! deck", () => {
    const game = table("st10-014-cycle")
      .withLeader("p1", "ST10-003")
      .withLife("p1", 3)
      .withBoard("p1", [character("wire", "ST10-014")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    applyOptional(game);
    payDonFromActive(game);
    settle(game);

    // One drawn, one trashed: the hand is the size it was, one card deeper
    // into the deck.
    expect(game.state.players.p1.hand.length).toBe(handBefore);
    expect(game.state.players.p1.trash.length).toBeGreaterThan(0);
  });
});

describe("ST10-015 Gum-Gum Giant Sumo Slap", () => {
  covers("ST10-015", "[Counter]");

  it("adds 2000 to the battle and K.O.s a 2000-power body", () => {
    const game = defending("st10-015-counter")
      .withHand("p1", [instance("slap", "ST10-015")])
      .withBoard("p2", [character("victim", "FIX-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST10-015" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
    expect(game.state.activeAttack?.counterPower).toBe(2_000);
  });
});

describe("ST10-016 Gum-Gum Kong Gatling", () => {
  covers("ST10-016", "[Main]", "[Trigger]");

  it("K.O.s a Character up to 7000", () => {
    const game = table("st10-016-main")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p2", "victim")).toBeUndefined();
  });

  it("leaves a body printed over the ceiling alone", () => {
    const game = table("st10-016-too-big")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("big", "ST10-006")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    settle(game);

    expect(boardCard(game, "p2", "big")).toBeDefined();
  });

  it("buffs its own Leader off a Life card", () => {
    const game = table("st10-016-trigger")
      .withLife("p2", [instance("gatling", "ST10-016")])
      .build();

    const before = currentPower(game.state, "p2", "p2-leader");
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(before + 1_000);
  });
});

describe("ST10-017 Punk Vise", () => {
  covers("ST10-017", "[Main]", "[Trigger]");

  it("rests a cheap body and ramps a rested DON!!", () => {
    const game = table("st10-017-main")
      .withHand("p1", [instance("vise", "ST10-017")])
      .withBoard("p2", [character("small", "FIX-001")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "activate-main", cardNumber: "ST10-017" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(boardCard(game, "p2", "small")?.rested).toBe(true);
    expect(game.state.players.p1.restedDon.length).toBeGreaterThanOrEqual(1);
  });

  it("ramps an active DON!! off a Life card", () => {
    // Active rather than the rested DON!! its own `[Main]` half adds: a
    // `[Trigger]` resolves on the other player's turn, where an active DON!!
    // is Counter money as well as next turn's cost area.
    const game = table("st10-017-trigger")
      .withLife("p2", [instance("vise", "ST10-017")])
      .withDonDeck("p2", 3)
      .build();

    const activeBefore = game.state.players.p2.activeDon.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.activeDon.length).toBe(activeBefore + 1);
  });
});
