/**
 * (Purple) Donquixote Doflamingo's policy, behind the OP14-060 Leader.
 *
 * The Leader's [On Your Opponent's Attack] spends one DON!! to move an attack
 * onto the Leader or a {Donquixote Pirates} Character, so the deck defends on
 * DON!! rather than on cards, and the rest of the list pays that DON!! back:
 * three 4- and 5-cost bodies add one on play, OP14-071 Pica adds one at the
 * end of each turn, and the [On K.O.] bodies the redirect lands on return it
 * when they fall.
 */
import type { LegalAction } from "@one-piece-sim/protocol";
import { heuristics, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { Tactics } from "../tactics.js";

/**
 * The turn-one plays that find the rest: OP14-067 Dellinger and OP10-065
 * Sugar dig five for a {Donquixote Pirates} card, and OP10-078 looks at three.
 */
const OPENERS = new Set(["OP14-067", "OP10-065", "OP10-078"]);

/**
 * The bodies that give back the DON!! the Leader spends: OP14-063 Sugar,
 * OP14-072 Baby 5 and OP14-074 Monet add one active on play, and OP14-071 Pica
 * adds one at the end of each turn.
 */
const DON_BODIES = new Set(["OP14-063", "OP14-072", "OP14-074", "OP14-071"]);

export function createOp14DoflamingoMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op14-doflamingo-mulligan",
    keep: (observation) => {
      const hand = observation.self.hand;
      return (
        hand.some((card) => OPENERS.has(card.cardNumber)) &&
        hand.some((card) => DON_BODIES.has(card.cardNumber))
      );
    },
    keepBecause:
      "Keep a 1-cost digger and a body that adds DON!!: the Leader spends a DON!! on every redirect, and the curve has to give it back.",
    mulliganBecause:
      "Mulligan a hand missing a 1-cost digger or a body that adds DON!!: the Leader's redirect runs the DON!! count down with nothing to refill it.",
  });
}

const LEADER = "OP14-060";

/**
 * The bodies whose [On K.O.] pays the redirect back: Dellinger and Monet add
 * DON!! to replace the one the Leader spent and dig or draw, Baby 5 adds a
 * Life card, and OP14-063 Sugar plays a {Donquixote Pirates} Character from
 * hand.
 */
const PAYOFF_ON_KO = new Set(["OP14-067", "OP14-074", "OP14-072", "OP14-063"]);

/**
 * One scale for where an attack lands, used both to decide whether to pay and
 * to pick the target, so the target the DON!! was paid for is the one named.
 *
 * A body the attack cannot beat leads it: the attack is simply lost. A payoff
 * body that dies comes next -- the opponent's attack buys the deck a DON!! and
 * a card. The Leader is worth moving an attack onto only to save a body, and
 * never with no Life left to take the hit.
 */
const SURVIVES = 5;
const PAYOFF_DIES = 4;

interface RedirectTarget {
  cardNumber: string;
  currentPower: number;
  isLeader: boolean;
}

function targetValue(
  target: RedirectTarget,
  attackPower: number,
  selfLife: number,
): number {
  if (target.isLeader) {
    if (attackPower < target.currentPower) return SURVIVES;
    return selfLife >= 2 ? 2 : selfLife === 1 ? 0 : -10;
  }
  if (attackPower < target.currentPower) return SURVIVES;
  return PAYOFF_ON_KO.has(target.cardNumber) ? PAYOFF_DIES : 0;
}

/**
 * Whether to pay, and where to point the attack.
 *
 * Both steps arrive as a `resolve-effect` sourced from OP14-060. Left to the
 * generic ladder, which takes the first option offered, the seat paid a DON!!
 * on every attack and moved it onto whatever was listed first -- often a body
 * the attack kills for nothing, or the Leader in place of a body that would
 * have survived.
 */
function scoreRedirect(action: LegalAction, t: Tactics): number | undefined {
  if (action.type !== "resolve-effect" || action.sourceCardNumber !== LEADER) {
    return undefined;
  }
  const battle = t.observation.activeBattle;
  if (!battle) return undefined;

  if (action.option.kind === "skip" || action.option.kind === "confirm") {
    const paying = action.option.kind === "confirm";
    const candidates: (RedirectTarget & { instanceId: string })[] = [
      {
        instanceId: `${t.observation.viewer}-leader`,
        cardNumber: t.observation.self.leader.cardNumber,
        currentPower: t.observation.self.leader.currentPower,
        isLeader: true,
      },
      // Every Character in the fifty is {Donquixote Pirates}, so every body on
      // the board is one the Leader can name.
      ...t.observation.self.board.map((card) => ({
        instanceId: card.instanceId,
        cardNumber: card.cardNumber,
        currentPower: card.currentPower,
        isLeader: false,
      })),
    ];
    const current = candidates.find(
      (target) => target.instanceId === battle.targetInstanceId,
    );
    const staying = current
      ? targetValue(current, battle.attackPower, t.selfLife)
      : 0;
    const best = candidates
      .filter((target) => target.instanceId !== battle.targetInstanceId)
      .reduce(
        (top, target) =>
          Math.max(top, targetValue(target, battle.attackPower, t.selfLife)),
        -Infinity,
      );
    // An attack that already fails needs no answer. Otherwise a DON!! buys a
    // better landing only when there is one worth it: a body that survives,
    // a payoff body, or anything at all in place of a lethal hit.
    const connects = battle.attackPower >= battle.targetPower;
    const worthIt =
      connects && best > staying && (best >= PAYOFF_DIES || staying < 0);
    return paying === worthIt ? 1 : 0;
  }

  if (action.option.kind !== "card") return undefined;
  const { card, zone } = action.option;
  return (
    10 +
    targetValue(
      {
        cardNumber: card.cardNumber,
        currentPower: action.option.currentPower ?? 0,
        isLeader: zone === "leader",
      },
      battle.attackPower,
      t.selfLife,
    )
  );
}

/**
 * OP14-060's redirect: pay only for an attack that connects, and land it on a
 * body it cannot beat or one whose [On K.O.] pays the DON!! back.
 */
export function createOp14DoflamingoRedirectModule(): PolicyModule {
  return heuristics("op14-doflamingo-redirect", [
    prefer(
      "Redirect only attacks that connect, onto a body the attack cannot beat or one whose [On K.O.] pays the DON!! back.",
    )
      .by(WEIGHT.deck)
      .action((action, t) => scoreRedirect(action, t) ?? false),
  ]);
}

/**
 * The order the deck trashes cards from hand in, first spent first -- the one
 * trash in the fifty is OP14-074 Monet's [On K.O.] "draw 2 and trash 1".
 *
 * Monet is K.O.'d on the opponent's turn more often than not, since it is the
 * redirect's favourite landing, so the card kept is the one that defends or
 * wins from here. The searchers go first -- by the time Monet falls they have
 * done their job -- then the cheap bodies, then Counter cards by the Counter
 * they print. Ever White is the only +3000, and the two Doflamingos, with no
 * Counter at all, are the mid-game and the finisher.
 */
export const OP14_DOFLAMINGO_TRASH_ORDER: readonly (readonly string[])[] = [
  ["OP10-078", "OP10-065"],
  ["OP14-067"],
  ["OP14-061"],
  ["OP14-063", "OP14-072"],
  ["OP14-071", "OP14-068", "OP14-073"],
  ["OP14-074"],
  ["OP14-076"],
  ["OP10-071"],
  ["OP14-069"],
];

const FINISHER = "OP14-069";

/**
 * OP14-069's choice: K.O. one Character of cost 8 or less, or keep up to
 * three of cost 7 or less from resting through the opponent's next turn.
 *
 * A Character that cannot rest cannot attack, so the lock takes three attacks
 * off the turn the Leader has to redirect, where the K.O. takes one body off
 * the board for good. The lock is the better answer when it holds three
 * attackers, or when nothing is in reach of the K.O.; otherwise the K.O. The
 * ladder took the first branch offered, which is the K.O., every time.
 */
function finisherMode(action: LegalAction, t: Tactics): number | undefined {
  if (
    action.type !== "resolve-effect" ||
    action.sourceCardNumber !== FINISHER ||
    action.option.kind !== "mode"
  ) {
    return undefined;
  }
  const board = t.observation.opponent.board;
  const lockable = board.filter((card) => card.currentCost <= 7).length;
  const koable = board.filter((card) => card.currentCost <= 8).length;
  const lock = lockable >= 3 || (koable === 0 && lockable > 0);
  return (action.option.mode === "lock") === lock ? 1 : 0;
}

export function createOp14DoflamingoFinisherModule(): PolicyModule {
  return heuristics("op14-doflamingo-finisher", [
    prefer(
      "Lock three attackers with OP14-069 rather than K.O. one; K.O. otherwise.",
    )
      .by(WEIGHT.deck)
      .action((action, t) => finisherMode(action, t) ?? false),
  ]);
}
