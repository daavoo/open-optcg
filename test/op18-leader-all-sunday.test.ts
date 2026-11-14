import { describe, expect, it } from "vitest";
import { getLegalActions } from "@one-piece-sim/engine-core";
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
 * OP18-041 Ms. All Sunday (Leader), edge by edge: what counts as one of "your
 * Characters with a type including "Baroque Works" and 3000 base power or
 * more", what counts as K.O.'d, and that nothing caps how often it pays.
 *
 * Bodies used for their printed facts alone:
 *  - OP18-043 Accelegator: vanilla, cost 4, 6000, {Animal}/{Alabasta}/{Baroque Works}.
 *  - OP09-055 Mr.1: vanilla, cost 5, 7000, {Cross Guild}/{Former Baroque Works}.
 *  - EB05-044 Ms. Father's Day: cost 2, 2000, Baroque Works.
 *  - EB05-045 Ms. Monday: cost 2, exactly 3000, Baroque Works; its [On Play]
 *    K.O.s one of its controller's own Baroque Works Characters.
 *  - OP16-056 Mr.3: 5000 {Former Baroque Works}; trashes itself to draw 2.
 *  - ST10-016 Gum-Gum Kong Gatling: [Main] K.O. a 7000-or-less Character.
 *  - OP06-019 Blue Dragon Seal Water Stream: [Main] K.O. a 5000-or-less one.
 *  - OP10-050: a vanilla 9000 to attack with. FIX-001 / FIX-002: fillers.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1's own Main Phase, behind Ms. All Sunday. */
const ownTurn = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withLeader("p1", "OP18-041")
    .withDeckTop("p1", copies(4, "FIX-001", "deck"))
    .withHand("p2", [instance("p2-a", "FIX-001"), instance("p2-b", "FIX-002")]);

/** p2's Main Phase: p1 is the one losing Characters. */
const opponentTurn = (seed: string) =>
  scenario()
    .decks(P1, P2)
    .seed(seed)
    .atTurn(12, { active: "p2" })
    .bareTable()
    .withLeader("p1", "OP18-041")
    .withDeckTop("p1", copies(4, "FIX-001", "deck"))
    .withHand("p2", [instance("p2-a", "FIX-001"), instance("p2-b", "FIX-002")]);

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

const pick = (game: Game, optionId: string) =>
  game.play({ type: "resolve-effect", optionId });

const ids = (cards: readonly { instanceId: string }[]): string[] =>
  cards.map((card) => card.instanceId);

const attack = (game: Game, attacker: string, target: string) =>
  game.play({
    type: "attack",
    attackerInstanceId: attacker,
    targetInstanceId: target,
  });

/** Declines the Block and Counter steps until the battle resolves. */
function declineDefence(game: Game) {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    game.state.pendingEffect === null
  ) {
    if (guard++ > 10) throw new Error("the defence never ended");
    game.pass();
  }
}

/** p2 swings `attacker` at `target` and p1 lets it through. */
function koInBattle(game: Game, attacker: string, target: string) {
  attack(game, attacker, target);
  declineDefence(game);
}

/** The Leader paid out: p1 drew `drawn`, and p2 is asked to pick a discard. */
function expectDiscardAsked(game: Game, hand: string[]) {
  expect(game.state.activePlayer).toBe("p2");
  expect(game.state.pendingEffect).not.toBeNull();
  expect(effectOptions(game.state)).toEqual(hand);
}

describe("OP18-041 Ms. All Sunday: which Characters count", () => {
  covers("OP18-041", "static");

  it("counts a Character whose type merely includes Baroque Works ({Former Baroque Works})", () => {
    const game = opponentTurn("op18-041-former")
      .withBoard("p1", [character("mr1", "OP09-055", { rested: true })])
      .withBoard("p2", [character("attacker", "OP10-050")])
      .build();

    koInBattle(game, "attacker", "mr1");
    expect(ids(game.state.players.p1.trash)).toEqual(["mr1"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expectDiscardAsked(game, ["p2-a", "p2-b"]);
    pick(game, "p2-a");

    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-b"]);
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-a"]);
  });

  it("counts a Character printed at exactly 3000, K.O.'d by its own controller's effect on their own turn", () => {
    // EB05-045 Ms. Monday's [On Play] K.O.s one of p1's Baroque Works
    // Characters, and it may name itself: a 3000 base, the clause's floor.
    const game = ownTurn("op18-041-exactly-3000")
      .withHand("p1", [instance("monday", "EB05-045")])
      .build();

    game.play({ type: "play-card", cardNumber: "EB05-045" });
    expect(effectOptions(game.state)).toContain("monday");
    pick(game, "monday");

    expect(ids(game.state.players.p1.trash)).toEqual(["monday"]);
    // Ms. Monday's own [On K.O.] and the Leader's clause trigger together, so
    // the turn player orders them; the Leader goes first here.
    expect(effectOptions(game.state)).toEqual([
      "reaction:monday",
      "reaction:p1-leader",
    ]);
    pick(game, "reaction:p1-leader");

    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expectDiscardAsked(game, ["p2-a", "p2-b"]);
    pick(game, "p2-b");
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-b"]);
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-a"]);
  });

  it("does not count a 2000 base Character buffed to 3000 or more", () => {
    const game = opponentTurn("op18-041-buffed")
      .withBoard("p1", [
        character("fathers-day", "EB05-044", {
          rested: true,
          powerModifiers: [{ amount: 2000, expiresAtTurn: 99 }],
        }),
      ])
      .withBoard("p2", [character("attacker", "OP10-050")])
      .build();

    koInBattle(game, "attacker", "fathers-day");

    expect(ids(game.state.players.p1.trash)).toEqual(["fathers-day"]);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-a", "p2-b"]);
  });

  it("still counts a 6000 base Character debuffed below 3000", () => {
    const game = opponentTurn("op18-041-debuffed")
      .withBoard("p1", [
        character("gator", "OP18-043", {
          rested: true,
          powerModifiers: [{ amount: -4000, expiresAtTurn: 99 }],
        }),
      ])
      .withBoard("p2", [character("attacker", "OP10-050")])
      .build();

    koInBattle(game, "attacker", "gator");

    expect(ids(game.state.players.p1.trash)).toEqual(["gator"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expectDiscardAsked(game, ["p2-a", "p2-b"]);
  });

  it("ignores the opponent's own Baroque Works Character being K.O.'d", () => {
    const game = ownTurn("op18-041-their-character")
      .withBoard("p1", [character("attacker", "OP10-050")])
      .withBoard("p2", [character("their-gator", "OP18-043", { rested: true })])
      .build();

    attack(game, "attacker", "their-gator");
    declineDefence(game);

    expect(ids(game.state.players.p2.trash)).toEqual(["their-gator"]);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-a", "p2-b"]);
  });
});

describe("OP18-041 Ms. All Sunday: what counts as K.O.'d", () => {
  covers("OP18-041", "static");

  it("pays when the opponent's Event K.O.s the Character on their turn", () => {
    const game = opponentTurn("op18-041-effect-ko")
      .withBoard("p1", [character("gator", "OP18-043")])
      .withHand("p2", [
        instance("p2-a", "FIX-001"),
        instance("gatling", "ST10-016"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "gatling" });
    pick(game, "gator");

    expect(ids(game.state.players.p1.trash)).toEqual(["gator"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    // The Event has left p2's hand, so only the filler is left to discard.
    expectDiscardAsked(game, ["p2-a"]);
    pick(game, "p2-a");
    expect(game.state.players.p2.hand).toEqual([]);
    expect(ids(game.state.players.p2.trash)).toEqual(
      expect.arrayContaining(["gatling", "p2-a"]),
    );
  });

  it("measures base power, not current power, when an effect K.O.s by a power ceiling", () => {
    // Water Stream reaches 5000 or less; Accelegator's 6000 base is debuffed
    // into range and still prints well above the Leader's 3000 floor.
    const game = opponentTurn("op18-041-effect-ko-debuffed")
      .withBoard("p1", [
        character("gator", "OP18-043", {
          powerModifiers: [{ amount: -2000, expiresAtTurn: 99 }],
        }),
      ])
      .withHand("p2", [
        instance("p2-a", "FIX-001"),
        instance("water-stream", "OP06-019"),
      ])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "water-stream" });
    pick(game, "gator");

    expect(ids(game.state.players.p1.trash)).toEqual(["gator"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expectDiscardAsked(game, ["p2-a"]);
  });

  it("does not pay when the Character is trashed by its own cost rather than K.O.'d", () => {
    // OP16-056 Mr.3: "trash this Character" to draw 2. 5000 {Former Baroque
    // Works}, so only the K.O. requirement keeps the Leader silent.
    const game = ownTurn("op18-041-trashed")
      .withBoard("p1", [character("mr3", "OP16-056")])
      .build();

    game.play({ type: "activate-main", sourceInstanceId: "mr3" });
    let guard = 0;
    while (game.state.pendingEffect && game.state.activePlayer === "p1") {
      if (guard++ > 10) throw new Error("p1's prompts never ended");
      const options = effectOptions(game.state);
      const yes = options.find((id) => id === "pay" || id === "apply");
      pick(game, yes ?? (options.includes("done") ? "done" : options[0]!));
    }

    expect(ids(game.state.players.p1.trash)).toEqual(["mr3"]);
    // Mr.3's own two cards, and nothing from the Leader.
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1", "deck-2"]);
    expect(game.state.pendingEffect).toBeNull();
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-a", "p2-b"]);
    expect(game.state.players.p2.trash).toEqual([]);
  });
});

describe("OP18-041 Ms. All Sunday: no use limit", () => {
  covers("OP18-041", "static");

  it("pays for each of two K.O.s in the same turn", () => {
    const game = opponentTurn("op18-041-twice")
      .withBoard("p1", [
        character("gator", "OP18-043", { rested: true }),
        character("mr1", "OP09-055", { rested: true }),
      ])
      .withBoard("p2", [
        character("attacker", "OP10-050"),
        character("attacker-2", "OP10-050"),
      ])
      .build();

    koInBattle(game, "attacker", "gator");
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expectDiscardAsked(game, ["p2-a", "p2-b"]);
    pick(game, "p2-a");
    expect(game.state.pendingEffect).toBeNull();

    koInBattle(game, "attacker-2", "mr1");
    expect(ids(game.state.players.p1.trash)).toEqual(["gator", "mr1"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1", "deck-2"]);
    expectDiscardAsked(game, ["p2-b"]);
    pick(game, "p2-b");

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.hand).toEqual([]);
    expect(ids(game.state.players.p2.trash)).toEqual(["p2-a", "p2-b"]);
  });
});

describe("OP18-041 Ms. All Sunday: negation", () => {
  covers("OP18-041", "static");

  it("pays nothing while the Leader's effects are negated", () => {
    const game = opponentTurn("op18-041-leader-negated")
      .withBoard("p1", [character("gator", "OP18-043", { rested: true })])
      .withBoard("p2", [character("attacker", "OP10-050")])
      .withNegated("p1-leader")
      .build();

    koInBattle(game, "attacker", "gator");

    expect(ids(game.state.players.p1.trash)).toEqual(["gator"]);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toEqual([]);
    expect(ids(game.state.players.p2.hand)).toEqual(["p2-a", "p2-b"]);
  });

  it("still pays when the K.O.'d Character's own effects were negated", () => {
    // The clause is the Leader's; negating the Character switches off the
    // Character's text, not its type or its printed power.
    const game = opponentTurn("op18-041-character-negated")
      .withBoard("p1", [character("gator", "OP18-043", { rested: true })])
      .withBoard("p2", [character("attacker", "OP10-050")])
      .withNegated("gator")
      .build();

    koInBattle(game, "attacker", "gator");

    expect(ids(game.state.players.p1.trash)).toEqual(["gator"]);
    expect(ids(game.state.players.p1.hand)).toEqual(["deck-1"]);
    expectDiscardAsked(game, ["p2-a", "p2-b"]);
  });
});
