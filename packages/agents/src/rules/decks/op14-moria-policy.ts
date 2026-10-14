/**
 * (Black/Yellow) Gecko Moria's policy, behind the OP14-080 Leader.
 *
 * Ten of the fourteen slots print a [Trigger] that plays a 4-or-less
 * {Thriller Bark Pirates} Character back from the trash, so the deck wants its
 * trash full of them before the opponent starts taking Life. The Leader's
 * [Activate: Main] K.O.s one of your own {Thriller Bark Pirates} Characters for
 * +1000 across the board, and most of the cheap bodies print an [On K.O.] that
 * pays for being that cost.
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

const LEADER = "OP14-080";
const HOGBACK = "OP14-110";
const PERONA = "OP14-111";

/**
 * The cards that start the trash on turns one and two: OP14-097 Hurry Up and
 * Make Me the Pirate King! keeps one card of three and trashes the other two,
 * and OP14-081 Spider Mice mills three. Bandai's write-up opens the deck on
 * exactly these, because every [Trigger] in the list is dead until the trash
 * holds a body to play.
 */
const TRASH_STARTERS = new Set(["OP14-097", "OP14-081"]);

export function createOp14MoriaMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op14-moria-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => TRASH_STARTERS.has(card.cardNumber)),
    keepBecause:
      "Keep Hurry Up or Spider Mice: the first turns fill the trash the [Trigger]s play from.",
    mulliganBecause:
      "Mulligan a hand with no Hurry Up or Spider Mice: the [Trigger]s have nothing in the trash to play.",
  });
}

/**
 * The 4-or-less [Trigger] Characters Dr. Hogback's [On K.O.] can play from the
 * trash. Hogback itself is excluded by its own text, and Spider Mice prints no
 * [Trigger].
 */
const HOGBACK_PLAYS = new Set([
  "OP14-089",
  "OP14-100",
  "OP14-102",
  "OP14-109",
  "OP14-111",
]);

const hogbackHasAPlay = (observation: GameObservation): boolean =>
  observation.self.trash.some((card) => HOGBACK_PLAYS.has(card.cardNumber));

/** An opposing Character Perona's [On K.O.] can stop from attacking. */
const peronaHasATarget = (observation: GameObservation): boolean =>
  observation.opponent.board.some((card) => card.cost <= 6);

/**
 * What each of the deck's {Thriller Bark Pirates} bodies is worth as the
 * Leader's K.O., highest first.
 *
 * Hogback replaces itself with a body from the trash, so the board does not
 * shrink; Perona stops a second attacker; Ryuma and Absalom dig on the way
 * out. Spider Mice and Kumacy have already done what they do once they are on
 * the field. Victoria Cindry is the list's only 3-cost [Blocker], and the two
 * Gecko Morias are the 7000 and 10000 bodies the deck attacks with.
 */
function fodderValue(cardNumber: string, observation: GameObservation): number {
  switch (cardNumber) {
    case HOGBACK:
      return hogbackHasAPlay(observation) ? 10 : 3;
    case PERONA:
      return peronaHasATarget(observation) ? 8 : 3;
    case "OP14-089": // Ryuma: draw 2, trash 2
    case "OP14-100": // Absalom: look at 3, add a Thriller Bark card
      return 6;
    case "OP14-081": // Spider Mice
      return 5;
    case "OP14-102": // Kumacy
      return 4;
    case "OP14-109": // Victoria Cindry
      return 1;
    default:
      return 0;
  }
}

/** The lowest value a body needs for the Leader to spend it. */
const SPENDABLE = 4;

/**
 * Which of your own bodies the Leader K.O.s.
 *
 * Without a rule the ladder takes the first body offered, which is board
 * order, and spends a Gecko Moria or the [Blocker] as readily as a Hogback
 * whose [On K.O.] puts a body straight back.
 */
export function createOp14MoriaFodderModule(): PolicyModule {
  return heuristics("op14-moria-fodder", [
    prefer("K.O. the body whose [On K.O.] pays for it.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.sourceCardNumber !== LEADER) return false;
        if (action.effectKind !== "mechanic-choice") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "board") return false;
        return 1 + fodderValue(option.card.cardNumber, t.observation);
      }),
  ]);
}

/**
 * The Leader is not activated with nothing on the board worth K.O.ing.
 *
 * Once the "you may" is accepted the K.O. is the cost, and +1000 for one turn
 * does not buy back a Character that prints nothing on its way out.
 */
export function createOp14MoriaGateModule(): PolicyModule {
  return heuristics("op14-moria-gate", [
    never(
      "Do not activate the Leader without a body built to be K.O.'d.",
    ).activate(
      (action, t) =>
        action.sourceCardNumber === LEADER &&
        !t.observation.self.board.some(
          (card) => fodderValue(card.cardNumber, t.observation) >= SPENDABLE,
        ),
    ),
  ]);
}

/**
 * Every {Thriller Bark Pirates} Character of cost 4 or less in the fifty: what
 * the list's shared [Trigger] plays back from the trash. The [Trigger] asks
 * for the type and the cost only, so Spider Mice counts though it prints no
 * [Trigger] of its own.
 */
const REVIVABLE = new Set([
  "OP14-081",
  "OP14-089",
  "OP14-100",
  "OP14-102",
  "OP14-109",
  "OP14-110",
  "OP14-111",
]);

const trashHasARevival = (observation: GameObservation): boolean =>
  observation.self.trash.some((card) => REVIVABLE.has(card.cardNumber));

/**
 * The Leader's [When Attacking] is three cards from hand for one Life card.
 *
 * Bandai's write-up spends it on the turns the trash holds nothing for the
 * [Trigger]s to play: then the three cards are the fuel and the banked Life is
 * one more [Trigger] to flip. Once a body is already in the trash, the same
 * three cards buy only the Life card, and a hand is what pays for the Counter
 * step and the Gecko Morias. Read while the attack is being declared, which
 * is what tells it apart from the Leader's [Activate: Main] -- both are an
 * optional clause on the same card.
 */
export function createOp14MoriaBankModule(): PolicyModule {
  return heuristics("op14-moria-bank", [
    never("Do not pitch three cards for a Life card the trash does not need.")
      .when((t) => t.observation.activeBattle !== null)
      .effect(
        (action, t) =>
          action.sourceCardNumber === LEADER &&
          action.optionId === "apply" &&
          trashHasARevival(t.observation),
      ),
  ]);
}

/**
 * The cards in the fifty that play a Character back from the trash: the
 * shared [Trigger] on nine of them, Dr. Hogback's [On K.O.], and both Gecko
 * Morias' [On Play]s.
 */
const REVIVERS = new Set([...REVIVABLE, "OP14-104", "OP14-117", "PRB02-013"]);

/**
 * What each body is worth played back out of the trash, highest first.
 *
 * Perona's [On Play] runs on the way back, so on the opponent's turn a
 * [Trigger] that plays her stops a second attacker in the same turn. Hogback
 * on the field is a body that replaces itself when K.O.'d. Ryuma and Absalom
 * are the 5000s; Spider Mice's [On Play] mills three more fuel; Kumacy is a
 * 2000 and Victoria Cindry, arriving rested, cannot block until it refreshes.
 */
function revivalValue(
  cardNumber: string,
  observation: GameObservation,
): number {
  switch (cardNumber) {
    case PERONA:
      return peronaHasATarget(observation) ? 10 : 4;
    case HOGBACK:
      return 8;
    case "OP14-089":
    case "OP14-100":
      return 6;
    case "OP14-109":
      return 5;
    case "OP14-081":
      return 4;
    case "OP14-102":
      return 3;
    default:
      return 2;
  }
}

/** Which body a [Trigger], Hogback or a Gecko Moria plays from the trash. */
export function createOp14MoriaRevivalModule(): PolicyModule {
  return heuristics("op14-moria-revival", [
    prefer("Play back the body whose arrival or departure does something.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (!REVIVERS.has(action.sourceCardNumber)) return false;
        if (action.effectKind !== "mechanic-choice") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "trash") return false;
        return revivalValue(option.card.cardNumber, t.observation);
      }),
  ]);
}

/**
 * The bodies worth a Counter card to keep, and how much Counter each is worth.
 *
 * Every 4-or-less {Thriller Bark Pirates} Character comes back off the next
 * [Trigger] or Gecko Moria, so losing one costs a turn, not a card. The two
 * Gecko Morias and Sabo do not come back: nothing in the list plays a
 * 6-cost or larger from the trash. OP14-104 is the 10000 that closes, worth a
 * 2000 and a 1000; PRB02-013 and Sabo, the [Blocker], are worth one 2000.
 */
const DEFEND: ReadonlyMap<string, number> = new Map([
  ["OP14-104", 3000],
  ["PRB02-013", 2000],
  ["PRB02-014", 2000],
]);

/**
 * Spend Counter cards to keep the bodies in {@link DEFEND} on the board.
 *
 * The generic Counter step defends only the Characters a deck names. The
 * generic step still declines once the damage still coming at the Leader
 * would take its last Life, when every card in hand is owed to the Leader.
 */
export function createOp14MoriaCounterPolicy(): PolicyModule {
  return {
    id: "op14-moria-counter",
    decide: ({ observation }): PolicyDecision | undefined =>
      observation.phase === "counter"
        ? chooseGenericCounter(observation, observation.legalActions, {
            protectedCards: new Set(DEFEND.keys()),
            characterDefensePower: (cardNumber) => DEFEND.get(cardNumber) ?? 0,
          })
        : undefined,
  };
}
