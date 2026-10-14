import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  GameService,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import { St31RulesAgent, St32RulesAgent } from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";
import { fabricatedAttack, setTurnPlayer } from "./support/index.js";

const card = (instanceId: string, cardNumber: string) => ({
  instanceId,
  cardNumber,
});

const character = (
  instanceId: string,
  cardNumber: string,
  options: { rested?: boolean; playedTurn?: number } = {},
) => ({
  instanceId,
  cardNumber,
  rested: options.rested ?? false,
  playedTurn: options.playedTurn ?? 1,
  attachedDon: [],
  powerModifiers: [],
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
    gameId: "policy-game",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
    seed: "policy-seed",
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
  state.turn = 6;
  state.phase = "main";
  setTurnPlayer(state, activePlayer);
  state.pendingEffect = null;
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

// Neither deck has a matchup module for the other any more -- both measured as
// washes and were removed. These cases stay because the behaviour they pin is
// still required; they now exercise the ST31 and ST32 *deck* policies in the
// matchup that used to be intercepted, which is exactly the containment check
// `.claude/skills/audit-deck-policy/SKILL.md` section 8 asks for.
describe("ST31 and ST32 deck policies in the ST31 vs ST32 matchup", () => {
  it("attacks with a powered active Zoro before playing Kin'emon", async () => {
    const state = matchupState("p2");
    state.players.p2.hand = [card("kinemon", "ST32-001")];
    state.players.p2.activeDon = ["active"];
    state.players.p2.leaderAttachedDon = [
      "attached-1",
      "attached-2",
      "attached-3",
    ];
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
  });

  it("skips Kin'emon instead of resting an active Leader", async () => {
    const state = matchupState("p2");
    state.pendingEffect = {
      kind: "kinemon-cost",
      playerId: "p2",
      sourceCardNumber: "ST32-001",
      sourceInstanceId: "kinemon",
    };
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      effectKind: "kinemon-cost",
      optionId: "skip",
    });
  });

  it("does not make a futile 2000 attack into a 5000 Leader", async () => {
    const state = matchupState("p2");
    state.players.p2.leaderRested = true;
    state.players.p2.board = [character("small-zoro", "ST32-005")];
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({ type: "pass" });
  });

  it("uses Counter when the remaining attack count otherwise exceeds Life", async () => {
    const state = matchupState("p2");
    state.turn = 9;
    state.phase = "counter";
    setTurnPlayer(state, "p2");
    state.players.p2.life = [
      card("life-a", "ST32-002"),
      card("life-b", "ST32-002"),
    ];
    state.players.p2.hand = [
      card("counter-a", "OP10-036"),
      card("counter-b", "ST32-002"),
      card("counter-c", "ST32-004"),
      card("counter-d", "ST32-002"),
    ];
    state.players.p1.leaderRested = true;
    state.players.p1.board = [
      character("future-a", "ST31-001"),
      character("future-b", "ST31-002"),
      character("future-c", "OP14-015"),
    ];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
      attackPower: 6000,
      counterPower: 0,
    });
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action.type).toBe("counter");
  });

  it("uses one 2000 Counter instead of starting a two-card defense", async () => {
    const state = matchupState("p2");
    state.phase = "counter";
    state.players.p2.life = [];
    state.players.p2.hand = [
      card("counter-1000", "OP10-036"),
      card("counter-2000", "ST32-005"),
    ];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "p2-leader",
      attackPower: 6000,
      counterPower: 0,
    });
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "counter",
      cardInstanceId: "counter-2000",
    });
  });

  it("does not spend several cards protecting Kuina", async () => {
    const state = matchupState("p2");
    state.phase = "counter";
    state.players.p2.board = [character("kuina", "OP12-026", { rested: true })];
    state.players.p2.hand = [
      card("counter-a", "OP10-036"),
      card("counter-b", "ST32-001"),
      card("counter-c", "ST32-002"),
      card("counter-d", "ST32-004"),
      card("counter-e", "OP12-028"),
    ];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "kuina",
      attackPower: 5000,
      counterPower: 0,
    });
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({ type: "pass" });
  });

  it("uses one card to preserve Ryuma when life is comfortable", async () => {
    const state = matchupState("p2");
    state.phase = "counter";
    state.players.p2.life = [
      card("life-a", "ST32-002"),
      card("life-b", "ST32-002"),
      card("life-c", "ST32-002"),
    ];
    state.players.p2.board = [character("ryuma", "OP15-036", { rested: true })];
    state.players.p2.hand = [card("counter", "OP10-036")];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerInstanceId: "p1-leader",
      targetInstanceId: "ryuma",
      attackPower: 8000,
      counterPower: 0,
    });
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "counter",
      cardInstanceId: "counter",
    });
  });

  it("pressures Zoro's Leader instead of a disposable rested searcher", async () => {
    const state = matchupState("p1");
    state.players.p1.board = [character("attacker", "OP11-003")];
    state.players.p2.board = [
      character("hiyori", "OP12-028", { rested: true }),
    ];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "attack",
      targetInstanceId: "p2-leader",
    });
  });

  it("develops Nami instead of spending the only DON!! on Leader", async () => {
    const state = matchupState("p1");
    state.turn = 1;
    state.players.p1.activeDon = ["active"];
    state.players.p1.hand = [card("nami", "OP01-016")];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "nami",
    });
    // The reservation now comes from the format-wide `don-reservation` rule
    // rather than this matchup's own branch, so the explanation names the
    // fundamental instead of the matchup.
    expect(agent.lastDecision?.reasons.join(" ")).toContain(
      "Develop before powering up",
    );
  });

  it("opens the Leader's gift to unlock Franky's attack threshold", async () => {
    const state = matchupState("p1");
    state.players.p1.board = [
      character("nami", "OP01-016"),
      character("franky", "OP11-012"),
    ];
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.restedDon = ["rested-a", "rested-b"];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      optionId: "mechanic-main:p1-leader",
    });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("attack");
  });

  it("gives a newly played Sanji two rested DON!! to enable Rush", async () => {
    const state = matchupState("p1");
    state.players.p1.board = [
      character("sanji", "ST31-001", { playedTurn: state.turn }),
    ];
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.restedDon = ["rested-a", "rested-b"];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "activate-main",
      optionId: "mechanic-main:p1-leader",
    });
    // Which Character the gift lands on is the decision the activation opens,
    // so Rush is what the *next* decision is about.
    const activated = applyAction(state, {
      ...action,
      revision: state.revision,
    }).state;
    const aimed = await agent.chooseAction(observe(activated, "p1"));
    expect(aimed).toMatchObject({ type: "resolve-effect", optionId: "sanji" });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("Rush");
  });

  it("scores an older Sanji normally instead of as a Rush prerequisite", async () => {
    const state = matchupState("p1");
    state.players.p1.board = [
      character("sanji", "ST31-001", { playedTurn: state.turn - 1 }),
    ];
    state.players.p1.leaderAttachedDon = ["leader-don"];
    state.players.p1.restedDon = ["rested-a", "rested-b"];
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({ optionId: "mechanic-main:p1-leader" });
    expect(agent.lastDecision?.reasons.join(" ")).toContain("attack");
    expect(agent.lastDecision?.reasons.join(" ")).not.toContain("Rush");
  });

  it("distinguishes search cards that share the same name", async () => {
    const state = matchupState("p1");
    state.pendingEffect = {
      kind: "search-top-five",
      playerId: "p1",
      sourceCardNumber: "OP01-016",
      sourceInstanceId: "nami",
      revealed: [
        card("cheap-luffy", "ST23-004"),
        card("rush-luffy", "ST31-004"),
      ],
      eligibleInstanceIds: ["cheap-luffy", "rush-luffy"],
    };
    const agent = new St31RulesAgent();

    const action = await agent.chooseAction(observe(state, "p1"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "search-select:rush-luffy",
      optionCardNumber: "ST31-004",
    });
  });

  it("exposes public trash and effect metadata without leaking hidden zones", () => {
    const state = matchupState("p1");
    state.players.p1.trash = [card("self-trash", "OP01-016")];
    state.players.p2.trash = [card("opponent-trash", "OP12-028")];
    state.players.p1.hand = [card("trash-choice", "ST23-004")];
    state.players.p2.hand = [card("hidden", "OP15-036")];
    state.pendingEffect = {
      kind: "draw-trash",
      playerId: "p1",
      sourceCardNumber: "ST31-001",
      sourceInstanceId: "sanji",
      trashCount: 1,
    };

    const observation = observe(state, "p1");
    const effect = observation.legalActions[0];

    expect(observation.self.trash).toEqual([
      { cardNumber: "OP01-016", name: "Nami" },
    ]);
    expect(observation.opponent.trash).toEqual([
      { cardNumber: "OP12-028", name: "Kouzuki Hiyori" },
    ]);
    expect(effect).toMatchObject({
      type: "resolve-effect",
      effectKind: "draw-trash",
      sourceCardNumber: "ST31-001",
    });
    expect(JSON.stringify(observation.opponent)).not.toContain("OP15-036");
  });

  it("completes a deterministic matchup tournament without policy loops", async () => {
    for (let index = 0; index < 20; index += 1) {
      const service = new GameService();
      let observation = service.create({
        p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
        p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
        seed: `matchup-policy-${index}`,
      });
      const agents = {
        p1: new St31RulesAgent(),
        p2: new St32RulesAgent(),
      };
      let steps = 0;
      while (observation.phase !== "finished" && steps < 300) {
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
      expect(steps, `seed ${index}`).toBeLessThan(300);
    }
  });
});
