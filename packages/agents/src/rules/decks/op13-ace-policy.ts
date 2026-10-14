/**
 * (Red/Blue) Portgas.D.Ace's policy, behind the OP13-002 Leader.
 *
 * A 3-Life Leader whose [DON!! x1] draws a card the first time each turn it
 * takes damage or loses a 6000-base Character, and whose [On Your Opponent's
 * Attack] trashes a card from hand to take 2000 off the attacker for the
 * battle. The list digs with OP13-016 Garp and draws with OP13-043 Otama and
 * OP13-054 Yamato, both of which read the 3-or-less Life the Leader starts at.
 *
 * `pnpm census` reads the Leader's debuff as the deck's largest unruled
 * surface: every `block:resolve-effect` the seat is asked is that clause, and
 * the generic ladder takes every optional it is offered and pays it with the
 * first card in hand. The rules below are about that clause.
 */
import { isOptionCardIn, optionCard } from "../generic-policy.js";
import { never, prefer, WEIGHT, type Heuristic } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { Tactics } from "../tactics.js";

const LEADER = "OP13-002";

/** What the Leader's debuff takes off the attacker. */
const DEBUFF = 2_000;

/**
 * The plays Bandai's write-up opens the deck on: OP13-016 Monkey.D.Garp looks
 * at four for a 3-cost or more, and OP13-043 Otama draws two at 3 or less
 * Life, which this Leader starts at.
 */
const OPENERS = new Set(["OP13-016", "OP13-043"]);

export function createOp13AceMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op13-ace-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => OPENERS.has(card.cardNumber)),
    keepBecause:
      "Keep Garp or Otama: the first turns dig for the bodies the Leader turns into cards.",
    mulliganBecause:
      "Mulligan a hand with no Garp or Otama: nothing in it finds the deck's 6000s early.",
  });
}

/**
 * What a card in hand is worth held, rather than trashed to the Leader.
 *
 * Counter first, because the debuff is itself a defence: paying it with a
 * 2000 Counter card buys exactly what that card would have bought from hand,
 * and paying with a [Counter] Event buys less. Then cost, because the 6000s
 * and the 10-cost Newgate are what the Leader's draw is built around and the
 * cheap bodies have done their work once the game is under way.
 */
function keepValue(
  card: { cardNumber: string; cost: number | null; counter: number | null },
  t: Tactics,
): number {
  // Both [Counter] Events in the list are +3000.
  const counterEvent = t.facts(card.cardNumber)?.rules.hasCounterEvent
    ? 3_000
    : 0;
  return (
    Math.max(card.counter ?? 0, counterEvent) / 1000 + (card.cost ?? 0) / 4
  );
}

/** Is this the Leader's own "apply" to its [On Your Opponent's Attack]? */
const isLeaderApply = (action: {
  sourceCardNumber?: string;
  option: { kind: string; choice?: string };
}) =>
  action.sourceCardNumber === LEADER &&
  action.option.kind === "confirm" &&
  action.option.choice === "apply";

export const ACE_RULES: readonly Heuristic[] = [
  never(
    "Keep the card when −2000 does not decide the battle: an attack that already fails costs nothing to let through, and one more than 2000 over still lands.",
  )
    .as("op13-ace-debuff-gate")
    .effect((action, t) => {
      if (!isLeaderApply(action)) return false;
      const battle = t.observation.activeBattle;
      if (!battle) return false;
      return battle.counterShortfall === 0 || battle.counterShortfall > DEBUFF;
    }),

  prefer(
    "Pay the Leader's debuff with the card worth least held: no Counter value before a Counter card, and a cheap body before a 6000.",
  )
    .as("op13-ace-pitch")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (action.sourceCardNumber !== LEADER) return false;
      if (!isOptionCardIn(action, "self", "hand")) return false;
      const card = optionCard(action)?.card;
      if (!card) return false;
      return Math.max(1, 100 - keepValue(card, t));
    }),
];
