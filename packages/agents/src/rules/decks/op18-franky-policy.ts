/**
 * (Green/Purple) Franky's policy, behind the OP18-021 Leader.
 *
 * A Stage deck on purple Straw Hats: Stages are +3000 Counters in hand and the
 * Leader puts one out for a returned DON!!, the ST-18 Characters turn on at 8
 * DON!!, and Shanks with Birdcage clears the board at 10. The deck arrived
 * with its pre-release list and nothing else, so its only rule is the opening
 * hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The {Straw Hat Crew} searchers -- EB02-017 and PRB02-012 Nami, ST18-004
 * Zoro-Juurou -- and OP18-078 Mini-Merry, which the Leader plays on turn two
 * for a DON!! it gives back.
 */
const OPENERS = new Set(["EB02-017", "PRB02-012", "ST18-004", "OP18-078"]);

export function createOp18FrankyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op18-franky-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a Nami, Zoro-Juurou or Mini-Merry: the searchers find the Stages and ST-18 bodies, and Mini-Merry is the Leader's turn-two play.",
    mulliganBecause:
      "Mulligan a hand with no searcher and no Mini-Merry: the 7- and 10-costs wait for DON!! the hand cannot find.",
  });
}
