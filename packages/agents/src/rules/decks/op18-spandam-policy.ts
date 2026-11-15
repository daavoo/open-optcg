/**
 * (Black/Yellow) Spandam's policy, behind the OP18-079 Leader.
 *
 * An all-yellow {CP9} [Trigger] deck: almost every card turns a hit taken into
 * a card or a removal, and the Leader buys extra Life off the deck. The deck
 * arrived with its pre-release list and nothing else, so its only rule is the
 * opening hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/** The 1-cost {CP9} openers: OP18-105 Spandam, OP18-108 Funkfreed and OP18-110 Blueno. */
const OPENERS = new Set(["OP18-105", "OP18-108", "OP18-110"]);

export function createOp18SpandamMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op18-spandam-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep Blueno, Funkfreed or OP18-105 Spandam: a 1-cost opener starts the curve the 6- to 8-costs land on.",
    mulliganBecause:
      "Mulligan a hand with no 1-cost opener: the CP9 top end does nothing on the first turns.",
  });
}
