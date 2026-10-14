/**
 * `resolve-effect`: Answer the pending effect's current choice, and resume whatever was suspended for it.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import { resolveEffect } from "../effects.js";
import { offerAttackReactions, resolveBattle } from "../battle.js";
import { handOverPendingEffect } from "../pending.js";
import { completeEndTurn, endTurn } from "../turn.js";
import { type ActionContext } from "./context.js";

export function applyResolveEffect({
  state,
  events,
  offered,
}: ActionContext<"resolve-effect">): void {
  const resolvedEffect = state.pendingEffect;
  // An `[On Your Opponent's Attack]` offer spends its `[Once Per Turn]` use on
  // the answer that takes it, and never on the decline. The offer itself
  // cannot mark the key -- unlike `[Activate: Main]`, the player did not go
  // looking for this ability, an attack pushed it at them.
  const onOpponentAttackOffer = state.activeAttack?.onOpponentAttackPending;
  // Same rule, for the leader-watcher ladder's own pending offer.
  const leaderWatcherOffer = state.activeAttack?.leaderWatcherPending;
  const completesEndTurn = resolvedEffect?.kind === "kid-leader-end-turn";
  // Borsalino, and any `[End of Your Turn]` mechanic-program answer (e.g.
  // OP17-047 Shiki), re-enter `endTurn` instead of completing it, so a second
  // eligible card gets its own prompt before the turn actually ends.
  const continuesEndTurn =
    resolvedEffect?.kind === "borsalino-end-turn" ||
    (resolvedEffect?.kind === "mechanic-choice" &&
      resolvedEffect.endOfTurn === true);
  events.push(...resolveEffect(state, offered.optionId));
  if (onOpponentAttackOffer) {
    if (offered.optionId !== "skip") {
      state.oncePerTurn.push(onOpponentAttackOffer.oncePerTurnKey);
    }
    if (state.activeAttack?.onOpponentAttackPending === onOpponentAttackOffer) {
      delete state.activeAttack.onOpponentAttackPending;
    }
  }
  if (leaderWatcherOffer) {
    if (offered.optionId !== "skip") {
      state.oncePerTurn.push(leaderWatcherOffer.oncePerTurnKey);
    }
    if (state.activeAttack?.leaderWatcherPending === leaderWatcherOffer) {
      delete state.activeAttack.leaderWatcherPending;
    }
  }
  // A declined battle K.O. replacement leaves the battle exactly where it was;
  // finish resolving it.
  if (
    resolvedEffect?.kind === "battle-ko-replacement" &&
    !state.pendingEffect &&
    state.activeAttack
  ) {
    resolveBattle(state, events);
  }
  if (completesEndTurn) completeEndTurn(state, events);
  else if (continuesEndTurn && !state.pendingEffect) endTurn(state, events);
  else if (
    continuesEndTurn &&
    state.pendingEffect?.kind === "mechanic-choice" &&
    state.pendingEffect.endOfTurn !== true
  ) {
    // A further choice raised while answering an end-of-turn one -- the next
    // `order-reactions` question when three cards answer OP08-074 Black
    // Maria's end-of-turn return -- is part of ending the turn too. Unmarked,
    // answering it left the player back in their Main Phase.
    state.pendingEffect.endOfTurn = true;
  }
  // A resolution can raise the *next* decision for the other player: the
  // second half of ST10-010's program is the opponent choosing their own
  // discards, and it only exists once the DON!! cost has been paid.
  handOverPendingEffect(state);
  if (!state.pendingEffect && state.pendingEffectResume) {
    // A finished game is not resumed: EB03-055 Nico Robin's [On K.O.] can deal
    // the last point of damage from inside a pending effect, and restoring the
    // interrupted phase over it would un-end the game.
    if (state.phase !== "finished") {
      state.phase = state.pendingEffectResume.phase;
      state.activePlayer = state.pendingEffectResume.playerId;
    }
    state.pendingEffectResume = null;
  }
  if (!state.pendingEffect && state.phase === "block" && state.activeAttack) {
    // Mirror the attack-declaration call site: once the reaction ladder has
    // nothing left to offer, fall through to the real block phase for the
    // defender. Ignoring this return value left `state.activePlayer` stuck
    // on whichever player last answered a reaction (e.g. the attacker, for
    // a leader-watcher effect on the attacker's own board) all the way into
    // `pass-block` and the counter phase.
    if (!offerAttackReactions(state, events, resolvedEffect)) {
      state.phase = "block";
      state.activePlayer = state.activeAttack.defenderPlayerId;
    }
  }
}
