/**
 * ST-10 program fragments more than one of its cards prints, and the two
 * programs one card prints for two windows.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST10-0xx` prints it from the local cache).
 */
import { type MechanicEffect, type MechanicProgram } from "../mechanics.js";
import { donMinus } from "./shared.js";

/**
 * The deck's own ramp, paid for with a DON!! that will not be spendable this
 * turn: one card out of the DON!! deck, arriving rested.
 *
 * Printed on two of the Ultra Deck's Characters and on one of its Events, and
 * it is the Purple half of the product in one line -- the deck returns DON!!
 * to buy effects and takes it back a turn later.
 */
export const rampRested: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: true,
};

/** The same ramp without the delay: one DON!! out of the DON!! deck, active. */
export const rampActive: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: false,
};

/**
 * ST10-012 Bepo: a rested ramp, but only while the opponent is the one ahead
 * on DON!!.
 *
 * `field-don-versus` rather than a fixed ceiling: the clause is a catch-up
 * rule, so what it reads is the gap between the two cost areas and not a
 * number. Printed on the `[On Play]` and the `[When Attacking]` alike, so it is
 * one program registered from both tables.
 */
export const bepoRamp: MechanicProgram = {
  effect: {
    kind: "if",
    condition: {
      kind: "field-don-versus",
      player: "opponent",
      operator: "gt",
    },
    then: rampRested,
  },
};

/**
 * ST10-013 Eustass"Captain"Kid: one DON!! back to the DON!! deck buys the
 * Leader +1000 power that survives the opponent's turn.
 *
 * `expiresAfterTurns: 1` is what "until the start of your next turn" means in
 * player-turns -- the buff has to still be there when the opponent attacks
 * into the Leader, which is the half of the card that is worth the DON!!.
 *
 * Printed on the `[On Play]` and the `[When Attacking]` alike, so it is one
 * program registered from both tables. The `choose` is "up to 1" and the
 * selector reaches only the Leader, so declining is free; the `donMinus`
 * around it is what makes the cost declinable too.
 */
export const kidLeaderBuff: MechanicProgram = {
  effect: donMinus(1, {
    kind: "choose",
    selector: { player: "self", zone: [], includeLeader: true },
    bind: "st10-kid-leader",
    min: 0,
    max: 1,
    effect: {
      kind: "modify-power",
      binding: "st10-kid-leader",
      amount: 1_000,
      expiresAfterTurns: 1,
    },
  }),
};
