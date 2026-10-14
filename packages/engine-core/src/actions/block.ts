/**
 * `block`: Redirect an attack onto a rested-by-blocking `[Blocker]`.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import {
  dispatchMechanicInvocations,
  getMechanicSignalInvocations,
  onBlockInvocation,
} from "../card-mechanics.js";
import { mechanicPendingEffect } from "../effects.js";
import { winsOnOpponentBlock } from "../static-abilities.js";
import { leaderInstanceId } from "../board.js";
import { retargetAttack } from "../model.js";
import { type ActionContext } from "./context.js";

export function applyBlock({
  state,
  events,
  activePlayer,
  offered,
  db,
}: ActionContext<"block">): void {
  const attack = state.activeAttack;
  if (!attack) throw new Error("NO_ACTIVE_ATTACK");
  if (offered.blockerInstanceId === leaderInstanceId(activePlayer)) {
    // OP05-022 Donquixote Rosinante: a Leader activating [Blocker]. It rests
    // and becomes the target, and the battle runs against the Leader from here
    // -- `resolveBattle` already knows what a lost battle against a Leader
    // costs. The same two watchers a Character's block wakes are woken: the
    // OP09-118 win check and the `blocker-activated` bench signal. No
    // `[On Block]` table lookup, because no Leader prints one.
    state.players[activePlayer].leaderRested = true;
    retargetAttack(attack, offered.blockerInstanceId);
    state.phase = "counter";
    events.push({
      type: "attack-blocked",
      playerId: activePlayer,
      blockerInstanceId: offered.blockerInstanceId,
    });
    if (winsOnOpponentBlock(state, attack.attackerPlayerId, db)) {
      state.phase = "finished";
      state.winner = attack.attackerPlayerId;
      state.activeAttack = null;
      events.push({
        type: "game-ended",
        winner: attack.attackerPlayerId,
        reason: "card-effect",
      });
      return;
    }
    const watchers = dispatchMechanicInvocations(
      state,
      getMechanicSignalInvocations(state, [
        { kind: "blocker-activated", playerId: activePlayer },
      ]),
      db,
    );
    events.push(...watchers.events);
    if (watchers.pending && watchers.invocation) {
      state.pendingEffect = mechanicPendingEffect(
        watchers.invocation,
        watchers.pending,
        watchers.continuations,
      );
      state.pendingEffectResume = { phase: "counter", playerId: activePlayer };
      state.phase = "main";
      state.activePlayer = attack.attackerPlayerId;
    }
  } else {
    const blocker = state.players[activePlayer].board.find(
      (card) => card.instanceId === offered.blockerInstanceId,
    );
    if (!blocker)
      throw new Error(`MISSING_BLOCKER: ${offered.blockerInstanceId}`);
    blocker.rested = true;
    retargetAttack(attack, blocker.instanceId);
    state.phase = "counter";
    events.push({
      type: "attack-blocked",
      playerId: activePlayer,
      blockerInstanceId: blocker.instanceId,
    });
    // OP09-118 Gol.D.Roger: "when your opponent activates [Blocker]" is this
    // action and only this action -- a card that changes an attack's target
    // from the `[On Your Opponent's Attack]` ladder moves it without activating
    // anything -- and the win is checked before the `[On Block]` window,
    // because a game that is already over has no window.
    if (winsOnOpponentBlock(state, attack.attackerPlayerId, db)) {
      state.phase = "finished";
      state.winner = attack.attackerPlayerId;
      state.activeAttack = null;
      events.push({
        type: "game-ended",
        winner: attack.attackerPlayerId,
        reason: "card-effect",
      });
      return;
    }
    // "When your opponent activates [Blocker] …" -- OP06-048 Zeff, watching
    // from the attacking player's bench. Raised from this branch rather than
    // from the `attack-blocked` event, so that it tracks a rested [Blocker]
    // rather than any move of the attack -- the line `winsOnOpponentBlock`
    // draws just above.
    //
    // A watcher that stops to ask something takes the pending slot the same way
    // the `[On Block]` program below does, and hands the battle back to the
    // Counter step when it settles.
    const watchers = dispatchMechanicInvocations(
      state,
      getMechanicSignalInvocations(state, [
        { kind: "blocker-activated", playerId: activePlayer },
      ]),
      db,
    );
    events.push(...watchers.events);
    if (watchers.pending && watchers.invocation) {
      state.pendingEffect = mechanicPendingEffect(
        watchers.invocation,
        watchers.pending,
        watchers.continuations,
      );
      state.pendingEffectResume = { phase: "counter", playerId: activePlayer };
      state.phase = "main";
      state.activePlayer = attack.attackerPlayerId;
    }
    // "[On Block] …" -- OP10-077 Bellamy, OP12-081 Sabo. The window opens
    // because *this* card blocked, which is why it is dispatched here and not
    // from the reaction ladder that offers `[On Your Opponent's Attack]`: that
    // one fires on the declaration, whether or not anything blocks.
    //
    // A program that suspends on a choice resumes into the Counter step, which
    // is where the block hands the battle next -- the same `pendingEffectResume`
    // seam a `[When Attacking]` program uses to hand back the Block step.
    const onBlock = onBlockInvocation(state, activePlayer, blocker);
    if (onBlock) {
      const dispatched = dispatchMechanicInvocations(
        state,
        [onBlock.invocation],
        db,
      );
      events.push(...dispatched.events);
      if (dispatched.pending && dispatched.invocation) {
        state.pendingEffect = mechanicPendingEffect(
          dispatched.invocation,
          dispatched.pending,
          dispatched.continuations,
        );
        state.pendingEffectResume = {
          phase: "counter",
          playerId: activePlayer,
        };
        state.phase = "main";
        state.activePlayer = activePlayer;
      }
      // Spent whether or not the program asked anything: `requires` already
      // guarantees the dispatch could pay for itself, so a clause that resolved
      // silently has still been used.
      state.oncePerTurn.push(onBlock.oncePerTurnKey);
    }
  }
}
