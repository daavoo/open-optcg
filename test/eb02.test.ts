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
 * EXTRA BOOSTER -ANIME 25TH COLLECTION- [EB-02], as a whole-set import.
 *
 * `packages/cards/src/eb02.ts` explains where the records come from; this file
 * is what holds the behaviour. One of the set's 61 identities was already in
 * the pool as a card a community deck plays -- EB02-017 Nami, driven by
 * `test/op17-luffy-ace.test.ts` -- so what is here is the other 60.
 *
 * ## The rules the import added
 *
 * Three, each because a printed clause could not otherwise be expressed:
 * `sameNameAsBinding` on `CardSelector` (EB02-039, whose target is named by the
 * card the same program just trashed), `from: "active"` on `return-don`
 * (EB02-061, the only printed return in the pool that names a pile), and a K.O.
 * replacement installed on the *player* for a window rather than printed on a
 * card on the field (EB02-030, whose `[Counter]` buys the turn's protection and
 * is in the trash before the first Character is threatened). Every one is
 * driven from the card here rather than from the primitive: a rule that fires
 * in a unit test and never in a game is not support.
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

/**
 * p1 acting in its own Main Phase, with ten DON!! active.
 *
 * ST31's Leader is ST21-001 Monkey.D.Luffy, a {Straw Hat Crew} Leader, so the
 * five clauses in this set gated on that type are live by default here and
 * `withLeader` is what turns them off for the negative case.
 */
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
 * indistinguishable, so a test that always plays `"apply"` is asserting on the
 * prompt rather than on the card. This asks.
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

/** The instance ids on a player's board, in board order. */
const boardNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.cardNumber);

/** One board card by instance id. */
const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

const handNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].hand.map((card) => card.cardNumber);

describe("EB02-002 Sabo", () => {
  covers("EB02-002", "[Activate: Main]");

  it("rests itself to hand a {Revolutionary Army} teammate +2000", () => {
    const game = table("eb02-002-activate")
      .withBoard("p1", [
        character("sabo", "EB02-002"),
        // OP12-093 Morley is a 4-cost {Revolutionary Army} Character.
        character("morley", "OP12-093"),
      ])
      .build();

    const before = currentPower(game.state, "p1", "morley");
    game.play({ type: "activate-main", cardNumber: "EB02-002" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "sabo")?.rested).toBe(true);
    expect(currentPower(game.state, "p1", "morley")).toBe(before + 2_000);
  });

  it("does not offer another [Sabo], which the printed text excludes", () => {
    const game = table("eb02-002-other-sabo")
      .withBoard("p1", [
        character("sabo", "EB02-002"),
        character("twin", "EB02-002"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-002" });
    applyOptional(game);

    // Both copies answer to [Sabo], so neither is a target and the `choose`
    // with nothing eligible is skipped outright.
    expect(game.state.pendingEffect).toBeNull();
    expect(currentPower(game.state, "p1", "twin")).toBe(5_000);
  });

  it("is not offered once it is already rested", () => {
    const game = table("eb02-002-rested")
      .withBoard("p1", [character("sabo", "EB02-002", { rested: true })])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB02-002",
        ),
    ).toBe(false);
  });
});

describe("EB02-003 Tony Tony.Chopper", () => {
  covers("EB02-003", "[On Play]", "[Opponent's Turn]");

  it("gives a rested DON!! to the Leader behind a {Straw Hat Crew} Leader", () => {
    const game = table("eb02-003-on-play")
      .withHand("p1", [instance("chopper", "EB02-003")])
      .withDon("p1", { active: 5, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-003" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("can point the DON!! at a Character instead", () => {
    const game = table("eb02-003-character")
      .withHand("p1", [instance("chopper", "EB02-003")])
      .withBoard("p1", [character("target", "EB02-001")])
      .withDon("p1", { active: 5, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-003" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "target")?.attachedDon).toHaveLength(1);
  });

  it("gives nothing behind another Leader", () => {
    const game = table("eb02-003-wrong-leader")
      .withLeader("p1", "OP15-001")
      .withHand("p1", [instance("chopper", "EB02-003")])
      .withDon("p1", { active: 5, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-003" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
  });

  it("defends at 5000 with two DON!! on it, and attacks at 3000", () => {
    const game = defending("eb02-003-static")
      .withBoard("p1", [character("chopper", "EB02-003")])
      .withGivenDon("p1", "chopper", 2)
      .build();

    // p2 is the turn player, so the `[Opponent's Turn]` half is live: 3000
    // printed, +2000 from the clause, +2000 from the DON!! themselves.
    expect(currentPower(game.state, "p1", "chopper")).toBe(7_000);
  });

  it("adds nothing with one DON!! on it", () => {
    const game = defending("eb02-003-one-don")
      .withBoard("p1", [character("chopper", "EB02-003")])
      .withGivenDon("p1", "chopper", 1)
      .build();

    expect(currentPower(game.state, "p1", "chopper")).toBe(4_000);
  });
});

describe("EB02-005 Fake Straw Hat Crew", () => {
  covers("EB02-005", "[Your Turn]", "[Opponent's Turn]");

  it("attacks as a 5000 and defends as a 1000", () => {
    const attacking = table("eb02-005-own-turn")
      .withBoard("p1", [character("fake", "EB02-005")])
      .build();
    expect(currentPower(attacking.state, "p1", "fake")).toBe(5_000);

    const blocking = defending("eb02-005-their-turn")
      .withBoard("p1", [character("fake", "EB02-005")])
      .build();
    expect(currentPower(blocking.state, "p1", "fake")).toBe(1_000);
  });
});

describe("EB02-006 Yamato", () => {
  covers("EB02-006", "[Activate: Main]");

  it("gifts the Leader a rested DON!! and takes [Rush] behind a {Land of Wano} Leader", () => {
    const game = table("eb02-006-activate")
      .withLeader("p1", "OP06-022")
      .withBoard("p1", [character("yamato", "EB02-006", { playedTurn: 11 })])
      .withDon("p1", { active: 5, rested: 2 })
      .build();

    expect(hasKeyword(game.state, "p1", "yamato", "Rush")).toBe(false);
    game.play({ type: "activate-main", cardNumber: "EB02-006" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(hasKeyword(game.state, "p1", "yamato", "Rush")).toBe(true);
  });

  it("takes [Rush] with no rested DON!! to give, which the printed 'up to' allows", () => {
    const game = table("eb02-006-no-don")
      .withLeader("p1", "OP06-022")
      .withBoard("p1", [character("yamato", "EB02-006", { playedTurn: 11 })])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-006" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "yamato", "Rush")).toBe(true);
  });

  it("is offered behind [Portgas.D.Ace] too", () => {
    const game = table("eb02-006-ace")
      .withLeader("p1", "OP16-001")
      .withBoard("p1", [character("yamato", "EB02-006", { playedTurn: 11 })])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-006" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "yamato", "Rush")).toBe(true);
  });

  it("is not offered at all behind any other Leader", () => {
    const game = table("eb02-006-wrong-leader")
      .withBoard("p1", [character("yamato", "EB02-006", { playedTurn: 11 })])
      .withDon("p1", { active: 5, rested: 2 })
      .build();

    // The Leader gate is the program's whole condition, so the engine
    // withholds the activation rather than offering one that resolves to
    // nothing.
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB02-006",
        ),
    ).toBe(false);
  });

  it("is offered only once per turn", () => {
    const game = table("eb02-006-once")
      .withLeader("p1", "OP06-022")
      .withBoard("p1", [character("yamato", "EB02-006", { playedTurn: 11 })])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-006" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB02-006",
        ),
    ).toBe(false);
  });
});

describe("EB02-007 Cloven Rose Blizzard", () => {
  covers("EB02-007", "[Main]", "[Trigger]");

  it("spreads +1000 over three of its own cards and K.O.s a 3000", () => {
    const game = table("eb02-007-main")
      .withHand("p1", [instance("event", "EB02-007")])
      .withBoard("p1", [
        character("one", "EB02-001"),
        character("two", "EB02-004"),
      ])
      // OP06-064 Vinsmoke Niji is a 3000-power Character.
      .withBoard("p2", [character("victim", "OP06-064")])
      .build();

    game.play({ type: "activate-main", summary: "[EB02-007]" });
    game.play({ type: "resolve-effect", optionId: "one" });
    game.play({ type: "resolve-effect", optionId: "two" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(currentPower(game.state, "p1", "one")).toBe(8_000);
    expect(currentPower(game.state, "p1", "two")).toBe(11_000);
    expect(boardNumbers(game, "p2")).toEqual([]);
  });

  it("does not reach a 4000 with its [Main] half", () => {
    const game = table("eb02-007-out-of-range")
      .withHand("p1", [instance("event", "EB02-007")])
      // OP06-060 Vinsmoke Ichiji is a 4000-power Character.
      .withBoard("p2", [character("survivor", "OP06-060")])
      .build();

    game.play({ type: "activate-main", summary: "[EB02-007]" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["OP06-060"]);
  });

  it("reaches a 4000 off a Life card", () => {
    // The Trigger belongs to the damaged player, so "your opponent's
    // Characters" is the attacker's board.
    const game = table("eb02-007-trigger")
      .withBoard("p1", [
        character("attacker", "EB02-001"),
        character("victim", "OP06-060"),
      ])
      .withLife("p2", [
        instance("life-event", "EB02-007"),
        instance("spare", "EB02-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual(["EB02-001"]);
  });
});

describe("the {Music} cycle: one 2-cost search per colour", () => {
  covers("EB02-008", "[Main]", "[Trigger]");
  covers("EB02-020", "[Main]", "[Trigger]");
  covers("EB02-031", "[Main]", "[Trigger]");
  covers("EB02-040", "[Main]", "[Trigger]");
  covers("EB02-050", "[Main]", "[Trigger]");
  covers("EB02-058", "[Main]", "[Trigger]");

  const CYCLE = [
    "EB02-008",
    "EB02-020",
    "EB02-031",
    "EB02-040",
    "EB02-050",
    "EB02-058",
  ] as const;

  it.each(CYCLE)("%s adds a cost-4 card off the top four", (cardNumber) => {
    const game = table(`music-${cardNumber}`)
      .withHand("p1", [instance("event", cardNumber)])
      .withDeckTop("p1", [
        // ST21-017 is a 4-cost Event; ST31-002 Jinbe is a 4-cost Character.
        instance("cheap", "EB02-012"),
        instance("hit", "ST21-017"),
        instance("filler-a", "EB02-014"),
        instance("filler-b", "EB02-017"),
      ])
      .build();

    game.play({ type: "activate-main", summary: `[${cardNumber}]` });
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("ST21-017");
    // The other three go under, and the deck is back to four on top of the
    // cards that were already there.
    expect(
      game.state.players.p1.deck.slice(-3).map((c) => c.instanceId),
    ).toEqual(["cheap", "filler-a", "filler-b"]);
  });

  it("offers nothing when the top four are all under the cost floor", () => {
    const game = table("music-no-hit")
      .withHand("p1", [instance("event", "EB02-008")])
      .withDeckTop("p1", [
        instance("a", "EB02-012"),
        instance("b", "EB02-014"),
        instance("c", "EB02-017"),
        instance("d", "EB02-013"),
      ])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "activate-main", summary: "[EB02-008]" });
    settle(game);

    // The Event left the hand and nothing came back with it.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });

  it("runs the same search off a Life card", () => {
    const game = table("music-trigger")
      .withBoard("p1", [character("attacker", "EB02-001")])
      .withLife("p2", [
        instance("life-event", "EB02-020"),
        instance("spare", "EB02-004"),
      ])
      .withDeckTop("p2", [
        instance("hit", "OP06-058"),
        instance("a", "EB02-012"),
        instance("b", "EB02-014"),
        instance("c", "EB02-017"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(handNumbers(game, "p2")).toContain("OP06-058");
  });
});

describe("EB02-009 Thousand Sunny (Stage)", () => {
  covers("EB02-009", "[Activate: Main]");

  it("moves a DON!! already given to the Leader onto a {Straw Hat Crew} body", () => {
    const game = table("eb02-009-move")
      .withStage("p1", instance("sunny", "EB02-009"))
      // ST31-002 Jinbe is a {Straw Hat Crew} Character.
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withDon("p1", { active: 6, leaderAttached: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-009" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(boardCard(game, "p1", "jinbe")?.attachedDon).toHaveLength(1);
  });

  it("is not offered with no DON!! given anywhere", () => {
    const game = table("eb02-009-nothing-given")
      .withStage("p1", instance("sunny", "EB02-009"))
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB02-009",
        ),
    ).toBe(false);
  });
});

describe("EB02-010 Monkey.D.Luffy (Leader)", () => {
  covers("EB02-010", "[Activate: Main]");

  it("returns two DON!! to set two active and buffs itself into the next turn", () => {
    const game = table("eb02-010-activate")
      .withLeader("p1", "EB02-010")
      .withDon("p1", { active: 4, rested: 4 })
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    const fieldBefore = game.state.players.p1.activeDon.length + restedBefore;

    game.play({ type: "activate-main", cardNumber: "EB02-010" });
    applyOptional(game);
    settle(game);

    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(fieldBefore - 2);
    expect(game.state.players.p1.restedDon.length).toBe(restedBefore - 4);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });

  it("pays the cost and does nothing with an off-type Character out", () => {
    const game = table("eb02-010-off-type")
      .withLeader("p1", "EB02-010")
      // OP12-093 Morley is {Revolutionary Army}, not {Straw Hat Crew}.
      .withBoard("p1", [character("morley", "OP12-093")])
      .withDon("p1", { active: 4, rested: 4 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-010" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5_000);
  });

  it("pays out on an empty board, which the printed 'only' reads as true", () => {
    const game = table("eb02-010-empty-board")
      .withLeader("p1", "EB02-010")
      .withDon("p1", { active: 4, rested: 4 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-010" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });
});

describe("EB02-011 Arlong", () => {
  covers("EB02-011", "[On Play]");

  it("ramps the Leader and stops a cost-5 body attacking or blocking", () => {
    const game = table("eb02-011-on-play")
      .withLeader("p1", "OP11-021")
      .withHand("p1", [instance("arlong", "EB02-011")])
      .withDon("p1", { active: 5, rested: 2 })
      // OP06-065 Vinsmoke Niji is a 5-cost Character.
      .withBoard("p2", [character("locked", "OP06-065")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-011" });
    game.play({ type: "resolve-effect", optionId: "locked" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(boardCard(game, "p2", "locked")?.cannotRestUntilTurn).toBe(12);
  });

  it("does not reach a 6-cost body", () => {
    const game = table("eb02-011-out-of-range")
      .withLeader("p1", "OP11-021")
      .withHand("p1", [instance("arlong", "EB02-011")])
      // OP06-061 Vinsmoke Ichiji is a 7-cost Character.
      .withBoard("p2", [character("safe", "OP06-061")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-011" });
    settle(game);

    expect(boardCard(game, "p2", "safe")?.cannotRestUntilTurn).toBeUndefined();
  });

  it("does nothing behind a Leader with neither printed type", () => {
    const game = table("eb02-011-wrong-leader")
      .withHand("p1", [instance("arlong", "EB02-011")])
      .withDon("p1", { active: 5, rested: 2 })
      .withBoard("p2", [character("safe", "OP06-065")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-011" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(boardCard(game, "p2", "safe")?.cannotRestUntilTurn).toBeUndefined();
  });

  it("bars the attack the lock is printed to bar", () => {
    const game = defending("eb02-011-cannot-attack")
      .withLeader("p2", "OP11-021")
      .withHand("p2", [instance("arlong", "EB02-011")])
      .withBoard("p1", [character("locked", "OP06-065", { playedTurn: 1 })])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-011" });
    game.play({ type: "resolve-effect", optionId: "locked" });
    settle(game);
    game.pass();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "locked",
        ),
    ).toBe(false);
  });
});

describe("EB02-012 Gaimon", () => {
  covers("EB02-012", "static");

  it("gains [Blocker] while a [Sarfunkel] is on the board", () => {
    const alone = table("eb02-012-alone")
      .withBoard("p1", [character("gaimon", "EB02-012")])
      .build();
    expect(hasKeyword(alone.state, "p1", "gaimon", "Blocker")).toBe(false);

    const paired = table("eb02-012-paired")
      .withBoard("p1", [
        character("gaimon", "EB02-012"),
        character("sarfunkel", "EB02-014"),
      ])
      .build();
    expect(hasKeyword(paired.state, "p1", "gaimon", "Blocker")).toBe(true);
  });
});

describe("EB02-013 Carrot", () => {
  covers("EB02-013", "[On Play]");

  it("digs seven for a [Zou] and plays one out of hand", () => {
    const game = table("eb02-013-dig")
      .withHand("p1", [instance("carrot", "EB02-013")])
      .withDeckTop("p1", [
        instance("zou", "OP08-039"),
        instance("a", "EB02-012"),
        instance("b", "EB02-014"),
        instance("c", "EB02-017"),
        instance("d", "EB02-001"),
        instance("e", "EB02-004"),
        instance("f", "EB02-029"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-013" });
    game.play({ type: "resolve-effect", optionId: "zou" });
    settle(game);

    // Added to hand by the search, then played into the Stage area by the
    // second half of the same sentence.
    expect(game.state.players.p1.stage?.cardNumber).toBe("OP08-039");
  });

  it("does nothing below three DON!! on the field", () => {
    const game = scenario()
      .decks(P1, P2)
      .seed("eb02-013-no-don")
      // Turn 1: one DON!! on the field, which is below the printed floor. By
      // turn 3 there are three and the gate is open.
      .atTurn(1, { active: "p1" })
      .withHand("p1", [instance("carrot", "EB02-013")])
      .withDeckTop("p1", [instance("zou", "OP08-039")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-013" });
    settle(game);

    expect(game.state.players.p1.stage).toBeNull();
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("zou");
  });
});

describe("EB02-014 Sarfunkel", () => {
  covers("EB02-014", "[On Play]");

  it("plays a [Gaimon] out of hand for free", () => {
    const game = table("eb02-014-on-play")
      .withHand("p1", [
        instance("sarfunkel", "EB02-014"),
        instance("gaimon", "EB02-012"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-014" });
    game.play({ type: "resolve-effect", optionId: "gaimon" });
    settle(game);

    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-012", "EB02-014"]);
    // And the pair is what switches the Blocker on.
    expect(hasKeyword(game.state, "p1", "gaimon", "Blocker")).toBe(true);
  });
});

describe("EB02-015 Jewelry Bonney", () => {
  covers("EB02-015", "[On Play]");

  it("holds a rested body down through the opponent's Refresh Phase", () => {
    const game = table("eb02-015-on-play")
      .withHand("p1", [instance("bonney", "EB02-015")])
      .withBoard("p2", [character("spent", "OP06-065", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-015" });
    game.play({ type: "resolve-effect", optionId: "spent" });
    settle(game);

    expect(boardCard(game, "p2", "spent")?.cannotRefreshUntilTurn).toBe(12);

    game.pass();
    // p2's own Refresh Phase has now run and the body is still rested.
    expect(boardCard(game, "p2", "spent")?.rested).toBe(true);
  });

  it("does not reach an active body", () => {
    const game = table("eb02-015-active")
      .withHand("p1", [instance("bonney", "EB02-015")])
      .withBoard("p2", [character("standing", "OP06-065")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-015" });
    settle(game);

    expect(
      boardCard(game, "p2", "standing")?.cannotRefreshUntilTurn,
    ).toBeUndefined();
  });

  it("books a DON!! to come back at the end of the turn", () => {
    const game = table("eb02-015-don-back")
      .withHand("p1", [instance("bonney", "EB02-015")])
      .withDon("p1", { active: 8, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-015" });
    settle(game);

    const restedMidTurn = game.state.players.p1.restedDon.length;
    game.pass();

    // The booking paid out at the end of the turn, before p2's turn began.
    expect(game.state.players.p1.restedDon.length).toBeLessThan(restedMidTurn);
  });
});

describe("EB02-016 Chopperman", () => {
  covers("EB02-016", "[On Play]", "static");

  it("answers to [Tony Tony.Chopper] as well as its own name", () => {
    const game = table("eb02-016-alias")
      .withHand("p1", [instance("chopperman", "EB02-016")])
      .build();

    // EB02-016's own `[On Play]` reaches an {Animal} body, and the alias is
    // what lets a search for a [Tony Tony.Chopper] find this card.
    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "EB02-016",
    );
    game.play({ type: "play-card", cardNumber: "EB02-016" });
    settle(game);
    expect(boardNumbers(game, "p1")).toEqual(["EB02-016"]);
  });

  it("plays a cost-3 {Animal} body out of hand", () => {
    const game = table("eb02-016-animal")
      .withHand("p1", [
        instance("chopperman", "EB02-016"),
        // ST26-002 Tony Tony.Chopper is a 3-cost {Animal} Character; EB02-004
        // Don Accino is neither {Animal} nor inside the cost ceiling.
        instance("animal", "ST26-002"),
        instance("other", "EB02-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-016" });
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "animal" });
    settle(game);

    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-016", "ST26-002"]);
  });
});

describe("EB02-018 Buggy", () => {
  covers("EB02-018", "[On Play]", "[Trigger]");

  it("hands the Leader [Double Attack] while it is the only [Buggy]", () => {
    const game = table("eb02-018-on-play")
      .withHand("p1", [instance("buggy", "EB02-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-018" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderDoubleAttackUntilTurn).toBe(11);
  });

  it("hands out nothing with another [Buggy] already down", () => {
    const game = table("eb02-018-second-copy")
      .withHand("p1", [instance("buggy", "EB02-018")])
      .withBoard("p1", [character("first", "EB02-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-018" });
    settle(game);

    expect(game.state.players.p1.leaderDoubleAttackUntilTurn).toBeUndefined();
  });

  it("rests a cost-4 body off a Life card", () => {
    const game = table("eb02-018-trigger")
      .withBoard("p1", [
        character("attacker", "EB02-001"),
        character("target", "OP08-093"),
      ])
      .withLife("p2", [
        instance("life-buggy", "EB02-018"),
        instance("spare", "EB02-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "target")?.rested).toBe(true);
  });
});

describe("EB02-019 Roronoa Zoro", () => {
  covers("EB02-019", "[On Play]", "static");

  it("rests a cost-4 body behind a {Straw Hat Crew} Leader", () => {
    const game = table("eb02-019-on-play")
      .withHand("p1", [instance("zoro", "EB02-019")])
      .withBoard("p2", [character("target", "OP08-093")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-019" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")?.rested).toBe(true);
  });

  it("rests nothing behind another Leader", () => {
    const game = table("eb02-019-wrong-leader")
      .withLeader("p1", "OP15-001")
      .withHand("p1", [instance("zoro", "EB02-019")])
      .withBoard("p2", [character("target", "OP08-093")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-019" });
    settle(game);

    expect(boardCard(game, "p2", "target")?.rested).toBe(false);
  });

  it("can attack a Character the turn it lands, against two or more of them", () => {
    const wide = table("eb02-019-rush")
      .withBoard("p1", [character("zoro", "EB02-019", { playedTurn: 11 })])
      .withBoard("p2", [
        character("a", "OP08-093", { rested: true }),
        character("b", "OP06-065", { rested: true }),
      ])
      .build();

    expect(hasKeyword(wide.state, "p1", "zoro", "Rush: Character")).toBe(true);
    expect(
      wide
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "zoro" &&
            action.targetInstanceId === "a",
        ),
    ).toBe(true);
  });

  it("has no such permission against one Character", () => {
    const narrow = table("eb02-019-no-rush")
      .withBoard("p1", [character("zoro", "EB02-019", { playedTurn: 11 })])
      .withBoard("p2", [character("a", "OP08-093", { rested: true })])
      .build();

    expect(hasKeyword(narrow.state, "p1", "zoro", "Rush: Character")).toBe(
      false,
    );
  });
});

describe("EB02-021 Gum-Gum Giant Pistol", () => {
  covers("EB02-021", "[Main]", "[Trigger]");

  it("buys +6000 and pays for it with the body's own next Refresh Phase", () => {
    const game = table("eb02-021-main")
      .withHand("p1", [instance("event", "EB02-021")])
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .build();

    const before = currentPower(game.state, "p1", "jinbe");
    game.play({ type: "activate-main", summary: "[EB02-021]" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(currentPower(game.state, "p1", "jinbe")).toBe(before + 6_000);
    // Turn 13 is p1's own next Refresh Phase: this turn, p2's, then theirs.
    expect(boardCard(game, "p1", "jinbe")?.cannotRefreshUntilTurn).toBe(13);
  });

  it("rests a cost-4 body off a Life card", () => {
    const game = table("eb02-021-trigger")
      .withBoard("p1", [
        character("attacker", "EB02-001"),
        character("target", "OP08-093"),
      ])
      .withLife("p2", [
        instance("life-event", "EB02-021"),
        instance("spare", "EB02-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "target")?.rested).toBe(true);
  });
});

describe("EB02-022 Usopp", () => {
  covers("EB02-022", "[On Play]");

  it("plays a vanilla body while the board is small", () => {
    const game = table("eb02-022-on-play")
      .withHand("p1", [
        instance("usopp", "EB02-022"),
        // EB02-029 Grandpa Ryu is a 5000-power Character with no printed
        // effect; EB02-001 Karoo is 7000 and outside the ceiling.
        instance("vanilla", "EB02-029"),
        instance("big", "EB02-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-022" });
    expect(effectOptions(game.state)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "vanilla" });
    settle(game);

    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-022", "EB02-029"]);
  });

  it("does nothing with three 5000s already out", () => {
    const game = table("eb02-022-wide")
      .withHand("p1", [
        instance("usopp", "EB02-022"),
        instance("vanilla", "EB02-029"),
      ])
      .withBoard("p1", [
        character("a", "EB02-029"),
        character("b", "EB02-029"),
        character("c", "EB02-029"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-022" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("EB02-029");
  });

  it("counts a 4000 body a DON!! has pushed to 5000", () => {
    const game = table("eb02-022-current-power")
      .withHand("p1", [
        instance("usopp", "EB02-022"),
        instance("vanilla", "EB02-029"),
      ])
      .withBoard("p1", [
        character("a", "EB02-029"),
        character("b", "EB02-029"),
        // OP06-060 Vinsmoke Ichiji prints 4000; the DON!! makes it a third.
        character("pumped", "OP06-060"),
      ])
      .withGivenDon("p1", "pumped", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-022" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("EB02-029");
  });
});

describe("EB02-023 Crocodile", () => {
  covers("EB02-023", "[Your Turn]");

  it("reorders the top three when its own effect bounces an opposing body", () => {
    const game = table("eb02-023-reaction")
      .withBoard("p1", [
        character("crocodile", "EB02-023"),
        // EB02-024 Sogeking's `[On Play]` is the bounce this watches.
        character("spare", "EB02-001"),
      ])
      .withHand("p1", [instance("sogeking", "EB02-024")])
      // OP07-088 Hattori is a 1-cost Character, inside Sogeking's ceiling.
      .withBoard("p2", [character("bounced", "OP07-088")])
      .withDeckTop("p1", [
        instance("a", "EB02-001"),
        instance("b", "EB02-004"),
        instance("c", "EB02-029"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-024" });
    // Sogeking draws two and puts two back, then bounces.
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("bounced") ? "bounced" : options[0]!,
      });
    }

    expect(game.state.players.p2.board).toHaveLength(0);
    // The watcher fired: its `[Once Per Turn]` key is spent.
    expect(game.state.oncePerTurn).toContain("11:p1:EB02-023:reaction");
  });

  it("stays quiet when the opponent bounces their own Character", () => {
    const game = defending("eb02-023-their-bounce")
      .withBoard("p1", [character("crocodile", "EB02-023")])
      .withHand("p2", [instance("sogeking", "EB02-024")])
      .withBoard("p2", [character("theirs", "OP07-088")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-024" });
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("theirs") ? "theirs" : options[0]!,
      });
    }

    // `[Your Turn]` and "by your effect" both fail here, so the key is
    // untouched.
    expect(game.state.oncePerTurn).not.toContain("12:p1:EB02-023:reaction");
  });
});

describe("EB02-024 Sogeking", () => {
  covers("EB02-024", "[On Play]", "static");

  it("answers to [Usopp], draws two, buries two and bounces a 1-drop", () => {
    const game = table("eb02-024-on-play")
      .withHand("p1", [instance("sogeking", "EB02-024")])
      .withBoard("p2", [
        character("cheap", "OP07-088"),
        // OP06-065 Vinsmoke Niji is a 5-cost body, outside the ceiling.
        character("expensive", "OP06-065"),
      ])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB02-024" });
    // Two cards from hand go under the deck, one at a time.
    const first = effectOptions(game.state)[0]!;
    game.play({ type: "resolve-effect", optionId: first });
    const second = effectOptions(game.state).filter(
      (option) => option !== "done",
    )[0]!;
    game.play({ type: "resolve-effect", optionId: second });
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      expect(options).not.toContain("expensive");
      game.play({
        type: "resolve-effect",
        optionId: options.includes("cheap") ? "cheap" : options[0]!,
      });
    }

    // Sogeking left the hand, two cards came in and two went under: net -1.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(boardNumbers(game, "p2")).toEqual(["OP06-065"]);
    expect(handNumbers(game, "p2")).toContain("OP07-088");
  });
});

describe("EB02-025 Donquixote Rosinante", () => {
  covers("EB02-025", "[Activate: Main]");

  it("rests a DON!! and itself to put a 2-drop down rested, behind its Leader", () => {
    const game = table("eb02-025-activate")
      .withLeader("p1", "OP12-061")
      .withBoard("p1", [character("rosinante", "EB02-025")])
      .withDeckTop("p1", [
        instance("cheap", "OP07-084"),
        instance("a", "EB02-001"),
        instance("b", "EB02-004"),
        instance("c", "EB02-029"),
        instance("d", "EB02-012"),
      ])
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "activate-main", cardNumber: "EB02-025" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settle(game);

    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 1);
    expect(boardCard(game, "p1", "rosinante")?.rested).toBe(true);
    expect(boardCard(game, "p1", "cheap")?.rested).toBe(true);
  });

  it("pays the cost and finds nothing behind another Leader", () => {
    const game = table("eb02-025-wrong-leader")
      .withBoard("p1", [character("rosinante", "EB02-025")])
      .withDeckTop("p1", [instance("cheap", "OP07-084")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-025" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "rosinante")?.rested).toBe(true);
    expect(boardNumbers(game, "p1")).toEqual(["EB02-025"]);
  });

  it("is not offered with no active DON!! to rest", () => {
    const game = table("eb02-025-no-don")
      .withLeader("p1", "OP12-061")
      .withBoard("p1", [character("rosinante", "EB02-025")])
      .withDon("p1", { rested: 10 })
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB02-025",
        ),
    ).toBe(false);
  });
});

describe("EB02-026 Nefeltari Vivi", () => {
  covers("EB02-026", "[On Play]");

  it("draws two behind a multicoloured Leader on a spent hand", () => {
    const game = table("eb02-026-on-play")
      // OP12-041 Sanji is Blue/Purple; ST30-001 Luffy & Ace is a multicoloured
      // Leader.
      .withLeader("p1", "ST30-001")
      .withHand("p1", [instance("vivi", "EB02-026")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-026" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("draws nothing behind a mono-colour Leader", () => {
    const game = table("eb02-026-mono")
      .withHand("p1", [instance("vivi", "EB02-026")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-026" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("draws nothing on a hand of six", () => {
    const game = table("eb02-026-full-hand")
      .withLeader("p1", "ST30-001")
      .withHand("p1", [
        instance("vivi", "EB02-026"),
        instance("a", "EB02-001"),
        instance("b", "EB02-004"),
        instance("c", "EB02-029"),
        instance("d", "EB02-012"),
        instance("e", "EB02-014"),
        instance("f", "EB02-017"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-026" });
    settle(game);

    // Six left behind the Vivi that went down, which is one over the ceiling.
    expect(game.state.players.p1.hand).toHaveLength(6);
  });
});

describe("EB02-027 Vista", () => {
  covers("EB02-027", "[On Play]");

  it("buries a 1000-power body under its owner's deck", () => {
    const game = table("eb02-027-on-play")
      .withHand("p1", [instance("vista", "EB02-027")])
      // OP16-024 Inazuma prints 1000; OP06-064 Vinsmoke Niji prints 3000.
      .withBoard("p2", [
        character("small", "OP16-024"),
        character("bigger", "OP06-064"),
      ])
      .build();

    const deckBefore = game.state.players.p2.deck.length;
    game.play({ type: "play-card", cardNumber: "EB02-027" });
    expect(effectOptions(game.state)).not.toContain("bigger");
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["OP06-064"]);
    expect(game.state.players.p2.deck).toHaveLength(deckBefore + 1);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("small");
  });

  it("reads current power, so a 3000 sitting at 1000 is in range", () => {
    const game = table("eb02-027-current-power")
      // EB02-005 Fake Straw Hat Crew prints 3000 and is at 1000 on its
      // controller's opponent's turn, which is now: `maxPower` would reject it
      // and `maxCurrentPower` reaches it.
      .withHand("p1", [instance("vista", "EB02-027")])
      .withBoard("p2", [character("fake", "EB02-005")])
      .build();

    expect(currentPower(game.state, "p2", "fake")).toBe(1_000);
    game.play({ type: "play-card", cardNumber: "EB02-027" });
    game.play({ type: "resolve-effect", optionId: "fake" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
  });
});

describe("EB02-028 Portgas.D.Ace", () => {
  covers("EB02-028", "[On Play]");

  it("finds a cost-2 body and puts one down rested behind a Whitebeard Leader", () => {
    const game = table("eb02-028-on-play")
      .withLeader("p1", "OP17-001")
      .withHand("p1", [instance("ace", "EB02-028")])
      .withDeckTop("p1", [
        // OP13-047 Fossa is a 2-cost {Whitebeard Pirates} Character.
        instance("fossa", "OP13-047"),
        instance("a", "EB02-001"),
        instance("b", "EB02-004"),
        instance("c", "EB02-029"),
        instance("d", "EB02-012"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-028" });
    game.play({ type: "resolve-effect", optionId: "fossa" });
    settle(game);

    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-028", "OP13-047"]);
    expect(boardCard(game, "p1", "fossa")?.rested).toBe(true);
  });

  it("does nothing behind a Leader outside the printed type", () => {
    const game = table("eb02-028-wrong-leader")
      .withHand("p1", [instance("ace", "EB02-028")])
      .withDeckTop("p1", [instance("fossa", "OP13-047")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-028" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual(["EB02-028"]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("fossa");
  });
});

describe("EB02-030 And That's When Somebody Makes Fun of Their Friend's Dream!!!!", () => {
  covers("EB02-030", "[Counter]", "[Trigger]");

  const ATTACK = {
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    attackerInstanceId: "attacker",
    targetInstanceId: "wall",
    attackPower: 9000,
    counterPower: 0,
  } as const;

  it("buys a save any of the controller's Characters may take for the rest of the turn", () => {
    const game = defending("eb02-030-counter")
      .withHand("p1", [
        instance("event", "EB02-030"),
        instance("fodder", "EB02-001"),
      ])
      .withBoard("p1", [character("wall", "EB02-029")])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.players.p1.installedReplacements).toEqual([
      { cardNumber: "EB02-030", expiresAtTurn: 12 },
    ]);
    // It is not a Counter: the battle's own numbers are untouched.
    expect(game.state.activeAttack?.counterPower).toBe(0);
  });

  it("saves the Character the attack was already aimed at", () => {
    const game = defending("eb02-030-save")
      .withHand("p1", [
        instance("event", "EB02-030"),
        instance("fodder", "EB02-001"),
      ])
      .withBoard("p1", [character("wall", "EB02-029")])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    // Passing out of the Counter step resolves the battle, and the K.O. it
    // threatens is what opens the replacement offer.
    game.pass();

    // Keyed by the booking's own pseudo-protector rather than by a card on the
    // field, which is the whole point of the seam.
    expect(effectOptions(game.state)).toEqual([
      "mechanic:wall:p1-installed-EB02-030",
      "skip",
    ]);
    game.play({
      type: "resolve-effect",
      optionId: "mechanic:wall:p1-installed-EB02-030",
    });
    settle(game);

    // The 5000 lost to a 9000 and lived, at the price of the card from hand.
    expect(boardNumbers(game, "p1")).toEqual(["EB02-029"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("lets the K.O. through when the controller declines", () => {
    const game = defending("eb02-030-decline")
      .withHand("p1", [
        instance("event", "EB02-030"),
        instance("fodder", "EB02-001"),
      ])
      .withBoard("p1", [character("wall", "EB02-029")])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    game.pass();
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual([]);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("is no help against an effect's K.O., which the printed text excludes", () => {
    const game = defending("eb02-030-not-effects")
      .withHand("p1", [
        instance("event", "EB02-030"),
        instance("fodder", "EB02-001"),
      ])
      .withBoard("p1", [character("wall", "EB02-029")])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    expect(game.state.players.p1.installedReplacements).toHaveLength(1);

    // EB02-051's K.O. half is an effect, so the booking does not answer it.
    const game2 = table("eb02-030-effect-ko")
      .withHand("p1", [instance("event", "EB02-051")])
      .withBoard("p2", [character("victim", "OP07-084")])
      .build();
    game2.play({ type: "activate-main", summary: "[EB02-051]" });
    game2.play({ type: "resolve-effect", optionId: "ko" });
    game2.play({ type: "resolve-effect", optionId: "victim" });
    settle(game2);
    expect(boardNumbers(game2, "p2")).toEqual([]);
  });

  it("draws a card off a Life card", () => {
    const game = table("eb02-030-trigger")
      .withBoard("p1", [character("attacker", "EB02-001")])
      .withLife("p2", [
        instance("life-event", "EB02-030"),
        instance("spare", "EB02-004"),
      ])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.hand.length).toBe(handBefore + 1);
  });
});

describe("EB02-032 Iceburg", () => {
  covers("EB02-032", "[On Play]");

  it("digs seven and finds nothing, because the pool has no [Galley-La Company]", () => {
    const game = table("eb02-032-dig")
      .withHand("p1", [instance("iceburg", "EB02-032")])
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    game.play({ type: "play-card", cardNumber: "EB02-032" });
    settle(game);

    // The look happened and the seven went back under: the named Stage is not
    // in the imported pool, so the search is live and finds no target.
    expect(game.state.players.p1.deck).toHaveLength(deckBefore);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("EB02-033 Klabautermann", () => {
  covers("EB02-033", "static");

  it("gains [Blocker] while a [Merry Go] Stage is out", () => {
    const alone = table("eb02-033-alone")
      .withBoard("p1", [character("klabautermann", "EB02-033")])
      .build();
    expect(hasKeyword(alone.state, "p1", "klabautermann", "Blocker")).toBe(
      false,
    );

    const withStage = table("eb02-033-stage")
      .withBoard("p1", [character("klabautermann", "EB02-033")])
      .withStage("p1", instance("merry", "EB02-041"))
      .build();
    expect(hasKeyword(withStage.state, "p1", "klabautermann", "Blocker")).toBe(
      true,
    );
  });
});

describe("EB02-035 Sanji & Pudding", () => {
  covers("EB02-035", "[On Play]", "[Your Turn]");

  it("draws behind on DON!! and nothing while ahead", () => {
    const behind = defending("eb02-035-behind")
      .withHand("p2", [instance("pair", "EB02-035")])
      .withDonDeck("p2", 4)
      .build();
    const handBefore = behind.state.players.p2.hand.length;
    behind.play({ type: "play-card", cardNumber: "EB02-035" });
    settle(behind);
    expect(behind.state.players.p2.hand.length).toBe(handBefore);

    const ahead = table("eb02-035-ahead")
      .withHand("p1", [instance("pair", "EB02-035")])
      .withDonDeck("p2", 4)
      .build();
    ahead.play({ type: "play-card", cardNumber: "EB02-035" });
    settle(ahead);
    expect(ahead.state.players.p1.hand).toHaveLength(0);
  });

  it("refunds an active DON!! when two or more go back at once", () => {
    // EB02-010's own Leader activation is the set's `DON!! −2`, which is the
    // signal this watches.
    const game = table("eb02-035-refund")
      .withLeader("p1", "EB02-010")
      .withBoard("p1", [character("pair", "EB02-035")])
      .withDon("p1", { active: 4, rested: 3 })
      .build();

    const fieldBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    game.play({ type: "activate-main", cardNumber: "EB02-010" });
    applyOptional(game);
    settle(game);

    // Two DON!! went back to the DON!! deck and the watcher put one of them
    // straight back, active: net one off the field.
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(fieldBefore - 1);
    expect(game.state.oncePerTurn).toContain("11:p1:EB02-035:reaction");
  });

  it("stays quiet for a return of one, which is under the printed floor", () => {
    const game = table("eb02-035-single")
      .withBoard("p1", [
        character("pair", "EB02-035"),
        // OP11-070 Charlotte Pudding's activation pays `DON!! −1`.
        character("pudding", "OP11-070"),
      ])
      .build();

    const fieldBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    game.play({ type: "activate-main", cardNumber: "OP11-070" });
    applyOptional(game);
    settle(game);

    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(fieldBefore - 1);
    expect(game.state.oncePerTurn).not.toContain("11:p1:EB02-035:reaction");
  });
});

describe("EB02-036 Nico Robin", () => {
  covers("EB02-036", "[On K.O.]", "[Blocker]");

  it("pays DON!! −1 to find a {Straw Hat Crew} card when it trades", () => {
    const game = defending("eb02-036-on-ko")
      .withBoard("p1", [character("robin", "EB02-036", { rested: true })])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withDeckTop("p1", [
        instance("hit", "ST31-002"),
        instance("a", "EB02-004"),
        instance("b", "EB02-029"),
      ])
      .build();

    const fieldBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "robin",
    });
    declineDefence(game);
    applyOptional(game);
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("hit") ? "hit" : options[0]!,
      });
    }

    expect(handNumbers(game, "p1")).toContain("ST31-002");
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(fieldBefore - 1);
  });

  it("searches nothing when the DON!! cost is declined", () => {
    const game = defending("eb02-036-declined")
      .withBoard("p1", [character("robin", "EB02-036", { rested: true })])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withDeckTop("p1", [instance("hit", "ST31-002")])
      .build();

    const fieldBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "robin",
    });
    declineDefence(game);
    // The cost is a "you may", so the prompt is real and declining it must not
    // hand the search over.
    expect(effectOptions(game.state)).toContain("skip");
    game.play({ type: "resolve-effect", optionId: "skip" });
    settle(game);

    expect(handNumbers(game, "p1")).not.toContain("ST31-002");
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(fieldBefore);
  });
});

describe("EB02-037 Franky", () => {
  covers("EB02-037", "[On Play]", "[When Attacking]");

  it("adds a rested DON!! on arrival while behind on DON!!", () => {
    const game = table("eb02-037-on-play")
      .withHand("p1", [instance("franky", "EB02-037")])
      .withDonDeck("p1", 2)
      .build();

    const deckBefore = game.state.players.p1.donDeck.length;
    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "play-card", cardNumber: "EB02-037" });
    settle(game);

    // One DON!! left the DON!! deck. Playing the 3-cost body also rested three
    // of its own, so the pile is up by four rather than by one -- what the
    // clause adds is the card that came out of the deck.
    expect(game.state.players.p1.donDeck.length).toBe(deckBefore - 1);
    expect(game.state.players.p1.restedDon.length).toBe(restedBefore + 4);
  });

  it("adds nothing while ahead on DON!!", () => {
    const game = table("eb02-037-ahead")
      .withHand("p1", [instance("franky", "EB02-037")])
      .withDonDeck("p1", 2)
      .withDonDeck("p2", 6)
      .build();

    const deckBefore = game.state.players.p1.donDeck.length;
    game.play({ type: "play-card", cardNumber: "EB02-037" });
    settle(game);

    expect(game.state.players.p1.donDeck.length).toBe(deckBefore);
  });

  it("adds nothing behind a Leader outside the printed type", () => {
    const game = table("eb02-037-wrong-leader")
      .withLeader("p1", "OP15-001")
      .withHand("p1", [instance("franky", "EB02-037")])
      .withDonDeck("p1", 2)
      .build();

    const deckBefore = game.state.players.p1.donDeck.length;
    game.play({ type: "play-card", cardNumber: "EB02-037" });
    settle(game);

    expect(game.state.players.p1.donDeck.length).toBe(deckBefore);
  });

  it("runs the same ramp on its own attack", () => {
    const game = table("eb02-037-attacking")
      .withBoard("p1", [character("franky", "EB02-037", { playedTurn: 1 })])
      .withDonDeck("p1", 2)
      .build();

    const deckBefore = game.state.players.p1.donDeck.length;
    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "franky",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(game.state.players.p1.donDeck.length).toBe(deckBefore - 1);
    expect(game.state.players.p1.restedDon.length).toBe(restedBefore + 1);
  });
});

describe("EB02-038 Magellan", () => {
  covers("EB02-038", "[On Play]");

  it("plays a cost-2 {Impel Down} body out of hand", () => {
    const game = table("eb02-038-on-play")
      .withHand("p1", [
        instance("magellan", "EB02-038"),
        // OP16-025 Bunkov is a 2-cost {Impel Down} Character; EB02-029 is not.
        instance("bunkov", "OP16-025"),
        instance("other", "EB02-029"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-038" });
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "bunkov" });
    settle(game);

    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-038", "OP16-025"]);
  });
});

describe("EB02-039 GERMA 66", () => {
  covers("EB02-039", "[Main]");

  it("trades a small {GERMA 66} body for the big one of the same name", () => {
    const game = table("eb02-039-main")
      .withHand("p1", [
        instance("event", "EB02-039"),
        // OP06-060 Vinsmoke Ichiji prints 4000; OP06-061 is the 7000 of the
        // same name.
        instance("small", "OP06-060"),
      ])
      .withTrash("p1", [
        instance("big", "OP06-061"),
        // OP06-065 Vinsmoke Niji is also 5000-7000 {GERMA 66}, and is a
        // different card name -- so it must not be offered.
        instance("wrong-name", "OP06-065"),
      ])
      .withDonDeck("p2", 0)
      .build();

    game.play({ type: "activate-main", summary: "[EB02-039]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "small" });
    expect(effectOptions(game.state)).not.toContain("wrong-name");
    game.play({ type: "resolve-effect", optionId: "big" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual(["OP06-061"]);
    expect(game.state.players.p1.trash.map((c) => c.instanceId)).toContain(
      "small",
    );
  });

  it("is not offered with no card left behind the Event to pay with", () => {
    const game = table("eb02-039-unpayable")
      .withHand("p1", [instance("event", "EB02-039")])
      .withTrash("p1", [instance("big", "OP06-061")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("[EB02-039]"),
        ),
    ).toBe(false);
  });

  it("pays the cost and plays nothing while ahead on DON!!", () => {
    const game = table("eb02-039-ahead")
      .withHand("p1", [
        instance("event", "EB02-039"),
        instance("small", "OP06-060"),
      ])
      .withTrash("p1", [instance("big", "OP06-061")])
      .withDon("p2", { active: 0 })
      .withDonDeck("p2", 6)
      .build();

    game.play({ type: "activate-main", summary: "[EB02-039]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual([]);
    expect(game.state.players.p1.trash.map((c) => c.instanceId)).toContain(
      "small",
    );
  });
});

describe("EB02-041 Merry Go (Purple Stage)", () => {
  covers("EB02-041", "[On Play]", "[Activate: Main]");

  it("draws on arrival behind a {Straw Hat Crew} Leader", () => {
    const game = table("eb02-041-on-play")
      .withHand("p1", [instance("merry", "EB02-041")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-041" });
    settle(game);

    expect(game.state.players.p1.stage?.cardNumber).toBe("EB02-041");
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("draws nothing behind another Leader", () => {
    const game = table("eb02-041-wrong-leader")
      .withLeader("p1", "OP15-001")
      .withHand("p1", [instance("merry", "EB02-041")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-041" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("rests to lift a body out of removal range through the next turn", () => {
    const game = table("eb02-041-activate")
      .withStage("p1", instance("merry", "EB02-041"))
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withDonDeck("p2", 0)
      .build();

    const before = effectiveCost(
      game.state,
      "p1",
      game.state.players.p1.board[0]!,
    );
    game.play({ type: "activate-main", cardNumber: "EB02-041" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(before + 2);
    expect(boardCard(game, "p1", "jinbe")?.costModifiers?.[0]).toMatchObject({
      amount: 2,
      expiresAtTurn: 12,
    });
  });

  it("rests and protects nothing while ahead on DON!!", () => {
    const game = table("eb02-041-ahead")
      .withStage("p1", instance("merry", "EB02-041"))
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withDon("p2", { active: 0 })
      .withDonDeck("p2", 6)
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-041" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(boardCard(game, "p1", "jinbe")?.costModifiers ?? []).toHaveLength(0);
  });
});

describe("EB02-044 Sengoku", () => {
  covers("EB02-044", "[On Play]", "[Blocker]");

  it("brings a black {Navy} body back rested", () => {
    const game = table("eb02-044-on-play")
      .withHand("p1", [instance("sengoku", "EB02-044")])
      .withTrash("p1", [
        // OP11-084 Kuzan is a 4-cost black {Navy} Character; EB02-034 Komei is
        // a 4-cost {Navy} Character in *purple*, which the colour filter drops.
        instance("navy", "OP11-084"),
        instance("purple-navy", "EB02-034"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-044" });
    expect(effectOptions(game.state)).not.toContain("purple-navy");
    game.play({ type: "resolve-effect", optionId: "navy" });
    settle(game);

    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-044", "OP11-084"]);
    expect(boardCard(game, "p1", "navy")?.rested).toBe(true);
  });
});

describe("EB02-045 Trafalgar Law", () => {
  covers("EB02-045", "[On Play]", "[Blocker]");

  it("buries two from the trash to draw", () => {
    const game = table("eb02-045-draw")
      .withHand("p1", [instance("law", "EB02-045")])
      .withTrash("p1", [instance("a", "EB02-001"), instance("b", "EB02-004")])
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    game.play({ type: "play-card", cardNumber: "EB02-045" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    // The two go under one at a time, then the branch is chosen.
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("draw") ? "draw" : options[0]!,
      });
    }

    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(deckBefore + 1);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("makes the opponent trash a card from a hand of five or more", () => {
    const game = table("eb02-045-discard")
      .withHand("p1", [instance("law", "EB02-045")])
      .withTrash("p1", [instance("a", "EB02-001"), instance("b", "EB02-004")])
      .withHand("p2", [
        instance("t1", "EB02-001"),
        instance("t2", "EB02-004"),
        instance("t3", "EB02-029"),
        instance("t4", "EB02-034"),
        instance("t5", "EB02-042"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-045" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("discard") ? "discard" : options[0]!,
      });
    }

    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(game.state.players.p2.trash).toHaveLength(1);
  });

  it("takes nothing from a hand of four, which the printed floor excludes", () => {
    const game = table("eb02-045-small-hand")
      .withHand("p1", [instance("law", "EB02-045")])
      .withTrash("p1", [instance("a", "EB02-001"), instance("b", "EB02-004")])
      .withHand("p2", [
        instance("t1", "EB02-001"),
        instance("t2", "EB02-004"),
        instance("t3", "EB02-029"),
        instance("t4", "EB02-034"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-045" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("discard") ? "discard" : options[0]!,
      });
    }

    expect(game.state.players.p2.hand).toHaveLength(4);
  });

  it("is not offered a trash of one, so the branches cannot be bought free", () => {
    const game = table("eb02-045-one-in-trash")
      .withHand("p1", [instance("law", "EB02-045")])
      .withTrash("p1", [instance("a", "EB02-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-045" });
    settle(game);

    expect(game.state.players.p1.trash.map((c) => c.instanceId)).toContain("a");
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("EB02-046 Hildon", () => {
  covers("EB02-046", "[On Play]");

  it("mills two of its own and drops an opposing body's cost", () => {
    const game = table("eb02-046-on-play")
      .withHand("p1", [instance("hildon", "EB02-046")])
      .withBoard("p2", [character("target", "OP06-065")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    const before = effectiveCost(
      game.state,
      "p2",
      game.state.players.p2.board[0]!,
    );
    game.play({ type: "play-card", cardNumber: "EB02-046" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p1.trash.length).toBe(trashBefore + 2);
    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(before - 1);
  });
});

describe("EB02-047 Blueno", () => {
  covers("EB02-047", "[Activate: Main]");

  it("trashes a card and itself to bring a {CP} body out of the trash", () => {
    const game = table("eb02-047-activate")
      .withBoard("p1", [character("blueno", "EB02-047")])
      .withHand("p1", [instance("fodder", "EB02-001")])
      .withTrash("p1", [
        // OP05-093 Rob Lucci is a 4-cost {CP0} Character.
        instance("lucci", "OP05-093"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-047" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "lucci" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual(["OP05-093"]);
    expect(game.state.players.p1.trash.map((c) => c.cardNumber)).toContain(
      "EB02-047",
    );
  });

  it("does not fetch the copy it just trashed", () => {
    const game = table("eb02-047-not-itself")
      .withBoard("p1", [character("blueno", "EB02-047")])
      .withHand("p1", [instance("fodder", "EB02-001")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-047" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    // Blueno is in the trash and is not a legal target for its own clause.
    expect(boardNumbers(game, "p1")).toEqual([]);
    expect(game.state.players.p1.trash.map((c) => c.cardNumber)).toContain(
      "EB02-047",
    );
  });

  it("is not offered on an empty hand", () => {
    const game = table("eb02-047-no-hand")
      .withBoard("p1", [character("blueno", "EB02-047")])
      .withHand("p1", [])
      .withTrash("p1", [instance("lucci", "OP05-093")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB02-047",
        ),
    ).toBe(false);
  });
});

describe("EB02-048 Brook", () => {
  covers("EB02-048", "[On Play]", "[On K.O.]");

  it("fetches a [Laboon] on arrival and plays it when it dies", () => {
    const game = defending("eb02-048-chain")
      .withBoard("p1", [character("brook", "EB02-048", { rested: true })])
      // EB01-048 Laboon is a 4-cost [Laboon], inside the printed ceiling.
      .withHand("p1", [instance("laboon", "EB01-048")])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "brook",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "laboon" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual(["EB01-048"]);
  });

  it("adds a [Laboon] from the trash to the hand on arrival", () => {
    const game = table("eb02-048-on-play")
      .withHand("p1", [instance("brook", "EB02-048")])
      .withTrash("p1", [
        instance("laboon", "OP15-035"),
        instance("other", "EB02-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-048" });
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "laboon" });
    settle(game);

    expect(handNumbers(game, "p1")).toEqual(["OP15-035"]);
  });
});

describe("EB02-049 Monkey.D.Garp", () => {
  covers("EB02-049", "[On Play]", "[Activate: Main]");

  it("gives two rested DON!! to the Leader on arrival", () => {
    const game = table("eb02-049-on-play")
      .withHand("p1", [instance("garp", "EB02-049")])
      .withDon("p1", { active: 5, rested: 3 })
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-049" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
  });

  it("rests itself to K.O. a 1-drop behind a Leader that answers to [Monkey.D.Garp]", () => {
    // No [Monkey.D.Garp] Leader is in the imported pool, so the gate is met
    // here by SEALED-LUFFY, the one Leader whose printed text makes it answer
    // to every card name.
    const game = table("eb02-049-activate")
      .withLeader("p1", "SEALED-LUFFY")
      .withBoard("p1", [character("garp", "EB02-049")])
      .withBoard("p2", [
        character("cheap", "OP07-088"),
        character("dear", "OP06-065"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-049" });
    applyOptional(game);
    expect(effectOptions(game.state)).not.toContain("dear");
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settle(game);

    expect(boardCard(game, "p1", "garp")?.rested).toBe(true);
    expect(boardNumbers(game, "p2")).toEqual(["OP06-065"]);
  });

  it("rests for nothing behind any other Leader, which the cost order prints", () => {
    const game = table("eb02-049-wrong-leader")
      .withBoard("p1", [character("garp", "EB02-049")])
      .withBoard("p2", [character("cheap", "OP07-088")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB02-049" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "garp")?.rested).toBe(true);
    expect(boardNumbers(game, "p2")).toEqual(["OP07-088"]);
  });
});

describe("EB02-051 Three-Pace Hum Soul Notch Slash", () => {
  covers("EB02-051", "[Main]");

  it("K.O.s a cost-2 body on the first branch", () => {
    const game = table("eb02-051-ko")
      .withHand("p1", [instance("event", "EB02-051")])
      .withBoard("p2", [
        character("cheap", "OP07-084"),
        character("dear", "OP06-065"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[EB02-051]" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    expect(effectOptions(game.state)).not.toContain("dear");
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["OP06-065"]);
  });

  it("drops a body's cost by four on the second, and takes only one branch", () => {
    const game = table("eb02-051-shrink")
      .withHand("p1", [instance("event", "EB02-051")])
      .withBoard("p2", [character("dear", "OP06-065")])
      .build();

    const before = effectiveCost(
      game.state,
      "p2",
      game.state.players.p2.board[0]!,
    );
    game.play({ type: "activate-main", summary: "[EB02-051]" });
    game.play({ type: "resolve-effect", optionId: "shrink" });
    game.play({ type: "resolve-effect", optionId: "dear" });
    settle(game);

    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(before - 4);
    expect(boardNumbers(game, "p2")).toEqual(["OP06-065"]);
  });
});

describe("EB02-052 Enel", () => {
  covers("EB02-052", "[When Attacking]", "static");

  it("gains [Rush] behind a {Sky Island} Leader", () => {
    const withType = table("eb02-052-rush")
      .withLeader("p1", "OP05-098")
      .withBoard("p1", [character("enel", "EB02-052", { playedTurn: 11 })])
      .build();
    expect(hasKeyword(withType.state, "p1", "enel", "Rush")).toBe(true);

    const without = table("eb02-052-no-rush")
      .withBoard("p1", [character("enel", "EB02-052", { playedTurn: 11 })])
      .build();
    expect(hasKeyword(without.state, "p1", "enel", "Rush")).toBe(false);
  });

  it("trades a card from hand for a Life card and +1000 at one Life", () => {
    const game = table("eb02-052-attacking")
      .withBoard("p1", [character("enel", "EB02-052", { playedTurn: 1 })])
      .withHand("p1", [instance("fodder", "EB02-001")])
      .withLife("p1", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "enel",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.life[0]?.faceUp).not.toBe(true);
    expect(currentPower(game.state, "p1", "enel")).toBe(12_000);
  });

  it("buys the +1000 alone at four Life", () => {
    const game = table("eb02-052-high-life")
      .withBoard("p1", [character("enel", "EB02-052", { playedTurn: 1 })])
      .withHand("p1", [instance("fodder", "EB02-001")])
      .withLife("p1", 4)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "enel",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(4);
    expect(currentPower(game.state, "p1", "enel")).toBe(12_000);
  });

  it("is not offered on an empty hand", () => {
    const game = table("eb02-052-no-hand")
      .withBoard("p1", [character("enel", "EB02-052", { playedTurn: 1 })])
      .withLife("p1", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "enel",
      targetInstanceId: "p2-leader",
    });

    expect(currentPower(game.state, "p1", "enel")).toBe(11_000);
  });
});

describe("EB02-053 Myskina Olga", () => {
  covers("EB02-053", "[On Play]", "[On K.O.]");

  it("looks at its own top Life card and leaves it there", () => {
    const game = table("eb02-053-own-top")
      .withHand("p1", [instance("olga", "EB02-053")])
      .withLife("p1", [
        instance("first", "EB02-001"),
        instance("second", "EB02-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-053" });
    game.play({ type: "resolve-effect", optionId: "own-life" });
    // Two options for one card, and they differ in nothing but the end: with a
    // split, `0|0` sends everything to the `alternate` (the top) and `0|1` to
    // the primary (the bottom).
    expect(game.summaries("p1")).toEqual([
      "Place your top Life card at the top of the Life cards",
      "Place your top Life card at the bottom of the Life cards",
    ]);
    game.play({ type: "resolve-effect", optionId: "order:0|0" });
    settle(game);

    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "first",
      "second",
    ]);
  });

  it("buries the opponent's top Life card instead", () => {
    const game = table("eb02-053-their-bottom")
      .withHand("p1", [instance("olga", "EB02-053")])
      .withLife("p2", [
        instance("theirs-first", "EB02-001"),
        instance("theirs-second", "EB02-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-053" });
    game.play({ type: "resolve-effect", optionId: "opponent-life" });
    game.play({ type: "resolve-effect", optionId: "order:0|1" });
    settle(game);

    expect(game.state.players.p2.life.map((card) => card.instanceId)).toEqual([
      "theirs-second",
      "theirs-first",
    ]);
  });

  it("runs the same look when it is K.O.'d", () => {
    const game = defending("eb02-053-on-ko")
      .withBoard("p1", [character("olga", "EB02-053", { rested: true })])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withLife("p2", [
        instance("theirs-first", "EB02-001"),
        instance("theirs-second", "EB02-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "olga",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "opponent-life" });
    game.play({ type: "resolve-effect", optionId: "order:0|1" });
    settle(game);

    expect(game.state.players.p2.life.map((card) => card.instanceId)).toEqual([
      "theirs-second",
      "theirs-first",
    ]);
  });
});

describe("EB02-054 Sanji", () => {
  covers("EB02-054", "[On Play]", "[Blocker]");

  it("draws two and pays one back at two Life", () => {
    const game = table("eb02-054-on-play")
      .withHand("p1", [instance("sanji", "EB02-054")])
      .withLife("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-054" });
    const trash = effectOptions(game.state)[0]!;
    game.play({ type: "resolve-effect", optionId: trash });
    settle(game);

    // Two in, one out: net +1 on an empty hand.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(hasKeyword(game.state, "p1", "sanji", "Blocker")).toBe(true);
  });

  it("draws nothing at three Life", () => {
    const game = table("eb02-054-high-life")
      .withHand("p1", [instance("sanji", "EB02-054")])
      .withLife("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-054" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("EB02-055 Jinbe", () => {
  covers("EB02-055", "[Trigger]");

  it("plays itself off a Life card behind a {Fish-Man} Leader at low Life", () => {
    const game = table("eb02-055-trigger")
      .withLeader("p2", "OP11-021")
      .withBoard("p1", [character("attacker", "EB02-001")])
      .withLife("p2", [
        instance("life-jinbe", "EB02-055"),
        instance("spare", "EB02-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB02-055"]);
  });

  it("is not offered behind a Leader with neither printed type", () => {
    const game = table("eb02-055-wrong-leader")
      .withBoard("p1", [character("attacker", "EB02-001")])
      .withLife("p2", [
        instance("life-jinbe", "EB02-055"),
        instance("spare", "EB02-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    // The gate is the program's whole condition, so "Activate Trigger" is
    // never offered: the only thing left to do with the damaged card is take
    // it, which is what damage does anyway.
    expect(game.summaries("p2")).toEqual(["Add Life card to hand"]);
    game.play({ type: "resolve-trigger" });

    // The damaged card joins the hand rather than being played, which is what
    // damage does when no Trigger fires.
    expect(handNumbers(game, "p2")).toContain("EB02-055");
    expect(boardNumbers(game, "p2")).toEqual([]);
  });

  it("is not offered at three Life", () => {
    const game = table("eb02-055-high-life")
      .withLeader("p2", "OP11-021")
      .withBoard("p1", [character("attacker", "EB02-001")])
      .withLife("p2", [
        instance("life-jinbe", "EB02-055"),
        instance("a", "EB02-004"),
        instance("b", "EB02-029"),
        instance("c", "EB02-034"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    expect(game.summaries("p2")).toEqual(["Add Life card to hand"]);
    settle(game);
    expect(boardNumbers(game, "p2")).toEqual([]);
  });
});

describe("EB02-056 Vegapunk", () => {
  covers("EB02-056", "[On Play]", "[Trigger]", "[Blocker]");

  it("plays a {Scientist} out of the top five and pays a card on a small board", () => {
    const game = table("eb02-056-on-play")
      .withHand("p1", [
        instance("vegapunk", "EB02-056"),
        instance("fodder", "EB02-001"),
      ])
      .withDeckTop("p1", [
        // OP07-111 Lilith is a 3-cost {Scientist} Character.
        instance("lilith", "OP07-111"),
        instance("a", "EB02-004"),
        instance("b", "EB02-029"),
        instance("c", "EB02-034"),
        instance("d", "EB02-042"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-056" });
    game.play({ type: "resolve-effect", optionId: "lilith" });
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({
        type: "resolve-effect",
        optionId: options.includes("fodder") ? "fodder" : options[0]!,
      });
    }

    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-056", "OP07-111"]);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(hasKeyword(game.state, "p1", "vegapunk", "Blocker")).toBe(true);
  });

  it("pays nothing on a board of three", () => {
    const game = table("eb02-056-wide-board")
      .withHand("p1", [
        instance("vegapunk", "EB02-056"),
        instance("fodder", "EB02-001"),
      ])
      .withBoard("p2", [
        character("a", "EB02-029"),
        character("b", "EB02-034"),
        character("c", "EB02-042"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB02-056" });
    settle(game);

    expect(handNumbers(game, "p1")).toEqual(["EB02-001"]);
  });

  it("draws a card off a Life card", () => {
    const game = table("eb02-056-trigger")
      .withBoard("p1", [character("attacker", "EB02-001")])
      .withLife("p2", [
        instance("life-vegapunk", "EB02-056"),
        instance("spare", "EB02-004"),
      ])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(game.state.players.p2.hand.length).toBe(handBefore + 1);
  });
});

describe("EB02-057 Mad Treasure", () => {
  covers("EB02-057", "[When Attacking]");

  it("spends a Life card to put a 3-drop on top of the opponent's Life, face-up", () => {
    const game = table("eb02-057-top")
      .withBoard("p1", [character("treasure", "EB02-057", { playedTurn: 1 })])
      .withLife("p1", [
        instance("mine-top", "EB02-001"),
        instance("mine-bottom", "EB02-004"),
      ])
      .withBoard("p2", [
        character("cheap", "OP06-064"),
        character("dear", "OP06-065"),
      ])
      .withLife("p2", [instance("theirs", "EB02-029")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "treasure",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "mine-top" });
    expect(effectOptions(game.state)).not.toContain("dear");
    game.play({ type: "resolve-effect", optionId: "cheap" });
    game.play({ type: "resolve-effect", optionId: "top" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("EB02-001");
    expect(boardNumbers(game, "p2")).toEqual(["OP06-065"]);
    expect(game.state.players.p2.life.map((card) => card.instanceId)).toEqual([
      "cheap",
      "theirs",
    ]);
    expect(game.state.players.p2.life[0]?.faceUp).toBe(true);
  });

  it("can bury the body under the opponent's Life instead", () => {
    const game = table("eb02-057-bottom")
      .withBoard("p1", [character("treasure", "EB02-057", { playedTurn: 1 })])
      .withLife("p1", [instance("mine", "EB02-001")])
      .withBoard("p2", [character("cheap", "OP06-064")])
      .withLife("p2", [instance("theirs", "EB02-029")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "treasure",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "mine" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    game.play({ type: "resolve-effect", optionId: "bottom" });
    settle(game);

    expect(game.state.players.p2.life.map((card) => card.instanceId)).toEqual([
      "theirs",
      "cheap",
    ]);
  });

  it("is not offered with no Life card to spend", () => {
    const game = table("eb02-057-no-life")
      .withBoard("p1", [character("treasure", "EB02-057", { playedTurn: 1 })])
      .withLife("p1", 0)
      .withBoard("p2", [character("cheap", "OP06-064")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "treasure",
      targetInstanceId: "p2-leader",
    });

    expect(boardNumbers(game, "p2")).toEqual(["OP06-064"]);
  });
});

describe("EB02-059 Without Your Help I Can't Become the King of the Pirates!!!!", () => {
  covers("EB02-059", "[Counter]");

  const ATTACK = {
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    attackerInstanceId: "attacker",
    targetInstanceId: "wall",
    attackPower: 9000,
    counterPower: 0,
  } as const;

  it("adds +1000 and plays a yellow {Straw Hat Crew} body at one Life", () => {
    const game = defending("eb02-059-counter")
      .withHand("p1", [
        instance("event", "EB02-059"),
        // ST29-010 Franky is a 5-cost yellow {Straw Hat Crew} Character.
        instance("body", "ST29-010"),
        instance("other", "EB02-042"),
      ])
      .withBoard("p1", [character("wall", "EB02-029")])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withLife("p1", 1)
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "body" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(1_000);
    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-029", "ST29-010"]);
  });

  it("adds the power alone at three Life", () => {
    const game = defending("eb02-059-high-life")
      .withHand("p1", [
        instance("event", "EB02-059"),
        instance("body", "ST29-010"),
      ])
      .withBoard("p1", [character("wall", "EB02-029")])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withLife("p1", 3)
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(1_000);
    expect(boardNumbers(game, "p1")).toEqual(["EB02-029"]);
  });

  it("reaches a [Sanji] of any colour, which the second branch names", () => {
    const game = defending("eb02-059-sanji")
      .withHand("p1", [
        instance("event", "EB02-059"),
        // OP12-070 Sanji is a 3-cost purple Character, so only the name branch
        // admits it.
        instance("sanji", "OP12-070"),
      ])
      .withBoard("p1", [character("wall", "EB02-029")])
      .withBoard("p2", [character("attacker", "EB02-004")])
      .withLife("p1", 1)
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    settle(game);

    expect(boardNumbers(game, "p1").sort()).toEqual(["EB02-029", "OP12-070"]);
  });
});

describe("EB02-060 Merry Go (Yellow Stage)", () => {
  covers("EB02-060", "[Activate: Main]");

  it("rests and turns a Life card face-up to buff through the next turn", () => {
    const game = table("eb02-060-activate")
      .withStage("p1", instance("merry", "EB02-060"))
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withLife("p1", [
        instance("top", "EB02-001"),
        instance("under", "EB02-004"),
      ])
      .build();

    const before = currentPower(game.state, "p1", "jinbe");
    game.play({ type: "activate-main", cardNumber: "EB02-060" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "top" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(currentPower(game.state, "p1", "jinbe")).toBe(before + 1_000);
    expect(boardCard(game, "p1", "jinbe")?.powerModifiers?.[0]).toMatchObject({
      amount: 1_000,
      expiresAtTurn: 12,
    });
  });

  it("is not offered with no Life card to turn", () => {
    const game = table("eb02-060-no-life")
      .withStage("p1", instance("merry", "EB02-060"))
      .withBoard("p1", [character("jinbe", "ST31-002")])
      .withLife("p1", 0)
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB02-060",
        ),
    ).toBe(false);
  });
});

describe("EB02-061 Monkey.D.Luffy", () => {
  covers("EB02-061", "[When Attacking]", "static");

  it("returns two active DON!! to restand and bank a Life card", () => {
    const game = table("eb02-061-attacking")
      .withLeader("p1", "ST30-001")
      .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 1 })])
      .withLife("p1", [
        instance("top", "EB02-001"),
        instance("under", "EB02-004"),
      ])
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    const restedBefore = game.state.players.p1.restedDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    settle(game);
    declineDefence(game);

    // Two came out of the *active* pile, not the rested one the default order
    // would have reached for first.
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 2);
    expect(game.state.players.p1.restedDon.length).toBeGreaterThanOrEqual(
      restedBefore,
    );
    expect(boardCard(game, "p1", "luffy")?.rested).toBe(false);
    expect(handNumbers(game, "p1")).toContain("EB02-001");
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("still restands at 0 Life, where the Life card it would bank is not there", () => {
    // The "Then" clause has nothing to take, which makes this the cheapest
    // time to pay: the restand comes without spending a Life card.
    const game = table("eb02-061-no-life")
      .withLeader("p1", "OP09-061")
      .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 1 })])
      .withLife("p1", [])
      .build();
    const handBefore = handNumbers(game, "p1").length;

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });

    expect(effectOptions(game.state)).toContain("apply");
    game.play({ type: "resolve-effect", optionId: "apply" });
    settle(game);
    declineDefence(game);

    expect(boardCard(game, "p1", "luffy")?.rested).toBe(false);
    expect(game.state.players.p1.life).toHaveLength(0);
    expect(handNumbers(game, "p1")).toHaveLength(handBefore);
  });

  it("does not let the controller pay with DON!! that is not active", () => {
    // The printed cost names the active pile, so the `DON!! −N` re-homing
    // offer -- rested first, then the Leader's and Characters' given DON!! --
    // must not open for it. Every other pile is stocked here so the offer, if
    // raised, would have somewhere else to send the payment.
    const game = table("eb02-061-active-only")
      .withLeader("p1", "ST30-001")
      .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 1 })])
      .withDon("p1", { active: 4, rested: 3, leaderAttached: 2 })
      .withGivenDon("p1", "luffy", 1)
      .build();
    const before = game.state.players.p1;
    const activeBefore = before.activeDon.length;
    const restedBefore = before.restedDon.length;
    const leaderBefore = before.leaderAttachedDon.length;

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);

    expect(effectOptions(game.state)).not.toContainEqual(
      expect.stringMatching(/^return-don:/),
    );
    const p1 = game.state.players.p1;
    expect(p1.activeDon).toHaveLength(activeBefore - 2);
    expect(p1.restedDon).toHaveLength(restedBefore);
    expect(p1.leaderAttachedDon).toHaveLength(leaderBefore);
    expect(boardCard(game, "p1", "luffy")?.attachedDon).toHaveLength(1);
    expect(boardCard(game, "p1", "luffy")?.rested).toBe(false);
  });

  it("is not offered with fewer than two active DON!!", () => {
    const game = table("eb02-061-no-don")
      .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 1 })])
      .withDon("p1", { rested: 9 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });

    expect(boardCard(game, "p1", "luffy")?.rested).toBe(true);
  });

  it("gains [Rush] behind a multicoloured Leader against five DON!!", () => {
    const armed = table("eb02-061-rush")
      .withLeader("p1", "ST30-001")
      .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 11 })])
      .build();
    expect(hasKeyword(armed.state, "p1", "luffy", "Rush")).toBe(true);

    const mono = table("eb02-061-mono-leader")
      .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 11 })])
      .build();
    expect(hasKeyword(mono.state, "p1", "luffy", "Rush")).toBe(false);

    const early = scenario()
      .decks(P1, P2)
      .seed("eb02-061-early")
      .atTurn(5, { active: "p1" })
      .withLeader("p1", "ST30-001")
      .withBoard("p1", [character("luffy", "EB02-061", { playedTurn: 5 })])
      .build();
    expect(hasKeyword(early.state, "p1", "luffy", "Rush")).toBe(false);
  });
});
