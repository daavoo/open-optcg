import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  GameService,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { LegalAction, PublicEvent } from "@one-piece-sim/protocol";
import { St31RulesAgent, St32RulesAgent } from "@one-piece-sim/agents/local";
import { covers, fabricatedAttack, setTurnPlayer } from "./support/index.js";

import { resolveDeck } from "@one-piece-sim/decks";

const card = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
});

const character = (
  instanceId: string,
  cardNumber: string,
  input: { rested?: boolean; playedTurn?: number; attachedDon?: string[] } = {},
) => ({
  instanceId,
  cardNumber,
  rested: input.rested ?? false,
  playedTurn: input.playedTurn ?? 1,
  attachedDon: input.attachedDon ?? [],
  powerModifiers: [],
});

function requireAction(
  state: GameState,
  predicate: (action: LegalAction) => boolean,
): LegalAction {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  if (!action) throw new Error("Missing expected legal action");
  return action;
}

function submit(state: GameState, action: LegalAction): GameState {
  return applyAction(state, { ...action, revision: state.revision }).state;
}

function submitWithEvents(
  state: GameState,
  action: LegalAction,
): { state: GameState; events: PublicEvent[] } {
  const result = applyAction(state, { ...action, revision: state.revision });
  return { state: result.state, events: result.events };
}

function scenario(): GameState {
  let state = createGame({
    gameId: "st32-scenario",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("FIXTURE-BLUE"),
    seed: "st32-fixed-seed",
  });
  for (const playerId of ["p1", "p2"] as const) {
    expect(state.activePlayer).toBe(playerId);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "mulligan-decision" && action.decision === "keep",
      ),
    );
  }
  state.turn = 3;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  state.pendingEffect = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];
  Object.assign(state.players.p1, {
    leaderCardNumber: "OP12-020",
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
    activateDonAtEndOfTurn: 0,
  });
  Object.assign(state.players.p2, {
    hand: [],
    deck: [card("p2-draw", "FIX-001")],
    board: [],
    stage: null,
    trash: [],
    activeDon: Array.from({ length: 10 }, (_, index) => `p2-active-${index}`),
    restedDon: [],
    leaderAttachedDon: [],
    leaderPowerModifiers: [],
    leaderRested: false,
    activateDonAtEndOfTurn: 0,
  });
  return state;
}

describe("implemented ST32 rules", () => {
  covers("ST32-001", "[On Play]");
  it("pays Kin'emon's optional cost, draws two, and trashes one", () => {
    let state = scenario();
    state.players.p1.hand = [card("kin", "ST32-001")];
    state.players.p1.deck = [
      card("draw-a", "OP12-023"),
      card("draw-b", "OP12-023"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "kin",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "don",
      ),
    );
    expect(state.players.p1.hand).toHaveLength(2);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "draw-a",
      ),
    );
    expect(state.players.p1.trash).toContainEqual(card("draw-a", "OP12-023"));
  });

  covers("ST32-002", "[On Play]");
  it("protects a Character with Oden through the opponent's next turn", () => {
    let state = scenario();
    state.players.p1.hand = [card("oden", "ST32-002")];
    state.players.p1.deck = [card("draw", "OP12-023")];
    state.players.p2.board = [character("protected", "FIX-002")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "oden",
      ),
    );
    const applied = submitWithEvents(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "protected",
      ),
    );
    state = applied.state;
    expect(state.players.p2.board[0]?.cannotRestUntilTurn).toBe(4);
    // A Character that cannot be rested cannot attack and cannot block, so it
    // stands there active with no legal action. Without the step and the two
    // observed fields, neither the log nor the card-detail panel can say why --
    // the trace that prompted this showed an empty event list for the choice.
    expect(applied.events).toContainEqual({
      type: "rest-prevented",
      playerId: "p2",
      targetInstanceId: "protected",
      targetCardNumber: "FIX-002",
      expiresAtTurn: 4,
      sourceCardNumber: "ST32-002",
    });
    for (const viewer of ["p1", "p2"] as const) {
      const seat = observe(state, viewer);
      const held = (viewer === "p1" ? seat.opponent : seat.self).board.find(
        (entry) => entry.instanceId === "protected",
      );
      expect(held?.cannotRestUntilTurn).toBe(4);
      expect(held?.cannotRestSourceCardNumber).toBe("ST32-002");
    }
  });

  covers("ST32-002", "[On Play]");
  it("reads Oden's ceiling as the printed cost, not a giant's raised one", () => {
    let state = scenario();
    state.players.p1.hand = [card("oden", "ST32-002")];
    state.players.p1.deck = [card("draw", "OP12-023")];
    // OP17-089 Jaguar.D.Saul is printed at 4 and carries a static +12, so its
    // effective cost is 16 -- above the ceiling, while its base cost is not.
    state.players.p2.board = [character("saul", "OP17-089")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "oden",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "saul",
      ),
    );
    expect(state.players.p2.board[0]?.cannotRestUntilTurn).toBe(4);
  });

  covers("ST32-003", "[On Play]", "[Your Turn]");
  it("free-plays with Mihawk and filters its rest trigger through hand", () => {
    let state = scenario();
    state.players.p1.hand = [
      card("mihawk", "ST32-003"),
      card("perona", "OP10-036"),
    ];
    state.players.p1.deck = [card("draw", "OP12-023")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "mihawk",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "perona",
      ),
    );
    state.players.p1.board.find(
      (entry) => entry.instanceId === "mihawk",
    )!.playedTurn = 1;
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.attackerInstanceId === "mihawk",
      ),
    );
    expect(state.pendingEffect?.kind).toBe("draw-trash");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "draw",
      ),
    );
    expect(state.phase).toBe("block");
    expect(state.activePlayer).toBe("p2");
  });

  covers("ST32-004", "[On Play]", "static");
  covers("OP10-036", "[Your Turn]");
  it("rests two Characters with Rayleigh, refunds DON with Perona, and grants only Rush: Character", () => {
    let state = scenario();
    state.players.p1.hand = [card("rayleigh", "ST32-004")];
    state.players.p1.board = [character("perona", "OP10-036")];
    state.players.p2.board = [
      character("target-a", "FIX-001"),
      character("target-b", "FIX-002"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "rayleigh",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target-a",
      ),
    );
    expect(state.players.p1.activeDon).toHaveLength(7);
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target-b",
      ),
    );
    const attackTargets = getLegalActions(state, "p1").flatMap((action) =>
      action.type === "attack" && action.attackerInstanceId === "rayleigh"
        ? [action.targetInstanceId]
        : [],
    );
    expect(attackTargets).toEqual(
      expect.arrayContaining(["target-a", "target-b"]),
    );
    expect(attackTargets).not.toContain("p2-leader");
  });

  covers("OP12-026", "[Activate: Main]");
  covers("OP12-031", "[On Play]");
  covers("ST24-005", "[On Play]");
  it("uses Kuina, Tashigi, and X.Drake DON timing", () => {
    let state = scenario();
    state.players.p1.board = [
      character("kuina", "OP12-026"),
      character("perona", "OP10-036"),
    ];
    state.players.p1.restedDon = ["r1", "r2", "r3", "r4"];
    state.players.p2.board = [character("target", "FIX-002")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-main:kuina",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(state.players.p1.leaderAttachedDon).toHaveLength(3);
    expect(state.players.p2.board[0]?.rested).toBe(true);

    state = scenario();
    state.players.p1.hand = [card("tashigi", "OP12-031")];
    state.players.p2.board = [character("target", "FIX-002")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "tashigi",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(state.players.p1.leaderAttachedDon).toHaveLength(3);
    expect(state.players.p2.board[0]?.rested).toBe(true);

    state = scenario();
    state.players.p1.hand = [card("drake", "ST24-005")];
    state.players.p2.board = [character("target", "FIX-002")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "drake",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );
    expect(state.players.p1.activateDonAtEndOfTurn).toBe(1);
    const before = state.players.p1.activeDon.length;
    state = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    expect(state.players.p1.activeDon).toHaveLength(before + 1);
  });

  covers("OP12-026", "[Activate: Main]");
  it("offers Kuina against an empty board, where only the DON!! half pays", () => {
    // "Up to 1" makes declining legal, and it is the only way to reach the
    // DON!! half against an empty board. The rest target is a choice inside
    // the activation now, so the offer itself is the same one either way --
    // the register this replaced spelled the declined target into the id.
    const state = scenario();
    state.players.p1.board = [character("kuina", "OP12-026")];
    expect(
      getLegalActions(state, "p1")
        .filter((action) => action.type === "activate-main")
        .map((action) => action.optionId),
    ).toEqual(["mechanic-main:kuina"]);

    state.players.p2.board = [character("target", "FIX-002")];
    expect(
      getLegalActions(state, "p1")
        .filter((action) => action.type === "activate-main")
        .map((action) => action.optionId),
    ).toEqual(["mechanic-main:kuina"]);
  });

  covers("OP12-027", "static");
  covers("OP15-036", "[On Play]");
  it("lets Koushirou replace Ryuma's effect K.O.", () => {
    let state = scenario();
    state.players.p1.hand = [card("ryuma", "OP15-036")];
    state.players.p2.board = [
      character("slash", "ST31-003", { rested: true }),
      character("koushirou", "OP12-027"),
    ];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "ryuma",
      ),
    );
    // Ryuma's controller picks the target; Koushirou's controller then decides
    // whether the replacement applies. The replacement is no longer offered in
    // the same list as the target, because it is not the same player's choice.
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "slash",
      ),
    );
    expect(state.activePlayer).toBe("p2");
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === "mechanic:slash:koushirou",
      ),
    );
    expect(state.players.p2.board.map((entry) => entry.instanceId)).toContain(
      "slash",
    );
    expect(
      state.players.p2.board.find((entry) => entry.instanceId === "koushirou")
        ?.rested,
    ).toBe(true);
  });

  it("returns attached DON!! when Ryuma K.O.s a Character", () => {
    let state = scenario();
    state.players.p1.hand = [card("ryuma", "OP15-036")];
    state.players.p2.board = [
      character("target", "ST31-003", {
        rested: true,
        attachedDon: ["target-don-1", "target-don-2"],
      }),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "ryuma",
      ),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "resolve-effect" && action.optionId === "target",
      ),
    );

    expect(state.players.p2.board).toEqual([]);
    expect(state.players.p2.restedDon).toEqual([
      "target-don-1",
      "target-don-2",
    ]);
  });

  it("enters the Block step when Ryuma attacks without a K.O. target", () => {
    let state = scenario();
    state.players.p1.board = [
      character("ryuma", "OP15-036", { playedTurn: state.turn - 1 }),
    ];

    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "ryuma" &&
          action.targetInstanceId === "p2-leader",
      ),
    );

    expect(state.phase).toBe("block");
    expect(state.activePlayer).toBe("p2");
    expect(state.activeAttack).toMatchObject({
      attackerInstanceId: "ryuma",
      targetInstanceId: "p2-leader",
    });
  });

  covers("OP12-028", "[Activate: Main]");
  covers("OP12-020", "[Activate: Main]");
  covers("OP12-039", "[Main]", "[Trigger]");
  it("searches with Hiyori and restands Zoro through Leader and Event effects", () => {
    let state = scenario();
    state.players.p1.board = [character("hiyori", "OP12-028")];
    state.players.p1.deck = [
      card("slash", "OP12-023"),
      card("event", "OP12-039"),
      card("red", "ST31-001"),
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
    expect(
      getLegalActions(state, "p1").some(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "slash",
      ),
    ).toBe(true);

    state = scenario();
    state.players.p2.board = [
      character("battle-target", "FIX-002", { rested: true }),
    ];
    state.players.p1.leaderAttachedDon = ["a", "b", "c"];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "battle-target",
      ),
    );
    state = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    state = submit(
      state,
      requireAction(state, (action) => action.type === "pass"),
    );
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-main:p1-leader",
      ),
    );
    expect(state.players.p1.leaderRested).toBe(false);
    state.players.p1.leaderRested = true;
    state.players.p1.hand = [card("event", "OP12-039")];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "activate-main" &&
          action.optionId === "mechanic-event:event",
      ),
    );
    expect(state.players.p1.leaderRested).toBe(false);
    expect(state.players.p1.trash).toContainEqual(card("event", "OP12-039"));

    state = scenario();
    state.phase = "trigger";
    state.pendingTrigger = {
      playerId: "p1",
      card: card("life-event", "OP12-039"),
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
          action.type === "resolve-trigger" && action.optionId === "p1-leader",
      ),
    );
    expect(state.players.p1.leaderPowerModifiers).toContainEqual(
      expect.objectContaining({ amount: 1000, expiresAtTurn: 3 }),
    );
  });

  it.each(["st31-vs-st32", "test"])(
    "plays a complete ST31 vs ST32 match through GameService (%s)",
    async (seed) => {
      const service = new GameService();
      let observation = service.create({
        p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
        p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
        seed,
      });
      const agents = {
        p1: new St31RulesAgent(),
        p2: new St32RulesAgent(),
      };
      let steps = 0;
      while (observation.phase !== "finished" && steps < 800) {
        const action =
          await agents[observation.activePlayer].chooseAction(observation);
        observation = service.act(
          observation.gameId,
          observation.revision,
          action.actionId,
        );
        steps += 1;
      }
      expect(observation.phase).toBe("finished");
      expect(observation.winner).not.toBeNull();
      expect(observation.resultReason).toMatch(/life|deck-exhaustion/);
      expect(steps).toBeLessThan(800);
    },
  );
});
