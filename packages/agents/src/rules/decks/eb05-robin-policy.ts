/**
 * (Green/Yellow) Nico Robin's policy, behind the EB05-010 Leader.
 *
 * The Leader sets one of your <Wisdom> Characters with 6000 power or less
 * active again once a turn, and adds the top card of the deck to your Life
 * once a turn when a <Wisdom> Character without [Blocker] is K.O.'d. The
 * Community list (`eb05-robin-tcgmm-manifest.ts`) keeps a <Wisdom> core for
 * both clauses inside the OP-17 Big Mom [Trigger] package; the EB05 Wisdom
 * List, a training list in `ml/bridge/decks.ts`, is <Wisdom> bodies
 * throughout. The deck ships with its opening hand as its only rule of its
 * own; the `midrange` root pilots the rest (see `midrangeRobinEb05` in
 * `strategy/archetypes.ts`).
 */
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The cards the first turns want, in either list: the 1-cost diggers, EB05-050
 * Atlas (a <Wisdom> card) and the Wisdom List's OP13-113 Lilith (a [Trigger]
 * card), and the cheapest bodies that put the board down before the 5- and
 * 6-costs -- OP17-109 Charlotte Pudding and the Community list's OP17-107
 * Charlotte Daifuku at 3, EB05-052 Gloriosa and EB04-018 Megalo at 4. The
 * generic keep reads any card of cost 2 or less, which also counts the Wisdom
 * List's EB05-056 Nico Olvia and EB05-057 Nojiko -- a 0-power draw that needs
 * a [Trigger] card to pay it and a DON!! gift, neither of which develops the
 * board on its own -- and the Community list's 0-cost OP06-115, a Counter.
 */
const OPENERS = new Set([
  "EB05-050",
  "OP13-113",
  "OP17-109",
  "OP17-107",
  "EB05-052",
  "EB04-018",
]);

export function createEb05RobinMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "eb05-robin-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep Atlas or Lilith to dig, or an early body to play before the 6-costs.",
    mulliganBecause:
      "Mulligan a hand with no 1-cost digger and no early body: it develops nothing until turn five.",
  });
}
