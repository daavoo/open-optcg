/**
 * (Black) Imu's policy, behind the OP13-079 Leader.
 *
 * The Leader starts the game with OP13-099 The Empty Throne in play, and the
 * Stage is the deck: rest it and three DON!! to play a black {Five Elders}
 * Character from hand whose cost is at most the DON!! on the field. The generic
 * ladder never reaches it -- it develops the dearest card it can afford before
 * it looks at an activation, so it hard-casts the Elder the Stage would have
 * played for three, or spends the three DON!! the Stage needed on something
 * else. The rules here put the Stage first, spend the Leader's draw on a body
 * that has done its job, and hold OP13-082's board reset until the trash can
 * pay for it.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { isOptionCardIn, optionCard } from "../generic-policy.js";
import {
  heuristics,
  never,
  prefer,
  preferAmong,
  WEIGHT,
} from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { HandCard, Tactics } from "../tactics.js";

const IMU_LEADER = "OP13-079";
const EMPTY_THRONE = "OP13-099";
const FIVE_ELDERS = "OP13-082";

/**
 * The five 5000-power {Five Elders} Characters: what OP13-082 plays back out
 * of the trash, one of each name.
 */
const FIVE_THOUSAND_ELDERS = new Set([
  "OP13-080",
  "OP13-083",
  "OP13-084",
  "OP13-089",
  "OP13-091",
]);

/** Every black {Five Elders} Character in the fifty: what the Stage plays. */
const THRONE_PLAYS = new Set([...FIVE_THOUSAND_ELDERS, FIVE_ELDERS]);

/**
 * The {Celestial Dragons} bodies whose whole value is their [On Play]: 0 power
 * once it has resolved, so the Leader's "trash one to draw one" turns each
 * into a card.
 */
const SPENT_BODIES = new Set(["OP13-086", "OP13-087", "OP13-095"]);

/** The early diggers the feature page opens on, and the 4-cost Elders. */
const OPENERS = new Set(["OP13-086", "OP13-096", "OP13-083", "OP13-089"]);

type ResolveEffect = Extract<LegalAction, { type: "resolve-effect" }>;

/**
 * A choice the card's own program is asking, rather than a replacement or an
 * area limit the engine names the same card as the source of.
 */
function isOwnChoice(action: ResolveEffect, source: string): boolean {
  return (
    action.sourceCardNumber === source &&
    action.effectKind === "mechanic-choice"
  );
}

/**
 * Whether the Stage can play `card` right now: it is untapped, three DON!! are
 * left to rest, and the card is a {Five Elders} body within the field's DON!!.
 */
function throneCanPlay(
  observation: GameObservation,
  t: Tactics,
  card: { cardNumber: string; cost: number },
): boolean {
  const stage = observation.self.stage;
  return (
    stage?.cardNumber === EMPTY_THRONE &&
    !stage.rested &&
    observation.self.activeDon >= 3 &&
    THRONE_PLAYS.has(card.cardNumber) &&
    card.cost <= t.fieldDon
  );
}

function throneTarget(observation: GameObservation, t: Tactics): boolean {
  return observation.self.hand.some((card) =>
    throneCanPlay(observation, t, card),
  );
}

export function createOp13ImuMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op13-imu-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a digger or a 4-cost Elder: the Stage is already in play, and the early turns are for finding Elders and filling the trash.",
    mulliganBecause:
      "Mulligan a hand with nothing to dig or develop before the Stage can play an Elder.",
  });
}

/**
 * The Stage before anything it would compete with.
 *
 * Two plays are held back while the Stage has a target: the Elder it would put
 * down for three, and any card that would leave fewer than three active DON!!
 * to rest for it. When it is taken, it plays the dearest Elder it can reach --
 * the Stage costs three whatever it plays, so the saving is the card's cost.
 */
export function createOp13ImuThroneModule(): PolicyModule {
  return heuristics("op13-imu-throne", [
    never(
      "Do not pay for an Elder the Stage can play for three, or spend the three DON!! it needs.",
    )
      .by(WEIGHT.deck)
      .as("throne-first")
      .play((card: HandCard, t) => {
        const observation = t.observation;
        if (!throneTarget(observation, t)) return false;
        if (throneCanPlay(observation, t, card)) return true;
        return observation.self.activeDon - card.currentCost < 3;
      }),
    prefer("Use the Stage while it has an Elder to play.")
      .by(WEIGHT.deck)
      .as("throne-activate")
      .when((t) => throneTarget(t.observation, t))
      .activate((action) => action.sourceCardNumber === EMPTY_THRONE),
    prefer("Play the dearest Elder the Stage can reach.")
      .by(WEIGHT.deck)
      .as("throne-pick")
      .effect((action) => {
        if (!isOwnChoice(action, EMPTY_THRONE)) return false;
        if (action.option.kind !== "card") return false;
        return action.option.card.cost ?? 0;
      }),
  ]);
}

/**
 * What a card is worth keeping, for the Leader's "trash one to draw one". The
 * 10-cost finisher and the Elders it reads first, then the removal and the
 * Counter Events, then the diggers that have nothing left to find.
 */
const KEEP_VALUE: ReadonlyMap<string, number> = new Map([
  [FIVE_ELDERS, 9],
  ["OP13-091", 7],
  ["OP13-084", 7],
  ["OP13-080", 6],
  ["OP13-083", 6],
  ["OP13-089", 6],
  ["PRB02-014", 5],
  ["OP13-098", 5],
  ["OP13-097", 4],
  ["OP13-096", 3],
  ["OP13-086", 3],
  ["OP13-095", 2],
  ["OP13-087", 2],
]);

/**
 * The Leader's draw, paid with the card this deck least wants.
 *
 * The generic ladder fires the activation whenever it is offered and pays with
 * the first card offered, which is as often the body it has just paid for. A
 * spent 0-power {Celestial Dragons} body on the board is the best payment (a
 * card for nothing), then the cheapest card in hand; an Elder on the board
 * never, since it is the body the trash thresholds were filled for.
 */
export function createOp13ImuLeaderModule(): PolicyModule {
  return heuristics("op13-imu-leader", [
    never("Do not trash an Elder on the board to draw one card.")
      .by(WEIGHT.deck)
      .as("leader-gate")
      .activate((action, t) => {
        if (action.sourceCardNumber !== IMU_LEADER) return false;
        const self = t.observation.self;
        const spent = self.board.some((card) =>
          SPENT_BODIES.has(card.cardNumber),
        );
        const spare = self.hand.some(
          (card) => (KEEP_VALUE.get(card.cardNumber) ?? 0) <= 5,
        );
        return !spent && !spare;
      }),
    prefer("Pay the Leader's draw with a spent body, else the cheapest card.")
      .by(WEIGHT.deck)
      .as("leader-payment")
      .effect((action) => {
        if (!isOwnChoice(action, IMU_LEADER)) return false;
        if (action.option.kind !== "card") return false;
        const cardNumber = action.option.card.cardNumber;
        if (action.option.zone === "board") {
          return SPENT_BODIES.has(cardNumber) ? 20 : false;
        }
        return 10 - (KEEP_VALUE.get(cardNumber) ?? 0);
      }),
  ]);
}

/**
 * Names of the 5000-power Elders OP13-082's reset could play right now.
 *
 * The reset trashes your Characters before it plays from the trash, so an
 * Elder on the board is as good as one already there: both are in the trash
 * when the play resolves.
 */
function resetNames(observation: GameObservation): Set<string> {
  return new Set(
    [...observation.self.trash, ...observation.self.board]
      .map((card) => card.cardNumber)
      .filter((cardNumber) => FIVE_THOUSAND_ELDERS.has(cardNumber)),
  );
}

/** Whether the reset would leave at least as many bodies as it trashes. */
function resetPays(observation: GameObservation): boolean {
  const names = resetNames(observation).size;
  return names >= 3 && names >= observation.self.board.length;
}

/**
 * Whether this turn is the reset turn: OP13-082 is on the board, or in hand
 * with the Stage able to play it, and the reset would pay.
 */
function resetComing(observation: GameObservation, t: Tactics): boolean {
  const onBoard = observation.self.board.some(
    (card) => card.cardNumber === FIVE_ELDERS,
  );
  const throneReach = observation.self.hand.some(
    (card) =>
      card.cardNumber === FIVE_ELDERS && throneCanPlay(observation, t, card),
  );
  return (onBoard || throneReach) && resetPays(observation);
}

/**
 * OP13-082 trashes every Character you have and plays up to five different
 * 5000-power Elders from the trash.
 *
 * Two rules, each its own module so each is addressable by `--disable`. The
 * reset waits until it rebuilds at least the board it wipes. And on the turn it
 * is coming, no other Character is paid for, since the reset would trash it:
 * with OP13-082 already on the board that includes a second copy.
 */
export function createOp13ImuResetGateModule(): PolicyModule {
  return heuristics("op13-imu-reset-gate", [
    never("Do not reset the board until the trash can rebuild a bigger one.")
      .by(WEIGHT.deck)
      .activate(
        (action, t) =>
          action.sourceCardNumber === FIVE_ELDERS && !resetPays(t.observation),
      ),
  ]);
}

export function createOp13ImuResetHoldModule(): PolicyModule {
  return heuristics("op13-imu-reset-hold", [
    never("Do not pay for a Character the reset is about to trash.")
      .by(WEIGHT.deck)
      .play((card, t) => {
        if (card.facts.category !== "character") return false;
        if (!resetComing(t.observation, t)) return false;
        const onBoard = t.observation.self.board.some(
          (body) => body.cardNumber === FIVE_ELDERS,
        );
        return onBoard || card.cardNumber !== FIVE_ELDERS;
      }),
  ]);
}

/**
 * "Play St. Marcus Mars and St. Ethanbaron V. Nusjuro to deal with your
 * opponent's Characters" -- the feature page's mid game. The Stage otherwise
 * plays the dearest Elder it reaches, which is Ju Peter at seven DON!! over
 * Mars at six; while the opponent has a Character with a base cost of 5 or
 * less for Mars's [On Play] to K.O., Mars comes first. OP13-082 still outranks
 * it when the reset would pay, since that is the turn the deck is built for.
 */
export function createOp13ImuThroneMarsModule(): PolicyModule {
  return heuristics("op13-imu-throne-mars", [
    prefer("Play Mars through the Stage while it has a target.")
      .by(WEIGHT.deck)
      .when((t) => t.observation.opponent.board.some((card) => card.cost <= 5))
      .effect((action, t) => {
        if (!isOwnChoice(action, EMPTY_THRONE)) return false;
        if (action.option.kind !== "card") return false;
        if (action.option.card.cardNumber !== "OP13-091") return false;
        const resetReachable = t.observation.self.hand.some(
          (card) => card.cardNumber === FIVE_ELDERS && card.cost <= t.fieldDon,
        );
        return resetReachable && resetPays(t.observation) ? false : 5;
      }),
  ]);
}

/**
 * The card a hand-trash cost gives up.
 *
 * OP13-082's reset, Mars's and Saint Rosward's removal and Saint Shalria's
 * dig each trash a card from hand, and the ladder paid with whichever card
 * was offered first -- as often the finisher as a spent digger. The Leader's
 * draw already pays from {@link KEEP_VALUE}; these costs pay from the same
 * table, cheapest first.
 */
export function createOp13ImuDiscardModule(): PolicyModule {
  return heuristics("op13-imu-discard", [
    preferAmong("Pay a hand-trash cost with the card this deck least wants.")
      .by(WEIGHT.deck)
      .effect((action) => {
        if (action.sourceCardNumber === IMU_LEADER) return false;
        if (action.destination?.zone !== "trash") return false;
        if (action.destination.player !== "self") return false;
        if (!isOptionCardIn(action, "self", "hand")) return false;
        const option = optionCard(action);
        if (!option) return false;
        return 10 - (KEEP_VALUE.get(option.card.cardNumber) ?? 5);
      }),
  ]);
}

/** The K.O. reach of the two removal bodies' optional discards, by base cost. */
const REMOVAL_REACH: ReadonlyMap<string, number> = new Map([
  ["OP13-091", 5],
  ["OP13-095", 3],
]);

/**
 * Mars's and Saint Rosward's [On Play] trash a card from hand for a K.O., and
 * the engine offers the cost whether or not anything is in reach -- the K.O.
 * is "up to". The ladder takes every optional effect it is offered, so the
 * card was paid with nothing to show for it. The trash counts it, but a card
 * is a card; this keeps it while the opponent has no Character the K.O. can
 * name.
 */
export function createOp13ImuIdleRemovalModule(): PolicyModule {
  return heuristics("op13-imu-idle-removal", [
    never("Do not trash a card for a K.O. with nothing in reach.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        const reach = REMOVAL_REACH.get(action.sourceCardNumber);
        if (reach === undefined) return false;
        if (action.option.kind !== "confirm") return false;
        return !t.observation.opponent.board.some((card) => card.cost <= reach);
      }),
  ]);
}
