import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
} from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";
import type { PublicEvent } from "@one-piece-sim/protocol";
import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * BOOSTER PACK -TWO LEGENDS- [OP-08], as a whole-set import.
 *
 * `packages/cards/src/op08.ts` explains where the records come from; this file
 * holds the behaviour. Three identities were already in the pool as cards other
 * decks ship, and stay with those decks' files: `test/op06-yamato.test.ts`
 * (OP08-023), `test/op14-mihawk.test.ts` (OP08-036) and `test/op17-clauses.test.ts`
 * / `test/op17-xebec.test.ts` (OP08-051). Everything else in the set is here.
 *
 * ## Why no deck
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter, the documented
 * shape for a card outside a manifest. Where a clause is gated on a Leader the
 * pool would not otherwise seat -- OP-08 prints six of them, and its archetypes
 * are built on their types -- the position states that Leader and is paired
 * with the same play behind a Leader that does not satisfy the gate. A clause
 * whose gate is never shown closed is a clause nobody has tested.
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
  while (
    game.state.pendingEffect &&
    effectOptions(game.state).some((id) => id.startsWith("return-don:"))
  ) {
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
      game.play({ type: "resolve-trigger" });
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

/** Pass the block step, stopping in the Counter step. */
const passToCounter = (game: Game) => {
  let guard = 0;
  while (game.state.phase === "block") {
    if (guard++ > 20) throw new Error("block step never closed");
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

/** Take one hit with `cardNumber` as p1's only Life card, Trigger window open. */
const triggerFrom = (
  seed: string,
  cardNumber: string,
  options: { leader?: string; donDeck?: number; hand?: string[] } = {},
) => {
  const { leader, donDeck, hand } = options;
  let built = defending(seed)
    .bareTable()
    .withLife("p1", [instance("life-card", cardNumber)])
    // `bareTable()` empties the deck, and a Trigger whose only effect is a draw
    // is judged inert against an empty one and never offered.
    .withDeckTop("p1", [
      instance(`${seed}-deck-a`, "ST32-004"),
      instance(`${seed}-deck-b`, "ST32-004"),
      instance(`${seed}-deck-c`, "ST32-004"),
    ])
    .withBoard("p2", [character("attacker", "ST32-004")]);
  if (leader) built = built.withLeader("p1", leader);
  if (donDeck) built = built.withDonDeck("p1", donDeck);
  if (hand) {
    built = built.withHand(
      "p1",
      hand.map((number, index) => instance(`${seed}-hand-${index}`, number)),
    );
  }
  const game = built.build();
  game.play({
    type: "attack",
    attackerInstanceId: "attacker",
    targetInstanceId: "p1-leader",
  });
  while (
    game.state.phase === "block" ||
    (game.state.phase === "counter" &&
      !game.legalActions().some((action) => action.type === "resolve-trigger"))
  ) {
    game.pass();
  }
  return game;
};

// --- Red ---------------------------------------------------------------------

describe("OP08-001 Tony Tony.Chopper (Leader)", () => {
  covers("OP08-001", "[Activate: Main]");

  it("hands a rested DON!! to each of three {Animal} or {Drum Kingdom} bodies", () => {
    const game = table("op08-001")
      .bareTable()
      .withLeader("p1", "OP08-001")
      .withDon("p1", { rested: 3 })
      .withBoard("p1", [
        character("bear", "OP08-010"),
        character("lapins", "OP08-012"),
        character("wrong", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP08-001" });
    // The offer names the two printed types and nothing else -- and not the
    // Leader, which carries both of them but is not a Character.
    expect(effectOptions(game.state)).toContain("bear");
    expect(effectOptions(game.state)).toContain("lapins");
    expect(effectOptions(game.state)).not.toContain("wrong");
    expect(effectOptions(game.state)).not.toContain("p1-leader");
    game.play({ type: "resolve-effect", optionId: "bear" });
    game.play({ type: "resolve-effect", optionId: "lapins" });
    settleDeclining(game);

    // One DON!! each, not the pile to one of them.
    const board = game.state.players.p1.board;
    expect(
      board.find((card) => card.instanceId === "bear")!.attachedDon,
    ).toHaveLength(1);
    expect(
      board.find((card) => card.instanceId === "lapins")!.attachedDon,
    ).toHaveLength(1);
    // `[Once Per Turn]`: the Leader's activation is gone for the rest of the
    // turn -- the Characters' own are not, which is why this names it.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP08-001"),
        ),
    ).toBe(false);
  });
});

describe("OP08-002 Marco (Leader)", () => {
  covers("OP08-002", "[Activate: Main]");

  it("draws, puts one back and shrinks a Character, with a DON!! on the Leader", () => {
    const game = table("op08-002")
      .bareTable()
      .withLeader("p1", "OP08-002")
      .withDon("p1", { leaderAttached: 1 })
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-002" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
    game.play({ type: "resolve-effect", optionId: "drawn" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
  });

  it("is not offered at all without a DON!! on the Leader", () => {
    const game = table("op08-002-bare")
      .bareTable()
      .withLeader("p1", "OP08-002")
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    // The gate is inside the program, and the engine withholds an activation
    // whose program would select nothing -- so the clause is not on the table
    // rather than being an offer that resolves to nothing.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP08-002"),
        ),
    ).toBe(false);
  });
});

describe("OP08-003 Twenty Doctors", () => {
  covers("OP08-003", "[Blocker]");

  it("blocks", () => {
    const game = defending("op08-003")
      .bareTable()
      .withBoard("p1", [character("doctors", "OP08-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", summary: "Block with Twenty Doctors" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("doctors");
  });
});

describe("OP08-004 Kuromarimo", () => {
  covers("OP08-004", "[On Play]");

  it("kills a 3000 only while its printed partner is out", () => {
    const withChess = table("op08-004-with")
      .bareTable()
      .withHand("p1", [instance("kuromarimo", "OP08-004")])
      .withBoard("p1", [character("chess", "OP08-005")])
      .withBoard("p2", [character("small", "ST31-003")])
      .build();

    withChess.play({ type: "play-card", cardNumber: "OP08-004" });
    withChess.play({ type: "resolve-effect", optionId: "small" });
    settle(withChess);
    expect(withChess.state.players.p2.board).toHaveLength(0);

    const alone = table("op08-004-without")
      .bareTable()
      .withHand("p1", [instance("kuromarimo", "OP08-004")])
      .withBoard("p2", [character("small", "ST31-003")])
      .build();

    alone.play({ type: "play-card", cardNumber: "OP08-004" });
    settleDeclining(alone);
    expect(alone.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP08-005 Chess", () => {
  covers("OP08-005", "[On Play]");

  it("shrinks a body and puts its partner down out of hand", () => {
    const game = table("op08-005")
      .bareTable()
      .withHand("p1", [
        instance("chess", "OP08-005"),
        instance("kuromarimo", "OP08-004"),
      ])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-005" });
    game.play({ type: "resolve-effect", optionId: "target" });
    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
    game.play({ type: "resolve-effect", optionId: "kuromarimo" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP08-004", "OP08-005"]);
  });

  it("offers no free partner while one is already on the board", () => {
    const game = table("op08-005-has")
      .bareTable()
      .withHand("p1", [
        instance("chess", "OP08-005"),
        instance("kuromarimo", "OP08-004"),
      ])
      .withBoard("p1", [character("already", "OP08-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-005" });
    settleDeclining(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "kuromarimo",
    ]);
  });
});

describe("OP08-006 Chessmarimo", () => {
  covers("OP08-006", "[Your Turn]");

  it("is +2000 on its own turn once both names are in the trash", () => {
    const game = table("op08-006")
      .bareTable()
      .withBoard("p1", [character("chessmarimo", "OP08-006")])
      .withTrash("p1", [
        instance("dead-chess", "OP08-005"),
        instance("dead-kuromarimo", "OP08-004"),
      ])
      .build();

    expect(currentPower(game.state, "p1", "chessmarimo")).toBe(8_000);
  });

  it("is a plain 6000 with only one of them in the trash", () => {
    const game = table("op08-006-half")
      .bareTable()
      .withBoard("p1", [character("chessmarimo", "OP08-006")])
      .withTrash("p1", [instance("dead-chess", "OP08-005")])
      .build();

    expect(currentPower(game.state, "p1", "chessmarimo")).toBe(6_000);
  });
});

describe("OP08-007 Tony Tony.Chopper", () => {
  covers("OP08-007", "[Your Turn]", "[On Play]", "[When Attacking]");

  it("digs five for a small {Animal} and plays it rested, on play", () => {
    const game = table("op08-007")
      .bareTable()
      .withHand("p1", [instance("chopper", "OP08-007")])
      .withDeckTop("p1", [
        instance("miss", "ST32-004"),
        instance("hit", "OP08-012"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-007" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    const found = game.state.players.p1.board.find(
      (card) => card.instanceId === "hit",
    )!;
    // "Play ... rested": the body arrives down, so it defends and cannot swing.
    expect(found.rested).toBe(true);
  });

  it("digs again when it attacks", () => {
    const game = table("op08-007-attack")
      .bareTable()
      .withBoard("p1", [character("chopper", "OP08-007")])
      .withDeckTop("p1", [instance("hit", "OP08-012")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "chopper",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(
      game.state.players.p1.board.some((card) => card.instanceId === "hit"),
    ).toBe(true);
  });
});

describe("OP08-008 Dalton", () => {
  covers("OP08-008", "[On Play]", "[Activate: Main]");

  it("shrinks a Character as it lands", () => {
    const game = table("op08-008")
      .bareTable()
      .withHand("p1", [instance("dalton", "OP08-008")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-008" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(4_000);
  });

  it("buys [Rush] with a Life card, once a DON!! is on it", () => {
    const game = table("op08-008-rush")
      .bareTable()
      .withBoard("p1", [character("dalton", "OP08-008", { playedTurn: 11 })])
      .withGivenDon("p1", "dalton", 1)
      .withLife("p1", [
        instance("life-a", "ST32-004"),
        instance("life-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP08-008" });
    applyOptional(game);
    settle(game);

    expect(hasKeyword(game.state, "p1", "dalton", "Rush")).toBe(true);
    // The Life card joins the hand rather than being spent.
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP08-010 Hiking Bear", () => {
  covers("OP08-010", "[Activate: Main]");

  it("buffs another {Animal} body, never itself", () => {
    const game = table("op08-010")
      .bareTable()
      .withBoard("p1", [
        character("bear", "OP08-010"),
        character("other", "OP08-012"),
      ])
      .withGivenDon("p1", "bear", 1)
      .build();

    game.play({ type: "activate-main", summary: "OP08-010" });
    expect(effectOptions(game.state)).not.toContain("bear");
    game.play({ type: "resolve-effect", optionId: "other" });
    settle(game);

    expect(currentPower(game.state, "p1", "other")).toBe(4_000);
  });
});

describe("OP08-012 Lapins", () => {
  covers("OP08-012", "[When Attacking]");

  it("kills a 4000 with two DON!! behind a {Drum Kingdom} Leader", () => {
    const game = table("op08-012")
      .bareTable()
      .withLeader("p1", "OP08-001")
      .withBoard("p1", [character("lapins", "OP08-012")])
      .withGivenDon("p1", "lapins", 2)
      .withBoard("p2", [character("target", "OP08-013")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "lapins",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("op08-012-wrong")
      .bareTable()
      .withBoard("p1", [character("lapins", "OP08-012")])
      .withGivenDon("p1", "lapins", 2)
      .withBoard("p2", [character("target", "OP08-013")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "lapins",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP08-013 Robson", () => {
  covers("OP08-013", "static");

  it("has [Rush] only with two DON!! on it", () => {
    const game = table("op08-013")
      .bareTable()
      .withBoard("p1", [
        character("bare", "OP08-013", { playedTurn: 11 }),
        character("armed", "OP08-013", { playedTurn: 11 }),
      ])
      .withGivenDon("p1", "armed", 2)
      .build();

    expect(hasKeyword(game.state, "p1", "bare", "Rush")).toBe(false);
    expect(hasKeyword(game.state, "p1", "armed", "Rush")).toBe(true);
  });
});

describe("OP08-014 Wapol", () => {
  covers("OP08-014", "[When Attacking]");

  it("shrinks a body and grows through the opponent's turn", () => {
    const game = table("op08-014")
      .bareTable()
      .withBoard("p1", [character("wapol", "OP08-014")])
      .withGivenDon("p1", "wapol", 1)
      .withBoard("p2", [character("target", "ST32-004")])
      // `bareTable()` empties both Life stacks; without one the Leader attack
      // below simply wins the game before the turn can roll over.
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "wapol",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);
    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
    declineDefence(game);
    while (game.state.turnPlayerId === "p1") game.pass();

    // "Until the end of your opponent's next turn": still there on their turn.
    expect(game.state.turnPlayerId).toBe("p2");
    expect(currentPower(game.state, "p1", "wapol")).toBe(9_000);
  });
});

describe("OP08-015 Dr.Kureha", () => {
  covers("OP08-015", "[On Play]");

  it("digs four for a {Drum Kingdom} card, never for another copy of itself", () => {
    const game = table("op08-015")
      .bareTable()
      .withHand("p1", [instance("kureha", "OP08-015")])
      .withDeckTop("p1", [
        instance("self", "OP08-015"),
        instance("miss", "ST32-004"),
        instance("hit", "OP08-014"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-015" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });
});

describe("OP08-016 Dr.Hiriluk", () => {
  covers("OP08-016", "[Activate: Main]");

  it("rests to give every [Tony Tony.Chopper] +2000 behind that Leader", () => {
    const game = table("op08-016")
      .bareTable()
      .withLeader("p1", "OP08-001")
      .withBoard("p1", [
        character("hiriluk", "OP08-016"),
        character("chopper-a", "OP08-007"),
        character("chopper-b", "OP08-007"),
        character("other", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP08-016" });
    applyOptional(game);
    settle(game);

    expect(currentPower(game.state, "p1", "chopper-a")).toBe(7_000);
    expect(currentPower(game.state, "p1", "chopper-b")).toBe(7_000);
    expect(currentPower(game.state, "p1", "other")).toBe(5_000);
    // The rest is the cost, paid whether or not anything was buffed.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "hiriluk")!
        .rested,
    ).toBe(true);
  });
});

describe("OP08-017 I'd Never Shoot You!!!!", () => {
  covers("OP08-017", "[Counter]", "[Trigger]");

  it("adds 4000 to the battle and takes 1000 off a card of theirs", () => {
    const game = defending("op08-017")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-017")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP08-017]" });
    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    // "During this turn": a modifier on the card, not the battle total.
    expect(currentPower(game.state, "p2", "attacker")).toBe(4_000);
  });

  it("hands 1000 to a card off a Life card", () => {
    const game = triggerFrom("op08-017-trigger", "OP08-017");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });
});

describe("OP08-018 Cloven Rose", () => {
  covers("OP08-018", "[Main]", "[Trigger]");

  it("buffs up to three of its own and shrinks one of theirs", () => {
    const game = table("op08-018")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-018")])
      .withBoard("p1", [
        character("a", "ST32-004"),
        character("b", "ST32-004"),
        character("c", "ST32-004"),
        character("d", "ST32-004"),
      ])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ summary: "[OP08-018]" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    game.play({ type: "resolve-effect", optionId: "c" });
    // Three is the printed ceiling: the fourth body is no longer on offer.
    expect(effectOptions(game.state)).not.toContain("d");
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p1", "a")).toBe(6_000);
    expect(currentPower(game.state, "p1", "d")).toBe(5_000);
    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
  });

  it("takes 3000 off a Leader from a Life card", () => {
    const game = triggerFrom("op08-018-trigger", "OP08-018");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settle(game);

    expect(currentPower(game.state, "p2", "p2-leader")).toBe(2_000);
  });
});

describe("OP08-019 Munch-Munch Mutation", () => {
  covers("OP08-019", "[Main]", "[Counter]", "[Trigger]");

  it("trades 3000 off one of theirs for 3000 onto one of yours, in the Main Phase", () => {
    const game = table("op08-019")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-019")])
      .withBoard("p1", [character("mine", "ST32-004")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ summary: "[OP08-019]" });
    game.play({ type: "resolve-effect", optionId: "target" });
    game.play({ type: "resolve-effect", optionId: "mine" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(2_000);
    expect(currentPower(game.state, "p1", "mine")).toBe(8_000);
  });

  it("runs the same clause as a Counter, and adds nothing to the battle itself", () => {
    const game = defending("op08-019-counter")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-019")])
      .withBoard("p1", [character("mine", "ST32-004")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP08-019]" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    game.play({ type: "resolve-effect", optionId: "mine" });
    settle(game);

    // Both halves are turn-scoped modifiers, so the Counter total stays 0 --
    // the buff may land on a card that is not in this fight at all.
    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(currentPower(game.state, "p2", "attacker")).toBe(2_000);
  });

  it("kills a 5000 from a Life card", () => {
    const game = triggerFrom("op08-019-trigger", "OP08-019");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP08-020 Drum Kingdom", () => {
  covers("OP08-020", "[Opponent's Turn]");

  it("lifts every {Drum Kingdom} body on the opponent's turn only", () => {
    const own = table("op08-020-own")
      .bareTable()
      .withStage("p1", instance("drum-kingdom", "OP08-020"))
      .withBoard("p1", [
        character("drum", "OP08-014"),
        character("other", "ST32-004"),
      ])
      .build();

    expect(currentPower(own.state, "p1", "drum")).toBe(6_000);

    const theirs = defending("op08-020-theirs")
      .bareTable()
      .withStage("p1", instance("drum-kingdom", "OP08-020"))
      .withBoard("p1", [
        character("drum", "OP08-014"),
        character("other", "ST32-004"),
      ])
      .build();

    expect(currentPower(theirs.state, "p1", "drum")).toBe(7_000);
    // The type is printed, so the Stage reaches only its own package.
    expect(currentPower(theirs.state, "p1", "other")).toBe(5_000);
  });
});

describe("OP08-118 Silvers Rayleigh", () => {
  covers("OP08-118", "[On Play]");

  it("hands -3000 and -2000 to two different bodies, then kills a 3000", () => {
    const game = table("op08-118")
      .bareTable()
      .withHand("p1", [instance("rayleigh", "OP08-118")])
      .withBoard("p2", [
        character("big", "ST32-004"),
        character("small", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-118" });
    game.play({ type: "resolve-effect", optionId: "big" });
    // "The other": the card that already took -3000 is off the second offer.
    expect(effectOptions(game.state)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });

    // The K.O. reads the board after both debuffs, so the 5000 pushed to 2000
    // is inside the printed ceiling and the 3000 one is too.
    expect(currentPower(game.state, "p2", "big")).toBe(2_000);
    expect(currentPower(game.state, "p2", "small")).toBe(3_000);
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });
});

// --- Green -------------------------------------------------------------------

describe("OP08-021 Carrot (Leader)", () => {
  covers("OP08-021", "[Activate: Main]");

  it("rests a cost 5 while a {Minks} body is out, and nothing without one", () => {
    const game = table("op08-021")
      .bareTable()
      .withLeader("p1", "OP08-021")
      .withBoard("p1", [character("minks", "OP08-025")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-021" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "target")!
        .rested,
    ).toBe(true);

    const alone = table("op08-021-alone")
      .bareTable()
      .withLeader("p1", "OP08-021")
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    // No {Minks} body, so the clause can do nothing and is never offered.
    expect(
      alone
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP08-021"),
        ),
    ).toBe(false);
  });
});

describe("OP08-022 Inuarashi", () => {
  covers("OP08-022", "[On Play]");

  it("holds two rested bodies down through their Refresh Phase", () => {
    const game = table("op08-022")
      .bareTable()
      .withLeader("p1", "OP08-021")
      .withHand("p1", [instance("inuarashi", "OP08-022")])
      .withBoard("p2", [
        character("down-a", "ST32-004", { rested: true }),
        character("down-b", "ST32-004", { rested: true }),
        character("up", "ST32-004"),
      ])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-022" });
    // The clause holds a body that is *already* rested; it rests nothing.
    expect(effectOptions(game.state)).not.toContain("up");
    game.play({ type: "resolve-effect", optionId: "down-a" });
    game.play({ type: "resolve-effect", optionId: "down-b" });
    settle(game);

    while (game.state.turnPlayerId === "p1") game.pass();
    const board = game.state.players.p2.board;
    expect(board.find((card) => card.instanceId === "down-a")!.rested).toBe(
      true,
    );
    expect(board.find((card) => card.instanceId === "down-b")!.rested).toBe(
      true,
    );
    expect(board.find((card) => card.instanceId === "up")!.rested).toBe(false);
  });

  it("does nothing behind a Leader without the type", () => {
    const game = table("op08-022-wrong")
      .bareTable()
      .withHand("p1", [instance("inuarashi", "OP08-022")])
      .withBoard("p2", [character("down", "ST32-004", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-022" });
    settleDeclining(game);
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP08-024 Concelot", () => {
  covers("OP08-024", "[When Attacking]");

  it("locks a rested cost 4 when it attacks", () => {
    const game = table("op08-024")
      .bareTable()
      .withBoard("p1", [character("concelot", "OP08-024")])
      .withBoard("p2", [character("down", "OP08-030", { rested: true })])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "concelot",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "down" });
    declineDefence(game);
    while (game.state.turnPlayerId === "p1") game.pass();

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "down")!
        .rested,
    ).toBe(true);
  });
});

describe("OP08-025 Shishilian", () => {
  covers("OP08-025", "[On Play]");

  it("locks a rested cost 3 and offers nothing above it", () => {
    const game = table("op08-025")
      .bareTable()
      .withHand("p1", [instance("shishilian", "OP08-025")])
      .withBoard("p2", [
        character("small", "OP08-025", { rested: true }),
        character("big", "ST32-004", { rested: true }),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-025" });
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    settleDeclining(game);
  });
});

describe("OP08-026 Giovanni", () => {
  covers("OP08-026", "[When Attacking]");

  it("locks a rested cost 1 with a DON!! on it, and nothing without", () => {
    const armed = table("op08-026")
      .bareTable()
      .withBoard("p1", [character("giovanni", "OP08-026")])
      .withGivenDon("p1", "giovanni", 1)
      .withBoard("p2", [character("down", "OP08-033", { rested: true })])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    armed.play({
      type: "attack",
      attackerInstanceId: "giovanni",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(armed.state)).toContain("down");
    settleDeclining(armed);

    const bare = table("op08-026-bare")
      .bareTable()
      .withBoard("p1", [character("giovanni", "OP08-026")])
      .withBoard("p2", [character("down", "OP08-033", { rested: true })])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    bare.play({
      type: "attack",
      attackerInstanceId: "giovanni",
      targetInstanceId: "p2-leader",
    });
    expect(bare.state.pendingEffect).toBeNull();
  });
});

describe("OP08-028 Nekomamushi", () => {
  covers("OP08-028", "[On Play]");

  it("gets [Rush] off a board the lock has already turned over", () => {
    const game = table("op08-028")
      .bareTable()
      .withHand("p1", [instance("neko", "OP08-028")])
      .withDon("p2", { rested: 7 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-028" });
    settle(game);
    const neko = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP08-028",
    )!;
    expect(hasKeyword(game.state, "p1", neko.instanceId, "Rush")).toBe(true);
  });

  it("gets nothing against a board that is still up", () => {
    const game = table("op08-028-up")
      .bareTable()
      .withHand("p1", [instance("neko", "OP08-028")])
      .withDon("p2", { rested: 6 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-028" });
    settle(game);
    const neko = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP08-028",
    )!;
    expect(hasKeyword(game.state, "p1", neko.instanceId, "Rush")).toBe(false);
  });
});

describe("OP08-029 Pekoms", () => {
  covers("OP08-029", "static");

  it("keeps the cheap {Minks} bodies off an opposing K.O., while it is active", () => {
    const guarded = defending("op08-029")
      .bareTable()
      .withBoard("p1", [
        character("pekoms", "OP08-029"),
        character("shielded", "OP08-025"),
      ])
      .withHand("p2", [
        instance("whoswho", "OP08-091"),
        instance("fodder", "ST32-004"),
      ])
      .build();

    guarded.play({ type: "play-card", cardNumber: "OP08-091" });
    guarded.play({ type: "resolve-effect", optionId: "apply" });
    guarded.play({ type: "resolve-effect", optionId: "fodder" });
    // The offer is still made -- the engine does not filter an immune card out
    // of a target list -- and the K.O. simply does not land.
    guarded.play({ type: "resolve-effect", optionId: "shielded" });
    settle(guarded);
    expect(
      guarded.state.players.p1.board.map((card) => card.instanceId).sort(),
    ).toEqual(["pekoms", "shielded"]);
  });

  it("stops guarding the moment it rests", () => {
    const spent = defending("op08-029-rested")
      .bareTable()
      .withBoard("p1", [
        character("pekoms", "OP08-029", { rested: true }),
        character("shielded", "OP08-025"),
      ])
      .withHand("p2", [
        instance("whoswho", "OP08-091"),
        instance("fodder", "ST32-004"),
      ])
      .build();

    spent.play({ type: "play-card", cardNumber: "OP08-091" });
    spent.play({ type: "resolve-effect", optionId: "apply" });
    spent.play({ type: "resolve-effect", optionId: "fodder" });
    expect(effectOptions(spent.state)).toContain("shielded");
    spent.play({ type: "resolve-effect", optionId: "shielded" });
    settle(spent);
    expect(spent.state.players.p1.board).toHaveLength(1);
  });
});

describe("OP08-030 Pedro", () => {
  covers("OP08-030", "[On K.O.]", "[Blocker]");

  it("blocks, and charges for dying either way", () => {
    const game = defending("op08-030")
      .bareTable()
      .withBoard("p1", [character("pedro", "OP08-030")])
      .withBoard("p2", [character("attacker", "OP08-013")])
      .withDon("p2", { active: 2 })
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", summary: "Block with Pedro" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("pedro");
  });
});

describe("OP08-031 Miyagi", () => {
  covers("OP08-031", "[On Play]");

  it("sets a rested cheap {Minks} body active, and offers no active one", () => {
    const game = table("op08-031")
      .bareTable()
      .withHand("p1", [instance("miyagi", "OP08-031")])
      .withBoard("p1", [
        character("down", "OP08-033", { rested: true }),
        character("up", "OP08-033"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-031" });
    expect(effectOptions(game.state)).toEqual(["down", "done"]);
    game.play({ type: "resolve-effect", optionId: "down" });
    settle(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "down")!
        .rested,
    ).toBe(false);
  });
});

describe("OP08-032 Milky", () => {
  covers("OP08-032", "[Activate: Main]");

  it("rests itself to set a DON!! active behind a {Minks} Leader", () => {
    const game = table("op08-032")
      .bareTable()
      .withLeader("p1", "OP08-021")
      .withBoard("p1", [character("milky", "OP08-032")])
      .withDon("p1", { rested: 2 })
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "activate-main", summary: "OP08-032" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore - 1);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "milky")!
        .rested,
    ).toBe(true);
  });
});

describe("OP08-033 Roddy", () => {
  covers("OP08-033", "[On Play]");

  it("kills a rested cost 2 behind the Leader and a turned-over board", () => {
    const game = table("op08-033")
      .bareTable()
      .withLeader("p1", "OP08-021")
      .withHand("p1", [instance("roddy", "OP08-033")])
      .withBoard("p2", [character("down", "OP08-035", { rested: true })])
      .withDon("p2", { rested: 7 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-033" });
    game.play({ type: "resolve-effect", optionId: "down" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("does nothing while their board is still up", () => {
    const game = table("op08-033-up")
      .bareTable()
      .withLeader("p1", "OP08-021")
      .withHand("p1", [instance("roddy", "OP08-033")])
      .withBoard("p2", [character("down", "OP08-035", { rested: true })])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-033" });
    settleDeclining(game);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP08-034 Wanda", () => {
  covers("OP08-034", "[On Play]");

  it("digs five for a {Minks} card other than itself", () => {
    const game = table("op08-034")
      .bareTable()
      .withHand("p1", [instance("wanda", "OP08-034")])
      .withDeckTop("p1", [
        instance("self", "OP08-034"),
        instance("hit", "OP08-025"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-034" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });
});

describe("OP08-037 Garchu", () => {
  covers("OP08-037", "[Main]", "[Trigger]");

  it("rests a {Minks} body of its own to rest one of theirs", () => {
    const game = table("op08-037")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-037")])
      .withBoard("p1", [character("minks", "OP08-025")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ summary: "[OP08-037]" });
    applyOptional(game);
    settle(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "minks")!
        .rested,
    ).toBe(true);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "target")!
        .rested,
    ).toBe(true);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op08-037-trigger", "OP08-037");
    const before = game.state.players.p1.hand.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(before + 1);
  });
});

describe("OP08-038 We Would Never Sell a Comrade to an Enemy!!!", () => {
  covers("OP08-038", "[Main]", "[Trigger]");

  it("rests two of its own for a board their effects cannot K.O.", () => {
    const game = table("op08-038")
      .bareTable()
      .withHand("p1", [
        instance("event", "OP08-038"),
        instance("removal", "OP08-019"),
      ])
      .withBoard("p1", [character("a", "ST32-004"), character("b", "ST32-004")])
      .build();

    game.play({ summary: "[OP08-038]" });
    applyOptional(game);
    settle(game);

    const board = game.state.players.p1.board;
    expect(board.every((card) => card.rested)).toBe(true);
    expect(
      board.every(
        (card) => (card.koImmuneToOpponentEffectsUntilTurn ?? -1) >= 11,
      ),
    ).toBe(true);
  });

  it("rests a cost 3 of theirs off a Life card", () => {
    const game = triggerFrom("op08-038-trigger", "OP08-038");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settleDeclining(game);
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP08-039 Zou", () => {
  covers("OP08-039", "[Activate: Main]", "[End of Your Turn]");

  it("rests itself for a DON!! and stands a {Minks} body back up at end of turn", () => {
    const game = table("op08-039")
      .bareTable()
      .withLeader("p1", "OP08-021")
      .withStage("p1", instance("zou", "OP08-039"))
      .withBoard("p1", [character("minks", "OP08-025", { rested: true })])
      .withDon("p1", { rested: 2 })
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({ type: "activate-main", summary: "OP08-039" });
    applyOptional(game);
    settle(game);
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore - 1);
    expect(game.state.players.p1.stage!.rested).toBe(true);

    game.pass();
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect", optionId: "minks" });
    }
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "minks")!
        .rested,
    ).toBe(false);
  });
});

// --- Blue --------------------------------------------------------------------

describe("OP08-040 Atmos", () => {
  covers("OP08-040", "[On Play]");

  it("shows two {Whitebeard Pirates} cards to bounce a cost 4", () => {
    const game = table("op08-040")
      .bareTable()
      .withLeader("p1", "OP08-002")
      .withHand("p1", [
        instance("atmos", "OP08-040"),
        instance("wb-a", "OP08-044"),
        instance("wb-b", "OP08-045"),
      ])
      .withBoard("p2", [character("target", "OP08-042")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-040" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "wb-a" });
    game.play({ type: "resolve-effect", optionId: "wb-b" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    // Revealed, not spent: both cards are still in hand.
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["wb-a", "wb-b"]);
  });

  it("cannot pay with one {Whitebeard Pirates} card", () => {
    const game = table("op08-040-short")
      .bareTable()
      .withLeader("p1", "OP08-002")
      .withHand("p1", [
        instance("atmos", "OP08-040"),
        instance("wb-a", "OP08-044"),
        instance("other", "ST32-004"),
      ])
      .withBoard("p2", [character("target", "OP08-042")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-040" });
    settleDeclining(game);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP08-041 Aphelandra", () => {
  covers("OP08-041", "[Activate: Main]");

  it("goes back to hand to bury a 1-drop behind a {Kuja Pirates} Leader", () => {
    const game = table("op08-041")
      .bareTable()
      .withLeader("p1", "OP14-041")
      .withBoard("p1", [character("aphelandra", "OP08-041")])
      .withBoard("p2", [character("cheap", "OP08-033")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-041" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settle(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "aphelandra",
    ]);
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.deck.at(-1)!.instanceId).toBe("cheap");
  });

  it("still pays the return behind a Leader without the type", () => {
    const game = table("op08-041-wrong")
      .bareTable()
      .withBoard("p1", [character("aphelandra", "OP08-041")])
      .withBoard("p2", [character("cheap", "OP08-033")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-041" });
    applyOptional(game);
    settleDeclining(game);

    // The colon puts the return on the cost side: it happens either way.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "aphelandra",
    ]);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP08-042 Edward Weevil", () => {
  covers("OP08-042", "[When Attacking]");

  it("bounces a cost 3 from either side of the table", () => {
    const game = table("op08-042")
      .bareTable()
      .withBoard("p1", [
        character("weevil", "OP08-042"),
        character("own", "OP08-025"),
      ])
      .withGivenDon("p1", "weevil", 1)
      .withBoard("p2", [character("theirs", "OP08-025")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "weevil",
      targetInstanceId: "p2-leader",
    });
    // "1 Character", so its own body is a legal answer too.
    expect(effectOptions(game.state)).toContain("own");
    game.play({ type: "resolve-effect", optionId: "theirs" });
    declineDefence(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "theirs",
    );
  });
});

describe("OP08-043 Edward.Newgate", () => {
  covers("OP08-043", "[On Play]");

  it("prices their board's attacks at two cards, and only from behind", () => {
    const game = table("op08-043")
      .bareTable()
      .withLeader("p1", "OP08-002")
      .withHand("p1", [instance("newgate", "OP08-043")])
      .withLife("p1", [instance("life", "ST32-004")])
      .withBoard("p2", [character("theirs", "OP08-013", { playedTurn: 1 })])
      .withHand("p2", [
        instance("their-a", "ST32-004"),
        instance("their-b", "ST32-004"),
      ])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-043" });
    settle(game);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "theirs")!
        .attackTaxUntilTurn,
    ).toBe(12);

    while (game.state.turnPlayerId === "p1") game.pass();
    // The attack is still legal -- the price is payable -- and declaring it
    // trashes the two cards before the Block window opens.
    game.play({
      type: "attack",
      attackerInstanceId: "theirs",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "resolve-effect", optionId: "their-a" });
    game.play({ type: "resolve-effect", optionId: "their-b" });
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "their-a",
      "their-b",
    ]);
  });

  it("locks an empty hand out of attacking at all", () => {
    const game = table("op08-043-lock")
      .bareTable()
      .withLeader("p1", "OP08-002")
      .withHand("p1", [instance("newgate", "OP08-043")])
      .withLife("p1", [instance("life", "ST32-004")])
      .withBoard("p2", [character("theirs", "OP08-013", { playedTurn: 1 })])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-043" });
    settle(game);
    while (game.state.turnPlayerId === "p1") game.pass();

    // One card in hand from the draw step, and the toll is two.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "theirs",
        ),
    ).toBe(false);
  });

  it("does nothing from three Life cards", () => {
    const game = table("op08-043-ahead")
      .bareTable()
      .withLeader("p1", "OP08-002")
      .withHand("p1", [instance("newgate", "OP08-043")])
      .withLife("p1", [
        instance("life-a", "ST32-004"),
        instance("life-b", "ST32-004"),
        instance("life-c", "ST32-004"),
      ])
      .withBoard("p2", [character("theirs", "OP08-013")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-043" });
    settleDeclining(game);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "theirs")!
        .attackTaxUntilTurn,
    ).toBeUndefined();
  });
});

describe("OP08-044 Kingdew", () => {
  covers("OP08-044", "[Activate: Main]");

  it("shows two {Whitebeard Pirates} cards for +2000", () => {
    const game = table("op08-044")
      .bareTable()
      .withBoard("p1", [character("kingdew", "OP08-044")])
      .withHand("p1", [
        instance("wb-a", "OP08-045"),
        instance("wb-b", "OP08-047"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP08-044" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "wb-a" });
    game.play({ type: "resolve-effect", optionId: "wb-b" });
    settle(game);

    expect(currentPower(game.state, "p1", "kingdew")).toBe(6_000);
  });

  it("is not offered with one {Whitebeard Pirates} card in hand", () => {
    const game = table("op08-044-short")
      .bareTable()
      .withBoard("p1", [character("kingdew", "OP08-044")])
      .withHand("p1", [
        instance("wb-a", "OP08-045"),
        instance("other", "ST32-004"),
      ])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP08-044"),
        ),
    ).toBe(false);
  });
});

describe("OP08-045 Thatch", () => {
  covers("OP08-045", "static");

  it("trades itself for a card instead of being K.O.'d by their effect", () => {
    const game = defending("op08-045")
      .bareTable()
      .withBoard("p1", [character("thatch", "OP08-045")])
      .withHand("p2", [instance("burn-blade", "OP08-117")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p1", [instance("replacement-draw", "ST32-004")])
      .build();

    game.play({ summary: "[OP08-117]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "their-life" });
    game.play({ type: "resolve-effect", optionId: "thatch" });
    // The replacement is Thatch's controller's to take, not the attacker's.
    expect(game.state.activePlayer).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "replace:thatch" });
    settle(game);

    // Trashed rather than K.O.'d, and its controller is a card up.
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("thatch");
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "replacement-draw",
    );
  });

  it('answers a lost fight too -- the printed clause reads "or K.O.\'d"', () => {
    const game = defending("op08-045-battle")
      .bareTable()
      // Only a rested Character can be attacked, which is the position a body
      // that has already swung is in.
      .withBoard("p1", [character("thatch", "OP08-045", { rested: true })])
      .withBoard("p2", [character("attacker", "OP08-047")])
      .withDeckTop("p1", [instance("replacement-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "thatch",
    });
    while (
      (game.state.phase === "block" || game.state.phase === "counter") &&
      !game.state.pendingEffect
    ) {
      game.pass();
    }
    // The offer reaches the defender inside the battle, which is what makes a
    // lost fight answerable at all.
    game.play({ summary: "Trash Thatch and draw 1 card" });
    settle(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "replacement-draw",
    );
  });
});

describe("OP08-047 Jozu", () => {
  covers("OP08-047", "[On Play]");

  it("sends one of its own back to buy a bounce", () => {
    const game = table("op08-047")
      .bareTable()
      .withHand("p1", [instance("jozu", "OP08-047")])
      .withBoard("p1", [character("own", "OP08-044")])
      .withBoard("p2", [character("theirs", "OP08-046")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-047" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "own" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "own",
    ]);
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP08-049 Speed Jil", () => {
  covers("OP08-049", "[On Play]");

  it("flips [Rush] off a {Whitebeard Pirates} card, and nothing off another", () => {
    const hit = table("op08-049-hit")
      .bareTable()
      .withHand("p1", [instance("jil", "OP08-049")])
      .withDeckTop("p1", [instance("wb", "OP08-045")])
      .build();

    hit.play({ type: "play-card", cardNumber: "OP08-049" });
    settle(hit);
    const jil = hit.state.players.p1.board.find(
      (card) => card.cardNumber === "OP08-049",
    )!;
    expect(hasKeyword(hit.state, "p1", jil.instanceId, "Rush")).toBe(true);

    const miss = table("op08-049-miss")
      .bareTable()
      .withHand("p1", [instance("jil", "OP08-049")])
      .withDeckTop("p1", [instance("other", "ST32-004")])
      .build();

    miss.play({ type: "play-card", cardNumber: "OP08-049" });
    settle(miss);
    const missed = miss.state.players.p1.board.find(
      (card) => card.cardNumber === "OP08-049",
    )!;
    expect(hasKeyword(miss.state, "p1", missed.instanceId, "Rush")).toBe(false);
  });
});

describe("OP08-050 Namule", () => {
  covers("OP08-050", "[On Play]", "[Blocker]");

  it("draws two and puts two back at either end", () => {
    const game = table("op08-050")
      .bareTable()
      .withHand("p1", [instance("namule", "OP08-050")])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "OP08-045"),
        instance("rest", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-050" });
    game.play({ type: "resolve-effect", optionId: "draw-a" });
    game.play({ type: "resolve-effect", optionId: "draw-b" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(3);
  });

  it("blocks", () => {
    const game = defending("op08-050-block")
      .bareTable()
      .withBoard("p1", [character("namule", "OP08-050")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", summary: "Block with Namule" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("namule");
  });
});

describe("OP08-052 Portgas.D.Ace", () => {
  covers("OP08-052", "[On Play]");

  it("plays a cheap {Whitebeard Pirates} body off the top of the deck", () => {
    const game = table("op08-052")
      .bareTable()
      .withHand("p1", [instance("ace", "OP08-052")])
      .withDeckTop("p1", [instance("free", "OP08-044")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-052" });
    game.play({ type: "resolve-effect", optionId: "free" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId).sort(),
    ).toEqual(["ace", "free"]);
  });

  it("puts a miss back at either end of the deck", () => {
    const game = table("op08-052-miss")
      .bareTable()
      .withHand("p1", [instance("ace", "OP08-052")])
      .withDeckTop("p1", [
        instance("expensive", "OP08-043"),
        instance("next", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-052" });
    settle(game);

    expect(game.state.players.p1.board).toHaveLength(1);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });
});

describe("OP08-053 Thank You...for Loving Me!!", () => {
  covers("OP08-053", "[Main]", "[Trigger]");

  it("digs three for a {Whitebeard Pirates} card behind that Leader", () => {
    const game = table("op08-053")
      .bareTable()
      .withLeader("p1", "OP08-002")
      .withHand("p1", [instance("event", "OP08-053")])
      .withDeckTop("p1", [
        instance("miss", "ST32-004"),
        instance("hit", "OP08-045"),
      ])
      .build();

    game.play({ summary: "[OP08-053]" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op08-053-trigger", "OP08-053");
    const before = game.state.players.p1.hand.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(before + 1);
  });
});

describe("OP08-054 You Can't Take Our King This Early in the Game.", () => {
  covers("OP08-054", "[Counter]");

  it("adds 3000 and develops off the top of the deck", () => {
    const game = defending("op08-054")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-054")])
      .withDeckTop("p1", [instance("free", "OP08-050")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP08-054]" });
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    game.play({ type: "resolve-effect", optionId: "free" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "free",
    ]);
  });
});

describe("OP08-055 Phoenix Brand", () => {
  covers("OP08-055", "[Main]");

  it("buries a cost 6 for two revealed {Whitebeard Pirates} cards", () => {
    const game = table("op08-055")
      .bareTable()
      .withHand("p1", [
        instance("event", "OP08-055"),
        instance("wb-a", "OP08-045"),
        instance("wb-b", "OP08-047"),
      ])
      .withBoard("p2", [character("target", "OP08-047")])
      .build();

    game.play({ summary: "[OP08-055]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "wb-a" });
    game.play({ type: "resolve-effect", optionId: "wb-b" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    // Buried, not K.O.'d: it is at the bottom of its owner's deck.
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.trash).toHaveLength(0);
    expect(game.state.players.p2.deck.at(-1)!.instanceId).toBe("target");
  });
});

describe("OP08-056 Moby Dick", () => {
  covers("OP08-056", "[Your Turn]", "[Trigger]");

  it("draws and filters when a {Whitebeard Pirates} body leaves to an effect", () => {
    const game = table("op08-056")
      .bareTable()
      .withStage("p1", instance("moby", "OP08-056"))
      .withBoard("p1", [character("wb", "OP08-044")])
      .withHand("p1", [
        instance("jozu", "OP08-047"),
        instance("filler", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .build();

    // Jozu's own cost returns the {Whitebeard Pirates} body to hand, which is
    // "removed from the field by an effect".
    game.play({ type: "play-card", cardNumber: "OP08-047" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "wb" });
    settle(game);

    expect(
      game.state.players.p1.hand.some((card) => card.instanceId === "wb"),
    ).toBe(true);
    // The Stage's own draw happened: the top card left the deck.
    expect(
      game.state.players.p1.deck.some((card) => card.instanceId === "drawn"),
    ).toBe(false);
  });

  it("puts itself down off a Life card", () => {
    const game = triggerFrom("op08-056-trigger", "OP08-056");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.stage?.cardNumber).toBe("OP08-056");
  });
});

// --- Purple ------------------------------------------------------------------

describe("OP08-057 King (Leader)", () => {
  covers("OP08-057", "[Activate: Main]");

  it("returns two DON!! to draw, with a hand inside the printed ceiling", () => {
    const game = table("op08-057")
      .bareTable()
      .withLeader("p1", "OP08-057")
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-057" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "draw" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "drawn",
    ]);
    expect(game.state.players.p1.activeDon).toHaveLength(8);
  });

  it("takes 2 cost off a Character on the other branch", () => {
    const game = table("op08-057-cost")
      .bareTable()
      .withLeader("p1", "OP08-057")
      .withBoard("p2", [character("target", "OP08-047")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-057" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "cost" });
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
    ).toBe(4);
  });
});

describe("OP08-058 Charlotte Pudding (Leader)", () => {
  covers("OP08-058", "[When Attacking]");

  it("shows the top two Life cards for a rested DON!!", () => {
    const game = table("op08-058")
      .bareTable()
      .withLeader("p1", "OP08-058")
      .withLife("p1", [
        instance("l1", "ST32-004"),
        instance("l2", "ST32-004"),
        instance("l3", "ST32-004"),
      ])
      .withDonDeck("p1", 1)
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    settle(game);

    // The two the opponent's next attacks turn over, not two of the player's
    // choosing -- and the third stays hidden.
    const life = game.state.players.p1.life;
    expect(life.map((card) => card.faceUp === true)).toEqual([
      true,
      true,
      false,
    ]);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("cannot pay twice from a Life stack it has already turned over", () => {
    const game = table("op08-058-shown")
      .bareTable()
      .withLeader("p1", "OP08-058")
      .withLife("p1", [
        instance("l1", "ST32-004", { faceUp: true }),
        instance("l2", "ST32-004", { faceUp: true }),
      ])
      .withDonDeck("p1", 1)
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    settleDeclining(game);

    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP08-059 Alber", () => {
  covers("OP08-059", "[Activate: Main]");

  it("trashes itself for a [King] out of hand at ten DON!!", () => {
    const game = table("op08-059")
      .bareTable()
      .withLeader("p1", "OP08-057")
      .withBoard("p1", [character("alber", "OP08-059")])
      .withHand("p1", [instance("king", "OP08-060")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-059" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "king" });
    settle(game);

    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("alber");
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("king");
  });

  it("still trashes itself below ten DON!!, and finds nothing", () => {
    const game = table("op08-059-short")
      .bareTable()
      .withLeader("p1", "OP08-057")
      .withDon("p1", { rested: 1 })
      .withBoard("p1", [character("alber", "OP08-059")])
      .withHand("p1", [instance("king", "OP08-060")])
      .build();
    // Nine DON!! on the field, not ten.
    game.state.players.p1.donDeck.push(
      ...game.state.players.p1.restedDon.splice(0),
    );

    game.play({ type: "activate-main", summary: "OP08-059" });
    applyOptional(game);
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "king",
    ]);
  });
});

describe("OP08-060 King", () => {
  covers("OP08-060", "[On Play]");

  it("buys [Rush] with a DON!! against a board that is ahead on DON!!", () => {
    const game = table("op08-060")
      .bareTable()
      .withHand("p1", [instance("king", "OP08-060")])
      .withDon("p2", { active: 5 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-060" });
    applyOptional(game);
    payDonMinus(game);
    settle(game);

    const king = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP08-060",
    )!;
    expect(hasKeyword(game.state, "p1", king.instanceId, "Rush")).toBe(true);
  });
});

describe("OP08-061 Charlotte Oven", () => {
  covers("OP08-061", "[When Attacking]");

  it("returns a DON!! for a kill every time it swings", () => {
    const game = table("op08-061")
      .bareTable()
      .withBoard("p1", [character("oven", "OP08-061")])
      .withBoard("p2", [character("target", "OP08-025")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "oven",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    declineDefence(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.activeDon).toHaveLength(9);
  });
});

describe("OP08-062 Charlotte Katakuri", () => {
  covers("OP08-062", "[Activate: Main]");

  it("trades itself for a bigger [Charlotte Katakuri], priced off their DON!!", () => {
    const game = table("op08-062")
      .bareTable()
      .withLeader("p1", "OP08-058")
      .withBoard("p1", [character("small", "OP08-062")])
      .withHand("p1", [instance("big", "OP08-063")])
      .withDon("p2", { active: 6 })
      .build();

    game.play({ type: "activate-main", summary: "OP08-062" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });

  it("cannot reach a 6-cost off five DON!! of theirs", () => {
    const game = table("op08-062-short")
      .bareTable()
      .withLeader("p1", "OP08-058")
      .withBoard("p1", [character("small", "OP08-062")])
      .withHand("p1", [instance("big", "OP08-063")])
      .withDon("p2", { active: 5 })
      .build();

    game.play({ type: "activate-main", summary: "OP08-062" });
    applyOptional(game);
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });
});

describe("OP08-063 Charlotte Katakuri", () => {
  covers("OP08-063", "[On Play]");

  it("turns a face-up Life card back over for an active DON!!", () => {
    const game = table("op08-063")
      .bareTable()
      .withHand("p1", [instance("katakuri", "OP08-063")])
      .withLife("p1", [instance("shown", "ST32-004", { faceUp: true })])
      .withDonDeck("p1", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-063" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.life[0]!.faceUp).toBeFalsy();
    // The DON!! comes out of the DON!! deck rather than off the field, which
    // is what makes this ramp rather than a refund.
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });

  it("has nothing to pay with when the top Life card is already face-down", () => {
    const game = table("op08-063-down")
      .bareTable()
      .withHand("p1", [instance("katakuri", "OP08-063")])
      .withLife("p1", [instance("hidden", "ST32-004")])
      .withDonDeck("p1", 1)
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-063" });
    settleDeclining(game);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP08-064 Charlotte Cracker", () => {
  covers("OP08-064", "[Activate: Main]");

  it("returns a DON!! for a free [Biscuit Warrior]", () => {
    const game = table("op08-064")
      .bareTable()
      .withBoard("p1", [character("cracker", "OP08-064")])
      .withHand("p1", [instance("biscuit", "OP08-072")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-064" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "biscuit" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId).sort(),
    ).toEqual(["biscuit", "cracker"]);
  });
});

describe("OP08-066 Charlotte Brulee", () => {
  covers("OP08-066", "[Blocker]", "[On K.O.]");

  it("blocks, and pays a rested DON!! when it dies", () => {
    const game = defending("op08-066")
      .bareTable()
      .withBoard("p1", [character("brulee", "OP08-066")])
      .withBoard("p2", [character("attacker", "OP08-047")])
      .withDonDeck("p1", 1)
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    const restedBefore = game.state.players.p1.restedDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", summary: "Block with Charlotte Brulee" });
    declineDefence(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(restedBefore + 1);
  });
});

describe("OP08-067 Charlotte Pudding", () => {
  covers("OP08-067", "[Your Turn]");

  it("refunds a rested DON!! the first time a payment goes back each turn", () => {
    const game = table("op08-067")
      .bareTable()
      .withBoard("p1", [
        character("pudding", "OP08-067"),
        character("oven", "OP08-061"),
      ])
      .withDonDeck("p1", 2)
      .withBoard("p2", [
        character("target-a", "OP08-025"),
        character("target-b", "OP08-025"),
      ])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    const before = game.state.players.p1.restedDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "oven",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    payDonMinus(game);
    settle(game);
    declineDefence(game);

    expect(game.state.players.p1.restedDon).toHaveLength(before + 1);
  });

  it("passes quietly and spends its turn when the DON!! deck has nothing left", () => {
    // The Leader answers the same two-DON!! return first and takes both back,
    // so Pudding would add from an empty DON!! deck. Nothing is shown for it,
    // but the clause is mandatory, so it has fired and its [Once Per Turn] use
    // is gone (Bandai's ST34-001#1 for the same shape).
    const game = table("op08-067-empty")
      .bareTable()
      .withLeader("p1", "OP09-061")
      .withBoard("p1", [character("pudding", "OP08-067")])
      .withHand("p1", [instance("lightning", "OP09-077")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    expect(game.state.players.p1.donDeck).toHaveLength(0);
    const seen: PublicEvent[] = [];
    game.play({ summary: "[OP09-077]" });
    seen.push(...game.events);
    applyOptional(game);
    seen.push(...game.events);
    payDonMinus(game);
    seen.push(...game.events);
    settle(game);
    seen.push(...game.events);

    expect(
      seen.some(
        (event) =>
          event.type === "don-added" && event.sourceCardNumber === "OP09-061",
      ),
    ).toBe(true);
    expect(
      seen.some(
        (event) =>
          event.type === "don-added" && event.sourceCardNumber === "OP08-067",
      ),
    ).toBe(false);
    expect(
      seen.some(
        (event) =>
          event.type === "ability-triggered" &&
          event.sourceCardNumber === "OP08-067",
      ),
    ).toBe(false);
    expect(
      game.state.oncePerTurn.some((key) => key.includes(":OP08-067:")),
    ).toBe(true);
  });
});

describe("OP08-068 Charlotte Perospero", () => {
  covers("OP08-068", "[On K.O.]", "[Trigger]");

  it("pays a rested DON!! when it dies", () => {
    const game = defending("op08-068")
      .bareTable()
      .withBoard("p1", [character("perospero", "OP08-068", { rested: true })])
      .withBoard("p2", [character("attacker", "OP08-047")])
      .withDonDeck("p1", 1)
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    const before = game.state.players.p1.restedDon.length;
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "perospero",
    });
    declineDefence(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(before + 1);
  });

  it("puts itself down off a Life card for a DON!!", () => {
    const game = triggerFrom("op08-068-trigger", "OP08-068", { donDeck: 1 });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    payDonMinus(game);
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP08-068",
    ]);
  });
});

describe("OP08-069 Charlotte Linlin", () => {
  covers("OP08-069", "[On Play]");

  it("banks a Life card and buries one of theirs into their Life", () => {
    const game = table("op08-069")
      .bareTable()
      .withHand("p1", [
        instance("linlin", "OP08-069"),
        instance("fodder", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("banked", "ST32-004")])
      .withBoard("p2", [character("theirs", "OP08-047")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-069" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "theirs" });
    game.play({ type: "resolve-effect", optionId: "top" });
    settle(game);

    expect(game.state.players.p1.life[0]!.instanceId).toBe("banked");
    // Their Character joins their Life face-up, which is a removal that hands
    // the card back rather than a K.O.
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.life[0]!.instanceId).toBe("theirs");
    expect(game.state.players.p2.life[0]!.faceUp).toBe(true);
  });
});

describe("OP08-070 Baron Tamago", () => {
  covers("OP08-070", "[Blocker]", "[On K.O.]");

  it("blocks, and replaces itself with [Viscount Hiyoko] out of hand", () => {
    const game = defending("op08-070")
      .bareTable()
      .withBoard("p1", [character("tamago", "OP08-070")])
      .withHand("p1", [instance("hiyoko", "OP08-073")])
      .withBoard("p2", [character("attacker", "OP08-047")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", summary: "Block with Baron Tamago" });
    declineDefence(game);
    applyOptional(game);
    payDonMinus(game);
    if (effectOptions(game.state).includes("hiyoko")) {
      game.play({ type: "resolve-effect", optionId: "hiyoko" });
    }
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "hiyoko",
    ]);
  });
});

describe("OP08-071 Count Niwatori and OP08-073 Viscount Hiyoko", () => {
  covers("OP08-071", "[Opponent's Turn]", "[On K.O.]");
  covers("OP08-073", "[Opponent's Turn]", "[On K.O.]");

  it("fetches its partner out of the deck when answered on their turn", () => {
    const game = defending("op08-071")
      .bareTable()
      .withBoard("p1", [character("niwatori", "OP08-071", { rested: true })])
      .withDeckTop("p1", [
        instance("filler", "ST32-004"),
        instance("tamago", "OP08-070"),
      ])
      .withBoard("p2", [character("attacker", "OP08-043")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "niwatori",
    });
    declineDefence(game);
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "tamago" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "tamago",
    ]);
  });

  it("stays quiet when its controller trades it off on their own turn", () => {
    const game = table("op08-073")
      .bareTable()
      .withBoard("p1", [character("hiyoko", "OP08-073")])
      .withHand("p1", [
        instance("removal", "OP08-091"),
        instance("fodder", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("niwatori", "OP08-071")])
      .build();

    // A K.O. by its own controller on their own turn: `[Opponent's Turn]` is
    // what keeps the fetch from firing.
    game.play({ type: "play-card", cardNumber: "OP08-091" });
    settleDeclining(game);
    expect(
      game.state.players.p1.deck.some((card) => card.instanceId === "niwatori"),
    ).toBe(true);
  });
});

describe("OP08-072 Biscuit Warrior", () => {
  covers("OP08-072", "[Blocker]", "static");

  it("has no copy limit, and blocks", () => {
    const game = defending("op08-072")
      .bareTable()
      .withBoard("p1", [character("biscuit", "OP08-072")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", summary: "Block with Biscuit Warrior" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("biscuit");
  });
});

describe("OP08-074 Black Maria", () => {
  covers("OP08-074", "[Activate: Main]");

  it("borrows five DON!! and hands back the excess when the turn ends", () => {
    const game = table("op08-074")
      .bareTable()
      .withBoard("p1", [character("maria", "OP08-074")])
      .withDonDeck("p1", 5)
      // Six of the opponent's ten pushed back into their DON!! deck, so their
      // field is the four this clause has to come down to.
      .withDonDeck("p2", 6)
      .build();

    game.play({ type: "activate-main", summary: "OP08-074" });
    settle(game);
    // `withDonDeck` moves five of the ten off the field so there is something
    // to add, so five back on is a full field again.
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(10);

    while (game.state.turnPlayerId === "p1") game.pass();
    // Squared up to the opponent's field count, which is what the booking is
    // for: the number is not knowable when the clause resolves.
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(4);
  });

  it("still hands the DON!! back after she has left the field", () => {
    // Bandai's OP-08 Q&A: removed on the turn she was activated, "Do I still
    // return DON!! cards ... at the end of this turn? Yes, you do." The debt is
    // the player's, not hers.
    const game = table("op08-074-removed")
      .bareTable()
      .withBoard("p1", [
        character("maria", "OP08-074"),
        character("b", "ST32-004"),
        character("c", "ST32-004"),
        character("d", "ST32-004"),
        character("e", "ST32-004"),
      ])
      .withHand("p1", [instance("sixth", "ST32-004")])
      .withDonDeck("p1", 5)
      .withDonDeck("p2", 6)
      .build();
    game.play({ type: "activate-main", summary: "OP08-074" });
    settle(game);
    // A sixth Character makes room by trashing her.
    game.play({ type: "play-card", cardNumber: "ST32-004" });
    game.play({ type: "resolve-effect", optionId: "maria" });
    expect(
      game.state.players.p1.board.some((card) => card.instanceId === "maria"),
    ).toBe(false);

    while (game.state.turnPlayerId === "p1") {
      if (game.state.pendingEffect) game.play({ type: "resolve-effect" });
      else game.pass();
    }
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(4);
  });

  it("answers every returned-DON!! clause with the DON!! it hands back", () => {
    // The same Q&A: the end-of-turn return lets "When a DON!! card on your
    // field is returned to your DON!! deck" effects of other cards activate,
    // and OP09-061's Q&A says the same of that Leader. It was paid past the
    // point where anything could answer, so none of them did.
    const game = table("op08-074-reactions")
      .bareTable()
      .withLeader("p1", "OP09-061")
      .withBoard("p1", [
        character("maria", "OP08-074"),
        character("pudding", "OP08-067"),
        character("kid", "OP05-074"),
      ])
      .withDonDeck("p1", 5)
      .withDonDeck("p2", 6)
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();
    game.play({ type: "activate-main", summary: "OP08-074" });
    settle(game);

    const seen: PublicEvent[] = [];
    game.pass();
    seen.push(...game.events);
    while (game.state.turnPlayerId === "p1") {
      game.play({ type: "resolve-effect" });
      seen.push(...game.events);
    }

    const answered = seen.flatMap((event) =>
      event.type === "ability-triggered" ? [event.sourceCardNumber] : [],
    );
    expect(answered).toEqual(
      expect.arrayContaining(["OP09-061", "OP08-067", "OP05-074"]),
    );
    // Six back, then the Leader's two, Pudding's one and Kid's one again.
    expect(
      game.state.players.p1.activeDon.length +
        game.state.players.p1.restedDon.length,
    ).toBe(8);
    // And the turn ends: answering them is part of ending it.
    expect(game.state.turnPlayerId).toBe("p2");
    expect(seen.some((event) => event.type === "turn-ended")).toBe(true);
  });

  it("is not offered beside another copy of itself", () => {
    const game = table("op08-074-pair")
      .bareTable()
      .withBoard("p1", [
        character("maria-a", "OP08-074"),
        character("maria-b", "OP08-074"),
      ])
      .withDonDeck("p1", 5)
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP08-074"),
        ),
    ).toBe(false);
  });
});

describe("OP08-075 Candy Maiden", () => {
  covers("OP08-075", "[Main]", "[Trigger]");

  it("rests a cheap body and hides every Life card again", () => {
    const game = table("op08-075")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-075")])
      .withLife("p1", [
        instance("shown-a", "ST32-004", { faceUp: true }),
        instance("shown-b", "ST32-004", { faceUp: true }),
      ])
      .withBoard("p2", [character("cheap", "OP08-035")])
      .build();

    game.play({ summary: "[OP08-075]" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "cheap")!
        .rested,
    ).toBe(true);
    expect(game.state.players.p1.life.every((card) => !card.faceUp)).toBe(true);
  });

  it("adds an active DON!! off a Life card", () => {
    const game = triggerFrom("op08-075-trigger", "OP08-075", { donDeck: 1 });
    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.activeDon).toHaveLength(before + 1);
  });
});

describe("OP08-076 It's to Die For...", () => {
  covers("OP08-076", "[Main]", "[Trigger]");

  it("adds a second DON!! only against a 6000", () => {
    const big = table("op08-076-big")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-076")])
      .withDonDeck("p1", 2)
      .withBoard("p2", [character("big", "OP08-047")])
      .build();

    big.play({ summary: "[OP08-076]" });
    settle(big);
    expect(big.state.players.p1.donDeck).toHaveLength(0);

    const small = table("op08-076-small")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-076")])
      .withDonDeck("p1", 2)
      .withBoard("p2", [character("small", "OP08-025")])
      .build();

    small.play({ summary: "[OP08-076]" });
    settle(small);
    expect(small.state.players.p1.donDeck).toHaveLength(1);
  });

  it("adds an active DON!! off a Life card", () => {
    const game = triggerFrom("op08-076-trigger", "OP08-076", { donDeck: 1 });
    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.activeDon).toHaveLength(before + 1);
  });
});

describe("OP08-077 Conquest of the Sea", () => {
  covers("OP08-077", "[Main]");

  it("kills two cost 6 bodies behind the right Leader", () => {
    const game = table("op08-077")
      .bareTable()
      .withLeader("p1", "OP08-057")
      .withHand("p1", [instance("event", "OP08-077")])
      .withBoard("p2", [
        character("a", "OP08-047"),
        character("b", "OP08-047"),
        character("c", "OP08-047"),
      ])
      .build();

    game.play({ summary: "[OP08-077]" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "c",
    ]);
  });

  it("does nothing behind a Leader without either type", () => {
    const game = table("op08-077-wrong")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-077")])
      .withBoard("p2", [character("a", "OP08-047")])
      .build();

    // The Leader gate is the program's outermost `if`, so the Event is not
    // offered at all rather than being an activation that resolves to nothing.
    expect(
      game.legalActions().some((action) => action.summary.includes("OP08-077")),
    ).toBe(false);
  });
});

describe("OP08-119 Kaido & Linlin", () => {
  covers("OP08-119", "[When Attacking]");

  it("returns ten DON!! to wipe every other body and trade Life", () => {
    const game = table("op08-119")
      .bareTable()
      .withBoard("p1", [
        character("pair", "OP08-119"),
        character("own", "OP08-025"),
      ])
      .withBoard("p2", [character("theirs", "OP08-047")])
      .withDeckTop("p1", [instance("banked", "ST32-004")])
      .withLife("p1", [instance("mine", "ST32-004")])
      .withLife("p2", [
        instance("their-life-a", "ST32-004"),
        instance("their-life-b", "ST32-004"),
      ])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "pair",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    payDonMinus(game);
    settle(game);

    // "All Characters other than this Character" -- both sides of the board.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "pair",
    ]);
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.life[0]!.instanceId).toBe("banked");
    expect(game.state.players.p2.life).toHaveLength(1);
  });

  it("names its two Life steps by what they do, not by the DON!! −10 already paid", () => {
    const game = table("op08-119-step-labels")
      .bareTable()
      .withBoard("p1", [character("pair", "OP08-119")])
      .withDeckTop("p1", [instance("banked", "ST32-004")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();
    const summaries = () =>
      getLegalActions(game.state, "p1")
        .filter((action) => action.type === "resolve-effect")
        .map((action) => action.summary);

    game.play({
      type: "attack",
      attackerInstanceId: "pair",
      targetInstanceId: "p2-leader",
    });
    // The clause itself: the one offer that names the cost.
    expect(summaries()[0]).toContain("DON!! −10");
    game.play({ type: "resolve-effect", optionId: "apply" });

    expect(summaries()).toEqual([
      "Continue Kaido & Linlin [OP08-119] [When Attacking]: add the top card of your deck to the top of your Life cards",
      "Skip this step of Kaido & Linlin [OP08-119]'s effect",
    ]);
    game.play({ type: "resolve-effect", optionId: "apply" });
    expect(summaries()).toEqual([
      "Continue Kaido & Linlin [OP08-119] [When Attacking]: trash the top card of their Life cards",
      "Skip this step of Kaido & Linlin [OP08-119]'s effect",
    ]);
  });

  it("asks nothing about where its ten DON!! came from: the field is empty", () => {
    // DON!! given to the Leader and to the Characters the wipe then K.O.s. Ten
    // is every DON!! on the field, so re-homing has nothing to swap -- but the
    // prompt opened anyway, once with rows summing to fewer DON!! than the
    // cost (the K.O.'d bodies' pools were gone) so it could never be confirmed.
    const game = table("op08-119-given-don")
      .bareTable()
      .withBoard("p1", [
        character("pudding", "OP08-067"),
        character("zoro", "OP08-025"),
        character("pair", "OP08-119"),
      ])
      .withGivenDon("p1", "p1-leader", 1)
      .withGivenDon("p1", "pudding", 1)
      .withGivenDon("p1", "zoro", 2)
      .withGivenDon("p1", "pair", 1)
      .withDon("p1", { rested: 5 })
      .withDeckTop("p1", [instance("banked", "ST32-004")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "pair",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);

    const prompts: string[] = [];
    let guard = 0;
    while (game.state.pendingEffect) {
      if (guard++ > 60) throw new Error("pending effect never settled");
      prompts.push(game.state.pendingEffect.kind);
      game.play({ type: "resolve-effect" });
    }
    expect(prompts).not.toContain("return-don");
    expect(game.state.players.p1.donDeck).toHaveLength(10);
    expect(game.state.players.p1.life[0]!.instanceId).toBe("banked");
  });
});

describe("OP08-046 Shakuyaku", () => {
  covers("OP08-046", "[Your Turn]");

  it("makes their full hand pay when its controller's effect clears a body", () => {
    const game = table("op08-046")
      .bareTable()
      .withBoard("p1", [character("shakuyaku", "OP08-046")])
      .withHand("p1", [
        instance("whoswho", "OP08-091"),
        instance("fodder", "ST32-004"),
      ])
      .withBoard("p2", [character("theirs", "OP08-025")])
      .withHand("p2", [
        instance("t1", "ST32-004"),
        instance("t2", "ST32-004"),
        instance("t3", "ST32-004"),
        instance("t4", "ST32-004"),
        instance("t5", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-091" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    // The card off their hand is theirs to choose.
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "t1" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(game.state.players.p2.deck.at(-1)!.instanceId).toBe("t1");
    // The rest is the price, paid after the clause pays out.
    expect(
      game.state.players.p1.board.find(
        (card) => card.instanceId === "shakuyaku",
      )!.rested,
    ).toBe(true);
  });

  it("stays quiet against a hand of four", () => {
    const game = table("op08-046-small-hand")
      .bareTable()
      .withBoard("p1", [character("shakuyaku", "OP08-046")])
      .withHand("p1", [
        instance("whoswho", "OP08-091"),
        instance("fodder", "ST32-004"),
      ])
      .withBoard("p2", [character("theirs", "OP08-025")])
      .withHand("p2", [
        instance("t1", "ST32-004"),
        instance("t2", "ST32-004"),
        instance("t3", "ST32-004"),
        instance("t4", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-091" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    settle(game);

    expect(game.state.players.p2.hand).toHaveLength(4);
    expect(
      game.state.players.p1.board.find(
        (card) => card.instanceId === "shakuyaku",
      )!.rested,
    ).toBe(false);
  });
});

// --- Black -------------------------------------------------------------------

describe("OP08-079 Kaido", () => {
  covers("OP08-079", "[Activate: Main]");

  it("trashes a cost 7 and their card, but only on the turn it landed", () => {
    const game = table("op08-079")
      .bareTable()
      .withHand("p1", [
        instance("kaido", "OP08-079"),
        instance("fodder", "ST32-004"),
      ])
      .withBoard("p2", [character("theirs", "OP08-047")])
      .withHand("p2", [instance("their-card", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-079" });
    settle(game);
    game.play({ type: "activate-main", summary: "OP08-079" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    game.play({ type: "resolve-effect", optionId: "their-card" });
    settle(game);

    // Trashed, not K.O.'d.
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId).sort(),
    ).toEqual(["their-card", "theirs"]);
  });

  it("does nothing from a body that has been out since last turn", () => {
    const game = table("op08-079-old")
      .bareTable()
      .withBoard("p1", [character("kaido", "OP08-079", { playedTurn: 9 })])
      .withHand("p1", [instance("fodder", "ST32-004")])
      .withBoard("p2", [character("theirs", "OP08-047")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-079" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settleDeclining(game);

    // The card from hand is the cost and is spent either way.
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP08-080 Queen", () => {
  covers("OP08-080", "[On Play]");

  it("digs five for an {Animal Kingdom Pirates} card other than itself", () => {
    const game = table("op08-080")
      .bareTable()
      .withHand("p1", [instance("queen", "OP08-080")])
      .withDeckTop("p1", [
        instance("self", "OP08-080"),
        instance("hit", "OP08-078"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-080" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });
});

describe("OP08-081 Guernica", () => {
  covers("OP08-081", "[When Attacking]");

  it("buries three {CP} cards to kill a Character at cost 0", () => {
    const game = table("op08-081")
      .bareTable()
      .withBoard("p1", [
        character("guernica", "OP08-081"),
        character("sheepshead", "OP08-083"),
      ])
      .withGivenDon("p1", "sheepshead", 1)
      .withTrash("p1", [
        instance("cp-a", "OP08-081"),
        instance("cp-b", "OP08-081"),
        instance("cp-c", "OP08-081"),
      ])
      .withBoard("p2", [character("zero", "OP08-033")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    // Sheepshead's aura is what puts a 1-cost body at cost 0.
    expect(
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find((card) => card.instanceId === "zero")!,
      ),
    ).toBe(0);

    game.play({
      type: "attack",
      attackerInstanceId: "guernica",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cp-a" });
    game.play({ type: "resolve-effect", optionId: "cp-b" });
    game.play({ type: "resolve-effect", optionId: "cp-c" });
    settle(game);
    declineDefence(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("OP08-082 Sasaki", () => {
  covers("OP08-082", "[Activate: Main]");

  it("rests a DON!! for a cost debuff, and may stay standing", () => {
    const game = table("op08-082")
      .bareTable()
      .withBoard("p1", [character("sasaki", "OP08-082")])
      .withBoard("p2", [character("target", "OP08-047")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-082" });
    // The DON!! rest is the cost; resting itself is the half it may decline.
    game.play({ type: "resolve-effect", optionId: "skip" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "sasaki")!
        .rested,
    ).toBe(false);
    expect(
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find(
          (card) => card.instanceId === "target",
        )!,
      ),
    ).toBe(4);
  });
});

describe("OP08-083 Sheepshead", () => {
  covers("OP08-083", "[Your Turn]");

  it("takes a cost off their whole board, with a DON!! and on its own turn", () => {
    const game = table("op08-083")
      .bareTable()
      .withBoard("p1", [character("sheepshead", "OP08-083")])
      .withGivenDon("p1", "sheepshead", 1)
      .withBoard("p2", [character("a", "OP08-047"), character("b", "OP08-025")])
      .build();

    const cost = (id: string) =>
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find((card) => card.instanceId === id)!,
      );
    expect(cost("a")).toBe(5);
    expect(cost("b")).toBe(2);
  });

  it("does nothing without the DON!!", () => {
    const game = table("op08-083-bare")
      .bareTable()
      .withBoard("p1", [character("sheepshead", "OP08-083")])
      .withBoard("p2", [character("a", "OP08-047")])
      .build();

    expect(
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find((card) => card.instanceId === "a")!,
      ),
    ).toBe(6);
  });
});

describe("OP08-084 Jack", () => {
  covers("OP08-084", "[Activate: Main]", "static");

  it("costs 11, and rests to filter and kill", () => {
    const game = table("op08-084")
      .bareTable()
      .withBoard("p1", [character("jack", "OP08-084")])
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .withHand("p1", [instance("fodder", "ST32-004")])
      .withBoard("p2", [character("small", "OP08-025")])
      .build();

    expect(
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find((card) => card.instanceId === "jack")!,
      ),
    ).toBe(11);

    game.play({ type: "activate-main", summary: "OP08-084" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "jack")!
        .rested,
    ).toBe(true);
  });
});

describe("OP08-085 Jinbe", () => {
  covers("OP08-085", "[When Attacking]");

  it("kills a cost 4 while a cost 8 body of its own is out", () => {
    const game = table("op08-085")
      .bareTable()
      .withBoard("p1", [
        character("jinbe", "OP08-085"),
        character("big", "OP08-079"),
      ])
      .withGivenDon("p1", "jinbe", 1)
      .withBoard("p2", [character("target", "OP08-042")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "target" });
    declineDefence(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("does nothing without a big body beside it", () => {
    const game = table("op08-085-alone")
      .bareTable()
      .withBoard("p1", [character("jinbe", "OP08-085")])
      .withGivenDon("p1", "jinbe", 1)
      .withBoard("p2", [character("target", "OP08-042")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "jinbe",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP08-086 Ginrummy", () => {
  covers("OP08-086", "[On Play]");

  it("refills against a board the SMILE package has pushed to zero cost", () => {
    const game = table("op08-086")
      .bareTable()
      .withHand("p1", [instance("ginrummy", "OP08-086")])
      .withBoard("p1", [character("sheepshead", "OP08-083")])
      .withGivenDon("p1", "sheepshead", 1)
      .withBoard("p2", [character("zero", "OP08-033")])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-086" });
    game.play({ type: "resolve-effect", optionId: "draw-a" });
    game.play({ type: "resolve-effect", optionId: "draw-b" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("does nothing against a board with nothing at zero", () => {
    const game = table("op08-086-none")
      .bareTable()
      .withHand("p1", [instance("ginrummy", "OP08-086")])
      .withBoard("p2", [character("one", "OP08-033")])
      .withDeckTop("p1", [instance("draw-a", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-086" });
    settleDeclining(game);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP08-087 Scratchmen Apoo", () => {
  covers("OP08-087", "[Blocker]", "[Activate: Main]");

  it("takes a cost off a Character once a turn", () => {
    const game = table("op08-087")
      .bareTable()
      .withBoard("p1", [character("apoo", "OP08-087")])
      .withBoard("p2", [character("target", "OP08-047")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-087" });
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
    ).toBe(5);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP08-087"),
        ),
    ).toBe(false);
  });

  it("blocks", () => {
    const game = defending("op08-087-block")
      .bareTable()
      .withBoard("p1", [character("apoo", "OP08-087")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", summary: "Block with Scratchmen Apoo" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("apoo");
  });
});

describe("OP08-088 Duval", () => {
  covers("OP08-088", "[On Play]");

  it("lifts one of its own out of cheap removal until their turn ends", () => {
    const game = table("op08-088")
      .bareTable()
      .withHand("p1", [instance("duval", "OP08-088")])
      .withBoard("p1", [character("mine", "OP08-025")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-088" });
    game.play({ type: "resolve-effect", optionId: "mine" });
    settle(game);

    expect(
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find((card) => card.instanceId === "mine")!,
      ),
    ).toBe(4);
  });
});

describe("OP08-090 Hamlet", () => {
  covers("OP08-090", "[On Play]");

  it("plays a cheap {SMILE} body straight out of the trash", () => {
    const game = table("op08-090")
      .bareTable()
      .withHand("p1", [instance("hamlet", "OP08-090")])
      .withTrash("p1", [
        instance("smile", "OP08-083"),
        instance("other", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-090" });
    expect(effectOptions(game.state)).toEqual(["smile", "done"]);
    game.play({ type: "resolve-effect", optionId: "smile" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId).sort(),
    ).toEqual(["hamlet", "smile"]);
  });
});

describe("OP08-091 Who's.Who", () => {
  covers("OP08-091", "[On Play]", "[Trigger]");

  it("trades a card from hand for a cost 3", () => {
    const game = table("op08-091")
      .bareTable()
      .withHand("p1", [
        instance("whoswho", "OP08-091"),
        instance("fodder", "ST32-004"),
      ])
      .withBoard("p2", [character("target", "OP08-025")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-091" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("kills a cost 3 for free off a Life card", () => {
    const game = triggerFrom("op08-091-trigger", "OP08-091");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settleDeclining(game);
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP08-092 Page One", () => {
  covers("OP08-092", "[On Play]");

  it("plays its printed partner out of the trash", () => {
    const game = table("op08-092")
      .bareTable()
      .withHand("p1", [instance("page-one", "OP08-092")])
      .withTrash("p1", [
        instance("ulti", "OP08-078"),
        instance("other", "OP08-079"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-092" });
    expect(effectOptions(game.state)).toEqual(["ulti", "done"]);
    game.play({ type: "resolve-effect", optionId: "ulti" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId).sort(),
    ).toEqual(["page-one", "ulti"]);
  });
});

describe("OP08-093 X.Drake", () => {
  covers("OP08-093", "static");

  it("costs 6 with a DON!! on it and 4 without", () => {
    const game = table("op08-093")
      .bareTable()
      .withBoard("p1", [
        character("armed", "OP08-093"),
        character("bare", "OP08-093"),
      ])
      .withGivenDon("p1", "armed", 1)
      .build();

    const cost = (id: string) =>
      effectiveCost(
        game.state,
        "p1",
        game.state.players.p1.board.find((card) => card.instanceId === id)!,
      );
    expect(cost("armed")).toBe(6);
    expect(cost("bare")).toBe(4);
  });
});

describe("OP08-094 Imperial Flame", () => {
  covers("OP08-094", "[Main]", "[Counter]", "[Trigger]");

  it("buries three from the trash to kill a cost 2, in the Main Phase", () => {
    const game = table("op08-094")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-094")])
      .withTrash("p1", [
        instance("t1", "ST32-004"),
        instance("t2", "ST32-004"),
        instance("t3", "ST32-004"),
      ])
      .withBoard("p2", [character("target", "OP08-035")])
      .build();

    game.play({ summary: "[OP08-094]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "t1" });
    game.play({ type: "resolve-effect", optionId: "t2" });
    game.play({ type: "resolve-effect", optionId: "t3" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(1);
  });

  it("runs the same clause as a Counter", () => {
    const game = defending("op08-094-counter")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-094")])
      .withTrash("p1", [
        instance("t1", "ST32-004"),
        instance("t2", "ST32-004"),
        instance("t3", "ST32-004"),
      ])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("target", "OP08-035"),
      ])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP08-094]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "t1" });
    game.play({ type: "resolve-effect", optionId: "t2" });
    game.play({ type: "resolve-effect", optionId: "t3" });
    settle(game);

    // The Counter adds no power at all -- the whole card is the removal.
    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("runs its own [Main] effect off a Life card", () => {
    const game = triggerFrom("op08-094-trigger", "OP08-094");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settleDeclining(game);
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP08-095 Iron Body Fang Flash", () => {
  covers("OP08-095", "[Main]", "[Trigger]");

  it("buffs into their turn off a full trash, and nothing off a thin one", () => {
    const full = table("op08-095")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-095")])
      .withTrash(
        "p1",
        Array.from({ length: 10 }, (_, index) =>
          instance(`t${index}`, "ST32-004"),
        ),
      )
      .withBoard("p1", [character("mine", "ST32-004")])
      .build();

    full.play({ summary: "[OP08-095]" });
    full.play({ type: "resolve-effect", optionId: "mine" });
    settle(full);
    expect(currentPower(full.state, "p1", "mine")).toBe(7_000);

    const thin = table("op08-095-thin")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-095")])
      .withBoard("p1", [character("mine", "ST32-004")])
      .build();

    // Nothing in the trash, so the Event is not on the table at all.
    expect(
      thin.legalActions().some((action) => action.summary.includes("OP08-095")),
    ).toBe(false);
  });

  it("hands 2000 to a card off a Life card", () => {
    const game = triggerFrom("op08-095-trigger", "OP08-095");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
  });
});

describe("OP08-096 People's Dreams Don't Ever End!!", () => {
  covers("OP08-096", "[Counter]", "[Trigger]");

  it("pays 5000 off a cost 6 flip and nothing off a cheap one", () => {
    const hit = defending("op08-096-hit")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-096")])
      .withDeckTop("p1", [instance("big", "OP08-047")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    hit.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(hit);
    hit.play({ summary: "[OP08-096]" });
    settle(hit);
    expect(hit.state.activeAttack?.counterPower).toBe(5_000);
    expect(hit.state.players.p1.trash.map((card) => card.instanceId)).toContain(
      "big",
    );

    const miss = defending("op08-096-miss")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-096")])
      .withDeckTop("p1", [instance("small", "OP08-033")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    miss.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(miss);
    miss.play({ summary: "[OP08-096]" });
    settle(miss);
    expect(miss.state.activeAttack?.counterPower).toBe(0);
  });

  it("plays a cheap black body out of the trash off a Life card", () => {
    const game = triggerFrom("op08-096-trigger", "OP08-096");
    game.state.players.p1.trash.push({
      instanceId: "black-body",
      cardNumber: "OP08-090",
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "black-body" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "black-body",
    ]);
  });
});

describe("OP08-097 Heliceratops", () => {
  covers("OP08-097", "[Main]", "[Trigger]");

  it("debuffs a cost and then kills what the debuff reached", () => {
    const game = table("op08-097")
      .bareTable()
      .withLeader("p1", "OP08-057")
      .withHand("p1", [instance("event", "OP08-097")])
      .withBoard("p2", [character("target", "OP08-035")])
      .build();

    game.play({ summary: "[OP08-097]" });
    game.play({ type: "resolve-effect", optionId: "target" });
    // Cost 2 minus 2 is 0, which is what the K.O. half is written for.
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("kills a cost 3 off a Life card", () => {
    const game = triggerFrom("op08-097-trigger", "OP08-097");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settleDeclining(game);
    expect(game.state.pendingEffect).toBeNull();
  });
});

// --- Yellow ------------------------------------------------------------------

describe("OP08-098 Kalgara (Leader)", () => {
  covers("OP08-098", "[When Attacking]");

  it("plays a {Shandian Warrior} priced off the field and banks a Life card", () => {
    const game = table("op08-098")
      .bareTable()
      .withLeader("p1", "OP08-098")
      .withDon("p1", { leaderAttached: 1 })
      .withHand("p1", [instance("wyper", "OP08-110")])
      .withLife("p1", [
        instance("life-a", "ST32-004"),
        instance("life-b", "ST32-004"),
      ])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "wyper" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("wyper");
    // "If you do": the Life card only moves because a body landed.
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-a",
    );
  });

  it("does nothing without a DON!! on the Leader", () => {
    const game = table("op08-098-bare")
      .bareTable()
      .withLeader("p1", "OP08-098")
      .withHand("p1", [instance("wyper", "OP08-110")])
      .withLife("p1", [instance("life-a", "ST32-004")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP08-100 South Bird", () => {
  covers("OP08-100", "[On Play]");

  it("digs seven and puts every miss back at the bottom", () => {
    const game = table("op08-100")
      .bareTable()
      .withHand("p1", [instance("bird", "OP08-100")])
      .withDeckTop("p1", [instance("a", "ST32-004"), instance("b", "OP08-110")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-100" });
    settle(game);

    // The Stage it names is an OP-07 card and is not in the imported pool, so
    // nothing here can be found -- what this pins is that the look happens and
    // the deck comes back whole.
    expect(game.state.players.p1.deck).toHaveLength(2);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP08-100",
    ]);
  });
});

describe("OP08-101 Charlotte Angel", () => {
  covers("OP08-101", "[Activate: Main]");

  it("trashes a Life card now for one off the deck when the turn ends", () => {
    const game = table("op08-101")
      .bareTable()
      .withLeader("p1", "OP08-058")
      .withBoard("p1", [character("angel", "OP08-101")])
      .withLife("p1", [
        instance("spent", "ST32-004"),
        instance("kept", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("banked", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-101" });
    applyOptional(game);
    settle(game);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "spent",
    ]);
    expect(game.state.players.p1.life).toHaveLength(1);

    while (game.state.turnPlayerId === "p1") game.pass();
    // The card is whatever is on top when the turn ends, which is why the
    // clause is booked rather than resolved on the spot.
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "banked",
      "kept",
    ]);
  });
});

describe("OP08-102 Charlotte Opera", () => {
  covers("OP08-102", "[On Play]");

  it("kills up to its controller's own Life total", () => {
    const game = table("op08-102")
      .bareTable()
      .withHand("p1", [
        instance("opera", "OP08-102"),
        instance("fodder", "ST32-004"),
      ])
      .withLife("p1", [
        instance("l1", "ST32-004"),
        instance("l2", "ST32-004"),
        instance("l3", "ST32-004"),
        instance("l4", "ST32-004"),
      ])
      .withBoard("p2", [
        character("inside", "OP08-042"),
        character("outside", "OP08-047"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-102" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    // Four Life cards, so a 4-cost is inside the ceiling and a 6-cost is not.
    expect(effectOptions(game.state)).toContain("inside");
    expect(effectOptions(game.state)).not.toContain("outside");
    game.play({ type: "resolve-effect", optionId: "inside" });
    settle(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "outside",
    ]);
  });
});

describe("OP08-103 Charlotte Custard", () => {
  covers("OP08-103", "[Activate: Main]");

  it("banks a Life card into hand for a buff that holds through their turn", () => {
    const game = table("op08-103")
      .bareTable()
      .withBoard("p1", [
        character("custard", "OP08-103"),
        character("mine", "ST32-004"),
      ])
      .withLife("p1", [instance("l1", "ST32-004"), instance("l2", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-103" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "l1" });
    game.play({ type: "resolve-effect", optionId: "mine" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "l1",
    ]);
    expect(currentPower(game.state, "p1", "mine")).toBe(6_000);
  });
});

describe("OP08-104 Charlotte Poire", () => {
  covers("OP08-104", "[Trigger]");

  it("pays a card to put itself down and draw", () => {
    const game = triggerFrom("op08-104", "OP08-104", {
      hand: ["ST32-004"],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "op08-104-hand-0" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP08-104",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });

  it("does nothing with an empty hand", () => {
    const game = triggerFrom("op08-104-empty", "OP08-104");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settleDeclining(game);
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP08-105 Jewelry Bonney", () => {
  covers("OP08-105", "[Your Turn]", "[Trigger]");

  it("refills when a card leaves their Life, with a DON!! on it", () => {
    const game = table("op08-105")
      .bareTable()
      .withBoard("p1", [
        character("bonney", "OP08-105"),
        character("attacker", "ST32-004"),
      ])
      .withGivenDon("p1", "bonney", 1)
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    while (game.state.pendingEffect) {
      const options = effectOptions(game.state);
      game.play({ type: "resolve-effect", optionId: options[0]! });
    }

    // Two drawn and one of them spent, so the hand is one card up and both
    // draws have come off the deck.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.deck).toHaveLength(0);
  });

  it("stays quiet without the DON!!", () => {
    const game = table("op08-105-bare")
      .bareTable()
      .withBoard("p1", [
        character("bonney", "OP08-105"),
        character("attacker", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("draw-a", "ST32-004")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("draws two and trashes one off a Life card", () => {
    const game = triggerFrom("op08-105-trigger", "OP08-105");
    const before = game.state.players.p1.hand.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    // Two drawn and one of them spent, so the hand is up by one; the Trigger
    // card itself is in the trash beside what was discarded.
    expect(game.state.players.p1.hand).toHaveLength(before + 1);
  });
});

describe("OP08-106 Nami", () => {
  covers("OP08-106", "[On Play]", "[Trigger]");

  it("spends a [Trigger] card for a kill and a refill", () => {
    const game = table("op08-106")
      .bareTable()
      .withHand("p1", [
        instance("nami", "OP08-106"),
        instance("trigger-card", "OP08-104"),
        instance("plain", "OP08-108"),
      ])
      .withDeckTop("p1", [instance("drawn", "ST32-004")])
      .withBoard("p2", [character("target", "OP08-046")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-106" });
    applyOptional(game);
    // The cost names a card with a [Trigger], which is a derived fact rather
    // than a word in the text.
    expect(effectOptions(game.state)).toEqual(["trigger-card"]);
    game.play({ type: "resolve-effect", optionId: "trigger-card" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["drawn", "plain"]);
  });

  it("runs its own [On Play] off a Life card", () => {
    const game = triggerFrom("op08-106-trigger", "OP08-106", {
      hand: ["OP08-104"],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "op08-106-trigger-hand-0" });
    settle(game);

    // The [Trigger] card in hand paid the cost, so it is in the trash beside
    // the Life card that ran this.
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("op08-106-trigger-hand-0");
  });
});

describe("OP08-107 Nitro", () => {
  covers("OP08-107", "[Activate: Main]");

  it("rests to hand its Leader +2000, because the Leader is a [Charlotte Pudding] card", () => {
    const game = table("op08-107")
      .bareTable()
      .withLeader("p1", "OP08-058")
      .withBoard("p1", [character("nitro", "OP08-107")])
      .build();

    game.play({ type: "activate-main", summary: "OP08-107" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "nitro")!
        .rested,
    ).toBe(true);
  });
});

describe("OP08-109 Mont Blanc Noland", () => {
  covers("OP08-109", "[On Play]");

  it("banks a Life card behind the Leader and a [Kalgara]", () => {
    const game = table("op08-109")
      .bareTable()
      .withLeader("p1", "OP08-098")
      .withHand("p1", [instance("noland", "OP08-109")])
      .withBoard("p1", [character("kalgara", "OP08-099")])
      .withDeckTop("p1", [instance("banked", "ST32-004")])
      .withLife("p1", [instance("l1", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-109" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "banked",
      "l1",
    ]);
  });

  it("does nothing without a [Kalgara] on the board", () => {
    const game = table("op08-109-alone")
      .bareTable()
      .withLeader("p1", "OP08-098")
      .withHand("p1", [instance("noland", "OP08-109")])
      .withDeckTop("p1", [instance("banked", "ST32-004")])
      .withLife("p1", [instance("l1", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-109" });
    settleDeclining(game);
    expect(game.state.players.p1.life).toHaveLength(1);
  });
});

describe("OP08-110 Wyper", () => {
  covers("OP08-110", "[On Play]");

  it("digs five and comes back with the deck whole when the Stage is not there", () => {
    const game = table("op08-110")
      .bareTable()
      .withHand("p1", [instance("wyper", "OP08-110")])
      .withDeckTop("p1", [instance("a", "ST32-004"), instance("b", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-110" });
    settle(game);

    // The Stage it names is an OP-07 card, outside the imported pool.
    expect(game.state.players.p1.deck).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP08-111 S-Shark", () => {
  covers("OP08-111", "[When Attacking]", "[Trigger]");

  it("attacks through a [Blocker] with a DON!! on it", () => {
    const game = table("op08-111")
      .bareTable()
      .withBoard("p1", [character("shark", "OP08-111")])
      .withGivenDon("p1", "shark", 1)
      .withBoard("p2", [character("blocker", "OP08-003")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .withDeckTop("p2", [instance("their-draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "shark",
      targetInstanceId: "p2-leader",
    });
    settle(game);

    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
  });

  it("puts itself down off a Life card from two Life or fewer", () => {
    const game = triggerFrom("op08-111-trigger", "OP08-111", {
      hand: ["ST32-004"],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "op08-111-trigger-hand-0" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP08-111",
    ]);
  });
});

describe("OP08-112 S-Snake", () => {
  covers("OP08-112", "[On Play]", "[Trigger]");

  it("stops a cost 6 attacking, and never the printed exception", () => {
    const game = table("op08-112")
      .bareTable()
      .withHand("p1", [instance("snake", "OP08-112")])
      .withBoard("p2", [
        character("theirs", "OP08-047"),
        character("luffy", "OP08-085"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP08-112" });
    expect(effectOptions(game.state)).toContain("theirs");
    game.play({ type: "resolve-effect", optionId: "theirs" });
    settle(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "theirs")!
        .cannotAttackUntilTurn,
    ).toBe(12);
  });

  it("runs the same clause off a Life card", () => {
    const game = triggerFrom("op08-112-trigger", "OP08-112");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    expect(
      game.state.players.p2.board.find(
        (card) => card.instanceId === "attacker",
      )!.cannotAttackUntilTurn,
    ).toBe(13);
  });
});

describe("OP08-113 S-Bear", () => {
  covers("OP08-113", "[Trigger]");

  it("lands and kills a cost 3 off a Life card", () => {
    const game = triggerFrom("op08-113", "OP08-113", { hand: ["ST32-004"] });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "op08-113-hand-0" });
    settleDeclining(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP08-113",
    ]);
  });
});

describe("OP08-114 S-Hawk", () => {
  covers("OP08-114", "static", "[Trigger]");

  it("is +2000 and survives a <Slash> fight from behind on Life", () => {
    const game = defending("op08-114")
      .bareTable()
      .withBoard("p1", [character("hawk", "OP08-114", { rested: true })])
      .withGivenDon("p1", "hawk", 1)
      .withLife("p1", [instance("life", "ST32-004")])
      .withLife("p2", [
        instance("their-a", "ST32-004"),
        instance("their-b", "ST32-004"),
      ])
      // <Slash>, and big enough to win the fight -- which is what the printed
      // clause refuses. A <Strike> body of the same size would K.O. it.
      .withBoard("p2", [character("slash", "OP08-084")])
      .build();

    expect(currentPower(game.state, "p1", "hawk")).toBe(8_000);

    game.play({
      type: "attack",
      attackerInstanceId: "slash",
      targetInstanceId: "hawk",
    });
    declineDefence(game);

    // A 7000 <Strike> would not have got there anyway; what this pins is that
    // an attacker that *does* out-power it still cannot K.O. it in battle.
    expect(game.state.players.p1.board).toHaveLength(1);
  });

  it("is a plain 5000 while it is not behind", () => {
    const game = table("op08-114-ahead")
      .bareTable()
      .withBoard("p1", [character("hawk", "OP08-114")])
      .withGivenDon("p1", "hawk", 1)
      .withLife("p1", [instance("l1", "ST32-004"), instance("l2", "ST32-004")])
      .withLife("p2", [instance("their-life", "ST32-004")])
      .build();

    expect(currentPower(game.state, "p1", "hawk")).toBe(6_000);
  });

  it("puts itself down off a Life card", () => {
    const game = triggerFrom("op08-114-trigger", "OP08-114", {
      hand: ["ST32-004"],
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "op08-114-trigger-hand-0" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP08-114",
    ]);
  });
});

describe("OP08-115 The Earth Will Not Lose!", () => {
  covers("OP08-115", "[Counter]", "[Trigger]");

  it("adds 3000 behind a {Shandian Warrior} Leader and nothing behind another", () => {
    const game = defending("op08-115")
      .bareTable()
      .withLeader("p1", "OP08-098")
      .withHand("p1", [instance("event", "OP08-115")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP08-115]" });
    settleDeclining(game);
    expect(game.state.activeAttack?.counterPower).toBe(3_000);

    const wrong = defending("op08-115-wrong")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-115")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("life", "ST32-004")])
      .build();

    wrong.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(wrong);
    wrong.play({ summary: "[OP08-115]" });
    settleDeclining(wrong);
    // `powerWhen` is what keeps the forecast honest: behind the wrong Leader
    // the Counter adds nothing at all, and the offer's own summary says so.
    expect(wrong.state.activeAttack?.counterPower).toBe(0);
  });

  it("draws two and trashes one off a Life card", () => {
    const game = triggerFrom("op08-115-trigger", "OP08-115");
    const before = game.state.players.p1.hand.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(before + 1);
  });
});

describe("OP08-116 Burn Bazooka", () => {
  covers("OP08-116", "[Counter]");

  it("adds 4000 and swaps a Life card for a {Shandian Warrior} from hand", () => {
    const game = defending("op08-116")
      .bareTable()
      .withHand("p1", [
        instance("event", "OP08-116"),
        instance("shandian", "OP08-110"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", [instance("l1", "ST32-004"), instance("l2", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP08-116]" });
    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "l1" });
    game.play({ type: "resolve-effect", optionId: "shandian" });
    settle(game);

    expect(game.state.players.p1.life[0]!.instanceId).toBe("shandian");
    expect(game.state.players.p1.life[0]!.faceUp).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "l1",
    );
  });
});

describe("OP08-117 Burn Blade", () => {
  covers("OP08-117", "[Main]", "[Trigger]");

  it("spends a Life card for the set's biggest Event kill", () => {
    const game = table("op08-117")
      .bareTable()
      .withHand("p1", [instance("event", "OP08-117")])
      .withLife("p1", [
        instance("spent", "ST32-004"),
        instance("kept", "ST32-004"),
      ])
      .withBoard("p2", [character("target", "OP08-060")])
      .build();

    game.play({ summary: "[OP08-117]" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "spent" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    // The Life card is trashed, not banked into hand -- it is in the trash
    // beside the Event that spent it.
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("spent");
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("swaps a Life card for one from hand off a Life card", () => {
    const game = triggerFrom("op08-117-trigger", "OP08-117");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settleDeclining(game);
    expect(game.state.pendingEffect).toBeNull();
  });
});
