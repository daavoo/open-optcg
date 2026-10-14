import { isOptionCardIn, optionCard } from "../generic-policy.js";
import { prefer, WEIGHT, type Heuristic } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { Tactics } from "../tactics.js";

/**
 * The two 1-cost bodies `packages/decks/src/op09-robin-manifest.ts` can play on
 * turn 1, and the only cards in the list that turn one card into the card the
 * deck actually wants.
 *
 * ST34-003 Charlotte Brulee and OP17-113 Streusen print the same search: look
 * three deep, take a {Big Mom Pirates} card. Seven copies between them, and
 * everything they can find is a card this deck is built around.
 */
const ROBIN_SEARCHERS = ["ST34-003", "OP17-113"];

/**
 * The opening hand: keep on a searcher, ship everything else.
 *
 * The generic keep is `anyEarlyPlay` -- any card costing 2 or less -- and this
 * deck has eleven of those: the seven searchers above and four OP09-078
 * Gum-Gum Giant. So the generic bound and this one differ on one hand shape: a
 * hand whose only cheap card is a **[Counter] Event**, which is never a play.
 * `mulligan.ts` records this as the distinction a cost bound cannot draw, and
 * as the one that has paid wherever the cheap slot is Event-heavy.
 *
 * The deck's own reason to want a searcher first is narrower than card
 * advantage: the Leader turns a [Trigger] card in hand into a rested DON!!
 * every turn it attacks, and OP17-109 Charlotte Pudding turns another one into
 * three cards. Both costs are paid out of the same pile, and every card the
 * searchers find that is worth finding prints a [Trigger]. An opening with no
 * searcher is an opening that pays those costs out of the cards it wanted to
 * play.
 *
 * ## Measurement
 *
 * Price it with `pnpm deck:ab --deck "(Purple/Yellow) Nico Robin - OP17
 * Tournament List" --disable op09-robin-mulligan`. Expect it to move more than
 * the one-hand-shape reading above predicts: a hand kept on a searcher is a
 * hand that has a [Trigger] card to spend on the Leader and on OP17-109 a turn
 * earlier, so the rule reaches past the opening play.
 */
export function createOp09RobinMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op09-robin-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        ROBIN_SEARCHERS.includes(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with ST34-003 or OP17-113: both cost 1, both play on turn 1, and both dig three deep for the {Big Mom Pirates} cards the rest of the deck is made of.",
    mulliganBecause:
      "Mulligan a hand with no ST34-003 and no OP17-113: the only other card costing 2 or less is OP09-078, a [Counter] Event, which is never a play.",
  });
}

/**
 * The two cards the deck's plan is built around, and which no cost may take.
 *
 * OP17-112 Charlotte Linlin is the aura that turns the deck's 4000-power
 * [Trigger] bodies into 8000s, and OP16-119 Marshall.D.Teach is its only
 * 10000 body and its only removal from Life. Neither has a substitute in the
 * fifty, so paying either into a cost is paying the game plan for one DON!!
 * or two cards.
 */
const PLAN_CARDS = new Set(["OP17-112", "OP16-119"]);

/**
 * The Characters whose [Trigger] reads "Play this card".
 *
 * OP17-102 Charlotte Oven, OP17-106 Charlotte Smoothie, OP17-107 Charlotte
 * Daifuku, OP17-110 Charlotte Perospero and OP17-114 Sweet 3 Generals. From
 * Life, each is a body for free at the moment the opponent connects, and under
 * OP17-112's aura the body is an 8000 on the turn after; that is the whole
 * reason the deck banks its own deck onto its Life.
 */
const TRIGGER_PLAYS_ITSELF = new Set([
  "OP17-102",
  "OP17-106",
  "OP17-107",
  "OP17-110",
  "OP17-114",
]);

/**
 * How much a card in hand is worth *holding* rather than paying into a cost.
 *
 * Three clauses in the list trash a card out of hand -- the Leader's
 * `[When Attacking]` ramp and OP17-109 Charlotte Pudding's draw both name a
 * [Trigger] card, OP09-078 Gum-Gum Giant names any card -- and the engine
 * offers one option per eligible card. Left alone, the first option offered
 * pays, which is hand order.
 *
 * The terms, in descending weight, are what this deck can and cannot replace:
 *
 *  - a plan card ({@link PLAN_CARDS}) is not fuel at any price;
 *  - a 4000-power [Trigger] body is what OP17-112 lifts to 8000, so it is a
 *    body the deck wants on the board rather than in the trash;
 *  - printed text beyond the Trigger -- an `[On Play]`, an `[On K.O.]`, a
 *    search -- is a card that does something when cast;
 *  - cost breaks ties, because an expensive card is the harder one to draw
 *    into again, and Counter last, because a card held for its Counter is a
 *    card held for the opponent's turn rather than for this one.
 *
 * OP12-112 Baby 5 scores lowest of the deck's [Trigger] cards on every term:
 * a 5000 body the aura never reaches, no text but its Trigger, and a cost of
 * four. It is in the list as the card these costs are paid with -- its
 * Trigger, a draw of two behind a multicolored Leader, is what it is worth in
 * Life, and its 2000 Counter is what it is worth in hand until a cost asks.
 */
function keepValue(
  card: { cardNumber: string; cost: number | null; counter: number | null },
  t: Tactics,
): number {
  const facts = t.facts(card.cardNumber);
  const liftedByAura =
    facts?.hasTrigger === true && facts.power === 4000 ? 30 : 0;
  const text = facts?.rules.hasPrintedEffect ? 10 : 0;
  return (
    (PLAN_CARDS.has(card.cardNumber) ? 60 : 0) +
    liftedByAura +
    text +
    (card.cost ?? 0) +
    (card.counter ?? 0) / 1000
  );
}

/**
 * The three sources whose cost is a card out of hand.
 *
 * Named rather than read off `destination`, because Perospero's `[On Play]`
 * also offers a card from hand and that card is played, not paid.
 */
const HAND_COST_SOURCES = new Set(["OP09-062", "OP17-109", "OP09-078"]);

/**
 * What a card is worth on top of this deck's Life.
 *
 * OP16-119 Marshall.D.Teach's `[On Play]` looks at three and banks up to one,
 * and it is the deck's only banking clause that *chooses* the card -- the
 * others take the top of the deck blind. Left alone, the first card offered is
 * banked, which is the deck's own order.
 *
 * A card that plays itself off Life is the deck's engine. Any other [Trigger]
 * is still a card the opponent pays for hitting -- OP12-112 Baby 5 draws two
 * behind this Leader, OP17-109 searches, OP16-119 negates and K.O.s -- and a
 * card with no Trigger is still a Life card, which is why the floor is above
 * zero rather than a skip.
 */
function lifeValue(cardNumber: string, t: Tactics): number {
  if (TRIGGER_PLAYS_ITSELF.has(cardNumber)) return 100;
  if (t.facts(cardNumber)?.hasTrigger) return 60;
  return 20;
}

/**
 * Two of the effect choices `pnpm census` counts as this deck's biggest
 * unpiloted surface, `main:resolve-effect`: which card pays a hand cost, and
 * which card OP16-119 banks. Both are otherwise answered by offer order.
 *
 * Each rule is its own module (`op09-robin#<name>`) so `pnpm deck:ab --deck
 * "(Purple/Yellow) Nico Robin - 2nd Place EU Championship 26-27 S1" --disable
 * op09-robin#<name>` prices it alone. Both score every candidate they speak
 * about, so each is a total order over its own decision and the generic
 * first-offer default cannot win by silence.
 */
export const ROBIN_RULES: readonly Heuristic[] = [
  prefer(
    "Pay a hand cost with the card the plan can most afford: never OP17-112 or OP16-119, and a 4000 [Trigger] body only after the cards the aura never lifts.",
  )
    .as("fuel")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (!HAND_COST_SOURCES.has(action.sourceCardNumber)) return false;
      if (!isOptionCardIn(action, "self", "hand")) return false;
      const card = optionCard(action)?.card;
      if (!card) return false;
      return Math.max(1, 100 - keepValue(card, t));
    }),

  prefer(
    "Bank the card that plays itself off Life; failing that, any [Trigger]; failing that, still a Life card.",
  )
    .as("bank")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (action.sourceCardNumber !== "OP16-119") return false;
      if (!isOptionCardIn(action, "self", "deck")) return false;
      if (action.destination?.zone !== "life") return false;
      const card = optionCard(action)?.card;
      return card ? lifeValue(card.cardNumber, t) : false;
    }),
];
