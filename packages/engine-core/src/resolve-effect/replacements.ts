/**
 * "You may ... instead" -- the answers that swap one outcome for another before it happens.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import {
  createOnKoResult,
  drawCards,
  mechanicPendingEffect,
  placeCharacter,
  resolveEffect,
} from "../effects.js";
import { dispatchMechanicInvocations } from "../card-mechanics.js";
import { replacementCostEffect, SOURCE_BINDING } from "../mechanics.js";
import { replacementPrograms } from "../mechanics/index.js";
import { replacementProtector } from "../mechanics-replacements.js";
import { type PendingEffect } from "../model.js";
import {
  applyRosinanteLifeProtection,
  knockOut,
  replacementKey,
} from "../removal.js";
import { type EffectContext } from "./context.js";
import { navyHandTrashDraws } from "./discards.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `character-area-replacement`. */
export function resolveCharacterAreaReplacement({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"character-area-replacement">): PublicEvent[] {
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const boardIndex = player.board.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [trashed] = player.board.splice(boardIndex, 1);
  if (!trashed) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  player.restedDon.push(...(trashed.attachedDon ?? []));
  player.trash.push({
    instanceId: trashed.instanceId,
    cardNumber: trashed.cardNumber,
  });
  const placement = placeCharacter(
    state,
    effect.playerId,
    effect.card,
    effect.rested,
    db,
  );
  state.pendingEffect = placement.pending;
  return [
    {
      type: "character-trashed",
      playerId: effect.playerId,
      cardInstanceId: trashed.instanceId,
      cardNumber: trashed.cardNumber,
      reason: "character-area-limit",
    },
    ...placement.events,
  ];
}

/** `replacement-choice`. */
export function resolveReplacementChoice({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"replacement-choice">): PublicEvent[] {
  const resume = (): void => {
    state.pendingEffect = null;
    if (effect.resumePhase && effect.resumePlayerId) {
      state.phase = effect.resumePhase;
      state.activePlayer = effect.resumePlayerId;
    } else {
      state.activePlayer = effect.sourcePlayerId;
    }
  };
  if (optionId === "skip") {
    // Declining the replacement lets the K.O. happen as normal.
    const removed = knockOut(
      state,
      effect.playerId,
      effect.targetInstanceId,
      effect.sourceCardNumber,
    );
    resume();
    if (!removed) return [];
    const koEvents = [...removed.events];
    const onKo = createOnKoResult(
      state,
      effect.playerId,
      removed.card,
      effect.resumePlayerId ?? effect.sourcePlayerId,
      db,
    );
    koEvents.push(...onKo.events);
    if (onKo.pending) state.pendingEffect = onKo.pending;
    return koEvents;
  }
  if (!effect.options.some((option) => option.optionId === optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  // Replacements are addressed exactly as they were when the source chose
  // them, so the handlers below are reached unchanged; only who is asked has
  // moved. Rebuild the K.O. pending effect those handlers expect and recurse.
  const planted: PendingEffect = {
    kind: "ko-character",
    playerId: effect.sourcePlayerId,
    targetPlayerId: effect.playerId,
    sourceCardNumber: effect.sourceCardNumber,
    sourceInstanceId: effect.sourceInstanceId,
    eligibleInstanceIds: [effect.targetInstanceId],
    ...(effect.resumePhase ? { resumePhase: effect.resumePhase } : {}),
    ...(effect.resumePlayerId ? { resumePlayerId: effect.resumePlayerId } : {}),
  };
  state.pendingEffect = planted;
  const events = resolveEffect(state, optionId, db);
  // A replacement handler returns without clearing the effect it was reached
  // through, so the scaffolding has to be taken down here or the source would
  // be asked to pick a K.O. target all over again.
  if (state.pendingEffect === planted) resume();
  return events;
}

/** `hand-trash-replacement`. */
export function resolveHandTrashReplacement({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"hand-trash-replacement">): PublicEvent[] {
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const handIndex = player.hand.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [card] = player.hand.splice(handIndex, 1);
  if (!card) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  player.trash.push(card);
  // A hand card trashed by the protector's effect: ST33-004's price and
  // OP14-045/049/056's clauses read these two marks.
  player.handTrashedByEffectTurn = state.turn;
  state.handTrashedByEffectOnTurn = {
    ...state.handTrashedByEffectOnTurn,
    [effect.playerId]: state.turn,
  };
  const leaderDrawCount =
    (effect.leaderDrawCount ?? 0) +
    navyHandTrashDraws(state, effect.playerId, effect.sourceCardNumber, db);
  const events: PublicEvent[] = [
    {
      type: "card-moved",
      playerId: effect.playerId,
      cardInstanceId: card.instanceId,
      cardNumber: card.cardNumber,
      from: "hand",
      to: "trash",
      sourceCardNumber: effect.sourceCardNumber,
    },
  ];
  if (effect.remaining > 1) {
    state.pendingEffect = {
      ...effect,
      eligibleInstanceIds: player.hand.map((candidate) => candidate.instanceId),
      remaining: effect.remaining - 1,
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
  if (effect.resumePhase && effect.resumePlayerId) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return events;
}

/** `battle-ko-replacement`. */
export function resolveBattleKoReplacement({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"battle-ko-replacement">): PublicEvent[] {
  const mechanic = optionId.startsWith("mechanic:")
    ? (effect.mechanicOptions ?? []).find(
        (option) => option.optionId === optionId,
      )
    : undefined;
  if (optionId !== "apply" && optionId !== "skip" && !mechanic) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  // Declining hands straight back to `resolveBattle`, which re-enters with
  // `koReplacementOffered` set and K.O.s the target as usual.
  if (optionId === "skip") return [];
  const events: PublicEvent[] = [];
  if (mechanic) {
    // A registered replacement answering battle destruction -- OP14-092
    // Mr.3(Galdino). The cost runs as the mechanic program it already is, and
    // the battle then ends with the target still on the board, which is what
    // "instead" means here.
    const [, , protectorId] = optionId.split(":");
    // A Leader can be the protector here too: OP05-001 Sabo's Leader answers a
    // lost battle, which no earlier Leader replacement did.
    const protector =
      protectorId === undefined
        ? undefined
        : replacementProtector(state, effect.playerId, protectorId);
    const entry = protector && replacementPrograms.get(protector.cardNumber);
    if (!protector || !entry) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    if (entry.oncePerTurn) {
      state.oncePerTurn.push(
        replacementKey(state, effect.playerId, protector.instanceId),
      );
    }
    const dispatched = dispatchMechanicInvocations(
      state,
      [
        {
          context: { sourcePlayerId: effect.playerId, source: protector },
          program: {
            // `SOURCE_BINDING`, because the protector *is* this program's
            // source and two of the cost shapes -- `ko-self` and the
            // `trash-self` pair -- act on the threatened card through the
            // binding they are handed. A name of this function's own invention
            // is bound to nothing, so those costs resolved to nothing here and
            // the Character stayed on the board having paid: OP08-045 Thatch is
            // the first entry that answers battle destruction *and* pays with
            // itself, which is what surfaced it.
            effect: replacementCostEffect(
              { protector, entry },
              true,
              SOURCE_BINDING,
            ),
          },
          // The card that lost the fight, for a cost paid *on it* (OP05-001
          // Sabo's −1000) -- bound under the name `replacementCostEffect`
          // reads for the bind it was handed.
          bindings: {
            [`${SOURCE_BINDING}-threatened`]: [effect.targetInstanceId],
          },
        },
      ],
      db,
    );
    events.push(...dispatched.events);
    const attackerPlayerId = state.activeAttack?.attackerPlayerId;
    state.activeAttack = null;
    state.pendingTrigger = null;
    if (dispatched.pending && dispatched.invocation) {
      state.pendingEffect = mechanicPendingEffect(
        dispatched.invocation,
        dispatched.pending,
        dispatched.continuations,
      );
      if (attackerPlayerId) {
        state.pendingEffectResume = {
          phase: "main",
          playerId: attackerPlayerId,
        };
      }
      state.activePlayer = effect.playerId;
      return events;
    }
    if (attackerPlayerId) {
      state.phase = "main";
      state.activePlayer = attackerPlayerId;
    }
    return events;
  }
  events.push(...applyRosinanteLifeProtection(state, effect.playerId));
  const attackerPlayerId = state.activeAttack?.attackerPlayerId;
  state.activeAttack = null;
  state.pendingTrigger = null;
  if (attackerPlayerId) {
    state.phase = "main";
    state.activePlayer = attackerPlayerId;
  }
  return events;
}
