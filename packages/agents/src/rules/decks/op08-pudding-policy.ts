/**
 * (Purple/Yellow) Charlotte Pudding's policy, behind the OP08-058 Leader.
 *
 * The Leader's [When Attacking] turns two Life cards face-up for a rested
 * DON!!, so the deck ramps on the purple side -- ST34-002 Cracker, OP17-074
 * Yamato, OP11-067 Katakuri each add a DON!! as well -- towards OP17-112
 * Linlin, and refills the Life it exposes with the OP-17 yellow [Trigger]
 * bodies that bank the top of the deck onto it.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The cheap cards that find the rest of the curve or ramp towards it: the
 * three {Big Mom Pirates} diggers, and the 3-cost Yamato whose [On Play] adds
 * a DON!!.
 */
const OPENERS = new Set([
  "ST34-003", // Charlotte Brulee: looks at 3 for a {Big Mom Pirates} card
  "OP17-113", // Streusen: the same look at 3
  "OP07-077", // We're Going to Claim the One Piece!!!: looks at 5
  "OP17-074", // Yamato: a [Blocker] that adds a rested DON!!
]);

/**
 * Keep a hand with a digger or the 3-cost ramp.
 *
 * The list's payoffs sit at 6, 8 and 10 cost, and the Leader only ramps once
 * it attacks, so a hand with nothing to do on the opening turns is a hand
 * that reaches those payoffs a turn late.
 */
export function createOp08PuddingMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op08-pudding-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a {Big Mom Pirates} digger or OP17-074 Yamato: the payoffs cost 6 to 10, and these are what reach them.",
    mulliganBecause:
      "Mulligan a hand with no digger and no OP17-074: nothing to do on the opening turns while the 6-, 8- and 10-costs wait.",
  });
}
