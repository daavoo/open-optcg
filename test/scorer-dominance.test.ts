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
 * an opposing one reads the payer's count. OP17-058's −2000 on the
 * opponent's attack is pruned where the battle is decided without it, and
 * kept where it or the hand's Counters with it can stop the attack. A
 * `[When Attacking]` gated on the attacker's power is pruned where the gate is
 * unmet, and OP14-001's Leader swap where every pairing writes back the base
 * powers already there.
 */
import { describe, expect, it } from "vitest";
import {
  currentPower,
  getLegalActions,
  observe,
} from "@one-piece-sim/engine-core";
import {
  isDebuffForADecidedBattle,
  isDoomedAttack,
  isNoOpActivation,
  isSpentLeaderOverride,
  isWastedCounter,
  prunedActions,
} from "@one-piece-sim/agents/scorer";
import { isAsideCounter } from "@one-piece-sim/agents/local";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  character,
  copies,
  instance,
  scenario,
  type Game,
} from "./support/index.js";

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

/** The defender's own Counters; a Counter onto another card is always pruned. */
function counters(observation: GameObservation): LegalAction[] {
  return observation.legalActions.filter(
    (action) => action.type === "counter" && !isAsideCounter(action),
  );
}

/** Pruned indices other than the Counters onto another card. */
function prunedOwn(observation: GameObservation): Set<number> {
  return new Set(
    [...prunedActions(observation)].filter(
      (index) => !isAsideCounter(observation.legalActions[index]!),
    ),
  );
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
    expect(prunedOwn(observation).size).toBe(1);
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
    expect(prunedOwn(observation).size).toBe(0);
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

/**
 * OP17-058 Kaido's Leader debuff on the opponent's attack, from a recorded
 * game: Kaido at 2 Life with an empty hand paid `DON!! −1` to take a 7000
 * attacker to 5000 -- a hit either way -- and then had no −2000 for the third
 * attack, where the two Life cards it had taken were Counters enough to stop
 * it.
 */
describe("OP17-058's −2000 on a battle it cannot change", () => {
  function kaidoDefends(
    attacker: string,
    options: {
      hand?: Parameters<typeof instance>[];
      board?: Parameters<typeof character>[];
    } = {},
  ): Game {
    const game = scenario()
      .decks(
        "(Purple) Kaido - Official Feature Deck",
        "(Red) Portgas.D.Ace - Official Feature Deck",
      )
      .seed("scorer-dominance-kaido")
      .bareTable()
      .atTurn(6, { active: "p2" })
      .withLife("p1", copies(2, "OP17-075", "p1-life"))
      .withLife("p2", copies(4, "OP16-015", "p2-life"))
      .withHand(
        "p1",
        (options.hand ?? []).map((args) => instance(...args)),
      )
      .withBoard(
        "p1",
        (options.board ?? []).map((args) => character(...args)),
      )
      .withBoard("p2", [
        character("luffy", "OP16-015", { playedTurn: 4 }),
        character("newgate", "OP16-003", { playedTurn: 4 }),
      ])
      .build();
    game.play({
      type: "attack",
      attackerInstanceId: attacker,
      targetInstanceId: "p1-leader",
    });
    return game;
  }

  function payment(observation: GameObservation): LegalAction {
    const found = observation.legalActions.find(
      (action) =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === "OP17-058" &&
        action.option.kind === "confirm" &&
        action.option.choice === "apply",
    );
    if (!found) throw new Error("no OP17-058 payment offered");
    return found;
  }

  const pruned = (game: Game): boolean => {
    const observation = observe(game.state, "p1");
    const pay = payment(observation);
    expect(
      prunedActions(observation).has(observation.legalActions.indexOf(pay)),
    ).toBe(isDebuffForADecidedBattle(pay, observation));
    return isDebuffForADecidedBattle(pay, observation);
  };

  it("prunes it when the attack lands after −2000 and the hand is empty", () => {
    expect(
      observe(kaidoDefends("newgate").state, "p1").activeBattle,
    ).toMatchObject({ attackPower: 10000, targetPower: 5000 });
    expect(pruned(kaidoDefends("newgate"))).toBe(true);
  });

  it("is offered again on the next attack once declined", () => {
    const game = kaidoDefends("newgate");
    game.play({ type: "resolve-effect", optionId: "skip" });
    game.pass();
    game.pass();
    game.play({
      type: "attack",
      attackerInstanceId: "luffy",
      targetInstanceId: "p1-leader",
    });
    const observation = observe(game.state, "p1");
    expect(isDebuffForADecidedBattle(payment(observation), observation)).toBe(
      false,
    );
  });

  it("prunes it against the opposing Leader, which it cannot target", () => {
    expect(
      pruned(kaidoDefends("p2-leader", { hand: [["hawkins", "OP17-073"]] })),
    ).toBe(true);
  });

  it("keeps it when −2000 alone stops the attack", () => {
    expect(pruned(kaidoDefends("luffy"))).toBe(false);
  });

  it("keeps it when −2000 brings the attack within the hand's Counters", () => {
    // 10000 - 2000 = 8000 against 5000 + 2000 + 2000: stopped only with it.
    const game = kaidoDefends("newgate", {
      hand: [
        ["hawkins-a", "OP17-073"],
        ["hawkins-b", "OP17-073"],
      ],
    });
    const hand = observe(game.state, "p1").self.hand;
    expect(hand.map((card) => card.currentCounter)).toEqual([2000, 2000]);
    expect(pruned(game)).toBe(false);
  });

  it("keeps it beside an active Blocker", () => {
    expect(
      pruned(kaidoDefends("newgate", { board: [["wall", "OP12-118"]] })),
    ).toBe(false);
  });
});

describe("a [When Attacking] gated on the attacker's power", () => {
  /**
   * Red Law's board: OP14-002 Urouge (2000, "if this Character has 5000 power
   * or more, draw 1 card and K.O. ...") with `given` DON!! on it, beside
   * OP14-013 Luffy (0, an unconditional −1000), into a rested 10000 wall and
   * a 5000 Leader.
   */
  function gated(given: number) {
    const game = scenario()
      .decks(
        "(Red) Trafalgar Law - 9th Place ChinoizeCup #125",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("scorer-dominance-gated")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withLeader("p1", "OP14-001")
      .withBoard("p1", [
        character("urouge", "OP14-002"),
        character("luffy", "OP14-013"),
      ])
      .withBoard("p2", [character("wall", "OP05-044", { rested: true })])
      .withDeckTop("p1", copies(3, "ST31-003", "p1-deck"))
      .withGivenDon("p1", "urouge", given)
      .build();
    return { game, observation: observe(game.state, "p1") };
  }

  it("prunes the swing whose gate is unmet: 4000 into a 5000 Leader", () => {
    const { game, observation } = gated(2);
    const swing = attack(observation, "urouge", "p2-leader");
    expect(swing).toMatchObject({
      counterShortfall: 0,
      attackPower: 4000,
      whenAttackingInert: true,
    });
    expect(isDoomedAttack(swing, observation)).toBe(true);
    expect(
      prunedActions(observation).has(observation.legalActions.indexOf(swing)),
    ).toBe(true);
    // And the engine agrees it buys nothing: no draw, no K.O. offer.
    const before = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "urouge",
      targetInstanceId: "p2-leader",
    });
    expect(game.state.players.p1.hand).toHaveLength(before);
    expect(game.state.pendingEffect).toBeNull();
  });

  it("keeps the swing whose gate is met, though the attack still fails", () => {
    // 5000 into the 10000 wall: short, but Urouge draws on declaring.
    const { game, observation } = gated(3);
    const swing = attack(observation, "urouge", "wall");
    expect(swing).toMatchObject({ counterShortfall: 0, attackPower: 5000 });
    expect(swing).not.toHaveProperty("whenAttackingInert");
    expect(isDoomedAttack(swing, observation)).toBe(false);
    const before = game.state.players.p1.hand.length;
    game.play({
      type: "attack",
      attackerInstanceId: "urouge",
      targetInstanceId: "wall",
    });
    expect(game.state.players.p1.hand).toHaveLength(before + 1);
  });

  it("keeps an unconditional [When Attacking] (OP14-013's −1000)", () => {
    const { observation } = gated(0);
    const swing = attack(observation, "luffy", "wall");
    expect(swing.type === "attack" && swing.counterShortfall).toBe(0);
    expect(swing).not.toHaveProperty("whenAttackingInert");
    expect(isDoomedAttack(swing, observation)).toBe(false);
  });
});

describe("OP14-001 Trafalgar Law's swap when no pairing changes anything", () => {
  function lawBoard(board: Parameters<typeof character>[]) {
    const game = scenario()
      .decks(
        "(Red) Trafalgar Law - 9th Place ChinoizeCup #125",
        "(Green) Roronoa Zoro - Starter Deck 32",
      )
      .seed("scorer-dominance-swap")
      .atTurn(5, { active: "p1" })
      .bareTable()
      .withLeader("p1", "OP14-001")
      .withBoard(
        "p1",
        board.map((args) => character(...args)),
      )
      .build();
    const observation = observe(game.state, "p1");
    const swap = observation.legalActions.find(
      (action) =>
        action.type === "activate-main" &&
        action.sourceInstanceId === "p1-leader",
    );
    if (!swap) throw new Error("the Leader swap is not offered");
    return { game, observation, swap };
  }

  it("prunes it when every eligible Character shares one base power", () => {
    // Urouge, Shachi & Penguin and Bepo: 2000 each.
    const { game, observation, swap } = lawBoard([
      ["urouge", "OP14-002"],
      ["shachi", "OP14-006"],
      ["bepo", "OP14-012"],
    ]);
    expect(swap).toMatchObject({ changesNothing: true });
    expect(isNoOpActivation(swap)).toBe(true);
    expect(
      prunedActions(observation).has(observation.legalActions.indexOf(swap)),
    ).toBe(true);
    // Taking it writes back the powers already there.
    game.submit(swap);
    game.play({ type: "resolve-effect", optionId: "urouge" });
    game.play({ type: "resolve-effect", optionId: "shachi" });
    for (const id of ["urouge", "shachi", "bepo"]) {
      expect(currentPower(game.state, "p1", id)).toBe(2000);
    }
  });

  it("keeps it when a pairing moves power: Urouge for OP14-009 Law", () => {
    const { observation, swap } = lawBoard([
      ["urouge", "OP14-002"],
      ["law", "OP14-009"],
    ]);
    expect(swap).not.toHaveProperty("changesNothing");
    expect(isNoOpActivation(swap)).toBe(false);
    expect(
      prunedActions(observation).has(observation.legalActions.indexOf(swap)),
    ).toBe(false);
  });

  it("keeps it when a 0-power body is among equals: OP14-013 Luffy", () => {
    const { swap } = lawBoard([
      ["urouge", "OP14-002"],
      ["shachi", "OP14-006"],
      ["luffy", "OP14-013"],
    ]);
    expect(isNoOpActivation(swap)).toBe(false);
  });
});
