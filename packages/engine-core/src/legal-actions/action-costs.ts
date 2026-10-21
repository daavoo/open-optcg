/**
 * What a mechanic program pays and what DON!! it adds, read off the program.
 *
 * Both summaries feed `LegalAction.cost` and `LegalAction.ramps`, which exist so
 * a policy can price an offer without knowing the card. The engine has always
 * known these numbers -- it gates the offer on them -- and until the action
 * carried them every rule about an optional cost named a card number.
 */
import type { MechanicEffect, MechanicProgram } from "../mechanics.js";
import {
  PAYOFF_KINDS,
  type ActionCost,
  type PayoffKind,
} from "@one-piece-sim/protocol";

/**
 * The cost an accepted effect pays, when it is what the effect does *first*.
 *
 * Three DSL shapes carry one. "You may DON!! −N: <effect>" is
 * `optional(sequence[return-don, effect])`, built by `donMinus` in
 * `mechanics/shared.ts`; "rest N DON!!: <effect>" opens the same way with a
 * `rest-don`; "you may trash N cards from your hand: <effect>" is a `choose`
 * over the hand whose effect trashes the chosen cards, either as the choose's
 * whole effect (OP17-068 Sasaki) or as the first step of a sequence
 * (`payFromHand`).
 *
 * Nothing else is summarised. An effect that merely *contains* a `return-don`
 * further in is a choice about the rest of it too, and a cost reported for it
 * would be half the price.
 */
export function costOfEffect(effect: MechanicEffect): ActionCost | undefined {
  const first = effect.kind === "sequence" ? effect.effects[0] : effect;
  if (!first) return undefined;
  if (first.kind === "return-don" && first.player === "self") {
    return { returnsDon: first.count };
  }
  if (first.kind === "rest-don" && first.player === "self") {
    return { restsDon: first.count };
  }
  const payment = handPayment(first);
  const trashed = payment && handCardsTrashedBy(payment);
  return trashed === undefined ? undefined : { trashesFromHand: trashed };
}

/**
 * The `choose` that pays a hand cost at the head of an effect: the step
 * itself, or the `then` of an `if` that pays in full on one arm and as much as
 * it can on the other -- OP15-020 Fire Fist, whose one card in hand is still
 * trashed (OP15-020#1). The full payment is the price the card prints.
 */
function handPayment(
  first: MechanicEffect,
): Extract<MechanicEffect, { kind: "choose" }> | undefined {
  if (first.kind === "choose") return first;
  if (
    first.kind === "if" &&
    first.then.kind === "choose" &&
    first.else !== undefined &&
    handCardsTrashedBy(first.then) !== undefined &&
    handCardsTrashedBy(first.else) !== undefined
  ) {
    return first.then;
  }
  return undefined;
}

/**
 * The cost an activation pays, read through the program's gate and its
 * optional prompt: a `[Activate: Main]` is usually `if(gate) -> optional(cost,
 * effect)`, and the cost is what accepting the prompt would pay.
 */
export function costOfProgram(
  program: MechanicProgram,
): ActionCost | undefined {
  let effect: MechanicEffect = program.effect;
  for (;;) {
    if (effect.kind === "if") {
      effect = effect.then;
      continue;
    }
    if (effect.kind === "optional") {
      effect = effect.effect;
      continue;
    }
    break;
  }
  return costOfEffect(effect);
}

/**
 * DON!! a program adds from the DON!! deck, by posture.
 *
 * Read optimistically: a conditional branch is counted as if its condition
 * held, because the offer is already gated on the bare conditions the engine
 * can check and a policy reading this wants to know what the activation is
 * *for*. Undefined when the program adds no DON!! at all.
 */
export function donAddedByProgram(
  program: MechanicProgram,
): { active: number; rested: number } | undefined {
  const total = { active: 0, rested: 0 };
  const walk = (effect: MechanicEffect): void => {
    switch (effect.kind) {
      case "add-don":
        if (effect.player !== "self") return;
        if (effect.rested) total.rested += effect.count;
        else total.active += effect.count;
        return;
      case "sequence":
        for (const step of effect.effects) walk(step);
        return;
      case "if":
        walk(effect.then);
        return;
      case "optional":
        walk(effect.effect);
        return;
      case "choose":
        walk(effect.effect);
        return;
      default:
        return;
    }
  };
  walk(program.effect);
  return total.active + total.rested > 0 ? total : undefined;
}

/**
 * DON!! an accepted optional adds from the DON!! deck, when adding it is the
 * whole of what accepting buys.
 *
 * The payoff half of {@link costOfEffect}, and deliberately stricter than
 * {@link donAddedByProgram}: that one answers "what is this activation *for*"
 * and counts a DON!! add anywhere inside a larger program, which is the right
 * answer for a summary and the wrong one for a veto. A caller that declines an
 * offer because the DON!! deck is empty has to know the add is *all* the offer
 * does -- otherwise it throws away a draw or a K.O. sitting in the same
 * sequence.
 *
 * So the cost is stepped over and everything after it must be an `add-don`.
 * `payFromHand` builds `choose(hand, min N) -> sequence[move to trash, payoff]`
 * and `donMinus` builds `sequence[return-don, payoff]`; both are unwrapped here,
 * and anything else answers `undefined`.
 */
export function donAddedByOptionalPayoff(
  effect: MechanicEffect,
): { active: number; rested: number } | undefined {
  // Step over a cost paid by selecting cards, then over the selection's own
  // trash step, to reach what the acceptance actually buys.
  const paid =
    effect.kind === "choose" && handCardsTrashedBy(effect) !== undefined
      ? effect.effect
      : effect;
  const steps = paid.kind === "sequence" ? paid.effects : ([paid] as const);
  const total = { active: 0, rested: 0 };
  for (const step of steps) {
    if (step.kind === "move" && step.to.zone === "trash") continue;
    if (step.kind === "return-don" && step.player === "self") continue;
    if (step.kind === "rest-don" && step.player === "self") continue;
    if (step.kind !== "add-don" || step.player !== "self") return undefined;
    if (step.rested) total.rested += step.count;
    else total.active += step.count;
  }
  return total.active + total.rested > 0 ? total : undefined;
}

/**
 * How many of the payer's own hand cards a `choose` trashes, when that is
 * what it does.
 */
function handCardsTrashedBy(effect: MechanicEffect): number | undefined {
  if (effect.kind !== "choose") return undefined;
  if (effect.selector.player !== "self" || effect.selector.zone !== "hand") {
    return undefined;
  }
  if (effect.chooser !== undefined && effect.chooser !== "self") {
    return undefined;
  }
  const inner =
    effect.effect.kind === "sequence"
      ? effect.effect.effects[0]
      : effect.effect;
  if (
    inner?.kind === "move" &&
    inner.binding === effect.bind &&
    inner.to.zone === "trash"
  ) {
    return effect.min;
  }
  return undefined;
}

/**
 * What an accepted optional does past its cost, as the kinds of step it runs.
 *
 * The cost is stepped over exactly where {@link costOfEffect} finds one, so
 * the price and the purchase are never counted twice. Branches are read as if
 * they ran -- an `if`'s both arms, every branch of a `choice` -- because the
 * caller is pricing the offer, and the offer is already gated on what the
 * engine can check. Undefined when nothing is left past the cost.
 */
export function payoffOfEffect(
  effect: MechanicEffect,
): readonly PayoffKind[] | undefined {
  const kinds = new Set<PayoffKind>();
  for (const step of payoffSteps(effect)) collectPayoff(step, kinds);
  return kinds.size > 0
    ? PAYOFF_KINDS.filter((kind) => kinds.has(kind))
    : undefined;
}

/** The steps of `effect` past the cost {@link costOfEffect} reports. */
function payoffSteps(effect: MechanicEffect): readonly MechanicEffect[] {
  const steps = effect.kind === "sequence" ? effect.effects : [effect];
  const [first, ...rest] = steps;
  if (!first || !costOfEffect(effect)) return steps;
  // A hand cost is a `choose` whose own first step trashes the chosen cards;
  // whatever follows that step inside it is bought, like the steps after it.
  const payment = handPayment(first);
  if (payment) {
    const inner = payment.effect;
    return [
      ...(inner.kind === "sequence" ? inner.effects.slice(1) : []),
      ...rest,
    ];
  }
  return rest;
}

function collectPayoff(effect: MechanicEffect, kinds: Set<PayoffKind>): void {
  const walk = (inner: MechanicEffect | undefined) => {
    if (inner) collectPayoff(inner, kinds);
  };
  switch (effect.kind) {
    case "sequence":
      for (const step of effect.effects) walk(step);
      return;
    case "if":
      walk(effect.then);
      walk(effect.else);
      return;
    case "choice":
      for (const branch of effect.branches) walk(branch.effect);
      return;
    case "optional":
    case "select":
    case "choose":
    case "pick-from-hand":
    case "bind-battle-target":
    case "return-don-choice":
      walk(effect.effect);
      return;
    // Bookkeeping: binds or orders cards for a later step, which is the payoff.
    case "remember-target":
    case "shuffle-deck":
      return;
    case "look-at":
    case "reveal":
    case "reveal-deck-top":
    case "order-to-bottom":
      kinds.add("search");
      return;
    case "draw":
      kinds.add("draw");
      return;
    case "play":
      kinds.add("play");
      return;
    case "knock-out":
      kinds.add("knock-out");
      return;
    case "update":
      if (effect.rested === false) kinds.add("set-active");
      else if (effect.rested === true) kinds.add("rest");
      else kinds.add("other");
      return;
    case "at-end-of-turn":
      kinds.add(effect.action === "set-active" ? "set-active" : "to-deck");
      return;
    case "at-end-of-turn-effect":
      walk(effect.effect);
      return;
    case "rest":
    case "rest-opponent-cards":
      kinds.add("rest");
      return;
    case "move":
      kinds.add(
        effect.to.zone === "hand"
          ? "to-hand"
          : effect.to.zone === "life"
            ? "to-life"
            : effect.to.zone === "deck"
              ? "to-deck"
              : effect.to.zone === "trash"
                ? "trash"
                : "other",
      );
      return;
    case "deck-top-to-life-at-end-of-turn":
      kinds.add("to-life");
      return;
    case "trash-top":
    case "trash-hand-down-to":
    case "trash-life-down-to":
      kinds.add("trash");
      return;
    case "modify-power":
    case "battle-power":
    case "set-base-power":
    case "set-leader-base-power":
    case "copy-power":
    case "swap-base-power":
      kinds.add("power");
      return;
    case "modify-cost":
    case "discount-next-play":
      kinds.add("cost");
      return;
    case "grant-keyword":
    case "grant-attribute":
    case "grant-attack-active":
      kinds.add("keyword");
      return;
    case "add-don":
    case "activate-don":
    case "attach-don":
    case "give-rested-don":
    case "hold-don-from-refresh":
    case "add-don-at-end-of-turn":
    case "activate-don-at-end-of-turn":
      kinds.add("don");
      return;
    case "restrict":
    case "restrict-player":
    case "negate":
    case "disable-blockers":
      kinds.add("restrict");
      return;
    case "return-don":
    case "return-given-don":
    case "rest-don":
    case "rest-don-at-next-main":
    case "equalize-don-at-end-of-turn":
    case "deal-damage":
    case "redirect-attack":
    case "extra-turn":
    case "activate-event":
    case "install-replacement":
      kinds.add("other");
      return;
    case "spend-once-per-turn":
      return;
    default: {
      // A new step kind fails here until it is given a payoff kind.
      const unclassified: never = effect;
      return unclassified;
    }
  }
}
