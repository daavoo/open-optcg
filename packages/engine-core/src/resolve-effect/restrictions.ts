/**
 * Turn-scoped restrictions and grants: cannot rest, cannot refresh, granted [Blocker], a power boost.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import { leaderInstanceId } from "../board.js";
import { applyPowerModifier } from "../effects.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `grant-prisoner-blocker`. */
export function resolveGrantPrisonerBlocker({
  state,
  effect,
  optionId,
}: EffectContext<"grant-prisoner-blocker">): PublicEvent[] {
  if (optionId !== "skip") {
    if (!effect.eligibleInstanceIds.includes(optionId)) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const player = state.players[effect.playerId];
    if (optionId === leaderInstanceId(effect.playerId)) {
      // A Leader is in no zone, so its grant lives on the player.
      player.leaderBlockerUntilTurn = state.turn;
    } else {
      const target = player.board.find((card) => card.instanceId === optionId);
      if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
      target.blockerUntilTurn = state.turn;
    }
    state.oncePerTurn.push(
      `${state.turn}:${effect.playerId}:${effect.sourceInstanceId}:buggy-blocker`,
    );
  }
  state.pendingEffect = null;
  state.phase = "block";
  state.activePlayer = effect.resumePlayerId;
  return [];
}

/** `rest-opponent-card`. */
export function resolveRestOpponentCard({
  state,
  effect,
  optionId,
}: EffectContext<"rest-opponent-card">): PublicEvent[] {
  if (optionId === "skip") {
    state.pendingEffect = null;
    return [];
  }
  const targetPlayer = state.players[effect.targetPlayerId];
  if (optionId === "don") {
    const moved = targetPlayer.activeDon.splice(0, 1);
    if (moved.length === 0) throw new Error("INVALID_EFFECT_OPTION: don");
    targetPlayer.restedDon.push(...moved);
  } else {
    if (!effect.eligibleInstanceIds.includes(optionId)) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const target = targetPlayer.board.find(
      (card) => card.instanceId === optionId,
    );
    if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
    target.rested = true;
  }
  const eligibleInstanceIds = effect.eligibleInstanceIds.filter(
    (candidate) => candidate !== optionId,
  );
  if (
    effect.remaining > 1 &&
    (eligibleInstanceIds.length > 0 || targetPlayer.activeDon.length > 0)
  ) {
    state.pendingEffect = {
      ...effect,
      eligibleInstanceIds,
      remaining: effect.remaining - 1,
    };
  } else {
    state.pendingEffect = null;
  }
  return [];
}

/** `prevent-refresh`. */
export function resolvePreventRefresh({
  state,
  effect,
  optionId,
}: EffectContext<"prevent-refresh">): PublicEvent[] {
  if (optionId === "skip") {
    state.pendingEffect = null;
    return [];
  }
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const target = state.players[effect.targetPlayerId].board.find(
    (card) => card.instanceId === optionId,
  );
  if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  target.cannotRefreshUntilTurn = effect.expiresAtTurn;
  const eligibleInstanceIds = effect.eligibleInstanceIds.filter(
    (candidate) => candidate !== optionId,
  );
  state.pendingEffect =
    effect.remaining > 1 && eligibleInstanceIds.length > 0
      ? {
          ...effect,
          eligibleInstanceIds,
          remaining: effect.remaining - 1,
        }
      : null;
  return [
    {
      type: "refresh-prevented",
      playerId: effect.targetPlayerId,
      targetInstanceId: target.instanceId,
      targetCardNumber: target.cardNumber,
      expiresAtTurn: effect.expiresAtTurn,
      sourceCardNumber: effect.sourceCardNumber,
    },
  ];
}

/** `prevent-rest`. */
export function resolvePreventRest({
  state,
  effect,
  optionId,
}: EffectContext<"prevent-rest">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const target = state.players[effect.targetPlayerId].board.find(
    (card) => card.instanceId === optionId,
  );
  if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  target.cannotRestUntilTurn = effect.expiresAtTurn;
  target.cannotRestSourceCardNumber = effect.sourceCardNumber;
  return [
    {
      type: "rest-prevented",
      playerId: effect.targetPlayerId,
      targetInstanceId: target.instanceId,
      targetCardNumber: target.cardNumber,
      expiresAtTurn: effect.expiresAtTurn,
      sourceCardNumber: effect.sourceCardNumber,
    },
  ];
}

/** `st34-power-boost`. */
export function resolveSt34PowerBoost({
  state,
  effect,
  optionId,
}: EffectContext<"st34-power-boost">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  applyPowerModifier(
    state,
    effect.playerId,
    optionId,
    effect.amount,
    effect.expiresAtTurn,
    {
      instanceId: effect.sourceInstanceId,
      cardNumber: effect.sourceCardNumber,
    },
  );
  return [
    {
      type: "power-changed",
      playerId: effect.playerId,
      targetInstanceId: optionId,
      amount: effect.amount,
      expiresAtTurn: effect.expiresAtTurn,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
    },
  ];
}
