/**
 * The [Trigger] offer on a Life card an attack just took.
 *
 * One of the per-phase offer generators `getLegalActions` dispatches to.
 */
import {
  getTriggerMechanicProgram,
  triggerProgramCanAct,
} from "../card-mechanics.js";
import {
  actionCardLabel,
  couldAttackThisTurn,
  effectiveBoardCost,
  leaderInstanceId,
  opponentOf,
} from "../board.js";
import {
  programBuffsOwnPowerForTheTurn,
  programSelectsNothing,
} from "../mechanics.js";
import { donAddedByOptionalPayoff } from "./action-costs.js";
import { type CardInstance, type GameState } from "../model.js";
import { hasCardType } from "@one-piece-sim/cards";
import { type LegalAction, type PlayerId } from "@one-piece-sim/protocol";

/**
 * The triggers whose whole effect is a power change that expires with the turn,
 * aimed at the attacker's side of the table.
 *
 * They are the ones that can be resolved onto a target and change nothing, so
 * they are the ones whose offer says whether the target can still attack. The
 * list is explicit rather than sniffed out of the printed text because "power
 * ... during this turn" also describes OP12-039, which buffs the *defender's*
 * own cards. A structured model of what a clause does would let this be
 * derived; while effects are programs, naming the two is honest.
 */
const POWER_FOR_THE_TURN_TRIGGERS = new Set(["OP04-016", "OP13-021"]);

/**
 * The same shape aimed the other way: the whole effect is a power boost to the
 * defender's own cards, expiring with the turn.
 *
 * This used to be described above as "never inert", because the power is read
 * as defence for the rest of the opponent's turn. That is true right up to the
 * attacker's last attack, and a Trigger flips off Life damage -- which the last
 * attack of a turn deals as readily as the first. Reported on the offer as
 * `selfPowerForTheTurn` so a pilot can ask whether an attack is left.
 *
 * Only OP12-039 needs naming: it resolves imperatively in
 * `actions/resolve-trigger.ts` and has no program to read. Every other Trigger
 * of this shape is answered by `programBuffsOwnPowerForTheTurn`.
 */
const SELF_POWER_FOR_THE_TURN_TRIGGERS = new Set(["OP12-039"]);

/**
 * Which seat a targetable card sits in, from the resolving player's side.
 *
 * The removal triggers offer both boards -- `EB04-028` returns "[printed text omitted -- pnpm card:text EB04-028]" whoever owns it -- and an offer that
 * named the target `p2-card-8` did not say whose Character was about to be
 * bounced. That is the difference between a trade and a mistake, and it was not
 * in the action list.
 */
function ownerOf(state: GameState, instanceId: string): PlayerId {
  if (instanceId === leaderInstanceId("p1")) return "p1";
  if (instanceId === leaderInstanceId("p2")) return "p2";
  return state.players.p1.board.some((card) => card.instanceId === instanceId)
    ? "p1"
    : "p2";
}

/**
 * What one trigger option reads as: whose card, which card, and -- for a power
 * change that expires with the turn -- whether the target can still attack.
 *
 * The last part is the whole decision and used to be absent. A `-3000 during
 * this turn` resolved onto a Character played this turn, whose controller has
 * already attacked with a rested Leader and holds no DON!!, expires having done
 * nothing, and the alternative on the same list adds the Life card to hand. The
 * fact is stated rather than the verdict -- five words, not the sentence of
 * rules exposition this used to spend on them: an effect could still grant Rush
 * or restand the attacker, so a pilot reading "cannot attack this turn" can
 * weigh that where a pilot reading "this does nothing" cannot, and a pilot
 * reading either does not need the reason spelled out on the button.
 */
function triggerTargetSummary(
  state: GameState,
  resolvingPlayerId: PlayerId,
  cardNumber: string,
  target: string,
): string {
  const owner = ownerOf(state, target);
  const side = owner === resolvingPlayerId ? "your" : "the opponent's";
  const label = actionCardLabel(state, owner, target, true);
  const timing = POWER_FOR_THE_TURN_TRIGGERS.has(cardNumber)
    ? couldAttackThisTurn(state, owner, target)
      ? "; it can still attack this turn"
      : "; it cannot attack this turn"
    : "";
  return `Activate Trigger targeting ${side} ${label}${timing}`;
}

/**
 * Whether activating this [Trigger] would resolve nothing at all.
 *
 * `triggerProgramCanAct` is the offer gate, and it short-circuits a `min: 0`
 * selection to "can act" without asking whether the selection has a candidate:
 * an "up to 1" clause is legal whatever the board holds. That is the right
 * answer for legality and the wrong one for a pilot. Reported here so the
 * caller can tell the two apart, for the reason `activate-main.selectsNothing`
 * gives -- a "when a [Trigger] activates" clause reads the activation itself,
 * so withholding the offer would be a rules opinion.
 *
 * Only the mechanic-program Triggers can answer: the card numbers
 * `canActivateWithoutTarget` names one by one have no program to read, and
 * absent means "not known to be inert".
 */
function triggerSelectsNothing(
  state: GameState,
  playerId: PlayerId,
  card: CardInstance,
): boolean {
  const program = getTriggerMechanicProgram(card.cardNumber);
  if (!program) return false;
  return programSelectsNothing(
    state,
    { sourcePlayerId: playerId, source: card },
    program,
  );
}

/**
 * The DON!! activating this [Trigger] would add from the DON!! deck, when
 * adding it is the whole of what activating buys.
 *
 * The same fact `resolve-effect.ramps` reports, asked of the Trigger program,
 * and read off {@link donAddedByOptionalPayoff} so the two cannot disagree
 * about which programs qualify. The optional wrapper is unwrapped first: a
 * "[Trigger] You may add 1 DON!!" clause compiles to `optional(add-don)`, and
 * the acceptance inside it is what the payoff test is written against.
 *
 * The Trigger zone needs its own copy because `resolve-effect` arrives one
 * decision too late. By the time the optional is offered the card has already
 * left the Life area for the trash, so the choice `resolve-effect` still has is
 * between nothing and nothing; the choice that is worth something is this one,
 * where declining puts the card in hand instead.
 */
function donAddedByTrigger(
  cardNumber: string,
): { active: number; rested: number } | undefined {
  const program = getTriggerMechanicProgram(cardNumber);
  if (!program) return undefined;
  const effect =
    program.effect.kind === "optional" ? program.effect.effect : program.effect;
  return donAddedByOptionalPayoff(effect);
}

export function triggerActions(state: GameState): LegalAction[] {
  const trigger = state.pendingTrigger;
  if (!trigger) return [];
  const attacker = state.activeAttack?.attackerPlayerId;
  const opposingTargets = attacker
    ? [
        leaderInstanceId(attacker),
        ...state.players[attacker].board.map((card) => card.instanceId),
      ]
    : [];
  const triggerTargets =
    trigger.card.cardNumber === "OP13-021"
      ? opposingTargets.filter((target) => !target.endsWith("-leader"))
      : trigger.card.cardNumber === "OP04-016"
        ? opposingTargets
        : trigger.card.cardNumber === "OP12-039"
          ? [
              leaderInstanceId(trigger.playerId),
              ...state.players[trigger.playerId].board.map(
                (card) => card.instanceId,
              ),
            ]
          : trigger.card.cardNumber === "EB04-028"
            ? [...state.players.p1.board, ...state.players.p2.board]
                .filter((card) => effectiveBoardCost(state, card) <= 5)
                .map((card) => card.instanceId)
            : trigger.card.cardNumber === "OP02-068"
              ? [...state.players.p1.board, ...state.players.p2.board]
                  .filter((card) => effectiveBoardCost(state, card) <= 2)
                  .map((card) => card.instanceId)
              : trigger.card.cardNumber === "OP11-061"
                ? [...state.players.p1.board, ...state.players.p2.board]
                    .filter((card) => effectiveBoardCost(state, card) <= 1)
                    .map((card) => card.instanceId)
                : trigger.card.cardNumber === "OP06-058"
                  ? [...state.players.p1.board, ...state.players.p2.board]
                      .filter((card) => effectiveBoardCost(state, card) <= 5)
                      .map((card) => card.instanceId)
                  : [];
  const player = state.players[trigger.playerId];
  const attackerLife = attacker ? state.players[attacker].life.length : 99;
  // The Trigger's controller names the opponent, not the attack does: it can
  // fire inside another effect's resolution with no attack in flight at all,
  // and `actions/resolve-trigger.ts` resolves the K.O. against this same
  // expression so the offer and the resolution cannot disagree.
  const st36Targets =
    trigger.card.cardNumber === "OP12-113"
      ? state.players[opponentOf(trigger.playerId)].board
          .filter((card) => effectiveBoardCost(state, card) <= 1)
          .map((card) => card.instanceId)
      : [];
  const canActivateWithoutTarget =
    trigger.card.cardNumber === "OP10-109" ||
    trigger.card.cardNumber === "OP13-116" ||
    (trigger.card.cardNumber === "OP12-057" && player.hand.length > 0) ||
    trigger.card.cardNumber === "OP11-079" ||
    trigger.card.cardNumber === "OP11-081" ||
    triggerProgramCanAct(state, trigger.playerId, trigger.card) ||
    (trigger.card.cardNumber === "ST36-002" && attackerLife <= 3) ||
    (trigger.card.cardNumber === "P-088" &&
      hasCardType(player.leaderCardNumber, "Supernovas") &&
      player.life.length + attackerLife <= 5);
  const sourceCardNumber = trigger.card.cardNumber;
  // Only the `canActivateWithoutTarget` offer below carries it, so the probe is
  // not worth running for a Trigger that has no such offer.
  const selectsNothing =
    canActivateWithoutTarget &&
    triggerSelectsNothing(state, trigger.playerId, trigger.card);
  // Two roads to the same fact: the imperative Trigger is named, and every
  // other one is read off its program.
  const triggerProgram = getTriggerMechanicProgram(sourceCardNumber);
  const selfPowerForTheTurn =
    SELF_POWER_FOR_THE_TURN_TRIGGERS.has(sourceCardNumber) ||
    (triggerProgram !== undefined &&
      programBuffsOwnPowerForTheTurn(triggerProgram));
  const ramps = donAddedByTrigger(sourceCardNumber);
  return [
    ...[...triggerTargets, ...st36Targets].map((target) => ({
      actionId: `r${state.revision}:trigger:${target}`,
      type: "resolve-trigger" as const,
      optionId: target,
      sourceCardNumber,
      targetInstanceId: target,
      ...(selfPowerForTheTurn ? { selfPowerForTheTurn: true as const } : {}),
      summary: triggerTargetSummary(
        state,
        trigger.playerId,
        sourceCardNumber,
        target,
      ),
    })),
    ...(trigger.card.cardNumber === "OP12-113"
      ? [
          {
            actionId: `r${state.revision}:trigger:activate`,
            type: "resolve-trigger" as const,
            optionId: "activate",
            sourceCardNumber,
            summary: "Activate Trigger without K.O.ing a Character",
          },
        ]
      : []),
    ...(canActivateWithoutTarget
      ? [
          {
            actionId: `r${state.revision}:trigger:activate`,
            type: "resolve-trigger" as const,
            optionId: "activate",
            sourceCardNumber,
            ...(selectsNothing ? { selectsNothing: true as const } : {}),
            ...(selfPowerForTheTurn
              ? { selfPowerForTheTurn: true as const }
              : {}),
            ...(ramps ? { ramps } : {}),
            summary: "Activate Trigger",
          },
        ]
      : []),
    {
      actionId: `r${state.revision}:trigger:skip`,
      type: "resolve-trigger",
      optionId: "skip",
      sourceCardNumber,
      summary: "Add Life card to hand",
    },
  ];
}
