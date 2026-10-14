/**
 * (Green/Purple) Monkey.D.Luffy's policy, behind the EB02-010 Leader.
 *
 * The Leader returns two DON!! to set two active, and EB02-035 Sanji & Pudding
 * refunds one of them each turn; the rest of the list is ST-18's eight-DON!!
 * payoffs and the EB02-061 Luffy finisher, which spends two active DON!! and a
 * Life card to attack again.
 */
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import { heuristicModules, never, WEIGHT } from "../heuristics.js";
import type { Tactics } from "../tactics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const SANJI_PUDDING = "EB02-035";

/**
 * The cards a first turn wants: Sanji & Pudding, and the two 1-cost searches
 * that find it (EB02-017 Nami, OP05-076). Bandai's write-up opens the deck on
 * exactly these -- Sanji & Pudding is what makes the Leader's DON!! return pay.
 */
const OPENERS = new Set([SANJI_PUDDING, "EB02-017", "OP05-076"]);

export function createEb02LuffyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "eb02-luffy-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep Sanji & Pudding, or a 1-cost search that finds it: it is what refunds the Leader's DON!! return.",
    mulliganBecause:
      "Mulligan a hand with no Sanji & Pudding and no 1-cost search: the Leader's DON!! return has nothing to refund it.",
  });
}

const LEADER = "EB02-010";

/** DON!! a player can have on the field; the DON!! deck holds the rest. */
const DON_CAP = 10;

/** DON!! added at the start of each turn, while the DON!! deck has them. */
const DON_PER_TURN = 2;

/**
 * What the Leader's `DON!! −2` costs next turn, in DON!! on the field.
 *
 * A returned DON!! goes back to the DON!! deck, and the turn's draw only
 * refills it at two a turn up to ten. So at eight or fewer on the field the
 * two returned are two fewer next turn, while at nine or ten the draw would
 * have hit the cap anyway and the return is mostly free. Sanji & Pudding's
 * refund puts one straight back.
 */
function returnPrice(fieldDon: number, refund: number): number {
  const kept = Math.min(fieldDon + DON_PER_TURN, DON_CAP);
  const returned = Math.min(fieldDon - 2 + refund + DON_PER_TURN, DON_CAP);
  return kept - returned;
}

const FINISHER = "EB02-061";

/** DON!! EB02-061's [When Attacking] returns to stand back up. */
const RESTAND_PRICE = 2;

/**
 * EB02-061 Monkey.D.Luffy has an attack still to declare this turn.
 *
 * Read off the legal attacks rather than the board, so summoning sickness,
 * its conditional [Rush] and a rested body are all the engine's call.
 */
function finisherToAttack(t: Tactics): boolean {
  const finishers = new Set(
    t.observation.self.board
      .filter((card) => card.cardNumber === FINISHER)
      .map((card) => card.instanceId),
  );
  if (finishers.size === 0) return false;
  return t.actions.some(
    (action) =>
      action.type === "attack" && finishers.has(action.attackerInstanceId),
  );
}

/**
 * Activate the Leader only when it sets two DON!! active and costs at most
 * one next turn.
 *
 * EB02-010 returns two DON!! and then sets up to two rested DON!! active, so
 * it pays only after this turn has rested four: the two it returns and the two
 * it readies. Taken earlier it returns DON!! that are still to be spent. And
 * every return comes out of the DON!! the deck is building toward the eight
 * its ST-18 half reads, so it is taken only where Sanji & Pudding refunds one
 * or the field is close enough to ten that the turn's draw makes it back.
 * Bandai's own line is the first of these: play Sanji & Pudding, then
 * activate the Leader with two other DON!! rested.
 *
 * The exception is the finisher's turn. EB02-061 costs six, so the turn it
 * can attack usually has no active DON!! left for its restand, and the
 * Leader's two readied DON!! are what pay for the second attack. There the
 * activation is taken at any price.
 */
const leaderReturnGate = never(
  "Do not return two DON!! to the Leader unless it readies two and costs at most one DON!! next turn, or readies the finisher's restand",
)
  .as("leader-return-gate")
  .by(WEIGHT.deck)
  .activate((action, t) => {
    if (action.sourceCardNumber !== LEADER) return false;
    const self = t.observation.self;
    if (self.restedDon < 4) return true;
    if (finisherToAttack(t) && self.activeDon < RESTAND_PRICE) return false;
    const refund = self.board.some((card) => card.cardNumber === SANJI_PUDDING)
      ? 1
      : 0;
    return returnPrice(t.fieldDon, refund) > 1;
  });

/** The deck's in-game rules, one module per rule so each can be disabled. */
export function createEb02LuffyModules(): PolicyModule[] {
  return heuristicModules("eb02-luffy", [leaderReturnGate]);
}

/**
 * The two bodies the deck is built around: Sanji & Pudding, which refunds the
 * Leader's return, and EB02-061 Luffy, the finisher.
 */
const ENGINE = new Set([SANJI_PUDDING, FINISHER]);

/**
 * Spend Counter cards to keep Sanji & Pudding and EB02-061 Luffy on the field.
 *
 * The generic Counter step prices every Character at one 1000 Counter. These
 * two are worth more than their own card: without Sanji & Pudding every
 * Leader activation costs two DON!! the next turn, and Luffy is the only body
 * that attacks twice. So each is defended for up to a 2000. The generic step
 * still declines once the damage still coming at the Leader would take its
 * last Life, when every card in hand is owed to the Leader.
 */
export function createEb02LuffyCounterPolicy(): PolicyModule {
  return {
    id: "eb02-luffy-counter",
    decide: ({ observation }): PolicyDecision | undefined => {
      if (observation.phase !== "counter") return undefined;
      return chooseGenericCounter(observation, observation.legalActions, {
        protectedCards: ENGINE,
        characterDefensePower: (cardNumber) =>
          ENGINE.has(cardNumber) ? 2000 : 0,
      });
    },
  };
}
