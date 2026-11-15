/**
 * (Red/Blue) Karoo's policy, behind the OP18-001 Leader.
 *
 * A [Rush] aggro deck: the Leader gives every {Animal} {Alabasta} Character
 * [Rush] and +1000, so most of the list attacks the turn it lands. The deck
 * arrived with its pre-release list and nothing else, so its only rule is the
 * opening hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/** OP13-012 Nefeltari Vivi, the 1-cost that looks at 4 for an {Alabasta} card. */
const SEARCHER = "OP13-012";

/** The 2- to 4-cost bodies that start attacking from 3 or 4 DON!!. */
const CURVE = new Set([
  "OP18-004",
  "OP18-009",
  "OP18-010",
  "OP18-011",
  "OP18-043",
]);

export function createOp18KarooMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op18-karoo-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => card.cardNumber === SEARCHER) ||
      observation.self.hand.filter((card) => CURVE.has(card.cardNumber))
        .length >= 2,
    keepBecause:
      "Keep OP13-012 Vivi or two 2- to 4-cost bodies: the attacks start on the first turns with 3 or 4 DON!!.",
    mulliganBecause:
      "Mulligan a hand with no Vivi and fewer than two early bodies: a [Rush] deck that cannot attack until turn 5 has given up its plan.",
  });
}
