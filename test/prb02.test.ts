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
 * PREMIUM BOOSTER [PRB-02], as a whole-set import.
 *
 * `packages/cards/src/prb02.ts` explains where the records come from; this file
 * holds the behaviour. Four of the set's 18 identities were already in the pool
 * as cards a community deck plays -- PRB02-008 Marco, PRB02-014 Sabo, PRB02-015
 * Shiryu and PRB02-016 Otama -- and their clauses are driven from the tests of
 * the decks that play them, so what is here is the other eleven.
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

/** p2 acting, for the clause that only opens on the opponent's turn. */
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

describe("PRB02-001 Koby", () => {
  covers("PRB02-001", "[When Attacking]");

  it("K.O.s a 3000-power body and draws on a small enough hand", () => {
    const game = table("prb02-001-ko")
      .withBoard("p1", [character("koby", "PRB02-001")])
      .withBoard("p2", [character("small", "FIX-001")])
      .withHand("p1", [instance("spare", "FIX-001")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "koby",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(boardNumbers(game, "p2")).not.toContain("FIX-001");
    expect(game.state.players.p1.hand.length).toBe(handBefore + 1);
  });

  it("reads base power, so a buffed 2000 body is still a legal target", () => {
    // The printed text says "base power": a Character handed DON!! for the turn
    // is over the ceiling by current power and under it by the number the
    // clause actually asks about.
    const game = table("prb02-001-base-power")
      .withBoard("p1", [character("koby", "PRB02-001")])
      .withBoard("p2", [character("buffed", "FIX-001")])
      .withGivenDon("p2", "buffed", 2)
      .build();

    expect(currentPower(game.state, "p2", "buffed")).toBeGreaterThan(3_000);
    game.play({
      type: "attack",
      attackerInstanceId: "koby",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "buffed" });
    settle(game);

    expect(boardCard(game, "p2", "buffed")).toBeUndefined();
  });

  it("draws even when there is nothing to K.O.", () => {
    // "Then" starts a new sentence with its own condition, so the draw does not
    // hang off the K.O. having found a target.
    const game = table("prb02-001-draw-only")
      .withBoard("p1", [character("koby", "PRB02-001")])
      .withHand("p1", [instance("spare", "FIX-001")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "koby",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(game.state.players.p1.hand.length).toBe(handBefore + 1);
  });
});

describe("PRB02-002 Trafalgar Law", () => {
  covers("PRB02-002", "[When Attacking]");

  it("gives an opposing Character −2000 for the turn", () => {
    const game = table("prb02-002-debuff")
      .withBoard("p1", [character("law", "PRB02-002")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    const before = currentPower(game.state, "p2", "victim");
    game.play({
      type: "attack",
      attackerInstanceId: "law",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(currentPower(game.state, "p2", "victim")).toBe(before - 2_000);
  });
});

describe("PRB02-003 Lucky.Roux", () => {
  covers("PRB02-003", "[On Play]");

  it("trashes a 6000-power Character from hand to draw 2", () => {
    const game = table("prb02-003-draw")
      .withHand("p1", [
        instance("roux", "PRB02-003"),
        instance("fuel", "EB03-053"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-003" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    settle(game);

    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("EB03-053");
    // Two drawn for the one card spent: net +1 on a hand that had the fuel.
    expect(game.state.players.p1.hand.length).toBe(2);
  });

  it("draws nothing when the hand has no 6000-power Character to spend", () => {
    // An `[On Play]` cost has no `requires` gate to withhold the offer -- that
    // field is on the battle tables, where a forecast depends on it -- so the
    // apply branch is still offered and fizzles on a `choose` that finds
    // nothing. What matters is that it costs the player nothing.
    const game = table("prb02-003-no-fuel")
      .withHand("p1", [
        instance("roux", "PRB02-003"),
        instance("small", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-003" });
    applyOptional(game);
    settle(game);

    expect(handNumbers(game, "p1")).toEqual(["FIX-001"]);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("PRB02-003 Lucky.Roux's [Blocker]", () => {
  covers("PRB02-003", "[Blocker]");

  it("takes a declared attack off the Leader and rests doing it", () => {
    const game = scenario()
      .decks(P1, P2)
      .seed("prb02-003-blocker")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withBoard("p2", [character("roux", "PRB02-003")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "roux" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("roux");
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });
});

describe("PRB02-004 Jewelry Bonney", () => {
  covers("PRB02-004", "[On Your Opponent's Attack]");

  it("sets a rested DON!! active inside the opponent's attack", () => {
    const game = defending("prb02-004-activate")
      .withBoard("p1", [character("bonney", "PRB02-004")])
      .withBoard("p2", [character("attacker", "FIX-002")])
      .withDon("p1", { active: 2, rested: 3 })
      .build();

    const before = game.state.players.p1.activeDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.activeDon.length).toBe(before + 1);
  });

  it("only fires once in a turn", () => {
    const game = defending("prb02-004-once")
      .withBoard("p1", [character("bonney", "PRB02-004")])
      .withBoard("p2", [
        character("first", "FIX-002"),
        character("second", "FIX-002"),
      ])
      .withDon("p1", { active: 1, rested: 4 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "first",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    settle(game);
    const afterFirst = game.state.players.p1.activeDon.length;
    declineDefence(game);

    game.play({
      type: "attack",
      attackerInstanceId: "second",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.activeDon.length).toBe(afterFirst);
  });
});

describe("PRB02-005 Monkey.D.Luffy", () => {
  covers("PRB02-005", "[On Play]");

  it("takes a DON!! out of the opponent's next turn behind a multicolored Leader", () => {
    const game = table("prb02-005-hold")
      .withLeader("p1", "EB04-001")
      .withHand("p1", [instance("luffy", "PRB02-005")])
      .withDonDeck("p2", 5)
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-005" });
    settle(game);

    expect(game.state.players.p2.donRestedAtNextMain).toBe(1);
  });

  it("costs the opponent a DON!! even though they ended the turn active", () => {
    // The half `hold-don-from-refresh` cannot express: p2 has nothing rested
    // when the clause resolves, so a refresh-time hold would book nothing. The
    // rest is taken from the pool they actually reach their Main Phase with.
    const game = table("prb02-005-spent")
      .withLeader("p1", "EB04-001")
      .withHand("p1", [instance("luffy", "PRB02-005")])
      .withDonDeck("p2", 5)
      .build();

    expect(game.state.players.p2.restedDon).toHaveLength(0);
    game.play({ type: "play-card", cardNumber: "PRB02-005" });
    settle(game);
    game.pass();

    expect(game.state.players.p2.restedDon).toHaveLength(1);
    expect(game.state.players.p2.donRestedAtNextMain).toBeUndefined();
  });

  it("holds nothing behind a single-colour Leader", () => {
    const game = table("prb02-005-mono")
      .withHand("p1", [instance("luffy", "PRB02-005")])
      .withDonDeck("p2", 5)
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-005" });
    settle(game);

    expect(game.state.players.p2.donRestedAtNextMain ?? 0).toBe(0);
  });

  it("holds nothing once the opponent is past 7 DON!!", () => {
    const game = table("prb02-005-rich")
      .withLeader("p1", "EB04-001")
      .withHand("p1", [instance("luffy", "PRB02-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-005" });
    settle(game);

    expect(game.state.players.p2.donRestedAtNextMain ?? 0).toBe(0);
  });
});

describe("PRB02-007 Jinbe", () => {
  covers("PRB02-007", "[On Play]", "[When Attacking]");

  it("digs five deep for a Warlord other than itself", () => {
    const game = table("prb02-007-search")
      .withHand("p1", [instance("jinbe", "PRB02-007")])
      .withDeckTop("p1", [
        instance("hit", "ST32-003"),
        instance("filler-a", "FIX-001"),
        instance("filler-b", "FIX-001"),
        instance("filler-c", "FIX-001"),
        instance("filler-d", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-007" });
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("ST32-003");
  });

  it("does not offer another [Jinbe], which the printed text excludes", () => {
    const game = table("prb02-007-self")
      .withHand("p1", [instance("jinbe", "PRB02-007")])
      .withDeckTop("p1", [
        instance("twin", "PRB02-007"),
        instance("filler-a", "FIX-001"),
        instance("filler-b", "FIX-001"),
        instance("filler-c", "FIX-001"),
        instance("filler-d", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-007" });
    settle(game);

    expect(handNumbers(game, "p1")).not.toContain("PRB02-007");
  });

  it("bottoms a 1-cost Character when it attacks", () => {
    const game = table("prb02-007-bottom")
      .withBoard("p1", [character("jinbe", "PRB02-007")])
      .withBoard("p2", [character("cheap", "FIX-001")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settle(game);

    expect(boardCard(game, "p2", "cheap")).toBeUndefined();
    expect(game.state.players.p2.deck.at(-1)?.cardNumber).toBe("FIX-001");
  });

  it("reaches its own side too, because the text names no side", () => {
    const game = table("prb02-007-own-side")
      .withBoard("p1", [
        character("jinbe", "PRB02-007"),
        character("mine", "FIX-001"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "p2-leader",
    });

    expect(effectOptions(game.state)).toContain("mine");
  });
});

describe("PRB02-010 Charlotte Pudding", () => {
  covers("PRB02-010", "[On Play]");

  it("pays DON!! −2 to draw 2 and put a Big Mom body down", () => {
    const game = table("prb02-010-full")
      .withLeader("p1", "OP11-062")
      .withHand("p1", [
        instance("pudding", "PRB02-010"),
        instance("body", "OP11-071"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-010" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("OP11-071");
  });

  it("still pays the DON!! when the gate is shut", () => {
    // The cost buys the attempt, not the outcome: the printed order puts
    // "DON!! −2" before the condition.
    const game = table("prb02-010-gate-shut")
      .withHand("p1", [instance("pudding", "PRB02-010")])
      .build();

    const donBefore =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    game.play({ type: "play-card", cardNumber: "PRB02-010" });
    applyOptional(game);
    settle(game);

    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(donBefore - 2);
  });
});

describe("PRB02-011 Donquixote Doflamingo", () => {
  covers("PRB02-011", "[On Play]");

  it("adds a rested DON!! behind a multicolored Leader", () => {
    // By turn 11 every DON!! is already on the field, so the DON!! deck has to
    // be refilled for an "add from your DON!! deck" clause to have a card.
    const game = table("prb02-011-ramp")
      .withLeader("p1", "EB04-001")
      .withHand("p1", [instance("doffy", "PRB02-011")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-011" });
    settle(game);

    // One of the two DON!! put back has left the deck, and it landed rested:
    // five of the six rested are the card's own 5-cost, the sixth is the ramp.
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(6);
  });

  it("adds nothing behind a single-colour Leader", () => {
    const game = table("prb02-011-mono")
      .withHand("p1", [instance("doffy", "PRB02-011")])
      .withDonDeck("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-011" });
    settle(game);

    // The DON!! deck is untouched, and the only rested DON!! are the 5-cost.
    expect(game.state.players.p1.donDeck).toHaveLength(2);
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });
});

describe("PRB02-012 Nami", () => {
  covers("PRB02-012", "[On Play]", "[Trigger]");

  it("digs five deep for a Straw Hat other than itself", () => {
    const game = table("prb02-012-search")
      .withHand("p1", [instance("nami", "PRB02-012")])
      .withDeckTop("p1", [
        instance("hit", "EB04-007"),
        instance("filler-a", "FIX-001"),
        instance("filler-b", "FIX-001"),
        instance("filler-c", "FIX-001"),
        instance("filler-d", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-012" });
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(handNumbers(game, "p1")).toContain("EB04-007");
  });

  it("plays itself off a Life card, and runs its own [On Play]", () => {
    const game = table("prb02-012-trigger")
      .withLife("p2", [instance("life-nami", "PRB02-012")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("PRB02-012");
  });
});

describe("PRB02-013 Gecko Moria", () => {
  covers("PRB02-013", "[On Play]");

  it("revives a 4-cost body rested and hands out a rested DON!!", () => {
    const game = table("prb02-013-revive")
      .withLeader("p1", "OP06-080")
      .withHand("p1", [instance("moria", "PRB02-013")])
      .withTrash("p1", [instance("corpse", "FIX-002")])
      .withDon("p1", { active: 6, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-013" });
    game.play({ type: "resolve-effect", optionId: "corpse" });
    settle(game);

    expect(boardCard(game, "p1", "corpse")?.rested).toBe(true);
  });

  it("reaches a 4-cost body the Thriller Bark type does not cover", () => {
    // The Leader gate asks about the *Leader's* type; the trash is narrowed by
    // cost alone, so the deck's off-type bodies are legal targets.
    const game = table("prb02-013-off-type")
      .withLeader("p1", "OP06-080")
      .withHand("p1", [instance("moria", "PRB02-013")])
      .withTrash("p1", [instance("offtype", "EB01-048")])
      .withDon("p1", { active: 6, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-013" });

    expect(effectOptions(game.state)).toContain("offtype");
  });

  it("does nothing behind another Leader", () => {
    const game = table("prb02-013-wrong-leader")
      .withHand("p1", [instance("moria", "PRB02-013")])
      .withTrash("p1", [instance("corpse", "FIX-002")])
      .withDon("p1", { active: 6, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-013" });
    settle(game);

    expect(boardCard(game, "p1", "corpse")).toBeUndefined();
  });
});

describe("PRB02-017 Boa Hancock", () => {
  covers("PRB02-017", "[On Play]", "[Trigger]");

  it("trashes a [Trigger] card to stop an opposing Character attacking", () => {
    const game = table("prb02-017-lock")
      .withHand("p1", [
        instance("hancock", "PRB02-017"),
        instance("cost", "PRB02-012"),
      ])
      .withBoard("p2", [character("threat", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-017" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "character" });
    game.play({ type: "resolve-effect", optionId: "threat" });
    settle(game);

    expect(
      boardCard(game, "p2", "threat")?.cannotAttackUntilTurn,
    ).toBeGreaterThan(game.state.turn);
  });

  it("does not offer [Monkey.D.Luffy], which the printed text excludes", () => {
    const game = table("prb02-017-excluded")
      .withHand("p1", [
        instance("hancock", "PRB02-017"),
        instance("cost", "PRB02-012"),
      ])
      .withBoard("p2", [character("luffy", "OP16-052")])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-017" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "character" });

    expect(effectOptions(game.state)).not.toContain("luffy");
  });

  it("locks nothing when the hand holds no [Trigger] card to spend", () => {
    const game = table("prb02-017-no-cost")
      .withHand("p1", [
        instance("hancock", "PRB02-017"),
        instance("plain", "FIX-001"),
      ])
      .withBoard("p2", [character("threat", "FIX-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-017" });
    applyOptional(game);
    settle(game);

    expect(handNumbers(game, "p1")).toEqual(["FIX-001"]);
    expect(
      boardCard(game, "p2", "threat")?.cannotAttackUntilTurn,
    ).toBeUndefined();
  });

  it("K.O.s a 4-cost Character off a Life card", () => {
    const game = table("prb02-017-trigger")
      .withBoard("p1", [character("victim", "FIX-002")])
      .withLife("p2", [instance("life-hancock", "PRB02-017")])
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

describe("PRB02-018 Portgas.D.Ace", () => {
  covers("PRB02-018", "[On Play]");

  it("puts a cost-2 [Monkey.D.Luffy] down off a face-up Life card", () => {
    const game = table("prb02-018-play")
      .withHand("p1", [
        instance("ace", "PRB02-018"),
        instance("luffy", "OP16-052"),
      ])
      .withLife("p1", [instance("faceup", "FIX-001", { faceUp: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-018" });
    game.play({ type: "resolve-effect", optionId: "luffy" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("OP16-052");
  });

  it("does nothing with every Life card face down", () => {
    const game = table("prb02-018-face-down")
      .withHand("p1", [
        instance("ace", "PRB02-018"),
        instance("luffy", "OP16-052"),
      ])
      .withLife("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "PRB02-018" });
    settle(game);

    expect(boardNumbers(game, "p1")).not.toContain("OP16-052");
  });
});
