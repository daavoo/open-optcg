import { describe, expect, it } from "vitest";
import { getLegalActions, hasKeyword } from "@one-piece-sim/engine-core";
import type { GameState } from "@one-piece-sim/engine-core";

import {
  character,
  covers,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

/**
 * Clause tests for cards that are registered and shipped in decks but that no
 * other file drives: one per printed clause, each taken to the decision through
 * public actions. Printed text is `pnpm card:text <card>`.
 *
 * Every position seats the two Red/Green starters and states the card under
 * test with a `with*` setter; where a clause is gated on a Leader, that Leader
 * is stated too, and the same play is shown behind one that fails the gate.
 */

const P1 = "(Red) Monkey.D.Luffy - Starter Deck 31";
const P2 = "(Green) Roronoa Zoro - Starter Deck 32";

/** p1 acting in its own Main Phase. */
const table = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(11, { active: "p1" }).bareTable();

/** p2 acting in its own Main Phase, for removal aimed at p1's board. */
const opponentTurn = (seed: string) =>
  scenario().decks(P1, P2).seed(seed).atTurn(12, { active: "p2" }).bareTable();

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
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

/** Answer the "which DON!! goes back" prompt a `DON!! -N` cost opens. */
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

/** Take the apply branch of an `optional` prompt, if one is open. */
const applyOptional = (game: Game) => {
  if (effectOptions(game.state).includes("apply")) {
    game.play({ type: "resolve-effect", optionId: "apply" });
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
      settleDeclining(game);
      continue;
    }
    game.pass();
  }
};

/** A p2 attack on p1's Leader, already in p1's Counter step. */
const counterStep = {
  attackerPlayerId: "p2",
  defenderPlayerId: "p1",
  attackerInstanceId: "attacker",
  targetInstanceId: "p1-leader",
  attackPower: 6000,
  counterPower: 0,
} as const;

/**
 * p2 swings at p1's Leader and p1's only Life card is `cardNumber`; returns
 * with the Trigger window open.
 */
const triggerFrom = (
  seed: string,
  cardNumber: string,
  options: {
    hand?: string[];
    opponentHand?: string[];
    opponentBoard?: [string, string][];
  } = {},
) => {
  let built = opponentTurn(seed)
    .withLife("p1", [instance("life-card", cardNumber)])
    .withDeckTop("p1", [
      instance("deck-a", "ST31-003"),
      instance("deck-b", "ST31-002"),
      instance("deck-c", "OP11-003"),
    ])
    .withBoard("p2", [
      character("attacker", "ST32-004"),
      ...(options.opponentBoard ?? []).map(([id, number]) =>
        character(id, number),
      ),
    ]);
  if (options.hand) {
    built = built.withHand(
      "p1",
      options.hand.map((number, index) => instance(`hand-${index}`, number)),
    );
  }
  if (options.opponentHand) {
    built = built.withHand(
      "p2",
      options.opponentHand.map((number, index) =>
        instance(`p2-hand-${index}`, number),
      ),
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

/** p2's T-Bone K.O.s up to 1 of p1's Characters with a cost of 2 or less. */
const opponentKoes = (game: Game, targetInstanceId: string) => {
  game.play({ type: "play-card", cardNumber: "EB01-049" });
  game.play({ type: "resolve-effect", optionId: targetInstanceId });
};

describe("printed Blockers", () => {
  covers("EB01-057", "[Blocker]");
  covers("OP17-012", "[Blocker]");
  covers("OP17-108", "[Blocker]");

  it.each(["EB01-057", "OP17-012", "OP17-108"])(
    "%s blocks a declared attack and rests doing it",
    (cardNumber) => {
      const game = opponentTurn(`blocker-${cardNumber}`)
        .withBoard("p2", [character("attacker", "OP11-003")])
        .withBoard("p1", [character("blocker", cardNumber)])
        .build();

      expect(hasKeyword(game.state, "p1", "blocker", "Blocker")).toBe(true);
      game.play({
        type: "attack",
        attackerInstanceId: "attacker",
        targetInstanceId: "p1-leader",
      });
      game.play({ type: "block", blockerInstanceId: "blocker" });

      expect(game.state.activeAttack?.targetInstanceId).toBe("blocker");
      expect(game.state.players.p1.board[0]?.rested).toBe(true);
    },
  );
});

describe("EB01-057 Shirahoshi", () => {
  covers("EB01-057", "static");

  it("banks the top of the deck on Life when the opponent's effect K.O.s it", () => {
    const game = opponentTurn("eb01-057-ko")
      .withBoard("p1", [character("shirahoshi", "EB01-057")])
      .withLife("p1", [instance("life-a", "ST31-003")])
      .withDeckTop("p1", [
        instance("deck-a", "OP11-003"),
        instance("deck-b", "ST31-002"),
      ])
      .withHand("p2", [instance("tbone", "EB01-049")])
      .build();

    opponentKoes(game, "shirahoshi");
    // "Up to 1": the choice is the dead card's controller's.
    expect(game.state.activePlayer).toBe("p1");
    expect(effectOptions(game.state)).toEqual(["deck-a", "done"]);
    game.play({ type: "resolve-effect", optionId: "deck-a" });

    const p1 = game.state.players.p1;
    expect(p1.board).toEqual([]);
    expect(p1.trash.map((card) => card.instanceId)).toContain("shirahoshi");
    expect(p1.life.map((card) => card.instanceId)).toEqual([
      "deck-a",
      "life-a",
    ]);
    expect(p1.deck[0]?.instanceId).toBe("deck-b");
  });

  it("adds nothing when it dies in battle", () => {
    const game = opponentTurn("eb01-057-battle")
      .withBoard("p2", [character("attacker", "OP11-003")])
      .withBoard("p1", [character("shirahoshi", "EB01-057")])
      .withLife("p1", [instance("life-a", "ST31-003")])
      .withDeckTop("p1", [instance("deck-a", "OP11-003")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
    });
    game.play({ type: "block", blockerInstanceId: "shirahoshi" });
    declineDefence(game);

    const p1 = game.state.players.p1;
    expect(p1.trash.map((card) => card.instanceId)).toContain("shirahoshi");
    expect(p1.life.map((card) => card.instanceId)).toEqual(["life-a"]);
    expect(p1.deck[0]?.instanceId).toBe("deck-a");
  });

  it("adds nothing when its controller's own effect K.O.s it", () => {
    // OP05-087 Hakuba's [When Attacking] pays by K.O.ing one of its
    // controller's own Characters.
    const game = table("eb01-057-own-effect")
      .withBoard("p1", [
        character("hakuba", "OP05-087"),
        character("shirahoshi", "EB01-057"),
      ])
      .withGivenDon("p1", "hakuba", 1)
      .withLife("p1", [instance("life-a", "ST31-003")])
      .withDeckTop("p1", [instance("deck-a", "OP11-003")])
      .withBoard("p2", [character("target", "ST32-004")])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "hakuba",
      targetInstanceId: "p2-leader",
    });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "shirahoshi" });
    settleDeclining(game);

    const p1 = game.state.players.p1;
    expect(p1.trash.map((card) => card.instanceId)).toContain("shirahoshi");
    expect(p1.life.map((card) => card.instanceId)).toEqual(["life-a"]);
    expect(p1.deck[0]?.instanceId).toBe("deck-a");
  });
});

describe("OP07-056 Slave Arrow", () => {
  covers("OP07-056", "[Counter]");

  it("returns a cost-2 Character to hand for +4000 during the battle", () => {
    const game = table("op07-056-counter")
      .withHand("p1", [instance("arrow", "OP07-056")])
      .withBoard("p1", [character("brook", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(counterStep, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "arrow" });
    game.play({ type: "resolve-effect", optionId: "brook" });

    const p1 = game.state.players.p1;
    expect(game.state.activeAttack?.counterPower).toBe(4000);
    expect(p1.board).toEqual([]);
    expect(p1.hand.map((card) => card.instanceId)).toContain("brook");
    expect(p1.trash.map((card) => card.instanceId)).toContain("arrow");
  });

  it("gives nothing when the return is declined", () => {
    const game = table("op07-056-decline")
      .withHand("p1", [instance("arrow", "OP07-056")])
      .withBoard("p1", [character("brook", "ST31-003")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(counterStep, "counter")
      .build();

    game.play({ type: "activate-counter-event", eventInstanceId: "arrow" });
    game.play({ type: "resolve-effect", optionId: "skip" });

    expect(game.state.activeAttack?.counterPower).toBe(0);
    expect(game.state.players.p1.board.map((card) => card.instanceId)).toEqual([
      "brook",
    ]);
  });

  it("is not offered with only a cost-1 Character to return", () => {
    const game = table("op07-056-boundary")
      .withHand("p1", [instance("arrow", "OP07-056")])
      .withBoard("p1", [character("tonjit", "OP07-067")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(counterStep, "counter")
      .build();

    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });
});

describe("OP07-056 Slave Arrow Trigger", () => {
  covers("OP07-056", "[Trigger]");

  it("draws 2 and places 2 cards from hand at the bottom of the deck", () => {
    const game = triggerFrom("op07-056-trigger", "OP07-056", {
      hand: ["OP07-067"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    const p1 = () => game.state.players.p1;
    expect(p1().hand.map((card) => card.instanceId)).toEqual([
      "hand-0",
      "deck-a",
      "deck-b",
    ]);
    game.play({ type: "resolve-effect", optionId: "hand-0" });
    game.play({ type: "resolve-effect", optionId: "deck-a" });
    settleDeclining(game);

    expect(p1().hand.map((card) => card.instanceId)).toEqual(["deck-b"]);
    expect(
      p1()
        .deck.slice(-2)
        .map((card) => card.instanceId)
        .sort(),
    ).toEqual(["deck-a", "hand-0"]);
    expect(p1().deck[0]?.instanceId).toBe("deck-c");
    expect(p1().trash.map((card) => card.instanceId)).toContain("life-card");
  });
});

describe("OP17-012 Blenheim", () => {
  covers("OP17-012", "[On K.O.]");

  it("plays a cost-1 card whose type includes Whitebeard Pirates from hand", () => {
    const game = opponentTurn("op17-012-ko")
      .withBoard("p1", [character("blenheim", "OP17-012")])
      .withHand("p1", [
        instance("doma", "EB01-005"),
        instance("fossa", "OP13-047"),
        instance("tonjit", "OP07-067"),
      ])
      .withHand("p2", [instance("tbone", "EB01-049")])
      .build();

    opponentKoes(game, "blenheim");

    // Doma's {Whitebeard Pirates Allies} includes the name; Fossa is cost 2
    // and Tonjit has the cost but not the type.
    const options = effectOptions(game.state);
    expect(options).toContain("doma");
    expect(options).not.toContain("fossa");
    expect(options).not.toContain("tonjit");
    game.play({ type: "resolve-effect", optionId: "doma" });

    const p1 = game.state.players.p1;
    expect(p1.board.map((card) => card.instanceId)).toEqual(["doma"]);
    expect(p1.hand.map((card) => card.instanceId)).toEqual(["fossa", "tonjit"]);
    expect(p1.trash.map((card) => card.instanceId)).toContain("blenheim");
  });
});

describe("OP17-067 Kurozumi Kanjuro", () => {
  covers("OP17-067", "[On Play]");

  it("returns a DON!! and rests an opponent's Character beside a cost-10 body", () => {
    const game = table("op17-067-on-play")
      .withBoard("p1", [character("luffy", "P-041")])
      .withHand("p1", [instance("kanjuro", "OP17-067")])
      .withBoard("p2", [character("san-gorou", "OP05-065")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-067" });
    applyOptional(game);
    payDonMinus(game);
    game.play({ type: "resolve-effect", optionId: "san-gorou" });

    expect(game.state.players.p2.board[0]?.rested).toBe(true);
    expect(game.state.players.p1.donDeck).toHaveLength(1);
  });

  it("rests nothing without a cost-10 Character", () => {
    const game = table("op17-067-boundary")
      .withBoard("p1", [character("usopp", "OP11-003")])
      .withHand("p1", [instance("kanjuro", "OP17-067")])
      .withBoard("p2", [character("san-gorou", "OP05-065")])
      .build();

    game.play({ type: "play-card", cardNumber: "OP17-067" });
    applyOptional(game);
    payDonMinus(game);
    settleDeclining(game);

    expect(game.state.players.p2.board[0]?.rested).toBe(false);
  });
});

describe("OP17-108 Charlotte Brulee Trigger", () => {
  covers("OP17-108", "[Trigger]");

  it("rests an opponent's Character with a cost of 6 or less", () => {
    const game = triggerFrom("op17-108-trigger", "OP17-108", {
      opponentBoard: [
        ["san-gorou", "OP05-065"],
        ["smoothie", "OP08-065"],
      ],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    // Smoothie is cost 7, past the ceiling.
    expect(effectOptions(game.state)).toContain("san-gorou");
    expect(effectOptions(game.state)).not.toContain("smoothie");
    game.play({ type: "resolve-effect", optionId: "san-gorou" });

    const board = game.state.players.p2.board;
    expect(board.find((card) => card.instanceId === "san-gorou")?.rested).toBe(
      true,
    );
    expect(board.find((card) => card.instanceId === "smoothie")?.rested).toBe(
      false,
    );
  });
});

describe("OP17-116 Fulgora", () => {
  covers("OP17-116", "[Main]");

  it("rests 2 DON!! to K.O. an opponent's Stage", () => {
    const game = table("op17-116-main")
      .withHand("p1", [instance("fulgora", "OP17-116")])
      .withStage("p2", instance("coliseum", "OP04-096"))
      .build();

    game.play({ summary: "Activate Fulgora" });
    applyOptional(game);
    game.play({ type: "resolve-effect", optionId: "coliseum" });
    settleDeclining(game);

    expect(game.state.players.p2.stage).toBeNull();
    expect(
      game.state.players.p2.trash.map((card) => card.instanceId),
    ).toContain("coliseum");
    // One for the Event, two for the printed cost.
    expect(game.state.players.p1.restedDon).toHaveLength(3);
  });
});

describe("OP17-116 Fulgora Counter", () => {
  covers("OP17-116", "[Counter]");

  const counter = (seed: string, board: [string, string][]) =>
    table(seed)
      .withHand("p1", [instance("fulgora", "OP17-116")])
      .withBoard(
        "p1",
        board.map(([id, number]) => character(id, number)),
      )
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(counterStep, "counter")
      .build();

  it("gives +4000 with two Characters that have a [Trigger]", () => {
    const game = counter("op17-116-counter", [
      ["brulee-a", "OP17-108"],
      ["brulee-b", "OP17-108"],
    ]);

    game.play({ type: "activate-counter-event", eventInstanceId: "fulgora" });
    settleDeclining(game);

    expect(game.state.activeAttack?.counterPower).toBe(4000);
  });

  it("gives nothing with only one", () => {
    const game = counter("op17-116-boundary", [
      ["brulee-a", "OP17-108"],
      ["brook", "ST31-003"],
    ]);

    // Still playable -- an Event may be activated for an effect that does
    // nothing -- but the condition reads the board as it resolves.
    game.play({ type: "activate-counter-event", eventInstanceId: "fulgora" });
    settleDeclining(game);

    expect(game.state.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "fulgora",
    ]);
    expect(game.state.activeAttack?.counterPower).toBe(0);
  });
});

describe("OP17-117 Maser Saber Counter", () => {
  covers("OP17-117", "[Counter]");

  const counter = (seed: string, leader: string) =>
    table(seed)
      .withLeader("p1", leader)
      .withHand("p1", [instance("saber", "OP17-117")])
      .withBoard("p2", [character("attacker", "ST32-004")])
      .withActiveAttack(counterStep, "counter")
      .build();

  it("gives a [Charlotte Linlin] Leader +3000 during the battle", () => {
    const game = counter("op17-117-counter", "OP17-099");

    game.play({ type: "activate-counter-event", eventInstanceId: "saber" });
    settleDeclining(game);

    expect(game.state.activeAttack?.counterPower).toBe(3000);
  });

  it("is not offered behind another Leader", () => {
    const game = counter("op17-117-boundary", "ST21-001");

    expect(
      game
        .legalActions()
        .some((action) => action.type === "activate-counter-event"),
    ).toBe(false);
  });
});

describe("OP17-117 Maser Saber Trigger", () => {
  covers("OP17-117", "[Trigger]");

  const opponentBoard: [string, string][] = [
    ["san-gorou", "OP05-065"],
    ["smoothie", "OP08-065"],
  ];

  it("lets the opponent trash 3 cards from hand to spare their board", () => {
    const game = triggerFrom("op17-117-trash", "OP17-117", {
      opponentBoard,
      opponentHand: ["ST32-004", "ST32-002", "OP11-003"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "trash" });
    for (const id of ["p2-hand-0", "p2-hand-1", "p2-hand-2"]) {
      if (game.state.pendingEffect?.playerId !== "p2") break;
      game.play({ type: "resolve-effect", optionId: id });
    }
    settleDeclining(game);

    const p2 = game.state.players.p2;
    expect(p2.hand).toEqual([]);
    expect(p2.trash.map((card) => card.instanceId).sort()).toEqual([
      "p2-hand-0",
      "p2-hand-1",
      "p2-hand-2",
    ]);
    expect(p2.board.map((card) => card.instanceId)).toContain("san-gorou");
  });

  it("K.O.s a cost-6 Character when the opponent declines", () => {
    const game = triggerFrom("op17-117-decline", "OP17-117", {
      opponentBoard,
      opponentHand: ["ST32-004", "ST32-002", "OP11-003"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    game.play({ type: "resolve-effect", optionId: "decline" });
    expect(game.state.activePlayer).toBe("p1");
    expect(effectOptions(game.state)).toContain("san-gorou");
    expect(effectOptions(game.state)).not.toContain("smoothie");
    game.play({ type: "resolve-effect", optionId: "san-gorou" });

    const p2 = game.state.players.p2;
    expect(p2.hand).toHaveLength(3);
    expect(p2.board.map((card) => card.instanceId)).not.toContain("san-gorou");
    expect(p2.trash.map((card) => card.instanceId)).toContain("san-gorou");
  });

  it("K.O.s straight away when the opponent holds fewer than 3 cards", () => {
    const game = triggerFrom("op17-117-short", "OP17-117", {
      opponentBoard,
      opponentHand: ["ST32-004", "ST32-002"],
    });

    game.play({ type: "resolve-trigger", optionId: "activate" });
    expect(game.state.activePlayer).toBe("p1");
    game.play({ type: "resolve-effect", optionId: "san-gorou" });

    expect(game.state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "san-gorou",
    ]);
  });
});

describe("P-045 Roronoa Zoro", () => {
  covers("P-045", "[Banish]");

  it("trashes the Life card it takes without offering its Trigger", () => {
    const game = table("p-045-banish")
      .withBoard("p1", [character("zoro", "P-045")])
      .withLife("p2", [
        instance("life-trigger", "OP17-108"),
        instance("life-b", "ST32-004"),
      ])
      .build();

    game.play({
      type: "attack",
      attackerInstanceId: "zoro",
      targetInstanceId: "p2-leader",
    });
    let guard = 0;
    while (game.state.phase === "block" || game.state.phase === "counter") {
      if (guard++ > 20) throw new Error("battle never settled");
      expect(
        game.legalActions().some((action) => action.type === "resolve-trigger"),
      ).toBe(false);
      game.pass();
    }

    const p2 = game.state.players.p2;
    expect(p2.life.map((card) => card.instanceId)).toEqual(["life-b"]);
    expect(p2.trash.map((card) => card.instanceId)).toEqual(["life-trigger"]);
    expect(p2.hand).toEqual([]);
    expect(p2.board).toEqual([]);
  });
});

describe("P-096 Girl On Play", () => {
  covers("P-096", "[On Play]");

  it("draws 1 card and then trashes 1 from hand", () => {
    const game = table("p-096-on-play")
      .withHand("p1", [instance("girl", "P-096"), instance("keep", "ST31-002")])
      .withDeckTop("p1", [instance("drawn", "OP11-003")])
      .build();

    game.play({ type: "play-card", cardNumber: "P-096" });
    expect(game.state.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "keep",
      "drawn",
    ]);
    game.play({ type: "resolve-effect", optionId: "keep" });

    const p1 = game.state.players.p1;
    expect(p1.hand.map((card) => card.instanceId)).toEqual(["drawn"]);
    expect(p1.trash.map((card) => card.instanceId)).toEqual(["keep"]);
  });
});

describe("P-096 Girl Activate: Main", () => {
  covers("P-096", "[Activate: Main]");

  it("gives a rested DON!! to a [Nami] Character, once per turn", () => {
    const game = table("p-096-activate")
      .withBoard("p1", [
        character("girl", "P-096"),
        character("nami", "OP10-013"),
        character("usopp", "OP11-003"),
      ])
      .withDon("p1", { rested: 2 })
      .build();

    game.play({ type: "activate-main", summary: "P-096" });
    expect(effectOptions(game.state)).toContain("nami");
    expect(effectOptions(game.state)).not.toContain("usopp");
    game.play({ type: "resolve-effect", optionId: "nami" });

    const p1 = game.state.players.p1;
    expect(
      p1.board.find((card) => card.instanceId === "nami")?.attachedDon,
    ).toHaveLength(1);
    expect(p1.restedDon).toHaveLength(1);
    expect(
      game
        .legalActions()
        .some(
          (action) =>
            action.type === "activate-main" && action.summary.includes("P-096"),
        ),
    ).toBe(false);
  });

  it("can give it to a [Nami] Leader", () => {
    const game = table("p-096-leader")
      .withLeader("p1", "OP11-041")
      .withBoard("p1", [character("girl", "P-096")])
      .withDon("p1", { rested: 1 })
      .build();

    game.play({ type: "activate-main", summary: "P-096" });
    game.play({ type: "resolve-effect", optionId: "p1-leader" });

    expect(game.state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(game.state.players.p1.restedDon).toHaveLength(0);
  });
});
