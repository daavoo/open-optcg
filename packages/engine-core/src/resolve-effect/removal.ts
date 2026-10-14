/**
 * K.O., rest and power reduction, including the shared K.O./rest chooser every removal effect funnels through.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import { fieldDonCount, returnDonToDeck } from "../don.js";
import {
  applyAfterRest,
  applyPowerModifier,
  createOnKoResult,
  drawCards,
  effectSource,
  leaderInstanceId,
  mechanicPendingEffect,
  opponentOf,
  triggerPerona,
} from "../effects.js";
import { dispatchMechanicInvocations } from "../card-mechanics.js";
import { replacementCostEffect } from "../mechanics.js";
import { currentPower } from "../queries.js";
import {
  applyRosinanteLifeProtection,
  knockOut,
  replacementKey,
  replacementOptionsFor,
} from "../removal.js";
import {
  registeredReplacementOptions,
  replacementHandPayers,
  replacementProtector,
} from "../mechanics-replacements.js";
import { replacementPrograms } from "../mechanics/index.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/**
 * `ko-character`.
 *
 * Also handles `rest-character`: the two share every step but the last, and the shared chooser is where every removal effect's target selection lands.
 */
export function resolveKoCharacter({
  state,
  effect,
  optionId,
  db,
}:
  | EffectContext<"ko-character">
  | EffectContext<"rest-character">): PublicEvent[] {
  if (optionId === "skip") {
    if (effect.kind === "rest-character") {
      return applyAfterRest(state, effect.playerId, effect.afterRest);
    }
    // Declining a K.O. hands the turn back to whatever was suspended for it.
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
    return [];
  }

  if (
    !effect.eligibleInstanceIds.includes(optionId) &&
    !(
      effect.kind === "ko-character" &&
      (optionId.startsWith("protect:") ||
        optionId.startsWith("ivankov:") ||
        optionId.startsWith("rosinante:") ||
        optionId.startsWith("vergo:") ||
        optionId.startsWith("dragon:") ||
        optionId.startsWith("handtrash045:") ||
        optionId.startsWith("mechanic:"))
    )
  ) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const targetPlayer = state.players[effect.targetPlayerId];
  const targetIndex = targetPlayer.board.findIndex(
    (card) => card.instanceId === optionId,
  );
  if (effect.kind === "rest-character") {
    const card = targetPlayer.board[targetIndex];
    if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
    card.rested = true;
    const events: PublicEvent[] = [
      {
        type: "character-rested",
        playerId: effect.targetPlayerId,
        cardInstanceId: card.instanceId,
        cardNumber: card.cardNumber,
        sourceCardNumber: effect.sourceCardNumber,
      },
    ];
    events.push(...triggerPerona(state, effect.playerId));
    const remaining = (effect.remaining ?? 1) - 1;
    const eligibleInstanceIds = effect.eligibleInstanceIds.filter(
      (instanceId) => instanceId !== optionId,
    );
    if (remaining > 0 && eligibleInstanceIds.length > 0) {
      state.pendingEffect = { ...effect, remaining, eligibleInstanceIds };
    } else {
      events.push(...applyAfterRest(state, effect.playerId, effect.afterRest));
    }
    return events;
  }
  if (optionId.startsWith("protect:")) {
    const [, protectedId, protectorId] = optionId.split(":");
    if (
      !protectedId ||
      !protectorId ||
      !effect.eligibleInstanceIds.includes(protectedId)
    ) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    // The Leader can be the protector: EB03-001 Nefeltari Vivi prints the
    // clause, and its instance is in no zone -- the same pseudo-card
    // `eligibleReplacements` offered it as.
    const protector =
      protectorId === `${effect.targetPlayerId}-leader`
        ? ({
            instanceId: protectorId,
            cardNumber: targetPlayer.leaderCardNumber,
          } as (typeof targetPlayer.board)[number])
        : targetPlayer.board.find((card) => card.instanceId === protectorId);
    if (!protector || protector.cardNumber !== "OP12-027" || protector.rested) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    protector.rested = true;
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
    return [
      {
        type: "character-rested",
        playerId: effect.targetPlayerId,
        cardInstanceId: protector.instanceId,
        cardNumber: protector.cardNumber,
        sourceCardNumber: effect.sourceCardNumber,
      },
    ];
  }
  if (optionId.startsWith("ivankov:")) {
    const [, protectedId, protectorId] = optionId.split(":");
    if (!protectedId || !protectorId) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const protectorIndex = targetPlayer.board.findIndex(
      (card) =>
        card.instanceId === protectorId && card.cardNumber === "OP13-008",
    );
    const [protector] = targetPlayer.board.splice(protectorIndex, 1);
    if (!protector) throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    targetPlayer.restedDon.push(...(protector.attachedDon ?? []));
    targetPlayer.trash.push({
      instanceId: protector.instanceId,
      cardNumber: protector.cardNumber,
    });
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
    return [];
  }
  if (optionId.startsWith("rosinante:")) {
    const [, protectedId] = optionId.split(":");
    if (!protectedId || !effect.eligibleInstanceIds.includes(protectedId)) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const events = applyRosinanteLifeProtection(state, effect.targetPlayerId);
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
    return events;
  }
  if (optionId.startsWith("vergo:")) {
    const [, protectedId, vergoId] = optionId.split(":");
    if (!protectedId || !vergoId) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const vergo = targetPlayer.board.find(
      (card) => card.instanceId === vergoId && card.cardNumber === "OP14-061",
    );
    if (!vergo || fieldDonCount(state, effect.targetPlayerId) < 1) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const events: PublicEvent[] = [];
    returnDonToDeck(state, effect.targetPlayerId, 1, vergo, events);
    state.oncePerTurn.push(
      replacementKey(state, effect.targetPlayerId, vergo.instanceId),
    );
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
    return events;
  }
  if (optionId.startsWith("handtrash045:")) {
    const [, protectedId, kyoId] = optionId.split(":");
    if (!protectedId || !kyoId) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    if (
      !targetPlayer.board.some(
        (card) => card.instanceId === kyoId && card.cardNumber === "OP17-045",
      ) ||
      targetPlayer.hand.length < 2
    ) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    state.pendingEffect = {
      kind: "hand-trash-replacement",
      playerId: effect.targetPlayerId,
      sourceCardNumber: "OP17-045",
      sourceInstanceId: kyoId,
      eligibleInstanceIds: targetPlayer.hand.map((card) => card.instanceId),
      remaining: 2,
      ...(effect.resumePhase ? { resumePhase: effect.resumePhase } : {}),
      ...(effect.resumePlayerId
        ? { resumePlayerId: effect.resumePlayerId }
        : {}),
    };
    state.activePlayer = effect.targetPlayerId;
    return [];
  }
  // A replacement registered declaratively in `mechanics/<set>.ts`, rather than
  // as one of the hand-written branches below. Its cost is one of two shapes,
  // both of which reuse a pending effect that already knows how to resume the
  // battle or effect this interrupted.
  if (optionId.startsWith("mechanic:")) {
    const [, threatenedId, protectorId] = optionId.split(":");
    if (!protectorId || !threatenedId) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const protector = replacementProtector(
      state,
      effect.targetPlayerId,
      protectorId,
    );
    const entry = protector && replacementPrograms.get(protector.cardNumber);
    if (!protector || !entry) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    if (entry.oncePerTurn) {
      state.oncePerTurn.push(
        replacementKey(state, effect.targetPlayerId, protector.instanceId),
      );
    }
    if (
      entry.cost.kind === "trash-self" ||
      entry.cost.kind === "trash-self-and-draw"
    ) {
      // "…you may trash this Character instead" (OP15-094 Roronoa Zoro). Paid
      // here rather than dispatched as a mechanic program like the shapes
      // below: the program `replacementCostEffect` returns for this cost names
      // the protector through a binding the caller populates, and this path
      // dispatches a bare program with no bindings.
      //
      // Trashed, not K.O.'d, so nothing keyed on a K.O. fires -- the one thing
      // that distinguishes this from `ko-self` below. Attached DON!! comes off
      // the way it does for any card leaving the field.
      const protectorIndex = targetPlayer.board.findIndex(
        (card) => card.instanceId === protector.instanceId,
      );
      const [trashed] = targetPlayer.board.splice(protectorIndex, 1);
      if (!trashed) throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
      targetPlayer.restedDon.push(...(trashed.attachedDon ?? []));
      targetPlayer.trash.push({
        instanceId: trashed.instanceId,
        cardNumber: trashed.cardNumber,
      });
      // OP08-045 Thatch pays the same self-trash and draws off it, which is
      // what makes it the one body in the pool that answering costs the
      // opponent a card.
      const drawn =
        entry.cost.kind === "trash-self-and-draw"
          ? drawCards(
              state,
              effect.targetPlayerId,
              entry.cost.draw,
              protector.cardNumber,
            )
          : [];
      if (effect.resumePhase && effect.resumePlayerId) {
        state.phase = effect.resumePhase;
        state.activePlayer = effect.resumePlayerId;
      }
      return drawn;
    }
    if (entry.cost.kind === "ko-self") {
      // The protector dies through the real removal pipeline, so its own
      // [On K.O.] fires exactly as it would from any other K.O. -- which is the
      // whole point for OP16-014 Marco, whose [On K.O.] plays it back.
      const removed = knockOut(
        state,
        effect.targetPlayerId,
        protector.instanceId,
        protector.cardNumber,
      );
      if (!removed) throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
      const koEvents = [...removed.events];
      const onKo = createOnKoResult(
        state,
        effect.targetPlayerId,
        // The whole board entry, not a stripped identity: a `[DON!! xN]` gate
        // on an `[On K.O.]` (OP14-051 Hatchan) reads the DON!! that was given
        // to the card, and it is only still readable on this object.
        removed.card,
        effect.resumePlayerId ?? effect.playerId,
        db,
      );
      koEvents.push(...onKo.events);
      if (onKo.pending) {
        state.pendingEffect = onKo.pending;
        state.phase = "main";
        state.activePlayer = onKo.pending.playerId;
      } else if (effect.resumePhase && effect.resumePlayerId) {
        state.phase = effect.resumePhase;
        state.activePlayer = effect.resumePlayerId;
      }
      return koEvents;
    }
    if (entry.cost.kind !== "trash-from-hand") {
      // Every other cost shape -- resting one of your cards, a Leader power
      // penalty, burying three from the trash -- has no bespoke pending effect
      // on this older path, so it runs as the mechanic program it already is
      // and resumes through `pendingEffectResume`, the same seam a
      // `[When Attacking]` program uses to hand the Block window back.
      const dispatched = dispatchMechanicInvocations(
        state,
        [
          {
            context: {
              sourcePlayerId: effect.targetPlayerId,
              source: protector,
            },
            program: {
              effect: replacementCostEffect(
                { protector, entry },
                true,
                `replacement-${protector.instanceId}`,
              ),
            },
            // The threatened card, for a cost that acts on *it* rather than on
            // the protector -- OP05-001 Sabo's −1000 -- and the protector
            // itself, for a cost that acts on the protector without removing
            // it (ST30-011 Buggy's rest). Both under the binding names the
            // `knock-out` node's own offer uses, so `replacementCostEffect`
            // returns one program for every site that dispatches it.
            bindings: {
              [`replacement-${protector.instanceId}`]: [protector.instanceId],
              [`replacement-${protector.instanceId}-threatened`]: [
                threatenedId,
              ],
            },
          },
        ],
        db,
      );
      if (dispatched.pending && dispatched.invocation) {
        state.pendingEffect = mechanicPendingEffect(
          dispatched.invocation,
          dispatched.pending,
          dispatched.continuations,
        );
        if (effect.resumePhase && effect.resumePlayerId) {
          state.pendingEffectResume = {
            phase: effect.resumePhase,
            playerId: effect.resumePlayerId,
          };
        }
        state.activePlayer = effect.targetPlayerId;
      } else if (effect.resumePhase && effect.resumePlayerId) {
        state.phase = effect.resumePhase;
        state.activePlayer = effect.resumePlayerId;
      }
      return dispatched.events;
    }
    const payers = replacementHandPayers(
      state,
      effect.targetPlayerId,
      protector,
      entry.cost.match,
      db,
    );
    if (payers.length < entry.cost.count) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    state.pendingEffect = {
      kind: "hand-trash-replacement",
      playerId: effect.targetPlayerId,
      sourceCardNumber: protector.cardNumber,
      sourceInstanceId: protector.instanceId,
      // Only the cards the printed text allows as payment are offered.
      eligibleInstanceIds: payers.map((card) => card.instanceId),
      remaining: entry.cost.count,
      ...(effect.resumePhase ? { resumePhase: effect.resumePhase } : {}),
      ...(effect.resumePlayerId
        ? { resumePlayerId: effect.resumePlayerId }
        : {}),
    };
    state.activePlayer = effect.targetPlayerId;
    return [];
  }
  if (optionId.startsWith("dragon:")) {
    const [, protectedId, dragonId] = optionId.split(":");
    if (!protectedId || !dragonId) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const dragon = targetPlayer.board.find(
      (card) => card.instanceId === dragonId && card.cardNumber === "OP13-017",
    );
    if (!dragon) throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    dragon.powerModifiers ??= [];
    dragon.powerModifiers.push({
      amount: -2000,
      expiresAtTurn: state.turn,
      sourceCardNumber: dragon.cardNumber,
      sourceInstanceId: dragon.instanceId,
    });
    state.oncePerTurn.push(
      `${state.turn}:${effect.targetPlayerId}:${dragon.instanceId}:replacement`,
    );
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
    return [
      {
        type: "power-changed",
        playerId: effect.targetPlayerId,
        targetInstanceId: dragon.instanceId,
        amount: -2000,
        expiresAtTurn: state.turn,
        sourceCardNumber: dragon.cardNumber,
        sourceInstanceId: dragon.instanceId,
      },
    ];
  }
  // The target's controller, not this player, decides whether a replacement
  // effect applies. Hand the decision over and come back once it is made.
  const threatened = targetPlayer.board.find(
    (card) => card.instanceId === optionId,
  );
  if (threatened) {
    const replacements = [
      ...replacementOptionsFor(
        state,
        effect.playerId,
        effect.targetPlayerId,
        threatened,
        optionId,
        db,
      ),
      ...registeredReplacementOptions(
        state,
        effect.playerId,
        effect.targetPlayerId,
        threatened,
        optionId,
        db,
      ),
    ];
    if (replacements.length > 0) {
      state.pendingEffect = {
        kind: "replacement-choice",
        playerId: effect.targetPlayerId,
        sourcePlayerId: effect.playerId,
        targetInstanceId: optionId,
        sourceCardNumber: effect.sourceCardNumber,
        sourceInstanceId: effect.sourceInstanceId,
        options: replacements,
        ...(effect.resumePhase ? { resumePhase: effect.resumePhase } : {}),
        ...(effect.resumePlayerId
          ? { resumePlayerId: effect.resumePlayerId }
          : {}),
      };
      state.activePlayer = effect.targetPlayerId;
      return [];
    }
  }
  const removed = knockOut(
    state,
    effect.targetPlayerId,
    optionId,
    effect.sourceCardNumber,
  );
  if (!removed) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  const card = {
    instanceId: removed.card.instanceId,
    cardNumber: removed.card.cardNumber,
  };
  const onKo = createOnKoResult(
    state,
    effect.targetPlayerId,
    card,
    effect.resumePlayerId ?? effect.playerId,
    db,
  );
  if (onKo.pending) {
    state.activeAttack = null;
    state.pendingEffect = onKo.pending;
    state.phase = "main";
    // Usually `effect.targetPlayerId` (a self-chooser [On K.O.]), but
    // OP17-053 Barbell names the opponent instead; `onKo.pending.playerId`
    // is already resolved to whichever one actually applies.
    state.activePlayer = onKo.pending.playerId;
  } else if (state.activeAttack?.targetInstanceId === card.instanceId) {
    const attackerPlayerId = state.activeAttack.attackerPlayerId;
    state.activeAttack = null;
    state.phase = "main";
    state.activePlayer = attackerPlayerId;
  } else if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return [...removed.events, ...onKo.events];
}

/** `st34-don-minus-ko`. */
export function resolveSt34DonMinusKo({
  state,
  effect,
  optionId,
}: EffectContext<"st34-don-minus-ko">): PublicEvent[] {
  if (optionId === "skip") {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
    return [];
  }
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const events: PublicEvent[] = [];
  returnDonToDeck(state, effect.playerId, 1, effectSource(effect), events);
  state.pendingEffect = {
    kind: "ko-character",
    playerId: effect.playerId,
    targetPlayerId: effect.targetPlayerId,
    sourceCardNumber: effect.sourceCardNumber,
    sourceInstanceId: effect.sourceInstanceId,
    eligibleInstanceIds: [optionId],
    resumePhase: effect.resumePhase,
    resumePlayerId: effect.resumePlayerId,
  };
  return events;
}

/** `set-base-power-zero`. */
export function resolveSetBasePowerZero({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"set-base-power-zero">): PublicEvent[] {
  if (optionId === "skip") return [];
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const target = state.players[effect.targetPlayerId].board.find(
    (card) => card.instanceId === optionId,
  );
  if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  const amount = -(db.require(target.cardNumber).power ?? 0);
  applyPowerModifier(
    state,
    effect.targetPlayerId,
    optionId,
    amount,
    effect.expiresAtTurn,
    {
      instanceId: effect.sourceInstanceId,
      cardNumber: effect.sourceCardNumber,
    },
  );
  return [
    {
      type: "power-changed",
      playerId: effect.targetPlayerId,
      targetInstanceId: optionId,
      amount,
      expiresAtTurn: effect.expiresAtTurn,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
    },
  ];
}

/** `reduce-power`. */
export function resolveReducePower({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"reduce-power">): PublicEvent[] {
  let changedTargetInstanceId: string | undefined;
  const amount = effect.applyAllAtOnce
    ? effect.amount * effect.remaining
    : effect.amount;
  if (optionId === "skip") {
    if (effect.afterKoPowerAtMost === undefined) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
      return [];
    }
  } else {
    const target = state.players[effect.targetPlayerId].board.find(
      (card) => card.instanceId === optionId,
    );
    if (!target) throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    target.powerModifiers ??= [];
    target.powerModifiers.push({
      amount,
      expiresAtTurn: effect.expiresAtTurn,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
    });
    changedTargetInstanceId = target.instanceId;
  }
  if (!effect.applyAllAtOnce && effect.remaining > 1) {
    state.pendingEffect = { ...effect, remaining: effect.remaining - 1 };
  } else if (effect.afterKoPowerAtMost !== undefined) {
    const eligibleInstanceIds = state.players[effect.targetPlayerId].board
      .filter(
        (card) =>
          currentPower(
            state,
            effect.targetPlayerId,
            card.instanceId,
            false,
            db,
          ) <= effect.afterKoPowerAtMost!,
      )
      .map((card) => card.instanceId);
    state.pendingEffect =
      eligibleInstanceIds.length > 0
        ? {
            kind: "ko-character",
            playerId: effect.playerId,
            targetPlayerId: effect.targetPlayerId,
            sourceCardNumber: effect.sourceCardNumber,
            sourceInstanceId: effect.sourceInstanceId,
            eligibleInstanceIds,
            resumePhase: effect.resumePhase,
            resumePlayerId: effect.resumePlayerId,
          }
        : null;
    if (!state.pendingEffect) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    }
  } else {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return changedTargetInstanceId
    ? [
        {
          type: "power-changed",
          playerId: effect.targetPlayerId,
          targetInstanceId: changedTargetInstanceId,
          amount,
          expiresAtTurn: effect.expiresAtTurn,
          sourceCardNumber: effect.sourceCardNumber,
          sourceInstanceId: effect.sourceInstanceId,
        },
      ]
    : [];
}

/** `gatling-gun`. */
export function resolveGatlingGun({
  state,
  effect,
  optionId,
}: EffectContext<"gatling-gun">): PublicEvent[] {
  if (effect.stage === "give-don") {
    if (optionId !== "skip" && !effect.eligibleInstanceIds.includes(optionId)) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const player = state.players[effect.playerId];
    const events: PublicEvent[] = [];
    if (optionId !== "skip") {
      const moved = player.restedDon.splice(0, 1);
      if (optionId === leaderInstanceId(effect.playerId)) {
        player.leaderAttachedDon.push(...moved);
      } else {
        const target = player.board.find(
          (card) => card.instanceId === optionId,
        );
        if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
        target.attachedDon ??= [];
        target.attachedDon.push(...moved);
      }
      events.push({
        type: "don-attached",
        playerId: effect.playerId,
        targetInstanceId: optionId,
        count: moved.length,
      });
    }
    state.pendingEffect = {
      ...effect,
      stage: "reduce-power",
      eligibleInstanceIds: state.players[opponentOf(effect.playerId)].board.map(
        (card) => card.instanceId,
      ),
    };
    return events;
  }
  if (optionId === "skip") return [];
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const targetPlayerId = opponentOf(effect.playerId);
  const target = state.players[targetPlayerId].board.find(
    (card) => card.instanceId === optionId,
  );
  if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  target.powerModifiers ??= [];
  target.powerModifiers.push({
    amount: -2000,
    expiresAtTurn: state.turn,
    sourceCardNumber: effect.sourceCardNumber,
    sourceInstanceId: effect.sourceInstanceId,
  });
  return [
    {
      type: "power-changed",
      playerId: targetPlayerId,
      targetInstanceId: target.instanceId,
      amount: -2000,
      expiresAtTurn: state.turn,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
    },
  ];
}
