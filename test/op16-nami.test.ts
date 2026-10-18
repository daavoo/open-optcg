import { describe, expect, it } from "vitest";
import {
  loadDeck,
  requireSupportedDeck,
  resolveDeck,
} from "@one-piece-sim/decks";
import {
  applyAction,
  createOnKoResult,
  createGame,
  getLegalActions,
  observe,
  type BoardCard,
  type GameState,
} from "@one-piece-sim/engine-core";
import { covers, fabricatedAttack, setTurnPlayer } from "./support/index.js";

const character = (instanceId: string, cardNumber: string): BoardCard => ({
  instanceId,
  cardNumber,
  rested: false,
  playedTurn: 1,
  attachedDon: [],
  powerModifiers: [],
});

function submit(
  state: GameState,
  predicate: (action: ReturnType<typeof getLegalActions>[number]) => boolean,
): GameState {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  expect(action).toBeDefined();
  return applyAction(state, { ...action!, revision: state.revision }).state;
}

function scenario(): GameState {
  const state = createGame({
    gameId: "op16-nami",
    p1: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
    p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    seed: "op16-nami",
  });
  state.phase = "main";
  state.turn = 5;
  setTurnPlayer(state, "p1");
  state.players.p1.life.push(...state.players.p1.deck.splice(0, 5));
  state.players.p1.hand = [];
  state.players.p1.board = [];
  state.players.p1.activeDon = [];
  state.players.p1.restedDon = [];
  return state;
}

describe("OP16 Blue/Yellow Nami profile", () => {
  it("loads LA/Smile's exact 50-card list", () => {
    const manifest = requireSupportedDeck(
      "(Blue/Yellow) Nami - Official Feature Deck",
    );
    const deck = loadDeck(manifest.id);

    expect(manifest.leader).toBe("OP11-041");
    expect(deck).toHaveLength(50);
    expect(deck.filter((card) => card === "OP14-102")).toHaveLength(4);
  });

  covers("OP14-102", "[Trigger]");
  it("plays a Thriller Bark Character from trash rested with Kumacy's Trigger", () => {
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "kumacy", cardNumber: "OP14-102" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state.players.p1.trash = [{ instanceId: "perona", cardNumber: "OP14-111" }];

    state = submit(
      state,
      (action) =>
        action.type === "resolve-trigger" && action.optionId === "activate",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "perona",
    );

    expect(state.players.p1.board).toContainEqual(
      expect.objectContaining({
        instanceId: "perona",
        cardNumber: "OP14-111",
        rested: true,
      }),
    );
    expect(state.players.p1.trash).toContainEqual({
      instanceId: "kumacy",
      cardNumber: "OP14-102",
    });
  });

  covers("OP14-111", "[Trigger]");
  it("plays a Thriller Bark Character from trash rested with Perona's Trigger", () => {
    // Perona prints Kumacy's Trigger. Its [On Play]/[On K.O.] were implemented,
    // which was enough for the coverage check to call the card covered while the
    // Trigger silently put it in hand instead.
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "perona", cardNumber: "OP14-111" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state.players.p1.trash = [
      { instanceId: "hogback", cardNumber: "OP14-110" },
    ];

    state = submit(
      state,
      (action) =>
        action.type === "resolve-trigger" && action.optionId === "activate",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "hogback",
    );

    expect(state.players.p1.board).toContainEqual(
      expect.objectContaining({
        instanceId: "hogback",
        cardNumber: "OP14-110",
        rested: true,
      }),
    );
  });

  it("lets Perona activate its up-to Trigger with no eligible trash target", () => {
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "perona", cardNumber: "OP14-111" },
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
      (action) =>
        action.type === "resolve-trigger" && action.optionId === "activate",
    );

    expect(state.players.p1.trash).toContainEqual({
      instanceId: "perona",
      cardNumber: "OP14-111",
    });
    expect(state.players.p1.hand).not.toContainEqual(
      expect.objectContaining({ cardNumber: "OP14-111" }),
    );
  });

  covers("OP06-104", "[Trigger]");
  it("plays Kikunojo off its own Trigger at three or less opposing Life", () => {
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "kikunojo", cardNumber: "OP06-104" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state.players.p2.life = state.players.p2.life.slice(0, 3);

    state = submit(
      state,
      (action) =>
        action.type === "resolve-trigger" && action.optionId === "activate",
    );

    expect(state.players.p1.board).toContainEqual(
      expect.objectContaining({
        instanceId: "kikunojo",
        cardNumber: "OP06-104",
      }),
    );
  });

  it("does not offer Kikunojo's Trigger above three opposing Life", () => {
    const state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "kikunojo", cardNumber: "OP06-104" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state.players.p2.life.push(...state.players.p2.deck.splice(0, 5));

    expect(
      getLegalActions(state, "p1").filter(
        (action) =>
          action.type === "resolve-trigger" && action.optionId === "activate",
      ),
    ).toEqual([]);
  });

  covers("OP14-104", "[On Play]");
  it("lets Gecko Moria play a Thriller Bark Character out of trash", () => {
    let state = scenario();
    state.players.p1.activeDon = Array.from({ length: 8 }, (_, i) => `d${i}`);
    state.players.p1.hand = [{ instanceId: "moria", cardNumber: "OP14-104" }];
    state.players.p1.trash = [{ instanceId: "perona", cardNumber: "OP14-111" }];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "moria",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "play",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "perona",
    );

    expect(state.players.p1.board).toContainEqual(
      expect.objectContaining({
        instanceId: "perona",
        cardNumber: "OP14-111",
        rested: false,
      }),
    );
    expect(state.players.p1.trash).toEqual([]);
  });

  it("lets Gecko Moria bank the same Character face-up on top of Life instead", () => {
    let state = scenario();
    state.players.p1.activeDon = Array.from({ length: 8 }, (_, i) => `d${i}`);
    state.players.p1.hand = [{ instanceId: "moria", cardNumber: "OP14-104" }];
    state.players.p1.trash = [{ instanceId: "kumacy", cardNumber: "OP14-102" }];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "moria",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "life",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "kumacy",
    );

    expect(state.players.p1.life[0]).toEqual({
      instanceId: "kumacy",
      cardNumber: "OP14-102",
      faceUp: true,
    });
  });

  it("replaces a Character rather than dropping a trash play at a full field", () => {
    // The interpreter used to `break` at five Characters, so a recursion target
    // chosen at a full field was consumed for nothing.
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "kumacy", cardNumber: "OP14-102" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    state.players.p1.board = [
      character("b1", "OP14-102"),
      character("b2", "OP14-102"),
      character("b3", "OP14-102"),
      character("b4", "OP14-102"),
      character("b5", "OP14-102"),
    ];
    state.players.p1.trash = [{ instanceId: "perona", cardNumber: "OP14-111" }];

    state = submit(
      state,
      (action) =>
        action.type === "resolve-trigger" && action.optionId === "activate",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "perona",
    );
    const replacement = getLegalActions(state, "p1").find(
      (action) => action.type === "resolve-effect" && action.optionId === "b1",
    );
    expect(replacement?.summary).toContain("to make room for Perona");
    state = submit(
      state,
      (action) => action.type === "resolve-effect" && action.optionId === "b1",
    );

    expect(state.players.p1.board).toHaveLength(5);
    expect(state.players.p1.board).toContainEqual(
      expect.objectContaining({ instanceId: "perona", rested: true }),
    );
    expect(state.players.p1.trash).toContainEqual({
      instanceId: "b1",
      cardNumber: "OP14-102",
    });
  });

  covers("EB03-053", "[On K.O.]");
  it("pays EB03-053's On K.O. with a face-up Life card to play from hand", () => {
    let state = scenario();
    state.players.p1.hand = [
      { instanceId: "borsalino", cardNumber: "EB04-058" },
    ];
    const koResult = createOnKoResult(
      state,
      "p1",
      { instanceId: "nami", cardNumber: "EB03-053" },
      "p1",
    );
    state.pendingEffect = koResult.pending;
    expect(state.pendingEffect).not.toBeNull();

    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
    const lifeInstanceId = state.players.p1.life[0]!.instanceId;
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === lifeInstanceId,
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "borsalino",
    );

    expect(state.players.p1.life[0]).toEqual(
      expect.objectContaining({ instanceId: lifeInstanceId, faceUp: true }),
    );
    expect(state.players.p1.board).toContainEqual(
      expect.objectContaining({ instanceId: "borsalino" }),
    );
  });

  covers("OP06-106", "[On Play]");
  it("runs Hiyori's Life swap through generic mechanic choices", () => {
    let state = scenario();
    const topLife = state.players.p1.life[0]!;
    const bottomLife = state.players.p1.life.at(-1)!;
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [
      { instanceId: "hiyori", cardNumber: "OP06-106" },
      { instanceId: "replacement", cardNumber: "OP14-102" },
    ];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "hiyori",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
    expect(
      getLegalActions(state, state.activePlayer)
        .filter((action) => action.type === "resolve-effect")
        .map((action) => action.optionId),
    ).toEqual([topLife.instanceId, bottomLife.instanceId]);
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === topLife.instanceId,
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "replacement",
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.life[0]?.cardNumber).toBe("OP14-102");
    expect(state.players.p1.hand).toContainEqual({
      instanceId: topLife.instanceId,
      cardNumber: topLife.cardNumber,
    });
    expect(state.oncePerTurn).toContain("5:p1:OP11-041:reaction");
  });

  /**
   * The Leader's unpaid +2000 is invisible in `targetPower`, so `counterShortfall`
   * calls an attack a hit that the ability alone turns away -- and because the
   * boost lasts the turn rather than the battle, every later attack meets it too.
   * An LLM run declared six attacks into the 5000-7000 band against this Leader
   * and connected with none of them, each one reported as a hit. The attack
   * action now states the number the attack actually has to beat.
   */
  covers("OP11-041", "[On Your Opponent's Attack]");
  it("forecasts the Leader's unpaid +2000 as effectiveTargetPower", () => {
    const state = scenario();
    state.turn = 6;
    setTurnPlayer(state, "p2");
    state.players.p1.leaderAttachedDon = ["don-1"];
    state.players.p1.hand = [{ instanceId: "discard", cardNumber: "OP14-102" }];
    state.players.p2.board = [character("zoro", "OP14-015")];

    const attacks = getLegalActions(state, "p2").filter(
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p1-leader",
    );
    const byZoro = attacks.find(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "zoro",
    );
    const byLeader = attacks.find(
      (action) =>
        action.type === "attack" && action.attackerInstanceId === "p2-leader",
    );

    // 8000 clears the Leader's current 5000 and its boosted 7000, so the boost
    // only raises the price: 3001 of Counter on the board as it stands, 1001
    // once the discard is paid.
    expect(byZoro).toMatchObject({
      type: "attack",
      targetPower: 5000,
      effectiveTargetPower: 7000,
      counterShortfall: 3001,
    });
    expect(byZoro?.summary).toContain("raises this target to 7000");
    expect(byZoro?.summary).toContain(
      "the real requirement is 1001 Counter power",
    );

    // 5000 is the trap: reported as a hit needing 1 Counter, it cannot connect
    // at all once the defender spends one card on the ability.
    expect(byLeader).toMatchObject({
      effectiveTargetPower: 7000,
      counterShortfall: 1,
    });
    expect(byLeader?.summary).toContain(
      "this attack fails outright once it is paid",
    );
  });

  it("drops the forecast boost once the Leader can no longer pay for it", () => {
    const state = scenario();
    state.turn = 6;
    setTurnPlayer(state, "p2");
    state.players.p1.leaderAttachedDon = ["don-1"];
    state.players.p2.board = [character("attacker", "ST31-002")];

    // No card in hand to discard, so the ability cannot be paid for at all.
    state.players.p1.hand = [];
    const noHand = getLegalActions(state, "p2").find(
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p1-leader",
    );
    expect(noHand).toMatchObject({ effectiveTargetPower: 5000 });

    // Already used this turn.
    state.players.p1.hand = [{ instanceId: "discard", cardNumber: "OP14-102" }];
    state.oncePerTurn.push("6:p1:OP11-041-def");
    const alreadySpent = getLegalActions(state, "p2").find(
      (action) =>
        action.type === "attack" && action.targetInstanceId === "p1-leader",
    );
    expect(alreadySpent).toMatchObject({ effectiveTargetPower: 5000 });
    expect(alreadySpent?.summary).not.toContain("raises this target");
  });

  covers("OP11-106", "[On Play]");
  it("runs Zeus's Life cost and K.O. through the same primitives", () => {
    let state = scenario();
    const life = state.players.p1.life[0]!;
    state.players.p1.activeDon = ["d1", "d2"];
    state.players.p1.hand = [{ instanceId: "zeus", cardNumber: "OP11-106" }];
    state.players.p2.board = [character("target", "OP11-012")];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "zeus",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === life.instanceId,
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "target",
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p2.board).toHaveLength(0);
    expect(state.players.p2.trash.at(-1)?.cardNumber).toBe("OP11-012");
  });

  covers("EB04-058", "[On Play]");
  it("uses generic conditions and movement for Borsalino's Life gain", () => {
    let state = scenario();
    state.players.p1.life = state.players.p1.life.slice(0, 2);
    const topDeck = state.players.p1.deck[0]!;
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5"];
    state.players.p1.hand = [
      { instanceId: "borsalino", cardNumber: "EB04-058" },
    ];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "borsalino",
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.life).toHaveLength(3);
    expect(state.players.p1.life[0]?.instanceId).toBe(topDeck.instanceId);
  });

  covers("OP15-113", "[On Play]");
  it("uses generic movement for Zoro's discard and Life gain", () => {
    let state = scenario();
    const topDeck = state.players.p1.deck[0]!;
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4"];
    state.players.p1.hand = [
      { instanceId: "zoro", cardNumber: "OP15-113" },
      { instanceId: "discard", cardNumber: "OP14-102" },
    ];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "zoro",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "discard",
    );

    expect(state.players.p1.trash.at(-1)?.cardNumber).toBe("OP14-102");
    expect(state.players.p1.life[0]?.instanceId).toBe(topDeck.instanceId);
  });

  covers("EB03-053", "[On Play]");
  it("composes DON attachment and opponent Life removal for EB03 Nami", () => {
    let state = scenario();
    state.players.p2.life.push(...state.players.p2.deck.splice(0, 3));
    const opponentLife = state.players.p2.life[0]!;
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5"];
    state.players.p1.hand = [{ instanceId: "nami", cardNumber: "EB03-053" }];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "nami",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );

    expect(state.players.p1.leaderAttachedDon).toHaveLength(1);
    expect(state.players.p2.hand).toContainEqual(opponentLife);
    expect(state.players.p1.hand).toHaveLength(1);
    expect(state.oncePerTurn).toContain("5:p1:OP11-041:reaction");
  });

  /**
   * The Leader's own `[Your Turn] [Once Per Turn]` draw off battle damage.
   *
   * This is the reading that matters most -- taking the opponent's Life with an
   * attack is how the deck removes Life cards nearly every turn -- and it used
   * to be the one reading that never fired: the reaction is dispatched from
   * inside battle resolution, where `activePlayer` is still the defender the
   * Block and Counter steps handed it to, so the `[Your Turn]` gate rejected the
   * attacking Nami player every time.
   */
  function attackWithLeader(state: GameState): GameState {
    let next = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "p1-leader" &&
        action.targetInstanceId === "p2-leader",
    );
    next = submit(next, (action) => action.actionId.endsWith(":pass-block"));
    return submit(next, (action) => action.actionId.endsWith(":pass-counter"));
  }

  covers("OP11-041", "[Your Turn]");
  it("draws off the Life card its own attack takes from the opponent", () => {
    let state = scenario();
    state.players.p2.life.push(...state.players.p2.deck.splice(0, 2));
    const drawn = state.players.p1.deck[0]!;

    state = attackWithLeader(state);

    expect(state.players.p2.life).toHaveLength(1);
    expect(state.players.p1.hand).toContainEqual(drawn);
    expect(state.oncePerTurn).toContain("5:p1:OP11-041:reaction");
  });

  it("does not draw off the Life card an opponent's attack takes", () => {
    // Same battle from the other seat: `[Your Turn]` means the Leader's draw is
    // silent when it is Nami's Life being taken on the opponent's turn.
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.turn = 6;
    state.players.p2.board = [character("attacker", "ST31-004")];
    state.players.p2.board[0]!.playedTurn = 5;

    state = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "attacker" &&
        action.targetInstanceId === "p1-leader",
    );
    state = submit(state, (action) => action.actionId.endsWith(":pass-block"));
    state = submit(state, (action) =>
      action.actionId.endsWith(":pass-counter"),
    );

    expect(state.players.p1.life).toHaveLength(4);
    expect(state.oncePerTurn).not.toContain("6:p1:OP11-041:reaction");
  });

  covers("EB03-055", "[On Play]");
  it("replaces Nico Robin's trashed Life with the top two deck cards", () => {
    let state = scenario();
    const trashedLife = state.players.p1.life[0]!;
    const replacements = state.players.p1.deck.slice(0, 2);
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];
    state.players.p1.hand = [{ instanceId: "robin", cardNumber: "EB03-055" }];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "robin",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );

    expect(state.players.p1.trash).toContainEqual(trashedLife);
    expect(
      state.players.p1.life
        .slice(0, 2)
        .map((card) => card.instanceId)
        .sort(),
    ).toEqual(replacements.map((card) => card.instanceId).sort());
    expect(state.players.p1.life).toHaveLength(6);
  });

  covers("OP15-114", "[On Play]");
  it("reduces the opposing board and K.O.s zero-power Characters for Wyper", () => {
    let state = scenario();
    const topLife = state.players.p1.life[0]!;
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5"];
    state.players.p1.hand = [{ instanceId: "wyper", cardNumber: "OP15-114" }];
    state.players.p2.board = [
      character("zero", "OP14-102"),
      character("survivor", "OP14-110"),
    ];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "wyper",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );

    expect(
      state.players.p1.life.find(
        (card) => card.instanceId === topLife.instanceId,
      )?.faceUp,
    ).toBe(true);
    expect(state.players.p2.trash).toContainEqual({
      instanceId: "zero",
      cardNumber: "OP14-102",
    });
    expect(state.players.p2.board[0]?.instanceId).toBe("survivor");
    expect(state.players.p2.board[0]?.powerModifiers).toContainEqual(
      expect.objectContaining({ amount: -2000, expiresAtTurn: 5 }),
    );
  });

  covers("OP15-114", "[Activate: Main]");
  it("gives Wyper's rested DON!! to a {Sky Island} Character only", () => {
    let state = scenario();
    state.players.p1.board = [
      character("wyper", "OP15-114"),
      character("zoro", "OP15-113"),
      character("borsalino", "EB04-058"),
    ];
    state.players.p1.restedDon = ["r1"];

    // Leader Nami is {Straw Hat Crew}, so only the two {Sky Island} Characters
    // (Wyper included) and decline are offered.
    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-114",
    );
    const options = getLegalActions(state, "p1")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(options).toEqual(["wyper", "zoro", "skip"]);

    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "zoro",
    );
    expect(state.players.p1.restedDon).toEqual([]);
    expect(
      state.players.p1.board.find((entry) => entry.instanceId === "zoro")
        ?.attachedDon,
    ).toEqual(["r1"]);
    expect(
      state.players.p1.board.find((entry) => entry.instanceId === "borsalino")
        ?.attachedDon,
    ).toEqual([]);
  });

  it("offers Wyper's Leader when it has the {Sky Island} type", () => {
    let state = scenario();
    state.players.p1.leaderCardNumber = "OP15-058"; // Enel, {Sky Island}
    state.players.p1.board = [character("wyper", "OP15-114")];
    state.players.p1.restedDon = ["r1"];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-114",
    );
    const options = getLegalActions(state, "p1")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(options).toEqual(["p1-leader", "wyper", "skip"]);

    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "p1-leader",
    );
    expect(state.players.p1.leaderAttachedDon).toEqual(["r1"]);
    expect(state.players.p1.restedDon).toEqual([]);
  });

  it("lets Wyper decline the gift and reuses the once-per-turn", () => {
    let state = scenario();
    state.players.p1.board = [
      character("wyper", "OP15-114"),
      character("zoro", "OP15-113"),
    ];
    state.players.p1.restedDon = ["r1"];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-114",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "skip",
    );

    expect(state.players.p1.restedDon).toEqual(["r1"]);
    expect(state.pendingEffect).toBeNull();
    // The once-per-turn was consumed even though nothing moved.
    expect(
      getLegalActions(state, "p1").some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "OP15-114",
      ),
    ).toBe(false);
  });

  it("offers no Wyper gift when there is no rested DON!!", () => {
    let state = scenario();
    state.players.p1.board = [
      character("wyper", "OP15-114"),
      character("zoro", "OP15-113"),
    ];
    state.players.p1.restedDon = [];

    state = submit(
      state,
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP15-114",
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.restedDon).toEqual([]);
    expect(
      state.players.p1.board.find((entry) => entry.instanceId === "zoro")
        ?.attachedDon,
    ).toEqual([]);
  });

  it("queues every On K.O. program created by one mechanic", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5"];
    state.players.p1.hand = [{ instanceId: "wyper", cardNumber: "OP15-114" }];
    const perona = character("perona", "OP14-111");
    perona.powerModifiers = [{ amount: -3000, expiresAtTurn: 5 }];
    const marco = character("marco", "PRB02-008");
    marco.powerModifiers = [{ amount: -4000, expiresAtTurn: 5 }];
    state.players.p2.board = [perona, marco];
    const opponentHandCount = state.players.p2.hand.length;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "wyper",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );

    // Both were K.O.'d at once, so their owner orders the two [On K.O.]s.
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === "reaction:perona",
    );
    expect(state.pendingEffect?.sourceCardNumber).toBe("OP14-111");
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "wyper",
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.board[0]?.cannotAttackUntilTurn).toBe(6);
    expect(state.players.p2.hand).toHaveLength(opponentHandCount + 2);
  });

  covers("OP13-042", "[On Play]");
  it("draws, trashes, and distributes rested DON for Edward Newgate", () => {
    let state = scenario();
    state.players.p1.activeDon = [
      "d1",
      "d2",
      "d3",
      "d4",
      "d5",
      "d6",
      "d7",
      "d8",
      "d9",
      "d10",
    ];
    state.players.p1.hand = [
      { instanceId: "newgate", cardNumber: "OP13-042" },
      { instanceId: "discard", cardNumber: "OP14-102" },
    ];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "newgate",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "discard",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "newgate",
    );

    expect(state.pendingEffect).toBeNull();
    expect(state.players.p1.trash).toContainEqual({
      instanceId: "discard",
      cardNumber: "OP14-102",
    });
    expect(state.players.p1.leaderAttachedDon).toHaveLength(2);
    expect(state.players.p1.board[0]?.attachedDon).toHaveLength(2);
  });

  covers("OP14-111", "[On Play]");
  it("uses a generic delayed restriction for Perona", () => {
    let state = scenario();
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4"];
    state.players.p1.hand = [{ instanceId: "perona", cardNumber: "OP14-111" }];
    state.players.p2.board = [character("target", "OP11-012")];

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "perona",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "target",
    );

    expect(state.players.p2.board[0]?.cannotAttackUntilTurn).toBe(6);
  });

  covers("PRB02-008", "[On K.O.]");
  it("dispatches Marco's On K.O. draw as a generic timing program", () => {
    const state = scenario();
    const handCount = state.players.p1.hand.length;

    const result = createOnKoResult(
      state,
      "p1",
      { instanceId: "marco", cardNumber: "PRB02-008" },
      "p2",
    );

    expect(result.pending).toBeNull();
    expect(state.players.p1.hand).toHaveLength(handCount + 2);
    expect(result.events).toContainEqual({
      type: "cards-drawn",
      playerId: "p1",
      count: 2,
      sourceCardNumber: "PRB02-008",
    });
  });

  covers("OP06-104", "[On K.O.]");
  it("dispatches Kikunojo's conditional On K.O. Life gain generically", () => {
    const state = scenario();
    state.players.p2.life = state.players.p2.life.slice(0, 3);
    const lifeCount = state.players.p1.life.length;
    const topDeck = state.players.p1.deck[0]!;

    const result = createOnKoResult(
      state,
      "p1",
      { instanceId: "kikunojo", cardNumber: "OP06-104" },
      "p2",
    );

    expect(result.pending).toBeNull();
    expect(state.players.p1.life).toHaveLength(lifeCount + 1);
    expect(state.players.p1.life[0]?.instanceId).toBe(topDeck.instanceId);
  });

  covers("OP14-111", "[On K.O.]");
  it("reuses Perona's generic restriction at On Play and On K.O.", () => {
    let state = scenario();
    state.players.p2.board = [character("target", "OP11-012")];
    const result = createOnKoResult(
      state,
      "p1",
      { instanceId: "perona", cardNumber: "OP14-111" },
      "p2",
    );
    state.pendingEffect = result.pending;

    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "target",
    );

    expect(state.players.p2.board[0]?.cannotAttackUntilTurn).toBe(6);
  });

  it("returns to the attacker's Main Phase after Perona's battle On K.O.", () => {
    let state = scenario();
    state.turn = 8;
    state.phase = "counter";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    const perona = character("perona", "OP14-111");
    perona.rested = true;
    state.players.p1.board = [perona];
    state.players.p2.board = [character("target", "OP11-012")];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "perona",
      attackPower: 6000,
      counterPower: 0,
    });

    state = submit(
      state,
      (action) =>
        action.type === "pass" && action.actionId.endsWith(":pass-counter"),
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "target",
    );

    expect(state.turn).toBe(8);
    expect(state.phase).toBe("main");
    expect(state.activePlayer).toBe("p2");
    expect(
      getLegalActions(state, "p2").some((action) => action.type === "pass"),
    ).toBe(true);
  });

  /**
   * Poses the Leader's `[On Your Opponent's Attack]` +2000 with `attackPower`
   * chosen by the caller, so the three cases the policy distinguishes -- the
   * attack fails anyway, +2000 turns it away, +2000 cannot -- differ only in
   * that number.
   */
  function leaderUnderAttack(attackPower: number): GameState {
    const state = scenario();
    state.phase = "block";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.leaderAttachedDon = ["d1"];
    state.players.p1.hand = [
      { instanceId: "keep", cardNumber: "OP14-104" },
      { instanceId: "give-up", cardNumber: "OP14-102" },
    ];
    state.players.p2.board = [character("attacker", "ST31-002")];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
      attackPower,
      counterPower: 0,
    });
    state.pendingEffect = {
      kind: "nami-leader",
      playerId: "p1",
      sourceCardNumber: "OP11-041",
      sourceInstanceId: "p1-leader",
      eligibleInstanceIds: ["keep", "give-up"],
      resumePhase: "block",
      resumePlayerId: "p1",
    };
    return state;
  }

  it("reports which card the Leader's +2000 trashed, not just the power change", () => {
    // The bug this covers: the hand card the Leader's ability trashes is a
    // public cost -- the opponent is entitled to see it -- but resolveEffect
    // only ever returned a bare power-changed event, so the trash happened
    // with no trace in the event stream and the opponent notice modal never
    // named the card.
    const state = leaderUnderAttack(6000);
    const played = applyAction(state, {
      ...getLegalActions(state, "p1").find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "give-up",
      )!,
      revision: state.revision,
    });

    expect(played.state.players.p1.trash).toContainEqual(
      expect.objectContaining({
        instanceId: "give-up",
        cardNumber: "OP14-102",
      }),
    );
    expect(played.events).toContainEqual(
      expect.objectContaining({
        type: "card-moved",
        playerId: "p1",
        cardInstanceId: "give-up",
        cardNumber: "OP14-102",
        from: "hand",
        to: "trash",
        sourceCardNumber: "OP11-041",
      }),
    );

    const asP2 = observe(played.state, "p2").publicEvents.find(
      (event) => event.type === "card-moved",
    );
    expect(asP2).toMatchObject({ cardNumber: "OP14-102" });
  });

  it("ends the battle when Leo's replacement removes the attack's own target", () => {
    // Leo answers a K.O. by bottom-decking one of its controller's Characters,
    // and the Character it gives up may be the one currently under attack. The
    // attack then pointed at a card that was no longer on the board, and both
    // `resolveBattle` and `observe` threw MISSING_CARD asking for its power.
    let state = scenario();
    state.phase = "counter";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.board = [
      character("leo", "OP15-052"),
      character("under-attack", "EB04-058"),
    ];
    state.players.p2.board = [character("attacker", "ST31-002")];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "attacker",
      targetInstanceId: "under-attack",
      attackPower: 5000,
      counterPower: 0,
    });
    state.pendingEffect = {
      kind: "character-area-replacement",
      playerId: "p1",
      sourceCardNumber: "OP15-052",
      sourceInstanceId: "leo",
      card: { instanceId: "leo", cardNumber: "OP15-052" },
      eligibleInstanceIds: ["leo", "under-attack"],
      rested: false,
    };

    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "under-attack",
    );

    expect(state.players.p1.board.map((card) => card.instanceId)).not.toContain(
      "under-attack",
    );
    expect(state.activeAttack).toBeNull();
    expect(state.phase).toBe("main");
    expect(state.activePlayer).toBe("p2");
  });

  it("reports EB03-053's Life theft and the Leader draw it triggers as steps", () => {
    // The bug this covers: both halves of this play used to change the board
    // with nothing in the event stream. The Life card left the opponent's stack
    // and OP11-041's reaction drew for it, and the only trace was an
    // unattributed "cards-drawn" that read like an ordinary draw.
    let state = scenario();
    state.players.p1.hand = [{ instanceId: "nami", cardNumber: "EB03-053" }];
    state.players.p1.activeDon = ["d1", "d2", "d3", "d4", "d5"];
    state.players.p1.restedDon = ["d6"];
    state.players.p2.life = state.players.p2.deck.splice(0, 4);
    const stolen = state.players.p2.life[0]!;
    const p2HandCount = state.players.p2.hand.length;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "nami",
    );
    const played = applyAction(state, {
      ...getLegalActions(state, "p1").find(
        (action) =>
          action.type === "resolve-effect" && action.option.kind !== "skip",
      )!,
      revision: state.revision,
    });

    expect(played.state.players.p2.life).toHaveLength(3);
    expect(played.state.players.p2.hand).toHaveLength(p2HandCount + 1);
    expect(played.events).toContainEqual(
      expect.objectContaining({
        type: "card-moved",
        playerId: "p2",
        cardNumber: stolen.cardNumber,
        from: "life",
        to: "hand",
        position: "top",
        sourceCardNumber: "EB03-053",
        // Face-down Life is private: p2 gains a card p1 is not entitled to name.
        identityVisibleTo: "p2",
      }),
    );
    expect(played.events).toContainEqual(
      expect.objectContaining({
        type: "cards-drawn",
        playerId: "p1",
        count: 1,
        sourceCardNumber: "OP11-041",
      }),
    );

    // p1 sees that a card left the opponent's Life without learning which.
    const asP1 = observe(played.state, "p1").publicEvents.find(
      (event) => event.type === "card-moved",
    );
    expect(asP1).toMatchObject({ cardInstanceId: null, cardNumber: null });
    const asP2 = observe(played.state, "p2").publicEvents.find(
      (event) => event.type === "card-moved",
    );
    expect(asP2).toMatchObject({ cardNumber: stolen.cardNumber });
  });
  it("shows the Life card to its owner alone when a Trigger window opens", () => {
    // A Trigger window is a private look: the damaged player checks the Life
    // card and only turns it face-up by activating it. Without this event the
    // owner's own damage read as a silent pause; with it public, the attacker
    // learned a card the defender may well decline to show.
    const state = scenario();
    state.phase = "block";
    // p1 acts -- it is defending -- inside p2's turn, which the
    // fabricated attack below is the rest of. The two are separate facts.
    state.activePlayer = "p1";
    state.turnPlayerId = "p2";
    state.players.p1.life = [{ instanceId: "tiger", cardNumber: "OP06-058" }];
    state.players.p2.board = [character("attacker", "ST31-002")];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "attacker",
      targetInstanceId: "p1-leader",
      attackPower: 9000,
      counterPower: 0,
    });

    let current = state;
    const block = getLegalActions(current, "p1").find((action) =>
      action.actionId.endsWith(":pass-block"),
    );
    expect(block).toBeDefined();
    current = applyAction(current, {
      ...block!,
      revision: current.revision,
    }).state;
    const counter = getLegalActions(current, "p1").find((action) =>
      action.actionId.endsWith(":pass-counter"),
    );
    expect(counter).toBeDefined();
    const played = applyAction(current, {
      ...counter!,
      revision: current.revision,
    });

    expect(played.state.phase).toBe("trigger");
    expect(played.state.pendingTrigger?.card.cardNumber).toBe("OP06-058");
    expect(played.events).toContainEqual(
      expect.objectContaining({
        type: "card-revealed",
        playerId: "p1",
        cardNumber: "OP06-058",
        visibleTo: "p1",
      }),
    );
    // The look is private: the attacker sees the damage, not the card.
    const asP2 = observe(played.state, "p2").publicEvents.find(
      (event) => event.type === "card-revealed",
    );
    expect(asP2).toBeUndefined();
    expect(observe(played.state, "p2").pendingTriggerCardNumber).toBeNull();
  });
  covers("OP06-058", "[Trigger]");
  it("logs the OP06-058 Trigger's reveal and the Character it bottom-decks", () => {
    // The bug this covers: activating the Gravity Blade Raging Tiger Trigger
    // bottom-decked the opponent's Character with no events at all, so the
    // history showed nothing and the card silently vanished from the board.
    const state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "tiger", cardNumber: "OP06-058" },
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 9000,
      counterPower: 0,
    });
    state.players.p2.board = [character("perona", "OP14-111")];

    const action = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "resolve-trigger" && action.optionId === "perona",
    );
    expect(action).toBeDefined();
    const played = applyAction(state, {
      ...action!,
      revision: state.revision,
    });

    expect(played.state.players.p2.board).toHaveLength(0);
    expect(played.state.players.p2.deck.at(-1)).toEqual({
      instanceId: "perona",
      cardNumber: "OP14-111",
    });
    expect(played.events).toContainEqual(
      expect.objectContaining({
        type: "card-moved",
        playerId: "p2",
        cardInstanceId: "perona",
        cardNumber: "OP14-111",
        from: "board",
        to: "deck",
        position: "bottom",
        sourceCardNumber: "OP06-058",
      }),
    );
  });
  covers("OP16-119", "[On Play]");
  it("adds one of Marshall.D.Teach's three looked-at cards to Life", () => {
    let state = scenario();
    state.players.p1.activeDon = [
      "d1",
      "d2",
      "d3",
      "d4",
      "d5",
      "d6",
      "d7",
      "d8",
    ];
    state.players.p1.hand = [{ instanceId: "teach", cardNumber: "OP16-119" }];
    const looked = state.players.p1.deck.slice(0, 3);
    const untouched = state.players.p1.deck[3]!;
    const deckSize = state.players.p1.deck.length;
    const lifeSize = state.players.p1.life.length;

    const played = applyAction(state, {
      ...getLegalActions(state, "p1").find(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "teach",
      )!,
      revision: state.revision,
    });
    state = played.state;

    // The look is private: three steps, each naming a card, none of them public.
    const looks = played.events.filter(
      (event) => event.type === "card-revealed",
    );
    expect(looks).toHaveLength(3);
    expect(looks.map((event) => event.cardNumber)).toEqual(
      looked.map((card) => card.cardNumber),
    );
    expect(looks.every((event) => event.visibleTo === "p1")).toBe(true);
    expect(
      observe(state, "p2").publicEvents.filter(
        (event) => event.type === "card-revealed",
      ),
    ).toEqual([]);

    // Only the looked-at cards are offered, and only to the player looking.
    const options = getLegalActions(state, "p1")
      .filter((action) => action.type === "resolve-effect")
      .map((action) => action.optionId);
    expect(options.filter((optionId) => optionId !== "done").sort()).toEqual(
      looked.map((card) => card.instanceId).sort(),
    );
    expect(getLegalActions(state, "p2")).toEqual([]);

    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" &&
        action.optionId === looked[1]!.instanceId,
    );

    expect(state.players.p1.life[0]).toEqual({
      instanceId: looked[1]!.instanceId,
      cardNumber: looked[1]!.cardNumber,
    });
    expect(state.players.p1.life).toHaveLength(lifeSize + 1);
    // The other two go to the bottom in the order they were looked at, and the
    // card that was fourth is now the top of the deck.
    expect(state.players.p1.deck[0]).toEqual(untouched);
    expect(state.players.p1.deck.slice(-2)).toEqual([looked[0], looked[2]]);
    expect(state.players.p1.deck).toHaveLength(deckSize - 1);
    expect(state.pendingEffect).toBeNull();
  });

  it("keeps Marshall.D.Teach's three cards in the deck when none is taken", () => {
    let state = scenario();
    state.players.p1.activeDon = [
      "d1",
      "d2",
      "d3",
      "d4",
      "d5",
      "d6",
      "d7",
      "d8",
    ];
    state.players.p1.hand = [{ instanceId: "teach", cardNumber: "OP16-119" }];
    const looked = state.players.p1.deck.slice(0, 3);
    const deckSize = state.players.p1.deck.length;
    const lifeSize = state.players.p1.life.length;

    state = submit(
      state,
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "teach",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "done",
    );

    expect(state.players.p1.life).toHaveLength(lifeSize);
    expect(state.players.p1.deck).toHaveLength(deckSize);
    expect(state.players.p1.deck.slice(-3)).toEqual(looked);
  });

  covers("OP16-119", "[Trigger]");
  it("negates a Character and K.O.s another with Marshall.D.Teach's Trigger", () => {
    let state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: { instanceId: "teach", cardNumber: "OP16-119" },
    };
    // p2 is the attacker, so the fabricated attack has to bring p2's turn with
    // it -- the DON!! given to a p2 Character below only adds power there.
    state.turnPlayerId = "p2";
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower: 5000,
      counterPower: 0,
    });
    // ST31-002 Jinbe prints [Blocker] outright. Two copies, one negated, is the
    // whole contrast: `hasStaticKeyword` drops a negated Character's own printed
    // keywords, so the negation is visible as the keyword going away.
    //
    // Deliberately not ST31-003 Brook, which was here before: Brook's [Blocker]
    // is behind an `[Opponent's Turn]` prefix, and p2 is the attacker in this
    // position, so on p2's own turn neither copy has the keyword to lose and the
    // contrast reads as a pass for the wrong reason.
    const negatedJinbe = character("jinbe", "ST31-002");
    const untouchedJinbe = character("other-jinbe", "ST31-002");
    untouchedJinbe.attachedDon = state.players.p2.donDeck.splice(0, 3);
    state.players.p2.board = [
      negatedJinbe,
      untouchedJinbe,
      character("cheap", "OP14-102"),
    ];

    state = submit(
      state,
      (action) =>
        action.type === "resolve-trigger" && action.optionId === "activate",
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "jinbe",
    );

    expect(state.negatedEffects).toEqual([
      { instanceId: "jinbe", expiresAtTurn: 5 },
    ]);

    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "cheap",
    );

    expect(state.players.p2.trash).toContainEqual({
      instanceId: "cheap",
      cardNumber: "OP14-102",
    });
    const board = observe(state, "p2").self.board;
    const negated = board.find((card) => card.instanceId === "jinbe");
    const untouched = board.find((card) => card.instanceId === "other-jinbe");
    // Printed 6000 with its [Blocker] negated away, against the same card with
    // three DON!! given to it: 6000 + 3000 DON!!, keyword intact. The DON!! are
    // somebody else's contribution rather than the Character's own effect, which
    // is why negation takes the keyword and leaves the power.
    expect(negated).toMatchObject({
      negated: true,
      blocker: false,
      currentPower: 6000,
    });
    expect(untouched).toMatchObject({ blocker: true, currentPower: 9000 });
    expect(untouched?.negated).toBeUndefined();
    expect(state.players.p1.trash).toContainEqual({
      instanceId: "teach",
      cardNumber: "OP16-119",
    });
    // The negation outlives the Trigger and the battle, but not the turn.
    expect(state.negatedEffects).toHaveLength(1);
  });

  it("drops the On K.O. of a Character negated before it dies", () => {
    const state = scenario();
    state.negatedEffects = [{ instanceId: "marco", expiresAtTurn: 5 }];
    state.players.p1.board = [character("marco", "PRB02-008")];
    const handCount = state.players.p1.hand.length;

    const result = createOnKoResult(
      state,
      "p1",
      { instanceId: "marco", cardNumber: "PRB02-008" },
      "p2",
    );

    // PRB02-008 Marco draws 2 on K.O. -- unless its effects are switched off.
    expect(result).toEqual({ pending: null, events: [] });
    expect(state.players.p1.hand).toHaveLength(handCount);
  });

  covers("EB03-055", "[On K.O.]", "[Opponent's Turn]");
  it("deals 1 damage with Nico Robin's On K.O. on the opponent's turn", () => {
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.turn = 6;
    const robin = character("robin", "EB03-055");
    robin.rested = true;
    state.players.p1.board = [robin];
    state.players.p2.life.push(...state.players.p2.deck.splice(0, 3));
    // A Life card with no Trigger, so the damage resolves without a window.
    const damaged = { instanceId: "plain", cardNumber: "OP15-052" };
    state.players.p2.life[0] = damaged;
    const p2HandCount = state.players.p2.hand.length;
    state.players.p2.board = [character("attacker", "ST31-004")];
    state.players.p2.board[0]!.playedTurn = 5;

    state = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "attacker" &&
        action.targetInstanceId === "robin",
    );
    state = submit(state, (action) => action.actionId.endsWith(":pass-block"));
    state = submit(state, (action) =>
      action.actionId.endsWith(":pass-counter"),
    );

    // Robin died to the attack, so the [On K.O.] is offered to p1 mid-battle.
    expect(state.activePlayer).toBe("p1");
    const applied = applyAction(state, {
      ...getLegalActions(state, "p1").find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      )!,
      revision: state.revision,
    });
    state = applied.state;

    expect(state.players.p2.life).toHaveLength(2);
    expect(state.players.p2.hand).toContainEqual(damaged);
    expect(state.players.p2.hand).toHaveLength(p2HandCount + 1);
    expect(applied.events).toContainEqual(
      expect.objectContaining({
        type: "damage-taken",
        playerId: "p2",
        lifeRemaining: 2,
      }),
    );
    // Control goes back to the attacker's Main Phase.
    expect(state.phase).toBe("main");
    expect(state.activePlayer).toBe("p2");
    expect(state.pendingTrigger).toBeNull();
  });

  it("opens the damaged player's Trigger window on effect damage", () => {
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.turn = 6;
    const robin = character("robin", "EB03-055");
    robin.rested = true;
    state.players.p1.board = [robin];
    state.players.p2.life.push(...state.players.p2.deck.splice(0, 3));
    // OP14-102 Kumacy's Trigger is one the engine resolves, so the window opens.
    state.players.p2.life[0] = {
      instanceId: "trigger",
      cardNumber: "OP14-102",
    };
    state.players.p2.board = [character("attacker", "ST31-004")];
    state.players.p2.board[0]!.playedTurn = 5;

    state = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "attacker" &&
        action.targetInstanceId === "robin",
    );
    state = submit(state, (action) => action.actionId.endsWith(":pass-block"));
    state = submit(state, (action) =>
      action.actionId.endsWith(":pass-counter"),
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );

    expect(state.phase).toBe("trigger");
    expect(state.activePlayer).toBe("p2");
    expect(state.pendingTrigger).toMatchObject({
      playerId: "p2",
      card: { instanceId: "trigger" },
      resume: { phase: "main", playerId: "p2" },
    });

    state = submit(
      state,
      (action) =>
        action.type === "resolve-trigger" && action.optionId === "skip",
    );

    // Skipping puts the damaged card in its owner's hand and returns the phase
    // the damage interrupted.
    expect(state.players.p2.hand).toContainEqual({
      instanceId: "trigger",
      cardNumber: "OP14-102",
    });
    expect(state.phase).toBe("main");
    expect(state.activePlayer).toBe("p2");
    expect(state.pendingTrigger).toBeNull();
  });

  it("deals no damage with Nico Robin's On K.O. on its controller's turn", () => {
    const state = scenario();
    const robin = character("robin", "EB03-055");
    robin.rested = true;
    state.players.p1.board = [robin];
    state.players.p2.life.push(...state.players.p2.deck.splice(0, 3));

    // Same clause, own turn: `[Opponent's Turn]` means it never starts.
    const result = createOnKoResult(
      state,
      "p1",
      { instanceId: "robin", cardNumber: "EB03-055" },
      "p2",
    );

    expect(result).toEqual({ pending: null, events: [] });
    expect(state.players.p2.life).toHaveLength(3);
  });

  it("wins the game when effect damage lands at zero Life", () => {
    let state = scenario();
    setTurnPlayer(state, "p2");
    state.turn = 6;
    const robin = character("robin", "EB03-055");
    robin.rested = true;
    state.players.p1.board = [robin];
    state.players.p2.life = [];
    state.players.p2.board = [character("attacker", "ST31-004")];
    state.players.p2.board[0]!.playedTurn = 5;

    state = submit(
      state,
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "attacker" &&
        action.targetInstanceId === "robin",
    );
    state = submit(state, (action) => action.actionId.endsWith(":pass-block"));
    state = submit(state, (action) =>
      action.actionId.endsWith(":pass-counter"),
    );
    state = submit(
      state,
      (action) =>
        action.type === "resolve-effect" && action.optionId === "apply",
    );

    expect(state.phase).toBe("finished");
    expect(state.winner).toBe("p1");
    expect(state.resultReason).toBe("life");
  });
});
