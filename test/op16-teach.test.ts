import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  leaderEffectsNegated,
  type GameState,
} from "@one-piece-sim/engine-core";

import {
  character,
  copies,
  covers,
  instance,
  Game,
  scenario,
} from "./support/index.js";

/**
 * OP-16 Black/Yellow Marshall.D.Teach, clause by clause.
 *
 * The deck's plan is to be attacked: the Leader raises its own Characters out of
 * removal range on the opponent's turn and then buys the right to choose which
 * body an attack hits, and almost every body it chooses pays the card back when
 * it dies. So most of these positions are built from the *defender's* seat, with
 * p2 on this deck and p1 swinging into it -- the reverse of how the set tests
 * read, and the only way the `[On K.O.]` half of the list does anything at all.
 */
const DECK = "(Black/Yellow) Marshall.D.Teach - Official Feature Deck";

/** Their seat is the one under attack, on turn 11 so both sides are at 10 DON!!. */
const defending = (seed: string) =>
  scenario()
    .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

/** Their seat is the turn player, for the deck's own Main-phase clauses. */
const piloting = (seed: string) =>
  scenario()
    .decks(DECK, "(Red) Monkey.D.Luffy - Starter Deck 31")
    .seed(seed)
    .atTurn(11, { active: "p1" })
    .bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

/**
 * Decline the Block and Counter steps so a declared attack resolves.
 *
 * More than a pair of passes, because this Leader answers an attack with an
 * offer rather than with a Blocker: OP16-080's redirect is a `resolve-effect`
 * prompt inside those same windows, and it has to be turned down explicitly.
 */
const declineDefence = (game: Game) => {
  for (let guard = 0; guard < 20; guard += 1) {
    if (game.state.phase !== "block" && game.state.phase !== "counter") return;
    if (
      game.legalActions().some((action) => action.type === "resolve-effect")
    ) {
      game.play({ summary: "Don't apply" });
      continue;
    }
    game.pass();
  }
  throw new Error("defence did not resolve");
};

describe("OP09-086 Jesus Burgess", () => {
  covers("OP09-086", "static");

  it("gains +1000 for every fourth card in the trash, floored", () => {
    const game = defending("op09-086-power")
      .withBoard("p2", [character("burgess", "OP09-086")])
      .withTrash("p2", copies(7, "ST32-004", "junk"))
      .build();

    // Seven cards in the trash is one complete four, not one and three
    // quarters: 5000 + 1000.
    expect(currentPower(game.state, "p2", "burgess")).toBe(6000);
  });

  it("reads the trash live and needs a Blackbeard Pirates Leader", () => {
    const withoutType = defending("op09-086-no-leader")
      .withLeader("p2", "OP12-020")
      .withBoard("p2", [character("burgess", "OP09-086")])
      .withTrash("p2", copies(8, "ST32-004", "junk"))
      .build();

    expect(currentPower(withoutType.state, "p2", "burgess")).toBe(5000);

    const withType = defending("op09-086-with-leader")
      .withBoard("p2", [character("burgess", "OP09-086")])
      .withTrash("p2", copies(8, "ST32-004", "junk"))
      .build();

    expect(currentPower(withType.state, "p2", "burgess")).toBe(7000);
  });

  it("is never offered as the target of an opponent's K.O. effect", () => {
    const game = defending("op09-086-immune")
      .withBoard("p2", [
        character("burgess", "OP09-086"),
        character("devon", "OP16-104"),
      ])
      .withBoard("p1", [character("lone", "ST31-002", { playedTurn: 1 })])
      .withHand("p1", [instance("twister", "EB04-059")])
      .withLife("p1", [instance("their-life", "ST31-003")])
      .build();

    game.play({ summary: "Activate Black Rope Dragon Twister" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "their-life" });

    // Both bodies are inside the printed cost ceiling -- Burgess is a 4 raised
    // to 5 by his own Leader's aura, Devon likewise -- so both are offered:
    // eligibility is a cost filter, and the immunity is checked when the K.O.
    // is applied.
    expect(effectOptions(game.state)).toEqual(["burgess", "devon", "done"]);
    game.play({ type: "resolve-effect", optionId: "burgess" });

    // Named, and still standing.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "burgess",
      "devon",
    ]);
  });

  it("still dies in battle, because the immunity is only to effects", () => {
    const game = defending("op09-086-battle")
      .withBoard("p2", [character("burgess", "OP09-086", { rested: true })])
      .withBoard("p1", [character("bigger", "OP16-003", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "bigger",
      targetInstanceId: "burgess",
    });
    declineDefence(game);

    expect(game.state.players.p2.board).toEqual([]);
    expect(
      game.state.players.p2.trash.map((card) => card.cardNumber),
    ).toContain("OP09-086");
  });
});

describe("OP09-093 Marshall.D.Teach", () => {
  covers("OP09-093", "[Blocker]", "[Activate: Main]");

  it("blocks a declared attack and rests doing it", () => {
    const game = defending("op09-093-blocker")
      .withBoard("p2", [character("teach", "OP09-093")])
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "teach" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("teach");
    expect(game.state.players.p2.board[0]?.rested).toBe(true);
  });

  it("switches off the opponent's Leader for the turn and a Character for longer", () => {
    // A mirror table, because a negated Leader has to be *observable*: OP16-080's
    // own `[Opponent's Turn]` aura raises its Characters' cost by 1, and that
    // number going back down is the negation.
    const game = piloting("op09-093-negate")
      .withLeader("p2", "OP16-080")
      .withHand("p1", [instance("teach", "OP09-093")])
      .withBoard("p2", [
        character("threat", "OP16-104"),
        character("spare", "OP16-110"),
      ])
      .build();

    const threat = game.state.players.p2.board[0]!;
    expect(effectiveCost(game.state, "p2", threat)).toBe(5);

    game.play({ type: "play-card", cardNumber: "OP09-093" });
    game.play({ type: "activate-main", sourceCardNumber: "OP09-093" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    game.play({ type: "resolve-effect", optionId: "threat" });

    expect(leaderEffectsNegated(game.state, "p2")).toBe(true);
    expect(effectiveCost(game.state, "p2", threat)).toBe(4);
    // The Character half carries the sentence's own duration, so it outlasts
    // the Leader half by a turn: it cannot attack on their next turn either.
    expect(game.state.players.p2.board[0]?.cannotAttackUntilTurn).toBe(
      game.state.turn + 1,
    );
    // A negated Character keeps nothing of its own text.
    expect(hasKeyword(game.state, "p2", "spare", "Blocker")).toBe(false);
    game.pass();
    expect(leaderEffectsNegated(game.state, "p2")).toBe(false);
  });

  it("takes neither target when both are declined", () => {
    const game = piloting("op09-093-decline")
      .withHand("p1", [instance("teach", "OP09-093")])
      .withBoard("p2", [character("threat", "OP16-104")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-093" });
    game.play({ type: "activate-main", sourceCardNumber: "OP09-093" });
    game.play({ type: "resolve-effect", optionId: "done" });
    game.play({ type: "resolve-effect", optionId: "done" });

    expect(leaderEffectsNegated(game.state, "p2")).toBe(false);
    expect(
      game.state.players.p2.board[0]?.cannotAttackUntilTurn,
    ).toBeUndefined();
  });

  it("is not offered at all on a turn it was not played, or under the wrong Leader", () => {
    const later = piloting("op09-093-stale")
      .withBoard("p1", [character("teach", "OP09-093", { playedTurn: 1 })])
      .withBoard("p2", [character("threat", "OP16-104")])
      .build();

    expect(
      later.legalActions().some((action) => action.type === "activate-main"),
    ).toBe(false);

    // Played this turn, but behind a Leader with no {Blackbeard Pirates} type:
    // the gate is one condition, so half of it failing offers nothing rather
    // than spending the once-per-turn on an empty activation.
    const wrongLeader = scenario()
      .decks(
        "(Red) Monkey.D.Luffy - Starter Deck 31",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("op09-093-wrong-leader")
      .atTurn(11, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("teach", "OP09-093")])
      .withBoard("p2", [character("threat", "OP16-104")])
      .build();

    wrongLeader.play({ type: "play-card", cardNumber: "OP09-093" });
    expect(
      wrongLeader
        .legalActions()
        .some((action) => action.type === "activate-main"),
    ).toBe(false);
  });
});

describe("OP09-096 My Era...Begins!!", () => {
  covers("OP09-096", "[Main]", "[Trigger]");

  it("digs 3 for a Blackbeard Pirates card and trashes the rest", () => {
    const game = piloting("op09-096-main")
      .withHand("p1", [instance("era", "OP09-096")])
      .withDeckTop("p1", [
        instance("blank", "ST31-002"),
        instance("found", "OP16-110"),
        instance("other-copy", "OP09-096"),
        instance("untouched", "ST31-003"),
      ])
      .build();

    game.play({ summary: "Activate My Era...Begins!!" });

    // "[printed text omitted -- pnpm card:text ST31-003]": the Event has the type itself, so
    // without the printed exclusion the deck's own copies would be legal finds.
    expect(effectOptions(game.state)).toEqual(["found", "done"]);
    game.play({ type: "resolve-effect", optionId: "found" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "found",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "era",
      "blank",
      "other-copy",
    ]);
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("untouched");
  });

  it("trashes all three when nothing is taken", () => {
    const game = piloting("op09-096-decline")
      .withHand("p1", [instance("era", "OP09-096")])
      .withDeckTop("p1", copies(3, "ST31-002", "blank"))
      .build();

    game.play({ summary: "Activate My Era...Begins!!" });

    // No {Blackbeard Pirates} card among the three, so there is nothing to
    // offer: the search resolves straight to trashing all of them.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toEqual([]);
    expect(game.state.players.p1.trash).toHaveLength(4);
  });

  it("runs the same search off its own Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op09-096-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-era", "OP09-096")])
      .withDeckTop("p2", [
        instance("found", "OP16-109"),
        instance("blank-a", "ST31-002"),
        instance("blank-b", "ST31-003"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    expect(game.state.phase).toBe("trigger");

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "found" });

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "found",
    );
  });
});

describe("OP09-099 Fullalead", () => {
  covers("OP09-099", "[Activate: Main]");

  it("trashes a card and rests itself to dig 3, bottoming the rest", () => {
    const game = piloting("op09-099-search")
      .withStage("p1", instance("fullalead", "OP09-099"))
      .withHand("p1", [instance("fuel", "ST31-002")])
      .withDeckTop("p1", [
        instance("blank", "ST31-003"),
        instance("found", "OP16-108"),
        instance("other", "ST31-004"),
      ])
      .build();

    const deckSize = game.state.players.p1.deck.length;
    game.play({ type: "activate-main", sourceCardNumber: "OP09-099" });
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "found" });

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "found",
    ]);
    expect(game.state.players.p1.stage?.rested).toBe(true);
    // "[printed text omitted -- pnpm card:text OP09-099]" -- the two
    // leftovers are still in the deck, so it is one card shorter, not three.
    expect(game.state.players.p1.deck).toHaveLength(deckSize - 1);
    expect(
      game.state.players.p1.deck.slice(-2).map((card) => card.instanceId),
    ).toEqual(["blank", "other"]);
  });

  it("offers nothing once rested, or with an empty hand", () => {
    const rested = piloting("op09-099-rested")
      .withStage("p1", character("fullalead", "OP09-099", { rested: true }))
      .withHand("p1", [instance("fuel", "ST31-002")])
      .build();

    expect(
      rested.legalActions().some((action) => action.type === "activate-main"),
    ).toBe(false);

    const empty = piloting("op09-099-empty")
      .withStage("p1", instance("fullalead", "OP09-099"))
      .build();

    expect(
      empty.legalActions().some((action) => action.type === "activate-main"),
    ).toBe(false);
  });
});

describe("EB04-059 Black Rope Dragon Twister", () => {
  covers("EB04-059", "[Main]", "[Trigger]");

  it("turns a Life card face-up to K.O. two Characters when behind on board", () => {
    const game = piloting("eb04-059-main")
      .withHand("p1", [instance("twister", "EB04-059")])
      .withLife("p1", [
        instance("top-life", "ST31-003"),
        instance("under", "ST31-004"),
      ])
      .withBoard("p2", [
        character("six", "OP16-108"),
        character("five", "EB04-058"),
        character("safe", "OP16-003"),
      ])
      .build();

    game.play({ summary: "Activate Black Rope Dragon Twister" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "top-life" });

    // Face-up, not spent: the card is still Life, it is just public now.
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.life[0]).toMatchObject({
      instanceId: "top-life",
      faceUp: true,
    });

    // The 6-cost Shiryu is inside the first ceiling and the 10-cost body is
    // inside neither.
    expect(effectOptions(game.state)).toEqual(["six", "five", "done"]);
    game.play({ type: "resolve-effect", optionId: "six" });
    expect(effectOptions(game.state)).toEqual(["five", "done"]);
    game.play({ type: "resolve-effect", optionId: "five" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "safe",
    ]);
  });

  it("pays the Life card and gets nothing while ahead on Characters", () => {
    const game = piloting("eb04-059-ahead")
      .withHand("p1", [instance("twister", "EB04-059")])
      .withLife("p1", [instance("top-life", "ST31-003")])
      .withBoard("p1", [
        character("mine-a", "ST31-002", { playedTurn: 1 }),
        character("mine-b", "ST31-003", { playedTurn: 1 }),
      ])
      .withBoard("p2", [character("theirs", "OP16-108")])
      .build();

    game.play({ summary: "Activate Black Rope Dragon Twister" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "top-life" });

    // The board check is printed after the cost, so paying it while ahead is a
    // legal line that buys nothing -- and the Life card is face-up regardless.
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "theirs",
    ]);
  });

  it("declines the cost and leaves the board alone", () => {
    const game = piloting("eb04-059-decline")
      .withHand("p1", [instance("twister", "EB04-059")])
      .withLife("p1", [instance("top-life", "ST31-003")])
      .withBoard("p2", [character("theirs", "OP16-108")])
      .build();

    game.play({ summary: "Activate Black Rope Dragon Twister" });
    game.play({
      summary: "Don't apply Black Rope Dragon Twister [EB04-059]'s effect",
    });

    expect(game.state.players.p1.life[0]?.faceUp).toBeUndefined();
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("draws 2 and trashes 1 off its Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("eb04-059-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-twister", "EB04-059")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    expect(game.state.phase).toBe("trigger");
    const beforeTrigger = game.state.players.p2.hand.length;

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    expect(game.state.players.p2.hand).toHaveLength(beforeTrigger + 2);

    const discard = game.state.players.p2.hand[0]!;
    game.play({ type: "resolve-effect", optionId: discard.instanceId });

    expect(game.state.players.p2.hand).toHaveLength(beforeTrigger + 1);
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain(discard.instanceId);
  });
});

describe("OP16-080 Marshall.D.Teach's Trigger fuel", () => {
  // The clause being driven is the Leader's redirect, whose printed cost names
  // a card with a [Trigger]. The Leader prints no [Trigger] of its own -- it
  // only mentions one -- which is what `printedClausesOf` now reports.
  covers("OP16-080", "[On Your Opponent's Attack]");

  it("only a card that prints a [Trigger] may pay for the redirect", () => {
    const game = defending("op16-080-trigger-fuel")
      .withHand("p2", [
        instance("has-trigger", "OP16-110"),
        instance("no-trigger", "OP09-086"),
      ])
      .withBoard("p2", [character("spare", "OP16-109", { rested: true })])
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "spare",
    });
    game.play({ type: "resolve-effect", optionId: "apply" });

    // OP09-086 Jesus Burgess prints no Trigger at all, so it is not fuel.
    expect(effectOptions(game.state)).not.toContain("no-trigger");
    game.play({ type: "resolve-effect", optionId: "has-trigger" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("p2-leader");
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("has-trigger");
  });

  it("is not offered at all with no Trigger card in hand", () => {
    // A hand-size floor was the wrong gate for a cost that names a card: the
    // redirect was offered to a hand that could not pay it, and taking it spent
    // the `[Once Per Turn]` on a `choose` with no candidate.
    const game = defending("op16-080-no-trigger-fuel")
      .withHand("p2", [instance("no-trigger", "OP09-086")])
      .withBoard("p2", [character("spare", "OP16-109", { rested: true })])
      .withBoard("p1", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "spare",
    });

    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

describe("OP16-103 Van Augur", () => {
  covers("OP16-103", "[Opponent's Turn]", "[On K.O.]", "[Trigger]");

  it("draws and shrinks a target when it dies on the opponent's turn", () => {
    const game = defending("op16-103-on-ko")
      .withDeckTop("p2", copies(3, "ST32-005", "their-deck"))
      .withBoard("p2", [character("augur", "OP16-103", { rested: true })])
      .withBoard("p1", [character("killer", "OP16-003", { playedTurn: 1 })])
      .build();

    const handSize = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "augur",
    });
    declineDefence(game);

    game.play({ type: "resolve-effect", optionId: "killer" });

    expect(game.state.players.p2.hand).toHaveLength(handSize + 1);
    expect(currentPower(game.state, "p1", "killer")).toBe(10_000 - 3000);
  });

  it("does nothing when it dies on its controller's own turn", () => {
    const game = piloting("op16-103-own-turn")
      .withDeckTop("p1", copies(3, "ST32-005", "my-deck"))
      .withBoard("p1", [character("augur", "OP16-103", { playedTurn: 1 })])
      .withBoard("p2", [character("wall", "OP16-003", { rested: true })])
      .build();

    const handSize = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "augur",
      targetInstanceId: "wall",
    });
    declineDefence(game);

    // Augur loses the battle, but "[Opponent's Turn]" is not satisfied, so
    // nothing is drawn and no prompt is opened.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "augur",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(handSize);
    expect(game.state.pendingEffect).toBeNull();
  });

  it("activates the same [On K.O.] off its Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op16-103-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-augur", "OP16-103")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    const beforeTrigger = game.state.players.p2.hand.length;

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "attacker" });

    expect(game.state.players.p2.hand).toHaveLength(beforeTrigger + 1);
    // OP11-003 Usopp is a 6000 body, so -3000 leaves 3000.
    expect(currentPower(game.state, "p1", "attacker")).toBe(3000);
  });
});

describe("OP16-106 Sanjuan.Wolf", () => {
  covers("OP16-106", "[On K.O.]", "[Trigger]");

  it("draws and rewrites a base power to 7000 when it dies", () => {
    const game = defending("op16-106-on-ko")
      .withDeckTop("p2", copies(3, "ST32-005", "their-deck"))
      .withBoard("p2", [
        character("wolf", "OP16-106", { rested: true }),
        character("small", "OP16-110"),
      ])
      .withBoard("p1", [character("killer", "OP16-003", { playedTurn: 1 })])
      .build();

    const handSize = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "wolf",
    });
    declineDefence(game);

    game.play({ type: "resolve-effect", optionId: "small" });

    expect(game.state.players.p2.hand).toHaveLength(handSize + 1);
    // "base power becomes 7000" is a rewrite, not a bonus: the 2000 body is a
    // 7000 body, and nothing added 5000 to it.
    expect(currentPower(game.state, "p2", "small")).toBe(7000);
  });

  it("activates the same [On K.O.] off its Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op16-106-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-wolf", "OP16-106")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(7000);
  });
});

describe("OP16-108 Shiryu", () => {
  covers("OP16-108", "[On Play]", "[Trigger]");

  it("trashes a card to stack a Blackbeard Pirates body on Life face-up", () => {
    const game = piloting("op16-108-on-play")
      .withHand("p1", [
        instance("shiryu", "OP16-108"),
        instance("fuel", "ST31-002"),
      ])
      .withTrash("p1", [
        instance("recoverable", "OP16-104"),
        instance("too-big", "OP09-093"),
      ])
      .withLife("p1", [instance("under", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP16-108" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fuel" });

    // The 10-cost Teach is out of the printed cost 6 ceiling.
    expect(effectOptions(game.state)).toEqual(["recoverable", "done"]);
    game.play({ type: "resolve-effect", optionId: "recoverable" });

    expect(game.state.players.p1.life[0]).toMatchObject({
      instanceId: "recoverable",
      faceUp: true,
    });
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fuel");
  });

  it("draws 2 off its Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op16-108-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [character("attacker", "OP11-003", { playedTurn: 1 })])
      .withLife("p2", [instance("life-shiryu", "OP16-108")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    const beforeTrigger = game.state.players.p2.hand.length;

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    expect(game.state.players.p2.hand).toHaveLength(beforeTrigger + 2);
  });
});

describe("OP16-109 Doc Q", () => {
  covers("OP16-109", "[On K.O.]", "[Trigger]");

  it("draws and sweeps up to two 1-cost Characters when it dies", () => {
    const game = defending("op16-109-on-ko")
      .withDeckTop("p2", copies(3, "ST32-005", "their-deck"))
      .withBoard("p2", [character("docq", "OP16-109", { rested: true })])
      .withBoard("p1", [
        character("killer", "OP16-003", { playedTurn: 1 }),
        character("chaff-a", "ST32-005"),
        character("chaff-b", "ST32-001"),
      ])
      .build();

    const handSize = game.state.players.p2.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "docq",
    });
    declineDefence(game);

    game.play({ type: "resolve-effect", optionId: "chaff-a" });
    game.play({ type: "resolve-effect", optionId: "chaff-b" });

    expect(game.state.players.p2.hand).toHaveLength(handSize + 1);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "killer",
    ]);
  });

  it("activates the same [On K.O.] off its Trigger", () => {
    const game = scenario()
      .decks("(Red) Monkey.D.Luffy - Starter Deck 31", DECK)
      .seed("op16-109-trigger")
      .atTurn(3, { active: "p1" })
      .withBoard("p1", [
        character("attacker", "OP11-003", { playedTurn: 1 }),
        character("chaff", "ST32-005"),
      ])
      .withLife("p2", [instance("life-docq", "OP16-109")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    // The attacker is out of the cost range, so choosing the chaff leaves
    // nothing else to choose and the K.O. resolves on the spot.
    game.play({ type: "resolve-effect", optionId: "chaff" });

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});
