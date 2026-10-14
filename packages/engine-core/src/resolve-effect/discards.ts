/**
 * Discards from hand, either player's.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import { returnDonToDeck } from "../don.js";
import { drawCards, effectSource } from "../effects.js";
import { addToLife } from "../life.js";
import { leaderEffectsNegated } from "../static-abilities.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `st34-discard`. */
export function resolveSt34Discard({
  state,
  effect,
  optionId,
}: EffectContext<"st34-discard">): PublicEvent[] {
  if (optionId === "skip") return [];
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
  if (effect.after === "perospero") {
    state.pendingEffect = {
      kind: "st34-guess-cost",
      playerId: effect.playerId,
      targetPlayerId: effect.targetPlayerId,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
      outcome: "perospero",
      resumePhase: "main",
      resumePlayerId: effect.playerId,
    };
    return [];
  }
  const events: PublicEvent[] = [];
  returnDonToDeck(state, effect.playerId, 4, effectSource(effect), events);
  const life = player.deck.shift();
  if (life) {
    events.push(
      ...addToLife(state, effect.playerId, life, {
        from: "deck",
        sourceCardNumber: effect.sourceCardNumber,
      }),
    );
  }
  const eligibleInstanceIds = state.players[effect.targetPlayerId].board.map(
    (card) => card.instanceId,
  );
  if (eligibleInstanceIds.length > 0) {
    state.pendingEffect = {
      kind: "set-base-power-zero",
      playerId: effect.playerId,
      targetPlayerId: effect.targetPlayerId,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
      eligibleInstanceIds,
      expiresAtTurn: state.turn,
    };
  }
  return events;
}

/** `navy-discard`. */
export function resolveNavyDiscard({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"navy-discard">): PublicEvent[] {
  if (optionId === "skip") {
    if (!effect.optional) throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
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
  player.handTrashedByEffectTurn = state.turn;
  // OP12-040 Kuzan Leader: "[printed text omitted -- pnpm card:text OP12-040]"
  //
  // The {Navy} test is on the *source* of the trash, and it belongs here rather
  // than being taken on trust from the effect kind's name: `navy-discard` is the
  // generic trash-from-hand-as-a-cost step, and cards outside the type raise it
  // too -- OP13-076 Divine Departure ({King Of The Pirates}/{Roger Pirates}) and
  // OP15-078 Mamaragan ({Sky Island}) both do. `resolveDrawTrash` already reads
  // the source's types this way; this path did not, so one Leader clause answered
  // differently depending on which step happened to get there.
  const leaderDrawCount =
    (effect.leaderDrawCount ?? 0) +
    (player.leaderCardNumber === "OP12-040" &&
    !leaderEffectsNegated(state, effect.playerId) &&
    db.require(effect.sourceCardNumber).types.includes("Navy")
      ? 1
      : 0);
  const events: PublicEvent[] = [];
  if (effect.remaining > 1 && player.hand.length > 0) {
    state.pendingEffect = {
      ...effect,
      eligibleInstanceIds: player.hand.map((card) => card.instanceId),
      remaining: effect.remaining - 1,
      optional: false,
      leaderDrawCount,
    };
    return events;
  }
  events.push(
    ...drawCards(
      state,
      effect.playerId,
      leaderDrawCount,
      effect.sourceCardNumber,
    ),
  );
  if (effect.after.kind === "draw") {
    events.push(
      ...drawCards(
        state,
        effect.playerId,
        effect.after.count,
        effect.sourceCardNumber,
      ),
    );
  } else if (
    effect.after.kind === "bottom-deck" &&
    effect.after.eligibleInstanceIds.length > 0
  ) {
    state.pendingEffect = {
      kind: "bottom-deck-character",
      playerId: effect.playerId,
      targetPlayerId: effect.after.targetPlayerId,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
      eligibleInstanceIds: effect.after.eligibleInstanceIds,
      remaining: effect.after.remaining,
      ...(effect.resumePhase ? { resumePhase: effect.resumePhase } : {}),
      ...(effect.resumePlayerId
        ? { resumePlayerId: effect.resumePlayerId }
        : {}),
    };
  } else if (
    effect.after.kind === "prevent-attack" &&
    effect.after.eligibleInstanceIds.length > 0
  ) {
    state.pendingEffect = {
      kind: "prevent-attack",
      playerId: effect.playerId,
      targetPlayerId: effect.after.targetPlayerId,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
      eligibleInstanceIds: effect.after.eligibleInstanceIds,
      remaining: effect.after.remaining,
      expiresAtTurn: effect.after.expiresAtTurn,
      ...(effect.resumePhase ? { resumePhase: effect.resumePhase } : {}),
      ...(effect.resumePlayerId
        ? { resumePlayerId: effect.resumePlayerId }
        : {}),
    };
  } else if (
    effect.after.kind === "opponent-discard" &&
    state.players[effect.after.targetPlayerId].hand.length >= 6
  ) {
    const targetPlayer = state.players[effect.after.targetPlayerId];
    state.pendingEffect = {
      kind: "opponent-discard",
      playerId: effect.after.targetPlayerId,
      sourcePlayerId: effect.playerId,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
      eligibleInstanceIds: targetPlayer.hand.map((card) => card.instanceId),
      resumePhase: "block",
      resumePlayerId: effect.after.targetPlayerId,
    };
    state.activePlayer = effect.after.targetPlayerId;
  } else if (effect.sourceCardNumber === "OP12-047") {
    const revealed = player.deck.splice(0, 5);
    state.pendingEffect = {
      kind: "navy-search",
      playerId: effect.playerId,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
      revealed,
      eligibleInstanceIds: revealed
        .filter((card) => {
          const definition = db.require(card.cardNumber);
          return (
            definition.types.includes("Navy") && definition.name !== "Sengoku"
          );
        })
        .map((card) => card.instanceId),
      remaining: 2,
    };
  }
  // Hand control back unless this step chained into another decision. This used
  // to be the last arm of the `after` chain, so an `after` that asks no further
  // question -- `draw`, and every arm whose eligible list came back empty --
  // took its own branch and skipped the handback entirely: the Trigger's owner
  // kept `activePlayer` and got a full main phase in the middle of their
  // opponent's turn. The condition that matters is whether a follow-up effect
  // is pending, not which arm ran.
  if (!state.pendingEffect && effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return events;
}

/** `opponent-discard`. */
export function resolveOpponentDiscard({
  state,
  effect,
  optionId,
}: EffectContext<"opponent-discard">): PublicEvent[] {
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
  const remaining = (effect.remaining ?? 1) - 1;
  const eligibleInstanceIds = effect.eligibleInstanceIds.filter(
    (candidate) => candidate !== optionId,
  );
  if (remaining > 0 && eligibleInstanceIds.length > 0) {
    // Still the same player's decision, so control does not go back yet.
    state.pendingEffect = { ...effect, remaining, eligibleInstanceIds };
    return [];
  }
  state.phase = effect.resumePhase;
  state.activePlayer = effect.resumePlayerId;
  return [];
}

/** `bad-manners-counter`. */
export function resolveBadMannersCounter({
  state,
  effect,
  optionId,
}: EffectContext<"bad-manners-counter">): PublicEvent[] {
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [discard] = player.hand.splice(handIndex, 1);
  if (!discard || !state.activeAttack) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  player.trash.push(discard);
  state.activeAttack.counterPower += 3000;
  return [
    {
      // The cost card leaves a hand for a public trash, so both seats are
      // entitled to know which one it was -- without this step the opponent
      // only ever saw the counter event's own name.
      type: "card-moved",
      playerId: effect.playerId,
      cardInstanceId: discard.instanceId,
      cardNumber: discard.cardNumber,
      from: "hand",
      to: "trash",
      sourceCardNumber: effect.sourceCardNumber,
    },
    {
      type: "counter-used",
      playerId: effect.playerId,
      cardNumber: effect.sourceCardNumber,
      power: 3000,
    },
  ];
}

/**
 * `discard-for-life`.
 *
 * Also handles `discard-supernova-draw-two`.
 */
export function resolveDiscardForLife({
  state,
  effect,
  optionId,
}:
  | EffectContext<"discard-for-life">
  | EffectContext<"discard-supernova-draw-two">): PublicEvent[] {
  if (optionId === "skip") {
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
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
  player.trash.push({
    instanceId: discard.instanceId,
    cardNumber: discard.cardNumber,
  });
  if (effect.kind === "discard-supernova-draw-two") {
    return drawCards(state, effect.playerId, 2, effect.sourceCardNumber);
  }
  const life = player.deck.shift();
  const events = life
    ? addToLife(state, effect.playerId, life, {
        from: "deck",
        sourceCardNumber: effect.sourceCardNumber,
      })
    : [];
  if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return events;
}
