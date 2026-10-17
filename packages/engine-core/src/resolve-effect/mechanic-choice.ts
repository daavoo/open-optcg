/**
 * The mechanic DSL's own pending choice, handed back to `resolveMechanicChoice`.
 *
 * One of the per-kind resolver modules `resolveEffect` dispatches to; see
 * `resolve-effect/index.ts` for the table and the contract they share.
 */
import {
  dispatchMechanicInvocations,
  getMechanicSignalInvocations,
} from "../card-mechanics.js";
import { mechanicPendingEffect } from "../effects.js";
import {
  pickOrderedReaction,
  resolveMechanicChoice,
  type MechanicInvocation,
  type MechanicResult,
} from "../mechanics.js";
import { type EffectContext } from "./context.js";
import { type PublicEvent } from "@one-piece-sim/protocol";

/** `mechanic-choice`. */
export function resolveMechanicChoiceEffect({
  state,
  effect,
  optionId,
}: EffectContext<"mechanic-choice">): PublicEvent[] {
  let result: MechanicResult;
  let ordered: MechanicInvocation[] = [];
  if (effect.choice.kind === "order-reactions") {
    // The pick runs now, untagged so it cannot ask again; the rest keep their
    // group and come back as the same question, one card smaller, once the
    // pick and whatever it set off have resolved.
    const { chosen, rest } = pickOrderedReaction(
      effect.choice.reactions,
      optionId,
    );
    const first = { ...chosen };
    delete first.orderGroup;
    ordered = [first, ...rest];
    result = { events: [], signals: [], pending: null };
  } else {
    result = resolveMechanicChoice(state, effect.choice, optionId);
  }
  // Already waiting first, then what this step set off (OP10-042#3).
  const continuations = [
    ...ordered,
    ...(effect.continuations ?? []),
    ...getMechanicSignalInvocations(state, result.signals),
  ];
  if (result.pending) {
    state.pendingEffect = {
      ...effect,
      // Recomputed rather than carried over: the next step of the same program
      // can belong to the other player. ST10-010's `optional` DON!! cost is
      // its controller's decision and the discard that follows is the
      // opponent's, and reusing `effect.playerId` left the second one on the
      // wrong side of the table.
      //
      // The fallback is the program's own source player, not `effect.playerId`
      // -- a step with no explicit `chooser` always means "answered by
      // whoever played the card" (see `resolvePlayer`'s reading of `"self"`),
      // which can differ from whoever answered the *previous* step. OP17-117
      // Maser Saber's decline branch is the first card to need this: its
      // outer `choice` hands the branch pick to the opponent, but the K.O.
      // that follows a decline belongs back to the card's own controller, who
      // never otherwise appears as `chooserPlayerId` because reading a `self`
      // step is the default rather than a named case.
      playerId:
        (result.pending.kind === "cards" ||
        result.pending.kind === "choice" ||
        result.pending.kind === "optional"
          ? result.pending.chooserPlayerId
          : undefined) ?? result.pending.execution.context.sourcePlayerId,
      choice: result.pending,
      ...(continuations.length > 0 ? { continuations } : {}),
    };
    return result.events;
  }
  const dispatched = dispatchMechanicInvocations(state, continuations);
  state.pendingEffect =
    dispatched.pending && dispatched.invocation
      ? mechanicPendingEffect(
          dispatched.invocation,
          dispatched.pending,
          dispatched.continuations,
          false,
          effect.activatedBy,
        )
      : null;
  const events = [...result.events, ...dispatched.events];
  // An `[Activate: Main]` that stopped to ask which card pays its cost lands
  // its steps here, on the answer, and the click that caused them is three
  // actions back. OP14-020 Dracule Mihawk is the shipped case: the rest it
  // asks for is a decision, the three DON!! it stands up is not, and a reader
  // watching the event stream saw the cost and never the payoff.
  //
  // Only once the program has finished, so the marker never lands on top of a
  // prompt the same action went on to raise.
  if (effect.activatedBy && state.pendingEffect === null && events.length > 0) {
    events.unshift({
      type: "ability-activated",
      playerId: effect.activatedBy,
      sourceCardNumber: effect.sourceCardNumber,
      sourceInstanceId: effect.sourceInstanceId,
    });
  }
  return events;
}
