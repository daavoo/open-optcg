/**
 * The pending slot and the Trigger window: how one transition hands a decision
 * to a player, and how the turn is picked back up once it is answered.
 *
 * Split out of `engine.ts` so the action handlers can reach it without
 * importing the module that dispatches them; see `board.ts`.
 */
import type { PlayerId, PublicEvent } from "@one-piece-sim/protocol";
import { withoutBasePowerSetters } from "./base-power.js";
import { getTriggerMechanicProgram } from "./card-mechanics.js";

import { bankDamagedLifeCard, dealDamage } from "./life.js";

import type { CardInstance, GameState } from "./model.js";

import { opponentOf, leaderInstanceId } from "./board.js";

export function attachDon(
  state: GameState,
  playerId: PlayerId,
  targetInstanceId: string,
  don: string[],
): void {
  const player = state.players[playerId];
  if (targetInstanceId === leaderInstanceId(playerId)) {
    player.leaderAttachedDon.push(...don);
    return;
  }
  const target = player.board.find(
    (card) => card.instanceId === targetInstanceId,
  );
  if (!target) throw new Error(`MISSING_DON_TARGET: ${targetInstanceId}`);
  target.attachedDon ??= [];
  target.attachedDon.push(...don);
}

export function addPowerModifier(
  state: GameState,
  playerId: PlayerId,
  targetInstanceId: string,
  amount: number,
  expiresAtTurn: number,
  source?: CardInstance,
): void {
  const modifier = {
    amount,
    expiresAtTurn,
    ...(source
      ? {
          sourceCardNumber: source.cardNumber,
          sourceInstanceId: source.instanceId,
        }
      : {}),
  };
  const player = state.players[playerId];
  if (targetInstanceId === leaderInstanceId(playerId)) {
    player.leaderPowerModifiers.push(modifier);
    return;
  }
  const target = player.board.find(
    (card) => card.instanceId === targetInstanceId,
  );
  if (!target) throw new Error(`MISSING_POWER_TARGET: ${targetInstanceId}`);
  target.powerModifiers ??= [];
  target.powerModifiers.push(modifier);
}

export function triggerFranky(
  state: GameState,
  eventPlayerId: PlayerId,
  events: PublicEvent[],
): void {
  const frankyPlayerId = opponentOf(eventPlayerId);
  if (state.activeAttack?.attackerPlayerId !== frankyPlayerId) return;
  // [Once Per Turn] is per copy, not per card number: two Frankys each get their
  // own activation, so the key has to name the instance. Keyed by card number,
  // the four copies ST31 runs shared one use between them -- the same shape every
  // other [Once Per Turn] in the engine keys per instance
  // (`:activate-main`, `:on-opponent-attack`, `:leader-watcher`, `:redirect`).
  const franky = state.players[frankyPlayerId].board.find(
    (card) =>
      card.cardNumber === "OP11-012" &&
      !state.oncePerTurn.includes(
        `${state.turn}:${frankyPlayerId}:${card.instanceId}:franky`,
      ),
  );
  if (!franky) return;
  state.oncePerTurn.push(
    `${state.turn}:${frankyPlayerId}:${franky.instanceId}:franky`,
  );
  for (const character of state.players[frankyPlayerId].board) {
    addPowerModifier(
      state,
      frankyPlayerId,
      character.instanceId,
      2000,
      state.turn,
      franky,
    );
    events.push({
      type: "power-changed",
      playerId: frankyPlayerId,
      targetInstanceId: character.instanceId,
      amount: 2000,
      expiresAtTurn: state.turn,
      sourceCardNumber: franky.cardNumber,
      sourceInstanceId: franky.instanceId,
    });
  }
  // No second bump for an attacking Character: the +2000 above is a modifier on
  // the card, and `battleAttackPower` reads the card. This used to add it again
  // by hand to keep the frozen attack scalar in step with the board.
}

/**
 * Card numbers whose Trigger the engine still resolves as a hand-written branch
 * in `applyAction`, rather than as a mechanic program.
 *
 * A debt register like `LEGACY_IMPERATIVE_CARDS` in `test/card-support.test.ts`,
 * and the reason the Trigger step cannot simply ask the mechanic registry.
 */
export const BESPOKE_TRIGGERS = [
  "OP04-016",
  "OP13-021",
  "OP12-039",
  "EB04-028",
  "OP12-057",
  "ST36-002",
  "ST36-003",
  "OP10-109",
  "OP12-113",
  "P-088",
  "OP13-116",
  "OP11-079",
  "OP11-081",
  "OP02-068",
  "OP11-061",
  "OP06-058",
  "OP12-098",
];

/**
 * Whether a damaged Life card opens the Trigger step.
 *
 * Anything with a mechanic program is picked up automatically, which is how
 * OP09-112 Belo Betty's Trigger reaches the player at all; the bespoke list
 * covers the Triggers still handled by hand. Asked by battle damage and by
 * `settleEffectDamage`, so effect damage and battle damage cannot disagree about
 * which Triggers exist.
 */
export function opensTriggerWindow(cardNumber: string): boolean {
  return (
    BESPOKE_TRIGGERS.includes(cardNumber) ||
    getTriggerMechanicProgram(cardNumber) !== undefined
  );
}

/**
 * Finish a point of damage dealt by an effect.
 *
 * `dealDamage` parks the damaged card in `state.pendingTrigger` because the
 * mechanics interpreter cannot tell which Triggers the engine knows how to run.
 * This is where that is decided, on the way out of the action that dealt the
 * damage: either the window opens for the damaged player -- with the phase and
 * player it interrupted recorded so the Trigger can hand control back -- or the
 * card goes to its owner's hand, which is what "took 1 damage" means otherwise.
 */
/**
 * Pay the second point of [Double Attack] battle damage.
 *
 * Deliberately not dealt inside `resolveBattle`: the first point may open a
 * Trigger window, and `dealDamage` refuses to park a second damaged card while
 * one is still open. So the debt is recorded and paid here, once the battle has
 * ended and nothing is pending -- which is the same transition when the first
 * point opened no window, and a later one when it did.
 */
export function settleDoubleAttackDamage(
  state: GameState,
  events: PublicEvent[],
): void {
  const owed = state.pendingBattleDamage;
  if (!owed) return;
  if (state.phase === "finished" || state.phase === "trigger") return;
  if (state.pendingTrigger || state.pendingEffect || state.activeAttack) return;
  // "If my opponent has 1 Life card, can I win the game by using a [Double
  // Attack] to deal 2 damage?" -- "No, you cannot." Bandai's own rules Q&A,
  // under Keyword Effects; `qa_rules.pdf` is in the reference snapshot for it.
  //
  // The same document gives the mechanism: "If you still have 1 or more Life
  // cards left after you have activated the [Trigger] effect from the first
  // damage, check a Life card according to the second damage." Each point of
  // [Double Attack] damage *checks a Life card*, so a point with no Life card
  // left to check does nothing at all.
  //
  // That is not the same rule as an attack declared into 0 Life, which does
  // win -- `resolveBattle`'s own game-win branch. The difference is that a
  // declared attack is a new attack and this is the tail of one that has
  // already resolved, which is why the fix belongs here and not in
  // `dealDamage`: an *effect* that deals damage to a player on 0 Life still
  // ends the game.
  //
  // The debt is dropped rather than deferred. The battle that owed it is over,
  // and nothing inside this settle step can put a Life card back.
  if (state.players[owed.playerId].life.length === 0) {
    delete state.pendingBattleDamage;
    return;
  }
  if (owed.remaining > 1) {
    state.pendingBattleDamage = {
      ...owed,
      remaining: owed.remaining - 1,
    };
  } else {
    delete state.pendingBattleDamage;
  }
  events.push(...dealDamage(state, owed.playerId, owed.banish === true));
}

export function settleEffectDamage(
  state: GameState,
  events: PublicEvent[],
): void {
  const trigger = state.pendingTrigger;
  if (!trigger?.fromEffect) return;
  // Not while another effect is still resolving. The damage that parked this
  // card was dealt from inside that effect -- OP13-091 Mars K.O.s OP14-115
  // Rindo, whose [On K.O.] damages its own controller, while OP13-083
  // Saturn's search is still to be answered -- and opening the window now
  // hands the damaged player the other effect's choice, then restores the
  // phase that effect saved from before the Trigger existed, which drops the
  // Trigger unanswered. The card stays parked; the action that finishes the
  // effect settles it from the phase play actually returns to.
  if (state.pendingEffect) return;
  // Only the three interruptible steps can be resumed. Effect damage is dealt
  // while resolving a pending effect, which happens in one of them.
  const interrupted =
    state.phase === "block" || state.phase === "counter" ? state.phase : "main";
  if (
    state.phase !== "finished" &&
    opensTriggerWindow(trigger.card.cardNumber)
  ) {
    // Same private look as battle damage: only the damaged player sees which
    // Life card it is while deciding. The public reveal, if it comes, is the
    // act of activating the Trigger -- see `applyResolveTrigger`.
    events.push({
      type: "card-revealed",
      playerId: trigger.playerId,
      cardNumber: trigger.card.cardNumber,
      sourceCardNumber: trigger.card.cardNumber,
      // A Life card an effect already turned face-up is public knowledge, so
      // there is nothing left to keep private about it.
      ...(trigger.card.faceUp === true ? {} : { visibleTo: trigger.playerId }),
    });
    state.pendingTrigger = {
      playerId: trigger.playerId,
      card: trigger.card,
      resume: { phase: interrupted, playerId: state.activePlayer },
    };
    state.phase = "trigger";
    state.activePlayer = trigger.playerId;
    return;
  }
  state.pendingTrigger = null;
  events.push(...bankDamagedLifeCard(state, trigger.playerId, trigger.card));
}

/**
 * Hand control back once a Trigger resolves.
 *
 * A Trigger raised by battle damage returns to the attacker's Main phase, which
 * is what `resumeMainAfterBattle` does. One raised by an effect has no battle to
 * end -- it interrupted a phase that is still owed to somebody -- so it restores
 * exactly what it interrupted and leaves any live attack alone.
 */
export function resumeAfterTrigger(state: GameState): void {
  const resume = state.pendingTrigger?.resume;
  if (!resume) {
    resumeMainAfterBattle(state);
    return;
  }
  state.pendingTrigger = null;
  if (state.phase === "finished") return;
  state.phase = resume.phase;
  state.activePlayer = resume.playerId;
}

/**
 * Hands a pending decision to the player it names, remembering where to return.
 *
 * A `PendingEffect` has always carried the player who answers it, and every
 * effect that needed someone else to answer -- `opponent-discard`, the
 * replacement choices -- assigned `state.activePlayer` by hand at its own call
 * site. A mechanic program cannot: it is one interpreter shared by every card,
 * and the choice it suspends on is built from the DSL rather than from a branch
 * with the state in scope. ST10-010 Trafalgar Law is the first card whose
 * program names the opponent as chooser, and this is what makes that reach the
 * opponent's action list.
 *
 * Does nothing when the pending effect is already the active player's, which is
 * every other case.
 */
export function handOverPendingEffect(state: GameState): void {
  const pending = state.pendingEffect;
  if (!pending || pending.playerId === state.activePlayer) return;
  state.pendingEffectResume ??= {
    phase:
      state.phase === "block" || state.phase === "counter"
        ? state.phase
        : "main",
    playerId: state.activePlayer,
  };
  state.activePlayer = pending.playerId;
}

export function resumeMainAfterBattle(state: GameState): void {
  const attackerPlayerId = state.activeAttack?.attackerPlayerId;
  clearBattleScopedBasePower(state);
  state.activeAttack = null;
  // A card parked by `dealDamage` is held outside every zone, and
  // `settleEffectDamage` -- which runs at the very end of the action -- is what
  // decides where it goes. Nulling it here would destroy it, which the zone
  // invariant catches as an identity that vanished. Reachable since OP14-115
  // Rindo, whose `[On K.O.]` deals its own controller a point of damage from
  // inside the battle that killed it, so the parked card outlives the battle.
  //
  // A *battle*-damage trigger carries no `fromEffect` and nothing else settles
  // it, so that one is still cleared here as it always was.
  if (!state.pendingTrigger?.fromEffect) state.pendingTrigger = null;
  if (state.phase !== "finished" && attackerPlayerId) {
    state.phase = "main";
    state.activePlayer = attackerPlayerId;
  }
}

/**
 * Drops the base-power overrides written "during this battle".
 *
 * OP14-009 Trafalgar Law's swap is the only source. Every other base-power
 * setter is turn-scoped and is cleaned up with the rest of the turn's
 * modifiers in `completeEndTurn`; this one has to go when the fight it was
 * written for does, or the swap defends the whole turn. Any turn-scoped setter
 * on the same card stays, and applies again once the swap is gone.
 */
export function clearBattleScopedBasePower(state: GameState): void {
  for (const playerId of ["p1", "p2"] as const) {
    const player = state.players[playerId];
    const leaderBasePowers = withoutBasePowerSetters(
      player.leaderBasePowers,
      (setter) => setter.battleScoped === true,
    );
    if (leaderBasePowers) player.leaderBasePowers = leaderBasePowers;
    else delete player.leaderBasePowers;
    for (const card of player.board) {
      const basePowerOverrides = withoutBasePowerSetters(
        card.basePowerOverrides,
        (setter) => setter.battleScoped === true,
      );
      if (basePowerOverrides) card.basePowerOverrides = basePowerOverrides;
      else delete card.basePowerOverrides;
    }
  }
}
