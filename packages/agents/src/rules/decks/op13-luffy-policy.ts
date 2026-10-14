/**
 * (Red/Green) Monkey.D.Luffy's policy, behind the OP13-001 Leader.
 *
 * The Leader is a defensive clause paid in DON!!: on the opponent's turn, at 5
 * or fewer active DON!!, it rests any number of them for +2000 apiece on
 * itself or a {Straw Hat Crew} Character under attack. Four of the deck's
 * Characters set spent DON!! active again so that there is something left to
 * rest, which makes the clause the deck's most frequent decision --
 * `pnpm census` reads it as every `block:resolve-effect` the seat is asked.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { counterCardsFromHand } from "../combat.js";
import { leaderCounterBudget } from "../format/defence.js";
import {
  chooseGenericCounter,
  decision,
  mustPreventCurrentLeaderHit,
  type PolicyDecision,
} from "../generic-policy.js";
import { createMulliganModule } from "../mulligan.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { PolicyModule } from "../policy-module.js";

const LUFFY_LEADER = "OP13-001";

/** What one DON!! rested to the Leader's clause adds to the defender. */
const REST_STEP = 2_000;

/**
 * The branch id the engine gives "rest N DON!!", read back as N.
 *
 * `mechanics/op13-battle.ts` names each branch `rest-<N>` and offers only the
 * branches the active DON!! can pay, so the largest N on offer is also what
 * the seat can afford.
 */
function restCount(action: LegalAction): number | undefined {
  if (action.type !== "resolve-effect") return undefined;
  if (action.sourceCardNumber !== LUFFY_LEADER) return undefined;
  if (action.option.kind !== "mode") return undefined;
  const match = /^rest-(\d+)$/.exec(action.option.mode);
  return match ? Number(match[1]) : undefined;
}

function leaderOffer(observation: GameObservation) {
  let apply: LegalAction | undefined;
  let skip: LegalAction | undefined;
  const branches: { action: LegalAction; count: number }[] = [];
  for (const action of observation.legalActions) {
    if (
      action.type !== "resolve-effect" ||
      action.sourceCardNumber !== LUFFY_LEADER
    ) {
      return undefined;
    }
    if (action.option.kind === "skip") skip = action;
    else if (
      action.option.kind === "confirm" &&
      action.option.choice === "apply"
    ) {
      apply = action;
    } else {
      const count = restCount(action);
      if (count === undefined) return undefined;
      branches.push({ action, count });
    }
  }
  return { apply, skip, branches };
}

/**
 * Whether the Counter window will close what the DON!! leaves open.
 *
 * The same two gates `chooseGenericCounter` decides a Leader hit with --
 * `mustPreventCurrentLeaderHit`, then the per-Life card budget -- asked here
 * so that DON!! rested toward a save the Counter step then declines to finish
 * is not spent. Only a Leader hit is priced this way: a Character under attack
 * is saved from hand only by a rule that names it, and this deck names none.
 */
function counterWindowCloses(
  observation: GameObservation,
  residual: number,
): boolean {
  if (residual <= 0) return true;
  const battle = observation.activeBattle;
  if (!battle?.targetInstanceId.endsWith("-leader")) return false;
  if (!mustPreventCurrentLeaderHit(observation)) return false;
  const cards = counterCardsFromHand(
    observation.self.hand.map((card) => card.currentCounter),
    residual,
  );
  return cards <= leaderCounterBudget(observation.self.lifeCount);
}

/**
 * The Leader's `[On Your Opponent's Attack]`: rest exactly the DON!! that wins
 * the battle, and none where they cannot.
 *
 * The generic ladder takes every beneficial optional it is offered, so it
 * applies the clause into a battle the defender was already winning, and then
 * picks a branch by offer order -- one DON!! for 2000, which against a
 * whole-thousand attacker one step up is a tie the attacker wins. Neither is
 * free: the DON!! stays rested for the rest of the opponent's turn, and the
 * turn usually has a second attack in it and a [Counter] Event in hand whose
 * cost is paid out of the same pile.
 *
 * So the rule buys the battle or nothing. It declines where the attack
 * already fails, rests `ceil(shortfall / 2000)` where that is on offer, and
 * where every active DON!! still falls short it pays only if the Counter
 * window will close the rest.
 */
export function createOp13LuffyLeaderPolicy(): RulesPolicy {
  return (observation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== LUFFY_LEADER) return undefined;
    const battle = observation.activeBattle;
    if (!battle) return undefined;
    const offer = leaderOffer(observation);
    if (!offer) return undefined;

    const shortfall = battle.counterShortfall;
    const needed = Math.ceil(Math.max(0, shortfall) / REST_STEP);
    if (offer.apply && offer.skip) {
      if (needed === 0) {
        return decision(
          offer.skip,
          "Rest no DON!! to the Leader: the attack already fails, and the DON!! is the next attack's defence.",
        );
      }
      const affordable = Math.min(observation.self.activeDon, 5);
      if (needed <= affordable) {
        return decision(
          offer.apply,
          `Rest DON!! to the Leader: ${needed} of them win this battle.`,
        );
      }
      if (
        counterWindowCloses(observation, shortfall - affordable * REST_STEP)
      ) {
        return decision(
          offer.apply,
          "Rest every DON!! to the Leader: the Counter window closes what is left.",
        );
      }
      return decision(
        offer.skip,
        "Rest no DON!! to the Leader: every DON!! still loses this battle, so keep them for the next one.",
      );
    }
    if (offer.branches.length === 0 || offer.apply || offer.skip) {
      return undefined;
    }
    const largest = offer.branches.reduce((left, right) =>
      right.count > left.count ? right : left,
    );
    const exact = offer.branches.find((branch) => branch.count === needed);
    const pick = exact ?? largest;
    return decision(
      pick.action,
      exact
        ? `Rest ${pick.count} DON!!: the fewest that win this battle.`
        : `Rest ${pick.count} DON!!: all of them, toward a save the Counter window finishes.`,
    );
  };
}

/**
 * The cards a (Red/Green) Monkey.D.Luffy opening can act on before turn three.
 *
 * Sixteen 1-cost look-at-fours and look-at-fives -- OP01-016 and EB02-017
 * Nami, EB04-002 Jewelry Bonney and the ST31-005 Thousand Sunny -- each find
 * a {Straw Hat Crew} card, which is every Character in the fifty.
 * OP14-022 Usopp and OP14-031 Nami are the 4-costs that set DON!! active
 * again, the engine the Leader's defence runs on.
 *
 * What is left of the cheap slot does not open a game: OP04-016, OP05-038 and
 * OP13-040 are [Counter] cards, and ST21-003 Sanji is a 3000 body whose clause
 * needs a 6000 attacker. A hand of those is a hand the generic "anything
 * costing 2 or less" keeps and this deck cannot use.
 */
const OPENERS: ReadonlySet<string> = new Set([
  "OP01-016",
  "EB02-017",
  "EB04-002",
  "ST31-005",
  "OP14-022",
  "OP14-031",
]);

export function createOp13LuffyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op13-luffy-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a hand with a 1-cost Straw Hat search or a 4-cost DON!! refresher: either one is a turn this deck can take on curve.",
    mulliganBecause:
      "Mulligan a hand with no search and no refresher: the Counter Events and a lone Sanji do nothing on the first turns.",
  });
}

/**
 * The bodies this deck loses something by losing.
 *
 * `chooseGenericCounter` defends a Character only when it is named here. Two
 * of the three are the refresh engine the Leader's defence runs on: OP14-022
 * Usopp and OP13-027 Sanji each set DON!! active at the end of every turn they
 * stand through, so losing one is losing a DON!! of defence on every opposing
 * turn after. OP13-118 is the [Double Attack], the deck's two-Life swing.
 * OP14-031 Nami is not here: its refresh is a one-turn [On Play], spent by the
 * time anything attacks it.
 */
const PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  "OP14-022",
  "OP13-027",
  "OP13-118",
]);

export function createOp13LuffyCounterPolicy(): RulesPolicy {
  return (observation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== LUFFY_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: PROTECTED_FROM_COUNTER,
    });
  };
}
