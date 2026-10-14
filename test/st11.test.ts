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
 * The ST-11 Uta supplement, as a whole-product import.
 *
 * `packages/cards/src/st11.ts` explains where the records come from; this file
 * holds the behaviour. Five cards, and three of them are Events -- the highest
 * Event density of any product in the pool -- which is what the one Character's
 * end-of-turn clause is priced against: it eats an Event to set a body active,
 * and this deck is the only one with Events to spare.
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

describe("ST11-001 Uta (Leader)", () => {
  covers("ST11-001", "[When Attacking]");

  it("digs one card deep for a {FILM} card", () => {
    const game = table("st11-001-hit")
      .withLeader("p1", "ST11-001")
      .withDon("p1", { leaderAttached: 1 })
      .withDeckTop("p1", [instance("film", "ST11-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    game.play({ type: "resolve-effect", optionId: "film" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST11-002",
    );
  });

  it("buries a card that is not {FILM}", () => {
    const game = table("st11-001-miss")
      .withLeader("p1", "ST11-001")
      .withDon("p1", { leaderAttached: 1 })
      .withDeckTop("p1", [instance("dud", "FIX-001")])
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    settle(game);

    // The revealed card is never added, so the deck is the same size and the
    // card has gone to the bottom rather than to hand.
    expect(game.state.players.p1.deck).toHaveLength(deckBefore);
    expect(
      game.state.players.p1.hand.some((card) => card.instanceId === "dud"),
    ).toBe(false);
  });

  it("does not fire without a DON!! on the Leader", () => {
    const game = table("st11-001-no-don")
      .withLeader("p1", "ST11-001")
      .withDeckTop("p1", [instance("film", "ST11-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });

    expect(effectOptions(game.state)).not.toContain("film");
  });
});

describe("ST11-002 Uta", () => {
  covers("ST11-002", "[Blocker]", "[End of Your Turn]");

  it("blocks", () => {
    const game = defending("st11-002-block")
      .withBoard("p1", [character("uta", "ST11-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "uta",
        ),
    ).toBe(true);
  });

  it("eats an Event at end of turn to set a {FILM} body active", () => {
    const game = table("st11-002-refresh")
      .withBoard("p1", [
        character("uta", "ST11-002"),
        { ...character("spent", "ST16-001"), rested: true },
      ])
      .withHand("p1", [instance("event", "ST11-005")])
      .build();

    game.pass();
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "event" });
    game.play({ type: "resolve-effect", optionId: "spent" });
    settle(game);

    expect(boardCard(game, "p1", "spent")?.rested).toBe(false);
    expect(
      game.state.players.p1.trash.some((card) => card.instanceId === "event"),
    ).toBe(true);
  });

  it("is not offered with no Event in hand", () => {
    const game = table("st11-002-no-event")
      .withBoard("p1", [
        character("uta", "ST11-002"),
        { ...character("spent", "ST16-001"), rested: true },
      ])
      .withHand("p1", [instance("body", "FIX-001")])
      .build();

    game.pass();

    expect(effectOptions(game.state)).not.toContain("apply");
    expect(boardCard(game, "p1", "spent")?.rested).toBe(true);
  });
});

describe("ST11-003 Backlight", () => {
  covers("ST11-003", "[Main]");

  it("rests a 5-cost body", () => {
    const game = table("st11-003-rest")
      .withLeader("p1", "ST11-001")
      .withHand("p1", [instance("backlight", "ST11-003")])
      .withBoard("p2", [character("target", "ST12-005")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST11-003" });
    game.play({ type: "resolve-effect", optionId: "rest" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });

  it("K.O.s a body that is already rested", () => {
    const game = table("st11-003-ko")
      .withLeader("p1", "ST11-001")
      .withHand("p1", [instance("backlight", "ST11-003")])
      .withBoard("p2", [{ ...character("target", "ST12-005"), rested: true }])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST11-003" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")).toBeUndefined();
  });

  it("is not offered behind another Leader", () => {
    // The Leader gate is the program's outermost `if`, so the Event is dropped
    // from `legalActions` entirely rather than offered and spent on nothing.
    const game = table("st11-003-wrong-leader")
      .withHand("p1", [instance("backlight", "ST11-003")])
      .withBoard("p2", [character("target", "ST12-005")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST11-003",
        ),
    ).toBe(false);
  });
});

describe("ST11-004 New Genesis", () => {
  covers("ST11-004", "[Main]");

  it("finds a {FILM} card and hands the DON!! back", () => {
    const game = table("st11-004-dig")
      .withLeader("p1", "ST11-001")
      .withHand("p1", [instance("genesis", "ST11-004")])
      .withDeckTop("p1", [
        instance("prize", "ST11-002"),
        instance("filler1", "FIX-001"),
        instance("filler2", "FIX-001"),
      ])
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", cardNumber: "ST11-004" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST11-002",
    );
    // One DON!! paid for the Event and one set active again, so the cost area
    // is exactly where it started.
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore);
  });

  it("cannot find a second copy of itself", () => {
    const game = table("st11-004-self")
      .withLeader("p1", "ST11-001")
      .withHand("p1", [instance("genesis", "ST11-004")])
      .withDeckTop("p1", [
        instance("copy", "ST11-004"),
        instance("filler1", "FIX-001"),
        instance("filler2", "FIX-001"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST11-004" });

    expect(effectOptions(game.state)).not.toContain("copy");
  });
});

describe("ST11-005 I'm invincible", () => {
  covers("ST11-005", "[Main]", "[Trigger]");

  it("sets a rested [Uta] Leader active", () => {
    const game = table("st11-005-restand")
      .withLeader("p1", "ST11-001")
      .withHand("p1", [instance("invincible", "ST11-005")])
      .withRestedLeader("p1")
      .build();

    game.play({ type: "activate-main", cardNumber: "ST11-005" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("is a +1000 buff off a Life card", () => {
    const game = table("st11-005-trigger")
      .withLife("p2", [instance("invincible", "ST11-005")])
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
