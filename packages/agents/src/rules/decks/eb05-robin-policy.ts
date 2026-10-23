/**
 * (Green/Yellow) Nico Robin's policy, behind the EB05-010 Leader.
 *
 * The Leader sets one of your <Wisdom> Characters with 6000 power or less
 * active again once a turn, and adds the top card of the deck to your Life
 * once a turn when a <Wisdom> Character without [Blocker] is K.O.'d. The list
 * is built of 6000-power <Wisdom> bodies for both clauses. The deck ships
 * with its opening hand as its only rule of its own; the `midrange` root
 * pilots the rest (see `midrangeRobinEb05` in `strategy/archetypes.ts`).
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The cards the first turns want: the two 1-cost diggers, EB05-050 Atlas
 * (a <Wisdom> card) and OP13-113 Lilith (a [Trigger] card), and the cheapest
 * <Wisdom> bodies that put the board down before the 5- and 6-costs --
 * OP17-109 Charlotte Pudding at 3, EB05-052 Gloriosa and EB04-018 Megalo at
 * 4. The generic keep reads any card of cost 2 or less, which here also
 * counts EB05-056 Nico Olvia and EB05-057 Nojiko: a 0-power draw that needs a
 * [Trigger] card to pay it and a DON!! gift, neither of which develops the
 * board on its own.
 */
const OPENERS = new Set([
  "EB05-050",
  "OP13-113",
  "OP17-109",
  "EB05-052",
  "EB04-018",
]);

export function createEb05RobinMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "eb05-robin-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep Atlas or Lilith to dig, or a 3- or 4-cost Wisdom body to play before the 6-costs.",
    mulliganBecause:
      "Mulligan a hand with no 1-cost digger and no 3- or 4-cost Wisdom body: it develops nothing until turn five.",
  });
}
