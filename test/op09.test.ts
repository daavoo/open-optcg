import { describe, expect, it } from "vitest";
import {
  currentPower,
  effectiveCost,
  eventText,
  getLegalActions,
  hasKeyword,
  observe,
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
 * BOOSTER PACK -EMPERORS IN THE NEW WORLD- [OP-09], as a whole-set import.
 *
 * `packages/cards/src/op09.ts` explains where the records come from; this file
 * holds the behaviour. The set entered the pool for one card -- OP09-062, the
 * only Nico Robin Leader printed -- and `test/op09-robin.test.ts` drives the
 * three identities that deck plays. Seven more were already in the pool as
 * cards other decks ship, and stay with those decks' files:
 * `test/op12-rosinante.test.ts` (OP09-069), `test/op16-enel.test.ts`
 * (OP09-072), `test/op16-teach.test.ts` (OP09-093/096/099) and
 * `test/op16.test.ts` (OP09-086). Everything else in the set is here --
 * including OP09-112, whose programs live in `op16-nami.ts` because that deck
 * ships the card, and which no test drove until this one.
 *
 * ## Why no deck
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter, the documented
 * shape for a card outside a manifest. Where a clause is gated on a Leader the
 * pool would not otherwise seat -- OP-09 prints six of them, and its archetypes
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
    if (guard++ > 40) throw new Error("pending effect never settled");
    game.play({ type: "resolve-effect" });
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
 * Answer the "how many DON!! go back" prompt a "return 1 or more" clause opens.
 *
 * The six cards printing that clause offer every count they can pay, because
 * the count is a real decision -- it is what reaches OP09-061's "2 or more"
 * refund. These cases are about the payoff rather than the count, so they take
 * the printed floor; `returnsDon` below drives the counts that matter.
 */
const payReturnCount = (game: Game, count = 1) => {
  if (
    game.state.pendingEffect &&
    effectOptions(game.state).some((id) => id.startsWith("return:"))
  ) {
    game.play({
      type: "resolve-effect",
      optionId: `return:${String(count)}`,
    });
  }
};

/**
 * Answer the "which DON!! goes back" prompt a `DON!! −N` cost opens.
 *
 * The cost is paid a card at a time and the pools are interchangeable, so any
 * answer is the same answer -- taking the first keeps the test about the card.
 */
const payDonMinus = (game: Game) => {
  // A "return 1 or more" clause asks for the count first. Answering it at the
  // printed floor keeps every case written before that prompt existed about
  // the payoff it was written for; a case that cares about the count says so
  // with `payReturnCount`.
  payReturnCount(game);
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
  options: { leader?: string; donDeck?: number } = {},
) => {
  const { leader, donDeck } = options;
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
  // `bareTable()` empties the DON!! deck too, and a Trigger whose only effect
  // adds a DON!! from it is judged inert against an empty one.
  if (donDeck) built = built.withDonDeck("p1", donDeck);
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

describe("OP09-001 Shanks (Leader)", () => {
  covers("OP09-001", "static");

  it("takes 1000 off an attacker once a turn, and only once", () => {
    const game = defending("op09-001")
      .bareTable()
      .withLeader("p1", "OP09-001")
      .withBoard("p2", [
        character("first", "ST32-004"),
        character("second", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "first",
      targetInstanceId: "p1-leader",
    });
    // The offer belongs to the defender, inside the block step.
    expect(game.state.activePlayer).toBe("p1");
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "first" });
    expect(currentPower(game.state, "p2", "first")).toBe(4_000);
    declineDefence(game);

    // `[Once Per Turn]`: the second attack of the same turn gets no offer.
    game.play({
      type: "attack",
      attackerInstanceId: "second",
      targetInstanceId: "p1-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP09-002 Uta", () => {
  covers("OP09-002", "[On Play]");

  it("digs five deep for a {Red-Haired Pirates} card", () => {
    const game = table("op09-002")
      .bareTable()
      .withHand("p1", [instance("uta", "OP09-002")])
      .withDeckTop("p1", [
        instance("miss", "ST32-004"),
        instance("hit", "OP09-016"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-002" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    // "The rest at the bottom": the miss is still in the deck.
    expect(game.state.players.p1.deck).toHaveLength(1);
  });
});

describe("OP09-003 Shachi & Penguin", () => {
  covers("OP09-003", "[When Attacking]");

  it("takes 2000 off one of the opponent's Characters", () => {
    const game = table("op09-003")
      .bareTable()
      .withBoard("p1", [character("shachi", "OP09-003", { playedTurn: 1 })])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "shachi",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
  });
});

describe("OP09-004 Shanks", () => {
  covers("OP09-004", "[Rush]", "static");

  it("attacks the turn it lands and shrinks the whole opposing board", () => {
    const game = table("op09-004")
      .bareTable()
      .withHand("p1", [instance("shanks", "OP09-004")])
      .withBoard("p2", [
        character("theirs", "ST32-004"),
        character("other", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-004" });
    const shanks = game.state.players.p1.board[0]!;
    expect(hasKeyword(game.state, "p1", shanks.instanceId, "Rush")).toBe(true);

    // The aura reaches every Character on the other side, and only theirs.
    expect(currentPower(game.state, "p2", "theirs")).toBe(4_000);
    expect(currentPower(game.state, "p2", "other")).toBe(4_000);
    expect(currentPower(game.state, "p1", shanks.instanceId)).toBe(12_000);
  });
});

describe("OP09-005 Silvers Rayleigh", () => {
  covers("OP09-005", "[On Play]", "[Blocker]");

  it("draws two and discards one against two big bodies, and nothing against one", () => {
    const game = table("op09-005-two")
      .bareTable()
      .withHand("p1", [instance("rayleigh", "OP09-005")])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      // ST32-004 is a printed 5000, which is what "base power of 5000 or more"
      // reads -- not the power it happens to have on the board.
      .withBoard("p2", [
        character("big-a", "ST32-004"),
        character("big-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-005" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(1);
    expect(
      hasKeyword(
        game.state,
        "p1",
        game.state.players.p1.board[0]!.instanceId,
        "Blocker",
      ),
    ).toBe(true);

    const one = table("op09-005-one")
      .bareTable()
      .withHand("p1", [instance("rayleigh", "OP09-005")])
      .withDeckTop("p1", [instance("draw-a", "ST32-004")])
      .withBoard("p2", [character("big-a", "ST32-004")])
      .build();
    one.play({ type: "play-card", cardNumber: "OP09-005" });
    // One body clears nothing: the gate is two.
    expect(one.state.pendingEffect).toBeNull();
    expect(one.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP09-007 Heat", () => {
  covers("OP09-007", "[On Play]", "[Blocker]");

  it("props up a Leader that has been pushed under 5000, and no other", () => {
    const pushed = table("op09-007-low")
      .bareTable()
      .withHand("p1", [instance("heat", "OP09-007")])
      // ST21-001's printed 5000, minus 2000 for the turn, is inside the ceiling.
      .withBoard("p2", [character("krieg", "OP09-004")])
      .build();
    // OP09-004's aura only touches Characters, so the Leader is still 5000 and
    // outside the printed "4000 power or less" -- the clause offers nothing.
    pushed.play({ type: "play-card", cardNumber: "OP09-007" });
    expect(pushed.state.pendingEffect).toBeNull();

    const game = table("op09-007-blocker")
      .bareTable()
      .withHand("p1", [instance("heat", "OP09-007")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP09-007" });
    expect(
      hasKeyword(
        game.state,
        "p1",
        game.state.players.p1.board[0]!.instanceId,
        "Blocker",
      ),
    ).toBe(true);
  });
});

describe("OP09-008 Building Snake", () => {
  covers("OP09-008", "[Activate: Main]");

  it("buries itself under the deck for a 3000 debuff", () => {
    const game = table("op09-008")
      .bareTable()
      .withBoard("p1", [character("snake", "OP09-008")])
      .withBoard("p2", [character("target", "ST32-004")])
      .withDeckTop("p1", [instance("deck-card", "ST32-004")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:snake" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(currentPower(game.state, "p2", "target")).toBe(2_000);
    // The body goes under the deck, not to the trash.
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("snake");
  });
});

describe("OP09-009 Benn.Beckman", () => {
  covers("OP09-009", "[On Play]");

  it("trashes a 6000 rather than K.O.ing it", () => {
    const game = table("op09-009")
      .bareTable()
      .withHand("p1", [instance("beckman", "OP09-009")])
      .withBoard("p2", [
        character("reachable", "OP09-016"),
        character("too-big", "OP09-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-009" });
    // 6000 printed is inside the ceiling; the 12000 is not.
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "too-big",
    ]);
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "reachable",
    ]);
  });
});

describe("OP09-010 Bonk Punch", () => {
  covers("OP09-010", "[On Play]", "[When Attacking]");

  it("puts its [Monster] out of hand for free", () => {
    const game = table("op09-010-on-play")
      .bareTable()
      .withHand("p1", [
        instance("bonk", "OP09-010"),
        instance("monster", "OP09-012"),
        instance("other", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-010" });
    // Only the [Monster] is a legal free play.
    expect(effectOptions(game.state)).toEqual(["monster", "done"]);
    game.play({ type: "resolve-effect", optionId: "monster" });

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP09-010", "OP09-012"]);
    // Free: the 3-cost body cost nothing beyond Bonk Punch's own 4.
    expect(game.state.players.p1.restedDon).toHaveLength(4);
  });

  it("gains 2000 attacking with a DON!! given, and nothing without", () => {
    const bare = table("op09-010-bare")
      .bareTable()
      .withBoard("p1", [character("bonk", "OP09-010", { playedTurn: 1 })])
      .build();
    bare.play({
      type: "attack",
      attackerInstanceId: "bonk",
      targetInstanceId: "p2-leader",
    });
    expect(currentPower(bare.state, "p1", "bonk")).toBe(5_000);

    const donned = table("op09-010-donned")
      .bareTable()
      .withBoard("p1", [character("bonk", "OP09-010", { playedTurn: 1 })])
      .withGivenDon("p1", "bonk", 1)
      .build();
    donned.play({
      type: "attack",
      attackerInstanceId: "bonk",
      targetInstanceId: "p2-leader",
    });
    // 5000 printed, +1000 for the DON!! and +2000 for the clause.
    expect(currentPower(donned.state, "p1", "bonk")).toBe(8_000);
  });
});

describe("OP09-011 Hongo", () => {
  covers("OP09-011", "[Activate: Main]");

  it("rests itself for a 2000 debuff behind a {Red-Haired Pirates} Leader", () => {
    const game = table("op09-011")
      .bareTable()
      .withLeader("p1", "OP09-001")
      .withBoard("p1", [character("hongo", "OP09-011")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:hongo" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);

    // Behind another Leader the rest still happens and the debuff does not.
    const other = table("op09-011-other-leader")
      .bareTable()
      .withBoard("p1", [character("hongo", "OP09-011")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();
    other.play({ type: "activate-main", optionId: "mechanic-main:hongo" });
    applyOptional(other);
    settle(other);
    expect(currentPower(other.state, "p2", "target")).toBe(5_000);
  });
});

describe("OP09-012 Monster", () => {
  covers("OP09-012", "static");

  it("trashes itself in place of a K.O. aimed at [Bonk Punch]", () => {
    const game = defending("op09-012")
      .bareTable()
      .withBoard("p1", [
        character("monster", "OP09-012"),
        character("bonk", "OP09-010"),
      ])
      // OP09-077 Gum-Gum Lightning K.O.s a Character of 6000 power or less,
      // which is the cheapest effect in the set that reaches a printed 5000.
      .withHand("p2", [instance("lightning", "OP09-077")])
      .build();

    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "bonk" });

    // The threatened card's controller is offered the replacement.
    expect(game.state.activePlayer).toBe("p1");
    const option = effectOptions(game.state).find((id) =>
      id.includes("monster"),
    );
    expect(option).toBeDefined();
    game.play({ type: "resolve-effect", optionId: option! });

    // Bonk Punch lives; Monster is in the trash, not K.O.'d.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "bonk",
    ]);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "monster",
    ]);
  });

  it("does not answer a K.O. aimed at anything else", () => {
    const game = defending("op09-012-other")
      .bareTable()
      .withBoard("p1", [
        character("monster", "OP09-012"),
        character("other", "OP09-016"),
      ])
      .withHand("p2", [instance("lightning", "OP09-077")])
      .build();

    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "other" });
    settle(game);

    // `protects` names [Bonk Punch] and nothing else, so the 6000 simply dies.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "monster",
    ]);
  });
});

describe("OP09-013 Yasopp", () => {
  covers("OP09-013", "[On Play]", "[When Attacking]");

  it("buys the Leader 1000 into the opponent's turn", () => {
    const game = table("op09-013")
      .bareTable()
      .withHand("p1", [instance("yasopp", "OP09-013")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-013" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);

    game.pass();
    // "Until the end of your opponent's next turn": still 6000 on their turn.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });

  it("takes 1000 off a Character when it attacks with a DON!! given", () => {
    const game = table("op09-013-attack")
      .bareTable()
      .withBoard("p1", [character("yasopp", "OP09-013", { playedTurn: 1 })])
      .withGivenDon("p1", "yasopp", 1)
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "yasopp",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "target" });
    expect(currentPower(game.state, "p2", "target")).toBe(4_000);
  });
});

describe("OP09-014 Limejuice", () => {
  covers("OP09-014", "[On Play]");

  it("switches a small [Blocker] off without removing the keyword", () => {
    const game = table("op09-014")
      .bareTable()
      .withHand("p1", [instance("limejuice", "OP09-014")])
      .withBoard("p2", [
        character("small", "OP09-054"),
        character("big", "OP09-005"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-014" });
    // Only the 2000 [Blocker] is inside the printed ceiling; the 6000 is not.
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    game.play({ type: "resolve-effect", optionId: "small" });

    // Limejuice is not a [Blocker] itself: the one its text names is theirs.
    expect(hasKeyword(game.state, "p1", "limejuice", "Blocker")).toBe(false);
    // The keyword is still printed on both cards -- this clause switches the
    // *ability* off, which is what the block step then refuses to offer.
    expect(hasKeyword(game.state, "p2", "small", "Blocker")).toBe(true);
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    const blockers = game
      .legalActions()
      .filter((action) => action.type === "block")
      .map((action) =>
        "blockerInstanceId" in action ? action.blockerInstanceId : "",
      );
    expect(blockers).toEqual(["big"]);
  });
});

describe("OP09-015 Lucky.Roux", () => {
  covers("OP09-015", "[On K.O.]", "[Blocker]");

  it("K.O.s a 6000 as it dies behind its own Leader, and nothing behind another", () => {
    const game = defending("op09-015")
      .bareTable()
      .withLeader("p1", "OP09-001")
      .withBoard("p1", [character("roux", "OP09-015", { rested: true })])
      .withBoard("p2", [
        character("killer", "OP09-004"),
        character("victim", "OP09-016"),
      ])
      .build();
    expect(hasKeyword(game.state, "p1", "roux", "Blocker")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "roux",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "victim" });

    // Roux lost the fight and took a printed 6000 with it.
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "killer",
    ]);
  });

  it("takes nothing with it behind a Leader of another type", () => {
    const game = defending("op09-015-other-leader")
      .bareTable()
      .withBoard("p1", [character("roux", "OP09-015", { rested: true })])
      .withBoard("p2", [
        character("killer", "OP09-004"),
        character("victim", "OP09-016"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "roux",
    });
    declineDefence(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.board).toHaveLength(2);
  });
});

describe("OP09-017 Wire", () => {
  covers("OP09-017", "static");

  it("gains [Rush] only behind a big {Kid Pirates} Leader with a DON!! on it", () => {
    const off = table("op09-017-off")
      .bareTable()
      .withBoard("p1", [character("wire", "OP09-017", { playedTurn: 11 })])
      .withGivenDon("p1", "wire", 1)
      .build();
    // ST31's Leader is neither {Kid Pirates} nor 7000.
    expect(hasKeyword(off.state, "p1", "wire", "Rush")).toBe(false);

    const on = table("op09-017-on")
      .bareTable()
      .withLeader("p1", "OP10-099")
      .withBoard("p1", [character("wire", "OP09-017", { playedTurn: 11 })])
      .withGivenDon("p1", "wire", 1)
      .withDon("p1", { leaderAttached: 2 })
      .build();
    expect(hasKeyword(on.state, "p1", "wire", "Rush")).toBe(true);
  });
});

describe("OP09-018 Get Out of Here!", () => {
  covers("OP09-018", "[Main]");

  it("K.O.s two Characters that fit one 4000 power budget", () => {
    const game = table("op09-018")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-018")])
      .withBoard("p2", [
        character("small-a", "OP09-054"),
        character("small-b", "OP09-054"),
        character("big", "ST32-004"),
      ])
      .build();

    game.play({ summary: "[OP09-018]" });
    // The 5000 is outside the budget before anything is picked.
    expect(effectOptions(game.state).sort()).toEqual([
      "done",
      "small-a",
      "small-b",
    ]);
    game.play({ type: "resolve-effect", optionId: "small-a" });
    // 2000 spent, 2000 left: the other 2000 still fits.
    expect(effectOptions(game.state).sort()).toEqual(["done", "small-b"]);
    game.play({ type: "resolve-effect", optionId: "small-b" });
    settle(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });

  it("offers no second pick once the budget is spent", () => {
    const game = table("op09-018-budget")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-018")])
      .withBoard("p2", [
        character("four", "OP09-017"),
        character("two", "OP09-054"),
      ])
      .build();

    game.play({ summary: "[OP09-018]" });
    game.play({ type: "resolve-effect", optionId: "four" });
    // 4000 of 4000 spent: no candidate fits, so the choice resolves rather than
    // asking a question with one answer. The 2000 lives.
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "two",
    ]);
  });
});

describe("OP09-019 Nobody Hurts a Friend of Mine!!!!", () => {
  covers("OP09-019", "[Main]", "[Trigger]");

  it("debuffs, then draws only if a 5000 is still standing", () => {
    const game = table("op09-019")
      .bareTable()
      .withLeader("p1", "OP09-001")
      .withHand("p1", [instance("event", "OP09-019")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .withBoard("p2", [
        character("target", "OP09-016"),
        character("other", "ST32-004"),
      ])
      .build();

    game.play({ summary: "[OP09-019]" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
    // The other body is a printed 5000 and still is, so the draw happens.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op09-019-trigger", "OP09-019");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP09-020 Come On!! We'll Fight You!!", () => {
  covers("OP09-020", "[Main]", "[Trigger]");

  it("digs five deep for a {Red-Haired Pirates} card other than itself", () => {
    const game = table("op09-020")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-020")])
      .withDeckTop("p1", [
        instance("itself", "OP09-020"),
        instance("hit", "OP09-016"),
      ])
      .build();

    game.play({ summary: "[OP09-020]" });
    // Another copy of the Event is {Red-Haired Pirates} and is excluded by name.
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op09-020-trigger", "OP09-020");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP09-021 Red Force", () => {
  covers("OP09-021", "[Activate: Main]");

  it("rests the Stage for a 1000 debuff behind a {Red-Haired Pirates} Leader", () => {
    const game = table("op09-021")
      .bareTable()
      .withLeader("p1", "OP09-001")
      .withStage("p1", instance("red-force", "OP09-021"))
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:red-force" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });

    expect(currentPower(game.state, "p2", "target")).toBe(4_000);
    expect(game.state.players.p1.stage?.rested).toBe(true);
    // Resting it is the cost, so a rested Stage is not offered again.
    expect(
      game.legalActions().some((action) => action.type === "activate-main"),
    ).toBe(false);
  });
});

// --- Green -------------------------------------------------------------------

/** p1 led by the ODYSSEY Leader, whose own rule rests everything it plays. */
const odyssey = (seed: string) =>
  table(seed).bareTable().withLeader("p1", "OP09-022");

describe("OP09-022 Lim (Leader)", () => {
  covers("OP09-022", "[Activate: Main]", "static");

  it("plays its Characters rested, out of hand and out of an effect alike", () => {
    const game = odyssey("op09-022-rested")
      .withHand("p1", [instance("body", "OP09-038")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-038" });
    expect(game.state.players.p1.board[0]?.rested).toBe(true);

    // The same rule reaches a body another card plays: OP09-030's [On Play]
    // deploys out of hand, and what it deploys arrives rested too.
    const viaEffect = odyssey("op09-022-effect")
      .withBoard("p1", [character("bounce", "OP09-038")])
      .withHand("p1", [
        instance("law", "OP09-030"),
        instance("free", "OP09-029"),
      ])
      .build();
    viaEffect.play({ type: "play-card", cardNumber: "OP09-030" });
    applyOptional(viaEffect);
    viaEffect.play({ type: "resolve-effect", optionId: "bounce" });
    viaEffect.play({ type: "resolve-effect", optionId: "free" });
    settle(viaEffect);
    expect(viaEffect.state.players.p1.board.every((card) => card.rested)).toBe(
      true,
    );
  });

  it("rests three DON!! for a rested DON!! back and a free ODYSSEY body", () => {
    const game = odyssey("op09-022-activate")
      .withDonDeck("p1", 2)
      .withHand("p1", [
        instance("target", "OP09-029"),
        instance("too-big", "OP09-023"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    // Cost 5 or less: the 9-cost Adio is outside it.
    expect(effectOptions(game.state)).toEqual(["target", "done"]);
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP09-029",
    ]);
    // Three rested to pay, one added rested: the DON!! never left the field.
    expect(game.state.players.p1.restedDon).toHaveLength(4);
    // `[Once Per Turn]`: no second activation this turn.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.optionId === "mechanic-main:p1-leader",
        ),
    ).toBe(false);
  });
});

describe("OP09-023 Adio", () => {
  covers("OP09-023", "[On Play]", "[On Your Opponent's Attack]");

  it("sets three DON!! active behind an ODYSSEY Leader, and none behind another", () => {
    const game = odyssey("op09-023")
      .withHand("p1", [instance("adio", "OP09-023")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-023" });
    settle(game);
    // Nine paid the body and the clause hands three back.
    expect(game.state.players.p1.activeDon).toHaveLength(4);

    const other = table("op09-023-other")
      .bareTable()
      .withHand("p1", [instance("adio", "OP09-023")])
      .build();
    other.play({ type: "play-card", cardNumber: "OP09-023" });
    settle(other);
    expect(other.state.players.p1.activeDon).toHaveLength(1);
  });

  it("rests a DON!! for 2000 in the battle it is offered in", () => {
    const game = defending("op09-023-defence")
      .bareTable()
      .withBoard("p1", [character("adio", "OP09-023")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("OP09-024 Usopp", () => {
  covers("OP09-024", "[On Play]");

  it("draws two and discards two off a rested board, and nothing off an active one", () => {
    const game = odyssey("op09-024")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("usopp", "OP09-024")])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-024" });
    settle(game);
    // Two drawn, two discarded: the hand is empty again and the trash holds two.
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(2);

    const active = table("op09-024-active")
      .bareTable()
      .withBoard("p1", [character("a", "OP09-038")])
      .withHand("p1", [instance("usopp", "OP09-024")])
      .withDeckTop("p1", [instance("draw-a", "ST32-004")])
      .build();
    active.play({ type: "play-card", cardNumber: "OP09-024" });
    expect(active.state.pendingEffect).toBeNull();
    expect(active.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP09-025 Crocodile", () => {
  covers("OP09-025", "static");

  it("survives a Leader's attack behind an ODYSSEY Leader, and dies to a Character's", () => {
    const toLeader = defending("op09-025-leader")
      .bareTable()
      .withLeader("p1", "OP09-022")
      .withBoard("p1", [character("croc", "OP09-025", { rested: true })])
      .withDon("p2", { leaderAttached: 2 })
      .build();

    toLeader.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "croc",
    });
    declineDefence(toLeader);
    // 7000 of Leader beats a 5000, and the body still stands.
    expect(toLeader.state.players.p1.board).toHaveLength(1);

    const toCharacter = defending("op09-025-character")
      .bareTable()
      .withLeader("p1", "OP09-022")
      .withBoard("p1", [character("croc", "OP09-025", { rested: true })])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();
    toCharacter.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "croc",
    });
    declineDefence(toCharacter);
    expect(toCharacter.state.players.p1.board).toHaveLength(0);
  });

  it("is an ordinary body behind a Leader of another type", () => {
    const game = defending("op09-025-other")
      .bareTable()
      .withBoard("p1", [character("croc", "OP09-025", { rested: true })])
      .withDon("p2", { leaderAttached: 2 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "croc",
    });
    declineDefence(game);
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP09-026 Sakazuki", () => {
  covers("OP09-026", "[On Play]");

  it("K.O.s a cost 5 off a rested board", () => {
    const game = odyssey("op09-026")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("sakazuki", "OP09-026")])
      .withBoard("p2", [
        character("reachable", "ST32-004"),
        character("too-big", "OP09-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-026" });
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "too-big",
    ]);
  });
});

describe("OP09-027 Sabo", () => {
  covers("OP09-027", "[When Attacking]");

  it("draws once a turn off three rested Characters", () => {
    const game = odyssey("op09-027")
      .withBoard("p1", [
        character("sabo", "OP09-027", { playedTurn: 1 }),
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();

    // Sabo rests to attack, which is the third rested Character.
    game.play({
      type: "attack",
      attackerInstanceId: "sabo",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
  });

  it("draws nothing off a board of two", () => {
    const game = odyssey("op09-027-short")
      .withBoard("p1", [
        character("sabo", "OP09-027", { playedTurn: 1 }),
        character("a", "OP09-038", { rested: true }),
      ])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "sabo",
      targetInstanceId: "p2-leader",
    });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP09-028 Sanji", () => {
  covers("OP09-028", "[On K.O.]");

  it("spends a Life card to bring a 4-cost back out of the trash rested", () => {
    const game = defending("op09-028")
      .bareTable()
      .withLeader("p1", "OP09-022")
      .withBoard("p1", [character("sanji", "OP09-028", { rested: true })])
      .withTrash("p1", [
        instance("target", "OP09-029"),
        instance("too-big", "OP09-023"),
      ])
      .withLife("p1", [instance("life", "ST32-004")])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "sanji",
    });
    declineDefence(game);
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "life" });
    // Cost 4 or less, {ODYSSEY} or {Straw Hat Crew}: the 9-drop is outside it.
    expect(effectOptions(game.state)).toEqual(["target", "done"]);
    game.play({ type: "resolve-effect", optionId: "target" });

    const back = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP09-029",
    );
    expect(back?.rested).toBe(true);
    // The Life card paid for it and is in hand.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "life",
    ]);
  });
});

describe("OP09-029 Tony Tony.Chopper", () => {
  covers("OP09-029", "[End of Your Turn]");

  it("stands a small ODYSSEY body back up at the end of the turn", () => {
    const game = odyssey("op09-029")
      .withBoard("p1", [
        character("chopper", "OP09-029"),
        character("small", "OP09-038", { rested: true }),
        character("big", "OP09-023", { rested: true }),
      ])
      .build();

    game.pass();
    // "Up to 1" -- the clause asks which, and the 9-drop is outside its ceiling.
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    game.play({ type: "resolve-effect", optionId: "small" });
    settle(game);
    // Cost 4 or less: the 9-drop stays rested.
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "small")
        ?.rested,
    ).toBe(false);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "big")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP09-030 Trafalgar Law", () => {
  covers("OP09-030", "[On Play]");

  it("returns one of its own bodies to hand to deploy a cheaper one", () => {
    const game = odyssey("op09-030")
      .withBoard("p1", [character("bounce", "OP09-038")])
      .withHand("p1", [
        instance("law", "OP09-030"),
        instance("free", "OP09-029"),
        instance("another-law", "OP09-030"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-030" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "bounce" });
    // Cost 3 or less, {ODYSSEY}, and not another [Trafalgar Law].
    expect(effectOptions(game.state)).toEqual(["free", "done"]);
    game.play({ type: "resolve-effect", optionId: "free" });

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP09-029", "OP09-030"]);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "another-law",
      "bounce",
    ]);
  });
});

describe("OP09-031 Donquixote Doflamingo", () => {
  covers("OP09-031", "[End of Your Turn]", "[Blocker]");

  it("stands itself back up off a rested board", () => {
    const game = odyssey("op09-031")
      .withBoard("p1", [
        character("doffy", "OP09-031", { rested: true }),
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .build();
    expect(hasKeyword(game.state, "p1", "doffy", "Blocker")).toBe(true);

    game.pass();
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "doffy")
        ?.rested,
    ).toBe(false);
  });

  it("stays rested when only one other body is", () => {
    const game = odyssey("op09-031-short")
      .withBoard("p1", [
        character("doffy", "OP09-031", { rested: true }),
        character("a", "OP09-038"),
      ])
      .build();

    game.pass();
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "doffy")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP09-032 Donquixote Rosinante", () => {
  covers("OP09-032", "[On Your Opponent's Attack]", "[Blocker]");

  it("stands itself up once a turn, so one body blocks twice", () => {
    const game = defending("op09-032")
      .bareTable()
      // `bareTable()` leaves no Life, and an attack that connects on a Leader at
      // zero ends the game before the second one can be declared.
      .withLife("p1", [
        instance("life-a", "ST32-004"),
        instance("life-b", "ST32-004"),
      ])
      .withBoard("p1", [character("rosinante", "OP09-032", { rested: true })])
      .withBoard("p2", [
        character("first", "ST32-004"),
        character("second", "ST32-004"),
      ])
      .build();
    expect(hasKeyword(game.state, "p1", "rosinante", "Blocker")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "first",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    expect(
      game.state.players.p1.board.find(
        (card) => card.instanceId === "rosinante",
      )?.rested,
    ).toBe(false);
    declineDefence(game);

    // `[Once Per Turn]`: the second attack raises no offer.
    game.play({
      type: "attack",
      attackerInstanceId: "second",
      targetInstanceId: "p1-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP09-033 Nico Robin", () => {
  covers("OP09-033", "[On Play]");

  it("makes its own side K.O.-proof against effects into the opponent's turn", () => {
    const game = odyssey("op09-033")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("robin", "OP09-033")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-033" });
    settle(game);
    game.pass();

    // On the opponent's turn, their removal finds nothing it may K.O.
    const lightning = defending("op09-033-removal");
    expect(lightning).toBeDefined();
    const state = game.state;
    expect(state.players.p1.board).toHaveLength(3);
    expect(
      state.players.p1.board.every(
        (card) => (card.koImmuneToOpponentEffectsUntilTurn ?? -1) >= state.turn,
      ),
    ).toBe(true);
  });
});

describe("OP09-034 Perona", () => {
  covers("OP09-034", "[On Play]");

  it("finds a {Thriller Bark Pirates} card and pays a card for it", () => {
    const game = table("op09-034")
      .bareTable()
      .withHand("p1", [
        instance("perona", "OP09-034"),
        instance("spare", "ST32-004"),
      ])
      .withDeckTop("p1", [
        instance("miss", "ST32-004"),
        instance("hit", "OP09-034"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-034" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    // One card added, one card trashed: the hand is the same size it was.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(1);
  });
});

describe("OP09-035 Portgas.D.Ace", () => {
  covers("OP09-035", "[On Play]");

  it("rests a cost 5 off a rested board", () => {
    const game = odyssey("op09-035")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("ace", "OP09-035")])
      .withBoard("p2", [
        character("reachable", "ST32-004"),
        character("too-big", "OP09-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-035" });
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });

    expect(
      game.state.players.p2.board.find(
        (card) => card.instanceId === "reachable",
      )?.rested,
    ).toBe(true);
  });
});

describe("OP09-036 Monkey.D.Luffy", () => {
  covers("OP09-036", "[On Play]");

  it("rests one DON!! or one Character of cost 6 or less, not a bigger body", () => {
    const game = odyssey("op09-036")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("luffy", "OP09-036")])
      .withBoard("p2", [
        character("reachable", "ST32-004"),
        character("too-big", "OP09-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-036" });
    // The 10-drop is outside the printed ceiling; the DON!! half is always there.
    expect(effectOptions(game.state).sort()).toEqual([
      "don",
      "reachable",
      "skip",
    ]);
    game.play({ type: "resolve-effect", optionId: "reachable" });

    expect(
      game.state.players.p2.board.find(
        (card) => card.instanceId === "reachable",
      )?.rested,
    ).toBe(true);
  });
});

describe("OP09-037 Lim", () => {
  covers("OP09-037", "[On Play]", "[End of Your Turn]");

  it("searches {ODYSSEY} other than itself, then stands itself up off three rested", () => {
    const game = odyssey("op09-037")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("lim", "OP09-037")])
      .withDeckTop("p1", [
        instance("itself", "OP09-037"),
        instance("hit", "OP09-029"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-037" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    // It arrived rested under its own Leader's rule, which is the third body.
    game.pass();
    expect(
      game.state.players.p1.board.find((card) => card.cardNumber === "OP09-037")
        ?.rested,
    ).toBe(false);
  });
});

describe("OP09-039 Gum-Gum Cuatro Jet Cross Shock Bazooka", () => {
  covers("OP09-039", "[Counter]", "[Trigger]");

  it("buys 2000 for the turn behind an ODYSSEY Leader with a rested board", () => {
    const game = defending("op09-039")
      .bareTable()
      .withLeader("p1", "OP09-022")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("event", "OP09-039")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP09-039]" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    // "During this turn", so it is a modifier on the Leader rather than the
    // battle's Counter total.
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(7_000);
    expect(game.state.activeAttack?.counterPower).toBe(0);
  });

  it("K.O.s a rested cost 4 off a Life card", () => {
    const game = triggerFrom("op09-039-trigger", "OP09-039");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    // The attacker rested to declare, which is what the printed clause names.
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP09-040 Thunder Lance Flip Caliber Phoenix Shot", () => {
  covers("OP09-040", "[Main]", "[Trigger]");

  it("K.O.s a cost 4 off a rested board", () => {
    const game = odyssey("op09-040")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("event", "OP09-040")])
      .withBoard("p2", [
        character("reachable", "OP09-038"),
        character("too-big", "OP09-004"),
      ])
      .build();

    game.play({ summary: "[OP09-040]" });
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "too-big",
    ]);
  });

  it("rests a cost 4 off a Life card", () => {
    const game = triggerFrom("op09-040-trigger", "OP09-040");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    // The only body on that board rested to attack, so the clause finds nothing
    // to rest and resolves to nothing rather than deadlocking.
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP09-041 Soul Franky Swing Arm Boxing Solid", () => {
  covers("OP09-041", "[Counter]", "[Trigger]");

  it("adds 2000 to the battle and stands two Characters back up", () => {
    const game = defending("op09-041")
      .bareTable()
      .withLeader("p1", "OP09-022")
      .withBoard("p1", [
        character("a", "OP09-038", { rested: true }),
        character("b", "OP09-038", { rested: true }),
      ])
      .withHand("p1", [instance("event", "OP09-041")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP09-041]" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);

    // "During this battle" is the engine's Counter total, unlike OP09-039.
    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(game.state.players.p1.board.every((card) => !card.rested)).toBe(
      true,
    );
  });

  it("rests a cost 4 off a Life card", () => {
    const game = triggerFrom("op09-041-trigger", "OP09-041");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.pendingEffect).toBeNull();
  });
});

// --- Blue --------------------------------------------------------------------

/** p1 led by the Cross Guild Leader, whose activation is the deck's engine. */
const crossGuild = (seed: string) =>
  table(seed).bareTable().withLeader("p1", "OP09-042");

describe("OP09-042 Buggy (Leader)", () => {
  covers("OP09-042", "[Activate: Main]");

  it("rests five DON!! and a card for any {Cross Guild} body", () => {
    const game = crossGuild("op09-042")
      .withHand("p1", [
        instance("pitch", "ST32-004"),
        instance("free", "OP09-046"),
        instance("outsider", "OP09-016"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    game.play({ type: "resolve-effect", optionId: "pitch" });
    // {Cross Guild} only, and at any cost -- this is a 7-drop for five rested
    // DON!! and a card.
    expect(effectOptions(game.state)).toEqual(["free", "done"]);
    game.play({ type: "resolve-effect", optionId: "free" });
    settle(game);

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP09-046",
    ]);
    // Rested rather than spent: all ten DON!! are still on the field.
    expect(game.state.players.p1.restedDon).toHaveLength(5);
    expect(game.state.players.p1.activeDon).toHaveLength(5);
  });

  it("is not offered on an empty hand", () => {
    const game = crossGuild("op09-042-empty").withHand("p1", []).build();
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.optionId === "mechanic-main:p1-leader",
        ),
    ).toBe(false);
  });
});

describe("OP09-043 Alvida", () => {
  covers("OP09-043", "[On K.O.]");

  it("dies into another body behind a {Cross Guild} Leader", () => {
    const game = scenario()
      .decks(P1, P2)
      .seed("op09-043")
      .atTurn(12, { active: "p2" })
      .bareTable()
      .withLeader("p1", "OP09-042")
      .withBoard("p1", [character("alvida", "OP09-043", { rested: true })])
      .withHand("p1", [
        instance("free", "OP09-016"),
        instance("another-alvida", "OP09-043"),
        instance("too-big", "OP09-046"),
      ])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "alvida",
    });
    declineDefence(game);
    // Cost 5 or less and not another [Alvida].
    expect(effectOptions(game.state)).toEqual(["free", "done"]);
    game.play({ type: "resolve-effect", optionId: "free" });

    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP09-016",
    ]);
  });
});

describe("OP09-044 Izo", () => {
  covers("OP09-044", "[When Attacking]");

  it("searches two types and pays a card for it", () => {
    const game = table("op09-044")
      .bareTable()
      .withBoard("p1", [character("izo", "OP09-044", { playedTurn: 1 })])
      .withHand("p1", [instance("spare", "ST32-004")])
      .withDeckTop("p1", [
        instance("miss", "ST32-004"),
        instance("hit", "OP09-047"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "izo",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    // One found, one paid: the hand is the size it started at.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(1);
  });
});

describe("OP09-045 Cabaji", () => {
  covers("OP09-045", "static");

  it("cannot be K.O.'d in battle beside a [Buggy], and can without one", () => {
    const guarded = defending("op09-045-guarded")
      .bareTable()
      .withBoard("p1", [
        character("cabaji", "OP09-045", { rested: true }),
        character("buggy", "OP09-051"),
      ])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();

    guarded.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "cabaji",
    });
    declineDefence(guarded);
    expect(
      guarded.state.players.p1.board.map((card) => card.instanceId).sort(),
    ).toEqual(["buggy", "cabaji"]);

    const alone = defending("op09-045-alone")
      .bareTable()
      .withBoard("p1", [character("cabaji", "OP09-045", { rested: true })])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();
    alone.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "cabaji",
    });
    declineDefence(alone);
    expect(alone.state.players.p1.board).toHaveLength(0);
  });

  it("is still answered by a removal effect", () => {
    const game = defending("op09-045-effect")
      .bareTable()
      .withBoard("p1", [
        character("cabaji", "OP09-045"),
        character("buggy", "OP09-051"),
      ])
      .withHand("p2", [instance("lightning", "OP09-077")])
      .build();

    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "cabaji" });
    settle(game);

    // "In battle" says nothing about an effect, which is what makes the body
    // beatable at all.
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "buggy",
    ]);
  });
});

describe("OP09-046 Crocodile", () => {
  covers("OP09-046", "[On Play]");

  it("deploys a {Cross Guild} or Baroque Works body of cost 5 or less", () => {
    const game = table("op09-046")
      .bareTable()
      .withHand("p1", [
        instance("croc", "OP09-046"),
        instance("guild", "OP09-055"),
        instance("outsider", "OP09-016"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-046" });
    expect(effectOptions(game.state)).toEqual(["guild", "done"]);
    game.play({ type: "resolve-effect", optionId: "guild" });

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP09-046", "OP09-055"]);
  });
});

describe("OP09-047 Kouzuki Oden", () => {
  covers("OP09-047", "[On K.O.]", "[Double Attack]");

  it("refills as it dies, and deals two points while it lives", () => {
    const game = defending("op09-047")
      .bareTable()
      .withBoard("p1", [character("oden", "OP09-047", { rested: true })])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();
    expect(hasKeyword(game.state, "p1", "oden", "Double Attack")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "oden",
    });
    declineDefence(game);
    settle(game);

    // Two drawn, one discarded.
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(
      game.state.players.p1.trash.filter(
        (card) => card.cardNumber === "ST32-004",
      ),
    ).toHaveLength(1);
  });
});

describe("OP09-048 Dracule Mihawk", () => {
  covers("OP09-048", "[On Play]", "[Blocker]");

  it("draws two and discards one", () => {
    const game = table("op09-048")
      .bareTable()
      .withHand("p1", [instance("mihawk", "OP09-048")])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-048" });
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(1);
    expect(
      hasKeyword(
        game.state,
        "p1",
        game.state.players.p1.board[0]!.instanceId,
        "Blocker",
      ),
    ).toBe(true);
  });
});

describe("OP09-050 Nami", () => {
  covers("OP09-050", "[When Attacking]");

  it("digs five deep for a blue Event and nothing else", () => {
    const game = table("op09-050")
      .bareTable()
      .withBoard("p1", [character("nami", "OP09-050", { playedTurn: 1 })])
      .withDeckTop("p1", [
        instance("green-event", "OP09-039"),
        instance("blue-body", "OP09-055"),
        instance("hit", "OP09-058"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "nami",
      targetInstanceId: "p2-leader",
    });
    // A blue Event: not the green one, and not the blue Character.
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });
});

describe("OP09-051 Buggy", () => {
  covers("OP09-051", "[On Play]");

  it("buries a Character, then buries itself off a board of fewer than five 5-drops", () => {
    const game = table("op09-051")
      .bareTable()
      .withHand("p1", [instance("buggy", "OP09-051")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-051" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("victim");
    // Its own board is one 10-drop, not five 5-drops, so it follows.
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.deck.at(-1)?.cardNumber).toBe("OP09-051");
  });

  it("stays on a board of five bodies of cost 5 or more", () => {
    const game = table("op09-051-stays")
      .bareTable()
      .withHand("p1", [instance("buggy", "OP09-051")])
      .withBoard("p1", [
        character("a", "OP09-046"),
        character("b", "OP09-046"),
        character("c", "OP09-046"),
        character("d", "OP09-046"),
      ])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-051" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settle(game);

    // Four 7-drops plus Buggy itself is the fifth: it stays.
    expect(game.state.players.p1.board).toHaveLength(5);
  });
});

describe("OP09-052 Marco", () => {
  covers("OP09-052", "[Opponent's Turn]");

  it("pays a card to come back rested after the opponent's effect K.O.s it", () => {
    const game = defending("op09-052")
      .bareTable()
      .withBoard("p1", [character("marco", "OP09-052")])
      .withHand("p1", [instance("pitch", "ST32-004")])
      .withHand("p2", [instance("lightning", "OP09-077")])
      .build();

    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "marco" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });
    settle(game);

    const back = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP09-052",
    );
    expect(back?.rested).toBe(true);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("stays dead when it loses a fight", () => {
    const game = defending("op09-052-battle")
      .bareTable()
      .withBoard("p1", [character("marco", "OP09-052", { rested: true })])
      .withHand("p1", [instance("pitch", "ST32-004")])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "marco",
    });
    declineDefence(game);

    // "By your opponent's effect": losing a fight is not one.
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP09-053 Mohji", () => {
  covers("OP09-053", "[On Play]");

  it("finds [Richie] and puts it out in the same clause", () => {
    const game = table("op09-053")
      .bareTable()
      .withHand("p1", [instance("mohji", "OP09-053")])
      .withDeckTop("p1", [
        instance("miss", "ST32-004"),
        instance("richie", "OP09-054"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-053" });
    expect(effectOptions(game.state)).toEqual(["richie", "done"]);
    game.play({ type: "resolve-effect", optionId: "richie" });
    settle(game);

    // The play step reads the hand after the search has added to it.
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP09-053", "OP09-054"]);
  });
});

describe("OP09-054 Richie", () => {
  covers("OP09-054", "[Blocker]");

  it("blocks", () => {
    const game = defending("op09-054")
      .bareTable()
      .withLife("p1", [instance("life", "ST32-004")])
      .withBoard("p1", [character("richie", "OP09-054")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    expect(hasKeyword(game.state, "p1", "richie", "Blocker")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ summary: "Block with Richie" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("richie");
  });
});

describe("OP09-056 Mr.3(Galdino)", () => {
  covers("OP09-056", "[On Play]");

  it("digs four deep for {Cross Guild} or Baroque Works, other than itself", () => {
    const game = table("op09-056")
      .bareTable()
      .withHand("p1", [instance("galdino", "OP09-056")])
      .withDeckTop("p1", [
        instance("itself", "OP09-056"),
        instance("hit", "OP09-055"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-056" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });
});

describe("OP09-057 Cross Guild", () => {
  covers("OP09-057", "[Main]", "[Trigger]");

  it("digs four deep for a {Cross Guild} card", () => {
    const game = table("op09-057")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-057")])
      .withDeckTop("p1", [
        instance("miss", "ST32-004"),
        instance("hit", "OP09-055"),
      ])
      .build();

    game.play({ summary: "[OP09-057]" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
  });

  it("runs the same search off a Life card", () => {
    const game = triggerFrom("op09-057-trigger", "OP09-057");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    // The deck the position leaves is three ST32-004, none of them a match, so
    // the search adds nothing and puts them all back.
    expect(game.state.players.p1.deck).toHaveLength(3);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP09-058 Special Muggy Ball", () => {
  covers("OP09-058", "[Main]", "[Trigger]");

  it("returns a cost 6 to the owner's hand", () => {
    const game = table("op09-058")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-058")])
      .withBoard("p2", [
        // OP09-048 is a cost 6, inside the printed ceiling; OP09-046 is a 7.
        character("reachable", "OP09-048"),
        character("too-big", "OP09-046"),
      ])
      .build();

    game.play({ summary: "[OP09-058]" });
    // The opponent picks, and must pick one (Bandai's OP09-058 ruling; see
    // test/faq-op09.test.ts).
    expect(game.state.activePlayer).toBe("p2");
    expect(effectOptions(game.state)).toEqual(["reachable"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "reachable",
    ]);
  });

  it("returns either side's cost 3 off a Life card", () => {
    const game = triggerFrom("op09-058-trigger", "OP09-058");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    // "1 Character" names no side: the attacker is a cost 4 and out of reach,
    // so this board offers nothing and the clause resolves to nothing.
    settle(game);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP09-059 Murder at the Steam Bath", () => {
  covers("OP09-059", "[Counter]", "[Trigger]");

  it("adds 3000 and mills one card of its own deck per card trashed", () => {
    const game = defending("op09-059")
      .bareTable()
      .withHand("p1", [
        instance("event", "OP09-059"),
        instance("pitch", "ST32-004"),
      ])
      .withDeckTop("p1", [
        instance("mill-a", "ST32-004"),
        instance("mill-b", "ST32-004"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP09-059]" });
    game.play({ type: "resolve-effect", optionId: "pitch" });
    settle(game);

    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    // One card from hand, so one card off the top of the deck. The trash holds
    // three: the Event itself, the card it spent, and the milled card.
    expect(game.state.players.p1.deck).toHaveLength(1);
    expect(game.state.players.p1.trash).toHaveLength(3);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op09-059-trigger", "OP09-059");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP09-060 Emptee Bluffs Island", () => {
  covers("OP09-060", "[Activate: Main]");

  it("buries two cards to draw two behind a {Cross Guild} Leader", () => {
    const game = crossGuild("op09-060")
      .withStage("p1", instance("island", "OP09-060"))
      .withHand("p1", [
        instance("bury-a", "ST32-004"),
        instance("bury-b", "OP09-016"),
      ])
      .withDeckTop("p1", [
        instance("draw-a", "OP09-055"),
        instance("draw-b", "OP09-055"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:island" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "bury-a" });
    game.play({ type: "resolve-effect", optionId: "bury-b" });
    settle(game);

    expect(
      game.state.players.p1.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["draw-a", "draw-b"]);
    // Bottom of the deck, not the trash.
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(game.state.players.p1.stage?.rested).toBe(true);
  });

  it("is not offered with one card in hand", () => {
    const game = crossGuild("op09-060-short")
      .withStage("p1", instance("island", "OP09-060"))
      .withHand("p1", [instance("only", "ST32-004")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.optionId === "mechanic-main:island",
        ),
    ).toBe(false);
  });
});

// --- Purple ------------------------------------------------------------------

describe("OP09-061 Monkey.D.Luffy (Leader)", () => {
  covers("OP09-061", "[Your Turn]", "static");

  it("refunds two DON!! when two go back at once, and nothing for one", () => {
    const game = table("op09-061")
      .bareTable()
      .withLeader("p1", "OP09-061")
      .withDonDeck("p1", 4)
      .withHand("p1", [instance("lightning", "OP09-077")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    const before =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    settle(game);

    // Two DON!! paid, two added back: one active for this turn, one rested for
    // the next. The Event's own cost is a rest, not a return.
    const after =
      game.state.players.p1.activeDon.length +
      game.state.players.p1.restedDon.length;
    expect(after).toBe(before);
    expect(game.state.players.p1.restedDon.length).toBeGreaterThan(0);
  });

  it("says the Leader did it, so the refund is not two DON!! from nowhere", () => {
    const game = table("op09-061-announced")
      .bareTable()
      .withLeader("p1", "OP09-061")
      .withDonDeck("p1", 4)
      .withHand("p1", [instance("lightning", "OP09-077")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    const announced: PublicEvent[] = [];
    payDonMinus(game);
    announced.push(...game.events);
    settle(game);
    announced.push(...game.events);

    // The refund is a clause nobody was offered: without this step the two
    // DON!! it puts back arrive with no cause anywhere in the log, and the
    // panel that reports the action has nothing to draw them beside.
    const fired = announced.find((event) => event.type === "ability-triggered");
    expect(fired).toMatchObject({
      playerId: "p1",
      sourceCardNumber: "OP09-061",
      sourceInstanceId: "p1-leader",
    });
    // Announced before what it did, so the panel reads cause then effect.
    const index = announced.indexOf(fired!);
    expect(
      announced
        .slice(index + 1)
        .some(
          (event) =>
            event.type === "don-added" && event.sourceCardNumber === "OP09-061",
        ),
    ).toBe(true);
  });

  it("raises its own Characters' cost by 1 with a DON!! on the Leader", () => {
    const bare = table("op09-061-bare")
      .bareTable()
      .withLeader("p1", "OP09-061")
      .withBoard("p1", [character("body", "OP09-038")])
      .build();
    expect(
      effectiveCost(bare.state, "p1", bare.state.players.p1.board[0]!),
    ).toBe(4);

    const donned = table("op09-061-donned")
      .bareTable()
      .withLeader("p1", "OP09-061")
      .withBoard("p1", [character("body", "OP09-038")])
      .withDon("p1", { leaderAttached: 1 })
      .build();
    // +1 cost is protection: it lifts the body out of "cost 4 or less" removal.
    expect(
      effectiveCost(donned.state, "p1", donned.state.players.p1.board[0]!),
    ).toBe(5);
  });
});

describe("OP09-064 Killer", () => {
  covers("OP09-064", "[On Play]");

  it("returns a DON!! to stand a rested {Kid Pirates} Leader back up", () => {
    const game = table("op09-064")
      .bareTable()
      .withLeader("p1", "OP10-099")
      .withRestedLeader("p1")
      .withHand("p1", [instance("killer", "OP09-064")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-064" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(game.state.players.p1.leaderRested).toBe(false);
  });
});

describe("OP09-065 Sanji", () => {
  covers("OP09-065", "[On Play]");

  it("buys [Rush] and a rest for one DON!! returned", () => {
    const game = table("op09-065")
      .bareTable()
      .withHand("p1", [instance("sanji", "OP09-065")])
      .withBoard("p2", [
        character("reachable", "OP09-048"),
        character("too-big", "OP09-046"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-065" });
    applyOptional(game);
    payDonMinus(game);
    // Cost 6 or less: the 7-drop is outside it.
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });

    const sanji = game.state.players.p1.board[0]!;
    expect(hasKeyword(game.state, "p1", sanji.instanceId, "Rush")).toBe(true);
    expect(
      game.state.players.p2.board.find(
        (card) => card.instanceId === "reachable",
      )?.rested,
    ).toBe(true);
  });
});

describe("OP09-066 Jean Bart", () => {
  covers("OP09-066", "[On Play]");

  it("K.O.s a cost 3 only while the opponent has more DON!! on the field", () => {
    const behind = table("op09-066-behind")
      .bareTable()
      .withHand("p1", [instance("bart", "OP09-066")])
      .withBoard("p2", [character("victim", "OP09-029")])
      .withDonDeck("p1", 4)
      .build();

    behind.play({ type: "play-card", cardNumber: "OP09-066" });
    // Six DON!! against their ten.
    expect(effectOptions(behind.state)).toEqual(["victim", "done"]);
    behind.play({ type: "resolve-effect", optionId: "victim" });
    expect(behind.state.players.p2.board).toHaveLength(0);

    const level = table("op09-066-level")
      .bareTable()
      .withHand("p1", [instance("bart", "OP09-066")])
      .withBoard("p2", [character("victim", "OP09-029")])
      .build();
    level.play({ type: "play-card", cardNumber: "OP09-066" });
    // Ten against ten is not "more", which is the board a Purple deck sits on.
    expect(level.state.pendingEffect).toBeNull();
    expect(level.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP09-068 Tony Tony.Chopper", () => {
  covers("OP09-068", "[End of Your Turn]");

  it("returns a DON!! to stand up and hold [Blocker] into the opponent's turn", () => {
    const game = table("op09-068")
      .bareTable()
      .withBoard("p1", [character("chopper", "OP09-068", { rested: true })])
      .build();

    game.pass();
    applyOptional(game);
    payDonMinus(game);
    settle(game);

    const chopper = game.state.players.p1.board[0]!;
    expect(chopper.rested).toBe(false);
    expect(hasKeyword(game.state, "p1", chopper.instanceId, "Blocker")).toBe(
      true,
    );
  });
});

describe("OP09-070 Nami", () => {
  covers("OP09-070", "[On Play]");

  it("turns a returned DON!! into two rested DON!! on a card", () => {
    const game = table("op09-070")
      .bareTable()
      .withDon("p1", { rested: 4 })
      .withHand("p1", [instance("nami", "OP09-070")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-070" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(2);
  });

  /**
   * The DON!! that pay a `DON!! −N` land in the DON!! deck, a pile of
   * interchangeable cards, so nothing on the board says the cost was paid at
   * all -- and returning *two* is what arms OP09-061's Leader refund. Before
   * `don-returned` existed, the decision that paid it recorded an empty event
   * list, and a player could see the refund arrive but never what bought it.
   */
  it("reports the DON!! it sent back, and the card that asked for them", () => {
    const game = table("op09-070-return-event")
      .bareTable()
      .withDon("p1", { rested: 4 })
      .withHand("p1", [instance("nami", "OP09-070")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-070" });
    applyOptional(game);
    payReturnCount(game, 2);
    const returned = game.events.filter(
      (event) => event.type === "don-returned",
    );

    expect(returned).toEqual([
      {
        type: "don-returned",
        playerId: "p1",
        count: 2,
        sourceCardNumber: "OP09-070",
      },
    ]);
  });
});

describe("OP09-071 Nico Robin", () => {
  covers("OP09-071", "[Blocker]");

  it("blocks", () => {
    const game = defending("op09-071")
      .bareTable()
      .withLife("p1", [instance("life", "ST32-004")])
      .withBoard("p1", [character("robin", "OP09-071")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    expect(hasKeyword(game.state, "p1", "robin", "Blocker")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ summary: "Block with Nico Robin" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("robin");
  });
});

describe("OP09-073 Brook", () => {
  covers("OP09-073", "[When Attacking]");

  it("returns a DON!! to take 2000 off two Characters", () => {
    const game = table("op09-073")
      .bareTable()
      .withBoard("p1", [character("brook", "OP09-073", { playedTurn: 1 })])
      .withBoard("p2", [
        character("first", "ST32-004"),
        character("second", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "brook",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "first" });
    game.play({ type: "resolve-effect", optionId: "second" });
    settle(game);

    expect(currentPower(game.state, "p2", "first")).toBe(3_000);
    expect(currentPower(game.state, "p2", "second")).toBe(3_000);
  });
});

describe("OP09-074 Bepo", () => {
  covers("OP09-074", "[Your Turn]");

  it("buys 1000 power when a DON!! goes back, once a turn", () => {
    const game = table("op09-074")
      .bareTable()
      .withBoard("p1", [character("bepo", "OP09-074")])
      .withHand("p1", [
        instance("lightning-a", "OP09-077"),
        instance("lightning-b", "OP09-077"),
      ])
      .withBoard("p2", [
        character("victim-a", "ST32-004"),
        character("victim-b", "ST32-004"),
      ])
      .build();

    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "victim-a" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);

    // `[Once Per Turn]`: the second payment raises no offer.
    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "victim-b" });
    settle(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });
});

describe('OP09-075 Eustass"Captain"Kid', () => {
  covers("OP09-075", "[On Play]");

  it("spends the top Life card for an active DON!! behind a {Kid Pirates} Leader", () => {
    const game = table("op09-075")
      .bareTable()
      .withLeader("p1", "OP10-099")
      .withDonDeck("p1", 2)
      .withHand("p1", [instance("kid", "OP09-075")])
      .withLife("p1", [
        instance("top", "ST32-004"),
        instance("bottom", "OP09-016"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-075" });
    applyOptional(game);
    // The top of the Life stack only -- not the "top or bottom" other Yellow
    // and Purple cards print.
    expect(effectOptions(game.state)).toEqual(["top"]);
    game.play({ type: "resolve-effect", optionId: "top" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "top",
    ]);
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "bottom",
    ]);
  });
});

describe("OP09-076 Roronoa Zoro", () => {
  covers("OP09-076", "[On Play]");

  it("trades one DON!! back for one active DON!! added", () => {
    const game = table("op09-076")
      .bareTable()
      .withDonDeck("p1", 2)
      .withHand("p1", [instance("zoro", "OP09-076")])
      .build();

    const activeBefore = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP09-076" });
    applyOptional(game);
    payDonMinus(game);
    settle(game);

    // Three rested paying the body, one of those three returned to the DON!!
    // deck -- the prompt offers the rested pile first -- and one added active.
    expect(game.state.players.p1.activeDon.length).toBe(activeBefore - 3 + 1);
    expect(game.state.players.p1.restedDon).toHaveLength(2);
  });

  it("offers every count it can pay, not just the printed floor", () => {
    const game = table("op09-076-counts")
      .bareTable()
      .withDonDeck("p1", 2)
      .withHand("p1", [instance("zoro", "OP09-076")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-076" });
    applyOptional(game);

    // Eight DON!! on the field once the 3-cost body is paid for, so eight
    // counts. The printed clause is "1 or more" and this is what "or more"
    // means: the thresholds that make a count worth taking belong to the cards
    // a player controls, not to this one.
    expect(effectOptions(game.state)).toEqual([
      "return:1",
      "return:2",
      "return:3",
      "return:4",
      "return:5",
      "return:6",
      "return:7",
      "return:8",
    ]);
  });
});

describe("OP09-077 Gum-Gum Lightning", () => {
  covers("OP09-077", "[Main]", "[Trigger]");

  it("K.O.s a 6000 for two DON!! returned", () => {
    const game = table("op09-077")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-077")])
      .withBoard("p2", [
        character("reachable", "OP09-016"),
        character("too-big", "OP09-004"),
      ])
      .build();

    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "too-big",
    ]);
  });

  it("adds an active DON!! off a Life card", () => {
    const game = triggerFrom("op09-077-trigger", "OP09-077", { donDeck: 2 });
    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.activeDon.length).toBe(before + 1);
  });
});

describe("OP09-079 Gum-Gum Jump Rope", () => {
  covers("OP09-079", "[Main]", "[Trigger]");

  it("rests a cost 5 and draws, for two DON!! returned", () => {
    const game = table("op09-079")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-079")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .withBoard("p2", [
        character("reachable", "ST32-004"),
        character("too-big", "OP09-046"),
      ])
      .build();

    game.play({ summary: "[OP09-079]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });
    settle(game);

    expect(
      game.state.players.p2.board.find(
        (card) => card.instanceId === "reachable",
      )?.rested,
    ).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
  });

  it("adds an active DON!! off a Life card", () => {
    const game = triggerFrom("op09-079-trigger", "OP09-079", { donDeck: 2 });
    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.activeDon.length).toBe(before + 1);
  });
});

describe("OP09-080 Thousand Sunny", () => {
  covers("OP09-080", "[Opponent's Turn]");

  it("rests itself for a DON!! when the opponent removes a Straw Hat body", () => {
    const game = defending("op09-080")
      .bareTable()
      .withDonDeck("p1", 2)
      .withStage("p1", instance("sunny", "OP09-080"))
      .withBoard("p1", [character("robin", "OP09-071")])
      .withHand("p2", [instance("lightning", "OP09-077")])
      .build();

    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "robin" });
    applyOptional(game);
    settle(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.restedDon.length).toBeGreaterThan(0);
  });

  it("does nothing while it is already rested", () => {
    const game = defending("op09-080-rested")
      .bareTable()
      .withDonDeck("p1", 2)
      .withStage("p1", { ...instance("sunny", "OP09-080"), rested: true })
      .withBoard("p1", [character("robin", "OP09-071")])
      .withHand("p2", [instance("lightning", "OP09-077")])
      .build();

    const before = game.state.players.p1.restedDon.length;
    game.play({ summary: "[OP09-077]" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "robin" });
    settle(game);

    // Resting the Stage is the cost, so a rested Stage buys nothing.
    expect(game.state.players.p1.restedDon.length).toBe(before);
  });
});

// --- Black -------------------------------------------------------------------

/** p1 led by the Blackbeard Leader nine of the set's Black cards are gated on. */
const blackbeard = (seed: string) =>
  table(seed).bareTable().withLeader("p1", "OP09-081");

describe("OP09-081 Marshall.D.Teach (Leader)", () => {
  covers("OP09-081", "[Activate: Main]", "static");

  it("drops its own side's [On Play] effects", () => {
    const game = blackbeard("op09-081-own")
      .withHand("p1", [instance("mihawk", "OP09-048")])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-048" });

    // The body arrives; its "draw 2, discard 1" does not happen at all.
    expect(game.state.players.p1.board).toHaveLength(1);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("trashes a card to drop the opponent's, into their next turn", () => {
    const game = blackbeard("op09-081-theirs")
      .withHand("p1", [instance("pitch", "ST32-004")])
      .withHand("p2", [instance("mihawk", "OP09-048")])
      .withDeckTop("p2", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });
    game.pass();

    const beforePlay = game.state.players.p2.hand.length;
    game.play({ type: "play-card", cardNumber: "OP09-048" });
    expect(game.state.players.p2.board).toHaveLength(1);
    // The body arrives and its "draw 2, discard 1" does not run: the hand is
    // exactly the card the play took out of it, and nothing was discarded.
    expect(game.state.players.p2.hand).toHaveLength(beforePlay - 1);
    expect(game.state.players.p2.trash).toHaveLength(0);
    expect(game.state.pendingEffect).toBeNull();
  });

  it("announces the negation, so the discard is not the whole story", () => {
    const game = blackbeard("op09-081-announced")
      .withHand("p1", [instance("pitch", "ST32-004")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });

    // Without this the clause reached the other seat as one card going to the
    // trash, followed by two turns of [On Play] effects quietly not
    // happening: the payment was announced and what it bought was not.
    const restricted = game.events.find(
      (event) => event.type === "player-restricted",
    );
    expect(restricted).toMatchObject({
      playerId: "p2",
      restriction: "on-play-negated",
      untilTurn: game.state.turn + 1,
      sourceCardNumber: "OP09-081",
    });
    expect(
      eventText(restricted!, "p2", new Map([["p1-leader", "OP09-081"]])),
    ).toBe(
      `Your [On Play] effects are negated through turn ${game.state.turn + 1} (via Marshall.D.Teach [OP09-081]).`,
    );
  });

  it("reports both halves of the negation through observe()", () => {
    const game = blackbeard("op09-081-observed")
      .withHand("p1", [instance("pitch", "ST32-004")])
      .build();

    // The static half is on from the start, and it is the viewer's own side.
    expect(observe(game.state, "p1").self.onPlayNegated).toBe(true);
    expect(observe(game.state, "p1").opponent.onPlayNegated).toBe(false);

    game.play({ type: "activate-main", optionId: "mechanic-main:p1-leader" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });

    // A seat that cannot see this cannot tell a first payment from a second
    // one in the same turn, which writes the same expiry and buys nothing.
    expect(observe(game.state, "p1").opponent.onPlayNegated).toBe(true);
    expect(observe(game.state, "p2").self.onPlayNegated).toBe(true);
  });
});

describe("OP09-083 Van Augur", () => {
  covers("OP09-083", "[Activate: Main]", "[On K.O.]");

  it("rests itself to take 3 off a Character's cost", () => {
    const game = blackbeard("op09-083")
      .withBoard("p1", [character("augur", "OP09-083")])
      .withBoard("p2", [character("target", "OP09-046")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:augur" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });

    // A 7-drop becomes a 4, which is what the set's cost-capped removal reads.
    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(4);
  });

  it("draws a card as it dies", () => {
    const game = defending("op09-083-ko")
      .bareTable()
      .withBoard("p1", [character("augur", "OP09-083", { rested: true })])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "augur",
    });
    declineDefence(game);
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
  });
});

describe("OP09-084 Catarina Devon", () => {
  // No `[Blocker]` claim: the three keywords in this clause are *granted*, and
  // the derivation stopped reading the last of them as printed text when this
  // test showed a 6000 blocking behind a Leader its own gate refuses.
  covers("OP09-084", "[Activate: Main]");

  it("takes one of three keywords, once a turn, and holds it into their turn", () => {
    const game = blackbeard("op09-084")
      .withBoard("p1", [character("devon", "OP09-084", { playedTurn: 1 })])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:devon" });
    expect(effectOptions(game.state).sort()).toEqual([
      "banish",
      "blocker",
      "double-attack",
    ]);
    game.play({ type: "resolve-effect", optionId: "blocker" });

    expect(hasKeyword(game.state, "p1", "devon", "Blocker")).toBe(true);
    // One of the three, not all: the other two are not granted.
    expect(hasKeyword(game.state, "p1", "devon", "Banish")).toBe(false);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.optionId === "mechanic-main:devon",
        ),
    ).toBe(false);

    game.pass();
    // "Until the end of your opponent's next turn": still a [Blocker] on theirs.
    expect(hasKeyword(game.state, "p1", "devon", "Blocker")).toBe(true);
  });

  it("grants nothing behind a Leader of another type", () => {
    const game = table("op09-084-other")
      .bareTable()
      .withBoard("p1", [character("devon", "OP09-084", { playedTurn: 1 })])
      .build();

    const offered = game
      .legalActions()
      .some(
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-main:devon",
      );
    if (offered) {
      game.play({ type: "activate-main", optionId: "mechanic-main:devon" });
      settle(game);
    }
    expect(hasKeyword(game.state, "p1", "devon", "Blocker")).toBe(false);
  });
});

describe("OP09-085 Gecko Moria", () => {
  covers("OP09-085", "[On Play]");

  it("plays a cost 2 {Thriller Bark Pirates} body out of the trash rested", () => {
    const game = table("op09-085")
      .bareTable()
      .withHand("p1", [instance("moria", "OP09-085")])
      .withTrash("p1", [
        instance("target", "OP09-034"),
        instance("outsider", "OP09-016"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-085" });
    expect(effectOptions(game.state)).toEqual(["target", "done"]);
    game.play({ type: "resolve-effect", optionId: "target" });

    const back = game.state.players.p1.board.find(
      (card) => card.instanceId === "target",
    );
    expect(back?.rested).toBe(true);
  });
});

describe("OP09-087 Charlotte Pudding", () => {
  covers("OP09-087", "[On Play]");

  it("strips a card from a hand of five, and nothing from a hand of four", () => {
    const game = table("op09-087")
      .bareTable()
      .withHand("p1", [instance("pudding", "OP09-087")])
      .withHand(
        "p2",
        Array.from({ length: 5 }, (_, index) =>
          instance(`theirs-${index}`, "ST32-004"),
        ),
      )
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-087" });
    // Their hand, their choice: the opponent answers.
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "theirs-0" });
    expect(game.state.players.p2.hand).toHaveLength(4);

    const short = table("op09-087-short")
      .bareTable()
      .withHand("p1", [instance("pudding", "OP09-087")])
      .withHand(
        "p2",
        Array.from({ length: 4 }, (_, index) =>
          instance(`theirs-${index}`, "ST32-004"),
        ),
      )
      .build();
    short.play({ type: "play-card", cardNumber: "OP09-087" });
    expect(short.state.pendingEffect).toBeNull();
    expect(short.state.players.p2.hand).toHaveLength(4);
  });
});

describe("OP09-088 Shiryu", () => {
  covers("OP09-088", "[When Attacking]");

  it("trades two cards for two with a DON!! given, and offers nothing without", () => {
    const game = table("op09-088")
      .bareTable()
      .withBoard("p1", [character("shiryu", "OP09-088", { playedTurn: 1 })])
      .withGivenDon("p1", "shiryu", 1)
      .withHand("p1", [
        instance("pitch-a", "ST32-004"),
        instance("pitch-b", "ST32-004"),
      ])
      .withDeckTop("p1", [
        instance("draw-a", "OP09-016"),
        instance("draw-b", "OP09-016"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "shiryu",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "pitch-a" });
    game.play({ type: "resolve-effect", optionId: "pitch-b" });
    settle(game);

    expect(
      game.state.players.p1.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["draw-a", "draw-b"]);

    const bare = table("op09-088-bare")
      .bareTable()
      .withBoard("p1", [character("shiryu", "OP09-088", { playedTurn: 1 })])
      .withHand("p1", [
        instance("pitch-a", "ST32-004"),
        instance("pitch-b", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("draw-a", "OP09-016")])
      .build();
    bare.play({
      type: "attack",
      attackerInstanceId: "shiryu",
      targetInstanceId: "p2-leader",
    });
    // No DON!! on the body, so the `[DON!! x1]` clause never opens.
    expect(bare.state.pendingEffect).toBeNull();
  });
});

describe("OP09-089 Stronger", () => {
  covers("OP09-089", "[Activate: Main]");

  it("trashes itself and a card to draw and shrink a cost", () => {
    const game = blackbeard("op09-089")
      .withBoard("p1", [character("stronger", "OP09-089")])
      .withHand("p1", [instance("pitch", "ST32-004")])
      .withDeckTop("p1", [instance("draw", "OP09-016")])
      .withBoard("p2", [character("target", "OP09-046")])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:stronger" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "pitch" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    expect(
      effectiveCost(game.state, "p2", game.state.players.p2.board[0]!),
    ).toBe(5);
  });
});

describe("OP09-090 Doc Q", () => {
  covers("OP09-090", "[Activate: Main]", "[On K.O.]");

  it("rests itself to K.O. a cost 1, and draws when it dies", () => {
    const game = blackbeard("op09-090")
      .withBoard("p1", [character("docq", "OP09-090")])
      .withBoard("p2", [
        character("reachable", "OP09-089"),
        character("too-big", "OP09-029"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:docq" });
    applyOptional(game);
    expect(effectOptions(game.state)).toEqual(["reachable", "done"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "too-big",
    ]);

    const dying = defending("op09-090-ko")
      .bareTable()
      .withBoard("p1", [character("docq", "OP09-090", { rested: true })])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .withBoard("p2", [character("killer", "OP09-004")])
      .build();
    dying.play({
      type: "attack",
      attackerInstanceId: "killer",
      targetInstanceId: "docq",
    });
    declineDefence(dying);
    settle(dying);
    expect(dying.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
  });
});

describe("OP09-091 Vasco Shot", () => {
  covers("OP09-091", "[Blocker]");

  it("blocks", () => {
    const game = defending("op09-091")
      .bareTable()
      .withLife("p1", [instance("life", "ST32-004")])
      .withBoard("p1", [character("vasco", "OP09-091")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    expect(hasKeyword(game.state, "p1", "vasco", "Blocker")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ summary: "Block with Vasco Shot" });
    expect(game.state.activeAttack?.targetInstanceId).toBe("vasco");
  });
});

describe("OP09-092 Marshall.D.Teach", () => {
  covers("OP09-092", "[Activate: Main]");

  it("pays out three cards behind, and nothing two behind", () => {
    const behind = table("op09-092-behind")
      .bareTable()
      .withBoard("p1", [character("teach", "OP09-092")])
      .withDeckTop("p1", [
        instance("draw-a", "OP09-016"),
        instance("draw-b", "OP09-016"),
      ])
      .withHand(
        "p2",
        Array.from({ length: 3 }, (_, index) =>
          instance(`theirs-${index}`, "ST32-004"),
        ),
      )
      .build();

    behind.play({ type: "activate-main", optionId: "mechanic-main:teach" });
    applyOptional(behind);
    settle(behind);
    // Two drawn, one discarded: a net card, from an empty hand against three.
    expect(behind.state.players.p1.hand).toHaveLength(1);

    const level = table("op09-092-level")
      .bareTable()
      .withBoard("p1", [character("teach", "OP09-092")])
      .withHand("p1", [instance("mine", "ST32-004")])
      .withDeckTop("p1", [instance("draw-a", "OP09-016")])
      .withHand(
        "p2",
        Array.from({ length: 3 }, (_, index) =>
          instance(`theirs-${index}`, "ST32-004"),
        ),
      )
      .build();
    level.play({ type: "activate-main", optionId: "mechanic-main:teach" });
    applyOptional(level);
    settle(level);
    // One against three is two behind, not three.
    expect(level.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP09-095 Laffitte", () => {
  covers("OP09-095", "[Activate: Main]");

  it("rests a DON!! and itself for the set's deepest Blackbeard search", () => {
    const game = blackbeard("op09-095")
      .withBoard("p1", [character("laffitte", "OP09-095")])
      .withDeckTop("p1", [
        instance("miss", "ST32-004"),
        instance("hit", "OP09-090"),
      ])
      .build();

    game.play({ type: "activate-main", optionId: "mechanic-main:laffitte" });
    applyOptional(game);
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);
    expect(game.state.players.p1.board[0]?.rested).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("OP09-097 Black Vortex", () => {
  covers("OP09-097", "[Counter]", "[Trigger]");

  it("negates the attacker and takes 4000 off it", () => {
    const game = defending("op09-097")
      .bareTable()
      .withLife("p1", [instance("life", "ST32-004")])
      .withHand("p1", [instance("event", "OP09-097")])
      .withBoard("p2", [character("attacker", "OP09-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP09-097]" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);

    // 12000 printed, minus 4000, and its own aura is switched off as well.
    expect(currentPower(game.state, "p2", "attacker")).toBe(8_000);
    expect(game.state.activeAttack?.counterPower).toBe(0);
  });

  it("negates a card off a Life card", () => {
    const game = triggerFrom("op09-097-trigger", "OP09-097");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP09-098 Black Hole", () => {
  covers("OP09-098", "[Main]", "[Trigger]");

  it("negates a Character, then K.O.s it only if it is cheap enough", () => {
    const cheap = blackbeard("op09-098-cheap")
      .withHand("p1", [instance("event", "OP09-098")])
      .withBoard("p2", [character("small", "OP09-038")])
      .build();

    cheap.play({ summary: "[OP09-098]" });
    cheap.play({ type: "resolve-effect", optionId: "small" });
    settle(cheap);
    expect(cheap.state.players.p2.board).toHaveLength(0);

    const big = blackbeard("op09-098-big")
      .withHand("p1", [instance("event", "OP09-098")])
      .withBoard("p2", [character("large", "OP09-046")])
      .build();
    big.play({ summary: "[OP09-098]" });
    big.play({ type: "resolve-effect", optionId: "large" });
    settle(big);
    // Cost 7: negated for the turn, and still standing.
    expect(big.state.players.p2.board).toHaveLength(1);
  });

  it("negates a card off a Life card", () => {
    const game = triggerFrom("op09-098-trigger", "OP09-098");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settle(game);
    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

// --- Yellow ------------------------------------------------------------------

describe("OP09-100 Karasu", () => {
  covers("OP09-100", "[Blocker]", "[Trigger]");

  it("blocks, and plays itself off a Life card behind a Revolutionary Leader", () => {
    const blocking = defending("op09-100-block")
      .bareTable()
      .withLife("p1", [instance("life", "ST32-004")])
      .withBoard("p1", [character("karasu", "OP09-100")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    expect(hasKeyword(blocking.state, "p1", "karasu", "Blocker")).toBe(true);

    // OP09-104 Sabo is the set's {Revolutionary Army} Leader-adjacent card; the
    // Leader itself is OP13-004, which the ST35 list is led by.
    const game = triggerFrom("op09-100-trigger", "OP09-100", {
      leader: "OP13-004",
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    // Both Life stacks are inside the printed total, so the body arrives free.
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP09-100",
    ]);
  });

  it("is not even offered behind a Leader of another type", () => {
    const game = triggerFrom("op09-100-other", "OP09-100");
    // The gate is false, so the Trigger can do nothing and the window offers
    // only the Life card -- a prompt that resolves to nothing is not offered.
    expect(
      game
        .legalActions()
        .map((action) => action.summary)
        .sort(),
    ).toEqual(["Add Life card to hand"]);
    game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "life-card",
    ]);
  });
});

describe("OP09-101 Kuzan", () => {
  covers("OP09-101", "[On Play]");

  it("buries a cost 3 into the opponent's Life face-up and strips a card", () => {
    const game = table("op09-101")
      .bareTable()
      .withHand("p1", [instance("kuzan", "OP09-101")])
      .withHand("p2", [instance("theirs", "ST32-004")])
      .withBoard("p2", [
        character("reachable", "OP09-029"),
        character("too-big", "OP09-046"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-101" });
    // Cost 3 or less: the 7-drop is outside it.
    expect(effectOptions(game.state)).toEqual(["reachable"]);
    game.play({ type: "resolve-effect", optionId: "reachable" });
    game.play({ type: "resolve-effect", optionId: "top" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    settle(game);

    // The Character is a Life card now -- face up, and theirs.
    expect(game.state.players.p2.life.map((card) => card.instanceId)).toEqual([
      "reachable",
    ]);
    expect(game.state.players.p2.life[0]?.faceUp).toBe(true);
    expect(game.state.players.p2.hand).toHaveLength(0);
  });
});

describe("OP09-102 Professor Clover", () => {
  covers("OP09-102", "[On Play]", "[Trigger]");

  it("finds a [Trigger] card behind the [Nico Robin] Leader, and nothing behind another", () => {
    const game = table("op09-102")
      .bareTable()
      .withLeader("p1", "OP09-062")
      .withHand("p1", [instance("clover", "OP09-102")])
      .withDeckTop("p1", [
        instance("plain", "OP09-016"),
        instance("hit", "OP09-100"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-102" });
    expect(effectOptions(game.state)).toEqual(["hit", "done"]);
    game.play({ type: "resolve-effect", optionId: "hit" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hit",
    ]);

    const other = table("op09-102-other")
      .bareTable()
      .withHand("p1", [instance("clover", "OP09-102")])
      .withDeckTop("p1", [instance("hit", "OP09-100")])
      .build();
    other.play({ type: "play-card", cardNumber: "OP09-102" });
    expect(other.state.pendingEffect).toBeNull();
    expect(other.state.players.p1.hand).toHaveLength(0);
  });

  it("runs the same search off a Life card", () => {
    const game = triggerFrom("op09-102-trigger", "OP09-102", {
      leader: "OP09-062",
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    // The deck the position leaves prints no [Trigger], so the search adds
    // nothing and puts all three back.
    expect(game.state.players.p1.deck).toHaveLength(3);
  });
});

describe("OP09-103 Koala", () => {
  covers("OP09-103", "[On Play]", "[Blocker]");

  it("spends a Life card for a free Revolutionary body and a card", () => {
    const game = table("op09-103")
      .bareTable()
      .withHand("p1", [
        instance("koala", "OP09-103"),
        instance("free", "OP09-112"),
        instance("too-big", "OP09-104"),
      ])
      .withLife("p1", [instance("life", "ST32-004")])
      .withDeckTop("p1", [instance("draw", "OP09-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-103" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "life" });
    // Cost 4 or less: the 7-drop is outside it.
    expect(effectOptions(game.state)).toEqual(["free", "done"]);
    game.play({ type: "resolve-effect", optionId: "free" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber).sort(),
    ).toEqual(["OP09-103", "OP09-112"]);
    // "If you do, draw 1 card": the draw is inside the play.
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["draw", "life", "too-big"]);
    expect(
      hasKeyword(
        game.state,
        "p1",
        game.state.players.p1.board.find(
          (card) => card.cardNumber === "OP09-103",
        )!.instanceId,
        "Blocker",
      ),
    ).toBe(true);
  });
});

describe("OP09-104 Sabo", () => {
  covers("OP09-104", "[On Play]", "[Trigger]");

  it("banks a Revolutionary body into Life face-up and takes one back", () => {
    const game = table("op09-104")
      .bareTable()
      .withHand("p1", [
        instance("sabo", "OP09-104"),
        instance("bank", "OP09-100"),
      ])
      .withLife("p1", [
        instance("life-a", "ST32-004"),
        instance("life-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-104" });
    game.play({ type: "resolve-effect", optionId: "bank" });
    // Three Life cards now, so the second half fires and takes one back.
    game.play({ type: "resolve-effect", optionId: "bank" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "bank",
    ]);
    expect(game.state.players.p1.life).toHaveLength(2);
  });

  it("draws two off a Life card behind a multicolored Leader", () => {
    const game = triggerFrom("op09-104-trigger", "OP09-104", {
      leader: "OP09-062",
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(2);

    const mono = triggerFrom("op09-104-mono", "OP09-104");
    // ST31's Leader is monocolored, so the Trigger is inert and not offered.
    expect(
      mono.legalActions().some((action) => action.type === "resolve-trigger"),
    ).toBe(true);
    mono.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
    expect(mono.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP09-107 Nico Robin", () => {
  covers("OP09-107", "[On Play]", "[Trigger]");

  it("trashes the top of a Life stack of three, and nothing off two", () => {
    const game = table("op09-107")
      .bareTable()
      .withHand("p1", [instance("robin", "OP09-107")])
      .withLife("p2", [
        instance("their-a", "ST32-004"),
        instance("their-b", "ST32-004"),
        instance("their-c", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-107" });
    game.play({ type: "resolve-effect", optionId: "their-a" });
    settle(game);

    expect(game.state.players.p2.life).toHaveLength(2);
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "their-a",
    ]);

    const short = table("op09-107-short")
      .bareTable()
      .withHand("p1", [instance("robin", "OP09-107")])
      .withLife("p2", [
        instance("their-a", "ST32-004"),
        instance("their-b", "ST32-004"),
      ])
      .build();
    short.play({ type: "play-card", cardNumber: "OP09-107" });
    expect(short.state.pendingEffect).toBeNull();
    expect(short.state.players.p2.life).toHaveLength(2);
  });

  it("plays a cheap yellow body out of hand off a Life card", () => {
    const game = triggerFrom("op09-107-trigger", "OP09-107");
    // A yellow Character of cost 3 or less has to be in hand for the clause to
    // have anything to do; the position's hand is empty, so it resolves to
    // nothing rather than deadlocking.
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP09-108 Bartholomew Kuma", () => {
  covers("OP09-108", "[Trigger]");

  it("plays itself behind a {Revolutionary Army} Leader at five combined Life", () => {
    const game = triggerFrom("op09-108-trigger", "OP09-108", {
      leader: "OP13-004",
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP09-108",
    ]);
  });
});

describe("OP09-109 Jaguar.D.Saul", () => {
  covers("OP09-109", "[Blocker]", "[Trigger]");

  it("plays itself behind the [Nico Robin] Leader", () => {
    const game = triggerFrom("op09-109-trigger", "OP09-109", {
      leader: "OP09-062",
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);

    const saul = game.state.players.p1.board[0]!;
    expect(saul.cardNumber).toBe("OP09-109");
    expect(hasKeyword(game.state, "p1", saul.instanceId, "Blocker")).toBe(true);
  });

  it("is not even offered behind another Leader", () => {
    const game = triggerFrom("op09-109-other", "OP09-109");
    expect(
      game
        .legalActions()
        .map((action) => action.summary)
        .sort(),
    ).toEqual(["Add Life card to hand"]);
    game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP09-110 Pierre", () => {
  covers("OP09-110", "[On Play]", "[Trigger]");

  it("draws two and discards two", () => {
    const game = table("op09-110")
      .bareTable()
      .withHand("p1", [instance("pierre", "OP09-110")])
      .withDeckTop("p1", [
        instance("draw-a", "ST32-004"),
        instance("draw-b", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-110" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(2);
  });

  it("plays itself off a Life card, behind any Leader", () => {
    const game = triggerFrom("op09-110-trigger", "OP09-110");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP09-110");
  });
});

describe("OP09-111 Brook", () => {
  covers("OP09-111", "[Trigger]");

  it("strips two cards from a hand of six behind an {Egghead} Leader", () => {
    const game = triggerFrom("op09-111-trigger", "OP09-111");
    // ST31's Leader has no {Egghead} type, so the clause is inert and the
    // window offers only the Life card.
    expect(
      game.legalActions().some((action) => action.type === "resolve-trigger"),
    ).toBe(true);
    game.play({ type: "resolve-trigger", summary: "Add Life card to hand" });
    expect(game.state.players.p2.hand).toHaveLength(0);
  });
});

describe("OP09-105 Sanji", () => {
  covers("OP09-105", "[Trigger]");

  it("banks the top of the deck onto Life and pays two cards, behind {Egghead}", () => {
    const game = triggerFrom("op09-105-trigger", "OP09-105", {
      leader: "OP13-100",
    });
    // Two cards to pay the clause with, and one to bank.
    const withHand = game;
    expect(
      withHand
        .legalActions()
        .some((action) => action.type === "resolve-trigger"),
    ).toBe(true);

    const paid = defending("op09-105-paid")
      .bareTable()
      .withLeader("p1", "OP13-100")
      .withLife("p1", [instance("life-card", "OP09-105")])
      .withDeckTop("p1", [instance("banked", "ST32-004")])
      .withHand("p1", [
        instance("pitch-a", "ST32-004"),
        instance("pitch-b", "ST32-004"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    paid.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    while (
      paid.state.phase === "block" ||
      (paid.state.phase === "counter" &&
        !paid
          .legalActions()
          .some((action) => action.type === "resolve-trigger"))
    ) {
      paid.pass();
    }
    paid.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(paid);

    // The top of the deck is the top of Life, and two cards paid for it. The
    // trash holds those two plus the Life card whose Trigger this was --
    // activating one sends the card itself to the trash.
    expect(paid.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "banked",
    ]);
    expect(
      paid.state.players.p1.trash.map((card) => card.instanceId).sort(),
    ).toEqual(["life-card", "pitch-a", "pitch-b"]);
  });

  it("is not offered behind a Leader of another type", () => {
    const game = triggerFrom("op09-105-other", "OP09-105");
    expect(
      game
        .legalActions()
        .map((action) => action.summary)
        .sort(),
    ).toEqual(["Add Life card to hand"]);
  });
});

describe("OP09-112 Belo Betty", () => {
  covers("OP09-112", "[On Play]", "[Trigger]");

  it("draws from behind on Life, and nothing from ahead", () => {
    const behind = table("op09-112-behind")
      .bareTable()
      .withHand("p1", [instance("betty", "OP09-112")])
      .withLife("p1", [
        instance("life-a", "ST32-004"),
        instance("life-b", "ST32-004"),
      ])
      .withDeckTop("p1", [instance("draw", "OP09-016")])
      .build();

    behind.play({ type: "play-card", cardNumber: "OP09-112" });
    settle(behind);
    expect(behind.state.players.p1.hand.map((card) => card.instanceId)).toEqual(
      ["draw"],
    );

    const ahead = table("op09-112-ahead")
      .bareTable()
      .withHand("p1", [instance("betty", "OP09-112")])
      .withLife(
        "p1",
        Array.from({ length: 3 }, (_, index) =>
          instance(`life-${index}`, "ST32-004"),
        ),
      )
      .withDeckTop("p1", [instance("draw", "OP09-016")])
      .build();
    ahead.play({ type: "play-card", cardNumber: "OP09-112" });
    settle(ahead);
    expect(ahead.state.players.p1.hand).toHaveLength(0);
  });

  it("plays itself off a Life card behind a {Revolutionary Army} Leader", () => {
    const game = triggerFrom("op09-112-trigger", "OP09-112", {
      leader: "OP13-004",
    });
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP09-112");
  });
});

describe("OP09-114 Lindbergh", () => {
  covers("OP09-114", "[On Play]", "[Trigger]");

  it("K.O.s a 2000 while the Life stacks total five or less", () => {
    const game = table("op09-114")
      .bareTable()
      .withHand("p1", [instance("lindbergh", "OP09-114")])
      .withLife("p1", [instance("life", "ST32-004")])
      .withBoard("p2", [
        character("small", "OP09-054"),
        character("big", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-114" });
    // 2000 power or less: the 5000 is out of reach.
    expect(effectOptions(game.state)).toEqual(["small", "done"]);
    game.play({ type: "resolve-effect", optionId: "small" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });

  it("does nothing while the two stacks are deep", () => {
    const game = table("op09-114-deep")
      .bareTable()
      .withHand("p1", [instance("lindbergh", "OP09-114")])
      .withLife(
        "p1",
        Array.from({ length: 4 }, (_, index) =>
          instance(`mine-${index}`, "ST32-004"),
        ),
      )
      .withLife(
        "p2",
        Array.from({ length: 4 }, (_, index) =>
          instance(`theirs-${index}`, "ST32-004"),
        ),
      )
      .withBoard("p2", [character("small", "OP09-054")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-114" });
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("plays itself off a Life card at five combined Life", () => {
    const game = triggerFrom("op09-114-trigger", "OP09-114");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP09-114");
  });
});

describe("OP09-115 Ice Block Partisan", () => {
  covers("OP09-115", "[Main]", "[Trigger]");

  it("K.O.s a cheap body that prints a [Trigger], and no other", () => {
    const game = table("op09-115")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-115")])
      .withBoard("p2", [
        character("triggered", "OP09-110"),
        character("plain", "OP09-029"),
      ])
      .build();

    game.play({ summary: "[OP09-115]" });
    expect(effectOptions(game.state)).toEqual(["triggered", "done"]);
    game.play({ type: "resolve-effect", optionId: "triggered" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "plain",
    ]);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op09-115-trigger", "OP09-115");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP09-116 Never Underestimate the Power of Miracles!!", () => {
  covers("OP09-116", "[Counter]", "[Trigger]");

  it("adds 2000 to the battle", () => {
    const game = defending("op09-116")
      .bareTable()
      .withLife("p1", [instance("life", "ST32-004")])
      .withHand("p1", [instance("event", "OP09-116")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP09-116]" });
    settle(game);
    expect(game.state.activeAttack?.counterPower).toBe(2_000);
  });

  it("plays a Revolutionary body out of hand off a Life card", () => {
    const game = triggerFrom("op09-116-trigger", "OP09-116");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    // Nothing in hand to play, so the clause resolves to nothing.
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP09-117 Dereshi!", () => {
  covers("OP09-117", "[Main]", "[Trigger]");

  it("takes up to two [Trigger] cards other than itself out of the top five", () => {
    const game = table("op09-117")
      .bareTable()
      .withHand("p1", [instance("event", "OP09-117")])
      .withDeckTop("p1", [
        instance("itself", "OP09-117"),
        instance("hit-a", "OP09-110"),
        instance("hit-b", "OP09-100"),
        instance("plain", "OP09-016"),
      ])
      .build();

    game.play({ summary: "[OP09-117]" });
    expect(effectOptions(game.state).sort()).toEqual([
      "done",
      "hit-a",
      "hit-b",
    ]);
    game.play({ type: "resolve-effect", optionId: "hit-a" });
    game.play({ type: "resolve-effect", optionId: "hit-b" });
    settle(game);

    expect(
      game.state.players.p1.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["hit-a", "hit-b"]);
  });

  it("draws a card off a Life card", () => {
    const game = triggerFrom("op09-117-trigger", "OP09-117");
    game.play({ type: "resolve-trigger", summary: "Activate Trigger" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP09-118 Gol.D.Roger", () => {
  covers("OP09-118", "[Rush]", "static");

  it("wins the game when the opponent blocks at zero Life", () => {
    const game = table("op09-118")
      .bareTable()
      .withBoard("p1", [character("roger", "OP09-118", { playedTurn: 1 })])
      .withBoard("p2", [character("blocker", "OP09-054")])
      .build();
    expect(hasKeyword(game.state, "p1", "roger", "Rush")).toBe(true);
    // The keyword its own text *mentions* is the opponent's, not its own.
    expect(hasKeyword(game.state, "p1", "roger", "Blocker")).toBe(false);

    game.play({
      type: "attack",
      attackerInstanceId: "roger",
      targetInstanceId: "p2-leader",
    });
    game.play({ summary: "Block with Richie" });

    expect(game.state.phase).toBe("finished");
    expect(game.state.winner).toBe("p1");
  });

  it("wins nothing while both players still hold Life", () => {
    const game = table("op09-118-life")
      .bareTable()
      .withLife("p1", [instance("mine", "ST32-004")])
      .withLife("p2", [instance("theirs", "ST32-004")])
      .withBoard("p1", [character("roger", "OP09-118", { playedTurn: 1 })])
      .withBoard("p2", [character("blocker", "OP09-054")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "roger",
      targetInstanceId: "p2-leader",
    });
    game.play({ summary: "Block with Richie" });

    expect(game.state.phase).toBe("counter");
    expect(game.state.winner).toBeNull();
  });
});

describe("OP09-119 Monkey.D.Luffy", () => {
  covers("OP09-119", "[On Play]");

  it("returns a DON!! for a card and [Rush]", () => {
    const game = table("op09-119")
      .bareTable()
      .withHand("p1", [instance("luffy", "OP09-119")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP09-119" });
    applyOptional(game);
    payDonMinus(game);
    settle(game);

    const luffy = game.state.players.p1.board[0]!;
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    expect(hasKeyword(game.state, "p1", luffy.instanceId, "Rush")).toBe(true);
  });
});
