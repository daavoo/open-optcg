/**
 * (Purple/Yellow) Donquixote Rosinante's policy, behind the OP12-061 Leader.
 *
 * The Leader's [Activate: Main] returns a DON!! to take 2 off the next
 * [Trafalgar Law] of cost 4 or more played from hand that turn, and once a
 * turn a Law it would lose to a K.O. stays on the field for the top Life card.
 * Both lists behind it are four names of Law at cost 4 -- P-093 and EB04-038
 * Rosinante & Law ramping a DON!! while at or under the opponent's count,
 * ST10-010 trashing two cards from a full hand, P-088 a Counter -- around
 * {Navy} and {Donquixote Pirates} searchers and DON!! −N removal: the
 * Community list (`op12-rosinante-tcgmm-manifest.ts`) and FlyestRaven's
 * ChinoizeCup #125 list, a training list in `ml/bridge/decks.ts`. The deck
 * ships with its opening hand as its only rule of its own; the `midrange`
 * root pilots the rest (see `midrangeRosinanteOp12` in
 * `strategy/archetypes.ts`).
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The cards the first turns want, in either list: the 1-cost searchers --
 * OP12-108 Donquixote Rosinante for a [Trafalgar Law], OP10-065 Sugar,
 * OP16-064 Koby and the OP16-078 Marineford Stage -- EB05-040, which draws 3
 * for a DON!! the deck hands back anyway, and the 4-cost Laws the Leader's
 * discount does not need. The generic keep reads any card of cost 2 or less,
 * which also counts the Counter Events (OP12-115, OP15-078), OP09-077 and
 * EB05-034 Sugar, whose −4000 waits for 7 DON!! on the field: none of those
 * develops the board on turn 2 or 3.
 */
const OPENERS = new Set([
  "OP12-108",
  "OP10-065",
  "OP16-064",
  "OP16-078",
  "EB05-040",
  "P-093",
  "ST10-010",
  "P-088",
]);

export function createOp12RosinanteMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op12-rosinante-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a 1-cost searcher, the 3-card draw or a 4-cost Law to play on curve.",
    mulliganBecause:
      "Mulligan a hand with no searcher and no 4-cost Law: it finds nothing to play until the 6- and 7-costs.",
  });
}
