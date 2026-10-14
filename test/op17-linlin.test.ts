import { describe, expect, it } from "vitest";
import { currentPower } from "@one-piece-sim/engine-core";

import { character, covers, instance, scenario } from "./support/index.js";

/**
 * OP-17 Yellow Charlotte Linlin: the {Big Mom Pirates} feature deck in
 * `packages/decks/src/op17-linlin-manifest.ts`.
 *
 * Most of the fifty was already driven by `test/op17.test.ts`, which covers
 * the set card by card. What lives here is the five identities the list
 * brought into the coverage gate with it -- the Leader, Katakuri, Cracker,
 * Mont-d'or and the Event -- and each is posed on the decision the deck
 * actually makes with it rather than on the clause read straight off.
 */

const DECK = "(Yellow) Charlotte Linlin - Official Feature Deck";
const ST31 = "(Red) Monkey.D.Luffy - Starter Deck 31";

/** The Linlin seat on its own turn, with every DON!! it needs active. */
const linlin = (seed: string, turn = 9) =>
  scenario().decks(DECK, ST31).seed(seed).atTurn(turn, { active: "p1" });

/** The Linlin seat defending, which is where its [Trigger] half lives. */
const defending = (seed: string, turn = 8) =>
  scenario().decks(DECK, ST31).seed(seed).atTurn(turn, { active: "p2" });

/** Walk a battle past the Block and Counter steps, which are not under test. */
const declineDefence = (game: {
  state: { phase: string };
  pass: () => unknown;
}) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

describe("OP17-099 Charlotte Linlin, the Leader", () => {
  covers("OP17-099", "[When Attacking]");

  it("banks a Life card when the opponent would rather not lose one of theirs", () => {
    const game = linlin("op17-099-heal")
      .withHand("p1", [
        instance("paid", "OP17-113"),
        instance("milled", "OP17-107"),
      ])
      .withHand("p2", [instance("kept", "ST31-002")])
      .withDeckTop("p1", [instance("banked", "OP17-102")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "paid" });
    // The opponent is the one who picks the branch, so this decision is theirs.
    expect(game.state.pendingEffect?.playerId).toBe("p2");
    game.play({
      type: "resolve-effect",
      summary: "Trash 1 card from your hand, then add a card",
    });
    game.play({ type: "resolve-effect", optionId: "milled" });
    game.play({ type: "resolve-effect", optionId: "banked" });

    // Two cards out of the attacker's hand -- the cost and the mill -- for one
    // Life card off the top of its own deck.
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.life.length).toBe(lifeBefore + 1);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("banked");
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "kept",
    ]);
  });

  it("takes a card out of the opponent's hand on the other branch", () => {
    const game = linlin("op17-099-discard")
      .withHand("p1", [instance("paid", "OP17-113")])
      .withHand("p2", [instance("taken", "ST31-002")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "paid" });
    game.play({
      type: "resolve-effect",
      summary: "Trash 1 card at random from your opponent's hand",
    });

    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("taken");
    expect(game.state.players.p1.life.length).toBe(lifeBefore);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("paid");
  });

  /**
   * Bandai's OP-17 Q&A: the card is picked at random, without looking. The
   * engine RNG picks it, so no one is asked, and the same seed and actions
   * take the same card on every replay.
   */
  function discardAtRandom(seed: string) {
    const game = linlin(seed)
      .withHand("p1", [instance("paid", "OP17-113")])
      .withHand("p2", [
        instance("a", "ST31-002"),
        instance("b", "ST31-003"),
        instance("c", "ST31-004"),
        instance("d", "ST31-005"),
      ])
      .build();
    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "paid" });
    game.play({ type: "resolve-effect", optionId: "opponent-discards" });
    return game;
  }

  it("picks the opponent's card at random off the engine RNG, asking no one", () => {
    const game = discardAtRandom("op17-099-random");
    const trashed = game.state.players.p2.trash.at(-1)?.instanceId;

    expect(["a", "b", "c", "d"]).toContain(trashed);
    expect(game.state.players.p2.hand).toHaveLength(3);
    // Neither seat has a card choice left from the Leader: the pick was the
    // RNG's, which is what "without looking" leaves to a simulator.
    for (const seat of ["p1", "p2"] as const) {
      expect(
        game
          .legalActions(seat)
          .some(
            (action) =>
              action.type === "resolve-effect" &&
              action.sourceCardNumber === "OP17-099",
          ),
      ).toBe(false);
    }

    // Deterministic: the same seed and actions trash the same card.
    expect(
      discardAtRandom("op17-099-random").state.players.p2.trash.at(-1)
        ?.instanceId,
    ).toBe(trashed);
  });

  it("does not always take the same position out of the hand", () => {
    const taken = new Set(
      Array.from(
        { length: 8 },
        (_, index) =>
          discardAtRandom(`op17-099-spread-${index}`).state.players.p2.trash.at(
            -1,
          )?.instanceId,
      ),
    );
    expect(taken.size).toBeGreaterThan(1);
  });

  it("is not offered with nothing in hand to pay with", () => {
    const game = linlin("op17-099-empty").withHand("p1", []).build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP17-103 Charlotte Katakuri", () => {
  covers("OP17-103", "[On Play]", "[Your Turn]", "[Trigger]");

  it("banks a Life card and shrinks a Character by 3000", () => {
    const game = linlin("op17-103-on-play")
      .withHand("p1", [instance("katakuri", "OP17-103")])
      .withBoard("p2", [character("victim", "ST31-002")])
      .withDeckTop("p1", [instance("banked", "OP17-107")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "OP17-103" });
    game.play({ type: "resolve-effect", optionId: "banked" });
    game.play({ type: "resolve-effect", optionId: "victim" });

    expect(game.state.players.p1.life.length).toBe(lifeBefore + 1);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("banked");
    // ST31-002 Jinbe is a printed 6000.
    expect(currentPower(game.state, "p2", "victim")).toBe(3000);
  });

  it("plays itself off a Life Trigger, and then does nothing on the opponent's turn", () => {
    const game = defending("op17-103-trigger")
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p1", [instance("life-katakuri", "OP17-103")])
      .withDeckTop("p1", [instance("unbanked", "OP17-107")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    // The body arrives; its [On Play] is gated [Your Turn] and this is not one,
    // so the Life card stays on the deck and nothing is debuffed.
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("life-katakuri");
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("unbanked");
    expect(game.state.players.p1.life).toHaveLength(0);
  });
});

describe("OP17-104 Charlotte Cracker", () => {
  covers("OP17-104", "[On Play]", "[Your Turn]", "[Trigger]");

  it("rests 2 DON!! to bank a Life card under a Big Mom Pirates Leader", () => {
    const game = linlin("op17-104-on-play")
      .withHand("p1", [instance("cracker", "OP17-104")])
      .withDeckTop("p1", [instance("banked", "OP17-107")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "OP17-104" });
    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "banked" });

    expect(game.state.players.p1.life.length).toBe(lifeBefore + 1);
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 2);
  });

  it("keeps its DON!! when the bank is declined", () => {
    const game = linlin("op17-104-decline")
      .withHand("p1", [instance("cracker", "OP17-104")])
      .withDeckTop("p1", [instance("kept", "OP17-107")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-104" });
    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.players.p1.deck[0]?.instanceId).toBe("kept");
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore);
  });

  it("plays itself off a Life Trigger without offering the cost on the opponent's turn", () => {
    const game = defending("op17-104-trigger")
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p1", [instance("life-cracker", "OP17-104")])
      .withDeckTop("p1", [instance("unbanked", "OP17-107")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("life-cracker");
    // [Your Turn] is the whole condition, so the DON!! cost is never offered.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("unbanked");
  });
});

describe("OP17-111 Charlotte Mont-d'or", () => {
  covers("OP17-111", "[On Play]", "[Trigger]");

  it("reveals two Trigger cards to K.O. two 1-cost Characters", () => {
    const game = linlin("op17-111-on-play")
      .withHand("p1", [
        instance("montdor", "OP17-111"),
        instance("reveal-1", "OP17-107"),
        instance("reveal-2", "OP17-102"),
      ])
      .withBoard("p2", [
        character("cheap-1", "OP01-016"),
        character("cheap-2", "ST23-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-111" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "reveal-1" });
    game.play({ type: "resolve-effect", optionId: "reveal-2" });
    game.play({ type: "resolve-effect", optionId: "cheap-1" });
    game.play({ type: "resolve-effect", optionId: "cheap-2" });

    expect(game.state.players.p2.board).toHaveLength(0);
    // Revealed, not spent: both cards are still in hand afterwards.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["reveal-1", "reveal-2"]),
    );
  });

  it("K.O.s nothing with only one Trigger card in hand", () => {
    const game = linlin("op17-111-short")
      .withHand("p1", [
        instance("montdor", "OP17-111"),
        instance("reveal-1", "OP17-107"),
        instance("no-trigger", "OP17-113"),
      ])
      .withBoard("p2", [character("cheap-1", "OP01-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-111" });
    // The offer is still made -- the reveal is a choice inside it -- but two
    // qualifying cards do not exist, so the K.O. is never reached.
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("plays itself off a Life Trigger", () => {
    const game = defending("op17-111-trigger")
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withLife("p1", [instance("life-montdor", "OP17-111")])
      .withHand("p1", [])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("life-montdor");
  });
});

describe("OP17-115, the deck's Event", () => {
  covers("OP17-115", "[Main]", "[Counter]");

  it("makes the Leader unblockable for the turn", () => {
    const game = linlin("op17-115-main")
      .withHand("p1", [instance("honour", "OP17-115")])
      .withBoard("p2", [character("blocker", "ST31-002", { playedTurn: 1 })])
      .build();

    game.play({ type: "activate-main", cardNumber: "OP17-115" });
    game.play({ type: "attack", targetInstanceId: "p2-leader" });

    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
  });

  it("gives the Leader +4000 in the Counter phase", () => {
    const game = defending("op17-115-counter")
      .withBoard("p2", [character("attacker", "ST31-002", { playedTurn: 1 })])
      .withHand("p1", [instance("honour", "OP17-115")])
      .withBoard("p1", [character("bystander", "OP17-113", { playedTurn: 1 })])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (game.state.phase === "block") game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP17-115" });

    // Named: the Leader is a [Charlotte Linlin], and the Streusen standing
    // beside it is not, so the whole 4000 lands on the card being attacked.
    expect(game.state.activeAttack?.counterPower).toBe(4_000);
  });
});
