import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  createOnPlayEffect,
  GameService,
  getLegalActions,
  observe,
  type BoardCard,
  type GameState,
} from "@one-piece-sim/engine-core";
import {
  LEADERS,
  policiesForDeck,
  policyContext,
  St31RulesAgent,
  St32RulesAgent,
  St33RulesAgent,
  St34RulesAgent,
  St35RulesAgent,
  St36RulesAgent,
  type Agent,
} from "@one-piece-sim/agents/local";

import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { resolveDeck } from "@one-piece-sim/decks";
import { setTurnPlayer } from "./support/index.js";

const opponents = [
  "(Red) Monkey.D.Luffy - Starter Deck 31",
  "(Green) Roronoa Zoro - Starter Deck 32",
  "(Blue) Kuzan - Starter Deck 33",
  "(Purple) Charlotte Katakuri - Starter Deck 34",
  "(Red/Black) Sabo - Starter Deck 35",
  "(Yellow) Eustass Kid - Starter Deck 36",
] as const;
type DeckId = (typeof opponents)[number];

const character = (instanceId: string, cardNumber: string): BoardCard => ({
  instanceId,
  cardNumber,
  rested: false,
  playedTurn: 1,
  attachedDon: [],
  powerModifiers: [],
});

function submit(state: GameState, actionId: string): GameState {
  const legalAction = getLegalActions(state, state.activePlayer).find(
    (action) => action.actionId === actionId,
  );
  if (!legalAction) throw new Error(`MISSING_ACTION: ${actionId}`);
  return applyAction(state, {
    ...legalAction,
    revision: state.revision,
  }).state;
}

function policyState(): GameState {
  let state = createGame({
    gameId: "st35-policy",
    p1: resolveDeck("(Red/Black) Sabo - Starter Deck 35"),
    p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    seed: "st35-policy",
  });
  for (let index = 0; index < 2; index += 1) {
    const keep = getLegalActions(state, state.activePlayer).find(
      (action) =>
        action.type === "mulligan-decision" && action.decision === "keep",
    );
    if (!keep) throw new Error("MISSING_KEEP");
    state = submit(state, keep.actionId);
  }
  state.turn = 5;
  state.phase = "main";
  setTurnPlayer(state, "p1");
  return state;
}

/**
 * The DON!! pool a turn-5 position would actually hold.
 *
 * `policyState` sets `turn` by hand, which never runs a Refresh, so the pool
 * stays at the one card the opening deal left -- and OP13-019's activation is
 * offered only at five or more active DON!!.
 */
function withDon(state: GameState, active: number): GameState {
  const pool = state.players.p1.donDeck.splice(0, active);
  state.players.p1.activeDon = [...state.players.p1.activeDon, ...pool];
  return state;
}

/**
 * The same position with only one kind of decision on offer.
 *
 * Every rule in `ST35_RULES` is a `rank` within one action type or a `veto` of
 * one action, so what each claims is "of these candidates, this one" -- never
 * "developing beats attaching DON!! right now", which is a cross-type judgement
 * no `rank` can express. Asserting the whole band's chosen action would test the
 * format fundamentals instead, and they legitimately prefer an attachment in a
 * turn-5 position with six DON!! down.
 */
function offering(
  observation: GameObservation,
  keep: (type: LegalAction["type"]) => boolean,
): GameObservation {
  return {
    ...observation,
    legalActions: observation.legalActions.filter((action) =>
      keep(action.type),
    ),
  };
}

function agentFor(deckId: DeckId): Agent {
  if (deckId === "(Red) Monkey.D.Luffy - Starter Deck 31")
    return new St31RulesAgent();
  if (deckId === "(Green) Roronoa Zoro - Starter Deck 32")
    return new St32RulesAgent();
  if (deckId === "(Blue) Kuzan - Starter Deck 33") return new St33RulesAgent();
  if (deckId === "(Purple) Charlotte Katakuri - Starter Deck 34")
    return new St34RulesAgent();
  if (deckId === "(Red/Black) Sabo - Starter Deck 35")
    return new St35RulesAgent();
  return new St36RulesAgent();
}

async function runMatch(p1Deck: DeckId, p2Deck: DeckId, seed: string) {
  const service = new GameService();
  let observation = service.create({
    p1: resolveDeck(p1Deck),
    p2: resolveDeck(p2Deck),
    seed,
  });
  const agents = { p1: agentFor(p1Deck), p2: agentFor(p2Deck) };
  let actions = 0;
  while (observation.phase !== "finished" && actions < 500) {
    const action =
      await agents[observation.activePlayer].chooseAction(observation);
    observation = service.act(
      observation.gameId,
      observation.revision,
      action.actionId,
    );
    actions += 1;
  }
  return { observation, actions };
}

describe("ST35 matchup smoke tests", () => {
  it("pays Karasu's deck cost only when it forces a discard", async () => {
    const agent = new St35RulesAgent();
    for (const opponentHandSize of [5, 7]) {
      let state = policyState();
      state.players.p1.board = [character("karasu", "ST35-003")];
      state.players.p2.hand = state.players.p2.deck.splice(0, opponentHandSize);
      const attack = getLegalActions(state, "p1").find(
        (action) =>
          action.type === "attack" &&
          action.attackerInstanceId === "karasu" &&
          action.targetInstanceId === "p2-leader",
      );
      if (!attack) throw new Error("MISSING_KARASU_ATTACK");
      state = submit(state, attack.actionId);

      const action = await agent.chooseAction(observe(state, "p1"));

      expect(action).toMatchObject({
        type: "resolve-effect",
        optionId: opponentHandSize >= 7 ? "apply" : "skip",
      });
    }
  });

  it("skips Belo Betty's deck cost without a cost-based follow-up", async () => {
    let state = policyState();
    state.players.p1.board = [character("betty", "OP12-090")];
    state.players.p2.board = [character("target", "ST31-001")];
    const attack = getLegalActions(state, "p1").find(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "betty" &&
        action.targetInstanceId === "p2-leader",
    );
    if (!attack) throw new Error("MISSING_BETTY_ATTACK");
    state = submit(state, attack.actionId);

    const action = await new St35RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "skip" });
  });

  it("preserves Life when P-105 cannot move rested DON", async () => {
    const state = policyState();
    const sabo = character("sabo", "P-105");
    state.players.p1.board = [sabo];
    state.players.p1.life = state.players.p1.deck.splice(0, 3);
    state.players.p1.restedDon = [];
    state.pendingEffect = createOnPlayEffect(state, "p1", sabo).pending;

    const action = await new St35RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({ type: "resolve-effect", optionId: "skip" });
  });

  /**
   * p2 attacking one of ST35's Characters with an exactly-matching body, so the
   * shortfall is 1 and `economicalCharacterSave` is satisfied; a 2000-Counter
   * sits in ST35's hand. Whether it gets spent is then purely a question of
   * whether the target is in `ST35_PROTECTED_CARDS`.
   *
   * No DON!! is given to the Leader, so Sabo's `[DON!! x1]` aura is off and both
   * defenders read their printed 5000.
   */
  function counteringFor(defender: string): GameState {
    let state = policyState();
    setTurnPlayer(state, "p2");
    // Rested, because only a rested Character is a legal attack target.
    state.players.p1.board = [
      { ...character("defender", defender), rested: true },
    ];
    state.players.p1.hand = [
      { instanceId: "counter-card", cardNumber: "ST35-002" },
    ];
    state.players.p2.board = [character("chopper", "P-101")];
    const attack = getLegalActions(state, "p2").find(
      (action) =>
        action.type === "attack" &&
        action.attackerInstanceId === "chopper" &&
        action.targetInstanceId === "defender",
    );
    if (!attack) throw new Error("MISSING_ATTACK");
    state = submit(state, attack.actionId);
    const declineBlock = getLegalActions(state, "p1").find(
      (action) => action.type === "pass",
    );
    if (!declineBlock) throw new Error("MISSING_BLOCK_PASS");
    return submit(state, declineBlock.actionId);
  }

  it("spends a Counter card to keep an aura enabler alive", async () => {
    // OP12-093 Morley is printed at cost 4 and reaches the cost 8 that switches
    // on Sabo's team-wide +1000 only through its own static `+4 cost`, so the
    // body on the field is the aura. Before the deck passed a protected set at
    // all, `chooseGenericCounter` defaulted to an empty one and this was a pass.
    const action = await new St35RulesAgent().chooseAction(
      observe(counteringFor("OP12-093"), "p1"),
    );

    expect(action).toMatchObject({
      type: "counter",
      cardInstanceId: "counter-card",
    });
  });

  it("does not spend one on a replaceable body", async () => {
    // OP13-005 Inazuma has the same 5000 power and the same 2000 Counter, and is
    // not an aura enabler -- so the identical battle resolves the other way.
    const action = await new St35RulesAgent().chooseAction(
      observe(counteringFor("OP13-005"), "p1"),
    );

    expect(action).toMatchObject({ type: "pass" });
  });

  /**
   * OP13-019's `[Main]` rests four DON!! for a −3000 and a K.O. of 3000 or
   * less, and the engine offers it only at five or more active DON!!. So the
   * question the rule answers is whether anything is in range at all; 6000 is
   * the ceiling, since the two halves may name different Characters.
   */
  /** ST31-004 Monkey.D.Luffy's printed power, the figure the modifier adjusts. */
  const TARGET_PRINTED_POWER = 9_000;

  function aceEventState(targetPower: number): GameState {
    const state = withDon(policyState(), 6);
    state.players.p1.hand = [
      { instanceId: "ace-event", cardNumber: "OP13-019" },
    ];
    state.players.p2.board = [
      {
        ...character("target", "ST31-004"),
        powerModifiers: [
          { amount: targetPower - TARGET_PRINTED_POWER, expiresAtTurn: 99 },
        ],
      },
    ];
    return state;
  }

  it("rests four DON!! for Ace's removal only with something in range", async () => {
    const inRange = offering(observe(aceEventState(6_000), "p1"), (type) =>
      ["activate-main", "pass"].includes(type),
    );
    expect(
      inRange.legalActions.some(
        (action) =>
          action.type === "activate-main" &&
          action.sourceCardNumber === "OP13-019",
      ),
      "the engine should offer the activation at five or more active DON!!",
    ).toBe(true);

    const action = await new St35RulesAgent().chooseAction(inRange);

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP13-019",
    });
  });

  it("does not rest four DON!! with nothing the K.O. can reach", async () => {
    const action = await new St35RulesAgent().chooseAction(
      offering(observe(aceEventState(9_000), "p1"), (type) =>
        ["activate-main", "pass"].includes(type),
      ),
    );

    // With the activation vetoed and nothing else on offer, ending the turn is
    // the survivor -- which is the veto's whole claim: those four DON!! stay
    // active, and the Event stays in hand for its `[Counter]` half.
    expect(action).toMatchObject({ type: "pass" });
  });

  it("recycles with Koala rather than spending Ace's four DON!!, and aims the DON!! at the Leader", async () => {
    // Both activations offered at once, which is the position the old ladder's
    // "Koala before Ace, and never the other way round" comment was about: the
    // two used to share one unordered `find` and the Event always won it.
    const state = aceEventState(6_000);
    state.players.p1.board = [character("koala", "OP13-081")];
    state.players.p1.trash = state.players.p1.deck.splice(0, 1);
    state.players.p1.restedDon = state.players.p1.activeDon.splice(0, 1);

    const action = await new St35RulesAgent().chooseAction(
      observe(state, "p1"),
    );

    expect(action).toMatchObject({
      type: "activate-main",
      sourceCardNumber: "OP13-081",
    });
    // The `[DON!! x1]` aura reads DON!! on the *Leader*; a DON!! given to a
    // Character does not satisfy it. The recipient is a choice the activation
    // opens, so aiming it is the second half of the rule.
    let next = applyAction(state, {
      ...action,
      revision: state.revision,
    }).state;
    while (
      getLegalActions(next, "p1").every(
        (candidate) =>
          candidate.type !== "resolve-effect" ||
          candidate.optionId !== "p1-leader",
      )
    ) {
      const cost = await new St35RulesAgent().chooseAction(observe(next, "p1"));
      next = applyAction(next, { ...cost, revision: next.revision }).state;
    }
    const gift = await new St35RulesAgent().chooseAction(observe(next, "p1"));
    expect(gift).toMatchObject({
      type: "resolve-effect",
      optionId: "p1-leader",
    });
  });

  it("lands the cost-8 body the aura needs ahead of a bigger non-enabler", async () => {
    // OP13-017 Monkey.D.Dragon is the deck's biggest body at 7000 and is *not*
    // an enabler: printed at 6 with no static cost text, it stops at 6. OP12-093
    // Morley is a 5000 printed at 4 that reaches 8 through its own `+4 cost`, so
    // it is the play that switches the Leader's team-wide +1000 on. Power alone
    // picks Dragon; this is the one claim the old CARD_PRIORITY table encoded.
    const state = withDon(policyState(), 6);
    state.players.p1.hand = [
      { instanceId: "dragon", cardNumber: "OP13-017" },
      { instanceId: "morley", cardNumber: "OP12-093" },
    ];

    const action = await new St35RulesAgent().chooseAction(
      offering(observe(state, "p1"), (type) => type === "play-card"),
    );

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "morley",
    });
  });

  it("develops the biggest body once the aura is already switched on", async () => {
    // Same hand, but a cost-8 Morley is already on the field, so the aura's
    // Character half is satisfied and a second enabler adds nothing. The gate
    // closes and the total-order power rule takes over.
    const state = withDon(policyState(), 6);
    state.players.p1.board = [character("enabler", "OP12-093")];
    state.players.p1.hand = [
      { instanceId: "dragon", cardNumber: "OP13-017" },
      { instanceId: "morley", cardNumber: "OP12-093" },
    ];

    const action = await new St35RulesAgent().chooseAction(
      offering(observe(state, "p1"), (type) => type === "play-card"),
    );

    expect(action).toMatchObject({
      type: "play-card",
      cardInstanceId: "dragon",
    });
  });

  it("applies none of its rules to the other OP13-004 deck", async () => {
    // OP13-004 fronts two shipped decks and `registerPolicy` keys on the
    // Leader, so an ungated rule list pilots the OP-17 Elbaph list as well.
    // Ungated it did, and measurably: the ST-35 mirror column moves the wrong
    // way, because the *opponent* seat picks these rules up on top of
    // `op13-sabo`'s. The
    // gate is asserted on the modules rather than on a chosen action, because
    // what went wrong was scope and not a preference. OP17-091 is one of the
    // cards that identify that list.
    const elbaph = policyState();
    elbaph.players.p1.hand = [{ instanceId: "elbaph", cardNumber: "OP17-091" }];
    const context = policyContext(observe(elbaph, "p1"));
    const applicable = policiesForDeck(LEADERS.ST35)
      .filter((module) => module.applies?.(context) ?? true)
      .map((module) => module.id);

    expect(applicable.filter((id) => id.startsWith("st35#"))).toEqual([]);
    // `st35-defense` carries its own guard instead of an `applies`, the same
    // shape the whole ladder used to have, so it stays in the applicable list
    // and declines when asked.
    const defense = policiesForDeck(LEADERS.ST35).find(
      (module) => module.id === "st35-defense",
    );
    expect(defense?.decide?.(context)).toBeUndefined();
    // And the gate is a gate, not a blanket: ST-35's own hand keeps them all.
    const own = policyContext(observe(policyState(), "p1"));
    expect(
      policiesForDeck(LEADERS.ST35)
        .filter((module) => module.applies?.(own) ?? true)
        .map((module) => module.id)
        .filter((id) => id.startsWith("st35#")),
    ).toHaveLength(8);
  });

  it("completes against every format deck in both seats", async () => {
    for (const opponent of opponents) {
      for (const st35First of [true, false]) {
        const p1Deck = st35First
          ? "(Red/Black) Sabo - Starter Deck 35"
          : opponent;
        const p2Deck = st35First
          ? opponent
          : "(Red/Black) Sabo - Starter Deck 35";
        const seed = `st35-${opponent}-${st35First ? "first" : "second"}`;
        const { observation, actions } = await runMatch(p1Deck, p2Deck, seed);
        expect(observation.phase, seed).toBe("finished");
        expect(observation.winner, seed).not.toBeNull();
        expect(actions, seed).toBeLessThan(500);
      }
    }
  });
});
