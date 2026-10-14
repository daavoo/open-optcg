/**
 * Format rules for the seat that is not the turn player: what to Counter,
 * what to block, and what to hold back for it.
 *
 * One of the files `format-heuristics.ts` is the map of; see that file for what
 * lives where and why the split is by decision rather than by deck.
 */
import { heuristics, mustAct, never, type Heuristic } from "../heuristics.js";
import {
  decision,
  mustPreventCurrentLeaderHit,
  passOrNone,
  willSpendToSaveCharacter,
  type CounterPolicyOptions,
} from "../generic-policy.js";
import {
  counterCardsFromHand,
  incomingLeaderAttacks,
  incomingLeaderDamage,
} from "../combat.js";
import type { PolicyContext, PolicyModule } from "../policy-module.js";
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

/**
 * Counter cards worth spending on one Leader hit that is not itself lethal.
 *
 * Two, because of what the two sides of the trade are actually made of. A Leader
 * hit taken moves a Life card *into hand*, so absorbing costs 1 Life and gains 1
 * card; a Counter line costs N cards and gains nothing but the Life. At N = 1 the
 * trade is roughly even and the Life buffer is worth keeping; by N = 3 it is a
 * two-card loss taken to postpone one point of damage.
 *
 * One card higher at 1 Life, where the buffer being spent is the last one and the
 * cards bought with it will not be spendable either.
 */
const LEADER_COUNTER_BUDGET = 2;

const LAST_LIFE_COUNTER_BUDGET = 3;

/**
 * The most Counter cards `counter-budget` lets one non-lethal Leader hit cost
 * at this Life total. One function, so the rule that *promises* a Counter line
 * in the block window ({@link createCounterOverDyingBlockModule}) and the rule
 * that *pays* it in the Counter window ({@link createCounterBudgetModule}) can
 * never disagree about what the hand is allowed to spend.
 *
 * Exported for the same reason, one window further out: a card spent before the
 * Counter step on the promise that the step will finish the job -- OP15-002
 * Lucy's pitch clause is one -- is wasted outright if this cap would refuse the
 * rest of the line.
 */
export function leaderCounterBudget(life: number): number {
  return life === 1 ? LAST_LIFE_COUNTER_BUDGET : LEADER_COUNTER_BUDGET;
}

/**
 * Keep enough DON!! active to cast a [Counter] Event held in hand.
 *
 * A [Counter] Event is paid for with *active* DON!! during the opponent's turn,
 * and `chooseGenericRules` ends every turn by converting whatever DON!! is left
 * into Leader power -- which rests it. Without this, a seat arrives at the
 * opponent's turn with an empty DON!! pool and a Counter Event it cannot pay
 * for, whatever its hand looks like.
 *
 * It is not about one card: six of the format's Events have [Counter] text, and
 * every deck that runs one reaches the opponent's turn the same way.
 *
 * Deliberately narrow, on the same principle as the development rule: it holds
 * back only the DON!! that the *cheapest* Counter Event in hand actually needs,
 * and only once the ramp is far enough along that a spare DON!! is not the
 * difference between developing and not.
 *
 * ## What it is trading against, and the one attachment that is not that
 *
 * The reason names the price exactly: "rather than resting it for +1000 power".
 * That is what the last DON!! of a turn is ordinarily worth, and a [Counter]
 * Event beats it. It is not what the last DON!! is worth on a unit still
 * assembling a `[DON!! xN]` condition -- there the DON!! buys the card's text,
 * and the text can be worth far more than 1000. `canCompleteDonAbility` is that
 * question, and `dead-attachment` in `format/don.ts` carves the same exemption
 * for the same reason.
 *
 * What the exemption is worth is clearest on a deck whose every power source is
 * `[DON!! x1]`-gated, such as OP16-022 Green/Blue Luffy: without it, one DON!!
 * held for a 1-cost [Counter] Event costs OP16-055 Mr.2 the clause that would
 * have made its base power the opposing Leader's -- a 1000 body left at 1000
 * instead of 6000, and a turn with no attack in it. The exemption is a claim
 * about printed text rather than about that deck, so it is here and not in the
 * deck policy.
 *
 * `couldAttack` is required as well as `canCompleteDonAbility`: a DON!! on a unit
 * with no swing left this turn is returned in the next Refresh Phase having
 * bought nothing, and would be strictly worse than the Counter Event.
 *
 * ## What this rule gives up
 *
 * It corrects a mispricing rather than winning a trade: an unmet `[DON!! xN]`
 * is not worth 1000 power, and no tuning of the gate makes the old price true.
 * The case it gets wrong is a deck whose Leader Counter Event is worth more
 * than the gated unit gains -- Red/Green Luffy & Ace, aggro, +3000 on the
 * Leader against one gated unit -- and telling those apart needs power
 * arithmetic this module deliberately does not do (`tactics.ts` owns it).
 */
export function createCounterEventReserveModule(): PolicyModule {
  return heuristics("counter-event-reserve", [
    never(
      "Keep DON!! active to pay for the [Counter] Event in hand rather than resting it for +1000 power.",
    )
      .when(
        (t) =>
          t.cheapestCounterEventInHand > 0 &&
          t.don <= t.cheapestCounterEventInHand &&
          t.donOnField >= 4 &&
          t.observation.phase === "main",
      )
      .attachDon(
        (action, t) =>
          !(
            t.canCompleteDonAbility(action.targetInstanceId) &&
            t.couldAttack(action.targetInstanceId)
          ),
      ),
  ]);
}

/**
 * Cap what one non-lethal Leader hit is allowed to cost in Counter cards.
 *
 * `mustPreventCurrentLeaderHit` in `generic-policy.ts` decides *whether* a Leader
 * hit has to be stopped, and it is a good predicate. What neither it nor
 * `chooseGenericCounter` has is a *price*: once the predicate reads true the
 * agent spends whatever the demand asks for. Read off six LLM-vs-rules games in
 * `traces/llm-vs-rules/ST31-vs-ST32`, that is the format's largest single leak --
 * the rules pilot spent 2.29 Counter cards per successful defence against the
 * LLM's 1.15, with a worst case of six cards on one 11000 swing at 2 Life
 * (`seed-3-llm-right`, turn 7). It survived that turn holding nothing and lost on
 * the next one.
 *
 * The budget prices the trade the LLM priced explicitly and the rules never did:
 * a Life taken becomes a card in hand, so absorbing is nearly card-neutral while
 * a four-card Counter line is not. See {@link LEADER_COUNTER_BUDGET}.
 *
 * Three properties keep it from reintroducing the deaths the predicate exists to
 * prevent:
 *
 *  - **A genuinely lethal hit is never budgeted.** At 0 Life any connecting hit
 *    ends the game, so there is no future hand to preserve and the cap lifts
 *    entirely.
 *  - **It only prices a line it has not started paying.** The rule bites at the
 *    decision to open a four-card defence, never halfway through one: a line
 *    that was worth starting is always worth finishing, and the cards already
 *    committed are spent whatever happens next.
 *  - **Leader hits only.** Character saves are already capped -- the default
 *    `economicalCharacterSave` needs the whole demand met by a single card -- so
 *    a rule here would only overlap with a deck opting out of that, which is a
 *    fault in the deck rather than a missing format rule.
 *
 * A [Counter] Event is deliberately left alone: it is one card whatever the
 * demand, so the trade this rule polices does not apply to it, and
 * `chooseGenericCounter` reaches for it once ordinary Counter is unavailable.
 *
 * ## Whose question the price answers
 *
 * `counterCardsInHand` and not `counterCardsNeeded`. The latter prices the
 * shortfall at 2000, the format's largest Counter step, which is the
 * *attacker's* question -- how few cards could this possibly cost a hand I
 * cannot see -- and so a lower bound. This rule is the defender, holding the
 * cards and about to pay, and the bound is wrong by a whole card for every hand
 * that has no 2000 in it. A 2001 shortfall priced at two and paid out of 1000s
 * costs three, which is precisely the line the budget exists to refuse: across
 * the field it slipped past on 5.9% of Leader-defence windows, 44 of them
 * three-card lines and 10 four-card, against a cap of two.
 */
export function createCounterBudgetModule(): PolicyModule {
  return heuristics("counter-budget", [
    never(
      "Absorb this Leader hit rather than spend a Counter line worth more than the Life it saves.",
    )
      .when((t) => {
        const battle = t.observation.activeBattle;
        if (!battle?.targetInstanceId.endsWith("-leader")) return false;
        // A hit at 0 Life ends the game; nothing is worth preserving past it.
        if (t.selfLife <= 0) return false;
        // Only at the decision to *open* a line. Pricing the remaining demand
        // against the hand is what makes the cap honest, but it also makes it
        // rise as the cheap cards go in -- a 2001 shortfall left after 4000 is
        // committed costs three more cards out of a hand of 1000s -- and a rule
        // that bit there would abandon a line it had already paid for. The
        // budget is a cap on what a defence may cost, not a reason to waste the
        // part of it already spent.
        if (battle.counterPower > 0) return false;
        return t.counterCardsInHand() > leaderCounterBudget(t.selfLife);
      })
      .counter(() => true),
  ]);
}

/**
 * Do not answer a Leader hit with a Blocker that dies to it while the hand holds
 * the Counter power to stop the same attack.
 *
 * The mirror of {@link createFreeBlockModule}, and the case that module's own
 * comment assumed was already right. `chooseGenericBlock` has two branches: it
 * passes when the hit is not required, and when `mustBlockCurrentLeaderHit` says
 * the projected attacks exceed remaining Life it blocks with
 * `cheapestSurvivingBlock`. That helper prefers a Blocker that survives and
 * falls back to the *lowest-power* one when none does -- and never looks at the
 * hand. So a defender whose only Blocker is smaller than the attack blocks with
 * it and loses it, even when two Counter cards would have stopped the same
 * attack and kept the body.
 *
 * The board that costs the most is a temporarily debuffed body the deck reads a
 * condition off -- a cost-8 aura source sitting at 2000 while the debuff lasts.
 * Blocking spends it permanently to stop an attack Counter cards would have
 * stopped, and the debuff expires either way. `pnpm census` is where to check
 * who answers this decision: the block phase falls to `chooseGenericRules` for
 * most of the field.
 *
 * Three gates, so the rule only fires where passing is strictly the better
 * trade:
 *
 *  - **Every offered block dies.** A Blocker that outpowers the attack absorbs
 *    it for free and `free-block` promotes exactly that; this rule must never
 *    talk it out of one.
 *  - **The hand can actually pay.** The Counter values in hand, largest first,
 *    must reach `activeBattle.counterShortfall`. Passing a required block with
 *    no Counter line is simply taking the hit the block was meant to stop.
 *  - **And will be allowed to.** The line must fit the budget
 *    {@link createCounterBudgetModule} enforces one window later, read through
 *    the same `leaderCounterBudget`. Without this the two rules composed into
 *    the worst of both: in a recorded Robin game at 2 Life, a 9000 swing on a
 *    5000 Leader with two 1000 Blockers standing and 2000+2000+1000 of Counter
 *    in hand, this rule passed the block because the hand *could* pay the
 *    4001 -- and `counter-budget` then vetoed every Counter because three
 *    cards is more than a non-lethal hit is worth. The Leader took the hit
 *    with both Blockers untouched, which is the one outcome neither rule
 *    would have chosen alone. A line the budget will refuse is not a line.
 *  - **Not at 0 Life.** There the hit ends the game, so the Blocker's future is
 *    worth nothing and the body is the right price for the turn.
 *
 * A `decide` module for the same reason `free-block` is one: the choice it
 * overrides -- block at all, versus pass -- is made inside `chooseGenericBlock`,
 * and `pass` can never be vetoed, so no rank or veto contribution can reach it.
 * It returns `undefined` in every other position, so the must-block case with no
 * Counter line, and the free block, both fall through unchanged.
 *
 * ## Why it ships on the argument rather than on a win rate
 *
 * Like {@link createFreeBlockModule}, this is a dominance rule: every state it
 * fires in is one where the block was proven to lose the body (no offered
 * Blocker outpowers the attack) and the hand was proven able to stop the same
 * attack instead, so it trades a permanent body for cards the defence is made
 * of. It also fires rarely -- `pnpm census` puts it at about 1% of block
 * decisions even on the deck whose trace found it, because the position needs
 * a human's willingness to press a debuffed engine card.
 */
export function createCounterOverDyingBlockModule(): PolicyModule {
  return {
    id: "counter-over-dying-block",
    decide(context) {
      const observation = context.observation;
      const battle = observation.activeBattle;
      if (!battle || !battle.targetInstanceId.endsWith("-leader")) {
        return undefined;
      }
      // At 0 Life the hit is the game, so there is no future to preserve the
      // Blocker for.
      if (observation.self.lifeCount <= 0) return undefined;
      const blocks = context.actions.filter(
        (action): action is Extract<typeof action, { type: "block" }> =>
          action.type === "block",
      );
      if (blocks.length === 0) return undefined;
      const declining = passOrNone(context.actions);
      if (!declining) return undefined;
      const power = new Map(
        observation.self.board.map((card) => [
          card.instanceId,
          card.currentPower,
        ]),
      );
      // A block whose blocker outpowers the attack survives it; `free-block`
      // owns that case and this rule has no business in it.
      const anySurvives = blocks.some(
        (block) =>
          (power.get(block.blockerInstanceId) ?? 0) > battle.attackPower,
      );
      if (anySurvives) return undefined;
      // The shortfall the Counter step would have to close, priced in whole
      // cards -- the only unit Counter is spent in.
      // A shortfall of 0 means the target already survives; there is nothing
      // for the Counter step to pay and nothing for this rule to weigh.
      if (battle.counterShortfall <= 0) return undefined;
      // The Counter step is not offered yet -- this is the block window -- so
      // the hand is where the answer has to be read. `counterCardsFromHand`
      // takes the largest Counter values first, which is both the fewest cards
      // the defence can be paid with and the test of whether it reaches the
      // shortfall at all: it returns Infinity when the hand cannot close it.
      //
      // The same function the Counter step pays with, for the same reason
      // `leaderCounterBudget` is shared: this rule *promises* a Counter line in
      // exchange for keeping the Blocker, and a promise priced differently from
      // the payment is a promise the next window refuses to honour -- the seat
      // declines the block and then declines the Counter, and takes the hit it
      // had two ways to stop.
      const cards = counterCardsFromHand(
        observation.self.hand.map((card) => card.currentCounter),
        battle.counterShortfall,
      );
      if (cards > leaderCounterBudget(observation.self.lifeCount)) {
        return undefined;
      }
      return decision(
        declining,
        "Keep the Blocker: it dies to this attack, and the hand holds the Counter power to stop it instead.",
      );
    },
  };
}

/**
 * Block a Leader hit with a Character that survives it outright, even when
 * `mustBlockCurrentLeaderHit` would not otherwise require a block -- but only
 * when no further attack on the Leader can still land this same turn.
 *
 * `chooseGenericBlock` (`generic-policy.ts`) only ever blocks when the
 * projected attack count would otherwise exceed remaining Life, on the
 * reasoning that blocking usually costs the Blocker -- it rests, and often
 * loses, the card. That reasoning looked incomplete when the blocker's
 * current power already exceeds the attack's: the attacker cannot win ties
 * (`tactics.ts`'s combat note), so a strictly-higher-power block absorbs the
 * hit for zero Life lost and the Blocker merely rests rather than dying.
 *
 * That condition alone is not enough, because resting the Blocker is not
 * actually free when the opponent has more than
 * one attacker still active this turn. A Character untaps at the start of its
 * *controller's* next turn regardless of whether it blocked, so spending it
 * on an early, harmless hit does not cost next turn -- but it does cost
 * *this* turn: rested, it cannot block a second, possibly lethal, attack that
 * lands later in the same opponent turn. `incomingLeaderAttacks` already
 * counts exactly that -- active, not-yet-attacked opposing units that hit at
 * least as hard as the viewer's Leader, decaying to 0 as the turn's attacks
 * are declared -- so the rule is gated on it being 0: no other Leader attack
 * can still land this turn.
 *
 * It ships on a dominance argument rather than on a win rate. Every state it
 * fires in is one where `chooseGenericBlock` was about to pass and take Life
 * it did not have to, for a Blocker that is proven (by the two gates above) to
 * lose nothing by blocking instead. That argument depends only on the two
 * gates being correct.
 *
 * Registered for `EVERY_DECK` rather than for sealed alone. Nothing in the
 * rule or its two gates is about sealed: it names the Blocker's current power,
 * the attack's power and whether another Leader attack can still land, all of
 * which mean the same thing in every deck. It lived under `SEALED-LUFFY` only
 * because sealed is where it was found.
 *
 * Expect it to be flat for most decks and large for a few: it can only fire
 * for a deck that fields Blockers big enough to outpower an attack, so a flat
 * column usually means the rule never fired there rather than that it fired
 * and did nothing.
 *
 * A `decide` module rather than `rank`/`never` because the choice this
 * overrides -- block at all, versus pass -- is made directly inside
 * `chooseGenericBlock`, not from the registry's rank/veto scores; `pass` can
 * never be vetoed, so nothing short of deciding the point outright can change
 * it. Returns `undefined` whenever no such free-and-safe block exists, so
 * every other decision point (and the ordinary must-block case, where
 * `chooseGenericBlock` already decides correctly) falls through unchanged.
 */
export function createFreeBlockModule(): PolicyModule {
  return {
    id: "free-block",
    decide(context) {
      const battle = context.observation.activeBattle;
      if (!battle || !battle.targetInstanceId.endsWith("-leader")) {
        return undefined;
      }
      // The gate that makes the block free: with no further Leader attack
      // possible this turn, a Blocker that outpowers this one has nothing left
      // to be saved for, and resting it costs only the Refresh Phase that gives
      // it straight back.
      //
      // The gate stays closed even at 1-2 Life, where it looks as though the
      // defender may as well choose which of two hits connects: a defender
      // that low with a Blocker that outpowers the attack is already inside
      // `mustBlockCurrentLeaderHit`, which blocks without needing this rule.
      if (incomingLeaderAttacks(context.observation) > 0) return undefined;
      const blocks = context.actions.filter(
        (action): action is Extract<typeof action, { type: "block" }> =>
          action.type === "block",
      );
      if (blocks.length === 0) return undefined;
      const power = new Map(
        context.observation.self.board.map((card) => [
          card.instanceId,
          card.currentPower,
        ]),
      );
      const free = blocks.find(
        (block) =>
          (power.get(block.blockerInstanceId) ?? 0) > battle.attackPower,
      );
      if (!free) return undefined;
      return decision(
        free,
        "Block for free: this Character's power already exceeds the attack and no further Leader attack can land this turn, so it survives, no Life is lost, and nothing is given up.",
      );
    },
  };
}

/**
 * The block window's own arithmetic, shared by the two rules that read it.
 *
 * {@link createCounterOverDyingBlockModule} answers these same states and
 * reaches the opposite verdict, on a premise that is wrong in two of them. It
 * reads `battle.counterShortfall` -- the gap measured with the **Leader** as
 * defender -- and never recomputes it under the block it is declining.
 * Interposing a body reduces that gap by exactly the power the body has over
 * the Leader, so "keep the Blocker and pay with the hand instead" can be priced
 * against a line that costs *more* than the one it is refusing.
 *
 * Returns the cheapest offered block that is strictly cheaper than paying for
 * the hit with no block at all, or nothing when there is none. `price` says
 * what one body costs and is where the two rules differ; returning `undefined`
 * from it declines that body.
 *
 * Bodies that survive the attack are skipped, so both rules are disjoint from
 * `free-block` by construction rather than by two gates staying in step.
 */
function cheapestBlockUnder(
  context: PolicyContext,
  options: CounterPolicyOptions,
  price: (
    body: GameObservation["self"]["board"][number],
    shortfall: number,
    passCards: number,
  ) => number | undefined,
):
  | { action: Extract<LegalAction, { type: "block" }>; cards: number }
  | undefined {
  const observation = context.observation;
  const battle = observation.activeBattle;
  if (!battle || !battle.targetInstanceId.endsWith("-leader")) return undefined;
  // At 0 Life the hit ends the game and `mustBlockCurrentLeaderHit` already
  // blocks; there is no cheaper-or-dearer left to weigh.
  if (observation.self.lifeCount <= 0) return undefined;
  // The Leader already survives this attack, so no Life is being bought.
  if (battle.counterShortfall <= 0) return undefined;
  // The pass these rules undercut is only ever a *Counter line* when the
  // Counter window would pay for this hit. Where it would not, passing takes
  // the Life -- which moves a Life card into hand, so it costs one card less
  // than it looks -- and "fewer Counter cards" is no longer the same trade in a
  // cheaper currency; it is a body spent to keep a card the seat was happy to
  // buy. Asked through the function that window decides with.
  if (
    !mustPreventCurrentLeaderHit(
      observation,
      options.refreshedBoardHorizonAtLife,
    )
  ) {
    return undefined;
  }
  const blocks = context.actions.filter(
    (action): action is Extract<LegalAction, { type: "block" }> =>
      action.type === "block",
  );
  if (blocks.length === 0) return undefined;
  const board = new Map(
    observation.self.board.map((card) => [card.instanceId, card]),
  );
  const counters = observation.self.hand.map((card) => card.currentCounter);
  // The line both rules have to beat: stopping this hit with no block.
  const passCards = counterCardsFromHand(counters, battle.counterShortfall);
  // ...and it is only that line if `counter-budget` would let it be paid. Over
  // budget, that rule vetoes the Counter and the seat absorbs the hit instead,
  // so the pass costs a Life and no card at all -- and a body spent to save one
  // Life is a different trade from a body spent to save two Counter cards. The
  // same helper both other windows price with.
  if (passCards > leaderCounterBudget(observation.self.lifeCount)) {
    return undefined;
  }

  let best:
    | {
        action: Extract<LegalAction, { type: "block" }>;
        cards: number;
        power: number;
      }
    | undefined;
  for (const block of blocks) {
    const body = board.get(block.blockerInstanceId);
    // A redirect names the card the attack is moved *onto*, which may be the
    // Leader and is on no board list. It is not a body being interposed and
    // neither rule has a price for it.
    if (body === undefined) continue;
    const shortfall = battle.attackPower - body.currentPower + 1;
    // Outlives the attack: nothing is traded, and whether resting it is
    // affordable is `free-block`'s question.
    if (shortfall <= 0) continue;
    const cards = price(body, shortfall, passCards);
    if (cards === undefined) continue;
    if (!(cards < passCards)) continue;
    if (
      best === undefined ||
      cards < best.cards ||
      (cards === best.cards && body.currentPower < best.power)
    ) {
      best = { action: block, cards, power: body.currentPower };
    }
  }
  return best === undefined
    ? undefined
    : { action: best.action, cards: best.cards };
}

/**
 * Block with a body whose own K.O. is the payoff.
 *
 * `counter-over-dying-block` keeps a Blocker out of a hit it would die to, and
 * pays the Leader's shortfall in Counter cards instead. That is the right trade
 * for a body worth more standing than dead, and exactly backwards for one whose
 * printed text pays out when it dies. OP15-011 Pearl K.O.s an opposing
 * Character of 6000 base power or less on the way out, so putting it in front
 * of a Leader hit costs no Life, no card, and fires a removal clause that has no
 * other way to resolve.
 *
 * The promise this makes to the next window is the easy one: a payoff body is
 * one the deck's `protectedCards` deliberately omits, so `chooseGenericCounter`
 * declines to defend it and the K.O. resolves. Nothing here depends on a Counter
 * line being paid.
 *
 * A dominance argument rather than a rate: the pass it replaces costs either a
 * Counter line or a Life, and this costs neither. Registered for one Leader
 * while that is measured.
 */
export function createPayoffKoBlockModule(
  payoffOnKo: ReadonlySet<string>,
  options: CounterPolicyOptions = {},
): PolicyModule {
  return {
    id: "block-payoff-ko",
    decide(context) {
      const best = cheapestBlockUnder(context, options, (body) =>
        payoffOnKo.has(body.cardNumber) ? 0 : undefined,
      );
      if (best === undefined) return undefined;
      return decision(
        best.action,
        "Block with a body whose K.O. is its own payoff: the Leader keeps its Life, no Counter card is spent, and the clause the body fires on the way out is what blocking with it was for.",
      );
    },
  };
}

/**
 * Block with a body that outpowers the Leader, because doing so makes the same
 * Life cheaper to keep.
 *
 * The shortfall behind a 6000 Blocker is 1000 smaller than the shortfall behind
 * a 5000 Leader, and 1000 is one ordinary Counter card. So a seat that was going
 * to pay for this hit anyway pays less for it from behind the block, and
 * `counter-over-dying-block` -- which declines the block *in order to* pay --
 * is refusing the cheaper half of its own plan.
 *
 * ## Why this can promise what it promises
 *
 * Blocking here spends the body unless the Counter window saves it, so the rule
 * may only fire where that window will. {@link willSpendToSaveCharacter} is the
 * function that window decides with, asked about the interposed body and its
 * smaller shortfall -- the same sharing, for the same reason, as
 * {@link leaderCounterBudget}. A promise priced differently from the payment is
 * a promise the next window refuses, and the body then dies for nothing.
 *
 * Fires only where a payable line exists to compare against. Without one,
 * passing spends Life rather than cards, and "fewer cards" stops being the same
 * trade in a cheaper currency.
 */
export function createBlockDiscountModule(
  options: CounterPolicyOptions = {},
): PolicyModule {
  return {
    id: "block-discount",
    decide(context) {
      const observation = context.observation;
      const counters = observation.self.hand.map((card) => card.currentCounter);
      const best = cheapestBlockUnder(
        context,
        options,
        (body, shortfall, passCards) => {
          if (!Number.isFinite(passCards)) return undefined;
          if (
            !willSpendToSaveCharacter(
              observation,
              body.cardNumber,
              shortfall,
              options,
            )
          ) {
            return undefined;
          }
          const cards = counterCardsFromHand(counters, shortfall);
          return Number.isFinite(cards) ? cards : undefined;
        },
      );
      if (best === undefined) return undefined;
      return decision(
        best.action,
        "Block to cut the Counter bill: this body outpowers the Leader, so stopping the attack in front of it costs fewer cards than stopping it in front of the Leader.",
      );
    },
  };
}

/**
 * What a Character save is worth to the OP16 Green/Blue Luffy deck.
 *
 * `chooseGenericCounter` saves a Character only when it is named in
 * `protectedCards` *and* the shortfall is within `characterDefensePower`,
 * whose default is 1000 -- one Counter card. Two human-piloted wins in this
 * deck's worst matchups were blocked by exactly those two bounds, once each:
 * a Crocodile save at a shortfall of 1001, and a Prisoner of Impel Down that
 * is not in the set at all.
 *
 * The two are separate claims and are separate rules, so `--disable
 * counter-save#price` and `--disable counter-save#reach` price them one at a
 * time. Each only removes `pass`; `chooseGenericCounter` then builds the
 * cheapest line as it always does.
 */
const SAVE_BUDGET = 2_000;
const SAVE_PRICED = new Set(["OP16-045", "OP16-048", "OP16-056"]);
const SAVE_REACHED = new Set(["OP16-042", "OP16-032"]);

function savedCharacter(t: {
  observation: GameObservation;
}): { cardNumber: string; shortfall: number } | undefined {
  const observation = t.observation;
  const battle = observation.activeBattle;
  if (observation.phase !== "counter" || !battle) return undefined;
  const body = observation.self.board.find(
    (card) => card.instanceId === battle.targetInstanceId,
  );
  if (!body) return undefined;
  // The same guard `economicalCharacterSave` applies: never spend on a body
  // while the Life behind it is what is actually under threat.
  if (observation.self.lifeCount <= incomingLeaderDamage(observation)) {
    return undefined;
  }
  const shortfall =
    battle.attackPower - battle.targetPower - battle.counterPower + 1;
  if (shortfall <= 0 || shortfall > SAVE_BUDGET) return undefined;
  return { cardNumber: body.cardNumber, shortfall };
}

const savePriced = (t: { observation: GameObservation }): boolean => {
  const save = savedCharacter(t);
  // Above the default budget only: at or below it the generic policy already
  // saves these, and a rule that also fires there would be scored a win for
  // behaviour it did not change.
  return (
    save !== undefined &&
    save.shortfall > 1_000 &&
    SAVE_PRICED.has(save.cardNumber)
  );
};

const saveReached = (t: { observation: GameObservation }): boolean => {
  const save = savedCharacter(t);
  return save !== undefined && SAVE_REACHED.has(save.cardNumber);
};

export const COUNTER_SAVE_RULES: readonly Heuristic[] = [
  mustAct(
    "Save this Character: it is worth more than the default one-card budget allows for it.",
  )
    .as("price")
    .when(savePriced)
    .insteadOfPass(savePriced),
  mustAct(
    "Save this Character: the deck's [Blocker] wall and its largest body are not replaceable bodies.",
  )
    .as("reach")
    .when(saveReached)
    .insteadOfPass(saveReached),
];

/**
 * The cards this seat's next turn will actually put on the board.
 *
 * Highest cost first, because that is the order `chooseGenericRules` develops
 * in ("develop the highest-cost legal card"), and the question is not what the
 * hand *could* deploy but what it *will*. The budget is the cost area plus the
 * two DON!! a turn adds, capped at the ten a DON!! deck holds.
 *
 * Instance ids rather than card numbers: a hand holding four of one card
 * deploys one of them, and the other three are surplus.
 */
function deployedNextTurn(observation: GameObservation): ReadonlySet<string> {
  let budget = Math.min(
    10,
    observation.self.activeDon + observation.self.restedDon + 2,
  );
  const deployed = new Set<string>();
  for (const card of [...observation.self.hand].sort(
    (left, right) => right.cost - left.cost,
  )) {
    if (card.cost > budget) continue;
    budget -= card.cost;
    deployed.add(card.instanceId);
  }
  return deployed;
}

/**
 * The single Counter card that closes this Leader hit and is surplus to the
 * next turn's development, if there is one.
 *
 * Two conditions, and the rule below needs both.
 *
 * **One card closes it** -- the whole shortfall, not a dent in it. What the
 * rule is trading is the *entire* price of the defence against one Life, and a
 * card that halves the gap leaves a second card to find.
 *
 * **And that card was never going to be cast.** A Counter card is only "saved
 * for later" if later has a use for it other than Countering, and
 * {@link deployedNextTurn} is that test: a card the next turn's DON!! will not
 * reach is a Counter card whatever else is printed on it. This is the half that
 * keeps the rule off the deck's cheap bodies -- a 1-cost searcher with a 2000
 * Counter is the card the turn is going to play, and spending it to save one
 * Life costs a development the deck cannot buy back.
 */
export function surplusCardClosesLeaderHit(
  observation: GameObservation,
): boolean {
  const battle = observation.activeBattle;
  if (!battle?.targetInstanceId.endsWith("-leader")) return false;
  const required =
    battle.attackPower - battle.targetPower - battle.counterPower + 1;
  if (required <= 0) return false;
  const deployed = deployedNextTurn(observation);
  return observation.legalActions.some(
    (action) =>
      action.type === "counter" &&
      (action.counterPower ?? 0) >= required &&
      !deployed.has(action.cardInstanceId),
  );
}

/**
 * Pay one card for one Life whenever one card is the whole price.
 *
 * `mustPreventCurrentLeaderHit` is the only reason `chooseGenericCounter` ever
 * spends on a Leader hit, and it is a survival test: above 2 Life it counts
 * only the damage that can still land *this* turn, so a hit that is not part of
 * a lethal sequence is absorbed however cheaply it could have been stopped. The
 * card is kept for "future defense", and the reason string says so.
 *
 * What that reasoning leaves out is the exchange rate. A Counter card saved is
 * saved to stop a later hit, and stopping a later hit costs the same one card.
 * So holding it does not buy a cheaper save; it buys the *same* save, later,
 * against a board that is bigger. Where one card is the whole price, the trade
 * is available now and will not improve.
 *
 * `LEADER_COUNTER_BUDGET`'s own doc prices a one-card line as "roughly even",
 * because absorbing a hit puts the Life card into hand -- so the deck that
 * should take this trade is one for which that extra card is worth least. That
 * is a claim about a deck's curve, not about the rules, which is why this ships
 * per deck rather than format-wide: a seat holding cost-5 bodies it cannot cast
 * for several turns is holding Counter cards whatever it calls them, and the
 * Life card it would gain lands in a hand that is already past what its DON!!
 * can deploy.
 *
 * Measured on (Green) Dracule Mihawk, whose hand is four-of cost-5 bodies: over
 * 20 games against the OP-17 Sabo list the seat faced 11.2 Leader-hit Counter
 * decisions a game and declined 2.55 of them a game that its hand could have
 * stopped -- every one of the 20 at 5 Life, 14 of 27 at 4 Life. Restricting the
 * rule to a one-card close reaches 63% of those declines while speaking at 39%
 * of the decisions; adding a hand-liquidity term on top changed no decision,
 * because a hand that can spare the card is exactly the hand that has one.
 *
 * A `mustAct` rather than a preference, for the reason that terminal exists:
 * the decision it has to overturn is `chooseGenericCounter` choosing `pass`,
 * and `resolveWithModules` applies a `pass` veto only when a non-`pass` action
 * survives -- so a position where `counter-budget` has refused the whole line
 * is left exactly as it was.
 */
export function createOneCardLifeSaveModule(): PolicyModule {
  return heuristics("one-card-life-save", [
    mustAct(
      "Spend the one Counter card that stops this Leader hit: holding it buys the same one-card save later, against a bigger board.",
    )
      .when(
        (t) =>
          t.opponentArchetype === "aggro" &&
          surplusCardClosesLeaderHit(t.observation),
      )
      .insteadOfPass((t) => surplusCardClosesLeaderHit(t.observation)),
  ]);
}
