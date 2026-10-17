/**
 * OP15 fragments printed on two clauses of the same card.
 *
 * Three OP15 cards print "[printed text omitted -- pnpm card:text <card>]" or the
 * `[On K.O.]` equivalent, and one prints a narrower Trigger than its `[Main]`.
 * Writing the shape once and registering it twice is what keeps the two
 * registrations from drifting apart -- a copy edited on one side is a card that
 * does two different things depending on how it was reached.
 */
import { type MechanicEffect, type MechanicProgram } from "../mechanics.js";

/**
 * OP15-097 "I Find It Embarrassing as a Human Being": "[printed text omitted -- pnpm card:text OP15-097]" Its `[Trigger]` prints "[printed text omitted -- pnpm card:text OP15-097]".
 *
 * `expiresAfterTurns: 1` is "[printed text omitted -- pnpm card:text OP15-097]",
 * the same window OP16-032 Magellan's lock uses. `maxBaseCost` because the
 * clause reads base cost: a body whose cost a static layer raised is still in
 * range, and one whose cost was lowered is not.
 */
export const embarrassingLock: MechanicProgram = {
  effect: {
    kind: "if",
    condition: {
      kind: "zone-count",
      player: "self",
      zone: "trash",
      operator: "gte",
      value: 10,
    },
    then: {
      kind: "choose",
      selector: {
        player: "opponent",
        zone: "board",
        category: "character",
        maxBaseCost: 5,
      },
      bind: "op15-embarrassing-lock",
      min: 0,
      max: 1,
      effect: {
        kind: "restrict",
        binding: "op15-embarrassing-lock",
        restriction: "cannot-attack",
        expiresAfterTurns: 1,
      },
    },
  },
};

/**
 * OP15-115 Impact Dial's removal: "[printed text omitted -- pnpm card:text OP15-115]"
 *
 * The whole of its `[Trigger]`, and the first half of its `[Main]` -- which
 * then also adds a Life card to hand. Shared so the ceiling is stated once.
 */
export const impactDialKo: MechanicEffect = {
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost: 4,
  },
  bind: "op15-impact-dial-ko",
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: "op15-impact-dial-ko" },
};

/**
 * OP15-079 Absalom: "[printed text omitted -- pnpm card:text OP15-079]", printed again as its `[Trigger]`.
 */
export const absalomRecursion: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "trash",
      type: "Thriller Bark Pirates",
    },
    bind: "op15-absalom-recur",
    min: 0,
    max: 1,
    effect: {
      kind: "move",
      binding: "op15-absalom-recur",
      to: { player: "self", zone: "hand" },
    },
  },
};
