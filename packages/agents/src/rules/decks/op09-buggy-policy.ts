/**
 * (Blue) Buggy's policy, behind the OP09-042 Leader.
 *
 * The Leader rests five DON!! and trashes a card to play any {Cross Guild}
 * Character from hand, and the list is built to make that play OP09-051
 * Buggy, which stays only beside four more Characters of cost 5 or more. So
 * the turns before five DON!! are spent putting those bodies down.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  optionCard,
  type PolicyDecision,
} from "../generic-policy.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const LEADER = "OP09-042";
const BIG_BUGGY = "OP09-051";

/**
 * The bodies the deck puts down on turns three and four, before the Leader
 * turns on: the four ST-25 4-costs -- three of which count as 5 once two real
 * 5-costs are out -- OP09-045 Cabaji and P-082 Crocodile. The deck's cheap
 * slot is two searchers and a 2-cost [Blocker], none of which builds toward
 * OP09-051's five, which is what the generic cost-2-or-less keep asks after.
 */
const CURVE_BODIES = new Set([
  "ST25-001",
  "ST25-002",
  "ST25-004",
  "ST25-005",
  "OP09-045",
  "P-082",
]);

export function createOp09BuggyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op09-buggy-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => CURVE_BODIES.has(card.cardNumber)),
    keepBecause:
      "Keep a 4- or 5-cost Cross Guild body: it is the turn-three play that builds toward OP09-051 Buggy's five.",
    mulliganBecause:
      "Mulligan a hand with no 4- or 5-cost body: nothing in it builds the board OP09-051 Buggy needs.",
  });
}

/**
 * Characters on the field with a cost of 5 or more, read off `currentCost`,
 * so the ST-25 4-costs count once their +1 is live -- the number OP09-051
 * Buggy's [On Play] checks, before Buggy itself is added to it.
 */
const fiveCostBodies = (observation: GameObservation): number =>
  observation.self.board.filter((card) => card.currentCost >= 5).length;

/** OP09-051 Buggy lands now and stays: four already out, and it is the fifth. */
const bigBuggyStays = (observation: GameObservation): boolean =>
  fiveCostBodies(observation) >= 4 && observation.self.board.length < 5;

/**
 * The {Cross Guild} Characters worth five rested DON!! and a card: everything
 * in the fifty above 5, and OP09-051 only on a board it can stay on. Below 6
 * the Leader pays more than a hard cast would.
 */
function leaderTarget(cardNumber: string, observation: GameObservation) {
  switch (cardNumber) {
    case BIG_BUGGY:
      return bigBuggyStays(observation) ? 10 : 0;
    case "ST25-003": // Crocodile & Mihawk
      return 8;
    case "OP09-046": // Crocodile
      return 7;
    case "OP09-048": // Dracule Mihawk
      return 6;
    default:
      return 0;
  }
}

/** Is the Leader's activation on offer, with something worth playing through it? */
function leaderLineOpen(observation: GameObservation): boolean {
  const offered = observation.legalActions.some(
    (action) =>
      action.type === "activate-main" && action.sourceCardNumber === LEADER,
  );
  if (!offered) return false;
  // The trash cost is a second card: a lone target cannot pay for itself.
  if (observation.self.hand.length < 2) return false;
  return observation.self.hand.some(
    (card) => leaderTarget(card.cardNumber, observation) > 0,
  );
}

/**
 * The Leader's [Activate: Main] before any hard cast.
 *
 * It needs five *active* DON!!, and the ladder plays from hand before it
 * activates, so a turn that opens on a castable body spends the DON!! the
 * Leader needed and never offers it again. Played first, the Leader puts a 6-,
 * 7-, 8- or 10-cost body down for five, and whatever DON!! is left still pays
 * for the hand.
 */
export function createOp09BuggyLeaderModule(): PolicyModule {
  return heuristics("op09-buggy-leader", [
    never("Activate the Leader before hard-casting: the play spends its DON!!.")
      .as("leader-first")
      .play((_card, t) => leaderLineOpen(t.observation)),
    prefer("The Leader's activation is the deck's engine.")
      .by(WEIGHT.deck)
      .as("leader-over-other-activations")
      .when((t) => leaderLineOpen(t.observation))
      .activate((action) => action.sourceCardNumber === LEADER),
  ]);
}

/** The cards that put a {Cross Guild} Character from hand onto the field. */
const PUTS_INTO_PLAY = new Set([LEADER, "ST25-003", "ST25-004", "OP09-046"]);

/**
 * Which body the Leader, ST25-004 Buggy, ST25-003 Crocodile & Mihawk and
 * OP09-046 Crocodile put onto the field.
 *
 * Each offers every eligible Character in hand order, and the first is as
 * likely to be OP09-051 Buggy on a board it cannot stay on -- which then
 * leaves -- as the 8-cost it was for. The biggest body that stays is the one.
 */
export function createOp09BuggyPlayPickModule(): PolicyModule {
  return heuristics("op09-buggy-play-pick", [
    prefer("Put the biggest body down that stays.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (!PUTS_INTO_PLAY.has(action.sourceCardNumber)) return false;
        if (action.destination !== undefined) return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "hand") return false;
        if (option.card.cardNumber === BIG_BUGGY) {
          return bigBuggyStays(t.observation) ? 20 : 1;
        }
        return 2 + (option.card.cost ?? 0);
      }),
  ]);
}

/**
 * What each card in the fifty is worth kept in hand, lowest first: the order
 * a "trash N cards from your hand" spends them in.
 *
 * The searchers and Mr.3 have done their job by the time the deck is drawing
 * and trashing; the 4-costs are the bodies that build OP09-051's five; the
 * big Characters are what the Leader plays; OP09-051 is the finisher.
 */
function keepValue(cardNumber: string): number {
  switch (cardNumber) {
    case "OP09-057": // Cross Guild
    case "OP09-056": // Mr.3
      return 1;
    case "PRB02-009": // Mr.3, a 2-cost [Blocker]
      return 2;
    case "ST25-002":
    case "ST25-005":
      return 3;
    case "ST25-001":
    case "ST25-004":
    case "OP09-045":
      return 4;
    case "P-082":
      return 5;
    case "OP09-048":
      return 6;
    case "OP09-046":
      return 7;
    case "ST25-003":
      return 8;
    case BIG_BUGGY:
      return 9;
    default:
      return 5;
  }
}

/**
 * Which cards the deck trashes from hand -- to the Leader, ST25-004, ST25-001,
 * ST25-003 and OP09-048 -- cheapest to lose first, rather than hand order.
 */
export function createOp09BuggyDiscardModule(): PolicyModule {
  return heuristics("op09-buggy-discard", [
    prefer("Trash the card the plan needs least.")
      .by(WEIGHT.deck)
      .effect((action) => {
        if (action.destination?.zone !== "trash") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "hand") return false;
        return 10 - keepValue(option.card.cardNumber);
      }),
  ]);
}

/**
 * The bodies worth a Counter card to keep, and how much Counter each is worth.
 *
 * Each cost the Leader five DON!! and a card to put down, and each is one of
 * the five OP09-051 Buggy needs to stay; nothing in the list plays one back
 * from the trash. The ST-25 4-costs come back off the next search, so they are
 * left to the generic step.
 */
const DEFEND: ReadonlyMap<string, number> = new Map([
  [BIG_BUGGY, 3000],
  ["ST25-003", 3000],
  ["OP09-046", 2000],
  ["OP09-048", 2000],
]);

/**
 * Spend Counter cards to keep the bodies in {@link DEFEND} on the board.
 *
 * The generic Counter step defends only the Characters a deck names, so
 * without this an 8-cost the Leader paid for goes to the first attack that
 * reaches it.
 */
export function createOp09BuggyCounterPolicy(): PolicyModule {
  return {
    id: "op09-buggy-counter",
    decide: ({ observation }): PolicyDecision | undefined =>
      observation.phase === "counter"
        ? chooseGenericCounter(observation, observation.legalActions, {
            protectedCards: new Set(DEFEND.keys()),
            characterDefensePower: (cardNumber) => DEFEND.get(cardNumber) ?? 0,
          })
        : undefined,
  };
}
