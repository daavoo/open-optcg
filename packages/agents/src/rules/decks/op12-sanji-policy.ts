/**
 * (Blue/Purple) Sanji's policy, behind the OP12-041 Leader.
 *
 * Twenty-six of the fifty are Events, and the Characters that matter read how
 * many are in the trash: OP12-063 Vinsmoke Reiju, OP12-066 Carne and OP12-065
 * Emporio.Ivankov switch on at four, OP12-070 Sanji grows every five. The
 * Leader pays DON!! −1 to activate a {Straw Hat Crew} Event of base cost 3 or
 * less from hand, and its [When Attacking] adds a rested DON!! back while the
 * field is level or behind.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import { optionCard } from "../generic-policy.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * OP12-071 Charlotte Pudding and OP12-079 "Luffy Is the Man Who Will Be King
 * of the Pirates!!!": the two 1-costs Bandai's write-up opens with, each
 * looking for the Events the trash count is built from. The generic keep
 * reads any card of cost 2 or less, and here that is also Gum-Gum Giant and
 * Concasser -- Counters that start nothing on turn one.
 */
const OPENERS = new Set(["OP12-071", "OP12-079"]);

export function createOp12SanjiMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op12-sanji-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a Charlotte Pudding or OP12-079: a 1-cost that finds the Events the trash count is built from.",
    mulliganBecause:
      "Mulligan a hand with neither Charlotte Pudding nor OP12-079: nothing in it starts filling the trash with Events.",
  });
}

const LEADER = "OP12-041";

/** An opposing Character OP12-060 Boeuf Burst can return to hand. */
const hasBounceTarget = (observation: GameObservation): boolean =>
  observation.opponent.board.some((card) => card.currentCost <= 4);

/** An opposing Character OP09-077 Gum-Gum Lightning can K.O. */
const hasLightningTarget = (observation: GameObservation): boolean =>
  observation.opponent.board.some((card) => card.currentPower <= 6000);

/**
 * What the Leader's free activation is worth spent on each {Straw Hat Crew}
 * Event of base cost 3 or less in the fifty, or 0 where it buys nothing.
 *
 * The activation waives the Event's printed cost, so the 3-costs save the
 * most: OP12-060 Boeuf Burst bounces or draws 2, OP12-078 Brochette Blow draws
 * and shrinks an attacker. OP09-077 Gum-Gum Lightning still pays its own
 * DON!! −2 and K.O.s only up to 1, so with no target it is a card and two
 * DON!! for nothing. OP09-078 Gum-Gum Giant prints only a [Counter], so the
 * Leader cannot activate it at all; OP12-059 Concasser's [Main] is a single
 * draw from a card the deck wants as a Counter.
 */
function eventValue(cardNumber: string, observation: GameObservation): number {
  switch (cardNumber) {
    case "OP12-060":
      return hasBounceTarget(observation) || observation.self.hand.length <= 7
        ? 10
        : 0;
    case "OP12-078":
      return observation.opponent.board.length > 0 ? 9 : 4;
    case "OP09-077":
      return hasLightningTarget(observation) ? 7 : 0;
    case "OP12-079":
      return 3;
    case "OP12-059":
      return 1;
    default:
      return 0;
  }
}

/**
 * Which Event the Leader's DON!! −1 activates.
 *
 * Without a rule the ladder takes the first Event offered, which is hand
 * order: a Gum-Gum Lightning with nothing to K.O. as readily as a Boeuf
 * Burst.
 */
export function createOp12SanjiEventModule(): PolicyModule {
  return heuristics("op12-sanji-event", [
    never("Do not activate an Event that does nothing here.").effect(
      (action, t) => {
        if (action.sourceCardNumber !== LEADER) return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "hand") return false;
        return eventValue(option.card.cardNumber, t.observation) === 0;
      },
    ),
    prefer("Activate the Event whose waived cost is worth the most.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.sourceCardNumber !== LEADER) return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "hand") return false;
        return eventValue(option.card.cardNumber, t.observation);
      }),
  ]);
}

/**
 * The Leader is not activated with no Event in hand worth activating.
 *
 * The DON!! −1 is paid on accepting the clause, before the Event is chosen, so
 * a hand holding only a Gum-Gum Lightning with nothing to K.O. spends a DON!!
 * on nothing.
 */
export function createOp12SanjiGateModule(): PolicyModule {
  return heuristics("op12-sanji-gate", [
    never(
      "Do not activate the Leader without an Event worth a DON!!.",
    ).activate(
      (action, t) =>
        action.sourceCardNumber === LEADER &&
        !t.observation.self.hand.some(
          (card) => eventValue(card.cardNumber, t.observation) > 0,
        ),
    ),
  ]);
}

/**
 * Which half of OP12-060 Boeuf Burst to take.
 *
 * The bullets are a choice, and the ladder takes the first: the bounce, even
 * with nothing on the other side to bounce. A cost-3-or-more Character is
 * tempo worth a card; anything less, or nothing, and the 2 cards are worth
 * more, provided the hand is small enough for the draw to happen.
 */
export function createOp12SanjiBoeufModule(): PolicyModule {
  const worthBouncing = (observation: GameObservation) =>
    observation.opponent.board.some(
      (card) => card.currentCost >= 3 && card.currentCost <= 4,
    );
  return heuristics("op12-sanji-boeuf", [
    prefer("Bounce a 3- or 4-cost; otherwise draw 2.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.sourceCardNumber !== "OP12-060") return false;
        const bounce = worthBouncing(t.observation);
        const canDraw = t.observation.self.hand.length <= 6;
        if (action.optionId === "bounce") return bounce || !canDraw ? 2 : 1;
        if (action.optionId === "draw") return bounce || !canDraw ? 1 : 2;
        return false;
      }),
  ]);
}
