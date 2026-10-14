/**
 * DON!! moved by an effect rather than by the turn's own attachment.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import {
  donReturnHasChoice,
  donReturnPools,
  placeReturnedDon,
} from "../don.js";
import { leaderInstanceId } from "../effects.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `return-don`. */
export function resolveReturnDon({
  state,
  effect,
  optionId,
}: EffectContext<"return-don">): PublicEvent[] {
  const pool = optionId.slice("return-don:".length);
  if (
    !optionId.startsWith("return-don:") ||
    !donReturnPools(
      state,
      effect.playerId,
      effect.origins,
      effect.onFieldAtPayment,
    ).includes(pool)
  ) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const origins = placeReturnedDon(
    state,
    effect.playerId,
    effect.origins,
    pool,
    effect.onFieldAtPayment,
  );
  // Keep asking while a pick could still move a DON!!. Once none can, the
  // remaining DON!! are already sitting where they have to have come from and
  // there is nothing left to decide.
  if (
    origins.length > 0 &&
    donReturnHasChoice(state, effect.playerId, origins, effect.onFieldAtPayment)
  ) {
    state.pendingEffect = { ...effect, origins };
    return [];
  }
  state.pendingEffect = effect.displaced;
  state.phase = effect.resumePhase;
  state.activePlayer = effect.resumePlayerId;
  return [];
}

/** `give-rested-don`. */
export function resolveGiveRestedDon({
  state,
  effect,
  optionId,
}: EffectContext<"give-rested-don">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const pool = effect.from === "active" ? player.activeDon : player.restedDon;
  const moved = pool.splice(0, Math.min(effect.maxCount, pool.length));
  if (optionId === leaderInstanceId(effect.playerId)) {
    player.leaderAttachedDon.push(...moved);
  } else {
    const target = player.board.find((card) => card.instanceId === optionId);
    if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
    target.attachedDon ??= [];
    target.attachedDon.push(...moved);
  }
  const eligibleInstanceIds = effect.eligibleInstanceIds.filter(
    (candidate) => candidate !== optionId,
  );
  if (
    (effect.remainingTargets ?? 1) > 1 &&
    eligibleInstanceIds.length > 0 &&
    pool.length > 0
  ) {
    state.pendingEffect = {
      ...effect,
      eligibleInstanceIds,
      remainingTargets: (effect.remainingTargets ?? 1) - 1,
    };
  }
  return [
    {
      type: "don-attached",
      playerId: effect.playerId,
      targetInstanceId: optionId,
      count: moved.length,
      sourceCardNumber: effect.sourceCardNumber,
    },
  ];
}
