import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import {
  createBlockDiscountModule,
  createPayoffKoBlockModule,
} from "../format/defence.js";
import { heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { selfLeaderId } from "../tactics.js";
import { createMulliganModule } from "../mulligan.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { PolicyModule } from "../policy-module.js";
import type { HandCard, Tactics } from "../tactics.js";

const KRIEG_LEADER = "OP15-001";
/** OP15-026 Jango, whose `[Activate: Main]` cost is trashing itself. */
const JANGO = "OP15-026";
/** OP15-015 Higuma, the 1-cost whose `[On Play]` is the same gift. */
const HIGUMA = "OP15-015";
/** The three bodies whose `[Activate: Main]` hands a DON!! over every turn. */
const GIFT_ENGINES = ["OP15-003", "OP15-017", "OP15-023"];

/**
 * The two bodies this deck loses something by losing.
 *
 * `chooseGenericCounter` defends a Character only when it is named here, so the
 * question is which bodies are worth a card. Most of this fifty is not: every
 * gift the deck has already made stays made, and three of its Characters are
 * worth as much dead as alive -- OP15-023 Arlong's `[On K.O.]` holds two of the
 * opponent's rested cards down through their Refresh Phase, OP15-011 Pearl's
 * K.O.s a 6000-base-power body on the way out, and OP15-003 Alvida already
 * refuses her own K.O. for a small Character out of hand.
 *
 * What is left is the two that keep paying while they stand: OP15-017 Morgan, a
 * [Blocker] whose `[Activate: Main]` hands over a DON!! every turn, and
 * OP15-025 Kuro, the 7-cost [Blocker]. Losing either is losing a gift a turn
 * and a body in front of the Leader.
 *
 * `economicalCharacterDefense` is left at its default, so even these two are
 * defended only when 1000 of Counter saves them and the Life stack can afford
 * the turn.
 */
const KRIEG_PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  "OP15-017",
  "OP15-025",
]);

/**
 * The one body on this fifty that is worth more dead than standing *and* can
 * reach a block window.
 *
 * The set above names what the Counter phase will spend a card to keep; this
 * names the opposite, and the block window needs it stated rather than inferred
 * from the absence. OP15-011 Pearl defends at 6000 under an East Blue Leader and
 * K.O.s an opposing Character of 6000 base power or less on its way out, so
 * putting it in front of a Leader hit spends nothing: the Life stays, the hand
 * stays, and a removal clause that has no other way to fire resolves.
 *
 * The deck's other two bodies of this kind -- OP15-023 Arlong and OP15-003
 * Alvida -- print no [Blocker], so no block window can ever offer them and
 * naming them here would be naming something unreachable.
 */
const KRIEG_PAYOFF_ON_KO: ReadonlySet<string> = new Set(["OP15-011"]);

/**
 * What this deck will and will not spend a Counter card on, shared by the two
 * windows that have to agree about it.
 *
 * The block window decides one step before the Counter window and, when it
 * blocks to cut the bill, does so on the strength of what that window will pay.
 * Handing both the same object is what makes the promise real.
 */
const KRIEG_COUNTER_OPTIONS = {
  protectedCards: KRIEG_PROTECTED_FROM_COUNTER,
} as const;

/**
 * (Red/Green) Krieg's block window, which a human game of this deck found
 * wholly unpiloted in the same way its Counter phase was.
 *
 * Replaying that trace, Pearl was offered as a blocker three times in one turn
 * and declined three times, the seat paying four Counter cards for Life that two
 * -- or none -- would have bought. Both rules below are about this deck's own
 * arithmetic: its Leader is a 5000 that all three of its [Blocker] bodies
 * outpower, and its 4-cost Blocker would rather die than stand.
 *
 * Two modules rather than one, because they are two claims. The payoff K.O. is
 * free and asks nothing of the Counter window; the discount is a promise that
 * window has to honour. Measured apart, they can also be shipped apart.
 */
export function createOp15KriegPayoffKoBlockModule(): PolicyModule {
  return createPayoffKoBlockModule(KRIEG_PAYOFF_ON_KO, KRIEG_COUNTER_OPTIONS);
}

export function createOp15KriegBlockDiscountModule(): PolicyModule {
  return createBlockDiscountModule(KRIEG_COUNTER_OPTIONS);
}

/**
 * OP-15 (Red/Green) Krieg's Counter phase.
 *
 * `pnpm census --deck "(Red/Green) Krieg - Official Feature Deck"` reads
 * `counter:counter` at 3.15 decisions a game with **100.0% no rule at all**,
 * which is the deck's largest wholly unpiloted surface: an unnamed
 * `protectedCards` set means every Character this deck owns is left to die
 * rather than spend a card, and the cards it is saving are 1000- and 2000-power
 * Counters off a fifty whose cheap half is all Counter.
 *
 * A whole decision rather than a narrowing, so it is a `decide` rather than a
 * heuristic: the choice it overrides is made inside `chooseGenericCounter`.
 */
export function createOp15KriegCounterPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== KRIEG_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(
      observation,
      observation.legalActions,
      KRIEG_COUNTER_OPTIONS,
    );
  };
}

/**
 * Do not trash Jango for a gift the turn cannot cash.
 *
 * OP15-026's `[Activate: Main]` trashes the Character to give one of the
 * opponent's rested DON!! cards to one of their Characters, and the generic
 * ladder takes the first activation it is offered -- so on this deck's first
 * turn it plays the 1-cost body and immediately trashes it, spending a 2000
 * body and a 1000 Counter on a marker.
 *
 * What makes the gift worth a card is the Leader: its `[Activate: Main]` rests
 * one of their Characters carrying **2 or more** given DON!! cards. So a gift
 * onto a body that already carries one is the second half of a rest, and a gift
 * onto a fresh body is a marker whose payoff is a turn away at best -- and the
 * DON!! returns to their cost area at their own Refresh Phase, so "at best"
 * usually means never.
 *
 * The gate is the board rather than the target, because the engine asks which
 * Character receives the DON!! only after the activation has been taken and the
 * cost paid. `never` rather than a rank: this is about not doing a kind of
 * thing in this state, and the alternative -- leaving the body on the board --
 * is not another action to prefer.
 */
export function createOp15KriegJangoModule(): PolicyModule {
  return heuristics("op15-krieg-jango", [
    never(
      "Do not trash Jango for a gift no Character can be rested by: nothing on their board carries a DON!! yet.",
    )
      .when((t) =>
        t.observation.opponent.board.every((card) => card.attachedDon === 0),
      )
      .activate((action) => action.sourceCardNumber === JANGO),
  ]);
}

/**
 * Whether the opponent's cost area holds a DON!! these gifts can move.
 *
 * Both clauses below compile to `attach-don { player: "opponent", from:
 * "rested" }` -- the DON!! comes out of the *opponent's own rested pile* and
 * lands on one of their Characters, which is what makes giving it to them a
 * cost to them rather than a present. An empty rested pile therefore pays
 * nothing at all: the engine resolves the clause and emits `don-attached` with
 * `count: 0`.
 *
 * That pile is empty far more often than the board suggests, because a DON!!
 * the opponent attached to a card of theirs has left the cost area. In the
 * trace this was found in, the opposing seat spent both of its DON!! on
 * attachments every turn, so its rested pile stood at zero on every turn Krieg
 * looked at it.
 */
function nothingToGive(t: Tactics): boolean {
  return t.observation.opponent.restedDon === 0;
}

/**
 * Do not spend a card on a gift the opponent's cost area cannot pay.
 *
 * Two clauses, one arithmetic, and both were found in the same game against a
 * seat holding no rested DON!!:
 *
 *  - **OP15-015 Higuma** was played on this deck's first turn into an empty
 *    board. Its `[On Play]` gives a rested DON!! of theirs to one of their
 *    Characters and then shrinks a Character carrying a given DON!! by 1000;
 *    with no board there is nothing to receive either half, and the card spent
 *    is this fifty's only 1000-power body and one of its 2000 Counters. The
 *    three other 1-cost bodies in the deck are all 2000, so at this cost
 *    Higuma is the play that buys the least the moment its clause is dead.
 *  - **OP15-026 Jango** was trashed for the same gift on a turn the opponent's
 *    cost area was empty -- `don-attached ... count: 0` in the trace. The body
 *    and its 1000 Counter are gone and nothing moved.
 *
 * Both are dominance rather than judgement: the clause provably resolves to
 * nothing, and held, each card is still a Counter and still the same clause on
 * a turn that can pay for it.
 *
 * Separate from {@link createOp15KriegJangoModule}, which is the other reason
 * to hold Jango and a different claim: that one declines a gift the *Leader*
 * cannot cash, on a board where the gift would land. This one declines a gift
 * that does not happen. Two modules so `pnpm deck:ab --disable` can price them
 * apart.
 *
 * Higuma keeps the debuff half, which is why its gate is not `nothingToGive`
 * alone: a Character of theirs already carrying a given DON!! can still be
 * shrunk by 1000 for the turn, and that is a live clause on a turn with a
 * battle in it.
 */
export function createOp15KriegDeadGiftModule(): PolicyModule {
  return heuristics("op15-krieg-dead-gift", [
    never(
      "Do not play Higuma into an [On Play] that finds nothing: their cost area holds no rested DON!! to give and no Character of theirs carries one to shrink. Held, it is a 2000 Counter; played, it is the deck's only 1000 body.",
    )
      .when((t) => {
        const opponent = t.observation.opponent;
        // No recipient at all -- the deck's own first turn, where this was
        // found. Stated separately because the pile may be non-empty and the
        // gift still have nowhere to land.
        if (opponent.board.length === 0) return true;
        return (
          nothingToGive(t) &&
          opponent.board.every((card) => card.attachedDon === 0)
        );
      })
      .play((card) => card.cardNumber === HIGUMA),

    never(
      "Do not trash Jango for a gift their cost area cannot pay: with no rested DON!! of theirs to move, the activation spends the body and hands over nothing.",
    )
      .when(nothingToGive)
      .activate((action) => action.sourceCardNumber === JANGO),
  ]);
}

/**
 * The cost of the dearest play on offer, which is the band the ladder develops.
 *
 * The rule below is silent outside it, which is what keeps it an ordering
 * rather than a plan: the ladder still decides *which cost* to spend, and this
 * only says which card to spend it on. Printed cost, for the same reason
 * `equal-cost-play` uses it -- it is the figure the line being refined sorts by.
 */
function topPlayBand(t: Tactics): number {
  return Math.max(
    ...t.observation.legalActions
      .filter((action) => action.type === "play-card")
      .map(
        (action) =>
          t.hand.find((card) => card.instanceId === action.cardInstanceId)
            ?.cost ?? -1,
      ),
  );
}

/** The held card a `play-card` action would cast, when it is in the top band. */
function playedInTopBand(
  action: LegalAction,
  t: Tactics,
): HandCard | undefined {
  if (action.type !== "play-card") return undefined;
  const card = t.hand.find((held) => held.instanceId === action.cardInstanceId);
  return card && card.cost === topPlayBand(t) ? card : undefined;
}

/**
 * Bandai's own guide for this deck, as an ordering.
 *
 * > In the early game, focus on bringing out "OP15-026 Jango" and gathering
 * > Characters that can give DON!! cards to your opponent, like "OP15-023
 * > Arlong."
 *
 * Only the first half needs saying here. The second is already what the seat
 * does: `equal-cost-play` separates two cards of one cost by what they are
 * worth standing there, and the gift engines out-body their own cost band --
 * OP15-023 Arlong is a 5000 where the other 4-cost is a 4000, and the two
 * 5-costs are both engines.
 *
 * The first half is not a claim the format layer could make. `equal-cost-play`
 * separates
 * two cards of one cost by what they are worth standing there, and says so in
 * its own comment: a 1-cost searcher against a 1-cost 2000 reads as the 2000,
 * because what an `[On Play]` is worth is the deck's plan rather than a fact
 * about the cards. This deck has four 1-cost 2000 bodies and the tie between
 * them falls to hand order; the guide breaks it.
 *
 * `rank` at deck weight rather than `rank-among`, because a
 * `rank-among` module protects its own best candidate and `equal-cost-play`
 * scores the same band -- a tie at the top of its scoring would protect the
 * cards this is trying to sort behind Jango, and the ordering would not happen.
 */
export function createOp15KriegJangoFirstModule(): PolicyModule {
  return heuristics("op15-krieg-jango-first", [
    prefer(
      "Lead with Jango: at this cost it is the only body that replaces itself, and what it digs for is the gift engine the rest of the plan needs.",
    )
      .by(WEIGHT.deck)
      .action((action, t) => playedInTopBand(action, t)?.cardNumber === JANGO),
  ]);
}

/**
 * The dearest body the turn can still pay for, which is what the aura yields to.
 *
 * Read off the hand rather than `t.affordablePlays`, because this is asked from
 * inside a veto. `heuristics` narrows the candidate list as a rule's own
 * vetoes land and re-derives `Tactics` from what is left, so by the time the
 * rule below is offered an activation its own veto has already taken every
 * `play-card` out of `legalActions` -- and `affordablePlays` reads empty, which
 * scores the reserve as free and silently switches the rule off.
 *
 * `currentCost` rather than the printed cost, and Events excluded: this is the
 * board the turn is being asked to give up a DON!! for.
 */
function dearestPlay(t: Tactics): number {
  const pool = t.observation.self.activeDon;
  return Math.max(
    0,
    ...t.hand
      .filter(
        (card) => card.facts.category !== "event" && card.currentCost <= pool,
      )
      .map((card) => card.currentCost),
  );
}

/**
 * Put a DON!! on the Leader before spending the turn on a body.
 *
 * OP15-001's other clause is `[DON!! x1] [Opponent's Turn]`: while every
 * Character on your own field is {East Blue} -- which in this fifty is always
 * -- all of their Characters are 2000 smaller on their turn. One DON!! under
 * the Leader buys that, and the same DON!! is +1000 on the Leader's own attack
 * first, so it is the cheapest defensive card the deck has.
 *
 * The format's `aura-attachment` is this rule and cannot reach this Leader: its
 * text gate is `buffsAllCharacters`, derived as "all of your Characters", and
 * this clause debuffs all of *theirs*.
 *
 * Written as a veto rather than a preference for the attachment, because
 * `chooseGenericRules` fixes the order plays, activations, attachments,
 * attacks: a preference among attachments can only choose which unit receives
 * one, never move the attachment ahead of a body.
 *
 * ## What the veto has to cover
 *
 * Everything above the attachment in that order which spends DON!! out of the
 * active pool, or the reserve leaks through the gap and the rule undoes itself.
 * A trace found it doing exactly that on a 5-DON!! turn: plays were vetoed, the
 * ladder fell through to the next rung and cast a 1-cost Event, and the
 * headroom gate -- now reading 4 DON!! against a 4-cost body -- stood down and
 * let that body take the rest. The Leader ended the turn bare, attacking for
 * 5000 instead of 6000 and with no debuff on the opponent's turn.
 *
 * The rung it fell through to is `activate-main`, which is two different
 * things. A board `[Activate: Main]` costs this deck nothing out of the active
 * pool -- the Leader's rest, Jango's self-trash and the three engines are free
 * or paid in the *opponent's* DON!! -- and taking one before the attachment is
 * harmless. Casting an Event from hand is offered as the same action type and
 * is not free: it pays its printed cost out of the pool this rule is
 * reserving from. Holding a card in hand is what tells the two apart.
 *
 * An Event is refused only when paying for it is what breaks the reserve, not
 * because it is an Event. Both of this deck's 1-cost Events dig for the engine
 * the rest of the plan is looking for, and a turn with room for the search, the
 * body and the attachment should have all three -- refusing the search whenever
 * the Leader is bare measured -1.2pt field-wide against letting it through.
 *
 * ## The headroom gate
 *
 * What makes the whole rule sequencing rather than a trade: after the
 * attachment the dearest play now affordable must still be affordable, so the
 * aura is bought with a DON!! the turn was not going to spend on the board. The
 * Event is held to the same arithmetic one DON!! further on -- its cost has to
 * come out of the pool as well.
 */
export function createOp15KriegAuraModule(): PolicyModule {
  return heuristics("op15-krieg-aura", [
    never(
      "Switch the Leader's -2000 on before developing: the DON!! under it is the deck's defence on their turn.",
    )
      .by(WEIGHT.deck)
      .when((t) => {
        const observation = t.observation;
        if (observation.phase !== "main") return false;
        if (observation.turnPlayer !== observation.viewer) return false;
        if (observation.self.leader.attachedDon > 0) return false;
        const leaderId = selfLeaderId(observation);
        const attaches = observation.legalActions.some(
          (action) =>
            action.type === "attach-don" &&
            action.targetInstanceId === leaderId,
        );
        if (!attaches) return false;
        return observation.self.activeDon - 1 >= dearestPlay(t);
      })
      .action((action, t) => {
        if (action.type === "play-card") return true;
        if (action.type !== "activate-main") return false;
        // An Event cast, which is the half of `activate-main` that spends the
        // reserve. A board ability's source is on the field, not in hand.
        const held = t.hand.find(
          (card) => card.instanceId === action.sourceInstanceId,
        );
        if (held === undefined || held.cost === 0) return false;
        // The same headroom question one Event further on: refuse it only when
        // its cost is what leaves the turn unable to afford both the body and
        // the DON!! under the Leader.
        return t.observation.self.activeDon - held.cost - 1 < dearestPlay(t);
      }),
  ]);
}

/**
 * The opening hand: keep on Jango or on a gift engine.
 *
 * > In the early game, focus on bringing out "OP15-026 Jango" and gathering
 * > Characters that can give DON!! cards to your opponent, like "OP15-023
 * > Arlong."
 *
 * The generic keep is `anyEarlyPlay` -- any card costing 2 or less -- and in
 * this fifty that is true of nearly every opening hand, because twenty-four of
 * the fifty cards cost 1. It asks whether the hand can act on turn one, and
 * this deck's question is a different one: whether the hand holds the engine.
 * Three of the four cards named here cost 4 or 5 and are not early plays at
 * all; what they are is the thing the early plays are looking for.
 *
 * `GIFT_ENGINES` are the three `[Activate: Main]` bodies, each of which hands a
 * DON!! over every turn it stands, and Jango is the 1-cost that digs 3 for one
 * of them.
 */
export function createOp15KriegMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op15-krieg-mulligan",
    keep: (observation) =>
      observation.self.hand.some(
        (card) =>
          card.cardNumber === JANGO || GIFT_ENGINES.includes(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with OP15-026 Jango or one of the [Activate: Main] gift engines: the engine is what every other card in this deck is looking for.",
    mulliganBecause:
      "Mulligan a hand with no Jango and no gift engine: a hand of 1-cost bodies can act on turn one and has nothing to give DON!! with afterwards.",
  });
}
