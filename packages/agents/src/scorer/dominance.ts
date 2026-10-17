/**
 * Offered actions that are provably worse than passing, which the scorer's
 * seat never plays.
 *
 * Pruned before the model's choice rather than learned: these are facts about
 * the rules, not judgement, and a small model trained mostly by imitation and
 * win/loss reward can keep a rare mistake for a long time. Every entry needs a
 * dominance argument, and each is checked against the engine itself: the
 * attack rule by `ml/bridge/attack-audit.ts`, which declares
 * every candidate on a copy of the state and reports anything that fired, and
 * the rest by playing both answers in `test/scorer-dominance.test.ts`.
 */
import { isAsideCounter } from "../aside-counters.js";
import { donCountReaders } from "@one-piece-sim/engine-core";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { turnStart } from "./render.js";

/**
 * A Character attack that fails against the board as it stands and whose
 * declaration can trigger nothing on the attacker.
 *
 * Strictly worse than not attacking: the defender spends nothing, and the
 * attacker is left rested -- unable to block on the next turn and a legal
 * attack target itself. Exempt:
 * - a Leader, which loses nothing by declaring (see `attackerIsLeader`);
 * - an attacker whose derived rules print `[When Attacking]` (the clause can
 *   raise its power or do something else worth the swing) or `[Your Turn]`
 *   (where "when this Character becomes rested" lives: ST32-003 draws and
 *   trashes when it rests, so its sure-fail swing is a card filter). The
 *   second is broader than the rest trigger it is there for, which only
 *   leaves some doomed attacks unpruned.
 */
export function isDoomedAttack(
  action: LegalAction,
  observation: GameObservation,
): boolean {
  if (action.type !== "attack" || action.attackerIsLeader) return false;
  if (action.counterShortfall !== 0) return false;
  const attacker = observation.self.board.find(
    (card) => card.instanceId === action.attackerInstanceId,
  );
  if (!attacker) return false;
  const clauses = observation.cardFacts[attacker.cardNumber]?.rules.clauses;
  if (!clauses) return false;
  return !clauses.some(
    (clause) =>
      clause.includes("When Attacking") || clause.includes("Your Turn"),
  );
}

/**
 * A Character Counter from hand that cannot save the battle, even with every
 * other Counter on offer played beside it.
 *
 * Strictly worse than passing: the attack lands either way, and the card goes
 * to the trash instead of staying in hand as a later Counter or a body. The
 * test is the whole offer rather than this card alone, so a pair of 2000s
 * against a 3001 shortfall is kept -- the first of them only looks wasted.
 * Exempt:
 * - any position offering a [Counter] Event, whose program can do more than
 *   the `counterPower` it reports (or reports none) and so can bridge a gap
 *   the sum says is out of reach;
 * - any position offering something other than a Counter or the pass, which
 *   this rule has not argued about.
 */
export function isWastedCounter(
  action: LegalAction,
  observation: GameObservation,
): boolean {
  if (action.type !== "counter") return false;
  const battle = observation.activeBattle;
  if (!battle || battle.counterShortfall === 0) return false;
  let reachable = 0;
  for (const offered of observation.legalActions) {
    // A Counter onto another card is the same hand card offered again: it adds
    // nothing to this defense.
    if (offered.type === "pass" || isAsideCounter(offered)) continue;
    if (offered.type !== "counter" || offered.counterPower === undefined) {
      return false;
    }
    reachable += offered.counterPower;
  }
  return reachable < battle.counterShortfall;
}

/**
 * The optional `DON!! −N` clauses whose whole payoff is setting their
 * controller's Leader to a base power, keyed by card, with that power.
 *
 * ST26-005 Monkey.D.Luffy prints the clause in two windows, `[On Play]` and
 * `[When Attacking]`, and "becomes 7000" replaces rather than adds, so a second
 * payment in one turn writes a setter identical to the first: same value, same
 * "until the end of your opponent's next End Phase".
 */
const LEADER_BASE_POWER_PAYMENTS: Readonly<Record<string, number>> = {
  "ST26-005": 7000,
};

let readers: ReturnType<typeof donCountReaders> | undefined;

/**
 * Accepting a Leader base-power payment that this turn has already made.
 *
 * Strictly no better than declining: the Leader's base power and its expiry
 * are unchanged, and the N DON!! leave the field. What the return could still
 * buy is ruled out case by case, from what the observation shows
 * (`donCountReaders()` sorts the cards):
 * - the Leader's own once-per-turn reaction -- OP09-061 refunds the first two
 *   DON!! returned each turn -- must already be spent (`leaderReactionSpent`)
 *   if the Leader is one that watches DON!!;
 * - the payer holds enough DON!! in the cost area that none comes off a card
 *   it was given to, which would cost that card power or a `[DON!! xN]`;
 * - no Character or Stage of the payer's reacts to the return (`reactions`);
 *   one in hand cannot, since it is not on the field when the DON!! leave;
 * - no card in the payer's hand or play is gated on holding at most N DON!!
 *   or on out-counting the opponent (`ceilings`);
 * - the DON!! deck already holds whatever the payer's ramps in hand and play
 *   could take from it (`ramps`), so refilling it feeds none of them. A ramp
 *   that pays its own `DON!! −N` refills the deck itself and is not one;
 * - no card on the opponent's field reads the payer's DON!! count
 *   (`opponent`), such as an opposing ST26-005's "your opponent has 5 or more
 *   DON!!".
 *
 * The opponent's hand is the one place left unargued, because it is hidden: a
 * Counter there that reads the payer's count could in principle care.
 * `test/scorer-dominance.test.ts` plays both answers in the engine and checks
 * they leave the Leader alike.
 */
export function isSpentLeaderOverride(
  action: LegalAction,
  observation: GameObservation,
): boolean {
  if (action.type !== "resolve-effect") return false;
  if (action.option.kind !== "confirm" || action.option.choice !== "apply") {
    return false;
  }
  const value = LEADER_BASE_POWER_PAYMENTS[action.sourceCardNumber];
  const returned = action.cost?.returnsDon;
  if (value === undefined || !returned) return false;
  const { self, opponent, viewer, publicEvents } = observation;
  if (observation.turnPlayer !== viewer) return false;
  const leaderId = `${viewer}-leader`;
  const alreadyPaid = publicEvents
    .slice(turnStart(publicEvents, viewer))
    .some(
      (event) =>
        event.type === "base-power-set" &&
        event.targetInstanceId === leaderId &&
        event.sourceCardNumber === action.sourceCardNumber &&
        event.basePower === value,
    );
  if (!alreadyPaid) return false;
  if (self.activeDon + self.restedDon < returned) return false;
  readers ??= donCountReaders();
  const { reactions, ceilings, ramps, opponent: watching } = readers;
  if (
    reactions.has(self.leader.cardNumber) &&
    !self.leader.leaderReactionSpent
  ) {
    return false;
  }
  const inPlay = [
    ...self.board.map((card) => card.cardNumber),
    ...(self.stage ? [self.stage.cardNumber] : []),
  ];
  if (inPlay.some((card) => reactions.has(card))) return false;
  const held = [
    self.leader.cardNumber,
    ...inPlay,
    ...self.hand.map((card) => card.cardNumber),
  ];
  if (held.some((card) => ceilings.has(card))) return false;
  const rampDemand = held.reduce(
    (sum, card) => sum + (ramps.get(card) ?? 0),
    0,
  );
  if (rampDemand > self.donDeckCount) return false;
  const theirs = [
    opponent.leader.cardNumber,
    ...opponent.board.map((card) => card.cardNumber),
    ...(opponent.stage ? [opponent.stage.cardNumber] : []),
  ];
  return !theirs.some((card) => watching.has(card));
}

/** Indices of the offered actions the seat never plays. */
export function prunedActions(observation: GameObservation): Set<number> {
  const pruned = new Set<number>();
  observation.legalActions.forEach((action, index) => {
    if (
      isAsideCounter(action) ||
      isDoomedAttack(action, observation) ||
      isWastedCounter(action, observation) ||
      isSpentLeaderOverride(action, observation)
    ) {
      pruned.add(index);
    }
  });
  // Never prune everything; passing is always offered where an attack or a
  // Counter is, and an optional clause always offers its skip, but a filter
  // should not be the thing that finds out otherwise.
  return pruned.size === observation.legalActions.length ? new Set() : pruned;
}
