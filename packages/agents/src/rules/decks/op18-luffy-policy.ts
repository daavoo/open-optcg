/**
 * (Green) Monkey.D.Luffy's policy, behind the OP18-022 Leader.
 *
 * A DON!!-ramp midrange deck: {Straw Hat Crew} Characters whose [On Play]s set
 * spent DON!! active again, rest-and-K.O. pieces to lock the opponent's board,
 * and OP18-029 Tony Tony.Chopper to load the Leader for a turn of extra
 * attacks. The deck arrived with its pre-release list and nothing else, so its
 * only rule is the opening hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/** The ramp's top end: nothing at 5 or more pays before the curve is down. */
const EARLY_COST = 4;

export function createOp18LuffyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op18-luffy-mulligan",
    keep: (observation) =>
      observation.self.hand.some(
        (card) =>
          observation.cardFacts[card.cardNumber]?.category === "character" &&
          card.cost <= EARLY_COST,
      ),
    keepBecause:
      "Keep a Character at 4 or less: the DON!! these bodies set active only pays once the curve is on the board.",
    mulliganBecause:
      "Mulligan a hand of 5-costs and Chopper with nothing at 4 or less: the ramp has no curve to ramp from.",
  });
}
