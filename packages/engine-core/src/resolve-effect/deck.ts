/**
 * Searches, look-at-top and bottom-of-deck placement.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import { drawCards } from "../effects.js";
import { searchRevealIsPublic } from "../queries.js";
import { leaderEffectsNegated } from "../static-abilities.js";
import { type EffectContext } from "./context.js";
import { markHandTrashedByEffect } from "./discards.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `navy-search`. */
export function resolveNavySearch({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"navy-search">): PublicEvent[] {
  const player = state.players[effect.playerId];
  if (optionId === "skip") {
    player.deck.push(...effect.revealed);
    return [];
  }
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const selected = effect.revealed.find((card) => card.instanceId === optionId);
  if (!selected) throw new Error(`MISSING_SEARCH_CARD: ${optionId}`);
  player.hand.push(selected);
  const revealed = effect.revealed.filter(
    (card) => card.instanceId !== optionId,
  );
  const eligibleInstanceIds = effect.eligibleInstanceIds.filter(
    (candidate) => candidate !== optionId,
  );
  if (effect.remaining > 1 && eligibleInstanceIds.length > 0) {
    state.pendingEffect = {
      ...effect,
      revealed,
      eligibleInstanceIds,
      remaining: effect.remaining - 1,
    };
  } else {
    player.deck.push(...revealed);
  }
  return [
    {
      type: "card-revealed",
      playerId: effect.playerId,
      cardNumber: selected.cardNumber,
      sourceCardNumber: effect.sourceCardNumber,
      // Sengoku OP12-047 prints "reveal up to 2", which is public. A future
      // navy-style search without "reveal" would be a private look instead;
      // the printed text decides, not the effect kind.
      ...(searchRevealIsPublic(effect.sourceCardNumber, db)
        ? {}
        : { visibleTo: effect.playerId }),
    },
  ];
}

/** `search-top-five`. */
export function resolveSearchTopFive({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"search-top-five">): PublicEvent[] {
  const player = state.players[effect.playerId];
  const [kind, selection] = optionId.split(":");
  if (
    kind !== "search-select" ||
    !selection ||
    (selection !== "skip" && !effect.eligibleInstanceIds.includes(selection))
  ) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const selected = effect.revealed.find(
    (card) => card.instanceId === selection,
  );
  if (selected) player.hand.push(selected);
  player.deck.push(
    ...effect.revealed.filter(
      (card) => card.instanceId !== selected?.instanceId,
    ),
  );
  if (effect.sourceCardNumber === "OP16-026") {
    const eligibleInstanceIds = player.hand
      .filter((card) => {
        const definition = db.require(card.cardNumber);
        return (
          definition.category === "character" && (definition.cost ?? 99) <= 2
        );
      })
      .map((card) => card.instanceId);
    if (eligibleInstanceIds.length > 0) {
      state.pendingEffect = {
        kind: "free-play",
        playerId: effect.playerId,
        sourceCardNumber: effect.sourceCardNumber,
        sourceInstanceId: effect.sourceInstanceId,
        eligibleInstanceIds,
      };
    }
  }
  // OP15-118 Enel ends with "trash 1 card from your hand", chained here so the
  // search machinery stays shared rather than copied.
  if (effect.thenTrash && player.hand.length > 0) {
    state.pendingEffect = {
      kind: "navy-discard",
      playerId: effect.playerId,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
      eligibleInstanceIds: player.hand.map((card) => card.instanceId),
      remaining: effect.thenTrash,
      optional: false,
      after: { kind: "none" },
    };
  }
  if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return selected
    ? [
        {
          type: "card-revealed",
          playerId: effect.playerId,
          cardNumber: selected.cardNumber,
          sourceCardNumber: effect.sourceCardNumber,
          // The printed text decides publicity: most searches print "reveal
          // up to 1 X and add it to your hand" and stay public; OP15-118
          // Enel prints only "Look at 5 cards ... and add up to 1 card to
          // your hand", so its search is a private look and the event must
          // not reach the opponent's log.
          ...(searchRevealIsPublic(effect.sourceCardNumber, db)
            ? {}
            : { visibleTo: effect.playerId }),
        },
      ]
    : [];
}

/** `draw-trash`. */
export function resolveDrawTrash({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"draw-trash">): PublicEvent[] {
  const player = state.players[effect.playerId];
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [card] = player.hand.splice(handIndex, 1);
  if (!card) throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  player.trash.push(card);
  markHandTrashedByEffect(state, effect.playerId);
  const source = db.require(effect.sourceCardNumber);
  const events =
    source.types.includes("Navy") &&
    player.leaderCardNumber === "OP12-040" &&
    !leaderEffectsNegated(state, effect.playerId)
      ? drawCards(state, effect.playerId, 1, effect.sourceCardNumber)
      : [];
  if (effect.trashCount > 1) {
    state.pendingEffect = { ...effect, trashCount: effect.trashCount - 1 };
  } else if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return events;
}

/**
 * `bottom-deck-character`.
 *
 * Also handles `prevent-attack`.
 */
export function resolveBottomDeckCharacter({
  state,
  effect,
  optionId,
}:
  | EffectContext<"bottom-deck-character">
  | EffectContext<"prevent-attack">): PublicEvent[] {
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
  const ownerId = (["p1", "p2"] as const).find((playerId) =>
    state.players[playerId].board.some((card) => card.instanceId === optionId),
  );
  if (!ownerId) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  const targetPlayer = state.players[ownerId];
  const target = targetPlayer.board.find(
    (card) => card.instanceId === optionId,
  );
  if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  if (effect.kind === "bottom-deck-character") {
    targetPlayer.board = targetPlayer.board.filter(
      (card) => card.instanceId !== optionId,
    );
    targetPlayer.restedDon.push(...(target.attachedDon ?? []));
    targetPlayer.deck.push({
      instanceId: target.instanceId,
      cardNumber: target.cardNumber,
    });
  } else {
    target.cannotAttackUntilTurn = effect.expiresAtTurn;
    target.cannotAttackSourceCardNumber = effect.sourceCardNumber;
  }
  const eligibleInstanceIds = effect.eligibleInstanceIds.filter(
    (candidate) => candidate !== optionId,
  );
  if (effect.remaining > 1 && eligibleInstanceIds.length > 0) {
    state.pendingEffect = {
      ...effect,
      eligibleInstanceIds,
      remaining: effect.remaining - 1,
    };
  } else if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return effect.kind === "prevent-attack"
    ? [
        {
          type: "attack-prevented",
          playerId: effect.playerId,
          targetInstanceId: target.instanceId,
          targetCardNumber: target.cardNumber,
          expiresAtTurn: effect.expiresAtTurn,
          sourceCardNumber: effect.sourceCardNumber,
        },
      ]
    : [
        {
          // The character leaves the board, so the opponent needs a step
          // saying which one went where; without it the removal reads as
          // silent (no opponent notice modal appears for the resolution).
          type: "card-moved",
          playerId: ownerId,
          cardInstanceId: target.instanceId,
          cardNumber: target.cardNumber,
          from: "board",
          to: "deck",
          position: "bottom",
          sourceCardNumber: effect.sourceCardNumber,
        },
      ];
}
