/**
 * `resolve-trigger`: Answer a `[Trigger]` offer on a Life card an attack just took.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import {
  applyMechanicReactions,
  getMechanicSignalInvocations,
  getTriggerMechanicProgram,
} from "../card-mechanics.js";
import { type MechanicInvocation } from "../mechanics.js";
import {
  createSupernovaSearch,
  createTriggerResult,
  placeCharacter,
} from "../effects.js";
import { leaderInstanceId, opponentOf } from "../board.js";
import { bankDamagedLifeCard } from "../life.js";
import { addPowerModifier, resumeAfterTrigger } from "../pending.js";
import { knockOut, replacementOptionsFor } from "../removal.js";
import { registeredReplacementOptions } from "../mechanics-replacements.js";
import { type ActionContext } from "./context.js";

export function applyResolveTrigger({
  state,
  events,
  offered,
  db,
}: ActionContext<"resolve-trigger">): void {
  const trigger = state.pendingTrigger;
  const attack = state.activeAttack;
  if (!trigger) throw new Error("NO_PENDING_TRIGGER");
  // Where the Trigger hands control back, and who its effects treat as the
  // opponent. Battle damage reads both off the attack; damage dealt by an
  // effect -- EB03-055 Nico Robin's [On K.O.] -- recorded the phase and player
  // it interrupted instead, because there may be no battle at all.
  const resume =
    trigger.resume ??
    (attack
      ? { phase: "main" as const, playerId: attack.attackerPlayerId }
      : undefined);
  if (!resume) throw new Error("NO_PENDING_TRIGGER");
  const opposingPlayerId = resume.playerId;
  // `pendingEffectResume` has no Counter step; nothing that deals damage by
  // effect today interrupts one, so Main is the honest fallback.
  const effectResumePhase = resume.phase === "counter" ? "main" : resume.phase;
  const player = state.players[trigger.playerId];
  // "When a [Trigger] activates" -- OP13-106 Conney, OP05-109 Pagaya. Raised
  // for every answer but `skip`, which is not an activation at all: the card
  // simply joins the hand. Both settle before the battle the Trigger was
  // revealed in resumes, so a Blocker granted by one is live for it.
  //
  // A declarative Trigger takes the watchers as continuations of its own
  // program, because a watcher can stop to ask something (Pagaya chooses two
  // cards to trash) and only that queue can hold the question. The imperative
  // Triggers below still run the watchers here for their events alone, which
  // is what every watcher before Pagaya needed.
  let reactions: readonly MechanicInvocation[] = [];
  if (offered.optionId !== "skip") {
    // Activating is what turns the Life card face-up. Until this point the
    // damaged player alone knew which card it was (the window opened with a
    // `card-revealed` marked `visibleTo` them), so this is the first step that
    // names it to the opponent.
    events.push({
      type: "card-revealed",
      playerId: trigger.playerId,
      cardNumber: trigger.card.cardNumber,
      sourceCardNumber: trigger.card.cardNumber,
    });
    if (getTriggerMechanicProgram(trigger.card.cardNumber)) {
      reactions = getMechanicSignalInvocations(state, [
        { kind: "trigger-activated", playerId: trigger.playerId },
      ]);
    } else {
      events.push(
        ...applyMechanicReactions(state, [
          { kind: "trigger-activated", playerId: trigger.playerId },
        ]).events,
      );
    }
  }
  if (offered.optionId === "skip") {
    // A declined Trigger is ordinary damage, so it lands the same way the
    // no-Trigger path in `resolveBattle` does -- redacted into the hand, or on
    // the bottom of the deck under ST13-003's Leader.
    events.push(
      ...bankDamagedLifeCard(state, trigger.playerId, trigger.card, db),
    );
    resumeAfterTrigger(state);
  } else if (getTriggerMechanicProgram(trigger.card.cardNumber)) {
    // The damage's Life watchers join the Trigger's queue, unless a second
    // [Double Attack] point is still owed: they wait for that too (OP05-098#4).
    const held = state.pendingBattleDamage
      ? []
      : (state.pendingDamageReactions ?? []);
    if (held.length > 0) delete state.pendingDamageReactions;
    const triggered = createTriggerResult(
      state,
      trigger.playerId,
      trigger.card,
      db,
      reactions,
      held,
    );
    // A Trigger that reads "play this card" puts itself on the board, so the
    // usual trip to the trash would duplicate it. OP12-080 Baratie is a *Stage*
    // and lands in the Stage area instead, which is the same question asked of
    // the other zone.
    // A Trigger that puts its own card somewhere has already accounted for it,
    // so the usual trip to the trash would duplicate it: "play this card" lands
    // on the board, OP12-080 Baratie is a *Stage* and lands in the Stage area,
    // and OP07-102/OP07-103 read "add this card to your hand". The question is
    // the same one in all three cases -- is the card in a zone yet -- so it is
    // asked of every zone rather than of the two that happened to come first.
    const relocated = [
      ...player.board,
      ...player.hand,
      ...player.trash,
      ...player.deck,
      ...player.life,
      ...(player.stage ? [player.stage] : []),
    ].some((card) => card.instanceId === trigger.card.instanceId);
    if (!relocated) {
      player.trash.push({
        instanceId: trigger.card.instanceId,
        cardNumber: trigger.card.cardNumber,
      });
    }
    events.push(...triggered.events);
    if (!trigger.resume) state.activeAttack = null;
    state.pendingTrigger = null;
    state.phase = resume.phase;
    // The Trigger's first decision may belong to its owner's opponent: OP17-117
    // Maser Saber asks them whether to trash 3 cards (Bandai's OP-17 Q&A,
    // OP17-117#1), so control goes to whoever the pending effect names.
    state.activePlayer = triggered.pending?.playerId ?? trigger.playerId;
    state.pendingEffect = triggered.pending;
    if (triggered.pending) {
      state.pendingEffectResume = {
        phase: effectResumePhase,
        playerId: opposingPlayerId,
      };
    } else {
      state.activePlayer = opposingPlayerId;
    }
  } else if (
    ["OP02-068", "OP11-061", "OP06-058"].includes(trigger.card.cardNumber)
  ) {
    const ownerId = (["p1", "p2"] as const).find((playerId) =>
      state.players[playerId].board.some(
        (card) => card.instanceId === offered.optionId,
      ),
    );
    if (!ownerId) {
      throw new Error(`MISSING_EFFECT_TARGET: ${offered.optionId}`);
    }
    const owner = state.players[ownerId];
    const targetIndex = owner.board.findIndex(
      (card) => card.instanceId === offered.optionId,
    );
    const [target] = owner.board.splice(targetIndex, 1);
    if (!target) throw new Error(`MISSING_EFFECT_TARGET: ${offered.optionId}`);
    owner.restedDon.push(...(target.attachedDon ?? []));
    const moved = {
      instanceId: target.instanceId,
      cardNumber: target.cardNumber,
    };
    if (trigger.card.cardNumber === "OP02-068") owner.hand.push(moved);
    else owner.deck.push(moved);
    player.trash.push(trigger.card);
    // The Character leaves the board, so the opponent needs a step saying
    // which one went where; without it the Trigger's removal reads as
    // silent (the history shows nothing and the card just vanishes).
    events.push({
      type: "card-moved",
      playerId: ownerId,
      cardInstanceId: target.instanceId,
      cardNumber: target.cardNumber,
      from: "board",
      to: trigger.card.cardNumber === "OP02-068" ? "hand" : "deck",
      ...(trigger.card.cardNumber === "OP02-068" ? {} : { position: "bottom" }),
      sourceCardNumber: trigger.card.cardNumber,
    });
    resumeAfterTrigger(state);
  } else if (
    trigger.card.cardNumber === "ST36-002" ||
    trigger.card.cardNumber === "P-088"
  ) {
    const attackerPlayerId = state.activeAttack?.attackerPlayerId;
    const placement = placeCharacter(
      state,
      trigger.playerId,
      trigger.card,
      false,
      db,
    );
    if (!trigger.resume) state.activeAttack = null;
    state.pendingTrigger = null;
    state.phase = resume.phase;
    state.activePlayer = trigger.playerId;
    state.pendingEffect = placement.pending;
    events.push(...placement.events);
    if (placement.pending && attackerPlayerId) {
      state.pendingEffectResume = {
        phase: "main",
        playerId: attackerPlayerId,
      };
    } else if (attackerPlayerId) {
      state.activePlayer = attackerPlayerId;
    }
  } else if (trigger.card.cardNumber === "ST36-003") {
    const drawn = player.deck.shift();
    if (drawn) {
      player.hand.push(drawn);
      events.push({
        type: "cards-drawn",
        playerId: trigger.playerId,
        count: 1,
      });
    }
    const key = `${state.turn}:${trigger.playerId}:ST36-003:base-power`;
    if (!state.oncePerTurn.includes(key)) {
      const printed = db.require(player.leaderCardNumber).power ?? 0;
      addPowerModifier(
        state,
        trigger.playerId,
        leaderInstanceId(trigger.playerId),
        7000 - printed,
        state.turn,
        trigger.card,
      );
      state.oncePerTurn.push(key);
    }
    player.trash.push({
      instanceId: trigger.card.instanceId,
      cardNumber: trigger.card.cardNumber,
    });
    resumeAfterTrigger(state);
  } else if (trigger.card.cardNumber === "OP11-079") {
    const drawn = player.deck.shift();
    if (drawn) {
      player.hand.push(drawn);
      events.push({
        type: "cards-drawn",
        playerId: trigger.playerId,
        count: 1,
      });
    }
    player.trash.push(trigger.card);
    resumeAfterTrigger(state);
  } else if (trigger.card.cardNumber === "OP11-081") {
    player.activeDon.push(...player.donDeck.splice(0, 1));
    player.trash.push(trigger.card);
    resumeAfterTrigger(state);
  } else if (trigger.card.cardNumber === "OP10-109") {
    let drawn = 0;
    while (drawn < 2) {
      const card = player.deck.shift();
      if (!card) break;
      player.hand.push(card);
      drawn += 1;
    }
    if (drawn > 0) {
      events.push({
        type: "cards-drawn",
        playerId: trigger.playerId,
        count: drawn,
      });
    }
    player.trash.push({
      instanceId: trigger.card.instanceId,
      cardNumber: trigger.card.cardNumber,
    });
    if (!trigger.resume) state.activeAttack = null;
    state.pendingTrigger = null;
    state.phase = resume.phase;
    state.activePlayer = trigger.playerId;
    if (player.hand.length > 0) {
      state.pendingEffect = {
        kind: "draw-trash",
        playerId: trigger.playerId,
        sourceCardNumber: trigger.card.cardNumber,
        sourceInstanceId: trigger.card.instanceId,
        trashCount: 1,
        resumePhase: "main",
        resumePlayerId: opposingPlayerId,
      };
    } else {
      state.activePlayer = opposingPlayerId;
    }
  } else if (trigger.card.cardNumber === "OP12-113") {
    const koTargetId =
      offered.optionId === "activate" ? undefined : offered.optionId;
    // "your opponent's Characters" is read from the Trigger's controller, not
    // from whoever the turn returns to. Those are the same player when the
    // Trigger fires from a Life card the attacker just took, and they are not
    // when it fires inside another effect's resolution: `trigger.resume` then
    // carries the controller's own seat, and resolving the K.O. against
    // `opposingPlayerId` looked for the chosen Character on the controller's
    // own board and threw `MISSING_EFFECT_TARGET` on a target the offer had
    // just listed. `legal-actions/trigger.ts` builds the offer from this same
    // expression, so the two cannot disagree again.
    const opponentId = opponentOf(trigger.playerId);
    const opponent = state.players[opponentId];
    const koTarget = koTargetId
      ? opponent.board.find((card) => card.instanceId === koTargetId)
      : undefined;
    if (koTargetId && !koTarget) {
      throw new Error(`MISSING_EFFECT_TARGET: ${koTargetId}`);
    }
    player.hand.push({
      instanceId: trigger.card.instanceId,
      cardNumber: trigger.card.cardNumber,
    });
    // This Trigger is the opponent's effect, so Koushirou, Ivankov and Dragon
    // may replace the K.O. Hand the choice to the target's controller through
    // the normal pending-effect path instead of removing the card outright.
    const replacements = koTarget && [
      ...replacementOptionsFor(
        state,
        trigger.playerId,
        opponentId,
        koTarget,
        koTarget.instanceId,
        db,
      ),
      ...registeredReplacementOptions(
        state,
        trigger.playerId,
        opponentId,
        koTarget,
        koTarget.instanceId,
        db,
      ),
    ];
    if (koTarget && replacements && replacements.length > 0) {
      // Priority follows the same convention as every other `ko-character`
      // effect: the source keeps priority through the choice and the turn
      // returns to the attacker afterwards. Note this means the source, not
      // the target's controller, currently picks whether a replacement is
      // used -- a pre-existing engine-wide issue that predates this path and
      // is tracked separately, not something this Trigger introduces.
      if (!trigger.resume) state.activeAttack = null;
      state.pendingTrigger = null;
      state.phase = resume.phase;
      state.activePlayer = trigger.playerId;
      state.pendingEffect = {
        kind: "ko-character",
        playerId: trigger.playerId,
        targetPlayerId: opponentId,
        sourceCardNumber: trigger.card.cardNumber,
        sourceInstanceId: trigger.card.instanceId,
        eligibleInstanceIds: [koTarget.instanceId],
        resumePhase: "main",
        // Where play returns, which is not the same question as whose
        // Character is being K.O.'d -- see the comment on `opponentId`.
        resumePlayerId: opposingPlayerId,
      };
    } else {
      if (koTarget) {
        const removed = knockOut(
          state,
          opponentId,
          koTarget.instanceId,
          trigger.card.cardNumber,
        );
        if (removed) events.push(...removed.events);
      }
      resumeAfterTrigger(state);
    }
  } else if (trigger.card.cardNumber === "OP13-116") {
    player.trash.push({
      instanceId: trigger.card.instanceId,
      cardNumber: trigger.card.cardNumber,
    });
    const pending = createSupernovaSearch(
      state,
      trigger.playerId,
      trigger.card,
      true,
      db,
    );
    pending.resumePhase = "main";
    pending.resumePlayerId = opposingPlayerId;
    state.pendingEffect = pending;
    if (!trigger.resume) state.activeAttack = null;
    state.pendingTrigger = null;
    state.phase = resume.phase;
    state.activePlayer = trigger.playerId;
  } else if (trigger.card.cardNumber === "OP12-057") {
    player.trash.push(trigger.card);
    if (!trigger.resume) state.activeAttack = null;
    state.pendingTrigger = null;
    state.phase = resume.phase;
    state.activePlayer = trigger.playerId;
    state.pendingEffect = {
      kind: "navy-discard",
      playerId: trigger.playerId,
      sourceCardNumber: trigger.card.cardNumber,
      sourceInstanceId: trigger.card.instanceId,
      eligibleInstanceIds: player.hand.map((card) => card.instanceId),
      remaining: 1,
      optional: true,
      after: { kind: "draw", count: 1 },
      resumePhase: "main",
      resumePlayerId: opposingPlayerId,
    };
  } else if (trigger.card.cardNumber === "EB04-028") {
    const targetOwnerId = (["p1", "p2"] as const).find((playerId) =>
      state.players[playerId].board.some(
        (card) => card.instanceId === offered.optionId,
      ),
    );
    if (!targetOwnerId) throw new Error("MISSING_EFFECT_TARGET");
    const owner = state.players[targetOwnerId];
    const targetIndex = owner.board.findIndex(
      (card) => card.instanceId === offered.optionId,
    );
    const [target] = owner.board.splice(targetIndex, 1);
    if (!target) throw new Error("MISSING_EFFECT_TARGET");
    owner.restedDon.push(...(target.attachedDon ?? []));
    owner.hand.push({
      instanceId: target.instanceId,
      cardNumber: target.cardNumber,
    });
    player.trash.push(trigger.card);
    events.push({
      type: "event-activated",
      playerId: trigger.playerId,
      cardNumber: trigger.card.cardNumber,
    });
    resumeAfterTrigger(state);
  } else {
    player.trash.push(trigger.card);
    const amount =
      trigger.card.cardNumber === "OP04-016"
        ? -3000
        : trigger.card.cardNumber === "OP13-021"
          ? -2000
          : 1000;
    const targetPlayerId =
      trigger.card.cardNumber === "OP12-039"
        ? trigger.playerId
        : opposingPlayerId;
    addPowerModifier(
      state,
      targetPlayerId,
      offered.optionId,
      amount,
      state.turn,
      trigger.card,
    );
    events.push(
      {
        type: "event-activated",
        playerId: trigger.playerId,
        cardNumber: trigger.card.cardNumber,
      },
      {
        type: "power-changed",
        playerId: targetPlayerId,
        targetInstanceId: offered.optionId,
        amount,
        expiresAtTurn: state.turn,
        sourceCardNumber: trigger.card.cardNumber,
        sourceInstanceId: trigger.card.instanceId,
      },
    );
  }
  if (
    trigger.card.cardNumber === "OP04-016" ||
    trigger.card.cardNumber === "OP13-021" ||
    trigger.card.cardNumber === "OP12-039"
  ) {
    resumeAfterTrigger(state);
  }
}
