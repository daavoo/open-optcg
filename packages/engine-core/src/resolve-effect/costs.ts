/**
 * Optional costs a player pays mid-resolution: Life to hand, cards off the deck, DON!! rested, a named guess.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import { addDonFromDeck } from "../don.js";
import { drawCards } from "../effects.js";
import { takeFromLife } from "../life.js";
import { addPowerModifier } from "../pending.js";
import { recordDeckTopKnowledge } from "../queries.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `p105-life-cost`. */
export function resolveP105LifeCost({
  state,
  effect,
  optionId,
}: EffectContext<"p105-life-cost">): PublicEvent[] {
  if (optionId === "skip") {
    state.pendingEffect = null;
    return [];
  }
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  const taken = takeFromLife(state, effect.playerId, optionId, {
    to: "hand",
    sourceCardNumber: effect.sourceCardNumber,
  });
  if (!taken) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  player.hand.push({
    instanceId: taken.card.instanceId,
    cardNumber: taken.card.cardNumber,
  });
  const eligibleInstanceIds = [
    `${effect.playerId}-leader`,
    ...player.board.map((card) => card.instanceId),
  ];
  state.pendingEffect =
    player.restedDon.length > 0
      ? {
          kind: "give-rested-don",
          playerId: effect.playerId,
          sourceCardNumber: effect.sourceCardNumber,
          sourceInstanceId: effect.sourceInstanceId,
          eligibleInstanceIds,
          maxCount: 1,
          resumePhase: "main",
          resumePlayerId: effect.playerId,
        }
      : null;
  return taken.events;
}

/** `st35-attack-cost`. */
export function resolveSt35AttackCost({
  state,
  effect,
  optionId,
}: EffectContext<"st35-attack-cost">): PublicEvent[] {
  if (optionId !== "apply" && optionId !== "skip") {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const player = state.players[effect.playerId];
  if (optionId === "apply") {
    player.trash.push(...player.deck.splice(0, 2));
    if (
      effect.sourceCardNumber === "ST35-003" &&
      state.players[effect.targetPlayerId].hand.length >= 7
    ) {
      const target = state.players[effect.targetPlayerId];
      state.pendingEffect = {
        kind: "opponent-discard",
        playerId: effect.targetPlayerId,
        sourcePlayerId: effect.playerId,
        sourceCardNumber: effect.sourceCardNumber,
        sourceInstanceId: effect.sourceInstanceId,
        eligibleInstanceIds: target.hand.map((card) => card.instanceId),
        resumePhase: "block",
        resumePlayerId: effect.targetPlayerId,
      };
      state.activePlayer = effect.targetPlayerId;
      return [];
    }
    if (
      effect.sourceCardNumber === "OP12-090" &&
      effect.eligibleInstanceIds.length > 0
    ) {
      state.pendingEffect = {
        kind: "reduce-cost",
        playerId: effect.playerId,
        targetPlayerId: effect.targetPlayerId,
        sourceCardNumber: effect.sourceCardNumber,
        sourceInstanceId: effect.sourceInstanceId,
        eligibleInstanceIds: effect.eligibleInstanceIds,
        amount: -2,
        expiresAtTurn: state.turn,
        resumePlayerId: effect.resumePlayerId,
      };
      return [];
    }
  }
  state.pendingEffect = null;
  state.phase = "block";
  state.activePlayer = effect.resumePlayerId;
  return [];
}

/** `reduce-cost`. */
export function resolveReduceCost({
  state,
  effect,
  optionId,
}: EffectContext<"reduce-cost">): PublicEvent[] {
  if (optionId !== "skip") {
    if (!effect.eligibleInstanceIds.includes(optionId)) {
      throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
    }
    const target = state.players[effect.targetPlayerId].board.find(
      (card) => card.instanceId === optionId,
    );
    if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
    target.costModifiers ??= [];
    target.costModifiers.push({
      amount: effect.amount,
      expiresAtTurn: effect.expiresAtTurn,
    });
  }
  state.pendingEffect = null;
  state.phase = "block";
  state.activePlayer = effect.resumePlayerId;
  return [];
}

/** `slave-arrow-cost`. */
export function resolveSlaveArrowCost({
  state,
  effect,
  optionId,
}: EffectContext<"slave-arrow-cost">): PublicEvent[] {
  const resume = (): void => {
    state.pendingEffect = null;
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  };
  if (optionId === "skip" && effect.step === "cost") {
    // "You may X: Y" -- decline the cost and the card resolves for nothing.
    // The Event is already in the trash and the DON!! already rested, which is
    // correct: the cost of *playing* it was paid before the choice.
    resume();
    return [];
  }
  if (!effect.eligibleInstanceIds.includes(optionId)) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  /**
   * The +4000 on the card the attack is aimed at goes into the battle's
   * counter pool, the way every Counter Event's does; on any other card it is
   * a battle-scoped modifier on that card, the same as a hand Counter played
   * aside in `actions/counter.ts`.
   */
  const boost = (targetInstanceId: string): PublicEvent[] => {
    const attack = state.activeAttack;
    if (!attack) return [];
    const used = {
      type: "counter-used" as const,
      playerId: effect.playerId,
      cardNumber: effect.sourceCardNumber,
      power: effect.power,
    };
    if (targetInstanceId === attack.targetInstanceId) {
      attack.counterPower += effect.power;
      return [used];
    }
    addPowerModifier(
      state,
      effect.playerId,
      targetInstanceId,
      effect.power,
      state.turn,
      {
        instanceId: effect.sourceInstanceId,
        cardNumber: effect.sourceCardNumber,
      },
      true,
    );
    return [{ ...used, targetInstanceId }];
  };
  if (effect.step === "target") {
    const events = boost(optionId);
    resume();
    return events;
  }
  const player = state.players[effect.playerId];
  const boardIndex = player.board.findIndex(
    (card) => card.instanceId === optionId,
  );
  const [returned] = player.board.splice(boardIndex, 1);
  if (!returned) throw new Error(`MISSING_EFFECT_TARGET: ${optionId}`);
  // A Character leaving the field returns its DON!! rested, as it does on K.O.
  player.restedDon.push(...(returned.attachedDon ?? []));
  player.hand.push({
    instanceId: returned.instanceId,
    cardNumber: returned.cardNumber,
  });
  // The card being attacked first, then the Leader and every Character. "Up
  // to 1" admits none, but with the cost already paid choosing none only
  // throws the power away, so it is not offered; nor is a prompt with one
  // card in it.
  const attacked = state.activeAttack?.targetInstanceId;
  const targets = [
    ...new Set([
      ...(attacked !== undefined &&
      (attacked === `${effect.playerId}-leader` ||
        player.board.some((card) => card.instanceId === attacked))
        ? [attacked]
        : []),
      `${effect.playerId}-leader`,
      ...player.board.map((card) => card.instanceId),
    ]),
  ];
  if (targets.length > 1) {
    state.pendingEffect = {
      ...effect,
      step: "target",
      eligibleInstanceIds: targets,
    };
    return [];
  }
  const events = boost(targets[0]!);
  resume();
  return events;
}

/** `st34-guess-cost`. */
export function resolveSt34GuessCost({
  state,
  effect,
  optionId,
  db,
}: EffectContext<"st34-guess-cost">): PublicEvent[] {
  const [kind, costText] = optionId.split(":");
  const chosenCost = Number(costText);
  if (
    kind !== "cost" ||
    !Number.isInteger(chosenCost) ||
    chosenCost < 0 ||
    chosenCost > 10
  ) {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const revealed = state.players[effect.targetPlayerId].deck[0];
  const matched =
    revealed !== undefined &&
    db.require(revealed.cardNumber).cost === chosenCost;
  // This one is a genuine public reveal, so both players learn the card and
  // the event stays visible to everyone.
  recordDeckTopKnowledge(state, effect.playerId, effect.targetPlayerId);
  recordDeckTopKnowledge(state, effect.targetPlayerId, effect.targetPlayerId);
  const events: PublicEvent[] = revealed
    ? [
        {
          type: "card-revealed",
          playerId: effect.playerId,
          cardNumber: revealed.cardNumber,
          sourceCardNumber: effect.sourceCardNumber,
        },
      ]
    : [];
  if (effect.outcome === "oven") {
    addDonFromDeck(state, effect.playerId, 1, "rested");
  }
  if (matched && effect.outcome === "perospero") {
    events.push(
      ...drawCards(state, effect.playerId, 1, effect.sourceCardNumber),
    );
    addDonFromDeck(state, effect.playerId, 1, "active");
  } else if (matched && effect.outcome === "counter-event") {
    if (!state.activeAttack) throw new Error("NO_ACTIVE_ATTACK");
    state.activeAttack.counterPower += 5000;
  } else if (
    matched &&
    (effect.outcome === "oven" || effect.outcome === "cognac")
  ) {
    const maxCost = effect.outcome === "oven" ? 3 : 8;
    const eligibleInstanceIds = state.players[effect.targetPlayerId].board
      .filter((card) => (db.require(card.cardNumber).cost ?? 99) <= maxCost)
      .map((card) => card.instanceId);
    if (eligibleInstanceIds.length > 0) {
      state.pendingEffect = {
        kind: "ko-character",
        playerId: effect.playerId,
        targetPlayerId: effect.targetPlayerId,
        sourceCardNumber: effect.sourceCardNumber,
        sourceInstanceId: effect.sourceInstanceId,
        eligibleInstanceIds,
        resumePhase: effect.resumePhase,
        resumePlayerId: effect.resumePlayerId,
      };
    }
  }
  if (!state.pendingEffect) {
    state.phase = effect.resumePhase;
    state.activePlayer = effect.resumePlayerId;
  }
  return events;
}

/** `kinemon-cost`. */
export function resolveKinemonCost({
  state,
  effect,
  optionId,
}: EffectContext<"kinemon-cost">): PublicEvent[] {
  if (optionId === "skip") return [];
  const player = state.players[effect.playerId];
  if (optionId === "leader" && !player.leaderRested) {
    player.leaderRested = true;
  } else if (optionId === "don" && player.activeDon.length > 0) {
    player.restedDon.push(...player.activeDon.splice(0, 1));
  } else {
    throw new Error(`INVALID_EFFECT_OPTION: ${optionId}`);
  }
  const events = drawCards(state, effect.playerId, 2, effect.sourceCardNumber);
  if (player.hand.length > 0) {
    state.pendingEffect = {
      kind: "draw-trash",
      playerId: effect.playerId,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
      trashCount: 1,
    };
  }
  return events;
}
