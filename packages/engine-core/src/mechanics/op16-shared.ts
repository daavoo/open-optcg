/**
 * OP16 fragments printed on more than one card.
 *
 * The set's Red shell is built on one template -- "[printed text omitted -- pnpm card:text <card>]" -- which nine cards print with
 * different payoffs. Writing the cost once is what keeps the nine from drifting.
 */
import { type MechanicEffect, type MechanicProgram } from "../mechanics.js";
import { payFromHand } from "./shared.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the OP16 Whitebeard shell's currency.
 *
 * Exact power, not a floor: `minPower` and `maxPower` together, because the
 * clause names a number rather than a threshold. Every card printing it is
 * asking whether the player is still holding the archetype's payoff, so a
 * 10000-power Character does not answer it.
 */
export const powerEightThousand = {
  category: "character",
  minPower: 8000,
  maxPower: 8000,
} as const;

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * The reveal spends nothing -- the card stays in hand -- so the same Character
 * pays for this every turn. That is the shell's whole engine, and it is why the
 * cost is a `reveal` rather than a `move` to the trash.
 */
export const revealEightThousand = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    // The payoff is nested inside the cost's `choose`, not sequenced after it: a
    // `choose` with fewer candidates than its `min` is skipped and the queue
    // continues, so a sequence would hand the payoff to a hand holding no
    // 8000-power Character at all.
    effect: {
      kind: "choose",
      selector: { ...powerEightThousand, player: "self", zone: "hand" },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "sequence",
        effects: [{ kind: "reveal", binding: bind }, effect],
      },
    },
  },
});

/**
 * The same template with the 8000-power Character *trashed* rather than shown --
 * OP16-009 Speed Jil and OP16-014 Marco pay the harder price for a bigger swing.
 */
export const trashEightThousand = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: payFromHand(
      { ...powerEightThousand, player: "self", zone: "hand" },
      bind,
      1,
      effect,
    ),
  },
});
