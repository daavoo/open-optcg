import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  observe,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  RegistryRulesAgent,
  St32RulesAgent,
} from "@one-piece-sim/agents/local";
import type { LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

/**
 * ST32's deck policy, which pilots every matchup except ST31.
 *
 * These pin the four judgements the previous version got wrong, each of which
 * cost measurable win rate rather than merely reading oddly. See
 * `analysis/st32-policy-2026-08-08.md` for the numbers.
 *
 * The opponent is ST34 throughout so the ST31 matchup module never intercepts;
 * a Character's card number on the opposing board is independent of that
 * deck list, because the engine resolves card text globally.
 */

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

/** Turn 6 with ST32 on the play and both boards cleared, ready to be posed. */
function st32State(): GameState {
  let state = createGame({
    gameId: "st32-policy",
    p1: resolveDeck("(Purple) Charlotte Katakuri - Starter Deck 34"),
    p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
    seed: "st32-policy-seed",
  });
  for (let seat = 0; seat < 2; seat += 1) {
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
  setTurnPlayer(state, "p2");
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

const don = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

describe("ST32 deck policy", () => {
  it("develops before putting DON!! on the Leader", async () => {
    // Six DON!! pays for Tashigi with one to spare, so the old ladder attached
    // three to the Leader first and then had only three left to develop with.
    const state = st32State();
    state.players.p2.hand = [card("tashigi", "OP12-031")];
    state.players.p2.activeDon = don("p2-don", 6);
    state.players.p1.board = [character("target", "ST34-002")];
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "tashigi",
    });
  });

  /**
   * Ryuma against Tashigi, with each one's clause live in turn.
   *
   * Ryuma already sits at the top of the ordinal value table, so its gate is not
   * what decides "Ryuma or filler" -- it decides Ryuma against the deck's *other*
   * gated engine pieces, which is the only comparison where the rule can pay.
   * The two clauses read opposite states of the same body: Ryuma K.O.s a
   * *rested* Character at cost 4 or less, Tashigi wants an *unrested* one to rest.
   * So one ST34-002 (a cost-4 body) poses the choice both ways.
   */
  function ryumaVersusTashigi(rested: boolean): GameState {
    const state = st32State();
    state.players.p2.hand = [
      card("ryuma", "OP15-036"),
      card("tashigi", "OP12-031"),
    ];
    state.players.p2.activeDon = don("p2-don", 9);
    state.players.p1.board = [character("target", "ST34-002", { rested })];
    return state;
  }

  it("lands Ryuma while a rested body is in K.O. range", async () => {
    const action = await new St32RulesAgent().chooseAction(
      observe(ryumaVersusTashigi(true), "p2"),
    );

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "ryuma",
    });
  });

  it("loads the Leader with Tashigi instead when the body is not rested yet", async () => {
    // The same board with the body active: Ryuma's K.O. has no target, Tashigi
    // has something to rest, and the play flips. That gate is what the rule is
    // worth.
    const action = await new St32RulesAgent().chooseAction(
      observe(ryumaVersusTashigi(false), "p2"),
    );

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "tashigi",
    });
  });

  it("holds Mihawk until its free play has something to bring with it", async () => {
    // ST32-003 Mihawk free-plays a cost-5 follow-up, so it is two bodies for one
    // play -- and a 7000 with no text otherwise. The rule that gates it is the
    // largest single contribution in this deck's play ordering.
    const withFollowUp = st32State();
    withFollowUp.players.p2.hand = [
      card("mihawk", "ST32-003"),
      card("perona", "OP10-036"),
    ];
    withFollowUp.players.p2.activeDon = don("p2-don", 9);

    expect(
      await new St32RulesAgent().chooseAction(observe(withFollowUp, "p2")),
    ).toMatchObject({ type: "play-card", cardInstanceId: "mihawk" });

    // Mihawk outranks Perona on the value table, so with the follow-up in hand
    // the gate and the table agree. Swap the follow-up for a card Mihawk cannot
    // free-play and the gate shuts; Tashigi, which the table ranks above
    // Mihawk, is then the play.
    const alone = st32State();
    alone.players.p2.hand = [
      card("mihawk", "ST32-003"),
      card("tashigi", "OP12-031"),
    ];
    alone.players.p2.activeDon = don("p2-don", 9);
    alone.players.p1.board = [character("restable", "ST34-002")];

    expect(
      await new St32RulesAgent().chooseAction(observe(alone, "p2")),
    ).toMatchObject({ type: "play-card", cardInstanceId: "tashigi" });
  });

  it("does not spend the turn resting a body instead of loading the Leader", async () => {
    // Pins a refutation. The old `scoreSt32Play` gave ST32-004 a +40 bonus
    // whenever an unrested cost-2 body was on the table, which is almost any
    // board -- so the deck reached for cheap filler over Tashigi, whose three
    // rested DON!! to the Leader are permanent where a rest lasts one turn.
    // Priced as its own rule, that bonus is a clear loss, and it is gone.
    const state = st32State();
    state.players.p2.hand = [
      card("tashigi", "OP12-031"),
      card("helmeppo", "ST32-004"),
    ];
    state.players.p2.activeDon = don("p2-don", 9);
    state.players.p1.board = [character("small", "ST34-003")];

    const action = await new St32RulesAgent().chooseAction(
      observe(state, "p2"),
    );

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "tashigi",
    });
  });

  it("pays a cost before activating Kuina, because Kuina spends rested DON!!", async () => {
    // Kuina gives the Leader up to three DON!! *from the rested pool*, so
    // activating it before anything has been paid for gives the Leader nothing.
    const state = st32State();
    state.players.p2.board = [character("kuina", "OP12-026")];
    state.players.p2.hand = [card("kawamatsu", "OP12-023")];
    state.players.p2.activeDon = don("p2-don", 6);
    state.players.p1.board = [character("target", "ST34-002")];
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "kawamatsu",
    });
  });

  it("activates Kuina once there is rested DON!! for it to convert", async () => {
    const state = st32State();
    state.players.p2.board = [character("kuina", "OP12-026")];
    state.players.p2.restedDon = don("p2-rested", 3);
    state.players.p1.board = [character("target", "ST34-002")];
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "activate-main",
      sourceInstanceId: "kuina",
    });
  });

  it("trashes the least valuable card rather than the most expensive one", async () => {
    // Kin'emon draws two and trashes one. Ranking the options by cost answered
    // "which card do I lose?" with "the best one in hand".
    const state = st32State();
    state.players.p2.hand = [
      card("ryuma", "OP15-036"),
      card("kawamatsu", "OP12-023"),
    ];
    state.pendingEffect = {
      kind: "draw-trash",
      playerId: "p2",
      sourceCardNumber: "ST32-001",
      sourceInstanceId: "kinemon",
      trashCount: 1,
    };
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "resolve-effect",
      optionId: "kawamatsu",
    });
  });

  it("battles a Character it cannot beat to earn the Leader restand", async () => {
    // The engine records `battled-character` when the attack is declared, before
    // it compares power, so a lost battle still buys a second Leader attack.
    // A 9000 defender against an 8000 Leader is exactly the case the old
    // viable-attacks filter threw away.
    const state = st32State();
    state.players.p2.leaderAttachedDon = don("p2-attached", 3);
    state.players.p1.board = [
      character("big-luffy", "ST31-004", { rested: true }),
    ];
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "big-luffy",
    });
  });

  it("keeps the restand battle in front of the ladder under the archetype layer", async () => {
    // The same judgement as the test above, asked of the agent the app and the
    // benchmark actually run: `St32RulesAgent` is the deck policy on its own,
    // and the strategy layer only exists on the registry agent. `aggro`'s
    // `press-leader` and `red-aggro`'s `press-unless-lost` both rank the attack
    // on the opposing Leader, and they narrow the candidates *before* the
    // ladder runs -- so the ladder was choosing a Character battle from a list
    // that no longer had one in it.
    //
    // The board is the one from `open-optcg-trace(14).jsonl` at p2's turn 5: a
    // Leader holding its three DON!! at 8000, and one rested 4000 Character
    // with a base cost of 3 -- below the cost 4 that would hand the decision to
    // the format-wide `threat-removal` rule instead.
    const state = st32State();
    state.players.p2.leaderAttachedDon = don("p2-attached", 3);
    state.players.p1.board = [character("robin", "ST26-003", { rested: true })];
    const agent = new RegistryRulesAgent("OP12-020");

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "robin",
    });
  });

  it("takes Life with the Leader when the restand is out of reach", async () => {
    // Same board, but without three DON!! attached there is no ability to earn,
    // so battling a 9000 body would be a rested Leader for nothing.
    const state = st32State();
    state.players.p1.board = [
      character("big-luffy", "ST31-004", { rested: true }),
    ];
    const agent = new St32RulesAgent();

    const action = await agent.chooseAction(observe(state, "p2"));

    expect(action).toMatchObject({
      type: "attack",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
    });
  });
});
