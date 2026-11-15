/**
 * (Blue) Ms. All Sunday's policy, behind the OP18-041 Leader.
 *
 * A {Baroque Works} attrition deck: a wide board of cheap partner pairs, each
 * of which costs the opponent a card when it is K.O.'d at 3000 base power or
 * more, refilled by the 5- and 6-cost chain plays. The deck arrived with its
 * pre-release list and nothing else, so its only rule is the opening hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/** OP09-056 Mr.3, the 1-cost that finds a {Baroque Works} body. */
const SEARCHER = "OP09-056";

/** The 2-cost partner pairs and Mr.1 that make the board wide early. */
const TWO_DROPS = new Set(["OP18-047", "OP18-051", "OP18-053", "OP18-054"]);

/**
 * Keep the searcher, or two 2-costs: the plan needs bodies on the board by
 * turn 3 for the Leader's K.O. clause to have anything to pay off, and the 5-
 * and 9-costs do nothing before then.
 */
export function createOp18AllSundayMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op18-all-sunday-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => card.cardNumber === SEARCHER) ||
      observation.self.hand.filter((card) => TWO_DROPS.has(card.cardNumber))
        .length >= 2,
    keepBecause:
      "Keep OP09-056 Mr.3 or two 2-cost Baroque Works bodies: the board has to be wide by turn 3 for the Leader's K.O. clause to pay.",
    mulliganBecause:
      "Mulligan a hand with no Mr.3 and fewer than two 2-costs: the 5- and 9-costs do nothing on the first turns.",
  });
}
