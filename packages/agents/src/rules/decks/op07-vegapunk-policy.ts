/**
 * (Yellow) Vegapunk's policy, behind the OP07-097 Leader.
 *
 * The Leader cannot attack and starts on two Life. Once a turn, for one rested
 * DON!!, it plays an {Egghead} card of cost 5 or less from hand or banks it
 * face-up on Life, so from the first turn the deck turns a single DON!! into a
 * 5-cost body. Everything else the deck does follows from that conversion:
 * the DON!! the Leader did not spend hard-casts the rest of the hand, Lilith,
 * the EB02-056 Vegapunk body and three Events dig for the next {Egghead} card,
 * and the bodies' own [Trigger]s play them again when a banked Life card is
 * hit. Two Life is already "2 or less", so Edison and EB02-054 Sanji draw,
 * Pythagoras recurs and OP07-115 is a +3000 Counter from the first turn.
 *
 * So the Leader's activation is the deck's engine, and three questions sit on
 * it: whether it runs before the hand spends the DON!!, which card it takes,
 * and whether that card goes to the field or to Life.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import { optionCard } from "../generic-policy.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const LEADER = "OP07-097";

/**
 * The cards a first turn wants: the two bodies whose [On Play] finds the next
 * card when the Leader plays them for one DON!! (OP07-111 Lilith, which adds an
 * {Egghead} card, and EB02-056 Vegapunk, which plays a {Scientist} body
 * straight off the deck), and the two cheap Events that dig for the same
 * cards (OP07-114 He Possesses the World's Most Brilliant Mind, OP09-117
 * Dereshi!). Nearly every card in the list is an {Egghead} body the Leader can
 * play, so having one in hand says nothing about a hand; whether it can keep
 * finding the next one is what separates a hand that develops every turn from
 * one that stalls after its first activation.
 */
const OPENERS = new Set(["OP07-111", "EB02-056", "OP07-114", "OP09-117"]);

export function createOp07VegapunkMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op07-vegapunk-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep Lilith, the Vegapunk body or a digging Event: each finds the next {Egghead} card for the Leader to play.",
    mulliganBecause:
      "Mulligan a hand with no Lilith, no Vegapunk body and no digging Event: the Leader plays one body and then has nothing to find the next.",
  });
}

/** The cards the Leader can select: {Egghead}, cost 5 or less. */
const LEADER_TARGETS = new Set([
  "OP07-111",
  "OP07-100",
  "OP07-107",
  "EB02-056",
  "OP07-101",
  "OP07-105",
  "OP07-109",
  "OP07-098",
  "OP08-106",
  "OP08-112",
  "OP07-114",
  "OP07-115",
  "OP07-117",
]);

/**
 * What each {Egghead} card is worth banked face-up on Life: the bodies whose
 * [Trigger] plays themselves behind this Leader come back as a body when the
 * hit lands, OP07-115's [Trigger] plays one from the trash, and the rest turn
 * over for a smaller effect or a card. EB02-056 Vegapunk and the two Events
 * that only draw are worth least there: their value is in being cast.
 */
function bankValue(cardNumber: string): number {
  switch (cardNumber) {
    case "OP07-101":
    case "OP07-098":
    case "OP07-105":
      return 5;
    case "OP07-100":
    case "OP07-115":
      return 4;
    case "OP07-111":
      return 3;
    case "OP08-106":
    case "OP08-112":
    case "OP07-109":
    case "OP07-107":
    case "OP07-117":
      return 2;
    default:
      return 1;
  }
}

/** The card the Leader selects this turn and where it sends it. */
interface LeaderPlan {
  cardNumber: string;
  mode: "play" | "life";
}

/**
 * The Leader banks: its card goes face-up on Life, and the one it sends is the
 * card worth most there by {@link bankValue}.
 *
 * Read twice, at the card choice and again at the play-or-Life choice, where
 * the selected card is still in hand and nothing on the action names it; the
 * hand is the same at both, so both reads agree.
 */
export function leaderPlan(
  observation: GameObservation,
): LeaderPlan | undefined {
  let best: { cardNumber: string; value: number } | undefined;
  for (const card of observation.self.hand) {
    if (!LEADER_TARGETS.has(card.cardNumber)) continue;
    const value = bankValue(card.cardNumber);
    if (!best || value > best.value)
      best = { cardNumber: card.cardNumber, value };
  }
  return best ? { cardNumber: best.cardNumber, mode: "life" } : undefined;
}

const leaderOffered = (observation: GameObservation): boolean =>
  observation.legalActions.some(
    (action) =>
      action.type === "activate-main" && action.sourceCardNumber === LEADER,
  );

/**
 * The Leader's activation before anything is hard-cast.
 *
 * It needs one active DON!!, and the generic ladder plays from hand before it
 * activates, so a turn that opens with castable cards can spend every DON!!
 * and never reach it. The engine offers the activation only while the hand
 * holds a card it can select.
 */
export function createOp07VegapunkLeaderFirstModule(): PolicyModule {
  return heuristics("op07-vegapunk-leader-first", [
    never("Activate the Leader before hard-casting: the plays spend its DON!!.")
      .as("leader-first")
      .play((_card, t) => leaderOffered(t.observation)),
    prefer("The Leader's activation is the deck's engine.")
      .by(WEIGHT.deck)
      .as("leader-over-other-activations")
      .when((t) => leaderOffered(t.observation))
      .activate((action) => action.sourceCardNumber === LEADER),
  ]);
}

/**
 * Which card the Leader selects: the one {@link leaderPlan} names, rather than
 * the first in hand order. Every candidate is scored, so the "choose nothing"
 * option, which wastes the rested DON!!, is hidden.
 */
export function createOp07VegapunkLeaderPickModule(): PolicyModule {
  return heuristics("op07-vegapunk-leader-pick", [
    prefer("The Leader takes the card its plan names.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.sourceCardNumber !== LEADER) return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "hand") return false;
        const plan = leaderPlan(t.observation);
        return option.card.cardNumber === plan?.cardNumber
          ? 10
          : bankValue(option.card.cardNumber);
      }),
  ]);
}

/**
 * Bank the Leader's card face-up on Life rather than play it.
 *
 * A banked [Trigger] body is a Life card that comes back as a body: the hit
 * that turns it over plays it for nothing, so each activation is one more hit
 * the Leader can take and a body on the field after it. Played, the same card
 * is one body now and the Leader stays on the two Life it started with. An
 * Event can only be banked: it is never played.
 */
export function createOp07VegapunkLeaderModeModule(): PolicyModule {
  return heuristics("op07-vegapunk-leader-mode", [
    prefer("Bank the Leader's card face-up on Life.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.sourceCardNumber !== LEADER) return false;
        if (action.option.kind !== "mode") return false;
        const plan = leaderPlan(t.observation);
        if (!plan) return false;
        return action.option.mode === plan.mode ? 2 : -1;
      }),
  ]);
}

/**
 * Which {Egghead} body the Egghead Stage sets active at the end of the turn:
 * a rested [Blocker] first, since it is the body that answers the next
 * attack, then the strongest rested body. An active one gains nothing.
 */
export function createOp07VegapunkStageModule(): PolicyModule {
  return heuristics("op07-vegapunk-stage", [
    prefer("Set active the rested body that defends best.")
      .by(WEIGHT.deck)
      .effect((action) => {
        if (action.sourceCardNumber !== "OP07-117") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "board") return false;
        if (!option.rested) return -1;
        const blocker = BLOCKERS.has(option.card.cardNumber) ? 100 : 0;
        return 1 + blocker + (option.currentPower ?? 0) / 1000;
      }),
  ]);
}

/** The list's {Egghead} [Blocker]s. */
const BLOCKERS = new Set(["OP07-101", "EB02-056"]);

/** The bodies whose [Trigger] plays themselves while the Leader is Vegapunk. */
const SELF_PLAYING = new Set([
  "OP07-111",
  "OP07-100",
  "OP07-101",
  "OP07-105",
  "OP07-098",
]);

/** The attack in front of the block step lands on the Leader and turns over a banked body. */
function hitTurnsOverABody(observation: GameObservation): boolean {
  const battle = observation.activeBattle;
  if (!battle?.targetInstanceId.endsWith("-leader")) return false;
  if (observation.self.lifeCount < 2) return false;
  const top = observation.self.life[0];
  return (
    top?.faceUp === true &&
    top.cardNumber !== undefined &&
    SELF_PLAYING.has(top.cardNumber)
  );
}

/**
 * Let a Leader hit through when the Life card it takes is a banked body whose
 * [Trigger] plays it: the hit costs a Life card the Leader banked for one
 * DON!! and puts a body on the field, where a block rests a body instead.
 * Not at one Life, where the next hit after it is the last.
 */
export function createOp07VegapunkTakeTheTriggerModule(): PolicyModule {
  return heuristics("op07-vegapunk-take-the-trigger", [
    never("Take the hit: the banked Life card it turns over plays a body.")
      .when((t) => hitTurnsOverABody(t.observation))
      .block(() => true),
  ]);
}

/** The cards that put an {Egghead}, [Trigger] or {Scientist} card from the deck into hand or play. */
const SEARCHERS = new Set(["OP07-111", "OP07-114", "OP09-117", "EB02-056"]);

/**
 * Which card a search takes: the one worth most to the Leader's next bank, by
 * {@link bankValue}, rather than the first in the look.
 */
export function createOp07VegapunkSearchModule(): PolicyModule {
  return heuristics("op07-vegapunk-search", [
    prefer("Find the card worth most banked on Life.")
      .by(WEIGHT.deck)
      .effect((action) => {
        if (!SEARCHERS.has(action.sourceCardNumber)) return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "deck") return false;
        return bankValue(option.card.cardNumber);
      }),
  ]);
}
