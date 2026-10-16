import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  observe,
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
 * EXTRA BOOSTER -MEMORIAL COLLECTION- [EB-03], as a whole-set import.
 *
 * `packages/cards/src/eb03.ts` explains where the records come from; this file
 * is what holds the behaviour. Six of the set's 62 identities were already in
 * the pool as cards four community decks and the sealed pool happen to play,
 * and those are driven by the files that shipped them -- EB03-032 and EB03-035
 * through the imperative register, EB03-053 and EB03-055 by `test/life.test.ts`
 * and the ST34 files, and EB03-062 by `test/op12-rosinante-clauses.test.ts`.
 * What is here is the other 56 -- plus EB03-060, which was in the pool with an
 * imperative branch behind it and no test anywhere, and is covered below
 * because this file is now what claims the set.
 *
 * ## The rules the import added
 *
 * Five, and each because a printed clause could not otherwise be expressed:
 * `noBaseEffect` and `lacksClause` on `CardSelector` (EB03-003/007/009/039 and
 * the EB03-001 Leader), `maxPower` inside an `anyOf` branch (EB03-010),
 * `match` on `rest-opponent-cards` (EB03-012, EB03-061), `alternate` on
 * `order-to-bottom` (EB03-023), and an Event activated out of the *trash*
 * (EB03-031). A Leader carrying a replacement effect (EB03-001) is a sixth,
 * in `eligibleReplacements`. Every one is driven from the card here rather
 * than from the primitive: a rule that fires in a unit test and never in a
 * game is not support.
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

/** The hand instances a player may play right now. */
const playableInstances = (game: Game, player: "p1" | "p2") =>
  game
    .legalActions(player)
    .filter((action) => action.type === "play-card")
    .map((action) => action.cardInstanceId);

/** The instance ids on a player's board, in board order. */
const boardNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.cardNumber);

describe("EB03-001 Nefeltari Vivi (Leader)", () => {
  covers("EB03-001", "[Activate: Main]");

  it("rests the Leader to shrink a Character and hand out [Rush]", () => {
    const game = table("eb03-001-activate")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("vanilla", "EB03-002")])
      .withBoard("p2", [character("target", "EB03-030")])
      .build();

    const before = currentPower(game.state, "p2", "target");
    game.play({ type: "activate-main", cardNumber: "EB03-001" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(currentPower(game.state, "p2", "target")).toBe(before - 2_000);
    expect(hasKeyword(game.state, "p1", "vanilla", "Rush")).toBe(true);
  });

  it("is not offered while the Leader is already rested", () => {
    const game = table("eb03-001-rested")
      .withLeader("p1", "EB03-001")
      .withRestedLeader("p1")
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-001",
        ),
    ).toBe(false);
  });

  it("passes over a Character that prints a [When Attacking] clause", () => {
    const game = table("eb03-001-rush-filter")
      .withLeader("p1", "EB03-001")
      // EB03-008 Hibari prints one; EB03-002 Ain prints nothing at all.
      .withBoard("p1", [character("hibari", "EB03-008")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-001" });
    applyOptional(game);
    settle(game);

    expect(hasKeyword(game.state, "p1", "hibari", "Rush")).toBe(false);
  });
});

describe("EB03-001 Nefeltari Vivi (Leader), the K.O. replacement", () => {
  covers("EB03-001", "static");

  /**
   * p2 removes a 4-cost body with EB03-043 Stussy's `[On Play]`, which is the
   * narrowest removal in the pool that reaches exactly the cost the Leader
   * guards -- so the same board tests the floor of `minBaseCost` and the
   * replacement in one go.
   */
  const removal = (seed: string, defenderBody: string) =>
    defending(seed)
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("body", defenderBody)])
      .withHand("p1", copies(2, "EB03-002", "spare"))
      .withHand("p2", [instance("stussy", "EB03-043")])
      .withTrash("p2", [
        instance("cp-a", "EB03-040"),
        instance("cp-b", "OP13-110"),
      ])
      .build();

  /**
   * Resolve the removal, taking the "instead" the moment it is offered.
   *
   * The prompt is a pair -- `ko:<threatened>` and `replace:<protector>` -- so a
   * test that settles generically takes the K.O. and proves nothing about the
   * clause. This walks the steps and answers that one prompt by its own id,
   * which for this Leader is keyed to the Leader pseudo-instance rather than
   * to a board card.
   */
  const takeReplacement = (game: Game) => {
    let guard = 0;
    let taken = false;
    while (game.state.pendingEffect && guard++ < 12) {
      const offered = effectOptions(game.state);
      const instead = offered.find((option) => option.startsWith("replace:"));
      if (instead) taken = true;
      game.play({
        type: "resolve-effect",
        optionId: instead ?? offered[0]!,
      });
    }
    return taken;
  };

  it("trashes a card from hand instead of losing a 4-cost Character", () => {
    const game = removal("eb03-001-replacement", "EB03-035");

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-043" });
    applyOptional(game);
    const offered = takeReplacement(game);

    // The Character stayed and a card in hand paid for it.
    expect(offered).toBe(true);
    expect(boardNumbers(game, "p1")).toEqual(["EB03-035"]);
    expect(game.state.players.p1.hand.length).toBeLessThan(handBefore);
  });

  it("names the payment's destination as the payer's own trash", () => {
    // The choice is Vivi's, inside the opponent's removal program, whose move
    // reads `opponent` for Vivi's trash. `destination.player` is relative to
    // the deciding player, so it must say `self` -- a policy ranking its own
    // hand-trash costs reads exactly that.
    const game = removal("eb03-001-destination", "EB03-035");
    game.play({ type: "play-card", cardNumber: "EB03-043" });
    applyOptional(game);
    for (let guard = 0; guard < 12 && game.state.pendingEffect; guard++) {
      const offered = effectOptions(game.state);
      if (offered.some((id) => id.startsWith("spare"))) break;
      game.play({
        type: "resolve-effect",
        optionId:
          offered.find((id) => id.startsWith("replace:")) ?? offered[0]!,
      });
    }

    const payments = getLegalActions(game.state, "p1").filter(
      (action) =>
        action.type === "resolve-effect" && action.optionId.startsWith("spare"),
    );
    expect(payments.length).toBeGreaterThan(0);
    for (const payment of payments) {
      expect(payment).toMatchObject({
        destination: { zone: "trash", player: "self" },
      });
    }
  });

  it("does not answer a 3-cost Character", () => {
    const game = removal("eb03-001-below-floor", "EB03-044");

    game.play({ type: "play-card", cardNumber: "EB03-043" });
    applyOptional(game);
    const offered = takeReplacement(game);

    // Base cost 3 is under the printed floor, so no "instead" was ever
    // offered and the body is gone.
    expect(offered).toBe(false);
    expect(boardNumbers(game, "p1")).toEqual([]);
  });

  it("answers one K.O. a turn and no more", () => {
    const game = defending("eb03-001-once")
      .withLeader("p1", "EB03-001")
      // Rested, so EB03-013 Carrot's activation can reach the second one -- and
      // both are base cost 4, the floor this Leader guards.
      .withBoard("p1", [
        character("first", "EB03-035", { rested: true }),
        character("second", "EB03-035", { rested: true }),
      ])
      .withHand("p1", copies(3, "EB03-002", "spare"))
      .withHand("p2", [instance("stussy", "EB03-043")])
      // Carrot is already down and counts as played this turn, so the second
      // removal costs no DON!! -- two 7-cost bodies would not fit in one turn.
      .withBoard("p2", [character("carrot", "EB03-013", { playedTurn: 12 })])
      .withTrash("p2", [
        instance("cp-a", "EB03-040"),
        instance("cp-b", "OP13-110"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-043" });
    applyOptional(game);
    expect(takeReplacement(game)).toBe(true);
    expect(game.state.players.p1.board).toHaveLength(2);

    game.play({ type: "activate-main", cardNumber: "EB03-013" });

    // The turn's one use is spent, so the second removal is not answered.
    expect(takeReplacement(game)).toBe(false);
    expect(game.state.players.p1.board).toHaveLength(1);
  });
});

describe("EB03-003 Uta", () => {
  covers("EB03-003", "[On Play]");

  it("draws two and puts a vanilla body down behind its own Leader", () => {
    const game = table("eb03-003-on-play")
      .withLeader("p1", "FIX-LEADER-UTA")
      .withHand("p1", [
        instance("uta", "EB03-003"),
        // EB03-002 Ain is a 6000 body with an empty effect box; EB03-004
        // Carina is 2000 and prints text, so only the first is a legal target.
        instance("vanilla", "EB03-002"),
        instance("texted", "EB03-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-003" });
    settle(game);

    expect(game.state.players.p1.hand.length).toBeGreaterThanOrEqual(2);
    expect(boardNumbers(game, "p1")).toContain("EB03-002");
    expect(boardNumbers(game, "p1")).not.toContain("EB03-004");
  });

  it("does nothing at all behind another Leader", () => {
    const game = table("eb03-003-wrong-leader")
      .withHand("p1", [
        instance("uta", "EB03-003"),
        instance("vanilla", "EB03-002"),
      ])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-003" });
    settle(game);

    // The Uta body itself left the hand; nothing was drawn and nothing played.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(boardNumbers(game, "p1")).toEqual(["EB03-003"]);
  });
});

describe("EB03-004 Carina", () => {
  covers("EB03-004", "[Opponent's Turn]", "[Blocker]");

  it("defends at 6000 behind a multicoloured Leader with no big body out", () => {
    const game = defending("eb03-004-static")
      // EB03-001 is Red/Blue: the only multicoloured Leader in the set.
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("carina", "EB03-004")])
      .build();

    expect(currentPower(game.state, "p1", "carina")).toBe(6000);
    expect(hasKeyword(game.state, "p1", "carina", "Blocker")).toBe(true);
  });

  it("loses the buff the moment a 6000 body lands beside it", () => {
    const game = defending("eb03-004-big-body")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [
        character("carina", "EB03-004"),
        character("big", "EB03-002"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "carina")).toBe(2000);
  });

  it("stays at printed power behind a mono-coloured Leader", () => {
    const game = defending("eb03-004-mono")
      .withBoard("p1", [character("carina", "EB03-004")])
      .build();

    expect(currentPower(game.state, "p1", "carina")).toBe(2000);
  });

  it("is not buffed on its controller's own turn", () => {
    const game = table("eb03-004-own-turn")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("carina", "EB03-004")])
      .build();

    expect(currentPower(game.state, "p1", "carina")).toBe(2000);
  });
});

describe("EB03-005 Sugar", () => {
  covers("EB03-005", "[On Play]");

  it("plays a Donquixote Pirates body rested behind the [Sugar] Leader", () => {
    const game = table("eb03-005-on-play")
      .withLeader("p1", "OP10-003")
      .withHand("p1", [
        instance("sugar", "EB03-005"),
        instance("monet", "EB03-010"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-005" });
    settle(game);

    const fetched = game.state.players.p1.board.find(
      (card) => card.cardNumber === "EB03-010",
    );
    expect(fetched?.rested).toBe(true);
  });

  it("fetches nothing behind another Leader", () => {
    const game = table("eb03-005-wrong-leader")
      .withHand("p1", [
        instance("sugar", "EB03-005"),
        instance("monet", "EB03-010"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-005" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual(["EB03-005"]);
  });
});

describe("EB03-006 Nami", () => {
  covers("EB03-006", "[On Play]", "[Activate: Main]");

  it("spends 5000 of the Leader's power for a card", () => {
    const game = table("eb03-006-on-play")
      .withLeader("p1", "EB03-001")
      .withHand("p1", [instance("nami", "EB03-006")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-006" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(0);
    // One card left the hand and one was drawn.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("leaves the Leader alone when the draw is declined", () => {
    const game = table("eb03-006-declined")
      .withLeader("p1", "EB03-001")
      .withHand("p1", [instance("nami", "EB03-006")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-006" });
    if (effectOptions(game.state).includes("skip")) {
      game.play({ type: "resolve-effect", optionId: "skip" });
    }
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("cannot pay with a rested Leader, so nothing is drawn", () => {
    const game = table("eb03-006-rested-leader")
      .withLeader("p1", "EB03-001")
      .withRestedLeader("p1")
      .withHand("p1", [instance("nami", "EB03-006")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-006" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(5000);
  });

  it("shrinks a Character once a turn behind an {Alabasta} Leader", () => {
    const game = table("eb03-006-activate")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("nami", "EB03-006")])
      .withBoard("p2", [character("target", "EB03-030")])
      .build();

    const before = currentPower(game.state, "p2", "target");
    game.play({ type: "activate-main", cardNumber: "EB03-006" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(before - 1_000);
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-006",
        ),
    ).toBe(false);
  });
});

describe("EB03-007 Baccarat", () => {
  covers("EB03-007", "[On K.O.]", "[Blocker]");

  it("replaces itself with a vanilla body when it loses a fight", () => {
    const game = defending("eb03-007-on-ko")
      // Rested: only a rested Character is a legal attack target.
      .withBoard("p1", [character("baccarat", "EB03-007", { rested: true })])
      .withHand("p1", [
        instance("vanilla", "EB03-002"),
        instance("texted", "EB03-004"),
      ])
      .withBoard("p2", [character("attacker", "EB03-026")])
      .build();

    expect(hasKeyword(game.state, "p1", "baccarat", "Blocker")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "baccarat",
    });
    declineDefence(game);
    settle(game);

    // The 5000 body lost to an 8000 attacker and its clause put the 6000
    // vanilla down in its place; the Character with printed text is not a
    // legal target for it.
    expect(boardNumbers(game, "p1")).toEqual(["EB03-002"]);
  });
});

describe("EB03-008 Hibari", () => {
  covers("EB03-008", "[On Play]", "[When Attacking]", "[Activate: Main]");

  it("lets a {SWORD} Leader reach an active Character for the turn", () => {
    const game = table("eb03-008-on-play")
      // OP11-001 is the pool's {SWORD} Leader.
      .withLeader("p1", "OP11-001")
      .withHand("p1", [instance("hibari", "EB03-008")])
      .withBoard("p2", [character("active", "EB03-030")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-008" });
    settle(game);

    expect(game.state.players.p1.leaderAttacksActiveUntilTurn).toBe(
      game.state.turn,
    );
  });

  it("announces the grant and shows it on the Leader to both seats", () => {
    // The grant writes a turn flag and nothing else, so from the other seat a
    // Leader simply attacked an active Character: the event is the log line
    // and the toast, and the observation field is the badge and the popup row.
    const game = table("eb03-008-visible")
      .withLeader("p1", "OP11-001")
      .withHand("p1", [instance("hibari", "EB03-008")])
      .withBoard("p2", [character("active", "EB03-030")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-008" });
    settle(game);

    expect(game.events).toContainEqual({
      type: "attack-active-granted",
      playerId: "p1",
      targetInstanceId: "p1-leader",
      targetCardNumber: "OP11-001",
      expiresAtTurn: game.state.turn,
      sourceCardNumber: "EB03-008",
    });
    expect(observe(game.state, "p1").self.leader.attacksActiveUntilTurn).toBe(
      game.state.turn,
    );
    expect(
      observe(game.state, "p2").opponent.leader.attacksActiveUntilTurn,
    ).toBe(game.state.turn);
  });

  it("offers nothing to a Leader without the type", () => {
    const game = table("eb03-008-wrong-leader")
      .withHand("p1", [instance("hibari", "EB03-008")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-008" });
    settle(game);

    expect(game.state.players.p1.leaderAttacksActiveUntilTurn).toBeUndefined();
  });

  it("shrinks a Character once a turn", () => {
    const game = table("eb03-008-activate")
      .withBoard("p1", [character("hibari", "EB03-008")])
      .withBoard("p2", [character("target", "EB03-030")])
      .build();

    const before = currentPower(game.state, "p2", "target");
    game.play({ type: "activate-main", cardNumber: "EB03-008" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(before - 1_000);
  });
});

describe("EB03-009 Makino", () => {
  covers("EB03-009", "[Activate: Main]");

  it("rests itself to make a vanilla Character bigger", () => {
    const game = table("eb03-009-activate")
      .withBoard("p1", [
        character("makino", "EB03-009"),
        character("vanilla", "EB03-002"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-009" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "vanilla")).toBe(8000);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "makino")
        ?.rested,
    ).toBe(true);
  });

  it("passes over a Character that prints an effect", () => {
    const game = table("eb03-009-texted")
      .withBoard("p1", [
        character("makino", "EB03-009"),
        character("texted", "EB03-010"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-009" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "texted")).toBe(6000);
  });
});

describe("EB03-010 Monet", () => {
  covers("EB03-010", "[On Play]", "[Blocker]");

  it("reveals a small Character out of the top five", () => {
    const game = table("eb03-010-character")
      .withHand("p1", [instance("monet", "EB03-010")])
      // EB03-012 Otama is a 0-power Character, well under the ceiling.
      .withDeckTop("p1", [
        instance("small", "EB03-012"),
        ...copies(4, "EB03-002", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-010" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "small",
    );
  });

  it("reveals an Event, which prints no power at all", () => {
    const game = table("eb03-010-event")
      .withHand("p1", [instance("monet", "EB03-010")])
      .withDeckTop("p1", [
        instance("event", "EB03-011"),
        ...copies(4, "EB03-002", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-010" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "event",
    );
  });

  it("cannot take a 6000 Character, and buries the five instead", () => {
    const game = table("eb03-010-too-big")
      .withHand("p1", [instance("monet", "EB03-010")])
      .withDeckTop("p1", copies(5, "EB03-002", "big"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-010" });
    settle(game);

    expect(
      game.state.players.p1.hand.map((card) => card.cardNumber),
    ).not.toContain("EB03-002");
  });
});

describe('EB03-011 "But If We Ever See Each Other Again..."', () => {
  covers("EB03-011", "[Counter]", "[Trigger]");

  const ATTACK = {
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    attackerInstanceId: "attacker",
    targetInstanceId: "wall",
    attackPower: 6000,
    counterPower: 0,
  } as const;

  it("adds +4000 behind its own Leader", () => {
    const game = defending("eb03-011-counter")
      .withLeader("p1", "EB03-001")
      .withHand("p1", [instance("event", "EB03-011")])
      .withBoard("p1", [character("wall", "EB03-002")])
      .withBoard("p2", [character("attacker", "EB03-026")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("is not offered behind any other Leader", () => {
    const game = defending("eb03-011-wrong-leader")
      .withHand("p1", [instance("event", "EB03-011")])
      .withBoard("p1", [character("wall", "EB03-002")])
      .withBoard("p2", [character("attacker", "EB03-026")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    expect(
      getLegalActions(game.state, "p1").find(
        (action) => action.type === "activate-counter-event",
      ),
    ).toBeUndefined();
  });

  it("shrinks an attacking Character off a Life card", () => {
    const game = table("eb03-011-trigger")
      .withBoard("p1", [character("attacker", "EB03-002")])
      .withLife("p2", [
        instance("life-event", "EB03-011"),
        instance("spare", "EB03-030"),
      ])
      .build();

    const before = currentPower(game.state, "p1", "attacker");
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    expect(currentPower(game.state, "p1", "attacker")).toBe(before - 2_000);
  });
});

describe("EB03-012 Otama", () => {
  covers("EB03-012", "[Activate: Main]");

  it("rests an {Animal} Character the cost ceiling admits", () => {
    const game = table("eb03-012-character")
      .withBoard("p1", [character("otama", "EB03-012")])
      // OP10-043 Moocy is a 2-cost {Animal} Character; EB03-030 Viola is
      // neither {Animal} nor {SMILE}.
      .withBoard("p2", [
        character("animal", "OP10-043"),
        character("other", "EB03-030"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-012" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "animal" });
    settle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "animal")
        ?.rested,
    ).toBe(true);
  });

  it("does not offer a Character outside the printed types", () => {
    const game = table("eb03-012-filtered")
      .withBoard("p1", [character("otama", "EB03-012")])
      .withBoard("p2", [character("other", "EB03-030")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-012" });
    applyOptional(game);

    expect(effectOptions(game.state)).not.toContain("other");
  });

  it("rests a DON!! instead, which the printed clause offers unconditionally", () => {
    const game = table("eb03-012-don")
      .withBoard("p1", [character("otama", "EB03-012")])
      .withDon("p2", { active: 3 })
      .build();

    const restedBefore = game.state.players.p2.restedDon.length;
    game.play({ type: "activate-main", cardNumber: "EB03-012" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "don" });
    settle(game);

    expect(game.state.players.p2.restedDon.length).toBe(restedBefore + 1);
  });
});

describe("EB03-013 Carrot", () => {
  covers("EB03-013", "[Activate: Main]");

  it("K.O.s a rested body and plays [Zou] on the turn it arrives", () => {
    const game = table("eb03-013-activate")
      .withBoard("p1", [character("carrot", "EB03-013", { playedTurn: 11 })])
      .withHand("p1", [instance("zou", "FIX-STAGE-ZOU")])
      .withBoard("p2", [character("rested", "EB03-030", { rested: true })])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-013" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
    expect(game.state.players.p1.stage?.cardNumber).toBe("FIX-STAGE-ZOU");
  });

  it("is not even offered on a later turn", () => {
    const game = table("eb03-013-later")
      .withBoard("p1", [character("carrot", "EB03-013", { playedTurn: 9 })])
      .withBoard("p2", [character("rested", "EB03-030", { rested: true })])
      .build();

    // The engine withholds an activation whose whole clause sits behind a
    // failed gate, rather than offering one that resolves to nothing.
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-013",
        ),
    ).toBe(false);
    expect(boardNumbers(game, "p2")).toEqual(["EB03-030"]);
  });

  it("leaves an active Character alone", () => {
    const game = table("eb03-013-active-target")
      .withBoard("p1", [character("carrot", "EB03-013", { playedTurn: 11 })])
      .withBoard("p2", [character("active", "EB03-030")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-013" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB03-030"]);
  });
});

describe("EB03-014 Kuina", () => {
  covers("EB03-014", "[Activate: Main]");

  it("hands two rested DON!! to a <Slash> Leader", () => {
    const game = table("eb03-014-activate")
      // ST32's Roronoa Zoro Leader is <Slash>.
      .withBoard("p1", [character("kuina", "EB03-014")])
      .withDon("p1", { rested: 2 })
      .withLeader("p1", "OP12-020")
      .build();

    const attachedBefore = game.state.players.p1.leaderAttachedDon.length;
    game.play({ type: "activate-main", cardNumber: "EB03-014" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon.length).toBe(
      attachedBefore + 2,
    );
  });

  it("is not offered to a Leader with another attribute", () => {
    const game = table("eb03-014-wrong-attribute")
      .withBoard("p1", [character("kuina", "EB03-014")])
      .withDon("p1", { rested: 2 })
      .build();

    // ST31's Luffy Leader is <Strike>, so the whole clause sits behind a
    // failed gate and the engine withholds the activation rather than letting
    // a body rest itself for nothing.
    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-014",
        ),
    ).toBe(false);
  });

  it("is not offered with no rested DON!! to give", () => {
    const game = table("eb03-014-no-don")
      .withBoard("p1", [character("kuina", "EB03-014")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-014",
        ),
    ).toBe(false);
  });
});

describe("EB03-015 Camie", () => {
  covers("EB03-015", "[Activate: Main]");

  it("gives a DON!! to a {Merfolk} card and rests a cheap Character", () => {
    const game = table("eb03-015-activate")
      .withBoard("p1", [
        character("camie", "EB03-015"),
        character("merfolk", "EB03-052"),
      ])
      .withDon("p1", { rested: 1 })
      .withBoard("p2", [character("cheap", "EB03-047")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-015" });
    applyOptional(game);
    // Camie is a {Merfolk} herself and is offered first, so the teammate has
    // to be named: which card the DON!! lands on is the real decision.
    game.play({ type: "resolve-effect", optionId: "merfolk" });
    settle(game);

    const given = game.state.players.p1.board.find(
      (card) => card.instanceId === "merfolk",
    );
    expect(given?.attachedDon?.length).toBe(1);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "cheap")
        ?.rested,
    ).toBe(true);
  });
});

describe("EB03-016 Kouzuki Hiyori", () => {
  covers("EB03-016", "[On Play]", "[Activate: Main]");

  it("draws behind the [Kouzuki Oden] Leader", () => {
    const game = table("eb03-016-on-play")
      .withLeader("p1", "FIX-LEADER-ODEN")
      .withHand("p1", [instance("hiyori", "EB03-016")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-016" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("draws nothing behind another {Land of Wano} Leader", () => {
    const game = table("eb03-016-other-wano")
      .withLeader("p1", "OP16-079")
      .withHand("p1", [instance("hiyori", "EB03-016")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-016" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });

  it("trashes itself to ramp a {Land of Wano} Leader", () => {
    const game = table("eb03-016-activate")
      .withLeader("p1", "OP16-079")
      .withBoard("p1", [character("hiyori", "EB03-016")])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-016" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(boardNumbers(game, "p1")).toEqual([]);
  });
});

describe("EB03-017 Jewelry Bonney", () => {
  covers("EB03-017", "[On Play]");

  it("sets a DON!! active and freezes a body behind a {Supernovas} Leader", () => {
    const game = table("eb03-017-on-play")
      .withLeader("p1", "OP12-020")
      .withHand("p1", [instance("bonney", "EB03-017")])
      .withDon("p1", { rested: 2 })
      .withBoard("p2", [character("frozen", "EB03-030")])
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "EB03-017" });
    settle(game);

    expect(game.state.players.p1.activeDon.length).toBeGreaterThan(
      activeBefore - 5,
    );
    const frozen = game.state.players.p2.board.find(
      (card) => card.instanceId === "frozen",
    );
    expect(frozen?.cannotRestUntilTurn).toBe(game.state.turn + 1);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("eb03-017-wrong-leader")
      .withHand("p1", [instance("bonney", "EB03-017")])
      .withBoard("p2", [character("frozen", "EB03-030")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-017" });
    settle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "frozen")
        ?.cannotRestUntilTurn,
    ).toBeUndefined();
  });
});

describe("EB03-018 Tashigi", () => {
  covers("EB03-018", "[Opponent's Turn]", "[End of Your Turn]");

  it("blocks and shrugs off removal on the opponent's turn", () => {
    const game = defending("eb03-018-static")
      .withBoard("p1", [character("tashigi", "EB03-018")])
      .build();

    expect(hasKeyword(game.state, "p1", "tashigi", "Blocker")).toBe(true);
  });

  it("has neither on its controller's own turn", () => {
    const game = table("eb03-018-own-turn")
      .withBoard("p1", [character("tashigi", "EB03-018")])
      .build();

    expect(hasKeyword(game.state, "p1", "tashigi", "Blocker")).toBe(false);
  });

  it("pays a DON!! and a card to stand back up at the end of the turn", () => {
    const game = table("eb03-018-refresh")
      .withBoard("p1", [character("tashigi", "EB03-018", { rested: true })])
      .withHand("p1", [instance("spare", "EB03-002")])
      .build();

    game.pass();
    applyOptional(game);
    settle(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "tashigi")
        ?.rested,
    ).toBe(false);
  });

  it("cannot pay with an empty hand, so it stays rested", () => {
    const game = table("eb03-018-no-hand")
      .withBoard("p1", [character("tashigi", "EB03-018", { rested: true })])
      .withHand("p1", [])
      .build();

    game.pass();
    settle(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "tashigi")
        ?.rested,
    ).toBe(true);
  });
});

describe('EB03-020 "There You Are, Sore Loser!"', () => {
  covers("EB03-020", "[Counter]", "[Trigger]");

  const ATTACK = {
    attackerPlayerId: "p2",
    defenderPlayerId: "p1",
    attackerInstanceId: "attacker",
    targetInstanceId: "wall",
    // Above the 7000 wall: the Counter step is not offered to a defender who
    // has already won the battle.
    attackPower: 9000,
    counterPower: 0,
  } as const;

  it("adds +2000 with one {FILM} Character out", () => {
    const game = defending("eb03-020-floor")
      .withHand("p1", [instance("event", "EB03-020")])
      .withBoard("p1", [character("wall", "EB03-003")])
      .withBoard("p2", [character("attacker", "EB03-026")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2000);
  });

  it("adds +4000 with two of them", () => {
    const game = defending("eb03-020-doubled")
      .withHand("p1", [instance("event", "EB03-020")])
      .withBoard("p1", [
        character("wall", "EB03-003"),
        character("second", "EB03-002"),
      ])
      .withBoard("p2", [character("attacker", "EB03-026")])
      .withActiveAttack(ATTACK, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("sets a rested Character active off a Life card", () => {
    const game = table("eb03-020-trigger")
      .withBoard("p1", [character("attacker", "EB03-002")])
      .withBoard("p2", [character("tired", "EB03-030", { rested: true })])
      .withLife("p2", [
        instance("life-event", "EB03-020"),
        instance("spare", "EB03-030"),
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

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "tired")
        ?.rested,
    ).toBe(false);
  });
});

describe("EB03-019 Wanda", () => {
  covers("EB03-019", "[Blocker]");

  it("blocks, which is the whole of its printed text", () => {
    const game = defending("eb03-019-blocker")
      .withBoard("p1", [character("wanda", "EB03-019")])
      .build();

    expect(hasKeyword(game.state, "p1", "wanda", "Blocker")).toBe(true);
  });
});

describe("EB03-021 Alvida", () => {
  covers("EB03-021", "[On Play]");

  it("buries a small body and a cheap one for a card out of hand", () => {
    const game = table("eb03-021-on-play")
      .withHand("p1", [
        instance("alvida", "EB03-021"),
        instance("pitch", "EB03-002"),
      ])
      .withBoard("p2", [
        // 4000 printed power, and 2 cost -- so it answers both halves; the
        // second target is a different card, because a binding is spent once.
        character("small", "EB03-047"),
        character("cheap", "EB03-032"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-021" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
    expect(game.state.players.p2.deck.map((card) => card.instanceId)).toContain(
      "small",
    );
  });

  it("leaves a 6000 body alone", () => {
    const game = table("eb03-021-too-big")
      .withHand("p1", [
        instance("alvida", "EB03-021"),
        instance("pitch", "EB03-002"),
      ])
      .withBoard("p2", [character("big", "EB03-040")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-021" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB03-040"]);
  });
});

describe("EB03-022 Isuka", () => {
  covers("EB03-022", "[On Play]", "[Blocker]");

  it("buries a 4-cost Character on either side of the table", () => {
    const game = table("eb03-022-on-play")
      .withHand("p1", [instance("isuka", "EB03-022")])
      .withBoard("p2", [character("target", "EB03-035")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-022" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
    expect(
      hasKeyword(
        game.state,
        "p1",
        game.state.players.p1.board[0]!.instanceId,
        "Blocker",
      ),
    ).toBe(true);
  });

  it("cannot reach a 5-cost body", () => {
    const game = table("eb03-022-too-expensive")
      .withHand("p1", [instance("isuka", "EB03-022")])
      .withBoard("p2", [character("target", "EB03-040")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-022" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB03-040"]);
  });
});

describe("EB03-023 Kaya", () => {
  covers("EB03-023", "[On Play]");

  it("keeps all five looked-at cards on top of the deck", () => {
    const game = table("eb03-023-top")
      .withHand("p1", [instance("kaya", "EB03-023")])
      .withDeckTop("p1", [
        instance("a", "EB03-002"),
        instance("b", "EB03-030"),
        instance("c", "EB03-040"),
        instance("d", "EB03-047"),
        instance("e", "EB03-046"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-023" });
    const options = effectOptions(game.state);
    // Two ends of the split, and nothing else: the order in between is a
    // permutation a caller composes.
    expect(options).toHaveLength(2);
    game.play({ type: "resolve-effect", optionId: options[1]! });
    settle(game);

    // All five are back on top; which order they are in is the player's, and
    // the offered option is one permutation of it.
    expect(
      game.state.players.p1.deck
        .slice(0, 5)
        .map((card) => card.instanceId)
        .sort(),
    ).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("sends all five to the bottom instead", () => {
    const game = table("eb03-023-bottom")
      .withHand("p1", [instance("kaya", "EB03-023")])
      .withDeckTop("p1", [
        instance("a", "EB03-002"),
        instance("b", "EB03-030"),
        instance("c", "EB03-040"),
        instance("d", "EB03-047"),
        instance("e", "EB03-046"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-023" });
    const options = effectOptions(game.state);
    game.play({ type: "resolve-effect", optionId: options[0]! });
    settle(game);

    expect(
      game.state.players.p1.deck.slice(0, 5).map((card) => card.instanceId),
    ).not.toContain("a");
    expect(
      game.state.players.p1.deck.slice(-5).map((card) => card.instanceId),
    ).toContain("a");
  });
});

describe("EB03-024 Nefeltari Vivi", () => {
  covers("EB03-024", "[On Play]", "[Blocker]");

  it("plays an {Alabasta} body and then bars every other Character", () => {
    const game = table("eb03-024-on-play")
      .withHand("p1", [
        instance("vivi", "EB03-024"),
        instance("cobra", "OP13-011"),
        instance("spare", "EB03-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-024" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("OP13-011");
    expect(playableInstances(game, "p1")).not.toContain("spare");
  });

  it("bars them even when no body was fetched", () => {
    const game = table("eb03-024-no-target")
      .withHand("p1", [
        instance("vivi", "EB03-024"),
        instance("spare", "EB03-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-024" });
    settle(game);

    expect(playableInstances(game, "p1")).not.toContain("spare");
  });
});

describe("EB03-025 Hina", () => {
  covers("EB03-025", "[On Play]");

  it("returns a Character of exactly 6000 printed power", () => {
    const game = table("eb03-025-on-play")
      .withHand("p1", [
        instance("hina", "EB03-025"),
        instance("pitch", "EB03-002"),
      ])
      .withBoard("p2", [character("target", "EB03-040")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-025" });
    applyOptional(game);
    // The card out of hand is the cost; then the bounce. Hina is herself a
    // 6000 body and the printed clause names no side, so she is a legal target
    // for her own bounce and is offered first -- the opposing Character has to
    // be named.
    game.play({ type: "resolve-effect", optionId: "pitch" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "target",
    );
  });

  it("cannot touch a 7000 body, because the reading is exact", () => {
    const game = table("eb03-025-exact")
      .withHand("p1", [
        instance("hina", "EB03-025"),
        instance("pitch", "EB03-002"),
      ])
      .withBoard("p2", [character("target", "EB03-043")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-025" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB03-043"]);
  });
});

describe("EB03-026 Boa Hancock", () => {
  covers("EB03-026", "[On Play]", "[Activate: Main]");

  it("makes a full-handed opponent bury one of their own cards", () => {
    const game = table("eb03-026-on-play")
      .withHand("p1", [instance("hancock", "EB03-026")])
      .withHand("p2", copies(5, "EB03-002", "theirs"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-026" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(4);
  });

  it("leaves a four-card hand alone", () => {
    const game = table("eb03-026-small-hand")
      .withHand("p1", [instance("hancock", "EB03-026")])
      .withHand("p2", copies(4, "EB03-002", "theirs"))
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-026" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(4);
  });

  it("buries one of its own Characters to spread two rested DON!!", () => {
    const game = table("eb03-026-activate")
      .withBoard("p1", [
        character("hancock", "EB03-026"),
        character("fodder", "EB03-002"),
        character("recipient", "EB03-030"),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-026" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    expect(boardNumbers(game, "p1")).not.toContain("EB03-002");
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });
});

describe("EB03-027 Marguerite", () => {
  covers("EB03-027", "[On Play]");

  it("returns a Character of exactly 7000 printed power, for free", () => {
    const game = table("eb03-027-on-play")
      .withHand("p1", [instance("marguerite", "EB03-027")])
      .withBoard("p2", [character("target", "EB03-043")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-027" });
    // A 7000 body herself, so she is offered as a target for her own clause.
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
  });
});

describe("EB03-028 Yu", () => {
  covers("EB03-028", "[On Play]", "[Activate: Main]");

  it("discards on arrival, and the discard is not optional", () => {
    const game = table("eb03-028-on-play")
      .withHand("p1", [
        instance("yu", "EB03-028"),
        instance("pitch", "EB03-002"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-028" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("pitch");
  });

  it("trashes itself to refill a short hand", () => {
    const game = table("eb03-028-activate")
      .withBoard("p1", [character("yu", "EB03-028")])
      .withHand("p1", [])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-028" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(2);
    expect(boardNumbers(game, "p1")).toEqual([]);
  });

  it("is not offered with five cards in hand", () => {
    const game = table("eb03-028-full-hand")
      .withBoard("p1", [character("yu", "EB03-028")])
      .withHand("p1", copies(5, "EB03-002", "held"))
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-028",
        ),
    ).toBe(false);
  });
});

describe('EB03-029 "Insolent Fool!! Stand Down!!"', () => {
  covers("EB03-029", "[Main]", "[Counter]");

  it("rests four DON!! to put a {Kuja Pirates} body down", () => {
    const game = table("eb03-029-main")
      .withLeader("p1", "OP14-041")
      .withHand("p1", [
        instance("event", "EB03-029"),
        instance("body", "OP14-105"),
      ])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-029" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("OP14-105");
  });

  it("is not offered behind another Leader", () => {
    const game = table("eb03-029-wrong-leader")
      .withHand("p1", [
        instance("event", "EB03-029"),
        instance("body", "OP14-105"),
      ])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-029",
        ),
    ).toBe(false);
  });

  it("adds +3000 while a [Boa Hancock] is the one being attacked", () => {
    const game = defending("eb03-029-counter")
      .withHand("p1", [instance("event", "EB03-029")])
      .withBoard("p1", [character("wall", "EB03-026")])
      .withBoard("p2", [character("attacker", "EB03-043")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "wall",
          attackPower: 9000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });

  it("is not offered while anyone else is the target", () => {
    const game = defending("eb03-029-counter-other")
      .withHand("p1", [instance("event", "EB03-029")])
      .withBoard("p1", [character("wall", "EB03-040")])
      .withBoard("p2", [character("attacker", "EB03-043")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "wall",
          attackPower: 9000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    expect(
      getLegalActions(game.state, "p1").find(
        (action) => action.type === "activate-counter-event",
      ),
    ).toBeUndefined();
  });
});

describe("EB03-031 Vinsmoke Reiju", () => {
  covers("EB03-031", "[Your Turn]", "[On Play]");

  it("resolves an Event already in the trash behind the [Sanji] Leader", () => {
    const game = table("eb03-031-on-play")
      .withLeader("p1", "OP12-041")
      .withHand("p1", [instance("reiju", "EB03-031")])
      // OP05-077 Gamma Knife is a 2-cost [Main] Event in the pool.
      .withTrash("p1", [instance("spent", "OP05-077")])
      .withBoard("p2", [character("target", "EB03-032")])
      .build();

    const fieldDonBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "EB03-031" });
    applyOptional(game);
    settle(game);

    // The DON!! −1 was paid, and the Event left the trash rather than the hand.
    expect(game.state.players.p1.activeDon.length).toBeLessThan(fieldDonBefore);
    expect(
      game.state.players.p1.trash.filter((card) => card.instanceId === "spent"),
    ).toHaveLength(1);
  });

  it("does nothing behind another Leader", () => {
    const game = table("eb03-031-wrong-leader")
      .withHand("p1", [instance("reiju", "EB03-031")])
      .withTrash("p1", [instance("spent", "OP05-077")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-031" });
    settle(game);

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("spent");
  });
});

describe("EB03-033 Charlotte Brulee", () => {
  covers("EB03-033", "[Opponent's Turn]");

  /**
   * A DON!! going back to the DON!! deck on the opponent's turn, driven for
   * real: p2 attacks a rested EB03-034 Charlotte Linlin, whose own `[On K.O.]`
   * pays `DON!! -1`. That is the signal this clause watches, and it is raised
   * by the `return-don` node -- not by an imperative branch, which is why the
   * OP11-062 Leader's own `DON!! -1` on the same board is skipped here.
   */
  const koLinlin = (game: Game) => {
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "linlin",
    });
    let guard = 0;
    while (guard++ < 12) {
      const offered = getLegalActions(
        game.state,
        game.state.activePlayer,
      ).filter((action) => action.type === "resolve-effect");
      if (offered.length > 0) {
        const leaderOffer = offered.some((action) =>
          /Leader effect/.test(action.summary),
        );
        game.play({
          type: "resolve-effect",
          optionId: leaderOffer
            ? "skip"
            : (offered.find((action) => action.optionId === "return-don:active")
                ?.optionId ?? offered[0]!.optionId),
        });
        continue;
      }
      if (game.state.phase === "block" || game.state.phase === "counter") {
        game.pass();
        continue;
      }
      break;
    }
  };

  const board = (seed: string) =>
    defending(seed)
      .withBoard("p1", [
        character("brulee", "EB03-033"),
        character("linlin", "EB03-034", { rested: true }),
      ])
      .withDon("p1", { active: 2 })
      .withDonDeck("p1", 4)
      .withBoard("p2", [character("attacker", "EB04-061")]);

  it("refunds a rested DON!! behind a {Big Mom Pirates} Leader", () => {
    const game = board("eb03-033-reaction")
      .withLeader("p1", "OP11-062")
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    const donDeckBefore = game.state.players.p1.donDeck.length;
    koLinlin(game);

    // One DON!! went back to the deck to pay Linlin's clause, and Brulee
    // brought one out again -- rested, so it cannot pay for the same defence.
    expect(game.state.players.p1.restedDon.length).toBe(restedBefore + 1);
    expect(game.state.players.p1.donDeck.length).toBe(donDeckBefore);
  });

  it("refunds nothing behind a Leader without the type", () => {
    const game = board("eb03-033-wrong-leader").build();

    const restedBefore = game.state.players.p1.restedDon.length;
    const donDeckBefore = game.state.players.p1.donDeck.length;
    koLinlin(game);

    expect(game.state.players.p1.restedDon.length).toBe(restedBefore);
    expect(game.state.players.p1.donDeck.length).toBe(donDeckBefore + 1);
  });
});

describe("EB03-034 Charlotte Linlin", () => {
  covers("EB03-034", "[On Play]", "[On K.O.]");

  it("draws, stacks a card back and adds an active DON!!", () => {
    const game = table("eb03-034-on-play")
      .withHand("p1", [instance("linlin", "EB03-034")])
      .withDonDeck("p1", 3)
      .build();

    const donDeckBefore = game.state.players.p1.donDeck.length;
    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-034" });
    settle(game);

    // One DON!! left the DON!! deck for the field, and the draw-then-stack
    // leaves the hand where it started: one card drawn, one put back on top.
    expect(game.state.players.p1.donDeck.length).toBe(donDeckBefore - 1);
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });
});

describe("EB03-036 Baby 5", () => {
  covers("EB03-036", "[On Play]");

  it("returns a DON!! to K.O. two cheap Characters", () => {
    const game = table("eb03-036-on-play")
      .withHand("p1", [instance("baby5", "EB03-036")])
      .withBoard("p2", [
        character("first", "EB03-032"),
        character("second", "EB03-047"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-036" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
  });

  it("cannot reach a 4-cost body", () => {
    const game = table("eb03-036-too-expensive")
      .withHand("p1", [instance("baby5", "EB03-036")])
      .withBoard("p2", [character("target", "EB03-035")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-036" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB03-035"]);
  });
});

describe("EB03-037 Lim", () => {
  covers("EB03-037", "[On Play]");

  it("buffs every {ODYSSEY} card while seven DON!! are on the field", () => {
    const game = table("eb03-037-on-play")
      .withHand("p1", [instance("lim", "EB03-037")])
      .withBoard("p1", [character("odyssey", "OP10-024")])
      .build();

    const before = currentPower(game.state, "p1", "odyssey");
    game.play({ type: "play-card", cardNumber: "EB03-037" });
    settle(game);

    expect(currentPower(game.state, "p1", "odyssey")).toBe(before + 1_000);
  });
});

describe('EB03-038 "Thanks for the Treat. ♡"', () => {
  covers("EB03-038", "[Main]", "[Counter]");

  it("ramps two rested DON!! off a pure GERMA board", () => {
    const game = table("eb03-038-main")
      .withHand("p1", [instance("event", "EB03-038")])
      .withBoard("p1", [character("germa", "OP10-063")])
      .withDon("p1", { active: 2 })
      .withDon("p2", { active: 5 })
      .withDonDeck("p1", 4)
      .build();

    const before =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    game.play({ type: "activate-main", cardNumber: "EB03-038" });
    settle(game);

    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(before + 2);
  });

  it("is not offered with a non-GERMA Character on the board", () => {
    const game = table("eb03-038-mixed-board")
      .withHand("p1", [instance("event", "EB03-038")])
      .withBoard("p1", [
        character("germa", "OP10-063"),
        character("other", "EB03-030"),
      ])
      .withDon("p1", { active: 2 })
      .withDon("p2", { active: 5 })
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-038",
        ),
    ).toBe(false);
  });

  it("adds +3000 to the Leader in the Counter step", () => {
    const game = defending("eb03-038-counter")
      .withHand("p1", [instance("event", "EB03-038")])
      .withBoard("p2", [character("attacker", "EB03-043")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 7000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("EB03-039 Ulti", () => {
  covers("EB03-039", "[On Play]");

  it("draws, discards and plays a vanilla body out of the trash", () => {
    const game = table("eb03-039-on-play")
      .withLeader("p1", "OP17-058")
      .withHand("p1", [instance("ulti", "EB03-039")])
      .withTrash("p1", [
        instance("vanilla", "EB03-040"),
        instance("texted", "EB03-041"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-039" });
    settle(game);

    expect(boardNumbers(game, "p1")).toContain("EB03-040");
    expect(boardNumbers(game, "p1")).not.toContain("EB03-041");
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("eb03-039-wrong-leader")
      .withHand("p1", [instance("ulti", "EB03-039")])
      .withTrash("p1", [instance("vanilla", "EB03-040")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-039" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual(["EB03-039"]);
  });
});

describe("EB03-041 Kujyaku", () => {
  covers("EB03-041", "[Opponent's Turn]", "[On Play]");

  it("trashes a {Navy} card for two", () => {
    const game = table("eb03-041-on-play")
      .withHand("p1", [
        instance("kujyaku", "EB03-041"),
        // EB03-018 Tashigi is {Navy}; EB03-030 Viola is not.
        instance("navy", "EB03-018"),
        instance("other", "EB03-030"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-041" });
    applyOptional(game);
    settle(game);

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("navy");
    expect(game.state.players.p1.hand.length).toBeGreaterThanOrEqual(2);
  });

  it("cannot pay with a hand holding no {Navy} card", () => {
    const game = table("eb03-041-no-navy")
      .withHand("p1", [
        instance("kujyaku", "EB03-041"),
        instance("other", "EB03-030"),
      ])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-041" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });

  it("buffs the {SWORD} bodies the ceiling admits, on the opponent's turn", () => {
    const game = defending("eb03-041-aura")
      .withBoard("p1", [
        character("kujyaku", "EB03-041"),
        // OP11-010 Hibari is a 5-cost {SWORD} body; OP11-017 X.Drake is 6 and
        // OP11-092 Helmeppo is 6, so both are in -- EB03-030 Viola is not
        // {SWORD} at all.
        character("sword", "OP11-010"),
        character("other", "EB03-030"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "sword")).toBe(8000);
    expect(currentPower(game.state, "p1", "other")).toBe(6000);
  });

  it("buffs nothing on its own controller's turn", () => {
    const game = table("eb03-041-own-turn")
      .withBoard("p1", [
        character("kujyaku", "EB03-041"),
        character("sword", "OP11-010"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "sword")).toBe(6000);
  });
});

describe("EB03-042 Koala", () => {
  covers("EB03-042", "static", "[Opponent's Turn]", "[On K.O.]");

  it("costs 8 behind a {Revolutionary Army} Leader", () => {
    const game = table("eb03-042-cost")
      .withLeader("p1", "OP12-081")
      .withBoard("p1", [character("koala", "EB03-042")])
      .build();

    expect(
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find(
          (card) => card.instanceId === "koala",
        )!,
      ),
    ).toBe(8);
  });

  it("costs its printed 4 behind any other Leader", () => {
    const game = table("eb03-042-printed-cost")
      .withBoard("p1", [character("koala", "EB03-042")])
      .build();

    expect(
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find(
          (card) => card.instanceId === "koala",
        )!,
      ),
    ).toBe(4);
  });

  it("replaces itself out of the trash when the opponent kills it", () => {
    const game = defending("eb03-042-on-ko")
      .withBoard("p1", [character("koala", "EB03-042", { rested: true })])
      .withTrash("p1", [
        instance("ra", "OP12-093"),
        instance("koala-copy", "EB03-042"),
      ])
      .withBoard("p2", [character("attacker", "EB04-061")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "koala",
    });
    declineDefence(game);
    settle(game);

    // The {Revolutionary Army} body came back; the second [Koala] is barred by
    // the printed "other than".
    expect(boardNumbers(game, "p1")).toEqual(["OP12-093"]);
  });
});

describe("EB03-043 Stussy", () => {
  covers("EB03-043", "[On Play]", "[Blocker]");

  it("buries two CP cards from the trash to K.O. a 4-cost body", () => {
    const game = table("eb03-043-on-play")
      .withHand("p1", [instance("stussy", "EB03-043")])
      .withTrash("p1", [
        instance("cp-a", "EB03-040"),
        instance("cp-b", "OP13-110"),
      ])
      .withBoard("p2", [character("target", "EB03-035")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-043" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("cannot pay with one CP card in the trash", () => {
    const game = table("eb03-043-short-trash")
      .withHand("p1", [instance("stussy", "EB03-043")])
      .withTrash("p1", [instance("cp-a", "EB03-040")])
      .withBoard("p2", [character("target", "EB03-035")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-043" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB03-035"]);
    expect(game.state.players.p1.trash).toHaveLength(1);
  });
});

describe("EB03-044 Black Maria", () => {
  covers("EB03-044", "static", "[On Play]");

  it("digs out [Onigashima Island] and puts it straight down", () => {
    const game = table("eb03-044-on-play")
      .withHand("p1", [instance("maria", "EB03-044")])
      .withDeckTop("p1", [
        instance("stage", "FIX-STAGE-ONIGASHIMA"),
        ...copies(4, "EB03-002", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-044" });
    settle(game);

    expect(game.state.players.p1.stage?.instanceId).toBe("stage");
  });

  it("gains [Blocker] only behind a multicoloured Leader", () => {
    const multi = defending("eb03-044-blocker")
      .withLeader("p1", "EB03-001")
      .withBoard("p1", [character("maria", "EB03-044")])
      .build();
    const mono = defending("eb03-044-mono")
      .withBoard("p1", [character("maria", "EB03-044")])
      .build();

    expect(hasKeyword(multi.state, "p1", "maria", "Blocker")).toBe(true);
    expect(hasKeyword(mono.state, "p1", "maria", "Blocker")).toBe(false);
  });
});

describe("EB03-045 Perona", () => {
  covers("EB03-045", "[On Play]", "[Blocker]");

  it("gives a rested DON!! and recurs a cheap body from a full trash", () => {
    const game = table("eb03-045-on-play")
      .withHand("p1", [instance("perona", "EB03-045")])
      .withDon("p1", { rested: 1 })
      .withTrash("p1", [
        instance("tbp", "OP14-102"),
        ...copies(9, "EB03-002", "junk"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-045" });
    settle(game);

    const recurred = game.state.players.p1.board.find(
      (card) => card.instanceId === "tbp",
    );
    expect(recurred?.rested).toBe(true);
  });

  it("recurs nothing from a nine-card trash", () => {
    const game = table("eb03-045-thin-trash")
      .withHand("p1", [instance("perona", "EB03-045")])
      .withDon("p1", { rested: 1 })
      .withTrash("p1", [
        instance("tbp", "OP14-102"),
        ...copies(8, "EB03-002", "junk"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-045" });
    settle(game);

    expect(boardNumbers(game, "p1")).toEqual(["EB03-045"]);
  });
});

describe("EB03-046 Miss Doublefinger(Zala)", () => {
  covers("EB03-046", "[On Play]", "[On K.O.]");

  it("draws while an 8-cost Character is on either board", () => {
    const game = table("eb03-046-on-play")
      .withHand("p1", [instance("zala", "EB03-046")])
      .withBoard("p2", [character("huge", "OP14-104")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-046" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("draws nothing on a board of mid-cost bodies", () => {
    const game = table("eb03-046-no-extremes")
      .withHand("p1", [instance("zala", "EB03-046")])
      .withBoard("p2", [character("mid", "EB03-030")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-046" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });

  it("mills two of its controller's cards when it dies", () => {
    const game = defending("eb03-046-on-ko")
      .withBoard("p1", [character("zala", "EB03-046", { rested: true })])
      .withBoard("p2", [character("attacker", "EB04-061")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "zala",
    });
    declineDefence(game);
    settle(game);

    // Two off the deck, plus the body itself.
    expect(game.state.players.p1.trash).toHaveLength(trashBefore + 3);
  });
});

describe("EB03-047 Miss.Valentine(Mikita)", () => {
  covers("EB03-047", "[On Play]", "[On K.O.]");

  it("mills three on arrival", () => {
    const game = table("eb03-047-on-play")
      .withHand("p1", [instance("mikita", "EB03-047")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "EB03-047" });
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(trashBefore + 3);
  });

  it("draws a card when it dies", () => {
    const game = defending("eb03-047-on-ko")
      .withBoard("p1", [character("mikita", "EB03-047", { rested: true })])
      .withBoard("p2", [character("attacker", "EB04-061")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "mikita",
    });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore + 1);
  });
});

describe("EB03-048 Rebecca", () => {
  covers("EB03-048", "[On Play]", "[Blocker]");

  it("digs out a {Dressrosa} Stage and plays the 1-cost one", () => {
    const game = table("eb03-048-on-play")
      .withHand("p1", [instance("rebecca", "EB03-048")])
      // OP15-057 Dressrosa Kingdom is the pool's 1-cost {Dressrosa} Stage.
      .withDeckTop("p1", [
        instance("stage", "OP15-057"),
        ...copies(4, "EB03-002", "filler"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-048" });
    settle(game);

    expect(game.state.players.p1.stage?.instanceId).toBe("stage");
  });
});

describe('EB03-049 "I Knew You People Were Behind This."', () => {
  covers("EB03-049", "[Main]", "[Counter]");

  it("rests seven DON!! for two Thriller Bark bodies", () => {
    const game = table("eb03-049-main")
      .withLeader("p1", "FIX-LEADER-PERONA")
      .withHand("p1", [
        instance("event", "EB03-049"),
        // OP16-105 Gecko Moria is a 6-cost {Thriller Bark Pirates} body, which
        // only the first half of the clause can afford.
        instance("big", "OP16-105"),
      ])
      .withTrash("p1", [instance("small", "OP14-102")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-049" });
    settle(game);

    // One out of hand and one out of the trash, which is what "from your hand
    // or trash" means on both halves.
    expect(boardNumbers(game, "p1").sort()).toEqual(["OP14-102", "OP16-105"]);
  });

  it("is not offered behind another Leader", () => {
    const game = table("eb03-049-wrong-leader")
      .withHand("p1", [instance("event", "EB03-049")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-049",
        ),
    ).toBe(false);
  });

  it("adds +3000 to the Leader in the Counter step", () => {
    const game = defending("eb03-049-counter")
      .withHand("p1", [instance("event", "EB03-049")])
      .withBoard("p2", [character("attacker", "EB03-043")])
      .withActiveAttack(
        {
          attackerPlayerId: "p2",
          defenderPlayerId: "p1",
          attackerInstanceId: "attacker",
          targetInstanceId: "p1-leader",
          attackPower: 7000,
          counterPower: 0,
        },
        "counter",
      )
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "event" });

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });
});

describe("EB03-050 Conis", () => {
  covers("EB03-050", "[On Play]");

  it("hands [Double Attack] to a {Sky Island} Character for the turn", () => {
    const game = table("eb03-050-on-play")
      .withHand("p1", [instance("conis", "EB03-050")])
      .withBoard("p1", [character("sky", "OP15-113")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-050" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "sky", "Double Attack")).toBe(true);
  });

  it("passes over a Character outside the type", () => {
    const game = table("eb03-050-wrong-type")
      .withHand("p1", [instance("conis", "EB03-050")])
      .withBoard("p1", [character("other", "EB03-030")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-050" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "other", "Double Attack")).toBe(false);
  });
});

describe("EB03-051 Charlotte Smoothie", () => {
  covers("EB03-051", "[On Play]");

  it("spends a face-up Life card to K.O. a cheap body", () => {
    const game = table("eb03-051-on-play")
      .withHand("p1", [instance("smoothie", "EB03-051")])
      .withLife("p1", [
        instance("shown", "EB03-002", { faceUp: true }),
        instance("hidden", "EB03-030"),
      ])
      .withBoard("p2", [character("cheap", "EB03-032")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-051" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
    expect(
      game.state.players.p1.life.every((card) => card.faceUp !== true),
    ).toBe(true);
  });

  it("does nothing with every Life card face-down", () => {
    const game = table("eb03-051-no-face-up")
      .withHand("p1", [instance("smoothie", "EB03-051")])
      .withLife("p1", 2)
      .withBoard("p2", [character("cheap", "EB03-032")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-051" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB03-032"]);
  });
});

describe("EB03-052 Shirahoshi", () => {
  covers("EB03-052", "[Activate: Main]");

  it("trashes itself to bank a Life card and buff the Neptunians", () => {
    const game = table("eb03-052-activate")
      .withLeader("p1", "OP11-022")
      .withBoard("p1", [
        character("shirahoshi", "EB03-052"),
        character("neptunian", "OP11-027"),
      ])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "activate-main", cardNumber: "EB03-052" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore + 1);
    expect(currentPower(game.state, "p1", "neptunian")).toBe(7000);
    expect(boardNumbers(game, "p1")).toEqual(["OP11-027"]);
  });

  it("is not offered behind another Leader", () => {
    const game = table("eb03-052-wrong-leader")
      .withBoard("p1", [character("shirahoshi", "EB03-052")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-052",
        ),
    ).toBe(false);
  });
});

describe("EB03-054 Nico Robin", () => {
  covers("EB03-054", "[On Play]", "[Trigger]");

  it("trades a Life card for a fresh one off the deck", () => {
    const game = table("eb03-054-on-play")
      .withHand("p1", [instance("robin", "EB03-054")])
      .withLife("p1", [
        instance("spent", "EB03-002"),
        instance("kept", "EB03-030"),
      ])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "EB03-054" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("spent");
  });

  it("plays itself off a Life card for one card in hand", () => {
    const game = table("eb03-054-trigger")
      .withBoard("p1", [character("attacker", "EB03-002")])
      .withHand("p2", [instance("pitch", "EB03-030")])
      .withLife("p2", [
        instance("life-robin", "EB03-054"),
        instance("spare", "EB03-030"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    settle(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).toContain("life-robin");
  });
});

describe("EB03-056 Belo Betty", () => {
  covers("EB03-056", "[On Play]");

  it("turns a Life card face-up to K.O. a 3-cost body", () => {
    const game = table("eb03-056-on-play")
      .withHand("p1", [instance("betty", "EB03-056")])
      .withLife("p1", 2)
      .withBoard("p2", [character("target", "EB03-044")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-056" });
    applyOptional(game);
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual([]);
    expect(
      game.state.players.p1.life.some((card) => card.faceUp === true),
    ).toBe(true);
  });

  it("cannot pay with no Life at all", () => {
    const game = table("eb03-056-no-life")
      .withHand("p1", [instance("betty", "EB03-056")])
      .withLife("p1", 0)
      .withBoard("p2", [character("target", "EB03-044")])
      .allowPartialState()
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-056" });
    settle(game);

    expect(boardNumbers(game, "p2")).toEqual(["EB03-044"]);
  });
});

describe("EB03-057 Yamato", () => {
  covers("EB03-057", "[On Play]", "[On K.O.]");

  it("hands three rested DON!! to a {Land of Wano} Leader", () => {
    const game = table("eb03-057-on-play")
      .withLeader("p1", "OP16-079")
      .withHand("p1", [instance("yamato", "EB03-057")])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-057" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(3);
  });

  it("trashes the opponent's top Life card when it dies", () => {
    const game = defending("eb03-057-on-ko")
      .withBoard("p1", [character("yamato", "EB03-057", { rested: true })])
      .withBoard("p2", [character("attacker", "EB04-061")])
      .build();

    const lifeBefore = game.state.players.p2.life.length;
    const handBefore = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "yamato",
    });
    declineDefence(game);
    settle(game);

    // Trashed, not damaged: the card does not reach their hand.
    expect(game.state.players.p2.life).toHaveLength(lifeBefore - 1);
    expect(game.state.players.p2.hand).toHaveLength(handBefore);
  });
});

describe("EB03-058 Lilith", () => {
  covers("EB03-058", "[Your Turn]", "[On Play]", "[Trigger]");

  it("draws while its controller is down to two Life", () => {
    const game = table("eb03-058-on-play")
      .withHand("p1", [instance("lilith", "EB03-058")])
      .withLife("p1", 2)
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-058" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("draws nothing at three Life", () => {
    const game = table("eb03-058-high-life")
      .withHand("p1", [instance("lilith", "EB03-058")])
      .withLife("p1", 3)
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "EB03-058" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });

  it("plays itself off a Life card behind the [Vegapunk] Leader", () => {
    const game = table("eb03-058-trigger")
      .withLeader("p2", "FIX-LEADER-VEGAPUNK")
      .withBoard("p1", [character("attacker", "EB03-002")])
      .withLife("p2", [
        instance("life-lilith", "EB03-058"),
        instance("spare", "EB03-030"),
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

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).toContain("life-lilith");
  });

  it("goes to hand off a Life card behind any other Leader", () => {
    const game = table("eb03-058-trigger-closed")
      .withBoard("p1", [character("attacker", "EB03-002")])
      .withLife("p2", [
        instance("life-lilith", "EB03-058"),
        instance("spare", "EB03-030"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    settle(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("life-lilith");
  });
});

describe("EB03-059 S-Snake", () => {
  covers("EB03-059", "[On Play]", "[Trigger]");

  it("banks a Trigger card face-up on Life behind an {Egghead} Leader", () => {
    const game = table("eb03-059-on-play")
      .withLeader("p1", "EB04-001")
      .withHand("p1", [
        instance("snake", "EB03-059"),
        instance("trigger", "EB03-054"),
      ])
      .withLife("p1", 2)
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-059" });
    settle(game);

    const banked = game.state.players.p1.life.find(
      (card) => card.instanceId === "trigger",
    );
    expect(banked?.faceUp).toBe(true);
  });

  it("does nothing at one Life", () => {
    const game = table("eb03-059-low-life")
      .withLeader("p1", "EB04-001")
      .withHand("p1", [
        instance("snake", "EB03-059"),
        instance("trigger", "EB03-054"),
      ])
      .withLife("p1", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "EB03-059" });
    settle(game);

    expect(
      game.state.players.p1.life.map((card) => card.instanceId),
    ).not.toContain("trigger");
  });

  it("locks down an attacker off a Life card, except a [Monkey.D.Luffy]", () => {
    const game = table("eb03-059-trigger")
      .withBoard("p1", [
        character("attacker", "EB03-002"),
        character("luffy", "ST21-014"),
        character("other", "EB03-030"),
      ])
      .withLife("p2", [
        instance("life-snake", "EB03-059"),
        instance("spare", "EB03-030"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    const offered = effectOptions(game.state);

    // The [Monkey.D.Luffy] body is barred by name; the other 6-cost-or-less
    // Character is not.
    expect(offered).not.toContain("luffy");
    expect(offered).toContain("other");
  });
});

describe('EB03-060 "Will You Be My Servant?"', () => {
  covers("EB03-060", "[Main]", "[Trigger]");

  /**
   * One of the six identities that were in the pool before the set was, and the
   * only one that reached it with a clause the engine dropped: its `[Trigger]`
   * -- "activate this card's [Main] effect" -- had no handler anywhere, which
   * `LEGACY_IMPERATIVE_CARDS` hid because that list exempts a whole card rather
   * than a clause. Both halves are on the mechanic DSL now, and the register is
   * one entry shorter for it.
   *
   * The cost band is the whole clause -- it deliberately reaches neither a
   * 1-cost card nor a 9-cost one -- so both edges are stated here.
   */
  const deckOf = (...numbers: string[]) =>
    numbers.map((number, index) => instance(`top-${index}`, number));

  it("adds a card inside the printed cost band behind the [Nami] Leader", () => {
    const game = table("eb03-060-main")
      .withLeader("p1", "OP11-041")
      .withHand("p1", [instance("event", "EB03-060")])
      // OP11-030 Shirahoshi is cost 1 and OP15-036 Ryuma is cost 6: only the
      // second is inside the band.
      .withDeckTop("p1", deckOf("OP11-030", "OP15-036", "OP11-030", "OP11-030"))
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-060" });
    expect(effectOptions(game.state)).toContain("top-1");
    expect(effectOptions(game.state)).not.toContain("top-0");
    game.play({ type: "resolve-effect", optionId: "top-1" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "top-1",
    );
  });

  it("is not offered behind any other Leader", () => {
    const game = table("eb03-060-wrong-leader")
      .withHand("p1", [instance("event", "EB03-060")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "EB03-060",
        ),
    ).toBe(false);
  });

  it("runs the same search off a Life card", () => {
    const game = table("eb03-060-trigger")
      .withLeader("p2", "OP11-041")
      .withBoard("p1", [character("attacker", "EB03-002")])
      .withLife("p2", [
        instance("life-event", "EB03-060"),
        instance("spare", "EB03-030"),
      ])
      .withDeckTop("p2", deckOf("OP15-036", "OP11-030", "OP11-030", "OP11-030"))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "top-0" });
    settle(game);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "top-0",
    );
  });
});

describe("EB03-061 Uta", () => {
  covers("EB03-061", "[Activate: Main]", "[End of Your Turn]");

  it("sets a DON!! active and rests one of the opponent's", () => {
    const game = table("eb03-061-activate")
      .withBoard("p1", [character("uta", "EB03-061")])
      .withDon("p1", { rested: 2 })
      .withDon("p2", { active: 3 })
      .build();

    const restedBefore = game.state.players.p2.restedDon.length;
    game.play({ type: "activate-main", cardNumber: "EB03-061" });
    game.play({ type: "resolve-effect", optionId: "don" });
    settle(game);

    expect(game.state.players.p2.restedDon.length).toBe(restedBefore + 1);
  });

  it("cannot reach a 5-cost Character with the rest", () => {
    const game = table("eb03-061-cost-gate")
      .withBoard("p1", [character("uta", "EB03-061")])
      .withDon("p1", { rested: 2 })
      .withBoard("p2", [character("big", "EB03-040")])
      .build();

    game.play({ type: "activate-main", cardNumber: "EB03-061" });

    expect(effectOptions(game.state)).not.toContain("big");
  });

  it("rests a DON!! at the end of the turn to stand a {FILM} body up", () => {
    const game = table("eb03-061-end-of-turn")
      .withBoard("p1", [
        character("uta", "EB03-061"),
        character("film", "EB03-003", { rested: true }),
      ])
      .build();

    game.pass();
    applyOptional(game);
    settle(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "film")
        ?.rested,
    ).toBe(false);
  });
});
