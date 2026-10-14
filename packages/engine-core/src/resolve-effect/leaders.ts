/**
 * Leader abilities whose resolution suspends: the two defensive ones, and the two end-of-turn ones.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import { returnDonToDeck } from "../don.js";
import {
  applyPowerModifier,
  effectSource,
  leaderInstanceId,
  opponentOf,
} from "../effects.js";
import { flipLife } from "../life.js";
import { recordDeckTopKnowledge } from "../queries.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `nami-leader`. */
export function resolveNamiLeader({
  state,
  effect,
  optionId,
}: EffectContext<"nami-leader">): PublicEvent[] {
  if (optionId === "skip") {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
    return [];
  }
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [discard] = player.hand.splice(handIndex, 1);
  if (!discard) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  player.trash.push(discard);
  applyPowerModifier(
    state,
    effect.playerId,
    leaderInstanceId(effect.playerId),
    2000,
    state.turn,
    {
      instanceId: effect.sourceInstanceId,
      cardNumber: effect.sourceCardNumber,
    },
  );
  state.oncePerTurn.push(`${state.turn}:${effect.playerId}:OP11-041-def`);
  state.phase = effect.resumePhase;
  state.activePlayer = effect.resumePlayerId;
  return [
    {
      // The cost card leaves a hand for a public trash, so both seats are
      // entitled to know which one it was -- without this step the opponent
      // only ever saw the power-changed event's own name.
      type: "card-moved",
      playerId: effect.playerId,
      cardInstanceId: discard.instanceId,
      cardNumber: discard.cardNumber,
      from: "hand",
      to: "trash",
      sourceCardNumber: effect.sourceCardNumber,
    },
    {
      type: "power-changed",
      playerId: effect.playerId,
      targetInstanceId: leaderInstanceId(effect.playerId),
      amount: 2000,
      expiresAtTurn: state.turn,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
    },
  ];
}

/** `katakuri-leader`. */
export function resolveKatakuriLeader({
  state,
  effect,
  optionId,
}: EffectContext<"katakuri-leader">): PublicEvent[] {
  if (optionId === "skip") {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
    return [];
  }
  if (optionId !== "apply" || !state.activeAttack) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const events: PublicEvent[] = [];
  returnDonToDeck(state, effect.playerId, 1, effectSource(effect), events);
  // "[printed text omitted -- pnpm card:text <card>]" -- a battle, not a turn.
  // Both ends of the battle carry it on `activeAttack`, which is exactly one
  // battle long: the attacker's battle bonus when Katakuri is attacking, the
  // defender's counter power when it is defending. It used to be written as a
  // power modifier expiring at the end of the turn, which left the Leader
  // defending every later attack that turn at 6000 -- compare OP11-041, whose
  // +2000 is printed "during this turn" and is correctly turn-scoped.
  if (state.activeAttack.attackerPlayerId === effect.playerId) {
    state.activeAttack.battleAttackBonus += 1000;
  } else {
    state.activeAttack.counterPower += 1000;
  }
  state.oncePerTurn.push(`${state.turn}:${effect.playerId}:OP11-062`);
  state.phase = effect.resumePhase;
  state.activePlayer = effect.resumePlayerId;
  const revealed = state.players[opponentOf(effect.playerId)].deck[0];
  // Katakuri's Leader ability is "look at", not "reveal": only the Leader's
  // controller learns the card, and only they get the event.
  recordDeckTopKnowledge(state, effect.playerId, opponentOf(effect.playerId));
  return [
    ...events,
    {
      type: "power-changed",
      playerId: effect.playerId,
      targetInstanceId: leaderInstanceId(effect.playerId),
      amount: 1000,
      expiresAtTurn: state.turn,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
    },
    ...(revealed
      ? [
          {
            type: "card-revealed" as const,
            playerId: effect.playerId,
            cardNumber: revealed.cardNumber,
            sourceCardNumber: effect.sourceCardNumber,
            visibleTo: effect.playerId,
          },
        ]
      : []),
  ];
}

/** `kid-leader-end-turn`. */
export function resolveKidLeaderEndTurn({
  state,
  effect,
  optionId,
}: EffectContext<"kid-leader-end-turn">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const life = player.life[0];
  const target = player.board.find((card) => card.instanceId === optionId);
  if (!life || !target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  const flipped = flipLife(
    state,
    effect.playerId,
    life.instanceId,
    true,
    effect.sourceCardNumber,
  );
  target.rested = false;
  target.blockerUntilTurn = state.turn + 1;
  return flipped;
}

/** `borsalino-end-turn`. */
export function resolveBorsalinoEndTurn({
  state,
  effect,
  optionId,
}: EffectContext<"borsalino-end-turn">): PublicEvent[] {
  const mark = (instanceId: string) =>
    state.oncePerTurn.push(
      `${state.turn}:${effect.playerId}:${instanceId}:borsalino-end-turn`,
    );
  if (optionId === "skip") {
    // Declining answers the whole window, not just this copy's prompt --
    // otherwise skipping would re-ask for every remaining Borsalino.
    effect.eligibleInstanceIds.forEach(mark);
    return [];
  }
  mark(optionId);
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const target = state.players[effect.playerId].board.find(
    (card) => card.instanceId === optionId,
  );
  if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  const events: PublicEvent[] = [];
  returnDonToDeck(state, effect.playerId, 2, effectSource(effect), events);
  target.rested = false;
  target.blockerUntilTurn = state.turn + 1;
  return events;
}
