/**
 * (Green/Purple) Franky's policy, behind the OP18-021 Leader.
 *
 * A Stage deck on OP-18's Straw Hat Stages: each is a +3000 Counter in hand
 * and a card and a DON!! when the Leader puts it out for a returned DON!!,
 * Pudding refunds the returns, and the Stages ready or give Rush to 6-cost
 * Luffys. The deck has nothing but its shipped list behind it, so its only
 * rule is the opening hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The four 5-cost Stages, which the Leader plays on turn two for a DON!! the
 * Stage gives back, and OP18-061 Iceburg, which looks five deep for them.
 */
const OPENERS = new Set([
  "OP18-075",
  "OP18-076",
  "OP18-077",
  "OP18-078",
  "OP18-061",
]);

export function createOp18FrankyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op18-franky-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a Stage or Iceburg: the Leader plays a Stage on turn two for a DON!! it gives back, and Iceburg finds one.",
    mulliganBecause:
      "Mulligan a hand with no Stage and no Iceburg: the Leader's activation has nothing to play, and the 6- and 10-costs wait.",
  });
}
