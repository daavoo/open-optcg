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
 * BOOSTER PACK -AWAKENING OF THE NEW ERA- [OP-05], as a whole-set import.
 *
 * `packages/cards/src/op05.ts` explains where the records come from; this file
 * holds the behaviour. Three identities were already in the pool as cards other
 * decks ship and stay with those decks' files: OP05-066 Jinbe and OP05-070
 * Fra-Nosuke (`test/st26.test.ts`) and OP05-077 Gamma Knife
 * (`test/op16-enel.test.ts`). Everything else in the set is here, including
 * the four engine seams it opened -- a Leader printing [Blocker] (OP05-022),
 * an extra turn (OP05-119), a continuous Refresh-Phase lock (OP05-040) and a
 * draw-by-effect watcher (OP05-053).
 *
 * ## Why no deck
 *
 * No shipped list plays these, so every position seats two starter decks and
 * puts the card under test in a zone with a `with*` setter, the documented
 * shape for a card outside a manifest. Where a clause is gated on a Leader the
 * pool would not otherwise seat, the position states that Leader and is paired
 * with the same play behind one that does not satisfy the gate.
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

/** Take the apply branch of an `optional` prompt, if one is open. */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
  }
};

/** Answer the "which DON!! goes back" prompt a `DON!! -N` cost opens. */
const payDonMinus = (game: Game) => {
  let guard = 0;
  while (
    game.state.pendingEffect &&
    effectOptions(game.state).some((id) => id.startsWith("return-don:"))
  ) {
    if (guard++ > 30) throw new Error("DON!! cost never settled");
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

/** Pass the block step and the Counter step, stopping at what comes after. */
const passDefence = (game: Game) => {
  let guard = 0;
  while (
    (game.state.phase === "block" || game.state.phase === "counter") &&
    !game.state.pendingEffect
  ) {
    if (guard++ > 20) throw new Error("battle never settled");
    game.pass();
  }
};

/** Life as named cards; `bareTable()` empties the deck `withLife(n)` draws from. */
const lifeCards = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`${prefix}-life-${index}`, "ST32-004"),
  );

/** N cards in the trash, for the Black clauses whose payoff is gated on one. */
const deepTrash = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    instance(`${prefix}-trash-${index}`, "ST32-004"),
  );

/** Whether an `[Activate: Main]` for `cardNumber` is on offer right now. */
const activationOffered = (game: Game, cardNumber: string): boolean =>
  game
    .legalActions()
    .some(
      (action) =>
        action.type === "activate-main" && action.summary.includes(cardNumber),
    );

const board = (game: Game, player: "p1" | "p2", instanceId: string) =>
  game.state.players[player].board.find(
    (card) => card.instanceId === instanceId,
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
    deckTop?: string[];
  } = {},
) => {
  const { leader, donDeck, hand, board, opponentBoard, trash, deckTop } =
    options;
  let built = defending(seed)
    .bareTable()
    .withLife("p1", [instance("life-card", cardNumber)])
    // `bareTable()` empties the deck, and a Trigger whose only effect is a draw
    // is judged inert against an empty one and never offered.
    .withDeckTop(
      "p1",
      (deckTop ?? ["ST32-004", "ST32-004", "ST32-004"]).map((number, index) =>
        instance(`${seed}-deck-${index}`, number),
      ),
    )
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

// --- Printed [Blocker]s -----------------------------------------------------

describe("printed [Blocker]s", () => {
  const blockers = [
    "OP05-013",
    "OP05-024",
    "OP05-030",
    "OP05-036",
    "OP05-047",
    "OP05-052",
    "OP05-055",
    "OP05-074",
    "OP05-085",
    "OP05-090",
    "OP05-091",
    "OP05-112",
    "OP05-113",
  ];
  for (const cardNumber of blockers) covers(cardNumber, "[Blocker]");

  it.each(blockers)("%s blocks", (cardNumber) => {
    const game = table(`blocker-${cardNumber}`)
      .bareTable()
      .withBoard("p1", [character("blocker", cardNumber)])
      .build();
    expect(hasKeyword(game.state, "p1", "blocker", "Blocker")).toBe(true);
  });
});

// --- Red ---------------------------------------------------------------------

describe("OP05-001 Sabo (Leader)", () => {
  covers("OP05-001", "[Opponent's Turn]");

  /** p2 swings a 7000 into p1's 5000 Hack, with Sabo leading p1. */
  const swingAtHack = (seed: string, leaderDon: number) => {
    const game = defending(seed)
      .bareTable()
      .withLeader("p1", "OP05-001")
      .withGivenDon("p1", "p1-leader", leaderDon)
      .withBoard("p1", [character("hack", "OP05-012", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "hack",
    });
    passDefence(game);
    return game;
  };

  it("shrinks a 5000 by 1000 instead of letting a lost battle K.O. it", () => {
    const game = swingAtHack("op05-001", 1);
    expect(effectOptions(game.state)).toContain("mechanic:hack:p1-leader");
    game.play({ type: "resolve-effect", optionId: "mechanic:hack:p1-leader" });
    settle(game);

    expect(board(game, "p1", "hack")).toBeDefined();
    expect(currentPower(game.state, "p1", "hack")).toBe(4_000);
    // Once per turn: a second fight the same turn finds no offer.
    expect(
      game.state.oncePerTurn.some((key) =>
        key.endsWith("p1-leader:replacement"),
      ),
    ).toBe(true);
  });

  it("is withheld with no DON!! on the Leader", () => {
    const game = swingAtHack("op05-001-bare", 0);
    expect(game.state.pendingEffect).toBeNull();
    expect(board(game, "p1", "hack")).toBeUndefined();
  });

  it("does not answer a body already under 5000", () => {
    const game = defending("op05-001-small")
      .bareTable()
      .withLeader("p1", "OP05-001")
      .withGivenDon("p1", "p1-leader", 1)
      .withBoard("p1", [character("kuween", "OP05-024", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "kuween",
    });
    passDefence(game);
    expect(game.state.pendingEffect).toBeNull();
    expect(board(game, "p1", "kuween")).toBeUndefined();
  });
});

describe("OP05-002 Belo Betty (Leader)", () => {
  covers("OP05-002", "[Activate: Main]");

  it("trashes a Revolutionary Army card to buff the Army and the Triggers", () => {
    const game = table("op05-002")
      .bareTable()
      .withLeader("p1", "OP05-002")
      .withHand("p1", [
        instance("hack", "OP05-012"),
        instance("filler", "ST32-004"),
      ])
      .withBoard("p1", [
        character("bunny", "OP05-013"),
        character("satori", "OP05-105"),
        character("rayleigh", "ST32-004"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP05-002" });
    // Only the {Revolutionary Army} card may pay.
    expect(effectOptions(game.state)).toContain("hack");
    expect(effectOptions(game.state)).not.toContain("filler");
    game.play({ type: "resolve-effect", optionId: "hack" });
    // Bunny Joe by type, Satori by its [Trigger]; Rayleigh is neither.
    expect(effectOptions(game.state)).toContain("bunny");
    expect(effectOptions(game.state)).toContain("satori");
    expect(effectOptions(game.state)).not.toContain("rayleigh");
    game.play({ type: "resolve-effect", optionId: "bunny" });
    game.play({ type: "resolve-effect", optionId: "satori" });
    settleDeclining(game);

    expect(currentPower(game.state, "p1", "bunny")).toBe(5_000);
    expect(currentPower(game.state, "p1", "satori")).toBe(8_000);
    expect(currentPower(game.state, "p1", "rayleigh")).toBe(5_000);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "hack",
    ]);
  });

  it("is not offered without a Revolutionary Army card to trash", () => {
    const game = table("op05-002-bare")
      .bareTable()
      .withLeader("p1", "OP05-002")
      .withHand("p1", [instance("filler", "ST32-004")])
      .build();
    expect(activationOffered(game, "OP05-002")).toBe(false);
  });
});

describe("OP05-003 Inazuma", () => {
  covers("OP05-003", "static");

  it("rushes only beside another 7000", () => {
    const beside = table("op05-003")
      .bareTable()
      .withBoard("p1", [
        character("inazuma", "OP05-003"),
        character("giant", "OP05-044"),
      ])
      .build();
    expect(hasKeyword(beside.state, "p1", "inazuma", "Rush")).toBe(true);

    const alone = table("op05-003-alone")
      .bareTable()
      .withBoard("p1", [character("inazuma", "OP05-003")])
      .withGivenDon("p1", "inazuma", 3)
      .build();
    // Its own 7000 does not count: "other than this Character".
    expect(hasKeyword(alone.state, "p1", "inazuma", "Rush")).toBe(false);
  });
});

describe("OP05-004 Emporio.Ivankov", () => {
  covers("OP05-004", "[Activate: Main]");

  it("plays a small Revolutionary Army body once it is a 7000", () => {
    const game = table("op05-004")
      .bareTable()
      .withBoard("p1", [character("ivankov", "OP05-004")])
      .withGivenDon("p1", "ivankov", 2)
      .withHand("p1", [
        instance("hack", "OP05-012"),
        instance("ivankov-two", "OP05-004"),
        instance("sabo", "OP05-007"),
      ])
      .build();

    game.play({ type: "activate-main", summary: "OP05-004" });
    // Another Ivankov is named out; Sabo is a 7000.
    expect(effectOptions(game.state)).toEqual(expect.arrayContaining(["hack"]));
    expect(effectOptions(game.state)).not.toContain("ivankov-two");
    expect(effectOptions(game.state)).not.toContain("sabo");
    game.play({ type: "resolve-effect", optionId: "hack" });
    settle(game);

    expect(board(game, "p1", "hack")).toBeDefined();
    expect(game.state.players.p1.activeDon).toHaveLength(8);
  });

  it("is not offered at 5000", () => {
    const game = table("op05-004-small")
      .bareTable()
      .withBoard("p1", [character("ivankov", "OP05-004")])
      .withHand("p1", [instance("hack", "OP05-012")])
      .build();
    expect(activationOffered(game, "OP05-004")).toBe(false);
  });
});

describe("OP05-005 Karasu", () => {
  covers("OP05-005", "[On Play]", "[When Attacking]");

  it("debuffs the opposing Leader on play behind a Revolutionary Army Leader", () => {
    const game = table("op05-005")
      .bareTable()
      .withLeader("p1", "OP05-001")
      .withHand("p1", [instance("karasu", "OP05-005")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-005" });
    expect(effectOptions(game.state)).toContain("p2-leader");
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    settle(game);
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(4_000);
  });

  it("does nothing on play behind another Leader", () => {
    const game = table("op05-005-off")
      .bareTable()
      .withHand("p1", [instance("karasu", "OP05-005")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-005" });
    expect(game.state.pendingEffect).toBeNull();
    expect(currentPower(game.state, "p2", "p2-leader")).toBe(5_000);
  });

  it("debuffs on attack once it is a 7000", () => {
    const game = table("op05-005-attack")
      .bareTable()
      .withBoard("p1", [character("karasu", "OP05-005")])
      .withGivenDon("p1", "karasu", 2)
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "karasu",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(currentPower(game.state, "p2", "wall")).toBe(4_000);
  });
});

describe("OP05-006 Koala", () => {
  covers("OP05-006", "[On Play]");

  it("takes 3000 off one Character behind a Revolutionary Army Leader", () => {
    const game = table("op05-006")
      .bareTable()
      .withLeader("p1", "OP05-002")
      .withHand("p1", [instance("koala", "OP05-006")])
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-006" });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(currentPower(game.state, "p2", "wall")).toBe(2_000);
  });
});

describe("OP05-007 Sabo", () => {
  covers("OP05-007", "[On Play]");

  it("K.O.s two bodies whose power adds to 4000 or less", () => {
    const game = table("op05-007")
      .bareTable()
      .withHand("p1", [instance("sabo", "OP05-007")])
      .withBoard("p2", [
        character("kuween", "OP05-024"),
        character("bunny", "OP05-013"),
        character("hack", "OP05-012"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-007" });
    // 5000 alone is over the budget.
    expect(effectOptions(game.state)).not.toContain("hack");
    game.play({ type: "resolve-effect", optionId: "kuween" });
    // 2000 + 2000 fits; nothing else does.
    expect(effectOptions(game.state)).toContain("bunny");
    game.play({ type: "resolve-effect", optionId: "bunny" });
    settleDeclining(game);

    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "hack",
    ]);
  });
});

describe("OP05-008 Chaka", () => {
  covers("OP05-008", "[Activate: Main]");

  it("moves two rested DON!! onto a card while it carries a DON!!", () => {
    const game = table("op05-008")
      .bareTable()
      .withBoard("p1", [character("chaka", "OP05-008")])
      .withDon("p1", { rested: 3 })
      .withGivenDon("p1", "chaka", 1)
      .build();
    game.play({ type: "activate-main", summary: "OP05-008" });
    game.play({ type: "resolve-effect", optionId: "chaka" });
    settle(game);

    expect(board(game, "p1", "chaka")!.attachedDon).toHaveLength(3);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("is not offered without a DON!! on Chaka", () => {
    const game = table("op05-008-bare")
      .bareTable()
      .withBoard("p1", [character("chaka", "OP05-008")])
      .withDon("p1", { rested: 3 })
      .build();
    expect(activationOffered(game, "OP05-008")).toBe(false);
  });
});

describe("OP05-009 Toh-Toh", () => {
  covers("OP05-009", "[On Play]");

  it("draws only while the Leader has been debuffed to nothing", () => {
    const debuffed = table("op05-009")
      .bareTable()
      .withHand("p1", [instance("tohtoh", "OP05-009")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .withState((state) => {
        state.players.p1.leaderPowerModifiers.push({
          amount: -5_000,
          expiresAtTurn: state.turn,
        });
      })
      .build();
    debuffed.play({ type: "play-card", cardNumber: "OP05-009" });
    expect(
      debuffed.state.players.p1.hand.map((card) => card.instanceId),
    ).toEqual(["draw"]);

    const whole = table("op05-009-whole")
      .bareTable()
      .withHand("p1", [instance("tohtoh", "OP05-009")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();
    whole.play({ type: "play-card", cardNumber: "OP05-009" });
    expect(whole.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP05-010 Nico Robin", () => {
  covers("OP05-010", "[On Play]");

  it("K.O.s a 1000 and nothing bigger", () => {
    const game = table("op05-010")
      .bareTable()
      .withHand("p1", [instance("robin", "OP05-010")])
      .withBoard("p2", [
        character("baby", "OP05-033"),
        character("kuween", "OP05-024"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-010" });
    expect(effectOptions(game.state)).not.toContain("kuween");
    game.play({ type: "resolve-effect", optionId: "baby" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "kuween",
    ]);
  });
});

describe("OP05-011 Bartholomew Kuma", () => {
  covers("OP05-011", "[On Play]", "[Trigger]");

  it("K.O.s a 2000 on play", () => {
    const game = table("op05-011")
      .bareTable()
      .withHand("p1", [instance("kuma", "OP05-011")])
      .withBoard("p2", [character("kuween", "OP05-024")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-011" });
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("arrives off Life behind a multicolour Leader, and not behind a mono one", () => {
    const multi = triggerFrom("op05-011-trigger", "OP05-011", {
      leader: "OP05-001",
    });
    multi.play({ type: "resolve-trigger", optionId: "activate" });
    settle(multi);
    expect(multi.state.players.p1.board.map((card) => card.cardNumber)).toEqual(
      ["OP05-011"],
    );

    // Behind a mono-colour Leader the gate is closed, the program is judged
    // inert, and the only offer is to take the card into hand.
    const mono = triggerFrom("op05-011-mono", "OP05-011");
    expect(
      mono
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-trigger" && action.optionId === "activate",
        ),
    ).toBe(false);
    mono.play({ type: "resolve-trigger", optionId: "skip" });
    expect(mono.state.players.p1.board).toHaveLength(0);
    expect(mono.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP05-011",
    ]);
  });
});

describe("OP05-014 Pell", () => {
  covers("OP05-014", "[When Attacking]");

  it("debuffs a Character on attack only with a DON!! on it", () => {
    const armed = table("op05-014")
      .bareTable()
      .withBoard("p1", [character("pell", "OP05-014")])
      .withGivenDon("p1", "pell", 1)
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    armed.play({
      type: "attack",
      attackerInstanceId: "pell",
      targetInstanceId: "p2-leader",
    });
    armed.play({ type: "resolve-effect", optionId: "wall" });
    expect(currentPower(armed.state, "p2", "wall")).toBe(3_000);

    const bare = table("op05-014-bare")
      .bareTable()
      .withBoard("p1", [character("pell", "OP05-014")])
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    bare.play({
      type: "attack",
      attackerInstanceId: "pell",
      targetInstanceId: "p2-leader",
    });
    expect(bare.state.pendingEffect).toBeNull();
    expect(currentPower(bare.state, "p2", "wall")).toBe(5_000);
  });
});

describe("OP05-015 Belo Betty", () => {
  covers("OP05-015", "[On Play]");

  it("digs five for a Revolutionary Army card other than another Betty", () => {
    const game = table("op05-015")
      .bareTable()
      .withHand("p1", [instance("betty", "OP05-015")])
      .withDeckTop("p1", [
        instance("betty-two", "OP05-015"),
        instance("hack", "OP05-012"),
        instance("a", "ST32-004"),
        instance("b", "ST32-004"),
        instance("c", "ST32-004"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-015" });
    expect(effectOptions(game.state)).toContain("hack");
    expect(effectOptions(game.state)).not.toContain("betty-two");
    game.play({ type: "resolve-effect", optionId: "hack" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hack",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(4);
  });
});

describe("OP05-016 Morley", () => {
  covers("OP05-016", "[When Attacking]", "[Trigger]");

  it("switches Blockers off for the battle once it is a 7000", () => {
    const game = table("op05-016")
      .bareTable()
      .withBoard("p1", [character("morley", "OP05-016")])
      .withGivenDon("p1", "morley", 2)
      .withBoard("p2", [character("kuween", "OP05-024")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "morley",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.phase).toBe("block");
    expect(
      game.legalActions("p2").some((action) => action.type === "block"),
    ).toBe(false);
  });

  it("arrives off Life for a hand card behind a multicolour Leader", () => {
    const game = triggerFrom("op05-016-trigger", "OP05-016", {
      leader: "OP05-001",
      hand: ["ST32-004"],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP05-016",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP05-017 Lindbergh", () => {
  covers("OP05-017", "[When Attacking]", "[Trigger]");

  it("K.O.s a 3000 on attack once it is a 7000", () => {
    const game = table("op05-017")
      .bareTable()
      .withBoard("p1", [character("lindbergh", "OP05-017")])
      .withGivenDon("p1", "lindbergh", 2)
      .withBoard("p2", [
        character("kuween", "OP05-024"),
        character("wall", "ST32-004"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "lindbergh",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state)).not.toContain("wall");
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "wall",
    ]);
  });

  it("is not offered off Life behind a mono-colour Leader", () => {
    const game = triggerFrom("op05-017-mono", "OP05-017", {
      hand: ["ST32-004"],
    });
    // Judged inert -- the gate is closed -- so the only offer is the skip.
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "resolve-trigger" && action.optionId === "activate",
        ),
    ).toBe(false);
    game.play({ type: "resolve-trigger", optionId: "skip" });
    expect(game.state.players.p1.board).toHaveLength(0);
    expect(game.state.players.p1.hand).toHaveLength(2);
  });
});

describe("OP05-018 Emporio Energy Hormone", () => {
  covers("OP05-018", "[Counter]", "[Trigger]");

  it("adds 3000 and plays a small Revolutionary Army body from the Counter step", () => {
    const game = defending("op05-018")
      .bareTable()
      .withHand("p1", [
        instance("hormone", "OP05-018"),
        instance("hack", "OP05-012"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP05-018" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    settle(game);
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(board(game, "p1", "hack")).toBeDefined();
  });

  it("plays the body off Life too", () => {
    const game = triggerFrom("op05-018-trigger", "OP05-018", {
      hand: ["OP05-012"],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP05-012",
    ]);
  });
});

describe("OP05-019 Fire Fist", () => {
  covers("OP05-019", "[Main]", "[Trigger]");

  it("debuffs 4000 and, at two Life, K.O.s what is left at 0", () => {
    const game = table("op05-019")
      .bareTable()
      .withHand("p1", [instance("fist", "OP05-019")])
      .withBoard("p2", [character("hack", "OP05-012")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({ summary: "[OP05-019]" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(currentPower(game.state, "p2", "hack")).toBe(1_000);
    // 1000 is not 0: the K.O. finds nothing, so nothing is asked.
    expect(game.state.pendingEffect).toBeNull();

    const zero = table("op05-019-zero")
      .bareTable()
      .withHand("p1", [instance("fist", "OP05-019")])
      .withBoard("p2", [character("kuween", "OP05-024")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    zero.play({ summary: "[OP05-019]" });
    zero.play({ type: "resolve-effect", optionId: "kuween" });
    zero.play({ type: "resolve-effect", optionId: "kuween" });
    expect(zero.state.players.p2.board).toHaveLength(0);
  });

  it("keeps the K.O. behind the Life gate", () => {
    const game = table("op05-019-life")
      .bareTable()
      .withHand("p1", [instance("fist", "OP05-019")])
      .withBoard("p2", [character("kuween", "OP05-024")])
      .withLife("p1", lifeCards("p1", 3))
      .build();
    game.play({ summary: "[OP05-019]" });
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.board).toHaveLength(1);
  });

  it("runs the same clause off Life", () => {
    const game = triggerFrom("op05-019-trigger", "OP05-019", {
      opponentBoard: [["wall", "ST32-004"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "wall" });
    settleDeclining(game);
    expect(currentPower(game.state, "p2", "wall")).toBe(1_000);
  });
});

describe("OP05-020 Four Thousand-Brick Fist", () => {
  covers("OP05-020", "[Main]", "[Trigger]");

  it("buffs one of its own cards and K.O.s a 2000", () => {
    const game = table("op05-020")
      .bareTable()
      .withHand("p1", [instance("fist", "OP05-020")])
      .withBoard("p1", [character("body", "ST32-004")])
      .withBoard("p2", [character("kuween", "OP05-024")])
      .build();
    game.play({ summary: "[OP05-020]" });
    game.play({ type: "resolve-effect", optionId: "body" });
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(currentPower(game.state, "p1", "body")).toBe(7_000);
    expect(game.state.players.p2.board).toHaveLength(0);
  });

  it("buffs by 1000 off Life", () => {
    const game = triggerFrom("op05-020-trigger", "OP05-020");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    settleDeclining(game);
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(6_000);
  });
});

describe("OP05-021 Revolutionary Army HQ (Stage)", () => {
  covers("OP05-021", "[Activate: Main]");

  it("trashes a hand card and rests itself for a three-deep look", () => {
    const game = table("op05-021")
      .bareTable()
      .withStage("p1", instance("hq", "OP05-021"))
      .withHand("p1", [instance("filler", "ST32-004")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("hack", "OP05-012"),
        instance("b", "ST32-004"),
      ])
      .build();
    game.play({ type: "activate-main", summary: "OP05-021" });
    game.play({ type: "resolve-effect", optionId: "filler" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    settle(game);
    expect(game.state.players.p1.stage?.rested).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "hack",
    ]);
    expect(activationOffered(game, "OP05-021")).toBe(false);
  });
});

// --- Green -------------------------------------------------------------------

describe("OP05-022 Donquixote Rosinante (Leader)", () => {
  covers("OP05-022", "[Blocker]", "[End of Your Turn]");

  it("blocks with the Leader, taking the attack onto itself", () => {
    const game = defending("op05-022")
      .bareTable()
      .withLeader("p1", "OP05-022")
      .withBoard("p1", [character("body", "OP05-024", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "p1-leader",
        ),
    ).toBe(true);
    game.play({ type: "block", blockerInstanceId: "p1-leader" });

    expect(game.state.players.p1.leaderRested).toBe(true);
    expect(game.state.activeAttack?.targetInstanceId).toBe("p1-leader");
    declineDefence(game);
    // A 5000 into a 5000 Leader: the Leader takes the hit, the body lives.
    expect(board(game, "p1", "body")).toBeDefined();
    expect(game.state.players.p1.life).toHaveLength(1);
  });

  it("is not offered when the Leader is already the target, or is rested", () => {
    const targeted = defending("op05-022-targeted")
      .bareTable()
      .withLeader("p1", "OP05-022")
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    targeted.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    expect(
      targeted.legalActions().some((action) => action.type === "block"),
    ).toBe(false);

    const rested = defending("op05-022-rested")
      .bareTable()
      .withLeader("p1", "OP05-022")
      .withRestedLeader("p1")
      .withBoard("p1", [character("body", "OP05-024", { rested: true })])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    rested.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    expect(
      rested
        .legalActions()
        .some(
          (action) =>
            action.type === "block" && action.blockerInstanceId === "p1-leader",
        ),
    ).toBe(false);
  });

  it("stands back up at the end of its turn while the hand is at six or fewer", () => {
    const small = table("op05-022-eot")
      .bareTable()
      .withLeader("p1", "OP05-022")
      .withRestedLeader("p1")
      .withHand("p1", lifeCards("hand", 6))
      .build();
    small.pass();
    expect(small.state.players.p1.leaderRested).toBe(false);

    const full = table("op05-022-eot-full")
      .bareTable()
      .withLeader("p1", "OP05-022")
      .withRestedLeader("p1")
      .withHand("p1", lifeCards("hand", 7))
      .build();
    full.pass();
    expect(full.state.players.p1.leaderRested).toBe(true);
  });
});

describe("OP05-023 Vergo", () => {
  covers("OP05-023", "[When Attacking]");

  it("K.O.s a rested cost-3 on attack with a DON!! on it", () => {
    const game = table("op05-023")
      .bareTable()
      .withBoard("p1", [character("vergo", "OP05-023")])
      .withGivenDon("p1", "vergo", 1)
      .withBoard("p2", [
        character("rested", "OP05-024", { rested: true }),
        character("active", "OP05-024"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "vergo",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state)).not.toContain("active");
    game.play({ type: "resolve-effect", optionId: "rested" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "active",
    ]);
  });
});

describe("OP05-025 Gladius", () => {
  covers("OP05-025", "[Activate: Main]");

  it("rests itself to rest a cost-3 Character, once", () => {
    const game = table("op05-025")
      .bareTable()
      .withBoard("p1", [character("gladius", "OP05-025")])
      .withBoard("p2", [character("hack", "OP05-012")])
      .build();
    game.play({ type: "activate-main", summary: "OP05-025" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(board(game, "p1", "gladius")!.rested).toBe(true);
    expect(board(game, "p2", "hack")!.rested).toBe(true);
    expect(activationOffered(game, "OP05-025")).toBe(false);
  });
});

describe("OP05-026 Sarquiss", () => {
  covers("OP05-026", "[When Attacking]");

  it("rests a cost-3 teammate to stand back up mid-attack", () => {
    const game = table("op05-026")
      .bareTable()
      .withBoard("p1", [
        character("sarquiss", "OP05-026"),
        character("hack", "OP05-012"),
        character("kuween", "OP05-024"),
      ])
      .withGivenDon("p1", "sarquiss", 1)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "sarquiss",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    expect(effectOptions(game.state)).not.toContain("kuween");
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(board(game, "p1", "hack")!.rested).toBe(true);
    expect(board(game, "p1", "sarquiss")!.rested).toBe(false);
  });
});

describe("OP05-027 Trafalgar Law", () => {
  covers("OP05-027", "[Activate: Main]");

  it("trashes itself to rest a cost-3 Character", () => {
    const game = table("op05-027")
      .bareTable()
      .withBoard("p1", [character("law", "OP05-027")])
      .withBoard("p2", [character("hack", "OP05-012")])
      .build();
    game.play({ type: "activate-main", summary: "OP05-027" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(board(game, "p1", "law")).toBeUndefined();
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "law",
    ]);
    expect(board(game, "p2", "hack")!.rested).toBe(true);
  });
});

describe("OP05-028 Donquixote Doflamingo", () => {
  covers("OP05-028", "[Activate: Main]");

  it("trashes itself to K.O. a rested cost-2", () => {
    const game = table("op05-028")
      .bareTable()
      .withBoard("p1", [character("doffy", "OP05-028")])
      .withBoard("p2", [
        character("rested", "OP05-024", { rested: true }),
        character("active", "OP05-024"),
      ])
      .build();
    game.play({ type: "activate-main", summary: "OP05-028" });
    expect(effectOptions(game.state)).not.toContain("active");
    game.play({ type: "resolve-effect", optionId: "rested" });
    expect(board(game, "p1", "doffy")).toBeUndefined();
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "active",
    ]);
  });
});

describe("OP05-029 Donquixote Doflamingo", () => {
  covers("OP05-029", "[On Your Opponent's Attack]");

  it("rests a DON!! to rest a cost-6 on the attacker's side", () => {
    const game = defending("op05-029")
      .bareTable()
      .withBoard("p1", [character("doffy", "OP05-029")])
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
    game.play({ type: "resolve-effect", optionId: "spare" });
    settleDeclining(game);
    expect(board(game, "p2", "spare")!.rested).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("OP05-030 Donquixote Rosinante", () => {
  covers("OP05-030", "[Opponent's Turn]");

  it("trashes itself so a rested teammate survives a lost battle", () => {
    const game = defending("op05-030")
      .bareTable()
      .withBoard("p1", [
        character("rosinante", "OP05-030"),
        character("body", "ST32-004", { rested: true }),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "body",
    });
    passDefence(game);
    expect(effectOptions(game.state)).toContain("mechanic:body:rosinante");
    game.play({ type: "resolve-effect", optionId: "mechanic:body:rosinante" });
    settle(game);
    expect(board(game, "p1", "body")).toBeDefined();
    expect(board(game, "p1", "rosinante")).toBeUndefined();
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "rosinante",
    ]);
  });

  it("does not answer for an active teammate", () => {
    // An active body cannot be attacked, so the removal is an effect: O-Robi's
    // eight-DON!! K.O. on a cost-3-or-less Character.
    const game = defending("op05-030-active")
      .bareTable()
      .withBoard("p1", [
        character("rosinante", "OP05-030"),
        character("body", "OP05-024"),
      ])
      .withHand("p2", [instance("robi", "OP05-063")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-063" });
    game.play({ type: "resolve-effect", optionId: "body" });
    expect(game.state.pendingEffect).toBeNull();
    expect(board(game, "p1", "body")).toBeUndefined();
    expect(board(game, "p1", "rosinante")).toBeDefined();
  });
});

describe("OP05-031 Buffalo", () => {
  covers("OP05-031", "[When Attacking]");

  it("stands a rested 1-cost up once two Characters are rested", () => {
    const game = table("op05-031")
      .bareTable()
      .withBoard("p1", [
        character("buffalo", "OP05-031"),
        character("baby", "OP05-033", { rested: true }),
        character("kuween", "OP05-024", { rested: true }),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "buffalo",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state)).not.toContain("kuween");
    game.play({ type: "resolve-effect", optionId: "baby" });
    expect(board(game, "p1", "baby")!.rested).toBe(false);
  });
});

describe("OP05-032 Pica", () => {
  covers("OP05-032", "[End of Your Turn]");

  it("rests a DON!! at the end of the turn to stand up", () => {
    const game = table("op05-032")
      .bareTable()
      .withBoard("p1", [character("pica", "OP05-032", { rested: true })])
      .build();
    game.pass();
    applyOptional(game);
    settle(game);
    expect(board(game, "p1", "pica")!.rested).toBe(false);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });

  it("rests another cost-3 body instead of dying", () => {
    const game = defending("op05-032-replace")
      .bareTable()
      .withBoard("p1", [
        character("pica", "OP05-032", { rested: true }),
        character("hack", "OP05-012"),
        character("pica-two", "OP05-032"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "pica",
    });
    passDefence(game);
    game.play({ type: "resolve-effect", optionId: "mechanic:pica:pica" });
    // Another Pica is named out; Hack pays.
    expect(effectOptions(game.state)).not.toContain("pica-two");
    game.play({ type: "resolve-effect", optionId: "hack" });
    settle(game);
    expect(board(game, "p1", "pica")).toBeDefined();
    expect(board(game, "p1", "hack")!.rested).toBe(true);
  });
});

describe("OP05-033 Baby 5", () => {
  covers("OP05-033", "[Activate: Main]");

  it("rests a DON!! and itself to play a cheap Donquixote body", () => {
    const game = table("op05-033")
      .bareTable()
      .withBoard("p1", [character("baby", "OP05-033")])
      .withHand("p1", [
        instance("kuween", "OP05-024"),
        instance("gladius", "OP05-025"),
      ])
      .build();
    game.play({ type: "activate-main", summary: "OP05-033" });
    expect(effectOptions(game.state)).not.toContain("gladius");
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(board(game, "p1", "baby")!.rested).toBe(true);
    expect(board(game, "p1", "kuween")).toBeDefined();
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("OP05-034 Baby 5", () => {
  covers("OP05-034", "[Activate: Main]");

  it("rests a DON!! and itself to dig for a Donquixote card", () => {
    const game = table("op05-034")
      .bareTable()
      .withBoard("p1", [character("baby", "OP05-034")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("gladius", "OP05-025"),
        instance("b", "ST32-004"),
        instance("c", "ST32-004"),
        instance("d", "ST32-004"),
      ])
      .build();
    game.play({ type: "activate-main", summary: "OP05-034" });
    game.play({ type: "resolve-effect", optionId: "gladius" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "gladius",
    ]);
    expect(board(game, "p1", "baby")!.rested).toBe(true);
  });
});

describe("OP05-036 Monet", () => {
  covers("OP05-036", "[On Block]");

  it("rests a cost-4 when it blocks", () => {
    const game = defending("op05-036")
      .bareTable()
      .withBoard("p1", [character("monet", "OP05-036")])
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
    game.play({ type: "block", blockerInstanceId: "monet" });
    game.play({ type: "resolve-effect", optionId: "spare" });
    expect(board(game, "p2", "spare")!.rested).toBe(true);
    expect(game.state.phase).toBe("counter");
  });
});

describe("OP05-037 Because the Side of Justice Will Be Whichever Side Wins!!", () => {
  covers("OP05-037", "[Counter]", "[Trigger]");

  it("costs a hand card and adds 3000", () => {
    const game = defending("op05-037")
      .bareTable()
      .withHand("p1", [
        instance("justice", "OP05-037"),
        instance("filler", "ST32-004"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP05-037" });
    game.play({ type: "resolve-effect", optionId: "apply" });
    game.play({ type: "resolve-effect", optionId: "filler" });
    expect(game.state.activeAttack?.counterPower).toBe(3_000);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("is not offered with nothing left in hand to trash", () => {
    const game = defending("op05-037-bare")
      .bareTable()
      .withHand("p1", [instance("justice", "OP05-037")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });

  it("rests a cost-4 off Life", () => {
    const game = triggerFrom("op05-037-trigger", "OP05-037", {
      opponentBoard: [["wall", "ST32-004"]],
    });
    // The Trigger's own rest needs an active target; the helper rests bench
    // bodies, so stand it up first.
    game.state.players.p2.board.find(
      (card) => card.instanceId === "wall",
    )!.rested = false;
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(board(game, "p2", "wall")!.rested).toBe(true);
  });
});

describe("OP05-038 Charlestone", () => {
  covers("OP05-038", "[Counter]", "[Trigger]");

  it("adds 4000, then a hand card buys three DON!! back", () => {
    const game = defending("op05-038")
      .bareTable()
      .withHand("p1", [
        instance("charlestone", "OP05-038"),
        instance("filler", "ST32-004"),
      ])
      .withDon("p1", { rested: 3 })
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP05-038" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "filler" });
    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    // Three rested, two more rested for the cost, three set active: two left.
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    expect(game.state.players.p1.activeDon).toHaveLength(8);
  });

  it("rests a cost-3 card off Life", () => {
    const game = triggerFrom("op05-038-trigger", "OP05-038", {
      opponentBoard: [["hack", "OP05-012"]],
    });
    game.state.players.p2.board.find(
      (card) => card.instanceId === "hack",
    )!.rested = false;
    game.play({ type: "resolve-trigger", optionId: "activate" });
    // "Leader or Character cards with a cost of 3 or less" is two target
    // classes: the ceiling bounds the Characters, and the Leader -- which
    // prints no cost -- is always legal. Resting it is the reason to hit this
    // Trigger, so assert it is offered beside the cost-3 body.
    expect(effectOptions(game.state)).toContain("p2-leader");
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(board(game, "p2", "hack")!.rested).toBe(true);
  });

  it("rests the opposing Leader, which its Life figure used to price out", () => {
    const game = triggerFrom("op05-038-trigger", "OP05-038", {
      opponentBoard: [["hack", "OP05-012"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "p2-leader" });
    expect(game.state.players.p2.leaderRested).toBe(true);
  });
});

describe("OP05-039 Stick-Stickem Meteora", () => {
  covers("OP05-039", "[Counter]", "[Trigger]");

  it("adds 4000 and K.O.s a rested cost-3", () => {
    const game = defending("op05-039")
      .bareTable()
      .withHand("p1", [instance("meteora", "OP05-039")])
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("hack", "OP05-012", { rested: true }),
      ])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP05-039" });
    // The attacker is rested too, but it is a cost 4.
    expect(effectOptions(game.state)).not.toContain("attacker");
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(board(game, "p2", "hack")).toBeUndefined();
  });

  it("K.O.s a rested cost-5 off Life", () => {
    const game = triggerFrom("op05-039-trigger", "OP05-039", {
      opponentBoard: [["gladius", "OP05-025"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "gladius" });
    expect(board(game, "p2", "gladius")).toBeUndefined();
  });
});

describe("OP05-040 Birdcage (Stage)", () => {
  covers("OP05-040", "static", "[End of Your Turn]");

  it("holds every cost-5-or-less Character down through both Refresh Phases", () => {
    const game = table("op05-040")
      .bareTable()
      .withLeader("p1", "OP14-060")
      .withStage("p1", instance("cage", "OP05-040"))
      .withBoard("p1", [
        character("own", "OP05-024", { rested: true }),
        character("big", "OP05-065", { rested: true }),
      ])
      .withBoard("p2", [character("theirs", "OP05-024", { rested: true })])
      // Under ten DON!!, so the Stage's own `[End of Your Turn]` stays shut
      // and this is the aura alone.
      .withDonDeck("p1", 3)
      .withDon("p1", { rested: 2 })
      .withDeckTop("p1", [instance("p1-draw", "ST32-004")])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();
    game.pass();
    // The opponent's Refresh Phase: their cheap body stays down.
    expect(board(game, "p2", "theirs")!.rested).toBe(true);
    game.pass();
    // Ours: the 2-cost stays down, the 6-cost stands, and DON!! is untouched.
    expect(board(game, "p1", "own")!.rested).toBe(true);
    expect(board(game, "p1", "big")!.rested).toBe(false);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });

  it("does nothing behind another Leader", () => {
    const game = table("op05-040-off")
      .bareTable()
      .withStage("p1", instance("cage", "OP05-040"))
      .withDonDeck("p1", 3)
      .withBoard("p2", [character("theirs", "OP05-024", { rested: true })])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();
    game.pass();
    expect(board(game, "p2", "theirs")!.rested).toBe(false);
  });

  it("at ten DON!! K.O.s every rested cost-5 on both boards and trashes itself", () => {
    const game = table("op05-040-eot")
      .bareTable()
      .withLeader("p1", "OP14-060")
      .withStage("p1", instance("cage", "OP05-040"))
      .withBoard("p1", [
        character("own", "OP05-024", { rested: true }),
        character("standing", "OP05-024"),
      ])
      .withBoard("p2", [
        character("theirs", "OP05-024", { rested: true }),
        character("big", "OP05-065", { rested: true }),
      ])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();
    game.pass();
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "standing",
    ]);
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
    expect(game.state.players.p1.stage).toBeNull();
    expect(
      game.state.players.p1.trash.map((card) => card.instanceId),
    ).toContain("cage");
  });
});

// --- Blue --------------------------------------------------------------------

describe("OP05-041 Sakazuki (Leader)", () => {
  covers("OP05-041", "[Activate: Main]", "[When Attacking]");

  it("trashes a card to draw a card", () => {
    const game = table("op05-041")
      .bareTable()
      .withLeader("p1", "OP05-041")
      .withHand("p1", [instance("filler", "ST32-004")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();
    game.play({ type: "activate-main", summary: "OP05-041" });
    game.play({ type: "resolve-effect", optionId: "filler" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    expect(activationOffered(game, "OP05-041")).toBe(false);
  });

  it("takes a cost off one Character on attack", () => {
    const game = table("op05-041-attack")
      .bareTable()
      .withLeader("p1", "OP05-041")
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(effectiveCost(game.state, "p2", board(game, "p2", "wall")!)).toBe(3);
  });
});

describe("OP05-042 Issho", () => {
  covers("OP05-042", "[On Play]");

  it("locks a cost-7 out of attacking on its controller's next turn", () => {
    const game = table("op05-042")
      .bareTable()
      .withHand("p1", [instance("issho", "OP05-042")])
      .withBoard("p2", [character("wall", "ST32-004")])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-042" });
    game.play({ type: "resolve-effect", optionId: "wall" });
    game.pass();
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "wall",
        ),
    ).toBe(false);
  });
});

describe("OP05-043 Ulti", () => {
  covers("OP05-043", "[On Play]");

  it("looks at three and keeps one behind a multicolour Leader", () => {
    const game = table("op05-043")
      .bareTable()
      .withLeader("p1", "OP05-041")
      .withHand("p1", [instance("ulti", "OP05-043")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("b", "OP05-012"),
        instance("c", "ST32-004"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-043" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "b",
    ]);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });

  it("does nothing behind a mono-colour Leader", () => {
    const game = table("op05-043-mono")
      .bareTable()
      .withHand("p1", [instance("ulti", "OP05-043")])
      .withDeckTop("p1", [instance("a", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-043" });
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP05-045 Stainless", () => {
  covers("OP05-045", "[Activate: Main]");

  it("trashes a card and rests itself to bury a cost-2", () => {
    const game = table("op05-045")
      .bareTable()
      .withBoard("p1", [character("stainless", "OP05-045")])
      .withHand("p1", [instance("filler", "ST32-004")])
      .withBoard("p2", [character("kuween", "OP05-024")])
      .build();
    game.play({ type: "activate-main", summary: "OP05-045" });
    game.play({ type: "resolve-effect", optionId: "filler" });
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(board(game, "p1", "stainless")!.rested).toBe(true);
    expect(board(game, "p2", "kuween")).toBeUndefined();
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("kuween");
  });
});

describe("OP05-046 Dalmatian", () => {
  covers("OP05-046", "[On K.O.]");

  it("draws a card and puts one under when it dies", () => {
    const game = defending("op05-046")
      .bareTable()
      .withBoard("p1", [character("dalmatian", "OP05-046", { rested: true })])
      .withHand("p1", [instance("held", "ST32-004")])
      .withDeckTop("p1", [instance("draw", "OP05-012")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "dalmatian",
    });
    declineDefence(game);
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["held", "draw"]),
    );
    game.play({ type: "resolve-effect", optionId: "held" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("held");
  });
});

describe("OP05-047 Basil Hawkins", () => {
  covers("OP05-047", "[On Block]");

  it("draws with a small hand and adds 1000 to the block", () => {
    const game = defending("op05-047")
      .bareTable()
      .withBoard("p1", [character("hawkins", "OP05-047")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "hawkins" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    expect(game.state.activeAttack?.counterPower).toBe(1_000);
  });
});

describe("OP05-048 Bastille", () => {
  covers("OP05-048", "[When Attacking]");

  it("buries a cost-2 on attack with a DON!! on it", () => {
    const game = table("op05-048")
      .bareTable()
      .withBoard("p1", [character("bastille", "OP05-048")])
      .withGivenDon("p1", "bastille", 1)
      .withBoard("p2", [character("kuween", "OP05-024")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "bastille",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(board(game, "p2", "kuween")).toBeUndefined();
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("kuween");
  });
});

describe("OP05-049 Haccha", () => {
  covers("OP05-049", "[When Attacking]");

  it("bounces a cost-3 from either board on attack with a DON!! on it", () => {
    const game = table("op05-049")
      .bareTable()
      .withBoard("p1", [
        character("haccha", "OP05-049"),
        character("own", "OP05-012"),
      ])
      .withGivenDon("p1", "haccha", 1)
      .withBoard("p2", [character("hack", "OP05-012")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "haccha",
      targetInstanceId: "p2-leader",
    });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["own", "hack"]),
    );
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "hack",
    ]);
  });
});

describe("OP05-050 Hina", () => {
  covers("OP05-050", "[On Play]");

  it("draws only with five or fewer in hand", () => {
    const small = table("op05-050")
      .bareTable()
      .withHand("p1", [instance("hina", "OP05-050")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();
    small.play({ type: "play-card", cardNumber: "OP05-050" });
    expect(small.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);

    const full = table("op05-050-full")
      .bareTable()
      .withHand("p1", [instance("hina", "OP05-050"), ...lifeCards("hand", 6)])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();
    full.play({ type: "play-card", cardNumber: "OP05-050" });
    expect(full.state.players.p1.hand).toHaveLength(6);
  });
});

describe("OP05-051 Borsalino", () => {
  covers("OP05-051", "[On Play]");

  it("buries a cost-4 from either board", () => {
    const game = table("op05-051")
      .bareTable()
      .withHand("p1", [instance("borsalino", "OP05-051")])
      .withBoard("p2", [
        character("wall", "ST32-004"),
        character("gladius", "OP05-025"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-051" });
    expect(effectOptions(game.state)).not.toContain("gladius");
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("wall");
  });
});

describe("OP05-053 Mozambia", () => {
  covers("OP05-053", "[Your Turn]");

  it("grows by 2000 the first time its controller draws by an effect", () => {
    const game = table("op05-053")
      .bareTable()
      .withBoard("p1", [character("mozambia", "OP05-053")])
      .withHand("p1", [instance("hina", "OP05-050")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-050" });
    settle(game);
    expect(currentPower(game.state, "p1", "mozambia")).toBe(4_000);
  });

  it("announces itself: a clause whose whole payload is a power change", () => {
    // `ability-triggered` is raised only for an automatic clause that produced
    // an event, so while `modify-power` emitted nothing this card grew in
    // silence -- no marker saying the clause had fired, and no step saying what
    // it did. The power change is the whole clause, so it is also the proof.
    const game = table("op05-053-announces")
      .bareTable()
      .withBoard("p1", [character("mozambia", "OP05-053")])
      .withHand("p1", [instance("hina", "OP05-050")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-050" });
    settle(game);

    expect(game.state.events).toContainEqual(
      expect.objectContaining({
        type: "ability-triggered",
        sourceCardNumber: "OP05-053",
        sourceInstanceId: "mozambia",
      }),
    );
    expect(game.state.events).toContainEqual(
      expect.objectContaining({
        type: "power-changed",
        targetInstanceId: "mozambia",
        amount: 2_000,
        sourceCardNumber: "OP05-053",
      }),
    );
  });
});

describe("OP05-054 Monkey.D.Garp", () => {
  covers("OP05-054", "[On Play]");

  it("draws two and puts two back under the deck", () => {
    const game = table("op05-054")
      .bareTable()
      .withHand("p1", [
        instance("garp", "OP05-054"),
        instance("held", "ST32-004"),
      ])
      .withDeckTop("p1", [
        instance("draw-a", "OP05-012"),
        instance("draw-b", "OP05-013"),
        instance("rest", "ST32-004"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-054" });
    game.play({ type: "resolve-effect", optionId: "held" });
    game.play({ type: "resolve-effect", optionId: "draw-a" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw-b",
    ]);
    expect(game.state.players.p1.deck.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(["rest", "held", "draw-a"]),
    );
    expect(game.state.players.p1.deck[0]?.instanceId).toBe("rest");
  });
});

describe("OP05-055 X.Drake", () => {
  covers("OP05-055", "[On Play]");

  it("looks at five and puts them back at either end", () => {
    const game = table("op05-055")
      .bareTable()
      .withHand("p1", [instance("drake", "OP05-055")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("b", "OP05-012"),
        instance("c", "ST32-004"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-055" });
    expect(game.state.pendingEffect?.kind).toBe("mechanic-choice");
    settle(game);
    expect(game.state.players.p1.deck).toHaveLength(3);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP05-056 X.Barrels", () => {
  covers("OP05-056", "[On Play]");

  it("buries another of its own Characters to draw", () => {
    const game = table("op05-056")
      .bareTable()
      .withHand("p1", [instance("barrels", "OP05-056")])
      .withBoard("p1", [character("hack", "OP05-012")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-056" });
    applyOptional(game);
    expect(effectOptions(game.state)).not.toContain("barrels");
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("hack");
  });
});

describe("OP05-057 Hound Blaze", () => {
  covers("OP05-057", "[Main]", "[Trigger]");

  it("buffs one card and buries a cost-2", () => {
    const game = table("op05-057")
      .bareTable()
      .withHand("p1", [instance("blaze", "OP05-057")])
      .withBoard("p2", [character("kuween", "OP05-024")])
      .build();
    game.play({ summary: "[OP05-057]" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);
    expect(game.state.players.p2.deck.at(-1)?.instanceId).toBe("kuween");
  });

  it("bounces a cost-3 off Life", () => {
    const game = triggerFrom("op05-057-trigger", "OP05-057", {
      opponentBoard: [["hack", "OP05-012"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "hack",
    ]);
  });
});

describe("OP05-058 It's a Waste of Human Life!!", () => {
  covers("OP05-058", "[Main]", "[Trigger]");

  it("buries every cheap body on both boards and trims both hands to five", () => {
    const game = table("op05-058")
      .bareTable()
      .withHand("p1", [instance("waste", "OP05-058"), ...lifeCards("p1h", 6)])
      .withHand("p2", lifeCards("p2h", 7))
      .withBoard("p1", [
        character("own-cheap", "OP05-012"),
        character("own-big", "ST32-004"),
      ])
      .withBoard("p2", [
        character("their-cheap", "OP05-024"),
        character("their-big", "ST32-004"),
      ])
      .build();
    game.play({ summary: "[OP05-058]" });
    // p1 trims first, then p2 -- each from their own seat.
    game.play({ type: "resolve-effect", optionId: "p1h-life-0" });
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "p2h-life-0" });
    game.play({ type: "resolve-effect", optionId: "p2h-life-1" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "own-big",
    ]);
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "their-big",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(5);
    expect(game.state.players.p2.hand).toHaveLength(5);
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("own-cheap");
  });

  it("buries every cost-2 on both boards off Life", () => {
    const game = triggerFrom("op05-058-trigger", "OP05-058", {
      board: [["own", "OP05-024"]],
      opponentBoard: [["theirs", "OP05-024"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);
    expect(game.state.players.p1.board).toHaveLength(0);
    // The attacker is a cost 4 and stays.
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "attacker",
    ]);
  });
});

describe("OP05-059 Let Us Begin the World of Violence!!!", () => {
  covers("OP05-059", "[Main]", "[Trigger]");

  it("draws behind a multicolour Leader and bounces a cost-5", () => {
    const game = table("op05-059")
      .bareTable()
      .withLeader("p1", "OP05-041")
      .withHand("p1", [instance("violence", "OP05-059")])
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .withBoard("p2", [character("gladius", "OP05-025")])
      .build();
    game.play({ summary: "[OP05-059]" });
    game.play({ type: "resolve-effect", optionId: "gladius" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "gladius",
    ]);
  });

  it("draws two off Life behind a multicolour Leader", () => {
    const game = triggerFrom("op05-059-trigger", "OP05-059", {
      leader: "OP05-041",
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    // The Event itself goes to the trash once its Trigger has run.
    expect(game.state.players.p1.hand).toHaveLength(2);
  });
});

// --- Purple ------------------------------------------------------------------

describe("OP05-060 Monkey.D.Luffy (Leader)", () => {
  covers("OP05-060", "[Activate: Main]");

  it("takes a Life card to hand and, at three-plus DON!!, adds one active", () => {
    const game = table("op05-060")
      .bareTable()
      .withLeader("p1", "OP05-060")
      .withLife("p1", lifeCards("p1", 3))
      .withDonDeck("p1", 2)
      .build();
    game.play({ type: "activate-main", summary: "OP05-060" });
    applyOptional(game);
    game.play({ type: "resolve-effect" });
    settle(game);
    expect(game.state.players.p1.life).toHaveLength(2);
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(9);
  });

  it("still takes the Life card between one and two DON!!, and adds none", () => {
    const game = table("op05-060-gap")
      .bareTable()
      .withLeader("p1", "OP05-060")
      .withLife("p1", lifeCards("p1", 3))
      .withDonDeck("p1", 8)
      .build();
    game.play({ type: "activate-main", summary: "OP05-060" });
    applyOptional(game);
    game.play({ type: "resolve-effect" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(2);
  });
});

describe("OP05-061 Uso-Hachi", () => {
  covers("OP05-061", "[When Attacking]");

  it("rests a cost-4 on attack with a DON!! on it and eight on the field", () => {
    const game = table("op05-061")
      .bareTable()
      .withBoard("p1", [character("usohachi", "OP05-061")])
      .withGivenDon("p1", "usohachi", 1)
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "usohachi",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(board(game, "p2", "wall")!.rested).toBe(true);
  });

  it("does nothing under eight DON!!", () => {
    const game = table("op05-061-low")
      .bareTable()
      .withBoard("p1", [character("usohachi", "OP05-061")])
      .withDonDeck("p1", 3)
      .withGivenDon("p1", "usohachi", 1)
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "usohachi",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
  });
});

describe("OP05-062 O-Nami", () => {
  covers("OP05-062", "static");

  it("blocks only at ten DON!! on the field", () => {
    const ten = table("op05-062")
      .bareTable()
      .withBoard("p1", [character("nami", "OP05-062")])
      .build();
    expect(hasKeyword(ten.state, "p1", "nami", "Blocker")).toBe(true);

    const nine = table("op05-062-nine")
      .bareTable()
      .withBoard("p1", [character("nami", "OP05-062")])
      .withDonDeck("p1", 1)
      .build();
    expect(hasKeyword(nine.state, "p1", "nami", "Blocker")).toBe(false);
  });
});

describe("OP05-063 O-Robi", () => {
  covers("OP05-063", "[On Play]");

  it("K.O.s a cost-3 at eight DON!!", () => {
    const game = table("op05-063")
      .bareTable()
      .withHand("p1", [instance("robi", "OP05-063")])
      .withBoard("p2", [character("hack", "OP05-012")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-063" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(game.state.players.p2.board).toHaveLength(0);
  });
});

describe("OP05-064 Killer", () => {
  covers("OP05-064", "[On Play]");

  it("digs five for a Kid Pirates card other than another Killer", () => {
    const game = table("op05-064")
      .bareTable()
      .withHand("p1", [instance("killer", "OP05-064")])
      .withDeckTop("p1", [
        instance("killer-two", "OP05-064"),
        instance("kid", "OP05-074"),
        instance("a", "ST32-004"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-064" });
    expect(effectOptions(game.state)).not.toContain("killer-two");
    game.play({ type: "resolve-effect", optionId: "kid" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "kid",
    ]);
  });
});

describe("OP05-067 Zoro-Juurou", () => {
  covers("OP05-067", "[When Attacking]");

  it("adds an active DON!! on attack at three Life or less", () => {
    const game = table("op05-067")
      .bareTable()
      .withBoard("p1", [character("zoro", "OP05-067")])
      .withLife("p1", lifeCards("p1", 3))
      .withDonDeck("p1", 1)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "zoro",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.players.p1.activeDon).toHaveLength(10);
    expect(game.state.players.p1.donDeck).toHaveLength(0);
  });
});

describe("OP05-068 Chopa-Emon", () => {
  covers("OP05-068", "[On Play]");

  it("stands a small purple Straw Hat back up at eight DON!!", () => {
    const game = table("op05-068")
      .bareTable()
      .withHand("p1", [instance("chopper", "OP05-068")])
      .withBoard("p1", [
        character("nami", "OP05-062", { rested: true }),
        character("big", "OP05-065", { rested: true }),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-068" });
    expect(effectOptions(game.state)).not.toContain("big");
    game.play({ type: "resolve-effect", optionId: "nami" });
    expect(board(game, "p1", "nami")!.rested).toBe(false);
  });
});

describe("OP05-069 Trafalgar Law", () => {
  covers("OP05-069", "[When Attacking]");

  it("digs for a Heart Pirates card only while behind on DON!!", () => {
    const behind = table("op05-069")
      .bareTable()
      .withBoard("p1", [character("law", "OP05-069")])
      .withDonDeck("p1", 5)
      .withDeckTop("p1", [
        instance("bepo", "OP05-071"),
        instance("a", "ST32-004"),
      ])
      .build();
    behind.play({
      type: "attack",
      attackerInstanceId: "law",
      targetInstanceId: "p2-leader",
    });
    behind.play({ type: "resolve-effect", optionId: "bepo" });
    settle(behind);
    expect(behind.state.players.p1.hand.map((card) => card.instanceId)).toEqual(
      ["bepo"],
    );

    const level = table("op05-069-level")
      .bareTable()
      .withBoard("p1", [character("law", "OP05-069")])
      .withDeckTop("p1", [instance("bepo", "OP05-071")])
      .build();
    level.play({
      type: "attack",
      attackerInstanceId: "law",
      targetInstanceId: "p2-leader",
    });
    expect(level.state.pendingEffect).toBeNull();
  });
});

describe("OP05-071 Bepo", () => {
  covers("OP05-071", "[When Attacking]");

  it("debuffs 2000 on attack while behind on DON!!", () => {
    const game = table("op05-071")
      .bareTable()
      .withBoard("p1", [character("bepo", "OP05-071")])
      .withDonDeck("p1", 5)
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "bepo",
      targetInstanceId: "p2-leader",
    });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(currentPower(game.state, "p2", "wall")).toBe(3_000);
  });
});

describe("OP05-072 Hone-Kichi", () => {
  covers("OP05-072", "[On Play]");

  it("debuffs two Characters at eight DON!!", () => {
    const game = table("op05-072")
      .bareTable()
      .withHand("p1", [instance("brook", "OP05-072")])
      .withBoard("p2", [character("a", "ST32-004"), character("b", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-072" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "b" });
    settleDeclining(game);
    expect(currentPower(game.state, "p2", "a")).toBe(3_000);
    expect(currentPower(game.state, "p2", "b")).toBe(3_000);
  });
});

describe("OP05-073 Miss Doublefinger(Zala)", () => {
  covers("OP05-073", "[On Play]", "[Trigger]");

  it("trashes a card for a rested DON!! from the DON!! deck", () => {
    const game = table("op05-073")
      .bareTable()
      .withHand("p1", [
        instance("zala", "OP05-073"),
        instance("filler", "ST32-004"),
      ])
      .withDonDeck("p1", 1)
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-073" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "filler" });
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    // Four rested for the cost, one more from the DON!! deck.
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });

  it("returns a DON!! to arrive off Life", () => {
    const game = triggerFrom("op05-073-trigger", "OP05-073");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    payDonMinus(game);
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP05-073",
    ]);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe('OP05-074 Eustass"Captain"Kid', () => {
  covers("OP05-074", "[Your Turn]");

  it("refunds the first DON!! its controller sends home on their turn", () => {
    const game = table("op05-074")
      .bareTable()
      .withBoard("p1", [character("kid", "OP05-074")])
      .withHand("p1", [instance("rotten", "OP05-078")])
      .withDonDeck("p1", 1)
      .build();
    // Punk Rotten: 2 DON!! to play, `DON!! −1` printed, +5000 on a Kid Pirates.
    game.play({ summary: "[OP05-078]" });
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "kid" });
    settle(game);
    expect(currentPower(game.state, "p1", "kid")).toBe(11_000);
    // One went back -- off the rested pile the Event's own cost just made --
    // and one came out active: the DON!! deck is where it started.
    expect(game.state.players.p1.donDeck).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(8);
  });
});

describe("OP05-075 Mr.1(Daz.Bonez)", () => {
  covers("OP05-075", "[On Your Opponent's Attack]");

  it("returns a DON!! to play a cheap Baroque Works body mid-attack", () => {
    const game = defending("op05-075")
      .bareTable()
      .withBoard("p1", [character("mr1", "OP05-075")])
      .withHand("p1", [
        instance("mr1-two", "OP05-075"),
        instance("zala", "OP05-073"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(game);
    payDonMinus(game);
    // Zala is a cost 4.
    expect(effectOptions(game.state)).not.toContain("zala");
    game.play({ type: "resolve-effect", optionId: "mr1-two" });
    settleDeclining(game);
    expect(board(game, "p1", "mr1-two")).toBeDefined();
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });
});

describe("OP05-076 When You're at Sea You Fight against Pirates!!", () => {
  covers("OP05-076", "[Main]", "[Trigger]");

  it("digs three for any of the three crews", () => {
    const game = table("op05-076")
      .bareTable()
      .withHand("p1", [instance("sea", "OP05-076")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("bepo", "OP05-071"),
        instance("kid", "OP05-074"),
      ])
      .build();
    game.play({ summary: "[OP05-076]" });
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["bepo", "kid"]),
    );
    game.play({ type: "resolve-effect", optionId: "bepo" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "bepo",
    ]);
  });

  it("runs the same dig off Life", () => {
    const game = triggerFrom("op05-076-trigger", "OP05-076", {
      deckTop: ["ST32-004", "OP05-062", "ST32-004"],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "op05-076-trigger-deck-1" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.cardNumber)).toEqual([
      "OP05-062",
    ]);
  });
});

describe("OP05-078 Punk Rotten", () => {
  covers("OP05-078", "[Main]", "[Trigger]");

  it("returns a DON!! for +5000 on a Kid Pirates card", () => {
    const game = table("op05-078")
      .bareTable()
      .withHand("p1", [instance("rotten", "OP05-078")])
      .withBoard("p1", [
        character("killer", "OP05-064"),
        character("other", "ST32-004"),
      ])
      .build();
    game.play({ summary: "[OP05-078]" });
    payDonMinus(game);
    expect(effectOptions(game.state)).not.toContain("other");
    game.play({ type: "resolve-effect", optionId: "killer" });
    expect(currentPower(game.state, "p1", "killer")).toBe(7_000);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("adds an active DON!! off Life", () => {
    const game = triggerFrom("op05-078-trigger", "OP05-078", { donDeck: 1 });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(game.state.players.p1.activeDon).toHaveLength(10);
  });
});

describe("OP05-079 Viola", () => {
  covers("OP05-079", "[On Play]");

  it("has the opponent put three of their trash cards under their deck", () => {
    const game = table("op05-079")
      .bareTable()
      .withHand("p1", [instance("viola", "OP05-079")])
      .withTrash("p2", deepTrash("p2", 4))
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-079" });
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "p2-trash-0" });
    game.play({ type: "resolve-effect", optionId: "p2-trash-1" });
    game.play({ type: "resolve-effect", optionId: "p2-trash-2" });
    settle(game);
    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "p2-trash-3",
    ]);
    expect(game.state.players.p2.deck).toHaveLength(3);
  });
});

// --- Black -------------------------------------------------------------------

describe("OP05-080 Elizabello II", () => {
  covers("OP05-080", "[When Attacking]");

  it("is not offered with fewer than twenty cards in the trash", () => {
    const game = table("op05-080-short")
      .bareTable()
      .withBoard("p1", [character("elizabello", "OP05-080")])
      .withTrash("p1", deepTrash("p1", 19))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "elizabello",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.pendingEffect).toBeNull();
    expect(hasKeyword(game.state, "p1", "elizabello", "Double Attack")).toBe(
      false,
    );
  });
});

describe("OP05-081 One-Legged Toy Soldier", () => {
  covers("OP05-081", "[Activate: Main]");

  it("trashes itself for −3 cost on a Character", () => {
    const game = table("op05-081")
      .bareTable()
      .withBoard("p1", [character("soldier", "OP05-081")])
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    game.play({ type: "activate-main", summary: "OP05-081" });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(board(game, "p1", "soldier")).toBeUndefined();
    expect(effectiveCost(game.state, "p2", board(game, "p2", "wall")!)).toBe(1);
  });
});

describe("OP05-082 Shirahoshi", () => {
  covers("OP05-082", "[Activate: Main]");

  it("rests and buries two trash cards so a six-card hand loses one", () => {
    const game = table("op05-082")
      .bareTable()
      .withBoard("p1", [character("shirahoshi", "OP05-082")])
      .withTrash("p1", deepTrash("p1", 2))
      .withHand("p2", lifeCards("p2h", 6))
      .build();
    game.play({ type: "activate-main", summary: "OP05-082" });
    game.play({ type: "resolve-effect", optionId: "p1-trash-0" });
    game.play({ type: "resolve-effect", optionId: "p1-trash-1" });
    // The order prompt, then the opponent's own pick.
    while (game.state.activePlayer === "p1" && game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
    }
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "p2h-life-0" });
    expect(board(game, "p1", "shirahoshi")!.rested).toBe(true);
    expect(game.state.players.p1.trash).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(2);
    expect(game.state.players.p2.hand).toHaveLength(5);
  });

  it("is not offered with an empty trash", () => {
    const game = table("op05-082-bare")
      .bareTable()
      .withBoard("p1", [character("shirahoshi", "OP05-082")])
      .withHand("p2", lifeCards("p2h", 6))
      .build();
    expect(activationOffered(game, "OP05-082")).toBe(false);
  });
});

describe("OP05-084 Saint Charlos and OP05-092 Saint Rosward", () => {
  covers("OP05-084", "[Your Turn]");
  covers("OP05-092", "[Your Turn]");

  it("debuff every opposing Character's cost while the court is only Celestial Dragons", () => {
    const court = table("op05-084")
      .bareTable()
      .withBoard("p1", [
        character("charlos", "OP05-084"),
        character("rosward", "OP05-092"),
      ])
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    // Floored at 0: Bandai's rules Q&A, Basic Rules 9 (test/faq-rules.test.ts).
    expect(effectiveCost(court.state, "p2", board(court, "p2", "wall")!)).toBe(
      0,
    );

    const mixed = table("op05-084-mixed")
      .bareTable()
      .withBoard("p1", [
        character("charlos", "OP05-084"),
        character("hack", "OP05-012"),
      ])
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    expect(effectiveCost(mixed.state, "p2", board(mixed, "p2", "wall")!)).toBe(
      4,
    );
  });

  it("switch off on the opponent's turn", () => {
    const game = defending("op05-084-off")
      .bareTable()
      .withBoard("p1", [character("charlos", "OP05-084")])
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    expect(effectiveCost(game.state, "p2", board(game, "p2", "wall")!)).toBe(4);
  });
});

describe("OP05-085 Nefeltari Cobra", () => {
  covers("OP05-085", "[On Play]");

  it("mills the top card", () => {
    const game = table("op05-085")
      .bareTable()
      .withHand("p1", [instance("cobra", "OP05-085")])
      .withDeckTop("p1", [instance("top", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-085" });
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "top",
    ]);
  });
});

describe("OP05-086 Nefeltari Vivi", () => {
  covers("OP05-086", "static");

  it("blocks only with ten cards in the trash", () => {
    const deep = table("op05-086")
      .bareTable()
      .withBoard("p1", [character("vivi", "OP05-086")])
      .withTrash("p1", deepTrash("p1", 10))
      .build();
    expect(hasKeyword(deep.state, "p1", "vivi", "Blocker")).toBe(true);

    const shallow = table("op05-086-shallow")
      .bareTable()
      .withBoard("p1", [character("vivi", "OP05-086")])
      .withTrash("p1", deepTrash("p1", 9))
      .build();
    expect(hasKeyword(shallow.state, "p1", "vivi", "Blocker")).toBe(false);
  });
});

describe("OP05-087 Hakuba", () => {
  covers("OP05-087", "[When Attacking]");

  it("K.O.s a teammate for −5 cost on an opposing Character", () => {
    const game = table("op05-087")
      .bareTable()
      .withBoard("p1", [
        character("hakuba", "OP05-087"),
        character("fodder", "OP05-012"),
      ])
      .withGivenDon("p1", "hakuba", 1)
      .withBoard("p2", [character("wall", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "hakuba",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    expect(effectOptions(game.state)).not.toContain("hakuba");
    game.play({ type: "resolve-effect", optionId: "fodder" });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(board(game, "p1", "fodder")).toBeUndefined();
    // Floored at 0: Bandai's rules Q&A, Basic Rules 9 (test/faq-rules.test.ts).
    expect(effectiveCost(game.state, "p2", board(game, "p2", "wall")!)).toBe(0);
  });
});

describe("OP05-088 Mansherry", () => {
  covers("OP05-088", "[Activate: Main]");

  it("pays a DON!!, its rest and two trash cards for a black 3-to-5 back", () => {
    const game = table("op05-088")
      .bareTable()
      .withBoard("p1", [character("mansherry", "OP05-088")])
      .withTrash("p1", [
        instance("riku", "OP05-090"),
        instance("rebecca", "OP05-091"),
        instance("soldier", "OP05-081"),
        instance("a", "ST32-004"),
      ])
      .build();
    game.play({ type: "activate-main", summary: "OP05-088" });
    game.play({ type: "resolve-effect", optionId: "a" });
    game.play({ type: "resolve-effect", optionId: "soldier" });
    while (
      game.state.pendingEffect &&
      !effectOptions(game.state).includes("riku")
    ) {
      game.play({ type: "resolve-effect" });
    }
    // Rebecca is black but a cost 4 -- also in range; the Toy Soldier went
    // under the deck and is not.
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["riku", "rebecca"]),
    );
    game.play({ type: "resolve-effect", optionId: "riku" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "riku",
    ]);
    expect(board(game, "p1", "mansherry")!.rested).toBe(true);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
  });
});

describe("OP05-089 Saint Mjosgard", () => {
  covers("OP05-089", "[Activate: Main]");

  it("rests a DON!!, itself and a teammate for a black 1-cost back", () => {
    const game = table("op05-089")
      .bareTable()
      .withBoard("p1", [
        character("mjosgard", "OP05-089"),
        character("fodder", "OP05-012"),
      ])
      .withTrash("p1", [
        instance("vivi", "OP05-086"),
        instance("riku", "OP05-090"),
      ])
      .build();
    game.play({ type: "activate-main", summary: "OP05-089" });
    game.play({ type: "resolve-effect", optionId: "fodder" });
    expect(effectOptions(game.state)).not.toContain("riku");
    game.play({ type: "resolve-effect", optionId: "vivi" });
    expect(board(game, "p1", "fodder")!.rested).toBe(true);
    expect(board(game, "p1", "mjosgard")!.rested).toBe(true);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "vivi",
    ]);
  });

  it("is not offered with nothing else to rest", () => {
    const game = table("op05-089-alone")
      .bareTable()
      .withBoard("p1", [character("mjosgard", "OP05-089")])
      .withTrash("p1", [instance("vivi", "OP05-086")])
      .build();
    expect(activationOffered(game, "OP05-089")).toBe(false);
  });
});

describe("OP05-090 Riku Doldo III", () => {
  covers("OP05-090", "[On Play]", "[On K.O.]");

  it("buffs a Dressrosa Character on play", () => {
    const game = table("op05-090")
      .bareTable()
      .withHand("p1", [instance("riku", "OP05-090")])
      .withBoard("p1", [
        character("soldier", "OP05-081"),
        character("hack", "OP05-012"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-090" });
    expect(effectOptions(game.state)).not.toContain("hack");
    game.play({ type: "resolve-effect", optionId: "soldier" });
    expect(currentPower(game.state, "p1", "soldier")).toBe(2_000);
  });

  it("buffs a Dressrosa Character when it dies", () => {
    const game = defending("op05-090-ko")
      .bareTable()
      .withBoard("p1", [
        character("riku", "OP05-090", { rested: true }),
        character("soldier", "OP05-081"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withGivenDon("p2", "attacker", 2)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "riku",
    });
    declineDefence(game);
    game.play({ type: "resolve-effect", optionId: "soldier" });
    expect(currentPower(game.state, "p1", "soldier")).toBe(2_000);
  });
});

describe("OP05-091 Rebecca", () => {
  covers("OP05-091", "[On Play]");

  it("recovers a black 3-to-7 and plays a black 3-or-less rested", () => {
    const game = table("op05-091")
      .bareTable()
      .withHand("p1", [
        instance("rebecca", "OP05-091"),
        instance("soldier", "OP05-081"),
      ])
      .withTrash("p1", [
        instance("riku", "OP05-090"),
        instance("rebecca-two", "OP05-091"),
        instance("vivi", "OP05-086"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-091" });
    expect(effectOptions(game.state)).toContain("riku");
    expect(effectOptions(game.state)).not.toContain("rebecca-two");
    expect(effectOptions(game.state)).not.toContain("vivi");
    game.play({ type: "resolve-effect", optionId: "riku" });
    game.play({ type: "resolve-effect", optionId: "soldier" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "riku",
    ]);
    expect(board(game, "p1", "soldier")!.rested).toBe(true);
  });
});

describe("OP05-093 Rob Lucci", () => {
  covers("OP05-093", "[On Play]");

  it("buries three trash cards for a cost-2 and a cost-1 K.O.", () => {
    const game = table("op05-093")
      .bareTable()
      .withHand("p1", [instance("lucci", "OP05-093")])
      .withTrash("p1", deepTrash("p1", 3))
      .withBoard("p2", [
        character("kuween", "OP05-024"),
        character("baby", "OP05-033"),
        character("hack", "OP05-012"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-093" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "p1-trash-0" });
    game.play({ type: "resolve-effect", optionId: "p1-trash-1" });
    game.play({ type: "resolve-effect", optionId: "p1-trash-2" });
    while (
      game.state.pendingEffect &&
      !effectOptions(game.state).includes("kuween")
    ) {
      game.play({ type: "resolve-effect" });
    }
    expect(effectOptions(game.state)).not.toContain("hack");
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(effectOptions(game.state)).toEqual(["baby", "done"]);
    game.play({ type: "resolve-effect", optionId: "baby" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "hack",
    ]);
    expect(game.state.players.p1.trash).toHaveLength(0);
  });
});

describe("OP05-094 Haute Couture Patch★Work", () => {
  covers("OP05-094", "[Main]", "[Trigger]");

  it("takes a body to cost 0 and holds it down through its next Refresh Phase", () => {
    const game = table("op05-094")
      .bareTable()
      .withHand("p1", [instance("patchwork", "OP05-094")])
      .withBoard("p2", [
        character("hack", "OP05-012", { rested: true }),
        character("wall", "ST32-004", { rested: true }),
      ])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();
    game.play({ summary: "[OP05-094]" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(effectOptions(game.state)).not.toContain("wall");
    game.play({ type: "resolve-effect", optionId: "hack" });
    game.pass();
    expect(board(game, "p2", "hack")!.rested).toBe(true);
    expect(board(game, "p2", "wall")!.rested).toBe(false);
  });

  it("draws two and trashes one off Life", () => {
    const game = triggerFrom("op05-094-trigger", "OP05-094");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect" });
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(
      game.state.players.p1.trash.map((card) => card.cardNumber),
    ).toContain("ST32-004");
  });
});

describe("OP05-095 Dragon Claw", () => {
  covers("OP05-095", "[Counter]");

  it("adds 4000 and, at fifteen trash, K.O.s a cost-4", () => {
    const game = defending("op05-095")
      .bareTable()
      .withHand("p1", [instance("claw", "OP05-095")])
      .withTrash("p1", deepTrash("p1", 15))
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("spare", "ST32-004"),
      ])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.pass();
    game.play({ type: "activate-counter-event", cardNumber: "OP05-095" });
    game.play({ type: "resolve-effect", optionId: "spare" });
    expect(game.state.activeAttack?.counterPower).toBe(4_000);
    expect(board(game, "p2", "spare")).toBeUndefined();
  });
});

describe("OP05-096 I Bid 500 Million!!", () => {
  covers("OP05-096", "[Main]", "[Trigger]");

  it("puts a 1-cost into the opponent's Life face-up and draws beside a Celestial Dragon", () => {
    const game = table("op05-096")
      .bareTable()
      .withHand("p1", [instance("bid", "OP05-096")])
      .withBoard("p1", [character("charlos", "OP05-084")])
      .withBoard("p2", [character("baby", "OP05-033")])
      .withLife("p2", lifeCards("p2", 1))
      .withDeckTop("p1", [instance("draw", "ST32-004")])
      .build();
    game.play({ summary: "[OP05-096]" });
    game.play({ type: "resolve-effect", optionId: "life" });
    game.play({ type: "resolve-effect", optionId: "baby" });
    game.play({ type: "resolve-effect", optionId: "life-top" });
    settle(game);
    expect(game.state.players.p2.life[0]).toMatchObject({
      instanceId: "baby",
      faceUp: true,
    });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
  });

  it("K.O.s or bounces a cost-6 off Life", () => {
    const game = triggerFrom("op05-096-trigger", "OP05-096", {
      opponentBoard: [["gladius", "OP05-025"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "gladius" });
    expect(effectOptions(game.state)).toEqual(["ko", "bounce"]);
    game.play({ type: "resolve-effect", optionId: "bounce" });
    expect(game.state.players.p2.hand.map((card) => card.instanceId)).toEqual([
      "gladius",
    ]);
  });
});

describe("OP05-097 Mary Geoise (Stage)", () => {
  covers("OP05-097", "[Your Turn]");

  it("takes one DON!! off a Celestial Dragon of cost 2 or more", () => {
    const game = table("op05-097")
      .bareTable()
      .withStage("p1", instance("geoise", "OP05-097"))
      .withHand("p1", [
        instance("charlos", "OP05-084"),
        instance("hack", "OP05-012"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-084" });
    expect(game.state.players.p1.restedDon).toHaveLength(2);
    game.play({ type: "play-card", cardNumber: "OP05-012" });
    expect(game.state.players.p1.restedDon).toHaveLength(5);
  });

  it("does nothing without the Stage", () => {
    const game = table("op05-097-bare")
      .bareTable()
      .withHand("p1", [instance("charlos", "OP05-084")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-084" });
    expect(game.state.players.p1.restedDon).toHaveLength(3);
  });
});

// --- Yellow ------------------------------------------------------------------

describe("OP05-098 Enel (Leader)", () => {
  covers("OP05-098", "[Opponent's Turn]");

  it("puts the top of the deck back as Life when the last Life card goes, for a hand card", () => {
    const game = defending("op05-098")
      .bareTable()
      .withLeader("p1", "OP05-098")
      .withLife("p1", lifeCards("p1", 1))
      .withHand("p1", [instance("held", "ST32-004")])
      .withDeckTop("p1", [instance("top", "OP05-012")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    applyOptional(game);
    // The damaged Life card is in hand beside the held card; one is trashed.
    expect(game.state.players.p1.life.map((card) => card.instanceId)).toEqual([
      "top",
    ]);
    expect(effectOptions(game.state)).toEqual(
      expect.arrayContaining(["held", "p1-life-0"]),
    );
    game.play({ type: "resolve-effect", optionId: "held" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "p1-life-0",
    ]);
    expect(game.state.winner).toBeNull();
  });

  it("does nothing while Life remains", () => {
    const game = defending("op05-098-two")
      .bareTable()
      .withLeader("p1", "OP05-098")
      .withLife("p1", lifeCards("p1", 2))
      .withDeckTop("p1", [instance("top", "OP05-012")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    declineDefence(game);
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.pendingEffect).toBeNull();
    // The once-per-turn use was not spent on a Life card that was not the last.
    expect(game.state.oncePerTurn.some((key) => key.includes("OP05-098"))).toBe(
      false,
    );
  });
});

describe("OP05-099 Amazon", () => {
  covers("OP05-099", "[On Your Opponent's Attack]");

  it("rests itself and lets the attacker choose: a Life card, or −2000", () => {
    const trashed = defending("op05-099")
      .bareTable()
      .withBoard("p1", [character("amazon", "OP05-099")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p2", lifeCards("p2", 2))
      .build();
    trashed.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(trashed);
    expect(trashed.state.activePlayer).toBe("p2");
    expect(effectOptions(trashed.state)).toEqual(["trash-life", "take-debuff"]);
    trashed.play({ type: "resolve-effect", optionId: "trash-life" });
    expect(board(trashed, "p1", "amazon")!.rested).toBe(true);
    expect(trashed.state.players.p2.life).toHaveLength(1);
    expect(trashed.state.players.p2.trash).toHaveLength(1);

    const kept = defending("op05-099-kept")
      .bareTable()
      .withBoard("p1", [character("amazon", "OP05-099")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withLife("p2", lifeCards("p2", 2))
      .build();
    kept.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    applyOptional(kept);
    kept.play({ type: "resolve-effect", optionId: "take-debuff" });
    expect(kept.state.activePlayer).toBe("p1");
    kept.play({ type: "resolve-effect", optionId: "attacker" });
    expect(currentPower(kept.state, "p2", "attacker")).toBe(3_000);
    expect(kept.state.players.p2.life).toHaveLength(2);
  });
});

describe("OP05-100 Enel", () => {
  covers("OP05-100", "[Rush]", "static");

  const swingAtEnel = (seed: string, luffyOut: boolean) => {
    const game = defending(seed)
      .bareTable()
      .withBoard("p1", [character("enel", "OP05-100", { rested: true })])
      .withLife("p1", lifeCards("p1", 2))
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        ...(luffyOut ? [character("luffy", "OP05-119")] : []),
      ])
      .withGivenDon("p2", "attacker", 3)
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "enel",
    });
    passDefence(game);
    return game;
  };

  it("rushes", () => {
    const game = table("op05-100-rush")
      .bareTable()
      .withBoard("p1", [character("enel", "OP05-100", { playedTurn: 11 })])
      .build();
    expect(hasKeyword(game.state, "p1", "enel", "Rush")).toBe(true);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "attack" && action.attackerInstanceId === "enel",
        ),
    ).toBe(true);
  });

  it("trashes the top Life card instead of leaving the field", () => {
    const game = swingAtEnel("op05-100", false);
    expect(effectOptions(game.state)).toContain("mechanic:enel:enel");
    game.play({ type: "resolve-effect", optionId: "mechanic:enel:enel" });
    settle(game);
    expect(board(game, "p1", "enel")).toBeDefined();
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "p1-life-0",
    ]);
  });

  it("is negated while a [Monkey.D.Luffy] Character is out", () => {
    const game = swingAtEnel("op05-100-luffy", true);
    expect(game.state.pendingEffect).toBeNull();
    expect(board(game, "p1", "enel")).toBeUndefined();
  });

  it("answers a bury as well as a K.O.", () => {
    // Nothing in the set buries a cost 7, so the Toy Soldier takes three off
    // it first and Borsalino's cost-4 bury reaches it -- an off-field removal
    // the `removal: "off-field"` reading has to answer.
    const game = table("op05-100-bury")
      .bareTable()
      .withBoard("p1", [character("soldier", "OP05-081")])
      .withHand("p1", [instance("borsalino", "OP05-051")])
      .withBoard("p2", [character("enel", "OP05-100")])
      .withLife("p2", lifeCards("p2", 2))
      .build();
    game.play({ type: "activate-main", summary: "OP05-081" });
    game.play({ type: "resolve-effect", optionId: "enel" });
    game.play({ type: "play-card", cardNumber: "OP05-051" });
    game.play({ type: "resolve-effect", optionId: "enel" });
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "replace:enel" });
    settle(game);
    expect(board(game, "p2", "enel")).toBeDefined();
    expect(game.state.players.p2.life).toHaveLength(1);
  });
});

describe("OP05-101 Ohm", () => {
  covers("OP05-101", "static", "[On Play]");

  it("is 1000 bigger at two Life or less", () => {
    const low = table("op05-101")
      .bareTable()
      .withBoard("p1", [character("ohm", "OP05-101")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    expect(currentPower(low.state, "p1", "ohm")).toBe(6_000);

    const high = table("op05-101-high")
      .bareTable()
      .withBoard("p1", [character("ohm", "OP05-101")])
      .withLife("p1", lifeCards("p1", 3))
      .build();
    expect(currentPower(high.state, "p1", "ohm")).toBe(5_000);
  });

  it("digs for a Holly and plays it", () => {
    const game = table("op05-101-play")
      .bareTable()
      .withHand("p1", [instance("ohm", "OP05-101")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("holly", "OP05-110"),
        instance("b", "ST32-004"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-101" });
    game.play({ type: "resolve-effect", optionId: "holly" });
    while (
      game.state.pendingEffect &&
      !effectOptions(game.state).includes("holly")
    ) {
      game.play({ type: "resolve-effect" });
    }
    game.play({ type: "resolve-effect", optionId: "holly" });
    expect(board(game, "p1", "holly")).toBeDefined();
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP05-102 Gedatsu", () => {
  covers("OP05-102", "[On Play]");

  it("K.O.s a Character costing no more than the opponent's Life count", () => {
    const game = table("op05-102")
      .bareTable()
      .withHand("p1", [instance("gedatsu", "OP05-102")])
      .withBoard("p2", [
        character("kuween", "OP05-024"),
        character("hack", "OP05-012"),
      ])
      .withLife("p2", lifeCards("p2", 2))
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-102" });
    expect(effectOptions(game.state)).not.toContain("hack");
    game.play({ type: "resolve-effect", optionId: "kuween" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "hack",
    ]);
  });
});

describe("OP05-103 Kotori", () => {
  covers("OP05-103", "[On Play]");

  it("K.O.s only beside a [Hotori]", () => {
    const paired = table("op05-103")
      .bareTable()
      .withHand("p1", [instance("kotori", "OP05-103")])
      .withBoard("p1", [character("hotori", "OP05-111")])
      .withBoard("p2", [character("kuween", "OP05-024")])
      .withLife("p2", lifeCards("p2", 3))
      .build();
    paired.play({ type: "play-card", cardNumber: "OP05-103" });
    paired.play({ type: "resolve-effect", optionId: "kuween" });
    expect(paired.state.players.p2.board).toHaveLength(0);

    const alone = table("op05-103-alone")
      .bareTable()
      .withHand("p1", [instance("kotori", "OP05-103")])
      .withBoard("p2", [character("kuween", "OP05-024")])
      .withLife("p2", lifeCards("p2", 3))
      .build();
    alone.play({ type: "play-card", cardNumber: "OP05-103" });
    expect(alone.state.pendingEffect).toBeNull();
    expect(alone.state.players.p2.board).toHaveLength(1);
  });
});

describe("OP05-104 Conis", () => {
  covers("OP05-104", "[On Play]");

  it("buries its Stage to draw and trash", () => {
    const game = table("op05-104")
      .bareTable()
      .withHand("p1", [
        instance("conis", "OP05-104"),
        instance("held", "ST32-004"),
      ])
      .withStage("p1", instance("yard", "OP05-117"))
      .withDeckTop("p1", [instance("draw", "OP05-012")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-104" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "yard" });
    game.play({ type: "resolve-effect", optionId: "held" });
    expect(game.state.players.p1.stage).toBeNull();
    expect(game.state.players.p1.deck.at(-1)?.instanceId).toBe("yard");
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "draw",
    ]);
  });
});

describe("OP05-105 Satori", () => {
  covers("OP05-105", "[Trigger]");

  it("arrives off Life for a hand card", () => {
    const game = triggerFrom("op05-105", "OP05-105", { hand: ["ST32-004"] });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    game.play({ type: "resolve-effect" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP05-105",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP05-106 Shura", () => {
  covers("OP05-106", "[On Play]", "[Trigger]");

  it("digs five for a Sky Island card other than another Shura", () => {
    const game = table("op05-106")
      .bareTable()
      .withHand("p1", [instance("shura", "OP05-106")])
      .withDeckTop("p1", [
        instance("shura-two", "OP05-106"),
        instance("holly", "OP05-110"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-106" });
    expect(effectOptions(game.state)).not.toContain("shura-two");
    game.play({ type: "resolve-effect", optionId: "holly" });
    settle(game);
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "holly",
    ]);
  });

  it("arrives off Life", () => {
    const game = triggerFrom("op05-106-trigger", "OP05-106");
    game.play({ type: "resolve-trigger", optionId: "activate" });
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP05-106",
    ]);
  });
});

describe("OP05-107 Lieutenant Spacey", () => {
  covers("OP05-107", "[Your Turn]");

  it("grows when a Life card reaches its controller's hand on their turn", () => {
    const game = table("op05-107")
      .bareTable()
      .withLeader("p1", "OP05-060")
      .withBoard("p1", [character("spacey", "OP05-107")])
      .withLife("p1", lifeCards("p1", 2))
      .build();
    game.play({ type: "activate-main", summary: "OP05-060" });
    applyOptional(game);
    game.play({ type: "resolve-effect" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(1);
    expect(currentPower(game.state, "p1", "spacey")).toBe(6_000);
  });
});

describe("OP05-109 Pagaya", () => {
  covers("OP05-109", "static");

  it("draws two and trashes two whenever a Trigger resolves", () => {
    const game = triggerFrom("op05-109", "OP05-106", {
      board: [["pagaya", "OP05-109"]],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    // Shura arrives; Pagaya then draws two of the three deck cards.
    expect(game.state.players.p1.hand).toHaveLength(2);
    game.play({ type: "resolve-effect" });
    game.play({ type: "resolve-effect" });
    settle(game);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.trash).toHaveLength(2);
    expect(game.state.players.p1.board.map((card) => card.cardNumber)).toEqual(
      expect.arrayContaining(["OP05-109", "OP05-106"]),
    );
  });
});

describe("OP05-111 Hotori", () => {
  covers("OP05-111", "[On Play]");

  it("plays a Kotori from hand to push a cost-3 into the opponent's Life", () => {
    const game = table("op05-111")
      .bareTable()
      .withHand("p1", [
        instance("hotori", "OP05-111"),
        instance("kotori", "OP05-103"),
      ])
      .withBoard("p2", [character("hack", "OP05-012")])
      .withLife("p2", lifeCards("p2", 2))
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-111" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "kotori" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    game.play({ type: "resolve-effect", optionId: "life-bottom" });
    settle(game);
    expect(board(game, "p1", "kotori")).toBeDefined();
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.players.p2.life.at(-1)).toMatchObject({
      instanceId: "hack",
      faceUp: true,
    });
  });
});

describe("OP05-112 Captain McKinley", () => {
  covers("OP05-112", "[On K.O.]");

  it("plays a 1-cost Sky Island body when it dies", () => {
    const game = defending("op05-112")
      .bareTable()
      .withBoard("p1", [character("mckinley", "OP05-112", { rested: true })])
      .withHand("p1", [
        instance("pagaya", "OP05-109"),
        instance("shura", "OP05-106"),
      ])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "mckinley",
    });
    declineDefence(game);
    expect(effectOptions(game.state)).not.toContain("shura");
    game.play({ type: "resolve-effect", optionId: "pagaya" });
    expect(board(game, "p1", "pagaya")).toBeDefined();
  });
});

describe("OP05-114 El Thor", () => {
  covers("OP05-114", "[Counter]", "[Trigger]");

  it("adds 2000, and 4000 once the opponent is at two Life", () => {
    const cast = (seed: string, opponentLife: number) => {
      const game = defending(seed)
        .bareTable()
        .withHand("p1", [instance("thor", "OP05-114")])
        .withBoard("p2", [character("attacker", "ST32-004")])
        .withLife("p1", lifeCards("p1", 2))
        .withLife("p2", lifeCards("p2", opponentLife))
        .build();
      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "p1-leader",
      });
      game.pass();
      game.play({ type: "activate-counter-event", cardNumber: "OP05-114" });
      return game.state.activeAttack?.counterPower;
    };
    expect(cast("op05-114-high", 3)).toBe(2_000);
    expect(cast("op05-114-low", 2)).toBe(4_000);
  });

  it("K.O.s by the opponent's Life count off Life", () => {
    const game = triggerFrom("op05-114-trigger", "OP05-114", {
      opponentBoard: [["kuween", "OP05-024"]],
    });
    // p2 has no Life in the fixture: only a cost 0 would qualify.
    expect(effectOptions(game.state)).toEqual([]);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(board(game, "p2", "kuween")).toBeDefined();
  });
});

describe("OP05-115 Two-Hundred Million Volts Amaru", () => {
  covers("OP05-115", "[Main]", "[Trigger]");

  it("buffs, and at one Life rests a cost-4", () => {
    const game = table("op05-115")
      .bareTable()
      .withHand("p1", [instance("amaru", "OP05-115")])
      .withBoard("p2", [character("wall", "ST32-004")])
      .withLife("p1", lifeCards("p1", 1))
      .build();
    game.play({ summary: "[OP05-115]" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });
    game.play({ type: "resolve-effect", optionId: "wall" });
    expect(currentPower(game.state, "p1", "p1-leader")).toBe(8_000);
    expect(board(game, "p2", "wall")!.rested).toBe(true);
  });

  it("trashes two hand cards to put the deck's top card on Life", () => {
    const game = triggerFrom("op05-115-trigger", "OP05-115", {
      hand: ["ST32-004", "ST32-004"],
    });
    game.play({ type: "resolve-trigger", optionId: "activate" });
    applyOptional(game);
    game.play({ type: "resolve-effect" });
    game.play({ type: "resolve-effect" });
    settle(game);
    expect(game.state.players.p1.life).toHaveLength(1);
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(game.state.players.p1.deck).toHaveLength(2);
  });
});

describe("OP05-116 Hino Bird Zap", () => {
  covers("OP05-116", "[Main]", "[Trigger]");

  it("K.O.s by the opponent's Life count", () => {
    const game = table("op05-116")
      .bareTable()
      .withHand("p1", [instance("zap", "OP05-116")])
      .withBoard("p2", [
        character("gladius", "OP05-025"),
        character("hack", "OP05-012"),
      ])
      .withLife("p2", lifeCards("p2", 4))
      .build();
    game.play({ summary: "[OP05-116]" });
    expect(effectOptions(game.state)).not.toContain("gladius");
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(game.state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "gladius",
    ]);
  });

  it("runs the same clause off Life, where the attacker's Life is what counts", () => {
    const game = defending("op05-116-trigger")
      .bareTable()
      .withLife("p1", [instance("life-card", "OP05-116")])
      .withLife("p2", lifeCards("p2", 4))
      .withBoard("p2", [
        character("attacker", "ST32-004"),
        character("hack", "OP05-012"),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    passDefence(game);
    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "hack" });
    expect(board(game, "p2", "hack")).toBeUndefined();
  });
});

describe("OP05-117 Upper Yard (Stage)", () => {
  covers("OP05-117", "[On Play]");

  it("digs five for a Sky Island card when played", () => {
    const game = table("op05-117")
      .bareTable()
      .withHand("p1", [instance("yard", "OP05-117")])
      .withDeckTop("p1", [
        instance("a", "ST32-004"),
        instance("holly", "OP05-110"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-117" });
    game.play({ type: "resolve-effect", optionId: "holly" });
    settle(game);
    expect(game.state.players.p1.stage?.cardNumber).toBe("OP05-117");
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "holly",
    ]);
  });
});

describe("OP05-118 Kaido", () => {
  covers("OP05-118", "[On Play]");

  it("draws four once the opponent is at three Life", () => {
    const game = table("op05-118")
      .bareTable()
      .withHand("p1", [instance("kaido", "OP05-118")])
      .withDeckTop("p1", lifeCards("deck", 5))
      .withLife("p2", lifeCards("p2", 3))
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-118" });
    expect(game.state.players.p1.hand).toHaveLength(4);

    const early = table("op05-118-early")
      .bareTable()
      .withHand("p1", [instance("kaido", "OP05-118")])
      .withDeckTop("p1", lifeCards("deck", 5))
      .withLife("p2", lifeCards("p2", 4))
      .build();
    early.play({ type: "play-card", cardNumber: "OP05-118" });
    expect(early.state.players.p1.hand).toHaveLength(0);
  });
});

describe("OP05-119 Monkey.D.Luffy", () => {
  covers("OP05-119", "[On Play]", "[Activate: Main]");

  it("returns ten DON!!, buries its own board and takes the next turn too", () => {
    const game = table("op05-119")
      .bareTable()
      .withHand("p1", [instance("luffy", "OP05-119")])
      .withBoard("p1", [
        character("hack", "OP05-012"),
        character("kuween", "OP05-024"),
      ])
      .withDeckTop("p1", [instance("p1-draw", "ST32-004")])
      .withDeckTop("p2", [instance("p2-draw", "ST32-004")])
      .build();
    game.play({ type: "play-card", cardNumber: "OP05-119" });
    applyOptional(game);
    payDonMinus(game);
    settle(game);
    expect(game.state.players.p1.donDeck).toHaveLength(10);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "luffy",
    ]);
    expect(
      game.state.players.p1.deck.slice(-2).map((card) => card.instanceId),
    ).toEqual(expect.arrayContaining(["hack", "kuween"]));
    expect(game.state.players.p1.extraTurns).toBe(1);

    const turn = game.state.turn;
    game.pass();
    // The same seat again, on a new turn, with its ordinary Refresh and Draw.
    expect(game.state.turnPlayerId).toBe("p1");
    expect(game.state.activePlayer).toBe("p1");
    expect(game.state.turn).toBe(turn + 1);
    expect(game.state.players.p1.extraTurns).toBeUndefined();
    expect(game.state.players.p1.activeDon).toHaveLength(2);
    game.pass();
    expect(game.state.turnPlayerId).toBe("p2");
  });

  it("buries a watching Character before its returned-DON!! clause can activate", () => {
    // OP05-074 Eustass"Captain"Kid answers "when a DON!! card on your field is
    // returned", and the DON!! −10 is one. It waits for this clause to resolve
    // (CR 8-6-3), and by then Kid is at the bottom of the deck, so it does not
    // activate (CR 8-1-3-1-3). It did: the clause stops to ask the order, and
    // Kid was matched to the return while that question was open.
    const game = table("op05-119-kid")
      .bareTable()
      .withHand("p1", [instance("luffy", "OP05-119")])
      // Two bodies, so the clause stops to ask their order: one alone goes
      // straight to the deck and was never matched to the return at all.
      .withBoard("p1", [
        character("kid", "OP05-074"),
        character("other", "ST32-004"),
      ])
      .build();
    const seen: PublicEvent[] = [];
    game.play({ type: "play-card", cardNumber: "OP05-119" });
    seen.push(...game.events);
    applyOptional(game);
    seen.push(...game.events);
    payDonMinus(game);
    seen.push(...game.events);
    while (game.state.pendingEffect) {
      game.play({ type: "resolve-effect" });
      seen.push(...game.events);
    }

    expect(
      game.state.players.p1.deck.slice(-2).map((card) => card.instanceId),
    ).toContain("kid");
    expect(
      seen.filter((event) =>
        "sourceCardNumber" in event
          ? event.sourceCardNumber === "OP05-074"
          : false,
      ),
    ).toEqual([]);
    expect(game.state.players.p1.donDeck).toHaveLength(10);
  });

  it("still pays off a Black Maria booking it buried, before the extra turn", () => {
    // OP08-074's end-of-turn return belongs to the turn it was activated in,
    // and Bandai's OP-08 Q&A has it paid even after she leaves the field.
    // Here the DON!! −10 already left the field below the opponent's, so the
    // payment is nothing -- and the extra turn starts on the DON!! it draws.
    const game = table("op05-119-maria")
      .bareTable()
      .withBoard("p1", [character("maria", "OP08-074")])
      .withHand("p1", [instance("luffy", "OP05-119")])
      .withDonDeck("p2", 6)
      .withDeckTop("p1", [instance("p1-draw", "ST32-004")])
      .build();
    game.play({ type: "activate-main", summary: "OP08-074" });
    settle(game);
    expect(game.state.players.p1.endOfTurnDonEqualize).toHaveLength(1);
    game.play({ type: "play-card", cardNumber: "OP05-119" });
    applyOptional(game);
    payDonMinus(game);
    settle(game);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "luffy",
    ]);

    const turn = game.state.turn;
    game.pass();
    expect(game.state.turnPlayerId).toBe("p1");
    expect(game.state.turn).toBe(turn + 1);
    expect(game.state.players.p1.endOfTurnDonEqualize).toBeUndefined();
    expect(game.state.players.p1.activeDon).toHaveLength(2);
    expect(game.state.players.p1.donDeck).toHaveLength(8);
  });

  it("rests a DON!! for an active one from the DON!! deck", () => {
    const game = table("op05-119-main")
      .bareTable()
      .withBoard("p1", [character("luffy", "OP05-119")])
      .withDonDeck("p1", 1)
      .build();
    game.play({ type: "activate-main", summary: "OP05-119" });
    expect(game.state.players.p1.donDeck).toHaveLength(0);
    expect(game.state.players.p1.restedDon).toHaveLength(1);
    expect(game.state.players.p1.activeDon).toHaveLength(9);
    expect(activationOffered(game, "OP05-119")).toBe(false);
  });
});
