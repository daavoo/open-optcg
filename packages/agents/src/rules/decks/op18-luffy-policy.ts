/**
 * (Green) Monkey.D.Luffy's policy, behind the OP18-022 Leader.
 *
 * A reset deck: the Leader stands itself up to attack twice, and {Water
 * Seven} Straw Hats set it active again at the end of the turn, while 4-cost
 * bodies rest the opponent's Characters and Megalo K.O.s what is rested. The
 * deck has nothing but its shipped list behind it, so its only rule is the
 * opening hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The curve's floor: the reset pieces, the searcher and the rest-and-K.O.
 * bodies all cost 4 or less, and the 5- and 9-costs wait on them.
 */
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
      "Keep a Character at 4 or less: the reset pieces, Nami's search and the bodies that rest and K.O. are all on the early curve.",
    mulliganBecause:
      "Mulligan a hand with no Character at 4 or less: Perona, Zoro & Sogeking and the 9-cost Luffy have no board to build on.",
  });
}
