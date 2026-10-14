/**
 * (Yellow) Monkey.D.Luffy's policy, behind the OP15-098 Leader.
 *
 * The Leader has no activated ability: it keeps a {Sky Island} Character of
 * 6000 base power or more on the field for the top Life card. So the deck's
 * first job is to land one of those bodies, and its opening hand is judged on
 * whether it can.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * What the opening turns want in hand: a 4-cost {Sky Island} 6000 the Leader
 * protects -- OP15-113 Roronoa Zoro, OP15-107 Tony Tony.Chopper -- or OP15-108
 * Nami, a 1-cost whose [On Play] digs three deep for a {Sky Island} card.
 */
const OPENERS = new Set(["OP15-113", "OP15-107", "OP15-108"]);

export function createOp15LuffyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op15-luffy-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a 4-cost Sky Island 6000 the Leader protects, or Nami to dig for one.",
    mulliganBecause:
      "Mulligan a hand with no protected 4-cost and no Nami: the Leader guards nothing until one lands.",
  });
}
