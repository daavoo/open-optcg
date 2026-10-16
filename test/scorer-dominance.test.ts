/**
 * The scorer seat never declares a Character attack that cannot land and
 * triggers nothing -- and only that attack.
 *
 * Each case is a position the dominance rule has to get right, measured
 * against the engine by ml/bridge/attack-audit.ts: a vanilla
 * body swinging short is pruned; a Leader swinging short, an attacker whose
 * rest triggers a draw (ST32-003 Mihawk), and an attack that lands are not.
 * The same for a Counter: one the whole hand cannot turn into a save is
 * pruned, one that saves together with the rest of the hand is not. And
 * ST26-005's DON!! −2 paid again once the Leader is already 7000 is pruned,
 * unless a card that gains from DON!! leaving the field is where it can gain
 * -- a reaction in play, a ceiling or a starved ramp in play or in hand -- or
 * an opposing one reads the payer's count.
 */
import { describe, expect, it } from "vitest";
import { getLegalActions, observe } from "@one-piece-sim/engine-core";
import {
  isDoomedAttack,
  isSpentLeaderOverride,
  isWastedCounter,
  prunedActions,
} from "@one-piece-sim/agents/scorer";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { character, instance, scenario, type Game } from "./support/index.js";

function position(attacker: string, defenders: Parameters<typeof character>[]) {
  const game = scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("scorer-dominance")
    .atTurn(5, { active: "p1" })
    .bareTable()
    .withBoard("p1", [character("attacker", attacker)])
    .withBoard(
      "p2",
      defenders.map((args) => character(...args)),
    )
    .build();
  return observe(game.state, "p1");
}

function attack(
  observation: GameObservation,
  attacker: string,
  target: string,
): LegalAction {
  const found = observation.legalActions.find(
    (action) =>
      action.type === "attack" &&
      action.attackerInstanceId === attacker &&
      action.targetInstanceId === target,
  );
  if (!found) throw new Error(`no attack ${attacker} -> ${target}`);
  return found;
}

describe("scorer dominance pruning", () => {
  it("prunes a vanilla Character swinging short of the opposing Leader", () => {
    // ST31-003 Brook, 3000 on its own turn, into a 5000 Leader.
    const observation = position("ST31-003", []);
    const doomed = attack(observation, "attacker", "p2-leader");
    expect(doomed.type === "attack" && doomed.counterShortfall).toBe(0);
    expect(isDoomedAttack(doomed, observation)).toBe(true);
    expect(
      prunedActions(observation).has(observation.legalActions.indexOf(doomed)),
    ).toBe(true);
  });

  it("keeps the Leader's sure-fail swing, which costs it nothing", () => {
    const observation = position("ST31-003", [
      ["wall", "OP05-044", { rested: true }],
    ]);
    const leaderSwing = attack(observation, "p1-leader", "wall");
    expect(leaderSwing.type === "attack" && leaderSwing.counterShortfall).toBe(
      0,
    );
    expect(isDoomedAttack(leaderSwing, observation)).toBe(false);
  });

  it("keeps a short swing whose rest triggers something (ST32-003 draws)", () => {
    // Mihawk, 7000, into a rested 10000 Character: the attack fails, but
    // resting Mihawk draws and trashes a card.
    const observation = position("ST32-003", [
      ["wall", "OP05-044", { rested: true }],
    ]);
    const swing = attack(observation, "attacker", "wall");
    expect(swing.type === "attack" && swing.counterShortfall).toBe(0);
    expect(isDoomedAttack(swing, observation)).toBe(false);
  });

  it("keeps an attack that lands", () => {
    // Mihawk, 7000, into the 5000 Leader.
    const observation = position("ST32-003", []);
    expect(
      isDoomedAttack(attack(observation, "attacker", "p2-leader"), observation),
    ).toBe(false);
  });

  it("never prunes every offered action", () => {
    const observation = position("ST31-003", []);
    expect(prunedActions(observation).size).toBeLessThan(
      observation.legalActions.length,
    );
  });
});

/**
 * p2's Counter step: ST31-002 (6000) swings into ST32-001, a 1001 shortfall
 * once p2's board is counted, with `hand` holding p2's Counters.
 */
function counterStep(hand: string[]) {
  const game = scenario()
    .decks(
      "(Red) Monkey.D.Luffy - Starter Deck 31",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("scorer-dominance-counter")
    .atTurn(5, { active: "p1" })
    .bareTable()
    .withBoard("p1", [character("attacker", "ST31-002")])
    .withBoard("p2", [character("target", "ST32-001", { rested: true })])
    .withHand(
      "p2",
      hand.map((cardNumber, index) => instance(`c${index}`, cardNumber)),
    )
    .build();
  game.play({ type: "attack", attackerInstanceId: "attacker" });
  if (game.state.phase === "block") game.play({ type: "pass" });
  const observation = observe(game.state, "p2");
  expect(observation.activeBattle?.counterShortfall).toBe(1001);
  return observation;
}

function counters(observation: GameObservation): LegalAction[] {
  return observation.legalActions.filter((action) => action.type === "counter");
}

describe("scorer dominance pruning: Counters", () => {
  it("prunes every Counter when the whole hand falls short of the save", () => {
    // 1000 against 1001: the Character dies whatever is played -- the tie
    // goes to the attacker.
    const observation = counterStep(["ST32-004"]);
    const offered = counters(observation);
    expect(offered).toHaveLength(1);
    for (const counter of offered) {
      expect(isWastedCounter(counter, observation)).toBe(true);
    }
    const pruned = prunedActions(observation);
    expect(pruned.size).toBe(1);
    expect(
      observation.legalActions.filter((_, index) => !pruned.has(index)),
    ).toEqual([expect.objectContaining({ type: "pass" })]);
  });

  it("keeps Counters that save together, though none saves alone", () => {
    // 1000 + 1000 reaches 1001; each card alone is short.
    const observation = counterStep(["ST32-004", "ST32-001"]);
    for (const counter of counters(observation)) {
      expect(isWastedCounter(counter, observation)).toBe(false);
    }
    expect(prunedActions(observation).size).toBe(0);
  });
});

describe("ST26-005's DON!! −2 once the Leader is already 7000", () => {
  /**
   * mon's engine: OP09-061 Luffy, ST26-005 attacking first -- its payment
   * makes the Leader 7000 and spends the Leader's once-per-turn refund --
   * then a second copy played from hand, offering the same payment again.
   */
  function secondPayment(board: Parameters<typeof character>[] = []) {
    const game = scenario()
      .decks(
        "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("scorer-dominance-st26")
      .atTurn(11, { active: "p1" })
      .withBoard("p1", [
        character("attacker", "ST26-005", { playedTurn: 1, rested: false }),
        ...board.map((args) => character(...args)),
      ])
      .withHand("p1", [instance("second", "ST26-005")])
      .build();
    const apply = () => {
      const offer = getLegalActions(game.state, game.state.activePlayer).find(
        (action) =>
          action.type === "resolve-effect" && action.optionId === "apply",
      );
      return offer ? observe(game.state, game.state.activePlayer) : null;
    };
    game.play({ type: "attack", attackerInstanceId: "attacker" });
    const before = apply();
    game.play({ type: "resolve-effect", optionId: "apply" });
    while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
    // Through the battle -- no block, no Counter -- until p1 can play again.
    const canPlay = () =>
      getLegalActions(game.state, "p1").some(
        (action) =>
          action.type === "play-card" && action.cardInstanceId === "second",
      );
    while (!canPlay()) game.pass();
    game.play({ type: "play-card", cardNumber: "ST26-005" });
    return { before: before!, after: apply()! };
  }
  const payment = (observation: GameObservation): LegalAction =>
    observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.option.kind === "confirm" &&
        action.option.choice === "apply",
    )!;

  it("keeps the first payment, which makes the Leader 7000", () => {
    const { before } = secondPayment();
    expect(before.self.leader.basePower).toBeUndefined();
    expect(isSpentLeaderOverride(payment(before), before)).toBe(false);
  });

  it("prunes the second, which changes nothing and loses two DON!!", () => {
    const { after } = secondPayment();
    expect(after.self.leader.basePower).toBe(7000);
    const index = after.legalActions.indexOf(payment(after));
    expect(isSpentLeaderOverride(payment(after), after)).toBe(true);
    expect(prunedActions(after).has(index)).toBe(true);
  });

  it("keeps it while a Character that answers a DON!! return is on the board", () => {
    // OP06-076 Hitokiri Kamazo K.O.s on a DON!! return, once per turn.
    const { after } = secondPayment([["kamazo", "OP06-076"]]);
    expect(isSpentLeaderOverride(payment(after), after)).toBe(false);
  });
});

/**
 * p1 on the ST-26 list, two ST26-005 Luffy on the field, swinging into rested
 * 10000s so neither attack ends anything. `luffy-a` attacks and pays first;
 * the observation returned is p1's at the second Luffy's `[When Attacking]`.
 */
function secondLuffyPayment(options: {
  hand?: string[];
  opponentBoard?: string[];
  donDeck?: number;
}) {
  const game = scenario()
    .decks(
      "(Purple/Black) Monkey.D.Luffy - Starter Deck 26",
      "(Green) Roronoa Zoro - Starter Deck 32",
    )
    .seed("scorer-dominance-luffy")
    .atTurn(11, { active: "p1" })
    .bareTable()
    .withBoard("p1", [
      character("luffy-a", "ST26-005", { playedTurn: 1 }),
      character("luffy-b", "ST26-005", { playedTurn: 1 }),
    ])
    .withBoard("p2", [
      character("wall-a", "OP05-044", { rested: true }),
      character("wall-b", "OP05-044", { rested: true }),
      ...(options.opponentBoard ?? []).map((cardNumber, index) =>
        character(`seen-${String(index)}`, cardNumber, { rested: true }),
      ),
    ])
    .withHand(
      "p1",
      (options.hand ?? []).map((cardNumber, index) =>
        instance(`h${String(index)}`, cardNumber),
      ),
    )
    .withDonDeck("p1", options.donDeck ?? 4)
    .build();
  game.play({
    type: "attack",
    attackerInstanceId: "luffy-a",
    targetInstanceId: "wall-a",
  });
  const first = observe(game.state, "p1");
  game.play({ type: "resolve-effect", optionId: "apply" });
  finishBattle(game);
  game.play({
    type: "attack",
    attackerInstanceId: "luffy-b",
    targetInstanceId: "wall-b",
  });
  return { game, first, second: observe(game.state, "p1") };
}

function finishBattle(game: Game) {
  while (game.state.pendingEffect) game.play({ type: "resolve-effect" });
  while (game.state.phase !== "main") game.play({ type: "pass" });
}

function payment(observation: GameObservation): LegalAction {
  const found = observation.legalActions.find(
    (action) =>
      action.type === "resolve-effect" &&
      action.sourceCardNumber === "ST26-005" &&
      action.option.kind === "confirm",
  );
  if (!found) throw new Error("no ST26-005 payment offered");
  return found;
}

describe("ST26-005's DON!! −2 kept where the return still buys something", () => {
  it("buys nothing in the engine: the Leader ends where declining leaves it", () => {
    const paid = secondLuffyPayment({}).game;
    paid.play({ type: "resolve-effect", optionId: "apply" });
    finishBattle(paid);
    const declined = secondLuffyPayment({}).game;
    declined.play({ type: "resolve-effect", optionId: "skip" });
    finishBattle(declined);
    const leader = (game: Game) => observe(game.state, "p1").self.leader;
    const fieldDon = (game: Game) => {
      const self = observe(game.state, "p1").self;
      return self.activeDon + self.restedDon;
    };
    expect(leader(paid).basePower).toBe(leader(declined).basePower);
    expect(leader(paid).currentPower).toBe(leader(declined).currentPower);
    expect(fieldDon(paid)).toBe(fieldDon(declined) - 2);
  });

  it("keeps it while a ramp in hand would draw from the refilled DON!! deck", () => {
    // OP09-075 Kid adds 1 DON!! for a Life card, not for DON!!: with the DON!!
    // deck empty, the two returned are what it would add.
    const { second } = secondLuffyPayment({ hand: ["OP09-075"], donDeck: 0 });
    expect(isSpentLeaderOverride(payment(second), second)).toBe(false);
  });

  it("prunes it while that ramp's DON!! deck already holds what it adds", () => {
    const { second } = secondLuffyPayment({ hand: ["OP09-075"], donDeck: 1 });
    expect(isSpentLeaderOverride(payment(second), second)).toBe(true);
  });

  it("prunes it beside ramps that pay DON!! −N, and a reaction still in hand", () => {
    // The trace that found this: mon's hand held OP09-076 Zoro and ST26-003
    // Robin, whose own returns refill the DON!! deck before they draw, and
    // OP17-062 Kaido, which answers a return only from the field. The deck is
    // empty, so a ramp that did not pay its own way would have kept it.
    const { second } = secondLuffyPayment({
      hand: ["OP09-076", "ST26-003", "OP17-062"],
      donDeck: 0,
    });
    expect(isSpentLeaderOverride(payment(second), second)).toBe(true);
  });

  it("keeps it while an opposing card reads the payer's DON!! count", () => {
    // EB02-061 gains [Rush] while its opponent has 5 or more DON!!.
    const { second } = secondLuffyPayment({ opponentBoard: ["EB02-061"] });
    expect(isSpentLeaderOverride(payment(second), second)).toBe(false);
  });
});
