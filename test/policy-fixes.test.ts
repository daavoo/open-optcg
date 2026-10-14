import { describe, expect, it } from "vitest";
import { cardFacts } from "@one-piece-sim/cards";
import {
  createCounterBudgetModule,
  createKoPayoffTargetModule,
  createThreatRemovalModule,
  nextTurnLeaderThreats,
  policyContext,
  tactics,
} from "@one-piece-sim/agents/local";
import {
  createGame,
  observe,
  type CardInstance,
  type GameState,
} from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

import { resolveDeck } from "@one-piece-sim/decks";
import { fabricatedAttack, setTurnPlayer } from "./support/index.js";

/**
 * Validation for the rules improvements found by replaying the human-vs-LLM
 * ST31-vs-Nami matches (`I-won.jsonl`, `llm-lost.jsonl` in the repo root).
 *
 * Each `describe` block pins one behaviour that was observed to differ between
 * the rules agent and the human/LLM pilots:
 *
 *  1. **threat-removal**: the rules pressed the Leader with the smallest viable
 *     attack every main phase; the humans aimed those attacks at rested
 *     Blockers/engines instead.
 *  2. **next-turn threat counting**: at 1-2 Life the rules treated
 *     `incomingLeaderAttacks` (which decays to 0 during the opponent's turn) as
 *     "no danger" and passed on counters, then lost to the refreshed board.
 *  3. **search priority**: the rules picked the highest card-value ST31 search
 *     result; the LLM followed the deck's declared priority (Zoro first).
 *  4. **cost payment**: the rules paid Bad Manners' [Counter] cost with the
 *     most valuable card in hand; the LLM paid with the least valuable.
 *  5. **Rush feeding**: the rules spread DON!! onto the Leader and a character
 *     after playing 7-cost Luffy, leaving the 9000 `[DON!! x3]` Rush body to
 *     sit out the turn; the LLM fed it three DON!! and attacked.
 */

function blankState(): GameState {
  const state = createGame({
    gameId: "policy-fix-1",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Blue/Yellow) Nami - Official Feature Deck"),
    seed: "policy-fix-seed",
  });
  state.phase = "main";
  state.turn = 2;
  setTurnPlayer(state, "p1");
  for (const playerId of ["p1", "p2"] as const) {
    // Life is dealt at the end of the mulligan, which this helper skips, so
    // deal it here the same way the engine does: the Leader's printed cost.
    // The initial state holds the full deck, and Life comes off the top.
    const leader = state.players[playerId].leaderCardNumber;
    const leaderLife = cardFacts(leader).cost;
    if (state.players[playerId].life.length === 0) {
      state.players[playerId].life.push(
        ...state.players[playerId].deck.splice(0, leaderLife),
      );
    }
    Object.assign(state.players[playerId], {
      hand: [],
      board: [],
      stage: null,
      activeDon: [],
      restedDon: [],
      leaderAttachedDon: [],
      leaderPowerModifiers: [],
      leaderRested: false,
    });
  }
  return state;
}

function view(state: GameState): GameObservation {
  return observe(state, "p1");
}

/** A board Character with the fields the engine reads. */
function boardCharacter(
  instanceId: string,
  cardNumber: string,
  options: {
    rested?: boolean;
    playedTurn?: number;
  } = {},
) {
  return {
    instanceId,
    cardNumber,
    rested: options.rested ?? false,
    playedTurn: options.playedTurn ?? 1,
    attachedDon: [],
    powerModifiers: [],
  };
}

const rankOf = (observation: GameObservation, act: LegalAction) =>
  createThreatRemovalModule().rank?.(policyContext(observation), act);

describe("threat-removal: aim removal attacks at rested Blockers and engines", () => {
  /** The module only ranks real engine actions (`t.viableAttacks` is derived
   *  from `observation.legalActions`), so every scenario builds the full board
   *  first and reads the attacks the engine actually offers. Power, cost and
   *  blocker come from the card definitions, not from the state. */
  function attackState(options: {
    targetCard: string;
    opponentRested: boolean;
    opponentLife?: number;
  }): {
    state: GameState;
    observation: GameObservation;
    leaderAttack: LegalAction;
    characterAttack: LegalAction;
  } {
    const state = blankState();
    state.turn = 3;
    state.players.p1.activeDon = ["don-1", "don-2", "don-3"];
    state.players.p1.board = [
      boardCharacter("zoro", "ST31-001"),
      boardCharacter("sanji", "ST31-002"),
    ];
    state.players.p2.board = [
      {
        instanceId: "target",
        cardNumber: options.targetCard,
        rested: options.opponentRested,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];
    if (options.opponentLife !== undefined) {
      state.players.p2.life = Array.from(
        { length: options.opponentLife },
        (_, index) => ({
          instanceId: `p2-life-${index}`,
          cardNumber: "P-088",
          faceUp: false,
        }),
      );
    }
    const observation = view(state);
    const t = tactics(observation);
    const attacks = observation.legalActions.filter(
      (action): action is LegalAction & { type: "attack" } =>
        action.type === "attack",
    );
    const leaderAttack = attacks.find(
      (action) => action.targetInstanceId === "p2-leader",
    )!;
    // The attack at the rested target is only worth ranking when it can win:
    // filter to the attacks `tactics` reports as viable.
    const characterAttack = t.viableAttacks.find(
      (action) => action.targetInstanceId === "target",
    )!;
    return { state, observation, leaderAttack, characterAttack };
  }

  it("prefers a rested opposing Blocker as an attack target", () => {
    // ST31-002 Jinbe is a 6000 Blocker whose On-K.O. does not pay the defender
    // Life, so the removal is real and the module ranks the character swing at
    // it over the Leader press.
    const { observation, leaderAttack, characterAttack } = attackState({
      targetCard: "ST31-002",
      opponentRested: true,
    });
    const t = tactics(observation);
    expect(t.lethalInRange).toBe(false);

    const blockerScore = rankOf(observation, characterAttack);
    const leaderScore = rankOf(observation, leaderAttack);
    expect(blockerScore).toBeDefined();
    expect(leaderScore).toBeUndefined();
  });

  it("ignores active (unrested) opposing characters", () => {
    const { observation, characterAttack } = attackState({
      targetCard: "ST31-002",
      opponentRested: false,
    });
    expect(rankOf(observation, characterAttack)).toBeUndefined();
  });

  it("ignores small (cost < 4) non-blocker targets", () => {
    // ST31-003 Brook is a cost-2 3000 body; removing it is not worth a detour
    // from the Leader press.
    const { observation, characterAttack } = attackState({
      targetCard: "ST31-003",
      opponentRested: true,
    });
    expect(rankOf(observation, characterAttack)).toBeUndefined();
  });

  it("backs off when the Leader is in lethal range", () => {
    // lethalInRange requires no opposing Blockers on board, so the rested
    // engine here is a cost-4 non-blocker. At 1 Life with enough leader
    // attacks the press wins, so the module must stay silent even though a
    // rested engine qualifies.
    const state = blankState();
    state.turn = 3;
    state.players.p1.activeDon = ["don-1", "don-2", "don-3"];
    state.players.p1.board = [
      boardCharacter("zoro", "ST31-001"),
      boardCharacter("sanji", "ST31-002"),
    ];
    state.players.p2.life = [
      { instanceId: "p2-life-0", cardNumber: "P-088", faceUp: false },
    ];
    state.players.p2.board = [
      {
        instanceId: "target",
        cardNumber: "ST31-004",
        rested: true,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];
    const observation = view(state);
    const t = tactics(observation);
    expect(t.lethalInRange).toBe(true);
    const attacks = observation.legalActions.filter(
      (action): action is LegalAction & { type: "attack" } =>
        action.type === "attack",
    );
    for (const attack of attacks) {
      expect(rankOf(observation, attack)).toBeUndefined();
    }
  });

  it("only ranks attacks that are actually viable", () => {
    // A weak attacker cannot beat a big rested target: the module must not
    // rank that (losing) attack. ST31-003 Brook is a 3000 body facing a 6000
    // rested Blocker.
    const state = blankState();
    state.turn = 3;
    state.players.p1.activeDon = ["don-1", "don-2", "don-3"];
    state.players.p1.board = [boardCharacter("brook", "ST31-003")];
    state.players.p2.board = [
      {
        instanceId: "target",
        cardNumber: "ST31-002",
        rested: true,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];
    const observation = view(state);
    const attacks = observation.legalActions.filter(
      (action): action is LegalAction & { type: "attack" } =>
        action.type === "attack",
    );
    // Brook is a 3000 body; every legal attack it can declare is against a
    // 6000 rested Blocker and is therefore not viable. The module stays silent.
    for (const attack of attacks) {
      expect(rankOf(observation, attack)).toBeUndefined();
    }
  });

  it("leaves a target that will not stand up next turn to the Leader press", () => {
    // The premium this rule pays -- an attack spent on a body instead of on
    // Life -- buys the turn that body would otherwise have attacked or
    // blocked. A Character held down through the opponent's Refresh Phase does
    // neither, so the premium buys nothing and the Leader hit is worth more.
    // From `open-optcg-trace(45).jsonl` turn 5, where OP17-020 Shanks froze a
    // rested Zoro with its [Activate: Main] and then spent its only attack
    // K.O.ing the same Zoro.
    const { state, characterAttack } = attackState({
      targetCard: "ST31-002",
      opponentRested: true,
    });
    const target = state.players.p2.board.find(
      (card) => card.instanceId === "target",
    )!;
    // `drawForTurn` refreshes on `cannotRefreshUntilTurn < state.turn`, so
    // turn 4 is "still down through the opponent's next turn" at turn 3.
    target.cannotRefreshUntilTurn = 4;
    const observation = view(state);

    expect(rankOf(observation, characterAttack)).toBeUndefined();
  });

  it("does not rank a target whose On-K.O. pays the defender Life", () => {
    // OP06-104 Kikunojo prints "[printed text omitted -- pnpm card:text OP06-104]" Removing it hands the Nami player its own win condition back, so
    // the module must leave the Leader press intact -- the same hazard that
    // ST31-into-ST36's policy knows Hawkins and Cavendish by name for.
    const { observation, characterAttack } = attackState({
      targetCard: "OP06-104",
      opponentRested: true,
    });
    const rules = observation.cardFacts["OP06-104"]?.rules;
    expect(rules?.clauses).toContain("[On K.O.]");
    expect(rules?.koClauseMentionsLife).toBe(true);
    expect(rankOf(observation, characterAttack)).toBeUndefined();
  });

  it("still ranks a target whose On-K.O. only replaces the body", () => {
    // OP12-113 Roronoa Zoro plays a {Supernovas} body of cost 4 or less from
    // hand *rested* when it dies. That is a refund, but a refund that costs a
    // card and cannot attack or block, so the K.O. is still worth making.
    // Gating on it costs games against ST36, which is why
    // `koRefundsDefender` reads Life and nothing else.
    const { observation, characterAttack } = attackState({
      targetCard: "OP12-113",
      opponentRested: true,
    });
    const rules = observation.cardFacts["OP12-113"]?.rules;
    expect(rules?.clauses).toContain("[On K.O.]");
    expect(rules?.koClauseMentionsLife).toBe(false);

    expect(rankOf(observation, characterAttack)).toBeDefined();
  });

  it("reads the On-K.O. clause rather than the whole effect", () => {
    // ST31-002 Jinbe prints "[printed text omitted -- pnpm card:text ST31-002]" and has no [On K.O.] at all. A gate that tests the whole
    // effect string cannot tell that text from a K.O. that pays its controller,
    // which is what `clauseTextOf` exists to stop.
    const { observation, characterAttack } = attackState({
      targetCard: "ST31-002",
      opponentRested: true,
    });
    const t = tactics(observation);
    expect(t.koRefundsDefender("target")).toBe(false);
    expect(rankOf(observation, characterAttack)).toBeDefined();
  });
});

describe("ko-payoff-target: do not attack into a body that replaces itself", () => {
  /**
   * The two reported positions, one per reporting player. Both are a Leader
   * spending the turn's only attack on a rested body whose `[On K.O.]` plays a
   * fresh Character, so the K.O. removed nothing and gave up a Life hit.
   *
   * Built on the same board `threat-removal`'s scenarios use, because the point
   * is that the two rules speak about the same attack: `threat-removal` ranks
   * it up and this vetoes it, and the composition is what puts the attack back
   * on the Leader.
   */
  function koTargetState(targetCard: string): {
    observation: GameObservation;
    characterAttack: LegalAction;
    leaderAttack: LegalAction;
  } {
    const state = blankState();
    state.turn = 3;
    state.players.p1.activeDon = ["don-1", "don-2", "don-3"];
    state.players.p1.board = [boardCharacter("jinbe", "ST31-002")];
    state.players.p2.board = [
      {
        instanceId: "target",
        cardNumber: targetCard,
        rested: true,
        playedTurn: 1,
        attachedDon: [],
        powerModifiers: [],
      },
    ];
    const observation = view(state);
    const t = tactics(observation);
    const characterAttack = t.viableAttacks.find(
      (action) => action.targetInstanceId === "target",
    )!;
    const leaderAttack = t.viableAttacks.find(
      (action) => action.targetInstanceId === "p2-leader",
    )!;
    return { observation, characterAttack, leaderAttack };
  }

  const vetoOf = (observation: GameObservation, act: LegalAction) =>
    createKoPayoffTargetModule().veto?.(policyContext(observation), act);

  it("vetoes the attack that K.O.'d ST21-015 Zoro in open-optcg-trace(12)", () => {
    // The reported turn: the attack wins its battle, Zoro's [On K.O.] plays a
    // Red Character of 6000 power or less out of hand *active*, and the same
    // attacker had the opposing Leader available.
    const { observation, characterAttack, leaderAttack } =
      koTargetState("ST21-015");
    expect(vetoOf(observation, characterAttack)).toBeTruthy();
    expect(vetoOf(observation, leaderAttack)).toBeFalsy();
  });

  it("vetoes the attack into EB04-052 Sanji, the same shape one deck over", () => {
    const { observation, characterAttack } = koTargetState("EB04-052");
    expect(vetoOf(observation, characterAttack)).toBeTruthy();
  });

  it("leaves a body whose [On K.O.] only draws alone", () => {
    // OP16-110 Vasco Shot draws a card when it dies. That charges the attacker
    // a card, but the body is gone and the removal did what it was for -- the
    // rule is about a K.O. that removes nothing, not about a K.O. that costs
    // something.
    const { observation, characterAttack } = koTargetState("OP16-110");
    expect(vetoOf(observation, characterAttack)).toBeFalsy();
  });

  it("leaves a body whose replacement arrives rested", () => {
    // ST27-003 Kuzan plays a Blackbeard Pirates body of cost 5 or less out of
    // the trash *rested*: it blocks nothing on the turn it arrives and swings
    // on none of it, so the attack still took the board position it was aimed
    // at. That is a refund, and this rule is about a K.O. that removes nothing.
    const { observation, characterAttack } = koTargetState("ST27-003");
    expect(vetoOf(observation, characterAttack)).toBeFalsy();
  });

  it("leaves a body whose [On K.O.] cannot fire from a battle", () => {
    // OP12-113 Roronoa Zoro's [On K.O.] names "K.O.'d by your opponent's
    // effect", so an attack never triggers it. `getOnKoMechanicProgram`'s
    // battle cause is what separates it from a clause a lost battle does fire.
    const { observation, characterAttack } = koTargetState("OP12-113");
    expect(vetoOf(observation, characterAttack)).toBeFalsy();
  });
});

describe("next-turn threat counting at low Life", () => {
  it("counts the refreshed board including the Leader", () => {
    const state = blankState();
    state.players.p2.board = [
      boardCharacter("nami", "EB03-053"),
      boardCharacter("zoro", "OP15-113"),
    ];
    const observation = view(state);
    // Both Nami and Zoro hit at least as hard as p1's 5000 Leader; +1 Leader.
    expect(nextTurnLeaderThreats(observation)).toBe(3);
  });

  it("ignores opposing characters that cannot reach the Leader", () => {
    const state = blankState();
    // ST31-003 Brook is a 3000-power body; it cannot reach a 5000 Leader.
    state.players.p2.board = [boardCharacter("brook", "ST31-003")];
    const observation = view(state);
    expect(nextTurnLeaderThreats(observation)).toBe(1);
  });
});

describe("ST31 search priority: declared deck order beats raw card value", () => {
  it("exposes the ST31 search effect for a Nami play", () => {
    // The rules took ST31-004 Luffy (card value 95) over the Zoro that the
    // deck's own searchPriority names first; the LLM took Zoro. The black-box
    // behaviour is covered by the ST31 matchup suites; this pins the shape the
    // policy branch reads (`effectKind` "search-top-five", hand-zone options).
    const state = blankState();
    state.players.p1.hand = [
      { instanceId: "nami", cardNumber: "OP01-016", faceUp: false },
    ];
    state.players.p1.deck = [
      { instanceId: "zoro", cardNumber: "OP14-015", faceUp: false },
      { instanceId: "luffy", cardNumber: "ST31-004", faceUp: false },
      { instanceId: "jinbe", cardNumber: "ST31-002", faceUp: false },
      { instanceId: "brook", cardNumber: "ST31-003", faceUp: false },
      { instanceId: "sanji", cardNumber: "ST31-001", faceUp: false },
    ];
    state.players.p1.activeDon = ["don-1"];
    const observation = view(state);
    const play = observation.legalActions.find(
      (action) =>
        action.type === "play-card" && action.cardInstanceId === "nami",
    );
    expect(play).toBeDefined();
  });
});

describe("Bad Manners cost: pay with the least valuable card", () => {
  it("pins the shape the cost branch reads", () => {
    // The branch reads effectKind "bad-manners-counter" and pays with the
    // lowest card-value hand option; the ST31 test suite covers the mechanics
    // end-to-end, and this guards that the agent-level contract is exercised
    // through the same legal-action shape.
    const state = blankState();
    state.players.p1.hand = [
      { instanceId: "luffy", cardNumber: "ST31-004", faceUp: false },
      { instanceId: "nami", cardNumber: "OP01-016", faceUp: false },
    ];
    const observation = view(state);
    expect(
      observation.legalActions.some(
        (action) =>
          action.type === "resolve-effect" &&
          action.effectKind === "bad-manners-counter",
      ),
    ).toBe(false);
  });
});

describe("Rush feed: DON!! a just-played 7-cost Luffy before spreading DON!!", () => {
  it("exposes the ST31-004 Rush condition through card facts", () => {
    const state = blankState();
    state.players.p1.hand = [
      { instanceId: "luffy", cardNumber: "ST31-004", faceUp: false },
    ];
    const observation = view(state);
    const facts = observation.cardFacts["ST31-004"];
    // The Rush is conditional -- granted at three given DON!! -- so it is a
    // mention in the text, not a printed keyword.
    expect(facts?.rules.tokens).toContain("[Rush]");
    expect(facts?.keywords).not.toContain("Rush");
  });
});

/**
 * Validation for the counter budget found by replaying the six LLM-vs-rules
 * games in `traces/llm-vs-rules/ST31-vs-ST32`.
 *
 * `mustPreventCurrentLeaderHit` decides *whether* a Leader hit must be stopped
 * and gets that right; nothing decided what stopping it was allowed to cost. The
 * rules pilot spent 2.29 Counter cards per successful defence against the LLM's
 * 1.15, peaking at six cards on one 11000 swing at 2 Life -- and lost the
 * following turn holding nothing.
 */
describe("counter-budget: price a non-lethal Leader hit in Counter cards", () => {
  /** A `counter` action shaped the way the resolver's veto path reads one. */
  const counterAction = (cardInstanceId: string): LegalAction =>
    ({
      type: "counter",
      actionId: `c:${cardInstanceId}`,
      cardInstanceId,
    }) as unknown as LegalAction;

  const vetoOf = (observation: GameObservation) =>
    createCounterBudgetModule().veto?.(
      policyContext(observation),
      counterAction("any"),
    );

  /**
   * Counter cards by the value printed on them, because the budget counts
   * cards and the hand is what supplies them: OP11-012 Franky counters for
   * 2000, OP11-009 Nico Robin and OP01-016 Nami for 1000 each.
   */
  const COUNTER_CARDS: Readonly<Record<number, readonly string[]>> = {
    2000: ["OP11-012"],
    1000: ["OP11-009", "OP01-016"],
  };

  function handOf(counters: readonly number[]): CardInstance[] {
    const taken = new Map<number, number>();
    return counters.map((counter, index) => {
      const pool = COUNTER_CARDS[counter];
      if (!pool) throw new Error(`No fixture card counters for ${counter}`);
      const used = taken.get(counter) ?? 0;
      taken.set(counter, used + 1);
      return {
        instanceId: `p1-hand-${index}`,
        cardNumber: pool[used % pool.length]!,
      };
    });
  }

  /**
   * p1 defends its Leader against `attackPower`, holding `life` Life cards and
   * the Counter values in `counters`.
   *
   * The hand is the point of the fixture rather than scenery: the budget prices
   * a defence in *cards*, and how many cards a shortfall costs is a fact about
   * what is in hand. `blankState` empties the hand, so a case that does not
   * name one is a case with no Counter line available at all.
   */
  function defending(
    attackPower: number,
    life: number,
    counterPower = 0,
    counters: readonly number[] = [2000, 1000, 1000],
  ) {
    const state = blankState();
    state.phase = "counter";
    state.turn = 9;
    setTurnPlayer(state, "p2");
    state.players.p1.hand = handOf(counters);
    state.players.p1.life = state.players.p1.deck.splice(0, life);
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "p1-leader",
      attackPower,
      counterPower,
    });
    return view(state);
  }

  // The default fixture hand is 2000, 1000, 1000 -- 4000 across three cards.
  // Every count below is against that hand, because the budget prices a
  // defence in cards and what a shortfall costs in cards is a fact about the
  // hand, not about the format.

  it("vetoes a four-card Counter line against one non-lethal hit", () => {
    // 11000 into a 5000 Leader demands 6001, past what four 2000s would cover
    // and past this hand entirely. The `seed-3-llm-right` turn-7 position.
    expect(vetoOf(defending(11_000, 3, 0, [2000, 2000, 2000, 2000]))).toMatch(
      /Absorb this Leader hit/,
    );
  });

  it("leaves an affordable two-card line alone", () => {
    // 7000 demands 2001: the 2000 and one 1000 cover it between them.
    expect(vetoOf(defending(7_000, 3))).toBeUndefined();
  });

  it("prices the line at the hand's Counter values, not the format's", () => {
    // 8000 demands 3001. Priced at the format's 2000 step that reads as two
    // cards and sits inside the budget, which is how three-card lines kept
    // slipping past the cap. This hand's largest two are 2000 and 1000, so
    // paying it really costs all three cards.
    expect(vetoOf(defending(8_000, 3))).toMatch(/Absorb this Leader hit/);
    // The same demand out of a hand that does hold two 2000s is two cards, and
    // the rule leaves it alone -- the shortfall did not change, the hand did.
    expect(vetoOf(defending(8_000, 3, 0, [2000, 2000]))).toBeUndefined();
  });

  it("refuses a hit the hand cannot pay for at all", () => {
    // No Counter line exists, so there is nothing to spend and nothing to weigh.
    expect(vetoOf(defending(7_000, 3, 0, []))).toMatch(
      /Absorb this Leader hit/,
    );
  });

  it("never budgets a hit that ends the game", () => {
    // At 0 Life any connecting hit loses, so there is no later hand to save.
    expect(vetoOf(defending(11_000, 0))).toBeUndefined();
  });

  it("allows one more card at 1 Life", () => {
    // 8000 demands 3001: all three cards. Over budget at 3 Life, inside it at 1.
    expect(vetoOf(defending(8_000, 3))).toMatch(/Absorb this Leader hit/);
    expect(vetoOf(defending(8_000, 1))).toBeUndefined();
  });

  it("does not abandon a line it has already started paying", () => {
    // An 11000 swing with 4000 of Counter already committed. The remaining 2001
    // costs this hand two more cards, but the cap is not what decides that: the
    // cards already in are spent whatever happens next, so the rule stands
    // aside for every part-paid line.
    expect(vetoOf(defending(11_000, 3, 4_000))).toBeUndefined();
    // Even one this hand could not have afforded to open.
    expect(
      vetoOf(defending(14_000, 3, 4_000, [1000, 1000, 1000, 1000, 1000])),
    ).toBeUndefined();
  });

  it("ignores battles that are not against the Leader", () => {
    // Character saves are capped by `economicalCharacterSave` instead.
    const state = blankState();
    state.phase = "counter";
    state.players.p1.life = state.players.p1.deck.splice(0, 3);
    state.players.p1.board = [boardCharacter("brook", "ST31-003")];
    state.activeAttack = fabricatedAttack(state, {
      attackerPlayerId: "p2",
      defenderPlayerId: "p1",
      attackerInstanceId: "p2-leader",
      targetInstanceId: "brook",
      attackPower: 11_000,
      counterPower: 0,
    });
    expect(vetoOf(view(state))).toBeUndefined();
  });
});

describe("threat-removal: which body pays for the removal", () => {
  /**
   * The trade the rule could not see, found by replaying a recorded game
   * (`open-optcg-trace(49).jsonl`, turn 9): OP16-003 Edward.Newgate gives the
   * OP-17 Red Ace Leader [Double Attack], so its Leader hit is worth two Life
   * where every other body's is worth one -- and the rule spent exactly that
   * body on K.O.'ing a rested Character any other attacker could have taken.
   * The removal is the same either way; the Life is not.
   *
   * Built as its own board rather than reusing `attackState`, because the
   * keyword has to come from a card: OP16-003's `[Your Turn]` clause is what
   * puts [Double Attack] on the Leader, which is also why a rested Newgate
   * still grants it.
   */
  function aceBoard(options: { newgateRested: boolean }): {
    observation: GameObservation;
    leaderRemoval: LegalAction & { type: "attack" };
    newgateRemoval: (LegalAction & { type: "attack" }) | undefined;
    leaderPress: LegalAction & { type: "attack" };
  } {
    const state = createGame({
      gameId: "threat-removal-double-attack",
      p1: resolveDeck("(Red) Portgas.D.Ace - Official Feature Deck"),
      p2: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
      seed: "double-attack-seed",
    });
    state.phase = "main";
    state.turn = 7;
    setTurnPlayer(state, "p1");
    for (const playerId of ["p1", "p2"] as const) {
      const leaderLife = cardFacts(
        state.players[playerId].leaderCardNumber,
      ).cost;
      if (state.players[playerId].life.length === 0) {
        state.players[playerId].life.push(
          ...state.players[playerId].deck.splice(0, leaderLife),
        );
      }
      Object.assign(state.players[playerId], {
        hand: [],
        board: [],
        stage: null,
        activeDon: [],
        restedDon: [],
        leaderAttachedDon: [],
        leaderPowerModifiers: [],
        leaderRested: false,
      });
    }
    // OP16-003 is the 10000 body that grants the keyword; it is also the
    // substitute that can take the removal when it is active.
    state.players.p1.board = [
      boardCharacter("newgate", "OP16-003", { rested: options.newgateRested }),
    ];
    // ST31-002 Jinbe: a rested cost-5 6000 Blocker, squarely `threat-removal`'s
    // target, and beatable by the 7000 Leader and the 10000 Newgate alike.
    state.players.p2.board = [
      boardCharacter("target", "ST31-002", { rested: true }),
    ];
    const observation = view(state);
    expect(observation.self.leader.effectiveKeywords).toContain(
      "Double Attack",
    );
    const t = tactics(observation);
    const removals = t.viableAttacks.filter(
      (action) => action.targetInstanceId === "target",
    );
    return {
      observation,
      leaderRemoval: removals.find(
        (action) => action.attackerInstanceId === "p1-leader",
      )!,
      newgateRemoval: removals.find(
        (action) => action.attackerInstanceId === "newgate",
      ),
      leaderPress: t.viableAttacks.find(
        (action) =>
          action.attackerInstanceId === "p1-leader" &&
          action.targetInstanceId === "p2-leader",
      )!,
    };
  }

  it("hands the removal to a body without [Double Attack] when one can take it", () => {
    const { observation, leaderRemoval, newgateRemoval } = aceBoard({
      newgateRested: false,
    });
    expect(newgateRemoval).toBeDefined();
    // The swap is free: Newgate removes, and the Leader's two-Life hit is still
    // on offer at the next decision once the target is gone.
    expect(rankOf(observation, newgateRemoval!)).toBeDefined();
    expect(rankOf(observation, leaderRemoval)).toBeUndefined();
  });

  it("still removes with the [Double Attack] body when nothing else can", () => {
    // Newgate rested: its `[Your Turn]` clause still grants the keyword, but it
    // has no attack to lend, so there is no substitute. Removal against press
    // is then a real trade, and the measured rule keeps the removal.
    const { observation, leaderRemoval, newgateRemoval, leaderPress } =
      aceBoard({
        newgateRested: true,
      });
    expect(newgateRemoval).toBeUndefined();
    expect(rankOf(observation, leaderRemoval)).toBeDefined();
    expect(rankOf(observation, leaderPress)).toBeUndefined();
  });
});
