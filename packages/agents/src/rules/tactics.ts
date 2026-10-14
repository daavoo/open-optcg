import type {
  CardFacts,
  GameObservation,
  LegalAction,
} from "@one-piece-sim/protocol";
import {
  attackerPower,
  opponentLeaderId,
  selfLeaderId,
  targetPower,
  viableAttacks,
  type AttackAction,
} from "./generic-policy.js";
import { archetypeOf, type Archetype } from "./policy-module.js";
import {
  counterCardsFromHand,
  counterCardsNeeded,
  counterDemand,
  incomingLeaderAttacks,
  attacksAreLethal,
  incomingLeaderDamage,
  incomingLeaderDamages,
  ownAttackerLeaderDamage,
} from "./combat.js";
import { race, type Race } from "./race.js";

/**
 * The derived facts a heuristic actually reasons about.
 *
 * Every deck policy in this package re-derives the same handful of quantities
 * from `GameObservation`: how much DON!! is spendable, how much Counter is in
 * hand, how much power an attack needs before the defender has to spend a
 * second Counter card. They derive them slightly differently, none of them share
 * the arithmetic, and the ones that are wrong are wrong quietly.
 *
 * `Tactics` is that vocabulary computed once per decision point. It is
 * deliberately pure: it reads the observation and nothing else, so it works
 * identically for an in-process rules agent, a replayed trace and an LLM
 * prompt.
 *
 * The combat arithmetic follows the format's actual rules rather than intuition:
 *
 *  - **The attacker wins ties.** A 5000 attack beats a 5000 defender, so the
 *    defender must *exceed*, not match. `counterDemand` returns `attack -
 *    defense + 1`, and every threshold below is built from that.
 *  - **Counter comes in 1000 and 2000 steps.** Raising an attack from 5000 to
 *    6000 does not add 1000 of pressure, it adds a whole extra card out of the
 *    defender's hand. `counterCardsNeeded` prices attacks in cards, which is
 *    the resource that actually runs out.
 */

/**
 * The Character area's capacity, from `placeCharacter` in `effects.ts`.
 *
 * Lives here rather than beside the rules that read it because `tactics.ts` is
 * the lowest layer of the policy stack: a heuristic module can import from it,
 * and the reverse would be a cycle.
 */
export const CHARACTER_AREA_LIMIT = 5;

export interface HandCard {
  instanceId: string;
  cardNumber: string;
  name: string;
  /** Printed cost. */
  cost: number;
  /**
   * What the engine will actually charge to play this card right now.
   *
   * Equal to {@link cost} for most cards and for most turns, and the whole of
   * some cards' text when it is not: ST33-004 Borsalino reads `give this card in
   * your hand -3 cost` during a turn an effect trashed from that hand, so on the
   * turn its deck's engine fires it is a 3-cost 6000 [Blocker] and every other
   * turn it is a 6-cost one. A rule that prices a play off the printed number
   * cannot see the difference, and comparing the two is how a rule says "a
   * discount is live".
   *
   * The observation has carried this since hand pricing was split from board
   * `currentCost`; it was simply not on this interface, so every rule reading
   * `t.hand` saw only the printed cost.
   */
  currentCost: number;
  counter: number;
  facts: CardFacts;
}

export type PlayAction = Extract<LegalAction, { type: "play-card" }>;
export type AttachDonAction = Extract<LegalAction, { type: "attach-don" }>;
export type ActivateMainAction = Extract<
  LegalAction,
  { type: "activate-main" }
>;
export type CounterAction = Extract<LegalAction, { type: "counter" }>;
export type BlockAction = Extract<LegalAction, { type: "block" }>;
export type TriggerAction = Extract<LegalAction, { type: "resolve-trigger" }>;

export interface Tactics {
  readonly observation: GameObservation;
  readonly actions: readonly LegalAction[];

  readonly turn: number;
  readonly selfLeader: string;
  readonly opponentLeader: string;
  readonly selfArchetype: Archetype;
  readonly opponentArchetype: Archetype;

  /** DON!! that can still be spent this turn. */
  readonly don: number;
  /**
   * Active plus rested DON!!: what the cost area holds, given DON!! excluded.
   *
   * Not the number a printed clause means by "DON!! cards on your field" --
   * that is {@link fieldDon}. This is the pool the turn can still spend or
   * convert, which is what the ramp-ordering rules read.
   */
  readonly donOnField: number;
  /**
   * Every DON!! the viewer controls: active, rested, and given to the Leader
   * or a Character. The count the cards themselves use.
   *
   * Nine printed clauses in the selectable decks compare "the number of DON!!
   * cards on your field" with the opponent's, or gate on it -- EB04-038 and
   * OP12-073's catch-up ramp, Enel's six-DON!! ceiling, Kaido's cap -- and
   * the engine's `fieldDonCount` answers them including attached DON!!. A rule
   * that compares {@link donOnField} instead holds a catch-up ramp back exactly
   * when its clause would have fired, because the DON!! already given to a body
   * is the part of the count that decides it.
   */
  readonly fieldDon: number;
  /** The same count for the opponent. */
  readonly opponentFieldDon: number;

  readonly selfLife: number;
  readonly opponentLife: number;
  readonly opponentHandCount: number;

  /** The viewer's hand, joined with printed card facts. */
  readonly hand: readonly HandCard[];
  /** Total Counter power sitting in hand. */
  readonly counterPower: number;
  /** Hand cards that can be spent as Counter at all. */
  readonly counterCards: number;

  readonly selfLeaderPower: number;
  readonly opponentLeaderPower: number;
  /** Opposing Characters that could block an attack right now. */
  readonly opponentBlockers: number;
  /**
   * True once this seat's Leader has spent its `[Once Per Turn]` reaction this
   * turn, and false when the Leader prints none.
   *
   * Read straight off the observation rather than inferred. A reaction fires
   * off the signal stream instead of being offered as an action, so unlike an
   * `[Activate: Main]` nothing vanishes from `legalActions` once it has paid, so
   * without this field a policy cannot tell a turn's first DON!! return, the
   * cheap one, from its second.
   */
  readonly leaderReactionSpent: boolean;

  /**
   * Attacks that would win their battle if declared now.
   *
   * Derived from `observation.legalActions`, so it is empty at any decision
   * where the engine is offering something other than attacks -- inside a
   * pending effect, `resolve-effect` offers only that effect's own options. A
   * rule phrased as "what could I attack with afterwards" therefore cannot be
   * asked from one of those decisions.
   */
  readonly viableAttacks: readonly AttackAction[];
  /** Plays the viewer can currently afford, as offered by the engine. */
  readonly affordablePlays: readonly PlayAction[];
  /** Cost of the dearest play currently affordable, or 0 when there is none. */
  readonly dearestAffordablePlay: number;
  /** Cost of the cheapest play currently affordable, or 0 when there is none. */
  readonly cheapestAffordablePlay: number;
  /**
   * True when spending one DON!! on an attachment would leave the viewer unable
   * to make *any* play this turn.
   *
   * DON!! given to a Leader or Character leaves the cost pool for the rest of
   * the turn, so "power up first, develop later" is not a free ordering.
   * `analysis/human-test-01-manual-vs-rules.md` records the concrete loss: ST31
   * spent its only turn-1 DON!! powering up a Leader that then could not attack,
   * instead of playing the 1-cost searcher, and never recovered the tempo.
   *
   * Scoped to "any play at all" rather than "the best play" on purpose. Several
   * Leaders in the format gate their whole ability on `[DON!! x1]` -- ST31's
   * Luffy and ST35's Sabo both do -- so a rule that reserved every DON!! that
   * some expensive card could use would starve those Leaders permanently. This
   * one fires only where the trade is unambiguous: a body and a rested DON!!
   * against +1000 power that buys nothing.
   */
  readonly attachmentBlocksAllDevelopment: boolean;
  /**
   * What the engine will charge for the cheapest [Counter] Event in hand, or 0
   * when there is none.
   *
   * A Counter Event is paid for with *active* DON!! during the opponent's turn,
   * which means it can only ever be cast with DON!! deliberately left unspent.
   * `chooseGenericRules` ends every turn by converting leftover DON!! into
   * Leader power, which rests it, so without this a deck holding one of these
   * never reaches the opponent's turn able to cast it.
   */
  readonly cheapestCounterEventInHand: number;

  // --- Race position ---------------------------------------------------------
  //
  // `generic-policy.ts` forecasts defence too, and a second implementation here
  // would drift from it, so these expose exactly what `combat.ts` computes --
  // the single implementation both layers call, with no parallel arithmetic.

  /**
   * Attacks the opponent could aim at the viewer's Leader next turn.
   *
   * A pessimistic count, not a forecast: see {@link incomingLeaderAttacks}. It
   * ignores restands, Counter Events and DON!! not yet attached.
   */
  readonly incomingLeaderAttacks: number;
  /**
   * Life those attacks would take, which is not the same number: an attacker
   * with [Double Attack] takes two.
   *
   * Exposed beside the attack count rather than replacing it, because a rule
   * asking "how many swings am I facing" and a rule asking "how much Life am I
   * facing" are different questions and both have callers.
   */
  readonly incomingLeaderDamage: number;
  /**
   * True when the attacks the opponent can still aim at this Leader would
   * actually end the game.
   *
   * The threshold the generic Blocker policy uses to decide a hit *must* be
   * prevented, exposed so a deck rule can reach the same conclusion without
   * re-deriving it. Priced in Life rather than in swings, and answered by
   * {@link attacksAreLethal} rather than by comparing a sum: a battle wins only
   * by being *declared* against a player already on 0 Life, so a kill needs the
   * attacks that empty the Life stack plus one more.
   *
   * That distinction is [Double Attack]'s. At 2 Life a single such attacker
   * empties the stack and does not win; at 1 Life it takes the one card and the
   * second point does nothing at all. Reading either as lethal is how a defender
   * at 1 Life talks itself into spending a whole hand on a hit it survives.
   */
  readonly facingLethal: boolean;
  /**
   * True when the battle in front of the viewer is aimed at their own Leader.
   *
   * The distinction the block-forcing rules turn on. `mustAct(...).insteadOfPass`
   * removes `pass` from a decision point, and a Block step offers `pass` whether
   * the attack is aimed at the Leader or at a Character -- so a rule phrased as
   * "block rather than absorb" fires on both, and on a Character attack there is
   * no Life to absorb: blocking there redirects the hit onto a second body and
   * gives up two Characters instead of one.
   */
  readonly leaderUnderAttack: boolean;
  /**
   * True when the battle in front of the viewer would still take the target
   * down: the attack reaches the defence the target has *right now*, counting
   * every point already added to this battle.
   *
   * The companion `leaderUnderAttack` needs: that one says a hit is aimed at
   * the Leader, not that it is going to land. The Block step opens after the
   * `[On Your Opponent's Attack]` ladder has already resolved, so a defence
   * bought there -- OP17-040 Edward.Newgate's +3000, OP17-057 Fullalead's
   * +1000 -- is on the battle before anything is asked about blocking. A rule
   * that forces a block off `leaderUnderAttack` alone therefore spends a
   * Blocker on a hit that was stopped a decision ago, and spends it *twice
   * over*: the card that bought the defence is gone too, for one Life that was
   * never going to be taken.
   *
   * False with no battle in front of the viewer, so it never turns a
   * main-phase rule on.
   */
  readonly battleHitLands: boolean;

  /** Viable attacks aimed at the opposing Leader. */
  readonly leaderAttacks: readonly AttackAction[];
  /**
   * Upper bound on Life the viewer can take this turn.
   *
   * Counts attacks that already out-power the Leader. It is an **upper bound,
   * not a plan**: the opponent's hand is hidden, so Counter cards and Blockers
   * can reduce it, and a rule that treats it as a guaranteed kill will misplay.
   */
  readonly maxLeaderHits: number;
  /**
   * Life {@link maxLeaderHits} would take: the same attacks, priced in Life.
   *
   * The number a kill is actually counted in. Four attacks are not four Life
   * when one of them has [Double Attack], and the deck that most wants this
   * number -- OP-17 Red Ace, four copies of OP16-003 -- is the one whose Leader
   * swing is worth two.
   */
  readonly maxLeaderDamage: number;
  /**
   * True when {@link maxLeaderDamage} alone would empty the opponent's Life and
   * no Blocker is on their board.
   *
   * Still an upper bound -- Counter cards are hidden -- but the Blocker check
   * removes the most common reason the line simply does not exist.
   *
   * **Emptying the Life stack is not the same as winning**, and this field
   * deliberately reports the former: a battle wins only when an attack is
   * declared against a player already on 0 Life, so a board that reads
   * `lethalInRange` at exactly the opponent's Life total needs one more attack
   * than it has. {@link attacksAreLethal} is the question "does this win", and
   * the rules that press for a kill read this field as "the kill is close"
   * rather than as "the kill is there". Every deck rule gated on it is written
   * against that reading; a rule that wants the strict answer should ask
   * `attacksAreLethal` and be measured on its own.
   */
  readonly lethalInRange: boolean;

  /** Summed current power of the viewer's Characters. */
  readonly selfBoardPower: number;
  /** Summed current power of the opponent's Characters. */
  readonly opponentBoardPower: number;

  /**
   * DON!! the viewer will have available on their next turn.
   *
   * Everything on the field refreshes, plus two more off the DON!! deck when it
   * still holds them. Exact rather than assumed: the engine draws two per turn
   * (`turn === 2` draws one, which is unreachable as a viewer's *next* turn),
   * and `donDeckCount` bounds it.
   */
  readonly donNextTurn: number;

  /** Card numbers in the viewer's own trash, for recursion decks. */
  readonly trash: readonly string[];
  /**
   * The `[Activate: Main]` abilities and Events the engine is offering right
   * now, so a rule can ask "is my ramp still on the table" without filtering
   * `actions` by type and narrowing the union itself.
   */
  readonly activations: readonly ActivateMainAction[];

  /**
   * The race: each side's clock, and therefore which side is the aggressor.
   *
   * The strategic counterpart to everything above it. The fields on this
   * interface describe the position; `race` describes how much game is left and
   * who is winning it, which is what decides whether pressing or stabilising is
   * correct. Computed with the default abandon margin -- a profile that trusts
   * its own clock differently calls `race(t.observation, margin)` itself.
   *
   * It is a bound, not a forecast. See {@link Race}.
   */
  readonly race: Race;

  /** Copies of a card number in the viewer's hand. */
  copiesInHand(cardNumber: string): number;
  /** Copies of a card number among the viewer's Characters. */
  copiesOnBoard(cardNumber: string): number;
  /**
   * Whether an `[Activate: Main]` from this card is currently offered.
   *
   * The gate half of the question `HeuristicBuilder.activate` answers: a rule
   * that vetoes a play *because* a free ramp is still available reads this,
   * and the rule that ranks the ramp itself reads the action.
   */
  activationOffered(cardNumber: string): boolean;
  /** Current power of one of the viewer's own units, Leader included. */
  ownCurrentPower(instanceId: string): number | undefined;
  /**
   * True when the unit still needs DON!! to switch its own `[DON!! xN]` text on.
   *
   * The board's state and nothing else: it says the text is off, not that this
   * turn can turn it on. A rule pricing an *attachment* wants
   * {@link canCompleteDonAbility} instead -- "still short" is not a reason to
   * spend a DON!! here when the shortfall is larger than the turn can pay.
   */
  needsDonForAbility(instanceId: string): boolean;
  /**
   * True when the unit's own `[DON!! xN]` text is still off **and this turn can
   * switch it on**.
   *
   * The question {@link needsDonForAbility} leaves out, and the one an
   * attachment actually turns on. A given DON!! returns to the cost area at the
   * controller's next Refresh Phase (CR 6-2-3), so a `[DON!! xN]` condition
   * cannot be assembled across two of your own turns: every DON!! it needs has
   * to go on within this main phase. If the shortfall is larger than the DON!!
   * the turn can still spend, an attachment here buys no text -- only the
   * +1000 of 6-5-5-2, which is precisely what a unit printed at low power does
   * not have, and which is gone again by the opponent's turn.
   *
   * Accumulating *within* the turn is the case this deliberately allows: ST32's
   * `[DON!! x3]` Leader is worth the first of three attachments while the other
   * two are still affordable, and worth none of them when they are not.
   */
  canCompleteDonAbility(instanceId: string): boolean;
  /** Whether one of the viewer's own units is currently offered an attack. */
  canAttack(instanceId: string): boolean;
  /**
   * Whether one of the viewer's own units still has an attack left in it this
   * turn, read off the board rather than off `legalActions`.
   *
   * {@link canAttack} asks what the engine is offering *right now*, which is
   * the correct question while the main phase is idle and the wrong one inside
   * a pending effect: no `attack` action is on offer mid-resolution, so
   * `canAttack` reads false for every unit on the board. A rule that prices
   * "what does resting this card cost me" is asked exactly there, and would
   * otherwise conclude that the deck's only live attacker is free to spend.
   *
   * The reasons a unit has no swing left are the engine's to enumerate, not
   * this file's: `couldAttack` on the observation is `couldAttackThisTurn`
   * itself, and reading it is what keeps the pilot's answer from drifting off
   * the engine's. Restated from the fields beside it as `!rested`, it would miss
   * the two first turns of the game, in which neither player may battle at
   * all. It is the board's potential, not an offer: it says nothing about a
   * target existing.
   */
  couldAttack(instanceId: string): boolean;
  /**
   * Counter cards the defender would have to spend if this unit attacked the
   * opposing Leader at `power`.
   *
   * This is the quantity DON!! allocation should be judged against. Power is
   * continuous but Counter is not: 5000 and 6000 both cost the defender one
   * card, while 7000 costs two. Adding 1000 to a 6000 body therefore buys a
   * whole card; adding it to a 5000 body buys nothing.
   */
  cardsToSurviveLeaderHit(power: number): number;
  /** Power the defender must add to survive an attack. Zero when already safe. */
  counterDemand(attackPower: number, defensePower: number): number;
  /** Counter *cards* the defender must spend to meet a demand. */
  counterCardsNeeded(demand: number): number;
  /**
   * Cards the viewer's own hand would spend meeting the active battle's
   * shortfall, or `Infinity` when it cannot meet it at all.
   *
   * The defender's counterpart of {@link counterCardsNeeded}, and the number a
   * rule about what to *pay* must read: that one prices the shortfall at the
   * format's largest Counter step, which is a lower bound and is wrong by a
   * whole card for every hand that does not hold one.
   *
   * Priced off the hand rather than off the offered `counter` actions, which is
   * the same source `counter-over-dying-block` reads one window earlier. That
   * rule promises this line in exchange for keeping a Blocker, and the two must
   * agree; an offer list is also empty in every window that is not the Counter
   * step, which would read as "no line exists" rather than as "not asked yet".
   *
   * Zero when no battle is active or the defence already exceeds the attack.
   */
  counterCardsInHand(): number;
  /** Counter cards this attack forces out of the defender's hand. */
  attackPressure(action: AttackAction): number;
  /** The hand card an offered play would put on the field. */
  playedCard(action: PlayAction): HandCard | undefined;
  /** Facts for any card number the viewer can see. */
  facts(cardNumber: string): CardFacts | undefined;
  /**
   * Whether K.O.ing this opposing Character hands its controller the value back.
   *
   * One printed shape does: an `[On K.O.]` that moves a card into their Life,
   * which is the removal paying the defender in the currency the game is won
   * in. Hawkins and Cavendish are the format's two.
   *
   * **A body-replacing `[On K.O.]` is deliberately not here**, and that is a
   * judgement rather than an omission. Including "plays a Character" costs
   * games, all of it against ST36 and all of it
   * one card: OP12-113 Roronoa Zoro, whose `[On K.O.]` plays a {Supernovas}
   * body of cost 4 or less from hand *rested*. The refund costs its controller
   * a card from hand and arrives unable to attack or block, so the K.O. is
   * still a trade worth making, and declining it hands ST36 the board. An
   * `[On K.O.]` that draws a card is out for the same reason at a smaller
   * scale.
   *
   * Reads the `[On K.O.]` clause rather than the whole effect -- ST31-002
   * Jinbe's "[printed text omitted -- pnpm card:text ST31-002]" is `[On Play]` text, and
   * a whole-string test cannot tell the two apart -- and reads it off the card
   * *instance*: a negated Character has no text to pay with.
   */
  koRefundsDefender(instanceId: string): boolean;
}

/** Every DON!! a side controls, counted the way the printed clauses count it. */
function fieldDonOf(
  side: Pick<
    GameObservation["opponent"],
    "activeDon" | "restedDon" | "leader" | "board"
  >,
): number {
  return (
    side.activeDon +
    side.restedDon +
    side.leader.attachedDon +
    side.board.reduce((total, card) => total + card.attachedDon, 0)
  );
}

function handOf(observation: GameObservation): HandCard[] {
  return observation.self.hand.flatMap((card) => {
    const facts = observation.cardFacts[card.cardNumber];
    return facts ? [{ ...card, facts }] : [];
  });
}

/**
 * How many more DON!! one of the viewer's own units needs before its printed
 * `[DON!! xN]` text is live. Zero for a unit with no such clause, and zero once
 * the count is met.
 *
 * The one arithmetic behind both {@link Tactics.needsDonForAbility} and
 * {@link Tactics.canCompleteDonAbility}, which differ only in what they then
 * compare it against -- so a change to how the count is read cannot reach one
 * of them and miss the other.
 */
function donShortfall(
  observation: GameObservation,
  instanceId: string,
): number {
  const unit =
    instanceId === selfLeaderId(observation)
      ? observation.self.leader
      : observation.self.board.find((card) => card.instanceId === instanceId);
  if (!unit) return 0;
  const required = observation.cardFacts[unit.cardNumber]?.donRequirement ?? 0;
  if (required <= 0) return 0;
  return Math.max(0, required - unit.attachedDon);
}

/**
 * One `Tactics` per observation, shared by every rule and policy that asks.
 *
 * Keyed on the **observation object itself**, not on a string built from its
 * fields. A key such as `gameId:revision:viewer` is wrong twice over: two games
 * can share a `gameId` (every scenario built from the same seed does), and both
 * seats of one game observe the same revision during a Block or Counter step --
 * so a string-keyed cache hands a seat another position, including another
 * player's hand.
 *
 * Object identity cannot make that mistake: `observe()` returns a fresh object
 * per decision, so a hit is the same observation and a miss is merely a
 * recomputation. A `WeakMap` keeps it from retaining finished games.
 *
 * `resolveWithModules` hands a `decide` policy a *narrowed* observation when
 * something vetoed or ranked, which is a different object and so a different
 * entry: that is correct, because `affordablePlays` and `viableAttacks` are
 * read off `legalActions` and the narrowed set is what that policy is choosing
 * from.
 */
const derived = new WeakMap<GameObservation, Tactics>();

export function tacticsFor(observation: GameObservation): Tactics {
  const existing = derived.get(observation);
  if (existing) return existing;
  const fresh = tactics(observation);
  derived.set(observation, fresh);
  return fresh;
}

export function tactics(observation: GameObservation): Tactics {
  const hand = handOf(observation);
  const selfLeader = observation.self.leader.cardNumber;
  const opponentLeader = observation.opponent.leader.cardNumber;
  const handIds = new Map(hand.map((card) => [card.instanceId, card]));
  const affordablePlays = observation.legalActions.filter(
    (action): action is PlayAction => action.type === "play-card",
  );
  const playCosts = affordablePlays.map(
    (action) => handIds.get(action.cardInstanceId)?.cost ?? 0,
  );
  const dearestAffordablePlay =
    playCosts.length > 0 ? Math.max(...playCosts) : 0;
  // `currentCost`, not the printed `cost`: what the reserve has to hold back is
  // what the engine will charge. OP15-021 "Just Watch Me, Ace!!!" prints 4 and
  // costs 1 once four Events sit in its controller's trash, so the printed
  // reading asks a turn to leave three more DON!! unspent than the Event needs
  // -- and `dead-attachment` and `counter-event-reserve` both price the last
  // DON!! of a turn against that number.
  const counterEventCosts = hand
    .filter((card) => card.facts.hasCounterEvent)
    .map((card) => card.currentCost);
  const cheapestAffordablePlay =
    playCosts.length > 0 ? Math.min(...playCosts) : 0;

  const attacks = viableAttacks(observation, observation.legalActions);
  const activations = observation.legalActions.filter(
    (action): action is ActivateMainAction => action.type === "activate-main",
  );
  const opponentLeaderInstance = opponentLeaderId(observation);
  const leaderAttacks = attacks.filter(
    (action) => action.targetInstanceId === opponentLeaderInstance,
  );
  const incoming = incomingLeaderAttacks(observation);
  const incomingDamage = incomingLeaderDamage(observation);
  // The same scan as a list rather than a total: `facingLethal` asks whether an
  // attack is left over once the Life stack is empty, which a sum cannot say.
  const incomingDamages = incomingLeaderDamages(observation);
  // Priced per attacker rather than as `hits * 2`: a board can hold one
  // [Double Attack] attacker and three ordinary ones, and the OP-17 Red Ace
  // list, whose Leader is the one carrying the keyword, is exactly that shape.
  const maxDamage = leaderAttacks.reduce(
    (total, action) =>
      total + ownAttackerLeaderDamage(observation, action.attackerInstanceId),
    0,
  );
  const boardPower = (
    board:
      GameObservation["self"]["board"] | GameObservation["opponent"]["board"],
  ): number => board.reduce((total, card) => total + card.currentPower, 0);

  return {
    observation,
    actions: observation.legalActions,

    turn: observation.turn,
    selfLeader,
    opponentLeader,
    selfArchetype: archetypeOf(selfLeader),
    opponentArchetype: archetypeOf(opponentLeader),

    don: observation.self.activeDon,
    donOnField: observation.self.activeDon + observation.self.restedDon,
    fieldDon: fieldDonOf(observation.self),
    opponentFieldDon: fieldDonOf(observation.opponent),

    selfLife: observation.self.lifeCount,
    opponentLife: observation.opponent.lifeCount,
    opponentHandCount: observation.opponent.handCount,

    hand,
    counterPower: hand.reduce((total, card) => total + card.counter, 0),
    counterCards: hand.filter((card) => card.counter > 0).length,

    selfLeaderPower: observation.self.leader.currentPower,
    opponentLeaderPower: observation.opponent.leader.currentPower,
    leaderReactionSpent: observation.self.leader.leaderReactionSpent,
    opponentBlockers: observation.opponent.board.filter((card) => card.blocker)
      .length,

    viableAttacks: attacks,
    affordablePlays,
    dearestAffordablePlay,
    cheapestAffordablePlay,
    cheapestCounterEventInHand:
      counterEventCosts.length > 0 ? Math.min(...counterEventCosts) : 0,

    incomingLeaderAttacks: incoming,
    incomingLeaderDamage: incomingDamage,
    facingLethal: attacksAreLethal(incomingDamages, observation.self.lifeCount),
    leaderUnderAttack:
      observation.activeBattle?.targetInstanceId.endsWith("-leader") ?? false,
    // `counterShortfall` is the engine's own answer -- "0 when the target
    // already survives" -- so this reads it rather than re-deriving the
    // comparison, which is the mistake its doc comment warns about.
    battleHitLands: (observation.activeBattle?.counterShortfall ?? 0) > 0,
    leaderAttacks,
    maxLeaderHits: leaderAttacks.length,
    maxLeaderDamage: maxDamage,
    lethalInRange:
      maxDamage >= observation.opponent.lifeCount &&
      observation.opponent.lifeCount > 0 &&
      !observation.opponent.board.some((card) => card.blocker),

    selfBoardPower: boardPower(observation.self.board),
    opponentBoardPower: boardPower(observation.opponent.board),

    donNextTurn:
      observation.self.activeDon +
      observation.self.restedDon +
      Math.min(2, observation.self.donDeckCount),

    trash: observation.self.trash.map((card) => card.cardNumber),
    activations,
    race: race(observation),
    // The engine only offers plays it can pay for, so the cheapest affordable
    // play never exceeds the active DON!!; equality is exactly the case where
    // one attachment makes even it unaffordable.
    attachmentBlocksAllDevelopment:
      cheapestAffordablePlay > 0 &&
      cheapestAffordablePlay >= observation.self.activeDon &&
      // With five Characters down, the "play" this reserves DON!! for is not
      // development at all -- `placeCharacter` suspends on a replacement choice
      // and the sixth body costs one already on the field. Without this term
      // the fundamental vetoes the attachment in favour of a swap, reading "this
      // DON!! is the last one that can pay for a play" when the only play left
      // trashes a Mr.2 to replay a Mr.2.
      //
      // Expect it to read as a wash: `board-replacement-cost` vetoes most of
      // the plays this term would otherwise reserve DON!! for, so the two
      // overlap by construction. Kept anyway, because it is the
      // meaning of the word, and a correct definition costs four lines. Anything later
      // that loosens that veto gets this for free.
      observation.self.board.length < CHARACTER_AREA_LIMIT,

    copiesInHand(cardNumber: string): number {
      return hand.filter((card) => card.cardNumber === cardNumber).length;
    },
    copiesOnBoard(cardNumber: string): number {
      return observation.self.board.filter(
        (card) => card.cardNumber === cardNumber,
      ).length;
    },
    activationOffered(cardNumber: string): boolean {
      return activations.some(
        (action) => action.sourceCardNumber === cardNumber,
      );
    },
    ownCurrentPower(instanceId: string): number | undefined {
      if (instanceId === selfLeaderId(observation)) {
        return observation.self.leader.currentPower;
      }
      return observation.self.board.find(
        (card) => card.instanceId === instanceId,
      )?.currentPower;
    },
    needsDonForAbility(instanceId: string): boolean {
      return donShortfall(observation, instanceId) > 0;
    },
    canCompleteDonAbility(instanceId: string): boolean {
      const shortfall = donShortfall(observation, instanceId);
      return shortfall > 0 && shortfall <= observation.self.activeDon;
    },
    canAttack(instanceId: string): boolean {
      return observation.legalActions.some(
        (action) =>
          action.type === "attack" && action.attackerInstanceId === instanceId,
      );
    },
    couldAttack(instanceId: string): boolean {
      if (observation.turnPlayer !== observation.viewer) return false;
      if (instanceId === selfLeaderId(observation)) {
        return observation.self.leader.couldAttack;
      }
      return (
        observation.self.board.find((card) => card.instanceId === instanceId)
          ?.couldAttack === true
      );
    },
    cardsToSurviveLeaderHit(power: number): number {
      return counterCardsNeeded(
        counterDemand(power, observation.opponent.leader.currentPower),
      );
    },
    counterDemand,
    counterCardsNeeded,
    counterCardsInHand(): number {
      const battle = observation.activeBattle;
      if (!battle) return 0;
      const demand = counterDemand(
        battle.attackPower,
        battle.targetPower + battle.counterPower,
      );
      return counterCardsFromHand(
        observation.self.hand.map((card) => card.currentCounter),
        demand,
      );
    },
    attackPressure(action: AttackAction): number {
      return counterCardsNeeded(
        counterDemand(
          attackerPower(observation, action),
          targetPower(observation, action),
        ),
      );
    },
    playedCard(action: PlayAction): HandCard | undefined {
      return handIds.get(action.cardInstanceId);
    },
    facts(cardNumber: string): CardFacts | undefined {
      return observation.cardFacts[cardNumber];
    },
    koRefundsDefender(instanceId: string): boolean {
      const card = observation.opponent.board.find(
        (candidate) => candidate.instanceId === instanceId,
      );
      if (!card || card.negated === true) return false;
      return (
        observation.cardFacts[card.cardNumber]?.rules.koClauseMentionsLife ??
        false
      );
    },
  };
}

export { opponentLeaderId, selfLeaderId };
