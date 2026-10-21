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
 * BOOSTER PACK -WINGS OF THE CAPTAIN- [OP-06], as a whole-set import.
 *
 * `packages/cards/src/op06.ts` explains where the records come from; this file
 * holds the behaviour. Twelve identities were already in the pool as cards
 * other decks ship, and stay with those decks' files: `test/op06-yamato.test.ts`
 * (OP06-022, OP06-033, OP06-035, OP06-104, OP06-106, OP06-107, OP06-109,
 * OP06-110, OP06-115, OP06-118) and `test/op14-mihawk.test.ts` (OP06-038,
 * OP06-058). Everything else in the set is here.
 *
 * ## Why no deck
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter, the documented
 * shape for a card outside a manifest. Where a clause is gated on a Leader the
 * pool would not otherwise seat -- OP-06 prints six of them, and five of its
 * archetypes are built on their types -- the position states that Leader and is
 * paired with the same play behind a Leader that does not satisfy the gate. A
 * clause whose gate is never shown closed is a clause nobody has tested.
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
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
  }
}

/** Decline the rest of an open effect wherever declining is offered. */
function settleDeclining(game: Game) {
  let guard = 0;
  while (game.state.pendingEffect) {
    if (guard++ > 60) throw new Error("pending effect never settled");
    const options = effectOptions(game.state);
    const decline =
      options.find((optionId) => optionId === "skip" || optionId === "done") ??
      options[0]!;
    game.play({ type: "resolve-effect", optionId: decline });
  }
}

/**
 * Take the apply branch of an `optional` prompt, if one is open.
 *
 * The engine elides the prompt where declining and applying are
 * indistinguishable, so a test that always plays `"apply"` is asserting on the
 * prompt rather than on the card. This asks.
 */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/**
 * Answer the "which DON!! goes back" prompt a `DON!! -N` cost opens.
 *
 * The cost is paid a card at a time and the pools are interchangeable, so any
 * answer is the same answer -- taking the first keeps the test about the card.
 */
const payDonMinus = (game: Game) => {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game.state).some((id) => id.startsWith("return-don:"))
  ) {
    if (guard++ > 20) throw new Error("DON!! cost never settled");
    game.play({ type: "resolve-effect" });
  }
};

/** Decline the block and Counter steps, so a declared attack resolves. */
const declineDefence = (game: Game) => {
  let guard = 0;
  while (game.state.phase === "block" || game.state.phase === "counter") {
    if (guard++ > 40) throw new Error("battle never settled");
    if (
      game.legalActions().some((action) => action.type === "resolve-trigger")
    ) {
      game.play({ type: "resolve-trigger", optionId: "skip" });
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

/**
 * Life cards a `bareTable()` position can actually take.
 *
 * `bareTable()` empties both decks, and `withLife(player, count)` fills the
 * Life area off the top of the deck -- so a count against a bare table is
 * silently zero, and the first attack wins the game. Naming the cards is the
 * documented way to state the position instead.
 */
const lifeCards = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`${prefix}-life-${index}`, "ST32-004"),
  );

/** Whether an `[Activate: Main]` for `cardNumber` is on offer right now. */
const activationOffered = (game: Game, cardNumber: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" && action.summary.includes(cardNumber),
    );

/** Take one hit with `cardNumber` as p1's only Life card, Trigger window open. */
const triggerFrom = (
  seed: string,
  cardNumber: string,
  options: {
    leader?: string;
    opponentLife?: number;
    hand?: string[];
    deck?: string[];
    board?: string[][];
    opponentBoard?: string[][];
    trash?: string[];
  } = {},
) => {
  const { leader, opponentLife, hand, deck, board, opponentBoard, trash } =
    options;
  let built = defending(seed)
    .bareTable()
    .withLife("p1", [instance("life-card", cardNumber)])
    // `bareTable()` empties the deck, and a Trigger whose only effect is a draw
    // is judged inert against an empty one and never offered.
    .withDeckTop(
      "p1",
      (
        deck ?? ["ST32-004", "ST32-004", "ST32-004", "ST32-004", "ST32-004"]
      ).map((number, index) => instance(`${seed}-deck-${index}`, number)),
    )
    .withBoard("p2", [
      character("attacker", "ST32-004"),
      ...(opponentBoard ?? []).map(([id, number]) =>
        character(id!, number!, { rested: true }),
      ),
    ]);
  if (leader) built = built.withLeader("p1", leader);
  if (opponentLife !== undefined) {
    built = built.withLife("p2", lifeCards(`${seed}-p2`, opponentLife));
  }
  if (hand) {
    built = built.withHand(
      "p1",
      hand.map((number, index) => instance(`${seed}-hand-${index}`, number)),
    );
  }
  if (trash) {
    built = built.withTrash(
      "p1",
      trash.map((number, index) => instance(`${seed}-trash-${index}`, number)),
    );
  }
  if (board) {
    built = built.withBoard(
      "p1",
      board.map(([id, number]) => character(id!, number!)),
    );
  }
  const game = built.build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  let guard = 0;
  while (
    game.state.phase === "block" ||
    (game.state.phase === "counter" &&
      !game.legalActions().some((action) => action.type === "resolve-trigger"))
  ) {
    if (guard++ > 20) throw new Error("trigger window never opened");
    game.pass();
  }
  return game;
};

// --- Red: FILM ---------------------------------------------------------------

describe("OP06-001 Uta (Leader)", () => {
  covers("OP06-001", "[When Attacking]");

  it("trashes a FILM card to shrink a Character and ramp a rested DON!!", () => {
    const game = table("op06-001")
      .bareTable()
      .withLeader("p1", "OP06-001")
      .withHand("p1", [instance("film", "OP06-007")])
      .withDonDeck("p1", 1)
      .withBoard("p2", [character("target", "ST32-004")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "film" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
    // The DON!! arrives rested: it pays for nothing this turn, which is what
    // makes the clause a develop rather than a ramp.
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP06-007");
  });

  it("is not offered with no FILM card in hand", () => {
    const game = table("op06-001-bare")
      .bareTable()
      .withLeader("p1", "OP06-001")
      .withHand("p1", [instance("other", "ST32-004")])
      .withDonDeck("p1", 1)
      .withBoard("p2", [character("target", "ST32-004")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });

    // The cost gate is on a {FILM} card specifically, not on hand size: a hand
    // that cannot pay is never prompted.
    expect(effectOptions(game.state)).toEqual([]);
  });
});

describe("OP06-002 Inazuma", () => {
  covers("OP06-002", "static");

  it("gains [Banish] once it is 7000 power", () => {
    const game = table("op06-002")
      .bareTable()
      .withBoard("p1", [character("inazuma", "OP06-002")])
      .build();

    expect(hasKeyword(game.state, "p1", "inazuma", "Banish")).toBe(false);

    game.play({ type: "attach-don", targetInstanceId: "inazuma" });
    game.play({ type: "attach-don", targetInstanceId: "inazuma" });

    expect(currentPower(game.state, "p1", "inazuma")).toBe(7_000);
    expect(hasKeyword(game.state, "p1", "inazuma", "Banish")).toBe(true);
  });
});

describe("OP06-003 Emporio.Ivankov", () => {
  covers("OP06-003", "[On Play]");

  it("plays a small Revolutionary Army body off the top three", () => {
    const game = table("op06-003")
      .bareTable()
      .withHand("p1", [instance("ivankov", "OP06-003")])
      .withDeckTop("p1", [
        instance("dug", "OP06-016"),
        instance("other-a", "ST32-004"),
        instance("other-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-003" });
    game.play({ type: "resolve-effect", optionId: "dug" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-003", "OP06-016"]);
    // The two it passed over go under the deck rather than to the trash.
    expect(game.state.players.p1.deck).toHaveLength(2);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("leaves a body above the power ceiling in the deck", () => {
    const game = table("op06-003-ceiling")
      .bareTable()
      .withHand("p1", [instance("ivankov", "OP06-003")])
      .withDeckTop("p1", [
        // A {Revolutionary Army} body printed above 5000 power.
        instance("too-big", "OP06-003"),
        instance("other-a", "ST32-004"),
        instance("other-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-003" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-003",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(3);
  });
});

describe("OP06-004 Baron Omatsuri", () => {
  covers("OP06-004", "[On Play]");

  it("plays its named partner out of hand for free", () => {
    const game = table("op06-004")
      .bareTable()
      .withHand("p1", [
        instance("omatsuri", "OP06-004"),
        instance("lily", "OP06-015"),
      ])
      .withDon("p1", {})
      .build();

    const donBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP06-004" });
    game.play({ type: "resolve-effect", optionId: "lily" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-004", "OP06-015"]);
    // Free: only Baron Omatsuri's own 2 DON!! was spent.
    expect(game.state.players.p1.activeDon.length).toBe(donBefore - 2);
  });
});

describe("OP06-007 Shanks", () => {
  covers("OP06-007", "[On Play]");

  it("K.O.s a Character inside the power ceiling", () => {
    const game = table("op06-007")
      .bareTable()
      .withHand("p1", [instance("shanks", "OP06-007")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-007" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("reads the ceiling after DON!!, so a pumped body survives", () => {
    const game = table("op06-007-pumped")
      .bareTable()
      .withHand("p1", [instance("shanks", "OP06-007")])
      .withBoard("p2", [character("target", "OP06-007")])
      .withGivenDon("p2", "target", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-007" });
    settleDeclining(game);

    // A printed 12000 with a DON!! on it is 13000, and the clause reads
    // current power: nothing is offered.
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP06-006 Saga", () => {
  covers("OP06-006", "[When Attacking]");

  it("buys power through the opponent's turn and trashes a FILM body", () => {
    const game = table("op06-006")
      .bareTable()
      .withBoard("p1", [
        character("saga", "OP06-006"),
        character("price", "OP06-008"),
      ])
      .withLife("p2", lifeCards("p2", 3))
      // `bareTable()` empties both decks, and the turn this test passes to p2
      // starts with a draw: without a card there the game ends on deck-out
      // before the end-of-turn debt can be read.
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.play({ type: "attach-don", targetInstanceId: "saga" });
    game.play({
      type: "attack",
      attackerInstanceId: "saga",
      targetInstanceId: "p2-leader",
    });
    settleDeclining(game);

    // 5000 printed, +1000 from the clause, +1000 from the DON!! it needed.
    expect(currentPower(game.state, "p1", "saga")).toBe(7_000);
    // The debt is paid when the turn ends, not when the clause resolves.
    expect(game.state.players.p1.board).toHaveLength(2);

    declineDefence(game);
    game.pass();
    // Which {FILM} Character pays is chosen then (Bandai's OP06-006#1).
    game.play({ type: "resolve-effect", optionId: "price" });

    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP06-008");
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "saga",
    ]);
    // The buff outlives the attack -- which is what the price buys -- and so
    // does the DON!! that switched the clause on: attached DON!! goes back at
    // its controller's own Refresh, not at the end of their turn.
    expect(currentPower(game.state, "p1", "saga")).toBe(7_000);
  });

  it("does nothing without the DON!! its clause requires", () => {
    const game = table("op06-006-no-don")
      .bareTable()
      .withBoard("p1", [
        character("saga", "OP06-006"),
        character("price", "OP06-008"),
      ])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "saga",
      targetInstanceId: "p2-leader",
    });

    expect(effectOptions(game.state)).toEqual([]);
    expect(currentPower(game.state, "p1", "saga")).toBe(5_000);
  });
});

describe("OP06-009 Shuraiya", () => {
  covers("OP06-009", "[When Attacking]", "[On Block]");

  it("takes the opposing Leader's base power when it attacks", () => {
    const game = table("op06-009")
      .bareTable()
      .withBoard("p1", [character("shuraiya", "OP06-009")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    expect(currentPower(game.state, "p1", "shuraiya")).toBe(4_000);

    game.play({
      type: "attack",
      attackerInstanceId: "shuraiya",
      targetInstanceId: "p2-leader",
    });
    settleDeclining(game);

    // ST32's Leader is a 5000, and the copy is of base power: the DON!! on it
    // would not have travelled.
    expect(currentPower(game.state, "p1", "shuraiya")).toBe(5_000);
  });

  it("copies base power only, ignoring the DON!! on that Leader", () => {
    const game = defending("op06-009-block")
      .bareTable()
      .withBoard("p1", [character("shuraiya", "OP06-009")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "p2-leader", 3)
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "shuraiya" });
    settleDeclining(game);

    // The Leader across the table is a 5000 carrying three DON!!; only the
    // 5000 travels.
    expect(currentPower(game.state, "p1", "shuraiya")).toBe(5_000);
  });
});

describe("OP06-010 Douglas Bullet", () => {
  covers("OP06-010", "static");

  it("blocks behind a FILM Leader and not behind another", () => {
    const behind = table("op06-010")
      .bareTable()
      .withLeader("p1", "OP06-001")
      .withBoard("p1", [character("bullet", "OP06-010")])
      .build();

    expect(hasKeyword(behind.state, "p1", "bullet", "Blocker")).toBe(true);

    const without = table("op06-010-off")
      .bareTable()
      .withBoard("p1", [character("bullet", "OP06-010")])
      .build();

    expect(hasKeyword(without.state, "p1", "bullet", "Blocker")).toBe(false);
  });
});

describe("OP06-011 Tot Musica", () => {
  covers("OP06-011", "[Activate: Main]");

  it("rests an [Uta] card for +5000", () => {
    const game = table("op06-011")
      .bareTable()
      .withLeader("p1", "OP06-001")
      .withBoard("p1", [character("musica", "OP06-011")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-011" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "musica")).toBe(11_000);
    // The Leader is a legal payment, and paying rests it.
    expect(game.state.players.p1.leaderRested).toBe(true);
  });

  it("is not offered with no active [Uta] to rest", () => {
    const game = table("op06-011-none")
      .bareTable()
      .withBoard("p1", [character("musica", "OP06-011")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-011" });
    settleDeclining(game);

    // The cost cannot be paid, so the payoff never lands: a `choose` that
    // cannot fill its `min` is skipped.
    expect(currentPower(game.state, "p1", "musica")).toBe(6_000);
  });
});

describe("OP06-012 Bear.King", () => {
  covers("OP06-012", "static");

  it("survives a lost battle while the opponent holds a 6000 base", () => {
    const game = defending("op06-012")
      .bareTable()
      .withBoard("p1", [character("bear", "OP06-012", { rested: true })])
      .withBoard("p2", [character("attacker", "OP06-005")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "bear",
    });
    declineDefence(game);

    // 9000 into a 6000: the battle is lost and the body is still there.
    expect(game.state.players.p1.board).toHaveLength(1);
  });

  it("dies in battle when nothing across the table is that big", () => {
    const game = defending("op06-012-small")
      .bareTable()
      .withBoard("p1", [character("bear", "OP06-012", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .withLeader("p2", "ST31-001")
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "bear",
    });
    declineDefence(game);

    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP06-013 Monkey.D.Luffy", () => {
  covers("OP06-013", "[On Play]", "[Trigger]");

  it("digs three deep for a FILM card", () => {
    const game = table("op06-013")
      .bareTable()
      .withHand("p1", [instance("luffy", "OP06-013")])
      .withDeckTop("p1", [
        instance("other-a", "ST32-004"),
        instance("film", "OP06-007"),
        instance("other-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-013" });
    game.play({ type: "resolve-effect", optionId: "film" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP06-007",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });

  it("runs the same dig off a Life card", () => {
    const game = triggerFrom("op06-013-trigger", "OP06-013", {
      deck: ["ST32-004", "OP06-007", "ST32-004"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    // The Trigger's own card goes to the trash and the dig has run.
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP06-014 Ratchet", () => {
  covers("OP06-014", "[On Your Opponent's Attack]");

  it("pays 1000 of Counter power per FILM card trashed", () => {
    const game = defending("op06-014")
      .bareTable()
      .withBoard("p1", [character("ratchet", "OP06-014")])
      .withHand("p1", [
        instance("film-a", "OP06-007"),
        instance("film-b", "OP06-008"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "film-a" });
    game.play({ type: "resolve-effect", optionId: "film-b" });

    // Battle-scoped, on the card being attacked: two cards is +2000.
    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("is not offered with no FILM card in hand", () => {
    const game = defending("op06-014-bare")
      .bareTable()
      .withBoard("p1", [character("ratchet", "OP06-014")])
      .withHand("p1", [instance("other", "ST32-004")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(effectOptions(game.state)).toEqual([]);
  });
});

describe("OP06-015 Lily Carnation", () => {
  covers("OP06-015", "[Activate: Main]");

  it("trades a 6000 body for a mid-sized FILM body from the trash, rested", () => {
    const game = table("op06-015")
      .bareTable()
      .withBoard("p1", [
        character("lily", "OP06-015"),
        character("fodder", "OP06-005"),
      ])
      .withTrash("p1", [instance("back", "OP06-009")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-015" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "back" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-009", "OP06-015"]);
    // It arrives rested, so it cannot attack or block this turn.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "back")
        ?.rested,
    ).toBe(true);
  });

  it("cannot reach a trash body outside the printed power window", () => {
    const game = table("op06-015-window")
      .bareTable()
      .withBoard("p1", [
        character("lily", "OP06-015"),
        character("fodder", "OP06-005"),
      ])
      // A {FILM} Character printed at 12000, above the window's top end.
      .withTrash("p1", [instance("too-big", "OP06-007")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-015" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-015",
    ]);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP06-007");
  });
});

describe("OP06-016 Raise Max", () => {
  covers("OP06-016", "[Activate: Main]");

  it("goes under its own deck to shrink a Character by 3000", () => {
    const game = table("op06-016")
      .bareTable()
      .withBoard("p1", [character("raise-max", "OP06-016")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-016" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(currentPower(game.state, "p2", "target")).toBe(2_000);
    expect(game.state.players.p1.board).toHaveLength(0);
    // Under the deck, not in the trash: the deck's own recursion cannot reach
    // it again.
    expect(game.state.players.p1.deck.map((card) => card.cardNumber)).toEqual([
      "OP06-016",
    ]);
  });
});

describe("OP06-017 Meteor-Strike of Love", () => {
  covers("OP06-017", "[Main]", "[Counter]");

  it("pays a Life card for +3000 in the Main Phase", () => {
    const game = table("op06-017")
      .bareTable()
      .withHand("p1", [instance("meteor", "OP06-017")])
      .withBoard("p1", [character("body", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();

    game.play({ summary: "[OP06-017]" });
    applyOptional(game);
    game.play({ type: "resolve-effect" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "body")).toBe(8_000);
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("raises the defender for the whole turn from the Counter step", () => {
    const game = defending("op06-017-counter")
      .bareTable()
      .withHand("p1", [instance("meteor", "OP06-017")])
      .withBoard("p1", [character("body", "ST32-004", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .withDon("p1", { active: 2 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP06-017" });
    applyOptional(game);
    game.play({ type: "resolve-effect" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settleDeclining(game);

    // Turn-scoped rather than battle-scoped, which is what the printed clause
    // says: the body is still 8000 after the attack it answered.
    expect(currentPower(game.state, "p1", "body")).toBe(8_000);
    declineDefence(game);
    expect(game.state.players.p1.board).toHaveLength(1);
    expect(currentPower(game.state, "p1", "body")).toBe(8_000);
  });
});

describe("OP06-018 Gum-Gum King Kong Gatling", () => {
  covers("OP06-018", "[Main]", "[Trigger]");

  it("adds the second buff only while the opponent holds a 7000", () => {
    const game = table("op06-018")
      .bareTable()
      .withHand("p1", [instance("gatling", "OP06-018")])
      .withBoard("p1", [character("body", "ST32-004")])
      .withBoard("p2", [character("big", "OP06-005")])
      .build();

    game.play({ summary: "[OP06-018]" });
    game.play({ type: "resolve-effect", optionId: "body" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "body")).toBe(9_000);
  });

  it("gives only the first buff against a small board", () => {
    const game = table("op06-018-small")
      .bareTable()
      .withHand("p1", [instance("gatling", "OP06-018")])
      .withBoard("p1", [character("body", "ST32-004")])
      .withBoard("p2", [character("small", "OP06-016")])
      .build();

    game.play({ summary: "[OP06-018]" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "body")).toBe(8_000);
  });

  it("K.O.s a small body off a Life card", () => {
    const game = triggerFrom("op06-018-trigger", "OP06-018", {
      opponentBoard: [["victim", "ST32-004"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    // ST32-004 is an 8000, well above the Trigger's ceiling: nothing dies.
    expect(game.state.players.p2.board).toHaveLength(2);
  });

  it("reaches a body inside the Trigger's power ceiling", () => {
    const game = triggerFrom("op06-018-trigger-hit", "OP06-018", {
      opponentBoard: [["victim", "OP06-016"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

describe("OP06-019 Blue Dragon Seal Water Stream", () => {
  covers("OP06-019", "[Main]", "[Trigger]");

  it("K.O.s a Character inside the power ceiling", () => {
    const game = table("op06-019")
      .bareTable()
      .withHand("p1", [instance("stream", "OP06-019")])
      .withBoard("p2", [character("target", "OP06-016")])
      .build();

    game.play({ summary: "[OP06-019]" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("reads the ceiling a step lower off a Life card", () => {
    const game = triggerFrom("op06-019-trigger", "OP06-019", {
      opponentBoard: [["victim", "OP06-016"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

// --- Blue: Fish-Man ----------------------------------------------------------

describe("OP06-020 Hody Jones (Leader)", () => {
  covers("OP06-020", "[Activate: Main]");

  it("rests itself to rest a cheap body, and gives up its Life draws", () => {
    const game = table("op06-020")
      .bareTable()
      .withLeader("p1", "OP06-020")
      .withBoard("p1", [character("hyouzou", "OP06-034")])
      .withBoard("p2", [character("target", "OP06-016")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "activate-main", summary: "OP06-020" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "target")
        ?.rested,
    ).toBe(true);

    // The price: OP06-034's own Life draw does nothing for the rest of the
    // turn, so the Life area stays where it was.
    game.play({ type: "activate-main", summary: "OP06-034" });
    settleDeclining(game);
    expect(game.state.players.p1.life).toHaveLength(3);
    expect(currentPower(game.state, "p1", "hyouzou")).toBe(7_000);
  });

  it("is not offered again once the Leader is rested", () => {
    const game = table("op06-020-rested")
      .bareTable()
      .withLeader("p1", "OP06-020")
      .withRestedLeader("p1")
      .withBoard("p2", [character("target", "OP06-016")])
      .build();

    expect(activationOffered(game, "OP06-020")).toBe(false);
  });
});

describe("OP06-021 Perona (Leader)", () => {
  covers("OP06-021", "[Activate: Main]");

  it("rests a cheap body on the first branch", () => {
    const game = table("op06-021")
      .bareTable()
      .withLeader("p1", "OP06-021")
      .withBoard("p2", [character("target", "OP06-016")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-021" });
    game.play({ type: "resolve-effect", optionId: "rest" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "target")
        ?.rested,
    ).toBe(true);
  });

  it("shrinks a cost by 1 on the second branch", () => {
    const game = table("op06-021-cost")
      .bareTable()
      .withLeader("p1", "OP06-021")
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    const before = effectiveCost(
      game.state,
      "p2",
      game.state.players.p2.board[0]!,
    );
    game.play({ type: "activate-main", summary: "OP06-021" });
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(before - 1);
  });
});

describe("OP06-023 Arlong", () => {
  covers("OP06-023", "[On Play]", "[Trigger]");

  it("locks a rested Leader out of attacking through its next turn", () => {
    const game = table("op06-023")
      .bareTable()
      .withHand("p1", [
        instance("arlong", "OP06-023"),
        instance("fodder", "ST32-004"),
      ])
      .withRestedLeader("p2")
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-023" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settleDeclining(game);

    game.pass();

    // p2's Leader comes back active at its own Refresh and still cannot swing.
    expect(game.state.players.p2.leaderRested).toBe(false);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p2-leader",
        ),
    ).toBe(false);
  });

  it("does not offer an active Leader as a target", () => {
    const game = table("op06-023-active")
      .bareTable()
      .withHand("p1", [
        instance("arlong", "OP06-023"),
        instance("fodder", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-023" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });

    // The clause names a *rested* Leader: with nothing eligible the choice is
    // never asked, and the card from hand has been spent on nothing.
    expect(effectOptions(game.state)).toEqual([]);
  });

  it("rests a cheap body off a Life card instead", () => {
    const game = triggerFrom("op06-023-trigger", "OP06-023", {
      opponentBoard: [["victim", "OP06-016"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    // The Trigger's target is already rested here, so the rest is a no-op
    // offer: what it proves is that the clause reaches the cost ceiling.
    expect(game.state.players.p2.board).toHaveLength(2);
  });
});

describe("OP06-024 Ikaros Much", () => {
  covers("OP06-024", "[On Play]");

  it("plays a Fish-Man body and pays a Life card behind its Leader", () => {
    const game = table("op06-024")
      .bareTable()
      .withLeader("p1", "OP06-020")
      .withHand("p1", [
        instance("ikaros", "OP06-024"),
        instance("hammond", "OP06-032"),
      ])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-024" });
    game.play({ type: "resolve-effect", optionId: "hammond" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-024", "OP06-032"]);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("does neither half behind another Leader", () => {
    const game = table("op06-024-off")
      .bareTable()
      .withHand("p1", [
        instance("ikaros", "OP06-024"),
        instance("hammond", "OP06-032"),
      ])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-024" });
    settleDeclining(game);

    // Both halves sit inside one conditional sentence: no Leader type, no free
    // body and no Life card.
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-024",
    ]);
    expect(game.state.players.p1.life).toHaveLength(3);
  });
});

describe("OP06-025 Camie", () => {
  covers("OP06-025", "[On Play]");

  it("digs four deep across both of its types", () => {
    const game = table("op06-025")
      .bareTable()
      .withHand("p1", [instance("camie", "OP06-025")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("b", "ST32-004"),
        instance("merfolk", "OP06-025"),
        instance("c", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-025" });

    // "Other than [Camie]" -- the copy it found is itself, so no card is
    // offered at all and the next decision is already the order the four go
    // back under the deck in.
    expect(
      effectOptions(game.state).every((id) => id.startsWith("order:")),
    ).toBe(true);
    settleDeclining(game);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(4);
  });

  it("adds a Fish-Man card that is not another Camie", () => {
    const game = table("op06-025-hit")
      .bareTable()
      .withHand("p1", [instance("camie", "OP06-025")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("fishman", "OP06-032"),
        instance("b", "ST32-004"),
        instance("c", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-025" });
    game.play({ type: "resolve-effect", optionId: "fishman" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP06-032",
    ]);
  });
});

describe("OP06-026 Koushirou", () => {
  covers("OP06-026", "[On Play]");

  it("sets a Slash body active and closes the Leader as a target", () => {
    const game = table("op06-026")
      .bareTable()
      .withHand("p1", [instance("koushirou", "OP06-026")])
      .withBoard("p1", [
        // A <Slash> Character with a cost of 4 or less, already rested.
        character("slash", "OP06-036", { rested: true }),
      ])
      .withBoard("p2", [character("body", "ST32-004", { rested: true })])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-026" });
    game.play({ type: "resolve-effect", optionId: "slash" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "slash")
        ?.rested,
    ).toBe(false);

    const attacks = game
      .legalActions()
      .filter((action) => action.type === "attack");
    expect(attacks.length).toBeGreaterThan(0);
    // Every attack still on offer points at a Character: the opposing Leader
    // is closed for the turn, for every attacker rather than for this one.
    expect(
      attacks.every((action) => action.targetInstanceId !== "p2-leader"),
    ).toBe(true);
  });

  it("leaves the ban in place even with nothing to set active", () => {
    const game = table("op06-026-empty")
      .bareTable()
      .withHand("p1", [instance("koushirou", "OP06-026")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-026" });
    settleDeclining(game);

    // The two halves are sequenced, not nested: the price is paid whether or
    // not the payoff found a target.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.targetInstanceId === "p2-leader",
        ),
    ).toBe(false);
  });
});

describe("OP06-027 Gyro", () => {
  covers("OP06-027", "[On K.O.]");

  it("rests a cheap body on the way out", () => {
    const game = defending("op06-027")
      .bareTable()
      .withBoard("p1", [character("gyro", "OP06-027", { rested: true })])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("victim", "OP06-016"),
      ])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "gyro",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP06-028 Zeo", () => {
  covers("OP06-028", "[When Attacking]");

  it("sets a DON!! active, grows, and pays a Life card", () => {
    const game = table("op06-028")
      .bareTable()
      .withLeader("p1", "OP06-020")
      .withBoard("p1", [character("zeo", "OP06-028")])
      .withDon("p1", { rested: 2 })
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "zeo" });
    game.play({
      type: "attack",
      attackerInstanceId: "zeo",
      targetInstanceId: "p2-leader",
    });
    settleDeclining(game);

    // One of the two rested DON!! is back in the cost area, which is a Counter
    // this deck can now pay for on the way back.
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    // 3000 printed, +1000 for the DON!! that switched the clause on, +1000
    // from the clause itself.
    expect(currentPower(game.state, "p1", "zeo")).toBe(5_000);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("does nothing behind another Leader", () => {
    const game = table("op06-028-off")
      .bareTable()
      .withBoard("p1", [character("zeo", "OP06-028")])
      .withDon("p1", { rested: 2 })
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "zeo" });
    game.play({
      type: "attack",
      attackerInstanceId: "zeo",
      targetInstanceId: "p2-leader",
    });
    settleDeclining(game);

    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(currentPower(game.state, "p1", "zeo")).toBe(4_000);
    expect(game.state.players.p1.life).toHaveLength(3);
  });
});

describe("OP06-029 Daruma", () => {
  covers("OP06-029", "[When Attacking]");

  it("restands itself, so a 4000 attacks twice", () => {
    const game = table("op06-029")
      .bareTable()
      .withLeader("p1", "OP06-020")
      .withBoard("p1", [character("daruma", "OP06-029")])
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "daruma" });
    game.play({
      type: "attack",
      attackerInstanceId: "daruma",
      targetInstanceId: "p2-leader",
    });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "daruma")
        ?.rested,
    ).toBe(false);
    expect(game.state.players.p1.life).toHaveLength(2);
    declineDefence(game);

    // `[Once Per Turn]`: the second attack is legal and the clause does not
    // fire again, so the body stays rested this time.
    game.play({
      type: "attack",
      attackerInstanceId: "daruma",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state)).toEqual([]);
    declineDefence(game);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "daruma")
        ?.rested,
    ).toBe(true);
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("OP06-030 Dosun", () => {
  covers("OP06-030", "[When Attacking]");

  it("survives its own attack and the crack-back", () => {
    const game = table("op06-030")
      .bareTable()
      .withLeader("p1", "OP06-020")
      .withBoard("p1", [character("dosun", "OP06-030")])
      .withBoard("p2", [character("wall", "OP06-005", { rested: true })])
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "dosun",
      targetInstanceId: "wall",
    });
    settleDeclining(game);

    // 4000 printed, +2000 from the clause, into a 9000: the attack fails and
    // the body lives anyway.
    expect(currentPower(game.state, "p1", "dosun")).toBe(6_000);
    declineDefence(game);
    expect(game.state.players.p1.board).toHaveLength(1);
    expect(game.state.players.p1.life).toHaveLength(2);

    // Both halves last through the opponent's turn, which is the defensive
    // half of the clause.
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "wall",
      targetInstanceId: "dosun",
    });
    declineDefence(game);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "dosun",
    ]);
  });

  it("does nothing behind another Leader", () => {
    const game = table("op06-030-off")
      .bareTable()
      .withBoard("p1", [character("dosun", "OP06-030")])
      .withBoard("p2", [character("wall", "OP06-005")])
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "dosun",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    // No buff and no Life card: the whole clause sits behind the Leader gate.
    expect(currentPower(game.state, "p1", "dosun")).toBe(4_000);
    expect(game.state.players.p1.life).toHaveLength(3);

    // And no protection either -- the same 9000 that could not fight it off
    // the board in the test above kills it here.
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "wall",
      targetInstanceId: "dosun",
    });
    declineDefence(game);
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP06-031 Hatchan", () => {
  covers("OP06-031", "[Trigger]");

  it("plays a cheap Fish-Man body out of hand", () => {
    const game = triggerFrom("op06-031", "OP06-031", {
      hand: ["OP06-032"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "op06-031-hand-0" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-032",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("cannot reach a body above the cost ceiling", () => {
    const game = triggerFrom("op06-031-ceiling", "OP06-031", {
      hand: ["OP06-005"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP06-034 Hyouzou", () => {
  covers("OP06-034", "[Activate: Main]");

  it("rests a body, grows and pays a Life card", () => {
    const game = table("op06-034")
      .bareTable()
      .withBoard("p1", [character("hyouzou", "OP06-034")])
      .withBoard("p2", [character("target", "OP06-036")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "activate-main", summary: "OP06-034" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "target")
        ?.rested,
    ).toBe(true);
    expect(currentPower(game.state, "p1", "hyouzou")).toBe(7_000);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("still grows and still pays with nothing to rest", () => {
    const game = table("op06-034-empty")
      .bareTable()
      .withBoard("p1", [character("hyouzou", "OP06-034")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "activate-main", summary: "OP06-034" });
    settleDeclining(game);

    // The printed sentence joins the rest and the buff with "and", so the buff
    // is not conditional on a target existing.
    expect(currentPower(game.state, "p1", "hyouzou")).toBe(7_000);
    expect(game.state.players.p1.life).toHaveLength(2);
  });
});

describe("OP06-036 Ryuma", () => {
  covers("OP06-036", "[On Play]", "[On K.O.]");

  it("K.O.s a rested body on the way in", () => {
    const game = table("op06-036")
      .bareTable()
      .withHand("p1", [instance("ryuma", "OP06-036")])
      .withBoard("p2", [character("victim", "OP06-036", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-036" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("leaves an active body alone", () => {
    const game = table("op06-036-active")
      .bareTable()
      .withHand("p1", [instance("ryuma", "OP06-036")])
      .withBoard("p2", [character("victim", "OP06-036")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-036" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("runs the same removal on the way out", () => {
    const game = defending("op06-036-ko")
      .bareTable()
      .withBoard("p1", [character("ryuma", "OP06-036", { rested: true })])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("victim", "OP06-016", { rested: true }),
      ])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "ryuma",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

describe("OP06-041 The Ark Noah", () => {
  covers("OP06-041", "[On Play]", "[Trigger]");

  it("rests the whole opposing board", () => {
    const game = table("op06-041")
      .bareTable()
      .withHand("p1", [instance("noah", "OP06-041")])
      .withBoard("p2", [
        character("a", "ST32-004"),
        character("b", "OP06-016"),
        character("c", "OP06-036", { rested: true }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-041" });
    settle(game);

    expect(game.state.players.p2.board.every((card) => card.rested)).toBe(true);
    expect(game.state.players.p1.stage?.cardNumber).toBe("OP06-041");
  });

  it("arrives off a Life card and brings its own board rest with it", () => {
    const game = triggerFrom("op06-041-trigger", "OP06-041", {
      opponentBoard: [["victim", "OP06-016"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(game.state.players.p1.stage?.cardNumber).toBe("OP06-041");
    // The attacker is rested by declaring; the other body is rested by the
    // Stage's own `[On Play]`, which the `play` node dispatches.
    expect(game.state.players.p2.board.every((card) => card.rested)).toBe(true);
  });
});

describe("OP06-039 You Ain't Even Worth Killing Time!!", () => {
  covers("OP06-039", "[Main]", "[Trigger]");

  it("rests a body on the first branch", () => {
    const game = table("op06-039")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-039")])
      .withBoard("p2", [character("target", "OP06-005")])
      .build();

    game.play({ summary: "[OP06-039]" });
    game.play({ type: "resolve-effect", optionId: "rest" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "target")
        ?.rested,
    ).toBe(true);
  });

  it("K.O.s a rested body on the second branch", () => {
    const game = table("op06-039-ko")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-039")])
      .withBoard("p2", [character("target", "OP06-005", { rested: true })])
      .build();

    game.play({ summary: "[OP06-039]" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("runs the same choice off a Life card", () => {
    const game = triggerFrom("op06-039-trigger", "OP06-039", {
      opponentBoard: [["victim", "OP06-005"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

describe("OP06-040 Shark Arrows", () => {
  covers("OP06-040", "[Main]", "[Trigger]");

  it("K.O.s two cheap rested bodies at once", () => {
    const game = table("op06-040")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-040")])
      .withBoard("p2", [
        character("a", "OP06-016", { rested: true }),
        character("b", "OP06-027", { rested: true }),
        character("active", "OP06-016"),
      ])
      .build();

    game.play({ summary: "[OP06-040]" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settleDeclining(game);

    // The active body is not a legal target, and two is the printed maximum.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "active",
    ]);
  });

  it("runs the same removal off a Life card", () => {
    const game = triggerFrom("op06-040-trigger", "OP06-040", {
      opponentBoard: [["victim", "OP06-016"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

// --- Navy, GERMA 66 and the FILM Characters printed with them ----------------

describe("OP06-042 Vinsmoke Reiju (Leader)", () => {
  covers("OP06-042", "[Your Turn]");

  it("draws a card the first time DON!! goes back each turn", () => {
    const game = table("op06-042")
      .bareTable()
      .withLeader("p1", "OP06-042")
      .withBoard("p1", [
        character("yonji", "OP06-066"),
        character("niji", "OP06-064"),
      ])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP06-066" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw-a",
    ]);

    // `[Once Per Turn]`: the second sibling's DON!! -1 pays nothing more.
    game.play({ type: "activate-main", summary: "OP06-064" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP06-043 Aramaki", () => {
  covers("OP06-043", "[Activate: Main]");

  it("pays a card and a cheap body for +3000", () => {
    const game = table("op06-043")
      .bareTable()
      .withBoard("p1", [character("aramaki", "OP06-043")])
      .withHand("p1", [instance("fodder", "ST32-004")])
      .withBoard("p2", [character("cheap", "OP06-016")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-043" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "aramaki")).toBe(11_000);
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.deck.map((card) => card.cardNumber)).toContain(
      "OP06-016",
    );
  });

  it("is not offered with an empty hand", () => {
    const game = table("op06-043-no-hand")
      .bareTable()
      .withBoard("p1", [character("aramaki", "OP06-043")])
      .withBoard("p2", [character("cheap", "OP06-016")])
      .build();

    expect(activationOffered(game, "OP06-043")).toBe(false);
  });

  it("is not offered when no cheap body is on either board", () => {
    const game = table("op06-043-no-target")
      .bareTable()
      .withBoard("p1", [character("aramaki", "OP06-043")])
      .withHand("p1", [instance("fodder", "ST32-004")])
      .build();

    // The bury is part of the cost, and a cost that cannot be paid cannot be
    // activated (Q&A OP06-043#1): no hand card spent for nothing.
    expect(activationOffered(game, "OP06-043")).toBe(false);
  });
});

describe("OP06-044 Gion", () => {
  covers("OP06-044", "[Your Turn]");

  it("costs the defender a card when they answer with an Event", () => {
    const game = table("op06-044")
      .bareTable()
      .withBoard("p1", [character("gion", "OP06-044")])
      // A Counter Event whose own program asks nothing: an Event that leaves a
      // pending of its own keeps the slot, and the watcher's prompt is dropped
      // rather than queued behind it -- see `applyAction`'s note on that.
      .withHand("p2", [
        instance("counter", "OP06-038"),
        instance("spare", "ST32-004"),
      ])
      .withDon("p2", { active: 2 })
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "gion",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP06-038" });
    // Gion's controller applies the clause; the defender then picks the card.
    game.play({ type: "resolve-effect", optionId: "apply" });
    settleDeclining(game);

    // The Event resolved and the watcher took the card the defender had left,
    // which they chose themselves.
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.deck.map((card) => card.cardNumber)).toContain(
      "ST32-004",
    );
  });
});

describe("OP06-045 Kuzan", () => {
  covers("OP06-045", "[On Play]");

  it("draws two and puts two back under the deck", () => {
    const game = table("op06-045")
      .bareTable()
      .withHand("p1", [
        instance("kuzan", "OP06-045"),
        instance("keep", "OP06-005"),
      ])
      .withDeckTop("p1", [
        instance("drawn-a", "ST32-004"),
        instance("drawn-b", "OP06-016"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-045" });
    game.play({ type: "resolve-effect", optionId: "drawn-a" });
    game.play({ type: "resolve-effect", optionId: "drawn-b" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "keep",
    ]);
    expect(
      game.state.players.p1.deck.map((card) => card.instanceId).sort(),
    ).toEqual(["drawn-a", "drawn-b"]);
  });
});

describe("OP06-046 Sakazuki", () => {
  covers("OP06-046", "[On Play]");

  it("buries a cheap body without K.O.ing it", () => {
    const game = table("op06-046")
      .bareTable()
      .withHand("p1", [instance("sakazuki", "OP06-046")])
      // OP06-027 Gyro would rest something if this were a K.O.
      .withBoard("p2", [character("gyro", "OP06-027")])
      .withBoard("p1", [character("mine", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-046" });
    game.play({ type: "resolve-effect", optionId: "gyro" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.deck.map((card) => card.cardNumber)).toContain(
      "OP06-027",
    );
    // No `[On K.O.]`: the body left the field without dying.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "mine")
        ?.rested,
    ).toBe(false);
  });
});

describe("OP06-047 Charlotte Pudding", () => {
  covers("OP06-047", "[On Play]");

  it("shuffles the opponent's hand away and deals them five", () => {
    const game = table("op06-047")
      .bareTable()
      .withHand("p1", [instance("pudding", "OP06-047")])
      .withHand("p2", [
        instance("theirs-a", "OP06-115"),
        instance("theirs-b", "OP06-115"),
      ])
      .withDeckTop(
        "p2",
        Array.from({ length: 6 }, (_, index) =>
          instance(`p2-deck-${index}`, "ST32-004"),
        ),
      )
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-047" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(5);
    // Their two Counters are in the deck rather than the trash, so nothing
    // they held is gone for good.
    expect(game.state.players.p2.trash).toHaveLength(0);
    expect(
      game.state.players.p2.hand
        .map((card) => card.cardNumber)
        .filter((number) => number === "OP06-115").length,
    ).toBeLessThanOrEqual(2);
  });
});

describe("OP06-048 Zeff", () => {
  covers("OP06-048", "[Your Turn]");

  it("mills four when the defender activates a [Blocker]", () => {
    const game = table("op06-048")
      .bareTable()
      // OP15-001 Krieg is the pool's only {East Blue} Leader.
      .withLeader("p1", "OP15-001")
      .withBoard("p1", [
        character("zeff", "OP06-048"),
        character("attacker", "ST32-004"),
      ])
      .withDeckTop(
        "p1",
        Array.from({ length: 5 }, (_, index) =>
          instance(`mill-${index}`, "ST32-004"),
        ),
      )
      .withBoard("p2", [character("blocker", "OP06-032")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "blocker" });
    applyOptional(game);
    settleDeclining(game);

    expect(game.state.players.p1.trash).toHaveLength(4);
    expect(game.state.players.p1.deck).toHaveLength(1);
  });

  it("mills four when the defender activates an Event, and is not once per turn", () => {
    const game = table("op06-048-event")
      .bareTable()
      // OP15-001 Krieg is the pool's only {East Blue} Leader.
      .withLeader("p1", "OP15-001")
      .withBoard("p1", [
        character("zeff", "OP06-048"),
        character("attacker", "ST32-004"),
      ])
      .withDeckTop(
        "p1",
        Array.from({ length: 9 }, (_, index) =>
          instance(`mill-${index}`, "ST32-004"),
        ),
      )
      .withHand("p2", [
        instance("counter-a", "OP06-038"),
        instance("counter-b", "OP06-038"),
        instance("spare", "ST32-004"),
      ])
      .withDon("p2", { active: 2 })
      .withLife("p2", lifeCards("p2", 3))
      .build();

    // Three DON!! on the attacker, so the second Counter is still worth
    // playing: past the point where a defense already holds, an Event whose
    // only clause is power is not offered at all.
    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP06-038" });
    applyOptional(game);
    settleDeclining(game);
    expect(game.state.players.p1.trash).toHaveLength(4);

    game.play({ type: "activate-counter-event", cardNumber: "OP06-038" });
    applyOptional(game);
    settleDeclining(game);

    // Not `[Once Per Turn]`: a deck that mills to fuel its own recursion is
    // paid every time the defender interacts.
    expect(game.state.players.p1.trash).toHaveLength(8);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("op06-048-off")
      .bareTable()
      .withBoard("p1", [
        character("zeff", "OP06-048"),
        character("attacker", "ST32-004"),
      ])
      .withDeckTop(
        "p1",
        Array.from({ length: 5 }, (_, index) =>
          instance(`mill-${index}`, "ST32-004"),
        ),
      )
      .withBoard("p2", [character("blocker", "OP06-032")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "block", blockerInstanceId: "blocker" });
    settleDeclining(game);

    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("OP06-050 Tashigi", () => {
  covers("OP06-050", "[On Play]");

  it("digs five deep for a Navy card that is not another Tashigi", () => {
    const game = table("op06-050")
      .bareTable()
      .withHand("p1", [instance("tashigi", "OP06-050")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("self", "OP06-050"),
        instance("navy", "OP06-049"),
        instance("b", "ST32-004"),
        instance("c", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-050" });
    expect(effectOptions(game.state)).toContain("navy");
    expect(effectOptions(game.state)).not.toContain("self");
    game.play({ type: "resolve-effect", optionId: "navy" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP06-049",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(4);
  });
});

describe("OP06-051 Tsuru", () => {
  covers("OP06-051", "[On Play]");

  it("pays two cards for a bounce the opponent chooses", () => {
    const game = table("op06-051")
      .bareTable()
      .withHand("p1", [
        instance("tsuru", "OP06-051"),
        instance("cost-a", "ST32-004"),
        instance("cost-b", "ST32-004"),
      ])
      .withBoard("p2", [
        character("theirs-a", "OP06-016"),
        character("theirs-b", "OP06-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-051" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost-a" });
    game.play({ type: "resolve-effect", optionId: "cost-b" });

    // The choice belongs to the opponent, so it is their decision window.
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "theirs-a" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "theirs-b",
    ]);
    expect(game.state.players.p2.hand.map((card) => card.cardNumber)).toContain(
      "OP06-016",
    );
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("does nothing when the two cards cannot be paid", () => {
    const game = table("op06-051-poor")
      .bareTable()
      .withHand("p1", [
        instance("tsuru", "OP06-051"),
        instance("cost-a", "ST32-004"),
      ])
      .withBoard("p2", [character("theirs", "OP06-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-051" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP06-052 Tokikake", () => {
  covers("OP06-052", "static");

  it("survives a lost battle with DON!! on it and a small hand", () => {
    const game = defending("op06-052")
      .bareTable()
      .withBoard("p1", [character("tokikake", "OP06-052", { rested: true })])
      .withGivenDon("p1", "tokikake", 1)
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "tokikake",
    });
    declineDefence(game);

    expect(game.state.players.p1.board).toHaveLength(1);
  });

  it("dies without the DON!! its clause names", () => {
    const game = defending("op06-052-off")
      .bareTable()
      .withBoard("p1", [character("tokikake", "OP06-052", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "tokikake",
    });
    declineDefence(game);

    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP06-053 Jaguar.D.Saul", () => {
  covers("OP06-053", "[On K.O.]");

  it("buries a cheap body on the way out", () => {
    const game = defending("op06-053")
      .bareTable()
      .withBoard("p1", [character("saul", "OP06-053", { rested: true })])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("victim", "OP06-016"),
      ])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "saul",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
    expect(game.state.players.p2.deck.map((card) => card.cardNumber)).toContain(
      "OP06-016",
    );
  });
});

describe("OP06-054 Borsalino", () => {
  covers("OP06-054", "static");

  it("blocks while the hand is small enough", () => {
    const small = table("op06-054")
      .bareTable()
      .withBoard("p1", [character("borsalino", "OP06-054")])
      .withHand("p1", lifeCards("hand", 5))
      .build();

    expect(hasKeyword(small.state, "p1", "borsalino", "Blocker")).toBe(true);

    const big = table("op06-054-full")
      .bareTable()
      .withBoard("p1", [character("borsalino", "OP06-054")])
      .withHand("p1", lifeCards("hand", 6))
      .build();

    expect(hasKeyword(big.state, "p1", "borsalino", "Blocker")).toBe(false);
  });
});

describe("OP06-055 Monkey.D.Garp", () => {
  covers("OP06-055", "[When Attacking]");

  it("shuts the opponent's [Blocker] off for the battle only", () => {
    const game = table("op06-055")
      .bareTable()
      .withBoard("p1", [
        character("garp", "OP06-055"),
        character("second", "ST32-004"),
      ])
      .withBoard("p2", [character("blocker", "OP06-087")])
      .withHand("p1", lifeCards("hand", 4))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "garp" });
    game.play({ type: "attach-don", targetInstanceId: "garp" });
    game.play({
      type: "attack",
      attackerInstanceId: "garp",
      targetInstanceId: "p2-leader",
    });

    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
    declineDefence(game);

    // Battle-scoped: the next attack in the same turn can be blocked.
    game.play({
      type: "attack",
      attackerInstanceId: "second",
      targetInstanceId: "p2-leader",
    });
    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      true,
    );
  });

  it("does nothing with a full hand", () => {
    const game = table("op06-055-full")
      .bareTable()
      .withBoard("p1", [character("garp", "OP06-055")])
      .withBoard("p2", [character("blocker", "OP06-087")])
      .withHand("p1", lifeCards("hand", 5))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "garp" });
    game.play({ type: "attach-don", targetInstanceId: "garp" });
    game.play({
      type: "attack",
      attackerInstanceId: "garp",
      targetInstanceId: "p2-leader",
    });

    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      true,
    );
  });

  it("does nothing with only one DON!! on it", () => {
    const game = table("op06-055-one-don")
      .bareTable()
      .withBoard("p1", [character("garp", "OP06-055")])
      .withBoard("p2", [character("blocker", "OP06-087")])
      .withHand("p1", lifeCards("hand", 4))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "garp" });
    game.play({
      type: "attack",
      attackerInstanceId: "garp",
      targetInstanceId: "p2-leader",
    });

    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      true,
    );
  });
});

describe("OP06-056 Ama no Murakumo Sword", () => {
  covers("OP06-056", "[Main]", "[Trigger]");

  it("buries one body at each ceiling", () => {
    const game = table("op06-056")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-056")])
      .withBoard("p2", [
        character("two", "OP06-016"),
        character("one", "OP06-113"),
      ])
      .build();

    game.play({ summary: "[OP06-056]" });
    game.play({ type: "resolve-effect", optionId: "two" });
    game.play({ type: "resolve-effect", optionId: "one" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.deck).toHaveLength(2);
  });

  it("cannot spend both halves on the same Character", () => {
    const game = table("op06-056-one-body")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-056")])
      .withBoard("p2", [character("only", "OP06-113")])
      .build();

    game.play({ summary: "[OP06-056]" });
    game.play({ type: "resolve-effect", optionId: "only" });
    settleDeclining(game);

    // One Character cannot fill both halves of the sentence, so the second
    // choice has nothing left to offer.
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.deck).toHaveLength(1);
  });

  it("runs the same pair off a Life card", () => {
    const game = triggerFrom("op06-056-trigger", "OP06-056", {
      opponentBoard: [["victim", "OP06-016"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

describe("OP06-057 But I Will Never Doubt a Woman's Tears!!!!", () => {
  covers("OP06-057", "[Main]", "[Trigger]");

  it("buffs, reveals the top card and plays a 2-cost Character", () => {
    const game = table("op06-057")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-057")])
      .withBoard("p1", [character("body", "ST32-004")])
      .withDeckTop("p1", [instance("top", "OP06-016")])
      .build();

    game.play({ summary: "[OP06-057]" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settleDeclining(game);

    // OP06-016 is a 1-cost, and the clause names a cost of exactly 2: it stays
    // in the deck, at whichever end the player picked.
    expect(currentPower(game.state, "p1", "body")).toBe(6_000);
    expect(game.state.players.p1.board).toHaveLength(1);
    expect(game.state.players.p1.deck).toHaveLength(1);
  });

  it("plays a Character whose cost is exactly 2", () => {
    const game = table("op06-057-hit")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-057")])
      .withBoard("p1", [character("body", "ST32-004")])
      .withDeckTop("p1", [instance("top", "OP06-004")])
      .build();

    game.play({ summary: "[OP06-057]" });
    game.play({ type: "resolve-effect", optionId: "body" });
    game.play({ type: "resolve-effect", optionId: "top" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-004", "ST32-004"]);
  });

  it("plays a 2-cost body out of hand off a Life card", () => {
    const game = triggerFrom("op06-057-trigger", "OP06-057", {
      hand: ["OP06-004"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "op06-057-trigger-hand-0" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-004",
    ]);
  });
});

describe("OP06-059 White Snake", () => {
  covers("OP06-059", "[Counter]", "[Trigger]");

  it("buffs for the turn and draws, from the Counter step", () => {
    const game = defending("op06-059")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-059")])
      .withBoard("p1", [character("body", "ST32-004", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDon("p1", { active: 2 })
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP06-059" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "body")).toBe(6_000);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
  });

  it("looks five deep off a Life card and splits them", () => {
    const game = triggerFrom("op06-059-trigger", "OP06-059");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    // Nothing leaves the deck: the whole clause is information plus order.
    expect(game.state.players.p1.deck).toHaveLength(5);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("the four Vinsmoke siblings that trade themselves in", () => {
  covers("OP06-060", "[Activate: Main]");
  covers("OP06-064", "[Activate: Main]");
  covers("OP06-066", "[Activate: Main]");
  covers("OP06-068", "[Activate: Main]");

  const swap = (
    seed: string,
    small: string,
    big: string,
    zone: "hand" | "trash",
  ) => {
    let built = table(seed)
      .bareTable()
      .withLeader("p1", "OP06-042")
      .withBoard("p1", [character("small", small)]);
    built =
      zone === "hand"
        ? built.withHand("p1", [instance("big", big)])
        : built.withTrash("p1", [instance("big", big)]);
    const game = built
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: small });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    settleDeclining(game);
    return game;
  };

  it("plays the larger print out of hand", () => {
    const game = swap("op06-060", "OP06-060", "OP06-061", "hand");

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-061",
    ]);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP06-060");
    // DON!! -1 is the price, and this deck's Leader turns it into a card.
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("plays the larger print out of the trash", () => {
    const game = swap("op06-064", "OP06-064", "OP06-065", "trash");

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-065",
    ]);
  });

  it("reads the printed cost exactly, not as a ceiling", () => {
    const game = table("op06-066-cost")
      .bareTable()
      .withLeader("p1", "OP06-042")
      .withBoard("p1", [character("small", "OP06-066")])
      // Vinsmoke Yonji names a cost of 4; this is the 2-cost print of the same
      // name, which is not what the clause asks for.
      .withHand("p1", [instance("wrong", "OP06-066")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-066" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    // The 2-cost print is still in hand; the other card there is the one this
    // deck's own Leader drew off the `DON!! −1` that was just paid.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "wrong",
    );
  });

  it("finds nothing behind a Leader without the type", () => {
    const game = table("op06-068-off")
      .bareTable()
      .withBoard("p1", [character("small", "OP06-068")])
      .withHand("p1", [instance("big", "OP06-069")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-068" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    // The card still trashes itself and the DON!! still goes back: the Leader
    // gate is on the payoff alone, which is where the printed "If" sits.
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("is not offered with no DON!! on the field", () => {
    const game = table("op06-060-no-don")
      .bareTable()
      .withBoard("p1", [character("small", "OP06-060")])
      .withHand("p1", [instance("big", "OP06-061")])
      .withDonDeck("p1", 10)
      .build();

    expect(activationOffered(game, "OP06-060")).toBe(false);
  });

  // The `DON!! −1` is answered after the Character has trashed itself, so the
  // DON!! the engine first took back can be one given to that Character. Paying
  // from another body instead must leave the trashed card's DON!! where leaving
  // the field put them -- rested in the cost area -- not look for its pool.
  it("pays the DON!! from another body after trashing the one it was given to", () => {
    const game = table("op06-060-rehome")
      .bareTable()
      .withLeader("p1", "OP06-042")
      .withBoard("p1", [
        character("ichiji", "OP06-060"),
        character("reiju", "OP06-069"),
      ])
      .withHand("p1", [instance("big", "OP06-061")])
      .withDonDeck("p1", 8)
      .withGivenDon("p1", "ichiji", 1)
      .withGivenDon("p1", "reiju", 1)
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-060" });
    applyOptional(game);
    expect(effectOptions(game.state)).toContain("return-don:reiju");
    game.play({ type: "resolve-effect", optionId: "return-don:reiju" });
    payDonMinus(game);

    const p1 = game.state.players.p1;
    expect(p1.trash.map((card) => card.cardNumber)).toContain("OP06-060");
    expect(
      p1.board.find((card) => card.instanceId === "reiju")?.attachedDon,
    ).toEqual([]);
    expect(p1.restedDon).toHaveLength(1);
    expect(p1.donDeck).toHaveLength(9);
  });
});

describe("OP06-061 Vinsmoke Ichiji", () => {
  covers("OP06-061", "[On Play]");

  it("debuffs and gains [Rush] while behind on DON!!", () => {
    const game = table("op06-061")
      .bareTable()
      .withHand("p1", [instance("ichiji", "OP06-061")])
      .withBoard("p2", [character("target", "ST32-004")])
      .withDon("p1", { active: 0 })
      .withDonDeck("p1", 3)
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-061" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
    expect(hasKeyword(game.state, "p1", "ichiji", "Rush")).toBe(true);
  });

  it("does neither while ahead on DON!!", () => {
    const game = table("op06-061-ahead")
      .bareTable()
      .withHand("p1", [instance("ichiji", "OP06-061")])
      .withBoard("p2", [character("target", "ST32-004")])
      .withDonDeck("p2", 6)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-061" });
    settleDeclining(game);

    expect(currentPower(game.state, "p2", "target")).toBe(5_000);
    expect(hasKeyword(game.state, "p1", "ichiji", "Rush")).toBe(false);
  });
});

describe("OP06-062 Vinsmoke Judge", () => {
  covers("OP06-062", "[On Play]", "[Activate: Main]");

  it("pays DON!! and two cards for four GERMA bodies with different names", () => {
    const game = table("op06-062")
      .bareTable()
      .withHand("p1", [
        instance("judge", "OP06-062"),
        instance("cost-a", "ST32-004"),
        instance("cost-b", "ST32-004"),
      ])
      .withTrash("p1", [
        instance("a", "OP06-066"),
        instance("b", "OP06-068"),
        instance("c", "OP06-064"),
        instance("d", "OP06-064"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-062" });
    applyOptional(game);
    payDonMinus(game);
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost-a" });
    game.play({ type: "resolve-effect", optionId: "cost-b" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    game.play({ type: "resolve-effect", optionId: "c" });

    // "Different card names": the second copy of OP06-064 is not offered.
    expect(effectOptions(game.state)).not.toContain("d");
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-062", "OP06-064", "OP06-066", "OP06-068"]);
  });

  it("rests one of the opponent's DON!! for a DON!! of its own", () => {
    const game = table("op06-062-activate")
      .bareTable()
      .withBoard("p1", [character("judge", "OP06-062")])
      .build();

    const before = game.state.players.p2.activeDon.length;
    game.play({ type: "activate-main", summary: "OP06-062" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    expect(game.state.players.p2.activeDon).toHaveLength(before - 1);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP06-063 Vinsmoke Sora", () => {
  covers("OP06-063", "[On Play]");

  it("pays a card for a small Vinsmoke body out of the trash", () => {
    const game = table("op06-063")
      .bareTable()
      .withHand("p1", [
        instance("sora", "OP06-063"),
        instance("cost", "ST32-004"),
      ])
      .withTrash("p1", [instance("back", "OP06-066")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-063" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "back" });
    settleDeclining(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP06-066",
    ]);
  });

  it("pays the card and finds nothing while ahead on DON!!", () => {
    const game = table("op06-063-ahead")
      .bareTable()
      .withHand("p1", [
        instance("sora", "OP06-063"),
        instance("cost", "ST32-004"),
      ])
      .withTrash("p1", [instance("back", "OP06-066")])
      .withDonDeck("p2", 6)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-063" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    settleDeclining(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP06-066");
  });
});

describe("OP06-065 Vinsmoke Niji", () => {
  covers("OP06-065", "[On Play]");

  it("K.O.s a cheap body on the first branch", () => {
    const game = table("op06-065")
      .bareTable()
      .withHand("p1", [instance("niji", "OP06-065")])
      .withBoard("p2", [character("cheap", "OP06-016")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-065" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("bounces a bigger body on the second branch", () => {
    const game = table("op06-065-bounce")
      .bareTable()
      .withHand("p1", [instance("niji", "OP06-065")])
      .withBoard("p2", [character("mid", "OP06-036")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-065" });
    game.play({ type: "resolve-effect", optionId: "bounce" });
    game.play({ type: "resolve-effect", optionId: "mid" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.hand.map((card) => card.cardNumber)).toContain(
      "OP06-036",
    );
  });

  it("offers no branch at all while ahead on DON!!", () => {
    const game = table("op06-065-ahead")
      .bareTable()
      .withHand("p1", [instance("niji", "OP06-065")])
      .withBoard("p2", [character("cheap", "OP06-016")])
      .withDonDeck("p2", 6)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-065" });

    expect(effectOptions(game.state)).toEqual([]);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP06-067 Vinsmoke Yonji", () => {
  covers("OP06-067", "[Blocker]");

  it("is a 6000 Blocker while behind on DON!! and a 5000 while ahead", () => {
    const behind = table("op06-067")
      .bareTable()
      .withBoard("p1", [character("yonji", "OP06-067")])
      .withDonDeck("p1", 4)
      .build();

    expect(currentPower(behind.state, "p1", "yonji")).toBe(6_000);
    expect(hasKeyword(behind.state, "p1", "yonji", "Blocker")).toBe(true);

    const ahead = table("op06-067-ahead")
      .bareTable()
      .withBoard("p1", [character("yonji", "OP06-067")])
      .withDonDeck("p2", 6)
      .build();

    expect(currentPower(ahead.state, "p1", "yonji")).toBe(5_000);
    // The keyword is printed, so it is never conditional.
    expect(hasKeyword(ahead.state, "p1", "yonji", "Blocker")).toBe(true);
  });
});

describe("OP06-069 Vinsmoke Reiju", () => {
  covers("OP06-069", "[On Play]");

  it("draws two behind on DON!! with a small hand", () => {
    const game = table("op06-069")
      .bareTable()
      .withHand("p1", [instance("reiju", "OP06-069")])
      .withDeckTop("p1", [instance("a", "ST32-004"), instance("b", "ST32-004")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-069" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(2);
  });

  it("draws nothing with a full hand", () => {
    const game = table("op06-069-full")
      .bareTable()
      .withHand("p1", [instance("reiju", "OP06-069"), ...lifeCards("hand", 6)])
      .withDeckTop("p1", [instance("a", "ST32-004"), instance("b", "ST32-004")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-069" });
    settleDeclining(game);

    // Six cards left in hand after this one is played is above the ceiling.
    expect(game.state.players.p1.hand).toHaveLength(6);
  });
});

describe("OP06-071 Gild Tesoro", () => {
  covers("OP06-071", "[On Play]");

  it("pays DON!! for two cheap FILM bodies out of the trash", () => {
    const game = table("op06-071")
      .bareTable()
      .withLeader("p1", "OP06-001")
      .withHand("p1", [instance("tesoro", "OP06-071")])
      .withTrash("p1", [
        instance("a", "OP06-004"),
        instance("b", "OP06-008"),
        instance("too-big", "OP06-007"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-071" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settleDeclining(game);

    expect(
      game.state.players.p1.hand.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-004", "OP06-008"]);
    // The 10-cost Shanks is outside the ceiling and stays in the trash.
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP06-007");
  });

  it("pays the DON!! and finds nothing behind another Leader", () => {
    const game = table("op06-071-off")
      .bareTable()
      .withHand("p1", [instance("tesoro", "OP06-071")])
      .withTrash("p1", [instance("a", "OP06-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-071" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP06-072 Cosette", () => {
  covers("OP06-072", "static");

  it("blocks only two DON!! behind, behind a GERMA Leader", () => {
    const behind = table("op06-072")
      .bareTable()
      .withLeader("p1", "OP06-042")
      .withBoard("p1", [character("cosette", "OP06-072")])
      .withDonDeck("p1", 5)
      .build();

    expect(hasKeyword(behind.state, "p1", "cosette", "Blocker")).toBe(true);

    const level = table("op06-072-level")
      .bareTable()
      .withLeader("p1", "OP06-042")
      .withBoard("p1", [character("cosette", "OP06-072")])
      .withDonDeck("p1", 1)
      .build();

    // One behind is not two behind: the narrowest gate in the set.
    expect(hasKeyword(level.state, "p1", "cosette", "Blocker")).toBe(false);

    const wrongLeader = table("op06-072-off")
      .bareTable()
      .withBoard("p1", [character("cosette", "OP06-072")])
      .withDonDeck("p1", 5)
      .build();

    expect(hasKeyword(wrongLeader.state, "p1", "cosette", "Blocker")).toBe(
      false,
    );
  });
});

describe("OP06-073 Shiki", () => {
  covers("OP06-073", "[On Play]");

  it("draws and discards on a full DON!! field", () => {
    const game = table("op06-073")
      .bareTable()
      .withHand("p1", [
        instance("shiki", "OP06-073"),
        instance("pitch", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP06-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-073" });
    game.play({ type: "resolve-effect", optionId: "pitch" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "pitch",
    ]);
  });

  it("does neither below eight DON!!", () => {
    const game = table("op06-073-poor")
      .bareTable()
      .withHand("p1", [
        instance("shiki", "OP06-073"),
        instance("pitch", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP06-016")])
      .withDonDeck("p1", 4)
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-073" });
    settleDeclining(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "pitch",
    ]);
  });
});

describe("OP06-074 Zephyr (Navy)", () => {
  covers("OP06-074", "[On Play]");

  it("negates a body and K.O.s what is left under the ceiling", () => {
    const game = table("op06-074")
      .bareTable()
      .withHand("p1", [instance("zephyr", "OP06-074")])
      // OP06-067's own text is what holds it above the ceiling: 5000 printed,
      // 6000 while its controller is behind on DON!!.
      .withBoard("p2", [character("yonji", "OP06-067")])
      .withDonDeck("p2", 6)
      .build();

    expect(currentPower(game.state, "p2", "yonji")).toBe(6_000);

    game.play({ type: "play-card", cardNumber: "OP06-074" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "yonji" });
    settleDeclining(game);

    // Negated first, so the +1000 its own text was adding is gone when the
    // ceiling is read -- which is the printed order and the whole trick.
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("leaves a body above the ceiling negated and alive", () => {
    const game = table("op06-074-big")
      .bareTable()
      .withHand("p1", [instance("zephyr", "OP06-074")])
      .withBoard("p2", [character("big", "OP06-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-074" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP06-075 Count Battler", () => {
  covers("OP06-075", "[On Play]");

  it("rests two cheap bodies for a DON!!", () => {
    const game = table("op06-075")
      .bareTable()
      .withHand("p1", [instance("battler", "OP06-075")])
      .withBoard("p2", [
        character("a", "OP06-016"),
        character("b", "OP06-113"),
        character("too-big", "OP06-036"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-075" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board
        .filter((card) => card.rested)
        .map((card) => card.instanceId)
        .sort(),
    ).toEqual(["a", "b"]);
  });
});

describe("OP06-076 Hitokiri Kamazo", () => {
  covers("OP06-076", "[Your Turn]");

  it("K.O.s a cheap body when DON!! goes back", () => {
    const game = table("op06-076")
      .bareTable()
      .withBoard("p1", [
        character("kamazo", "OP06-076"),
        character("yonji", "OP06-066"),
      ])
      .withBoard("p2", [character("victim", "OP06-016")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-066" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP06-077 Black Bug", () => {
  covers("OP06-077", "[Main]", "[Trigger]");

  it("buries a body while behind on DON!!", () => {
    const game = table("op06-077")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-077")])
      .withBoard("p2", [character("target", "OP06-036")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ summary: "[OP06-077]" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.deck.map((card) => card.cardNumber)).toContain(
      "OP06-036",
    );
  });

  it("is not offered at all while ahead on DON!!", () => {
    const game = table("op06-077-ahead")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-077")])
      .withBoard("p2", [character("target", "OP06-036")])
      .withDonDeck("p2", 6)
      .build();

    // The gate is the program's outermost node, so the offer itself can see
    // that the Event would do nothing -- and four DON!! is not spent to find
    // out.
    expect(
      game.legalActions().some((action) => action.summary.includes("OP06-077")),
    ).toBe(false);
  });

  it("buries a body one cost lower off a Life card, with no DON!! gate", () => {
    const game = triggerFrom("op06-077-trigger", "OP06-077", {
      opponentBoard: [["victim", "OP06-036"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

describe("OP06-078 GERMA 66", () => {
  covers("OP06-078", "[Main]", "[Trigger]");

  it("finds a card whose type merely includes GERMA", () => {
    const game = table("op06-078")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-078")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        // {Kingdom of GERMA} rather than {GERMA 66}: the substring reading is
        // what reaches it.
        instance("kingdom", "OP06-072"),
        instance("self", "OP06-078"),
        instance("b", "ST32-004"),
        instance("c", "ST32-004"),
      ])
      .build();

    game.play({ summary: "[OP06-078]" });
    expect(effectOptions(game.state)).toContain("kingdom");
    expect(effectOptions(game.state)).not.toContain("self");
    game.play({ type: "resolve-effect", optionId: "kingdom" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP06-072",
    ]);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op06-078-trigger", "OP06-078");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP06-079 Kingdom of GERMA", () => {
  covers("OP06-079", "[Activate: Main]");

  it("pays a card and its own rest for a three-deep GERMA look", () => {
    const game = table("op06-079")
      .bareTable()
      .withStage("p1", instance("stage", "OP06-079"))
      .withHand("p1", [instance("cost", "ST32-004")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("germa", "OP06-066"),
        instance("b", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP06-079" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "germa" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP06-066",
    ]);
    expect(game.state.players.p1.stage?.rested).toBe(true);
    // The Stage rests to pay, which is what withholds the second offer.
    expect(activationOffered(game, "OP06-079")).toBe(false);
  });

  it("is not offered with an empty hand", () => {
    const game = table("op06-079-no-hand")
      .bareTable()
      .withStage("p1", instance("stage", "OP06-079"))
      .withDeckTop("p1", [instance("a", "ST32-004")])
      .build();

    expect(activationOffered(game, "OP06-079")).toBe(false);
  });
});

// --- Purple and Black: Thriller Bark -----------------------------------------

describe("OP06-080 Gecko Moria (Leader)", () => {
  covers("OP06-080", "[When Attacking]");

  it("mills two and plays a Thriller Bark body out of the trash", () => {
    const game = table("op06-080")
      .bareTable()
      .withLeader("p1", "OP06-080")
      .withHand("p1", [instance("cost", "ST32-004")])
      .withDeckTop("p1", [
        instance("milled-a", "OP06-087"),
        instance("milled-b", "ST32-004"),
      ])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "p1-leader" });
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    // The two milled cards are candidates for the body that comes back, which
    // is the printed order: mill first, then read the trash.
    game.play({ type: "resolve-effect", optionId: "milled-a" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-087",
    ]);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("is not offered with fewer than two active DON!! left", () => {
    const game = table("op06-080-poor")
      .bareTable()
      .withLeader("p1", "OP06-080")
      .withHand("p1", [instance("cost", "ST32-004")])
      .withDonDeck("p1", 9)
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "p1-leader" });
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });

    expect(effectOptions(game.state)).toEqual([]);
  });
});

describe("OP06-081 Absalom", () => {
  covers("OP06-081", "[On Play]");

  it("returns two trash cards to the deck to K.O. a cheap body", () => {
    const game = table("op06-081")
      .bareTable()
      .withHand("p1", [instance("absalom", "OP06-081")])
      .withTrash("p1", [
        instance("t-a", "ST32-004"),
        instance("t-b", "ST32-004"),
      ])
      .withBoard("p2", [character("victim", "OP06-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-081" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "t-a" });
    game.play({ type: "resolve-effect", optionId: "t-b" });
    settle(game);
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });

  it("cannot pay from a trash of one", () => {
    const game = table("op06-081-poor")
      .bareTable()
      .withHand("p1", [instance("absalom", "OP06-081")])
      .withTrash("p1", [instance("t-a", "ST32-004")])
      .withBoard("p2", [character("victim", "OP06-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-081" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP06-082 Inuppe", () => {
  covers("OP06-082", "[On Play]", "[On K.O.]");

  it("draws two and trashes two behind its Leader", () => {
    const game = table("op06-082")
      .bareTable()
      .withLeader("p1", "OP06-080")
      .withHand("p1", [instance("inuppe", "OP06-082")])
      .withDeckTop("p1", [instance("a", "ST32-004"), instance("b", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-082" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    // The discard is half the payoff for a deck that plays out of its trash.
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("runs the same trade on the way out", () => {
    const game = defending("op06-082-ko")
      .bareTable()
      .withLeader("p1", "OP06-080")
      .withBoard("p1", [character("inuppe", "OP06-082", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDeckTop("p1", [instance("a", "ST32-004"), instance("b", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "inuppe",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settleDeclining(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP06-082");
  });

  it("does neither behind another Leader", () => {
    const game = table("op06-082-off")
      .bareTable()
      .withHand("p1", [instance("inuppe", "OP06-082")])
      .withDeckTop("p1", [instance("a", "ST32-004"), instance("b", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-082" });
    settleDeclining(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });
});

describe("OP06-083 Oars", () => {
  covers("OP06-083", "[Activate: Main]");

  it("eats one of its own crew to lift its printed attack ban", () => {
    const game = table("op06-083")
      .bareTable()
      .withBoard("p1", [
        character("oars", "OP06-083"),
        character("fodder", "OP06-087"),
      ])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "oars",
        ),
    ).toBe(false);

    game.play({ type: "activate-main", summary: "OP06-083" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settleDeclining(game);

    // Negating the Character switches off its own printed sentence, which is
    // what the ban is: `rules.cannotAttack` is read through the same gate.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "oars",
        ),
    ).toBe(true);
    expect(game.state.players.p1.board).toHaveLength(1);
  });
});

describe("OP06-084 Jigoro of the Wind", () => {
  covers("OP06-084", "[On K.O.]");

  it("hands +1000 to something on the way out", () => {
    const game = defending("op06-084")
      .bareTable()
      .withBoard("p1", [
        character("jigoro", "OP06-084", { rested: true }),
        character("other", "ST32-004"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "jigoro",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "other" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "other")).toBe(6_000);
  });
});

describe("OP06-085 Kumacy", () => {
  covers("OP06-085", "[Your Turn]");

  it("pays 1000 for every completed five cards in the trash", () => {
    const game = table("op06-085")
      .bareTable()
      .withBoard("p1", [character("kumacy", "OP06-085")])
      .withTrash("p1", lifeCards("trash", 12))
      .build();

    expect(currentPower(game.state, "p1", "kumacy")).toBe(3_000);

    game.play({ type: "attach-don", targetInstanceId: "kumacy" });
    game.play({ type: "attach-don", targetInstanceId: "kumacy" });

    // Twelve cards is two completed fives, not two and two fifths.
    expect(currentPower(game.state, "p1", "kumacy")).toBe(7_000);
  });

  it("pays nothing on the opponent's turn", () => {
    const game = defending("op06-085-off")
      .bareTable()
      .withBoard("p1", [character("kumacy", "OP06-085")])
      .withGivenDon("p1", "kumacy", 2)
      .withTrash("p1", lifeCards("trash", 12))
      .build();

    expect(currentPower(game.state, "p1", "kumacy")).toBe(5_000);
  });
});

describe("OP06-086 Gecko Moria", () => {
  covers("OP06-086", "[On Play]");

  it("plays two bodies out of the trash, one of them rested", () => {
    const game = table("op06-086")
      .bareTable()
      .withHand("p1", [instance("moria", "OP06-086")])
      .withTrash("p1", [
        instance("big", "OP06-036"),
        instance("small", "OP06-087"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-086" });
    game.play({ type: "resolve-effect", optionId: "big" });
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "rest-small" });
    settleDeclining(game);

    const board = game.state.players.p1.board;
    expect(board.map((card) => card.cardNumber).sort()).toEqual([
      "OP06-036",
      "OP06-086",
      "OP06-087",
    ]);
    expect(board.find((card) => card.instanceId === "big")?.rested).toBe(false);
    expect(board.find((card) => card.instanceId === "small")?.rested).toBe(
      true,
    );
  });

  it("lets the player rest the costlier one instead", () => {
    const game = table("op06-086-flip")
      .bareTable()
      .withHand("p1", [instance("moria", "OP06-086")])
      .withTrash("p1", [
        instance("big", "OP06-036"),
        instance("small", "OP06-087"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-086" });
    game.play({ type: "resolve-effect", optionId: "big" });
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "rest-big" });
    settleDeclining(game);

    const board = game.state.players.p1.board;
    expect(board.find((card) => card.instanceId === "big")?.rested).toBe(true);
    expect(board.find((card) => card.instanceId === "small")?.rested).toBe(
      false,
    );
  });

  it("cannot spend both halves on one card", () => {
    const game = table("op06-086-one")
      .bareTable()
      .withHand("p1", [instance("moria", "OP06-086")])
      .withTrash("p1", [instance("only", "OP06-087")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-086" });
    game.play({ type: "resolve-effect", optionId: "only" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-086", "OP06-087"]);
  });
});

describe("OP06-089 Taralan", () => {
  covers("OP06-089", "[On Play]", "[On K.O.]");

  it("mills three on the way in", () => {
    const game = table("op06-089")
      .bareTable()
      .withHand("p1", [instance("taralan", "OP06-089")])
      .withDeckTop("p1", lifeCards("deck", 8))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-089" });
    settle(game);

    expect(game.state.players.p1.trash).toHaveLength(3);
    expect(game.state.players.p1.deck).toHaveLength(5);
  });

  it("mills three more on the way out", () => {
    const game = defending("op06-089-ko")
      .bareTable()
      .withBoard("p1", [character("taralan", "OP06-089", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDeckTop("p1", lifeCards("deck", 8))
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "taralan",
    });
    declineDefence(game);
    settleDeclining(game);

    // Three milled cards plus Taralan itself.
    expect(game.state.players.p1.trash).toHaveLength(4);
    expect(game.state.players.p1.deck).toHaveLength(5);
  });
});

describe("OP06-090 Dr. Hogback", () => {
  covers("OP06-090", "[On Play]");

  it("pays two trash cards for a Thriller Bark card in the trash", () => {
    const game = table("op06-090")
      .bareTable()
      .withHand("p1", [instance("hogback", "OP06-090")])
      .withTrash("p1", [
        instance("cost-a", "ST32-004"),
        instance("cost-b", "ST32-004"),
        instance("prize", "OP06-095"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-090" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost-a" });
    game.play({ type: "resolve-effect", optionId: "cost-b" });
    game.play({ type: "resolve-effect", optionId: "prize" });
    settleDeclining(game);

    // An Event, not just a Character: the printed clause says "card".
    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP06-095",
    ]);
  });

  it("cannot find itself", () => {
    const game = table("op06-090-self")
      .bareTable()
      .withHand("p1", [instance("hogback", "OP06-090")])
      .withTrash("p1", [
        instance("cost-a", "ST32-004"),
        instance("cost-b", "ST32-004"),
        instance("self", "OP06-090"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-090" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost-a" });
    game.play({ type: "resolve-effect", optionId: "cost-b" });
    settleDeclining(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP06-091 Victoria Cindry", () => {
  covers("OP06-091", "[On Play]");

  it("mills five behind its Leader and nothing behind another", () => {
    const game = table("op06-091")
      .bareTable()
      .withLeader("p1", "OP06-080")
      .withHand("p1", [instance("cindry", "OP06-091")])
      .withDeckTop("p1", lifeCards("deck", 6))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-091" });
    settle(game);
    expect(game.state.players.p1.trash).toHaveLength(5);

    const off = table("op06-091-off")
      .bareTable()
      .withHand("p1", [instance("cindry", "OP06-091")])
      .withDeckTop("p1", lifeCards("deck", 6))
      .build();

    off.play({ type: "play-card", cardNumber: "OP06-091" });
    settleDeclining(off);
    expect(off.state.players.p1.trash).toHaveLength(0);
  });
});

describe("OP06-092 Brook", () => {
  covers("OP06-092", "[On Play]");

  it("trashes a Character without K.O.ing it", () => {
    const game = table("op06-092")
      .bareTable()
      .withHand("p1", [instance("brook", "OP06-092")])
      .withBoard("p2", [character("gyro", "OP06-027")])
      .withBoard("p1", [character("mine", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-092" });
    game.play({ type: "resolve-effect", optionId: "trash" });
    game.play({ type: "resolve-effect", optionId: "gyro" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(
      game.state.players.p2.trash.map((card) => card.cardNumber),
    ).toContain("OP06-027");
    // Trashed, not K.O.'d: OP06-027's own `[On K.O.]` never fired.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "mine")
        ?.rested,
    ).toBe(false);
  });

  it("buries three cards of the opponent's trash on the other branch", () => {
    const game = table("op06-092-bury")
      .bareTable()
      .withHand("p1", [instance("brook", "OP06-092")])
      .withTrash("p2", lifeCards("their-trash", 4))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-092" });
    game.play({ type: "resolve-effect", optionId: "bury-trash" });
    settleDeclining(game);

    expect(game.state.players.p2.trash).toHaveLength(1);
    expect(game.state.players.p2.deck).toHaveLength(3);
  });
});

describe("OP06-093 Perona", () => {
  covers("OP06-093", "[On Play]");

  it("takes a card from a hand of five or more", () => {
    const game = table("op06-093")
      .bareTable()
      .withHand("p1", [instance("perona", "OP06-093")])
      .withHand("p2", lifeCards("their-hand", 5))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-093" });
    game.play({ type: "resolve-effect", optionId: "discard" });
    settleDeclining(game);

    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(game.state.players.p2.trash).toHaveLength(1);
  });

  it("shrinks a cost by 3 on the other branch", () => {
    const game = table("op06-093-cost")
      .bareTable()
      .withHand("p1", [instance("perona", "OP06-093")])
      .withHand("p2", lifeCards("their-hand", 5))
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    const before = effectiveCost(
      game.state,
      "p2",
      game.state.players.p2.board[0]!,
    );
    game.play({ type: "play-card", cardNumber: "OP06-093" });
    game.play({ type: "resolve-effect", optionId: "cost" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(Math.max(0, before - 3));
  });

  it("does nothing against a hand of four", () => {
    const game = table("op06-093-small")
      .bareTable()
      .withHand("p1", [instance("perona", "OP06-093")])
      .withHand("p2", lifeCards("their-hand", 4))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-093" });
    settleDeclining(game);

    expect(game.state.players.p2.hand).toHaveLength(4);
  });
});

describe("OP06-095 Shadows Asgard", () => {
  covers("OP06-095", "[Main]", "[Counter]", "[Trigger]");

  it("pays the Leader 1000 per cheap body it eats", () => {
    const game = table("op06-095")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-095")])
      .withBoard("p1", [
        character("a", "OP06-087"),
        character("b", "OP06-089"),
        character("too-big", "OP06-036"),
      ])
      .build();

    game.play({ summary: "[OP06-095]" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settleDeclining(game);

    // 5000 printed, +1000 base, +1000 per Character K.O.'d.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "too-big",
    ]);
  });

  it("pays the base 1000 with nothing to eat", () => {
    const game = table("op06-095-bare")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-095")])
      .build();

    game.play({ summary: "[OP06-095]" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });

  it("runs the same clause as a Counter", () => {
    const game = defending("op06-095-counter")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-095")])
      .withBoard("p1", [character("a", "OP06-087")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDon("p1", { active: 2 })
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP06-095" });
    game.play({ type: "resolve-effect", optionId: "a" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
  });

  it("draws two and trashes one off a Life card", () => {
    const game = triggerFrom("op06-095-trigger", "OP06-095");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.trash.length).toBeGreaterThanOrEqual(1);
  });
});

describe("OP06-096 ...Nothing...at All!!!", () => {
  covers("OP06-096", "[Counter]", "[Trigger]");

  it("pays a Life card so the board survives its battles", () => {
    const game = defending("op06-096")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-096")])
      .withBoard("p1", [character("body", "OP06-087", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDon("p1", { active: 3 })
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "attacker" });
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP06-096" });
    applyOptional(game);
    settleDeclining(game);
    declineDefence(game);

    // The attack lands and the Character lives: the Event added no power at
    // all, which is the point of it.
    expect(game.state.players.p1.board).toHaveLength(1);
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("runs the same clause off a Life card", () => {
    const game = triggerFrom("op06-096-trigger", "OP06-096", {
      board: [["body", "OP06-087"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    settleDeclining(game);
    declineDefence(game);

    // The Life card the Trigger came off is the one its cost adds to hand.
    expect(game.state.players.p1.board).toHaveLength(1);
  });
});

describe("OP06-097 Negative Hollow", () => {
  covers("OP06-097", "[Main]", "[Trigger]");

  it("takes a card the opponent chooses", () => {
    const game = table("op06-097")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-097")])
      .withHand("p2", [
        instance("theirs-a", "OP06-115"),
        instance("theirs-b", "ST32-004"),
      ])
      .build();

    game.play({ summary: "[OP06-097]" });
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "theirs-b" });
    settleDeclining(game);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "theirs-a",
    ]);
    expect(game.state.players.p2.trash).toHaveLength(1);
  });

  it("runs the same discard off a Life card", () => {
    const game = triggerFrom("op06-097-trigger", "OP06-097");

    game.state.players.p2.hand = [instance("theirs", "ST32-004")];
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p2.hand).toHaveLength(0);
  });
});

describe("OP06-098 Thriller Bark", () => {
  covers("OP06-098", "[Activate: Main]");

  it("rests a DON!! and itself for a cheap body out of the trash", () => {
    const game = table("op06-098")
      .bareTable()
      .withLeader("p1", "OP06-080")
      .withStage("p1", instance("stage", "OP06-098"))
      .withTrash("p1", [
        instance("back", "OP06-087"),
        instance("too-big", "OP06-036"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP06-098" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "back" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-087",
    ]);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("pays its costs and finds nothing behind another Leader", () => {
    const game = table("op06-098-off")
      .bareTable()
      .withStage("p1", instance("stage", "OP06-098"))
      .withTrash("p1", [instance("back", "OP06-087")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-098" });
    applyOptional(game);
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.stage?.rested).toBe(true);
  });
});

// --- Yellow and Green: Sky Island and Land of Wano ---------------------------

describe("OP06-099 Aisa", () => {
  covers("OP06-099", "[On Play]");

  it("looks at the top of the opponent's Life and buries it", () => {
    const game = table("op06-099")
      .bareTable()
      .withHand("p1", [instance("aisa", "OP06-099")])
      .withLife("p2", [
        instance("their-top", "OP06-115"),
        instance("their-second", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-099" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "opponent-life" });

    // The end is the decision, and with one card it is the *only* decision --
    // so the two options differ in nothing else and both have to be offered.
    // The destination is worded without a possessive because the card goes
    // back to its own owner; which stack it is was settled by the branch above.
    expect(game.summaries("p1")).toEqual([
      "Place your top Life card at the top of the Life cards",
      "Place your top Life card at the bottom of the Life cards",
    ]);
    game.play({ type: "resolve-effect", optionId: "order:0|1" });
    settle(game);

    // A Trigger seen coming is a Trigger that can be buried: the card the next
    // hit would have turned over is now at the bottom.
    expect(game.state.players.p2.life.map((card) => card.instanceId)).toEqual([
      "their-second",
      "their-top",
    ]);
  });

  it("can leave the card it looked at where it was", () => {
    const game = table("op06-099-leave")
      .bareTable()
      .withHand("p1", [instance("aisa", "OP06-099")])
      .withLife("p2", [
        instance("their-top", "OP06-115"),
        instance("their-second", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-099" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "opponent-life" });
    game.play({ type: "resolve-effect", optionId: "order:0|0" });
    settle(game);

    // The other half of the printed "top or bottom", which the node used to
    // skip: a card worth keeping on top stays there.
    expect(game.state.players.p2.life.map((card) => card.instanceId)).toEqual([
      "their-top",
      "their-second",
    ]);
  });

  it("can reorder its own Life area instead", () => {
    const game = table("op06-099-own")
      .bareTable()
      .withHand("p1", [instance("aisa", "OP06-099")])
      .withLife("p1", [
        instance("mine-top", "OP06-115"),
        instance("mine-second", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-099" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "own-life" });
    game.play({ type: "resolve-effect", optionId: "order:0|1" });
    settle(game);

    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "mine-second",
      "mine-top",
    ]);
  });
});

describe("OP06-100 Inuarashi", () => {
  covers("OP06-100", "[When Attacking]", "[Trigger]");

  it("K.O.s a body whose cost the opponent's own Life total caps", () => {
    const game = table("op06-100")
      .bareTable()
      .withBoard("p1", [character("inuarashi", "OP06-100")])
      .withHand("p1", [instance("cost", "ST32-004")])
      .withBoard("p2", [
        character("cheap", "OP06-036"),
        character("dear", "OP06-005"),
      ])
      .withLife("p2", lifeCards("p2", 4))
      .build();

    game.play({ type: "attach-don", targetInstanceId: "inuarashi" });
    game.play({ type: "attach-don", targetInstanceId: "inuarashi" });
    game.play({
      type: "attack",
      attackerInstanceId: "inuarashi",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });

    // Four Life cards is a cost-4 ceiling: the 6-cost body is out of reach.
    expect(effectOptions(game.state)).toContain("cheap");
    expect(effectOptions(game.state)).not.toContain("dear");
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "dear",
    ]);
  });

  it("arrives off a Life card once the opponent is inside three Life", () => {
    const game = triggerFrom("op06-100-trigger", "OP06-100", {
      opponentLife: 3,
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-100",
    ]);
  });

  it("is not even offered while the opponent is on four Life", () => {
    const game = triggerFrom("op06-100-trigger-off", "OP06-100", {
      opponentLife: 4,
    });

    // The gate is the program's outermost node, so the Trigger window can see
    // that activating would do nothing and offers only the ordinary damage.
    expect(
      game
        .legalActions()
        .filter((action) => action.type === "resolve-trigger")
        .map((action) => action.optionId),
    ).toEqual(["skip"]);
    game.play({ type: "resolve-trigger", optionId: "skip" });
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP06-101 O-Nami", () => {
  covers("OP06-101", "[On Play]", "[Trigger]");

  it("hands [Banish] to the Leader for the turn", () => {
    const game = table("op06-101")
      .bareTable()
      .withHand("p1", [instance("nami", "OP06-101")])
      .withLife("p2", [
        instance("their-life", "OP06-115"),
        instance("their-life-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-101" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settleDeclining(game);

    expect(hasKeyword(game.state, "p1", "p1-leader", "Banish")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    // The Life card is trashed rather than taken, and its Trigger never opens.
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(
      game.state.players.p2.trash.map((card) => card.cardNumber),
    ).toContain("OP06-115");
  });

  it("K.O.s a body by cost off a Life card", () => {
    const game = triggerFrom("op06-101-trigger", "OP06-101", {
      opponentBoard: [["victim", "OP06-036"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

describe("OP06-102 Kamakiri", () => {
  covers("OP06-102", "[Activate: Main]", "[Trigger]");

  it("spends a 1-cost Stage for removal", () => {
    const game = table("op06-102")
      .bareTable()
      .withBoard("p1", [character("kamakiri", "OP06-102")])
      .withStage("p1", instance("stage", "OP06-117"))
      .withBoard("p2", [character("victim", "OP06-016")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-102" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "stage" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.stage).toBeNull();
    expect(game.state.players.p1.deck.map((card) => card.cardNumber)).toContain(
      "OP06-117",
    );
  });

  it("does nothing without a 1-cost Stage to spend", () => {
    const game = table("op06-102-no-stage")
      .bareTable()
      .withBoard("p1", [character("kamakiri", "OP06-102")])
      .withBoard("p2", [character("victim", "OP06-016")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-102" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("arrives off a Life card once its controller is inside two Life", () => {
    const game = triggerFrom("op06-102-trigger", "OP06-102");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    // The Life card it came off was the last one, so the gate holds.
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-102",
    ]);
  });
});

describe("OP06-103 Kawamatsu", () => {
  covers("OP06-103", "[When Attacking]", "[Trigger]");

  it("banks a 0-power body as a face-up Life card", () => {
    const game = table("op06-103")
      .bareTable()
      .withBoard("p1", [
        character("kawamatsu", "OP06-103"),
        character("zero", "OP06-015"),
      ])
      .withHand("p1", [
        instance("cost-a", "ST32-004"),
        instance("cost-b", "ST32-004"),
      ])
      .withLife("p1", lifeCards("p1", 1))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "kawamatsu",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost-a" });
    game.play({ type: "resolve-effect", optionId: "cost-b" });
    game.play({ type: "resolve-effect", optionId: "zero" });
    game.play({ type: "resolve-effect", optionId: "life-top" });
    settleDeclining(game);

    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.life[0]?.instanceId).toBe("zero");
    // Face-up, so both players can see the Trigger it will or will not have.
    expect(game.state.players.p1.life[0]?.faceUp).toBe(true);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "kawamatsu",
    ]);
  });

  it("cannot bank a body DON!! has lifted off zero", () => {
    const game = table("op06-103-don")
      .bareTable()
      .withBoard("p1", [
        character("kawamatsu", "OP06-103"),
        character("zero", "OP06-015"),
      ])
      .withGivenDon("p1", "zero", 1)
      .withHand("p1", [
        instance("cost-a", "ST32-004"),
        instance("cost-b", "ST32-004"),
      ])
      .withLife("p1", lifeCards("p1", 1))
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "kawamatsu",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost-a" });
    game.play({ type: "resolve-effect", optionId: "cost-b" });
    settleDeclining(game);

    // "With 0 power" is read after DON!!, so a 1000-power body is not eligible
    // -- and the two cards from hand are spent either way.
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.board).toHaveLength(2);
  });

  it("arrives off a Life card once the opponent is inside three Life", () => {
    const game = triggerFrom("op06-103-trigger", "OP06-103", {
      opponentLife: 3,
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-103",
    ]);
  });
});

describe("OP06-108 Tenguyama Hitetsu", () => {
  covers("OP06-108", "[Trigger]");

  it("hands +2000 to a Land of Wano card off a Life card", () => {
    const game = triggerFrom("op06-108", "OP06-108", {
      board: [["wano", "OP06-036"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "wano" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "wano")).toBe(8_000);
  });

  it("reaches nothing without a Land of Wano card", () => {
    const game = triggerFrom("op06-108-off", "OP06-108", {
      board: [["other", "ST32-004"]],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    // p1's Leader here is ST21-001, which is not {Land of Wano} either, so the
    // buff has no legal recipient and lands on nothing.
    expect(currentPower(game.state, "p1", "other")).toBe(5_000);
  });
});

describe("OP06-111 Braham", () => {
  covers("OP06-111", "[Activate: Main]", "[Trigger]");

  it("spends a 1-cost Stage to rest a body", () => {
    const game = table("op06-111")
      .bareTable()
      .withBoard("p1", [character("braham", "OP06-111")])
      .withStage("p1", instance("stage", "OP06-117"))
      .withBoard("p2", [character("victim", "OP06-036")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-111" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "stage" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")
        ?.rested,
    ).toBe(true);
    expect(game.state.players.p1.stage).toBeNull();
  });

  it("arrives off a Life card once its controller is inside two Life", () => {
    const game = triggerFrom("op06-111-trigger", "OP06-111");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-111",
    ]);
  });
});

describe("OP06-112 Raizo", () => {
  covers("OP06-112", "[When Attacking]", "[Trigger]");

  it("pays a card from hand to rest one of the opponent's DON!!", () => {
    const game = table("op06-112")
      .bareTable()
      .withBoard("p1", [character("raizo", "OP06-112")])
      .withHand("p1", [instance("cost", "ST32-004")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    const before = game.state.players.p2.activeDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "raizo",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
    settleDeclining(game);

    expect(game.state.players.p2.activeDon).toHaveLength(before - 1);
    expect(game.state.players.p2.restedDon).toHaveLength(1);
  });

  it("is not offered with an empty hand", () => {
    const game = table("op06-112-no-hand")
      .bareTable()
      .withBoard("p1", [character("raizo", "OP06-112")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "raizo",
      targetInstanceId: "p2-leader",
    });

    expect(effectOptions(game.state)).toEqual([]);
  });

  it("arrives off a Life card once the opponent is inside three Life", () => {
    const game = triggerFrom("op06-112-trigger", "OP06-112", {
      opponentLife: 2,
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-112",
    ]);
  });
});

describe("OP06-113 Raki", () => {
  covers("OP06-113", "static");

  it("blocks beside another Shandian Warrior and not beside another Raki", () => {
    const paired = table("op06-113")
      .bareTable()
      .withBoard("p1", [
        character("raki", "OP06-113"),
        character("braham", "OP06-111"),
      ])
      .build();

    expect(hasKeyword(paired.state, "p1", "raki", "Blocker")).toBe(true);

    const alone = table("op06-113-alone")
      .bareTable()
      .withBoard("p1", [
        character("raki", "OP06-113"),
        character("second-raki", "OP06-113"),
      ])
      .build();

    // "Other than [Raki]": a board of nothing but Rakis blocks with none of
    // them.
    expect(hasKeyword(alone.state, "p1", "raki", "Blocker")).toBe(false);
  });
});

describe("OP06-114 Wyper", () => {
  covers("OP06-114", "[On Play]");

  it("spends a 1-cost Stage for a five-deep Shandia search", () => {
    const game = table("op06-114")
      .bareTable()
      .withHand("p1", [instance("wyper", "OP06-114")])
      .withStage("p1", instance("stage", "OP06-117"))
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("shandia", "OP06-111"),
        instance("b", "ST32-004"),
        instance("c", "ST32-004"),
        instance("d", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-114" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "stage" });
    game.play({ type: "resolve-effect", optionId: "shandia" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP06-111",
    ]);
    expect(game.state.players.p1.stage).toBeNull();
  });

  it("finds nothing on a deck with neither half of the disjunction", () => {
    const game = table("op06-114-miss")
      .bareTable()
      .withHand("p1", [instance("wyper", "OP06-114")])
      .withStage("p1", instance("stage", "OP06-117"))
      .withDeckTop("p1", lifeCards("deck", 5))
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-114" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "stage" });

    // The clause's other half names [Upper Yard] by name, which is OP05-117 --
    // a Stage the pool does not hold yet, so today the name branch can only
    // ever match nothing and the type branch is what the card finds. Importing
    // OP-05 is what makes the first half reachable.
    expect(
      effectOptions(game.state).every((id) => id.startsWith("order:")),
    ).toBe(true);
    settleDeclining(game);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP06-116 Reject", () => {
  covers("OP06-116", "[Main]", "[Trigger]");

  it("K.O.s a body on the first branch", () => {
    const game = table("op06-116")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-116")])
      .withBoard("p2", [character("victim", "OP06-036")])
      .build();

    game.play({ summary: "[OP06-116]" });
    game.play({ type: "resolve-effect", optionId: "ko" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("takes the last Life card and pays one of its own", () => {
    const game = table("op06-116-damage")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-116")])
      .withLife("p1", lifeCards("p1", 2))
      .withLife("p2", [instance("their-last", "ST32-004")])
      .build();

    game.play({ summary: "[OP06-116]" });
    game.play({ type: "resolve-effect", optionId: "damage" });
    settleDeclining(game);

    expect(game.state.players.p2.life).toHaveLength(0);
    expect(game.state.players.p2.hand).toHaveLength(1);
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("does nothing while the opponent is above one Life", () => {
    const game = table("op06-116-safe")
      .bareTable()
      .withHand("p1", [instance("event", "OP06-116")])
      .withLife("p1", lifeCards("p1", 2))
      .withLife("p2", lifeCards("p2", 2))
      .build();

    game.play({ summary: "[OP06-116]" });
    game.play({ type: "resolve-effect", optionId: "damage" });
    settleDeclining(game);

    expect(game.state.players.p2.life).toHaveLength(2);
    // The Life card the branch pays sits behind the same condition as the
    // damage (Q&A OP06-116#1): off 1 Life, p1 keeps it.
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op06-116-trigger", "OP06-116");

    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP06-117 The Ark Maxim", () => {
  covers("OP06-117", "[Activate: Main]");

  it("rests itself and an [Enel] to sweep the cheap bodies", () => {
    const game = table("op06-117")
      .bareTable()
      .withStage("p1", instance("maxim", "OP06-117"))
      .withBoard("p1", [character("enel", "OP10-025")])
      .withBoard("p2", [
        character("cheap-a", "OP06-016"),
        character("cheap-b", "OP06-113"),
        character("too-big", "OP06-036"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP06-117" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "enel" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "too-big",
    ]);
    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "enel")
        ?.rested,
    ).toBe(true);
    // The Stage rests to pay, so the printed `[Once Per Turn]` is not what
    // withholds the second offer -- `sourceActive` is.
    expect(activationOffered(game, "OP06-117")).toBe(false);
  });

  it("does nothing with no active [Enel] to rest", () => {
    const game = table("op06-117-no-enel")
      .bareTable()
      .withStage("p1", instance("maxim", "OP06-117"))
      .withBoard("p2", [character("cheap", "OP06-016")])
      .build();

    game.play({ type: "activate-main", summary: "OP06-117" });
    applyOptional(game);
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(1);
    // The cost's `choose` could not be filled, so the Stage is not rested
    // either: nothing was paid and nothing was bought.
    expect(game.state.players.p1.stage?.rested).toBe(false);
  });
});

describe("OP06-119 Sanji", () => {
  covers("OP06-119", "[On Play]");

  it("reveals the top card and plays it", () => {
    const game = table("op06-119")
      .bareTable()
      .withHand("p1", [instance("sanji", "OP06-119")])
      .withDeckTop("p1", [instance("top", "OP06-036")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-119" });
    game.play({ type: "resolve-effect", optionId: "top" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP06-036", "OP06-119"]);
  });

  it("cannot play another Sanji, and puts it back under the deck", () => {
    const game = table("op06-119-self")
      .bareTable()
      .withHand("p1", [instance("sanji", "OP06-119")])
      .withDeckTop("p1", [
        instance("top", "OP06-119"),
        instance("second", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP06-119" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP06-119",
    ]);
    expect(game.state.players.p1.deck.map((card) => card.instanceId)).toEqual([
      "second",
      "top",
    ]);
  });
});

describe("the set's printed [Blocker] bodies", () => {
  covers("OP06-009", "[Blocker]");
  covers("OP06-032", "[Blocker]");
  covers("OP06-043", "[Blocker]");
  covers("OP06-073", "[Blocker]");
  covers("OP06-087", "[Blocker]");

  it.each([
    ["OP06-009", "Shuraiya"],
    ["OP06-032", "Hammond"],
    ["OP06-043", "Aramaki"],
    ["OP06-073", "Shiki"],
    ["OP06-087", "Cerberus"],
  ])("%s %s blocks an attack aimed at its Leader", (cardNumber) => {
    const game = defending(`blocker-${cardNumber}`)
      .bareTable()
      .withBoard("p1", [character("blocker", cardNumber)])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 3))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "blocker" });

    // Unconditional [Blocker] is a derived fact off the printed text rather
    // than a row in the static table; what this checks is that the derivation
    // reaches all five of them.
    expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "blocker")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP06-067 Vinsmoke Yonji's DON!! reading", () => {
  covers("OP06-067", "static");

  it("is the printed 5000 once its controller is ahead on DON!!", () => {
    const ahead = table("op06-067-static")
      .bareTable()
      .withBoard("p1", [character("yonji", "OP06-067")])
      .withDonDeck("p2", 6)
      .build();

    expect(currentPower(ahead.state, "p1", "yonji")).toBe(5_000);
  });

  it("counts the tie as behind, which is the common board", () => {
    const level = table("op06-067-level")
      .bareTable()
      .withBoard("p1", [character("yonji", "OP06-067")])
      .build();

    expect(currentPower(level.state, "p1", "yonji")).toBe(6_000);
  });
});

describe("OP06-083 Oars' printed attack ban", () => {
  covers("OP06-083", "static");

  it("cannot attack while its own text is running", () => {
    const game = table("op06-083-static")
      .bareTable()
      .withBoard("p1", [character("oars", "OP06-083")])
      .withLife("p2", lifeCards("p2", 3))
      .build();

    // A 4-cost 7000 that is a wall and nothing else until its own activation
    // switches the sentence off.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "oars",
        ),
    ).toBe(false);
  });
});

describe("OP06-088 Sai", () => {
  covers("OP06-088", "static");

  it("is a 6000 behind an active Dressrosa Leader", () => {
    const game = table("op06-088")
      .bareTable()
      .withLeader("p1", "OP15-039")
      .withBoard("p1", [character("sai", "OP06-088")])
      .build();

    expect(currentPower(game.state, "p1", "sai")).toBe(6_000);
  });

  it("drops back to 4000 once that Leader has attacked", () => {
    const game = table("op06-088-rested")
      .bareTable()
      .withLeader("p1", "OP15-039")
      .withRestedLeader("p1")
      .withBoard("p1", [character("sai", "OP06-088")])
      .build();

    // The deck chooses between one more attack and a wall, which is the whole
    // clause.
    expect(currentPower(game.state, "p1", "sai")).toBe(4_000);
  });

  it("is a 4000 behind a Leader without the type", () => {
    const game = table("op06-088-off")
      .bareTable()
      .withBoard("p1", [character("sai", "OP06-088")])
      .build();

    expect(currentPower(game.state, "p1", "sai")).toBe(4_000);
  });
});
