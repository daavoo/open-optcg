/**
 * (Red/Purple) Gol.D.Roger's policy, behind the OP13-003 Leader.
 *
 * The Leader is a 5000 until the field holds ten DON!!, and the deck's whole
 * plan is getting there early: every cheap slot adds a DON!! from the DON!!
 * deck, most of them only while a DON!! is given -- which the Leader supplies
 * from its second DON!! Phase on. At ten, OP13-064 Roger lands.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The cheap cards that add a DON!! on the turns before ten: OP13-072 Buggy
 * (2), OP13-068 Douglas Bullet and OP13-061 Inuarashi (3), the 1-cost
 * OP13-075 Event, and OP13-065 Shanks, the 1-cost that finds the rest.
 */
const OPENERS = new Set([
  "OP13-072", // Buggy
  "OP13-068", // Douglas Bullet
  "OP13-061", // Inuarashi
  "OP13-075", // Guess We'll Have Another Scrap
  "OP13-065", // Shanks
]);

/**
 * Keep a hand that ramps on the first turns.
 *
 * A turn spent without adding a DON!! is a turn the Leader stays a 5000 and
 * OP13-064 stays out of reach, and these are the only cards cheap enough to
 * add one before turn 5.
 */
export function createOp13RogerMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op13-roger-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a cheap ramp card or OP13-065 Shanks: the Leader is a 5000 until ten DON!!, and these are what get there.",
    mulliganBecause:
      "Mulligan a hand with no cheap ramp and no Shanks: nothing adds a DON!! before turn 5.",
  });
}
