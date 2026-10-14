/**
 * (Black) Yamato's policy, behind the OP16-079 Leader.
 *
 * The Leader's only clause gives a {Land of Wano} Character played from the
 * trash [Rush] for the turn, so the deck's opening turns are spent filling the
 * trash and its middle turns playing 8-cost bodies back out of it. The cards
 * that start that are the cheap diggers -- OP16-091 Nami, OP16-092 Nico Robin,
 * OP16-082 Kin'emon -- and OP16-098, the 6-cost Yamato that trashes itself for
 * an 8-cost one.
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

const SWAP_YAMATO = "OP16-098";
/** The two black 8-cost [Yamato] OP16-098's activation can play. */
const EIGHT_COST_YAMATOS = new Set(["OP16-096", "OP16-097"]);

/**
 * The cards that fill the trash on the turns before the recursion starts, and
 * the 6-cost the recursion is built around.
 */
const OPENERS = new Set([
  "OP16-091", // Nami: looks at 4, trashes what it passes
  "OP16-092", // Nico Robin: pitches an 8-cost to draw 2
  "OP16-082", // Kin'emon: looks at 5, trashes what it passes
  "OP16-098", // Yamato: draws and trashes, then swaps for an 8-cost
]);

/**
 * Keep a hand that can start filling the trash.
 *
 * Every payoff in the fifty reads the trash: an 8-cost Yamato has to be there
 * before OP16-098 can play it, and OP16-085 and OP16-099 have nothing to play
 * back without a {Land of Wano} body already in it.
 */
export function createOp16YamatoMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op16-yamato-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a digger or OP16-098 Yamato: every payoff in the deck plays a card back out of the trash.",
    mulliganBecause:
      "Mulligan a hand with no digger and no OP16-098: the trash stays empty and the Leader's [Rush] has nothing to reach.",
  });
}

/**
 * OP16-098's swap waits for the 6-cost's own attack.
 *
 * Its cost is trashing itself, which a rested body pays as well as an active
 * one, so swapping before the 6-cost attacks throws that attack away for
 * nothing: the 8-cost it plays gets [Rush] off the Leader either way. The
 * generic ladder takes activations before attacks, so it swapped first.
 */
export function createOp16YamatoSwapModule(): PolicyModule {
  return heuristics("op16-yamato-swap", [
    never(
      "Attack with OP16-098 before trashing it for an 8-cost Yamato.",
    ).activate(
      (action, t) =>
        action.sourceCardNumber === SWAP_YAMATO &&
        t.couldAttack(action.sourceInstanceId),
    ),
  ]);
}

const eightCostInTrash = (observation: GameObservation): boolean =>
  observation.self.trash.some((card) =>
    EIGHT_COST_YAMATOS.has(card.cardNumber),
  );

/**
 * OP16-098's [On Play] trashes an 8-cost Yamato when the trash has none.
 *
 * "Draw 1 card and trash 1 card from your hand" is the deck's own way of
 * setting up the swap, and the card trashed was left to hand order. An 8-cost
 * in the trash is what the same body's [Activate: Main] plays with [Rush]; in
 * hand it is a card that arrives without it.
 */
export function createOp16YamatoSetupModule(): PolicyModule {
  return heuristics("op16-yamato-setup", [
    prefer("Trash an 8-cost Yamato for OP16-098 to swap into.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.sourceCardNumber !== SWAP_YAMATO) return false;
        if (action.effectKind !== "mechanic-choice") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "hand") return false;
        return EIGHT_COST_YAMATOS.has(option.card.cardNumber) &&
          !eightCostInTrash(t.observation)
          ? 1
          : false;
      }),
  ]);
}

/**
 * An 8-cost Yamato is not cast from hand while OP16-098 can play it instead.
 *
 * Cast from hand it arrives without [Rush], so it attacks a turn later than
 * the same card swapped in off OP16-098 out of the trash, and it costs the
 * whole turn's DON!! to do it. Held while an OP16-098 is on the board or in
 * hand, which is when the trash route is open.
 */
export function createOp16YamatoHoldEightModule(): PolicyModule {
  return heuristics("op16-yamato-hold-eight", [
    never(
      "Do not cast an 8-cost Yamato from hand while OP16-098 can play one out of the trash with [Rush].",
    ).play(
      (card, t) =>
        EIGHT_COST_YAMATOS.has(card.cardNumber) &&
        (t.observation.self.board.some(
          (body) => body.cardNumber === SWAP_YAMATO,
        ) ||
          t.observation.self.hand.some(
            (held) => held.cardNumber === SWAP_YAMATO,
          )),
    ),
  ]);
}

const KINEMON = "OP16-082";
const SMALL_MOMONOSUKE = "OP16-084";
/** The cards that play a {Land of Wano} body out of the trash. */
const REVIVERS = new Set(["OP16-085", "OP16-099"]);
const RECOVER_YAMATO = "OP16-097";
/** The two diggers whose unpicked cards go to the trash. */
const DIGGERS = new Set(["OP16-091", "OP16-082"]);

const holds = (observation: GameObservation, cardNumber: string): boolean =>
  observation.self.hand.some((card) => card.cardNumber === cardNumber);

/**
 * The body a trash play should bring back.
 *
 * Whatever comes out of the trash arrives with [Rush], so the pick is the
 * best attacker -- and OP16-098 first of all: it attacks, then trashes itself
 * for an 8-cost Yamato that attacks again. After it, the two bodies that swing
 * for 5000 or more; the 1- and 2-cost diggers last, since their [On Play] is
 * the most they add.
 */
export function createOp16YamatoReviveModule(): PolicyModule {
  return heuristics("op16-yamato-revive", [
    prefer("Play OP16-098 back out of the trash, else the biggest attacker.")
      .by(WEIGHT.deck)
      .effect((action) => {
        if (!REVIVERS.has(action.sourceCardNumber)) return false;
        if (action.effectKind !== "mechanic-choice") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "trash") return false;
        if (option.card.cardNumber === SWAP_YAMATO) return 20;
        return 1 + (option.card.power ?? 0) / 1000;
      }),
  ]);
}

/**
 * What OP16-097 takes back to hand.
 *
 * The recovered card is one the deck plays from hand next, so it is the one
 * that restarts a combo: OP16-098 while the hand has none, then OP16-084 for
 * the Momonosuke swap, then Kin'emon's dig. The small bodies are what it plays
 * beside itself in the same resolution, not what it should spend the recovery
 * on.
 */
export function createOp16YamatoRecoverModule(): PolicyModule {
  return heuristics("op16-yamato-recover", [
    prefer("Recover OP16-098, else OP16-084, else Kin'emon.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.sourceCardNumber !== RECOVER_YAMATO) return false;
        if (action.effectKind !== "mechanic-choice") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "trash") return false;
        const cardNumber = option.card.cardNumber;
        if (cardNumber === SWAP_YAMATO && !holds(t.observation, SWAP_YAMATO)) {
          return 10;
        }
        if (cardNumber === SMALL_MOMONOSUKE) return 6;
        if (cardNumber === KINEMON) return 5;
        return 1 + (option.card.power ?? 0) / 10000;
      }),
  ]);
}

/**
 * What Nami and Kin'emon add from the cards they look at.
 *
 * Everything not picked is trashed, which is where an 8-cost Yamato is worth
 * the most: OP16-098 plays it from there with [Rush]. So the pick is OP16-098
 * while the hand has none, and an 8-cost Yamato is the last thing to take.
 */
export function createOp16YamatoDigModule(): PolicyModule {
  return heuristics("op16-yamato-dig", [
    prefer("Dig for OP16-098 and leave the 8-cost Yamatos to be trashed.")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (!DIGGERS.has(action.sourceCardNumber)) return false;
        if (action.effectKind !== "mechanic-choice") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "deck") return false;
        const cardNumber = option.card.cardNumber;
        if (cardNumber === SWAP_YAMATO) {
          return holds(t.observation, SWAP_YAMATO) ? 3 : 10;
        }
        if (EIGHT_COST_YAMATOS.has(cardNumber)) return 1;
        return 2;
      }),
  ]);
}

/**
 * OP16-098 is not spent as a 1000 Counter.
 *
 * It is the card every line in the deck runs through: it swaps into an
 * 8-cost Yamato with [Rush], and OP16-085 and OP16-099 play it back. Spent
 * from hand as Counter it is one ordinary 1000, and the deck has other cards
 * that are only that.
 */
export function createOp16YamatoCounterPolicy(): PolicyModule {
  return {
    id: "op16-yamato-counter",
    decide: ({ observation }): PolicyDecision | undefined =>
      observation.phase === "counter"
        ? chooseGenericCounter(observation, observation.legalActions, {
            protectedCards: new Set([SWAP_YAMATO]),
          })
        : undefined,
  };
}
