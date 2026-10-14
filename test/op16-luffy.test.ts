import { describe, expect, it } from "vitest";
import {
  loadDeck,
  requireSupportedDeck,
  resolveDeck,
} from "@one-piece-sim/decks";
import {
  applyAction,
  battleAttackPower,
  createGame,
  currentPower,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { LegalAction, PublicEvent } from "@one-piece-sim/protocol";
import { covers, fabricatedAttack, setTurnPlayer } from "./support/index.js";

function leaderScenario(): GameState {
  const state = createGame({
    gameId: "op16-luffy-leader",
    p1: resolveDeck("(Green/Blue) Monkey.D.Luffy - Official Feature Deck"),
    p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    seed: "op16-luffy-leader",
  });
  state.phase = "main";
  state.turn = 5;
  setTurnPlayer(state, "p1");
  state.players.p1.activeDon = [];
  state.players.p1.restedDon = ["don-1", "don-2", "don-3"];
  state.players.p1.board = [];
  return state;
}

const character = (instanceId: string, cardNumber: string, rested = false) => ({
  instanceId,
  cardNumber,
  rested,
  playedTurn: 1,
  attachedDon: [],
  powerModifiers: [],
});

function submitMatching(
  state: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
): GameState {
  return submitMatchingResult(state, predicate).state;
}

function submitMatchingResult(
  state: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
): { state: GameState; events: PublicEvent[] } {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  expect(action).toBeDefined();
  return applyAction(state, { ...action!, revision: state.revision });
}

describe("OP16 Green/Blue Luffy rules", () => {
  it("loads the published 50-card list with eight Prisoners", () => {
    const manifest = requireSupportedDeck(
      "(Green/Blue) Monkey.D.Luffy - Official Feature Deck",
    );
    const deck = loadDeck(manifest.id);

    expect(deck).toHaveLength(50);
    expect(deck.filter((card) => card === "OP16-042")).toHaveLength(8);
  });

  covers("OP16-022", "[Activate: Main]");
  it("sets at most two DON!! active once per turn", () => {
    let state = leaderScenario();
    const action = getLegalActions(state, "p1").find(
      (candidate) =>
        candidate.type === "activate-main" &&
        candidate.optionId === "mechanic-main:p1-leader",
    );
    expect(action).toBeDefined();

    state = applyAction(state, {
      ...action!,
      revision: state.revision,
    }).state;

    expect(state.players.p1.activeDon).toHaveLength(2);
    expect(state.players.p1.restedDon).toHaveLength(1);
    expect(
      getLegalActions(state, "p1").some(
        (candidate) =>
          candidate.type === "activate-main" &&
          candidate.optionId === "mechanic-main:p1-leader",
      ),
    ).toBe(false);
  });

  it("does not refresh DON!! while a non-Impel Down Character is present", () => {
    const state = leaderScenario();
    state.players.p1.board = [
      {
        instanceId: "brook",
        cardNumber: "OP15-032",
        rested: false,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];

    expect(
      getLegalActions(state, "p1").some(
        (candidate) =>
          candidate.type === "activate-main" &&
          candidate.optionId === "mechanic-main:p1-leader",
      ),
    ).toBe(false);
  });

  covers("OP16-026", "[On Play]");
  it("chains Ivankov's search into a free cost-2 Character play", () => {
    let state = leaderScenario();
    state.players.p1.activeDon = Array.from(
      { length: 4 },
      (_, index) => `active-${index}`,
    );
    state.players.p1.restedDon = [];
    state.players.p1.hand = [
      { instanceId: "ivankov", cardNumber: "OP16-026" },
      { instanceId: "jinbe", cardNumber: "OP16-027" },
    ];
    state.players.p1.deck = [
      { instanceId: "prisoner", cardNumber: "OP16-042" },
      { instanceId: "fixture-1", cardNumber: "FIX-001" },
      { instanceId: "fixture-2", cardNumber: "FIX-002" },
    ];

    const playIvankov = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "ivankov",
    );
    state = applyAction(state, {
      ...playIvankov!,
      revision: state.revision,
    }).state;
    const takePrisoner = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "search-select:prisoner",
    );
    state = applyAction(state, {
      ...takePrisoner!,
      revision: state.revision,
    }).state;

    expect(state.pendingEffect?.kind).toBe("free-play");
    const playJinbe = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "resolve-effect" && action.optionId === "jinbe",
    );
    state = applyAction(state, {
      ...playJinbe!,
      revision: state.revision,
    }).state;

    expect(state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP16-026",
      "OP16-027",
    ]);
  });

  covers("OP16-038", "[Counter]");
  it("pays one DON!! for a +3000 Counter Event", () => {
    let state = leaderScenario();
    state.phase = "counter";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.hand = [{ instanceId: "event", cardNumber: "OP16-038" }];
    state.players.p1.activeDon = ["active-don"];
    state.players.p1.restedDon = [];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 8000,
      counterPower: 0,
    });
    const counter = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "activate-counter-event" &&
        action.eventInstanceId === "event",
    );

    state = applyAction(state, {
      ...counter!,
      revision: state.revision,
    }).state;

    expect(state.activeAttack?.counterPower).toBe(3000);
    expect(state.players.p1.activeDon).toHaveLength(0);
    expect(state.players.p1.restedDon).toEqual(["active-don"]);
    expect(state.players.p1.trash[0]?.cardNumber).toBe("OP16-038");
  });

  covers("OP16-045", "[On Play]");
  it("returns a cost-2 Character before Crocodile free-plays another", () => {
    let state = leaderScenario();
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4"];
    state.players.p1.restedDon = [];
    state.players.p1.board = [character("jinbe", "OP16-027")];
    state.players.p1.hand = [
      { instanceId: "crocodile", cardNumber: "OP16-045" },
      { instanceId: "luffy", cardNumber: "OP16-034" },
    ];

    state = submitMatching(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "crocodile",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "jinbe",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "luffy",
    );

    expect(state.players.p1.hand.map((card) => card.cardNumber)).toContain(
      "OP16-027",
    );
    expect(state.players.p1.board.map((card) => card.cardNumber)).toEqual([
      "OP16-045",
      "OP16-034",
    ]);
  });

  covers("OP16-048", "[On Play]");
  covers("OP16-042", "static");
  it("lets Buggy grant one Prisoner Blocker before Blocker selection", () => {
    let state = leaderScenario();
    state.players.p1.board = [
      character("buggy", "OP16-048"),
      character("prisoner", "OP16-042"),
    ];
    state.players.p2.leaderRested = false;
    setTurnPlayer(state, "p2");

    state = submitMatching(
      state,
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "p2-leader",
    );
    expect(state.pendingEffect?.kind).toBe("grant-prisoner-blocker");
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "prisoner",
    );

    expect(
      getLegalActions(state, "p1").some(
        (action) =>
          action.type === "block" && action.blockerInstanceId === "prisoner",
      ),
    ).toBe(true);
  });

  covers("OP16-056", "[Activate: Main]");
  it("trashes OP16 Mr.3 to draw two and prevent a cost-9 attack", () => {
    let state = leaderScenario();
    state.players.p1.hand = [];
    state.players.p1.board = [character("mr3", "OP16-056")];
    state.players.p1.deck = [
      { instanceId: "draw-1", cardNumber: "OP16-042" },
      { instanceId: "draw-2", cardNumber: "OP16-042" },
    ];
    state.players.p2.board = [character("luffy", "ST31-004")];

    state = submitMatching(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:mr3",
    );
    const action = getLegalActions(state, "p1").find(
      (candidate) =>
        candidate.type === "resolve-effect" && candidate.optionId === "luffy",
    );
    expect(action).toBeDefined();
    const result = applyAction(state, { ...action!, revision: state.revision });
    state = result.state;

    expect(state.players.p1.hand).toHaveLength(2);
    expect(state.players.p1.trash[0]?.cardNumber).toBe("OP16-056");
    expect(state.players.p2.board[0]?.cannotAttackUntilTurn).toBe(6);
    // `playerId` is the Character's controller, which is the reading every
    // other prevention event already had: the imperative `prevent-attack`
    // reported the *activating* player and its `prevent-refresh` sibling
    // reported the owner, and the declarative `restrict` node reports the owner
    // for all of them.
    expect(result.events).toContainEqual({
      type: "attack-prevented",
      playerId: "p2",
      targetInstanceId: "luffy",
      targetCardNumber: "ST31-004",
      expiresAtTurn: 6,
      sourceCardNumber: "OP16-056",
    });
    expect(observe(state, "p2").self.board[0]?.cannotAttackUntilTurn).toBe(6);
  });

  covers("OP15-032", "[On Play]", "[Activate: Main]");
  it("uses Brook to restand a cost-8-or-less Character", () => {
    let state = leaderScenario();
    state.players.p1.board = [
      character("brook", "OP15-032"),
      character("crocodile", "OP16-045", true),
    ];

    state = submitMatching(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:brook",
    );
    // Brook trashes itself first, so the restand is a choice made from a board
    // it is no longer on -- one candidate, which is still asked because "up to
    // 1" leaves declining on the table.
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "crocodile",
    );

    expect(state.players.p1.board[0]?.cardNumber).toBe("OP16-045");
    expect(state.players.p1.board[0]?.rested).toBe(false);
    expect(state.players.p1.trash[0]?.cardNumber).toBe("OP15-032");
  });

  covers("OP16-032", "[On Play]", "[Unblockable]");
  it("makes Boa unblockable and prevents a non-Luffy Character from resting", () => {
    let state = leaderScenario();
    state.players.p1.activeDon = Array.from(
      { length: 7 },
      (_, index) => `d${index}`,
    );
    state.players.p1.restedDon = [];
    state.players.p1.hand = [{ instanceId: "boa", cardNumber: "OP16-032" }];
    state.players.p2.board = [
      character("jinbe", "ST31-002"),
      character("luffy", "ST31-004"),
    ];

    state = submitMatching(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "boa",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "jinbe",
    );
    expect(state.players.p2.board[0]?.cannotRestUntilTurn).toBe(6);
    state.players.p1.board[0]!.playedTurn = 1;
    state = submitMatching(
      state,
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "boa",
    );

    expect(getLegalActions(state, "p2")).toHaveLength(1);
    expect(getLegalActions(state, "p2")[0]?.type).toBe("pass");
  });

  covers("ST30-014", "[Activate: Main]");
  covers("OP16-045", "[Blocker]");
  it("gives up to two rested DON!! to each of two 6000-power Characters", () => {
    let state = leaderScenario();
    state.players.p1.board = [
      character("mr3", "ST30-014"),
      character("crocodile", "OP16-045"),
      character("buggy", "OP16-048"),
    ];
    state.players.p1.restedDon = ["d1", "d2", "d3", "d4"];

    state = submitMatching(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-main:mr3",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "crocodile",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "buggy",
    );

    expect(state.players.p1.board[1]?.attachedDon).toHaveLength(2);
    expect(state.players.p1.board[2]?.attachedDon).toHaveLength(2);
  });

  covers("OP16-038", "[Main]");
  it("mass-restands five differently named Impel Down Characters", () => {
    let state = leaderScenario();
    state.players.p1.hand = [
      { instanceId: "headquarters", cardNumber: "OP16-038" },
    ];
    state.players.p1.activeDon = Array.from(
      { length: 7 },
      (_, index) => `d${index}`,
    );
    state.players.p1.restedDon = [];
    state.players.p1.leaderRested = true;
    state.players.p1.board = [
      character("luffy", "OP16-034", true),
      character("mr1", "OP16-054", true),
      character("mr2", "OP16-055", true),
      character("jinbe", "OP16-027", true),
      character("crocodile", "OP16-045", true),
    ];

    state = submitMatching(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-event:headquarters",
    );

    expect(state.players.p1.leaderRested).toBe(false);
    expect(state.players.p1.board.every((card) => !card.rested)).toBe(true);
    expect(state.players.p1.restedDon).toHaveLength(7);
  });

  it("rests an opponent Character and DON!! with Asura", () => {
    let state = leaderScenario();
    state.players.p1.hand = [{ instanceId: "asura", cardNumber: "OP12-037" }];
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4"];
    state.players.p1.restedDon = [];
    state.players.p2.activeDon = ["opponent-don"];
    state.players.p2.board = [character("jinbe", "ST31-002")];

    state = submitMatching(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-event:asura",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "jinbe",
    );
    state = submitMatching(
      state,
      (action) => action.type === "resolve-effect" && action.optionId === "don",
    );

    expect(state.players.p2.board[0]?.rested).toBe(true);
    expect(state.players.p2.restedDon).toEqual(["opponent-don"]);
  });

  covers("OP13-040", "[Main]");
  it("keeps a rested cost-7 Character rested through its next Refresh Phase", () => {
    let state = leaderScenario();
    state.players.p1.hand = [{ instanceId: "all-out", cardNumber: "OP13-040" }];
    state.players.p1.activeDon = ["d1", "d2", "d3"];
    state.players.p1.restedDon = [];
    state.players.p2.board = [character("luffy", "ST31-004", true)];

    state = submitMatching(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-event:all-out",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "luffy",
    );
    state = submitMatching(state, (action) => action.type === "pass");

    expect(state.turn).toBe(6);
    expect(state.players.p2.board[0]?.rested).toBe(true);
  });

  covers("OP11-061", "[Main]");
  it("bottom-decks one cost-4 Character with Culverin", () => {
    let state = leaderScenario();
    state.players.p1.hand = [
      { instanceId: "culverin", cardNumber: "OP11-061" },
    ];
    state.players.p1.activeDon = ["d1", "d2", "d3"];
    state.players.p1.restedDon = [];
    state.players.p2.board = [character("franky", "OP11-012")];

    state = submitMatching(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-event:culverin",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "franky",
    );

    expect(state.players.p2.board).toHaveLength(0);
    expect(state.players.p2.deck.at(-1)?.cardNumber).toBe("OP11-012");
  });

  covers("OP06-058", "[Main]");
  it("bottom-decks two cost-6 Characters with Gravity Blade", () => {
    let state = leaderScenario();
    state.players.p1.hand = [{ instanceId: "gravity", cardNumber: "OP06-058" }];
    state.players.p1.activeDon = Array.from(
      { length: 7 },
      (_, index) => `d${index}`,
    );
    state.players.p1.restedDon = [];
    state.players.p2.board = [
      character("jinbe", "ST31-002"),
      character("usopp", "OP11-003"),
    ];

    const activated = submitMatchingResult(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-event:gravity",
    );
    state = activated.state;
    expect(activated.events).toContainEqual({
      type: "event-activated",
      playerId: "p1",
      cardNumber: "OP06-058",
    });

    const first = submitMatchingResult(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "jinbe",
    );
    state = first.state;
    // "Place up to 2" is one `choose` of two cards, so the picks are two
    // decisions and the removal is one step: nothing has left the board until
    // the choice closes. Each card still gets its own `card-moved`, which is
    // what the opponent-notice modal renders a line from.
    expect(first.events).toEqual([]);

    const second = submitMatchingResult(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "usopp",
    );
    state = second.state;
    expect(second.events).toEqual([
      {
        type: "card-moved",
        playerId: "p2",
        cardInstanceId: "jinbe",
        cardNumber: "ST31-002",
        from: "board",
        to: "deck",
        position: "bottom",
        sourceCardNumber: "OP06-058",
      },
      {
        type: "card-moved",
        playerId: "p2",
        cardInstanceId: "usopp",
        cardNumber: "OP11-003",
        from: "board",
        to: "deck",
        position: "bottom",
        sourceCardNumber: "OP06-058",
      },
    ]);

    expect(state.players.p2.board).toHaveLength(0);
    expect(
      state.players.p2.deck.slice(-2).map((card) => card.cardNumber),
    ).toEqual(["ST31-002", "OP11-003"]);
  });

  it("can bottom-deck the owner's Character with Gravity Blade", () => {
    let state = leaderScenario();
    state.players.p1.hand = [{ instanceId: "gravity", cardNumber: "OP06-058" }];
    state.players.p1.activeDon = Array.from(
      { length: 7 },
      (_, index) => `d${index}`,
    );
    state.players.p1.restedDon = [];
    state.players.p1.board = [character("own-jinbe", "OP16-027")];

    state = submitMatching(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.optionId === "mechanic-event:gravity",
    );
    state = submitMatching(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "own-jinbe",
    );

    expect(state.players.p1.board).toHaveLength(0);
    expect(state.players.p1.deck.at(-1)?.cardNumber).toBe("OP16-027");
  });

  it.each([
    ["OP02-068", "hand"],
    ["OP11-061", "deck"],
    ["OP06-058", "deck"],
  ] as const)(
    "resolves %s's removal Trigger to the owner's %s",
    (cardNumber, zone) => {
      let state = leaderScenario();
      state.phase = "trigger";
      // p1 acts -- it is defending -- inside p2's turn, which the
      // fabricated attack below is the rest of. The two are separate facts.
      state.activePlayer = "p1";
      state.turnPlayerId = "p2";
      state.players.p2.board = [character("target", "FIX-001")];
      state.activeAttack = fabricatedAttack(state, {
        attackerPlayerId: "p2",
        defenderPlayerId: "p1",
        attackerInstanceId: "p2-leader",
        targetInstanceId: "p1-leader",
        attackPower: 5000,
        counterPower: 0,
      });
      state.pendingTrigger = {
        playerId: "p1",
        card: { instanceId: "trigger", cardNumber },
      };

      state = submitMatching(
        state,
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "target",
      );

      expect(state.players.p2.board).toHaveLength(0);
      expect(state.players.p2[zone].at(-1)?.cardNumber).toBe("FIX-001");
      expect(state.players.p1.trash.at(-1)?.cardNumber).toBe(cardNumber);
    },
  );

  covers("OP16-055", "[When Attacking]");
  it("gives Bon Kurei the opponent Leader's power when it attacks, in both the preview and the resolved battle", () => {
    let state = leaderScenario();
    state.players.p1.board = [
      { ...character("mr2", "OP16-055"), attachedDon: ["d1"] },
    ];

    // Opponent Leader (ST21-001) is printed at 5000, so with the swap plus
    // Bon Kurei's own attached DON!! this attack should read 6000, not the
    // printed-power-only 2000 (1000 base + 1000 DON).
    const preview = getLegalActions(state, "p1").find(
      (action): action is Extract<LegalAction, { type: "attack" }> =>
        action.type === "attack" &&
        action.attackerInstanceId === "mr2" &&
        action.targetInstanceId === "p2-leader",
    );
    expect(preview?.attackPower).toBe(6000);

    state = submitMatching(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "mr2" &&
        action.targetInstanceId === "p2-leader",
    );

    expect(battleAttackPower(state)).toBe(6000);
  });
});

describe("OP16-054 Mr.1(Daz.Bonez) [Your Turn] power", () => {
  covers("OP16-054", "[Your Turn]");

  /**
   * "[printed text omitted -- pnpm card:text OP16-054]" The layer used to read only the DON!! and
   * hand-size halves, so a Mr.1 sitting on the defending board answered a
   * 7000-power attack as if it were 5000 -- the +3000 belongs to its
   * controller's turn, not to whoever is attacking.
   */
  const mr1Scenario = (): GameState => {
    const state = leaderScenario();
    state.players.p2.board = [
      { ...character("mr1", "OP16-054"), attachedDon: ["p2-don"] },
    ];
    state.players.p2.hand = Array.from({ length: 5 }, (_, index) => ({
      instanceId: `p2-hand-${index}`,
      cardNumber: "OP16-042",
    }));
    return state;
  };

  // DON!! stays attached through the opponent's turn -- it only goes home in the
  // controller's own Refresh Phase -- so [DON!! x1] is still satisfied while
  // Mr.1 defends. [Your Turn] is the only thing switching the +3000 off.
  it("stays at printed power while the opponent is the turn player", () => {
    const state = mr1Scenario();
    expect(state.activePlayer).toBe("p1");

    expect(currentPower(state, "p2", "mr1", false)).toBe(2000);
  });

  it("grants +3000 on its controller's own turn", () => {
    const state = mr1Scenario();
    setTurnPlayer(state, "p2");

    expect(currentPower(state, "p2", "mr1", false)).toBe(5000);
  });

  it("stays at printed power while defending an attack it did not declare", () => {
    const state = mr1Scenario();
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "mr1",
      attackPower: 5000,
      counterPower: 0,
    });

    expect(currentPower(state, "p2", "mr1", false)).toBe(2000);
  });
});
