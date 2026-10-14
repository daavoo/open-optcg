/**
 * (Blue/Yellow) Boa Hancock's policy, behind the OP14-041 Leader.
 *
 * The Leader draws a card for every Character played on the opponent's turn,
 * and the fifty is built so that happens off its own Life: five of its
 * Characters play themselves as a [Trigger] under a {Kuja Pirates} Leader, and
 * three more cards play a [Trigger] Character out of hand. What is left to the
 * pilot on its own turn is an ordinary curve -- OP13-113 Lilith and OP14-113
 * Marguerite dig, OP13-052 Boa Marigold plays OP07-051 Boa Hancock for free,
 * OP14-108 Silvers Rayleigh K.O.s once the opponent is at 3 Life or fewer.
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The fifty's Characters of cost 4 or less: OP13-113 Lilith (1), OP14-113
 * Marguerite (3) and OP14-114 Ran (4). The generic keep reads any card of
 * cost 2 or less, which here is Lilith and the OP14-118 Counter Event -- and
 * the Event is not a play, so a hand holding only it has nothing to do before
 * the 5-costs.
 */
const EARLY_PLAYS = new Set(["OP13-113", "OP14-113", "OP14-114"]);

export function createOp14HancockMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op14-hancock-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => EARLY_PLAYS.has(card.cardNumber)),
    keepBecause:
      "Keep a Lilith, Marguerite or Ran: a Character to play before the 5-costs arrive.",
    mulliganBecause:
      "Mulligan a hand with no Character of cost 4 or less: it does nothing until turn five.",
  });
}
