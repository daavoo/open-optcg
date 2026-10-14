import { describe, expect, it } from "vitest";
import {
  effectiveCost,
  getLegalActions,
  hasKeyword,
  playCostFromHand,
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
 * ST-27 "(Black) Marshall.D.Teach", as Bandai's recommended list builds it.
 *
 * Thirteen main-deck identities and only five of them are new: the eight OP09
 * slots came with that set and are driven by `test/op09.test.ts` and
 * `test/op16-teach.test.ts`. What is here is ST27-003 Kuzan, ST27-005
 * Marshall.D.Teach, PRB02-014 Sabo, PRB02-015 Shiryu and EB01-048 Laboon.
 *
 * Every position seats the deck itself. That is not decoration: three of the
 * five read "if your Leader has the {Blackbeard Pirates} type" on one half or
 * the other, so a neutral Leader would quietly switch them off -- and each of
 * those is paired below with the same position behind a Leader that fails the
 * gate, because a gate never shown closed is a gate nobody has tested.
 *
 * Every `[On K.O.]` here is reached through a real battle rather than by
 * removing the card from the board: the clause fires however the body leaves,
 * and a battle is the way this deck's bodies actually die.
 */

const ST27 = "(Black) Marshall.D.Teach - Starter Deck 27";
const OPPONENT = "(Green) Roronoa Zoro - Starter Deck 32";

/** ST-27 acting in its own Main Phase, with the full ten DON!! available. */
const table = (seed: string) =>
  scenario().decks(ST27, OPPONENT).seed(seed).atTurn(11, { active: "p1" });

/** The opponent acting, for the clauses that only open on their turn. */
const defending = (seed: string) =>
  scenario().decks(ST27, OPPONENT).seed(seed).atTurn(12, { active: "p2" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/** Take the apply branch of an `optional` prompt, if one is open. */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/** Resolve the rest of an open effect, taking the first offer at each step. */
function settle(game: Game) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/**
 * Let a declared attack resolve without blocking or countering, taking the
 * decline branch of anything the defender is offered on the way.
 */
const declineDefence = (game: Game) => {
  let guard = 0;
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (guard++ > 40) throw new Error("battle never settled");
    if (
      game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
      continue;
    }
    if (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      const decline =
        options.find(
          (optionId) => optionId === "skip" || optionId === "done",
        ) ?? options.at(-1)!;
      game.play({ type: "resolve-effect", optionId: decline });
      continue;
    }
    game.pass();
  }
};

/** Whether a board card's `[Activate: Main]` is currently on offer. */
function mainOffered(game: Game, instanceId: string): boolean {
  return game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" &&
        action.optionId === `mechanic-main:${instanceId}`,
    );
}

describe("EB01-048 Laboon", () => {
  covers("EB01-048", "[Activate: Main]");

  it("rests to give an opponent's Character -4 cost for the turn", () => {
    const game = table("st27-laboon")
      .withBoard("p1", [character("laboon", "EB01-048")])
      .withBoard("p2", [character("target", "ST27-003")])
      .build();
    const before = effectiveCost(
      game.state,
      "p2",
      game.state.players.p2.board[0]!,
    );

    game.play({ type: "activate-main", optionId: "mechanic-main:laboon" });
    applyOptional(game);
    settle(game);

    // A 6-drop becomes a 2, which is what this deck's cost-capped removal
    // reads -- the whole reason a 4-cost Animal is in a Blackbeard list.
    expect(before).toBe(6);
    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(2);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "laboon")
        ?.rested,
    ).toBe(true);
  });

  it("is not offered once it has already rested", () => {
    const game = table("st27-laboon-rested")
      .withBoard("p1", [character("laboon", "EB01-048", { rested: true })])
      .withBoard("p2", [character("target", "ST27-003")])
      .build();

    expect(mainOffered(game, "laboon")).toBe(false);
  });
});

describe("ST27-005 Marshall.D.Teach", () => {
  covers("ST27-005", "[Activate: Main]", "[On K.O.]");

  it("rests to K.O. a Character at cost 3 or less, and reaches no further", () => {
    const game = table("st27-teach-ko")
      .withBoard("p1", [character("teach", "ST27-005")])
      .withBoard("p2", [
        character("cheap", "ST32-005"),
        character("expensive", "ST27-003"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:teach" });
    applyOptional(game);
    settle(game);

    // The 6-cost Kuzan is out of reach, so `min: 0` leaves the engine one
    // candidate and it is the cheap body that dies.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "expensive",
    ]);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "teach")
        ?.rested,
    ).toBe(true);
  });

  it("names 1 Character with no side, so its own board is a legal target", () => {
    const game = table("st27-teach-own")
      .withBoard("p1", [
        character("teach", "ST27-005"),
        character("stronger", "OP09-089"),
      ])
      .withBoard("p2", [])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:teach" });
    applyOptional(game);
    settle(game);

    // OP09-089 Stronger is a 1-cost, and nothing on the other side is: the
    // only body inside the ceiling is this player's own.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "teach",
    ]);
  });

  it("reaches a body a cost debuff has just dropped inside the ceiling", () => {
    const game = table("st27-teach-combo")
      .withBoard("p1", [
        character("laboon", "EB01-048"),
        character("teach", "ST27-005"),
      ])
      // A 5-cost Van Augur is out of reach on its own and inside the ceiling
      // once Laboon has taken 4 off it. This pairing is the deck's mid-game,
      // and it is why the K.O. reads effective cost rather than base.
      .withBoard("p2", [character("augur", "OP09-083")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:laboon" });
    applyOptional(game);
    settle(game);
    game.play({ type: "activate-main", optionId: "mechanic-main:teach" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("adds a black card back from the trash when it is K.O.'d", () => {
    const game = defending("st27-teach-onko")
      .withBoard("p1", [character("teach", "ST27-005", { rested: true })])
      // A black card this deck does not run, so the assertion cannot pass on
      // a copy the opening hand happened to hold.
      .withTrash("p1", [instance("devon", "OP09-084")])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "teach",
    });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "OP09-084",
    );
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("ST27-005");
  });
});

describe("ST27-003 Kuzan", () => {
  covers("ST27-003", "[Blocker]", "[On K.O.]");

  it("carries its printed [Blocker]", () => {
    const game = table("st27-kuzan-blocker")
      .withBoard("p1", [character("kuzan", "ST27-003")])
      .build();

    expect(hasKeyword(game.state, "p1", "kuzan", "Blocker")).toBe(true);
  });

  it("plays a Blackbeard Pirates body of cost 5 or less out of the trash, rested", () => {
    const game = defending("st27-kuzan-onko")
      .withBoard("p1", [character("kuzan", "ST27-003", { rested: true })])
      // Burgess at 4 is inside the ceiling and a second Kuzan at 6 is not, so
      // the clause has exactly one candidate: Bandai's own end-game line, in
      // which Kuzan dies and Burgess comes back for no cards from hand.
      .withTrash("p1", [
        instance("burgess", "OP09-086"),
        instance("spare-kuzan", "ST27-003"),
      ])
      .withBoard("p2", [character("killer", "OP12-002")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "kuzan",
    });
    declineDefence(game);
    settle(game);

    const board = game.state.players.p1.board;
    expect(board.map((card) => card.instanceId)).toEqual(["burgess"]);
    // Printed "rested", and it is the restraint on the clause: the body it
    // returns can neither attack nor block until it refreshes.
    expect(board[0]!.rested).toBe(true);
  });
});

describe("PRB02-015 Shiryu", () => {
  covers("PRB02-015", "static", "[On K.O.]");

  it("gains [Blocker] and +4 cost behind a Blackbeard Pirates Leader", () => {
    const game = table("st27-shiryu-static")
      .withBoard("p1", [character("shiryu", "PRB02-015")])
      .build();

    expect(hasKeyword(game.state, "p1", "shiryu", "Blocker")).toBe(true);
    // Printed 4, so 8 while the gate holds -- which puts it outside every
    // "cost N or less" removal in the pool, ST27-005's own included.
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(8);
  });

  it("has neither half behind a Leader without the type", () => {
    const game = scenario()
      .decks(OPPONENT, ST27)
      .seed("st27-shiryu-off")
      .atTurn(11, { active: "p1" })
      .withBoard("p1", [character("shiryu", "PRB02-015")])
      .build();

    expect(hasKeyword(game.state, "p1", "shiryu", "Blocker")).toBe(false);
    expect(
      effectiveCost(game.state, "p1", game.state.players.p1.board[0]!),
    ).toBe(4);
  });

  it("K.O.s an opponent's Character by base cost when it dies", () => {
    const game = defending("st27-shiryu-onko")
      .withBoard("p1", [character("shiryu", "PRB02-015", { rested: true })])
      // EB01-048 Laboon prints 4 and is inside the clause; the 5-cost attacker
      // is not. "Base cost", so nothing a debuff does could widen this -- the
      // one removal clause in the list a cost debuff cannot help. Not
      // OP09-086 Jesus Burgess, which prints 4 too and would look like the
      // natural pick: its own text bars a K.O. by the opponent's effects.
      .withBoard("p2", [
        character("laboon", "EB01-048"),
        character("killer", "OP12-002"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "shiryu",
    });
    declineDefence(game);
    settle(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "killer",
    ]);
  });

  it("K.O.s nothing when the Leader is not a Blackbeard Pirate", () => {
    const game = scenario()
      .decks(OPPONENT, ST27)
      .seed("st27-shiryu-onko-off")
      .atTurn(12, { active: "p2" })
      .withBoard("p1", [character("shiryu", "PRB02-015", { rested: true })])
      .withBoard("p2", [
        character("laboon", "EB01-048"),
        character("killer", "OP09-093"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "shiryu",
    });
    declineDefence(game);
    settle(game);

    // The gate is the whole condition, so with it closed the engine withholds
    // the choice rather than offering one it would resolve to nothing.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "laboon",
      "killer",
    ]);
  });
});

describe("PRB02-014 Sabo", () => {
  covers("PRB02-014", "static", "[Blocker]");

  it("carries its printed [Blocker]", () => {
    const game = table("st27-sabo-blocker")
      .withBoard("p1", [character("sabo", "PRB02-014")])
      .build();

    expect(hasKeyword(game.state, "p1", "sabo", "Blocker")).toBe(true);
  });

  it("costs 3 in hand at 15 cards in the trash, and 6 below it", () => {
    const deep = table("st27-sabo-deep")
      .withHand("p1", [instance("sabo", "PRB02-014")])
      .withTrash("p1", copies(15, "OP09-096", "st27-trash"))
      .build();
    expect(playCostFromHand(deep.state, "p1", "PRB02-014", 6)).toBe(3);

    const shallow = table("st27-sabo-shallow")
      .withHand("p1", [instance("sabo", "PRB02-014")])
      .withTrash("p1", copies(14, "OP09-096", "st27-trash"))
      .build();
    // Fourteen is not fifteen. And the discount is a hand price and nothing
    // else: a Sabo already on the board reads as the 6-cost it is printed at,
    // which is why this is not a `cost` layer.
    expect(playCostFromHand(shallow.state, "p1", "PRB02-014", 6)).toBe(6);

    const played = table("st27-sabo-board")
      .withBoard("p1", [character("sabo", "PRB02-014")])
      .withTrash("p1", copies(15, "OP09-096", "st27-trash"))
      .build();
    expect(
      effectiveCost(played.state, "p1", played.state.players.p1.board[0]!),
    ).toBe(6);
  });
});
