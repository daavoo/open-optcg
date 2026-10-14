/**
 * (Yellow) Enel's policy, behind the OP05-098 Leader.
 *
 * The Leader's only clause fires on the opponent's turn, when the seat's Life
 * reaches 0, and takes no decision beyond the hand card it trashes. The deck's
 * own decisions are in its Characters' optional costs, which the generic
 * ladder already takes; what it needs from a deck module first is an opening
 * hand.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The most a Character can cost and still land by the seat's second turn.
 *
 * In this list it selects EB01-056 Flampe, OP11-106 Zeus, OP17-107 Daifuku
 * and OP17-109 Pudding -- fourteen cards. The generic keep's "any card costing
 * 2 or less" would also keep a hand whose only cheap cards are OP06-115 and
 * OP06-117 The Ark Maxim, neither of which puts a body on the board.
 */
const EARLY_BODY_COST = 3;

/**
 * Keep a hand with a Character the first two turns can pay for.
 *
 * The deck's 4000 bodies are what OP17-112 Linlin re-prices and what OP17-102
 * Oven plays back from the trash, so a hand that cannot start the board has
 * nothing for the top end to build on. Read off `cardFacts` rather than a
 * card-number list, so the rule follows the manifest.
 */
export function createOp05EnelMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op05-enel-mulligan",
    keep: (observation) =>
      observation.self.hand.some(
        (card) =>
          observation.cardFacts[card.cardNumber]?.category === "character" &&
          card.cost <= EARLY_BODY_COST,
      ),
    keepBecause:
      "Keep a hand with a Character the first two turns can pay for: the 4000 bodies are what the top end re-prices.",
    mulliganBecause:
      "Mulligan a hand with no Character costing 3 or less: nothing lands before turn 4.",
  });
}
