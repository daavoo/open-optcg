/**
 * (Red) Silvers Rayleigh's policy, behind the OP12-001 Leader.
 *
 * The Leader and five of the deck's Characters pay their clause by revealing
 * two Events from hand, so the fifty runs sixteen Events and two searchers
 * that look at five cards for one. Everything in the list costs 4 or less --
 * the Leader forbids more -- so the curve itself is never the problem.
 */
import { isSearchResult, optionCardNumberOf } from "../generic-policy.js";
import {
  heuristics,
  never,
  prefer,
  preferAmong,
  type Heuristic,
} from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import { opponentLeaderId, type Tactics } from "../tactics.js";

/** OP12-006 Shakuyaku and OP12-014 Boa Hancock: each looks at 5 for a red Event. */
const EVENT_SEARCHERS = new Set(["OP12-006", "OP12-014"]);

/** The four Haki Events, OP12-016 to OP12-019. */
const EVENTS = new Set(["OP12-016", "OP12-017", "OP12-018", "OP12-019"]);

/**
 * Every card in the fifty costs 4 or less, so the generic keep (any card of
 * cost 2 or less) keeps almost every hand. What the opening hand actually
 * needs is the Leader's reveal: two Events already in it, or a searcher that
 * finds the second.
 */
export function createOp12RayleighMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op12-rayleigh-mulligan",
    keep: (observation) => {
      const hand = observation.self.hand;
      const events = hand.filter((card) => EVENTS.has(card.cardNumber)).length;
      return (
        events >= 2 || hand.some((card) => EVENT_SEARCHERS.has(card.cardNumber))
      );
    },
    keepBecause:
      "Keep two Events or a Shakuyaku or Hancock: the Leader's reveal is online, or one search away.",
    mulliganBecause:
      "Mulligan a hand with fewer than two Events and no searcher: the Leader and half the Characters cannot pay their clause.",
  });
}

/**
 * The opponent's Life at or below which Bandai's own guide says to start
 * casting the Events rather than holding them: "once you've reduced your
 * opponent's Life".
 */
const CLOSING_LIFE = 2;

/**
 * A Haki Event's [Main] is not cast if it leaves fewer than two Events in hand.
 *
 * Two Events in hand are the price of the Leader's +2000 and of the reveal
 * Characters (Crocus, Oden, Jinbe, Hatchan, Luffy), and the reveal spends
 * nothing -- so an Event cast for one DON!! and +1000 turns off every one of
 * those clauses until another Event is drawn. Its [Counter] half is untouched:
 * that is the Event doing what the hand was holding it for.
 */
export function createOp12RayleighReserveModule(): PolicyModule {
  return heuristics("op12-rayleigh-reserve", [
    never(
      "Do not cast a Haki Event's [Main] while it is one of the two Events the reveal clauses need.",
    ).activate((action, t) => {
      if (!EVENTS.has(action.sourceCardNumber)) return false;
      if (t.observation.opponent.lifeCount <= CLOSING_LIFE) return false;
      const events = t.observation.self.hand.filter((card) =>
        EVENTS.has(card.cardNumber),
      ).length;
      return events - 1 < 2;
    }),
  ]);
}

const HANCOCK = "OP12-014";

/**
 * Boa Hancock does not trash herself for DON!! while she can still attack.
 *
 * She is the 3000 body the Leader's +2000 turns into a 5000 attacker, and the
 * two DON!! she gives are rested; once she has attacked, the trade is a body
 * that has done its work for two DON!! of power elsewhere.
 */
export function createOp12RayleighHancockModule(): PolicyModule {
  return heuristics("op12-rayleigh-hancock", [
    never("Do not trash a Boa Hancock that can still attack.").activate(
      (action, t) =>
        action.sourceCardNumber === HANCOCK &&
        t.observation.self.board.some(
          (card) =>
            card.instanceId === action.sourceInstanceId && card.couldAttack,
        ),
    ),
  ]);
}

/** OP12-016 and OP12-019: a 0-cost [Main] that gives Rayleigh DON!!, and a +2000 [Counter]. */
const COUNTER_EVENTS = new Set(["OP12-016", "OP12-019"]);

/**
 * OP12-016 and OP12-019 are held for their [Counter] until the opponent is at
 * 0 Life.
 *
 * Both cost 0, and both [Main]s pay by giving active DON!! to Rayleigh -- which
 * an attach already does for free. What the card itself adds is OP12-019's
 * +1000, or OP12-016's "no [Blocker]" on the Leader's swing, against a +2000
 * [Counter] that answers an attack for nothing. That trade does not turn over
 * in the closing turns, because those are the turns the opponent is racing
 * too: an Event spent on the swing at 2 Life is a Counter the hand no longer
 * has when the reply comes. Only at 0 Life, where any swing that connects ends
 * the game, is getting past a [Blocker] worth more than surviving the next
 * turn.
 */
export function createOp12RayleighCounterEventsModule(): PolicyModule {
  return heuristics("op12-rayleigh-counter-events", [
    never(
      "Hold OP12-016 and OP12-019 for their +2000 [Counter] until the opponent is at 0 Life.",
    ).activate(
      (action, t) =>
        COUNTER_EVENTS.has(action.sourceCardNumber) &&
        t.observation.opponent.lifeCount > 0,
    ),
  ]);
}

/** Whether this attacker has a viable swing at the opposing Leader to take instead. */
function hasLeaderHit(attackerInstanceId: string, t: Tactics): boolean {
  return t.leaderAttacks.some(
    (other) => other.attackerInstanceId === attackerInstanceId,
  );
}

/**
 * At closing Life, a swing that can connect with the opposing Leader goes there.
 *
 * `threat-removal` promotes a K.O. on a rested Blocker or a cost-4 body over a
 * Leader hit for every deck. This deck's bodies are 2000s and 3000s that reach
 * the Leader only with the turn's help, so it cannot outlast a board it trades
 * with: its plan is the race, and with the opponent on 2 Life or less a body
 * K.O.'d is one fewer attacker next turn while a Life taken is one fewer turn.
 *
 * `never` rather than a rank, registered above `threat-removal`'s priority:
 * that rule is a `prefer`, which hides every candidate it does not score, so a
 * competing preference would tie rather than win. Only an attacker that has a
 * Leader hit of its own is held back, so a body too small for the Leader still
 * trades.
 */
export const OP12_RAYLEIGH_PRESS_RULES: readonly Heuristic[] = [
  never(
    "At closing Life, an attacker with a Leader hit takes it rather than a Character.",
  )
    .as("closing")
    .when(
      (t) =>
        t.observation.phase === "main" &&
        t.opponentLife > 0 &&
        t.opponentLife <= CLOSING_LIFE,
    )
    .attack(
      (attack, t) =>
        attack.targetInstanceId !== opponentLeaderId(t.observation) &&
        hasLeaderHit(attack.attackerInstanceId, t),
    ),
];

/** Shakuyaku, Hancock and Color of Observation Haki: each looks at the deck top for one card. */
const SEARCHERS = new Set(["OP12-006", "OP12-014", "OP12-017"]);

/** The search order when the hand already holds the reveal's two Events. */
const STOCKED_ORDER = [
  "OP12-015",
  "OP12-009",
  "OP12-018",
  "OP12-016",
  "OP12-019",
  "OP12-017",
];

/** The search order when it does not: an Event first, and the pure [Counter] above the rest. */
const SHORT_ORDER = [
  "OP12-018",
  "OP12-016",
  "OP12-019",
  "OP12-017",
  "OP12-015",
  "OP12-009",
];

export function createOp12RayleighSearchModule(): PolicyModule {
  return heuristics("op12-rayleigh-search", [
    preferAmong(
      "Search an Event while the hand is short of the reveal's two, and Luffy once it is not.",
    ).effect((action, t) => {
      if (!SEARCHERS.has(action.sourceCardNumber) || !isSearchResult(action)) {
        return false;
      }
      const events = t.observation.self.hand.filter((card) =>
        EVENTS.has(card.cardNumber),
      ).length;
      const order = events < 2 ? SHORT_ORDER : STOCKED_ORDER;
      const rank = order.indexOf(optionCardNumberOf(action));
      return rank < 0 ? 1 : order.length + 1 - rank;
    }),
  ]);
}

/**
 * Spend the turn's spare DON!! bringing one more attacker up to the opposing
 * Leader, rather than onto one that already connects.
 *
 * The fifty is 2000 and 3000 bodies under a 5000 Leader, so most of the board
 * reaches the opposing Leader only with help, and that help is the Leader's one
 * +2000 and whatever DON!! is left after the plays. The aggro profile's
 * `don-threshold` prices one DON!! at a time by the Counter step it crosses,
 * which a body still under the Leader's power never does -- the first of the
 * three a 2000 Shakuyaku needs buys nothing on its own -- so it puts every spare
 * DON!! on the attacker that already connects and leaves the other one idle. A
 * swing that connects asks the defender for a card or a Life; one that does not
 * is not a swing.
 *
 * Scores only a body the DON!! left can carry all the way, smallest gap first,
 * and abstains otherwise so `don-threshold` keeps every other attachment.
 */
export function createOp12RayleighReachModule(): PolicyModule {
  return heuristics("op12-rayleigh-reach", [
    prefer(
      "Bring an attacker up to the opposing Leader when the DON!! left cover the whole gap.",
    )
      .when((t) => t.observation.phase === "main")
      .attachDon((action, t) => {
        if (!t.canAttack(action.targetInstanceId)) return false;
        const power = t.ownCurrentPower(action.targetInstanceId);
        if (power === undefined) return false;
        const gap = t.opponentLeaderPower - power;
        if (gap <= 0) return false;
        const needed = Math.ceil(gap / 1_000);
        return needed <= t.don ? 11 - needed : false;
      }),
  ]);
}
