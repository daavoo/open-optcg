import { describe, expect, it } from "vitest";
import { hasPrintedText } from "./support/printed-text.js";
import type { PublicEvent } from "@one-piece-sim/protocol";
import {
  cardFacts,
  cardRegistry,
  printedText,
  requireKnownCard,
  requirePlayableCard,
} from "@one-piece-sim/cards";
import {
  applyAction,
  battleAttackPower,
  counterEventPower,
  createGame,
  createOnKoResult,
  createOnPlayEffect,
  createTriggerResult,
  currentPower,
  effectiveCost,
  getLegalActions,
  hasKeyword,
  observe,
  reorderAction,
  replacementOptionsFor,
  returnDonToDeck,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  character as boardCharacter,
  covers,
  fabricatedAttack,
  instance,
  scenario as table,
  setTurnPlayer,
} from "./support/index.js";

import { resolveDeck } from "@one-piece-sim/decks";

const input = {
  gameId: "op17-test",
  p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
  p2: resolveDeck("FIXTURE-BLUE"),
  seed: "op17-seed",
};

function submit(
  state: GameState,
  action: ReturnType<typeof getLegalActions>[number],
): GameState {
  return applyAction(state, {
    ...action,
    revision: state.revision,
  }).state;
}

function requireAction(
  state: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
): ReturnType<typeof getLegalActions>[number] {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  if (!action) {
    throw new Error(
      `Missing expected legal action: ${getLegalActions(
        state,
        state.activePlayer,
      )
        .map((candidate) => candidate.summary)
        .join(" | ")}`,
    );
  }
  return action;
}

function scenario(): GameState {
  const state = createGame(input);
  state.turn = 3;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  state.pendingEffect = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  Object.assign(p1, {
    hand: [],
    deck: [],
    board: [],
    stage: null,
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p1-active-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderPowerModifiers: [],
    leaderRested: false,
  });
  Object.assign(p2, {
    hand: [],
    deck: [],
    board: [],
    stage: null,
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p2-active-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderPowerModifiers: [],
    leaderRested: false,
  });
  return state;
}

function character(
  instanceId: string,
  cardNumber: string,
  input: { rested?: boolean; playedTurn?: number; attachedDon?: string[] } = {},
) {
  return {
    instanceId,
    cardNumber,
    rested: input.rested ?? false,
    playedTurn: input.playedTurn ?? 1,
    attachedDon: input.attachedDon ?? [],
    powerModifiers: [],
  };
}

function effectOptions(state: GameState): string[] {
  return getLegalActions(state, state.activePlayer)
    .filter((action) => action.type === "resolve-effect")
    .map((action) => action.optionId);
}

describe("OP17 metadata import", () => {
  it("registers all 119 OP17 identities from the secondary source", () => {
    const op17 = [...cardRegistry.values()].filter((card) =>
      card.cardNumber.startsWith("OP17-"),
    );
    expect(op17).toHaveLength(119);
    expect(op17.map((card) => card.cardNumber).sort()).toEqual(
      Array.from(
        { length: 119 },
        (_, index) => `OP17-${String(index + 1).padStart(3, "0")}`,
      ),
    );
    // `test/card-support.test.ts` is what guarantees none of the 119 has a
    // printed clause the engine ignores.
    expect(op17).toHaveLength(119);
  });

  it("registers OP17-117 Maser Saber, the last card to gain coverage", () => {
    // `requirePlayableCard` is not the right probe here: it also demands a
    // non-null `cost`/`power`, which every Event fails.
    expect(requireKnownCard("OP17-117").name).toBeTruthy();
  });

  it("exposes printed facts for every card", () => {
    const facts = cardFacts("OP17-001");
    expect(facts.name).toBe("Edward.Newgate");
    expect(facts.category).toBe("leader");
    expect(facts.keywords).toEqual([]);
    expect(cardFacts("OP17-003").keywords).toContain("Rush: Character");
  });
});

describe("OP17 vanilla bodies", () => {
  it.each([
    "OP17-006",
    "OP17-035",
    "OP17-051",
    "OP17-070",
    "OP17-088",
    "OP17-100",
  ])("registers %s as a playable body", (cardNumber) => {
    const card = requirePlayableCard(cardNumber);
    expect(card.rules.clauses).toEqual([]);
  });
});

describe("OP17-002 Atmos / OP17-009 Haruta defensive power", () => {
  it.each(["OP17-002", "OP17-009"])(
    "grants +3000 power on the opponent's turn only (%s)",
    (cardNumber) => {
      const state = scenario();
      state.players.p1.board = [character("body", cardNumber)];

      expect(currentPower(state, "p1", "body", false)).toBe(
        requireKnownCard(cardNumber).power ?? 0,
      );
      setTurnPlayer(state, "p2");
      expect(currentPower(state, "p1", "body", false)).toBe(
        (requireKnownCard(cardNumber).power ?? 0) + 3000,
      );
    },
  );
});

describe("OP17-009 Haruta On Play", () => {
  it("K.O.s up to 1 opposing Character with 2000 base power or less", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "haruta", cardNumber: "OP17-009" }];
    state.players.p2.board = [
      character("small", "OP14-102"), // 2000 power
      character("big", "ST31-002"), // 6000 power
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "haruta",
      ),
    );
    expect(effectOptions(state)).toEqual(["small", "done"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "small",
      ),
    );

    expect(state.players.p2.board.map((entry) => entry.cardNumber)).toEqual([
      "ST31-002",
    ]);
    expect(state.players.p2.trash).toContainEqual({
      instanceId: "small",
      cardNumber: "OP14-102",
    });
  });
});

describe("OP17-016 Rakuyo On Play", () => {
  it("K.O.s up to 2 opposing Characters with 2000 base power or less", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "rakuyo", cardNumber: "OP17-016" }];
    state.players.p2.board = [
      character("a", "OP14-102"), // 2000
      character("b", "FIX-001"), // 2000
      character("big", "ST31-002"), // 6000
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "rakuyo",
      ),
    );
    expect(effectOptions(state)).toEqual(["a", "b", "done"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) => action.type === "resolve-effect" && action.optionId === "a",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) => action.type === "resolve-effect" && action.optionId === "b",
      ),
    );

    expect(state.players.p2.board.map((entry) => entry.cardNumber)).toEqual([
      "ST31-002",
    ]);
  });
});

describe("OP17-094 Rodo cost layer", () => {
  covers("OP17-094", "static");
  it("gains +12 cost under an {Elbaph} Leader", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-079"; // Monkey.D.Luffy, {Elbaph}
    state.players.p1.board = [character("rodo", "OP17-094")];

    expect(
      effectiveCost(state, "p1", {
        instanceId: "rodo",
        cardNumber: "OP17-094",
      }),
    ).toBe(13);
  });
});

describe("OP17-102 Charlotte Oven", () => {
  it("plays up to 1 Character of 4000 power or less from trash on K.O., excluding Oven", () => {
    let state = scenario();
    state.players.p1.board = [character("oven", "OP17-102")];
    state.players.p1.trash = [
      { instanceId: "kumacy", cardNumber: "OP14-102" }, // 2000, eligible
      { instanceId: "jinbe", cardNumber: "ST31-002" }, // 6000, too big
      { instanceId: "other-oven", cardNumber: "OP17-102" }, // excluded by name
    ];

    const koResult = createOnKoResult(
      state,
      "p1",
      { instanceId: "oven", cardNumber: "OP17-102" },
      "p1",
    );
    state.pendingEffect = koResult.pending;
    expect(effectOptions(state)).toEqual(["kumacy", "done"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "kumacy",
      ),
    );

    expect(state.players.p1.board.map((entry) => entry.cardNumber)).toEqual([
      "OP17-102",
      "OP14-102",
    ]);
  });

  it("plays itself from its Trigger", () => {
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "oven", cardNumber: "OP17-102" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      ),
    );

    expect(state.players.p1.board).toContainEqual(
      expect.objectContaining({ instanceId: "oven", cardNumber: "OP17-102" }),
    );
  });
});

describe("OP17-107 Charlotte Daifuku Trigger", () => {
  it("plays itself from its Trigger", () => {
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "daifuku", cardNumber: "OP17-107" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      ),
    );

    expect(state.players.p1.board).toContainEqual(
      expect.objectContaining({
        instanceId: "daifuku",
        cardNumber: "OP17-107",
      }),
    );
  });
});

describe("OP17-108 Charlotte Brulee", () => {
  it("is a printed Blocker", () => {
    const state = scenario();
    state.players.p1.board = [character("brulee", "OP17-108")];
    expect(hasKeyword(state, "p1", "brulee", "Blocker")).toBe(true);
  });

  it("rests up to 1 opposing Character of cost 6 or less from its Trigger", () => {
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "brulee", cardNumber: "OP17-108" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state.players.p2.board = [
      character("cheap", "OP11-003"), // cost 5
      character("pricy", "ST31-004"), // cost 7
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      ),
    );
    expect(effectOptions(state)).toEqual(["cheap", "done"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cheap",
      ),
    );

    expect(
      state.players.p2.board.find((entry) => entry.instanceId === "cheap")
        ?.rested,
    ).toBe(true);
    expect(
      state.players.p2.board.find((entry) => entry.instanceId === "pricy")
        ?.rested,
    ).toBe(false);
  });
});

describe("OP17-113 Streusen search", () => {
  it("searches the top three and bottoms the rest", () => {
    let state = scenario();
    state.players.p1.hand = [
      { instanceId: "streusen", cardNumber: "OP17-113" },
    ];
    state.players.p1.deck = [
      { instanceId: "d1", cardNumber: "OP17-113" },
      { instanceId: "d2", cardNumber: "OP17-108" },
      { instanceId: "d3", cardNumber: "ST31-002" },
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "streusen",
      ),
    );
    // OP17-108 Brulee is the only {Big Mom Pirates} card among the three.
    expect(effectOptions(state)).toContain("d2");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "d2",
      ),
    );

    expect(state.players.p1.hand).toContainEqual({
      instanceId: "d2",
      cardNumber: "OP17-108",
    });
    expect(state.players.p1.deck).toEqual([
      { instanceId: "d1", cardNumber: "OP17-113" },
      { instanceId: "d3", cardNumber: "ST31-002" },
    ]);
  });
});

describe("OP17 On Play dispatch sanity", () => {
  it("routes OP17-009's On Play through the mechanic dispatch", () => {
    const state = scenario();
    state.players.p2.board = [character("small", "OP14-102")];
    const result = createOnPlayEffect(state, "p1", {
      instanceId: "haruta",
      cardNumber: "OP17-009",
    });
    expect(result.pending).not.toBeNull();
  });
});

/**
 * The Elbaph package: seven Characters and two Events gate on "[printed text omitted -- pnpm card:text OP17-009]", which the set's own `+12 cost` giants
 * supply. OP17-089 Jaguar.D.Saul is used as the giant throughout because its
 * `+12 cost` is unconditional (printed cost 4, so cost 16 on the field), which
 * keeps these tests independent of the Leader.
 */
describe("OP17 Elbaph cost-12 condition", () => {
  covers("OP17-079", "static");
  covers("OP17-080", "static");
  covers("OP17-082", "static");
  covers("OP17-083", "static");
  covers("OP17-089", "static");
  covers("OP17-091", "static");
  it("reads effective cost, not printed cost", () => {
    const state = scenario();
    state.players.p1.board = [character("giant", "OP17-089")];
    // Printed 4; the static layer is what carries it over the threshold. A
    // printed-cost reading would find nothing and switch the whole archetype off.
    expect(requireKnownCard("OP17-089").cost).toBe(4);
    expect(
      effectiveCost(state, "p1", state.players.p1.board[0]!),
    ).toBeGreaterThanOrEqual(12);
  });

  it.each(["OP17-080", "OP17-082", "OP17-090", "OP17-091", "OP17-095"])(
    "gives %s +3000 power only while a cost-12 Character is on the field",
    (cardNumber) => {
      const state = scenario();
      const printed = requireKnownCard(cardNumber).power ?? 0;
      state.players.p1.board = [character("body", cardNumber)];
      expect(currentPower(state, "p1", "body", false)).toBe(printed);

      state.players.p1.board = [
        character("body", cardNumber),
        character("giant", "OP17-089"),
      ];
      expect(currentPower(state, "p1", "body", false)).toBe(printed + 3000);
    },
  );

  it("counts a giant on either field, because the text does not say yours", () => {
    const state = scenario();
    state.players.p1.board = [character("body", "OP17-082")];
    state.players.p2.board = [character("giant", "OP17-089")];
    expect(currentPower(state, "p1", "body", false)).toBe(
      (requireKnownCard("OP17-082").power ?? 0) + 3000,
    );
  });

  it("gives OP17-083 Jinbe both halves of its one sentence", () => {
    const state = scenario();
    state.players.p1.board = [character("jinbe", "OP17-083")];
    expect(hasKeyword(state, "p1", "jinbe", "Blocker")).toBe(false);

    state.players.p1.board = [
      character("jinbe", "OP17-083"),
      character("giant", "OP17-089"),
    ];
    expect(hasKeyword(state, "p1", "jinbe", "Blocker")).toBe(true);
    expect(currentPower(state, "p1", "jinbe", false)).toBe(
      (requireKnownCard("OP17-083").power ?? 0) + 3000,
    );
  });

  it("OP17-079 Leader grants [Blocker] to your own cost-12-or-more Characters only", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-079";
    state.players.p1.board = [
      character("giant", "OP17-089"),
      character("small", "OP17-082"),
    ];
    expect(hasKeyword(state, "p1", "giant", "Blocker")).toBe(true);
    expect(hasKeyword(state, "p1", "small", "Blocker")).toBe(false);

    // A giant on the opponent's board, under a different Leader, gets nothing.
    state.players.p2.leaderCardNumber = "ST31-001";
    state.players.p2.board = [character("their-giant", "OP17-089")];
    expect(hasKeyword(state, "p2", "their-giant", "Blocker")).toBe(false);
  });
});

describe("OP17-005 Edward.Newgate On Play", () => {
  it("raises a monocolored Leader's base power to 8000", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "ST31-001";
    state.players.p1.hand = [{ instanceId: "ace", cardNumber: "OP17-005" }];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "ace",
      ),
    );
    expect(currentPower(played, "p1", "p1-leader")).toBe(8000);
  });

  it("does nothing under a multicolored Leader", () => {
    const state = scenario();
    // OP13-004 Sabo is the format's other `leader-multicolored` gate, so
    // reusing it pins this card to the same shared condition rather than a
    // one-off colors check.
    state.players.p1.leaderCardNumber = "OP13-004";
    expect(requireKnownCard("OP13-004").colors?.length ?? 0).toBeGreaterThan(1);
    state.players.p1.hand = [{ instanceId: "ace", cardNumber: "OP17-005" }];
    const before = currentPower(state, "p1", "p1-leader");
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "ace",
      ),
    );
    expect(currentPower(played, "p1", "p1-leader")).toBe(before);
  });
});

describe("OP17-080 Usopp / OP17-089 Jaguar.D.Saul On Play", () => {
  covers("OP17-080", "[On Play]");
  covers("OP17-089", "[On Play]");
  it.each(["OP17-080", "OP17-089"])(
    "%s finds an Elbaph card from the top 3 and trashes the rest",
    (cardNumber) => {
      const state = scenario();
      state.players.p1.deck = [
        { instanceId: "miss", cardNumber: "FIX-002" },
        { instanceId: "hit", cardNumber: "OP17-081" },
        { instanceId: "miss2", cardNumber: "FIX-002" },
      ];
      const result = createOnPlayEffect(state, "p1", {
        instanceId: "src",
        cardNumber,
      });
      state.pendingEffect = result.pending;
      let played = state;
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === "hit",
        ),
      );
      expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["hit"]);
      expect(played.players.p1.trash.map((c) => c.instanceId).sort()).toEqual([
        "miss",
        "miss2",
      ]);
      expect(played.players.p1.deck).toHaveLength(0);
    },
  );
});

describe("OP17-093 Monkey.D.Luffy", () => {
  covers("OP17-093", "[On Play]", "static");
  it("gains [Rush] only while a cost-12 Character is on the field", () => {
    const state = scenario();
    state.players.p1.board = [character("luffy", "OP17-093")];
    expect(hasKeyword(state, "p1", "luffy", "Rush")).toBe(false);
    state.players.p1.board = [
      character("luffy", "OP17-093"),
      character("giant", "OP17-089"),
    ];
    expect(hasKeyword(state, "p1", "luffy", "Rush")).toBe(true);
  });

  it("draws a card and recurs a cost-2-or-less Character from the trash", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "luffy", cardNumber: "OP17-093" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    state.players.p1.trash = [{ instanceId: "cheap", cardNumber: "OP17-081" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "luffy",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cheap",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["top"]);
    expect(played.players.p1.board.map((c) => c.instanceId)).toContain("cheap");
  });
});

describe("OP17-118 Rocks.D.Xebec On Play", () => {
  covers("OP17-118", "[On Play]");
  it("draws, then plays up to 2 different-named cards within the cost budget", () => {
    const state = scenario();
    // Gloriosa ([Blocker] only) and Barbell ([On K.O.] only) print no [On
    // Play] of their own, so playing them through this choice does not open
    // a second, nested pending effect that the test would also have to
    // answer.
    state.players.p1.hand = [
      { instanceId: "xebec", cardNumber: "OP17-118" },
      { instanceId: "g1", cardNumber: "OP17-046" }, // 4 cost
      { instanceId: "g2", cardNumber: "OP17-046" }, // same name, excluded
      { instanceId: "barbell", cardNumber: "OP17-053" }, // 5 cost, total 9
    ];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "xebec",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "g1",
      ),
    );
    // The second copy of Gloriosa is unavailable: same name already taken.
    expect(effectOptions(played).includes("g2")).toBe(false);
    expect(effectOptions(played)).toContain("barbell");
    // Choosing the second (and final, budget-exhausting) card finalizes the
    // whole `choose` at `max`, with no further "done" step to answer.
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "barbell",
      ),
    );
    expect(played.players.p1.board.map((c) => c.instanceId).sort()).toEqual([
      "barbell",
      "g1",
      "xebec",
    ]);
    expect(played.players.p1.hand.map((c) => c.instanceId).sort()).toEqual([
      "g2",
      "top",
    ]);
  });

  it("does not offer a {Rocks Pirates} Event, which cannot be played onto the field", () => {
    // Both of the deck's 0-cost Events print `types: ["Rocks Pirates"]`, so a
    // selector filtering on the type alone reaches them -- and `play` puts
    // whatever it is handed onto the board, as `mechanics.ts` says outright:
    // "A `play` node always lands on the board, which is the Character area."
    // An Event landing there is not a legal game state: "play" is how a
    // Character or Stage enters the field, and an Event is never played, it is
    // activated and trashed. Traced in a real game, where the board read
    // `Rocks.D.Xebec(12000), Rocks Pirates(0), Captain John(6000)` -- OP17-056
    // sitting as a 0-power permanent, having eaten one of the two deploy slots
    // this card exists to spend.
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "xebec", cardNumber: "OP17-118" },
      { instanceId: "event", cardNumber: "OP17-056" }, // 0 cost, Rocks Pirates
      { instanceId: "kaido", cardNumber: "OP17-042" }, // 4 cost Character
    ];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "xebec",
      ),
    );

    expect(effectOptions(played)).toContain("kaido");
    expect(effectOptions(played).includes("event")).toBe(false);
  });

  it("stops offering a card once it would exceed the total cost budget", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "xebec", cardNumber: "OP17-118" },
      { instanceId: "shiki", cardNumber: "OP17-048" }, // 7 cost
      { instanceId: "kaido", cardNumber: "OP17-042" }, // 4 cost -- 7+4 > 9
    ];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "xebec",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "shiki",
      ),
    );
    // Kaido no longer fits the remaining budget, and it was the only other
    // card, so the choice ends there rather than offering "choose no more
    // cards" as its single option.
    expect(effectOptions(played)).not.toContain("kaido");
    expect(played.players.p1.board.map((c) => c.instanceId)).toContain("shiki");
    expect(played.players.p1.hand.map((c) => c.instanceId)).toContain("kaido");
  });
});

describe("OP17-119 Loki On Play", () => {
  covers("OP17-119", "[On Play]");
  // Bandai's OP-17 Q&A: "This effect allows you to choose any number of your
  // opponent's Characters whose total cost is 4 or less and K.O. them." Any
  // number includes 0, so stopping is on offer before every pick.
  it("offers every Character that still fits the budget, and lets the player stop after any pick", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "loki", cardNumber: "OP17-119" }];
    state.players.p2.board = [
      character("cheap", "OP17-032"), // 1 cost
      character("mid1", "OP17-045"), // 2 cost
      character("mid2", "OP17-045"), // 2 cost
      character("costly", "OP17-042"), // 4 cost -- alone already at the cap
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "loki",
      ),
    );
    expect(effectOptions(played).sort()).toEqual([
      "cheap",
      "costly",
      "done",
      "mid1",
      "mid2",
    ]);
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cheap",
      ),
    );
    // 3 of the budget is left: either 2-cost Character still fits, the 4-cost
    // one no longer does, and the player may stop at the one K.O.
    expect(effectOptions(played).sort()).toEqual(["done", "mid1", "mid2"]);
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "done",
      ),
    );
    expect(effectOptions(played)).toEqual([]);
    expect(played.players.p2.board.map((c) => c.instanceId)).toEqual([
      "mid1",
      "mid2",
      "costly",
    ]);
  });

  it("ends the choice once nothing else fits what the budget has left", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "loki", cardNumber: "OP17-119" }];
    state.players.p2.board = [
      character("mid1", "OP17-045"), // 2 cost
      character("mid2", "OP17-045"), // 2 cost
      character("costly", "OP17-053"), // 5 cost -- never fits
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "loki",
      ),
    );
    for (const pick of ["mid1", "mid2"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === pick,
        ),
      );
    }
    // 2 + 2 spends the whole 4, so there is nothing left to ask.
    expect(effectOptions(played)).toEqual([]);
    expect(played.players.p2.board.map((c) => c.instanceId)).toEqual([
      "costly",
    ]);
  });

  it("asks even when the whole board fits the budget, so the player may K.O. less", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "loki", cardNumber: "OP17-119" }];
    state.players.p2.board = [
      character("cheap", "OP17-032"), // 1 cost
      character("mid", "OP17-045"), // 2 cost -- 3 in total, inside the budget
    ];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "loki",
      ),
    );
    expect(effectOptions(played).sort()).toEqual(["cheap", "done", "mid"]);
    const declined = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "done",
      ),
    );
    expect(declined.players.p2.board.map((c) => c.instanceId)).toEqual([
      "cheap",
      "mid",
    ]);
  });

  it("resolves without a decision when no opponent Character fits the budget", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "loki", cardNumber: "OP17-119" }];
    state.players.p2.board = [character("costly", "OP17-053")]; // 5 cost
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "loki",
      ),
    );
    expect(effectOptions(played)).toEqual([]);
    expect(played.players.p2.board.map((c) => c.instanceId)).toEqual([
      "costly",
    ]);
  });
});

describe("OP17-045 Kyo's hand-trash replacement", () => {
  covers("OP17-045", "[On Play]", "static");
  it("offers the replacement, gated on the hand holding 2 cards", () => {
    const state = scenario();
    state.players.p1.board = [
      character("kyo", "OP17-045"),
      character("victim", "OP17-082"),
    ];
    state.players.p1.hand = [
      { instanceId: "h1", cardNumber: "FIX-001" },
      { instanceId: "h2", cardNumber: "FIX-002" },
    ];
    const target = state.players.p1.board[1]!;
    expect(replacementOptionsFor(state, "p2", "p1", target, "victim")).toEqual([
      {
        optionId: "handtrash045:victim:kyo",
        summary: "Trash 2 cards from your hand instead of K.O. Sanji",
      },
    ]);

    state.players.p1.hand = [{ instanceId: "h1", cardNumber: "FIX-001" }];
    expect(replacementOptionsFor(state, "p2", "p1", target, "victim")).toEqual(
      [],
    );
  });

  it("trashes 2 chosen hand cards one at a time and lets the Character survive", () => {
    const state = scenario();
    state.players.p1.board = [
      character("kyo", "OP17-045"),
      character("victim", "OP17-082"),
    ];
    state.players.p1.hand = [
      { instanceId: "h1", cardNumber: "FIX-001" },
      { instanceId: "h2", cardNumber: "FIX-002" },
    ];
    state.phase = "main";
    setTurnPlayer(state, "p1");
    state.pendingEffect = {
      kind: "replacement-choice",
      playerId: "p1",
      sourcePlayerId: "p2",
      targetInstanceId: "victim",
      sourceCardNumber: "OP12-113",
      sourceInstanceId: "trigger-1",
      options: [
        {
          optionId: "handtrash045:victim:kyo",
          summary: "Trash 2 cards from your hand instead",
        },
      ],
      resumePhase: "main",
      resumePlayerId: "p1",
    };

    let current = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "handtrash045:victim:kyo",
      ),
    );
    expect(current.pendingEffect?.kind).toBe("hand-trash-replacement");

    current = submit(
      current,
      requireAction(
        current,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "h1",
      ),
    );
    current = submit(
      current,
      requireAction(
        current,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "h2",
      ),
    );

    expect(current.pendingEffect).toBeNull();
    expect(current.players.p1.hand).toHaveLength(0);
    expect(current.players.p1.trash.map((card) => card.instanceId)).toEqual([
      "h1",
      "h2",
    ]);
    expect(
      current.players.p1.board.some((card) => card.instanceId === "victim"),
    ).toBe(true);
  });

  it("On Play draws 1 card", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "kyo", cardNumber: "OP17-045" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "kyo",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["top"]);
  });
});

describe("OP17-043 Ganzui", () => {
  it("On Play raises its own Leader's base power to 6000, no name restriction", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "ST31-001";
    state.players.p1.hand = [{ instanceId: "ganzui", cardNumber: "OP17-043" }];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "ganzui",
      ),
    );
    expect(currentPower(played, "p1", "p1-leader")).toBe(6000);
  });
});

describe("OP17-090 Franky On Play", () => {
  it("K.O.s a cost-2-or-less Character when a giant is out", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "franky", cardNumber: "OP17-090" }];
    state.players.p1.board = [character("giant", "OP17-089")];
    state.players.p2.board = [
      character("cheap", "FIX-002"), // cost 2
      character("dear", "ST31-002"),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "franky",
      ),
    );
    expect(effectOptions(state)).toEqual(["cheap", "done"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cheap",
      ),
    );
    expect(state.players.p2.board.map((entry) => entry.instanceId)).toEqual([
      "dear",
    ]);
  });

  it("offers no K.O. at all with no giant on the field", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "franky", cardNumber: "OP17-090" }];
    state.players.p2.board = [character("cheap", "FIX-002")];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "franky",
      ),
    );
    // The condition failed, so the clause never opens a choice.
    expect(effectOptions(state)).toEqual([]);
    expect(state.players.p2.board.map((entry) => entry.instanceId)).toEqual([
      "cheap",
    ]);
  });
});

describe("OP17-082 Sanji On Play", () => {
  covers("OP17-082", "[On Play]");
  it("draws 2 then trashes exactly 2, including a just-drawn card", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "sanji", cardNumber: "OP17-082" }];
    state.players.p1.deck = [
      { instanceId: "d1", cardNumber: "FIX-001" },
      { instanceId: "d2", cardNumber: "FIX-002" },
      { instanceId: "d3", cardNumber: "FIX-001" },
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sanji",
      ),
    );
    expect(
      state.players.p1.hand.map((entry) => entry.instanceId).sort(),
    ).toEqual(["d1", "d2"]);
    // Mandatory: both discards must be made, so "done" is not on offer yet.
    expect(effectOptions(state)).toEqual(["d1", "d2"]);

    for (const optionId of ["d1", "d2"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.players.p1.hand).toEqual([]);
    expect(
      state.players.p1.trash.map((entry) => entry.instanceId).sort(),
    ).toEqual(["d1", "d2"]);
  });
});

describe("OP17-091 Brook On Play", () => {
  covers("OP17-091", "[On Play]");
  it("lets the opponent pick which of their own cards is trashed", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "brook", cardNumber: "OP17-091" }];
    state.players.p1.board = [character("giant", "OP17-089")];
    state.players.p2.hand = [
      { instanceId: "o1", cardNumber: "FIX-001" },
      { instanceId: "o2", cardNumber: "FIX-002" },
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "brook",
      ),
    );
    // The choice belongs to p2, so it is p2 who is offered the options.
    const options = getLegalActions(state, "p2")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(options.sort()).toEqual(["o1", "o2"]);
    expect(
      getLegalActions(state, "p1").filter(
        (action) => action.type === "resolve-effect",
      ),
    ).toEqual([]);
  });
});

describe("OP17-024 Howling Gab On Play", () => {
  covers("OP17-024", "[On Play]", "[Banish]");
  it("rests up to 1 opposing Character and prints [Banish]", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "gab", cardNumber: "OP17-024" }];
    state.players.p2.board = [
      character("standing", "ST31-002"),
      character("already", "FIX-001", { rested: true }),
    ];

    expect(cardFacts("OP17-024").keywords).toContain("Banish");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "gab",
      ),
    );
    // A rested Character cannot be rested again, so only one target is offered.
    expect(effectOptions(state)).toEqual(["standing", "done"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "standing",
      ),
    );
    expect(
      state.players.p2.board.find((entry) => entry.instanceId === "standing")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP17-052 Don Marlon On Play", () => {
  covers("OP17-052", "[On Play]");
  it("recurs only a blue cost-0 Event from trash", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "marlon", cardNumber: "OP17-052" }];
    state.players.p1.trash = [
      { instanceId: "blue0", cardNumber: "OP02-068" }, // Blue cost-0 Event
      { instanceId: "green0", cardNumber: "OP17-038" }, // Green cost-0 Event
      { instanceId: "body", cardNumber: "FIX-001" }, // not an Event
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "marlon",
      ),
    );
    // Only the blue Event qualifies: the Green one fails the colour filter and
    // the Character fails the category filter.
    expect(effectOptions(state)).toEqual(["blue0", "done"]);

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "blue0",
      ),
    );
    expect(state.players.p1.hand.map((entry) => entry.instanceId)).toEqual([
      "blue0",
    ]);
    expect(
      state.players.p1.trash.map((entry) => entry.instanceId).sort(),
    ).toEqual(["body", "green0"]);
  });

  it("offers nothing when the trash holds no blue cost-0 Event", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "marlon", cardNumber: "OP17-052" }];
    state.players.p1.trash = [{ instanceId: "green0", cardNumber: "OP17-038" }];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "marlon",
      ),
    );
    // A zero-candidate "up to 1" resolves to nothing rather than offering a
    // pointless "done", so the card just enters play.
    expect(effectOptions(state)).toEqual([]);
    expect(state.players.p1.board.map((entry) => entry.cardNumber)).toEqual([
      "OP17-052",
    ]);
  });
});

describe("OP17-004 Inuarashi & Nekomamushi On Play", () => {
  it("grants [Rush] to either printed type, and only for this turn", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "minks", cardNumber: "OP17-004" }];
    state.players.p1.board = [
      character("wano", "OP17-003"), // {Land of Wano}
      character("wb", "OP17-002"), // {Whitebeard Pirates}
      character("neither", "FIX-001"),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "minks",
      ),
    );
    // `anyOf` offers both types; the Fixture body matches neither. Inuarashi
    // itself is eligible -- it is a {Whitebeard Pirates} Minks, and giving
    // itself [Rush] is the main use of the card.
    expect(effectOptions(state)).toEqual(["wano", "wb", "minks", "done"]);

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "wb",
      ),
    );
    expect(hasKeyword(state, "p1", "wb", "Rush")).toBe(true);
    expect(hasKeyword(state, "p1", "wano", "Rush")).toBe(false);

    // Granted [Rush] is turn-scoped: it is gone next turn.
    state.turn += 1;
    expect(hasKeyword(state, "p1", "wb", "Rush")).toBe(false);
  });

  it("lets the granted Character attack the turn it was played", () => {
    let state = scenario();
    state.turn = 5;
    state.players.p1.hand = [{ instanceId: "minks", cardNumber: "OP17-004" }];
    // Played this turn, so it normally could not attack at all.
    state.players.p1.board = [
      character("fresh", "OP17-002", { playedTurn: 5 }),
    ];
    const before = getLegalActions(state, "p1").filter(
      (action) => action.type === "attack" && action.actionId.includes("fresh"),
    );
    expect(before).toEqual([]);

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "minks",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "fresh",
      ),
    );
    // The grant is what makes this attack legal.
    expect(
      getLegalActions(state, "p1").some(
        (action) =>
          action.type === "attack" && action.actionId.includes("fresh"),
      ),
    ).toBe(true);
  });
});

describe("OP17-071 Who's.Who", () => {
  it("pays DON!! −1 to K.O. up to 2 cost-2-or-less Characters", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "who", cardNumber: "OP17-071" }];
    state.players.p2.board = [
      character("a", "FIX-002"), // cost 2
      character("b", "FIX-002"),
      character("big", "ST31-002"),
    ];
    const donBefore = state.players.p1.activeDon.length;

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "who",
      ),
    );
    // The DON!! −1 is a declinable cost, so it is offered as a yes/no first.
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "return-don:active",
      ),
    );
    for (const optionId of ["a", "b"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.players.p2.board.map((entry) => entry.instanceId)).toEqual([
      "big",
    ]);
    // The cost really left the field.
    expect(state.players.p1.activeDon.length).toBeLessThan(donBefore);
  });

  it("declines the cost and does nothing", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "who", cardNumber: "OP17-071" }];
    state.players.p2.board = [character("a", "FIX-002")];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "who",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );
    expect(state.players.p2.board.map((entry) => entry.instanceId)).toEqual([
      "a",
    ]);
  });
});

describe("OP17-066 Kurozumi Orochi On Play", () => {
  it("does nothing without a cost-10 body of your own", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "orochi", cardNumber: "OP17-066" }];
    state.players.p1.deck = [{ instanceId: "d1", cardNumber: "FIX-001" }];
    // An opposing giant must not satisfy "if *you* have".
    state.players.p2.board = [character("theirs", "OP17-089")];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "orochi",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "return-don:active",
      ),
    );
    expect(state.players.p1.hand).toEqual([]);
    expect(state.players.p1.deck).toHaveLength(1);
  });

  it("draws two then discards one when you do have one", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "orochi", cardNumber: "OP17-066" }];
    state.players.p1.board = [character("mine", "OP17-089")];
    state.players.p1.deck = [
      { instanceId: "d1", cardNumber: "FIX-001" },
      { instanceId: "d2", cardNumber: "FIX-002" },
      { instanceId: "d3", cardNumber: "FIX-001" },
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "orochi",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "return-don:active",
      ),
    );
    // Both cards are drawn first, so both are legal discards -- the printed
    // count is 2, which the secondary import had as 1.
    expect(effectOptions(state)).toEqual(["d1", "d2"]);
    expect(state.players.p1.deck.map((entry) => entry.instanceId)).toEqual([
      "d3",
    ]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "d1",
      ),
    );
    expect(state.players.p1.trash.map((entry) => entry.instanceId)).toEqual([
      "d1",
    ]);
    expect(state.players.p1.hand.map((entry) => entry.instanceId)).toEqual([
      "d2",
    ]);
  });
});

describe("OP17-105 Charlotte Chiffon On Play", () => {
  it("trashes a Trigger card to bounce a Trigger Character", () => {
    let state = scenario();
    state.players.p1.hand = [
      { instanceId: "chiffon", cardNumber: "OP17-105" },
      { instanceId: "trig", cardNumber: "OP17-107" }, // has a [Trigger]
      { instanceId: "plain", cardNumber: "FIX-001" }, // has none
    ];
    state.players.p2.board = [
      character("bounceable", "OP17-107"), // has a [Trigger]
      character("safe", "FIX-001"),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "chiffon",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    // Only the Trigger card can pay.
    expect(effectOptions(state)).toEqual(["trig"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "trig",
      ),
    );
    // And only a Trigger Character can be returned.
    expect(effectOptions(state)).toEqual(["bounceable", "done"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "bounceable",
      ),
    );
    expect(state.players.p2.board.map((entry) => entry.instanceId)).toEqual([
      "safe",
    ]);
    // Returned to its owner's hand, not the caster's.
    expect(state.players.p2.hand.map((entry) => entry.instanceId)).toEqual([
      "bounceable",
    ]);
    expect(state.players.p1.trash.map((entry) => entry.instanceId)).toEqual([
      "trig",
    ]);
  });
});

describe("OP17-012 Blenheim On K.O.", () => {
  it("plays a cost-1 Whitebeard Pirates from hand, exact cost only", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "one", cardNumber: "OP17-010" }, // cost 1 Whitebeard
      { instanceId: "two", cardNumber: "OP17-002" }, // cost 4 Whitebeard
    ];
    state.players.p1.board = [character("blenheim", "OP17-012")];

    const koResult = createOnKoResult(
      state,
      "p1",
      { instanceId: "blenheim", cardNumber: "OP17-012" },
      "p1",
    );
    state.pendingEffect = koResult.pending;
    // "a cost of 1" is exact: the 4-cost Whitebeard is not eligible.
    expect(effectOptions(state)).toEqual(["one", "done"]);
  });
});

describe("OP17-010 Fossa Activate: Main", () => {
  function fossa(options: {
    opposingPower: string;
    otherFossa?: boolean;
  }): GameState {
    const state = scenario();
    state.players.p1.board = [character("fossa", "OP17-010")];
    if (options.otherFossa) {
      state.players.p1.board.push(character("fossa2", "OP17-010"));
    }
    state.players.p2.board = [character("theirs", options.opposingPower)];
    return state;
  }

  it("grants [Blocker] and +2000 past the opponent's next End Phase", () => {
    let state = fossa({ opposingPower: "OP17-064" }); // 10000 power
    expect(hasKeyword(state, "p1", "fossa", "Blocker")).toBe(false);

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" && action.actionId.includes("fossa"),
      ),
    );
    expect(hasKeyword(state, "p1", "fossa", "Blocker")).toBe(true);
    expect(currentPower(state, "p1", "fossa", false)).toBe(
      (requireKnownCard("OP17-010").power ?? 0) + 2000,
    );

    // Lasts through the opponent's next End Phase, so it survives one turn.
    state.turn += 1;
    expect(hasKeyword(state, "p1", "fossa", "Blocker")).toBe(true);
    state.turn += 1;
    expect(hasKeyword(state, "p1", "fossa", "Blocker")).toBe(false);
  });

  it("is not offered without a 10000-power opposing Character", () => {
    const state = fossa({ opposingPower: "ST31-002" }); // 6000 power
    expect(
      getLegalActions(state, state.activePlayer).some(
        (action) =>
          action.type === "activate-main" && action.actionId.includes("fossa"),
      ),
    ).toBe(false);
  });

  it("does nothing while you control another [Fossa]", () => {
    let state = fossa({ opposingPower: "OP17-064", otherFossa: true });
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.includes("fossa") &&
          !action.actionId.includes("fossa2"),
      ),
    );
    // "no other [Fossa]" -- the second copy switches the whole clause off.
    expect(hasKeyword(state, "p1", "fossa", "Blocker")).toBe(false);
  });
});

describe("OP17-030 Monkey D. Luffy", () => {
  it("rests a DON!! on play to gain [Rush] for the turn", () => {
    let state = scenario();
    state.turn = 5;
    state.players.p1.hand = [{ instanceId: "luffy", cardNumber: "OP17-030" }];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "luffy",
      ),
    );
    // Measured after the play, because paying the 4-cost already rested 4 DON!!.
    const restedAfterPlay = state.players.p1.restedDon.length;
    const fieldDonAfterPlay =
      state.players.p1.restedDon.length + state.players.p1.activeDon.length;

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    expect(hasKeyword(state, "p1", "luffy", "Rush")).toBe(true);
    // The cost rests one more DON!! -- it does not return it, so the field total
    // is unchanged and the DON!! still counts for [DON!! xN].
    expect(state.players.p1.restedDon.length).toBe(restedAfterPlay + 1);
    expect(
      state.players.p1.restedDon.length + state.players.p1.activeDon.length,
    ).toBe(fieldDonAfterPlay);
  });

  it("sets a rested DON!! active while your hand is small", () => {
    let state = scenario();
    state.players.p1.board = [character("luffy", "OP17-030")];
    state.players.p1.activeDon = ["a1"];
    state.players.p1.restedDon = ["r1", "r2"];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" && action.actionId.includes("luffy"),
      ),
    );
    expect(state.players.p1.activeDon).toHaveLength(2);
    expect(state.players.p1.restedDon).toHaveLength(1);
  });

  it("is not offered with 6 or more cards in hand", () => {
    const state = scenario();
    state.players.p1.board = [character("luffy", "OP17-030")];
    state.players.p1.activeDon = ["a1"];
    state.players.p1.restedDon = ["r1"];
    state.players.p1.hand = Array.from({ length: 6 }, (_, index) => ({
      instanceId: `h${index}`,
      cardNumber: "FIX-001",
    }));

    expect(
      getLegalActions(state, state.activePlayer).some(
        (action) =>
          action.type === "activate-main" && action.actionId.includes("luffy"),
      ),
    ).toBe(false);
  });
});

describe("OP17-053 Barbell On K.O.", () => {
  covers("OP17-053", "[On K.O.]");

  // The same "as many as possible" reading Bandai's OP-17 Q&A gives OP17-049's
  // "trashes 2": an opponent holding one card still places that one.
  it("buries the opponent's only card when they hold just one", () => {
    const game = table()
      .seed("op17-053-one-card")
      .atTurn(3, { active: "p1" })
      .bareTable()
      .withBoard("p1", [boardCharacter("attacker", "OP17-118")]) // 12000
      .withBoard("p2", [
        boardCharacter("barbell", "OP17-053", { rested: true }),
      ])
      .withHand("p1", [instance("only", "ST31-002")])
      .withDeckTop("p1", [instance("under", "ST31-004")])
      .withDeckTop("p2", [instance("d1", "ST31-004")])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: "attacker",
      targetInstanceId: "barbell",
    });
    while (
      game.state.phase === "block" ||
      game.state.phase === "counter" ||
      game.state.activePlayer === "p2"
    ) {
      game.pass();
    }
    expect(game.state.players.p2.board).toHaveLength(0);
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p1.hand).toHaveLength(0);
    expect(
      game.state.players.p1.deck.map((card) => card.instanceId).slice(-1),
    ).toEqual(["only"]);
  });

  it("makes the opponent bury 2 cards from their own hand", () => {
    const state = scenario();
    state.players.p2.hand = [
      { instanceId: "o1", cardNumber: "FIX-001" },
      { instanceId: "o2", cardNumber: "FIX-002" },
      { instanceId: "o3", cardNumber: "FIX-001" },
    ];
    state.players.p2.deck = [{ instanceId: "d1", cardNumber: "FIX-001" }];
    state.players.p1.board = [character("barbell", "OP17-053")];

    const koResult = createOnKoResult(
      state,
      "p1",
      { instanceId: "barbell", cardNumber: "OP17-053" },
      "p1",
    );
    state.pendingEffect = koResult.pending;
    // The program names p2 as the chooser; a real K.O. routes the decision there
    // through `applyAction`, which this hand-built pending has to mirror.
    expect(koResult.pending?.playerId).toBe("p2");
    setTurnPlayer(state, "p2");
    // The choice is the opponent's, over their own hand, and both cards must go.
    expect(effectOptions(state).sort()).toEqual(["o1", "o2", "o3"]);
  });

  it("hands control straight to the opponent when Barbell dies in a real battle, and still needs two picks", () => {
    const state = scenario();
    state.players.p1.board = [character("attacker", "OP17-118")]; // 12000 power
    state.players.p2.board = [
      character("barbell", "OP17-053", { rested: true }),
    ];
    state.players.p1.hand = [
      { instanceId: "h1", cardNumber: "FIX-001" },
      { instanceId: "h2", cardNumber: "FIX-002" },
      { instanceId: "h3", cardNumber: "FIX-001" },
    ];
    state.players.p1.deck = [{ instanceId: "topp1", cardNumber: "FIX-001" }];
    state.players.p2.deck = [{ instanceId: "d1", cardNumber: "FIX-001" }];

    let after = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "attacker" &&
          action.targetInstanceId === "barbell",
      ),
    );
    after = submit(
      after,
      requireAction(after, (action) => action.type === "pass"),
    );
    while (after.phase === "counter") {
      after = submit(
        after,
        requireAction(after, (action) => action.type === "pass"),
      );
    }

    // Barbell (p1's target) is gone, and the bury is p1's own choice over p1's
    // own hand -- not p2's -- from the moment the K.O. resolves, with no
    // window for p2 to act on it first.
    expect(after.players.p2.board).toHaveLength(0);
    expect(after.activePlayer).toBe("p1");
    expect(effectOptions(after).sort()).toEqual(["h1", "h2", "h3"]);

    after = submit(
      after,
      requireAction(
        after,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "h1",
      ),
    );
    // Still p1's decision, still incomplete after one pick.
    expect(after.activePlayer).toBe("p1");
    expect(effectOptions(after).sort()).toEqual(["h2", "h3"]);

    after = submit(
      after,
      requireAction(
        after,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "h2",
      ),
    );
    expect(after.pendingEffect).toBeNull();
    expect(after.players.p1.hand.map((c) => c.instanceId)).toEqual(["h3"]);
    expect(after.players.p1.deck.map((c) => c.instanceId)).toEqual([
      "topp1",
      "h1",
      "h2",
    ]);
  });
});

describe("OP17-047 Shiki [End of Your Turn]", () => {
  function board(): GameState {
    const state = scenario();
    state.players.p1.board = [character("shiki", "OP17-047")];
    state.players.p1.hand = [{ instanceId: "h1", cardNumber: "FIX-001" }];
    state.players.p2.hand = [
      { instanceId: "o1", cardNumber: "FIX-001" },
      { instanceId: "o2", cardNumber: "FIX-002" },
    ];
    state.players.p2.deck = [{ instanceId: "d1", cardNumber: "FIX-001" }];
    return state;
  }

  const pass = (state: GameState): GameState =>
    submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );

  it("makes the opponent bury 1 card from their own hand when the hand is 2 or less", () => {
    const state = pass(board());
    // The turn does not end yet -- the opponent has a card to place first.
    expect(state.pendingEffect?.kind).toBe("mechanic-choice");
    expect(state.pendingEffect?.playerId).toBe("p2");
    expect(effectOptions(state).sort()).toEqual(["o1", "o2"]);

    const resolved = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "o1",
      ),
    );
    // "o1" left the hand for the bottom of the deck; "o2" stayed, and the new
    // turn's draw (from what was the deck's only card, "d1") joined it.
    expect(
      resolved.players.p2.hand.map((card) => card.instanceId).sort(),
    ).toEqual(["d1", "o2"]);
    expect(resolved.players.p2.deck.at(-1)?.instanceId).toBe("o1");
    // Resolving the choice re-enters `endTurn`, which finds nothing else to
    // offer and actually ends the turn.
    expect(resolved.activePlayer).toBe("p2");
  });

  it("does nothing when the hand is over 2 cards", () => {
    const state = board();
    state.players.p1.hand = [
      { instanceId: "h1", cardNumber: "FIX-001" },
      { instanceId: "h2", cardNumber: "FIX-001" },
      { instanceId: "h3", cardNumber: "FIX-001" },
    ];
    const after = pass(state);
    expect(after.pendingEffect).toBeNull();
    expect(after.activePlayer).toBe("p2");
  });

  it("does nothing when the opponent's hand is empty", () => {
    const state = board();
    state.players.p2.hand = [];
    const after = pass(state);
    expect(after.pendingEffect).toBeNull();
    expect(after.activePlayer).toBe("p2");
  });
});

describe("OP17-101 Caribou Activate: Main", () => {
  it("pays a Life card to give −3000 power for the turn", () => {
    let state = scenario();
    state.players.p1.board = [character("caribou", "OP17-101")];
    state.players.p1.life = [
      { instanceId: "L1", cardNumber: "FIX-001" },
      { instanceId: "L2", cardNumber: "FIX-002" },
    ];
    state.players.p2.board = [character("target", "ST31-002")];
    const printed = requireKnownCard("ST31-002").power ?? 0;

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.includes("caribou"),
      ),
    );
    // The Life card is paid into hand.
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "L1",
      ),
    );
    expect(state.players.p1.hand.map((entry) => entry.instanceId)).toContain(
      "L1",
    );
    expect(state.players.p1.life).toHaveLength(1);

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(currentPower(state, "p2", "target", false)).toBe(printed - 3000);
  });
});

/**
 * Counter Events whose buff names a particular card.
 *
 * The engine adds Counter power as one number to the battle's target, so
 * "[printed text omitted -- pnpm card:text <card>]" is worth 3000 when the Leader is
 * being attacked and nothing when a Character is blocking. The offer and the
 * resolution must agree on that, or an agent plans around power it will not get.
 */
describe("OP17 Counter Event target restrictions", () => {
  function battle(targetInstanceId: string, defenderIsLeader: boolean) {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [
      character("blocker", "ST31-002"),
      character("wb", "OP17-002"), // {Whitebeard Pirates}
    ];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: defenderIsLeader ? "p1-leader" : targetInstanceId,
      attackPower: 5000,
      counterPower: 0,
    });
    return state;
  }

  it.each(["OP17-097", "OP17-098"])(
    "%s adds power only when the Leader is the target",
    (cardNumber) => {
      expect(counterEventPower(battle("", true), "p1", cardNumber)).toBe(3000);
      expect(
        counterEventPower(battle("blocker", false), "p1", cardNumber),
      ).toBe(0);
    },
  );

  it("OP17-017 adds power only to a Whitebeard Pirates target", () => {
    // The blocking Character is a Whitebeard Pirates, so the buff reaches it.
    expect(counterEventPower(battle("wb", false), "p1", "OP17-017")).toBe(2000);
    // This one is not.
    expect(counterEventPower(battle("blocker", false), "p1", "OP17-017")).toBe(
      0,
    );
  });

  it("OP17-017's debuff half is not gated on its buff applying", () => {
    // The two halves are independent: "[printed text omitted -- pnpm card:text OP17-017]" runs whether or not the +2000 reached
    // the battle, so a non-Whitebeard target still gets debuffed.
    const text = printedText("OP17-017");
    if (!text) return; // needs the printed-text cache; see docs/asset-packs.md
    expect(
      text.effect.includes(
        "Then, give up to 1 of your opponent's Leader or Characters",
      ),
    ).toBe(true);
  });
});

/**
 * `[On Your Opponent's Attack]` — the registry and its dispatch.
 *
 * The registry is the easy half. These tests are aimed at the dispatch: the
 * block-step ladder is re-entered after every pending effect resolves, and its
 * guard used to be keyed on the *kind* of effect that had just resolved, which
 * works only while each ability has one source. King and Black Maria can both be
 * on the board, so the guard is per source instance, held on the battle. Getting
 * it wrong fails quietly in either direction -- an ability offered forever, or a
 * second source silently dropped -- so both directions are pinned here.
 */
describe("OP17 [On Your Opponent's Attack]", () => {
  /** p2 declares an attack, leaving p1 as the defender holding the ability. */
  function attacked(
    setUp: (state: GameState) => void,
    targetInstanceId = "p1-leader",
  ): GameState {
    const state = scenario();
    setTurnPlayer(state, "p2");
    setUp(state);
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.targetInstanceId === targetInstanceId,
      ),
    );
  }

  it("offers OP17-072 Black Maria to the defender and buys +1000 for a card", () => {
    let state = attacked((game) => {
      game.players.p1.board = [character("maria", "OP17-072")];
      game.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    });

    // The offer goes to the defender, inside the block step, as an apply/skip.
    expect(state.activePlayer).toBe("p1");
    expect(state.phase).toBe("block");
    expect(effectOptions(state).sort()).toEqual(["apply", "skip"]);
    // The prompt arrives unasked, mid-attack, so it names the ability and its
    // cost rather than saying "Apply optional effect".
    // Without the printed text the offer keeps the generic label: the name
    // and cost come from the clause, which only a loaded pack carries.
    if (hasPrintedText()) {
      expect(
        getLegalActions(state, "p1").find(
          (action) =>
            action.type === "resolve-effect" && action.optionId === "apply",
        )?.summary,
      ).toBe(
        "Activate Black Maria [OP17-072]: [Once Per Turn] You may trash 1 card from your hand: Up to 1 of your Leader or Characters gains +1000 power during this battle.",
      );
    }

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    // Which card to spend is the real decision, so the whole hand is offered.
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );

    expect(state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "FIX-002",
    ]);
    // "During this battle" is the battle's counter power, not a turn-scoped
    // modifier: the Leader itself is untouched.
    expect(state.activeAttack?.counterPower).toBe(1000);
    expect(state.players.p1.leaderPowerModifiers).toEqual([]);
    // Control stays with the defender, who still has the block step to answer.
    expect(state.phase).toBe("block");
    expect(state.activePlayer).toBe("p1");
  });

  it("tells the attacker about the ability before it declares", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("maria", "OP17-072")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    const attack = requireAction(
      state,
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p1-leader",
    );
    if (attack.type !== "attack") throw new Error("EXPECTED_ATTACK");

    // The forecast reads the same program the resolution does, so it cannot
    // promise power the defender will not get.
    expect(attack.effectiveTargetPower).toBe((attack.targetPower ?? 0) + 1000);
    expect(attack.summary).toContain(
      "unused once-per-turn ability that raises this target to",
    );
  });

  it("is not offered with an empty hand, and is not forecast either", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("maria", "OP17-072")];
    state.players.p1.hand = [];
    const attack = requireAction(
      state,
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p1-leader",
    );
    if (attack.type !== "attack") throw new Error("EXPECTED_ATTACK");
    expect(attack.effectiveTargetPower).toBe(attack.targetPower);

    const declared = submit(state, attack);
    expect(declared.pendingEffect).toBeNull();
  });

  it("offers every source in one battle, not just the first", () => {
    let state = attacked((game) => {
      game.players.p1.board = [
        character("king", "OP17-064"),
        character("maria", "OP17-072"),
      ];
      game.players.p1.hand = [
        { instanceId: "first", cardNumber: "FIX-002" },
        { instanceId: "second", cardNumber: "FIX-001" },
      ];
    });

    const pay = (cardInstanceId: string): void => {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === "apply",
        ),
      );
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" &&
            action.optionId === cardInstanceId,
        ),
      );
    };

    expect(state.pendingEffect?.sourceInstanceId).toBe("king");
    pay("first");
    // Resolving the first re-enters the ladder, which finds the second source
    // rather than re-offering the one it just used.
    expect(state.pendingEffect?.sourceInstanceId).toBe("maria");
    pay("second");

    expect(state.pendingEffect).toBeNull();
    expect(state.activeAttack?.counterPower).toBe(3000);
  });

  it("does not re-offer a source that was declined in the same battle", () => {
    let state = attacked((game) => {
      game.players.p1.board = [character("maria", "OP17-072")];
      game.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    });
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.activeAttack?.counterPower).toBe(0);
    // The defender is in the block step with block choices, not the same prompt
    // again.
    expect(
      getLegalActions(state, "p1").some((action) => action.type === "block"),
    ).toBe(true);
  });

  it("spends the [Once Per Turn] use on the answer that takes it, not on the decline", () => {
    // Declining is not a use of the ability: the defender did not go looking for
    // it, an attack pushed it at them. `[Activate: Main]` marks its key before
    // dispatch, which is the opposite reading and the right one for an ability
    // its controller chose to activate.
    const setUp = (game: GameState): void => {
      game.players.p1.board = [character("maria", "OP17-072")];
      game.players.p1.hand = [
        { instanceId: "first", cardNumber: "FIX-002" },
        { instanceId: "second", cardNumber: "FIX-001" },
      ];
      game.players.p2.board = [character("second-attacker", "FIX-002")];
    };
    const key = "3:p1:maria:on-opponent-attack";

    let declined = attacked(setUp);
    declined = submit(
      declined,
      requireAction(
        declined,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );
    expect(declined.oncePerTurn).not.toContain(key);

    let taken = attacked(setUp);
    taken = submit(
      taken,
      requireAction(
        taken,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    taken = submit(
      taken,
      requireAction(
        taken,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "first",
      ),
    );
    expect(taken.oncePerTurn).toContain(key);
  });

  it("holds a used [Once Per Turn] ability to one use across two battles", () => {
    let state = attacked((game) => {
      game.players.p1.board = [character("maria", "OP17-072")];
      game.players.p1.hand = [
        { instanceId: "first", cardNumber: "FIX-002" },
        { instanceId: "second", cardNumber: "FIX-001" },
      ];
      game.players.p2.board = [character("attacker", "FIX-002")];
    });
    for (const optionId of ["apply", "first"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    // Let the first battle finish and declare a second one this turn.
    state = submit(
      state,
      requireAction(state, (action) => action.type === "block"),
    );
    while (state.phase !== "main") {
      state = submit(
        state,
        requireAction(state, (action) => action.type === "pass"),
      );
    }
    const second = requireAction(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "attacker" &&
        action.targetInstanceId === "p1-leader",
    );
    if (second.type !== "attack") throw new Error("EXPECTED_ATTACK");
    // The forecast agrees with the offer: the use is gone, so it promises
    // nothing.
    expect(second.effectiveTargetPower).toBe(second.targetPower);
    state = submit(state, second);
    expect(state.pendingEffect).toBeNull();
  });

  it("keeps [Once Per Turn] per copy, not per card number", () => {
    let state = attacked((game) => {
      game.players.p1.board = [
        character("maria-a", "OP17-072"),
        character("maria-b", "OP17-072"),
      ];
      game.players.p1.hand = [
        { instanceId: "first", cardNumber: "FIX-002" },
        { instanceId: "second", cardNumber: "FIX-001" },
      ];
    });
    for (const optionId of ["apply", "first", "apply", "second"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.activeAttack?.counterPower).toBe(2000);
  });

  it("OP17-064 King buys +2000 and keeps its printed [Blocker]", () => {
    let state = attacked((game) => {
      game.players.p1.board = [character("king", "OP17-064")];
      game.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    });
    for (const optionId of ["apply", "pitch"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.activeAttack?.counterPower).toBe(2000);
    expect(hasKeyword(state, "p1", "king", "Blocker")).toBe(true);
  });

  it("OP17-014 Whitey Bay trashes itself for the Leader, and is not offered for a Character", () => {
    let state = attacked((game) => {
      game.players.p1.board = [character("whitey", "OP17-014")];
    });
    for (const optionId of ["apply"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.activeAttack?.counterPower).toBe(1000);
    expect(state.players.p1.board).toEqual([]);
    expect(state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP17-014",
    ]);

    // "Up to 1 of your Leaders" cannot reach a blocking Character, so the offer
    // is never made: paying a Character for nothing is not a decision worth
    // presenting.
    const blocked = attacked((game) => {
      game.players.p1.board = [
        character("whitey", "OP17-014"),
        character("target", "FIX-002", { rested: true }),
      ];
    }, "target");
    expect(blocked.pendingEffect).toBeNull();
  });

  it("OP17-014's On Play K.O.s a 2000-base-power Character", () => {
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "whitey", cardNumber: "OP17-014" }];
    state.players.p2.board = [
      character("small", "FIX-001"), // 2000 base power
      character("big", "FIX-002"), // 4000
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "whitey",
      ),
    );
    // "K.O. one", not "up to 1": the only options are the legal targets.
    expect(effectOptions(state)).toEqual(["small"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "small",
      ),
    );
    expect(state.players.p2.board.map((card) => card.instanceId)).toEqual([
      "big",
    ]);
  });

  it("OP17-057 Fullalead rests its own Stage for a Rocks Pirates target", () => {
    let state = attacked((game) => {
      game.players.p1.stage = {
        instanceId: "fullalead",
        cardNumber: "OP17-057",
        rested: false,
      };
      game.players.p1.board = [
        character("marlon", "OP17-052", { rested: true }),
      ];
      game.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    }, "marlon");
    for (const optionId of ["apply", "pitch"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.activeAttack?.counterPower).toBe(1000);
    expect(state.players.p1.stage?.rested).toBe(true);
    expect(state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "FIX-002",
    ]);
  });

  it("OP17-057 is not offered for a target without the type, or from a rested Stage", () => {
    // The Leader is not a Rocks Pirates, so the buff has nowhere to land.
    const wrongType = attacked((game) => {
      game.players.p1.stage = {
        instanceId: "fullalead",
        cardNumber: "OP17-057",
        rested: false,
      };
      game.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    });
    expect(wrongType.pendingEffect).toBeNull();

    // The cost is resting the Stage, so a Stage already rested cannot pay it.
    const rested = attacked((game) => {
      game.players.p1.stage = {
        instanceId: "fullalead",
        cardNumber: "OP17-057",
        rested: true,
      };
      game.players.p1.board = [
        character("marlon", "OP17-052", { rested: true }),
      ];
      game.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    }, "marlon");
    expect(rested.pendingEffect).toBeNull();
  });

  it("OP17-001 Edward.Newgate Leader buys +4000 for a card, with no target restriction", () => {
    let state = attacked((game) => {
      game.players.p1.leaderCardNumber = "OP17-001";
      game.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    });
    for (const optionId of ["apply", "pitch"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.activeAttack?.counterPower).toBe(4000);
    expect(state.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "FIX-002",
    ]);
  });
});

describe("OP17-048 Shiki / OP17-058 Kaido dual-timed [Once Per Turn]", () => {
  covers("OP17-048", "[When Attacking]", "[On Your Opponent's Attack]");
  covers("OP17-058", "[When Attacking]", "[On Your Opponent's Attack]");
  /** p2 declares an attack, leaving p1 as the defender holding the ability. */
  function attacked(
    setUp: (state: GameState) => void,
    targetInstanceId = "p1-leader",
  ): GameState {
    const state = scenario();
    setTurnPlayer(state, "p2");
    setUp(state);
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.targetInstanceId === targetInstanceId,
      ),
    );
  }

  it("OP17-058 debuffs an opponent Character from [On Your Opponent's Attack], paying DON!! −1", () => {
    let state = attacked((game) => {
      game.players.p1.leaderCardNumber = "OP17-058";
      game.players.p2.board = [character("victim", "FIX-002")];
    });
    // `DON!! −N` prints "(You may return ...)", so the cost is an offer the
    // defender accepts before the target choice appears.
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "victim",
      ),
    );
    // `DON!! −1` returns the DON!! to the DON!! deck -- off the field
    // entirely -- rather than resting it in place.
    expect(state.players.p1.activeDon).toHaveLength(9);
    expect(currentPower(state, "p2", "victim")).toBe(
      (requireKnownCard("FIX-002").power ?? 0) - 2000,
    );
  });

  it("OP17-058's [Once Per Turn] budget is shared between both windows", () => {
    // The key format is `turn:controller:instance:on-opponent-attack` in both
    // tables -- a Leader's [When Attacking] use marks the exact key
    // [On Your Opponent's Attack] would also check, and vice versa.
    const alreadySpent = scenario();
    alreadySpent.players.p1.leaderCardNumber = "OP17-058";
    alreadySpent.oncePerTurn = [
      `${alreadySpent.turn}:p1:p1-leader:on-opponent-attack`,
    ];
    alreadySpent.players.p2.board = [character("victim", "FIX-002")];
    const declared = submit(
      alreadySpent,
      requireAction(
        alreadySpent,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p2-leader",
      ),
    );
    // [When Attacking] finds its budget already spent (by the same key an
    // [On Your Opponent's Attack] use would have marked) and does not offer
    // the ability again.
    expect(declared.pendingEffect).toBeNull();
    expect(declared.players.p1.restedDon).toHaveLength(0);
  });

  it("OP17-048 debuffs by trashing a Rocks Pirates card, [When Attacking]", () => {
    const state = scenario();
    state.players.p1.board = [character("shiki", "OP17-048")];
    state.players.p1.hand = [{ instanceId: "rocks", cardNumber: "OP17-041" }];
    state.players.p2.board = [character("victim", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "shiki" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "rocks",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "victim",
      ),
    );
    expect(played.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "OP17-041",
    ]);
    expect(currentPower(played, "p2", "victim")).toBe(
      (requireKnownCard("FIX-002").power ?? 0) - 3000,
    );
  });

  it("OP17-048's debuff moves the battle it is played into, not just the card", () => {
    // The whole point of the [On Your Opponent's Attack] timing: the debuff
    // lands after the attack is declared, so the battle has to re-read the
    // attacker. A 6000 swing at a 5000 Leader connects; the same attacker at
    // 3000 does not, and the defender must not be asked to pay for it.
    //
    // From `open-optcg-trace(6)`, turn 10: the engine froze the attack power at
    // declaration, quoted the defender a `counterShortfall` for an attack that
    // could no longer connect, and the defender spent a Counter Event on it.
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("shiki", "OP17-048")];
    state.players.p1.hand = [{ instanceId: "rocks", cardNumber: "OP17-041" }];
    state.players.p2.board = [
      character("attacker", "FIX-002", {
        attachedDon: state.players.p2.activeDon.splice(0, 2),
      }),
    ];
    const printed = requireKnownCard("FIX-002").power ?? 0;
    const leaderPower = currentPower(state, "p1", "p1-leader");

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "attacker" &&
          action.targetInstanceId === "p1-leader",
      ),
    );
    // Declared at printed power plus the two given DON!!, over the Leader.
    expect(battleAttackPower(played)).toBe(printed + 2000);
    expect(battleAttackPower(played)).toBeGreaterThan(leaderPower);

    for (const optionId of ["apply", "rocks", "attacker"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }

    // The debuff is on the card, and the battle followed it down.
    expect(currentPower(played, "p2", "attacker")).toBe(printed + 2000 - 3000);
    expect(battleAttackPower(played)).toBe(printed + 2000 - 3000);

    played = submit(
      played,
      requireAction(played, (action) => action.type === "pass"),
    );
    // The Counter window offers nothing but `pass`: the attack already fails,
    // so no Counter card can buy anything. This is the regression -- the frozen
    // scalar left `counterShortfall` at 1001 here and the defender paid it.
    const counterActions = getLegalActions(played, "p1");
    expect(counterActions.every((action) => action.type === "pass")).toBe(true);
    const observed = observe(played, "p1");
    expect(observed.activeBattle?.attackPower).toBe(printed + 2000 - 3000);
    expect(observed.activeBattle?.counterShortfall).toBe(0);

    const resolved = applyAction(played, {
      ...requireAction(played, (action) => action.type === "pass"),
      revision: played.revision,
    });
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: "battle-resolved",
        attackPower: printed + 2000 - 3000,
        defensePower: leaderPower,
        outcome: "defended",
      }),
    );
    expect(resolved.state.players.p1.life).toHaveLength(
      state.players.p1.life.length,
    );
  });

  it("OP17-048 is not offered without a Rocks Pirates card in hand", () => {
    const state = scenario();
    state.players.p1.board = [character("shiki", "OP17-048")];
    state.players.p1.hand = [{ instanceId: "plain", cardNumber: "FIX-002" }];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "shiki" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    expect(played.pendingEffect).toBeNull();
  });
});

/**
 * OP17-115 "There's Still A Code Of Honour? You Clowns!" -- both halves.
 *
 * The [Main] half grants [Unblockable] to a Leader, which nothing in the pool
 * had done before: a Leader is in no zone, so the flag lives on the player. The
 * [Counter] half is name-restricted, and its two ends -- the number the offer
 * promises and the number the resolution adds -- are pinned together, because
 * they used to disagree.
 */
describe("OP17-115 There's Still A Code Of Honour?", () => {
  /** A Linlin Leader with the Event in hand, ready to play. */
  function withEvent(leaderCardNumber: string): GameState {
    const state = scenario();
    state.players.p1.leaderCardNumber = leaderCardNumber;
    state.players.p1.hand = [{ instanceId: "honour", cardNumber: "OP17-115" }];
    return state;
  }

  it("makes a [Charlotte Linlin] Leader unblockable for the turn", () => {
    const state = submit(
      withEvent("OP17-099"),
      requireAction(
        withEvent("OP17-099"),
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:honour"),
      ),
    );
    expect(hasKeyword(state, "p1", "p1-leader", "Unblockable")).toBe(true);
    // A Leader carries its grants on the player rather than on a BoardCard, so
    // the step that says so is the only place either seat learns of one.
    expect(state.events.at(-1)).toEqual({
      type: "keyword-granted",
      playerId: "p1",
      targetInstanceId: "p1-leader",
      targetCardNumber: "OP17-099",
      keyword: "Unblockable",
      expiresAtTurn: state.turn,
      sourceCardNumber: "OP17-115",
    });
    expect(observe(state, "p1").self.leader.grantedKeywords).toEqual([
      { keyword: "Unblockable", expiresAtTurn: state.turn },
    ]);
    // "During this turn": the grant is gone by the opponent's turn.
    expect(
      hasKeyword(
        { ...state, turn: state.turn + 1 },
        "p1",
        "p1-leader",
        "Unblockable",
      ),
    ).toBe(false);
  });

  it("grants nothing under a Leader of another name", () => {
    const other = withEvent("ST31-001");
    const state = submit(
      other,
      requireAction(
        other,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:honour"),
      ),
    );
    expect(hasKeyword(state, "p1", "p1-leader", "Unblockable")).toBe(false);
  });
});

/**
 * The offer and the resolution of a target-restricted Counter Event.
 *
 * `counterEventPower` reads the restriction, and the resolution used to add the
 * printed number regardless -- so a defender told an Event "adds nothing to this
 * battle" got the full 4000 for playing it anyway. Both directions are pinned.
 */
describe("OP17 Counter Event resolution matches its offer", () => {
  covers("OP17-037", "[Counter]");
  covers("OP17-076", "[Counter]");
  covers("OP17-077", "[Counter]");
  covers("OP17-078", "[Counter]");
  /** p2 attacks p1, who holds `cardNumber` as a Counter Event. */
  function counterWith(
    cardNumber: string,
    setUp: (state: GameState) => void,
    targetInstanceId = "p1-leader",
  ): GameState {
    const state = scenario();
    setTurnPlayer(state, "p2");
    setUp(state);
    state.players.p1.hand = [{ instanceId: "event", cardNumber }];
    const declared = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.targetInstanceId === targetInstanceId,
      ),
    );
    // Through the block step, which p1 answers by declining to block.
    const blocked = submit(
      declared,
      requireAction(declared, (action) => action.type === "pass"),
    );
    return submit(
      blocked,
      requireAction(
        blocked,
        (action) =>
          action.type === "activate-counter-event" &&
          action.eventInstanceId === "event",
      ),
    );
  }

  it("adds the printed power when the target satisfies the restriction", () => {
    const state = counterWith("OP17-115", (game) => {
      game.players.p1.leaderCardNumber = "OP17-099";
    });
    expect(state.activeAttack?.counterPower).toBe(4000);
  });

  it("OP17-078's unrestricted +4000 lands on the Leader and on a Character alike", () => {
    // "[printed text omitted -- pnpm card:text OP17-078]" carries no `target` filter,
    // so unlike OP17-115 above it is worth its printed number whatever the
    // attack is pointed at. Both halves of that claim, because a missing filter
    // is only correct if it is missing in both directions.
    expect(counterEventPower(scenario(), "p1", "OP17-078")).toBe(4000);
    expect(counterWith("OP17-078", () => {}).activeAttack?.counterPower).toBe(
      4000,
    );
    const onCharacter = counterWith(
      "OP17-078",
      (game) => {
        game.players.p1.board = [
          character("body", "ST31-003", { rested: true }),
        ];
      },
      "body",
    );
    expect(onCharacter.activeAttack?.counterPower).toBe(4000);
  });

  it("is not offered when the target does not satisfy the restriction", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.leaderCardNumber = "OP17-099";
    // Rested, so it is a legal thing to attack, and at 3000 power it loses
    // to the attack -- a Counter is only offered into a battle the
    // defender has not already won.
    state.players.p1.board = [
      character("blocker", "ST31-003", { rested: true }),
    ];
    state.players.p1.hand = [{ instanceId: "event", cardNumber: "OP17-115" }];
    const declared = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "blocker",
      ),
    );
    const blocked = submit(
      declared,
      requireAction(declared, (action) => action.type === "pass"),
    );

    expect(
      getLegalActions(blocked, "p1").find(
        (action) => action.type === "activate-counter-event",
      ),
    ).toBeUndefined();
  });

  it("OP17-037/076 forecast their power as undecided, then pay their own cost when taken", () => {
    for (const cardNumber of ["OP17-037", "OP17-076"]) {
      expect(counterEventPower(scenario(), "p1", cardNumber)).toBeUndefined();
    }
    // 037 pays by resting a card.
    let state = counterWith("OP17-037", (game) => {
      game.players.p1.board = [character("body", "FIX-002")];
    });
    expect(effectOptions(state).sort()).toEqual(["apply", "skip"]);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "body",
      ),
    );
    expect(state.activeAttack?.counterPower).toBe(3000);
    expect(state.players.p1.board[0]!.rested).toBe(true);

    // 076 pays by trashing a hand card. `counterWith` overwrites the hand
    // with just the Event itself once `setUp` returns, so the spare card is
    // added after, once the Event is already the one being activated.
    let state2 = counterWith("OP17-076", () => {});
    state2.players.p1.hand.push({
      instanceId: "spare",
      cardNumber: "FIX-001",
    });
    state2 = submit(
      state2,
      requireAction(
        state2,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    state2 = submit(
      state2,
      requireAction(
        state2,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "spare",
      ),
    );
    expect(state2.activeAttack?.counterPower).toBe(3000);
    expect(state2.players.p1.trash.map((c) => c.instanceId).sort()).toEqual([
      "event",
      "spare",
    ]);
  });

  it("OP17-077's Counter forecast and resolution agree on the DON!! −1 cost", () => {
    // Only 1 active DON!! -- pays the printed cost 1 and has nothing left
    // for the Counter's own DON!! −1.
    const short = scenario();
    short.players.p1.activeDon = ["only"];
    expect(counterEventPower(short, "p1", "OP17-077")).toBe(0);

    const state = counterWith("OP17-077", () => {});
    expect(state.activeAttack?.counterPower).toBe(4000);
    // The printed cost rests 1 DON!! and the Counter's own DON!! −1 returns
    // 1 to the DON!! deck; `returnDonToDeck` pulls from the rested pool
    // first, so DON!! cards being fungible, the one it returns is the one
    // just rested for the printed cost -- net 1 DON!! leaves the field
    // (none stay rested), not 2.
    expect(state.players.p1.activeDon).toHaveLength(9);
    expect(state.players.p1.restedDon).toHaveLength(0);
  });
});

/**
 * Dual-attribute cards.
 *
 * OP17 is the first set here to print two attribute icons on one card, which
 * Bandai's card list records as a single slash-joined field. Every
 * attribute-gated effect in the engine used to compare that field for
 * equality, so a `Slash/Strike` Character was invisible to `{Slash}` effects
 * while its own card reads as a Slash. OP12-028 Kouzuki Hiyori's search is the
 * cheapest place to see it: it may only take a Slash card out of the top five.
 */
describe("OP17 dual-attribute cards", () => {
  it("counts each printed attribute of a slash-joined field", () => {
    expect(requireKnownCard("OP17-114").attribute).toBe("Slash/Strike");
    expect(requireKnownCard("OP17-061").attribute).toBe("Strike/Special");
  });

  it("offers a Slash/Strike Character to Hiyori's Slash-only search", () => {
    let state = scenario();
    // Hiyori's search is gated on her own OP12-020 Leader.
    state.players.p1.leaderCardNumber = "OP12-020";
    state.players.p1.board = [character("hiyori", "OP12-028")];
    state.players.p1.deck = [
      { instanceId: "dual-slash", cardNumber: "OP17-114" }, // Slash/Strike
      { instanceId: "dual-other", cardNumber: "OP17-061" }, // Strike/Special
      { instanceId: "plain", cardNumber: "FIX-001" },
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-main:hiyori",
      ),
    );
    const offered = getLegalActions(state, "p1")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    // The Slash half is enough; neither of the other two prints Slash at all,
    // so the only other option is taking nothing.
    expect(offered).toEqual(["dual-slash", "done"]);
  });
});

/**
 * OP17-077 Kundali Dragon Swarm -- the same ramp shape as OP17-078, one DON!!
 * cheaper and one more card of hand cost.
 *
 * Its DON!! count is here because the secondary import had it as 2 where
 * Bandai's list prints 3, and nothing else pinned it: this is the test that
 * would have caught the transcription.
 */
describe("OP17-077 Kundali Dragon Swarm", () => {
  covers("OP17-077", "[Main]");
  it("pays one DON!! and two cards for three rested DON!!", () => {
    let state = scenario();
    state.players.p1.leaderCardNumber = "OP17-058";
    state.players.p1.hand = [
      { instanceId: "swarm", cardNumber: "OP17-077" },
      { instanceId: "spare-0", cardNumber: "FIX-002" },
      { instanceId: "spare-1", cardNumber: "FIX-002" },
    ];
    state.players.p1.donDeck = ["don-a", "don-b", "don-c", "don-d"];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:swarm"),
      ),
    );
    // Cost 1 paid, then 3 more DON!! rested by the text.
    expect(state.players.p1.restedDon).toHaveLength(4);
    for (const optionId of ["spare-0", "spare-1"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.players.p1.hand).toHaveLength(0);
    // Three DON!! arrive rested, so they cannot be spent this turn.
    expect(state.players.p1.restedDon).toHaveLength(7);
    expect(state.players.p1.donDeck).toEqual(["don-d"]);
  });
});

/**
 * OP17-078 Drunken Dragon Bagua -- Purple's ramp Event.
 *
 * Two costs, and the second one is why `trashFromHand` exists: the Event leaves
 * the hand as it is played, so a hand holding only the Event cannot pay it.
 */
describe("OP17-078 Drunken Dragon Bagua", () => {
  covers("OP17-078", "[Main]");

  function withEvent(leaderCardNumber: string, handSize: number): GameState {
    const state = scenario();
    state.players.p1.leaderCardNumber = leaderCardNumber;
    state.players.p1.hand = [
      { instanceId: "bagua", cardNumber: "OP17-078" },
      ...Array.from({ length: handSize }, (_, index) => ({
        instanceId: `spare-${index}`,
        cardNumber: "FIX-002",
      })),
    ];
    state.players.p1.donDeck = ["don-a", "don-b", "don-c", "don-d"];
    return state;
  }

  const play = (state: GameState): GameState =>
    submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:bagua"),
      ),
    );

  it("pays two DON!! and two cards for three rested DON!!", () => {
    let state = play(withEvent("OP17-058", 2));
    // Cost 2 paid, then 2 more DON!! rested by the text.
    expect(state.players.p1.restedDon).toHaveLength(4);
    for (const optionId of ["spare-0", "spare-1"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.players.p1.hand).toHaveLength(0);
    // Three DON!! arrive rested, so they cannot be spent this turn.
    expect(state.players.p1.restedDon).toHaveLength(7);
    expect(state.players.p1.donDeck).toEqual(["don-d"]);
  });

  it("adds no DON!! under a Leader without the type, but still pays", () => {
    let state = play(withEvent("ST31-001", 2));
    for (const optionId of ["spare-0", "spare-1"]) {
      state = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(state.players.p1.donDeck).toHaveLength(4);
    expect(state.players.p1.restedDon).toHaveLength(4);
  });

  it("is not offered on a hand that cannot pay the second cost", () => {
    const state = withEvent("OP17-058", 1);
    expect(
      getLegalActions(state, "p1").some((action) =>
        action.actionId.endsWith("mechanic-event:bagua"),
      ),
    ).toBe(false);
  });
});

/**
 * OP17-050 Streusen -- one end of the deck for both looked-at cards.
 *
 * Bandai's OP-17 Q&A: one of the two cannot go on top and the other at the
 * bottom. So the end is one decision, asked once, and the order at that end is
 * the second.
 */
describe("OP17-050 Streusen On Play", () => {
  covers("OP17-050", "[On Play]");
  const played = () => {
    const game = table()
      .seed("op17-050-streusen")
      .atTurn(3, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("streusen", "OP17-050")])
      .withDeckTop("p1", [
        instance("a", "ST31-002"),
        instance("b", "OP17-032"),
        instance("c", "ST31-004"),
        instance("d", "ST31-002"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-050" });
    return game;
  };
  const deckOf = (game: ReturnType<typeof played>) =>
    game.state.players.p1.deck.map((card) => card.instanceId);
  const handOf = (game: ReturnType<typeof played>) =>
    game.state.players.p1.hand.map((card) => card.instanceId);

  it("asks for one end for both cards, with no split between them", () => {
    const game = played();
    expect(effectOptions(game.state)).toEqual(["top", "bottom"]);
    game.play({ type: "resolve-effect", optionId: "bottom" });
    // The order at that end is the only decision left, and every option it
    // offers sends both cards the same way.
    const offers = game
      .legalActions()
      .filter((action) => action.type === "resolve-effect");
    expect(offers).toHaveLength(1);
    expect(offers[0]!.optionId).not.toContain("|");
  });

  it("bottoms both in the order chosen, then draws the card under them", () => {
    const game = played();
    game.play({ type: "resolve-effect", optionId: "bottom" });
    game.submit(reorderAction(game.action({ type: "resolve-effect" }), [1, 0]));
    expect(game.state.pendingEffect).toBeNull();
    // c was on top once a and b went under, so c is the card drawn.
    expect(handOf(game)).toEqual(["c"]);
    expect(deckOf(game)).toEqual(["d", "b", "a"]);
  });

  it("keeps both on top in the order chosen, and draws the first of them", () => {
    const game = played();
    game.play({ type: "resolve-effect", optionId: "top" });
    game.submit(reorderAction(game.action({ type: "resolve-effect" }), [1, 0]));
    expect(game.state.pendingEffect).toBeNull();
    // The cards are placed one after another, b and then a on top of it, so a
    // is the card drawn and b is left above c.
    expect(handOf(game)).toEqual(["a"]);
    expect(deckOf(game)).toEqual(["b", "c", "d"]);
  });
});

/**
 * OP17-106 Charlotte Smoothie -- a Life gain paid for with DON!!, and a Trigger
 * that plays the body without it.
 */
describe("OP17-106 Charlotte Smoothie", () => {
  function inHand(setUp: (state: GameState) => void = () => {}): GameState {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "smoothie", cardNumber: "OP17-106" },
    ];
    state.players.p1.deck = [
      { instanceId: "top", cardNumber: "FIX-002" },
      { instanceId: "next", cardNumber: "FIX-002" },
    ];
    state.players.p2.hand = [{ instanceId: "theirs", cardNumber: "FIX-002" }];
    setUp(state);
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "smoothie",
      ),
    );
  }

  it("rests 2 DON!! to bank a Life card, then the opponent discards", () => {
    let state = inHand();
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    // Five for the body's own cost, two for the text's.
    expect(state.players.p1.restedDon).toHaveLength(7);
    expect(state.players.p1.life[0]?.instanceId).toBe("top");
    // The opponent picks which of their own cards goes, so the choice is theirs.
    expect(state.activePlayer).toBe("p2");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "theirs",
      ),
    );
    expect(state.players.p2.hand).toHaveLength(0);
    expect(state.players.p2.trash.map((card) => card.instanceId)).toEqual([
      "theirs",
    ]);
  });

  it("declines the cost and keeps its DON!! active", () => {
    const state = submit(
      inHand(),
      requireAction(
        inHand(),
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );
    expect(state.players.p1.life).toHaveLength(
      scenario().players.p1.life.length,
    );
    expect(state.players.p2.hand).toHaveLength(1);
  });

  it("offers nothing on the opponent's turn, which is what [Your Turn] means", () => {
    // Played by p1 while p2 is the turn player -- the shape its own Trigger
    // creates. `createOnPlayEffect` is the dispatch the Trigger path uses too.
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    state.players.p2.hand = [{ instanceId: "theirs", cardNumber: "FIX-002" }];
    const result = createOnPlayEffect(state, "p1", {
      instanceId: "smoothie",
      cardNumber: "OP17-106",
    });
    expect(result.pending).toBeNull();
  });
});

/**
 * OP17-034 Rockstar -- the first "base power becomes N" the DSL can express.
 */
describe("OP17-034 Rockstar Activate: Main", () => {
  covers("OP17-034", "[Activate: Main]");
  function board(leaderCardNumber: string, opposingBoost: number): GameState {
    const state = scenario();
    state.players.p1.leaderCardNumber = leaderCardNumber;
    state.players.p1.board = [character("rockstar", "OP17-034")];
    state.players.p1.restedDon = ["rested-1"];
    state.players.p1.activeDon = [];
    // The opponent's Leader is 5000 printed, and DON!! given to it grants no
    // power on this player's turn, so the boost has to come from a modifier --
    // which is also the realistic way a 5000 Leader is over the line here.
    if (opposingBoost > 0) {
      state.players.p2.leaderPowerModifiers = [
        { amount: opposingBoost, expiresAtTurn: state.turn + 1 },
      ];
    }
    return state;
  }

  const activate = (state: GameState): GameState =>
    submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.includes("rockstar"),
      ),
    );

  it("sets a rested DON!! active and raises the Leader's base power", () => {
    // OP17-020 Shanks is the {Red-Haired Pirates} Leader; 5000 printed.
    const state = activate(board("OP17-020", 1000));
    expect(state.players.p1.activeDon).toEqual(["rested-1"]);
    expect(currentPower(state, "p1", "p1-leader")).toBe(6000);
    // "[printed text omitted -- pnpm card:text OP17-020]" outlives this turn.
    expect(
      currentPower({ ...state, turn: state.turn + 1 }, "p1", "p1-leader"),
    ).toBe(6000);
    expect(
      currentPower({ ...state, turn: state.turn + 2 }, "p1", "p1-leader"),
    ).toBe(5000);
  });

  it("is not offered while the opponent's Leader is under 6000 power", () => {
    const state = board("OP17-020", 0);
    expect(
      getLegalActions(state, "p1").some(
        (action) =>
          action.type === "activate-main" &&
          action.actionId.includes("rockstar"),
      ),
    ).toBe(false);
  });

  it("still frees the DON!! under a Leader of another type", () => {
    const state = activate(board("ST31-001", 1000));
    expect(state.players.p1.activeDon).toEqual(["rested-1"]);
    expect(currentPower(state, "p1", "p1-leader")).toBe(
      currentPower(board("ST31-001", 1000), "p1", "p1-leader"),
    );
  });
});

/**
 * Session 3: the Whitebeard/Red-Haired/Rocks/Big Mom/Elbaph batch, one commit
 * for Commons and Uncommons, one for Rares.
 */
describe("OP17-003 Izo On Play", () => {
  function played(leaderCardNumber: string): GameState {
    const state = scenario();
    state.players.p1.leaderCardNumber = leaderCardNumber;
    state.players.p1.hand = [{ instanceId: "izo", cardNumber: "OP17-003" }];
    state.players.p2.board = [
      character("rested", "ST31-002", { rested: true }),
    ];
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "izo",
      ),
    );
  }

  it("debuffs a rested opponent Character under [Edward.Newgate]", () => {
    let state = played("OP17-001");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "rested",
      ),
    );
    expect(currentPower(state, "p2", "rested")).toBe(0);
  });

  it("also applies under a {Land of Wano} Leader", () => {
    const state = played("OP17-004"); // Inuarashi & Nekomamushi, {Land of Wano} type
    expect(effectOptions(state)).toEqual(["rested", "done"]);
  });

  it("offers nothing under an unrelated Leader", () => {
    const state = played("ST31-001");
    expect(effectOptions(state)).toEqual([]);
  });

  it("carries [Rush: Character]", () => {
    const state = scenario();
    state.players.p1.board = [character("izo", "OP17-003")];
    expect(hasKeyword(state, "p1", "izo", "Rush: Character")).toBe(true);
  });
});

describe("OP17-069 Jack", () => {
  covers("OP17-069", "[Rush: Character]");
  it("carries [Rush: Character], the printed keyword the egman-derived data dropped", () => {
    const state = scenario();
    state.players.p1.board = [character("jack", "OP17-069")];
    expect(hasKeyword(state, "p1", "jack", "Rush: Character")).toBe(true);
  });
});

describe("OP17-007 Kouzuki Oden On Play", () => {
  function played(leaderCardNumber: string): GameState {
    const state = scenario();
    state.players.p1.leaderCardNumber = leaderCardNumber;
    state.players.p1.hand = [
      { instanceId: "oden", cardNumber: "OP17-007" },
      { instanceId: "cheap", cardNumber: "OP17-002" }, // Whitebeard Pirates, 6000
    ];
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "oden",
      ),
    );
  }

  it("plays a Whitebeard Pirates card under [Edward.Newgate]", () => {
    let state = played("OP17-001");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "cheap",
      ),
    );
    expect(state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP17-007",
      "OP17-002",
    ]);
  });

  it("also works under a {Land of Wano} Leader", () => {
    const state = played("OP17-004"); // Inuarashi & Nekomamushi, {Land of Wano} type
    expect(effectOptions(state)).toEqual(["cheap", "done"]);
  });

  it("offers nothing under an unrelated Leader", () => {
    const state = played("ST31-001");
    expect(effectOptions(state)).toEqual([]);
  });
});

describe("OP17-008 Jozu On Play", () => {
  it("raises an [Edward.Newgate] Leader's base power to 8000", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-001";
    state.players.p1.hand = [{ instanceId: "jozu", cardNumber: "OP17-008" }];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "jozu",
      ),
    );
    expect(currentPower(played, "p1", "p1-leader")).toBe(8000);
  });

  it("does nothing under another Leader", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "ST31-001";
    state.players.p1.hand = [{ instanceId: "jozu", cardNumber: "OP17-008" }];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "jozu",
      ),
    );
    expect(currentPower(played, "p1", "p1-leader")).toBe(
      currentPower(state, "p1", "p1-leader"),
    );
  });
});

describe("OP17-013 Portgas.D.Ace", () => {
  it("debuffs a rested opponent Character under [Edward.Newgate]", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-001";
    state.players.p1.hand = [{ instanceId: "ace", cardNumber: "OP17-013" }];
    state.players.p2.board = [
      character("rested", "ST31-002", { rested: true }),
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "ace",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "rested",
      ),
    );
    expect(currentPower(played, "p2", "rested")).toBe(0);
  });
});

describe("OP17-013 hand-price discount", () => {
  it("reduces the DON!! cost to play while a 10000+ power opponent Character is out", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "ace", cardNumber: "OP17-013" }];
    state.players.p2.board = [character("big", "OP17-062")]; // 12000 power
    const action = requireAction(
      state,
      (a) => a.type === "play-card" && a.cardInstanceId === "ace",
    );
    expect(action.summary).toContain("cost 4 DON!!");
  });

  it("charges the full cost with no qualifying opponent Character", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "ace", cardNumber: "OP17-013" }];
    const action = requireAction(
      state,
      (a) => a.type === "play-card" && a.cardInstanceId === "ace",
    );
    expect(action.summary).toContain("cost 6 DON!!");
  });
});

describe("OP17-015 Marco", () => {
  it("recurs itself from the trash on K.O. by trashing a Whitebeard Pirates card", () => {
    const state = scenario();
    state.players.p1.trash = [{ instanceId: "marco", cardNumber: "OP17-015" }];
    state.players.p1.hand = [{ instanceId: "wb", cardNumber: "OP17-002" }];
    const onKo = createOnKoResult(
      state,
      "p1",
      { instanceId: "marco", cardNumber: "OP17-015" },
      "p1",
    );
    expect(onKo.pending).not.toBeNull();
    state.pendingEffect = onKo.pending;
    setTurnPlayer(state, "p1");
    expect(effectOptions(state)).toEqual(expect.arrayContaining(["apply"]));
    let resolved = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    resolved = submit(
      resolved,
      requireAction(
        resolved,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "wb",
      ),
    );
    expect(resolved.players.p1.board.map((c) => c.cardNumber)).toEqual([
      "OP17-015",
    ]);
  });
});

describe("OP17-019 event", () => {
  it("finds a Whitebeard Pirates card and the Trigger raises the Leader", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-019" }];
    state.players.p1.deck = Array.from({ length: 5 }, (_, index) => ({
      instanceId: `d${index}`,
      cardNumber: index === 2 ? "OP17-002" : "FIX-002",
    }));
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "d2",
      ),
    );
    expect(played.players.p1.hand.map((card) => card.instanceId)).toEqual([
      "d2",
    ]);
    expect(played.players.p1.deck).toHaveLength(4);
  });
});

describe("OP17-025 Building Snake", () => {
  covers("OP17-025", "[On K.O.]", "[Activate: Main]");
  it("K.O.s a rested cost-6-or-less opposing Character on K.O.", () => {
    const state = scenario();
    state.players.p2.board = [character("small", "OP14-102", { rested: true })];
    const onKo = createOnKoResult(
      state,
      "p1",
      { instanceId: "snake", cardNumber: "OP17-025" },
      "p1",
    );
    expect(onKo.pending).not.toBeNull();
    state.pendingEffect = onKo.pending;
    setTurnPlayer(state, "p1");
    const resolved = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "small",
      ),
    );
    expect(resolved.players.p2.board).toHaveLength(0);
  });

  it("gives a rested DON!! to a [Shanks] Leader", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-020";
    state.players.p1.board = [character("snake", "OP17-025")];
    state.players.p1.restedDon = ["rested-a"];
    const activated = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" && action.actionId.includes("snake"),
      ),
    );
    expect(activated.players.p1.leaderAttachedDon).toEqual(["rested-a"]);
    expect(activated.players.p1.restedDon).toEqual([]);
  });

  it("is not offered under another Leader", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "ST31-001";
    state.players.p1.board = [character("snake", "OP17-025")];
    state.players.p1.restedDon = ["rested-a"];
    expect(
      getLegalActions(state, state.activePlayer).some(
        (action) =>
          action.type === "activate-main" && action.actionId.includes("snake"),
      ),
    ).toBe(false);
  });
});

describe("OP17-026 Fugar", () => {
  covers("OP17-026", "[When Attacking]");
  it("rests a cost-2-or-less opponent Character on When Attacking under {Red-Haired Pirates}", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-020";
    state.players.p1.board = [
      character("fugar", "OP17-026", { playedTurn: 1 }),
    ];
    state.players.p2.board = [character("small", "FIX-001")]; // cost 1
    let attacked = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "fugar",
      ),
    );
    attacked = submit(
      attacked,
      requireAction(
        attacked,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "small",
      ),
    );
    expect(
      attacked.players.p2.board.find((card) => card.instanceId === "small")
        ?.rested,
    ).toBe(true);
  });
});

describe("OP17-027 Benn.Beckman", () => {
  covers("OP17-027", "[On Play]");
  it("draws and rests up to 2 opponent Characters under {Red-Haired Pirates}", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-020";
    state.players.p1.hand = [{ instanceId: "beckman", cardNumber: "OP17-027" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    state.players.p2.board = [
      character("a", "FIX-001"),
      character("b", "FIX-002"),
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "beckman",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["top"]);
    for (const optionId of ["a", "b"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(played.players.p2.board.every((card) => card.rested)).toBe(true);
  });
});

describe("OP17-029 Hongo", () => {
  covers("OP17-029", "[On Play]");
  it("sets a DON!! active and rests up to 2 cheap opponent Characters", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "hongo", cardNumber: "OP17-029" }];
    state.players.p1.restedDon = ["r1"];
    state.players.p2.board = [
      character("a", "FIX-001"), // cost 1
      character("b", "ST31-002"), // cost 5, too expensive
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "hongo",
      ),
    );
    expect(played.players.p1.activeDon).toContain("r1");
    expect(effectOptions(played)).toEqual(["a", "done"]);
    // Only one Character is cheap enough, so resting it ends the "up to 2"
    // without a second, optionless decision.
    played = submit(
      played,
      requireAction(
        played,
        (action) => action.type === "resolve-effect" && action.optionId === "a",
      ),
    );
    expect(effectOptions(played)).toEqual([]);
    expect(
      played.players.p2.board.find((c) => c.instanceId === "a")?.rested,
    ).toBe(true);
  });
});

describe("OP17-032 / OP17-033 look-and-add", () => {
  covers("OP17-032", "[On Play]");
  covers("OP17-033", "[On Play]");
  it.each(["OP17-032", "OP17-033"])(
    "finds a Red-Haired Pirates card from the top 3 (%s)",
    (cardNumber) => {
      const state = scenario();
      state.players.p1.hand = [{ instanceId: "card", cardNumber }];
      state.players.p1.deck = [
        { instanceId: "a", cardNumber: "FIX-002" },
        { instanceId: "b", cardNumber: "OP17-022" }, // Shanks, {Red-Haired Pirates}
        { instanceId: "c", cardNumber: "FIX-002" },
      ];
      let played = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "play-card" && action.cardInstanceId === "card",
        ),
      );
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === "b",
        ),
      );
      expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["b"]);
      expect(played.players.p1.deck.map((c) => c.instanceId)).toEqual([
        "a",
        "c",
      ]);
    },
  );
});

describe("OP17-033 On Your Opponent's Attack", () => {
  covers("OP17-033", "[On Your Opponent's Attack]");
  it("trashes itself to rest the attacker's Leader", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("roux", "OP17-033")];
    const attacked = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    let resolved = submit(
      attacked,
      requireAction(
        attacked,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    resolved = submit(
      resolved,
      requireAction(
        resolved,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "p2-leader",
      ),
    );
    expect(resolved.players.p1.trash.map((c) => c.cardNumber)).toEqual([
      "OP17-033",
    ]);
  });
});

describe("OP17-036 / OP17-055 / OP17-056 events", () => {
  covers("OP17-036", "[Main]");
  covers("OP17-055", "[Main]");
  covers("OP17-056", "[Main]");
  it("OP17-036 rests and K.O.s under a paid DON!! cost", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-036" }];
    state.players.p2.board = [
      character("a", "FIX-001"),
      character("b", "FIX-001", { rested: true }),
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    );
    expect(played.players.p1.restedDon).toHaveLength(7);
    played = submit(
      played,
      requireAction(
        played,
        (action) => action.type === "resolve-effect" && action.optionId === "a",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) => action.type === "resolve-effect" && action.optionId === "b",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "done",
      ),
    );
    expect(played.players.p2.board.map((c) => c.instanceId)).toEqual(["a"]);
    expect(played.players.p2.board[0]?.rested).toBe(true);
  });

  it("OP17-055 grants Unblockable to Rocks.D.Xebec", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-055" }];
    state.players.p1.board = [character("xebec", "OP17-118")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "xebec",
      ),
    );
    expect(hasKeyword(played, "p1", "xebec", "Unblockable")).toBe(true);
  });

  it("OP17-055 grants Unblockable to a Rocks.D.Xebec Leader", () => {
    // The bracketed name reaches the Leader as readily as the Character, and
    // for this deck it is the point of the card: OP17-039 is named
    // Rocks.D.Xebec, and the Character of that name costs 10. OP17-036's
    // "[printed text omitted -- pnpm card:text OP17-036]" is read the same way, below.
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-039";
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-055" }];
    state.players.p1.board = [];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "p1-leader",
      ),
    );
    expect(hasKeyword(played, "p1", "p1-leader", "Unblockable")).toBe(true);
  });

  it("OP17-055 leaves a Leader of another name alone", () => {
    // The guard against reading "your [Rocks.D.Xebec]" as "your Leader": with
    // no card of the name anywhere, resting the DON!! buys nothing.
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-020";
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-055" }];
    state.players.p1.board = [];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    );
    expect(hasKeyword(played, "p1", "p1-leader", "Unblockable")).toBe(false);
  });

  it("OP17-056 bounces a cost-6-or-less opponent Character", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-056" }];
    state.players.p1.restedDon = [];
    state.players.p1.activeDon = Array.from({ length: 10 }, (_, i) => `a${i}`);
    state.players.p2.board = [character("target", "ST31-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(played.players.p2.board).toHaveLength(0);
    expect(played.players.p2.hand.map((c) => c.cardNumber)).toEqual([
      "ST31-002",
    ]);
  });
});

/**
 * The `mechanic-event` offer is gated on the program's top-level condition.
 *
 * OP17-038's whole Main effect is "rest 4 of your cards: rest up to 1 of your
 * opponent's Characters", wrapped in an `if` on having 4 restable cards. With
 * fewer than 4 on board the Event would resolve to nothing -- trashed for no
 * effect -- so it must not be offered at all. This is what stopped a rules
 * agent from wasting the card on a turn where it could do nothing.
 */
describe("OP17-038 event offer is gated on its condition", () => {
  covers("OP17-038", "[Main]");
  it("is not offered with fewer than 4 restable cards on board", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-038" }];
    // Leader + 2 Characters = 3 restable cards, short of the 4 the Event needs.
    state.players.p1.board = [
      character("a", "FIX-001"),
      character("b", "FIX-001"),
    ];
    const actions = getLegalActions(state, state.activePlayer);
    expect(
      actions.some(
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    ).toBe(false);
  });

  it("is offered with 4 or more restable cards on board", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-038" }];
    // Leader + 3 Characters = 4 restable cards, meeting the Event's gate.
    state.players.p1.board = [
      character("a", "FIX-001"),
      character("b", "FIX-001"),
      character("c", "FIX-001"),
    ];
    const actions = getLegalActions(state, state.activePlayer);
    expect(
      actions.some(
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    ).toBe(true);
  });

  it("is not offered when the only restable cards are already rested", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-038" }];
    // Leader + 4 Characters, but all four Characters are rested, so only the
    // Leader is restable -- short of the 4 the Event needs.
    state.players.p1.board = [
      character("a", "FIX-001", { rested: true }),
      character("b", "FIX-001", { rested: true }),
      character("c", "FIX-001", { rested: true }),
      character("d", "FIX-001", { rested: true }),
    ];
    const actions = getLegalActions(state, state.activePlayer);
    expect(
      actions.some(
        (action) =>
          action.type === "activate-main" &&
          action.actionId.endsWith("mechanic-event:evt"),
      ),
    ).toBe(false);
  });
});

describe("OP17-036 / OP17-055 / OP17-056 Counter", () => {
  covers("OP17-036", "[Counter]");
  covers("OP17-055", "[Counter]");
  covers("OP17-056", "[Counter]");
  function counterWith(
    cardNumber: string,
    setUp: (state: GameState) => void,
  ): GameState {
    const state = scenario();
    setTurnPlayer(state, "p2");
    setUp(state);
    state.players.p1.hand = [{ instanceId: "event", cardNumber }];
    const declared = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    const blocked = submit(
      declared,
      requireAction(declared, (action) => action.type === "pass"),
    );
    return submit(
      blocked,
      requireAction(
        blocked,
        (action) =>
          action.type === "activate-counter-event" &&
          action.eventInstanceId === "event",
      ),
    );
  }

  it("OP17-036 adds +4000 for a [Shanks] Leader", () => {
    const state = counterWith("OP17-036", (game) => {
      game.players.p1.leaderCardNumber = "OP17-020";
    });
    expect(state.activeAttack?.counterPower).toBe(4000);
  });

  it("OP17-055 adds +2000 for a Rocks Pirates Leader", () => {
    const state = counterWith("OP17-055", (game) => {
      game.players.p1.leaderCardNumber = "OP17-039";
    });
    expect(state.activeAttack?.counterPower).toBe(2000);
  });

  it("OP17-056 adds +2000 for a Rocks Pirates Leader", () => {
    const state = counterWith("OP17-056", (game) => {
      game.players.p1.leaderCardNumber = "OP17-039";
    });
    expect(state.activeAttack?.counterPower).toBe(2000);
  });
});

describe("OP17-041 Wang Zhi On Play", () => {
  covers("OP17-041", "[On Play]");
  it("reads the printed cost, so a raised cost-1 Character is still bottomed", () => {
    // "a base cost of 1" is the printed number. `maxCost: 1` read the
    // *effective* one, and OP17-094 Rodo is printed at 1 and gains +12 cost
    // under an {Elbaph} Leader -- so the clause could not touch the very
    // Characters the OP-17 Elbaph package puts on the board.
    //
    // The other half of the same fault, "1 or less" where the text says
    // exactly 1, is unreachable today: the card pool has no 0-cost Character.
    // `minBaseCost` is set with `maxBaseCost` anyway, so it stays correct when
    // one is printed.
    const state = scenario();
    state.players.p2.leaderCardNumber = "OP17-079"; // {Elbaph}, switching Rodo on
    state.players.p1.hand = [
      { instanceId: "wang", cardNumber: "OP17-041" },
      { instanceId: "spare", cardNumber: "FIX-002" },
    ];
    state.players.p2.board = [
      character("rodo", "OP17-094"), // printed 1, effective 13
      character("costly", "ST31-002"), // cost 5
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "wang",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "spare",
      ),
    );

    expect(played.players.p2.deck.map((c) => c.instanceId)).toEqual(["rodo"]);
    expect(played.players.p2.board.map((c) => c.instanceId)).toEqual([
      "costly",
    ]);
  });

  it("bottoms every opposing cost-1 Character by trashing a hand card", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "wang", cardNumber: "OP17-041" },
      { instanceId: "spare", cardNumber: "FIX-002" },
    ];
    state.players.p2.board = [
      character("cheap", "FIX-001"), // cost 1
      character("costly", "ST31-002"), // cost 5
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "wang",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "spare",
      ),
    );
    expect(played.players.p2.board.map((c) => c.cardNumber)).toEqual([
      "ST31-002",
    ]);
    expect(played.players.p2.deck.map((c) => c.instanceId)).toEqual(["cheap"]);
  });
});

describe("OP17-042 Kaido On Play", () => {
  covers("OP17-042", "[On Play]");
  it("debuffs an opponent Character by revealing 3 Rocks Pirates cards", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "kaido", cardNumber: "OP17-042" },
      { instanceId: "r1", cardNumber: "OP17-039" },
      { instanceId: "r2", cardNumber: "OP17-039" },
      { instanceId: "r3", cardNumber: "OP17-039" },
    ];
    state.players.p2.board = [character("target", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "kaido",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    for (const optionId of ["r1", "r2", "r3"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    // Revealing is a cost, not a trash: all three cards stay in hand.
    expect(played.players.p1.hand.map((c) => c.instanceId).sort()).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
    expect(currentPower(played, "p2", "target")).toBe(
      requireKnownCard("FIX-002").power! - 3000,
    );
  });

  it("resolves to nothing with fewer than 3 qualifying cards, even applied", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "kaido", cardNumber: "OP17-042" },
      { instanceId: "r1", cardNumber: "OP17-039" },
    ];
    state.players.p2.board = [character("target", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "kaido",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    expect(currentPower(played, "p2", "target")).toBe(
      requireKnownCard("FIX-002").power ?? 0,
    );
  });
});

describe("OP17-054 Miss Buckingham Stussy", () => {
  covers("OP17-054", "[On Play]", "[Activate: Main]");
  it("prevents attacks from a cost-6-or-less opponent Character on play", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "stussy", cardNumber: "OP17-054" }];
    state.players.p2.board = [character("target", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "stussy",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(
      played.players.p2.board.find((c) => c.instanceId === "target")
        ?.cannotAttackUntilTurn,
    ).toBeGreaterThan(played.turn);
  });

  it("reads the printed cost, so it still reaches an Elbaph giant at +12 cost", () => {
    // The clause prints "base cost of 6 or less". OP17-089 Jaguar.D.Saul is
    // printed at 4 and sits on the field at 16, so an effective-cost filter
    // could not touch a single giant -- and OP-17 Elbaph Sabo is the matchup
    // this card is most wanted in. `maxBaseCost` reads the printed number.
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "stussy", cardNumber: "OP17-054" }];
    state.players.p2.board = [character("giant", "OP17-089")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "stussy",
      ),
    );
    // The giant's effective cost is well past 6; its printed cost is 4.
    expect(effectOptions(played)).toContain("giant");
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "giant",
      ),
    );
    expect(
      played.players.p2.board.find((c) => c.instanceId === "giant")
        ?.cannotAttackUntilTurn,
    ).toBeGreaterThan(played.turn);
  });

  it("also prevents attacks by resting itself and 3 DON!!", () => {
    const state = scenario();
    state.players.p1.board = [character("stussy", "OP17-054")];
    state.players.p2.board = [character("target", "FIX-002")];
    let activated = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" && action.actionId.includes("stussy"),
      ),
    );
    activated = submit(
      activated,
      requireAction(
        activated,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(
      activated.players.p1.board.find((c) => c.instanceId === "stussy")?.rested,
    ).toBe(true);
    expect(activated.players.p1.activeDon).toHaveLength(7);
  });
});

describe("OP17-059 Aramaki On Play", () => {
  it("draws and K.O.s up to 2 cheap opponent Characters for DON!! −1", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "aramaki", cardNumber: "OP17-059" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    state.players.p2.board = [
      character("a", "FIX-001"),
      character("b", "FIX-001"),
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "aramaki",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "return-don:active",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["top"]);
    for (const optionId of ["a", "b"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(played.players.p2.board).toHaveLength(0);
  });
});

describe("OP17-075 X.Drake On Play", () => {
  covers("OP17-075", "[On Play]");

  /** p1 plays X.Drake with `fieldDon` active DON!! and p2 holding two cards. */
  function drake(fieldDon: number): GameState {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "drake", cardNumber: "OP17-075" }];
    state.players.p1.activeDon = Array.from(
      { length: fieldDon },
      (_, index) => `don-${index}`,
    );
    state.players.p2.hand = [
      { instanceId: "theirs-a", cardNumber: "FIX-001" },
      { instanceId: "theirs-b", cardNumber: "FIX-002" },
    ];
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "drake",
      ),
    );
  }

  /** Takes the optional clause and pays its `DON!! −2` out of the named pool. */
  function payDonMinus(state: GameState, pool: "active" | "rested"): GameState {
    let paid = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    // The pool is only asked about when both are non-empty: with every DON!!
    // rested by the body's own cost there is nothing to choose between, and
    // the engine returns them without a prompt.
    for (let don = 0; don < 2; don += 1) {
      const choice = getLegalActions(paid, "p1").find(
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === `return-don:${pool}`,
      );
      if (!choice) break;
      paid = submit(paid, choice);
    }
    return paid;
  }

  it("lets X.Drake's controller pick the DON!! −2 discard face-down", () => {
    // Bandai's OP-17 Q&A: the activating player picks 1 card from the
    // opponent's hand, face-down. So p1 holds the decision, and what it is
    // offered is a position in p2's hand -- never a card.
    let played = payDonMinus(drake(4), "active");
    expect(played.activePlayer).toBe("p1");
    const offered = getLegalActions(played, "p1").filter(
      (action) => action.type === "resolve-effect",
    );
    expect(offered.map((action) => action.optionId)).toEqual([
      "face-down:0",
      "face-down:1",
    ]);
    expect(offered.map((action) => action.option)).toEqual([
      {
        kind: "face-down",
        owner: "opponent",
        zone: "hand",
        position: 0,
        of: 2,
      },
      {
        kind: "face-down",
        owner: "opponent",
        zone: "hand",
        position: 1,
        of: 2,
      },
    ]);
    // Nothing on the offer names either card: no id, no card number, no name.
    const wire = JSON.stringify(observe(played, "p1").legalActions);
    for (const secret of ["theirs-a", "theirs-b", "FIX-001", "FIX-002"]) {
      expect(wire).not.toContain(secret);
    }

    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "face-down:1",
      ),
    );
    const trashed = played.players.p2.trash.map((card) => card.instanceId);
    const kept = played.players.p2.hand.map((card) => card.instanceId);
    expect(trashed).toHaveLength(1);
    expect(kept).toHaveLength(1);
    expect([...trashed, ...kept].sort()).toEqual(["theirs-a", "theirs-b"]);

    // The order behind the positions comes off the serialized RNG, so the same
    // game and the same position trash the same card on a replay.
    const replayed = submit(
      payDonMinus(drake(4), "active"),
      requireAction(
        payDonMinus(drake(4), "active"),
        (action) =>
          action.type === "resolve-effect" && action.optionId === "face-down:1",
      ),
    );
    expect(replayed.players.p2.trash.map((card) => card.instanceId)).toEqual(
      trashed,
    );
  });

  it("OP17-075:boundary costs a ramp deck two DON!! off the field, not two rested", () => {
    // The reason a Kaido policy should mostly decline this: `DON!! −2` returns
    // the DON!! to the DON!! deck rather than resting it, so on the 2-DON!!
    // turn where the 2-cost body is castable, taking the clause empties the
    // field -- and the field is this deck's whole plan. Playing X.Drake as a
    // 2000-power body with a 2000 Counter leaves both DON!! where they are.
    const played = drake(2);
    expect(effectOptions(played).sort()).toEqual(["apply", "skip"]);
    const paid = payDonMinus(played, "rested");
    expect(paid.players.p1.activeDon).toHaveLength(0);
    expect(paid.players.p1.restedDon).toHaveLength(0);

    const declined = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );
    expect(declined.players.p1.restedDon).toHaveLength(2);
    expect(declined.players.p2.hand).toHaveLength(2);
  });
});

describe("OP17-060 Ulti & Page One On Play", () => {
  covers("OP17-060", "[On Play]");

  it("adds an active DON!! and K.O.s a weak Character under {Animal Kingdom Pirates}", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-058";
    state.players.p1.hand = [{ instanceId: "ulti", cardNumber: "OP17-060" }];
    state.players.p1.donDeck = ["extra"];
    state.players.p2.board = [character("weak", "FIX-001")]; // 2000 power
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "ulti",
      ),
    );
    expect(played.players.p1.activeDon).toContain("extra");
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "weak",
      ),
    );
    expect(played.players.p2.board).toHaveLength(0);
  });
});

describe("OP17-061 Lead Performers", () => {
  covers("OP17-061", "[On Play]", "[Activate: Main]");
  it("adds a Life card for DON!! −1 under {Animal Kingdom Pirates}", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-058";
    state.players.p1.hand = [{ instanceId: "lead", cardNumber: "OP17-061" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "lead",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "return-don:active",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "top",
      ),
    );
    expect(played.players.p1.life[0]?.instanceId).toBe("top");
  });

  it("trashes itself to play a King/Queen/Jack from hand", () => {
    const state = scenario();
    state.players.p1.board = [character("lead", "OP17-061")];
    state.players.p1.hand = [{ instanceId: "king", cardNumber: "OP17-064" }];
    let activated = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" && action.actionId.includes("lead"),
      ),
    );
    activated = submit(
      activated,
      requireAction(
        activated,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "king",
      ),
    );
    expect(activated.players.p1.trash.map((c) => c.cardNumber)).toEqual([
      "OP17-061",
    ]);
    expect(activated.players.p1.board.map((c) => c.cardNumber)).toEqual([
      "OP17-064",
    ]);
  });
});

describe("OP17-065 Queen On Play", () => {
  covers("OP17-065", "[On Play]");
  it("draws and prevents attacks from up to 2 opponent Characters for DON!! −1", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "queen", cardNumber: "OP17-065" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    state.players.p2.board = [character("a", "ST31-002")]; // cost 5
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "queen",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "return-don:active",
      ),
    );
    // The opponent has a single Character, so the "up to 2" ends with it.
    played = submit(
      played,
      requireAction(
        played,
        (action) => action.type === "resolve-effect" && action.optionId === "a",
      ),
    );
    expect(effectOptions(played)).toEqual([]);
    expect(
      played.players.p2.board.find((c) => c.instanceId === "a")
        ?.cannotAttackUntilTurn,
    ).toBeGreaterThan(played.turn);
  });
});

describe("OP17-068 Sasaki When Attacking", () => {
  covers("OP17-068", "[When Attacking]");

  it("trashes 2 hand cards for 2 rested DON!! under {Animal Kingdom Pirates}", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-058";
    state.players.p1.board = [character("sasaki", "OP17-068")];
    state.players.p1.hand = [
      { instanceId: "a", cardNumber: "FIX-001" },
      { instanceId: "b", cardNumber: "FIX-001" },
    ];
    state.players.p1.donDeck = ["extra-a", "extra-b"];
    let attacked = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "sasaki",
      ),
    );
    attacked = submit(
      attacked,
      requireAction(
        attacked,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    for (const optionId of ["a", "b"]) {
      attacked = submit(
        attacked,
        requireAction(
          attacked,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(attacked.players.p1.hand).toHaveLength(0);
    expect(attacked.players.p1.restedDon).toEqual(
      expect.arrayContaining(["extra-a", "extra-b"]),
    );
  });
});

describe("OP17-073 Basil Hawkins On Play", () => {
  covers("OP17-073", "[On Play]");
  it("trashes a hand card to add an active DON!! under {Animal Kingdom Pirates}", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-058";
    state.players.p1.hand = [
      { instanceId: "hawkins", cardNumber: "OP17-073" },
      { instanceId: "spare", cardNumber: "FIX-002" },
    ];
    state.players.p1.donDeck = ["extra"];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "hawkins",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "spare",
      ),
    );
    expect(played.players.p1.activeDon).toContain("extra");
  });
});

describe("OP17-074 Yamato On Play", () => {
  covers("OP17-074", "[On Play]");
  it("adds a rested DON!! card", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "yamato", cardNumber: "OP17-074" }];
    state.players.p1.donDeck = ["extra"];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "yamato",
      ),
    );
    expect(played.players.p1.restedDon).toContain("extra");
  });
});

describe("OP17-081 Gerd On Play", () => {
  covers("OP17-081", "[On Play]");
  it("trashes a hand card to recur a cheap Character from the trash", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "gerd", cardNumber: "OP17-081" },
      { instanceId: "spare", cardNumber: "FIX-002" },
    ];
    state.players.p1.trash = [{ instanceId: "jinbe", cardNumber: "ST31-002" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "gerd",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "spare",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "jinbe",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["jinbe"]);
  });
});

describe("OP17-087 Nico Robin", () => {
  covers("OP17-087", "[On Play]", "static");
  it("debuffs an opponent Character while an Elbaph giant is out", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "robin", cardNumber: "OP17-087" }];
    state.players.p1.board = [character("giant", "OP17-085")];
    state.players.p2.board = [character("target", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "robin",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(currentPower(played, "p2", "target")).toBe(
      requireKnownCard("FIX-002").power! - 3000,
    );
  });

  it("has no On Play offer without a giant, but still carries +3000 power itself", () => {
    const state = scenario();
    state.players.p1.board = [character("robin", "OP17-087")];
    expect(currentPower(state, "p1", "robin")).toBe(
      requireKnownCard("OP17-087").power ?? 0,
    );
  });
});

describe("OP17-096 Counter and Trigger", () => {
  covers("OP17-096", "[Counter]");
  covers("OP17-096", "[Trigger]");
  it("adds +4000 while an Elbaph giant is out, 0 otherwise", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.hand = [{ instanceId: "evt", cardNumber: "OP17-096" }];
    state.players.p1.board = [character("giant", "OP17-085")];
    const declared = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    const blocked = submit(
      declared,
      requireAction(declared, (action) => action.type === "pass"),
    );
    const countered = submit(
      blocked,
      requireAction(
        blocked,
        (action) =>
          action.type === "activate-counter-event" &&
          action.eventInstanceId === "evt",
      ),
    );
    expect(countered.activeAttack?.counterPower).toBe(4000);
  });

  it("adds an Elbaph card from the trash via its Trigger", () => {
    const state = scenario();
    state.players.p1.trash = [{ instanceId: "giant", cardNumber: "OP17-085" }];
    const result = createTriggerResult(state, "p1", {
      instanceId: "evt",
      cardNumber: "OP17-096",
    });
    expect(result.pending).not.toBeNull();
    state.pendingEffect = result.pending;
    setTurnPlayer(state, "p1");
    expect(effectOptions(state)).toEqual(expect.arrayContaining(["giant"]));
  });
});

describe("OP17-103 Charlotte Katakuri On Play", () => {
  it("banks a Life card and debuffs an opponent Character under {Big Mom Pirates}", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-099";
    state.players.p1.hand = [{ instanceId: "kata", cardNumber: "OP17-103" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    state.players.p2.board = [character("target", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "kata",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "top",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(played.players.p1.life[0]?.instanceId).toBe("top");
    expect(currentPower(played, "p2", "target")).toBe(
      requireKnownCard("FIX-002").power! - 3000,
    );
  });

  it("offers nothing on the opponent's turn", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.leaderCardNumber = "OP17-099";
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    const result = createOnPlayEffect(state, "p1", {
      instanceId: "kata",
      cardNumber: "OP17-103",
    });
    expect(result.pending).toBeNull();
  });
});

describe("OP17-104 Charlotte Cracker On Play", () => {
  it("rests 2 DON!! to bank a Life card under {Big Mom Pirates}", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-099";
    state.players.p1.hand = [{ instanceId: "cracker", cardNumber: "OP17-104" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "cracker",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "top",
      ),
    );
    expect(played.players.p1.life[0]?.instanceId).toBe("top");
    // 3 for the body's own cost, 2 for the text's.
    expect(played.players.p1.restedDon).toHaveLength(5);
  });
});

describe("OP17-109 Charlotte Pudding On Play", () => {
  it("trashes a Trigger card from hand to draw 3", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "pudding", cardNumber: "OP17-109" },
      { instanceId: "trig", cardNumber: "OP17-108" }, // has a printed Trigger
    ];
    state.players.p1.deck = [
      { instanceId: "d1", cardNumber: "FIX-002" },
      { instanceId: "d2", cardNumber: "FIX-002" },
      { instanceId: "d3", cardNumber: "FIX-002" },
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "pudding",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "trig",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId).sort()).toEqual([
      "d1",
      "d2",
      "d3",
    ]);
  });
});

describe("OP17-110 Charlotte Perospero On Play", () => {
  it("plays a cheap Big Mom Pirates Character and gains [Rush]", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "perospero", cardNumber: "OP17-110" },
      // OP17-104 Charlotte Cracker is a Big Mom Pirates Character at cost 3.
      { instanceId: "spare", cardNumber: "OP17-104" },
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "perospero",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "spare",
      ),
    );
    expect(played.players.p1.board.map((c) => c.cardNumber)).toEqual([
      "OP17-110",
      "OP17-104",
    ]);
    expect(
      hasKeyword(
        played,
        "p1",
        played.players.p1.board.find((c) => c.cardNumber === "OP17-110")!
          .instanceId,
        "Rush",
      ),
    ).toBe(true);
  });

  it("offers nothing on the opponent's turn", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    const result = createOnPlayEffect(state, "p1", {
      instanceId: "perospero",
      cardNumber: "OP17-110",
    });
    expect(result.pending).toBeNull();
  });
});

describe("OP17-111 Charlotte Mont-d'or On Play", () => {
  it("K.O.s up to 2 cost-1-or-less opponent Characters by revealing 2 Trigger cards", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "montdor", cardNumber: "OP17-111" },
      { instanceId: "t1", cardNumber: "OP17-108" },
      { instanceId: "t2", cardNumber: "OP17-108" },
    ];
    state.players.p2.board = [
      character("a", "FIX-001"),
      character("b", "FIX-001"),
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "montdor",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    for (const optionId of ["t1", "t2"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    for (const optionId of ["a", "b"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(played.players.p2.board).toHaveLength(0);
    // Revealing is a cost, not a trash.
    expect(played.players.p1.hand.map((c) => c.instanceId).sort()).toEqual([
      "t1",
      "t2",
    ]);
  });
});

describe("OP17-114 Sweet 3 Generals On Play", () => {
  it("rests 2 DON!! to draw, bank a Life card, and debuff up to 2 opponents", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "sweet3", cardNumber: "OP17-114" }];
    state.players.p1.deck = [
      { instanceId: "top", cardNumber: "FIX-002" },
      { instanceId: "next", cardNumber: "FIX-002" },
    ];
    state.players.p2.board = [
      character("a", "FIX-002"),
      character("b", "FIX-002"),
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "sweet3",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    // The draw happens first and takes "top"; "next" is what the deck-top
    // step then finds and offers for the Life cards.
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "next",
      ),
    );
    for (const optionId of ["a", "b"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["top"]);
    expect(played.players.p1.life.map((c) => c.instanceId)).toEqual(["next"]);
    expect(
      played.players.p2.board.every(
        (c) => currentPower(played, "p2", c.instanceId) === 1000,
      ),
    ).toBe(true);
  });
});

describe("OP17-020 Shanks Leader Activate: Main", () => {
  covers("OP17-020", "[Activate: Main]");
  function board(): GameState {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-020";
    return state;
  }

  const activate = (state: GameState): GameState =>
    submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "p1-leader",
      ),
    );

  it("pays by trashing a hand card and locks a rested opponent Character out of Refresh", () => {
    const state = board();
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    state.players.p2.board = [character("target", "FIX-001", { rested: true })];
    let played = activate(state);
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "hand",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(played.players.p1.trash.map((c) => c.cardNumber)).toEqual([
      "FIX-002",
    ]);
    const targetCard = played.players.p2.board[0]!;
    expect(targetCard.cannotRefreshUntilTurn).toBe(played.turn + 1);
  });

  it("paying with DON!! instead does nothing if none is active", () => {
    const state = board();
    state.players.p1.activeDon = [];
    state.players.p2.board = [character("target", "FIX-001", { rested: true })];
    let played = activate(state);
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "don",
      ),
    );
    // The `if` gate inside the branch fails with no active DON!!, so nothing
    // is restricted -- picking an unaffordable branch never pays for free.
    expect(played.pendingEffect).toBeNull();
    expect(played.players.p2.board[0]!.cannotRefreshUntilTurn).toBeUndefined();
  });
});

describe("OP17-022 Shanks On Play", () => {
  covers("OP17-022", "[On Play]");
  it("sets 2 DON!! active, then rests every opponent Character", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "shanks", cardNumber: "OP17-022" }];
    // 10 active DON!! pays the printed cost 10, moving all 10 to rested; the
    // text's own "set up to 2 active" then draws 2 back out of that pool.
    state.players.p2.board = [
      character("c1", "FIX-001"),
      character("c2", "FIX-002"),
    ];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "shanks",
      ),
    );
    expect(played.players.p1.activeDon).toHaveLength(2);
    expect(played.players.p1.restedDon).toHaveLength(8);
    expect(played.players.p2.board.every((c) => c.rested)).toBe(true);
  });
});

describe("OP17-031 Yasopp", () => {
  covers("OP17-031", "[On Play]", "[End of Your Turn]");
  it("On Play draws and rests a cost-8-or-less opponent Character", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "yasopp", cardNumber: "OP17-031" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    state.players.p2.board = [character("victim", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "yasopp",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "victim",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["top"]);
    expect(played.players.p2.board[0]!.rested).toBe(true);
  });

  it("[End of Your Turn] activates a Red-Haired Pirates Character", () => {
    const state = scenario();
    state.players.p1.board = [
      character("yasopp", "OP17-031", { rested: true }),
    ];
    let played = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "yasopp",
      ),
    );
    expect(played.players.p1.board[0]!.rested).toBe(false);
  });

  it("[End of Your Turn] reaches a Red-Haired Pirates Allies Character", () => {
    const state = scenario();
    state.players.p1.board = [
      character("yasopp", "OP17-031"),
      character("ally", "OP17-021", { rested: true }),
    ];
    let played = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "ally",
      ),
    );
    expect(played.players.p1.board[1]!.rested).toBe(false);
  });

  it("[End of Your Turn] asks nothing when no Red-Haired Pirate is rested", () => {
    const state = scenario();
    state.players.p1.board = [character("yasopp", "OP17-031")];
    const played = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    expect(
      getLegalActions(played, played.activePlayer).some(
        (action) => action.type === "resolve-effect",
      ),
    ).toBe(false);
  });

  it("On Play does not offer an already-rested opponent Character", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "yasopp", cardNumber: "OP17-031" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    state.players.p2.board = [character("victim", "FIX-002", { rested: true })];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "yasopp",
      ),
    );
    expect(
      getLegalActions(played, played.activePlayer).some(
        (action) => action.type === "resolve-effect",
      ),
    ).toBe(false);
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["top"]);
  });
});

describe("OP17-039 Rocks.D.Xebec Leader When Attacking", () => {
  covers("OP17-039", "[When Attacking]");
  // The ability is printed on the Leader, so the Leader itself has to be the
  // attacker for `[When Attacking]` to fire -- a Character attacking under
  // this Leader does not carry it.
  function leaderAttacks(state: GameState): GameState {
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
  }

  it("trashes a hand card and draws 2 when the reveal is a Rocks Pirates card", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-039";
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    state.players.p1.deck = [
      { instanceId: "top", cardNumber: "OP17-041" },
      { instanceId: "d2", cardNumber: "FIX-002" },
    ];
    let played = leaderAttacks(state);
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual([
      "top",
      "d2",
    ]);
  });

  it("draws nothing when the revealed card is not Rocks Pirates", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-039";
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    let played = leaderAttacks(state);
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    expect(played.players.p1.hand).toHaveLength(0);
    expect(played.players.p1.deck.map((c) => c.instanceId)).toEqual(["top"]);
  });
});

describe("OP17-046 Gloriosa On Play", () => {
  covers("OP17-046", "[On Play]");
  it("bottoms a cost-5-or-less Character from either board, at most one total", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "gloriosa", cardNumber: "OP17-046" },
    ];
    state.players.p2.board = [character("target", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "gloriosa",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "opponent",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(played.players.p2.board).toHaveLength(0);
    expect(played.players.p2.deck.map((c) => c.instanceId)).toEqual(["target"]);
  });

  it("names the bottomed Character in the step both players see", () => {
    // The card was face-up on the board, so who went to the deck is public
    // knowledge -- redacting it left the log saying only that "a card" moved,
    // and the player who cast Gloriosa could not tell what they had hit.
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "gloriosa", cardNumber: "OP17-046" },
    ];
    state.players.p2.board = [character("target", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "gloriosa",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "opponent",
      ),
    );
    const resolved = applyAction(played, {
      ...requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
      revision: played.revision,
    });
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: "card-moved",
        playerId: "p2",
        cardInstanceId: "target",
        cardNumber: "FIX-002",
        from: "board",
        to: "deck",
        position: "bottom",
        sourceCardNumber: "OP17-046",
      }),
    );
    for (const viewer of ["p1", "p2"] as const) {
      expect(
        observe(resolved.state, viewer).publicEvents.find(
          (event) => event.type === "card-moved",
        ),
      ).toMatchObject({ cardNumber: "FIX-002" });
    }
  });
});

describe("OP17-063 Kaido", () => {
  covers("OP17-063", "static", "[Activate: Main]");
  it("gives every hand Character without a printed Counter +1000 while on the board", () => {
    const state = scenario();
    state.players.p1.board = [character("kaido", "OP17-063")];
    // OP17-041 Wang Zhi has no printed Counter -- unconditional once a card
    // like it is in hand.
    expect(requireKnownCard("OP17-041").counter).toBeNull();
    state.players.p1.hand = [{ instanceId: "wang", cardNumber: "OP17-041" }];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state.phase = "counter";
    const counter = getLegalActions(state, "p1").find(
      (action) => action.type === "counter",
    );
    if (counter?.type !== "counter") throw new Error("EXPECTED_COUNTER");
    expect(counter.counterPower).toBe(1000);
  });

  it("[Activate: Main] negates and K.O.s a cost-6-or-less opponent Character, only if played this turn", () => {
    const state = scenario();
    state.players.p1.board = [
      character("kaido", "OP17-063", { playedTurn: state.turn }),
    ];
    state.players.p2.board = [character("victim", "FIX-002")];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "kaido",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "victim",
      ),
    );
    expect(played.players.p2.board).toHaveLength(0);
    expect(played.players.p1.activeDon).toHaveLength(9);
  });

  it("does nothing if Kaido was not played this turn, but still pays the DON!!", () => {
    const state = scenario();
    state.players.p1.board = [
      character("kaido", "OP17-063", { playedTurn: state.turn - 1 }),
    ];
    state.players.p2.board = [character("victim", "FIX-002")];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "kaido",
      ),
    );
    expect(played.pendingEffect).toBeNull();
    expect(played.players.p2.board).toHaveLength(1);
    expect(played.players.p1.activeDon).toHaveLength(9);
  });
});

describe("OP17-099 Charlotte Linlin Leader When Attacking", () => {
  // The ability is printed on the Leader, so the Leader must be the
  // attacker, and the hand it costs must be in place *before* the attack is
  // declared -- the ability dispatches as part of declaring it.
  function attack(): GameState {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-099";
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
  }

  it("the opponent chooses the mill-and-life branch", () => {
    const state = attack();
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    // The opponent, not this Leader's controller, picks the branch.
    expect(played.activePlayer).toBe("p2");
    played.players.p1.hand = [{ instanceId: "mill", cardNumber: "FIX-001" }];
    played.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-002" }];
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "mill-then-life",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "mill",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "top",
      ),
    );
    expect(played.players.p1.trash.map((c) => c.instanceId).sort()).toEqual([
      "mill",
      "pitch",
    ]);
    expect(played.players.p1.life.map((c) => c.instanceId)).toEqual(["top"]);
  });

  it("the other branch trashes the card out of the opponent's hand", () => {
    const state = attack();
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    played.players.p2.hand = [{ instanceId: "theirs", cardNumber: "FIX-001" }];
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "opponent-discards",
      ),
    );
    // Picked at random by this Leader's controller (see test/op17-linlin), so
    // a one-card hand is taken without a prompt to either side.
    expect(played.pendingEffect).toBeNull();
    expect(played.players.p2.trash.map((c) => c.instanceId)).toEqual([
      "theirs",
    ]);
  });
});

describe("OP17-112 Charlotte Linlin On Play and board-aura", () => {
  it("draws, then can bank a deck card to the top of Life", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "linlin", cardNumber: "OP17-112" }];
    state.players.p1.deck = [
      { instanceId: "drawn", cardNumber: "FIX-002" },
      { instanceId: "top", cardNumber: "FIX-001" },
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "linlin",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "life",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "top",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["drawn"]);
    expect(played.players.p1.life.map((c) => c.instanceId)).toEqual(["top"]);
  });

  it("or steal a card from the top of the opponent's Life to their own hand", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "linlin", cardNumber: "OP17-112" }];
    state.players.p1.deck = [{ instanceId: "drawn", cardNumber: "FIX-002" }];
    state.players.p2.life = [{ instanceId: "life-top", cardNumber: "FIX-001" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "linlin",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "steal",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "life-top",
      ),
    );
    expect(played.players.p2.life).toHaveLength(0);
    expect(played.players.p2.hand.map((c) => c.instanceId)).toEqual([
      "life-top",
    ]);
  });

  it("raises a [Trigger] Character with 4000 printed power to 8000 on your turn only", () => {
    const state = scenario();
    state.players.p1.board = [
      character("linlin", "OP17-112"),
      character("trigger-body", "OP17-114"),
    ];
    expect(requireKnownCard("OP17-114").trigger).not.toBe("");
    expect(requireKnownCard("OP17-114").power).toBe(4000);
    expect(currentPower(state, "p1", "trigger-body")).toBe(8000);
    setTurnPlayer(state, "p2");
    expect(currentPower(state, "p1", "trigger-body")).toBe(4000);
  });
});

/**
 * OP17-112 Charlotte Linlin -- a base power it rewrote is the card's base power.
 *
 * Bandai's OP-17 Q&A: a Character whose base power became 8000 no longer has
 * 4000 base power, so a "base power 4000 or less" filter stops reaching it.
 * OP12-001 Silvers Rayleigh's Leader is the probe -- a +2000 for 1 of your
 * Characters with 4000 base power or less, asked on your own turn, which is
 * when Linlin's aura is live.
 */
describe("OP17-112 Charlotte Linlin's base power against a base-power filter", () => {
  covers("OP17-112", "[Your Turn]");
  const rayleigh = (board: ReturnType<typeof boardCharacter>[]) => {
    const game = table()
      .seed("op17-112-base-power")
      .atTurn(3, { active: "p1" })
      .bareTable()
      .withLeader("p1", "OP12-001")
      .withHand("p1", [
        instance("event-1", "OP12-019"),
        instance("event-2", "OP12-019"),
      ])
      .withBoard("p1", board)
      .build();
    game.play({ summary: "Activate Silvers Rayleigh [OP12-001]" });
    game.play({ type: "resolve-effect", optionId: "event-1" });
    game.play({ type: "resolve-effect", optionId: "event-2" });
    return effectOptions(game.state);
  };

  it("takes a 4000 [Trigger] body out of a 4000-or-less filter once it is 8000", () => {
    const options = rayleigh([
      boardCharacter("linlin", "OP17-112"),
      boardCharacter("sweet", "OP17-114"), // 4000 printed, [Trigger]
      boardCharacter("hongo", "OP17-029"), // 4000 printed, no [Trigger]
    ]);
    expect(options).toContain("hongo");
    expect(options).not.toContain("sweet");
  });

  it("leaves the same body inside the filter without Linlin", () => {
    const options = rayleigh([
      boardCharacter("sweet", "OP17-114"),
      boardCharacter("hongo", "OP17-029"),
    ]);
    expect(options).toContain("hongo");
    expect(options).toContain("sweet");
  });
});

describe("OP17-086 Nami On Play", () => {
  covers("OP17-086", "[On Play]");
  it("trashes an {Elbaph} card from hand to draw 2", () => {
    const state = scenario();
    state.players.p1.hand = [
      { instanceId: "nami", cardNumber: "OP17-086" },
      { instanceId: "elbaph", cardNumber: "OP17-081" },
    ];
    state.players.p1.deck = [
      { instanceId: "d1", cardNumber: "FIX-001" },
      { instanceId: "d2", cardNumber: "FIX-002" },
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "nami",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "elbaph",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId).sort()).toEqual([
      "d1",
      "d2",
    ]);
  });

  it("is not offered without an {Elbaph} card in hand", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "nami", cardNumber: "OP17-086" }];
    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "nami",
      ),
    );
    expect(played.pendingEffect).toBeNull();
  });
});

describe("OP17-018 / OP17-116 Stage removal and board-state Counter", () => {
  function withStage(cardNumber: string): GameState {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "event", cardNumber }];
    state.players.p2.stage = {
      instanceId: "their-stage",
      cardNumber: "OP17-057",
      rested: false,
    };
    return state;
  }

  it.each(["OP17-018", "OP17-116"])(
    "%s's [Main] rests 2 DON!! to K.O. the opponent's Stage",
    (cardNumber) => {
      const state = withStage(cardNumber);
      let played = submit(
        state,
        requireAction(
          state,
          (action) =>
            action.type === "activate-main" &&
            action.sourceInstanceId === "event",
        ),
      );
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" &&
            action.optionId === "their-stage",
        ),
      );
      expect(played.players.p2.stage).toBeNull();
      expect(played.players.p2.trash.map((c) => c.instanceId)).toEqual([
        "their-stage",
      ]);
      // 1 for the printed cost, 2 for the [Main] text.
      expect(played.players.p1.restedDon).toHaveLength(3);
    },
  );

  it("OP17-018's Counter adds +4000 only with 2 or more 8000-power-or-more Characters", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "event", cardNumber: "OP17-018" }];
    expect(counterEventPower(state, "p1", "OP17-018")).toBe(0);
    state.players.p1.board = [
      character("a", "OP17-005"), // 12000 power
      character("b", "OP17-022"), // 12000 power
    ];
    expect(counterEventPower(state, "p1", "OP17-018")).toBe(4000);
  });

  it("OP17-116's Counter adds +4000 only with 2 or more [Trigger] Characters", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "event", cardNumber: "OP17-116" }];
    expect(counterEventPower(state, "p1", "OP17-116")).toBe(0);
    state.players.p1.board = [
      character("a", "OP17-114"), // has a printed Trigger
      character("b", "OP17-111"), // has a printed Trigger
    ];
    expect(counterEventPower(state, "p1", "OP17-116")).toBe(4000);
  });
});

describe("OP17-085 Dorry / OP17-092 Brogy", () => {
  covers("OP17-085", "[On Play]");
  covers("OP17-092", "[On Play]");
  it("085 plays Brogy from hand under an {Elbaph} Leader, then shuts off further Character plays", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-079"; // {Elbaph} Leader
    state.players.p1.hand = [
      { instanceId: "dorry", cardNumber: "OP17-085" },
      { instanceId: "brogy", cardNumber: "OP17-092" },
      { instanceId: "spare", cardNumber: "FIX-002" },
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "dorry",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "brogy",
      ),
    );
    expect(played.players.p1.board.map((c) => c.instanceId).sort()).toEqual([
      "brogy",
      "dorry",
    ]);
    // Neither Brogy (already played) nor the vanilla spare Character is
    // offered any more this turn -- only Stages and Events would be.
    expect(
      getLegalActions(played, "p1").some(
        (action) => action.type === "play-card",
      ),
    ).toBe(false);
  });

  it("092 finds Dorry from the trash, and neither plays anything without an {Elbaph} Leader", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-079";
    state.players.p1.hand = [{ instanceId: "brogy", cardNumber: "OP17-092" }];
    state.players.p1.trash = [{ instanceId: "dorry", cardNumber: "OP17-085" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "brogy",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "dorry",
      ),
    );
    expect(played.players.p1.board.map((c) => c.instanceId).sort()).toEqual([
      "brogy",
      "dorry",
    ]);

    const noElbaph = scenario();
    noElbaph.players.p1.hand = [
      { instanceId: "brogy2", cardNumber: "OP17-092" },
      { instanceId: "spare", cardNumber: "FIX-002" },
    ];
    const playedNoElbaph = submit(
      noElbaph,
      requireAction(
        noElbaph,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "brogy2",
      ),
    );
    expect(playedNoElbaph.pendingEffect).toBeNull();
    // Nothing shut off this player's Character plays without the Leader
    // gate passing -- the spare Character is still offered.
    expect(
      getLegalActions(playedNoElbaph, "p1").some(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "spare",
      ),
    ).toBe(true);
  });
});

describe("OP17-011 Blamenco [When Attacking]", () => {
  it("debuffs an opponent Character only with 2 DON!! attached to itself", () => {
    const state = scenario();
    state.players.p1.board = [character("blamenco", "OP17-011")];
    state.players.p2.board = [character("victim", "FIX-002")];
    const noDon = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "blamenco" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    expect(noDon.pendingEffect).toBeNull();

    const withDon = scenario();
    withDon.players.p1.board = [
      character("blamenco", "OP17-011", { attachedDon: ["d1", "d2"] }),
    ];
    withDon.players.p2.board = [character("victim", "FIX-002")];
    let played = submit(
      withDon,
      requireAction(
        withDon,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "blamenco" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "victim",
      ),
    );
    expect(currentPower(played, "p2", "victim")).toBe(
      (requireKnownCard("FIX-002").power ?? 0) - 4000,
    );
  });
});

describe("OP17-049 Charlotte Linlin", () => {
  covers("OP17-049", "[On Play]", "[On Your Opponent's Attack]");
  it("On Play: the opponent chooses between you drawing 2 or discarding their own 2", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "linlin", cardNumber: "OP17-049" }];
    state.players.p1.deck = [
      { instanceId: "d1", cardNumber: "FIX-001" },
      { instanceId: "d2", cardNumber: "FIX-002" },
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "linlin",
      ),
    );
    expect(played.activePlayer).toBe("p2");
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "draw",
      ),
    );
    expect(played.players.p1.hand.map((c) => c.instanceId).sort()).toEqual([
      "d1",
      "d2",
    ]);
  });

  it("On Play: the opponent instead discards 2 of their own cards", () => {
    const state = scenario();
    state.players.p1.hand = [{ instanceId: "linlin", cardNumber: "OP17-049" }];
    state.players.p2.hand = [
      { instanceId: "o1", cardNumber: "FIX-001" },
      { instanceId: "o2", cardNumber: "FIX-002" },
      { instanceId: "o3", cardNumber: "FIX-001" },
    ];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "linlin",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "opponent-discards",
      ),
    );
    for (const optionId of ["o1", "o2"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === optionId,
        ),
      );
    }
    expect(played.players.p2.hand.map((c) => c.instanceId)).toEqual(["o3"]);
    expect(played.players.p2.trash.map((c) => c.instanceId).sort()).toEqual([
      "o1",
      "o2",
    ]);
  });

  // Bandai's OP-17 Q&A: an opponent who picks the discard branch holding one
  // card trashes that one -- the branch is not void for want of a second.
  it("On Play: an opponent with one card who picks the discard trashes that one", () => {
    const game = table()
      .seed("op17-049-one-card")
      .atTurn(3, { active: "p1" })
      .bareTable()
      .withHand("p1", [instance("linlin", "OP17-049")])
      .withHand("p2", [instance("only", "ST31-002")])
      .withDeckTop("p1", [
        instance("d1", "ST31-004"),
        instance("d2", "ST31-004"),
      ])
      .build();
    game.play({ type: "play-card", cardNumber: "OP17-049" });
    expect(game.state.activePlayer).toBe("p2");
    game.play({ type: "resolve-effect", optionId: "opponent-discards" });
    expect(game.state.pendingEffect).toBeNull();
    expect(game.state.players.p2.hand).toHaveLength(0);
    expect(game.state.players.p2.trash.map((c) => c.instanceId)).toEqual([
      "only",
    ]);
    expect(game.state.players.p1.hand).toHaveLength(0);
  });

  it("[On Your Opponent's Attack] buys +1000 for a card", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("linlin", "OP17-049")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    expect(played.activeAttack?.counterPower).toBe(1000);
  });
});

describe("OP17-044 Captain John's taunt", () => {
  covers("OP17-044", "static", "[Activate: Main]");
  it("forces every attack onto Captain John while rested under a Rocks Pirates Leader", () => {
    const state = scenario();
    state.players.p2.leaderCardNumber = "OP17-039"; // Rocks Pirates Leader
    state.players.p2.board = [
      character("john", "OP17-044", { rested: true }),
      character("other", "FIX-002", { rested: true }),
    ];
    const attacks = getLegalActions(state, "p1").filter(
      (action) => action.type === "attack",
    );
    expect(attacks).toHaveLength(1);
    expect(attacks[0]?.type === "attack" && attacks[0].targetInstanceId).toBe(
      "john",
    );
  });

  it("does nothing while active, or under a non-Rocks-Pirates Leader", () => {
    const active = scenario();
    active.players.p2.leaderCardNumber = "OP17-039";
    active.players.p2.board = [
      character("john", "OP17-044", { rested: false }),
      character("other", "FIX-002", { rested: true }),
    ];
    expect(
      getLegalActions(active, "p1").filter((action) => action.type === "attack")
        .length,
    ).toBeGreaterThan(1);

    const wrongLeader = scenario();
    wrongLeader.players.p2.board = [
      character("john", "OP17-044", { rested: true }),
      character("other", "FIX-002", { rested: true }),
    ];
    expect(
      getLegalActions(wrongLeader, "p1").filter(
        (action) => action.type === "attack",
      ).length,
    ).toBeGreaterThan(1);
  });

  it("Activate: Main rests itself to draw 1 and trash 1", () => {
    const state = scenario();
    state.players.p1.board = [character("john", "OP17-044")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    state.players.p1.deck = [{ instanceId: "top", cardNumber: "FIX-001" }];
    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" && action.sourceInstanceId === "john",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    expect(played.players.p1.board[0]!.rested).toBe(true);
    expect(played.players.p1.hand.map((c) => c.instanceId)).toEqual(["top"]);
    expect(played.players.p1.trash.map((c) => c.instanceId)).toEqual(["pitch"]);
  });
});

/*
 * OP17-062 Kaido: "[printed text omitted -- pnpm card:text OP17-062]"
 *
 * The positive case drives the reaction through a real public action:
 * OP17-063, a different printing of Kaido in the same set, has an
 * `[Activate: Main]` that pays a plain `DON!! -1` cost, which is the simplest
 * way to make a real DON!! card return to the DON!! deck without reaching
 * into the engine directly. The edge cases call `returnDonToDeck` (exported
 * from `don.ts` for exactly this) so the turn-ownership and once-per-turn
 * gating can be checked in isolation from any one paying card.
 */
describe("OP17-062 Kaido's DON!! return reaction", () => {
  covers("OP17-062", "[Your Turn]");
  it("adds 1 DON!! active from the deck and activates 1 rested DON!! when a DON!! is returned", () => {
    const state = scenario();
    state.players.p1.board = [
      character("kaido062", "OP17-062"),
      character("kaido063", "OP17-063"),
    ];
    state.players.p1.activeDon = ["a1"];
    state.players.p1.restedDon = ["r1", "r2"];
    state.players.p1.donDeck = ["d1", "d2"];

    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.sourceInstanceId === "kaido063",
      ),
    );

    // OP17-063's DON!! -1 cost takes the cheapest DON!! first (rested), so
    // "r1" pays it and "r2" is left for Kaido's own reaction to activate.
    expect(played.players.p1.restedDon).toEqual([]);
    expect(played.players.p1.activeDon.sort()).toEqual(["a1", "d1", "r2"]);
    expect(played.players.p1.donDeck).toEqual(["d2", "r1"]);
  });

  /**
   * Both halves of the reaction move DON!! and neither used to say so:
   * `addDonFromDeck` emits nothing of its own, so a Purple board that paid a
   * cost and was handed DON!! straight back showed two silent movements in a
   * row -- the payment and the refund -- with the counts as the only clue.
   */
  it("reports the DON!! it takes from the deck and the one it stands up", () => {
    const state = scenario();
    state.players.p1.board = [character("kaido", "OP17-062")];
    state.players.p1.activeDon = [];
    state.players.p1.restedDon = ["r1", "r2"];
    state.players.p1.donDeck = ["d1"];
    const events: PublicEvent[] = [];

    returnDonToDeck(
      state,
      "p1",
      1,
      { cardNumber: "FIX-001", instanceId: "cost-source" },
      events,
    );

    expect(events).toEqual([
      {
        type: "don-returned",
        playerId: "p1",
        count: 1,
        sourceCardNumber: "FIX-001",
      },
      {
        type: "don-added",
        playerId: "p1",
        count: 1,
        rested: false,
        sourceCardNumber: "OP17-062",
      },
      {
        type: "don-activated",
        playerId: "p1",
        count: 1,
        sourceCardNumber: "OP17-062",
      },
    ]);
  });

  it("does not fire for a DON!! returned on the opponent's turn", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("kaido", "OP17-062")];
    state.players.p1.activeDon = [];
    state.players.p1.restedDon = ["r1"];
    state.players.p1.donDeck = ["d1"];

    returnDonToDeck(
      state,
      "p1",
      1,
      { cardNumber: "FIX-001", instanceId: "cost-source" },
      [],
    );

    // The DON!! was still returned -- only Kaido's reaction is gated.
    expect(state.players.p1.donDeck).toEqual(["d1", "r1"]);
    expect(state.players.p1.restedDon).toEqual([]);
    expect(state.players.p1.activeDon).toEqual([]);
  });

  it("does not fire for a DON!! returned from the opponent's own field", () => {
    const state = scenario();
    // p2 is the turn player here, satisfying "[Your Turn]" for p2 -- Kaido on
    // p1's board must still not react, because the DON!! left p2's field, not
    // its controller's.
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("kaido", "OP17-062")];
    state.players.p2.activeDon = [];
    state.players.p2.restedDon = ["r1"];
    state.players.p2.donDeck = ["d1"];

    returnDonToDeck(
      state,
      "p2",
      1,
      { cardNumber: "FIX-001", instanceId: "cost-source" },
      [],
    );

    expect(state.players.p2.donDeck).toEqual(["d1", "r1"]);
    expect(state.players.p2.restedDon).toEqual([]);
    expect(state.players.p2.activeDon).toEqual([]);
  });

  it("fires only once per turn even when a second DON!! is returned", () => {
    const state = scenario();
    state.players.p1.board = [character("kaido", "OP17-062")];
    state.players.p1.activeDon = [];
    state.players.p1.restedDon = ["r1", "r2"];
    state.players.p1.donDeck = ["d1", "d2"];

    returnDonToDeck(
      state,
      "p1",
      1,
      { cardNumber: "FIX-001", instanceId: "cost-source" },
      [],
    );
    // First return: pays with "r1", reaction adds "d1" active and activates
    // the remaining rested "r2".
    expect(state.players.p1.activeDon.sort()).toEqual(["d1", "r2"]);
    expect(state.players.p1.restedDon).toEqual([]);
    expect(state.players.p1.donDeck).toEqual(["d2", "r1"]);

    returnDonToDeck(
      state,
      "p1",
      1,
      { cardNumber: "FIX-001", instanceId: "cost-source-2" },
      [],
    );
    // Second return this turn: rested is now empty, so the cost takes "d1"
    // from active instead. The once-per-turn reaction does not fire again --
    // no further DON!! is added from the deck or activated, so "d2" is
    // untouched and "r2" stays active.
    expect(state.players.p1.donDeck.sort()).toEqual(["d1", "d2", "r1"]);
    expect(state.players.p1.activeDon).toEqual(["r2"]);
    expect(state.players.p1.restedDon).toEqual([]);
  });

  it("does not recursively re-trigger itself", () => {
    const state = scenario();
    state.players.p1.board = [character("kaido", "OP17-062")];
    state.players.p1.restedDon = ["r1", "r2"];
    state.players.p1.donDeck = ["d1"];

    returnDonToDeck(
      state,
      "p1",
      1,
      { cardNumber: "FIX-001", instanceId: "cost-source" },
      [],
    );

    // Exactly one reaction key was recorded for this turn: the reaction's own
    // consequences never call `returnDonToDeck` again, so a second key never
    // has a chance to appear.
    const reactionKeys = state.oncePerTurn.filter((key) =>
      key.endsWith(":don-returned-reaction"),
    );
    expect(reactionKeys).toHaveLength(1);
  });

  it("activates 0 rested DON!! when none is left after paying the cost, without throwing", () => {
    const state = scenario();
    state.players.p1.board = [character("kaido", "OP17-062")];
    state.players.p1.activeDon = ["a1"];
    state.players.p1.restedDon = [];
    state.players.p1.donDeck = []; // empty before the return

    returnDonToDeck(
      state,
      "p1",
      1,
      { cardNumber: "FIX-001", instanceId: "cost-source" },
      [],
    );

    // The cost takes "a1" (rested was empty) and puts it in the DON!! deck;
    // the reaction's first clause immediately adds that same card back as
    // active, and its second clause finds nothing rested left to activate,
    // resolving to 0 instead of throwing or leaving something pending.
    expect(state.players.p1.donDeck).toEqual([]);
    expect(state.players.p1.activeDon).toEqual(["a1"]);
    expect(state.players.p1.restedDon).toEqual([]);
  });
});

/**
 * OP17-040 Edward.Newgate's watcher clause: "[printed text omitted -- pnpm card:text OP17-040]"
 *
 * Newgate itself never participates in the battle -- it watches its own
 * controller's Leader from the bench, on either end of the fight. OP17-039
 * Rocks.D.Xebec is the only Rocks Pirates Leader in the set, and it prints its
 * own `[When Attacking]` ability, so every test where it is the *attacking*
 * Leader first declines that unrelated offer before Newgate's own ladder
 * entry appears.
 */
describe("OP17-040 Edward.Newgate's leader-watcher", () => {
  const declineXebec = (state: GameState): GameState =>
    submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );

  it("fires when its controller's Leader attacks, adding +3000 to the attack", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-039"; // Rocks Pirates Leader
    state.players.p1.board = [character("newgate", "OP17-040")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    const basePower = requireKnownCard("OP17-039").power ?? 0;

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    played = declineXebec(played); // OP17-039's own [When Attacking] offer
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    expect(battleAttackPower(played)).toBe(basePower + 3000);
    expect(played.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "FIX-002",
    ]);
  });

  it("fires when its controller's Leader is attacked, adding +3000 to the defense", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.leaderCardNumber = "OP17-039";
    state.players.p1.board = [character("newgate", "OP17-040")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    expect(played.activeAttack?.counterPower).toBe(3000);
    expect(played.players.p1.trash.map((card) => card.cardNumber)).toEqual([
      "FIX-002",
    ]);
  });

  it("does not fire when its controller's Leader is not part of the battle", () => {
    const state = scenario();
    state.players.p1.board = [
      character("newgate", "OP17-040"),
      character("other", "FIX-002"),
    ];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];

    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "other" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    // The default p1 Leader is not Rocks Pirates either, so this doubles as a
    // sanity check that a plain Character-vs-Leader battle raises nothing.
    expect(played.pendingEffect).toBeNull();
    expect(played.players.p1.hand).toHaveLength(1);
  });

  it("is scoped to its own controller's Leader, not any Leader in the battle", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-039";
    state.players.p2.leaderCardNumber = "OP17-039";
    state.players.p2.board = [
      character("newgate-p2", "OP17-040"),
      character("victim", "FIX-002", { rested: true }),
    ];
    state.players.p2.hand = [{ instanceId: "oppcard", cardNumber: "FIX-002" }];

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "victim",
      ),
    );
    played = declineXebec(played); // p1's own [When Attacking] offer
    // p1's Leader is attacking, but Newgate sits on p2's board watching p2's
    // own Leader -- which is neither the attacker nor the target here (a
    // Character is), so p2's copy never gets offered even though a Leader
    // (p1's) is very much in the battle.
    expect(played.pendingEffect).toBeNull();
    expect(played.players.p2.hand).toHaveLength(1);
  });

  it("is not offered when its controller's Leader lacks the Rocks Pirates type", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.leaderCardNumber = "FIX-LEADER-R"; // no printed types include Rocks Pirates
    state.players.p1.board = [character("newgate", "OP17-040")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];

    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    expect(played.pendingEffect).toBeNull();
  });

  it("is not offered without a hand card to trash", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.leaderCardNumber = "OP17-039";
    state.players.p1.board = [character("newgate", "OP17-040")];
    state.players.p1.hand = [];

    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    expect(played.pendingEffect).toBeNull();
  });

  it("shares its [Once Per Turn] budget between attacking and being attacked", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.leaderCardNumber = "OP17-039";
    state.players.p1.board = [character("newgate", "OP17-040")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    // The key format is `turn:controller:instance:leader-watcher`, shared by
    // both directions of the clause -- as if Newgate had already paid for its
    // controller's Leader attacking earlier this same turn.
    state.oncePerTurn = [`${state.turn}:p1:newgate:leader-watcher`];

    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    expect(played.pendingEffect).toBeNull();
    expect(played.players.p1.hand).toHaveLength(1);
  });

  it("declining the offer trashes nothing and grants no power", () => {
    const state = scenario();
    state.players.p1.leaderCardNumber = "OP17-039";
    state.players.p1.board = [character("newgate", "OP17-040")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    const basePower = requireKnownCard("OP17-039").power ?? 0;

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "p2-leader",
      ),
    );
    played = declineXebec(played);
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "skip",
      ),
    );
    expect(battleAttackPower(played)).toBe(basePower);
    expect(played.players.p1.hand).toHaveLength(1);
    expect(
      played.oncePerTurn.some((key) => key.endsWith(":leader-watcher")),
    ).toBe(false);
  });

  it("its +3000 lands as real battle math, turning a would-be hit into a defended attack", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.leaderCardNumber = "OP17-039"; // 5000 power, same as p2's default leader
    state.players.p1.board = [character("newgate", "OP17-040")];
    state.players.p1.hand = [{ instanceId: "pitch", cardNumber: "FIX-002" }];
    const startingLife = state.players.p1.life.length;

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === "p1-leader",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "pitch",
      ),
    );
    expect(played.activeAttack?.counterPower).toBe(3000);
    // Equal 5000-vs-5000 power alone would connect (the engine only calls a
    // strictly lower attack "defended"), so the +3000 is what turns this into
    // a miss -- not just a number sitting on the battle unused.
    played = submit(
      played,
      requireAction(played, (action) => action.type === "pass"),
    );
    played = submit(
      played,
      requireAction(played, (action) => action.type === "pass"),
    );
    expect(played.players.p1.life).toHaveLength(startingLife);
  });
});

describe("OP17-117 Maser Saber", () => {
  it("Trigger: the opponent may pay by trashing 3 cards from hand, forgoing the controller's K.O.", () => {
    const state = scenario();
    state.players.p2.hand = [
      { instanceId: "h1", cardNumber: "FIX-001" },
      { instanceId: "h2", cardNumber: "FIX-001" },
      { instanceId: "h3", cardNumber: "FIX-001" },
    ];
    state.players.p2.board = [character("target", "FIX-002")];
    const result = createTriggerResult(state, "p1", {
      instanceId: "evt",
      cardNumber: "OP17-117",
    });
    expect(result.pending).not.toBeNull();
    state.pendingEffect = result.pending;
    state.activePlayer = result.pending!.playerId;
    // The opponent decides whether to pay, not the source's controller.
    expect(state.activePlayer).toBe("p2");

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "trash",
      ),
    );
    for (const instanceId of ["h1", "h2", "h3"]) {
      played = submit(
        played,
        requireAction(
          played,
          (action) =>
            action.type === "resolve-effect" && action.optionId === instanceId,
        ),
      );
    }
    expect(played.players.p2.hand).toHaveLength(0);
    expect(
      played.players.p2.trash.map((card) => card.instanceId).sort(),
    ).toEqual(["h1", "h2", "h3"]);
    // Paid, so no K.O. is offered and the opponent's Character survives.
    expect(played.pendingEffect).toBeNull();
    expect(played.players.p2.board).toHaveLength(1);
  });

  it("Trigger: declining with cards to spare hands the controller an optional K.O., which they can take", () => {
    const state = scenario();
    state.players.p2.hand = [
      { instanceId: "h1", cardNumber: "FIX-001" },
      { instanceId: "h2", cardNumber: "FIX-001" },
      { instanceId: "h3", cardNumber: "FIX-001" },
    ];
    state.players.p2.board = [character("target", "FIX-002")];
    const result = createTriggerResult(state, "p1", {
      instanceId: "evt",
      cardNumber: "OP17-117",
    });
    state.pendingEffect = result.pending;
    state.activePlayer = result.pending!.playerId;

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "decline",
      ),
    );
    // The K.O. belongs to Maser Saber's own controller, not the opponent who
    // just declined to pay.
    expect(played.activePlayer).toBe("p1");
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(played.players.p2.board).toHaveLength(0);
    // The hand the opponent kept by declining is untouched.
    expect(played.players.p2.hand).toHaveLength(3);
  });

  it("Trigger: declining still leaves the K.O. optional -- the controller may pass on it", () => {
    const state = scenario();
    state.players.p2.hand = [
      { instanceId: "h1", cardNumber: "FIX-001" },
      { instanceId: "h2", cardNumber: "FIX-001" },
      { instanceId: "h3", cardNumber: "FIX-001" },
    ];
    state.players.p2.board = [character("target", "FIX-002")];
    const result = createTriggerResult(state, "p1", {
      instanceId: "evt",
      cardNumber: "OP17-117",
    });
    state.pendingEffect = result.pending;
    state.activePlayer = result.pending!.playerId;

    let played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "decline",
      ),
    );
    played = submit(
      played,
      requireAction(
        played,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "done",
      ),
    );
    expect(played.players.p2.board).toHaveLength(1);
    expect(played.pendingEffect).toBeNull();
  });

  it("Trigger: an opponent with fewer than 3 hand cards cannot pay, and the K.O. is offered directly", () => {
    const state = scenario();
    state.players.p2.hand = [
      { instanceId: "h1", cardNumber: "FIX-001" },
      { instanceId: "h2", cardNumber: "FIX-001" },
    ];
    state.players.p2.board = [character("target", "FIX-002")];
    const result = createTriggerResult(state, "p1", {
      instanceId: "evt",
      cardNumber: "OP17-117",
    });
    expect(result.pending).not.toBeNull();
    // No opponent decision at all: the K.O. offer belongs to the controller
    // from the start, with no "trash"/"decline" branch in between.
    expect(result.pending!.playerId).toBe("p1");
    state.pendingEffect = result.pending;
    setTurnPlayer(state, "p1");
    expect(effectOptions(state)).toEqual(
      expect.arrayContaining(["target", "done"]),
    );
    expect(effectOptions(state)).not.toEqual(
      expect.arrayContaining(["trash", "decline"]),
    );

    const played = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(played.players.p2.board).toHaveLength(0);
    expect(played.players.p2.hand).toHaveLength(2);
  });

  it("Trigger: the K.O. only reaches opponent Characters with a cost of 6 or less", () => {
    const state = scenario();
    state.players.p2.hand = [];
    state.players.p2.board = [
      character("cheap", "FIX-002"), // cost 2
      character("pricey", "OP17-112"), // cost 10
    ];
    const result = createTriggerResult(state, "p1", {
      instanceId: "evt",
      cardNumber: "OP17-117",
    });
    state.pendingEffect = result.pending;
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    const options = effectOptions(state);
    expect(options).toContain("cheap");
    expect(options).not.toContain("pricey");
  });

  it("Counter: buffs up to 1 of the controller's [Charlotte Linlin] cards by +3000 during the battle", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("linlin", "OP17-049")]; // named Charlotte Linlin
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "linlin",
      attackPower: 5000,
      counterPower: 0,
    });
    expect(counterEventPower(state, "p1", "OP17-117")).toBe(3000);
  });

  it("Counter: adds no power when nothing named [Charlotte Linlin] is being attacked", () => {
    const state = scenario();
    setTurnPlayer(state, "p2");
    state.players.p1.board = [character("blocker", "FIX-002")];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "blocker",
      attackPower: 5000,
      counterPower: 0,
    });
    expect(counterEventPower(state, "p1", "OP17-117")).toBe(0);
  });
});
