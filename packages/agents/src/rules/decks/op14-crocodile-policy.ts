/**
 * (Black) Crocodile's policy, behind the OP14-079 Leader.
 *
 * The Leader's [Activate: Main] K.O.s one of your own {Baroque Works}
 * Characters to give an opposing Character -10 cost, and the fifty is built
 * to be paid for that: nearly every body prints an [On K.O.] or a trash play,
 * and most of the rest read a Character at cost 0. The first turns are spent
 * putting a cheap Baroque Works body on the board so the Leader has something
 * to K.O. from the turn it can start.
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

const LEADER = "OP14-079";
const MR_2 = "OP14-091";
const CROCODILE = "OP14-120";

/**
 * The fifty's 1-cost {Baroque Works} Characters: OP14-083 Ms. Wednesday,
 * OP14-085 Miss.Goldenweek, OP14-087 Miss.Valentine and OP14-088
 * Miss.MerryChristmas. Each is a turn-one play and a K.O. the Leader can spend,
 * and Goldenweek, MerryChristmas and Valentine replace themselves on the way.
 * OP14-099 Disappointed? is a 1-cost too, but an Event puts nothing on the
 * board for the Leader to K.O.
 */
const EARLY_PLAYS = new Set(["OP14-083", "OP14-085", "OP14-087", "OP14-088"]);

export function createOp14CrocodileMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op14-crocodile-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => EARLY_PLAYS.has(card.cardNumber)),
    keepBecause:
      "Keep a 1-cost Baroque Works Character: a turn-one body the Leader can K.O. for its -10 cost.",
    mulliganBecause:
      "Mulligan a hand with no 1-cost Baroque Works Character: the Leader has nothing to K.O. until the 4-costs.",
  });
}

/**
 * What each of the deck's bodies is worth as the Leader's K.O., highest first.
 *
 * The K.O. is a cost, but most of the fifty is printed to be paid with: Mr.2
 * plays a 5-or-less {Baroque Works} body from hand or trash, OP14-120 replays
 * itself for a card from hand and runs its [On Play] again, Goldenweek draws
 * two and MerryChristmas one. Ms. Wednesday and Miss.Valentine are 1-cost
 * bodies whose use is already spent once they are on the field. The rest --
 * Mr.1, Mr.5, Mr.3, Doublefinger, Ms. All Sunday -- are the board the deck
 * attacks and blocks with, and print nothing that fires on K.O.
 */
function fodderValue(cardNumber: string, observation: GameObservation): number {
  switch (cardNumber) {
    case MR_2:
      return mr2HasAPlay(observation) ? 10 : 3;
    case CROCODILE:
      // Its [On K.O.] costs a card from hand.
      return observation.self.hand.length > 0 ? 8 : 0;
    case "OP14-085": // Goldenweek: draw 2, trash 2
      return 7;
    case "OP14-088": // MerryChristmas: draw 1
      return 6;
    case "OP14-083": // Ms. Wednesday
    case "OP14-087": // Miss.Valentine
      return 4;
    default:
      return 0;
  }
}

/** The lowest value a body needs for the Leader to spend it. */
const SPENDABLE = 4;

/**
 * The {Baroque Works} Characters of cost 5 or less Mr.2's [On K.O.] can play.
 * Mr.2 itself is excluded by its own text.
 */
const MR_2_PLAYS = new Set([
  "OP14-083",
  "OP14-085",
  "OP14-086",
  "OP14-087",
  "OP14-088",
  "OP14-090",
  "OP14-092",
  "OP14-094",
]);

const mr2HasAPlay = (observation: GameObservation): boolean =>
  [...observation.self.hand, ...observation.self.trash].some((card) =>
    MR_2_PLAYS.has(card.cardNumber),
  );

/**
 * Which of your own bodies the Leader K.O.s.
 *
 * The ladder took the first one offered, which was board order, and spent the
 * deck's attackers and its only [Blocker] as readily as a body built to be
 * K.O.'d.
 */
export function createOp14CrocodileFodderModule(): PolicyModule {
  return heuristics("op14-crocodile-fodder", [
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
 * Once the "you may" is accepted the K.O. is the cost, so a board of
 * attackers and no body built to be spent turns the -10 into a lost
 * Character. With no
 * opposing Character to drain, only a body whose [On K.O.] pays for itself is
 * worth it.
 */
export function createOp14CrocodileGateModule(): PolicyModule {
  return heuristics("op14-crocodile-gate", [
    never(
      "Do not activate the Leader without a body built to be K.O.'d.",
    ).activate(
      (action, t) =>
        action.sourceCardNumber === LEADER && !worthActivating(t.observation),
    ),
  ]);
}

function worthActivating(observation: GameObservation): boolean {
  const threshold =
    observation.opponent.board.length > 0 ? SPENDABLE : SPENDABLE + 2;
  return observation.self.board.some(
    (card) => fodderValue(card.cardNumber, observation) >= threshold,
  );
}

/**
 * The bodies worth a Counter card to keep, and how much Counter each is worth.
 *
 * The Leader K.O.s one of your own bodies a turn, so the board this deck
 * attacks and blocks with is whatever the opponent has not already taken, and
 * most of the list's 1-costs print a 2000 Counter. OP14-094 Mr.5 is the only
 * [Blocker], OP14-120 Crocodile is the lock and the 8-cost that switches on
 * "cost of 8 or more", and OP14-084 Ms. All Sunday is two bodies' worth of
 * cost: each is worth up to 3000, a 2000 and a 1000 from hand. OP14-090 Mr.1
 * and OP14-086 Doublefinger are 6000 attackers, worth one 2000. The 1-costs
 * are worth nothing here: the Leader spends them anyway.
 */
const DEFEND: ReadonlyMap<string, number> = new Map([
  ["OP14-094", 3000],
  ["OP14-120", 3000],
  ["OP14-084", 3000],
  ["OP14-090", 2000],
  ["OP14-086", 2000],
]);

/**
 * Spend Counter cards to keep the bodies in {@link DEFEND} on the board.
 *
 * The generic Counter step defends only the Characters a deck names, so with
 * none named it let Mr.5 die to a 7000 attacker rather than spend a 2000. A
 * named card is also never spent as a Counter itself, so a Mr.1 or Mr.5 in
 * hand is kept to be played rather than trashed for 1000. The generic step
 * still declines once the damage still coming at the Leader would take its
 * last Life, when every card in hand is owed to the Leader instead.
 */
export function createOp14CrocodileCounterPolicy(): PolicyModule {
  return {
    id: "op14-crocodile-counter",
    decide: ({ observation }): PolicyDecision | undefined =>
      observation.phase === "counter"
        ? chooseGenericCounter(observation, observation.legalActions, {
            protectedCards: new Set(DEFEND.keys()),
            characterDefensePower: (cardNumber) => DEFEND.get(cardNumber) ?? 0,
          })
        : undefined,
  };
}
