import type { GameObservation } from "@one-piece-sim/protocol";

/**
 * The format's combat arithmetic, in one place.
 *
 * This module is a leaf: it imports nothing from the policy layer, so both
 * `generic-policy.ts` (which decides) and `tactics.ts` (which describes) can
 * depend on it without a cycle.
 *
 * It exists because the alternative was measured and rejected. `tactics.ts`
 * carried a standing comment refusing to add a defence forecast, on the grounds
 * that `generic-policy.ts` already had one and "a second implementation with
 * slightly different semantics is exactly the failure this file exists to
 * stop". That reasoning was right, and the fix it implies is this: move the one
 * implementation somewhere both layers can reach, rather than leaving the
 * vocabulary permanently missing a word.
 */

/** The largest single Counter card in the format. */
export const MAX_COUNTER_STEP = 2_000;

/**
 * Power the defender must add to survive an attack. Zero when already safe.
 *
 * The attacker wins ties -- a 5000 attack beats a 5000 defender -- so the
 * defender must exceed, not match, hence the `+ 1`.
 */
export function counterDemand(
  attackPower: number,
  defensePower: number,
): number {
  return Math.max(0, attackPower - defensePower + 1);
}

/**
 * Counter *cards* needed to meet a demand.
 *
 * Counter comes in 1000 and 2000 steps, so this is the resource that actually
 * runs out. Raising an attack from 5000 to 6000 does not add 1000 of pressure;
 * it adds a whole extra card out of the defender's hand.
 */
export function counterCardsNeeded(demand: number): number {
  return demand <= 0 ? 0 : Math.ceil(demand / MAX_COUNTER_STEP);
}

/**
 * Counter cards the *hand in front of you* must spend to meet a demand.
 *
 * {@link counterCardsNeeded} prices the same demand at the format's largest
 * step, which makes it a lower bound: it answers "how few cards could this
 * possibly cost", which is the right question for the attacker, who cannot see
 * the defending hand. It is the wrong question for the defender, who is holding
 * the cards and is about to pay. A shortfall of 2001 is two cards only if two
 * 2000-Counters are actually there; out of a hand of 1000s it is three, and
 * `counter-budget` -- the rule whose whole purpose is to refuse a line worth
 * more than the Life it saves -- let exactly that through, because it asked the
 * attacker's question on the defender's behalf.
 *
 * `steps` is the Counter power of each card that could be spent on this battle,
 * in any order; they are taken biggest-first, which is the line that meets the
 * demand in the fewest cards. Returns `Infinity` when the whole hand cannot
 * close the gap, which is a real state and the one case where "how many cards"
 * has no answer -- a caller comparing against a budget then refuses, correctly,
 * since no line exists to buy.
 */
export function counterCardsFromHand(
  steps: readonly number[],
  demand: number,
): number {
  if (demand <= 0) return 0;
  let remaining = demand;
  let spent = 0;
  for (const step of [...steps].sort((left, right) => right - left)) {
    if (remaining <= 0) break;
    if (step <= 0) continue;
    remaining -= step;
    spent += 1;
  }
  return remaining > 0 ? Number.POSITIVE_INFINITY : spent;
}

/**
 * Life one successful Leader hit from this attacker takes.
 *
 * Two whenever the attacker has [Double Attack], one otherwise. Counting
 * *attacks* instead treats an attack and a Life as the same thing, which eight
 * cards in the format contradict -- and one shipped deck, the OP-17 Red Ace
 * list, runs four copies of OP16-003 Edward.Newgate, so a policy counting
 * attacks cannot see its own win condition.
 *
 * Reads `effectiveKeywords`, so it does not care whether the keyword is
 * printed, conditional, granted for the turn, or handed over by another card's
 * aura.
 */
export function leaderHitDamage(attacker: {
  readonly effectiveKeywords: readonly string[];
}): number {
  return attacker.effectiveKeywords.includes("Double Attack") ? 2 : 1;
}

/**
 * Life one of the viewer's own attackers would take off the opposing Leader.
 *
 * Resolves the instance id the way every attack-pricing helper does -- the
 * viewer's Leader, else a Character on their board -- and prices it in Life. An
 * attacker that is somehow neither reads as 1, matching `attackerPower`, which
 * reads such an id as 0 power rather than throwing.
 */
export function ownAttackerLeaderDamage(
  observation: GameObservation,
  attackerInstanceId: string,
): number {
  if (attackerInstanceId === `${observation.viewer}-leader`) {
    return leaderHitDamage(observation.self.leader);
  }
  const card = observation.self.board.find(
    (candidate) => candidate.instanceId === attackerInstanceId,
  );
  return card ? leaderHitDamage(card) : 1;
}

/**
 * Whether a set of Leader attacks, priced in Life, actually ends the game.
 *
 * Not `damage >= life`, and not `damage > life` either. A battle wins in
 * exactly one way: an attack is *declared* against a player who is already on
 * 0 Life. So a kill needs enough attacks to empty the Life stack **and one
 * more to declare**.
 *
 * [Double Attack] is where a sum of damages stops answering this. Each of its
 * two points checks a Life card, so against a defender on 1 Life it takes that
 * card and the second point does nothing -- Bandai's rules Q&A, quoted at
 * `settleDoubleAttackDamage` in `engine-core`. A single such attacker therefore
 * reads as 2 damage against 1 Life and is not lethal at all, which is the shape
 * that made a defender at 1 Life spend its whole hand on a hit it survives.
 *
 * `damages` is taken biggest-first, which is the ordering that empties the Life
 * stack in the fewest attacks and so leaves the most over to declare with.
 * Whether the stack empties at all does not depend on the order; whether an
 * attack is left over does.
 *
 * Every caveat on the count that produced `damages` still applies -- Counter
 * cards and Blockers are hidden, so this is an upper bound on the attacker's
 * side and an optimistic bound on the defender's.
 */
export function attacksAreLethal(
  damages: readonly number[],
  life: number,
): boolean {
  if (life <= 0) return damages.length > 0;
  let remaining = life;
  let used = 0;
  for (const damage of [...damages].sort((a, b) => b - a)) {
    if (remaining <= 0) break;
    remaining -= Math.min(damage, remaining);
    used += 1;
  }
  return remaining <= 0 && used < damages.length;
}

/**
 * Life each attack the opponent could still aim at the viewer's Leader would
 * take, one entry per attack.
 *
 * The same scan {@link incomingLeaderDamage} totals, kept as a list because
 * {@link attacksAreLethal} cannot be answered from a sum: two 1-damage
 * attackers and one [Double Attack] attacker both come to 2, and only one of
 * them can win from 1 Life.
 */
export function incomingLeaderDamages(observation: GameObservation): number[] {
  return [
    ...(observation.opponent.leader.rested
      ? []
      : [leaderHitDamage(observation.opponent.leader)]),
    ...observation.opponent.board
      .filter(
        (card) =>
          !card.rested &&
          card.playedTurn !== observation.turn &&
          card.currentPower >= observation.self.leader.currentPower,
      )
      .map((card) => leaderHitDamage(card)),
  ];
}

/**
 * Whether anything on the opponent's side can still declare an attack this
 * turn.
 *
 * The pessimistic counterpart of {@link incomingLeaderAttacks}, and the two are
 * asked for opposite reasons. That one counts *threats* -- attackers big enough
 * to be worth pricing -- and may safely under-count, because a rule reading it
 * spends a resource on defence. This one is read by a rule that gives defence
 * *up*, so it must over-count: every doubt resolves to "yes, an attack is
 * left", and the rule it gates simply does not fire.
 *
 * Hence no power comparison and no [Blocker] reasoning: a 1000-power Character
 * swinging into a Leader is still an attack a power boost could turn away, and
 * a Character that will attack a Character rather than the Leader is one this
 * must not miss. Only the three things that make an attack impossible are
 * read -- already rested, summoning sick, or held down by an effect -- each of
 * which the observation states outright.
 */
export function opponentCanStillAttack(observation: GameObservation): boolean {
  if (!observation.opponent.leader.rested) return true;
  return observation.opponent.board.some((card) =>
    characterCanStillAttack(observation, card),
  );
}

/**
 * Whether one opposing Character still has an attack left in this turn.
 *
 * The per-unit half of {@link opponentCanStillAttack}, which asks the same
 * question of the whole side. A rule that aims something at *one* body -- a
 * debuff that expires at end of turn, say -- needs the answer about that body:
 * the side having an attack left says nothing about whether this card is the
 * one that has it.
 *
 * Attacking rests the attacker, so a body barred from resting has no attack
 * even while it reads as active; that is the same reading `st31-policy.ts`
 * arrived at from the other direction.
 */
export function characterCanStillAttack(
  observation: GameObservation,
  card: GameObservation["opponent"]["board"][number],
): boolean {
  return (
    !card.rested &&
    card.summoningSick !== true &&
    !(
      card.cannotAttackUntilTurn !== undefined &&
      card.cannotAttackUntilTurn >= observation.turn
    ) &&
    !(
      card.cannotRestUntilTurn !== undefined &&
      card.cannotRestUntilTurn >= observation.turn
    )
  );
}

/**
 * How many attacks the opponent could aim at the viewer's Leader on their next
 * turn.
 *
 * Counts the opposing Leader (unless already rested) plus every opposing
 * Character that is active, was not summoned this turn -- summoning sickness
 * means it could not have attacked anyway -- and hits at least as hard as the
 * viewer's Leader currently defends.
 *
 * This is a **count of threats, not a forecast**. It deliberately does not
 * price restands, Counter Events, power-ups from DON!! the opponent has not
 * attached yet, or Blockers the viewer might still deploy.
 *
 * Read during the opponent's *own* turn -- which is when the Counter and Block
 * policies read it -- it is an **optimistic** bound for the defender, not a
 * pessimistic one, and it decays toward 0 as that turn proceeds: every attacker
 * that has already swung is rested, and Characters the opponent has the DON!!
 * to deploy are not on the board to be counted at all. Callers must not treat a
 * 0 here as "no further danger"; `mustPreventCurrentLeaderHit` compensates by
 * testing against reaching 0 Life rather than against being hit past it.
 */
export function incomingLeaderAttacks(observation: GameObservation): number {
  const activeLeader = observation.opponent.leader.rested ? 0 : 1;
  const activeCharacters = observation.opponent.board.filter(
    (card) =>
      !card.rested &&
      card.playedTurn !== observation.turn &&
      card.currentPower >= observation.self.leader.currentPower,
  ).length;
  return activeLeader + activeCharacters;
}

/**
 * Life {@link incomingLeaderAttacks} would take if every one of those attacks
 * landed.
 *
 * The same count, priced in Life rather than in swings. Read during the
 * opponent's own turn -- which is when the Counter and Block policies read it --
 * a `[Your Turn]` keyword layer on their side is switched on, so the pricing is
 * exact there; every caveat on the attack count applies to this unchanged.
 */
export function incomingLeaderDamage(observation: GameObservation): number {
  const leader = observation.opponent.leader.rested
    ? 0
    : leaderHitDamage(observation.opponent.leader);
  const characters = observation.opponent.board
    .filter(
      (card) =>
        !card.rested &&
        card.playedTurn !== observation.turn &&
        card.currentPower >= observation.self.leader.currentPower,
    )
    .reduce((total, card) => total + leaderHitDamage(card), 0);
  return leader + characters;
}

/**
 * Attacks the opponent's refreshed board could aim at the viewer's Leader next
 * turn.
 *
 * Where {@link incomingLeaderAttacks} counts what can still swing *this* turn --
 * and therefore decays to 0 as the turn proceeds -- this counts what the board
 * becomes after refresh: the opposing Leader plus every opposing Character that
 * hits at least as hard as the viewer's Leader. Summoning sickness and "already
 * swung this turn" are deliberately ignored: both are gone by the opponent's
 * next turn.
 *
 * Read at 1-2 Life it is the number that decides whether a hit *must* be
 * stopped: `mustPreventCurrentLeaderHit` is the "reaching 0 Life" test, and at
 * 2 Life the current hit plus this count is exactly that test. At higher Life
 * it is still useful to `tactics` as an upper bound on next-turn pressure.
 */
export function nextTurnLeaderThreats(observation: GameObservation): number {
  const characters = observation.opponent.board.filter(
    (card) => card.currentPower >= observation.self.leader.currentPower,
  ).length;
  return characters + 1; // the Leader refreshes and attacks too
}

/**
 * Life {@link nextTurnLeaderThreats} would take if every one of those attacks
 * landed.
 *
 * A floor, for one reason worth stating plainly: this is read on the viewer's
 * *own* turn, and a `[Your Turn]` layer on the opponent's side is switched off
 * while they are not the turn player. OP16-003 grants its Leader [Double
 * Attack] exactly that way, so an opponent holding one reads here as an
 * ordinary Leader and this number is 1 short per such card. Pricing it higher
 * would mean re-deriving card text the observation does not carry; a floor is
 * the honest failure, and it errs in the same direction as every other caveat
 * on the count this wraps.
 */
export function nextTurnLeaderDamage(observation: GameObservation): number {
  return (
    leaderHitDamage(observation.opponent.leader) +
    observation.opponent.board
      .filter(
        (card) => card.currentPower >= observation.self.leader.currentPower,
      )
      .reduce((total, card) => total + leaderHitDamage(card), 0)
  );
}
