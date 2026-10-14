import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  attackerPower,
  chooseGenericBlock,
  chooseGenericCounter,
  chooseGenericTrigger,
  decision,
  opponentLeaderId,
  pass,
  selfLeaderId,
  viableAttacks,
  type AttackAction,
  type PolicyDecision,
} from "../generic-policy.js";
import {
  cardNumberForPlay,
  chooseSt32Effect,
  opponentThreatValue,
  ST32_KEEPABLE_OPENERS,
  ST32_PROTECTED_CARDS,
  type PlayAction,
} from "./st32-cards.js";
import type { RulesPolicy } from "../policy-chain.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import { tacticsFor } from "../tactics.js";

const ST32_LEADER = "OP12-020";

/** The opening hand: one of the openers this deck can actually curve out of. */
export function createSt32MulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st32-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        ST32_KEEPABLE_OPENERS.has(card.cardNumber),
      ),
    keepBecause: "Keep a functional ST32 opener.",
    mulliganBecause: "Mulligan for an ST32 engine piece.",
  });
}

/** DON!! the Leader needs before its `[DON!! x3]` restand is switchable on. */
const ZORO_RESTAND_DON = 3;

/**
 * ST32's deck policy.
 *
 * The ordering is the whole content of this file, and it is derived from one
 * fact about the deck that the previous version had backwards: Tashigi and Kuina
 * pay the Leader out of the **rested** DON!! pool, and DON!! becomes rested by
 * being *spent*. See `st32-cards.ts` for the full reasoning. Concretely, the
 * turn goes:
 *
 *  1. Take the restand the moment it is earned, and attack with a Leader that
 *     already has its three DON!!, before an optional cost can rest it.
 *  2. **Develop.** This is also what fills the rested DON!! pool.
 *  3. Activate Kuina and Hiyori, which now have rested DON!! to convert.
 *  4. Only then put surplus *active* DON!! on the Leader, and only what is
 *     surplus to the next play.
 *  5. Attack: Leader into a Character to earn the restand, then Characters.
 *
 * The previous ladder ran 4, 3, 5, 2 in that order. It attached three active
 * DON!! to the Leader before considering a single play, which capped development
 * at whatever was left; then it activated Kuina at a point in the turn where the
 * rested pool was still empty, so the ability that exists to pay for the Leader
 * paid it nothing.
 *
 * ## Why this one is still a ladder
 *
 * Issue #170 is about dissolving these six ST ladders into `heuristics()` rules,
 * and this deck is the case where most of the ladder has to stay. Every numbered
 * step above is a judgement *between action types* -- a play beats an
 * attachment, an attachment beats an attack -- and `rank` only ever compares
 * candidates of one type, so there is no tier in `heuristics.ts` that can say
 * any of it. `Heuristic.tier` states that limitation directly. The sequence is
 * also this deck's measured 35.2% -> 66.4%, so it is the last thing to guess at.
 *
 * What did move is the part that was a *preference among candidates of one
 * kind*: which play to make at step 3. That was one `scoreSt32Play` function
 * carrying six unmeasured card claims, and it is now
 * {@link ST32_PLAY_RULES} -- six named rules, each priceable on its own. Step 3
 * reads the first surviving play, because the rules have already ordered them.
 *
 * The effect decisions in `chooseSt32Effect` are the other candidate and are
 * deliberately left alone for now: unlike ST-35's, they are already split by
 * `effectKind`, one branch per question, which is the shape the coverage gate
 * wants. They are a migration on their own with its own measurement.
 */
export function createSt32RulesPolicy(): RulesPolicy {
  return (observation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== ST32_LEADER) return undefined;
    const actions = observation.legalActions;
    if (actions.length === 1)
      return decision(actions[0]!, "Only one legal action is available.");

    const effects = actions.filter(
      (action): action is Extract<LegalAction, { type: "resolve-effect" }> =>
        action.type === "resolve-effect",
    );
    if (effects.length > 0) return chooseSt32Effect(observation, effects);

    const trigger = chooseGenericTrigger(actions);
    if (trigger) return trigger;
    const block = chooseGenericBlock(observation, actions);
    if (block) return block;
    if (observation.phase === "counter") {
      return chooseGenericCounter(observation, actions, {
        protectedCards: ST32_PROTECTED_CARDS,
      });
    }
    if (observation.phase !== "main") return undefined;

    const leaderId = selfLeaderId(observation);

    // 1. The restand is once per turn and already paid for; take it immediately.
    const zoroRestand = actions.find(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === ST32_LEADER &&
        action.sourceInstanceId === leaderId,
    );
    if (zoroRestand)
      return decision(zoroRestand, "Use Zoro's earned once-per-turn restand.");

    // 2. A Leader holding its three DON!! attacks now. Several of ST32's own
    //    optional costs rest the Leader, and a rested Leader cannot attack, so
    //    the attack is spent before anything can take it away.
    if (observation.self.leader.attachedDon >= ZORO_RESTAND_DON) {
      const leaderAttack = chooseSt32Attack(observation, actions, leaderId);
      if (leaderAttack) return leaderAttack;
    }

    // 3. Develop. Bodies matter on their own, and paying for them is what moves
    //    DON!! into the rested pool that Kuina and Tashigi convert into Leader
    //    DON!! for free.
    //    Which play is `ST32_PLAY_RULES`' business, not this ladder's: those
    //    rules run before any `decide` module and have already narrowed the
    //    offered plays to their best, so taking the first survivor here is
    //    taking their answer. What stays here is the *sequencing* claim -- that
    //    a play comes before an attachment and after the restand -- which is
    //    the one thing `rank` cannot say.
    const play = actions.find(
      (action): action is PlayAction => action.type === "play-card",
    );
    if (play) {
      return decision(
        play,
        `Develop ${cardNumberForPlay(observation, play) ?? "the best line"} before spending DON!! on power.`,
      );
    }

    // 4. Now the rested pool has something in it, so the engines pay out.
    const repeatableActivation = actions.find(
      (action) =>
        action.type === "activate-main" &&
        ["OP12-026", "OP12-028"].includes(action.sourceCardNumber) &&
        action.targetInstanceId !== "none",
    );
    if (repeatableActivation) {
      return decision(
        repeatableActivation,
        "Convert rested DON!! into Leader DON!! now that this turn's costs are paid.",
      );
    }

    // 5. Whatever active DON!! is left, up to the three the ability needs. The
    //    engines above are cheaper, which is why this comes after them and not
    //    before: an active DON!! here is one that could not buy anything else.
    //
    //    Only if the three are actually reachable this turn, though. The DON!!
    //    buys an ability, not power, and one or two of them buy no ability at
    //    all: against a 5000 Leader, 6000 and 5000 both cost the defender a
    //    single Counter card, so a Leader stranded on one attachment has spent a
    //    DON!! for nothing. When it cannot get there, the spare DON!! goes to
    //    whichever attacker it buys the most Counter pressure on instead.
    const leaderAttached = observation.self.leader.attachedDon;
    if (
      leaderAttached < ZORO_RESTAND_DON &&
      leaderAttached + observation.self.activeDon >= ZORO_RESTAND_DON
    ) {
      const leaderAttachment = actions.find(
        (action) =>
          action.type === "attach-don" && action.targetInstanceId === leaderId,
      );
      if (leaderAttachment)
        return decision(
          leaderAttachment,
          "Spend leftover DON!! toward the Leader's three-DON!! restand.",
        );
    }

    const leaderAttack = chooseSt32Attack(observation, actions, leaderId);
    if (leaderAttack) return leaderAttack;

    // The Event restand is worth a card only once the Leader has actually used
    // its attack, so it is checked after the Leader attack rather than with the
    // other activations.
    const eventRestand = actions.find(
      (action) =>
        action.type === "activate-main" &&
        action.sourceCardNumber === "OP12-039",
    );
    if (eventRestand && observation.self.leader.rested) {
      return decision(
        eventRestand,
        "Spend the Event restand only after the Leader's first attack.",
      );
    }

    // Spare DON!! goes on before the attack it is meant to improve, not after.
    // An attachment made once every attack has been declared is power that never
    // swings.
    const worthwhile = bestThresholdAttachment(observation, actions);
    if (worthwhile && worthwhile.gain > 0)
      return decision(
        worthwhile.action,
        "Attach DON!! where it forces another Counter card out of the defender.",
      );

    const characterAttack = chooseSt32Attack(observation, actions);
    if (characterAttack) return characterAttack;

    const activation = actions.find(
      (action) =>
        action.type === "activate-main" && action.targetInstanceId !== "none",
    );
    if (activation)
      return decision(activation, "Use the remaining ST32 activation.");

    const attachment = bestThresholdAttachment(observation, actions);
    if (attachment)
      return decision(
        attachment.action,
        "Convert the last DON!! into attack power for an ST32 attacker.",
      );

    return decision(
      pass(actions),
      "No remaining action improves development, pressure, or defense.",
    );
  };
}

/**
 * The spare-DON!! attachment that forces the most Counter cards.
 *
 * Power is continuous but Counter is not: it is spent in whole cards, so against
 * a 5000 Leader an attack of 5000 and one of 6000 both cost the defender one
 * card, while 7000 costs two. A DON!! added to a 6000 body therefore buys a card
 * out of the opponent's hand and the same DON!! added to a 5000 body buys
 * nothing. Targets that cannot attack this turn are skipped for the same reason:
 * power they never swing with is not pressure.
 *
 * The arithmetic comes from `tactics.ts` rather than being written out again
 * here, because a second copy of it with slightly different rounding is exactly
 * the drift that file exists to prevent.
 */
function bestThresholdAttachment(
  observation: GameObservation,
  actions: readonly LegalAction[],
): { action: LegalAction; gain: number } | undefined {
  const t = tacticsFor(observation);
  const gain = (
    action: Extract<LegalAction, { type: "attach-don" }>,
  ): number => {
    if (!t.canAttack(action.targetInstanceId)) return -1;
    const power = t.ownCurrentPower(action.targetInstanceId);
    if (power === undefined) return -1;
    return (
      t.cardsToSurviveLeaderHit(power + 1_000) -
      t.cardsToSurviveLeaderHit(power)
    );
  };
  return actions
    .filter(
      (action): action is Extract<LegalAction, { type: "attach-don" }> =>
        action.type === "attach-don",
    )
    .map((action) => ({ action, gain: gain(action) }))
    .sort((left, right) => right.gain - left.gain)[0];
}

/**
 * Pick an attack, optionally restricted to one attacker.
 *
 * The Leader prefers a Character over the opposing Leader because battling a
 * Character is what earns the restand, and a restand is a whole extra attack --
 * worth more than the one point of Life the direct attack would have taken. Two
 * conditions narrow that:
 *
 *  - **The restand has to be reachable.** Without three DON!! attached there is
 *    no ability to earn, so the Leader is just an attacker and takes the Life.
 *  - **It has to be unspent.** The engine records `battled-character` on attack
 *    *declaration*, before it compares power, so the restand is earned whether or
 *    not the battle is won -- which makes even a losing Character battle correct
 *    while the ability is available. `restandUnspent` reads that off the offered
 *    targets rather than guessing: a used restand forbids the Leader from
 *    attacking Characters with a base cost of 7 or less, so still being offered
 *    one is proof the ability has not fired this turn.
 */
function chooseSt32Attack(
  observation: GameObservation,
  actions: readonly LegalAction[],
  onlyAttacker?: string,
): PolicyDecision | undefined {
  const scoped = onlyAttacker
    ? actions.filter(
        (action) =>
          action.type !== "attack" ||
          action.attackerInstanceId === onlyAttacker,
      )
    : actions;
  const attacks = viableAttacks(observation, scoped);
  const leaderId = selfLeaderId(observation);
  const opponentLeader = opponentLeaderId(observation);
  const restandReachable =
    observation.self.leader.attachedDon >= ZORO_RESTAND_DON;

  const characterValue = new Map(
    observation.opponent.board.map((card) => [
      card.instanceId,
      opponentThreatValue(card),
    ]),
  );
  const opponentCost = new Map(
    observation.opponent.board.map((card) => [card.instanceId, card.cost]),
  );
  const everyLeaderCharacterAttack = scoped.filter(
    (action): action is AttackAction =>
      action.type === "attack" &&
      action.attackerInstanceId === leaderId &&
      action.targetInstanceId !== opponentLeader,
  );
  const restandUnspent = everyLeaderCharacterAttack.some(
    (action) => (opponentCost.get(action.targetInstanceId) ?? 0) <= 7,
  );
  if (restandReachable && restandUnspent) {
    // A won battle removes a body as well as earning the restand, so take one
    // when it exists; otherwise any Character will do, because the ability is
    // paid on declaration.
    const winnable = attacks.filter((action) =>
      everyLeaderCharacterAttack.includes(action),
    );
    const earnsRestand = (
      winnable.length > 0 ? winnable : everyLeaderCharacterAttack
    ).sort(
      (left, right) =>
        (characterValue.get(right.targetInstanceId) ?? 0) -
        (characterValue.get(left.targetInstanceId) ?? 0),
    )[0];
    if (earnsRestand)
      return decision(
        earnsRestand,
        winnable.length > 0
          ? "Battle the most valuable Character to earn Zoro's restand."
          : "Battle a Character to earn Zoro's restand, which is paid on declaration rather than on winning.",
      );
  }
  if (attacks.length === 0) return undefined;

  const leaderPressure = attacks
    .filter((action) => action.targetInstanceId === opponentLeader)
    .sort(
      (left, right) =>
        attackerPower(observation, left) - attackerPower(observation, right),
    )[0];
  if (leaderPressure) {
    return decision(
      leaderPressure,
      "Use the smallest attack that still connects, keeping the larger ones back.",
    );
  }
  const bestTrade = [...attacks].sort(
    (left, right) =>
      (characterValue.get(right.targetInstanceId) ?? 0) -
      (characterValue.get(left.targetInstanceId) ?? 0),
  )[0];
  if (!bestTrade) return undefined;
  return decision(bestTrade, "Take the most valuable remaining trade.");
}
