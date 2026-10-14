/**
 * Cards moving into and out of Life.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import { addToLife, takeLifeAt } from "../life.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `bege-life-swap`. */
export function resolveBegeLifeSwap({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"bege-life-swap">): PublicEvent[] {
  const player = state.players[effect.playerId];
  if (optionId === "skip") return [];
  if (effect.stage === "take-life") {
    if (optionId !== "top" && optionId !== "bottom") {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const taken = takeLifeAt(state, effect.playerId, optionId, {
      to: "hand",
      sourceCardNumber: effect.sourceCardNumber,
    });
    if (!taken) return [];
    player.hand.push({
      instanceId: taken.card.instanceId,
      cardNumber: taken.card.cardNumber,
    });
    const eligibleInstanceIds = player.hand
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.category === "character" &&
          definition.types.includes("Supernovas")
        );
      })
      .map((card) => card.instanceId);
    if (eligibleInstanceIds.length > 0) {
      state.pendingEffect = {
        ...effect,
        stage: "place-life",
        eligibleInstanceIds,
      };
    }
    return taken.events;
  }
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [card] = player.hand.splice(handIndex, 1);
  if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  return addToLife(state, effect.playerId, card, {
    from: "hand",
    faceUp: true,
    sourceCardNumber: effect.sourceCardNumber,
  });
}

/** `move-character-to-life`. */
export function resolveMoveCharacterToLife({
  state,
  effect,
  optionId,
}: EffectContext<"move-character-to-life">): PublicEvent[] {
  if (optionId === "skip") return [];
  const [position, targetId] = optionId.split(":");
  if (
    (position !== "top" && position !== "bottom") ||
    !targetId ||
    !effect.eligibleInstanceIds.includes(targetId)
  ) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const targetPlayer = state.players[effect.targetPlayerId];
  const targetIndex = targetPlayer.board.findIndex(
    (card) => card.instanceId === targetId,
  );
  const [target] = targetPlayer.board.splice(targetIndex, 1);
  if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${targetId}`);
  targetPlayer.restedDon.push(...(target.attachedDon ?? []));
  return addToLife(
    state,
    effect.targetPlayerId,
    { instanceId: target.instanceId, cardNumber: target.cardNumber },
    {
      from: "board",
      position,
      faceUp: true,
      sourceCardNumber: effect.sourceCardNumber,
    },
  );
}

/** `trash-opponent-life`. */
export function resolveTrashOpponentLife({
  state,
  effect,
  optionId,
}: EffectContext<"trash-opponent-life">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (optionId !== "apply") {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const target = state.players[effect.targetPlayerId];
  const taken = takeLifeAt(state, effect.targetPlayerId, "top", {
    to: "trash",
    sourceCardNumber: effect.sourceCardNumber,
  });
  if (taken) {
    target.trash.push({
      instanceId: taken.card.instanceId,
      cardNumber: taken.card.cardNumber,
    });
  }
  if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return taken?.events ?? [];
}

/** `add-top-deck-to-life`. */
export function resolveAddTopDeckToLife({
  state,
  effect,
  optionId,
}: EffectContext<"add-top-deck-to-life">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (optionId !== "apply") {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const card = player.deck.shift();
  if (!card) return [];
  return addToLife(state, effect.playerId, card, {
    from: "deck",
    sourceCardNumber: effect.sourceCardNumber,
  });
}
