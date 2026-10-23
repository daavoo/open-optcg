import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  hasKeyword,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * EXTRA BOOSTER -ONE PIECE HEROINES EDITION vol.2- [EB-05], Blue and Purple:
 * EB05-021 to EB05-040.
 *
 * `packages/cards/src/eb05.ts` explains where the records come from. EB05-026
 * and EB05-032 print no text; every other card in the range has a case per
 * printed clause here, and Bandai's rulings for them are in
 * `test/faq-eb05-b.test.ts`.
 *
 * No shipped list plays these, so every position seats two starter decks on
 * an empty table and places the cards under test with `with*` setters. The
 * Leader is set wherever a clause gates on one, and every gate has a case
 * behind a Leader that fails it.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** A Leader with no type, name or text any card here reads. */
const PLAIN_LEADER = "FIX-LEADER-B";
const IMPEL_DOWN_LEADER = "EB01-021";
const VINSMOKE_LEADER = "OP06-042";
const STRAW_HAT_LEADER = "OP05-060";
const NAVY_LEADER = "OP05-041";
const DONQUIXOTE_LEADER = "OP14-060";
const NAMI_LEADER = "P-117";

/** An empty table on p1's turn 11, all ten DON!! active on both sides. */
const table = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", PLAIN_LEADER)
    .withDeckTop("p1", copies(10, "ST31-002", "deck"));

/** The same table on p2's turn 12, for the clauses that defend. */
const defending = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withLeader("p1", PLAIN_LEADER)
    .withDeckTop("p1", copies(10, "ST31-002", "deck"));

function effectOptions(game: Game): string[] {
  return game
    .legalActions(game.state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game): void {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Take the apply branch of an `optional` prompt, if one is open. */
function applyOptional(game: Game): void {
  if (effectOptions(game).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const fieldDon = (state: GameState, player: "p1" | "p2"): number => {
  const side = state.players[player];
  return (
    side.activeDon.length +
    side.restedDon.length +
    side.leaderAttachedDon.length +
    side.board.reduce(
      (total, card) => total + (card.attachedDon?.length ?? 0),
      0,
    )
  );
};

const eventOffered = (game: Game, cardNumber: string): boolean =>
  game
    .legalActions(game.state.activePlayer)
    .some(
      (action) =>
        action.type === "activate-main" &&
        action.summary.includes(`[${cardNumber}]`),
    );

const activateOffered = (game: Game, sourceInstanceId: string): boolean =>
  game
    .legalActions(game.state.activePlayer)
    .some(
      (action) =>
        action.type === "activate-main" &&
        (action as { sourceInstanceId?: string }).sourceInstanceId ===
          sourceInstanceId,
    );

const playOffered = (game: Game, instanceId: string): boolean =>
  game
    .legalActions(game.state.activePlayer)
    .some(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === instanceId,
    );

/**
 * Answer a `DON!! −N` prompt for which pile pays, rested first, so the
 * active DON!! a test counts afterwards are untouched.
 */
function returnDon(game: Game): void {
  let guard = 0;
  while (effectOptions(game).some((id) => id.startsWith("return-don:"))) {
    if (guard++ > 10) throw new Error("DON!! return never settled");
    const options = effectOptions(game);
    pick(
      game,
      options.includes("return-don:rested")
        ? "return-don:rested"
        : "return-don:active",
    );
  }
}

/** A battle on p1's Leader in its Counter step, p2 attacking with a 6000. */
const counterStep = (seed: string) =>
  defending(seed)
    .withBoard("p2", [character("attacker", "ST31-002")])
    .withActiveAttack(
      {
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "attacker",
        targetInstanceId: "p1-leader",
        attackPower: 6000,
        counterPower: 0,
      },
      "counter",
    );

/** p1 attacks p2's Leader with `attacker`; p2's top Life card is `life`. */
const flipLifeTrigger = (game: Game) => {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p2-leader",
  });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
  game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
};

// --- EB05-021 Alvida ----------------------------------------------------------

describe("EB05-021 Alvida", () => {
  covers("EB05-021", "[On Play]");

  it("draws two, plays a Cross Guild Character of cost 8, then locks Character plays", () => {
    const game = table("eb05-021-play")
      .withHand("p1", [
        instance("alvida", "EB05-021"),
        instance("croc", "ST25-003"),
        instance("later", "OP16-023"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-021" });
    // Two drawn before the pick: the deck's top cards are now in hand.
    expect(ids(game.state.players.p1.hand)).toEqual(
      expect.arrayContaining(["deck-1", "deck-2"]),
    );
    pick(game, "croc");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["alvida", "croc"]);
    // Nine DON!! for Alvida, one left: enough for a 1-cost body, but the
    // lock is up for the rest of the turn.
    expect(playOffered(game, "later")).toBe(false);
  });

  it("will not play a Cross Guild Character of cost 9", () => {
    const game = table("eb05-021-cost-nine")
      .withHand("p1", [
        instance("alvida", "EB05-021"),
        instance("alvida-2", "EB05-021"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-021" });
    expect(effectOptions(game)).not.toContain("alvida-2");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["alvida"]);
  });

  it("only reaches Cross Guild cards", () => {
    const game = table("eb05-021-type")
      .withHand("p1", [
        instance("alvida", "EB05-021"),
        instance("jango", "OP12-045"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-021" });
    expect(effectOptions(game)).not.toContain("jango");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["alvida"]);
  });

  it("locks Character plays even when nothing is played", () => {
    const game = table("eb05-021-decline")
      .withHand("p1", [
        instance("alvida", "EB05-021"),
        instance("croc", "ST25-003"),
        instance("later", "OP16-023"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-021" });
    pick(game, "done");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["alvida"]);
    expect(playOffered(game, "later")).toBe(false);
    expect(ids(game.state.players.p1.hand)).toContain("croc");
  });

  it("lifts the lock once the turn ends", () => {
    const game = table("eb05-021-expiry")
      .withHand("p1", [
        instance("alvida", "EB05-021"),
        instance("later", "OP16-023"),
      ])
      .withDeckTop("p2", copies(5, "ST31-002", "p2-deck"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-021" });
    settle(game);
    expect(playOffered(game, "later")).toBe(false);
    game.pass();
    game.pass();

    // "During this turn": back on p1's next turn the same card plays.
    expect(game.state.activePlayer).toBe("p1");
    expect(playOffered(game, "later")).toBe(true);
  });
});

describe("EB05-021 Alvida's attack", () => {
  covers("EB05-021", "[When Attacking]");

  it("negates an opposing Character's text for the turn", () => {
    const game = table("eb05-021-attack")
      .withBoard("p1", [character("alvida", "EB05-021")])
      .withBoard("p2", [character("maynard", "OP05-052", { rested: true })])
      .build();

    expect(hasKeyword(game.state, "p2", "maynard", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "alvida",
      targetInstanceId: "maynard",
    });
    pick(game, "maynard");
    settle(game);

    expect(hasKeyword(game.state, "p2", "maynard", "Blocker")).toBe(false);
  });

  it("may negate nothing", () => {
    const game = table("eb05-021-attack-decline")
      .withBoard("p1", [character("alvida", "EB05-021")])
      .withBoard("p2", [character("maynard", "OP05-052", { rested: true })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "alvida",
      targetInstanceId: "maynard",
    });
    expect(effectOptions(game)).toContain("done");
    pick(game, "done");
    settle(game);

    expect(hasKeyword(game.state, "p2", "maynard", "Blocker")).toBe(true);
  });
});

// --- EB05-022 Octopako --------------------------------------------------------

describe("EB05-022 Octopako", () => {
  covers("EB05-022", "[On K.O.]");

  it("draws two when it is K.O.'d in battle", () => {
    const game = defending("eb05-022-ko")
      .withBoard("p1", [character("octopako", "EB05-022", { rested: true })])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "octopako",
    });
    while (game.state.phase === "block" || game.state.phase === "counter") {
      game.pass();
    }
    settle(game);

    expect(ids(game.state.players.p1.trash)).toContain("octopako");
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 2);
  });
});

// --- EB05-023 Osome -----------------------------------------------------------

describe("EB05-023 Osome", () => {
  covers("EB05-023", "[On Play]");

  it("trashes two Events to draw three", () => {
    const game = table("eb05-023-pay")
      .withHand("p1", [
        instance("osome", "EB05-023"),
        ...copies(2, "OP06-038", "event"),
        instance("body", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-023" });
    applyOptional(game);
    // Only Events are on offer for the cost.
    expect(effectOptions(game)).not.toContain("body");
    pick(game, "event-1");
    pick(game, "event-2");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["event-1", "event-2"]);
    expect(ids(game.state.players.p1.hand)).toEqual([
      "body",
      "deck-1",
      "deck-2",
      "deck-3",
    ]);
  });

  it("draws nothing with only one Event to pay", () => {
    const game = table("eb05-023-short")
      .withHand("p1", [
        instance("osome", "EB05-023"),
        instance("event-1", "OP06-038"),
        instance("body", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-023" });
    applyOptional(game);
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["event-1", "body"]);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("may be declined", () => {
    const game = table("eb05-023-decline")
      .withHand("p1", [
        instance("osome", "EB05-023"),
        ...copies(2, "OP06-038", "event"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-023" });
    pick(game, "skip");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["event-1", "event-2"]);
  });
});

// --- EB05-024 Little Sadi -----------------------------------------------------

describe("EB05-024 Little Sadi", () => {
  covers("EB05-024", "static");

  it("gains [Blocker] and +2 cost behind an {Impel Down} Leader", () => {
    const game = table("eb05-024-on")
      .withLeader("p1", IMPEL_DOWN_LEADER)
      .withBoard("p1", [character("sadi", "EB05-024")])
      .build();

    expect(hasKeyword(game.state, "p1", "sadi", "Blocker")).toBe(true);
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(3);
  });

  it("is a plain 1-cost behind any other Leader", () => {
    const game = table("eb05-024-off")
      .withBoard("p1", [character("sadi", "EB05-024")])
      .build();

    expect(hasKeyword(game.state, "p1", "sadi", "Blocker")).toBe(false);
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(1);
  });

  it("is still a 1-cost to play: the +2 is read on the field only", () => {
    const game = table("eb05-024-hand")
      .withLeader("p1", IMPEL_DOWN_LEADER)
      .withDon("p1", { rested: 9 })
      .withHand("p1", [instance("sadi", "EB05-024")])
      .build();

    expect(game.state.players.p1.activeDon).toHaveLength(1);
    game.play({ type: "play-card", cardNumber: "EB05-024" });
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["sadi"]);
  });

  it("blocks an attack on the Leader", () => {
    const game = defending("eb05-024-block")
      .withLeader("p1", IMPEL_DOWN_LEADER)
      .withBoard("p1", [character("sadi", "EB05-024")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "sadi" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("sadi");
  });

  it("cannot block behind any other Leader", () => {
    const game = defending("eb05-024-no-block")
      .withBoard("p1", [character("sadi", "EB05-024")])
      .withBoard("p2", [character("attacker", "ST31-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });
});

// --- EB05-025 Domino ----------------------------------------------------------

describe("EB05-025 Domino", () => {
  covers("EB05-025", "[On Play]");

  it("finds an {Impel Down} card in the top three and bottoms the rest", () => {
    const game = table("eb05-025-hit")
      .withHand("p1", [instance("domino", "EB05-025")])
      .withDeckTop("p1", [
        instance("top-1", "ST31-002"),
        instance("saldeath", "OP11-064"),
        instance("top-3", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-025" });
    pick(game, "saldeath");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["saldeath"]);
    expect(ids(game.state.players.p1.deck.slice(-2)).sort()).toEqual([
      "top-1",
      "top-3",
    ]);
  });

  it("finds nothing deeper than three", () => {
    const game = table("eb05-025-miss")
      .withHand("p1", [instance("domino", "EB05-025")])
      .withDeckTop("p1", [
        ...copies(3, "ST31-002", "top"),
        instance("saldeath", "OP11-064"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-025" });
    expect(effectOptions(game)).not.toContain("saldeath");
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("saldeath");
  });
});

describe("EB05-025 Domino's Trigger", () => {
  covers("EB05-025", "[Trigger]");

  it("runs the [On Play] search off a Life card", () => {
    const game = table("eb05-025-trigger")
      .withBoard("p1", [character("attacker", "ST31-002")])
      .withLife("p2", [instance("life-domino", "EB05-025")])
      .withDeckTop("p2", [
        instance("saldeath", "OP11-064"),
        ...copies(2, "ST31-002", "p2-top"),
      ])
      .build();

    flipLifeTrigger(game);
    pick(game, "saldeath");
    settle(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["saldeath"]);
    expect(ids(game.state.players.p2.trash)).toContain("life-domino");
  });
});

// --- EB05-027 Hibari ----------------------------------------------------------

describe("EB05-027 Hibari", () => {
  covers("EB05-027", "[On Play]");

  it("draws three, trashes two, then bottoms a cost-2 Character", () => {
    const game = table("eb05-027-bury")
      .withHand("p1", [instance("hibari", "EB05-027")])
      .withBoard("p2", [character("baby5", "OP12-111")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-027" });
    pick(game, "deck-1");
    pick(game, "deck-2");
    pick(game, "baby5");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["deck-3"]);
    expect(ids(game.state.players.p1.trash)).toEqual(["deck-1", "deck-2"]);
    expect(game.state.players.p2.board).toHaveLength(0);
    // Under its owner's deck, not this player's.
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("baby5");
  });

  it("can bottom one of its controller's own Characters", () => {
    const game = table("eb05-027-own")
      .withHand("p1", [instance("hibari", "EB05-027")])
      .withBoard("p1", [character("own", "OP12-111")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-027" });
    pick(game, "deck-1");
    pick(game, "deck-2");
    pick(game, "own");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["hibari"]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("own");
  });

  it("does not reach a cost-3 Character, and may bottom nothing", () => {
    const game = table("eb05-027-cost-three")
      .withHand("p1", [instance("hibari", "EB05-027")])
      .withBoard("p2", [
        character("bellamy", "OP05-035"),
        character("baby5", "OP12-111"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-027" });
    pick(game, "deck-1");
    pick(game, "deck-2");
    expect(effectOptions(game)).toContain("baby5");
    expect(effectOptions(game)).not.toContain("bellamy");
    pick(game, "done");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["bellamy", "baby5"]);
  });
});

// --- EB05-028 Boa Hancock -----------------------------------------------------

describe("EB05-028 Boa Hancock", () => {
  covers("EB05-028", "[On Play]");

  it("makes an opponent holding nine cards trash four", () => {
    const game = table("eb05-028-nine")
      .withHand("p1", [instance("hancock", "EB05-028")])
      .withHand("p2", copies(9, "ST31-002", "theirs"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-028" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(5);
    expect(game.state.players.p2.trash).toHaveLength(4);
  });

  it("does nothing to a hand of eight", () => {
    const game = table("eb05-028-eight")
      .withHand("p1", [instance("hancock", "EB05-028")])
      .withHand("p2", copies(8, "ST31-002", "theirs"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-028" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(8);
    expect(game.state.players.p2.trash).toHaveLength(0);
  });
});

// --- EB05-029 Kimono Sleeve Cage ----------------------------------------------

describe("EB05-029 Kimono Sleeve Cage", () => {
  covers("EB05-029", "[Main]");

  it("trashes a card to negate and bounce a cost-6 Character", () => {
    const game = table("eb05-029-main")
      .withHand("p1", [
        instance("event", "EB05-029"),
        instance("fodder", "ST31-002"),
      ])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-029]" });
    applyOptional(game);
    pick(game, "fodder");
    pick(game, "jango");
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(
      expect.arrayContaining(["event", "fodder"]),
    );
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(ids(game.state.players.p2.hand)).toEqual(["jango"]);
  });

  it("does not reach a cost-7 Character", () => {
    const game = table("eb05-029-cost-seven")
      .withHand("p1", [
        instance("event", "EB05-029"),
        instance("fodder", "ST31-002"),
      ])
      .withBoard("p2", [character("hawkins", "OP08-089")])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-029]" });
    applyOptional(game);
    pick(game, "fodder");
    expect(effectOptions(game)).not.toContain("hawkins");
    settle(game);

    expect(ids(game.state.players.p2.board)).toEqual(["hawkins"]);
  });

  it("is not offered with no other card in hand to pay", () => {
    const game = table("eb05-029-no-cost")
      .withHand("p1", [instance("event", "EB05-029")])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    expect(eventOffered(game, "EB05-029")).toBe(false);
  });

  it("keeps the hand card when the cost is declined", () => {
    const game = table("eb05-029-decline")
      .withHand("p1", [
        instance("event", "EB05-029"),
        instance("fodder", "ST31-002"),
      ])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-029]" });
    pick(game, "skip");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["fodder"]);
    expect(ids(game.state.players.p2.board)).toEqual(["jango"]);
  });
});

describe("EB05-029 Kimono Sleeve Cage's Trigger", () => {
  covers("EB05-029", "[Trigger]");

  it("draws two and trashes one", () => {
    const game = table("eb05-029-trigger")
      .withBoard("p1", [character("attacker", "ST31-002")])
      .withLife("p2", [instance("life-cage", "EB05-029")])
      .withDeckTop("p2", copies(2, "ST31-002", "p2-top"))
      .build();

    flipLifeTrigger(game);
    pick(game, "p2-top-1");
    settle(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["p2-top-2"]);
    expect(ids(game.state.players.p2.trash)).toEqual(
      expect.arrayContaining(["life-cage", "p2-top-1"]),
    );
  });
});

// --- EB05-030 Take Care, Everybody. -------------------------------------------

describe("EB05-030 Take Care, Everybody.", () => {
  covers("EB05-030", "[Main]");

  it("bounces a cost-5 Character behind a [Nami] Leader", () => {
    const game = table("eb05-030-main")
      .withLeader("p1", NAMI_LEADER)
      .withHand("p1", [instance("event", "EB05-030")])
      .withBoard("p2", [character("sengoku", "OP06-049")])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-030]" });
    pick(game, "sengoku");
    settle(game);

    expect(ids(game.state.players.p2.hand)).toEqual(["sengoku"]);
  });

  it("can return its controller's own Character, to its owner's hand", () => {
    const game = table("eb05-030-own")
      .withLeader("p1", NAMI_LEADER)
      .withHand("p1", [instance("event", "EB05-030")])
      .withBoard("p1", [character("own", "OP06-049")])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-030]" });
    pick(game, "own");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["own"]);
  });

  it("does not reach a cost-6 Character", () => {
    const game = table("eb05-030-cost-six")
      .withLeader("p1", NAMI_LEADER)
      .withHand("p1", [instance("event", "EB05-030")])
      .withBoard("p2", [
        character("jango", "OP12-045"),
        character("sengoku", "OP06-049"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-030]" });
    expect(effectOptions(game)).toContain("sengoku");
    expect(effectOptions(game)).not.toContain("jango");
    pick(game, "done");
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(2);
  });

  it("is not offered behind any other Leader", () => {
    const game = table("eb05-030-wrong-leader")
      .withHand("p1", [instance("event", "EB05-030")])
      .withBoard("p2", [character("sengoku", "OP06-049")])
      .build();

    expect(eventOffered(game, "EB05-030")).toBe(false);
  });
});

describe("EB05-030 Take Care, Everybody.'s Counter", () => {
  covers("EB05-030", "[Counter]");

  it("draws one and gives the Leader +1000 for the turn", () => {
    const game = counterStep("eb05-030-counter")
      .withHand("p1", [instance("event", "EB05-030")])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    pick(game, "p1-leader");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6000);
  });

  it("may put the +1000 on a Character outside the battle", () => {
    const game = counterStep("eb05-030-counter-character")
      .withHand("p1", [instance("event", "EB05-030")])
      .withBoard("p1", [character("bench", "ST31-002")])
      .build();

    const before = currentPower(game.state, "p1", "bench");
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    pick(game, "bench");
    settle(game);

    expect(currentPower(game.state, "p1", "bench")).toBe(before + 1000);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });
});

// --- EB05-031 Vinsmoke Reiju --------------------------------------------------

describe("EB05-031 Vinsmoke Reiju", () => {
  covers("EB05-031", "[On Play]");

  it("returns a DON!! to trash the top ten behind a {The Vinsmoke Family} Leader", () => {
    const game = table("eb05-031-on-play")
      .withLeader("p1", VINSMOKE_LEADER)
      .withHand("p1", [instance("reiju", "EB05-031")])
      .withDeckTop("p1", copies(2, "ST31-002", "extra"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-031" });
    applyOptional(game);
    returnDon(game);
    settle(game);

    expect(fieldDon(game.state, "p1")).toBe(9);
    expect(game.state.players.p1.trash).toHaveLength(10);
    // Twelve in the deck: ten milled, and OP06-042's own Leader draws one
    // for the returned DON!!.
    expect(game.state.players.p1.deck).toHaveLength(1);
  });

  it("mills nothing behind any other Leader, even once paid", () => {
    const game = table("eb05-031-wrong-leader")
      .withHand("p1", [instance("reiju", "EB05-031")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-031" });
    applyOptional(game);
    returnDon(game);
    settle(game);

    expect(fieldDon(game.state, "p1")).toBe(9);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("may be declined", () => {
    const game = table("eb05-031-decline")
      .withLeader("p1", VINSMOKE_LEADER)
      .withHand("p1", [instance("reiju", "EB05-031")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-031" });
    pick(game, "skip");
    settle(game);

    expect(fieldDon(game.state, "p1")).toBe(10);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("EB05-031 Vinsmoke Reiju's activation", () => {
  covers("EB05-031", "[Activate: Main]");

  it("trashes itself for four active DON!! against an 8000", () => {
    const game = table("eb05-031-activate")
      .withDonDeck("p1", 5)
      .withBoard("p1", [character("reiju", "EB05-031")])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "reiju" });
    applyOptional(game);
    settle(game);

    expect(ids(game.state.players.p1.trash)).toEqual(["reiju"]);
    expect(game.state.players.p1.activeDon).toHaveLength(9);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("adds only what the DON!! deck holds", () => {
    const game = table("eb05-031-short-deck")
      .withDonDeck("p1", 2)
      .withBoard("p1", [character("reiju", "EB05-031")])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "reiju" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.activeDon).toHaveLength(10);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("is not offered against a 7000, however buffed", () => {
    const game = table("eb05-031-base-power")
      .withDonDeck("p1", 5)
      .withBoard("p1", [character("reiju", "EB05-031")])
      .withBoard("p2", [character("sengoku", "OP06-049")])
      .withGivenDon("p2", "sengoku", 2)
      .build();

    // 9000 now, but the clause reads base power.
    expect(currentPower(game.state, "p2", "sengoku")).toBe(9000);
    expect(activateOffered(game, "reiju")).toBe(false);
  });
});

// --- EB05-033 Nico Robin ------------------------------------------------------

describe("EB05-033 Nico Robin", () => {
  covers("EB05-033", "[On Play]");

  it("draws three, trashes two and adds four rested DON!! at six behind", () => {
    const game = table("eb05-033-on-play")
      .withLeader("p1", STRAW_HAT_LEADER)
      .withDonDeck("p1", 6)
      .withHand("p1", [instance("robin", "EB05-033")])
      .build();

    // Four on the field against the opponent's ten: exactly six fewer.
    expect(fieldDon(game.state, "p1")).toBe(4);
    game.play({ type: "play-card", cardNumber: "EB05-033" });
    pick(game, "deck-1");
    pick(game, "deck-2");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["deck-3"]);
    expect(fieldDon(game.state, "p1")).toBe(8);
    // Robin's own cost rested one; the four added are rested too.
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });

  it("does nothing at five behind", () => {
    const game = table("eb05-033-five-behind")
      .withLeader("p1", STRAW_HAT_LEADER)
      .withDonDeck("p1", 5)
      .withHand("p1", [instance("robin", "EB05-033")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-033" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(fieldDon(game.state, "p1")).toBe(5);
  });

  it("does nothing behind a Leader without {Straw Hat Crew}", () => {
    const game = table("eb05-033-wrong-leader")
      .withDonDeck("p1", 6)
      .withHand("p1", [instance("robin", "EB05-033")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-033" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(fieldDon(game.state, "p1")).toBe(4);
  });
});

// --- EB05-034 Sugar -----------------------------------------------------------

describe("EB05-034 Sugar", () => {
  covers("EB05-034", "[On Play]");

  it("returns two DON!! and gives −4000 with seven left", () => {
    const game = table("eb05-034-on-play")
      .withDonDeck("p1", 1)
      .withHand("p1", [instance("sugar", "EB05-034")])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-034" });
    applyOptional(game);
    returnDon(game);
    pick(game, "jango");
    settle(game);

    expect(fieldDon(game.state, "p1")).toBe(7);
    expect(currentPower(game.state, "p2", "jango")).toBe(4000);
  });

  it("may be declined", () => {
    const game = table("eb05-034-decline")
      .withHand("p1", [instance("sugar", "EB05-034")])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-034" });
    pick(game, "skip");
    settle(game);

    expect(fieldDon(game.state, "p1")).toBe(10);
    expect(currentPower(game.state, "p2", "jango")).toBe(8000);
  });
});

// --- EB05-035 Speed -----------------------------------------------------------

describe("EB05-035 Speed", () => {
  covers("EB05-035", "[On Play]");

  it("returns a DON!!, finds two {SMILE} cards and plays two 5000-or-less", () => {
    const game = table("eb05-035-on-play")
      .withHand("p1", [instance("speed", "EB05-035")])
      .withDeckTop("p1", [
        instance("sheepshead", "OP08-083"),
        instance("fourtricks", "EB01-025"),
        instance("mizerka", "OP12-092"),
        ...copies(2, "ST31-002", "top"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-035" });
    applyOptional(game);
    returnDon(game);
    pick(game, "sheepshead");
    pick(game, "fourtricks");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual([
      "speed",
      "sheepshead",
      "fourtricks",
    ]);
    expect(fieldDon(game.state, "p1")).toBe(9);
    // The other three go to the bottom.
    expect(ids(game.state.players.p1.deck.slice(-3)).sort()).toEqual([
      "mizerka",
      "top-1",
      "top-2",
    ]);
  });

  it("will not play a {SMILE} card above 5000 power", () => {
    const game = table("eb05-035-power")
      .withHand("p1", [
        instance("speed", "EB05-035"),
        instance("mizerka", "OP12-092"),
        instance("fourtricks", "EB01-025"),
      ])
      .withDeckTop("p1", copies(5, "ST31-002", "top"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-035" });
    applyOptional(game);
    returnDon(game);
    expect(effectOptions(game)).toContain("fourtricks");
    expect(effectOptions(game)).not.toContain("mizerka");
    pick(game, "fourtricks");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["speed", "fourtricks"]);
  });

  it("may be declined", () => {
    const game = table("eb05-035-decline")
      .withHand("p1", [
        instance("speed", "EB05-035"),
        instance("fourtricks", "EB01-025"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-035" });
    pick(game, "skip");
    settle(game);

    expect(ids(game.state.players.p1.board)).toEqual(["speed"]);
    expect(fieldDon(game.state, "p1")).toBe(10);
  });
});

// --- EB05-036 Tsuru -----------------------------------------------------------

describe("EB05-036 Tsuru", () => {
  covers("EB05-036", "[On Play]");

  it("draws one and adds a rested DON!! behind a {Navy} Leader", () => {
    const game = table("eb05-036-on-play")
      .withLeader("p1", NAVY_LEADER)
      .withDonDeck("p1", 2)
      .withHand("p1", [instance("tsuru", "EB05-036")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-036" });
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expect(fieldDon(game.state, "p1")).toBe(9);
    // Four paid for Tsuru, one added rested.
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });

  it("does nothing behind any other Leader", () => {
    const game = table("eb05-036-wrong-leader")
      .withDonDeck("p1", 2)
      .withHand("p1", [instance("tsuru", "EB05-036")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-036" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(fieldDon(game.state, "p1")).toBe(8);
  });
});

// --- EB05-037 Black Maria -----------------------------------------------------

describe("EB05-037 Black Maria", () => {
  covers("EB05-037", "[On Play]");

  it("finds an {Animal Kingdom Pirates} card in the top three", () => {
    const game = table("eb05-037-hit")
      .withHand("p1", [instance("maria", "EB05-037")])
      .withDeckTop("p1", [
        instance("top-1", "ST31-002"),
        instance("top-2", "ST31-002"),
        instance("ulti", "OP08-078"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-037" });
    pick(game, "ulti");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["ulti"]);
  });

  it("may take nothing", () => {
    const game = table("eb05-037-decline")
      .withHand("p1", [instance("maria", "EB05-037")])
      .withDeckTop("p1", [
        instance("ulti", "OP08-078"),
        ...copies(2, "ST31-002", "top"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-037" });
    pick(game, "done");
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

// --- EB05-038 Russian ---------------------------------------------------------

describe("EB05-038 Russian", () => {
  covers("EB05-038", "[On Play]");

  it("gives a [Senor Pink] +3000 for the turn", () => {
    const game = table("eb05-038-on-play")
      .withHand("p1", [instance("russian", "EB05-038")])
      .withBoard("p1", [
        character("pink", "OP14-065"),
        character("other", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-038" });
    expect(effectOptions(game)).not.toContain("other");
    pick(game, "pink");
    settle(game);

    expect(currentPower(game.state, "p1", "pink")).toBe(8000);
  });

  it("finds nothing without a [Senor Pink]", () => {
    const game = table("eb05-038-none")
      .withHand("p1", [instance("russian", "EB05-038")])
      .withBoard("p1", [character("other", "ST31-002")])
      .build();

    const before = currentPower(game.state, "p1", "other");
    game.play({ type: "play-card", cardNumber: "EB05-038" });
    settle(game);

    expect(currentPower(game.state, "p1", "other")).toBe(before);
  });
});

// --- EB05-039 Pink Hornet -----------------------------------------------------

describe("EB05-039 Pink Hornet", () => {
  covers("EB05-039", "[Main]");

  it("returns a DON!! for −4000 behind a {The Vinsmoke Family} Leader", () => {
    const game = table("eb05-039-main")
      .withLeader("p1", VINSMOKE_LEADER)
      .withHand("p1", [instance("event", "EB05-039")])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-039]" });
    returnDon(game);
    pick(game, "jango");
    settle(game);

    expect(fieldDon(game.state, "p1")).toBe(9);
    expect(currentPower(game.state, "p2", "jango")).toBe(4000);
  });

  it("is not offered behind any other Leader", () => {
    const game = table("eb05-039-wrong-leader")
      .withHand("p1", [instance("event", "EB05-039")])
      .withBoard("p2", [character("jango", "OP12-045")])
      .build();

    expect(eventOffered(game, "EB05-039")).toBe(false);
  });
});

describe("EB05-039 Pink Hornet's Counter", () => {
  covers("EB05-039", "[Counter]");

  it("returns a DON!! for +4000 on the Leader", () => {
    const game = counterStep("eb05-039-counter")
      .withHand("p1", [instance("event", "EB05-039")])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(fieldDon(game.state, "p1")).toBe(9);
  });
});

// --- EB05-040 You Need Me, Don't You?! ----------------------------------------

describe("EB05-040 You Need Me, Don't You?!", () => {
  covers("EB05-040", "[Main]");

  it("returns an active DON!! to draw three and trash one", () => {
    const game = table("eb05-040-main")
      .withLeader("p1", DONQUIXOTE_LEADER)
      .withDon("p1", { rested: 4 })
      .withHand("p1", [instance("event", "EB05-040")])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-040]" });
    applyOptional(game);
    pick(game, "deck-1");
    settle(game);

    expect(ids(game.state.players.p1.hand)).toEqual(["deck-2", "deck-3"]);
    // Paid from the active pile: the rested four are untouched.
    expect(game.state.players.p1.restedDon).toHaveLength(4);
    expect(game.state.players.p1.activeDon).toHaveLength(5);
  });

  it("is not offered with no active DON!!", () => {
    const game = table("eb05-040-all-rested")
      .withLeader("p1", DONQUIXOTE_LEADER)
      .withDon("p1", { rested: 10 })
      .withHand("p1", [instance("event", "EB05-040")])
      .build();

    expect(eventOffered(game, "EB05-040")).toBe(false);
  });

  it("is not offered behind any other Leader", () => {
    const game = table("eb05-040-wrong-leader")
      .withHand("p1", [instance("event", "EB05-040")])
      .build();

    expect(eventOffered(game, "EB05-040")).toBe(false);
  });

  it("keeps the DON!! when the cost is declined", () => {
    const game = table("eb05-040-decline")
      .withLeader("p1", DONQUIXOTE_LEADER)
      .withHand("p1", [instance("event", "EB05-040")])
      .build();

    game.play({ type: "activate-main", summary: "[EB05-040]" });
    pick(game, "skip");
    settle(game);

    expect(fieldDon(game.state, "p1")).toBe(10);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("EB05-040 You Need Me, Don't You?!'s Counter", () => {
  covers("EB05-040", "[Counter]");

  it("gives the Leader +2000 for nothing", () => {
    const game = counterStep("eb05-040-counter")
      .withHand("p1", [instance("event", "EB05-040")])
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2000);
    expect(fieldDon(game.state, "p1")).toBe(10);
  });
});
