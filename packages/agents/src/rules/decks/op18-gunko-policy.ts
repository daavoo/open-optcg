/**
 * (Purple/Black) Saint Gunko's policy, behind the OP18-060 Leader.
 *
 * A {Holy Knights of God} trash-recursion deck: fill the trash early, then
 * play Characters back out of it; the Leader draws 2 and trashes 1 the first
 * time each turn one of them comes back. The deck arrived with its pre-release
 * list and nothing else, so its only rule is the opening hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The 1-costs that fill the trash and find the Knights: OP18-084 Saint Gunko,
 * OP18-095 I'm Late, I'm Very Late!! and OP18-097 Abyss Pentagram.
 */
const OPENERS = new Set(["OP18-084", "OP18-095", "OP18-097"]);

export function createOp18GunkoMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op18-gunko-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep OP18-084 Gunko, I'm Late, I'm Very Late!! or Abyss Pentagram: the 1-costs that fill the trash the rest of the deck plays out of.",
    mulliganBecause:
      "Mulligan a hand with none of the 1-cost openers: Sleeptids and the 8- and 10-costs need a trash that is not there yet.",
  });
}
