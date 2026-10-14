/**
 * (Red/Black) Koby's policy, behind the OP11-001 Leader.
 *
 * The Leader gives every {SWORD} Character [Rush: Character], so each body
 * that lands is a removal attack that same turn -- but only into a rested
 * Character, unless something lets it hit an active one. EB03-008 Hibari
 * (on play and when attacking) and OP11-082 Aramaki (by trashing itself) are
 * that something: each hands one body the right to attack active Characters
 * for the turn. The debuffs -- OP11-008 Doll −6000, OP13-020 Meteor Fist
 * −5000, OP13-007 Ace & Sabo & Luffy −3000, Hibari's −1000 -- shrink the
 * target into reach, and OP11-004 Kujyaku trades itself for +1000 on an
 * attacker. So a turn converts DON!! into bodies, bodies into attacks on
 * Characters, and the attacks into a board the opponent cannot rebuild.
 *
 * The trash is the second resource. OP11-092 Helmeppo trashes a card from
 * hand to draw one and put any {SWORD} body of cost 8 or less back from the
 * trash for the turn -- it attacks, then goes to the bottom of the deck.
 * EB04-047 Helmeppo trashes itself to play a 3-or-less {SWORD} from hand or
 * trash, EB03-041 Kujyaku trades a {Navy} card from hand for two draws, and
 * the Leader's replacement and OP11-097 both spend trash cards. Every one of
 * those costs is paid in cards from hand, so which card pays is a decision
 * the deck makes several times a game.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  optionCard,
  type EffectAction,
  type PolicyDecision,
} from "../generic-policy.js";
import { never, preferAmong, WEIGHT, type Heuristic } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The cards an opening hand wants.
 *
 * The {SWORD} bodies the first turns can afford, each of which uses the
 * Leader's aura on the turn it lands: EB03-008 Hibari (3) lets a body hit an
 * active Character and shrinks the target, EB04-047 Helmeppo (3) is a body
 * that later trades itself for another 3-cost {SWORD}, EB03-041 Kujyaku (4)
 * draws two and grows the small {SWORD} bodies on defence, and PRB02-001 Koby
 * (4) K.O.s a 3000 as it attacks. And the two 1-cost searchers that look for a
 * {Navy} card -- OP11-004 Kujyaku and OP11-099 -- because every one of those
 * bodies is {Navy}.
 *
 * The 1-cost Aramaki, Ripper, Prince Grus and Ace & Sabo & Luffy are left out:
 * each is a support piece that needs a body beside it, and the 6- and 8-cost
 * bodies are too far up the curve to be the reason a hand is kept.
 */
const OPENERS = new Set([
  "EB03-008",
  "EB04-047",
  "EB03-041",
  "PRB02-001",
  "OP11-004",
  "OP11-099",
]);

export function createOp11KobyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op11-koby-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep a 3- or 4-cost {SWORD} body that attacks a Character the turn it lands, or a 1-cost searcher that finds one.",
    mulliganBecause:
      "Mulligan a hand with no early {SWORD} body and no searcher: the Leader's aura has nothing to send at a Character until the top end.",
  });
}

const HIBARI = "EB03-008";
const ARAMAKI = "OP11-082";
const KUJYAKU_SEARCHER = "OP11-004";
const HELMEPPO_REPLAY = "OP11-092";
const DOLL = "OP11-008";

/** The two cards that hand one body the right to attack active Characters. */
const ATTACK_ACTIVE_GRANTS = new Set([HIBARI, ARAMAKI]);

/** One of the viewer's Characters that still has its attack to make. */
const ownAttacker = (observation: GameObservation, instanceId: string) =>
  observation.self.board.find(
    (card) => card.instanceId === instanceId && card.couldAttack,
  );

/**
 * How the grant's candidates rank: a Character with its attack still to come,
 * biggest first, then the Leader, then a body that has already swung.
 */
function grantTargetScore(
  action: EffectAction,
  observation: GameObservation,
): number | false {
  const option = optionCard(action);
  if (option?.owner !== "self") return false;
  if (option.zone === "leader")
    return observation.self.leader.couldAttack ? 1 : -1;
  if (option.zone !== "board") return false;
  const attacker = ownAttacker(observation, option.card.instanceId);
  return attacker ? 10 + attacker.currentPower / 1000 : -1;
}

/**
 * What each card in the fifty is worth kept in hand, lowest first: the order a
 * "trash 1 card from your hand" cost spends them in.
 *
 * The cheapest to lose are the support pieces that do nothing without a body
 * beside them and the Events whose job is a card's worth of digging. The
 * 1-cost Kujyaku is cheap in the trash too, because EB04-047 Helmeppo plays it
 * back from there. The bodies the turn is built on -- Hibari, Doll, the two
 * 6-costs and EB03-041 Kujyaku -- are what the costs are paid to put down.
 */
function keepValue(cardNumber: string): number {
  switch (cardNumber) {
    case "OP11-096": // Ripper
      return 1;
    case "OP11-099": // I'm Gonna Be a Navy Officer!!!
    case "OP11-097": // After All These Years I'm Losing My Edge!!!
      return 2;
    case KUJYAKU_SEARCHER:
    case "OP11-013": // Prince Grus
      return 3;
    case ARAMAKI:
    case "OP13-007": // Ace & Sabo & Luffy
      return 4;
    case "EB04-047": // Helmeppo, 3-cost
    case "PRB02-001": // Koby, 4-cost
      return 5;
    case "OP13-020": // Meteor Fist
    case "EB04-003": // Smoker & Tashigi
      return 6;
    case HIBARI:
    case DOLL:
    case "EB04-044": // Koby, 6-cost
      return 7;
    case HELMEPPO_REPLAY:
    case "EB03-041": // Kujyaku, 4-cost
      return 8;
    default:
      return 5;
  }
}

/**
 * The deck's Main-phase judgements, one addressable module each.
 *
 * - `grant-target`: Hibari's and Aramaki's grant names the Leader first, and a
 *   Leader that may attack an active Character still wants the opposing
 *   Leader. A Character whose attack is still to come -- Hibari herself, with
 *   the Leader's [Rush: Character] -- turns the grant into a removal attack it
 *   could not otherwise declare.
 * - `discard-order`: EB03-041 Kujyaku, OP11-092 Helmeppo and Doll each take a
 *   card from hand, offered in hand order; {@link keepValue} says which.
 * - `boost-target`: OP11-004 Kujyaku's +1000 lasts the turn, so on a body
 *   with no attack left it buys nothing.
 * - `aramaki-gate`: Aramaki trashes itself for a grant only another attacker
 *   can use, and with none left it is a 2000 body thrown away.
 */
export const KOBY_RULES: readonly Heuristic[] = [
  preferAmong(
    "Hand the right to attack active Characters to a Character whose attack is still to come: the Leader's swing belongs on the opposing Leader.",
  )
    .by(WEIGHT.deck)
    .as("grant-target")
    .effect((action, t) => {
      if (!ATTACK_ACTIVE_GRANTS.has(action.sourceCardNumber)) return false;
      if (action.destination !== undefined) return false;
      return grantTargetScore(action, t.observation);
    }),
  preferAmong("Pay a hand cost with the card the plan needs least.")
    .by(WEIGHT.deck)
    .as("discard-order")
    .effect((action) => {
      if (action.destination?.zone !== "trash") return false;
      const option = optionCard(action);
      if (option?.owner !== "self" || option.zone !== "hand") return false;
      return 10 - keepValue(option.card.cardNumber);
    }),
  preferAmong(
    "Put Kujyaku's +1000 on a Character that still attacks this turn.",
  )
    .by(WEIGHT.deck)
    .as("boost-target")
    .effect((action, t) => {
      if (action.sourceCardNumber !== KUJYAKU_SEARCHER) return false;
      if (!action.modifiesPower || action.modifiesPower.amount <= 0)
        return false;
      const option = optionCard(action);
      if (option?.owner !== "self" || option.zone !== "board") return false;
      const attacker = ownAttacker(t.observation, option.card.instanceId);
      return attacker ? 10 + attacker.currentPower / 1000 : -1;
    }),
  never(
    "Keep Aramaki on the board when no other Character still has an attack to aim at an active one.",
  )
    .as("aramaki-gate")
    .activate((action, t) => {
      if (action.sourceCardNumber !== ARAMAKI) return false;
      return !t.observation.self.board.some(
        (card) =>
          card.instanceId !== action.sourceInstanceId && card.couldAttack,
      );
    }),
];

/**
 * The cards the Counter step keeps, and what each body on the board is worth
 * defending.
 *
 * Doll and the two Kobys print a 1000 Counter, and each is worth far more cast:
 * Doll is the −6000 that opens a turn of removal, the 6-cost Koby the biggest
 * {SWORD} body, PRB02-001 the attacker that K.O.s a 3000 as it swings. Naming
 * them spends the 2000 support pieces first. EB03-041 Kujyaku and OP11-092
 * Helmeppo carry no Counter, so they are named only as bodies to save:
 * Kujyaku is the +2000 on every small {SWORD} body through the opponent's
 * turn, and the 6-cost Helmeppo is the body the deck spent a turn on.
 */
const DEFEND: ReadonlyMap<string, number> = new Map([
  ["EB03-041", 2000],
  [HELMEPPO_REPLAY, 2000],
  [DOLL, 0],
  ["EB04-044", 0],
  ["PRB02-001", 0],
]);

/**
 * Spend Counter cards by {@link DEFEND}: save the two bodies worth a card,
 * and pay with the support pieces before the bodies the deck would rather
 * cast. The generic step names no Characters and prices every 1000 Counter
 * alike, so it gave up Kujyaku's aura and spent Doll first in hand order.
 */
export function createOp11KobyCounterPolicy(): PolicyModule {
  return {
    id: "op11-koby-counter",
    decide: ({ observation }): PolicyDecision | undefined =>
      observation.phase === "counter"
        ? chooseGenericCounter(observation, observation.legalActions, {
            protectedCards: new Set(DEFEND.keys()),
            characterDefensePower: (cardNumber) => DEFEND.get(cardNumber) ?? 0,
          })
        : undefined,
  };
}
