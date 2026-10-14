import type { GameObservation } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  isOptionCardIn,
  optionCard,
  type PolicyDecision,
} from "../generic-policy.js";
import { never, prefer, WEIGHT, type Heuristic } from "../heuristics.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { Tactics } from "../tactics.js";

/**
 * (Yellow) Charlotte Linlin, OP17-099 -- what the deck converts into what.
 *
 * Its board is deliberately under the curve. Nine of the thirteen slots are
 * 4000-power Characters printing "[Trigger] Play this card", and 4000 is a
 * body the format's Leaders beat by swinging at it. One card re-prices all of
 * them at once: OP17-112 Charlotte Linlin's "[Your Turn] The base power of all
 * of your Characters with a [Trigger] and 4000 base power becomes 8000". So
 * the deck's plan is to still be alive, with a board, when the 10-drop lands.
 *
 * It buys that time by moving its own deck onto its own Life. Six clauses add
 * a card from the top of the deck to the top of the Life cards -- the Leader's
 * [When Attacking], Cracker, Smoothie, Katakuri, Sweet 3 Generals and
 * OP17-112's own [On Play] -- and because the cards on top of that deck are
 * the deck's own 4000 [Trigger] bodies, a Life card taken later is a free
 * body. Being attacked is how this deck develops, which is why its removal
 * (Mont-d'or) only reaches cost 1 and its recursion (Oven's [On K.O.]) only
 * reaches 4000: it does not expect to win the board, it expects to outlast it.
 *
 * The one resource it is genuinely short of is **cards in hand**, and the
 * Leader is what spends them. "[When Attacking] You may trash 1 card from your
 * hand: Your opponent chooses one: - Trash 1 card from your hand. Then, add up
 * to 1 card from the top of your deck to the top of your Life cards. - Trash 1
 * card from your opponent's hand." Every activation costs a card before the
 * opponent has picked anything, and the branch they will pick early is the one
 * that costs a second. Two cards for one Life card is a trade this deck can
 * make and cannot make every turn, and the Counter it is paying with is the
 * only defence a 4000 board has.
 *
 * Both rules below are about that clause, because `pnpm census` reads it as
 * the deck's whole decision surface: `main:resolve-effect` at 32.6 decisions a
 * game with 94.1% no rule at all, and OP17-099 raises 20.2 of them.
 */

/**
 * Cards the plan cannot buy back, and so cannot pay with.
 *
 * OP17-112 is the aura the whole list is built to reach, and OP17-115 is both
 * the only way the Leader gets through a Blocker and a 4000 Counter on the
 * card being attacked -- two copies in fifty against four of everything else.
 */
const PLAN_CARDS = new Set(["OP17-112", "OP17-115"]);

/**
 * What a card in hand is worth *held*, rather than paid into the Leader's
 * cost.
 *
 * The terms, in descending weight:
 *
 *  - a plan card is not fuel at any price;
 *  - printed text beyond the [Trigger] -- an [On Play] that banks a Life card,
 *    a search, the [On K.O.] recursion -- is what the card does when it is
 *    cast, and a card trashed from hand is never cast. OP17-107 Daifuku and
 *    ST20-003 Brulee print none, which is what makes them the fuel: from Life
 *    they do the same thing they would have done from hand;
 *  - cost breaks the tie, because the expensive half of this curve is the half
 *    a turn can only cast one of;
 *  - Counter last and smallest. This deck's 4000 line prints 1000 Counter and
 *    its cheap bodies 2000, so the term separates cards the terms above tie,
 *    without ever outweighing a printed clause.
 */
function keepValue(
  card: { cardNumber: string; cost: number | null; counter: number | null },
  t: Tactics,
): number {
  const facts = t.facts(card.cardNumber);
  return (
    (PLAN_CARDS.has(card.cardNumber) ? 60 : 0) +
    (facts?.rules.hasPrintedEffect ? 10 : 0) +
    (card.cost ?? 0) +
    (card.counter ?? 0) / 1000
  );
}

/**
 * The hand floor the Leader's clause is not allowed to spend through.
 *
 * Three cards, because the clause can take two of them in one activation and
 * a 4000 board that has paid its whole hand into Life has nothing to Counter
 * with on the turn it is attacked back. Bandai's own page and both published
 * guides say the same thing in three different ways -- opdeckguide's "you
 * should not activate the effect automatically", thornberrymedia's "preserving
 * cards becomes more important than continuing to heal" -- and this is that
 * claim written as a game state.
 */
const HAND_FLOOR = 3;

export const LINLIN_RULES: readonly Heuristic[] = [
  never(
    `Decline the Leader's trash with ${HAND_FLOOR} or fewer cards in hand: the clause costs a card before the opponent chooses, and the branch they take early costs a second, so a hand this thin pays its own Counter for one Life card.`,
  )
    .as("leader-hand-floor")
    .effect(
      (action, t) =>
        action.sourceCardNumber === "OP17-099" &&
        action.option.kind === "confirm" &&
        action.option.choice === "apply" &&
        t.hand.length <= HAND_FLOOR,
    ),

  prefer(
    "Pay the Leader's trash with the card the plan can most afford: never OP17-112 or OP17-115, and a body with printed text only after the ones whose whole text is their [Trigger].",
  )
    .as("leader-pitch")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (action.sourceCardNumber !== "OP17-099") return false;
      if (!isOptionCardIn(action, "self", "hand")) return false;
      const card = optionCard(action)?.card;
      if (!card) return false;
      return Math.max(1, 100 - keepValue(card, t));
    }),
];

/**
 * The one body this deck loses something by losing.
 *
 * `chooseGenericCounter` defends a Character only when it is named here, and
 * most of this fifty should not be: a 4000 [Trigger] body is a card the deck
 * draws again, plays again, or takes off its own Life for free, and OP17-102
 * Charlotte Oven's [On K.O.] plays another one out of the trash on the way
 * out. Spending a Counter card to keep one is spending the resource the deck
 * is shortest of on the resource it has most of.
 *
 * OP17-112 Charlotte Linlin is the exception, and it is the whole exception.
 * Its [Your Turn] is not a body, it is the board: every 4000-power [Trigger]
 * Character the deck controls is an 8000 while it stands. Losing it does not
 * cost one Character, it costs 4000 power on each of the others, which is the
 * shape `characterDefensePower` exists for -- so it is priced above the
 * default one Counter card.
 */
const LINLIN_PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  "OP17-112",
]);

/**
 * What OP17-112 is worth defending, in power.
 *
 * 4000: one 4000-power [Trigger] body's worth of the aura, which is the
 * smallest board the card is ever cast into. The default 1000 prices it as a
 * body that can simply be played again, and at 10 cost it cannot.
 */
const LINLIN_COUNTER_OPTIONS = {
  protectedCards: LINLIN_PROTECTED_FROM_COUNTER,
  characterDefensePower: () => 4_000,
} as const;

/**
 * (Yellow) Charlotte Linlin's Counter phase.
 *
 * `pnpm census` reads `counter:counter` at 2.94 decisions a game with 100.0%
 * no rule at all: an unnamed `protectedCards` set means every Character this
 * deck owns is left to die rather than spend a card. For this deck that
 * default is nearly right -- the small bodies come back -- which is why the
 * set names one card instead of a list.
 *
 * A whole decision rather than a narrowing, so it is a `decide`: the choice it
 * overrides is made inside `chooseGenericCounter`.
 */
export function createOp17LinlinCounterPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== "OP17-099") return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(
      observation,
      observation.legalActions,
      LINLIN_COUNTER_OPTIONS,
    );
  };
}
