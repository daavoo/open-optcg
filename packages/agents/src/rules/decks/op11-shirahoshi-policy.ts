/**
 * (Green/Yellow) Shirahoshi's policy, behind the OP11-022 Leader.
 *
 * The Leader cannot attack. Once a turn it rests 1 DON!! and turns the top
 * Life card face-up to play a {Neptunian} or [Megalo] from hand with a cost up
 * to the DON!! on the field, so from five DON!! on it is a 5- or 6-cost body
 * for one DON!!, on top of whatever the rest of the DON!! pays for. Its cost
 * needs a face-down top Life card, and the list's other half turns one back:
 * OP11-100 Otohime and OP11-108 Neptune on play, OP11-103 Long-Jaw Neptunian
 * and OP11-107 Topknot Neptunian off an activation. Each of those is a cost
 * that pays for something -- a draw, a K.O., a restand -- and also re-arms the
 * Leader for next turn. OP10-030 Smoker sets a DON!! active, which is the one
 * the Leader just rested.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import { optionCard } from "../generic-policy.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const LEADER = "OP11-022";
const OTOHIME = "OP11-100";
const ZEUS = "OP11-106";

/**
 * The cards in the fifty the Leader can play: the five {Neptunian} Characters
 * and OP11-112 Megalo. Neptune, Jinbe, Shanks, Smoker, Zeus, Otohime and
 * OP11-030 Shirahoshi are not among them and are only ever hard-cast.
 */
const LEADER_PLAYABLE = new Set([
  "OP11-028",
  "OP11-036",
  "OP11-103",
  "OP11-107",
  "OP11-026",
  "OP11-112",
]);

/**
 * The DON!! cards on the field -- the Leader's cost ceiling. Spent and given
 * DON!! still count, which is why the Leader's play is as large at the end of
 * a turn as at the start of it.
 */
const donOnField = (observation: GameObservation): number =>
  observation.self.activeDon +
  observation.self.restedDon +
  observation.self.leader.attachedDon +
  observation.self.board.reduce((sum, card) => sum + card.attachedDon, 0);

/** The top Life card is face-up: what the Leader's cost leaves behind. */
const topLifeFaceUp = (observation: GameObservation): boolean =>
  observation.self.life[0]?.faceUp === true;

/**
 * Is the Leader's activation on offer, with a body in hand it can play? The
 * engine reports the activation `selectsNothing` when no card can land, which
 * covers a face-up top Life card it cannot pay with.
 */
function leaderLineOpen(observation: GameObservation): boolean {
  const offer = observation.legalActions.find(
    (action) =>
      action.type === "activate-main" && action.sourceCardNumber === LEADER,
  );
  if (!offer || (offer.type === "activate-main" && offer.selectsNothing)) {
    return false;
  }
  if (topLifeFaceUp(observation)) return false;
  const ceiling = donOnField(observation);
  return observation.self.hand.some(
    (card) => LEADER_PLAYABLE.has(card.cardNumber) && card.cost <= ceiling,
  );
}

/**
 * The Leader's [Activate: Main] before any hard cast.
 *
 * Its ceiling is the DON!! on the field, not the DON!! left active, so playing
 * it first costs the turn nothing but the one DON!! it rests -- and the ladder
 * plays from hand before it activates, so a turn that opens on a castable
 * {Neptunian} pays full price for the body the Leader would have put down for
 * one, and a turn that spends every active DON!! never offers the Leader at
 * all. Played first, the rest of the DON!! still pays for the hand.
 */
export function createOp11ShirahoshiLeaderModule(): PolicyModule {
  return heuristics("op11-shirahoshi-leader", [
    never(
      "Activate the Leader before hard-casting: it plays a body for one DON!!.",
    )
      .as("leader-first")
      .play((_card, t) => leaderLineOpen(t.observation)),
    prefer("The Leader's activation is the deck's engine.")
      .by(WEIGHT.deck)
      .as("leader-over-other-activations")
      .when((t) => leaderLineOpen(t.observation))
      .activate((action) => action.sourceCardNumber === LEADER),
  ]);
}

/**
 * Which body the Leader plays. It offers every eligible Character in hand
 * order; for one DON!! the largest is the best value, and whatever it leaves
 * in hand is what the rest of the DON!! pays for.
 */
export function createOp11ShirahoshiLeaderPickModule(): PolicyModule {
  return heuristics("op11-shirahoshi-leader-pick", [
    prefer("Play the largest body the Leader can reach.")
      .by(WEIGHT.deck)
      .effect((action) => {
        if (action.sourceCardNumber !== LEADER) return false;
        if (action.destination !== undefined) return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "hand") return false;
        return 1 + (option.card.cost ?? 0);
      }),
  ]);
}

/**
 * OP11-100 Otohime is a 0-power body whose [On Play] draws a card for turning
 * a face-up Life card face-down. With the top Life card face-down the clause
 * cannot be paid, and the card is worth more as the 2000 Counter it prints.
 */
export function createOp11ShirahoshiOtohimeModule(): PolicyModule {
  return heuristics("op11-shirahoshi-otohime", [
    never("Hold Otohime until the Leader has turned a Life card face-up.").play(
      (card, t) => card.cardNumber === OTOHIME && !topLifeFaceUp(t.observation),
    ),
  ]);
}

/**
 * OP11-106 Zeus pays a Life card into hand for a K.O. of a 5-cost or less. The
 * cost sits outside the K.O., so it is offered into a board with no target and
 * paid there buys a card for a Life and nothing else.
 */
export function createOp11ShirahoshiZeusModule(): PolicyModule {
  return heuristics("op11-shirahoshi-zeus", [
    never("Do not pay a Life card to Zeus with nothing to K.O.").effect(
      (action, t) =>
        action.sourceCardNumber === ZEUS &&
        action.optionId === "apply" &&
        !t.observation.opponent.board.some((card) => card.currentCost <= 5),
    ),
  ]);
}

/**
 * The cards a first turn wants: OP11-030 Shirahoshi, which digs for a
 * {Neptunian} every turn it is left standing, and OP11-036 Spotted Neptunian,
 * which digs once on play and is itself a 4-cost body the Leader can play at
 * four DON!!. Bandai's write-up opens the deck on exactly these, because the
 * Leader's play needs a {Neptunian} in hand before it pays.
 */
const OPENERS = new Set(["OP11-030", "OP11-036"]);

export function createOp11ShirahoshiMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op11-shirahoshi-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep OP11-030 Shirahoshi or Spotted Neptunian: each finds the {Neptunian} the Leader plays.",
    mulliganBecause:
      "Mulligan a hand with no Shirahoshi and no Spotted Neptunian: the Leader has nothing to dig for its play.",
  });
}

/**
 * This Leader cannot attack and prints no [DON!! xN] clause, and a given
 * DON!! adds its +1000 only on its owner's turn, so a DON!! attached to it
 * does nothing at all. Left in the cost area it at least stays active for a
 * Counter Event; given to a Character it swings.
 */
export function createOp11ShirahoshiLeaderDonModule(): PolicyModule {
  return heuristics("op11-shirahoshi-leader-don", [
    never("Do not give DON!! to a Leader that cannot attack.").attachDon(
      (action, t) =>
        !t.observation.self.board.some(
          (card) => card.instanceId === action.targetInstanceId,
        ),
    ),
  ]);
}
