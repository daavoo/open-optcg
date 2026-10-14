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
 * STARTER DECK -Green/Blue Roronoa Zoro & Sanji- [ST-12], as a whole-product
 * import.
 *
 * `packages/cards/src/st12.ts` explains where the records come from; this file
 * holds the behaviour. Seventeen cards across two colours, and the split is the
 * product: Green rests bodies out of the way and Blue pays for the board off
 * the top of its own deck, and the Leader converts one into the other by
 * returning a spent body to buy a second attack.
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

describe("ST12-001 Roronoa Zoro & Sanji (Leader)", () => {
  covers("ST12-001", "[When Attacking]");

  it("returns a 2-cost body to set a spent attacker active", () => {
    const game = table("st12-001-restand")
      .withLeader("p1", "ST12-001")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [
        character("fuel", "ST12-006"),
        { ...character("spent", "ST12-008"), rested: true },
      ])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "spent" });
    settle(game);

    expect(boardCard(game, "p1", "fuel")).toBeUndefined();
    expect(boardCard(game, "p1", "spent")?.rested).toBe(false);
  });

  it("cannot pay with a 1-cost body", () => {
    const game = table("st12-001-cheap-fuel")
      .withLeader("p1", "ST12-001")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [
        character("cheap", "ST12-009"),
        { ...character("spent", "ST12-008"), rested: true },
      ])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    applyOptional(game);

    expect(effectOptions(game.state)).not.toContain("cheap");
  });

  it("cannot restand a body above 7000 power", () => {
    const game = table("st12-001-big-body")
      .withLeader("p1", "ST12-001")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [
        character("fuel", "ST12-006"),
        { ...character("huge", "ST15-002"), rested: true },
      ])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });

    expect(effectOptions(game.state)).not.toContain("huge");
  });
});

describe("ST12-002 Kuina", () => {
  covers("ST12-002", "[Activate: Main]", "[Trigger]");

  it("rests itself to rest a 4-cost body", () => {
    const game = table("st12-002-rest")
      .withBoard("p1", [character("kuina", "ST12-002")])
      .withBoard("p2", [character("target", "ST12-008")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST12-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "kuina")?.rested).toBe(true);
    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });

  it("is not offered once it has rested", () => {
    const game = table("st12-002-spent")
      .withBoard("p1", [{ ...character("kuina", "ST12-002"), rested: true }])
      .withBoard("p2", [character("target", "ST12-008")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST12-002",
        ),
    ).toBe(false);
  });

  it("plays itself off a Life card", () => {
    const game = table("st12-002-trigger")
      .withLife("p2", [instance("kuina", "ST12-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("ST12-002");
  });
});

describe("ST12-003 Dracule Mihawk", () => {
  covers("ST12-003", "[On Play]");

  it("brings a <Slash> body out of hand rested onto a small board", () => {
    const game = table("st12-003-behind")
      .withHand("p1", [
        instance("mihawk", "ST12-003"),
        instance("free", "ST12-008"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST12-003" });
    game.play({ type: "resolve-effect", optionId: "free" });
    settle(game);

    expect(boardCard(game, "p1", "free")?.rested).toBe(true);
  });

  it("cannot find a second copy of itself", () => {
    const game = table("st12-003-self")
      .withHand("p1", [
        instance("mihawk", "ST12-003"),
        instance("copy", "ST12-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST12-003" });

    expect(effectOptions(game.state)).not.toContain("copy");
  });

  it("does nothing with three Characters already out", () => {
    // The card counts itself once it has arrived, so "2 or less" means two
    // other bodies at most -- a board of three is already past the gate.
    const game = table("st12-003-ahead")
      .withHand("p1", [
        instance("mihawk", "ST12-003"),
        instance("free", "ST12-008"),
      ])
      .withBoard("p1", [
        character("a", "ST12-004"),
        character("b", "ST12-004"),
        character("c", "ST12-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST12-003" });
    settle(game);

    expect(boardCard(game, "p1", "free")).toBeUndefined();
  });
});

describe("ST12-006 Yosaku & Johnny", () => {
  covers("ST12-006", "[When Attacking]");

  it("rests a 2-cost body on every attack", () => {
    const game = table("st12-006-rest")
      .withBoard("p1", [character("pair", "ST12-006")])
      .withBoard("p2", [character("target", "ST12-011")])
      .withDon("p1", { active: 9 })
      .build();

    game.play({ type: "attach-don", targetInstanceId: "pair" });
    game.play({ type: "attack", attackerInstanceId: "pair" });
    game.play({ type: "resolve-effect", optionId: "rest" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });

  it("K.O.s a rested 2-cost body instead", () => {
    const game = table("st12-006-ko")
      .withBoard("p1", [character("pair", "ST12-006")])
      .withBoard("p2", [{ ...character("target", "ST12-011"), rested: true }])
      .withDon("p1", { active: 9 })
      .build();

    game.play({ type: "attach-don", targetInstanceId: "pair" });
    game.play({ type: "attack", attackerInstanceId: "pair" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")).toBeUndefined();
  });

  it("does not fire without a DON!! on it", () => {
    const game = table("st12-006-no-don")
      .withBoard("p1", [character("pair", "ST12-006")])
      .withBoard("p2", [character("target", "ST12-011")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "pair" });

    expect(effectOptions(game.state)).not.toContain("rest");
  });
});

describe("ST12-007 Rika", () => {
  covers("ST12-007", "[On Play]");

  it("rests two DON!! to set a <Slash> body active", () => {
    const game = table("st12-007-refresh")
      .withHand("p1", [instance("rika", "ST12-007")])
      .withBoard("p1", [{ ...character("spent", "ST12-008"), rested: true }])
      .withLife("p2", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "ST12-007" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "spent" });
    settle(game);

    expect(boardCard(game, "p1", "spent")?.rested).toBe(false);
  });

  it("does nothing once the opponent is down to 2 Life", () => {
    const game = table("st12-007-late")
      .withHand("p1", [instance("rika", "ST12-007")])
      .withBoard("p1", [{ ...character("spent", "ST12-008"), rested: true }])
      .withLife("p2", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "ST12-007" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "spent")?.rested).toBe(true);
  });
});

describe("ST12-008 Roronoa Zoro", () => {
  covers("ST12-008", "[When Attacking]");

  it("rests a 6-cost body on every attack", () => {
    const game = table("st12-008-rest")
      .withBoard("p1", [character("zoro", "ST12-008")])
      .withBoard("p2", [character("target", "ST15-005")])
      .withDon("p1", { active: 9 })
      .build();

    game.play({ type: "attach-don", targetInstanceId: "zoro" });
    game.play({ type: "attack", attackerInstanceId: "zoro" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });
});

describe("ST12-010 Emporio.Ivankov", () => {
  covers("ST12-010", "[On Play]", "[When Attacking]");

  it("plays a revealed 2-cost body for free", () => {
    const game = table("st12-010-reveal")
      .withHand("p1", [instance("ivankov", "ST12-010")])
      .withDeckTop("p1", [instance("prize", "ST12-011")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST12-010" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("ST12-011");
  });

  it("cannot play a revealed 3-cost body", () => {
    const game = table("st12-010-miss")
      .withHand("p1", [instance("ivankov", "ST12-010")])
      .withDeckTop("p1", [instance("toobig", "ST12-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST12-010" });

    expect(effectOptions(game.state)).not.toContain("toobig");
  });

  it("draws a card on attack with a hand of six or less", () => {
    const game = table("st12-010-draw")
      .withBoard("p1", [character("ivankov", "ST12-010")])
      .withHand("p1", [instance("one", "FIX-001")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "ivankov" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("draws nothing with a full hand", () => {
    const game = table("st12-010-full")
      .withBoard("p1", [character("ivankov", "ST12-010")])
      .withHand("p1", [
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
        instance("c", "FIX-001"),
        instance("d", "FIX-001"),
        instance("e", "FIX-001"),
        instance("f", "FIX-001"),
        instance("g", "FIX-001"),
      ])
      .build();

    game.play({ type: "attack", attackerInstanceId: "ivankov" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(7);
  });
});

describe("ST12-011 Sanji", () => {
  covers("ST12-011", "[When Attacking]");

  it("gains +2000 that holds into the opponent's turn", () => {
    const game = table("st12-011-buff")
      .withBoard("p1", [character("sanji", "ST12-011")])
      .withHand("p1", [instance("one", "FIX-001")])
      .withDon("p1", { active: 9 })
      .build();

    game.play({ type: "attach-don", targetInstanceId: "sanji" });
    game.play({ type: "attack", attackerInstanceId: "sanji" });
    declineDefence(game);
    settle(game);

    // 3000 printed, 1000 from the DON!! and 2000 from the clause.
    expect(currentPower(game.state, "p1", "sanji")).toBe(6_000);

    // The window is the point: the buff is still on the body through the whole
    // of the opponent's turn, so the 3000 that attacked defends as a 6000.
    game.pass();
    expect(currentPower(game.state, "p1", "sanji")).toBe(6_000);
  });

  it("gains nothing with a hand of six", () => {
    const game = table("st12-011-full")
      .withBoard("p1", [character("sanji", "ST12-011")])
      .withHand("p1", [
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
        instance("c", "FIX-001"),
        instance("d", "FIX-001"),
        instance("e", "FIX-001"),
        instance("f", "FIX-001"),
      ])
      .withDon("p1", { active: 9 })
      .build();

    game.play({ type: "attach-don", targetInstanceId: "sanji" });
    game.play({ type: "attack", attackerInstanceId: "sanji" });
    declineDefence(game);
    settle(game);

    expect(currentPower(game.state, "p1", "sanji")).toBe(4_000);
  });
});

describe("ST12-012 Charlotte Pudding", () => {
  covers("ST12-012", "[Activate: Main]");

  it("returns itself to hand", () => {
    const game = table("st12-012-bounce")
      .withBoard("p1", [character("pudding", "ST12-012")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST12-012" });
    settle(game);

    expect(boardCard(game, "p1", "pudding")).toBeUndefined();
    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST12-012",
    );
  });
});

describe("ST12-013 Zeff", () => {
  covers("ST12-013", "[On Play]", "[When Attacking]");

  it("sorts the top three cards of the deck", () => {
    const game = table("st12-013-sort")
      .withHand("p1", [instance("zeff", "ST12-013")])
      .withDeckTop("p1", [
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
        instance("c", "FIX-001"),
      ])
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    game.play({ type: "play-card", cardNumber: "ST12-013" });
    settle(game);

    // A look is not a draw: every card is still in the deck afterwards.
    expect(game.state.players.p1.deck).toHaveLength(deckBefore);
  });

  it("plays a revealed 2-cost body rested on attack", () => {
    const game = table("st12-013-reveal")
      .withBoard("p1", [character("zeff", "ST12-013")])
      .withDeckTop("p1", [instance("prize", "ST12-011")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "zeff" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(boardCard(game, "p1", "prize")?.rested).toBe(true);
  });
});

describe("ST12-014 Duval", () => {
  covers("ST12-014", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = defending("st12-014-block")
      .withBoard("p1", [character("duval", "ST12-014")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "duval",
        ),
    ).toBe(true);
  });

  it("sorts the top three cards of the deck", () => {
    const game = table("st12-014-sort")
      .withHand("p1", [instance("duval", "ST12-014")])
      .withDeckTop("p1", [
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
        instance("c", "FIX-001"),
      ])
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    game.play({ type: "play-card", cardNumber: "ST12-014" });
    settle(game);

    expect(game.state.players.p1.deck).toHaveLength(deckBefore);
  });
});

describe("ST12-016 Lion Strike", () => {
  covers("ST12-016", "[Main]", "[Counter]", "[Trigger]");

  it("rests a 4-cost body in the Main Phase", () => {
    const game = table("st12-016-main")
      .withHand("p1", [instance("strike", "ST12-016")])
      .withBoard("p2", [character("target", "ST12-008")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST12-016" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });

  it("rests a body from the Counter window", () => {
    // The Leader is a printed target and is unreachable in this window: an
    // attacking Leader is already rested, and `canRest` withholds it. What the
    // Counter half is really for is resting the *next* attacker before it
    // declares.
    const game = defending("st12-016-counter")
      .withHand("p1", [instance("strike", "ST12-016")])
      .withBoard("p2", [character("second", "ST12-008")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST12-016" });
    game.play({ type: "resolve-effect", optionId: "second" });
    settle(game);

    expect(boardCard(game, "p2", "second")?.rested).toBe(true);
  });

  it("runs the same rest off a Life card", () => {
    const game = table("st12-016-trigger")
      .withLife("p2", [instance("strike", "ST12-016")])
      .withBoard("p1", [character("target", "ST12-008")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "target")?.rested).toBe(true);
  });
});

describe("ST12-017 Plastic Surgery Shot", () => {
  covers("ST12-017", "[Counter]");

  it("adds 2000 and then plays a revealed 2-cost body", () => {
    const game = defending("st12-017-counter")
      .withHand("p1", [instance("shot", "ST12-017")])
      .withDeckTop("p1", [instance("prize", "ST12-011")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST12-017" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("ST12-011");
  });
});
