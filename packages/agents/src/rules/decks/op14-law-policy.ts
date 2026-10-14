/**
 * (Red) Trafalgar Law's policy, behind the OP14-001 Leader.
 *
 * The Leader's [Activate: Main] swaps the base power of two of your
 * {Supernovas} or {Heart Pirates} Characters for the turn, once a turn. Every
 * Character in this fifty has one of the two types, so the swap is always
 * offered with two bodies out. It is only worth making when it adds an
 * attack: a small body that can still attack takes a big body's base while the
 * big one cannot swing anyway -- played this turn without [Rush], or already
 * rested from its own attack.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import { optionCard } from "../generic-policy.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const LAW_LEADER = "OP14-001";
const UROUGE = "OP14-002";
const CAVENDISH = "OP14-004";
const RUSH_LAW = "OP14-009";

type BoardCard = GameObservation["self"]["board"][number];

/**
 * The power a Leader is usually defended at. A swap that leaves the attacker
 * below it lends power no attack on a Leader can use.
 */
const LEADER_LINE = 5000;

/**
 * Urouge's and Cavendish's printed gate: at 5000 power or more, Urouge's
 * attack draws and K.O.s, and Cavendish gains [Rush].
 */
const PAYOFF_LINE = 5000;

interface Swap {
  /** The body that attacks with the borrowed base power. */
  ready: string;
  /** The body lending it, whose own attack is spent or not open this turn. */
  idle: string;
  gain: number;
}

/**
 * The swap that adds the most to this turn's attacks, if any does.
 *
 * `power` is the printed, and so base, power: the Leader's swap is once a turn
 * and is the only thing in the deck that moves base power on its own turn, so
 * at the decision the two are the same. The swap lasts "during this turn", so
 * the idle body's lower base costs nothing on the opponent's turn -- the only
 * price is the attack the ready body would have made at its own power, which
 * `gain` already nets out.
 */
function bestSwap(board: readonly BoardCard[]): Swap | undefined {
  let best: Swap | undefined;
  for (const idle of board) {
    if (idle.couldAttack) continue;
    for (const ready of board) {
      if (ready.instanceId === idle.instanceId || ready.rested) continue;
      const borrowed = ready.currentPower - ready.power + idle.power;
      // A Cavendish played this turn cannot attack at its own 2000; lent 5000
      // or more it gains [Rush], so the whole borrowed power is new.
      const rushes =
        ready.cardNumber === CAVENDISH &&
        ready.summoningSick === true &&
        borrowed >= PAYOFF_LINE;
      if (!ready.couldAttack && !rushes) continue;
      if (borrowed < LEADER_LINE) continue;
      let gain = rushes ? borrowed : idle.power - ready.power;
      if (
        ready.cardNumber === UROUGE &&
        ready.currentPower < PAYOFF_LINE &&
        borrowed >= PAYOFF_LINE
      ) {
        gain += PAYOFF_LINE;
      }
      if (gain > 0 && (!best || gain > best.gain)) {
        best = { ready: ready.instanceId, idle: idle.instanceId, gain };
      }
    }
  }
  return best;
}

/**
 * The fifty's Characters of cost 2 or less: the first swap partners, and
 * what OP14-014 Kid and OP14-010 Hawkins put out. The generic keep counts
 * OP14-018 too, a [Counter] Event that plays no body.
 */
const CHEAP_BODIES = new Set([
  "OP14-003",
  "OP14-005",
  "OP14-010",
  "OP14-013",
  "OP14-004",
  "OP14-011",
]);

export function createOp14LawMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op14-law-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => CHEAP_BODIES.has(card.cardNumber)),
    keepBecause:
      "Keep a Character of cost 2 or less: the Leader's swap needs two of your Characters on the board.",
    mulliganBecause:
      "Mulligan a hand with no Character of cost 2 or less: the Leader has nothing to swap for turns.",
  });
}

/**
 * The Leader's swap, and which two bodies it swaps.
 *
 * Offered whenever two Characters are out, and the ladder took it at the
 * first chance on whichever two bodies were offered first -- most often two
 * that could both still attack, which moves power between two attacks
 * without adding any, or away from the one about to swing. Gated here on a
 * swap that lends an idle body's base to one that can still attack, and
 * aimed at the pair that adds the most.
 */
export function createOp14LawSwapModule(): PolicyModule {
  return heuristics("op14-law-swap", [
    never(
      "Hold the Leader's swap until a body that cannot attack can lend its power to one that can.",
    )
      .by(WEIGHT.deck)
      .as("swap-gate")
      .activate(
        (action, t) =>
          action.sourceCardNumber === LAW_LEADER &&
          bestSwap(t.observation.self.board) === undefined,
      ),
    prefer(
      "Swap the idle heavy hitter's base power onto the body that can still attack.",
    )
      .by(WEIGHT.deck)
      .as("swap-pair")
      .effect((action, t) => {
        if (action.sourceCardNumber !== LAW_LEADER) return false;
        if (action.effectKind !== "mechanic-choice") return false;
        const option = optionCard(action);
        if (option?.owner !== "self") return false;
        const swap = bestSwap(t.observation.self.board);
        if (!swap) return false;
        if (option.card.instanceId === swap.ready) return 2;
        if (option.card.instanceId === swap.idle) return 1;
        return false;
      }),
  ]);
}

/**
 * OP14-009 Law's [On Your Opponent's Attack] trashes two cards from hand to
 * swap his 10000 base onto the Leader for one battle. The Life card that
 * attack would take goes to hand, so above one Life the swap pays two cards
 * to refuse one; at one Life or none it refuses the hit that ends the game or
 * leaves the next one lethal. The Character it swaps with is any of yours,
 * so the one lent is the largest base on the board, not Law by default.
 */
export function createOp14LawGuardModule(): PolicyModule {
  return heuristics("op14-law-guard", [
    never("Do not trash two cards for Law's swap above one Life.")
      .by(WEIGHT.deck)
      .as("guard-life")
      .effect(
        (action, t) =>
          action.sourceCardNumber === RUSH_LAW &&
          action.option.kind === "confirm" &&
          action.option.choice === "apply" &&
          t.observation.self.lifeCount > 1,
      ),
    prefer("Lend the Leader the biggest base power on the board.")
      .by(WEIGHT.deck)
      .as("guard-target")
      .effect((action) => {
        if (action.sourceCardNumber !== RUSH_LAW) return false;
        if (action.effectKind !== "mechanic-choice") return false;
        const option = optionCard(action);
        if (option?.owner !== "self" || option.zone !== "board") return false;
        return option.card.category === "character"
          ? 1 + (option.card.power ?? 0) / 1000
          : false;
      }),
  ]);
}
