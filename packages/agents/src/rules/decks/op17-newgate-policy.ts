import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  decision,
  type PolicyDecision,
} from "../generic-policy.js";
import type { PolicyModule } from "../policy-module.js";
import type { RulesPolicy } from "../policy-chain.js";
import { createMulliganModule } from "../mulligan.js";
import { CHARACTER_AREA_LIMIT } from "../tactics.js";

/** The Leader whose ability this file is about. */
const NEWGATE_LEADER = "OP17-001";

/** What one card buys, in the only terms that decide whether to spend it. */
const LEADER_BOOST = 4_000;

/**
 * The two cards `packages/decks/src/op17-newgate-manifest.ts` can play on turn
 * 1, and the only two in the list that turn one card into more than one.
 *
 * OP17-019 looks five deep for a {Whitebeard Pirates} card and takes it;
 * OP16-021 Moby Dick is a 1-cost Stage whose `[On Play]` looks three deep and
 * takes anything, behind a {Whitebeard Pirates} Leader. Four copies each.
 */
const NEWGATE_SEARCHERS = ["OP17-019", "OP16-021"];

/**
 * The opening hand: keep on a searcher, ship a hand whose only cheap card is
 * the Counter Event.
 *
 * ## Why the arithmetic said this was the clearest gap in the field
 *
 * `mulligan.ts` records what separates the decks a keep predicate pays on:
 * not the size of the cheap slot but **what it is made of**, because
 * `anyEarlyPlay` is a cost bound and a cost bound cannot tell a body from an
 * Event. The extreme of that table was OP17-039 Xebec at 4 cheap Characters to
 * 12 not.
 *
 * This list is the extreme of the extreme: it has **no cheap Characters at
 * all**. Every card costing 2 or less is 4x OP17-019, 4x OP16-021 and 2x
 * OP17-017, and the cheapest Character in the deck costs 3. So `anyEarlyPlay`
 * is answering a question this deck never asks.
 *
 * ## Why the rule is still nearly a no-op
 *
 * Ten cheap cards, of which eight are the searchers above. The predicate
 * therefore differs from the generic keep on exactly one hand shape -- one
 * whose only card costing 2 or less is an OP17-017 -- and there are two copies
 * of it in fifty cards. That is the whole margin available to a *tightening*
 * here, and it reads flat: barely any game differs at all, which is about
 * what two copies of one card in fifty can reach. The flatness is a property
 * of the predicate rather than of what is underneath it.
 *
 * So this deck belongs with OP17-079, OP16-080 and OP11-041 in the sense that
 * matters -- the mulligan is not where its points are -- and it is here rather
 * than in `DECKS_ON_THE_GENERIC_MULLIGAN` only because that list is a
 * three-entry ratchet with no room in it. That is a defensible place to land:
 * the rule is not harmful, it makes the decision addressable, and the deck's
 * real leverage was somewhere else entirely -- see
 * `createOp17NewgateDefensePolicy` below.
 *
 * ## What has not been tried
 *
 * The *loosening* `mulligan.ts` says only OP16-001 Ace has ever paid on, and
 * which this list is the obvious second candidate for: its cheapest Character
 * costs 3, so `anyEarlyPlay`'s bound at 2 ships hands holding two 3-cost
 * bodies that are a real turn-3 curve. Eighteen of the fifty cost 3 or less.
 * Untried here, and the arm to run is `keep` widened to `card.cost <= 3`.
 */
export function createOp17NewgateMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op17-newgate-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        NEWGATE_SEARCHERS.includes(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with OP17-019 or OP16-021: both cost 1, both play on turn 1, and both dig for the {Whitebeard Pirates} cards the Leader will be trashing one of every turn.",
    mulliganBecause:
      "Mulligan a hand with no OP17-019 and no OP16-021: the deck's cheapest Character costs 3, and its only other cheap card is a [Counter] Event that is never a play.",
  });
}

/**
 * Whether the Leader's +4000 changes the battle it is offered in.
 *
 * `pnpm census --deck "(Red) Edward.Newgate - Official Feature Deck"` reads
 * this deck's `block:resolve-effect` at **10.00 decisions per game with 100.0%
 * no rule scoped to the deck** -- the largest unpiloted surface of any deck in
 * the catalog, and it is this Leader's own printed clause. The window opens on
 * every attack the opponent declares, and the generic ladder reaches it as
 * "resolve a legal beneficial effect", which takes the offer *every time*: one
 * card off the hand per attack, whether or not the 4000 does anything.
 *
 * In this deck that default is expensive in a way it is not for the other four
 * cards printing this template. OP17-064 King and OP17-072 Black Maria buy
 * +1000 or +2000 off a Character's hand; this is a Leader buying +4000 off a
 * hand that is also the deck's entire Counter reserve -- twenty-six of the
 * fifty cards can be spent in a battle no other way. A card thrown at an
 * attack that was already failing is a card not thrown at the one that was
 * not.
 *
 * So it is paid in exactly the case where it is the difference between losing
 * the battle and surviving it, and declined in the two where it is not:
 *
 *  - **the attack already fails.** `counterShortfall` is 0, and the engine
 *    still offers the ability, correctly -- the 4000 does land. It simply
 *    changes nothing.
 *  - **the attack cannot be survived anyway.** The shortfall is more than
 *    4000 plus every Counter the hand could still add, so paying buys a
 *    smaller loss rather than a save.
 *
 * ## Why sufficiency is the whole test, including on a Character
 *
 * The clause is `[Once Per Turn]` and the buff it grants is written onto
 * `activeAttack`, so it expires with the battle it was bought for: the turn
 * opens the window once per attack and can pay for exactly one of them. That
 * reads like an argument for saving it -- decline a battle over a Character,
 * which costs no Life, and keep the 4000 for one over the Leader, which does.
 *
 * It is not, and the reason is in `chooseGenericCounter`. Its `shouldDefend`
 * for a Character is `protectedCards.has(...)` gated on an economical save,
 * and {@link createOp17NewgateCounterPolicy} fills that set with three cards
 * and defends them only where 1000 of Counter is enough. Every other body, and
 * every shortfall past that, still meets "do not spend hand resources
 * protecting a replaceable Character". So for most battles over a Character
 * the +4000 is not one of two ways to save it, it is the only one -- and
 * declining it is not holding a resource back but choosing to lose the body.
 * A saved Character also defends again next turn, where the card kept defends
 * once.
 *
 * So the rule does not look past the battle in front of it.
 *
 * Read which battle it is off `targetInstanceId` if this is ever revisited,
 * never off `lifeCost`. The two agree everywhere except the position that
 * matters most: `lifeCost` is capped at the Life the defender actually holds,
 * so a Leader hit at 0 Life -- the hit that ends the game -- reads as 0
 * exactly like an attack on a Character, and a rule keyed on it would decline
 * the Leader's own ability on lethal.
 *
 * The Counter reserve behind the second decline is read off `currentCounter`
 * rather than the printed `counter`, so a hand OP16-118 Portgas.D.Ace has
 * turned into Counter reads as the Counter it currently is. What it still
 * understates is OP17-017 Ga Ha Ha Ha!!, which adds 2000 as a `[Counter]`
 * Event and prints no Counter value of its own. The direction of that error is
 * the safe one -- it makes the rule pay in a battle it judges unsalvageable
 * and might not be -- and the alternative is a policy that models Counter
 * Events, which `chooseGenericCounter` owns.
 */
function boostVerdict(observation: GameObservation): {
  readonly pay: boolean;
  readonly because: string;
} {
  const battle = observation.activeBattle;
  if (!battle) {
    return { pay: false, because: "No battle to spend the Leader's 4000 in." };
  }
  // 0 is "the target already survives", so there is nothing to buy.
  if (battle.counterShortfall === 0) {
    return {
      pay: false,
      because:
        "Keep the card: this attack fails as the board stands, so +4000 changes nothing.",
    };
  }
  const counterInHand = observation.self.hand.reduce(
    (total, card) => total + card.currentCounter,
    0,
  );
  if (battle.counterShortfall > LEADER_BOOST + counterInHand) {
    return {
      pay: false,
      because:
        "Keep the card: +4000 and the whole hand still lose this battle, so paying buys a smaller loss rather than a save.",
    };
  }
  return {
    pay: true,
    because: "Trash a card for the 4000 that decides this battle.",
  };
}

/**
 * Which card pays the Leader's cost, once {@link boostVerdict} has
 * said the cost is worth paying.
 *
 * Two decisions hide behind one printed clause, and only the first had a rule.
 * The engine asks "trash a card for +4000?" and then, separately, "which one?"
 * -- one option per card in hand, each a `mechanic-choice` whose `option.card`
 * carries the cost, power and printed Counter. `pnpm census --deck "(Red)
 * Edward.Newgate - Official Feature Deck"` reads `block:resolve-effect` at
 * 10.03 per game with **47.1% no rule at all**: the accept/decline half is
 * this file's, and that remainder is the "which one" question falling through
 * to `chooseGenericRules`, which answers it as "resolve a legal beneficial
 * effect" -- the **first option offered**, i.e. hand order.
 *
 * Hand order is arbitrary and this choice is not. The clause asks several times
 * a game, so unranked the deck picks a card to throw away by where it happens to
 * sit in hand -- and a sixth of this fifty is OP17-005, a 10-cost 12000 body and
 * the card the list wins the game by resolving.
 *
 * ## What the deck's own list says the answer is
 *
 * Sort the fifty cards by printed Counter and the reason the obvious rule
 * fails is on the page:
 *
 * ```
 * no Counter:  4x OP17-019 (1), 4x OP16-021 (1), 2x OP17-017 (1),
 *              2x Atmos (6000), 4x Izo (6000), 4x Jozu (8000),
 *              4x Oden (8000), 4x Newgate (12000)
 * 1000-2000:   8x 3-cost 2000s, Haruta, 4x Ace, Marco, OP17-013, Kingdew
 * ```
 *
 * In this list **Counter value is anti-correlated with card value**. The cards
 * that counter for nothing are the entire top end; the 2000-Counter cards are
 * 2000-power three-drops. So the rule that reads like the deck's own doctrine
 * -- "the hand is this deck's whole Counter reserve, so spend the least
 * Counter" -- pitches every threat and hoards the chaff. It was tested
 * twice, in both tiebreak directions, and lost both times.
 *
 * What is left once the Counter term is dropped is the plain one: **pay with
 * the smallest body**, which puts the three 1-cost Events and the Stage at the
 * front of the pitch order (no power at all) and the 12000 at the back. Ties
 * go to the least Counter, which is where that term belongs -- separating two
 * cards the board values equally.
 *
 * The three orderings bracket each other: leading with least Counter loses
 * badly whichever way its cost tiebreak points, and smallest body first is
 * worth about as much in the other direction. Largest against the aggressive
 * lists, where a hand pitched down to its 2000s has nothing left to stop the
 * board with. The spread end to end is the size of what hand order was
 * costing: it is not a neutral default, it is a coin flip over a wide value
 * range.
 *
 * ## What has not been tried
 *
 * **Protecting OP16-118 Portgas.D.Ace specifically.** Its static layer makes
 * every 8000-power Character in hand a 2000 Counter, so it is worth more than
 * its 6000 says -- and at 6000 this rule still pitches it ahead of a Jozu or
 * an Oden, which is the exact card the trace above complained about. Fixing
 * that means pricing a card in hand by the text it would switch on rather
 * than by its body, and it needs its own arm; nothing here should be tuned by
 * hand without one.
 *
 * **Excluding OP17-017 "Ga Ha Ha Ha!!".** It is a 1-cost Event with no printed
 * power, so it sits at the very front of the pitch order, and it is also a
 * [Counter] Event worth 2000 in a battle. `cardFacts[...].rules.hasCounterEvent`
 * is the field that would say so. Also untried, and pointing the same way:
 * both of these are "a card in hand is worth what its text does, not what its
 * stat line says".
 */
function costPaymentValue(
  observation: GameObservation,
  action: LegalAction,
): { power: number; counter: number } | undefined {
  if (action.type !== "resolve-effect") return undefined;
  if (action.sourceCardNumber !== NEWGATE_LEADER) return undefined;
  const option = action.option;
  if (option.kind !== "card") return undefined;
  if (option.zone !== "hand" || option.owner !== "self") return undefined;
  const held = observation.self.hand.find(
    (card) => card.instanceId === option.card.instanceId,
  );
  if (!held) return undefined;
  // A card that is not a body is worth no power on the field, which is what
  // puts this list's three 1-cost Events and its Stage at the front of the
  // pitch order.
  return { power: option.card.power ?? 0, counter: held.currentCounter };
}

/**
 * Pay the cost with the smallest body in hand.
 */
export function createOp17NewgateCostPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== NEWGATE_LEADER) return undefined;
    const priced = observation.legalActions
      .map((action) => ({
        action,
        value: costPaymentValue(observation, action),
      }))
      .filter(
        (
          entry,
        ): entry is {
          action: LegalAction;
          value: { power: number; counter: number };
        } => entry.value !== undefined,
      );
    // Every option has to be one of these, or the rule is choosing among a
    // subset and leaving the rest to the ladder -- the `rankAmong` trap in the
    // audit playbook, in `decide` form.
    if (priced.length !== observation.legalActions.length) return undefined;
    if (priced.length < 2) return undefined;
    const best = priced.reduce((left, right) =>
      right.value.power !== left.value.power
        ? right.value.power < left.value.power
          ? right
          : left
        : right.value.counter < left.value.counter
          ? right
          : left,
    );
    return decision(
      best.action,
      "Pay the Leader's cost with the smallest body in hand.",
    );
  };
}

/**
 * The bodies this deck will spend a card at the Counter step to keep.
 *
 * `chooseGenericCounter` ships an empty protected set, and for a battle over a
 * Character that set is the whole test: `shouldDefend` is
 * `protectedCards.has(...)`, so an unpiloted seat answers every such battle
 * with "do not spend hand resources protecting a replaceable Character". This
 * deck's Characters are not replaceable in that sense. It plays four bodies a
 * game off a hand it also burns one card of every turn, and its plan is to be
 * un-attackable while the board grows -- a board it cannot rebuild at the rate
 * the Leader eats the hand.
 *
 * These three are the cards that plan is made of. OP17-008 Jozu and OP17-005
 * Edward.Newgate each set the Leader's *base* power to 8000 through the
 * opponent's next end phase, which is what turns the Leader's own +4000 into a
 * 12000 defence; OP17-007 Kouzuki Oden is the deck's tempo turn, deploying a
 * second Character out of hand for free. None of the three prints a Counter
 * value, so naming them here cannot cost the hand a Counter it would otherwise
 * have spent -- with one exception worth knowing: OP16-118 Portgas.D.Ace's
 * static layer makes an 8000-power Character in hand a 2000 Counter, so while
 * it is on the board this set also stops Jozu and Oden being pitched out of
 * hand, which is the same judgement pointed at the same two cards.
 *
 * `economicalCharacterDefense` is left at its default, so even a named body is
 * defended only when 1000 of Counter saves it and the Life stack can afford
 * the turn. One card for an 8000 that the Leader will be adding 4000 to next
 * turn is the trade this is for; three cards for the same body is not.
 */
const NEWGATE_PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  "OP17-005",
  "OP17-007",
  "OP17-008",
]);

/**
 * The Counter phase, which `pnpm census --deck "(Red) Edward.Newgate -
 * Official Feature Deck"` reads at 0.79 `counter:counter` decisions a game
 * with **100.0% no rule at all**, and 3.71 `counter:pass` at 92.9%.
 *
 * A whole decision rather than a narrowing, so it cannot be a heuristic -- the
 * choice it overrides is made inside `chooseGenericCounter` itself. The shape
 * is `st27-teach-policy.ts`'s `createSt27TeachDefensePolicy`, which answers the
 * same surface for the other deck whose Counter values run against its card
 * values.
 *
 * `counterEventBeatsCards` is left unset. This fifty prints one `[Counter]`
 * Event, OP17-017, and it is not cheaper than the cards it would replace: it
 * adds 2000 to a {Whitebeard Pirates} target for one card, which is what an
 * ordinary 2000 Counter costs.
 */
export function createOp17NewgateCounterPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== NEWGATE_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: NEWGATE_PROTECTED_FROM_COUNTER,
    });
  };
}

/** Kouzuki Oden, whose `[On Play]` is the deck's tempo turn. */
const ODEN = "OP17-007";

/**
 * The one card among Oden's candidates that does something the turn it lands.
 *
 * OP17-003 Izo prints `[Rush: Character]`, so the body Oden deploys for free
 * can attack on the turn it arrives, and its own `[On Play]` takes 6000 off a
 * rested opposing Character on the way in. Every other candidate is a body that
 * waits a turn.
 */
const IZO = "OP17-003";

/**
 * Which Character Oden puts onto the field, and whether to put one there at
 * all.
 *
 * OP17-007's `[On Play]` deploys one {Land of Wano} or {Whitebeard Pirates}
 * Character of 6000 power or less out of hand for free -- seven DON!! for two
 * bodies, which the manifest calls this deck's tempo turn. The engine asks
 * which one as a `choose` over the hand with `min: 0`, so the options are one
 * `resolve-effect` per eligible card plus a decline.
 *
 * `chooseGenericRules` answers it as "resolve a legal beneficial effect",
 * which is the first option offered, which is hand order -- the same defect
 * this file answers one clause over, at the Leader's pitch. Unranked, the seat
 * deploys a 2000 Rakuyo out of a hand also holding a 6000 Marco.
 *
 * Power is the whole of the ordering here, and that is a property of the
 * candidate pool rather than a simplification: Oden can only reach Characters
 * of 6000 or less, and in this fifty **none of them prints [Blocker]** -- so
 * the credit `worthOnBoard` gives a block still available, which is what
 * separates two bodies of equal power elsewhere in the format, has nothing to
 * separate here. What is left is five 6000s, a 5000 and two 2000s.
 *
 * Izo breaks the tie among the 6000s because the same 6000 is also a turn:
 * `[Rush: Character]` lets it attack immediately, and its `[On Play]` shrinks
 * a rested opposing Character by 6000 on the way in. Both halves are worth
 * most on the turn Oden lands, which is the only turn this decision happens.
 *
 * The decline is taken only on a full board that the best candidate cannot
 * improve. With five Characters down the deploy is a swap -- `effects.ts`
 * suspends on a replacement choice and `area-replacement-choice` gives up the
 * weakest body -- so a swap whose incoming body is worth no more than the one
 * it costs spends a card out of a hand that is also this deck's Counter
 * reserve, to leave the board where it was. That is
 * `createBoardReplacementModule`'s argument about a full board, asked one step
 * later: it vetoes the *play*, and this is the same trade arriving through an
 * effect instead.
 */
export function createOp17NewgateOdenPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== NEWGATE_LEADER) return undefined;
    const fromOden = observation.legalActions.filter(
      (action) =>
        action.type === "resolve-effect" && action.sourceCardNumber === ODEN,
    );
    // Every legal action has to belong to this decision, or the rule is
    // choosing among a subset and leaving the rest to the ladder -- the
    // `rankAmong` trap in the audit playbook, in `decide` form.
    if (fromOden.length !== observation.legalActions.length) return undefined;
    if (fromOden.length < 2) return undefined;
    const candidates = fromOden.flatMap((action) => {
      if (action.type !== "resolve-effect") return [];
      const option = action.option;
      if (option.kind !== "card") return [];
      if (option.zone !== "hand" || option.owner !== "self") return [];
      return [{ action, card: option.card }];
    });
    if (candidates.length === 0) return undefined;
    const best = candidates.reduce((left, right) => {
      const byPower = (right.card.power ?? 0) - (left.card.power ?? 0);
      if (byPower !== 0) return byPower > 0 ? right : left;
      if (right.card.cardNumber === IZO && left.card.cardNumber !== IZO) {
        return right;
      }
      return left;
    });
    // A full board makes this a swap rather than a development, and
    // `area-replacement-choice` will give up the weakest body standing.
    if (observation.self.board.length >= CHARACTER_AREA_LIMIT) {
      const weakest = observation.self.board.reduce((low, card) =>
        card.currentPower < low.currentPower ? card : low,
      );
      if ((best.card.power ?? 0) <= weakest.currentPower) {
        const decline = fromOden.find(
          (action) =>
            action.type === "resolve-effect" && action.option.kind !== "card",
        );
        if (decline) {
          return decision(
            decline,
            "Decline Oden's free play: the board is full and the best body in hand does not beat the one the swap would cost.",
          );
        }
      }
    }
    return decision(
      best.action,
      best.card.cardNumber === IZO
        ? "Deploy Izo off Oden: [Rush: Character] makes the free body an attack this turn, and its [On Play] shrinks a rested attacker."
        : "Deploy the largest body Oden can reach, not the first card in hand.",
    );
  };
}

/**
 * The defence, as a `decide` rather than a narrowing.
 *
 * Registered apart from the mulligan so
 * `pnpm deck:ab --disable op17-newgate-defense` measures the two separately;
 * the shape is `op17-kaido-policy.ts`'s `createOp17KaidoDefensePolicy`, which
 * answers the same question about its own Leader's once-per-turn offer.
 */
export function createOp17NewgateDefensePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== NEWGATE_LEADER) return undefined;
    const offer = observation.legalActions.filter(
      (action) =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === NEWGATE_LEADER &&
        (action.optionId === "apply" || action.optionId === "skip"),
    );
    if (offer.length !== 2) return undefined;
    const verdict = boostVerdict(observation);
    return decision(
      offer.find(
        (action) =>
          action.type === "resolve-effect" &&
          action.optionId === (verdict.pay ? "apply" : "skip"),
      )!,
      verdict.because,
    );
  };
}
