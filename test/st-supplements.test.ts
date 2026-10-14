import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
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
 * The seven five-card supplements -- ST-15, ST-16, ST-17, ST-19, ST-20, ST-24
 * and ST-27 -- as whole-product imports.
 *
 * One file, because they are one shape: a five-card box that extends a deck
 * already in the pool. For ST-16, ST-24 and ST-27 most of each product was
 * already programmed with the list that plays it, and what was left was two or
 * three cards each; the four added later were in the pool as nothing but a
 * block icon, so all twenty of their clauses are here.
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter -- the documented
 * shape for a card outside a manifest, and why nothing here asserts on a win
 * rate.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" });

const defending = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" });

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

function settle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
}

const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

const boardCard = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
  );

describe("ST16-001 Uta", () => {
  covers("ST16-001", "[Blocker]", "[Activate: Main]");

  it("blocks", () => {
    const game = defending("st16-001-block")
      .withBoard("p1", [character("uta", "ST16-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "uta",
        ),
    ).toBe(true);
  });

  it("trades a {FILM} card for a rested DON!! on the Leader", () => {
    const game = table("st16-001-gift")
      .withBoard("p1", [character("uta", "ST16-001")])
      .withHand("p1", [instance("film", "ST16-002")])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", cardNumber: "ST16-001" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "film" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("is not offered with no {FILM} card to spend", () => {
    const game = table("st16-001-no-film")
      .withBoard("p1", [character("uta", "ST16-001")])
      .withHand("p1", [instance("plain", "FIX-001")])
      .withDon("p1", { rested: 2 })
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST16-001",
        ),
    ).toBe(false);
  });
});

describe("ST16-002 Gordon", () => {
  covers("ST16-002", "[Blocker]", "[On Your Opponent's Attack]");

  it("blocks", () => {
    const game = defending("st16-002-block")
      .withBoard("p1", [character("gordon", "ST16-002")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "gordon",
        ),
    ).toBe(true);
  });

  it("pays 1000 per {Music} card trashed, for the battle", () => {
    const game = defending("st16-002-fuel")
      .withBoard("p1", [character("gordon", "ST16-002")])
      .withHand("p1", [
        instance("music1", "EB02-008"),
        instance("music2", "EB02-008"),
      ])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "music1" });
    game.play({ type: "resolve-effect", optionId: "music2" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
  });

  it("is not offered with no {Music} card in hand", () => {
    const game = defending("st16-002-no-fuel")
      .withBoard("p1", [character("gordon", "ST16-002")])
      .withHand("p1", [instance("plain", "FIX-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(effectOptions(game.state)).not.toContain("apply");
  });
});

describe("ST16-003 Charlotte Katakuri", () => {
  covers("ST16-003", "static");

  it("gains 2000 behind a {FILM} Leader on a spent board", () => {
    // Six rested cards counts the cost area too, which is what makes the
    // threshold reachable: no board of Characters gets to six on its own.
    const game = table("st16-003-on")
      .withLeader("p1", "ST16-004")
      .withBoard("p1", [character("kata", "ST16-003")])
      .withDon("p1", { rested: 6 })
      .build();

    expect(currentPower(game.state, "p1", "kata")).toBe(6_000);
  });

  it("gains nothing on a board that has not spent its turn", () => {
    const game = table("st16-003-off")
      .withLeader("p1", "ST16-004")
      .withBoard("p1", [character("kata", "ST16-003")])
      .build();

    expect(currentPower(game.state, "p1", "kata")).toBe(4_000);
  });

  it("gains nothing behind a Leader without the type", () => {
    const game = table("st16-003-wrong-leader")
      .withBoard("p1", [character("kata", "ST16-003")])
      .withDon("p1", { rested: 6 })
      .build();

    expect(currentPower(game.state, "p1", "kata")).toBe(4_000);
  });
});

describe("ST16-005 Monkey.D.Luffy", () => {
  covers("ST16-005", "static");

  it("gains 1000 while its controller has a rested [Uta]", () => {
    const game = table("st16-005-on")
      .withBoard("p1", [
        character("luffy", "ST16-005"),
        { ...character("uta", "ST16-001"), rested: true },
      ])
      .build();

    expect(currentPower(game.state, "p1", "luffy")).toBe(4_000);
  });

  it("gains nothing while the Uta is still active", () => {
    const game = table("st16-005-off")
      .withBoard("p1", [
        character("luffy", "ST16-005"),
        character("uta", "ST16-001"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "luffy")).toBe(3_000);
  });
});

describe('ST24-001 Capone"Gang"Bege', () => {
  covers("ST24-001", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = defending("st24-001-block")
      .withBoard("p1", [character("bege", "ST24-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "bege",
        ),
    ).toBe(true);
  });

  it("cycles a card off a board of six rested cards", () => {
    const game = table("st24-001-cycle")
      .withHand("p1", [instance("bege", "ST24-001")])
      .withDon("p1", { rested: 6 })
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "ST24-001" });
    settle(game);

    // One drawn and one trashed, and the Bege itself has left the hand.
    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
    expect(game.state.players.p1.trash.length).toBeGreaterThan(0);
  });

  it("cycles nothing off an untouched board", () => {
    const game = table("st24-001-no-gate")
      .withHand("p1", [instance("bege", "ST24-001")])
      .build();

    const trashBefore = game.state.players.p1.trash.length;
    game.play({ type: "play-card", cardNumber: "ST24-001" });
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(trashBefore);
  });
});

describe("ST24-002 Kid & Killer", () => {
  covers("ST24-002", "[On Play]", "[On Your Opponent's Attack]");

  it("digs five deep for a {Supernovas} card", () => {
    const game = table("st24-002-dig")
      .withHand("p1", [instance("kk", "ST24-002")])
      .withDeckTop("p1", [instance("prize", "ST24-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST24-002" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "ST24-003",
    );
  });

  it("trashes itself mid-battle to set a DON!! active", () => {
    const game = defending("st24-002-refund")
      .withBoard("p1", [character("kk", "ST24-002")])
      .withDon("p1", { rested: 2 })
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "attack", targetInstanceId: "p1-leader" });
    applyOptional(game);
    settle(game);

    expect(boardCard(game, "p1", "kk")).toBeUndefined();
    expect(game.state.players.p1.activeDon).toHaveLength(activeBefore + 1);
  });
});

describe("ST24-003 Basil Hawkins", () => {
  covers("ST24-003", "[End of Your Turn]");

  it("sets a DON!! active as the turn closes", () => {
    const game = table("st24-003-refund")
      .withBoard("p1", [character("hawkins", "ST24-003")])
      .withDon("p1", { rested: 3 })
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.pass();
    settle(game);

    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore - 1);
  });
});

describe("ST27-001 Avalo Pizarro", () => {
  covers("ST27-001", "[Activate: Main]", "[On K.O.]");

  it("rests the deck's Stage for +4000 behind the right Leader", () => {
    const game = table("st27-001-buff")
      .withLeader("p1", "OP09-093")
      .withBoard("p1", [character("pizarro", "ST27-001")])
      .withStage("p1", instance("fullalead", "OP09-099"))
      .build();

    game.play({ type: "activate-main", cardNumber: "ST27-001" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fullalead" });
    settle(game);

    expect(currentPower(game.state, "p1", "pizarro")).toBe(5_000);
    expect(game.state.players.p1.stage?.rested).toBe(true);
  });

  it("is not offered with no Stage to rest", () => {
    const game = table("st27-001-no-stage")
      .withLeader("p1", "OP09-093")
      .withBoard("p1", [character("pizarro", "ST27-001")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST27-001",
        ),
    ).toBe(false);
  });

  it("draws when it dies", () => {
    const game = table("st27-001-on-ko")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("pizarro", "ST27-001")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "pizarro" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
  });
});

describe("ST27-002 Catarina Devon", () => {
  covers("ST27-002", "[Activate: Main]", "[On K.O.]");

  it("trashes itself to take 1 cost off an opposing body", () => {
    const game = table("st27-002-debuff")
      .withLeader("p1", "OP09-093")
      .withBoard("p1", [character("devon", "ST27-002")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST27-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(boardCard(game, "p1", "devon")).toBeUndefined();
    expect(
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find(
          (card) => card.instanceId === "victim",
        )!,
      ),
    ).toBe(1);
  });

  it("draws nothing off its own self-trash", () => {
    // The printed word is trash, not K.O., so this card's own [On K.O.] draw
    // does not fire when it pays with itself.
    const game = table("st27-002-no-draw")
      .withLeader("p1", "OP09-093")
      .withBoard("p1", [character("devon", "ST27-002")])
      .withBoard("p2", [character("victim", "FIX-002")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST27-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("draws when the opponent K.O.s it", () => {
    const game = table("st27-002-on-ko")
      .withHand("p1", [instance("gatling", "ST10-016")])
      .withBoard("p2", [character("devon", "ST27-002")])
      .build();

    const handBefore = game.state.players.p2.hand.length;
    game.play({ type: "activate-main", cardNumber: "ST10-016" });
    game.play({ type: "resolve-effect", optionId: "devon" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(handBefore + 1);
  });
});

describe("ST27-004 Sanjuan.Wolf", () => {
  covers("ST27-004", "[On Play]", "static");

  it("costs a card from hand to arrive", () => {
    const game = table("st27-004-discard")
      .withLeader("p1", "OP09-093")
      .withHand("p1", [
        instance("wolf", "ST27-004"),
        instance("spare", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST27-004" });
    game.play({ type: "resolve-effect", optionId: "spare" });
    settle(game);

    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("FIX-001");
  });

  it("blocks and climbs a cost for every four cards in the trash", () => {
    const game = table("st27-004-static")
      .withLeader("p1", "OP09-093")
      .withBoard("p1", [character("wolf", "ST27-004")])
      .withTrash(
        "p1",
        Array.from({ length: 9 }, (_, index) =>
          instance(`milled-${index}`, "FIX-001"),
        ),
      )
      .build();

    // Nine cards is two whole steps of four, so +2 on a printed 4.
    expect(
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find((card) => card.instanceId === "wolf")!,
      ),
    ).toBe(6);

    const defence = defending("st27-004-block")
      .withLeader("p1", "OP09-093")
      .withBoard("p1", [character("wolf", "ST27-004")])
      .build();
    defence.play({ type: "attack", targetInstanceId: "p1-leader" });
    expect(
      defence
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "wolf",
        ),
    ).toBe(true);
  });

  it("neither blocks nor climbs behind another Leader", () => {
    const game = defending("st27-004-wrong-leader")
      .withBoard("p1", [character("wolf", "ST27-004")])
      .withTrash(
        "p1",
        Array.from({ length: 9 }, (_, index) =>
          instance(`milled-${index}`, "FIX-001"),
        ),
      )
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find((card) => card.instanceId === "wolf")!,
      ),
    ).toBe(4);
    expect(
      game.legalActions("p1").some((action) => action.type === "block"),
    ).toBe(false);
  });
});

const declineDefence = (game: Game) => {
  while (game.state.phase === "block" || game.state.phase === "counter") {
    game.pass();
  }
};

const boardNumbers = (game: Game, player: "p1" | "p2") =>
  game.state.players[player].board.map((card) => card.cardNumber);

/**
 * Takes the default answer to each pending decision until `optionId` is on
 * offer, then picks it.
 *
 * A clause that places cards back in a chosen order asks one question per card
 * before it reaches the step under test, and none of those answers matter to
 * what is being asserted.
 */
const resolveUntil = (game: Game, optionId: string) => {
  while (
    game.state.pendingEffect &&
    !effectOptions(game.state).includes(optionId)
  ) {
    game.play({ type: "resolve-effect" });
  }
  game.play({ type: "resolve-effect", optionId });
};

describe("ST15-001 Atmos", () => {
  covers("ST15-001", "[When Attacking]");

  it("shuts its own deck's Life-to-hand clauses off for the turn", () => {
    const game = table("st15-001-lock")
      .withLeader("p1", "OP17-001")
      .withBoard("p1", [character("atmos", "ST15-001")])
      .withHand("p1", [instance("thatch", "ST15-004")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "attack", attackerInstanceId: "atmos" });
    declineDefence(game);
    settle(game);

    // Thatch's own "then add 1 card from the top of your Life cards to your
    // hand" is the clause the price is aimed at, and it no longer resolves.
    game.play({ type: "play-card", cardNumber: "ST15-004" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
  });

  it("costs nothing behind a Whitebeard Leader of another name", () => {
    // The gate is the Leader's *name*, not its type, which is the difference
    // between this clause and ST15-004's: Marco's deck runs the same Life-to-
    // hand engine and never pays this price.
    const game = table("st15-001-wrong-leader")
      .withLeader("p1", "OP08-002")
      .withBoard("p1", [character("atmos", "ST15-001")])
      .withHand("p1", [instance("thatch", "ST15-004")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "attack", attackerInstanceId: "atmos" });
    declineDefence(game);
    settle(game);
    game.play({ type: "play-card", cardNumber: "ST15-004" });
    settle(game);

    expect(game.state.players.p1.life).toHaveLength(lifeBefore - 1);
  });
});

describe("ST15-002 Edward.Newgate", () => {
  covers("ST15-002", "[On Play]", "[Activate: Main]");

  it("hands a rested DON!! to the Leader on arrival", () => {
    const game = table("st15-002-gift")
      .withHand("p1", [instance("newgate", "ST15-002")])
      .withDon("p1", { rested: 3 })
      .build();

    game.play({ type: "play-card", cardNumber: "ST15-002" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
  });

  it("rests itself to K.O. a 5000-power body", () => {
    const game = table("st15-002-ko")
      .withBoard("p1", [character("newgate", "ST15-002")])
      .withBoard("p2", [character("target", "ST15-001")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST15-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")).toBeUndefined();
  });

  it("cannot reach a body above 5000 current power", () => {
    const game = table("st15-002-too-big")
      .withBoard("p1", [character("newgate", "ST15-002")])
      .withBoard("p2", [character("target", "ST15-005")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST15-002" });
    applyOptional(game);

    expect(effectOptions(game.state)).not.toContain("target");
  });

  it("is not offered once it has rested", () => {
    const game = table("st15-002-spent")
      .withBoard("p1", [{ ...character("newgate", "ST15-002"), rested: true }])
      .withBoard("p2", [character("target", "ST15-001")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST15-002",
        ),
    ).toBe(false);
  });
});

describe("ST15-003 Kingdew", () => {
  covers("ST15-003", "[Blocker]", "[Opponent's Turn]");

  it("blocks", () => {
    const game = defending("st15-003-block")
      .withBoard("p1", [character("kingdew", "ST15-003")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "kingdew",
        ),
    ).toBe(true);
  });

  it("buys the Leader +2000 when an opponent's effect K.O.s it", () => {
    const game = table("st15-003-on-ko")
      .withBoard("p1", [character("newgate", "ST15-002")])
      .withBoard("p2", [character("kingdew", "ST15-003")])
      .build();

    const before = currentPower(game.state, "p2", "p2-leader");
    game.play({ type: "activate-main", cardNumber: "ST15-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "kingdew" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(before + 2_000);
  });
});

describe("ST15-004 Thatch", () => {
  covers("ST15-004", "[On Play]");

  it("shrinks a body and buys a card off the top of Life", () => {
    const game = table("st15-004-play")
      .withLeader("p1", "OP17-001")
      .withHand("p1", [instance("thatch", "ST15-004")])
      .withBoard("p2", [character("target", "ST15-001")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "ST15-004" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
    expect(game.state.players.p1.life).toHaveLength(lifeBefore - 1);
    // One card out of hand to play it, one in off the Life stack.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("does nothing behind a Leader of another type", () => {
    const game = table("st15-004-wrong-leader")
      .withHand("p1", [instance("thatch", "ST15-004")])
      .withBoard("p2", [character("target", "ST15-001")])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "ST15-004" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(5_000);
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
  });
});

describe("ST15-005 Portgas.D.Ace", () => {
  covers("ST15-005", "static");

  it("attacks the turn it lands behind a {Whitebeard Pirates} Leader", () => {
    const game = table("st15-005-rush")
      .withLeader("p1", "OP17-001")
      .withHand("p1", [instance("ace", "ST15-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST15-005" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "ace",
        ),
    ).toBe(true);
  });

  it("cannot attack the turn it lands behind another Leader", () => {
    const game = table("st15-005-no-rush")
      .withHand("p1", [instance("ace", "ST15-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST15-005" });
    settle(game);

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "ace",
        ),
    ).toBe(false);
  });

  it("shrinks by 2000 instead of leaving the field", () => {
    // ST11-003 Backlight K.O.s a rested body at cost 5 or less, which is
    // exactly this one -- and `removal: "off-field"` is the printed "removed
    // from the field", so a bounce would raise the same prompt.
    const game = table("st15-005-save")
      .withLeader("p1", "ST11-001")
      .withHand("p1", [instance("backlight", "ST11-003")])
      .withBoard("p2", [{ ...character("ace", "ST15-005"), rested: true }])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST11-003" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "ace" });
    game.play({ type: "resolve-effect", optionId: "replace:ace" });
    settle(game);

    expect(boardCard(game, "p2", "ace")).toBeDefined();
    expect(currentPower(game.state, "p2", "ace")).toBe(4_000);
  });

  it("dies to a second removal the same turn", () => {
    // The printed `[Once Per Turn]`, and the price compounding is the reason
    // for it: the body that survived is a 4000, so the next answer is cheaper
    // than the first.
    const game = table("st15-005-spent")
      .withLeader("p1", "ST11-001")
      .withHand("p1", [
        instance("backlight", "ST11-003"),
        instance("again", "ST11-003"),
      ])
      .withBoard("p2", [{ ...character("ace", "ST15-005"), rested: true }])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST11-003" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "ace" });
    game.play({ type: "resolve-effect", optionId: "replace:ace" });
    settle(game);

    game.play({ type: "activate-main", cardNumber: "ST11-003" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "ace" });
    settle(game);

    expect(boardCard(game, "p2", "ace")).toBeUndefined();
  });
});

describe("ST17-001 Crocodile", () => {
  covers("ST17-001", "[On Play]");

  it("draws two and buries one on a Warlords hit", () => {
    const game = table("st17-001-hit")
      .withHand("p1", [instance("crocodile", "ST17-001")])
      .withDeckTop("p1", [instance("warlord", "ST17-003")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "ST17-001" });
    game.play({ type: "resolve-effect", optionId: "warlord" });
    settle(game);

    // One card out to play it, two drawn, one back on top of the deck.
    expect(game.state.players.p1.hand).toHaveLength(handBefore);
  });

  it("draws nothing off a miss", () => {
    const game = table("st17-001-miss")
      .withHand("p1", [instance("crocodile", "ST17-001")])
      .withDeckTop("p1", [instance("dud", "FIX-001")])
      .build();

    const handBefore = game.state.players.p1.hand.length;
    game.play({ type: "play-card", cardNumber: "ST17-001" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(handBefore - 1);
  });
});

describe("ST17-002 Trafalgar Law", () => {
  covers("ST17-002", "[On Play]");

  it("returns a body of its own to bounce a 4-cost", () => {
    const game = table("st17-002-bounce")
      .withLeader("p1", "OP14-020")
      .withHand("p1", [instance("law", "ST17-002")])
      .withBoard("p1", [character("fuel", "ST17-003")])
      .withBoard("p2", [character("target", "ST17-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST17-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "fuel")).toBeUndefined();
    expect(boardCard(game, "p2", "target")).toBeUndefined();
  });

  it("pays the cost and gets nothing behind a Leader of another type", () => {
    // The Leader gate sits on the payoff, exactly where the printed "If" does:
    // the Character is returned either way.
    const game = table("st17-002-wrong-leader")
      .withHand("p1", [instance("law", "ST17-002")])
      .withBoard("p1", [character("fuel", "ST17-003")])
      .withBoard("p2", [character("target", "ST17-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST17-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    settle(game);

    expect(boardCard(game, "p1", "fuel")).toBeUndefined();
    expect(boardCard(game, "p2", "target")).toBeDefined();
  });
});

describe("ST17-003 Buggy", () => {
  covers("ST17-003", "[On Play]");

  it("sorts the top three cards without moving any of them out", () => {
    const game = table("st17-003-sort")
      .withHand("p1", [instance("buggy", "ST17-003")])
      .withDeckTop("p1", [
        instance("a", "FIX-001"),
        instance("b", "FIX-001"),
        instance("c", "FIX-001"),
      ])
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    game.play({ type: "play-card", cardNumber: "ST17-003" });
    settle(game);

    expect(game.state.players.p1.deck).toHaveLength(deckBefore);
  });
});

describe("ST17-004 Boa Hancock", () => {
  covers("ST17-004", "[Blocker]", "[On Play]");

  it("blocks", () => {
    const game = defending("st17-004-block")
      .withBoard("p1", [character("hancock", "ST17-004")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "hancock",
        ),
    ).toBe(true);
  });

  it("sorts three cards and hands a rested DON!! to a Warlords body", () => {
    const game = table("st17-004-gift")
      .withHand("p1", [instance("hancock", "ST17-004")])
      .withBoard("p1", [character("warlord", "ST17-001")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "play-card", cardNumber: "ST17-004" });
    resolveUntil(game, "warlord");
    settle(game);

    expect(boardCard(game, "p1", "warlord")?.attachedDon).toHaveLength(1);
  });
});

describe("ST17-005 Marshall.D.Teach", () => {
  covers("ST17-005", "[Activate: Main]");

  it("stacks a card from hand for two rested DON!!", () => {
    const game = table("st17-005-don")
      .withBoard("p1", [character("teach", "ST17-005")])
      .withHand("p1", [instance("fuel", "FIX-001")])
      .withDon("p1", { rested: 4 })
      .build();

    const deckBefore = game.state.players.p1.deck.length;
    game.play({ type: "activate-main", cardNumber: "ST17-005" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
    // The card is stacked, not trashed: it is the next draw.
    expect(game.state.players.p1.deck).toHaveLength(deckBefore + 1);
  });

  it("is not offered with an empty hand", () => {
    const game = table("st17-005-empty")
      .withBoard("p1", [character("teach", "ST17-005")])
      .withHand("p1", [])
      .withDon("p1", { rested: 4 })
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST17-005",
        ),
    ).toBe(false);
  });
});

describe("ST19-001 Smoker", () => {
  covers("ST19-001", "[On Play]");

  it("locks two small bodies out of attacking for a round", () => {
    const game = table("st19-001-lock")
      .withHand("p1", [
        instance("smoker", "ST19-001"),
        instance("fuel", "ST19-005"),
      ])
      .withBoard("p2", [character("a", "ST19-005"), character("b", "ST19-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST19-001" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);
    game.pass();

    expect(
      game
        .legalActions("p2")
        .filter((action) => action.type === "attack")
        .map((action) => action.attackerInstanceId),
    ).toEqual(["p2-leader"]);
  });

  it("is not offered with no black {Navy} card to spend", () => {
    const game = table("st19-001-no-fuel")
      .withHand("p1", [
        instance("smoker", "ST19-001"),
        instance("wrong", "ST15-001"),
      ])
      .withBoard("p2", [character("a", "ST19-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST19-001" });
    settle(game);

    expect(boardCard(game, "p2", "a")).toBeDefined();
    expect(
      game.state.players.p1.hand.some((card) => card.instanceId === "wrong"),
    ).toBe(true);
  });
});

describe("ST19-002 Sengoku", () => {
  covers("ST19-002", "[On Play]");

  it("trades two black {Navy} cards for three off the top", () => {
    const game = table("st19-002-draw")
      .withLeader("p1", "ST19-001")
      .allowPartialState()
      .withHand("p1", [
        instance("sengoku", "ST19-002"),
        instance("fuel1", "ST19-005"),
        instance("fuel2", "ST19-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST19-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel1" });
    game.play({ type: "resolve-effect", optionId: "fuel2" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(3);
  });

  it("is not offered with only one black {Navy} card in hand", () => {
    const game = table("st19-002-short")
      .withHand("p1", [
        instance("sengoku", "ST19-002"),
        instance("fuel1", "ST19-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST19-002" });
    settle(game);

    expect(
      game.state.players.p1.hand.some((card) => card.instanceId === "fuel1"),
    ).toBe(true);
  });
});

describe("ST19-003 Tashigi", () => {
  covers("ST19-003", "[On Play]", "[Activate: Main]");

  it("drops a 4-cost to 0 and trashes it on the same turn", () => {
    const game = table("st19-003-pair")
      .withLeader("p1", "ST19-001")
      .withHand("p1", [instance("tashigi", "ST19-003")])
      .withBoard("p2", [character("target", "ST19-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "ST19-003" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find(
          (card) => card.instanceId === "target",
        )!,
      ),
    ).toBe(0);

    game.play({ type: "activate-main", cardNumber: "ST19-003" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p2", "target")).toBeUndefined();
  });

  it("cannot activate on a later turn", () => {
    const game = table("st19-003-stale")
      .withBoard("p1", [character("tashigi", "ST19-003")])
      .withBoard("p2", [character("target", "FIX-001")])
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST19-003",
        ),
    ).toBe(false);
  });
});

describe("ST19-004 Hina", () => {
  covers("ST19-004", "[Opponent's Turn]", "[Activate: Main]");

  it("buries a card from the trash for a rested DON!!", () => {
    const game = table("st19-004-don")
      .withBoard("p1", [character("hina", "ST19-004")])
      .withTrash("p1", [instance("spent", "FIX-001")])
      .withDon("p1", { rested: 4 })
      .build();

    game.play({ type: "activate-main", cardNumber: "ST19-004" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "spent" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("is not offered with an empty trash", () => {
    const game = table("st19-004-no-trash")
      .withBoard("p1", [character("hina", "ST19-004")])
      .withTrash("p1", [])
      .withDon("p1", { rested: 4 })
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST19-004",
        ),
    ).toBe(false);
  });

  it("costs four more on the opponent's turn with a DON!! on it", () => {
    const game = defending("st19-004-cost")
      .withBoard("p1", [
        { ...character("hina", "ST19-004"), attachedDon: ["p1-don-0"] },
      ])
      .allowPartialState()
      .build();

    expect(
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find((card) => card.instanceId === "hina")!,
      ),
    ).toBe(8);
  });

  it("costs its printed 4 on its controller's own turn", () => {
    const game = table("st19-004-own-turn")
      .withBoard("p1", [
        { ...character("hina", "ST19-004"), attachedDon: ["p1-don-0"] },
      ])
      .allowPartialState()
      .build();

    expect(
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find((card) => card.instanceId === "hina")!,
      ),
    ).toBe(4);
  });
});

describe("ST19-005 Monkey.D.Garp", () => {
  covers("ST19-005", "[Blocker]", "[Activate: Main]");

  it("blocks", () => {
    const game = defending("st19-005-block")
      .withBoard("p1", [character("garp", "ST19-005")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "garp",
        ),
    ).toBe(true);
  });

  it("buries a card from the trash for −1 cost on a body", () => {
    const game = table("st19-005-debuff")
      .withBoard("p1", [character("garp", "ST19-005")])
      .withBoard("p2", [character("target", "ST19-004")])
      .withTrash("p1", [instance("spent", "FIX-001")])
      .build();

    game.play({ type: "activate-main", cardNumber: "ST19-005" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "spent" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find(
          (card) => card.instanceId === "target",
        )!,
      ),
    ).toBe(3);
  });
});

describe("ST20-001 Charlotte Katakuri", () => {
  covers("ST20-001", "[Blocker]", "[Activate: Main]");

  it("blocks", () => {
    const game = defending("st20-001-block")
      .withBoard("p1", [character("katakuri", "ST20-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p1-leader" });

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "katakuri",
        ),
    ).toBe(true);
  });

  it("turns a Life card face-up for a rested DON!!", () => {
    const game = table("st20-001-don")
      .withBoard("p1", [character("katakuri", "ST20-001")])
      .withDon("p1", { rested: 4 })
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "activate-main", cardNumber: "ST20-001" });
    applyOptional(game);
    resolveUntil(game, "p1-leader");
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    // The Life card stays in the stack: what is spent is the information.
    expect(game.state.players.p1.life).toHaveLength(lifeBefore);
    expect(
      game.state.players.p1.life.filter((card) => card.faceUp),
    ).toHaveLength(1);
  });

  it("is not offered with an empty Life stack", () => {
    const game = table("st20-001-no-life")
      .withBoard("p1", [character("katakuri", "ST20-001")])
      .withLife("p1", 0)
      .withDon("p1", { rested: 4 })
      .build();

    expect(
      game
        .legalActions("p1")
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.sourceCardNumber === "ST20-001",
        ),
    ).toBe(false);
  });
});

describe("ST20-002 Charlotte Cracker", () => {
  covers("ST20-002", "static", "[Trigger]");

  it("trashes a Life card instead of dying to an effect", () => {
    const game = table("st20-002-save")
      .withBoard("p1", [character("newgate", "ST15-002")])
      .withBoard("p2", [character("cracker", "ST20-002")])
      .build();

    const lifeBefore = game.state.players.p2.life.length;
    game.play({ type: "activate-main", cardNumber: "ST15-002" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cracker" });
    game.play({ type: "resolve-effect", optionId: "replace:cracker" });
    settle(game);

    expect(boardCard(game, "p2", "cracker")).toBeDefined();
    expect(game.state.players.p2.life).toHaveLength(lifeBefore - 1);
  });

  it("trashes a card from hand to play itself off a Life card", () => {
    const game = table("st20-002-trigger")
      .withLife("p2", [instance("cracker", "ST20-002")])
      .withHand("p2", [instance("fuel", "FIX-001")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fuel" });
    settle(game);

    expect(boardNumbers(game, "p2")).toContain("ST20-002");
  });
});

describe("ST20-003 Charlotte Brulee", () => {
  covers("ST20-003", "[Trigger]");

  it("reorders a Life stack and keeps the card", () => {
    const game = table("st20-003-trigger")
      .withLife("p2", [
        instance("brulee", "ST20-003"),
        instance("under", "FIX-001"),
      ])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "own-life" });
    game.play({ type: "resolve-effect", optionId: "bottom" });
    settle(game);

    expect(game.state.players.p2.hand.map((card) => card.cardNumber)).toContain(
      "ST20-003",
    );
  });
});

describe("ST20-004 Charlotte Pudding", () => {
  covers("ST20-004", "[On Play]", "[Trigger]");

  it("spends a Life card to set a small {Big Mom Pirates} body active", () => {
    const game = table("st20-004-refresh")
      .withHand("p1", [instance("pudding", "ST20-004")])
      .withLife("p1", [instance("banked", "FIX-001")])
      .withBoard("p1", [{ ...character("spent", "ST20-003"), rested: true }])
      .build();

    const lifeBefore = game.state.players.p1.life.length;
    game.play({ type: "play-card", cardNumber: "ST20-004" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "banked" });
    game.play({ type: "resolve-effect", optionId: "spent" });
    settle(game);

    expect(boardCard(game, "p1", "spent")?.rested).toBe(false);
    expect(game.state.players.p1.life).toHaveLength(lifeBefore - 1);
  });

  it("rests a 3-cost body off a Life card", () => {
    const game = table("st20-004-trigger")
      .withLife("p2", [instance("pudding", "ST20-004")])
      .withBoard("p1", [character("target", "ST20-003")])
      .build();

    game.play({ type: "attack", targetInstanceId: "p2-leader" });
    declineDefence(game);
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(boardCard(game, "p1", "target")?.rested).toBe(true);
  });
});

describe("ST20-005 Charlotte Linlin", () => {
  covers("ST20-005", "[On Play]");

  it("lets the opponent trash two cards from hand", () => {
    const game = table("st20-005-hand")
      .withHand("p1", [
        instance("linlin", "ST20-005"),
        instance("cost", "FIX-001"),
      ])
      .withHand("p2", [
        instance("theirs1", "FIX-001"),
        instance("theirs2", "FIX-001"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "ST20-005" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "hand" });
    game.play({ type: "resolve-effect", optionId: "theirs1" });
    game.play({ type: "resolve-effect", optionId: "theirs2" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(0);
  });

  it("lets the opponent trash a Life card instead", () => {
    const game = table("st20-005-life")
      .withHand("p1", [
        instance("linlin", "ST20-005"),
        instance("cost", "FIX-001"),
      ])
      .withHand("p2", [
        instance("theirs1", "FIX-001"),
        instance("theirs2", "FIX-001"),
      ])
      .build();

    const lifeBefore = game.state.players.p2.life.length;
    game.play({ type: "play-card", cardNumber: "ST20-005" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "life" });
    settle(game);

    // Trashed, not dealt as damage: no Trigger fires and nothing reaches hand.
    expect(game.state.players.p2.life).toHaveLength(lifeBefore - 1);
    expect(game.state.players.p2.hand).toHaveLength(2);
  });
});
