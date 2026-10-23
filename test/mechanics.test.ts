import { describe, expect, it } from "vitest";
import {
  createGame,
  executeMechanicProgram,
  getMechanicChoiceOptions,
  resolveMechanicChoice,
  type MechanicProgram,
} from "@one-piece-sim/engine-core";

import { resolveDeck } from "@one-piece-sim/decks";

const lifeCost = (effect: MechanicProgram["effect"]): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: { player: "self", zone: "life", position: "top" },
      bind: "life-cost",
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "move",
            binding: "life-cost",
            to: { player: "self", zone: "hand" },
          },
          effect,
        ],
      },
    },
  },
});

describe("generic mechanic programs", () => {
  it("reads an anyOf branch's zone only against cards from that zone", () => {
    const state = createGame({
      gameId: "mechanic-anyof-zone",
      p1: resolveDeck("(Black) Imu - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "mechanic-anyof-zone",
    });
    const body = (instanceId: string, cardNumber: string) => ({
      instanceId,
      cardNumber,
      rested: false,
      attachedDon: [],
      powerModifiers: [],
    });
    state.players.p1.board = [
      body("dragon", "OP13-086"),
      body("outsider", "PRB02-014"),
    ];
    state.players.p1.hand = [{ instanceId: "any", cardNumber: "PRB02-014" }];

    const result = executeMechanicProgram(
      state,
      {
        sourcePlayerId: "p1",
        source: { instanceId: "src", cardNumber: "OP13-079" },
      },
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: ["board", "hand"],
            anyOf: [
              { zone: "board", type: "Celestial Dragons" },
              { zone: "hand" },
            ],
          },
          bind: "picked",
          min: 1,
          max: 1,
          effect: {
            kind: "move",
            binding: "picked",
            to: { player: "self", zone: "trash" },
          },
        },
      },
    );

    // The same card number is eligible from hand and not from the board: the
    // type half of the disjunction belongs to the board alone.
    const options = getMechanicChoiceOptions(state, result.pending!);
    expect(options).toEqual(expect.arrayContaining(["dragon", "any"]));
    expect(options).not.toContain("outsider");
  });

  it("composes a Life cost with Hiyori's replacement-Life choice", () => {
    const state = createGame({
      gameId: "mechanic-hiyori",
      p1: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "mechanic-hiyori",
    });
    const source = { instanceId: "hiyori", cardNumber: "OP06-106" };
    state.players.p1.life.push(...state.players.p1.deck.splice(0, 5));
    const originalLife = state.players.p1.life[0]!;
    state.players.p1.hand = [
      { instanceId: "replacement", cardNumber: "OP14-102" },
    ];

    let result = executeMechanicProgram(
      state,
      { sourcePlayerId: "p1", source },
      lifeCost({
        kind: "choose",
        selector: { player: "self", zone: "hand" },
        bind: "replacement",
        min: 0,
        max: 1,
        effect: {
          kind: "move",
          binding: "replacement",
          to: { player: "self", zone: "life", position: "top" },
        },
      }),
    );
    result = resolveMechanicChoice(state, result.pending!, "apply");
    result = resolveMechanicChoice(
      state,
      result.pending!,
      originalLife.instanceId,
    );
    expect(getMechanicChoiceOptions(state, result.pending!)).toContain(
      "replacement",
    );
    result = resolveMechanicChoice(state, result.pending!, "replacement");

    expect(result.pending).toBeNull();
    expect(state.players.p1.life[0]?.cardNumber).toBe("OP14-102");
    expect(state.players.p1.hand).toContainEqual({
      instanceId: originalLife.instanceId,
      cardNumber: originalLife.cardNumber,
    });
  });

  it("composes the same Life cost with Zeus's opponent K.O.", () => {
    const state = createGame({
      gameId: "mechanic-zeus",
      p1: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "mechanic-zeus",
    });
    const source = { instanceId: "zeus", cardNumber: "OP11-106" };
    state.players.p1.life.push(...state.players.p1.deck.splice(0, 5));
    const life = state.players.p1.life[0]!;
    state.players.p2.board = [
      {
        instanceId: "target",
        cardNumber: "OP11-012",
        rested: false,
        attachedDon: [],
        powerModifiers: [],
      },
    ];

    let result = executeMechanicProgram(
      state,
      { sourcePlayerId: "p1", source },
      lifeCost({
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxCost: 5,
        },
        bind: "ko-target",
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: "ko-target" },
      }),
    );
    result = resolveMechanicChoice(state, result.pending!, "apply");
    result = resolveMechanicChoice(state, result.pending!, life.instanceId);
    result = resolveMechanicChoice(state, result.pending!, "target");

    expect(result.pending).toBeNull();
    expect(state.players.p2.board).toHaveLength(0);
    expect(state.players.p2.trash.at(-1)?.cardNumber).toBe("OP11-012");
  });

  it("filters by current power floor, counting attached DON!!", () => {
    const state = createGame({
      gameId: "mechanic-min-power",
      p1: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "mechanic-min-power",
    });
    const source = { instanceId: "sanji", cardNumber: "ST21-003" };
    // Same Straw Hat Crew seat twice, different current power: Brook is 3000
    // base but carries three DON!! to clear a 6000 floor, while Sanji stays at
    // 3000 -- a bare Brook would inherit +3000 from its own given-DON layer
    // once the carrier's DON!! count on the field, so the two share one static.
    state.players.p1.board = [
      {
        instanceId: "carrier",
        cardNumber: "ST31-003",
        rested: false,
        playedTurn: 1,
        attachedDon: ["don-a", "don-b", "don-c"],
        powerModifiers: [],
      },
      {
        instanceId: "bare",
        cardNumber: "ST31-001",
        rested: false,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];

    const result = executeMechanicProgram(
      state,
      { sourcePlayerId: "p1", source },
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Straw Hat Crew",
            minCurrentPower: 6_000,
          },
          bind: "floor-target",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "floor-target",
            keyword: "Unblockable",
            expiresAfterTurns: 0,
          },
        },
      },
    );

    expect(getMechanicChoiceOptions(state, result.pending!)).toEqual([
      "carrier",
      "done",
    ]);
    const resolved = resolveMechanicChoice(state, result.pending!, "carrier");
    expect(resolved.pending).toBeNull();
    const carrier = state.players.p1.board.find(
      (card) => card.instanceId === "carrier",
    );
    expect(carrier?.unblockableUntilTurn).toBe(state.turn);
    expect(
      state.players.p1.board.find((card) => card.instanceId === "bare")
        ?.unblockableUntilTurn,
    ).toBeUndefined();
  });

  it("gives rested DON!! to a chosen Leader or Character, or declines", () => {
    const state = createGame({
      gameId: "mechanic-give-rested-don",
      p1: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "mechanic-give-rested-don",
    });
    const source = { instanceId: "luffy", cardNumber: "ST21-014" };
    state.players.p1.restedDon = ["r1", "r2"];
    state.players.p1.board = [
      {
        instanceId: "target",
        cardNumber: "ST31-001",
        rested: false,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];
    const program: MechanicProgram = {
      effect: { kind: "give-rested-don", player: "self", count: 1 },
    };

    // The choice offers the Leader, the Character, and decline.
    let result = executeMechanicProgram(
      state,
      { sourcePlayerId: "p1", source },
      program,
    );
    expect(getMechanicChoiceOptions(state, result.pending!)).toEqual([
      "p1-leader",
      "target",
      "skip",
    ]);

    // Give to the Character: exactly one rested DON!! moves and attaches.
    result = resolveMechanicChoice(state, result.pending!, "target");
    expect(result.pending).toBeNull();
    expect(state.players.p1.restedDon).toEqual(["r2"]);
    expect(
      state.players.p1.board.find((card) => card.instanceId === "target")
        ?.attachedDon,
    ).toEqual(["r1"]);
    expect(state.players.p1.leaderAttachedDon).toEqual([]);
    expect(result.events).toContainEqual({
      type: "don-attached",
      playerId: "p1",
      targetInstanceId: "target",
      count: 1,
    });

    // Give the next one to the Leader.
    result = executeMechanicProgram(
      state,
      { sourcePlayerId: "p1", source },
      program,
    );
    result = resolveMechanicChoice(state, result.pending!, "p1-leader");
    expect(result.pending).toBeNull();
    expect(state.players.p1.restedDon).toEqual([]);
    expect(state.players.p1.leaderAttachedDon).toEqual(["r2"]);
  });

  it("skips give-rested-don on decline or with no rested DON!!", () => {
    const state = createGame({
      gameId: "mechanic-give-rested-don-skip",
      p1: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "mechanic-give-rested-don-skip",
    });
    const source = { instanceId: "luffy", cardNumber: "ST21-014" };
    state.players.p1.restedDon = ["r1"];
    state.players.p1.board = [
      {
        instanceId: "target",
        cardNumber: "ST31-001",
        rested: false,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];
    const program: MechanicProgram = {
      effect: { kind: "give-rested-don", player: "self", count: 1 },
    };

    let result = executeMechanicProgram(
      state,
      { sourcePlayerId: "p1", source },
      program,
    );
    result = resolveMechanicChoice(state, result.pending!, "skip");
    expect(result.pending).toBeNull();
    expect(state.players.p1.restedDon).toEqual(["r1"]);
    expect(state.players.p1.leaderAttachedDon).toEqual([]);

    // No rested DON!!: the node offers no choice and changes nothing.
    state.players.p1.restedDon = [];
    result = executeMechanicProgram(
      state,
      { sourcePlayerId: "p1", source },
      program,
    );
    expect(result.pending).toBeNull();
    expect(state.players.p1.board[0]?.attachedDon).toEqual([]);
  });

  it("filters give-rested-don targets by type, including the Leader", () => {
    const state = createGame({
      gameId: "mechanic-give-rested-don-type",
      p1: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "mechanic-give-rested-don-type",
    });
    const source = { instanceId: "wyper", cardNumber: "OP15-114" };
    state.players.p1.restedDon = ["r1"];
    // A {Sky Island} Leader, a {Sky Island} Character, and a non-Sky Island
    // Character: the printed text names "[printed text omitted -- pnpm card:text OP15-114]", so only the first two may be offered.
    state.players.p1.leaderCardNumber = "OP15-058";
    state.players.p1.board = [
      {
        instanceId: "ohm",
        cardNumber: "OP15-061",
        rested: false,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
      {
        instanceId: "kumacy",
        cardNumber: "OP14-102",
        rested: false,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];
    const program: MechanicProgram = {
      effect: {
        kind: "give-rested-don",
        player: "self",
        count: 1,
        type: "Sky Island",
      },
    };

    let result = executeMechanicProgram(
      state,
      { sourcePlayerId: "p1", source },
      program,
    );
    // The non-Sky Island Kumacy is excluded; the Sky Island Leader is offered.
    expect(getMechanicChoiceOptions(state, result.pending!)).toEqual([
      "p1-leader",
      "ohm",
      "skip",
    ]);

    // Giving to the Leader works through the same path as an unfiltered node.
    result = resolveMechanicChoice(state, result.pending!, "p1-leader");
    expect(result.pending).toBeNull();
    expect(state.players.p1.leaderAttachedDon).toEqual(["r1"]);
    expect(state.players.p1.restedDon).toEqual([]);
  });
});

describe("field-don-versus with a margin", () => {
  /**
   * EB05-033 Nico Robin's gate: at least `by` fewer DON!! on the field than
   * the opponent. Read on both sides of the boundary, and with `by` absent so
   * the bare "fewer" every earlier caller prints still means one.
   */
  const drawsAt = (own: number, other: number, by?: number): boolean => {
    const state = createGame({
      gameId: "mechanic-don-margin",
      p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "mechanic-don-margin",
    });
    for (const [playerId, count] of [
      ["p1", own],
      ["p2", other],
    ] as const) {
      const side = state.players[playerId];
      const pool = [...side.activeDon, ...side.donDeck];
      side.activeDon = pool.splice(0, count);
      side.donDeck = pool;
    }
    const before = state.players.p1.hand.length;
    executeMechanicProgram(
      state,
      {
        sourcePlayerId: "p1",
        source: { instanceId: "src", cardNumber: "EB05-033" },
      },
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don-versus",
            player: "self",
            operator: "lt",
            ...(by === undefined ? {} : { by }),
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    );
    return state.players.p1.hand.length > before;
  };

  it("holds at exactly the margin and not one short of it", () => {
    expect(drawsAt(4, 10, 6)).toBe(true);
    expect(drawsAt(5, 10, 6)).toBe(false);
    expect(drawsAt(0, 10, 6)).toBe(true);
  });

  it("defaults to a margin of one", () => {
    expect(drawsAt(9, 10)).toBe(true);
    expect(drawsAt(10, 10)).toBe(false);
  });
});
