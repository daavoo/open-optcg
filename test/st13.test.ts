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
 * ULTRA DECK -The Three Brothers- [ST-13], as a whole-product import.
 *
 * `packages/cards/src/st13.ts` explains where the records come from; this file
 * holds the behaviour. Nineteen cards and three Leaders, built on an economy no
 * other product in the pool has: Life is a second board. Cards go into it from
 * the deck, the hand and the field, they are turned face-up and face-down, the
 * whole stack is read and re-ordered, and one Leader trashes every face-up card
 * in it at the end of its own turn.
 *
 * The three Leaders are three decks rather than a choice of statline, and the
 * tests are grouped that way: ST13-001 banks its own big bodies, ST13-002 banks
 * off the deck and burns the stack every turn, and ST13-003 rewrites what
 * damage does to a face-up card and rebuilds the stack from zero.
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

/**
 * Takes the default answer to each pending decision until `optionId` is on
 * offer, then picks it. A clause that re-orders a Life stack asks one question
 * per card before it reaches the step under test.
 */
const resolveUntil = (game: Game, optionId: string) => {
  while (
    game.state.pendingEffect &&
    !effectOptions(game.state).includes(optionId)
  ) {
    game.play({ type: "resolve-effect" });
  }
  game.play({ type: "resolve-effect", optionId });
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

const lifeNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].life.map((card) => card.cardNumber);

const faceUpLife = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].life.filter((card) => card.faceUp);

describe("ST13-001 Sabo (Leader)", () => {
  covers("ST13-001", "[Activate: Main]");

  it("banks a big body of its own onto Life face-up", () => {
    const game = table("st13-001-bank")
      .withLeader("p1", "ST13-001")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [character("big", "ST13-004")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "activate-main", cardNumber: "ST13-001" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    settle(game);

    expect(boardCard(game, "p1", "big")).toBeUndefined();
    expect(game.state.players.p1.life).toHaveLength(lifeBefore + 1);
    expect(faceUpLife(game, "p1").map((card) => card.cardNumber)).toEqual([
      "ST13-004",
    ]);
  });

  it("buys +2000 on a Character that holds into the opponent's turn", () => {
    const game = table("st13-001-buff")
      .withLeader("p1", "ST13-001")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [
        character("big", "ST13-004"),
        character("small", "ST13-013"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST13-001" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(currentPower(game.state, "p1", "small")).toBe(4_000);
    game.pass();
    expect(currentPower(game.state, "p1", "small")).toBe(4_000);
  });

  it("cannot bank a body under 7000 power", () => {
    const game = table("st13-001-too-small")
      .withLeader("p1", "ST13-001")
      .withDon("p1", { leaderAttached: 1 })
      .withBoard("p1", [character("small", "ST13-015")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST13-001" });
    applyOptional(game);

    expect(effectOptions(game.state)).not.toContain("small");
  });

  it("is not offered without a DON!! on the Leader", () => {
    // `[DON!! x1]` is the program's outermost `if`, so the activation is
    // dropped from `legalActions` rather than offered and spent on nothing.
    const game = table("st13-001-no-don")
      .withLeader("p1", "ST13-001")
      .withBoard("p1", [character("big", "ST13-004")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST13-001",
        ),
    ).toBe(false);
  });
});

describe("ST13-002 Portgas.D.Ace (Leader)", () => {
  covers("ST13-002", "[Activate: Main]", "[End of Your Turn]");

  it("digs five deep and banks a 5-cost Character face-up", () => {
    const game = table("st13-002-dig")
      .withLeader("p1", "ST13-002")
      .withDon("p1", { leaderAttached: 2 })
      .withDeckTop("p1", [instance("prize", "ST13-008")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST13-002" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(faceUpLife(game, "p1").map((card) => card.cardNumber)).toEqual([
      "ST13-008",
    ]);
  });

  it("cannot bank a Character of any other cost", () => {
    const game = table("st13-002-miss")
      .withLeader("p1", "ST13-002")
      .withDon("p1", { leaderAttached: 2 })
      .withDeckTop("p1", [instance("cheap", "ST13-013")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST13-002" });

    expect(effectOptions(game.state)).not.toContain("cheap");
  });

  it("trashes every face-up Life card at the end of its own turn", () => {
    const game = table("st13-002-sweep")
      .withLeader("p1", "ST13-002")
      .withLife("p1", [
        { ...instance("shown", "ST13-008"), faceUp: true },
        instance("hidden", "ST13-013"),
      ])
      .build();

    game.pass();
    settle(game);

    expect(lifeNumbers(game, "p1")).toEqual(["ST13-013"]);
    expect(
      game.state.players.p1.trash.some((card) => card.instanceId === "shown"),
    ).toBe(true);
  });

  it("leaves another Leader's face-up Life card alone", () => {
    const game = table("st13-002-other-leader")
      .withLife("p1", [{ ...instance("shown", "ST13-008"), faceUp: true }])
      .build();

    game.pass();
    settle(game);

    expect(lifeNumbers(game, "p1")).toEqual(["ST13-008"]);
  });
});

describe("ST13-003 Monkey.D.Luffy (Leader)", () => {
  covers("ST13-003", "[Activate: Main]", "static");

  it("sends a damaged face-up Life card to the bottom of the deck", () => {
    const game = defending("st13-003-damage")
      .withLeader("p1", "ST13-003")
      .withLife("p1", [{ ...instance("shown", "ST13-008"), faceUp: true }])
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
    expect(game.state.players.p1.deck).toHaveLength(deckBefore + 1);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("shown");
  });

  it("leaves a face-down Life card going to hand alone", () => {
    // The printed word is face-up, and it is the out: ST13-005 banks face-down
    // and ST13-009 turns a card back down, so the stack can be made to behave
    // normally again.
    const game = defending("st13-003-face-down")
      .withLeader("p1", "ST13-003")
      .withLife("p1", [instance("hidden", "FIX-001")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
    expect(
      game.state.players.p1.hand.some((card) => card.instanceId === "hidden"),
    ).toBe(true);
  });

  it("sends a face-up card to the deck under another Leader's damage too", () => {
    // The rule is the Leader's, not the card's: without ST13-003 the same
    // face-up Life card joins the hand.
    const game = defending("st13-003-control")
      .withLife("p1", [{ ...instance("shown", "ST13-008"), faceUp: true }])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });

  it("rebuilds a Life stack from zero out of hand and trash", () => {
    const game = table("st13-003-rebuild")
      .withLeader("p1", "ST13-003")
      .withDon("p1", { leaderAttached: 2 })
      .withLife("p1", 0)
      .withHand("p1", [
        instance("cost", "FIX-001"),
        instance("brother", "ST13-008"),
      ])
      .withTrash("p1", [instance("dead", "ST13-011")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST13-003" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "brother" });
    game.play({ type: "resolve-effect", optionId: "dead" });
    settle(game);

    expect(faceUpLife(game, "p1")).toHaveLength(2);
    expect(lifeNumbers(game, "p1").sort()).toEqual(["ST13-008", "ST13-011"]);
  });

  it("pays the card and banks nothing while any Life is left", () => {
    const game = table("st13-003-has-life")
      .withLeader("p1", "ST13-003")
      .withDon("p1", { leaderAttached: 2 })
      .withLife("p1", 1)
      .withHand("p1", [
        instance("cost", "FIX-001"),
        instance("brother", "ST13-008"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST13-003" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    settle(game);

    expect(
      game.state.players.p1.trash.some((card) => card.instanceId === "cost"),
    ).toBe(true);
    expect(faceUpLife(game, "p1")).toHaveLength(0);
  });
});

describe("ST13-004 Edward.Newgate", () => {
  covers("ST13-004", "[On Play]");

  it("banks a card off the deck and takes one back off the stack", () => {
    const game = table("st13-004-read")
      .withHand("p1", [instance("newgate", "ST13-004")])
      .withLife("p1", [instance("known", "ST13-013")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "ST13-004" });
    resolveUntil(game, "known");
    settle(game);

    // One card in from the deck and one out to it: the stack is the size it
    // was, and the card taken back is on top of the deck.
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("known");
  });
});

describe("ST13-005 Emporio.Ivankov", () => {
  covers("ST13-005", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = defending("st13-005-block")
      .withBoard("p1", [character("ivankov", "ST13-005")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "ivankov",
        ),
    ).toBe(true);
  });

  it("trades a Life card for a 5-cost brother banked face-down", () => {
    const game = table("st13-005-bank")
      .withHand("p1", [
        instance("ivankov", "ST13-005"),
        instance("brother", "ST13-008"),
      ])
      .withLife("p1", [instance("spent", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-005" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "spent" });
    game.play({ type: "resolve-effect", optionId: "brother" });
    settle(game);

    expect(lifeNumbers(game, "p1")).toEqual(["ST13-008"]);
    // Face-down, which is what keeps it out of ST13-002's end-of-turn sweep.
    expect(faceUpLife(game, "p1")).toHaveLength(0);
  });

  it("is not offered with an empty Life stack", () => {
    const game = table("st13-005-no-life")
      .withHand("p1", [
        instance("ivankov", "ST13-005"),
        instance("brother", "ST13-008"),
      ])
      .withLife("p1", 0)
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-005" });
    settle(game);

    expect(
      game.state.players.p1.hand.some((card) => card.instanceId === "brother"),
    ).toBe(true);
  });
});

describe("ST13-006 Curly.Dadan", () => {
  covers("ST13-006", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = defending("st13-006-block")
      .withBoard("p1", [character("dadan", "ST13-006")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "dadan",
        ),
    ).toBe(true);
  });

  it("plays one of each 2-cost brother out of hand", () => {
    const game = table("st13-006-three")
      .withHand("p1", [
        instance("dadan", "ST13-006"),
        instance("sabo", "ST13-007"),
        instance("ace", "ST13-010"),
        instance("luffy", "ST13-014"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-006" });
    game.play({ type: "resolve-effect", optionId: "sabo" });
    game.play({ type: "resolve-effect", optionId: "ace" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    settle(game);

    expect(boardNumbers(game, "p1").sort()).toEqual([
      "ST13-006",
      "ST13-007",
      "ST13-010",
      "ST13-014",
    ]);
  });

  it("plays only one of two copies of the same brother", () => {
    // "Up to 1 each" is three independent offers, so a second Sabo is not a
    // legal pick for the Sabo one.
    const game = table("st13-006-duplicate")
      .withHand("p1", [
        instance("dadan", "ST13-006"),
        instance("sabo", "ST13-007"),
        instance("sabo2", "ST13-007"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-006" });
    game.play({ type: "resolve-effect", optionId: "sabo" });
    settle(game);

    expect(
      game.state.players.p1.hand.some((card) => card.instanceId === "sabo2"),
    ).toBe(true);
  });
});

describe("the three 2-cost brothers", () => {
  covers("ST13-007", "[Activate: Main]");
  covers("ST13-010", "[Activate: Main]");
  covers("ST13-014", "[Activate: Main]");

  const pairs = [
    ["ST13-007", "ST13-008"],
    ["ST13-010", "ST13-011"],
    ["ST13-014", "ST13-015"],
  ] as const;

  it.each(pairs)(
    "%s trashes itself to play the %s off the top of Life",
    (small, big) => {
      const game = table(`st13-brother-${small}`)
        .withBoard("p1", [character("small", small)])
        .withLife("p1", [instance("big", big)])
        .build();

      game.play({ type: "activate-main", cardNumber: small });
      applyOptional(game);
      applyOptional(game);
      game.play({ type: "resolve-effect", optionId: "p1-leader" });
      settle(game);

      expect(boardCard(game, "p1", "small")).toBeUndefined();
      expect(boardNumbers(game, "p1")).toContain(big);
    },
  );

  it("buys the Leader +2000 that holds into the opponent's turn", () => {
    const game = table("st13-brother-buff")
      .withBoard("p1", [character("small", "ST13-007")])
      .withLife("p1", [instance("big", "ST13-008")])
      .build();

    const before = currentPower(game.state, "p1", "p1-leader");
    game.play({ type: "activate-main", cardNumber: "ST13-007" });
    applyOptional(game);
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 2_000);
    game.pass();
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(before + 2_000);
  });

  it("spends the body and plays nothing off the wrong brother", () => {
    // The reveal is mandatory and the play is not: a miss still shows the
    // opponent the top of your Life, and the body is gone either way.
    const game = table("st13-brother-miss")
      .withBoard("p1", [character("small", "ST13-007")])
      .withLife("p1", [instance("wrong", "ST13-011")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST13-007" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "small")).toBeUndefined();
    expect(boardNumbers(game, "p1")).not.toContain("ST13-011");
    expect(lifeNumbers(game, "p1")).toEqual(["ST13-011"]);
  });

  it("is not offered with an empty Life stack", () => {
    const game = table("st13-brother-no-life")
      .withBoard("p1", [character("small", "ST13-007")])
      .withLife("p1", 0)
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST13-007",
        ),
    ).toBe(false);
  });
});

describe("ST13-008 Sabo", () => {
  covers("ST13-008", "[On Play]");

  it("trashes a Life card to K.O. a 5-cost body", () => {
    const game = table("st13-008-ko")
      .withHand("p1", [instance("sabo", "ST13-008")])
      .withLife("p1", [instance("spent", "FIX-001")])
      .withBoard("p2", [character("target", "ST13-015")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-008" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "spent" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")).toBeUndefined();
    expect(game.state.players.p1.life).toHaveLength(0);
  });

  it("is not offered with an empty Life stack", () => {
    const game = table("st13-008-no-life")
      .withHand("p1", [instance("sabo", "ST13-008")])
      .withLife("p1", 0)
      .withBoard("p2", [character("target", "ST13-015")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-008" });
    settle(game);

    expect(boardCard(game, "p2", "target")).toBeDefined();
  });
});

describe("ST13-009 Shanks", () => {
  covers("ST13-009", "[On Play]");

  it("hides a face-up Life card and burns one of theirs", () => {
    const game = table("st13-009-burn")
      .withHand("p1", [instance("shanks", "ST13-009")])
      .withLife("p1", [{ ...instance("shown", "ST13-008"), faceUp: true }])
      .withHand("p2", [
        ...Array.from({ length: 7 }, (_, index) =>
          instance(`theirs-${index}`, "FIX-001"),
        ),
      ])
      .build();

    const theirLifeBefore = game.state.players.p2.life.length;
    game.play({ type: "play-card", cardNumber: "ST13-009" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "shown" });
    settle(game);

    expect(faceUpLife(game, "p1")).toHaveLength(0);
    expect(game.state.players.p2.life).toHaveLength(theirLifeBefore - 1);
    // Trashed, not dealt as damage: nothing reaches their hand.
    expect(game.state.players.p2.hand).toHaveLength(7);
  });

  it("hides the card and burns nothing against a short hand", () => {
    const game = table("st13-009-short-hand")
      .withHand("p1", [instance("shanks", "ST13-009")])
      .withLife("p1", [{ ...instance("shown", "ST13-008"), faceUp: true }])
      .withHand("p2", [instance("one", "FIX-001")])
      .build();

    const theirLifeBefore = game.state.players.p2.life.length;
    game.play({ type: "play-card", cardNumber: "ST13-009" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "shown" });
    settle(game);

    expect(faceUpLife(game, "p1")).toHaveLength(0);
    expect(game.state.players.p2.life).toHaveLength(theirLifeBefore);
  });

  it("is not offered with no face-up Life card to turn", () => {
    const game = table("st13-009-nothing-shown")
      .withHand("p1", [instance("shanks", "ST13-009")])
      .withLife("p1", [instance("hidden", "FIX-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-009" });

    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

describe("ST13-011 Portgas.D.Ace", () => {
  covers("ST13-011", "[On Play]");

  it("attacks the turn it lands at 2 Life", () => {
    const game = table("st13-011-rush")
      .withHand("p1", [instance("ace", "ST13-011")])
      .withLife("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-011" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "ace",
        ),
    ).toBe(true);
  });

  it("cannot attack the turn it lands at 3 Life", () => {
    const game = table("st13-011-no-rush")
      .withHand("p1", [instance("ace", "ST13-011")])
      .withLife("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-011" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "ace",
        ),
    ).toBe(false);
  });
});

describe("ST13-012 Makino", () => {
  covers("ST13-012", "[On Play]");

  it("takes a Life card to hand and re-orders the rest", () => {
    const game = table("st13-012-swap")
      .withHand("p1", [instance("makino", "ST13-012")])
      .withLife("p1", [
        instance("taken", "ST13-013"),
        instance("left", "ST13-011"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-012" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "taken" });
    settle(game);

    expect(
      game.state.players.p1.hand.some((card) => card.instanceId === "taken"),
    ).toBe(true);
    expect(lifeNumbers(game, "p1")).toEqual(["ST13-011"]);
  });
});

describe("ST13-013 Monkey.D.Garp", () => {
  covers("ST13-013", "[On Play]");

  it("digs five deep for a brother", () => {
    const game = table("st13-013-dig")
      .withHand("p1", [instance("garp", "ST13-013")])
      .withDeckTop("p1", [instance("prize", "ST13-008")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-013" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST13-008",
    );
  });

  it("cannot take a card above cost 5", () => {
    const game = table("st13-013-too-big")
      .withHand("p1", [instance("garp", "ST13-013")])
      .withDeckTop("p1", [instance("huge", "ST13-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-013" });

    expect(effectOptions(game.state)).not.toContain("huge");
  });
});

describe("ST13-015 Monkey.D.Luffy", () => {
  covers("ST13-015", "[Activate: Main]");

  it("buys +2000 and trades the top Life card for a draw", () => {
    const game = table("st13-015-draw")
      .withBoard("p1", [character("luffy", "ST13-015")])
      .withLife("p1", [instance("burned", "FIX-001")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST13-015" });
    settle(game);

    expect(currentPower(game.state, "p1", "luffy")).toBe(8_000);
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
    expect(game.state.players.p1.life).toHaveLength(0);
    // Trashed rather than taken: it never reaches a hand and fires no Trigger.
    expect(
      game.state.players.p1.trash.some((card) => card.instanceId === "burned"),
    ).toBe(true);
  });

  it("takes the buff and draws nothing at 0 Life", () => {
    const game = table("st13-015-empty")
      .withBoard("p1", [character("luffy", "ST13-015")])
      .withLife("p1", 0)
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST13-015" });
    settle(game);

    expect(currentPower(game.state, "p1", "luffy")).toBe(8_000);
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });
});

describe("ST13-016 Yamato", () => {
  covers("ST13-016", "[Rush]", "[On Play]");

  it("attacks the turn it lands", () => {
    const game = table("st13-016-rush")
      .withHand("p1", [instance("yamato", "ST13-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-016" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "yamato",
        ),
    ).toBe(true);
  });

  it("takes a card off Life onto the top of the deck", () => {
    const game = table("st13-016-read")
      .withHand("p1", [instance("yamato", "ST13-016")])
      .withLife("p1", [instance("wanted", "ST13-008")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST13-016" });
    resolveUntil(game, "wanted");
    settle(game);

    expect(game.state.players.p1.deck[0]?.instanceId).toBe("wanted");
    expect(game.state.players.p1.life).toHaveLength(0);
  });
});

describe("ST13-017 Flame Dragon King", () => {
  covers("ST13-017", "[Counter]", "[Trigger]");

  it("adds 4000 in the battle", () => {
    const game = defending("st13-017-counter")
      .withHand("p1", [instance("flame", "ST13-017")])
      .withLife("p1", [instance("known", "FIX-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST13-017" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
  });

  it("swaps the top of Life for a card in hand off a Life card", () => {
    const game = table("st13-017-trigger")
      .withLife("p2", [
        instance("flame", "ST13-017"),
        instance("under", "FIX-001"),
      ])
      .withHand("p2", [instance("banked", "ST13-008")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "under" });
    game.play({ type: "resolve-effect", optionId: "banked" });
    settle(game);

    // A swap, not a gain: the stack is the size it was and the card on top is
    // the one its owner chose.
    expect(lifeNumbers(game, "p2")).toEqual(["ST13-008"]);
    expect(
      game.state.players.p2.hand.some((card) => card.instanceId === "under"),
    ).toBe(true);
  });
});

describe("ST13-018 Gum-Gum Jet Spear", () => {
  covers("ST13-018", "[Counter]", "[Trigger]");

  it("adds 2000 and draws at 0 Life", () => {
    const game = defending("st13-018-empty")
      .withHand("p1", [instance("spear", "ST13-018")])
      .withLife("p1", 0)
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST13-018" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    // One card out of hand to play it, one drawn back.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("draws nothing with Life left", () => {
    const game = defending("st13-018-has-life")
      .withHand("p1", [instance("spear", "ST13-018")])
      .withLife("p1", 2)
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "ST13-018" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });

  it("swaps the top of Life off a Life card", () => {
    const game = table("st13-018-trigger")
      .withLife("p2", [
        instance("spear", "ST13-018"),
        instance("under", "FIX-001"),
      ])
      .withHand("p2", [instance("banked", "ST13-008")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "under" });
    game.play({ type: "resolve-effect", optionId: "banked" });
    settle(game);

    expect(lifeNumbers(game, "p2")).toEqual(["ST13-008"]);
  });
});

describe("ST13-019 The Three Brothers' Bond", () => {
  covers("ST13-019", "[Main]", "[Trigger]");

  it("digs five deep for a brother in the Main Phase", () => {
    const game = table("st13-019-main")
      .withHand("p1", [instance("bond", "ST13-019")])
      .withDeckTop("p1", [instance("prize", "ST13-008")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST13-019" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST13-008",
    );
  });

  it("runs the same dig off a Life card", () => {
    const game = table("st13-019-trigger")
      .withLife("p2", [instance("bond", "ST13-019")])
      .withDeckTop("p2", [instance("prize", "ST13-008")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(game.state.players.p2.hand.map((card) => card.cardNumber)).toContain(
      "ST13-008",
    );
  });
});
