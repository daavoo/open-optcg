import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import {
  character,
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * EXTRA BOOSTER -ONE PIECE HEROINES EDITION vol.2- [EB-05]: the Red and Green
 * cards, EB05-001 to EB05-020 and EB05-061.
 *
 * `packages/cards/src/eb05.ts` explains where the records come from; this file
 * holds the behaviour of the Red and Green half of the set. EB05-003 Pasia and
 * EB05-015 Tashigi print no text and are not here. The Bandai Q&A rulings on
 * these cards are pinned in `test/faq-eb05-a.test.ts`.
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter. Clauses gated on a
 * Leader's name or type are run behind a real Leader that carries it --
 * OP07-019 Jewelry Bonney ({Supernovas}), OP11-022 Shirahoshi ({Merfolk}),
 * OP06-020 Hody Jones ({Fish-Man}), OP06-022 Yamato ({Land of Wano}) -- and
 * paired with a case behind the starter Leader, which carries none of them.
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
 * Take the apply branch of an `optional` prompt, if one is open. The engine
 * elides the prompt where declining and applying are indistinguishable.
 */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const handIds = (game: Game, player: "p1" | "p2" = "p1") =>
  ids(game.state.players[player].hand);

const boardIds = (game: Game, player: "p1" | "p2" = "p1") =>
  ids(game.state.players[player].board);

const trashIds = (game: Game, player: "p1" | "p2" = "p1") =>
  ids(game.state.players[player].trash);

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

const power = (game: Game, player: "p1" | "p2", instanceId: string) =>
  currentPower(game.state, player, instanceId);

const activateOffered = (
  game: Game,
  player: "p1" | "p2",
  sourceInstanceId: string,
): boolean =>
  game
    .legalActions(player)
    .some(
      (action) =>
        action.type === "activate-main" &&
        (action as { sourceInstanceId?: string }).sourceInstanceId ===
          sourceInstanceId,
    );

/** Whether an Event in hand is offered for its `[Main]`. */
const eventOffered = (game: Game, eventInstanceId: string): boolean =>
  activateOffered(game, "p1", eventInstanceId);

/**
 * Decline the block and Counter steps, so a declared attack resolves -- and
 * take the plain Life card if the damage turns a `[Trigger]` over.
 */
const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
  for (const player of ["p1", "p2"] as const) {
    const offered = game
      .legalActions(player)
      .find(
        (action) =>
          action.type === "resolve-trigger" &&
          action.summary.includes("Add Life card to hand"),
      );
    if (offered) {
      game.play({
        type: "resolve-trigger",
        summary: "Add Life card to hand",
      });
      return;
    }
  }
};

// --- EB05-001 Jewelry Bonney ------------------------------------------------

describe("EB05-001 Jewelry Bonney's [On Play]", () => {
  covers("EB05-001", "[On Play]");

  it("draws 2 and plays up to two 2000-power bodies behind a {Supernovas} Leader", () => {
    const game = table("eb05-001-hit")
      .withLeader("p1", "OP07-019")
      .withBoard("p1", [])
      .withHand("p1", [
        instance("bonney", "EB05-001"),
        instance("deckhand", "FIX-001"),
        // EB05-003 Pasia is a vanilla 3000: one over the ceiling.
        instance("pasia", "EB05-003"),
      ])
      .withDeckTop("p1", [
        instance("drawn-deckhand", "FIX-001"),
        instance("drawn-jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-001" });

    // The draws land first, so the drawn 2000 is a candidate too.
    expect(handIds(game)).toEqual(
      expect.arrayContaining(["drawn-deckhand", "drawn-jinbe"]),
    );
    const offered = effectOptions(game.state);
    expect(offered).toEqual(
      expect.arrayContaining(["deckhand", "drawn-deckhand"]),
    );
    expect(offered).not.toContain("pasia");
    expect(offered).not.toContain("drawn-jinbe");

    pick(game, "deckhand");
    pick(game, "drawn-deckhand");
    settle(game);

    expect(boardIds(game)).toEqual(
      expect.arrayContaining(["bonney", "deckhand", "drawn-deckhand"]),
    );
    expect(handIds(game)).toEqual(
      expect.arrayContaining(["pasia", "drawn-jinbe"]),
    );
  });

  it("may play fewer than two, or none", () => {
    const game = table("eb05-001-none")
      .withLeader("p1", "OP07-019")
      .withBoard("p1", [])
      .withHand("p1", [
        instance("bonney", "EB05-001"),
        instance("deckhand", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-001" });
    pick(game, "done");
    settle(game);

    expect(boardIds(game)).toEqual(["bonney"]);
    expect(handIds(game)).toContain("deckhand");
  });

  it("does nothing behind a Leader without the {Supernovas} type", () => {
    const game = table("eb05-001-gate")
      .withBoard("p1", [])
      .withHand("p1", [
        instance("bonney", "EB05-001"),
        instance("deckhand", "FIX-001"),
      ])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "EB05-001" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(boardIds(game)).toEqual(["bonney"]);
  });
});

describe("EB05-001 Jewelry Bonney's [Activate: Main]", () => {
  covers("EB05-001", "[Activate: Main]");

  it("gives a 6000-power Character −1000 through the opponent's next turn", () => {
    const game = table("eb05-001-debuff")
      .withBoard("p1", [character("bonney", "EB05-001")])
      .withBoard("p2", [
        character("jinbe", "ST31-002"),
        character("captain", "FIX-002"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "bonney" });
    const offered = effectOptions(game.state);
    // 6000 is the floor and qualifies; a 4000 body and the 5000 Leader do not.
    expect(offered).toContain("jinbe");
    expect(offered).not.toContain("captain");
    expect(offered).not.toContain("p2-leader");
    pick(game, "jinbe");
    settle(game);

    expect(power(game, "p2", "jinbe")).toBe(5000);
    // [Once Per Turn].
    expect(activateOffered(game, "p1", "bonney")).toBe(false);

    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(power(game, "p2", "jinbe")).toBe(5000);
    game.pass();
    expect(power(game, "p2", "jinbe")).toBe(6000);
  });

  it("reaches a Leader at 6000 power, and not one already pushed under it", () => {
    const game = table("eb05-001-leader")
      .withLeader("p2", "ST10-002")
      .withBoard("p1", [
        character("bonney", "EB05-001"),
        character("bonney-2", "EB05-001"),
      ])
      .withBoard("p2", [])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "bonney" });
    expect(effectOptions(game.state)).toContain("p2-leader");
    pick(game, "p2-leader");
    settle(game);
    expect(power(game, "p2", "p2-leader")).toBe(5000);

    // The second copy has its own use, but the Leader now has 5000 power and
    // the floor reads the power it has, not the power it prints.
    game.play({ type: "activate-main", sourceInstanceId: "bonney-2" });
    expect(effectOptions(game.state)).not.toContain("p2-leader");
    settle(game);
    expect(power(game, "p2", "p2-leader")).toBe(5000);
  });
});

// --- EB05-002 Doll ----------------------------------------------------------

describe("EB05-002 Doll", () => {
  covers("EB05-002", "[On Play]");

  it("adds up to two {Navy} cards of cost 2 or more, then trashes a card", () => {
    const game = table("eb05-002-hit")
      .withHand("p1", [
        instance("doll", "EB05-002"),
        instance("keep", "FIX-001"),
      ])
      .withDeckTop("p1", [
        instance("morgan", "OP12-035"),
        // OP05-052 Maynard is a cost-2 {Navy}: on the floor.
        instance("maynard", "OP05-052"),
        instance("fullbody", "OP12-052"),
        // Another Doll is {Navy} at cost 1: under it.
        instance("other-doll", "EB05-002"),
        instance("filler", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-002" });
    const offered = effectOptions(game.state);
    expect(offered).toEqual(
      expect.arrayContaining(["morgan", "maynard", "fullbody"]),
    );
    expect(offered).not.toContain("other-doll");
    expect(offered).not.toContain("filler");
    pick(game, "morgan");
    pick(game, "fullbody");

    // The leftovers go to the bottom in an order the player gives.
    while (
      game.state.pendingEffect &&
      !effectOptions(game.state).includes("keep")
    ) {
      game.play({ type: "resolve-effect" });
    }
    // The trash is mandatory: no "done" while a card is in hand.
    expect(effectOptions(game.state)).not.toContain("done");
    pick(game, "keep");
    settle(game);

    expect(handIds(game)).toEqual(
      expect.arrayContaining(["morgan", "fullbody"]),
    );
    expect(trashIds(game)).toContain("keep");
    expect(ids(game.state.players.p1.deck.slice(-3))).toEqual(
      expect.arrayContaining(["maynard", "other-doll", "filler"]),
    );
  });

  it("still trashes a card when the search finds nothing", () => {
    const game = table("eb05-002-miss")
      .withHand("p1", [
        instance("doll", "EB05-002"),
        instance("keep", "FIX-001"),
      ])
      .withDeckTop("p1", copies(5, "ST31-002", "filler"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-002" });
    while (
      game.state.pendingEffect &&
      !effectOptions(game.state).includes("keep")
    ) {
      game.play({ type: "resolve-effect" });
    }
    pick(game, "keep");
    settle(game);

    expect(trashIds(game)).toContain("keep");
  });
});

// --- EB05-004 Baby 5 --------------------------------------------------------

describe("EB05-004 Baby 5's [On Play]", () => {
  covers("EB05-004", "[On Play]");

  it("shows two Events and draws 2, keeping the Events", () => {
    const game = table("eb05-004-draw")
      .withHand("p1", [
        instance("baby5", "EB05-004"),
        instance("event-1", "OP05-019"),
        instance("event-2", "OP07-016"),
      ])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "EB05-004" });
    applyOptional(game);
    pick(game, "event-1");
    pick(game, "event-2");
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1 + 2);
    expect(handIds(game)).toEqual(
      expect.arrayContaining(["event-1", "event-2"]),
    );
  });

  it("draws nothing when declined", () => {
    const game = table("eb05-004-decline")
      .withHand("p1", [
        instance("baby5", "EB05-004"),
        instance("event-1", "OP05-019"),
        instance("event-2", "OP07-016"),
      ])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "EB05-004" });
    pick(game, "skip");
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });

  it("cannot pay with one Event", () => {
    const game = table("eb05-004-short")
      .withHand("p1", [
        instance("baby5", "EB05-004"),
        instance("event-1", "OP05-019"),
        instance("body", "FIX-001"),
      ])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "EB05-004" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });
});

describe("EB05-004 Baby 5's [On K.O.]", () => {
  covers("EB05-004", "[On K.O.]");
  covers("EB05-016", "[Your Turn]");

  it("plays a 6000-power body rested -- whose [Your Turn] [On Play] stays quiet", () => {
    const game = defending("eb05-004-ko")
      .withBoard("p1", [character("baby5", "EB05-004", { rested: true })])
      .withHand("p1", [
        // EB05-016 Nico Robin is a 6000; OP11-026 is an 8000.
        instance("robin", "EB05-016"),
        instance("scaled", "OP11-026"),
        instance("cobra", "OP13-011"),
      ])
      .withBoard("p2", [character("attacker", "EB04-011", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "baby5",
    });
    declineDefence(game);

    expect(trashIds(game)).toContain("baby5");
    const offered = effectOptions(game.state);
    expect(offered).toContain("robin");
    expect(offered).not.toContain("scaled");
    pick(game, "robin");
    settle(game);

    expect(boardCard(game, "p1", "robin")?.rested).toBe(true);
    // Robin reached the field on the opponent's turn: her `[Your Turn]`
    // `[On Play]` never asks for the Wisdom body still in hand.
    expect(handIds(game)).toContain("cobra");
    expect(boardIds(game)).not.toContain("cobra");
  });
});

// --- EB05-005 Belo Betty ----------------------------------------------------

describe("EB05-005 Belo Betty's [On Play]", () => {
  covers("EB05-005", "[On Play]");

  it("buffs {Revolutionary Army} Characters with a [Trigger], not the others", () => {
    const game = table("eb05-005-buff")
      .withBoard("p1", [
        // OP09-108 Kuma and OP09-100 Karasu are both; OP13-088 Terry Gilteo
        // is {Revolutionary Army} with no [Trigger]; OP07-103 Chopper has a
        // [Trigger] and is not {Revolutionary Army}.
        character("kuma", "OP09-108"),
        character("karasu", "OP09-100"),
        character("terry", "OP13-088"),
        character("chopper", "OP07-103"),
      ])
      .withHand("p1", [instance("betty", "EB05-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-005" });
    const offered = effectOptions(game.state);
    expect(offered).toEqual(expect.arrayContaining(["kuma", "karasu"]));
    expect(offered).not.toContain("terry");
    expect(offered).not.toContain("chopper");
    expect(offered).not.toContain("betty");
    pick(game, "kuma");
    pick(game, "karasu");
    settle(game);

    expect(power(game, "p1", "kuma")).toBe(7000);
    expect(power(game, "p1", "karasu")).toBe(6000);
    expect(power(game, "p1", "terry")).toBe(6000);

    game.pass();
    expect(power(game, "p1", "kuma")).toBe(5000);
  });
});

describe("EB05-005 Belo Betty's [Activate: Main]", () => {
  covers("EB05-005", "[Activate: Main]");

  it("trashes itself to give a Character −2000 for the turn", () => {
    const game = table("eb05-005-trash")
      .withBoard("p1", [character("betty", "EB05-005")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "betty" });
    applyOptional(game);
    pick(game, "jinbe");
    settle(game);

    expect(trashIds(game)).toContain("betty");
    expect(power(game, "p2", "jinbe")).toBe(4000);
    game.pass();
    expect(power(game, "p2", "jinbe")).toBe(6000);
  });

  it("pays the trash even when it gives the −2000 to nothing", () => {
    // "Up to 1": the price is the body, and choosing no target does not
    // refund it.
    const game = table("eb05-005-no-target")
      .withBoard("p1", [character("betty", "EB05-005")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "betty" });
    applyOptional(game);
    pick(game, "done");
    settle(game);

    expect(trashIds(game)).toContain("betty");
    expect(power(game, "p2", "jinbe")).toBe(6000);
  });
});

// --- EB05-006 Miss Buckingham Stussy ----------------------------------------

describe("EB05-006 Miss Buckingham Stussy", () => {
  covers("EB05-006", "[Activate: Main]");

  it("pays a Life card for +3000 on a Character", () => {
    const game = table("eb05-006-plus")
      .withBoard("p1", [
        character("stussy", "EB05-006"),
        character("deckhand", "FIX-001"),
      ])
      .withLife("p1", [
        instance("life-top", "FIX-002"),
        instance("life-2", "FIX-002"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "stussy" });
    applyOptional(game);
    pick(game, "life-top");
    expect(handIds(game)).toContain("life-top");
    pick(game, "plus-3000");
    pick(game, "deckhand");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(1);
    expect(power(game, "p1", "deckhand")).toBe(5000);
    expect(activateOffered(game, "p1", "stussy")).toBe(false);
  });

  it("pays a Life card for −4000 on an opposing Character", () => {
    const game = table("eb05-006-minus")
      .withBoard("p1", [character("stussy", "EB05-006")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "stussy" });
    applyOptional(game);
    // The top Life card is the only candidate for the cost.
    game.play({ type: "resolve-effect" });
    pick(game, "minus-4000");
    pick(game, "jinbe");
    settle(game);

    expect(power(game, "p2", "jinbe")).toBe(2000);
    game.pass();
    expect(power(game, "p2", "jinbe")).toBe(6000);
  });

  it("is not offered with no Life card to pay", () => {
    const game = table("eb05-006-no-life")
      .withBoard("p1", [character("stussy", "EB05-006")])
      .withLife("p1", [])
      .build();

    expect(activateOffered(game, "p1", "stussy")).toBe(false);
  });
});

// --- EB05-007 Monet ---------------------------------------------------------

describe("EB05-007 Monet's [On Play]", () => {
  covers("EB05-007", "[On Play]");

  it("shows three Event or {Punk Hazard} cards for a draw", () => {
    const game = table("eb05-007-draw")
      .withHand("p1", [
        instance("monet", "EB05-007"),
        instance("event-1", "OP05-019"),
        instance("event-2", "OP07-016"),
        // OP11-015 Mocha is a {Punk Hazard} Character.
        instance("mocha", "OP11-015"),
      ])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "EB05-007" });
    applyOptional(game);
    pick(game, "event-1");
    pick(game, "event-2");
    pick(game, "mocha");
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1 + 1);
    expect(handIds(game)).toEqual(
      expect.arrayContaining(["event-1", "event-2", "mocha"]),
    );
  });

  it("cannot pay with two", () => {
    const game = table("eb05-007-short")
      .withHand("p1", [
        instance("monet", "EB05-007"),
        instance("event-1", "OP05-019"),
        instance("mocha", "OP11-015"),
        instance("body", "FIX-001"),
      ])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "play-card", cardNumber: "EB05-007" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });
});

describe("EB05-007 Monet's [End of Your Turn]", () => {
  covers("EB05-007", "[End of Your Turn]");

  it("gains +5000 through the opponent's next turn", () => {
    const game = table("eb05-007-eot")
      .withBoard("p1", [character("monet", "EB05-007")])
      .build();

    expect(power(game, "p1", "monet")).toBe(1000);
    game.pass();
    settle(game);
    expect(game.state.activePlayer).toBe("p2");
    expect(power(game, "p1", "monet")).toBe(6000);
    game.pass();
    settle(game);
    expect(game.state.activePlayer).toBe("p1");
    expect(power(game, "p1", "monet")).toBe(1000);
  });
});

// --- EB05-008 Luffy, Now's Your Chance --------------------------------------

describe("EB05-008 Luffy, Now's Your Chance's [Main]", () => {
  covers("EB05-008", "[Main]");

  it("gives the Leader a DON!!, shows two red Events, and takes 7000 off a rested Character", () => {
    const game = table("eb05-008-main")
      .withHand("p1", [
        instance("chance", "EB05-008"),
        instance("red-1", "OP05-019"),
        instance("red-2", "OP07-016"),
      ])
      .withBoard("p2", [
        character("rested", "ST31-002", { rested: true }),
        character("active", "ST31-002"),
      ])
      .build();
    const attachedBefore = game.state.players.p1.leaderAttachedDon.length;

    game.play({ type: "activate-main", sourceInstanceId: "chance" });
    applyOptional(game);
    pick(game, "red-1");
    pick(game, "red-2");
    const offered = effectOptions(game.state);
    expect(offered).toContain("rested");
    expect(offered).not.toContain("active");
    pick(game, "rested");
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(
      attachedBefore + 1,
    );
    expect(handIds(game)).toEqual(expect.arrayContaining(["red-1", "red-2"]));
    expect(power(game, "p2", "rested")).toBeLessThanOrEqual(0);
    expect(power(game, "p2", "active")).toBe(6000);
  });

  it("is not offered without two other red Events in hand", () => {
    const game = table("eb05-008-short")
      .withHand("p1", [
        instance("chance", "EB05-008"),
        instance("red-1", "OP05-019"),
        // OP12-098 Hair Removal Fist is a black Event.
        instance("black", "OP12-098"),
      ])
      .build();

    expect(eventOffered(game, "chance")).toBe(false);
  });
});

/** p1 defending, with an attack open at the Counter step. */
const counterStep = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withBoard("p2", [character("attacker", "ST31-002")]);

const openAttack = (
  builder: ReturnType<typeof counterStep>,
  targetInstanceId = "p1-leader",
  attackPower = 6000,
) =>
  builder.withActiveAttack(
    {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "attacker",
      targetInstanceId,
      attackPower,
      counterPower: 0,
    },
    "counter",
  );

const counterOffered = (game: Game) =>
  getLegalActions(game.state, "p1").some(
    (action) => action.type === "activate-counter-event",
  );

describe("EB05-008 Luffy, Now's Your Chance's [Counter]", () => {
  covers("EB05-008", "[Counter]");

  it("gives a Character +4000 with no cost-5 Character out", () => {
    const game = openAttack(
      counterStep("eb05-008-counter")
        .withHand("p1", [instance("event", "EB05-008")])
        .withBoard("p1", [character("body", "FIX-002")]),
      "body",
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("adds nothing while a cost-5 Character is on the field", () => {
    const game = openAttack(
      counterStep("eb05-008-counter-big")
        .withHand("p1", [instance("event", "EB05-008")])
        .withBoard("p1", [character("jinbe", "ST31-002")]),
    ).build();

    if (counterOffered(game)) {
      game.play({ type: "activate-counter-event", eventInstanceId: "event" });
      settle(game);
    }
    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
  });
});

// --- EB05-009 Fight and Die with Me!!! --------------------------------------

describe("EB05-009 Fight and Die with Me!!!'s [Main]", () => {
  covers("EB05-009", "[Main]");

  it("gives every Character of 4000 base power or less +1000 through the opponent's turn", () => {
    const game = table("eb05-009-main")
      .withBoard("p1", [
        character("pasia", "EB05-003"),
        character("captain", "FIX-002"),
        character("jinbe", "ST31-002"),
      ])
      .withHand("p1", [instance("event", "EB05-009")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "event" });
    settle(game);

    expect(power(game, "p1", "pasia")).toBe(4000);
    expect(power(game, "p1", "captain")).toBe(5000);
    expect(power(game, "p1", "jinbe")).toBe(6000);

    game.pass();
    expect(power(game, "p1", "captain")).toBe(5000);
    game.pass();
    expect(power(game, "p1", "captain")).toBe(4000);
  });
});

describe("EB05-009 Fight and Die with Me!!!'s [Counter]", () => {
  covers("EB05-009", "[Counter]");

  it("gives the Leader +3000", () => {
    const game = openAttack(
      counterStep("eb05-009-counter").withHand("p1", [
        instance("event", "EB05-009"),
      ]),
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });

  it("is not offered while a Character is the one being attacked", () => {
    const game = openAttack(
      counterStep("eb05-009-counter-character")
        .withHand("p1", [instance("event", "EB05-009")])
        .withBoard("p1", [character("body", "FIX-002")]),
      "body",
    ).build();

    expect(counterOffered(game)).toBe(false);
  });
});

// --- EB05-010 Nico Robin (Leader) -------------------------------------------

/** p2 swings a 6000 at a rested p1 Character, which loses the fight. */
const koInBattle = (game: Game, targetInstanceId: string) => {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId,
  });
  declineDefence(game);
};

describe("EB05-010 Nico Robin's K.O. watcher", () => {
  covers("EB05-010", "static");

  it("banks the top of the deck on Life when a Wisdom Character without [Blocker] is K.O.'d", () => {
    const game = defending("eb05-010-watch")
      .withLeader("p1", "EB05-010")
      .withBoard("p1", [character("pasia", "EB05-003", { rested: true })])
      .withDeckTop("p1", [instance("banked", "FIX-001")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();
    const lifeBefore = game.state.players.p1.life.length;

    koInBattle(game, "pasia");
    expect(trashIds(game)).toContain("pasia");
    // Mandatory: no apply/skip offer, only the "up to 1" choice of the card.
    expect(effectOptions(game.state)).not.toContain("apply");
    expect(effectOptions(game.state)).toContain("banked");
    pick(game, "banked");
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore + 1);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("banked");
  });

  it("spends its use when it banks nothing, so a later K.O. that turn gets nothing", () => {
    const game = defending("eb05-010-decline")
      .withLeader("p1", "EB05-010")
      .withBoard("p1", [
        character("pasia", "EB05-003", { rested: true }),
        character("pasia-2", "EB05-003", { rested: true }),
      ])
      .withDeckTop("p1", [instance("top", "FIX-001")])
      .withBoard("p2", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        character("attacker-2", "ST31-002", { playedTurn: 1 }),
      ])
      .build();
    const lifeBefore = game.state.players.p1.life.length;

    koInBattle(game, "pasia");
    expect(effectOptions(game.state)).toContain("top");
    pick(game, "done");
    settle(game);
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker-2",
      targetInstanceId: "pasia-2",
    });
    declineDefence(game);
    expect(trashIds(game)).toContain("pasia-2");
    expect(effectOptions(game.state)).not.toContain("top");
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
  });

  it("answers once per turn", () => {
    const game = defending("eb05-010-once")
      .withLeader("p1", "EB05-010")
      .withBoard("p1", [
        character("pasia", "EB05-003", { rested: true }),
        character("pasia-2", "EB05-003", { rested: true }),
      ])
      .withDeckTop("p1", [
        instance("top", "FIX-001"),
        instance("second", "FIX-001"),
      ])
      .withBoard("p2", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        character("attacker-2", "ST31-002", { playedTurn: 1 }),
      ])
      .build();
    const lifeBefore = game.state.players.p1.life.length;

    koInBattle(game, "pasia");
    pick(game, "top");
    settle(game);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker-2",
      targetInstanceId: "pasia-2",
    });
    declineDefence(game);

    expect(trashIds(game)).toContain("pasia-2");
    expect(effectOptions(game.state)).not.toContain("second");
    expect(game.state.players.p1.life).toHaveLength(lifeBefore + 1);
  });

  it("ignores a Wisdom Character that prints [Blocker], and one without <Wisdom>", () => {
    const game = defending("eb05-010-miss")
      .withLeader("p1", "EB05-010")
      .withBoard("p1", [
        // OP05-052 Maynard is <Wisdom> with [Blocker]; FIX-001 is <Strike>.
        character("maynard", "OP05-052", { rested: true }),
        character("deckhand", "FIX-001", { rested: true }),
      ])
      .withBoard("p2", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        character("attacker-2", "ST31-002", { playedTurn: 1 }),
      ])
      .build();
    const lifeBefore = game.state.players.p1.life.length;

    koInBattle(game, "maynard");
    expect(trashIds(game)).toContain("maynard");
    expect(effectOptions(game.state)).not.toContain("apply");
    game.play({
      type: "attack",
      attackerInstanceId: "attacker-2",
      targetInstanceId: "deckhand",
    });
    declineDefence(game);
    expect(trashIds(game)).toContain("deckhand");
    expect(effectOptions(game.state)).not.toContain("apply");
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
  });
});

describe("EB05-010 Nico Robin's [Activate: Main]", () => {
  covers("EB05-010", "[Activate: Main]");

  it("sets a rested Wisdom Character of 6000 power or less active, once a turn", () => {
    const game = table("eb05-010-active")
      .withLeader("p1", "EB05-010")
      .withBoard("p1", [
        character("cobra", "OP13-011", { rested: true }),
        // OP13-107 Shaka is <Wisdom> at 7000; FIX-002 is <Slash>.
        character("shaka", "OP13-107", { rested: true }),
        character("captain", "FIX-002", { rested: true }),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "p1-leader" });
    const offered = effectOptions(game.state);
    expect(offered).toContain("cobra");
    expect(offered).not.toContain("shaka");
    expect(offered).not.toContain("captain");
    pick(game, "cobra");
    settle(game);

    expect(boardCard(game, "p1", "cobra")?.rested).toBe(false);
    expect(activateOffered(game, "p1", "p1-leader")).toBe(false);
  });
});

// --- EB05-011 Otohime -------------------------------------------------------

describe("EB05-011 Otohime", () => {
  covers("EB05-011", "[On Play]");

  it("turns a face-up top Life card down to rest a cost-5 Character", () => {
    const game = table("eb05-011-rest")
      .withLeader("p1", "OP11-022")
      .withLife("p1", [
        instance("life-top", "FIX-001", { faceUp: true }),
        instance("life-2", "FIX-001"),
      ])
      .withHand("p1", [instance("otohime", "EB05-011")])
      .withBoard("p2", [
        character("jinbe", "ST31-002"),
        // OP11-033 Bird Neptunian is a printed 6-drop.
        character("bird", "OP11-033"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-011" });
    applyOptional(game);
    if (effectOptions(game.state).includes("life-top")) pick(game, "life-top");
    const offered = effectOptions(game.state);
    expect(offered).toContain("jinbe");
    expect(offered).not.toContain("bird");
    pick(game, "jinbe");
    settle(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBeFalsy();
    expect(boardCard(game, "p2", "jinbe")?.rested).toBe(true);
  });

  it("asks nothing behind a Leader of another name", () => {
    const game = table("eb05-011-leader")
      .withLife("p1", [instance("life-top", "FIX-001", { faceUp: true })])
      .withHand("p1", [instance("otohime", "EB05-011")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-011" });
    settle(game);

    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(boardCard(game, "p2", "jinbe")?.rested).toBe(false);
  });
});

// --- EB05-012 Camie ---------------------------------------------------------

describe("EB05-012 Camie", () => {
  covers("EB05-012", "[On Play]");

  it("rests a Character of cost 6 or less", () => {
    const game = table("eb05-012-rest")
      .withHand("p1", [instance("camie", "EB05-012")])
      .withBoard("p2", [
        character("bird", "OP11-033"),
        // EB04-011 Scaled Neptunian is a printed 7-drop.
        character("scaled", "EB04-011"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-012" });
    const offered = effectOptions(game.state);
    expect(offered).toContain("bird");
    expect(offered).not.toContain("scaled");
    pick(game, "bird");
    settle(game);

    expect(boardCard(game, "p2", "bird")?.rested).toBe(true);
  });
});

// --- EB05-013 Shirley and EB05-017 Mermaid Cafe Dancers ---------------------

const attackLeader = (game: Game) =>
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });

describe("EB05-013 Shirley", () => {
  covers("EB05-013", "[On Your Opponent's Attack]");

  it("rests a DON!! for +2000 on a {Merfolk} Leader, once a turn", () => {
    const game = defending("eb05-013-buff")
      .withLeader("p1", "OP11-022")
      .withBoard("p1", [character("shirley", "EB05-013")])
      .withBoard("p2", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        character("attacker-2", "ST31-002", { playedTurn: 1 }),
      ])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    attackLeader(game);
    expect(effectOptions(game.state)).toContain("apply");
    pick(game, "apply");
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2000);
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 1);

    declineDefence(game);
    game.play({
      type: "attack",
      attackerInstanceId: "attacker-2",
      targetInstanceId: "p1-leader",
    });
    expect(effectOptions(game.state)).not.toContain("apply");
  });

  it("is not offered behind a Leader of another type", () => {
    const game = defending("eb05-013-leader")
      .withBoard("p1", [character("shirley", "EB05-013")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    attackLeader(game);
    expect(effectOptions(game.state)).not.toContain("apply");
  });

  it("is not offered while a Character is the one being attacked", () => {
    const game = defending("eb05-013-character")
      .withLeader("p1", "OP06-020")
      .withBoard("p1", [
        character("shirley", "EB05-013"),
        character("body", "FIX-002", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

describe("EB05-017 Mermaid Cafe Dancers", () => {
  covers("EB05-017", "[On Your Opponent's Attack]");

  it("rests a DON!! and trashes itself for +4000 on a {Fish-Man} Leader", () => {
    const game = defending("eb05-017-buff")
      .withLeader("p1", "OP06-020")
      .withBoard("p1", [character("dancers", "EB05-017")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();
    const activeBefore = game.state.players.p1.activeDon.length;

    attackLeader(game);
    pick(game, "apply");
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(trashIds(game)).toContain("dancers");
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore - 1);
  });

  it("keeps the body when declined", () => {
    const game = defending("eb05-017-decline")
      .withLeader("p1", "OP06-020")
      .withBoard("p1", [character("dancers", "EB05-017")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    attackLeader(game);
    pick(game, "skip");
    settle(game);

    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
    expect(boardIds(game)).toContain("dancers");
  });

  it("is not offered behind a Leader of another type", () => {
    const game = defending("eb05-017-leader")
      .withBoard("p1", [character("dancers", "EB05-017")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    attackLeader(game);
    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

// --- EB05-014 Shirahoshi ----------------------------------------------------

describe("EB05-014 Shirahoshi's [On Play]", () => {
  covers("EB05-014", "[On Play]");

  it("adds a [Megalo] and a {Neptunian} and trashes the rest", () => {
    const game = table("eb05-014-search")
      .withHand("p1", [instance("shirahoshi", "EB05-014")])
      .withDeckTop("p1", [
        instance("megalo", "EB04-018"),
        instance("spotted", "OP11-036"),
        instance("bird", "OP11-033"),
        instance("filler", "ST31-002"),
        instance("filler-2", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-014" });
    const offered = effectOptions(game.state);
    expect(offered).toEqual(
      expect.arrayContaining(["megalo", "spotted", "bird"]),
    );
    expect(offered).not.toContain("filler");
    pick(game, "megalo");
    pick(game, "spotted");
    settle(game);

    expect(handIds(game)).toEqual(
      expect.arrayContaining(["megalo", "spotted"]),
    );
    expect(trashIds(game)).toEqual(
      expect.arrayContaining(["bird", "filler", "filler-2"]),
    );
  });
});

describe("EB05-014 Shirahoshi's [Activate: Main]", () => {
  covers("EB05-014", "[Activate: Main]");

  it("rests itself to give a fresh {Neptunian} of 6000 power or less [Rush]", () => {
    const game = table("eb05-014-rush")
      .withBoard("p1", [
        character("shirahoshi", "EB05-014"),
        character("spotted", "OP11-036", { playedTurn: 11 }),
        character("bird", "OP11-033", { playedTurn: 11 }),
      ])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "spotted",
        ),
    ).toBe(false);

    game.play({ type: "activate-main", sourceInstanceId: "shirahoshi" });
    applyOptional(game);
    const offered = effectOptions(game.state);
    expect(offered).toContain("spotted");
    expect(offered).not.toContain("bird");
    pick(game, "spotted");
    settle(game);

    expect(boardCard(game, "p1", "shirahoshi")?.rested).toBe(true);
    expect(hasKeyword(game.state, "p1", "spotted", "Rush")).toBe(true);
    // Rested now, so the cost cannot be paid again.
    expect(activateOffered(game, "p1", "shirahoshi")).toBe(false);
  });
});

// --- EB05-016 Nico Robin ----------------------------------------------------

describe("EB05-016 Nico Robin's [On Play]", () => {
  covers("EB05-016", "[Your Turn]", "[On Play]");

  it("plays a <Wisdom> Character of cost 5 or less on its controller's turn", () => {
    const game = table("eb05-016-play")
      .withHand("p1", [
        instance("robin", "EB05-016"),
        instance("cobra", "OP13-011"),
        // OP13-111 Pythagoras is <Wisdom> at cost 6; FIX-002 is <Slash>.
        instance("pythagoras", "OP13-111"),
        instance("captain", "FIX-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-016" });
    const offered = effectOptions(game.state);
    expect(offered).toContain("cobra");
    expect(offered).not.toContain("pythagoras");
    expect(offered).not.toContain("captain");
    pick(game, "cobra");
    settle(game);

    expect(boardIds(game)).toEqual(expect.arrayContaining(["robin", "cobra"]));
  });
});

/** p1 swings at p2's Leader, turning over p2's top Life card. */
const triggering = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" });

const flipLifeTrigger = (game: Game) => {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p2-leader",
  });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const triggerOffered = (game: Game) =>
  game
    .legalActions("p2")
    .some((action) => action.summary === "Activate Trigger");

describe("EB05-016 Nico Robin's [Trigger]", () => {
  covers("EB05-016", "[Trigger]");

  it("rests a Character of cost 6 or less", () => {
    const game = triggering("eb05-016-trigger")
      .withBoard("p1", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        character("bird", "OP11-033", { playedTurn: 1 }),
        character("scaled", "EB04-011", { playedTurn: 1 }),
      ])
      .withLife("p2", [instance("life-robin", "EB05-016")])
      .build();

    flipLifeTrigger(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    const offered = effectOptions(game.state);
    expect(offered).toContain("bird");
    expect(offered).not.toContain("scaled");
    pick(game, "bird");
    settle(game);

    expect(boardCard(game, "p1", "bird")?.rested).toBe(true);
  });
});

// --- EB05-018 Rebecca -------------------------------------------------------

describe("EB05-018 Rebecca", () => {
  covers("EB05-018", "[On Play]");

  it("holds a rested cost-6 Character down through the opponent's Refresh Phase", () => {
    const game = table("eb05-018-lock")
      .withHand("p1", [instance("rebecca", "EB05-018")])
      .withBoard("p2", [
        character("bird", "OP11-033", { rested: true }),
        character("scaled", "EB04-011", { rested: true }),
        character("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-018" });
    const offered = effectOptions(game.state);
    expect(offered).toContain("bird");
    // Too costly, and not rested.
    expect(offered).not.toContain("scaled");
    expect(offered).not.toContain("jinbe");
    pick(game, "bird");
    settle(game);

    game.pass();
    expect(game.state.activePlayer).toBe("p2");
    expect(boardCard(game, "p2", "bird")?.rested).toBe(true);
    expect(boardCard(game, "p2", "scaled")?.rested).toBe(false);
  });
});

// --- EB05-019 -----------------------------------------------------------------

describe("EB05-019's [Counter]", () => {
  covers("EB05-019", "[Counter]");

  it("rests a card for +4000 on a {Land of Wano} Leader", () => {
    const game = openAttack(
      counterStep("eb05-019-counter")
        .withLeader("p1", "OP06-022")
        .withHand("p1", [instance("event", "EB05-019")])
        .withBoard("p1", [character("deckhand", "FIX-001")]),
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    applyOptional(game);
    pick(game, "deckhand");
    settle(game);

    expect(boardCard(game, "p1", "deckhand")?.rested).toBe(true);
    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("adds nothing to a Leader without the type", () => {
    const game = openAttack(
      counterStep("eb05-019-counter-miss")
        .withHand("p1", [instance("event", "EB05-019")])
        .withBoard("p1", [character("deckhand", "FIX-001")]),
    ).build();

    if (counterOffered(game)) {
      game.play({ type: "activate-counter-event", eventInstanceId: "event" });
      applyOptional(game);
      settle(game);
    }
    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
  });
});

describe("EB05-019's [Trigger]", () => {
  covers("EB05-019", "[Trigger]");

  it("plays a {Land of Wano} body when the opponent is at 3 Life or less", () => {
    const game = triggering("eb05-019-trigger")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p1", [
        instance("p1-life-1", "FIX-001"),
        instance("p1-life-2", "FIX-001"),
        instance("p1-life-3", "FIX-001"),
      ])
      .withLife("p2", [instance("life-event", "EB05-019")])
      .withHand("p2", [
        // OP12-023 Kawamatsu is a 6000 {Land of Wano}.
        instance("kawamatsu", "OP12-023"),
        instance("kinemon", "ST32-001"),
      ])
      .build();

    flipLifeTrigger(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    pick(game, "kawamatsu");
    settle(game);

    expect(boardIds(game, "p2")).toContain("kawamatsu");
  });

  it("is not offered while the opponent has 4 Life", () => {
    const game = triggering("eb05-019-trigger-miss")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p1", copies(4, "FIX-001", "p1-life"))
      .withLife("p2", [instance("life-event", "EB05-019")])
      .withHand("p2", [instance("kawamatsu", "OP12-023")])
      .build();

    flipLifeTrigger(game);
    expect(triggerOffered(game)).toBe(false);
  });
});

// --- EB05-020 My name is Shirahoshi!! ---------------------------------------

describe("EB05-020 My name is Shirahoshi!!", () => {
  covers("EB05-020", "[Main]");

  it("rests the [Shirahoshi] Leader to draw 2", () => {
    const game = table("eb05-020-draw")
      .withLeader("p1", "OP11-022")
      .withHand("p1", [instance("event", "EB05-020")])
      .build();
    const handBefore = game.state.players.p1.hand.length;

    game.play({ type: "activate-main", sourceInstanceId: "event" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1 + 2);
  });

  it("is not offered behind a Leader of another name", () => {
    const game = table("eb05-020-leader")
      .withHand("p1", [instance("event", "EB05-020")])
      .build();

    expect(eventOffered(game, "event")).toBe(false);
  });

  it("is not offered while the Leader is already rested", () => {
    const game = table("eb05-020-rested")
      .withLeader("p1", "OP11-022")
      .withRestedLeader("p1")
      .withHand("p1", [instance("event", "EB05-020")])
      .build();

    expect(eventOffered(game, "event")).toBe(false);
  });
});

// --- EB05-061 Nami ----------------------------------------------------------

describe("EB05-061 Nami's [On Play]", () => {
  covers("EB05-061", "[On Play]");

  it("plays a red Character of cost 2 or less", () => {
    const game = table("eb05-061-play")
      .withHand("p1", [
        instance("nami", "EB05-061"),
        instance("pasia", "EB05-003"),
        // FIX-001 is colourless; EB05-005 Belo Betty is red at cost 2;
        // ST31-002 Jinbe is red at cost 5.
        instance("deckhand", "FIX-001"),
        instance("betty", "EB05-005"),
        instance("jinbe", "ST31-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-061" });
    const offered = effectOptions(game.state);
    expect(offered).toEqual(expect.arrayContaining(["pasia", "betty"]));
    expect(offered).not.toContain("deckhand");
    expect(offered).not.toContain("jinbe");
    pick(game, "pasia");
    settle(game);

    expect(boardIds(game)).toEqual(expect.arrayContaining(["nami", "pasia"]));
  });
});

/** Pass the block and Counter steps, stopping at any prompt the battle raises. */
const passDefence = (game: Game) => {
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect
  ) {
    game.pass();
  }
};

/**
 * Whether Nami's save is on the table. The battle path keys the option
 * `mechanic:<threatened>:<protector>` and the effect path `replace:<protector>`,
 * so this reads the protector off the end of either.
 */
const namiSaveOffered = (game: Game) =>
  effectOptions(game.state).some((optionId) => optionId.endsWith(":nami"));

describe("EB05-061 Nami's replacement", () => {
  covers("EB05-061", "static");

  it("keeps a 6000-or-less Character on the field for a Life card when the opponent's attack would K.O. it", () => {
    const game = defending("eb05-061-battle")
      .withBoard("p1", [
        character("nami", "EB05-061"),
        character("pasia", "EB05-003", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();
    const lifeBefore = game.state.players.p1.life.length;
    const handBefore = game.state.players.p1.hand.length;

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "pasia",
    });
    passDefence(game);
    expect(namiSaveOffered(game)).toBe(true);
    pick(game, "mechanic:pasia:nami");
    settle(game);

    expect(boardIds(game)).toContain("pasia");
    expect(game.state.players.p1.life).toHaveLength(lifeBefore - 1);
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });

  it("does not guard a Character of more than 6000 base power", () => {
    const game = defending("eb05-061-big")
      .withBoard("p1", [
        character("nami", "EB05-061"),
        character("shaka", "OP13-107", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "EB04-011", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "shaka",
    });
    passDefence(game);
    expect(namiSaveOffered(game)).toBe(false);
    settle(game);
    expect(trashIds(game)).toContain("shaka");
  });

  it("does not answer its controller's own removal", () => {
    const game = table("eb05-061-own")
      .withBoard("p1", [
        character("nami", "EB05-061"),
        character("betty", "EB05-005"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "betty" });
    applyOptional(game);
    expect(namiSaveOffered(game)).toBe(false);
    settle(game);
    expect(trashIds(game)).toContain("betty");
  });

  it("answers once per turn", () => {
    const game = defending("eb05-061-once")
      .withBoard("p1", [
        character("nami", "EB05-061"),
        character("pasia", "EB05-003", { rested: true }),
        character("pasia-2", "EB05-003", { rested: true }),
      ])
      .withBoard("p2", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        character("attacker-2", "ST31-002", { playedTurn: 1 }),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "pasia",
    });
    passDefence(game);
    pick(game, "mechanic:pasia:nami");
    settle(game);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker-2",
      targetInstanceId: "pasia-2",
    });
    passDefence(game);
    expect(namiSaveOffered(game)).toBe(false);
    settle(game);
    expect(trashIds(game)).toContain("pasia-2");
  });
});
