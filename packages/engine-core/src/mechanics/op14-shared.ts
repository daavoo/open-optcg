/**
 * Program fragments and conditions more than one OP14 card prints.
 *
 * The set repeats four templates hard enough to be worth naming: Red's
 * "if this Character has 5000 power or more" gate, Yellow's Kuja Trigger,
 * Yellow's "play a [Trigger] body out of hand" Trigger, and Black's
 * "a cost of 0 or a cost of 8 or more" board check. Anything printed on
 * exactly one card stays in that card's own module.
 */
import {
  type MechanicCondition,
  type MechanicProgram,
  SOURCE_BINDING,
} from "../mechanics.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- printed on OP14-002 Urouge,
 * OP14-006 Shachi & Penguin and OP14-012 Bepo, and (as a static keyword gate)
 * on OP14-004 Cavendish.
 *
 * Current power, so the DON!! given to a 2000-power body is what switches the
 * clause on. That is the whole design of the Red/Supernovas package: small
 * bodies whose attack-time text is bought with DON!!.
 */
export const sourceAtFivePower: MechanicCondition = {
  kind: "source-current-power",
  operator: "gte",
  value: 5000,
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" --
 * OP14-090 Mr.1, OP14-094 Mr.5, OP14-098 Crescent Cutlass and OP14-120
 * Crocodile.
 *
 * Either field counts: the text does not say "you have", and the Black deck
 * makes both halves true on purpose -- it drops its opponent's Characters to
 * cost 0 with the OP14-079 Leader and raises its own past 8 with OP14-082,
 * OP14-086 and OP14-098. Effective cost, for the same reason.
 */
export const costZeroOrEightPlusBody: MechanicCondition = {
  kind: "any-of",
  conditions: [
    {
      kind: "selector-count",
      player: "either",
      selector: { zone: "board", category: "character", maxCost: 0 },
      operator: "gte",
      value: 1,
    },
    {
      kind: "selector-count",
      player: "either",
      selector: { zone: "board", category: "character", minCost: 8 },
      operator: "gte",
      value: 1,
    },
  ],
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" --
 * the Trigger five Yellow Amazon Lily bodies share (OP14-105, OP14-107,
 * OP14-113, OP14-114, OP14-115).
 */
export const kujaTriggerPlay: MechanicProgram = {
  effect: {
    kind: "if",
    condition: {
      kind: "leader-has-type",
      player: "self",
      type: "Kuja Pirates",
    },
    then: { kind: "play", binding: SOURCE_BINDING },
  },
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP14-112 Boa Hancock and OP14-118
 * "You'll Frighten Me... ♡".
 *
 * Printed power, and the body must itself print a Trigger, which is what makes
 * the clause chain: the Character it plays is another Trigger card.
 */
export const playTriggerBodyFromHand: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "hand",
      category: "character",
      maxPower: 6000,
      hasTrigger: true,
    },
    bind: "op14-trigger-body",
    min: 0,
    max: 1,
    effect: { kind: "play", binding: "op14-trigger-body" },
  },
};

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * Printed on the OP14-080 Gecko Moria Leader, OP14-072 Baby 5, OP14-112 Boa
 * Hancock and OP14-115 Rindo. "Up to 1", so the player may decline it -- the
 * OP14-115 Q&A is the ruling that says so. Face-down, as a Life card dealt at
 * setup is: nothing in the text says to turn it face-up.
 */
export const topDeckToLife: MechanicProgram["effect"] = {
  kind: "optional",
  effect: {
    kind: "select",
    selector: { player: "self", zone: "deck", position: "top" },
    bind: "op14-deck-to-life",
    count: "all",
    effect: {
      kind: "move",
      binding: "op14-deck-to-life",
      to: { player: "self", zone: "life", position: "top" },
    },
  },
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- OP14-041 Boa Hancock's Leader clause and OP14-112's `[On Play]`.
 *
 * The card goes to its *owner*, which is the opponent: this is a Life-strip,
 * not card advantage for the player doing it.
 */
export const opponentLifeToHand: MechanicProgram["effect"] = {
  kind: "select",
  selector: { player: "opponent", zone: "life", position: "top" },
  bind: "op14-life-strip",
  count: "all",
  effect: {
    kind: "move",
    binding: "op14-life-strip",
    to: { player: "opponent", zone: "hand" },
  },
};
