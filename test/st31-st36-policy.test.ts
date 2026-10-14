import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  GameService,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  chooseSt31Rules,
  St31RulesAgent,
  St36RulesAgent,
} from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";
import { fabricatedAttack, setTurnPlayer } from "./support/index.js";

const card = (instanceId: string, cardNumber: string, faceUp?: boolean) => ({
  instanceId,
  cardNumber,
  ...(faceUp === undefined ? {} : { faceUp }),
});

const character = (
  instanceId: string,
  cardNumber: string,
  options: {
    rested?: boolean;
    playedTurn?: number;
    blockerUntilTurn?: number;
  } = {},
) => ({
  instanceId,
  cardNumber,
  rested: options.rested ?? false,
  playedTurn: options.playedTurn ?? 1,
  attachedDon: [],
  powerModifiers: [],
  ...(options.blockerUntilTurn === undefined
    ? {}
    : { blockerUntilTurn: options.blockerUntilTurn }),
});

function requireAction(
  state: GameState,
  predicate: (action: LegalAction) => boolean,
): LegalAction {
  const action = getLegalActions(state, state.activePlayer).find(predicate);
  if (!action) throw new Error("MISSING_ACTION");
  return action;
}

function submit(state: GameState, action: LegalAction): GameState {
  return applyAction(state, { ...action, revision: state.revision }).state;
}

function matchupState(activePlayer: "p1" | "p2"): GameState {
  let state = createGame({
    gameId: "st31-st36-policy",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Yellow) Eustass Kid - Starter Deck 36"),
    seed: "st31-st36-policy-seed",
  });
  ["p1", "p2"].forEach(() => {
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "mulligan-decision" && action.decision === "keep",
      ),
    );
  });
  state.turn = 6;
  state.phase = "main";
  setTurnPlayer(state, activePlayer);
  state.pendingEffect = null;
  state.pendingEffectResume = null;
  state.activeAttack = null;
  state.pendingTrigger = null;
  state.oncePerTurn = [];
  for (const playerId of ["p1", "p2"] as const) {
    Object.assign(state.players[playerId], {
      hand: [],
      board: [],
      stage: null,
      trash: [],
      activeDon: [],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
      activateDonAtEndOfTurn: 0,
    });
  }
  return state;
}

describe("ST31 vs ST36 matchup", () => {
  it("uses Sunny's rested DON!! before attaching active DON!! to Leader", () => {
    const state = matchupState("p1");
    state.players.p1.activeDon = ["active-don"];
    state.players.p1.restedDon = ["rested-don"];
    state.players.p1.stage = {
      instanceId: "sunny",
      cardNumber: "ST31-005",
      rested: false,
    };

    const decision = chooseSt31Rules(observe(state, "p1"));

    // The recipient is a choice the activation opens now, so the rule is in two
    // halves: reach Sunny's gift rather than spending active DON!!, then aim it.
    expect(decision?.action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "ST31-005",
    });
    const activated = applyAction(state, {
      ...decision!.action,
      revision: state.revision,
    }).state;
    expect(chooseSt31Rules(observe(activated, "p1"))?.action).toMatchObject({
      type: "resolve-effect",
      optionId: "p1-leader",
    });
  });

  it("replaces a rested Sunny to trigger another search", () => {
    const state = matchupState("p1");
    state.players.p1.activeDon = ["active-don"];
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.stage = {
      instanceId: "sunny",
      cardNumber: "ST31-005",
      rested: true,
    };
    state.players.p1.hand = [card("second-sunny", "ST31-005")];

    const decision = chooseSt31Rules(observe(state, "p1"));

    expect(decision?.action).toMatchObject({
      type: "play-card",
      cardInstanceId: "second-sunny",
    });
  });

  it("completes Luffy's field-wide Rush total on an older attacker", () => {
    const state = matchupState("p1");
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.restedDon = ["rested-1", "rested-2"];
    state.players.p1.board = [
      character("robin", "OP11-009", { playedTurn: 4 }),
      character("rush-luffy", "ST31-004", { playedTurn: 6 }),
    ];

    const decision = chooseSt31Rules(observe(state, "p1"));

    expect(decision?.action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "ST21-001",
    });
    const activated = applyAction(state, {
      ...decision!.action,
      revision: state.revision,
    }).state;
    const aimed = chooseSt31Rules(observe(activated, "p1"));
    expect(aimed?.action).toMatchObject({
      type: "resolve-effect",
      optionId: "robin",
    });
  });

  it("gives a summoning-sick Brook both rested DON!! for its Blocker gate", async () => {
    // Trace `match-7614cb43d2dfd91a` lost this: the Leader gave a just-played
    // Brook one rested DON!! when two were free. ST31-003 reads its
    // `[Opponent's Turn]` Blocker and +3000 off the *field-wide* given-DON!!
    // total, so with one already on the Leader the second gift is the
    // difference between a vanilla 3000 and a 6000 Blocker on the opponent's
    // turn -- and Brook, played this turn, is invisible to any ranking that
    // only prices attackers.
    //
    // The gift is two decisions now: the activation, then the recipient. Both
    // have to land on Brook, so this drives the agent through both.
    let state = matchupState("p1");
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.restedDon = ["rested-1", "rested-2"];
    state.players.p1.board = [
      character("brook", "ST31-003", { playedTurn: state.turn }),
    ];
    const agent = new St31RulesAgent();

    const activation = await agent.chooseAction(observe(state, "p1"));
    expect(activation).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "ST21-001",
    });
    state = submit(state, activation);

    const gift = await agent.chooseAction(observe(state, "p1"));
    expect(gift).toMatchObject({ type: "resolve-effect", optionId: "brook" });
    state = submit(state, gift);

    const brook = state.players.p1.board.find(
      (card) => card.instanceId === "brook",
    );
    expect(brook?.attachedDon).toHaveLength(2);
  });

  it("develops Nami without blocking Sanji's replacement-aware free play", () => {
    const state = matchupState("p1");
    state.players.p1.activeDon = ["active-don"];
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.board = [
      character("brook", "ST31-003", { rested: true }),
      character("robin", "OP11-009", { rested: true }),
      character("chopper", "P-101", { rested: true }),
    ];
    state.players.p1.hand = [
      card("sanji", "ST31-001"),
      card("nami", "OP01-016"),
    ];

    const decision = chooseSt31Rules(observe(state, "p1"));

    expect(decision?.action).toMatchObject({
      type: "play-card",
      cardInstanceId: "nami",
    });
  });

  it("uses the smallest viable attacker to pressure Leader before a rested Character", () => {
    const state = matchupState("p1");
    state.players.p1.board = [character("zoro", "OP14-015")];
    state.players.p2.board = [
      character("bonney", "ST36-003", { rested: true }),
    ];

    const decision = chooseSt31Rules(observe(state, "p1"));

    expect(decision?.action).toMatchObject({
      type: "attack",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
    });
    expect(decision?.reasons.join(" ")).toContain("Pressure");
  });

  it("attacks a rested Character when Leader pressure is not viable", () => {
    const state = matchupState("p1");
    state.players.p1.leaderRested = true;
    state.players.p1.board = [character("brook", "ST31-003")];
    state.players.p2.leaderPowerModifiers = [
      { amount: 2_000, expiresAtTurn: state.turn + 1 },
    ];
    state.players.p2.board = [
      character("ivankov", "OP13-008", { rested: true }),
    ];

    const decision = chooseSt31Rules(observe(state, "p1"));

    expect(decision?.action).toMatchObject({
      type: "attack",
      attackerInstanceId: "brook",
      targetInstanceId: "ivankov",
    });
    expect(decision?.reasons.join(" ")).toContain("rested Character");
  });

  it("exposes a temporary Leader-granted Blocker in observations", () => {
    const state = matchupState("p1");
    state.players.p2.board = [
      character("blocker", "ST36-001", { blockerUntilTurn: state.turn }),
    ];

    expect(observe(state, "p1").opponent.board[0]?.blocker).toBe(true);
  });

  it("does not block for a summoning-sick future attacker", async () => {
    const state = matchupState("p2");
    state.phase = "block";
    // Two Life, so taking the hit does not reach 0. At 1 Life the defender must
    // block regardless of summoning sickness -- see the test below.
    state.players.p2.life = [card("life", "P-088"), card("life-2", "P-088")];
    state.players.p2.board = [
      character("blocker", "ST36-001", { blockerUntilTurn: state.turn }),
    ];
    state.players.p1.leaderRested = true;
    state.players.p1.board = [
      character("new-attacker", "ST31-002", { playedTurn: state.turn }),
    ];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
      attackPower: 5_000,
      counterPower: 0,
    });
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action.type).toBe("pass");
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "Preserve Blockers",
    );
  });

  it("blocks rather than reach 0 Life, even with no attacker left this turn", async () => {
    const state = matchupState("p2");
    state.phase = "block";
    state.players.p2.life = [card("life", "P-088")];
    state.players.p2.board = [
      character("blocker", "ST36-001", { blockerUntilTurn: state.turn }),
    ];
    // Nothing can attack again this turn: the Leader is spent and the only
    // Character is summoning-sick. Both refresh before the defender's Life
    // does, so absorbing this hit trades 1 Life for a turn facing two attacks
    // at 0 Life -- where the first one through ends the game.
    state.players.p1.leaderRested = true;
    state.players.p1.board = [
      character("new-attacker", "ST31-002", { playedTurn: state.turn }),
    ];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
      attackPower: 5_000,
      counterPower: 0,
    });
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action.type).toBe("block");
  });

  it("uses a medium attack before a Rush finisher into ST36 defense", async () => {
    const state = matchupState("p1");
    state.players.p1.board = [
      character("medium", "OP11-003"),
      character("finisher", "OP14-015"),
    ];
    state.players.p2.board = [
      character("blocker", "ST36-001", { blockerUntilTurn: state.turn }),
    ];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "p2-leader",
    });
    expect(action).not.toMatchObject({ attackerInstanceId: "finisher" });
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "Pressure the opposing Leader",
    );
  });

  it("pressures Leader instead of K.O.ing Hawkins or Cavendish", async () => {
    const state = matchupState("p1");
    state.players.p1.board = [character("attacker", "OP11-003")];
    state.players.p2.board = [
      character("hawkins", "OP10-109", { rested: true }),
      character("cavendish", "ST36-001", { rested: true }),
    ];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "p2-leader",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "Pressure the opposing Leader",
    );
  });

  it("attacks a rested ST36 engine before the closing window", async () => {
    const state = matchupState("p1");
    state.players.p1.leaderRested = true;
    state.players.p1.board = [character("zoro", "OP14-015")];
    state.players.p2.life = [
      card("life-1", "ST36-001"),
      card("life-2", "ST36-002"),
    ];
    state.players.p2.board = [character("kid", "ST36-005", { rested: true })];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "kid",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "Remove a rested opposing Blocker or engine",
    );
  });

  it("develops Rush Zoro before beginning its attack sequence", async () => {
    const state = matchupState("p1");
    state.players.p1.hand = [card("zoro", "OP14-015")];
    state.players.p1.activeDon = Array.from(
      { length: 7 },
      (_, index) => `don-${index}`,
    );
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "zoro",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "Prefer a [Rush] body",
    );
  });

  it("reserves the closing DON curve for Rush Luffy", () => {
    const state = matchupState("p1");
    state.players.p2.life = [];
    state.players.p1.hand = [
      card("rush-luffy", "ST31-004"),
      card("nami", "OP01-016"),
      card("sunny", "ST31-005"),
      card("sanji", "ST31-001"),
    ];
    state.players.p1.activeDon = Array.from(
      { length: 8 },
      (_, index) => `don-${index}`,
    );
    state.players.p1.leaderAttachedDon = ["leader-don"];

    const decision = chooseSt31Rules(observe(state, "p1"));

    expect(decision?.action).toMatchObject({
      type: "play-card",
      cardInstanceId: "rush-luffy",
    });
    expect(decision?.reasons.join(" ")).toContain("closing DON");
  });

  it("takes 7-cost Zoro from a search over normal engine priorities", async () => {
    let state = matchupState("p1");
    state.players.p1.hand = [card("nami", "OP01-016")];
    state.players.p1.deck = [
      card("sanji", "ST31-001"),
      card("zoro", "OP14-015"),
      card("jinbe", "ST31-002"),
      card("brook", "ST31-003"),
      card("usopp", "OP11-003"),
    ];
    state.players.p1.activeDon = ["don-1"];
    state = submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "nami",
      ),
    );
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionCardNumber: "OP14-015",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("from the search");
  });

  it("uses Bonney on the highest-value eligible Character", async () => {
    const state = matchupState("p2");
    state.players.p1.board = [
      character("cheap", "OP01-016"),
      character("valuable", "ST31-003"),
    ];
    state.pendingEffect = {
      kind: "move-character-to-life",
      playerId: "p2",
      targetPlayerId: "p1",
      sourceCardNumber: "P-085",
      sourceInstanceId: "bonney",
      eligibleInstanceIds: ["cheap", "valuable"],
    };
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "top:valuable",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("Bonney");
  });

  it("spends the whole curve on the bigger body, Bonney's condition notwithstanding", async () => {
    // This scenario used to pin the opposite answer: play the cost-4 Killer
    // rather than the cost-5 Bonney, because Bonney's [On Play] needs Life
    // parity and here it has none. The `midrange` archetype layer's
    // `play-on-curve` rule now outranks that, and it pays for ST36 on exactly
    // these games -- so the ladder's preference loses to the archetype claim
    // rather than to an accident.
    //
    // What the scenario was really written to catch is unchanged and still
    // holds: five DON!! are spent on a body rather than dribbled away, and the
    // agent does not pass.
    const state = matchupState("p2");
    state.players.p1.board = [character("target", "OP01-016")];
    state.players.p2.hand = [
      card("bonney", "P-085"),
      card("killer", "ST36-002"),
    ];
    state.players.p2.activeDon = ["don-1", "don-2", "don-3", "don-4", "don-5"];
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "bonney",
    });
  });

  it("skips Bonney removal rather than giving a low-Life opponent more Life", async () => {
    const state = matchupState("p2");
    state.players.p1.life = [card("last-life", "ST31-001")];
    state.players.p1.board = [character("valuable", "ST31-003")];
    state.pendingEffect = {
      kind: "move-character-to-life",
      playerId: "p2",
      targetPlayerId: "p1",
      sourceCardNumber: "P-085",
      sourceInstanceId: "bonney",
      eligibleInstanceIds: ["valuable"],
    };
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "skip",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("closing Life");
  });

  it("keeps Law as Counter when the last Life and hand are thin", async () => {
    const state = matchupState("p2");
    state.phase = "trigger";
    state.players.p2.life = [card("last-life", "ST36-001")];
    state.players.p2.hand = [card("counter", "ST36-001")];
    state.players.p1.life = [card("opponent-life", "ST31-001")];
    state.pendingTrigger = {
      playerId: "p2",
      card: card("law", "P-088"),
    };
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
      attackPower: 5_000,
      counterPower: 0,
    });
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "resolve-trigger",
      optionId: "skip",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("2000 Counter");
  });

  it("turns top Life face-up to prepare Kid redirection", async () => {
    const state = matchupState("p2");
    state.players.p2.life = [
      card("top-life", "OP10-101", false),
      card("bottom-life", "P-088", false),
    ];
    state.players.p2.board = [character("kid", "ST36-005")];
    state.players.p2.restedDon = ["rested-don"];
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "activate-main",
      optionId: "mechanic-main:kid",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("redirection");
  });

  it("budgets DON!! for a 7k Leader attack before attacking", async () => {
    let state = matchupState("p2");
    state.players.p2.activeDon = ["don-1", "don-2", "don-3"];
    state.players.p1.life = [
      card("life-1", "ST31-001"),
      card("life-2", "ST31-002"),
    ];
    const agent = new St36RulesAgent();

    const firstAttachment = await agent.chooseAction(observe(state, "p2"));
    expect(firstAttachment).toMatchObject({
      type: "attach-don",
      targetInstanceId: "p2-leader",
    });
    state = submit(state, firstAttachment);

    const secondAttachment = await agent.chooseAction(observe(state, "p2"));
    expect(secondAttachment).toMatchObject({
      type: "attach-don",
      targetInstanceId: "p2-leader",
    });
    state = submit(state, secondAttachment);

    const attack = await agent.chooseAction(observe(state, "p2"));
    expect(attack).toMatchObject({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "smallest effective",
    );
  });

  it("reserves late-game DON!! for Leader pressure before development", async () => {
    const state = matchupState("p2");
    state.turn = 8;
    state.players.p1.life = [
      card("life-1", "ST31-001"),
      card("life-2", "ST31-002"),
    ];
    state.players.p2.hand = [card("bonney", "P-085")];
    state.players.p2.activeDon = ["don-1", "don-2", "don-3", "don-4", "don-5"];
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "attach-don",
      targetInstanceId: "p2-leader",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "before development",
    );
  });

  it("attacks before developing Bonney in the closing window", async () => {
    const state = matchupState("p2");
    state.players.p1.life = [];
    state.players.p2.hand = [card("bonney", "P-085")];
    state.players.p2.activeDon = Array.from(
      { length: 8 },
      (_, index) => `don-${index}`,
    );
    state.players.p2.leaderAttachedDon = [
      "attached-1",
      "attached-2",
      "attached-3",
    ];
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("closing window");
  });

  it("attacks a rested ST31 engine before the closing window", async () => {
    const state = matchupState("p2");
    state.players.p1.life = [
      card("life-1", "ST31-001"),
      card("life-2", "ST31-002"),
      card("life-3", "ST31-003"),
    ];
    state.players.p1.board = [character("jinbe", "ST31-002", { rested: true })];
    state.players.p2.board = [character("attacker", "ST36-005")];
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "jinbe",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("rested ST31");
  });

  it("keeps Leader pressure at two Life instead of diverting into an engine", async () => {
    const state = matchupState("p2");
    state.players.p1.life = [
      card("life-1", "ST31-001"),
      card("life-2", "ST31-002"),
    ];
    state.players.p1.board = [character("jinbe", "ST31-002", { rested: true })];
    state.players.p2.board = [character("attacker", "ST36-005")];
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "p1-leader",
    });
  });

  it("attaches DON!! only to a Character that can still attack", async () => {
    const state = matchupState("p1");
    state.players.p1.activeDon = ["don-1"];
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.leaderRested = true;
    state.players.p1.board = [
      character("spent", "OP14-015", { rested: true }),
      character("ready", "OP11-003"),
    ];
    const action = chooseSt31Rules(observe(state, "p1"))?.action;

    expect(action).toMatchObject({
      type: "attach-don",
      targetInstanceId: "ready",
    });
  });

  it("distributes DON across efficient Leader-pressure thresholds", () => {
    let state = matchupState("p1");
    state.players.p1.activeDon = ["don-1", "don-2"];
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.leaderRested = true;
    state.players.p1.board = [
      character("robin", "OP11-009"),
      character("sanji", "ST31-001"),
    ];
    state.players.p1.board[1]!.attachedDon = ["attached-don"];

    const first = chooseSt31Rules(observe(state, "p1"))?.action;
    expect(first).toMatchObject({
      type: "attach-don",
      targetInstanceId: "robin",
    });
    state = submit(state, first!);

    const second = chooseSt31Rules(observe(state, "p1"))?.action;
    expect(second).toMatchObject({
      type: "attach-don",
      targetInstanceId: "sanji",
    });
  });

  it("does not attach leftover DON!! after its attackers are spent", async () => {
    const state = matchupState("p2");
    state.players.p2.activeDon = ["don-1", "don-2", "don-3"];
    state.players.p2.leaderRested = true;
    const agent = new St36RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action.type).toBe("pass");
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "after all attacks",
    );
  });

  /**
   * The `[On Your Opponent's Attack]` ladder, driven for real rather than
   * fabricated: the redirect is three `resolve-effect` decisions taken by the
   * defender before the Blocker window, and the pay/skip one is asked two
   * decisions before any target is offered.
   */
  async function redirectDecisions(
    state: GameState,
    agent: St36RulesAgent,
  ): Promise<{ state: GameState; reasons: string[] }> {
    let current = state;
    const reasons: string[] = [];
    while (
      current.activePlayer === "p2" &&
      getLegalActions(current, "p2").some(
        (action) =>
          action.type === "resolve-effect" &&
          action.sourceCardNumber === "ST36-005",
      )
    ) {
      const action = await agent.chooseAction(observe(current, "p2"));
      reasons.push(...(agent.lastDecision?.reasons ?? []));
      if (action.type !== "resolve-effect") break;
      current = submit(current, action);
    }
    return { state: current, reasons };
  }

  function attackKid(attackPower: number, kids: string[]): GameState {
    const state = matchupState("p1");
    state.players.p1.leaderAttachedDon = Array.from(
      { length: (attackPower - 5_000) / 1_000 },
      (_, index) => `p1-don-${index}`,
    );
    state.players.p2.life = [
      card("life-top", "P-088", true),
      card("life-bottom", "OP10-109", true),
      card("life-third", "OP10-109", false),
    ];
    // Only a rested Character can be attacked; the redirect can name either.
    state.players.p2.board = kids.map((instanceId) =>
      character(instanceId, "ST36-005", { rested: true }),
    );
    return submit(
      state,
      requireAction(
        state,
        (action) =>
          action.type === "attack" && action.targetInstanceId === kids[0],
      ),
    );
  }

  it("moves an attack that would kill a Kid onto the Leader", async () => {
    const agent = new St36RulesAgent();

    const { state, reasons } = await redirectDecisions(
      attackKid(8_000, ["kid"]),
      agent,
    );

    expect(state.activeAttack?.targetInstanceId).toBe("p2-leader");
    expect(state.players.p2.board).toHaveLength(1);
    // The cost comes off the top of the Life stack, which the Leader's
    // [End of Your Turn] turns face-up again.
    expect(state.players.p2.life[0]).toMatchObject({
      instanceId: "life-top",
      faceUp: false,
    });
    expect(reasons.join(" ")).toContain("Move the attack");
  });

  it("declines a second Kid's redirect once the attack is somewhere better", async () => {
    const agent = new St36RulesAgent();

    const { state } = await redirectDecisions(
      attackKid(8_000, ["kid-a", "kid-b"]),
      agent,
    );

    // The second copy is offered the attack back onto the Character the first
    // one moved it off. Taking it would turn a second Life card face-down to
    // undo the redirect that was just paid for.
    expect(state.activeAttack?.targetInstanceId).toBe("p2-leader");
    expect(state.players.p2.life.filter((life) => life.faceUp)).toHaveLength(1);
  });

  it("leaves an attack its target already survives alone", async () => {
    const agent = new St36RulesAgent();

    const { state, reasons } = await redirectDecisions(
      attackKid(6_000, ["kid"]),
      agent,
    );

    expect(state.activeAttack?.targetInstanceId).toBe("kid");
    expect(state.players.p2.life.filter((life) => life.faceUp)).toHaveLength(2);
    expect(reasons.join(" ")).toContain("Keep the face-up Life card");
  });

  it("completes a deterministic specialized-policy tournament", async () => {
    for (let index = 0; index < 10; index += 1) {
      const service = new GameService();
      let observation = service.create({
        p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
        p2: resolveDeck("(Yellow) Eustass Kid - Starter Deck 36"),
        seed: `st31-st36-policy-${index}`,
        startingPlayer: index % 2 === 0 ? "p1" : "p2",
      });
      const agents = {
        p1: new St31RulesAgent(),
        p2: new St36RulesAgent(),
      };
      let steps = 0;
      while (observation.phase !== "finished" && steps < 400) {
        const action =
          await agents[observation.activePlayer].chooseAction(observation);
        observation = service.act(
          observation.gameId,
          observation.revision,
          action.actionId,
        );
        steps += 1;
      }
      expect(observation.phase, `seed ${index}`).toBe("finished");
      expect(observation.winner, `seed ${index}`).not.toBeNull();
      expect(steps, `seed ${index}`).toBeLessThan(400);
    }
  });
});
