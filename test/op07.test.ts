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
 * BOOSTER PACK -500 YEARS IN THE FUTURE- [OP-07], as a whole-set import.
 *
 * `packages/cards/src/op07.ts` explains where the records come from; this file
 * holds the behaviour. Five identities were already in the pool as cards other
 * decks ship, and stay with those decks' files: `test/op14-mihawk.test.ts`
 * (OP07-022), `test/eb04-bonney.test.ts` (OP07-107, OP07-114) and
 * `test/op17-kaido.test.ts` (OP07-077). OP07-056 Slave Arrow is implemented
 * imperatively and tested where its deck is. Everything else in the set is
 * here.
 *
 * ## Why no deck
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter, the documented
 * shape for a card outside a manifest. Where a clause is gated on a Leader the
 * pool would not otherwise seat -- OP-07 prints six of them, and four of its
 * five archetypes are built on their types or names -- the position states that
 * Leader and is paired with the same play behind a Leader that does not satisfy
 * the gate. A clause whose gate is never shown closed is a clause nobody has
 * tested.
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

/**
 * Ten cards in the trash, for the Black clauses whose payoff is gated on one.
 *
 * The identity does not matter to any of them -- what they read is the count --
 * so one number repeated keeps the position about the clause under test.
 */
const deepTrash = (prefix: string) =>
  Array.from({ length: 10 }, (_, index) =>
    instance(`${prefix}-trash-${index}`, "ST32-004"),
  );

/** Take one hit with `cardNumber` as p1's only Life card, Trigger window open. */
const triggerFrom = (
  seed: string,
  cardNumber: string,
  options: {
    leader?: string;
    donDeck?: number;
    hand?: string[];
    board?: string[][];
    opponentBoard?: string[][];
    trash?: string[];
  } = {},
) => {
  const { leader, donDeck, hand, board, opponentBoard, trash } = options;
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
    .withBoard("p2", [
      character("attacker", "ST32-004"),
      ...(opponentBoard ?? []).map(([id, number]) =>
        character(id!, number!, { rested: true }),
      ),
    ]);
  if (leader) built = built.withLeader("p1", leader);
  if (donDeck) built = built.withDonDeck("p1", donDeck);
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

// --- Red ---------------------------------------------------------------------

describe("OP07-001 Monkey.D.Dragon (Leader)", () => {
  covers("OP07-001", "[Activate: Main]");

  it("moves the DON!! it has already given onto one Character", () => {
    const game = table("op07-001")
      .bareTable()
      .withLeader("p1", "OP07-001")
      .withBoard("p1", [character("dragon", "OP07-015")])
      .withGivenDon("p1", "p1-leader", 2)
      .build();

    game.play({ type: "activate-main", summary: "OP07-001" });
    game.play({ type: "resolve-effect", optionId: "dragon" });
    settleDeclining(game);

    // The DON!! stays on the field and keeps granting power -- it has simply
    // moved, which is what separates this from a cost that rests it.
    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(0);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "dragon")!
        .attachedDon,
    ).toHaveLength(2);
    expect(currentPower(game.state, "p1", "dragon")).toBe(11_000);
  });

  it("is not offered with no DON!! given anywhere", () => {
    const game = table("op07-001-bare")
      .bareTable()
      .withLeader("p1", "OP07-001")
      .withBoard("p1", [character("dragon", "OP07-015")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-001"),
        ),
    ).toBe(false);
  });
});

describe("OP07-002 Ain", () => {
  covers("OP07-002", "[On Play]");

  it("sets a Character's power to 0 for the turn", () => {
    const game = table("op07-002")
      .bareTable()
      .withHand("p1", [instance("ain", "OP07-002")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-002" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(0);
  });
});

describe("OP07-003 Outlook III", () => {
  covers("OP07-003", "[Activate: Main]");

  it("trashes itself to shrink two Characters by 2000 each", () => {
    const game = table("op07-003")
      .bareTable()
      .withBoard("p1", [character("outlook", "OP07-003")])
      .withBoard("p2", [
        character("first", "ST32-004"),
        character("second", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP07-003" });
    game.play({ type: "resolve-effect", optionId: "first" });
    game.play({ type: "resolve-effect", optionId: "second" });
    settleDeclining(game);

    // Each card in the binding takes the whole number, not a share of it.
    expect(currentPower(game.state, "p2", "first")).toBe(3_000);
    expect(currentPower(game.state, "p2", "second")).toBe(3_000);
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP07-003");
  });

  it("is not offered against an empty board", () => {
    const game = table("op07-003-empty")
      .bareTable()
      .withBoard("p1", [character("outlook", "OP07-003")])
      .build();

    // Repeatable, so an offer that resolves to nothing is one a rules agent
    // takes forever -- and taking it here would trash the card for nothing.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-003"),
        ),
    ).toBe(false);
  });
});

describe("OP07-004 Curly.Dadan", () => {
  covers("OP07-004", "[On Play]");

  it("spends a card from hand to dig five for a 2000-power body", () => {
    const game = table("op07-004")
      .bareTable()
      .withHand("p1", [
        instance("dadan", "OP07-004"),
        instance("fodder", "ST31-003"),
      ])
      .withDeckTop("p1", [
        instance("deck-a", "ST32-004"),
        instance("deck-b", "OP01-016"),
        instance("deck-c", "ST32-004"),
        instance("deck-d", "ST32-004"),
        instance("deck-e", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-004" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    // The 5000-power bodies are outside the printed ceiling; only the 1-drop
    // is offered, and printed power is the reading -- the card is still in the
    // deck, where nothing has modified it.
    expect(effectOptions(game.state)).toContain("deck-b");
    expect(effectOptions(game.state)).not.toContain("deck-a");
    game.play({ type: "resolve-effect", optionId: "deck-b" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "deck-b",
    );
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
  });

  it("cannot buy the search with nothing behind the card itself", () => {
    const game = table("op07-004-broke")
      .bareTable()
      .withHand("p1", [instance("dadan", "OP07-004")])
      .withDeckTop("p1", [instance("deck-b", "OP01-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-004" });
    settleDeclining(game);

    // The payoff is nested inside the cost, so an unpayable cost is an
    // unreachable search rather than a free one.
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP07-005 Carina", () => {
  covers("OP07-005", "[On Play]", "[Blocker]");

  it("shrinks a Character on the way in and blocks afterwards", () => {
    const game = table("op07-005")
      .bareTable()
      .withHand("p1", [instance("carina", "OP07-005")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-005" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(3_000);
    const carina = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP07-005",
    )!;
    expect(hasKeyword(game.state, "p1", carina.instanceId, "Blocker")).toBe(
      true,
    );
  });
});

describe("OP07-006 Sterry", () => {
  covers("OP07-006", "[On Play]");

  it("mortgages the active Leader for a card", () => {
    const game = table("op07-006")
      .bareTable()
      .withHand("p1", [
        instance("sterry", "OP07-006"),
        instance("spare", "ST31-003"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-006" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    // The draw happens before the discard, so the drawn card is a legal one to
    // put back -- which is the whole shape of a rummage.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
    game.play({ type: "resolve-effect", optionId: "spare" });
    settle(game);

    expect(currentPower(game.state, "p1", "p1-leader")).toBe(0);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("spare");
  });

  it("cannot pay with a Leader that has already attacked", () => {
    const game = table("op07-006-rested")
      .bareTable()
      .withRestedLeader("p1")
      .withHand("p1", [
        instance("sterry", "OP07-006"),
        instance("spare", "ST31-003"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-006" });
    settleDeclining(game);

    // "Your 1 *active* Leader": a rested one cannot pay, and the payoff is
    // nested inside the cost, so nothing is drawn.
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId),
    ).not.toContain("drawn");
  });
});

describe("OP07-008 Mr. Tanaka", () => {
  covers("OP07-008", "[Blocker]", "[Trigger]");

  it("arrives from Life as a Blocker", () => {
    const game = triggerFrom("op07-008", "OP07-008");
    game.play({ type: "resolve-trigger" });
    settle(game);

    const tanaka = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP07-008",
    );
    expect(tanaka).toBeDefined();
    // Played, not trashed: `applyResolveTrigger` skips its usual trip to the
    // trash once the card has landed somewhere.
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).not.toContain("OP07-008");
    expect(hasKeyword(game.state, "p1", tanaka!.instanceId, "Blocker")).toBe(
      true,
    );
  });
});

describe("OP07-009 Dogura & Magura", () => {
  covers("OP07-009", "[On Play]");

  it("offers only a red Character whose cost is exactly 1", () => {
    const game = table("op07-009")
      .bareTable()
      .withHand("p1", [instance("dogura", "OP07-009")])
      .withBoard("p1", [
        character("nami", "OP01-016"),
        character("brook", "ST31-003"),
        character("rayleigh", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-009" });
    const options = effectOptions(game.state);
    // Cost exactly 1, and red: the 2-cost red body and the green 4-cost are
    // both outside it.
    expect(options).toContain("nami");
    expect(options).not.toContain("brook");
    expect(options).not.toContain("rayleigh");
    game.play({ type: "resolve-effect", optionId: "nami" });
    settle(game);

    expect(hasKeyword(game.state, "p1", "nami", "Double Attack")).toBe(true);
  });
});

describe("OP07-010 Baccarat", () => {
  covers("OP07-010", "[Blocker]", "[On Your Opponent's Attack]");

  it("trashes a card from hand for +2000 in the open battle, once a turn", () => {
    const game = defending("op07-010")
      .bareTable()
      .withBoard("p1", [character("baccarat", "OP07-010")])
      .withHand("p1", [instance("fodder", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    settle(game);

    // 4000 printed and 6000 in the fight, which is what turns a lost trade into
    // a won one against a 5000 attacker.
    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("fodder");
  });

  it("is not offered with an empty hand", () => {
    const game = defending("op07-010-broke")
      .bareTable()
      .withBoard("p1", [character("baccarat", "OP07-010")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    // An offer whose cost cannot be paid is a prompt with nothing behind it,
    // and taking it would spend the `[Once Per Turn]` on nothing.
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP07-011 Bluejam", () => {
  covers("OP07-011", "[When Attacking]");

  it("kills a 2000 on the swing with a DON!! on it, and nothing without", () => {
    const armed = table("op07-011")
      .bareTable()
      .withBoard("p1", [character("bluejam", "OP07-011")])
      .withGivenDon("p1", "bluejam", 1)
      .withBoard("p2", [character("small", "ST32-005")])
      .build();

    armed.play({
      type: "attack",
      attackerInstanceId: "bluejam",
      targetInstanceId: "p2-leader",
    });
    armed.play({ type: "resolve-effect", optionId: "small" });
    settleDeclining(armed);
    expect(armed.state.players.p2.board).toHaveLength(0);

    const bare = table("op07-011-bare")
      .bareTable()
      .withBoard("p1", [character("bluejam", "OP07-011")])
      .withBoard("p2", [character("small", "ST32-005")])
      .build();

    bare.play({
      type: "attack",
      attackerInstanceId: "bluejam",
      targetInstanceId: "p2-leader",
    });
    expect(bare.state.pendingEffect).toBeNull();
    expect(bare.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP07-012 Porchemy", () => {
  covers("OP07-012", "[On Play]");

  it("shrinks a Character by 1000", () => {
    const game = table("op07-012")
      .bareTable()
      .withHand("p1", [instance("porchemy", "OP07-012")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-012" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settle(game);

    expect(currentPower(game.state, "p2", "target")).toBe(4_000);
  });
});

describe("OP07-013 Masked Deuce", () => {
  covers("OP07-013", "[On Play]");

  it("digs five behind an [Portgas.D.Ace] Leader and nothing behind another", () => {
    const withAce = table("op07-013")
      .bareTable()
      .withLeader("p1", "OP16-001")
      .withHand("p1", [instance("deuce", "OP07-013")])
      .withDeckTop("p1", [
        instance("deck-a", "ST32-004"),
        instance("ace", "OP07-119"),
        instance("deck-c", "ST32-004"),
        instance("deck-d", "ST32-004"),
        instance("deck-e", "ST32-004"),
      ])
      .build();

    withAce.play({ type: "play-card", cardNumber: "OP07-013" });
    // The reveal reaches an [Portgas.D.Ace] card *or* a red Event, and neither
    // of the green bodies is either.
    expect(effectOptions(withAce.state)).toContain("ace");
    expect(effectOptions(withAce.state)).not.toContain("deck-a");
    withAce.play({ type: "resolve-effect", optionId: "ace" });
    settle(withAce);
    expect(
      withAce.state.players.p1.hand.map((card) => card.instanceId),
    ).toContain("ace");

    const behindAnother = table("op07-013-gated")
      .bareTable()
      .withHand("p1", [instance("deuce", "OP07-013")])
      .withDeckTop("p1", [instance("ace", "OP07-119")])
      .build();

    behindAnother.play({ type: "play-card", cardNumber: "OP07-013" });
    settleDeclining(behindAnother);
    expect(behindAnother.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP07-014 Moda", () => {
  covers("OP07-014", "[On Play]", "[Your Turn]");

  it("buffs an [Portgas.D.Ace] card on its controller's turn", () => {
    const game = table("op07-014")
      .bareTable()
      .withHand("p1", [instance("moda", "OP07-014")])
      .withBoard("p1", [
        character("ace", "OP07-119"),
        character("other", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-014" });
    expect(effectOptions(game.state)).toContain("ace");
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "ace" });
    settle(game);

    expect(currentPower(game.state, "p1", "ace")).toBe(12_000);
  });

  it("does nothing when it arrives on the opponent's turn", () => {
    // `[Your Turn]` is not free even on an `[On Play]`: a Character can reach
    // the board on the other player's turn through a Counter or a Trigger, and
    // the buff would be spent on a turn nobody attacks in.
    const game = defending("op07-014-off-turn")
      .bareTable()
      .withHand("p2", [instance("moda", "OP07-014")])
      .withBoard("p2", [character("ace", "OP07-119")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-014" });
    settleDeclining(game);

    expect(currentPower(game.state, "p2", "ace")).toBe(10_000);
  });
});

describe("OP07-015 Monkey.D.Dragon", () => {
  covers("OP07-015", "[On Play]", "[Rush]");

  it("hands two rested DON!! to a card and attacks the turn it lands", () => {
    const game = table("op07-015")
      .bareTable()
      .withHand("p1", [instance("dragon", "OP07-015")])
      .withDon("p1", { active: 8, rested: 2 })
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-015" });
    const dragon = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP07-015",
    )!;
    game.play({ type: "resolve-effect", optionId: dragon.instanceId });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.find(
        (card) => card.instanceId === dragon.instanceId,
      )!.attachedDon,
    ).toHaveLength(2);
    expect(hasKeyword(game.state, "p1", dragon.instanceId, "Rush")).toBe(true);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === dragon.instanceId,
        ),
    ).toBe(true);
  });
});

describe("OP07-016 Galaxy Wink", () => {
  covers("OP07-016", "[Main]", "[Trigger]");

  it("buffs a {Revolutionary Army} body and shrinks one across the table", () => {
    const game = table("op07-016")
      .bareTable()
      .withHand("p1", [instance("wink", "OP07-016")])
      .withBoard("p1", [
        character("inazuma", "OP12-083"),
        character("other", "ST31-003"),
      ])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ summary: "[OP07-016]" });
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "inazuma" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "inazuma")).toBe(8_000);
    expect(currentPower(game.state, "p2", "target")).toBe(4_000);
  });

  it("runs the same clause off a Life card", () => {
    const game = triggerFrom("op07-016", "OP07-016", {
      board: [["inazuma", "OP12-083"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "inazuma" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "inazuma")).toBe(8_000);
  });
});

describe("OP07-017 Dragon Breath", () => {
  covers("OP07-017", "[Main]", "[Trigger]");

  it("answers a small Character and a cheap Stage in one cast", () => {
    const game = table("op07-017")
      .bareTable()
      .withHand("p1", [instance("breath", "OP07-017")])
      .withBoard("p2", [character("small", "ST32-005")])
      .withStage("p2", instance("stage", "OP07-058"))
      .build();

    game.play({ summary: "[OP07-017]" });
    game.play({ type: "resolve-effect", optionId: "small" });
    game.play({ type: "resolve-effect", optionId: "stage" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.stage ?? null).toBeNull();
  });

  it("cannot reach a Character above its power ceiling", () => {
    const game = table("op07-017-big")
      .bareTable()
      .withHand("p1", [instance("breath", "OP07-017")])
      .withBoard("p2", [character("big", "ST32-004")])
      .build();

    game.play({ summary: "[OP07-017]" });
    settleDeclining(game);
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("runs the same clause off a Life card", () => {
    const game = triggerFrom("op07-017", "OP07-017", {
      opponentBoard: [["small", "ST32-005"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("small");
  });
});

describe("OP07-018 KEEP OUT", () => {
  covers("OP07-018", "[Counter]", "[Trigger]");

  it("buffs a {Revolutionary Army} body past the end of the battle", () => {
    const game = defending("op07-018")
      .bareTable()
      .withHand("p1", [instance("keepout", "OP07-018")])
      .withBoard("p1", [character("inazuma", "OP12-083")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withDon("p1", { active: 2 })
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP07-018]" });
    game.play({ type: "resolve-effect", optionId: "inazuma" });
    settleDeclining(game);

    // A modifier on the card rather than a scalar on the battle: the printed
    // words are "until the end of your next turn", so it is still there once
    // the fight is over.
    expect(currentPower(game.state, "p1", "inazuma")).toBe(8_000);
  });

  it("runs the same clause off a Life card", () => {
    const game = triggerFrom("op07-018", "OP07-018", {
      board: [["inazuma", "OP12-083"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "inazuma" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "inazuma")).toBe(8_000);
  });
});

// --- Green -------------------------------------------------------------------

describe("OP07-019 Jewelry Bonney (Leader)", () => {
  covers("OP07-019", "[On Your Opponent's Attack]");

  it("rests a DON!! to rest one of the attacker's cards", () => {
    const game = defending("op07-019")
      .bareTable()
      .withLeader("p1", "OP07-019")
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("spare", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    // The card that declared the attack is already rested, so it is not on
    // offer: resting a rested card is not a payout.
    expect(effectOptions(game.state)).not.toContain("attacker");
    expect(effectOptions(game.state)).toContain("spare");
    game.play({ type: "resolve-effect", optionId: "spare" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "spare")!
        .rested,
    ).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("is not offered with every DON!! already rested", () => {
    const game = defending("op07-019-broke")
      .bareTable()
      .withLeader("p1", "OP07-019")
      .withDon("p1", { rested: 10 })
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP07-020 Aladine", () => {
  covers("OP07-020", "[On K.O.]", "[Blocker]");

  it("leaves a cheap Fish-Man behind it, behind a {Fish-Man} Leader", () => {
    const game = defending("op07-020")
      .bareTable()
      .withLeader("p1", "OP11-021")
      .withBoard("p1", [character("aladine", "OP07-020", { rested: true })])
      .withHand("p1", [instance("arlong", "OP16-023")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "aladine",
    });
    declineDefence(game);
    // A bare `[On K.O.]` fires however the body left the board, and losing a
    // fight is the common way a 5-cost Blocker does.
    game.play({ type: "resolve-effect", optionId: "arlong" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP16-023");
  });

  it("does nothing behind a Leader without the type", () => {
    const game = defending("op07-020-gated")
      .bareTable()
      .withBoard("p1", [character("aladine", "OP07-020", { rested: true })])
      .withHand("p1", [instance("arlong", "OP16-023")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "aladine",
    });
    declineDefence(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(1);
  });
});

describe("OP07-021 Urouge", () => {
  covers("OP07-021", "[End of Your Turn]", "[Blocker]");

  it("sets a rested DON!! active as the turn ends", () => {
    const game = table("op07-021")
      .bareTable()
      .withBoard("p1", [character("urouge", "OP07-021")])
      .withDon("p1", { active: 4, rested: 6 })
      .build();

    expect(game.state.players.p1.restedDon).toHaveLength(6);
    game.pass();

    // The DON!! comes back *after* the turn has spent it, which is what makes a
    // 4-cost Blocker a Counter Event the deck can still pay for.
    expect(game.state.players.p1.restedDon).toHaveLength(5);
    expect(game.state.players.p1.activeDon).toHaveLength(5);
  });
});

describe("OP07-023 Caribou", () => {
  covers("OP07-023", "static", "[Blocker]");

  it("blocks a size up once six DON!! are rested", () => {
    const spent = table("op07-023")
      .bareTable()
      .withBoard("p1", [character("caribou", "OP07-023")])
      .withDon("p1", { active: 4, rested: 6 })
      .build();
    expect(currentPower(spent.state, "p1", "caribou")).toBe(6_000);

    const fresh = table("op07-023-fresh")
      .bareTable()
      .withBoard("p1", [character("caribou", "OP07-023")])
      .withDon("p1", { active: 5, rested: 5 })
      .build();
    expect(currentPower(fresh.state, "p1", "caribou")).toBe(5_000);
  });
});

describe("OP07-024 Koala", () => {
  covers("OP07-024", "[On Your Opponent's Attack]");

  it("rests itself to hand [Blocker] to a bigger Fish-Man", () => {
    const game = defending("op07-024")
      .bareTable()
      .withBoard("p1", [
        character("koala", "OP07-024"),
        character("jinbe", "OP07-027"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "jinbe" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "koala")!
        .rested,
    ).toBe(true);
    expect(hasKeyword(game.state, "p1", "jinbe", "Blocker")).toBe(true);
    // The cost is exactly the block Koala itself could have made, and the
    // 6000 body is the one that can afford to take the hit.
    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      true,
    );
  });

  it("is not offered once it has already rested", () => {
    const game = defending("op07-024-rested")
      .bareTable()
      .withBoard("p1", [
        character("koala", "OP07-024", { rested: true }),
        character("jinbe", "OP07-027"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP07-025 Coribou", () => {
  covers("OP07-025", "[On Play]");

  it("plays its printed partner out of hand, rested", () => {
    const game = table("op07-025")
      .bareTable()
      .withHand("p1", [
        instance("coribou", "OP07-025"),
        instance("caribou", "OP07-023"),
        instance("other", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-025" });
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "caribou" });
    settleDeclining(game);

    const caribou = game.state.players.p1.board.find(
      (card) => card.instanceId === "caribou",
    )!;
    expect(caribou.rested).toBe(true);
  });
});

describe("OP07-026 Jewelry Bonney", () => {
  covers("OP07-026", "[On Play]");

  it("holds a rested Character down through the next Refresh Phase", () => {
    const game = table("op07-026")
      .bareTable()
      .withHand("p1", [instance("bonney", "OP07-026")])
      .withBoard("p2", [character("tired", "ST32-004", { rested: true })])
      // `bareTable()` empties both decks, and a turn that cannot draw ends the
      // game before its Refresh Phase runs at all.
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-026" });
    game.play({ type: "resolve-effect", optionId: "character" });
    game.play({ type: "resolve-effect", optionId: "tired" });
    settleDeclining(game);
    game.pass();

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "tired")!
        .rested,
    ).toBe(true);
  });

  it("holds a rested DON!! down instead, when that branch is taken", () => {
    const game = table("op07-026-don")
      .bareTable()
      .withHand("p1", [instance("bonney", "OP07-026")])
      .withDon("p2", { active: 5, rested: 5 })
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-026" });
    game.play({ type: "resolve-effect", optionId: "don" });
    settleDeclining(game);
    game.pass();

    // Four of the five come back, not five: the hold is spent by the refresh
    // that reads it and never reaches a second turn.
    expect(game.state.players.p2.restedDon).toHaveLength(1);
    expect(game.state.players.p2.donHeldFromRefresh).toBeUndefined();
  });
});

describe("OP07-029 Basil Hawkins", () => {
  covers("OP07-029", "static");

  it("blocks only behind a {Supernovas} Leader", () => {
    const behindSupernovas = table("op07-029")
      .bareTable()
      .withLeader("p1", "OP07-019")
      .withBoard("p1", [character("hawkins", "OP07-029")])
      .build();
    expect(hasKeyword(behindSupernovas.state, "p1", "hawkins", "Blocker")).toBe(
      true,
    );

    const behindAnother = table("op07-029-gated")
      .bareTable()
      .withBoard("p1", [character("hawkins", "OP07-029")])
      .build();
    expect(hasKeyword(behindAnother.state, "p1", "hawkins", "Blocker")).toBe(
      false,
    );
  });

  it("answers an opponent's removal by resting one of their Characters", () => {
    const game = defending("op07-029-replace")
      .bareTable()
      .withLeader("p1", "OP07-019")
      .withBoard("p1", [character("hawkins", "OP07-029")])
      .withHand("p2", [instance("stussy", "OP07-085")])
      .withBoard("p2", [character("fodder", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-085" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "hawkins" });
    // The prompt is the defender's, and the price comes off the *attacker's*
    // board -- the only replacement in the pool that reaches across the table.
    game.play({
      type: "resolve-effect",
      optionId: "replace:hawkins",
    });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("hawkins");
    expect(game.state.players.p2.board.some((card) => card.rested)).toBe(true);
  });
});

describe("OP07-030 Pappag", () => {
  covers("OP07-030", "static");

  it("blocks only beside a [Camie] Character", () => {
    const paired = table("op07-030")
      .bareTable()
      .withBoard("p1", [
        character("pappag", "OP07-030"),
        character("camie", "OP11-102"),
      ])
      .build();
    expect(hasKeyword(paired.state, "p1", "pappag", "Blocker")).toBe(true);

    const alone = table("op07-030-alone")
      .bareTable()
      .withBoard("p1", [character("pappag", "OP07-030")])
      .build();
    expect(hasKeyword(alone.state, "p1", "pappag", "Blocker")).toBe(false);
  });
});

describe("OP07-031 Bartolomeo", () => {
  covers("OP07-031", "[Your Turn]", "[Blocker]");

  it("draws and discards when its controller's effect rests a Character", () => {
    const game = table("op07-031")
      .bareTable()
      .withLeader("p1", "OP11-021")
      .withBoard("p1", [character("barto", "OP07-031")])
      .withHand("p1", [instance("tiger", "OP07-032")])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-032" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    // The rest raises the signal Bartolomeo watches, and the draw/discard is
    // the reaction it dispatches -- a card the deck gets for doing what it was
    // doing anyway.
    applyOptional(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
    game.play({ type: "resolve-effect", optionId: "drawn" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")!
        .rested,
    ).toBe(true);
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("drawn");
  });
});

describe("OP07-032 Fisher Tiger", () => {
  covers("OP07-032", "[On Play]", "static");

  it("rests a Character behind a {Fish-Man} Leader and attacks the same turn", () => {
    const game = table("op07-032")
      .bareTable()
      .withLeader("p1", "OP11-021")
      .withHand("p1", [instance("tiger", "OP07-032")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-032" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    const tiger = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP07-032",
    )!;
    // The printed sentence is [Rush: Character] longhand, so the body can go
    // straight at the Character it just rested.
    expect(
      hasKeyword(game.state, "p1", tiger.instanceId, "Rush: Character"),
    ).toBe(true);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === tiger.instanceId &&
            action.targetInstanceId === "victim",
        ),
    ).toBe(true);
  });

  it("rests nothing behind a Leader with neither type", () => {
    const game = table("op07-032-gated")
      .bareTable()
      .withHand("p1", [instance("tiger", "OP07-032")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-032" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")!
        .rested,
    ).toBeFalsy();
  });
});

describe("OP07-033 Monkey.D.Luffy", () => {
  covers("OP07-033", "static");

  it("makes its cheap teammates unanswerable by an opposing K.O. on a wide board", () => {
    // OP07-092 Joseph is the opposing removal: two "CP" cards out of its own
    // trash for a K.O. at cost 1 or less, which is exactly the half of the
    // board this aura is printed to protect.
    const position = (seed: string, extra: string[]) =>
      defending(seed)
        .bareTable()
        .withBoard("p1", [
          character("luffy", "OP07-033"),
          character("small", "ST32-001"),
          ...extra.map((number, index) => character(`filler-${index}`, number)),
        ])
        .withHand("p2", [instance("joseph", "OP07-092")])
        .withTrash("p2", [
          instance("cp-a", "OP09-038"),
          instance("cp-b", "OP09-038"),
        ])
        .build();

    const wide = position("op07-033", ["ST32-005"]);
    wide.play({ type: "play-card", cardNumber: "OP07-092" });
    applyOptional(wide);
    wide.play({ type: "resolve-effect", optionId: "cp-a" });
    wide.play({ type: "resolve-effect", optionId: "cp-b" });
    settle(wide);
    // The K.O. is skipped rather than suppressed later, so the cost is spent
    // and the body stays: three Characters is what the clause asks for.
    expect(
      wide.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("small");

    const narrow = position("op07-033-narrow", []);
    narrow.play({ type: "play-card", cardNumber: "OP07-092" });
    applyOptional(narrow);
    narrow.play({ type: "resolve-effect", optionId: "cp-a" });
    narrow.play({ type: "resolve-effect", optionId: "cp-b" });
    settle(narrow);
    expect(
      narrow.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("small");
  });

  it("does not protect a [Monkey.D.Luffy] of its own", () => {
    // "Other than [Monkey.D.Luffy]" is printed, so a second copy protects
    // neither itself nor the first -- and the name is what the clause reads.
    const game = defending("op07-033-self")
      .bareTable()
      .withBoard("p1", [
        character("luffy", "OP07-033"),
        character("cheap-luffy", "ST23-004"),
        character("third", "ST32-005"),
      ])
      .withHand("p2", [instance("joseph", "OP07-092")])
      .withTrash("p2", [
        instance("cp-a", "OP09-038"),
        instance("cp-b", "OP09-038"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-092" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cp-a" });
    game.play({ type: "resolve-effect", optionId: "cp-b" });
    settle(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("cheap-luffy");
  });
});

describe("OP07-034 Roronoa Zoro", () => {
  covers("OP07-034", "[When Attacking]");

  it("swings for 4000 on a board of three and 2000 on a board of two", () => {
    const wide = table("op07-034")
      .bareTable()
      .withBoard("p1", [
        character("zoro", "OP07-034"),
        character("second", "ST32-001"),
        character("third", "ST32-005"),
      ])
      .build();

    wide.play({
      type: "attack",
      attackerInstanceId: "zoro",
      targetInstanceId: "p2-leader",
    });
    expect(currentPower(wide.state, "p1", "zoro")).toBe(4_000);

    const narrow = table("op07-034-narrow")
      .bareTable()
      .withBoard("p1", [
        character("zoro", "OP07-034"),
        character("second", "ST32-001"),
      ])
      .build();

    narrow.play({
      type: "attack",
      attackerInstanceId: "zoro",
      targetInstanceId: "p2-leader",
    });
    expect(currentPower(narrow.state, "p1", "zoro")).toBe(2_000);
  });
});

describe("OP07-035 Karmic Punishment", () => {
  covers("OP07-035", "[Counter]", "[Trigger]");

  it("adds 3000 on a board of three and 2000 otherwise", () => {
    const wide = defending("op07-035")
      .bareTable()
      .withHand("p1", [instance("karmic", "OP07-035")])
      .withBoard("p1", [
        character("a", "ST32-001"),
        character("b", "ST32-005"),
        character("c", "ST32-004"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    wide.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(wide);
    wide.play({ summary: "[OP07-035]" });
    settleDeclining(wide);
    expect(wide.state.activeAttack?.counterPower).toBe(3_000);

    const narrow = defending("op07-035-narrow")
      .bareTable()
      .withHand("p1", [instance("karmic", "OP07-035")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    narrow.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(narrow);
    narrow.play({ summary: "[OP07-035]" });
    settleDeclining(narrow);
    expect(narrow.state.activeAttack?.counterPower).toBe(2_000);
  });

  it("kills a rested Character off a Life card", () => {
    const game = triggerFrom("op07-035", "OP07-035", {
      opponentBoard: [["tired", "ST32-005"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "tired" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("tired");
  });
});

describe("OP07-036 Demonic Aura Nine-Sword Style Asura Demon Nine Flash", () => {
  covers("OP07-036", "[Main]", "[Trigger]");

  it("buffs a card, then rests one of the opponent's for one of its own", () => {
    const game = table("op07-036")
      .bareTable()
      .withHand("p1", [instance("asura", "OP07-036")])
      .withBoard("p1", [character("big", "ST32-004")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ summary: "[OP07-036]" });
    game.play({ type: "resolve-effect", optionId: "big" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "big")).toBe(8_000);
    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "big")!
        .rested,
    ).toBe(true);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")!
        .rested,
    ).toBe(true);
  });

  it("cannot buy the rest with a board of cheap bodies", () => {
    const game = table("op07-036-cheap")
      .bareTable()
      .withHand("p1", [instance("asura", "OP07-036")])
      .withBoard("p1", [character("small", "ST32-001")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({ summary: "[OP07-036]" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settleDeclining(game);

    // "You may rest 1 of your Characters with a cost of 3 or more": a 1-drop
    // cannot pay, and the payoff is nested inside the cost.
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")!
        .rested,
    ).toBeFalsy();
  });

  it("rests a Character off a Life card", () => {
    const game = triggerFrom("op07-036", "OP07-036", {
      opponentBoard: [["small", "ST32-005"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);
    expect(game.state.players.p1.trash.map((c) => c.cardNumber)).toContain(
      "OP07-036",
    );
  });
});

describe("OP07-037 More Pizza!!", () => {
  covers("OP07-037", "[Main]", "[Trigger]");

  it("digs five for a {Supernovas} card other than itself", () => {
    const game = table("op07-037")
      .bareTable()
      .withHand("p1", [instance("pizza", "OP07-037")])
      .withDeckTop("p1", [
        instance("deck-a", "ST32-004"),
        instance("zoro", "ST32-005"),
        instance("second-pizza", "OP07-037"),
        instance("deck-d", "ST32-004"),
        instance("deck-e", "ST32-004"),
      ])
      .build();

    game.play({ summary: "[OP07-037]" });
    const options = effectOptions(game.state);
    expect(options).toContain("zoro");
    // "Other than [More Pizza!!]" is a name, so a second copy in the five is
    // not a legal find even though it carries the type.
    expect(options).not.toContain("second-pizza");
    game.play({ type: "resolve-effect", optionId: "zoro" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "zoro",
    );
  });

  it("draws off a Life card", () => {
    const game = triggerFrom("op07-037", "OP07-037");
    const before = game.state.players.p1.hand.length;
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);
    expect(game.state.players.p1.hand.length).toBe(before + 1);
  });
});

// --- Blue --------------------------------------------------------------------

describe("OP07-038 Boa Hancock (Leader)", () => {
  covers("OP07-038", "[Your Turn]");

  it("draws when its own effect takes a Character off the field", () => {
    const game = table("op07-038")
      .bareTable()
      .withLeader("p1", "OP07-038")
      .withHand("p1", [instance("joseph", "OP07-092")])
      .withTrash("p1", [
        instance("cp-a", "OP09-038"),
        instance("cp-b", "OP09-038"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .withBoard("p2", [character("small", "ST32-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-092" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cp-a" });
    game.play({ type: "resolve-effect", optionId: "cp-b" });
    game.play({ type: "resolve-effect", optionId: "small" });
    applyOptional(game);
    settleDeclining(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
  });

  it("does not draw on a full hand", () => {
    const game = table("op07-038-full")
      .bareTable()
      .withLeader("p1", "OP07-038")
      .withHand("p1", [
        instance("joseph", "OP07-092"),
        instance("spare-a", "ST31-003"),
        instance("spare-b", "ST31-003"),
        instance("spare-c", "ST31-003"),
        instance("spare-d", "ST31-003"),
        instance("spare-e", "ST31-003"),
        instance("spare-f", "ST31-003"),
      ])
      .withTrash("p1", [
        instance("cp-a", "OP09-038"),
        instance("cp-b", "OP09-038"),
      ])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .withBoard("p2", [character("small", "ST32-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-092" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cp-a" });
    game.play({ type: "resolve-effect", optionId: "cp-b" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settleDeclining(game);

    // The hand ceiling is what keeps the Leader from refilling a full grip.
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId),
    ).not.toContain("drawn");
  });
});

describe("OP07-039 Edward Weevil", () => {
  covers("OP07-039", "[When Attacking]");

  it("looks three deep with a DON!! on it, and nothing without", () => {
    const armed = table("op07-039")
      .bareTable()
      .withBoard("p1", [character("weevil", "OP07-039")])
      .withGivenDon("p1", "weevil", 1)
      .withDeckTop("p1", [
        instance("top-a", "OP01-016"),
        instance("top-b", "ST31-003"),
        instance("top-c", "ST32-004"),
      ])
      .build();

    armed.play({
      type: "attack",
      attackerInstanceId: "weevil",
      targetInstanceId: "p2-leader",
    });
    expect(armed.state.pendingEffect).not.toBeNull();
    settle(armed);
    // The cards stay in the deck: a look is not a draw, and all three go back
    // to an end the player chooses.
    expect(armed.state.players.p1.deck).toHaveLength(3);
    expect(armed.state.players.p1.hand).toHaveLength(0);

    const bare = table("op07-039-bare")
      .bareTable()
      .withBoard("p1", [character("weevil", "OP07-039")])
      .withDeckTop("p1", [instance("top-a", "OP01-016")])
      .build();

    bare.play({
      type: "attack",
      attackerInstanceId: "weevil",
      targetInstanceId: "p2-leader",
    });
    expect(bare.state.pendingEffect).toBeNull();
  });
});

describe("OP07-040 Crocodile", () => {
  covers("OP07-040", "[On Play]");

  it("rests a DON!! to bounce a cheap Character from either board", () => {
    const game = table("op07-040")
      .bareTable()
      .withHand("p1", [instance("crocodile", "OP07-040")])
      .withBoard("p1", [character("own", "ST31-003")])
      .withBoard("p2", [
        character("small", "ST32-001"),
        character("big", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-040" });
    const options = effectOptions(game.state);
    // "1 Character" names no side, so the controller's own 2-drop is a legal
    // target -- and the 4-cost body is outside the ceiling.
    expect(options).toContain("small");
    expect(options).toContain("own");
    expect(options).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "small" });
    settleDeclining(game);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "small",
    );
    // Four DON!! for the body and a fifth for the clause: the printed cost is
    // a rest rather than a spend, so it stays on the field.
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });
});

describe("OP07-041 Gloriosa (Grandma Nyon)", () => {
  covers("OP07-041", "[On Play]");

  it("digs five for an {Amazon Lily} or {Kuja Pirates} card other than itself", () => {
    const game = table("op07-041")
      .bareTable()
      .withHand("p1", [instance("gloriosa", "OP07-041")])
      .withDeckTop("p1", [
        instance("sweetpea", "OP08-048"),
        instance("second-gloriosa", "OP07-041"),
        instance("deck-c", "ST32-004"),
        instance("deck-d", "ST32-004"),
        instance("deck-e", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-041" });
    const options = effectOptions(game.state);
    expect(options).toContain("sweetpea");
    expect(options).not.toContain("second-gloriosa");
    game.play({ type: "resolve-effect", optionId: "sweetpea" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "sweetpea",
    );
  });
});

describe("OP07-042 Gecko Moria", () => {
  covers("OP07-042", "static");

  it("buries a teammate instead of dying, behind a Warlord Leader", () => {
    const game = defending("op07-042")
      .bareTable()
      .withLeader("p1", "OP07-038")
      .withBoard("p1", [
        character("moria", "OP07-042"),
        character("teammate", "ST31-003"),
      ])
      .withHand("p2", [
        instance("sabo", "OP07-118"),
        instance("fodder", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-118" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "moria" });
    game.play({ type: "resolve-effect", optionId: "replace:moria" });
    game.play({ type: "resolve-effect", optionId: "teammate" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("moria");
    // The teammate goes to the bottom of its owner's deck, not to the trash:
    // a buried card is not a K.O. and nothing keyed on one fires.
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("teammate");
  });

  it("is not offered behind a Leader without the type", () => {
    const game = defending("op07-042-gated")
      .bareTable()
      .withBoard("p1", [
        character("moria", "OP07-042"),
        character("teammate", "ST31-003"),
      ])
      .withHand("p2", [
        instance("sabo", "OP07-118"),
        instance("fodder", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-118" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "moria" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("moria");
  });
});

describe("OP07-043 Salome", () => {
  covers("OP07-043", "[On Play]", "[Your Turn]");

  it("buffs a [Boa Hancock] card", () => {
    const game = table("op07-043")
      .bareTable()
      .withHand("p1", [instance("salome", "OP07-043")])
      .withBoard("p1", [
        character("hancock", "OP07-051"),
        character("other", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-043" });
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "hancock" });
    settle(game);

    expect(currentPower(game.state, "p1", "hancock")).toBe(10_000);
  });
});

describe("OP07-044 Dracule Mihawk", () => {
  covers("OP07-044", "[On Play]");

  it("replaces itself", () => {
    const game = table("op07-044")
      .bareTable()
      .withHand("p1", [instance("mihawk", "OP07-044")])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-044" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
  });
});

describe("OP07-045 Jinbe", () => {
  covers("OP07-045", "[On Play]");

  it("plays another Warlord out of hand for free", () => {
    const game = table("op07-045")
      .bareTable()
      .withHand("p1", [
        instance("jinbe", "OP07-045"),
        instance("doflamingo", "OP07-048"),
        instance("second-jinbe", "OP07-045"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-045" });
    const options = effectOptions(game.state);
    expect(options).toContain("doflamingo");
    // "Other than [Jinbe]": a second copy cannot chain into itself.
    expect(options).not.toContain("second-jinbe");
    game.play({ type: "resolve-effect", optionId: "doflamingo" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("doflamingo");
  });
});

describe("OP07-046 Sengoku", () => {
  covers("OP07-046", "[On Play]");

  it("digs five for a Warlord, which is not a type it carries itself", () => {
    const game = table("op07-046")
      .bareTable()
      .withHand("p1", [instance("sengoku", "OP07-046")])
      .withDeckTop("p1", [
        instance("deck-a", "ST32-004"),
        instance("warlord", "OP07-048"),
        instance("second-sengoku", "OP07-046"),
        instance("deck-d", "ST32-004"),
        instance("deck-e", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-046" });
    const options = effectOptions(game.state);
    expect(options).toContain("warlord");
    // No "other than" is printed -- unlike the set's four other searches --
    // and it still cannot find a second copy of itself: this 1-drop is {Navy},
    // and what the clause reaches is the Warlord type.
    expect(options).not.toContain("second-sengoku");
    game.play({ type: "resolve-effect", optionId: "warlord" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "warlord",
    );
  });
});

describe("OP07-047 Trafalgar Law", () => {
  covers("OP07-047", "[Activate: Main]");

  it("picks itself up to bury a card from a full hand", () => {
    const game = table("op07-047")
      .bareTable()
      .withBoard("p1", [character("law", "OP07-047")])
      .withHand("p2", [
        instance("their-a", "ST32-004"),
        instance("their-b", "ST32-004"),
        instance("their-c", "ST32-004"),
        instance("their-d", "ST32-004"),
        instance("their-e", "ST32-004"),
        instance("their-f", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP07-047" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "law",
    );
    expect(game.state.players.p2.hand).toHaveLength(5);
    expect(game.state.players.p2.deck.at(-1)?.cardNumber).toBe("ST32-004");
  });

  it("is not offered against a hand of five", () => {
    const game = table("op07-047-small")
      .bareTable()
      .withBoard("p1", [character("law", "OP07-047")])
      .withHand("p2", [
        instance("their-a", "ST32-004"),
        instance("their-b", "ST32-004"),
        instance("their-c", "ST32-004"),
        instance("their-d", "ST32-004"),
        instance("their-e", "ST32-004"),
      ])
      .build();

    // Repeatable, so an offer that is only a self-bounce is one a rules agent
    // takes forever.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-047"),
        ),
    ).toBe(false);
  });
});

describe("OP07-048 Donquixote Doflamingo", () => {
  covers("OP07-048", "[Activate: Main]");

  it("spends two DON!! to reveal the top card and play a cheap Warlord", () => {
    const hit = table("op07-048")
      .bareTable()
      .withBoard("p1", [character("doflamingo", "OP07-048")])
      .withDeckTop("p1", [
        instance("warlord", "OP07-045"),
        instance("next", "ST32-004"),
      ])
      .build();

    hit.play({ type: "activate-main", summary: "OP07-048" });
    hit.play({ type: "resolve-effect", optionId: "warlord" });
    settleDeclining(hit);

    const played = hit.state.players.p1.board.find(
      (card) => card.instanceId === "warlord",
    );
    expect(played?.rested).toBe(true);
    expect(hit.state.players.p1.restedDon).toHaveLength(2);

    const miss = table("op07-048-miss")
      .bareTable()
      .withBoard("p1", [character("doflamingo", "OP07-048")])
      .withDeckTop("p1", [
        instance("blank", "ST32-004"),
        instance("next", "ST32-004"),
      ])
      .build();

    miss.play({ type: "activate-main", summary: "OP07-048" });
    settleDeclining(miss);
    // The revealed card goes to the bottom either way, which is the price of
    // the gamble.
    expect(miss.state.players.p1.deck.at(-1)?.instanceId).toBe("blank");
  });
});

describe("OP07-049 Buckin", () => {
  covers("OP07-049", "[On Play]");

  it("plays its printed partner out of hand, rested", () => {
    const game = table("op07-049")
      .bareTable()
      .withHand("p1", [
        instance("buckin", "OP07-049"),
        instance("weevil", "OP07-039"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-049" });
    game.play({ type: "resolve-effect", optionId: "weevil" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "weevil")!
        .rested,
    ).toBe(true);
  });
});

describe("OP07-050 Boa Sandersonia", () => {
  covers("OP07-050", "[On Play]");

  it("bounces a cheap Character once two Kuja bodies are out", () => {
    const wide = table("op07-050")
      .bareTable()
      .withHand("p1", [instance("sandersonia", "OP07-050")])
      .withBoard("p1", [
        character("kuja-a", "OP08-048"),
        character("kuja-b", "OP16-112"),
      ])
      .withBoard("p2", [character("small", "ST32-001")])
      .build();

    wide.play({ type: "play-card", cardNumber: "OP07-050" });
    wide.play({ type: "resolve-effect", optionId: "small" });
    settleDeclining(wide);
    expect(wide.state.players.p2.board).toHaveLength(0);

    const narrow = table("op07-050-narrow")
      .bareTable()
      .withHand("p1", [instance("sandersonia", "OP07-050")])
      .withBoard("p1", [character("kuja-a", "OP08-048")])
      .withBoard("p2", [character("small", "ST32-001")])
      .build();

    narrow.play({ type: "play-card", cardNumber: "OP07-050" });
    settleDeclining(narrow);
    // Sandersonia itself carries the type, so a board of one plus this body is
    // two -- which is why the closed gate needs a board of *one*.
    expect(narrow.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP07-051 Boa Hancock", () => {
  covers("OP07-051", "[On Play]");

  it("locks an attacker out and buries a 1-drop", () => {
    const game = table("op07-051")
      .bareTable()
      .withHand("p1", [instance("hancock", "OP07-051")])
      .withBoard("p2", [
        character("locked", "ST32-004"),
        character("small", "ST32-001"),
        character("luffy", "ST23-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-051" });
    // "Other than [Monkey.D.Luffy]" is printed on the lock, and the pool's
    // cheap Luffy is exactly the card it refuses.
    expect(effectOptions(game.state)).not.toContain("luffy");
    game.play({ type: "resolve-effect", optionId: "locked" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settleDeclining(game);

    // Read before the turn changes hands: `bareTable()` leaves p2 with an empty
    // deck, so the buried card is the card their next draw takes back.
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("small");
    game.pass();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "locked",
        ),
    ).toBe(false);
  });
});

describe("OP07-052 Boa Marigold", () => {
  covers("OP07-052", "[On Play]");

  it("buries a 2-drop once two Kuja bodies are out", () => {
    const game = table("op07-052")
      .bareTable()
      .withHand("p1", [instance("marigold", "OP07-052")])
      .withBoard("p1", [character("kuja-a", "OP08-048")])
      .withBoard("p2", [character("small", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-052" });
    game.play({ type: "resolve-effect", optionId: "small" });
    settleDeclining(game);

    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("small");
  });

  it("does nothing on a board that has no Kuja beside it", () => {
    const game = table("op07-052-narrow")
      .bareTable()
      .withHand("p1", [instance("marigold", "OP07-052")])
      .withBoard("p2", [character("small", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-052" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP07-053 Portgas.D.Ace", () => {
  covers("OP07-053", "[On Play]", "[Blocker]");

  it("draws two and puts two back at an end the player chooses", () => {
    const game = table("op07-053")
      .bareTable()
      .withHand("p1", [instance("ace", "OP07-053")])
      .withDeckTop("p1", [
        instance("draw-a", "OP01-016"),
        instance("draw-b", "ST31-003"),
        instance("rest", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-053" });
    expect(game.state.players.p1.hand).toHaveLength(2);
    settle(game);

    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(3);
  });
});

describe("OP07-054 Marguerite", () => {
  covers("OP07-054", "[On Play]", "[Blocker]");

  it("replaces itself and blocks", () => {
    const game = table("op07-054")
      .bareTable()
      .withHand("p1", [instance("marguerite", "OP07-054")])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-054" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
    const marguerite = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP07-054",
    )!;
    expect(hasKeyword(game.state, "p1", marguerite.instanceId, "Blocker")).toBe(
      true,
    );
  });
});

describe("OP07-055 Snake Dance", () => {
  covers("OP07-055", "[Counter]", "[Trigger]");

  it("adds 4000 and may pick one of its own bodies back up", () => {
    const game = defending("op07-055")
      .bareTable()
      .withHand("p1", [instance("snake", "OP07-055")])
      .withBoard("p1", [character("own", "OP07-050")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP07-055]" });
    game.play({ type: "resolve-effect", optionId: "own" });
    settleDeclining(game);

    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "own",
    );
  });

  it("trades one of its own for a bigger bounce off a Life card", () => {
    const game = triggerFrom("op07-055", "OP07-055", {
      board: [["own", "OP07-050"]],
      opponentBoard: [["theirs", "OP07-052"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "own" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    settleDeclining(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "own",
    );
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "theirs",
    );
  });
});

describe("OP07-057 Perfume Femur", () => {
  covers("OP07-057", "[Main]", "[Trigger]");

  it("buffs a Warlord and takes the opponent's [Blocker] out of the fight", () => {
    const game = table("op07-057")
      .bareTable()
      .withHand("p1", [instance("femur", "OP07-057")])
      .withBoard("p1", [character("mihawk", "OP07-044")])
      .withBoard("p2", [character("blocker", "OP07-054")])
      .build();

    game.play({ summary: "[OP07-057]" });
    game.play({ type: "resolve-effect", optionId: "mihawk" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "mihawk")).toBe(12_000);
    expect(hasKeyword(game.state, "p1", "mihawk", "Unblockable")).toBe(true);

    game.play({
      type: "attack",
      attackerInstanceId: "mihawk",
      targetInstanceId: "p2-leader",
    });
    // The printed sentence is a ban on what the *opponent* may activate, and
    // [Unblockable] is where the engine holds it.
    expect(game.legalActions().some((action) => action.type === "block")).toBe(
      false,
    );
  });

  it("draws off a Life card", () => {
    const game = triggerFrom("op07-057", "OP07-057");
    const before = game.state.players.p1.hand.length;
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);
    expect(game.state.players.p1.hand.length).toBe(before + 1);
  });
});

describe("OP07-058 Island of Women (Stage)", () => {
  covers("OP07-058", "[Activate: Main]");

  it("trades a card and its own rest for a Kuja body back in hand", () => {
    const game = table("op07-058")
      .bareTable()
      .withLeader("p1", "OP07-038")
      .withStage("p1", instance("island", "OP07-058"))
      .withHand("p1", [instance("fodder", "ST31-003")])
      .withBoard("p1", [character("kuja", "OP07-050")])
      .build();

    game.play({ type: "activate-main", summary: "OP07-058" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "kuja" });
    settleDeclining(game);

    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "kuja",
    );
  });

  it("is not offered behind a Leader without the type", () => {
    const game = table("op07-058-gated")
      .bareTable()
      .withStage("p1", instance("island", "OP07-058"))
      .withHand("p1", [instance("fodder", "ST31-003")])
      .withBoard("p1", [character("kuja", "OP07-050")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-058"),
        ),
    ).toBe(false);
  });
});

// --- Purple ------------------------------------------------------------------

/**
 * p1 behind on DON!! -- the gate thirteen of the set's twenty Purple cards
 * print -- with `spare` DON!! left in its DON!! deck for the clauses that add
 * from it.
 *
 * `bareTable()` puts all ten on both fields, which is a tie: the tie satisfies
 * the printed "equal to or less than", so the *closed* gate is the one a
 * position has to construct, and `donAhead` below is it.
 */
const donBehindTable = (seed: string, spare = 3) =>
  table(seed).bareTable().withDonDeck("p1", spare);

/** The mirror: p1 ahead on DON!!, so the same clauses do nothing. */
const donAheadTable = (seed: string) =>
  table(seed).bareTable().withDonDeck("p2", 4);

describe("OP07-059 Foxy (Leader)", () => {
  covers("OP07-059", "[When Attacking]");

  it("pays DON!! −3 to hold the opposing Leader and a Character down", () => {
    const game = table("op07-059")
      .bareTable()
      .withLeader("p1", "OP07-059")
      .withBoard("p1", [
        character("foxy-a", "OP07-069"),
        character("foxy-b", "OP07-069"),
        character("foxy-c", "OP07-069"),
      ])
      .withRestedLeader("p2")
      .withBoard("p2", [character("tired", "ST32-004", { rested: true })])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      // `bareTable()` empties both Life stacks, and an attack that connects at
      // zero Life ends the game before the Refresh Phase this asserts on.
      .withLife("p2", [instance("p2-life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "tired" });
    declineDefence(game);
    game.pass();

    // A Leader is in no zone and has no board entry, so the hold lives on the
    // player -- and this is the only printed clause in the pool that needs it.
    expect(game.state.players.p2.leaderRested).toBe(true);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "tired")!
        .rested,
    ).toBe(true);
  });

  it("holds nothing with only two {Foxy Pirates} bodies out", () => {
    const game = table("op07-059-narrow")
      .bareTable()
      .withLeader("p1", "OP07-059")
      .withBoard("p1", [
        character("foxy-a", "OP07-069"),
        character("foxy-b", "OP07-069"),
      ])
      .withRestedLeader("p2")
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .withLife("p2", [instance("p2-life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    payDonMinus(game);
    declineDefence(game);
    game.pass();

    // The DON!! is spent either way -- the printed cost comes before the gate.
    expect(game.state.players.p2.leaderRested).toBe(false);
  });
});

describe("OP07-060 Itomimizu", () => {
  covers("OP07-060", "[Activate: Main]");

  it("adds a rested DON!! while it is the only copy out", () => {
    const alone = table("op07-060")
      .bareTable()
      .withLeader("p1", "OP07-059")
      .withBoard("p1", [character("itomimizu", "OP07-060")])
      .withDonDeck("p1", 3)
      .build();

    alone.play({ type: "activate-main", summary: "OP07-060" });
    settleDeclining(alone);
    expect(alone.state.players.p1.restedDon).toHaveLength(1);

    const paired = table("op07-060-paired")
      .bareTable()
      .withLeader("p1", "OP07-059")
      .withBoard("p1", [
        character("itomimizu", "OP07-060"),
        character("second", "OP07-060"),
      ])
      .withDonDeck("p1", 3)
      .build();

    // "No other [Itomimizu]" is a count with the source excluded, so the second
    // copy switches both of them off.
    expect(
      paired
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-060"),
        ),
    ).toBe(false);
  });
});

describe("OP07-061 Vinsmoke Sanji", () => {
  covers("OP07-061", "[On Play]");

  it("pays DON!! −1 for a card behind the Germa Leader", () => {
    const game = table("op07-061")
      .bareTable()
      .withLeader("p1", "OP12-041")
      .withHand("p1", [instance("sanji", "OP07-061")])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-061" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("spends the DON!! and draws nothing behind another Leader", () => {
    const game = table("op07-061-gated")
      .bareTable()
      .withHand("p1", [instance("sanji", "OP07-061")])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-061" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    // The cost is printed before the gate, so paying it is not conditional on
    // the payout landing.
    expect(
      game.state.players.p1.hand.map((card) => card.instanceId),
    ).not.toContain("drawn");
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP07-062 Vinsmoke Reiju", () => {
  covers("OP07-062", "[On Play]");

  it("picks a Germa 1-drop back up while behind on DON!!", () => {
    const behind = donBehindTable("op07-062")
      .withHand("p1", [instance("reiju", "OP07-062")])
      .withBoard("p1", [character("germa", "OP10-063")])
      .build();

    behind.play({ type: "play-card", cardNumber: "OP07-062" });
    behind.play({ type: "resolve-effect", optionId: "germa" });
    settleDeclining(behind);
    expect(
      behind.state.players.p1.hand.map((card) => card.instanceId),
    ).toContain("germa");

    const ahead = donAheadTable("op07-062-ahead")
      .withHand("p1", [instance("reiju", "OP07-062")])
      .withBoard("p1", [character("germa", "OP10-063")])
      .build();

    ahead.play({ type: "play-card", cardNumber: "OP07-062" });
    settleDeclining(ahead);
    expect(
      ahead.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("germa");
  });
});

describe("OP07-063 Capote", () => {
  covers("OP07-063", "[On Play]");

  it("pays DON!! −1 to lock an attacker out behind the Foxy Leader", () => {
    const game = table("op07-063")
      .bareTable()
      .withLeader("p1", "OP07-059")
      .withHand("p1", [instance("capote", "OP07-063")])
      .withBoard("p2", [character("locked", "ST32-004")])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-063" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "locked" });
    settleDeclining(game);
    game.pass();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "locked",
        ),
    ).toBe(false);
  });
});

describe("OP07-064 Sanji", () => {
  covers("OP07-064", "static", "[Blocker]");

  it("costs three less while two DON!! behind, and six otherwise", () => {
    const behind = table("op07-064")
      .bareTable()
      .withDonDeck("p1", 4)
      .withHand("p1", [instance("sanji", "OP07-064")])
      .build();

    expect(
      behind
        .legalActions()
        .find(
          (action) =>
            action.type === "play-card" && action.summary.includes("Sanji"),
        )?.summary,
    ).toContain("cost 3 DON!!");

    const level = table("op07-064-level")
      .bareTable()
      .withHand("p1", [instance("sanji", "OP07-064")])
      .build();

    // "At least 2 less" is a margin, not a comparison against a constant: a tie
    // is not two behind, so the printed cost stands.
    expect(
      level
        .legalActions()
        .find(
          (action) =>
            action.type === "play-card" && action.summary.includes("Sanji"),
        )?.summary,
    ).toContain("cost 6 DON!!");
  });
});

describe("OP07-065 Gina", () => {
  covers("OP07-065", "[On Play]");

  it("adds an active DON!! behind the Foxy Leader while behind", () => {
    const game = donBehindTable("op07-065")
      .withLeader("p1", "OP07-059")
      .withHand("p1", [instance("gina", "OP07-065")])
      .build();

    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "play-card", cardNumber: "OP07-065" });
    settleDeclining(game);

    // The only ramp in the package that arrives active, which is what makes it
    // a 1-cost body that pays for itself the same turn.
    expect(game.state.players.p1.activeDon.length).toBe(before);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("adds nothing behind another Leader", () => {
    const game = donBehindTable("op07-065-gated")
      .withHand("p1", [instance("gina", "OP07-065")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-065" });
    settleDeclining(game);
    expect(game.state.players.p1.donDeck).toHaveLength(3);
  });
});

describe("OP07-066 Tony Tony.Chopper", () => {
  covers("OP07-066", "[On Play]", "[Blocker]");

  it("adds a rested DON!! while behind, ungated by the Leader", () => {
    const game = donBehindTable("op07-066")
      .withHand("p1", [instance("chopper", "OP07-066")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-066" });
    settleDeclining(game);

    expect(game.state.players.p1.restedDon).toHaveLength(3);
    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });
});

describe("OP07-068 Hamburg", () => {
  covers("OP07-068", "[When Attacking]");

  it("pays back a DON!! on the swing with a DON!! on it", () => {
    const game = donBehindTable("op07-068")
      .withBoard("p1", [character("hamburg", "OP07-068")])
      .withGivenDon("p1", "hamburg", 1)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "hamburg",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    expect(game.state.players.p1.donDeck).toHaveLength(2);
  });

  it("adds nothing without the DON!! its clause names", () => {
    const game = donBehindTable("op07-068-bare")
      .withBoard("p1", [character("hamburg", "OP07-068")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "hamburg",
      targetInstanceId: "p2-leader",
    });
    declineDefence(game);

    expect(game.state.players.p1.donDeck).toHaveLength(3);
  });
});

describe("OP07-069 Pickles", () => {
  covers("OP07-069", "static");

  it("makes its teammates unanswerable by an opposing K.O. while behind", () => {
    const behind = defending("op07-069")
      .bareTable()
      .withDonDeck("p1", 4)
      .withBoard("p1", [
        character("pickles", "OP07-069"),
        character("teammate", "OP07-060"),
      ])
      .withHand("p2", [instance("joseph", "OP07-092")])
      .withTrash("p2", [
        instance("cp-a", "OP09-038"),
        instance("cp-b", "OP09-038"),
      ])
      .build();

    // OP07-060 Itomimizu is a 3-cost body, so the K.O. that reaches it is
    // Joseph's cost-1 clause only after a debuff -- what this asserts is that
    // Pickles itself is not protected by its own clause.
    expect(
      behind.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("pickles");
  });

  it("protects a {Foxy Pirates} body from a K.O. and leaves itself open", () => {
    const behind = defending("op07-069-ko")
      .bareTable()
      .withDonDeck("p1", 4)
      .withBoard("p1", [
        character("pickles", "OP07-069"),
        character("gina", "OP07-065"),
      ])
      .withHand("p2", [instance("joseph", "OP07-092")])
      .withTrash("p2", [
        instance("cp-a", "OP09-038"),
        instance("cp-b", "OP09-038"),
      ])
      .build();

    behind.play({ type: "play-card", cardNumber: "OP07-092" });
    applyOptional(behind);
    behind.play({ type: "resolve-effect", optionId: "cp-a" });
    behind.play({ type: "resolve-effect", optionId: "cp-b" });
    settle(behind);
    expect(
      behind.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("gina");

    const ahead = defending("op07-069-ahead")
      .bareTable()
      .withDonDeck("p2", 4)
      .withBoard("p1", [
        character("pickles", "OP07-069"),
        character("gina", "OP07-065"),
      ])
      .withHand("p2", [instance("joseph", "OP07-092")])
      .withTrash("p2", [
        instance("cp-a", "OP09-038"),
        instance("cp-b", "OP09-038"),
      ])
      .build();

    ahead.play({ type: "play-card", cardNumber: "OP07-092" });
    applyOptional(ahead);
    ahead.play({ type: "resolve-effect", optionId: "cp-a" });
    ahead.play({ type: "resolve-effect", optionId: "cp-b" });
    ahead.play({ type: "resolve-effect", optionId: "gina" });
    settle(ahead);
    expect(
      ahead.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("gina");
  });
});

describe("OP07-070 Big Bun", () => {
  covers("OP07-070", "[On Play]");

  it("brings a {Foxy Pirates} card with it while behind", () => {
    const game = donBehindTable("op07-070")
      .withHand("p1", [
        instance("bigbun", "OP07-070"),
        instance("pickles", "OP07-069"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-070" });
    game.play({ type: "resolve-effect", optionId: "pickles" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("pickles");
  });
});

describe("OP07-071 Foxy", () => {
  covers("OP07-071", "[Activate: Main]", "[Opponent's Turn]");

  it("adds a rested DON!! once a turn, ungated", () => {
    const game = table("op07-071")
      .bareTable()
      .withBoard("p1", [character("foxy", "OP07-071")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "activate-main", summary: "OP07-071" });
    settleDeclining(game);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-071"),
        ),
    ).toBe(false);
  });

  it("shrinks the whole opposing board on the opponent's turn only", () => {
    // p1 is the player being asked about and p2 holds the Foxy, so
    // `[Opponent's Turn]` -- relative to Foxy's controller -- is p1's own turn.
    const onP1sTurn = table("op07-071-aura")
      .bareTable()
      .withLeader("p2", "OP07-059")
      .withBoard("p2", [character("foxy", "OP07-071")])
      .withBoard("p1", [character("victim", "ST32-004")])
      .build();
    expect(currentPower(onP1sTurn.state, "p1", "victim")).toBe(4_000);

    const onP2sTurn = defending("op07-071-own")
      .bareTable()
      .withLeader("p2", "OP07-059")
      .withBoard("p2", [character("foxy", "OP07-071")])
      .withBoard("p1", [character("victim", "ST32-004")])
      .build();
    expect(currentPower(onP2sTurn.state, "p1", "victim")).toBe(5_000);

    const behindAnother = table("op07-071-gated")
      .bareTable()
      .withBoard("p2", [character("foxy", "OP07-071")])
      .withBoard("p1", [character("victim", "ST32-004")])
      .build();
    expect(currentPower(behindAnother.state, "p1", "victim")).toBe(5_000);
  });
});

describe("OP07-072 Porche", () => {
  covers("OP07-072", "[On Play]");

  it("pays DON!! −1 for a dig and a free purple body", () => {
    const game = table("op07-072")
      .bareTable()
      .withHand("p1", [
        instance("porche", "OP07-072"),
        instance("cheap", "OP07-067"),
      ])
      .withDeckTop("p1", [
        instance("deck-a", "ST32-004"),
        instance("foxy", "OP07-069"),
        instance("deck-c", "ST32-004"),
        instance("deck-d", "ST32-004"),
        instance("deck-e", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-072" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "foxy" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "foxy",
    );
    // The play is printed after "place the rest at the bottom", so it is
    // sequenced after the search rather than nested in it.
    expect(
      game.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("cheap");
  });
});

describe("OP07-073 Monkey.D.Luffy", () => {
  covers("OP07-073", "[Activate: Main]");

  it("pays DON!! −3 to stand back up against a wide board", () => {
    const game = table("op07-073")
      .bareTable()
      .withBoard("p1", [character("luffy", "OP07-073", { rested: true })])
      .withBoard("p2", [
        character("a", "ST32-001"),
        character("b", "ST32-005"),
        character("c", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP07-073" });
    payDonMinus(game);
    settleDeclining(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "luffy")!
        .rested,
    ).toBe(false);
  });

  it("is not offered while it is already active", () => {
    const game = table("op07-073-active")
      .bareTable()
      .withBoard("p1", [character("luffy", "OP07-073")])
      .withBoard("p2", [
        character("a", "ST32-001"),
        character("b", "ST32-005"),
        character("c", "ST32-004"),
      ])
      .build();

    // Setting an active Character active buys nothing, and taking the offer
    // would spend three DON!! and the turn's one use.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-073"),
        ),
    ).toBe(false);
  });
});

describe("OP07-074 Monda", () => {
  covers("OP07-074", "[Activate: Main]");

  it("trades itself for a DON!! behind the Foxy Leader", () => {
    const game = table("op07-074")
      .bareTable()
      .withLeader("p1", "OP07-059")
      .withBoard("p1", [character("monda", "OP07-074")])
      .withDonDeck("p1", 3)
      .build();

    game.play({ type: "activate-main", summary: "OP07-074" });
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("is not offered behind another Leader", () => {
    const game = table("op07-074-gated")
      .bareTable()
      .withBoard("p1", [character("monda", "OP07-074")])
      .withDonDeck("p1", 3)
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-074"),
        ),
    ).toBe(false);
  });
});

describe("OP07-075 Slow-Slow Beam", () => {
  covers("OP07-075", "[Counter]");

  it("pays DON!! −1 to shrink the attacker's Leader and one Character", () => {
    const game = defending("op07-075")
      .bareTable()
      .withHand("p1", [instance("beam", "OP07-075")])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("spare", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP07-075]" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    game.play({ type: "resolve-effect", optionId: "attacker" });
    settleDeclining(game);

    // Not a Counter buff at all: the power moves on the attacker's side of the
    // table, which is why the entry adds nothing to the battle itself.
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(3_000);
    expect(currentPower(game.state, "p2", "attacker")).toBe(3_000);
  });
});

describe("OP07-076 Slow-Slow Beam Sword", () => {
  covers("OP07-076", "[Counter]", "[Trigger]");

  it("pays DON!! −1 for 2000 and a rest with no cost ceiling", () => {
    const game = defending("op07-076")
      .bareTable()
      .withHand("p1", [instance("sword", "OP07-076")])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("big", "OP07-089"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP07-076]" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "big" });
    settleDeclining(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "big")!
        .rested,
    ).toBe(true);
  });

  it("adds an active DON!! off a Life card", () => {
    const game = triggerFrom("op07-076", "OP07-076", { donDeck: 3 });
    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.activeDon.length).toBe(before + 1);
  });
});

describe("OP07-078 Megaton Nine-Tails Rush", () => {
  covers("OP07-078", "[Main]", "[Trigger]");

  it("sets a rested [Foxy] card active while behind on DON!!", () => {
    const game = donBehindTable("op07-078", 4)
      .withLeader("p1", "OP07-059")
      .withRestedLeader("p1")
      .withHand("p1", [instance("megaton", "OP07-078")])
      .build();

    game.play({ summary: "[OP07-078]" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settleDeclining(game);

    // `update` is what reaches `leaderRested`, which is where a Leader's rested
    // state lives -- the Leader is a legal target because the clause says
    // "cards" rather than "Characters".
    expect(game.state.players.p1.leaderRested).toBe(false);
  });

  it("adds an active DON!! off a Life card", () => {
    const game = triggerFrom("op07-078", "OP07-078", { donDeck: 3 });
    const before = game.state.players.p1.activeDon.length;
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.activeDon.length).toBe(before + 1);
  });
});

// --- Black -------------------------------------------------------------------

describe("OP07-079 Rob Lucci (Leader)", () => {
  covers("OP07-079", "[When Attacking]");

  it("trashes two off its own deck to shrink a Character's cost", () => {
    const game = table("op07-079")
      .bareTable()
      .withLeader("p1", "OP07-079")
      .withDeckTop("p1", [
        instance("mill-a", "ST32-004"),
        instance("mill-b", "ST32-004"),
        instance("mill-c", "ST32-004"),
      ])
      .withBoard("p2", [character("target", "ST32-004")])
      .withLife("p2", [instance("p2-life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "target" });
    declineDefence(game);

    // The mill is the point as much as the price: the whole Black package reads
    // the trash count back.
    expect(game.state.players.p1.trash).toHaveLength(2);
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

describe("OP07-080 Kaku", () => {
  covers("OP07-080", "[On Play]");

  it('buries two "CP" cards for the set\'s deepest cost debuff', () => {
    const game = table("op07-080")
      .bareTable()
      .withHand("p1", [instance("kaku", "OP07-080")])
      .withTrash("p1", [
        instance("cp-a", "OP09-038"),
        instance("cp-b", "OP09-038"),
        instance("other", "ST32-004"),
      ])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-080" });
    applyOptional(game);
    // Only the "CP" cards can pay: a trash full of anything else is a cost
    // this clause cannot buy.
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "cp-a" });
    game.play({ type: "resolve-effect", optionId: "cp-b" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find(
          (card) => card.instanceId === "target",
        )!,
      ),
    ).toBe(1);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });

  it('cannot buy the debuff out of a trash with one "CP" card', () => {
    const game = table("op07-080-broke")
      .bareTable()
      .withHand("p1", [instance("kaku", "OP07-080")])
      .withTrash("p1", [instance("cp-a", "OP09-038")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-080" });
    settleDeclining(game);

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

describe("OP07-081 Kalifa", () => {
  covers("OP07-081", "[Your Turn]");

  it("shrinks the whole opposing board's cost with a DON!! on it", () => {
    // Kalifa sits on p2's board and the question is asked about p1's cards, so
    // `[Your Turn]` -- relative to Kalifa's controller -- is p2's turn.
    const armed = defending("op07-081")
      .bareTable()
      .withBoard("p2", [character("kalifa", "OP07-081")])
      .withGivenDon("p2", "kalifa", 1)
      .withBoard("p1", [character("victim", "ST32-004")])
      .build();
    expect(
      effectiveCost(
        armed.state,
        "p1",
        armed.state.players.p1.board.find(
          (card) => card.instanceId === "victim",
        )!,
      ),
    ).toBe(3);

    const bare = defending("op07-081-bare")
      .bareTable()
      .withBoard("p2", [character("kalifa", "OP07-081")])
      .withBoard("p1", [character("victim", "ST32-004")])
      .build();
    expect(
      effectiveCost(
        bare.state,
        "p1",
        bare.state.players.p1.board.find(
          (card) => card.instanceId === "victim",
        )!,
      ),
    ).toBe(4);

    const offTurn = table("op07-081-off-turn")
      .bareTable()
      .withBoard("p2", [character("kalifa", "OP07-081")])
      .withGivenDon("p2", "kalifa", 1)
      .withBoard("p1", [character("victim", "ST32-004")])
      .build();
    expect(
      effectiveCost(
        offTurn.state,
        "p1",
        offTurn.state.players.p1.board.find(
          (card) => card.instanceId === "victim",
        )!,
      ),
    ).toBe(4);
  });
});

describe("OP07-082 Captain John and OP07-086 Spandam", () => {
  covers("OP07-082", "[On Play]");
  covers("OP07-086", "[On Play]");

  it("mill two and shrink one, at −1 and −2", () => {
    const mill = (seed: string, cardNumber: string) => {
      const game = table(seed)
        .bareTable()
        .withHand("p1", [instance("body", cardNumber)])
        .withDeckTop("p1", [
          instance(`${seed}-a`, "ST32-004"),
          instance(`${seed}-b`, "ST32-004"),
          instance(`${seed}-c`, "ST32-004"),
        ])
        .withBoard("p2", [character("target", "ST32-004")])
        .build();
      game.play({ type: "play-card", cardNumber });
      game.play({ type: "resolve-effect", optionId: "target" });
      settleDeclining(game);
      return game;
    };

    const john = mill("op07-082", "OP07-082");
    expect(john.state.players.p1.trash).toHaveLength(2);
    expect(
      effectiveCost(
        john.state,
        "p2",
        john.state.players.p2.board.find(
          (card) => card.instanceId === "target",
        )!,
      ),
    ).toBe(3);

    const spandam = mill("op07-086", "OP07-086");
    expect(
      effectiveCost(
        spandam.state,
        "p2",
        spandam.state.players.p2.board.find(
          (card) => card.instanceId === "target",
        )!,
      ),
    ).toBe(2);
  });
});

describe("OP07-083 Gecko Moria", () => {
  covers("OP07-083", "[Activate: Main]");

  it("buries four Thriller Bark cards for [Banish] and 1000 power", () => {
    const game = table("op07-083")
      .bareTable()
      .withBoard("p1", [character("moria", "OP07-083")])
      .withTrash("p1", [
        instance("tb-a", "OP14-101"),
        instance("tb-b", "OP14-101"),
        instance("tb-c", "OP14-101"),
        instance("tb-d", "OP14-101"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP07-083" });
    applyOptional(game);
    settle(game);

    expect(hasKeyword(game.state, "p1", "moria", "Banish")).toBe(true);
    expect(currentPower(game.state, "p1", "moria")).toBe(6_000);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });

  it("cannot pay out of a trash three deep", () => {
    const game = table("op07-083-broke")
      .bareTable()
      .withBoard("p1", [character("moria", "OP07-083")])
      .withTrash("p1", [
        instance("tb-a", "OP14-101"),
        instance("tb-b", "OP14-101"),
        instance("tb-c", "OP14-101"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP07-083" });
    settleDeclining(game);

    expect(hasKeyword(game.state, "p1", "moria", "Banish")).toBe(false);
    expect(currentPower(game.state, "p1", "moria")).toBe(5_000);
  });
});

describe("OP07-084 Gismonda", () => {
  covers("OP07-084", "[Blocker]");

  it("blocks", () => {
    const game = defending("op07-084")
      .bareTable()
      .withBoard("p1", [character("gismonda", "OP07-084")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ summary: "Block with Gismonda" });

    expect(game.state.activeAttack?.targetInstanceId).toBe("gismonda");
  });
});

describe("OP07-085 Stussy", () => {
  covers("OP07-085", "[On Play]");

  it("trades a body of its own for removal with no ceiling", () => {
    const game = table("op07-085")
      .bareTable()
      .withHand("p1", [instance("stussy", "OP07-085")])
      .withBoard("p1", [character("fodder", "ST31-003")])
      .withBoard("p2", [character("huge", "OP07-089")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-085" });
    applyOptional(game);
    // The Stussy just played is a legal cost too (Bandai's OP07-085#1): the
    // cost names any of its controller's Characters, with no exception.
    expect(effectOptions(game.state)).toContain(
      game.state.players.p1.board.find(
        (card) => card.cardNumber === "OP07-085",
      )!.instanceId,
    );
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "huge" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("with no other body of its own, trashes itself to buy the K.O.", () => {
    // Bandai's OP07-085#1: Stussy alone on the board can pay with itself.
    const game = table("op07-085-alone")
      .bareTable()
      .withHand("p1", [instance("stussy", "OP07-085")])
      .withBoard("p2", [character("huge", "OP07-089")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-085" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "stussy" });
    game.play({ type: "resolve-effect", optionId: "huge" });
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP07-087 Baskerville", () => {
  covers("OP07-087", "[Your Turn]");

  it("swings for 6000 once the opponent has a Character at cost 0", () => {
    const game = table("op07-087")
      .bareTable()
      .withBoard("p1", [character("baskerville", "OP07-087")])
      .withHand("p1", [instance("john", "OP07-082")])
      .withDeckTop("p1", [
        instance("mill-a", "ST32-004"),
        instance("mill-b", "ST32-004"),
      ])
      .withBoard("p2", [character("cheap", "ST32-001")])
      .build();

    expect(currentPower(game.state, "p1", "baskerville")).toBe(3_000);
    game.play({ type: "play-card", cardNumber: "OP07-082" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settleDeclining(game);

    // A 1-drop at −1 cost is the board the clause is written about, and the
    // set's own cost debuffs are what produce it.
    expect(currentPower(game.state, "p1", "baskerville")).toBe(6_000);
  });
});

describe("OP07-088 Hattori", () => {
  covers("OP07-088", "[On Play]", "[Your Turn]");

  it("buffs a [Rob Lucci] card", () => {
    const game = table("op07-088")
      .bareTable()
      .withHand("p1", [instance("hattori", "OP07-088")])
      .withBoard("p1", [
        character("lucci", "OP07-093"),
        character("other", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-088" });
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "lucci" });
    settle(game);

    expect(currentPower(game.state, "p1", "lucci")).toBe(8_000);
  });
});

describe("OP07-090 Morgans", () => {
  covers("OP07-090", "[On Play]");

  it("takes a card the opponent picks, shows their hand and gives one back", () => {
    const game = table("op07-090")
      .bareTable()
      .withHand("p1", [instance("morgans", "OP07-090")])
      .withHand("p2", [
        instance("their-a", "ST32-004"),
        instance("their-b", "ST32-001"),
      ])
      .withDeckTop("p2", [instance("their-draw", "ST32-005")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-090" });
    // The opponent picks which card goes, which is the rule for anything
    // trashed out of a hand -- so the decision is handed across the table.
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "their-a" });
    settleDeclining(game);

    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("their-a");
    // The draw is what keeps the opponent's card count where it was: the
    // reveal is the point rather than the discard.
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "their-draw",
    );
  });
});

describe("OP07-091 Monkey.D.Luffy", () => {
  covers("OP07-091", "[When Attacking]");

  it("trashes a small body, then buys power by the three", () => {
    const game = table("op07-091")
      .bareTable()
      .withBoard("p1", [character("luffy", "OP07-091")])
      .withTrash("p1", [
        instance("big-a", "ST32-004"),
        instance("big-b", "ST32-004"),
        instance("big-c", "ST32-004"),
        instance("big-d", "ST32-004"),
        instance("small", "ST32-001"),
      ])
      .withBoard("p2", [character("cheap", "ST32-001")])
      .withLife("p2", [instance("p2-life", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    // Only the cost-4-or-more Characters can be placed; the 1-drop in the same
    // trash is not eligible.
    expect(effectOptions(game.state)).not.toContain("small");
    game.play({ type: "resolve-effect", optionId: "big-a" });
    game.play({ type: "resolve-effect", optionId: "big-b" });
    game.play({ type: "resolve-effect", optionId: "big-c" });
    game.play({ type: "resolve-effect", optionId: "big-d" });
    settle(game);

    // Four cards is one completed three, so +1000 and not +4000. "Trash", not
    // "K.O.": the small body goes to the trash without being K.O.'d.
    expect(currentPower(game.state, "p1", "luffy")).toBe(7_000);
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("cheap");
    expect(game.state.players.p1.trash).toHaveLength(1);
  });
});

describe("OP07-092 Joseph", () => {
  covers("OP07-092", "[On Play]");

  it('buries two "CP" cards to kill a 1-drop', () => {
    const game = table("op07-092")
      .bareTable()
      .withHand("p1", [instance("joseph", "OP07-092")])
      .withTrash("p1", [
        instance("cp-a", "OP09-038"),
        instance("cp-b", "OP09-038"),
      ])
      .withBoard("p2", [
        character("cheap", "ST32-001"),
        character("big", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-092" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "cp-a" });
    game.play({ type: "resolve-effect", optionId: "cp-b" });
    expect(effectOptions(game.state)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("cheap");
  });
});

describe("OP07-093 Rob Lucci", () => {
  covers("OP07-093", "[On Play]");

  it("buries three of its own for a discard and a card out of their trash", () => {
    const game = table("op07-093")
      .bareTable()
      .withHand("p1", [instance("lucci", "OP07-093")])
      .withTrash("p1", [
        instance("mine-a", "ST32-004"),
        instance("mine-b", "ST32-004"),
        instance("mine-c", "ST32-004"),
      ])
      .withHand("p2", [instance("their-card", "ST32-004")])
      .withTrash("p2", [instance("their-trash", "ST32-001")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-093" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "mine-a" });
    game.play({ type: "resolve-effect", optionId: "mine-b" });
    game.play({ type: "resolve-effect", optionId: "mine-c" });
    game.play({ type: "resolve-effect", optionId: "their-card" });
    game.play({ type: "resolve-effect", optionId: "their-trash" });
    settleDeclining(game);

    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("their-card");
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("their-trash");
  });
});

describe("OP07-094 Shave", () => {
  covers("OP07-094", "[Counter]", "[Trigger]");

  it('adds 2000 and picks a "CP" body up off a deep trash', () => {
    const game = defending("op07-094")
      .bareTable()
      .withHand("p1", [instance("shave", "OP07-094")])
      .withTrash("p1", deepTrash("shave"))
      .withBoard("p1", [character("cp", "OP07-084")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP07-094]" });
    game.play({ type: "resolve-effect", optionId: "cp" });
    settleDeclining(game);

    expect(game.state.activeAttack?.counterPower).toBe(2_000);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "cp",
    );
  });

  it("returns a Character with no trash gate off a Life card", () => {
    const game = triggerFrom("op07-094", "OP07-094", {
      board: [["any", "ST32-004"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "any" });
    settleDeclining(game);

    // The Trigger is the wider half of the card: no type restriction and no
    // ten-card gate.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "any",
    );
  });
});

describe("OP07-095 Iron Body", () => {
  covers("OP07-095", "[Counter]", "[Trigger]");

  it("adds 6000 off a deep trash and 4000 otherwise", () => {
    const deep = defending("op07-095")
      .bareTable()
      .withHand("p1", [instance("iron", "OP07-095")])
      .withTrash("p1", deepTrash("iron"))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    deep.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(deep);
    deep.play({ summary: "[OP07-095]" });
    settleDeclining(deep);
    expect(deep.state.activeAttack?.counterPower).toBe(6_000);

    const shallow = defending("op07-095-shallow")
      .bareTable()
      .withHand("p1", [instance("iron", "OP07-095")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    shallow.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(shallow);
    shallow.play({ summary: "[OP07-095]" });
    settleDeclining(shallow);
    expect(shallow.state.activeAttack?.counterPower).toBe(4_000);
  });

  it("buffs a card for the turn off a Life card", () => {
    const game = triggerFrom("op07-095", "OP07-095", {
      board: [["body", "ST32-004"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "body")).toBe(6_000);
  });
});

describe("OP07-096 Tempest Kick", () => {
  covers("OP07-096", "[Main]", "[Trigger]");

  it("draws, and shrinks a cost off a deep trash", () => {
    const game = table("op07-096")
      .bareTable()
      .withHand("p1", [instance("kick", "OP07-096")])
      .withTrash("p1", deepTrash("kick"))
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ summary: "[OP07-096]" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
    expect(
      effectiveCost(
        game.state,
        "p2",
        game.state.players.p2.board.find(
          (card) => card.instanceId === "target",
        )!,
      ),
    ).toBe(1);
  });

  it("draws and stops there on a shallow trash", () => {
    const game = table("op07-096-shallow")
      .bareTable()
      .withHand("p1", [instance("kick", "OP07-096")])
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ summary: "[OP07-096]" });
    settleDeclining(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
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

  it("kills a cheap Character off a Life card", () => {
    const game = triggerFrom("op07-096", "OP07-096", {
      opponentBoard: [["cheap", "ST32-005"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("cheap");
  });
});

describe("OP07-118 Sabo", () => {
  covers("OP07-118", "[On Play]");

  it("spends a card from hand for two K.O.s at different ceilings", () => {
    const game = table("op07-118")
      .bareTable()
      .withHand("p1", [
        instance("sabo", "OP07-118"),
        instance("fodder", "ST31-003"),
      ])
      .withBoard("p2", [
        character("five", "ST32-004"),
        character("three", "ST31-003"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-118" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "five" });
    // `excludeBinding` is what stops the second, narrower choice taking the
    // body the first already answered.
    expect(effectOptions(game.state)).not.toContain("five");
    game.play({ type: "resolve-effect", optionId: "three" });
    settleDeclining(game);

    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

// --- Yellow ------------------------------------------------------------------

/** p1 down to `count` Life, which is what the whole Yellow package trades on. */
const lifeCards = (owner: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`${owner}-life-${index}`, "ST32-004"),
  );

describe("OP07-097 Vegapunk (Leader)", () => {
  covers("OP07-097", "[Activate: Main]", "static");

  it("cannot attack at all", () => {
    const game = table("op07-097-attack")
      .bareTable()
      .withLeader("p1", "OP07-097")
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" &&
            action.attackerInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });

  it("plays an {Egghead} card out of hand, or banks it face-up on Life", () => {
    const played = table("op07-097")
      .bareTable()
      .withLeader("p1", "OP07-097")
      .withHand("p1", [
        instance("vega", "OP07-108"),
        instance("expensive", "OP07-119"),
      ])
      .build();

    played.play({ type: "activate-main", summary: "OP07-097" });
    // "Cost 5 or less": the 10-cost body in the same hand is outside it.
    expect(effectOptions(played.state)).not.toContain("expensive");
    played.play({ type: "resolve-effect", optionId: "vega" });
    played.play({ type: "resolve-effect", optionId: "play" });
    settleDeclining(played);
    expect(
      played.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("vega");
    expect(played.state.players.p1.restedDon).toHaveLength(1);

    const banked = table("op07-097-life")
      .bareTable()
      .withLeader("p1", "OP07-097")
      .withHand("p1", [instance("vega", "OP07-108")])
      .build();

    banked.play({ type: "activate-main", summary: "OP07-097" });
    banked.play({ type: "resolve-effect", optionId: "vega" });
    banked.play({ type: "resolve-effect", optionId: "life" });
    settleDeclining(banked);
    // Face-up, so both players know what the next hit turns over.
    expect(banked.state.players.p1.life[0]?.instanceId).toBe("vega");
    expect(banked.state.players.p1.life[0]?.faceUp).toBe(true);
  });

  it("is not offered with no {Egghead} card in hand", () => {
    const game = table("op07-097-empty")
      .bareTable()
      .withLeader("p1", "OP07-097")
      .withHand("p1", [instance("other", "ST31-003")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-097"),
        ),
    ).toBe(false);
  });
});

describe("OP07-098 Atlas", () => {
  covers("OP07-098", "static", "[Trigger]");

  it("survives a lost fight while behind on Life, and not while level", () => {
    const behind = defending("op07-098")
      .bareTable()
      .withBoard("p1", [character("atlas", "OP07-098", { rested: true })])
      .withLife("p1", lifeCards("p1", 1))
      .withLife("p2", lifeCards("p2", 3))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    behind.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "atlas",
    });
    declineDefence(behind);
    expect(
      behind.state.players.p1.board.map((card) => card.instanceId),
    ).toContain("atlas");

    const level = defending("op07-098-level")
      .bareTable()
      .withBoard("p1", [character("atlas", "OP07-098", { rested: true })])
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 3))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    level.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "atlas",
    });
    declineDefence(level);
    expect(
      level.state.players.p1.board.map((card) => card.instanceId),
    ).not.toContain("atlas");
  });

  it("plays itself off a Life card behind [Vegapunk], and not behind another Leader", () => {
    const behindVegapunk = triggerFrom("op07-098", "OP07-098", {
      leader: "OP07-097",
    });
    behindVegapunk.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(behindVegapunk);
    expect(
      behindVegapunk.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP07-098");

    const behindAnother = triggerFrom("op07-098-gated", "OP07-098");
    // The gate is inside the program, and the engine withholds a Trigger whose
    // program would resolve to nothing -- so activating is not on the table.
    expect(
      behindAnother
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-trigger" && action.optionId === "activate",
        ),
    ).toBe(false);
  });
});

describe("OP07-099 Usopp", () => {
  covers("OP07-099", "[Trigger]");

  it("buffs an {Egghead} card past the end of the attacker's turn", () => {
    const game = triggerFrom("op07-099", "OP07-099", {
      board: [["vega", "OP07-108"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "vega" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "vega")).toBe(8_000);
  });
});

describe("OP07-100 Edison", () => {
  covers("OP07-100", "[On Play]", "[Trigger]");

  it("draws two and puts two back, from two Life or fewer", () => {
    const low = table("op07-100")
      .bareTable()
      .withHand("p1", [instance("edison", "OP07-100")])
      .withLife("p1", lifeCards("p1", 2))
      .withDeckTop("p1", [
        instance("draw-a", "OP01-016"),
        instance("draw-b", "ST31-003"),
      ])
      .build();

    low.play({ type: "play-card", cardNumber: "OP07-100" });
    expect(low.state.players.p1.hand).toHaveLength(2);
    settle(low);
    expect(low.state.players.p1.hand).toHaveLength(0);
    expect(low.state.players.p1.trash).toHaveLength(2);

    const high = table("op07-100-high")
      .bareTable()
      .withHand("p1", [instance("edison", "OP07-100")])
      .withLife("p1", lifeCards("p1", 3))
      .withDeckTop("p1", [instance("draw-a", "OP01-016")])
      .build();

    high.play({ type: "play-card", cardNumber: "OP07-100" });
    settleDeclining(high);
    expect(high.state.players.p1.hand).toHaveLength(0);
  });

  it("plays itself off a Life card behind [Vegapunk]", () => {
    const game = triggerFrom("op07-100", "OP07-100", { leader: "OP07-097" });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP07-100");
  });
});

describe("OP07-101 Shaka", () => {
  covers("OP07-101", "[Blocker]", "[Trigger]");

  it("arrives from Life as a Blocker behind [Vegapunk]", () => {
    const game = triggerFrom("op07-101", "OP07-101", { leader: "OP07-097" });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    const shaka = game.state.players.p1.board.find(
      (card) => card.cardNumber === "OP07-101",
    );
    expect(shaka).toBeDefined();
    expect(hasKeyword(game.state, "p1", shaka!.instanceId, "Blocker")).toBe(
      true,
    );
  });
});

describe("OP07-102 Jinbe", () => {
  covers("OP07-102", "[Trigger]");

  it("bounces a Character and keeps itself in hand", () => {
    const game = triggerFrom("op07-102", "OP07-102", {
      opponentBoard: [["theirs", "ST32-004"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "theirs" });
    settleDeclining(game);

    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toContain(
      "theirs",
    );
    // "Add this card to your hand": the Trigger's own card skips the usual trip
    // to the trash, so the Life card is a 5-cost body the deck still holds.
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-card",
    );
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).not.toContain("life-card");
  });
});

describe("OP07-103 Tony Tony.Chopper", () => {
  covers("OP07-103", "[Trigger]");

  it("hands [Blocker] to an {Egghead} body and keeps itself in hand", () => {
    const game = triggerFrom("op07-103", "OP07-103", {
      board: [["vega", "OP07-108"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "vega" });
    settleDeclining(game);

    expect(hasKeyword(game.state, "p1", "vega", "Blocker")).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "life-card",
    );
  });
});

describe("OP07-104 Nico Robin", () => {
  covers("OP07-104", "[Trigger]");

  it("draws two behind an {Egghead} Leader and nothing behind another", () => {
    const behindEgghead = triggerFrom("op07-104", "OP07-104", {
      leader: "OP07-097",
    });
    const before = behindEgghead.state.players.p1.hand.length;
    behindEgghead.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(behindEgghead);
    expect(behindEgghead.state.players.p1.hand.length).toBe(before + 2);

    const behindAnother = triggerFrom("op07-104-gated", "OP07-104");
    const start = behindAnother.state.players.p1.hand.length;
    behindAnother.play({ type: "resolve-trigger", optionId: "skip" });
    settleDeclining(behindAnother);
    // Declined: the card joins the hand as ordinary damage instead.
    expect(behindAnother.state.players.p1.hand.length).toBe(start + 1);
  });
});

describe("OP07-105 Pythagoras", () => {
  covers("OP07-105", "[On K.O.]", "[Trigger]");

  it("plays an {Egghead} body out of the trash when it dies at two Life", () => {
    const game = defending("op07-105")
      .bareTable()
      .withBoard("p1", [character("pythagoras", "OP07-105", { rested: true })])
      .withLife("p1", lifeCards("p1", 2))
      .withTrash("p1", [instance("vega", "OP07-108")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "pythagoras",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "vega" });
    settleDeclining(game);

    // A bare `[On K.O.]`, so losing a fight fires it -- which is the point of a
    // 5-cost 6000 in a deck that wants to be attacked.
    const vega = game.state.players.p1.board.find(
      (card) => card.instanceId === "vega",
    );
    expect(vega?.rested).toBe(true);
  });

  it("plays itself off a Life card behind [Vegapunk]", () => {
    const game = triggerFrom("op07-105", "OP07-105", { leader: "OP07-097" });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP07-105");
  });
});

describe("OP07-106 Fuza", () => {
  covers("OP07-106", "[When Attacking]");

  it("kills a cheap Character with a DON!! on it, from one Life", () => {
    const armed = table("op07-106")
      .bareTable()
      .withBoard("p1", [character("fuza", "OP07-106")])
      .withGivenDon("p1", "fuza", 1)
      .withLife("p1", lifeCards("p1", 1))
      .withLife("p2", lifeCards("p2", 2))
      .withBoard("p2", [character("cheap", "ST32-005")])
      .build();

    armed.play({
      type: "attack",
      attackerInstanceId: "fuza",
      targetInstanceId: "p2-leader",
    });
    armed.play({ type: "resolve-effect", optionId: "cheap" });
    declineDefence(armed);
    expect(
      armed.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("cheap");

    const highLife = table("op07-106-high")
      .bareTable()
      .withBoard("p1", [character("fuza", "OP07-106")])
      .withGivenDon("p1", "fuza", 1)
      .withLife("p1", lifeCards("p1", 3))
      .withLife("p2", lifeCards("p2", 2))
      .withBoard("p2", [character("cheap", "ST32-005")])
      .build();

    highLife.play({
      type: "attack",
      attackerInstanceId: "fuza",
      targetInstanceId: "p2-leader",
    });
    expect(highLife.state.pendingEffect).toBeNull();
  });
});

describe("OP07-109 Monkey.D.Luffy", () => {
  covers("OP07-109", "[Activate: Main]", "[Trigger]");

  it("trades itself for removal and a card, from two Life", () => {
    const game = table("op07-109")
      .bareTable()
      .withBoard("p1", [character("luffy", "OP07-109")])
      .withLife("p1", lifeCards("p1", 2))
      .withDeckTop("p1", [instance("drawn", "OP01-016")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({ type: "activate-main", summary: "OP07-109" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "drawn",
    );
  });

  it("is not offered above two Life", () => {
    const game = table("op07-109-high")
      .bareTable()
      .withBoard("p1", [character("luffy", "OP07-109")])
      .withLife("p1", lifeCards("p1", 3))
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" &&
            action.summary.includes("OP07-109"),
        ),
    ).toBe(false);
  });

  it("kills a cost-4 Character off a Life card", () => {
    const game = triggerFrom("op07-109", "OP07-109", {
      opponentBoard: [["target", "ST32-004"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "target" });
    settleDeclining(game);

    expect(
      game.state.players.p2.board.map((card) => card.instanceId),
    ).not.toContain("target");
  });
});

describe("OP07-110 York", () => {
  covers("OP07-110", "[On Play]", "[Trigger]");

  it("spends a Life card into hand for a K.O.", () => {
    const game = table("op07-110")
      .bareTable()
      .withHand("p1", [instance("york", "OP07-110")])
      .withLife("p1", lifeCards("p1", 3))
      .withBoard("p2", [character("cheap", "ST31-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-110" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-life-0" });
    game.play({ type: "resolve-effect", optionId: "cheap" });
    settleDeclining(game);

    // Paying with Life is not losing the card -- it joins the hand, which is
    // what damage would have done anyway.
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "p1-life-0",
    );
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("plays itself off a Life card behind [Vegapunk]", () => {
    const game = triggerFrom("op07-110", "OP07-110", { leader: "OP07-097" });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP07-110");
  });
});

describe("OP07-111 Lilith", () => {
  covers("OP07-111", "[On Play]", "[Trigger]");

  it("digs five for an {Egghead} card other than itself", () => {
    const game = table("op07-111")
      .bareTable()
      .withHand("p1", [instance("lilith", "OP07-111")])
      .withDeckTop("p1", [
        instance("deck-a", "ST32-004"),
        instance("vega", "OP07-108"),
        instance("second-lilith", "OP07-111"),
        instance("deck-d", "ST32-004"),
        instance("deck-e", "ST32-004"),
      ])
      .build();

    game.play({ type: "play-card", cardNumber: "OP07-111" });
    const options = effectOptions(game.state);
    expect(options).toContain("vega");
    expect(options).not.toContain("second-lilith");
    game.play({ type: "resolve-effect", optionId: "vega" });
    settle(game);

    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toContain(
      "vega",
    );
  });

  it("plays itself off a Life card behind [Vegapunk]", () => {
    const game = triggerFrom("op07-111", "OP07-111", { leader: "OP07-097" });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);
    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP07-111");
  });
});

describe("OP07-112 Lucy", () => {
  covers("OP07-112", "[When Attacking]");

  it("spends a Life card for a rest, and refills from one Life", () => {
    const game = table("op07-112")
      .bareTable()
      .withBoard("p1", [character("lucy", "OP07-112")])
      .withLife("p1", lifeCards("p1", 1))
      .withDeckTop("p1", [instance("refill", "OP01-016")])
      .withLife("p2", lifeCards("p2", 2))
      .withBoard("p2", [character("victim", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "lucy",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-life-0" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    applyOptional(game);
    settleDeclining(game);

    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")!
        .rested,
    ).toBe(true);
    // The refill is read *after* the payment, which is the printed order and is
    // why a player at two Life does not get it.
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toContain(
      "refill",
    );
  });

  it("is not offered with an empty Life stack", () => {
    const game = table("op07-112-broke")
      .bareTable()
      .withBoard("p1", [character("lucy", "OP07-112")])
      .withLife("p2", lifeCards("p2", 2))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "lucy",
      targetInstanceId: "p2-leader",
    });

    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP07-113 Roronoa Zoro", () => {
  covers("OP07-113", "[Trigger]");

  it("rests the attacking Leader behind an {Egghead} Leader", () => {
    const game = triggerFrom("op07-113", "OP07-113", { leader: "OP07-097" });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settleDeclining(game);

    // Off a Life card in the middle of their attack step, resting the Leader
    // costs the opponent the rest of the turn.
    expect(game.state.players.p2.leaderRested).toBe(true);
  });
});

describe("OP07-115 I Re-Quasar Helllp!!", () => {
  covers("OP07-115", "[Counter]", "[Trigger]");

  it("adds 3000 from two Life and nothing above", () => {
    const low = defending("op07-115")
      .bareTable()
      .withHand("p1", [instance("quasar", "OP07-115")])
      .withLife("p1", lifeCards("p1", 2))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    low.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(low);
    low.play({ summary: "[OP07-115]" });
    settleDeclining(low);
    expect(low.state.activeAttack?.counterPower).toBe(3_000);

    const high = defending("op07-115-high")
      .bareTable()
      .withHand("p1", [instance("quasar", "OP07-115")])
      .withLife("p1", lifeCards("p1", 4))
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();

    high.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(high);
    // `powerWhen` is read before the offer is made, so an Event that would add
    // nothing is never shown.
    expect(
      high.legalActions().some((action) => action.summary.includes("OP07-115")),
    ).toBe(false);
  });

  it("plays an {Egghead} body out of the trash off a Life card", () => {
    const game = triggerFrom("op07-115", "OP07-115", {
      trash: ["OP07-108"],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "op07-115-trash-0" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.map((card) => card.cardNumber),
    ).toContain("OP07-108");
  });
});

describe("OP07-116 Blaze Slice", () => {
  covers("OP07-116", "[Main]", "[Counter]", "[Trigger]");

  it("buffs a card and rests one across the table on the Main half", () => {
    const game = table("op07-116")
      .bareTable()
      .withHand("p1", [instance("blaze", "OP07-116")])
      .withBoard("p1", [character("body", "ST32-004")])
      .withBoard("p2", [character("victim", "ST32-004")])
      .withLife("p2", lifeCards("p2", 2))
      .build();

    game.play({ summary: "[OP07-116]" });
    game.play({ type: "resolve-effect", optionId: "body" });
    game.play({ type: "resolve-effect", optionId: "victim" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "body")).toBe(6_000);
    expect(
      game.state.players.p2.board.find((card) => card.instanceId === "victim")!
        .rested,
    ).toBe(true);
  });

  it("runs the same program on the Counter half", () => {
    const game = defending("op07-116-counter")
      .bareTable()
      .withHand("p1", [instance("blaze", "OP07-116")])
      .withBoard("p1", [character("body", "ST32-004")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p2", lifeCards("p2", 2))
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passToCounter(game);
    game.play({ summary: "[OP07-116]" });
    game.play({ type: "resolve-effect", optionId: "body" });
    settleDeclining(game);

    // The buff is turn-scoped rather than battle-scoped even here -- the
    // printed words are "during this turn" -- so it lands on the card rather
    // than on the battle's scalar.
    expect(currentPower(game.state, "p1", "body")).toBe(6_000);
    expect(game.state.activeAttack?.counterPower ?? 0).toBe(0);
  });

  it("rests a Character off a Life card", () => {
    const game = triggerFrom("op07-116", "OP07-116", {
      opponentBoard: [["victim", "ST32-004"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("OP07-116");
  });
});

describe("OP07-117 Egghead (Stage)", () => {
  covers("OP07-117", "[End of Your Turn]", "[Trigger]");

  it("sets an {Egghead} body active as the turn ends, at three Life or fewer", () => {
    const game = table("op07-117")
      .bareTable()
      .withStage("p1", instance("egghead", "OP07-117"))
      .withBoard("p1", [character("vega", "OP07-108", { rested: true })])
      .withLife("p1", lifeCards("p1", 3))
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();

    game.pass();
    game.play({ type: "resolve-effect", optionId: "vega" });
    settleDeclining(game);

    expect(
      game.state.players.p1.board.find((card) => card.instanceId === "vega")!
        .rested,
    ).toBe(false);
  });

  it("arrives from Life as a Stage rather than as a Character", () => {
    const game = triggerFrom("op07-117", "OP07-117");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settleDeclining(game);

    expect(game.state.players.p1.stage?.cardNumber).toBe("OP07-117");
    expect(game.state.players.p1.board).toHaveLength(0);
  });
});

describe("OP07-119 Portgas.D.Ace", () => {
  covers("OP07-119", "[On Play]");

  it("banks a card on Life, and reads the new total for its own [Rush]", () => {
    const stillLow = table("op07-119")
      .bareTable()
      .withHand("p1", [instance("ace", "OP07-119")])
      .withLife("p1", lifeCards("p1", 1))
      .withDeckTop("p1", [instance("banked", "OP01-016")])
      .build();

    stillLow.play({ type: "play-card", cardNumber: "OP07-119" });
    applyOptional(stillLow);
    settleDeclining(stillLow);

    expect(stillLow.state.players.p1.life).toHaveLength(2);
    const ace = stillLow.state.players.p1.board.find(
      (card) => card.cardNumber === "OP07-119",
    )!;
    expect(hasKeyword(stillLow.state, "p1", ace.instanceId, "Rush")).toBe(true);

    const pushedOver = table("op07-119-over")
      .bareTable()
      .withHand("p1", [instance("ace", "OP07-119")])
      .withLife("p1", lifeCards("p1", 2))
      .withDeckTop("p1", [instance("banked", "OP01-016")])
      .build();

    pushedOver.play({ type: "play-card", cardNumber: "OP07-119" });
    applyOptional(pushedOver);
    settleDeclining(pushedOver);

    // The order is printed and load-bearing: banking first is what can push the
    // player back over the ceiling.
    const over = pushedOver.state.players.p1.board.find(
      (card) => card.cardNumber === "OP07-119",
    )!;
    expect(pushedOver.state.players.p1.life).toHaveLength(3);
    expect(hasKeyword(pushedOver.state, "p1", over.instanceId, "Rush")).toBe(
      false,
    );
  });
});
