/**
 * Putting a card onto the field for free, from trash or from hand.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import { returnDonToDeck } from "../don.js";
import {
  createOnPlayEffect,
  effectSource,
  placeCharacter,
} from "../effects.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `free-play`. */
export function resolveFreePlay({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"free-play">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const events: PublicEvent[] = [];
  if (
    effect.returnDon &&
    returnDonToDeck(
      state,
      effect.playerId,
      effect.returnDon,
      effectSource(effect),
      events,
    ) < effect.returnDon
  ) {
    throw new Error("INSUFFICIENT_DON");
  }
  const player = state.players[effect.playerId];
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [card] = player.hand.splice(handIndex, 1);
  if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  const definition = db.require(card.cardNumber);
  if (definition.category === "stage") {
    if (player.stage) {
      player.trash.push({
        instanceId: player.stage.instanceId,
        cardNumber: player.stage.cardNumber,
      });
    }
    player.stage = { ...card, rested: false };
    events.push({
      type: "stage-played",
      playerId: effect.playerId,
      cardInstanceId: card.instanceId,
      cardNumber: card.cardNumber,
    });
  } else {
    const placement = placeCharacter(state, effect.playerId, card, false, db);
    state.pendingEffect = placement.pending;
    if (placement.pending && effect.resumePhase && effect.resumePlayerId) {
      state.pendingEffectResume = {
        phase: effect.resumePhase,
        playerId: effect.resumePlayerId,
      };
    }
    return [...events, ...placement.events];
  }
  const followUp = createOnPlayEffect(state, effect.playerId, card);
  state.pendingEffect = followUp.pending;
  if (followUp.pending && effect.resumePhase && effect.resumePlayerId) {
    state.pendingEffectResume = {
      phase: effect.resumePhase,
      playerId: effect.resumePlayerId,
    };
  } else if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  events.push(...followUp.events);
  return events;
}

/** `free-play-rested`. */
export function resolveFreePlayRested({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"free-play-rested">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [card] = player.hand.splice(handIndex, 1);
  if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  const placement = placeCharacter(state, effect.playerId, card, true, db);
  state.pendingEffect = placement.pending;
  if (placement.pending && effect.resumePhase && effect.resumePlayerId) {
    state.pendingEffectResume = {
      phase: effect.resumePhase,
      playerId: effect.resumePlayerId,
    };
  } else if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return placement.events;
}

/** `return-own-for-free-play`. */
export function resolveReturnOwnForFreePlay({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"return-own-for-free-play">): PublicEvent[] {
  if (optionId === "skip") {
    state.pendingEffect = null;
    return [];
  }
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const boardIndex = player.board.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [returned] = player.board.splice(boardIndex, 1);
  if (!returned) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  player.activeDon.push(...(returned.attachedDon ?? []));
  player.hand.push({
    instanceId: returned.instanceId,
    cardNumber: returned.cardNumber,
  });
  const eligibleInstanceIds = player.hand
    .filter((card) => {
      const definition = db.require(card.cardNumber);
      return (
        definition.category === "character" &&
        definition.types.includes("Impel Down") &&
        (definition.cost ?? 99) <= 2
      );
    })
    .map((card) => card.instanceId);
  state.pendingEffect =
    eligibleInstanceIds.length > 0
      ? {
          kind: "free-play",
          playerId: effect.playerId,
          sourceCardNumber: effect.sourceCardNumber,
          sourceInstanceId: effect.sourceInstanceId,
          eligibleInstanceIds,
        }
      : null;
  return [];
}
