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
  copies,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * EXTRA BOOSTER -EGGHEAD CRISIS- [EB-04], as a whole-set import.
 *
 * `packages/cards/src/eb04.ts` explains where the records come from; this file
 * is what holds the behaviour. Fifteen of the set's 61 identities were already
 * in the pool as cards four decks happen to play, and those are driven by the
 * files that shipped them -- `test/eb04-bonney.test.ts` for the nine on the
 * feature deck, `test/op17-kaido.test.ts` for EB04-030/031/032, and
 * `test/op16-nami.test.ts` and `test/op17-luffy-ace.test.ts` for the rest.
 * What is here is the other 46, plus the two engine rules the import needed.
 *
 * ## The two rules the set added
 *
 * `attackBlocked` on `StaticAbility` (EB04-005, EB04-051) and `requires` on
 * `ReplacementProgram` (EB04-044). Both exist because a printed clause could
 * not otherwise be expressed, and both are tested from the card rather than
 * from the primitive -- a rule that fires in a unit test and never in a game is
 * not support.
 *
 * ## Why no deck
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter. That is the
 * documented shape for a card outside a manifest, and it is also why nothing
 * here asserts on win rates: the set import moves no deck's standing, which
 * `docs/rules-map/deck-standings-featured.csv` and `docs/rules-map/deck-standings-starter.csv` record.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase, with ten DON!! active. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" });

/** p2 acting, for the clauses that only open on the opponent's turn. */
const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" });

/**
 * The Leader carrying the identities EB-04's gates name and the pool prints
 * none of. See its record in `packages/cards/src/index.ts`; every use here is
 * paired with a case behind ST31's own Leader, which has none of them.
 */
const TYPED_LEADER = "FIX-LEADER-EB04";

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

/**
 * Take a removal replacement that has been offered.
 *
 * The prompt is a pair -- the plain removal and the "instead" -- so a test that
 * settles the effect generically takes the removal and proves nothing about the
 * replacement. Matched on the option's own id, which is keyed by the
 * *protector* rather than by the threatened card: EB04-043 guards its
 * teammates, so the two are not the same instance.
 */
const takeReplacement = (game: Game, protectorInstanceId: string) => {
  game.play({
    type: "resolve-effect",
    optionId: `replace:${protectorInstanceId}`,
  });
};

/**
 * Decline the block and Counter steps, so a declared attack resolves -- and
 * take the plain Life card if the damage turns a `[Trigger]` over.
 *
 * The second half is not optional: a hit on the Leader can flip a Life card
 * whose Trigger the *defender* is then asked about, and a test about the
 * attacker has no business answering it. Adding it to hand is the neutral
 * answer.
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

const eventOffered = (game: Game, cardNumber: string): boolean =>
  game
    .legalActions("p1")
    .some((action) => action.summary.includes(`[${cardNumber}]`));

const boardIds = (state: GameState, player: "p1" | "p2"): string[] =>
  state.players[player].board.map((card) => card.instanceId);

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

// --- [On Play] --------------------------------------------------------------

describe("EB04-006 Moda", () => {
  covers("EB04-006", "[On Play]");

  it("digs seven deep for the Stage and bottoms the rest", () => {
    const game = table("eb04-006-hit")
      .withHand("p1", [instance("moda", "EB04-006")])
      .withDeckTop("p1", [
        ...copies(6, "ST31-002", "filler"),
        instance("stage", "EB04-010"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-006" });
    expect(effectOptions(game.state)).toContain("stage");
    game.play({ type: "resolve-effect", optionId: "stage" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "stage",
    );
    // The other six go to the bottom, so nothing is lost and the next draw is
    // not one of them.
    expect(game.state.players.p1.deck.slice(-6)).toHaveLength(6);
  });

  it("finds nothing when the Stage is deeper than seven", () => {
    const game = table("eb04-006-miss")
      .withHand("p1", [instance("moda", "EB04-006")])
      .withDeckTop("p1", [
        ...copies(7, "ST31-002", "filler"),
        instance("stage", "EB04-010"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-006" });
    // Nothing eligible, so the engine skips the add step rather than prompting
    // with only a decline -- and the Stage is still the eighth card down.
    expect(effectOptions(game.state)).not.toContain("stage");
    settle(game);

    expect(
      game.state.players.p1.hand.map((card) => card.instanceId),
    ).not.toContain("stage");
  });

  it("looks for the Stage by name rather than by its shared type", () => {
    // Moda is itself {Lulucia Kingdom}, so a type filter would find a second
    // copy of Moda. The name is what makes this a one-of tutor.
    const game = table("eb04-006-name")
      .withHand("p1", [instance("moda", "EB04-006")])
      .withDeckTop("p1", [
        instance("other-moda", "EB04-006"),
        ...copies(6, "ST31-002", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-006" });
    expect(effectOptions(game.state)).not.toContain("other-moda");
    settle(game);

    expect(
      game.state.players.p1.hand.map((card) => card.instanceId),
    ).not.toContain("other-moda");
  });
});

describe("EB04-010 Lulucia Kingdom", () => {
  covers("EB04-010", "[On Play]");

  it("sets a Character's base power to 0 for the turn", () => {
    const game = table("eb04-010-zero")
      .withHand("p1", [instance("stage", "EB04-010")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    expect(currentPower(game.state, "p2", "jinbe")).toBe(6000);
    game.play({ type: "play-card", cardNumber: "EB04-010" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(currentPower(game.state, "p2", "jinbe")).toBe(0);
  });

  it("sets the base, so DON!! the owner gives it still counts", () => {
    // "Set the power to 0" is a replacement rather than removal: a 0-power body
    // carrying two DON!! is a 2000, which is the difference between this Stage
    // and a K.O.
    const game = table("eb04-010-base")
      .withHand("p1", [instance("stage", "EB04-010")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .withGivenDon("p2", "jinbe", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-010" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(currentPower(game.state, "p2", "jinbe")).toBe(2000);
  });

  it("resolves on an empty board, because the target is 'up to 1'", () => {
    const game = table("eb04-010-empty")
      .withHand("p1", [instance("stage", "EB04-010")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-010" });
    settle(game);

    expect(game.state.players.p1.stage?.cardNumber).toBe("EB04-010");
  });
});

describe("EB04-010 Lulucia Kingdom's aura", () => {
  covers("EB04-010", "[Opponent's Turn]");

  it("gives a base-cost-1 body +5000 while defending", () => {
    const game = defending("eb04-010-aura")
      .withStage("p1", instance("stage", "EB04-010"))
      // OP01-016 Nami is a 1-cost 2000.
      .withBoard("p1", [character("nami", "OP01-016")])
      .build();

    expect(currentPower(game.state, "p1", "nami")).toBe(7000);
  });

  it("gives nothing on its controller's own turn", () => {
    const game = table("eb04-010-own-turn")
      .withStage("p1", instance("stage", "EB04-010"))
      .withBoard("p1", [character("nami", "OP01-016")])
      .build();

    expect(currentPower(game.state, "p1", "nami")).toBe(2000);
  });

  it("reads base cost, so a 2-drop is outside it", () => {
    const game = defending("eb04-010-cost-line")
      .withStage("p1", instance("stage", "EB04-010"))
      .withBoard("p1", [
        character("nami", "OP01-016"),
        // ST31-003 Brook is a 2-cost: one over the line.
        character("brook", "ST31-003"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "nami")).toBe(7000);
    expect(currentPower(game.state, "p1", "brook")).toBe(3000);
  });

  it("stops once the Stage leaves the field", () => {
    const game = defending("eb04-010-no-stage")
      .withBoard("p1", [character("nami", "OP01-016")])
      .build();

    expect(currentPower(game.state, "p1", "nami")).toBe(2000);
  });
});

describe("EB04-011 Scaled Neptunian", () => {
  covers("EB04-011", "[On Play]");

  it("draws one per Neptunian and then trashes the same number", () => {
    const game = table("eb04-011-two")
      .withHand("p1", [instance("scaled", "EB04-011")])
      // EB04-016 is the set's other {Neptunian}: with the played body that is
      // two, so two cards in and two cards out.
      .withBoard("p1", [character("bird", "EB04-016", { playedTurn: 1 })])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB04-011" });
    settle(game);

    // One card left hand to be played, two drew, two trashed.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(game.state.players.p1.trash.length - trashBefore).toBe(2);
  });

  it("draws once when it is the only Neptunian on the board", () => {
    const game = table("eb04-011-one")
      .withHand("p1", [instance("scaled", "EB04-011")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB04-011" });
    settle(game);

    expect(game.state.players.p1.trash.length - trashBefore).toBe(1);
  });

  it("draws every card before trashing any of them", () => {
    // The printed "Then" is the whole card: at two Neptunians the hand the
    // trash is paid from is the hand the draws produced, so a player holding
    // nothing else still keeps a card. Interleaving would leave them at zero.
    const game = table("eb04-011-order")
      .withHand("p1", [instance("scaled", "EB04-011")])
      .withBoard("p1", [character("bird", "EB04-016", { playedTurn: 1 })])
      .withState((state) => {
        state.players.p1.hand = state.players.p1.hand.filter(
          (card) => card.instanceId === "scaled",
        );
      })
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-011" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("EB04-013 Carrot", () => {
  covers("EB04-013", "[On Play]");

  it("restands two Minks and the Leader behind a Minks Leader", () => {
    const game = table("eb04-013-minks")
      .withLeader("p1", TYPED_LEADER)
      .withHand("p1", [instance("carrot", "EB04-013")])
      .withBoard("p1", [
        character("mystoms", "EB04-017", { rested: true, playedTurn: 1 }),
        character("eleclaw-body", "EB04-013", { rested: true, playedTurn: 1 }),
      ])
      .withRestedLeader("p1")
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-013" });
    game.play({ type: "resolve-effect", optionId: "mystoms" });
    game.play({ type: "resolve-effect", optionId: "eleclaw-body" });
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(false);
    for (const id of ["mystoms", "eleclaw-body"]) {
      expect(
        game.state.players.p1.board.find((card) => card.instanceId === id)
          ?.rested,
      ).toBe(false);
    }
  });

  it("restands the Leader even with no Minks Character to pick", () => {
    // Two quantifiers in one sentence: the Characters are "up to 2" and the
    // Leader is not qualified at all.
    const game = table("eb04-013-leader-only")
      .withLeader("p1", TYPED_LEADER)
      .withHand("p1", [instance("carrot", "EB04-013")])
      .withRestedLeader("p1")
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-013" });
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("eb04-013-wrong-leader")
      .withHand("p1", [instance("carrot", "EB04-013")])
      .withRestedLeader("p1")
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-013" });
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
  });
});

describe("EB04-017 Mystoms", () => {
  covers("EB04-017", "[On Play]");

  it("plays a Minks body of cost 5 or less out of hand", () => {
    const game = table("eb04-017-play")
      .withLeader("p1", TYPED_LEADER)
      .withHand("p1", [
        instance("mystoms", "EB04-017"),
        // EB04-019 is an Event, so only the Character qualifies; EB04-013 is
        // {Minks} at cost 8, one the ceiling excludes.
        instance("carrot", "EB04-013"),
        instance("eleclaw", "EB04-019"),
        instance("small-minks", "EB04-017"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-017" });
    settle(game);

    // Nothing in hand is a {Minks} Character at 5 cost or less: EB04-013 is
    // {Minks} at 8, EB04-019 is an Event, and a second Mystoms is a 6-drop --
    // so the free play finds nothing and only the played body is on the board.
    expect(boardIds(game.state, "p1")).toEqual(["mystoms"]);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("eb04-017-wrong-leader")
      .withHand("p1", [
        instance("mystoms", "EB04-017"),
        instance("small-minks", "EB04-017"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-017" });
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["mystoms"]);
  });
});

describe("EB04-017 Mystoms' aura", () => {
  covers("EB04-017", "[Your Turn]");

  it("gives the opponent's board −1 cost at three Minks", () => {
    const game = table("eb04-017-aura")
      .withBoard("p1", [
        character("a", "EB04-017", { playedTurn: 1 }),
        character("b", "EB04-017", { playedTurn: 1 }),
        character("c", "EB04-013", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const jinbe = game.state.players.p2.board[0]!;
    // ST31-002 Jinbe is a printed 5-drop.
    expect(effectiveCost(game.state, "p2", jinbe)).toBe(4);
  });

  it("gives nothing at two Minks", () => {
    const game = table("eb04-017-aura-short")
      .withBoard("p1", [
        character("a", "EB04-017", { playedTurn: 1 }),
        character("b", "EB04-017", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const jinbe = game.state.players.p2.board[0]!;
    expect(effectiveCost(game.state, "p2", jinbe)).toBe(5);
  });

  it("gives nothing on the opponent's own turn", () => {
    const game = defending("eb04-017-aura-off-turn")
      .withBoard("p1", [
        character("a", "EB04-017", { playedTurn: 1 }),
        character("b", "EB04-017", { playedTurn: 1 }),
        character("c", "EB04-013", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const jinbe = game.state.players.p2.board[0]!;
    expect(effectiveCost(game.state, "p2", jinbe)).toBe(5);
  });
});

describe("EB04-018 Megalo", () => {
  covers("EB04-018", "[On Play]");

  it("rests itself to K.O. a rested body at 8000 or less", () => {
    const game = table("eb04-018-ko")
      .withHand("p1", [instance("megalo", "EB04-018")])
      .withBoard("p2", [
        character("vista", "OP16-011", { rested: true, playedTurn: 1 }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "vista" });
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual([]);
    // The rest is the cost, so the body that paid it is rested on the board.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "megalo")
        ?.rested,
    ).toBe(true);
  });

  it("cannot reach an active Character", () => {
    const game = table("eb04-018-active")
      .withHand("p1", [instance("megalo", "EB04-018")])
      .withBoard("p2", [character("vista", "OP16-011", { playedTurn: 1 })])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    // The optional offer is still made -- the cost is the player's to pay --
    // but there is no target behind it.
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual(["vista"]);
  });

  it("cannot reach a printed 9000", () => {
    const game = table("eb04-018-too-big")
      .withHand("p1", [instance("megalo", "EB04-018")])
      // EB04-013 Carrot is a printed 9000: one thousand over the line.
      .withBoard("p2", [
        character("carrot", "EB04-013", { rested: true, playedTurn: 1 }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual(["carrot"]);
  });

  it("is not held off by DON!! the opponent gave the body", () => {
    // "8000 power or less" is read after modifiers -- but DON!! given to a
    // Character only adds power on its *controller's* turn, so on this turn
    // the 8000 is still an 8000 and the K.O. lands. That is the rule
    // `donPowerApplies` states, and pinning it here is what stops a future
    // reading of `maxCurrentPower` quietly making the opponent's spent DON!!
    // into removal protection.
    const game = table("eb04-018-donned")
      .withHand("p1", [instance("megalo", "EB04-018")])
      .withBoard("p2", [
        character("vista", "OP16-011", { rested: true, playedTurn: 1 }),
      ])
      .withGivenDon("p2", "vista", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "vista" });
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual([]);
  });
});

describe("EB04-021 Igaram", () => {
  covers("EB04-021", "[On Play]");

  it("draws two and trashes one behind the named Leader", () => {
    const game = table("eb04-021-on-play")
      .withLeader("p1", TYPED_LEADER)
      .withHand("p1", [instance("igaram", "EB04-021")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB04-021" });
    settle(game);

    // One out to be played, two in, one trashed.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
    expect(game.state.players.p1.trash.length - trashBefore).toBe(1);
  });

  it("draws nothing behind another Leader", () => {
    const game = table("eb04-021-wrong-leader")
      .withHand("p1", [instance("igaram", "EB04-021")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB04-021" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });
});

describe("EB04-022 Issho", () => {
  covers("EB04-022", "[On Play]");

  it("trades two cards for two off a hand of six", () => {
    const game = table("eb04-022-hit")
      .withHand("p1", [
        instance("issho", "EB04-022"),
        instance("pay-a", "ST31-002"),
        instance("pay-b", "ST31-002"),
      ])
      .withHand("p2", [
        ...copies(5, "ST32-002", "theirs"),
        instance("theirs-odd", "ST32-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-022" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "pay-a" });
    game.play({ type: "resolve-effect", optionId: "pay-b" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p2.hand).toHaveLength(4);
  });

  it("spends the cards and gets nothing off a hand of five", () => {
    // The gate is inside the cost: "you may trash: if they have 6 or more"
    // pays first and checks second, so a miscount costs the cards.
    const game = table("eb04-022-short")
      .withHand("p1", [
        instance("issho", "EB04-022"),
        instance("pay-a", "ST31-002"),
        instance("pay-b", "ST31-002"),
      ])
      .withHand("p2", copies(5, "ST32-002", "theirs"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-022" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "pay-a" });
    game.play({ type: "resolve-effect", optionId: "pay-b" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p2.hand).toHaveLength(5);
  });

  it("offers nothing to pay with on an empty hand", () => {
    const game = table("eb04-022-no-cost")
      .withHand("p1", [instance("issho", "EB04-022")])
      .withHand("p2", copies(6, "ST32-002", "theirs"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-022" });
    settle(game);

    // Unpayable, so the payoff is unreachable rather than free.
    expect(game.state.players.p2.hand).toHaveLength(6);
  });
});

describe("EB04-023 Chaka & Pell", () => {
  covers("EB04-023", "[On Play]", "[Double Attack]");

  it("pays 5000 off an active Leader to draw two", () => {
    const game = table("eb04-023-active")
      .withHand("p1", [instance("chaka", "EB04-023")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB04-023" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(0);
  });

  it("cannot draw once the Leader has already attacked", () => {
    // "Your active Leader" is a precondition, not decoration: an 8-drop that
    // wants to develop before swinging.
    const game = table("eb04-023-rested")
      .withHand("p1", [instance("chaka", "EB04-023")])
      .withRestedLeader("p1")
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB04-023" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("carries its printed [Double Attack]", () => {
    const game = table("eb04-023-keyword")
      .withBoard("p1", [character("chaka", "EB04-023", { playedTurn: 1 })])
      .build();

    expect(hasKeyword(game.state, "p1", "chaka", "Double Attack")).toBe(true);
  });
});

describe("EB04-025 Nefeltari Vivi", () => {
  covers("EB04-025", "[On Play]");

  it("plays an Alabasta body and bottoms a card from their hand", () => {
    const game = table("eb04-025-both")
      .withHand("p1", [
        instance("vivi", "EB04-025"),
        instance("chaka", "EB04-023"),
      ])
      .withHand("p2", [instance("theirs", "ST32-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-025" });
    game.play({ type: "resolve-effect", optionId: "chaka" });
    settle(game);

    expect(boardIds(game.state, "p1").sort()).toEqual(["chaka", "vivi"]);
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("theirs");
  });

  it("bottoms a card even when the free play finds nothing", () => {
    // The discard is unconditional and has no "up to", so the two are
    // sequenced rather than nested.
    const game = table("eb04-025-discard-only")
      .withHand("p1", [instance("vivi", "EB04-025")])
      .withHand("p2", [instance("theirs", "ST32-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-025" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(0);
  });

  it("excludes a second copy of itself by name", () => {
    const game = table("eb04-025-exclusion")
      .withHand("p1", [
        instance("vivi", "EB04-025"),
        instance("other-vivi", "EB04-025"),
      ])
      .withHand("p2", [instance("theirs", "ST32-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-025" });
    // Only the opponent's discard is left to resolve: the second Vivi is not
    // an eligible free play, so the chain stops.
    expect(effectOptions(game.state)).toEqual(["theirs"]);
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["vivi"]);
  });
});

describe("EB04-027 Boa Hancock", () => {
  covers("EB04-027", "[On Play]");

  it("draws two and trashes one", () => {
    const game = table("eb04-027-on-play")
      .withHand("p1", [instance("hancock", "EB04-027")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB04-027" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
    expect(game.state.players.p1.trash.length - trashBefore).toBe(1);
  });
});

describe("EB04-033 Groggy Monsters", () => {
  covers("EB04-033", "[On Play]");

  it("returns a DON!! to K.O. a 6000 base power at three Foxy Pirates", () => {
    const game = table("eb04-033-ko")
      .withHand("p1", [instance("groggy", "EB04-033")])
      .withBoard("p1", [
        character("foxy-a", "EB04-037", { playedTurn: 1 }),
        character("foxy-b", "EB04-037", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const fieldDon = () =>
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    const donBefore = fieldDon();
    game.play({ type: "play-card", cardNumber: "EB04-033" });
    settle(game);

    // `DON!! −1` returns one to the DON!! deck, so the field total drops.
    expect(fieldDon()).toBe(donBefore - 1);
    expect(boardIds(game.state, "p2")).toEqual([]);
  });

  it("reads printed power, so DON!! does not save a 6000", () => {
    // "6000 base power or less" -- the printed number, so the K.O. lands
    // through the DON!! the owner gave it.
    const game = table("eb04-033-base-power")
      .withHand("p1", [instance("groggy", "EB04-033")])
      .withBoard("p1", [
        character("foxy-a", "EB04-037", { playedTurn: 1 }),
        character("foxy-b", "EB04-037", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .withGivenDon("p2", "jinbe", 2)
      .build();

    expect(currentPower(game.state, "p2", "jinbe")).toBe(8000);
    game.play({ type: "play-card", cardNumber: "EB04-033" });
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual([]);
  });

  it("gets nothing at two Foxy Pirates", () => {
    const game = table("eb04-033-short")
      .withHand("p1", [instance("groggy", "EB04-033")])
      .withBoard("p1", [character("foxy-a", "EB04-037", { playedTurn: 1 })])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-033" });
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual(["jinbe"]);
  });
});

describe("EB04-036 Foxy", () => {
  covers("EB04-036", "[On Play]");

  it("draws two, trashes one and rests a body behind its own Leader", () => {
    const game = table("eb04-036-on-play")
      .withLeader("p1", TYPED_LEADER)
      .withHand("p1", [instance("foxy", "EB04-036")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB04-036" });
    settle(game);

    expect(game.state.players.p1.trash.length - trashBefore).toBe(1);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "jinbe")
        ?.rested,
    ).toBe(true);
  });

  it("returns the DON!! and gets neither half behind another Leader", () => {
    // The printed "Then" sits inside the Leader-gated sentence, so a Foxy
    // played behind the wrong Leader pays and gets nothing -- not the rest for
    // free.
    const game = table("eb04-036-wrong-leader")
      .withHand("p1", [instance("foxy", "EB04-036")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB04-036" });
    settle(game);

    expect(game.state.players.p1.trash.length - trashBefore).toBe(0);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "jinbe")
        ?.rested,
    ).toBeFalsy();
  });
});

describe("EB04-037 Porche", () => {
  covers("EB04-037", "[On Play]");

  it("digs five for a Foxy Pirates card behind its own Leader", () => {
    const game = table("eb04-037-hit")
      .withLeader("p1", TYPED_LEADER)
      .withHand("p1", [instance("porche", "EB04-037")])
      .withDeckTop("p1", [
        ...copies(4, "ST31-002", "filler"),
        instance("foxy", "EB04-036"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-037" });
    game.play({ type: "resolve-effect", optionId: "foxy" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "foxy",
    );
  });

  it("looks at nothing behind another Leader", () => {
    const game = table("eb04-037-wrong-leader")
      .withHand("p1", [instance("porche", "EB04-037")])
      .withDeckTop("p1", [instance("foxy", "EB04-036")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-037" });
    settle(game);

    expect(game.state.players.p1.deck[0]?.instanceId).toBe("foxy");
  });
});

describe('EB04-039 Eustass"Captain"Kid', () => {
  covers("EB04-039", "[On Play]");

  it("adds an active DON!! from the DON!! deck", () => {
    // `withDonDeck` puts two back: by turn 11 a real game has all ten on the
    // field, and a clause that adds one from the deck has nothing to add.
    // Eight active is exactly enough for the 7-cost body.
    const game = table("eb04-039-on-play")
      .withHand("p1", [instance("kid", "EB04-039")])
      .withDonDeck("p1", 2)
      .build();

    expect(game.state.players.p1.donDeck).toHaveLength(2);
    game.play({ type: "play-card", cardNumber: "EB04-039" });
    settle(game);

    // Seven rested to pay for the body, and the DON!! this clause adds arrives
    // active beside the one left over.
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(2);
    expect(game.state.players.p1.restedDon).toHaveLength(7);
  });

  it("adds nothing once the DON!! deck is empty", () => {
    // The printed "up to 1" is what makes this legal rather than an error, and
    // turn eleven is when it matters: every DON!! is already on the field.
    const game = table("eb04-039-empty-don-deck")
      .withHand("p1", [instance("kid", "EB04-039")])
      .build();

    expect(game.state.players.p1.donDeck).toHaveLength(0);
    game.play({ type: "play-card", cardNumber: "EB04-039" });
    settle(game);

    expect(game.state.players.p1.activeDon).toHaveLength(3);
  });
});

describe("EB04-042 Alpha", () => {
  covers("EB04-042", "[On Play]");

  it("mills three of its own to give −1 cost for the turn", () => {
    const game = table("eb04-042-cost")
      .withHand("p1", [instance("alpha", "EB04-042")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB04-042" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(game.state.players.p1.trash.length - trashBefore).toBe(3);
    const jinbe = game.state.players.p2.board[0]!;
    expect(effectiveCost(game.state, "p2", jinbe)).toBe(4);
  });
});

describe("EB04-043 Kaku", () => {
  covers("EB04-043", "[On Play]");

  it("mills two from the top of its own deck", () => {
    const game = table("eb04-043-on-play")
      .withHand("p1", [instance("kaku", "EB04-043")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB04-043" });
    settle(game);

    expect(game.state.players.p1.trash.length - trashBefore).toBe(2);
  });
});

describe("EB04-048 Rob Lucci", () => {
  covers("EB04-048", "[On Play]");

  it("trashes one of its own Characters to draw", () => {
    const game = table("eb04-048-on-play")
      .withHand("p1", [instance("lucci", "EB04-048")])
      .withBoard("p1", [character("nami", "OP01-016", { playedTurn: 1 })])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB04-048" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "nami" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
    expect(boardIds(game.state, "p1")).toEqual(["lucci"]);
  });

  it("offers itself as the Character to trash", () => {
    // "1 of your Characters" includes this one, and nothing narrows it: a
    // Lucci that trashes itself for a card is a line the text allows.
    const game = table("eb04-048-self")
      .withHand("p1", [instance("lucci", "EB04-048")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-048" });
    applyOptional(game);
    expect(effectOptions(game.state)).toContain("lucci");
    settle(game);
  });
});

describe("EB04-048 Rob Lucci's trash scaling", () => {
  covers("EB04-048", "static");

  it("gains +1000 power and +2 cost for every five in the trash", () => {
    const game = table("eb04-048-scaling")
      .withLeader("p1", TYPED_LEADER)
      .withBoard("p1", [character("lucci", "EB04-048", { playedTurn: 1 })])
      .withTrash("p1", copies(11, "ST31-002", "junk"))
      .build();

    const lucci = game.state.players.p1.board[0]!;
    // Eleven cards is two whole steps, not two and a fifth.
    expect(currentPower(game.state, "p1", "lucci")).toBe(6000 + 2000);
    expect(effectiveCost(game.state, "p1", lucci)).toBe(4 + 4);
  });

  it("scales off nothing behind a Leader without a CP type", () => {
    const game = table("eb04-048-wrong-leader")
      .withBoard("p1", [character("lucci", "EB04-048", { playedTurn: 1 })])
      .withTrash("p1", copies(11, "ST31-002", "junk"))
      .build();

    expect(currentPower(game.state, "p1", "lucci")).toBe(6000);
  });

  it("gains nothing under five cards in the trash", () => {
    const game = table("eb04-048-under")
      .withLeader("p1", TYPED_LEADER)
      .withBoard("p1", [character("lucci", "EB04-048", { playedTurn: 1 })])
      .withTrash("p1", copies(4, "ST31-002", "junk"))
      .build();

    expect(currentPower(game.state, "p1", "lucci")).toBe(6000);
  });
});

// --- statics with no timing window -----------------------------------------

describe("EB04-003 Smoker & Tashigi", () => {
  covers("EB04-003", "[Opponent's Turn]", "[Rush]");

  it("rewrites a Navy Leader's base power to 7000 on defence", () => {
    const game = defending("eb04-003-navy")
      // OP10-001 Smoker, a {Navy} Leader printed at 5000.
      .withLeader("p1", "OP10-001")
      .withBoard("p1", [character("pair", "EB04-003", { playedTurn: 1 })])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });

  it("leaves the Leader alone on its controller's own turn", () => {
    const game = table("eb04-003-own-turn")
      .withLeader("p1", "OP10-001")
      .withBoard("p1", [character("pair", "EB04-003", { playedTurn: 1 })])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("leaves a Leader without the Navy type alone", () => {
    const game = defending("eb04-003-not-navy")
      .withBoard("p1", [character("pair", "EB04-003", { playedTurn: 1 })])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("sets the base, so DON!! on the Leader still stacks", () => {
    const game = defending("eb04-003-base")
      .withLeader("p1", "OP10-001")
      .withBoard("p1", [character("pair", "EB04-003", { playedTurn: 1 })])
      .withGivenDon("p1", "p1-leader", 1)
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8000);
  });

  it("can attack the turn it is played, from its printed [Rush]", () => {
    const game = table("eb04-003-rush")
      .withHand("p1", [instance("pair", "EB04-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-003" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "pair",
        ),
    ).toBe(true);
  });
});

describe("EB04-005 Trafalgar Law", () => {
  covers("EB04-005", "static");

  it("cannot attack until the opponent has two bodies at 5000 or more", () => {
    const game = table("eb04-005-blocked")
      .withBoard("p1", [character("law", "EB04-005", { playedTurn: 1 })])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "law",
        ),
    ).toBe(false);
  });

  it("attacks once a second 5000 lands", () => {
    const game = table("eb04-005-open")
      .withBoard("p1", [character("law", "EB04-005", { playedTurn: 1 })])
      .withBoard("p2", [
        character("jinbe", "ST31-002"),
        character("vista", "OP16-011"),
      ])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "law",
        ),
    ).toBe(true);
  });

  it("reads printed power, so DON!! on a small body does not open it", () => {
    // A punish for a developed board: printed power is what "developed" means,
    // so two DON!! on a 1000 is not a second 5000.
    const game = table("eb04-005-printed-power")
      .withBoard("p1", [character("law", "EB04-005", { playedTurn: 1 })])
      .withBoard("p2", [
        character("jinbe", "ST31-002"),
        character("nami", "OP01-016"),
      ])
      .withGivenDon("p2", "nami", 5)
      .build();

    expect(currentPower(game.state, "p2", "nami")).toBe(7000);
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "law",
        ),
    ).toBe(false);
  });
});

describe("EB04-046 Doll", () => {
  covers("EB04-046", "[Opponent's Turn]", "[Blocker]");

  it("puts its controller's Navy bodies up 2 cost on defence", () => {
    const game = defending("eb04-046-aura")
      .withBoard("p1", [
        character("doll", "EB04-046", { playedTurn: 1 }),
        character("helmeppo", "EB04-047", { playedTurn: 1 }),
      ])
      .build();

    const helmeppo = game.state.players.p1.board.find(
      (card) => card.instanceId === "helmeppo",
    )!;
    // EB04-047 is a printed 3-drop and is {Navy}.
    expect(effectiveCost(game.state, "p1", helmeppo)).toBe(5);
  });

  it("covers itself, because the aura reads the whole board", () => {
    const game = defending("eb04-046-self")
      .withBoard("p1", [character("doll", "EB04-046", { playedTurn: 1 })])
      .build();

    const doll = game.state.players.p1.board[0]!;
    expect(effectiveCost(game.state, "p1", doll)).toBe(4);
  });

  it("does nothing on its controller's own turn", () => {
    const game = table("eb04-046-own-turn")
      .withBoard("p1", [character("doll", "EB04-046", { playedTurn: 1 })])
      .build();

    const doll = game.state.players.p1.board[0]!;
    expect(effectiveCost(game.state, "p1", doll)).toBe(2);
  });

  it("carries its printed [Blocker]", () => {
    const game = defending("eb04-046-blocker")
      .withBoard("p1", [character("doll", "EB04-046", { playedTurn: 1 })])
      .build();

    expect(hasKeyword(game.state, "p1", "doll", "Blocker")).toBe(true);
  });
});

describe("EB04-051 Emet", () => {
  covers("EB04-051", "static");

  it("cannot attack while nothing on the table is a printed 12000", () => {
    const game = table("eb04-051-blocked")
      .withBoard("p1", [character("emet", "EB04-051", { playedTurn: 1 })])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "emet",
        ),
    ).toBe(false);
  });

  it("attacks once a 12000 is on either board", () => {
    // The printed clause names no side, so the opponent's giant opens it too.
    const game = table("eb04-051-open")
      .withBoard("p1", [character("emet", "EB04-051", { playedTurn: 1 })])
      // EB04-061 Monkey.D.Luffy is a printed 12000.
      .withBoard("p2", [character("luffy", "EB04-061")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "emet",
        ),
    ).toBe(true);
  });
});

describe("EB04-057 Vegapunk", () => {
  covers("EB04-057", "static");

  it("makes its yellow Scientist teammates immune at two Life", () => {
    // Driven through a real K.O. rather than through the immunity predicate:
    // EB04-018 Megalo, from the other side of the table, is an opponent's
    // effect that K.O.s a rested body at 8000 or less, and a 0-power Vegapunk
    // is squarely inside that. The protected teammate is simply not offered.
    const game = defending("eb04-057-immune")
      .withLife("p1", 2)
      .withBoard("p1", [
        character("vegapunk", "EB04-057", { rested: true, playedTurn: 1 }),
        character("other", "EB04-057", { rested: true, playedTurn: 1 }),
      ])
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    // The body is still *offered*: immunity is enforced where the removal
    // resolves, not where the target is chosen, which is how every other
    // immunity in the pool reads. So the K.O. is aimed and does nothing.
    game.play({ type: "resolve-effect", optionId: "other" });
    settle(game);

    expect(boardIds(game.state, "p1").sort()).toEqual(["other", "vegapunk"]);
  });

  it("protects nothing one Life card above the line", () => {
    const game = defending("eb04-057-high-life")
      .withLife("p1", 3)
      .withBoard("p1", [
        character("vegapunk", "EB04-057", { rested: true, playedTurn: 1 }),
        character("other", "EB04-057", { rested: true, playedTurn: 1 }),
      ])
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "other" });
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["vegapunk"]);
  });

  it("protects nothing outside yellow {Scientist}", () => {
    const game = defending("eb04-057-filter")
      .withLife("p1", 2)
      .withBoard("p1", [
        character("vegapunk", "EB04-057", { rested: true, playedTurn: 1 }),
        // OP01-016 Nami is red and no {Scientist}, so the aura's filter leaves
        // it out however low the Life total is.
        character("nami", "OP01-016", { rested: true, playedTurn: 1 }),
      ])
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "nami" });
    settle(game);

    // Nami is gone and the Vegapunk beside it is not, off the same effect --
    // which is the aura's filter doing the work rather than the Life gate.
    expect(boardIds(game.state, "p1")).toEqual(["vegapunk"]);
  });

  it("gains [Blocker] off one DON!!", () => {
    const game = defending("eb04-057-blocker")
      .withBoard("p1", [character("vegapunk", "EB04-057", { playedTurn: 1 })])
      .withGivenDon("p1", "vegapunk", 1)
      .build();

    expect(hasKeyword(game.state, "p1", "vegapunk", "Blocker")).toBe(true);
  });

  it("has no [Blocker] with no DON!! on it", () => {
    const game = defending("eb04-057-no-don")
      .withBoard("p1", [character("vegapunk", "EB04-057", { playedTurn: 1 })])
      .build();

    expect(hasKeyword(game.state, "p1", "vegapunk", "Blocker")).toBe(false);
  });
});

// --- [Activate: Main] -------------------------------------------------------

describe("EB04-012 Kikunojo", () => {
  covers("EB04-012", "[Activate: Main]");

  it("restands a Land of Wano Leader the turn it lands", () => {
    const game = table("eb04-012-restand")
      // OP06-022 Yamato, a {Land of Wano} Leader.
      .withLeader("p1", "OP06-022")
      .withHand("p1", [instance("kiku", "EB04-012")])
      .withRestedLeader("p1")
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-012" });
    game.play({ type: "activate-main", sourceInstanceId: "kiku" });
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("does nothing from a body that was not played this turn", () => {
    // `[Once Per Turn]` alone would let a Kikunojo sitting on the board
    // restand the Leader every turn after the one it arrived on.
    const game = table("eb04-012-old-body")
      .withLeader("p1", "OP06-022")
      .withBoard("p1", [character("kiku", "EB04-012", { playedTurn: 1 })])
      .withRestedLeader("p1")
      .build();

    // The condition is the program's whole gate, so the engine withholds the
    // activation rather than offering one that would spend the once-per-turn
    // budget for nothing.
    expect(activateOffered(game, "p1", "kiku")).toBe(false);
    expect(game.state.players.p1.leaderRested).toBe(true);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("eb04-012-wrong-leader")
      .withHand("p1", [instance("kiku", "EB04-012")])
      .withRestedLeader("p1")
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-012" });
    settle(game);

    // Two conditions, both printed, and neither implies the other: played this
    // turn is satisfied here and the Leader's type is not.
    expect(activateOffered(game, "p1", "kiku")).toBe(false);
    expect(game.state.players.p1.leaderRested).toBe(true);
  });

  it("is offered once a turn", () => {
    const game = table("eb04-012-once")
      .withLeader("p1", "OP06-022")
      .withHand("p1", [instance("kiku", "EB04-012")])
      .withRestedLeader("p1")
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-012" });
    game.play({ type: "activate-main", sourceInstanceId: "kiku" });
    settle(game);

    expect(activateOffered(game, "p1", "kiku")).toBe(false);
  });
});

describe("EB04-014 Kozuki Sukiyaki", () => {
  covers("EB04-014", "[Activate: Main]", "[Blocker]");

  it("moves a rested DON!! onto a Land of Wano Leader", () => {
    const game = table("eb04-014-give")
      .withLeader("p1", "OP06-022")
      .withBoard("p1", [character("sukiyaki", "EB04-014", { playedTurn: 1 })])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "sukiyaki" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });

  it("is not offered with no rested DON!! to move", () => {
    const game = table("eb04-014-no-rested")
      .withLeader("p1", "OP06-022")
      .withBoard("p1", [character("sukiyaki", "EB04-014", { playedTurn: 1 })])
      .build();

    expect(game.state.players.p1.restedDon).toHaveLength(0);
    expect(activateOffered(game, "p1", "sukiyaki")).toBe(false);
  });

  it("carries its printed [Blocker]", () => {
    const game = defending("eb04-014-blocker")
      .withBoard("p1", [character("sukiyaki", "EB04-014", { playedTurn: 1 })])
      .build();

    expect(hasKeyword(game.state, "p1", "sukiyaki", "Blocker")).toBe(true);
  });
});

describe("EB04-016 Bird Neptunian", () => {
  covers("EB04-016", "[Activate: Main]");

  it("sets a DON!! active and then shuts the door behind itself", () => {
    const game = table("eb04-016-activate")
      .withBoard("p1", [
        character("bird", "EB04-016", { playedTurn: 1 }),
        character("second", "EB04-016", { playedTurn: 1 }),
      ])
      .withDon("p1", { rested: 4 })
      .build();

    expect(game.state.players.p1.activeDon).toHaveLength(6);
    game.play({ type: "activate-main", sourceInstanceId: "bird" });
    settle(game);

    expect(game.state.players.p1.activeDon).toHaveLength(7);
    // The lock is the limit, so the second copy is no longer offered even
    // though neither is `[Once Per Turn]`.
    expect(activateOffered(game, "p1", "second")).toBe(false);
  });
});

describe("EB04-021 Igaram's activation", () => {
  covers("EB04-021", "[Activate: Main]");

  it("trashes a card to move a rested DON!! to the Leader", () => {
    const game = table("eb04-021-activate")
      .withBoard("p1", [character("igaram", "EB04-021", { playedTurn: 1 })])
      .withHand("p1", [instance("fodder", "ST31-002")])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "igaram" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
    expect(
      game.state.players.p1.leaderAttachedDon.length +
        game.state.players.p1.board[0]!.attachedDon!.length,
    ).toBe(1);
  });

  it("is not offered on an empty hand", () => {
    const game = table("eb04-021-no-hand")
      .withBoard("p1", [character("igaram", "EB04-021", { playedTurn: 1 })])
      .withHand("p1", [])
      .withDon("p1", { rested: 1 })
      .build();

    expect(activateOffered(game, "p1", "igaram")).toBe(false);
  });
});

describe("EB04-024 Terracotta", () => {
  covers("EB04-024", "[Activate: Main]");

  it("rests itself and a card from hand for [Unblockable]", () => {
    const game = table("eb04-024-grant")
      .withBoard("p1", [
        character("terracotta", "EB04-024", { playedTurn: 1 }),
        character("chaka", "EB04-023", { playedTurn: 1 }),
      ])
      .withHand("p1", [instance("fodder", "ST31-002")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "terracotta" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "chaka" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "chaka", "Unblockable")).toBe(true);
    expect(
      game.state.players.p1.board.find(
        (card) => card.instanceId === "terracotta",
      )?.rested,
    ).toBe(true);
  });

  it("does not rest itself when the hand cannot pay", () => {
    // The hand payment is the outer cost and the rest sits inside its payoff,
    // so an empty hand costs nothing at all.
    const game = table("eb04-024-unpayable")
      .withBoard("p1", [character("terracotta", "EB04-024", { playedTurn: 1 })])
      .withHand("p1", [])
      .build();

    expect(activateOffered(game, "p1", "terracotta")).toBe(false);
    expect(game.state.players.p1.board[0]?.rested).toBeFalsy();
  });
});

describe("EB04-036 Foxy's activation", () => {
  covers("EB04-036", "[Activate: Main]");

  it("adds a rested DON!! behind any Leader", () => {
    // Ungated, unlike this card's `[On Play]`: the ramp works behind any
    // Leader and the removal does not.
    const game = table("eb04-036-activate")
      .withBoard("p1", [character("foxy", "EB04-036", { playedTurn: 1 })])
      .withDonDeck("p1", 1)
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "foxy" });
    settle(game);

    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe('EB04-039 Eustass"Captain"Kid\'s activation', () => {
  covers("EB04-039", "[Activate: Main]");

  it("trashes itself to play a Kid Pirates body of cost 5 or less", () => {
    const game = table("eb04-039-activate")
      .withBoard("p1", [character("kid", "EB04-039", { playedTurn: 1 })])
      // OP10-106 Killer is {Kid Pirates} at cost 3.
      .withHand("p1", [instance("killer", "OP10-106")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "kid" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "killer" });
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["killer"]);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("kid");
  });

  it("plays nothing out of the trash", () => {
    // "From your hand" -- one word apart from EB04-047, and the difference
    // between the two activations.
    const game = table("eb04-039-hand-only")
      .withBoard("p1", [character("kid", "EB04-039", { playedTurn: 1 })])
      .withTrash("p1", [instance("killer", "OP10-106")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "kid" });
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual([]);
  });
});

describe("EB04-045 Ginny", () => {
  covers("EB04-045", "[Activate: Main]");

  it("rests itself for +1000 with two 8-drops on the table", () => {
    const game = table("eb04-045-open")
      .withBoard("p1", [
        character("ginny", "EB04-045", { playedTurn: 1 }),
        character("kuma", "EB04-055", { playedTurn: 1 }),
        // EB04-023 Chaka & Pell is a cost-8 body.
        character("chaka", "EB04-023", { playedTurn: 1 }),
      ])
      // The opponent's 8-drop counts too: the clause names no side.
      .withBoard("p2", [character("carrot", "EB04-013")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "ginny" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "kuma" });
    settle(game);

    // EB04-055 is a printed 5000.
    expect(currentPower(game.state, "p1", "kuma")).toBe(6000);
  });

  it("gets nothing with only one 8-drop out", () => {
    const game = table("eb04-045-short")
      .withBoard("p1", [
        character("ginny", "EB04-045", { playedTurn: 1 }),
        character("kuma", "EB04-055", { playedTurn: 1 }),
        character("chaka", "EB04-023", { playedTurn: 1 }),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "ginny" });
    settle(game);

    expect(currentPower(game.state, "p1", "kuma")).toBe(5000);
  });
});

describe("EB04-047 Helmeppo", () => {
  covers("EB04-047", "[Activate: Main]");

  it("trashes itself to replay a SWORD body out of the trash", () => {
    const game = table("eb04-047-trash")
      .withBoard("p1", [character("helmeppo", "EB04-047", { playedTurn: 1 })])
      // OP11-013 Prince Grus is {SWORD} at cost 1.
      .withTrash("p1", [instance("grus", "OP11-013")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "helmeppo" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "grus" });
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["grus"]);
  });

  it("cannot replay the copy of itself it just trashed", () => {
    // The cost lands this card in the very zone the payoff reads, which is why
    // the name exclusion is not decoration.
    const game = table("eb04-047-exclusion")
      .withBoard("p1", [character("helmeppo", "EB04-047", { playedTurn: 1 })])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "helmeppo" });
    applyOptional(game);
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual([]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "helmeppo",
    ]);
  });
});

// --- [Main] Events ----------------------------------------------------------

describe("EB04-008 Distorted Future", () => {
  covers("EB04-008", "[Main]");

  it("gives −3000 at two Life cards", () => {
    const game = table("eb04-008-main")
      .withLife("p1", 2)
      .withHand("p1", [instance("event", "EB04-008")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-008]" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(currentPower(game.state, "p2", "jinbe")).toBe(3000);
  });

  it("gives nothing one Life card above the line", () => {
    const game = table("eb04-008-high-life")
      .withLife("p1", 3)
      .withHand("p1", [instance("event", "EB04-008")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    // The Life gate is the program's whole condition, so the Event is not even
    // offered: a 1-cost card spent for nothing is worse than a card held.
    expect(eventOffered(game, "EB04-008")).toBe(false);
    expect(currentPower(game.state, "p2", "jinbe")).toBe(6000);
  });
});

describe("EB04-009 It's My Student's Farewell. I Want It to Be Proper.", () => {
  covers("EB04-009", "[Main]");

  it("gives an active DON!! to a Rayleigh for −2000", () => {
    const game = table("eb04-009-main")
      .withHand("p1", [instance("event", "EB04-009")])
      // ST32-004 Silvers Rayleigh, the named Character the cost is paid into.
      .withBoard("p1", [character("rayleigh", "ST32-004", { playedTurn: 1 })])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-009]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "rayleigh" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(currentPower(game.state, "p2", "jinbe")).toBe(4000);
    // The DON!! is given, not spent: it stays on the field as power.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "rayleigh")
        ?.attachedDon,
    ).toHaveLength(1);
  });

  it("cannot buy the debuff with no Rayleigh to pay into", () => {
    const game = table("eb04-009-no-rayleigh")
      .withHand("p1", [instance("event", "EB04-009")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    // Not offered at all: the shared Rayleigh-Event gate asks for a
    // [Silvers Rayleigh] on the field before the Event can be activated
    // (Bandai's OP12-016#2 / OP12-017#2 / OP12-019#2 rulings on the same
    // clause).
    expect(
      game
        .legalActions()
        .some((action) => action.summary.includes("[EB04-009]")),
    ).toBe(false);
    expect(currentPower(game.state, "p2", "jinbe")).toBe(6000);
  });
});

describe("EB04-019 Eleclaw", () => {
  covers("EB04-019", "[Main]");

  it("rests one of its own cards for −3 cost behind a Minks Leader", () => {
    const game = table("eb04-019-main")
      .withLeader("p1", TYPED_LEADER)
      .withHand("p1", [instance("event", "EB04-019")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-019]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    const jinbe = game.state.players.p2.board[0]!;
    expect(effectiveCost(game.state, "p2", jinbe)).toBe(2);
    // "1 of your cards" reaches the Leader, which is what makes the cost
    // payable on an empty board.
    expect(game.state.players.p1.leaderRested).toBe(true);
  });

  it("pays the rest and gets nothing behind another Leader", () => {
    const game = table("eb04-019-wrong-leader")
      .withHand("p1", [instance("event", "EB04-019")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-019]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    const jinbe = game.state.players.p2.board[0]!;
    expect(effectiveCost(game.state, "p2", jinbe)).toBe(5);
    expect(game.state.players.p1.leaderRested).toBe(true);
  });
});

describe("EB04-029 I Heard the Sound...of a Lady's Teardrops Falling", () => {
  covers("EB04-029", "[Main]");

  it("digs three for a Sanji or an Event and trashes the rest", () => {
    const game = table("eb04-029-main")
      // OP12-041 Sanji, the named Leader.
      .withLeader("p1", "OP12-041")
      .withHand("p1", [instance("event", "EB04-029")])
      .withDeckTop("p1", [
        instance("filler-a", "ST31-002"),
        instance("sanji", "EB04-052"),
        instance("filler-b", "ST31-002"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-029]" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "sanji",
    );
    // The leftovers are trashed rather than bottomed: a miss costs three cards
    // of deck.
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["filler-a", "filler-b"]),
    );
  });

  it("looks at nothing behind another Leader", () => {
    const game = table("eb04-029-wrong-leader")
      .withHand("p1", [instance("event", "EB04-029")])
      .withDeckTop("p1", [instance("sanji", "EB04-052")])
      .build();

    expect(eventOffered(game, "EB04-029")).toBe(false);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("sanji");
  });
});

describe("EB04-040 Flame Dragon Torch", () => {
  covers("EB04-040", "[Main]");

  it("rests six DON!! to buff a Kaido and rest a body", () => {
    const game = table("eb04-040-main")
      .withHand("p1", [instance("event", "EB04-040")])
      .withBoard("p1", [character("kaido", "EB04-030", { playedTurn: 1 })])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-040]" });
    game.play({ type: "resolve-effect", optionId: "kaido" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    // EB04-030 is a printed 9000, and the Event itself costs one DON!! on top
    // of the six it rests.
    expect(currentPower(game.state, "p1", "kaido")).toBe(12000);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "jinbe")
        ?.rested,
    ).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(7);
  });

  it("is not offered without six DON!! to rest", () => {
    const game = table("eb04-040-short-don")
      .withHand("p1", [instance("event", "EB04-040")])
      .withDon("p1", { rested: 5 })
      .build();

    expect(eventOffered(game, "EB04-040")).toBe(false);
  });
});

describe("EB04-041 Stealth Black", () => {
  covers("EB04-041", "[Main]");

  it("plays a Sanji out of the trash behind the named Leader", () => {
    const game = table("eb04-041-main")
      .withLeader("p1", "OP12-041")
      .withHand("p1", [instance("event", "EB04-041")])
      .withTrash("p1", [instance("sanji", "EB04-052")])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-041]" });
    game.play({ type: "resolve-effect", optionId: "sanji" });
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["sanji"]);
  });

  it("plays nothing with three DON!! or fewer on the field", () => {
    const game = table("eb04-041-short-don")
      .withLeader("p1", "OP12-041")
      .withHand("p1", [instance("event", "EB04-041")])
      .withTrash("p1", [instance("sanji", "EB04-052")])
      .withDonDeck("p1", 7)
      .build();

    // Two gates and the DON!! one is false, so the offer is withheld.
    expect(eventOffered(game, "EB04-041")).toBe(false);
    expect(boardIds(game.state, "p1")).toEqual([]);
  });
});

describe("EB04-049 Finger Pistol Yellow Lotus", () => {
  covers("EB04-049", "[Main]");

  it("mills two of its own to K.O. a base cost 5", () => {
    const game = table("eb04-049-main")
      .withHand("p1", [instance("event", "EB04-049")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "activate-main", summary: "[EB04-049]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    // Two off the deck plus the Event itself.
    expect(game.state.players.p1.trash.length - trashBefore).toBe(3);
    expect(boardIds(game.state, "p2")).toEqual([]);
  });

  it("reads base cost, so a discounted 6-drop is out of range", () => {
    // "Base cost of 5 or less" is the printed number, which is the whole
    // reason `maxBaseCost` and `maxCost` are different fields.
    const game = table("eb04-049-base-cost")
      .withHand("p1", [instance("event", "EB04-049")])
      // ST32-003 Dracule Mihawk is a printed 6-drop.
      .withBoard("p2", [character("mihawk", "ST32-003")])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-049]" });
    applyOptional(game);
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual(["mihawk"]);
  });
});

describe("EB04-050 I'll Whip You Into Shape. ♡", () => {
  covers("EB04-050", "[Main]");

  it("lets a SWORD body attack an active Character", () => {
    const game = table("eb04-050-main")
      .withHand("p1", [instance("event", "EB04-050")])
      .withBoard("p1", [character("helmeppo", "EB04-047", { playedTurn: 1 })])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const targets = () =>
      game
        .legalActions("p1")
        .filter(
          (action) =>
            action.type === "attack" &&
            (action as { attackerInstanceId?: string }).attackerInstanceId ===
              "helmeppo",
        )
        .map(
          (action) =>
            (action as { targetInstanceId?: string }).targetInstanceId,
        );

    // An active Character is not a legal target before the Event resolves.
    expect(targets()).toEqual(["p2-leader"]);

    game.play({ type: "activate-main", summary: "[EB04-050]" });
    game.play({ type: "resolve-effect", optionId: "helmeppo" });
    settle(game);

    expect(targets()).toEqual(expect.arrayContaining(["jinbe"]));
  });
});

describe("EB04-060 Gum-Gum Hawk Gatling", () => {
  covers("EB04-060", "[Main]");

  it("trades a Life card for an Egghead body on Life, face-up", () => {
    const game = table("eb04-060-main")
      .withLife("p1", 2)
      .withHand("p1", [
        instance("event", "EB04-060"),
        instance("sanji", "EB04-052"),
      ])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "activate-main", summary: "[EB04-060]" });
    applyOptional(game);
    settle(game);

    // One Life card into hand, the Egghead body out of it and onto Life: the
    // Life total is unchanged and the hand is down by the Event and the body.
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("sanji");
    // Face-up, which is the opposite of every other Life-stacking clause: the
    // opponent can see the Trigger coming and this deck can plan around it.
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(currentPower(game.state, "p2", "jinbe")).toBe(5000);
  });

  it("is unplayable with no Life card to pay with", () => {
    const game = table("eb04-060-no-life")
      .withLife("p1", 0)
      .withHand("p1", [
        instance("event", "EB04-060"),
        instance("sanji", "EB04-052"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "[EB04-060]" });
    settle(game);

    // The payoff is nested inside the cost, so an empty Life area buys
    // nothing rather than getting the swap free.
    expect(game.state.players.p1.life).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "sanji",
    );
  });
});

// --- [Counter] Events -------------------------------------------------------

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

describe("EB04-008 Distorted Future's Counter", () => {
  covers("EB04-008", "[Counter]");

  it("gives the Leader +3000 whatever the Life total is", () => {
    // Unconditional, unlike the `[Main]` half: at five Life the removal half
    // is dead and this one is not, which is what keeps the slot live.
    const game = openAttack(
      counterStep("eb04-008-counter").withHand("p1", [
        instance("event", "EB04-008"),
      ]),
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });

  it("is not offered while a Character is the one being attacked", () => {
    // `target: { isLeader: true }` is printed: the buff names the Leader, so a
    // blocked attack gets none of it -- and cannot be spent for any benefit.
    const game = openAttack(
      counterStep("eb04-008-blocked")
        .withHand("p1", [instance("event", "EB04-008")])
        .withBoard("p1", [character("blocker", "ST31-002")]),
      "blocker",
    ).build();

    expect(
      getLegalActions(game.state, "p1").find(
        (action) => action.type === "activate-counter-event",
      ),
    ).toBeUndefined();
  });
});

describe("EB04-009's Counter", () => {
  covers("EB04-009", "[Counter]");

  it("reaches a Character with no Rayleigh anywhere", () => {
    // The disjunction: any Character qualifies, and the Leader only if it is
    // the named one.
    const game = openAttack(
      counterStep("eb04-009-counter-character")
        .withHand("p1", [instance("event", "EB04-009")])
        .withBoard("p1", [character("body", "ST31-002")]),
      "body",
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });

  it("is not offered behind a Leader that is not the named one", () => {
    const game = openAttack(
      counterStep("eb04-009-counter-leader").withHand("p1", [
        instance("event", "EB04-009"),
      ]),
    ).build();

    expect(
      getLegalActions(game.state, "p1").find(
        (action) => action.type === "activate-counter-event",
      ),
    ).toBeUndefined();
  });
});

describe("EB04-019 Eleclaw's Counter", () => {
  covers("EB04-019", "[Counter]");

  it("gives a Minks card in the battle +3000", () => {
    const game = openAttack(
      counterStep("eb04-019-counter")
        .withHand("p1", [instance("event", "EB04-019")])
        // EB04-017 Mystoms is {Minks}.
        .withBoard("p1", [character("minks", "EB04-017")]),
      "minks",
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });

  it("is not offered over a battle for a card without the type", () => {
    const game = openAttack(
      counterStep("eb04-019-counter-miss")
        .withHand("p1", [instance("event", "EB04-019")])
        .withBoard("p1", [character("body", "ST31-002")]),
      "body",
    ).build();

    expect(
      getLegalActions(game.state, "p1").find(
        (action) => action.type === "activate-counter-event",
      ),
    ).toBeUndefined();
  });
});

describe("EB04-020 Shark Brick Fist's Counter", () => {
  covers("EB04-020", "[Counter]");

  it("buffs a Fish-Man in the battle and restands another one", () => {
    // The restand is what makes a 1-cost Counter worth more than the 3000 it
    // prints: on the opponent's turn an active Fish-Man is a second blocker.
    const game = openAttack(
      counterStep("eb04-020-counter")
        .withHand("p1", [instance("event", "EB04-020")])
        .withBoard("p1", [
          // EB04-015 Jinbe and EB04-033 Groggy Monsters are both {Fish-Man}.
          character("jinbe", "EB04-015"),
          character("groggy", "EB04-033", { rested: true }),
        ]),
      "jinbe",
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    game.play({ type: "resolve-effect", optionId: "groggy" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "groggy")
        ?.rested,
    ).toBe(false);
  });

  it("still buffs with nothing rested to restand", () => {
    const game = openAttack(
      counterStep("eb04-020-counter-no-restand")
        .withHand("p1", [instance("event", "EB04-020")])
        .withBoard("p1", [character("jinbe", "EB04-015")]),
      "jinbe",
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("EB04-029's Counter", () => {
  covers("EB04-029", "[Counter]");

  it("trashes a card for +4000 on a Sanji in the battle", () => {
    const game = openAttack(
      counterStep("eb04-029-counter")
        .withHand("p1", [
          instance("event", "EB04-029"),
          instance("fodder", "ST31-002"),
        ])
        .withBoard("p1", [character("sanji", "EB04-052")]),
      "sanji",
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("buys nothing with no second card to trash", () => {
    // The card out of hand is the price, so a hand holding only the Event
    // itself cannot reach the buff.
    const game = openAttack(
      counterStep("eb04-029-counter-broke")
        .withHand("p1", [instance("event", "EB04-029")])
        .withBoard("p1", [character("sanji", "EB04-052")]),
      "sanji",
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(0);
  });
});

describe("EB04-040 Flame Dragon Torch's Counter", () => {
  covers("EB04-040", "[Counter]");

  it("returns a DON!! for +4000 on the Leader", () => {
    const game = openAttack(
      counterStep("eb04-040-counter").withHand("p1", [
        instance("event", "EB04-040"),
      ]),
    )
      .withDon("p1", { active: 2 })
      .build();

    const fieldDon = () =>
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    const donBefore = fieldDon();
    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    applyOptional(game);
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
    // The Event's own cost rests a DON!! and leaves it on the field; only the
    // `DON!! −1` goes back to the DON!! deck.
    expect(fieldDon()).toBe(donBefore - 1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("EB04-050's Counter", () => {
  covers("EB04-050", "[Counter]");

  it("gives the Leader +3000", () => {
    const game = openAttack(
      counterStep("eb04-050-counter").withHand("p1", [
        instance("event", "EB04-050"),
      ]),
    ).build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

// --- [When Attacking], [On Block], [On Your Opponent's Attack] -------------

describe("EB04-004 Zeff", () => {
  covers("EB04-004", "[When Attacking]");

  it("rewrites the Leader's base power to 7000 and holds it a turn", () => {
    const game = table("eb04-004-attacking")
      .withBoard("p1", [character("zeff", "EB04-004", { playedTurn: 1 })])
      .build();

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
    game.play({ type: "attack", attackerInstanceId: "zeff" });
    settle(game);
    declineDefence(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
    game.pass();
    // "Until the end of your opponent's next End Phase": still up while they
    // attack into it, which is what the clause is for.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7000);
  });
});

describe("EB04-016 Bird Neptunian's attack", () => {
  covers("EB04-016", "[When Attacking]");

  it("rests an 8-cost body at three Neptunians", () => {
    const game = table("eb04-016-attacking")
      .withBoard("p1", [
        character("bird", "EB04-016", { playedTurn: 1 }),
        character("scaled", "EB04-011", { playedTurn: 1 }),
        character("third", "EB04-016", { playedTurn: 1 }),
      ])
      // EB04-023 Chaka & Pell is a cost-8 body: exactly on the line.
      .withBoard("p2", [character("chaka", "EB04-023")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "bird" });
    game.play({ type: "resolve-effect", optionId: "chaka" });
    settle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "chaka")
        ?.rested,
    ).toBe(true);
  });

  it("rests nothing at two Neptunians", () => {
    const game = table("eb04-016-attacking-short")
      .withBoard("p1", [
        character("bird", "EB04-016", { playedTurn: 1 }),
        character("scaled", "EB04-011", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("chaka", "EB04-023")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "bird" });
    settle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "chaka")
        ?.rested,
    ).toBeFalsy();
  });
});

describe("EB04-022 Issho's attack", () => {
  covers("EB04-022", "[When Attacking]");

  it("trashes a card for −2000 with a DON!! on it", () => {
    const game = table("eb04-022-attacking")
      .withBoard("p1", [character("issho", "EB04-022", { playedTurn: 1 })])
      .withGivenDon("p1", "issho", 1)
      .withHand("p1", [instance("fodder", "ST31-002")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "issho" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settle(game);

    expect(currentPower(game.state, "p2", "jinbe")).toBe(4000);
  });

  it("does nothing with no DON!! on it", () => {
    // `[DON!! x1]` reads the DON!! given to this Character, not the field
    // total, so a 5-cost 7000 has to be pushed to 8000 before its trick is
    // live.
    const game = table("eb04-022-attacking-no-don")
      .withBoard("p1", [character("issho", "EB04-022", { playedTurn: 1 })])
      .withHand("p1", [instance("fodder", "ST31-002")])
      .withBoard("p2", [character("jinbe", "ST31-002")])
      .build();

    game.play({ type: "attack", attackerInstanceId: "issho" });
    settle(game);

    expect(currentPower(game.state, "p2", "jinbe")).toBe(6000);
  });
});

describe("EB04-053 Sentomaru", () => {
  covers("EB04-053", "[On Block]", "[Blocker]");

  it("draws when it blocks at two Life", () => {
    const game = defending("eb04-053-block")
      .withLife("p1", 2)
      .withBoard("p1", [character("sentomaru", "EB04-053")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "sentomaru" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });

  it("draws nothing one Life card above the line", () => {
    const game = defending("eb04-053-block-high-life")
      .withLife("p1", 3)
      .withBoard("p1", [character("sentomaru", "EB04-053")])
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "sentomaru" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });
});

describe("EB04-034 Charlotte Pudding", () => {
  covers("EB04-034", "[On Your Opponent's Attack]", "[Blocker]");

  it("trashes a card for +2000 with four Events in the trash", () => {
    const game = defending("eb04-034-reaction")
      .withBoard("p1", [character("pudding", "EB04-034")])
      .withHand("p1", [instance("fodder", "ST31-002")])
      .withTrash("p1", copies(4, "EB04-008", "event"))
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });

  it("spends the card and gets nothing at three Events", () => {
    // The gate is inside the cost: "you may trash: if you have 4 or more"
    // pays first and checks second, so a miscount costs the card.
    const game = defending("eb04-034-reaction-short")
      .withBoard("p1", [character("pudding", "EB04-034")])
      .withHand("p1", [instance("fodder", "ST31-002")])
      .withTrash("p1", copies(3, "EB04-008", "event"))
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
  });
});

// --- [Trigger] and [On K.O.] ----------------------------------------------

/** p2 holds the card under test, so p1's attack turns its Life card over. */
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
  game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
};

/**
 * Attack into the Life card and assert the Trigger is not offered at all.
 *
 * A Trigger whose program would do nothing is withheld rather than presented
 * and resolved for nothing, so "the clause did not fire" and "the clause was
 * never on the table" are different claims and this is the second.
 */
const expectNoTriggerOffer = (game: Game) => {
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p2-leader",
  });
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
  expect(game.legalActions("p2").map((action) => action.summary)).not.toContain(
    "Activate Trigger",
  );
  game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
};

describe("EB04-020 Shark Brick Fist's Trigger", () => {
  covers("EB04-020", "[Trigger]");

  it("rests a 4-cost body off a Life flip", () => {
    const game = triggering("eb04-020-trigger")
      .withBoard("p1", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        // OP10-036 Perona is a printed 4-drop.
        character("perona", "OP10-036", { playedTurn: 1 }),
      ])
      .withLife("p2", [instance("life-event", "EB04-020")])
      .build();

    flipLifeTrigger(game);
    game.play({ type: "resolve-effect", optionId: "perona" });
    settle(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "perona")
        ?.rested,
    ).toBe(true);
  });

  it("cannot reach a 5-cost body", () => {
    const game = triggering("eb04-020-trigger-miss")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [instance("life-event", "EB04-020")])
      .build();

    flipLifeTrigger(game);
    settle(game);

    // ST31-002 Jinbe is a printed 5-drop: one over the ceiling, and the only
    // body on the board.
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(
      game.state.players.p1.board[0]?.cannotRestUntilTurn ?? -1,
    ).toBeLessThan(game.state.turn + 1);
  });
});

describe("EB04-027 Boa Hancock's Trigger", () => {
  covers("EB04-027", "[Trigger]");

  it("plays a small Trigger body out of hand off a Life flip", () => {
    const game = triggering("eb04-027-trigger")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [instance("life-hancock", "EB04-027")])
      // OP07-107 Franky is a 5000 with a [Trigger]; ST31-002 Jinbe is a 6000
      // with none, so neither its power nor its lack of a Trigger qualifies.
      .withHand("p2", [
        instance("franky", "OP07-107"),
        instance("jinbe", "ST31-002"),
      ])
      .build();

    flipLifeTrigger(game);
    game.play({ type: "resolve-effect", optionId: "franky" });
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual(["franky"]);
  });

  it("finds nothing in a hand of bodies without a Trigger", () => {
    const game = triggering("eb04-027-trigger-miss")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [instance("life-hancock", "EB04-027")])
      .withHand("p2", [instance("jinbe", "ST31-002")])
      .build();

    flipLifeTrigger(game);
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual([]);
  });
});

describe("EB04-041 Stealth Black's Trigger", () => {
  covers("EB04-041", "[Trigger]");

  it("draws two and trashes one, behind any Leader", () => {
    const game = triggering("eb04-041-trigger")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [instance("life-event", "EB04-041")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    flipLifeTrigger(game);
    settle(game);

    // Two drawn and one trashed. Activating a Trigger sends the flipped Life
    // card to the trash rather than to hand, which is the price of using it.
    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("life-event");
  });
});

describe("EB04-049 Finger Pistol Yellow Lotus's Trigger", () => {
  covers("EB04-049", "[Trigger]");

  it("runs the [Main] effect without paying the 4 cost", () => {
    // "Activate this card's [Main] effect": a Trigger activates the effect,
    // not the card, which is what makes a 4-cost Event the set's best Life
    // card.
    const game = triggering("eb04-049-trigger")
      .withBoard("p1", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        character("victim", "OP10-036", { playedTurn: 1 }),
      ])
      .withLife("p2", [instance("life-event", "EB04-049")])
      .build();

    const trashBefore = game.state.players.p2.trash.length;
    flipLifeTrigger(game);
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    // OP10-036 Perona is a printed 4-drop, inside the base-cost ceiling.
    expect(boardIds(game.state, "p1")).toEqual(["attacker"]);
    // The mill is the cost and is still paid off the Trigger, and the flipped
    // Life card joins it -- three cards for a K.O. and no DON!! at all.
    expect(game.state.players.p2.trash.length - trashBefore).toBe(3);
  });
});

describe("EB04-051 Emet's Trigger", () => {
  covers("EB04-051", "[Trigger]");

  it("debuffs the whole board and plays itself at zero Life", () => {
    const game = triggering("eb04-051-trigger")
      .withBoard("p1", [
        character("attacker", "ST31-002", { playedTurn: 1 }),
        character("other", "ST31-002", { playedTurn: 1 }),
      ])
      .withLife("p2", [instance("life-emet", "EB04-051")])
      .build();

    flipLifeTrigger(game);
    settle(game);

    // Both of the opponent's Characters, not a chosen one: mandatory text with
    // no choice in it.
    expect(currentPower(game.state, "p1", "attacker")).toBe(3000);
    expect(currentPower(game.state, "p1", "other")).toBe(3000);
    // The flip emptied the Life area, so the body arrives free.
    expect(boardIds(game.state, "p2")).toContain("life-emet");
  });

  it("debuffs but stays in hand with a Life card still behind it", () => {
    const game = triggering("eb04-051-trigger-high-life")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [
        instance("life-emet", "EB04-051"),
        instance("spare", "ST31-002"),
      ])
      .build();

    flipLifeTrigger(game);
    settle(game);

    expect(currentPower(game.state, "p1", "attacker")).toBe(3000);
    expect(boardIds(game.state, "p2")).toEqual([]);
  });
});

describe("EB04-055 Bartholomew Kuma's Trigger", () => {
  covers("EB04-055", "[Trigger]");

  it("plays itself behind a Revolutionary Army Leader at five combined Life", () => {
    const game = scenario()
      .decks(P1, "(Red/Black) Sabo - Starter Deck 35")
      .seed("eb04-055-trigger")
      .atTurn(11, { active: "p1" })
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p1", 3)
      .withLife("p2", [instance("life-kuma", "EB04-055")])
      .build();

    flipLifeTrigger(game);
    settle(game);

    // Three and one is four: inside the printed five-or-less total, which is
    // one number across the table rather than one player's.
    expect(boardIds(game.state, "p2")).toContain("life-kuma");
  });

  it("stays in hand while the two Life totals are still high", () => {
    const game = scenario()
      .decks(P1, "(Red/Black) Sabo - Starter Deck 35")
      .seed("eb04-055-trigger-high")
      .atTurn(11, { active: "p1" })
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p1", 5)
      .withLife("p2", [
        instance("life-kuma", "EB04-055"),
        instance("spare", "ST31-002"),
      ])
      .build();

    expectNoTriggerOffer(game);

    expect(boardIds(game.state, "p2")).toEqual([]);
  });

  it("stays in hand behind a Leader without the type", () => {
    const game = triggering("eb04-055-trigger-wrong-leader")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p1", 3)
      .withLife("p2", [instance("life-kuma", "EB04-055")])
      .build();

    expectNoTriggerOffer(game);

    expect(boardIds(game.state, "p2")).toEqual([]);
  });
});

describe("EB04-060 Gum-Gum Hawk Gatling's Trigger", () => {
  covers("EB04-060", "[Trigger]");

  it("draws two and trashes one", () => {
    const game = triggering("eb04-060-trigger")
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p2", [instance("life-event", "EB04-060")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    flipLifeTrigger(game);
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
  });
});

describe("EB04-015 Jinbe", () => {
  covers("EB04-015", "[On K.O.]", "[Blocker]");

  it("rests a card to play a green body of cost 6 or less", () => {
    const game = defending("eb04-015-on-ko")
      .withBoard("p1", [
        character("jinbe", "EB04-015", { rested: true, playedTurn: 1 }),
      ])
      // OP11-021 Jinbe is a {Fish-Man} Leader.
      .withLeader("p1", "OP11-021")
      // ST32-002 Kouzuki Oden is green at cost 5.
      .withHand("p1", [instance("oden", "ST32-002")])
      .withBoard("p2", [character("carrot", "EB04-013", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "carrot",
      targetInstanceId: "jinbe",
    });
    declineDefence(game);
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "oden" });
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["oden"]);
    // "1 of your cards" reaches the Leader, which is what makes the cost
    // payable on the turn this body was the board's last card.
    expect(game.state.players.p1.leaderRested).toBe(true);
  });

  it("plays nothing behind a Leader outside the two types", () => {
    const game = defending("eb04-015-on-ko-wrong-leader")
      .withBoard("p1", [
        character("jinbe", "EB04-015", { rested: true, playedTurn: 1 }),
      ])
      .withHand("p1", [instance("oden", "ST32-002")])
      .withBoard("p2", [character("carrot", "EB04-013", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "carrot",
      targetInstanceId: "jinbe",
    });
    declineDefence(game);
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual([]);
  });

  it("carries its printed [Blocker]", () => {
    const game = defending("eb04-015-blocker")
      .withBoard("p1", [character("jinbe", "EB04-015", { playedTurn: 1 })])
      .build();

    expect(hasKeyword(game.state, "p1", "jinbe", "Blocker")).toBe(true);
  });
});

describe("EB04-055 Bartholomew Kuma's On K.O.", () => {
  covers("EB04-055", "[On K.O.]");

  it("plays a Revolutionary Army body of cost 4 or less, free and ungated", () => {
    const game = defending("eb04-055-on-ko")
      .withBoard("p1", [
        character("kuma", "EB04-055", { rested: true, playedTurn: 1 }),
      ])
      // EB04-045 Ginny is {Revolutionary Army} at cost 1.
      .withHand("p1", [instance("ginny", "EB04-045")])
      .withBoard("p2", [character("carrot", "EB04-013", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "carrot",
      targetInstanceId: "kuma",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "ginny" });
    settle(game);

    // No Leader gate and no cost, unlike this card's `[Trigger]`.
    expect(boardIds(game.state, "p1")).toEqual(["ginny"]);
  });
});

// --- the signal-driven clauses and the removal replacements ----------------

describe("EB04-035 Hitokiri Kamazo", () => {
  covers("EB04-035", "[Your Turn]", "[Blocker]");

  it("replaces a returned DON!! behind a Kid Pirates Leader", () => {
    const game = table("eb04-035-reaction")
      // OP10-099 Eustass"Captain"Kid, a {Kid Pirates} Leader.
      .withLeader("p1", "OP10-099")
      .withBoard("p1", [
        character("kamazo", "EB04-035", { playedTurn: 1 }),
        character("foxy-a", "EB04-037", { playedTurn: 1 }),
        character("foxy-b", "EB04-037", { playedTurn: 1 }),
      ])
      // EB04-033's `DON!! −1` is what raises the signal this watches.
      .withHand("p1", [instance("groggy", "EB04-033")])
      .withDonDeck("p1", 1)
      .build();

    expect(game.state.players.p1.donDeck).toHaveLength(1);
    game.play({ type: "play-card", cardNumber: "EB04-033" });
    settle(game);

    // The DON!! −1 returned one and this clause added one back, rested.
    expect(game.state.players.p1.restedDon.length).toBeGreaterThanOrEqual(1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("replaces nothing behind a Leader without the type", () => {
    const game = table("eb04-035-reaction-wrong-leader")
      .withBoard("p1", [
        character("kamazo", "EB04-035", { playedTurn: 1 }),
        character("foxy-a", "EB04-037", { playedTurn: 1 }),
        character("foxy-b", "EB04-037", { playedTurn: 1 }),
      ])
      .withHand("p1", [instance("groggy", "EB04-033")])
      .withDonDeck("p1", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-033" });
    settle(game);

    // The returned DON!! went back and nothing came out to replace it.
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("carries its printed [Blocker]", () => {
    const game = defending("eb04-035-blocker")
      .withBoard("p1", [character("kamazo", "EB04-035", { playedTurn: 1 })])
      .build();

    expect(hasKeyword(game.state, "p1", "kamazo", "Blocker")).toBe(true);
  });
});

describe("EB04-044 Koby", () => {
  covers("EB04-044", "[Your Turn]", "static");

  it("draws when the opponent's Character is K.O.'d on its own turn", () => {
    const game = table("eb04-044-draw")
      .withBoard("p1", [
        character("koby", "EB04-044", { playedTurn: 1 }),
        character("attacker", "ST31-004", { playedTurn: 1 }),
      ])
      // ST31-004 Monkey.D.Luffy is a 9000 and OP01-016 Nami a 2000, so the
      // battle K.O.s the defender.
      .withBoard("p2", [character("nami", "OP01-016", { rested: true })])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "nami",
    });
    declineDefence(game);
    settle(game);

    expect(boardIds(game.state, "p2")).toEqual([]);
    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });

  it("draws nothing when its own Character is the one K.O.'d", () => {
    // `movedOwner: "opponent"` is the whole point: every earlier rule of this
    // shape watches its own controller's cards.
    const game = defending("eb04-044-own-body")
      .withBoard("p1", [
        character("koby", "EB04-044", { playedTurn: 1 }),
        character("nami", "OP01-016", { rested: true, playedTurn: 1 }),
      ])
      .withBoard("p2", [character("carrot", "EB04-013", { playedTurn: 1 })])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "carrot",
      targetInstanceId: "nami",
    });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("survives an opponent's removal behind a Navy Leader", () => {
    const game = defending("eb04-044-replacement")
      // OP10-001 Smoker, whose type includes "Navy".
      .withLeader("p1", "OP10-001")
      .withBoard("p1", [
        character("koby", "EB04-044", { rested: true, playedTurn: 1 }),
      ])
      .withHand("p1", [instance("fodder", "ST31-002")])
      // EB04-018 Megalo K.O.s a rested body at 8000 or less; Koby is a 7000.
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "koby" });
    takeReplacement(game, "koby");
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["koby"]);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
  });

  it("is not protected behind a Leader whose type has no Navy in it", () => {
    // The `requires` gate on the replacement, from the other side. Without it
    // this body would be protected behind every Leader in the format.
    const game = defending("eb04-044-no-navy")
      .withBoard("p1", [
        character("koby", "EB04-044", { rested: true, playedTurn: 1 }),
      ])
      .withHand("p1", [instance("fodder", "ST31-002")])
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "koby" });

    // Not even offered: the gate is checked where the replacement becomes
    // eligible, so there is no "instead" to decline.
    expect(effectOptions(game.state)).not.toContain("replace:koby");
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual([]);
  });
});

describe("EB04-043 Kaku's replacement", () => {
  covers("EB04-043", "static");

  it("buries three from the trash to save a small black body", () => {
    const game = defending("eb04-043-replacement")
      .withBoard("p1", [
        character("kaku", "EB04-043", { playedTurn: 1 }),
        // EB04-045 Ginny is black at base cost 1, inside the printed filter.
        character("ginny", "EB04-045", { rested: true, playedTurn: 1 }),
      ])
      .withTrash("p1", copies(3, "ST31-002", "junk"))
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "ginny" });
    takeReplacement(game, "kaku");
    settle(game);

    expect(boardIds(game.state, "p1").sort()).toEqual(["ginny", "kaku"]);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("protects the body printing it as well as its teammates", () => {
    // `protects` filters the threatened card, and Kaku (black, base cost 3)
    // matches its own filter -- which `excludesSelf` would wrongly deny.
    const game = defending("eb04-043-self")
      .withBoard("p1", [
        character("kaku", "EB04-043", { rested: true, playedTurn: 1 }),
      ])
      .withTrash("p1", copies(3, "ST31-002", "junk"))
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "kaku" });
    takeReplacement(game, "kaku");
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual(["kaku"]);
  });

  it("cannot pay with fewer than three cards in the trash", () => {
    const game = defending("eb04-043-broke")
      .withBoard("p1", [
        character("kaku", "EB04-043", { rested: true, playedTurn: 1 }),
      ])
      .withTrash("p1", copies(2, "ST31-002", "junk"))
      .withHand("p2", [instance("megalo", "EB04-018")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-018" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "kaku" });

    // An offer whose cost cannot be paid is worse than no offer: taking it
    // would cancel the K.O. for free.
    expect(effectOptions(game.state)).not.toContain("replace:kaku");
    settle(game);

    expect(boardIds(game.state, "p1")).toEqual([]);
  });
});

describe("EB04-011 Scaled Neptunian's keyword", () => {
  covers("EB04-011", "[Rush: Character]");

  it("attacks a Character the turn it lands but not the Leader", () => {
    const game = table("eb04-011-rush")
      .withHand("p1", [instance("scaled", "EB04-011")])
      .withBoard("p2", [character("jinbe", "ST31-002", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "EB04-011" });
    settle(game);

    const targets = game
      .legalActions("p1")
      .filter(
        (action) =>
          action.type === "attack" &&
          (action as { attackerInstanceId?: string }).attackerInstanceId ===
            "scaled",
      )
      .map(
        (action) => (action as { targetInstanceId?: string }).targetInstanceId,
      );

    expect(targets).toEqual(["jinbe"]);
  });
});
