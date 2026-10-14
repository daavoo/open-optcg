/**
 * (Black/Yellow) Koala's policy, behind the OP12-081 Leader.
 *
 * The Leader draws a card each time it attacks the opponent's Leader with two
 * Characters of cost 8 or more on the field, and the list's {Revolutionary
 * Army} bodies are built to be those two: Morley, Lindbergh and Hack are played
 * at 4 and count as 8 behind this Leader.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import { heuristics, never } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The cards a first turn wants: the three 4-cost bodies that count as 8 behind
 * this Leader (OP12-093 Morley, OP12-095 Lindbergh, OP12-089 Hack), and the two
 * searchers that find them (OP12-086 Koala, OP12-097 Captains Assembled).
 * Bandai's write-up opens the deck on exactly these, because the Leader's draw
 * needs two 8-cost bodies on the field before it pays.
 */
const OPENERS = new Set([
  "OP12-093",
  "OP12-095",
  "OP12-089",
  "OP12-086",
  "OP12-097",
]);

export function createOp12KoalaMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op12-koala-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a 4-cost body that counts as 8, or a searcher that finds one: the Leader's draw needs two on the field.",
    mulliganBecause:
      "Mulligan a hand with no 4-cost {Revolutionary Army} body and no searcher: the Leader's draw has nothing to count.",
  });
}

const NICO_ROBIN = "OP12-087";

/**
 * OP12-087 Nico Robin's [On Play] is a card from hand for two of the
 * opponent's -- but only if they hold 5 or more when it resolves. The cost
 * sits outside that condition, so the clause is offered either way, and paid
 * into a smaller hand it trashes one of yours for nothing. The opponent's hand
 * cannot grow while the clause resolves, so the count read at the offer is
 * the count the condition reads.
 */
export function createOp12KoalaRobinModule(): PolicyModule {
  return heuristics("op12-koala-robin", [
    never(
      "Do not trash a card to Nico Robin into an opponent holding fewer than 5.",
    ).effect(
      (action, t) =>
        action.sourceCardNumber === NICO_ROBIN &&
        action.optionId === "apply" &&
        t.observation.opponent.handCount < 5,
    ),
  ]);
}

/**
 * The bodies the Leader's draw counts: every Character of cost 8 or more. A
 * third is not spare -- it is what keeps the draw on when one of the other two
 * is K.O.'d.
 */
function drawEnablers(observation: GameObservation): Set<string> {
  return new Set(
    observation.self.board
      .filter((card) => card.currentCost >= 8)
      .map((card) => card.cardNumber),
  );
}

/**
 * Spend Counter cards to keep a body the Leader's draw is counting.
 *
 * The generic Counter step prices every Character at one 1000 Counter. A
 * cost-8 body is worth more than its own card: while two are down it is a
 * card drawn on every Leader attack, so it is defended for up to a 2000. The
 * generic step still declines once the damage still coming at the Leader would
 * take its last Life, when every card in hand is owed to the Leader.
 */
export function createOp12KoalaCounterPolicy(): PolicyModule {
  return {
    id: "op12-koala-counter",
    decide: ({ observation }): PolicyDecision | undefined => {
      if (observation.phase !== "counter") return undefined;
      const enablers = drawEnablers(observation);
      return chooseGenericCounter(observation, observation.legalActions, {
        protectedCards: enablers,
        characterDefensePower: (cardNumber) =>
          enablers.has(cardNumber) ? 2000 : 0,
      });
    },
  };
}
