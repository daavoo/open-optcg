import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  chooseGenericRules,
  decision,
  type AttackAction,
  type PolicyDecision,
} from "../generic-policy.js";
import { heuristics, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import { worthInHand } from "../format/shared.js";
import { tacticsFor } from "../tactics.js";

/**
 * OP-17 Blue Rocks D. Xebec, the draw-engine deck.
 *
 * ## The engine, in one paragraph
 *
 * The Leader turns one card in hand into two: `[When Attacking] You may trash 1
 * [printed text omitted -- pnpm card:text <card>]
 * card's type includes "Rocks Pirates", draw 2 cards.` Bandai's list is 50 of
 * 50 on the tribe, so the reveal cannot miss and the trade is a flat +1 card
 * every turn the Leader swings. Nothing else in the deck draws at that rate,
 * which makes "the Leader attacked this turn" the single measurement of whether
 * the deck is running. The tension the archetype is built around is that every
 * {Rocks Pirates} Character in the list prints `counter: null`.
 *
 * That last point is the one an audit gets wrong, so it is worth stating
 * exactly. "No Counters" does not mean the deck cannot defend from hand -- it
 * means the defence is not in the Counter step. It is in four
 * `[On Your Opponent's Attack]` clauses that each **cost a card out of hand**:
 * OP17-057 Fullalead and OP17-049 Charlotte Linlin for +1000, OP17-040
 * Edward.Newgate for +3000 on the Leader, OP17-048 Shiki for -3000 on an
 * opposing Character. Add the two 0-cost Events' `[Counter]` clauses and
 * OP17-118's "+2000 Counter in hand", and every point of defence this deck has
 * is bought with the same currency the Leader spends to draw. Which is why the
 * question in front of almost every defensive decision is not "can I win this
 * battle" but "is this battle worth a card", and why two of the three rules
 * below are about declining.
 *
 * The rest of the hand converts into bodies and DON!!-priced control:
 * OP17-044 Captain John's taunt, OP17-054 Miss Buckingham Stussy's attack lock,
 * and OP17-118 Rocks D. Xebec at 10 DON!!.
 *
 * ## Why this file exists
 *
 * The deck had no registered policy at all. `pnpm census --deck "(Blue)
 * Rocks.D.Xebec - Official Feature Deck" --seeds 100` reported **0.0% of its
 * 123,893 decisions shaped by a rule written for it, and 79.0% shaped by no
 * rule at all** -- 100% of mulligans, 97.8% of blocks and 99.5% of Counter
 * decisions falling through to `chooseGenericRules`.
 *
 * Re-run on Bandai's official list it still read **72.8% shaped by no rule at
 * all, over 132,624 decisions -- seven times any other deck in the field**,
 * with 97.9% of 39,985 Block-phase decisions and 72.1% of 77,945 Main-phase
 * decisions unruled. The volume is itself the symptom: a deck holding eight
 * cards is offered far more choices than one holding three, so leaving them to
 * `chooseGenericRules` costs this deck more than it would cost anyone else.
 *
 * ## Where this deck's points are
 *
 * In the Counter rule's tuning as much as in new rules --
 * `economicalCharacterDefense: false`, and a protected set covering every
 * Character that keeps doing something while it lives. On top of that:
 *
 *  - `op17-xebec-defensive-trigger`, declining an on-defence pump that cannot
 *    decide the battle on its own.
 *  - `op17-xebec-trash`, choosing which card pays a "trash 1 card from your
 *    hand" cost -- but only in the form that spends OP17-118 freely. See the
 *    module for why that one term is the difference between a large gain and
 *    a wash.
 *
 * The two compound: a rule that stops throwing Counter Events at the Leader's
 * cost leaves more of them for the battles the other one decides to fight.
 * Both are the same finding from opposite sides -- the deck's hand is its
 * defence, and the generic ladder was spending it a card at a time on battles
 * that did not turn on it.
 *
 * One matchup is structural and nothing here moves it: OP-17 Red Ace. Its
 * shape is understood: this deck
 * loses late holding a full hand and an unfilled board, having rarely cast
 * OP17-118. It dies rich. The obvious answer -- develop wider, cheapest first --
 * is catastrophic here, because cheapest-first spends the turn on 2000-power
 * bodies the opponent removes for free while Edward.Newgate and Shiki stay in
 * hand. The idle hand is a real fault; that is not its fix.
 */
export function createOp17XebecRulesPolicy(): PolicyModule {
  return {
    id: "op17-xebec",
    decide: ({ observation }): PolicyDecision | undefined =>
      leaderEngineAttack(observation),
  };
}

/**
 * Never end a turn with the Leader's swing unspent.
 *
 * `chooseGenericRules` only ever declares a `viableAttack` -- one whose
 * `attackerPower >= targetPower` -- and this Leader is a 5000 body in a format
 * of 6000-and-up Leaders, so for most of the field *no* Leader attack is ever
 * viable and the generic ladder passes the turn with it untapped. Against a
 * Leader that grows past 5000 that is the whole game: the Leader attacks on a
 * minority of main phases, and the turn can reach a state whose only legal
 * actions are `attack` and `pass` and still choose `pass` holding ten rested
 * DON!!.
 *
 * For this Leader viability is the wrong question twice over:
 *
 *  - **The payoff resolves on declaration, not on the battle.** `[When
 *    Attacking]` programs are dispatched in `actions/attack.ts` *before* the
 *    Block window opens, so the trash-reveal-draw fires whether or not the
 *    attack goes on to beat anything.
 *  - **Declaring costs nothing.** A Leader can never block and is a legal
 *    attack target whether rested or active, so resting it by attacking gives
 *    up no defence. The engine says so itself in the action summary: "the
 *    Leader can never block and is a legal target whether rested or active, so
 *    declaring here costs nothing beyond the attack itself."
 *
 * So a hopeless Leader swing is a free draw 2, and the deck should never
 * decline one.
 *
 * ## Why it substitutes for `pass` rather than leading the turn
 *
 * Leading the turn with the swing, so the two cards it draws are spendable on
 * the same turn, is clearly worse. Almost every Leader attack then goes in
 * with **0 DON!! attached**, and attacks that actually win their battle fall:
 * swinging before the attachment step converts connecting attacks into
 * whiffs, which is the "does it attach DON!! before the attack it is meant to
 * improve?" fault read backwards.
 *
 * So the rule fires only where the turn would otherwise end: it asks the
 * generic ladder for its own answer and overrides nothing but `pass`. Every
 * other sequencing decision -- develop, activate, attach -- stays with the
 * ladder, which by then has put the deck's spare DON!! on the Leader, so the
 * swing happens at the power it has earned.
 */
function leaderEngineAttack(
  observation: GameObservation,
): PolicyDecision | undefined {
  if (observation.phase !== "main") return undefined;
  const leaderAttacks = observation.legalActions.filter(
    (action): action is AttackAction =>
      action.type === "attack" && action.attackerIsLeader === true,
  );
  if (leaderAttacks.length === 0) return undefined;
  if (chooseGenericRules(observation).action.type !== "pass") return undefined;
  return decision(
    chooseLeaderTarget(observation, leaderAttacks),
    "Swing the Leader rather than end the turn: [When Attacking] resolves on declaration, so the draw is paid whether or not the battle is won, and resting a Leader costs nothing.",
  );
}

/**
 * Which target the free swing points at.
 *
 * The draw is identical whatever it hits, so the target is chosen for what the
 * *battle* can still add. An attack that wins its battle is worth more than one
 * that cannot, and among winnable ones a Character is worth more than the
 * Leader: K.O.ing a body permanently removes an attacker, where a Life hit
 * hands the opponent a card. When nothing is winnable the swing is pure engine
 * fuel and points at the Leader, which is the only target that can still cost
 * the opponent a Counter card if they misjudge it.
 */
function chooseLeaderTarget(
  observation: GameObservation,
  attacks: readonly AttackAction[],
): LegalAction {
  const winnable = attacks.filter(
    (attack) =>
      (attack.attackPower ?? 0) >=
      (attack.targetPower ?? Number.POSITIVE_INFINITY),
  );
  const opponentLeaderId = `${observation.viewer === "p1" ? "p2" : "p1"}-leader`;
  const character = winnable.find(
    (attack) => attack.targetInstanceId !== opponentLeaderId,
  );
  if (character) return character;
  const leader = attacks.find(
    (attack) => attack.targetInstanceId === opponentLeaderId,
  );
  return leader ?? attacks[0]!;
}

/**
 * The bodies this deck cannot afford to trade for a Life card.
 *
 * Every {Rocks Pirates} Character in the list prints `counter: null`, so the
 * deck's whole Counter supply is the two 0-cost Events and OP17-118's
 * conditional +2000. `chooseGenericCounter` with an empty protected set never
 * spends any of it on a Character -- and this deck's Characters *are* its
 * defence. The taunt, the attack lock, both Blockers and both on-defence pumps
 * live on the board, and only OP17-118 rebuilds them. A body saved here defends
 * again every turn it survives; a Life card saved defends once.
 */
const XEBEC_PROTECTED_CARDS: ReadonlySet<string> = new Set([
  "OP17-044", // Captain John -- the taunt, and a draw every turn it rests.
  "OP17-054", // Miss Buckingham Stussy -- switches an attacker off for a turn.
  "OP17-118", // Rocks D. Xebec -- 12000, and the deck's only rebuild.
  "OP17-048", // Shiki -- -3000 on either player's turn.
  "OP17-040", // Edward.Newgate -- +3000 to the Leader on defence.
  "OP17-042", // Kaido -- Blocker.
  "OP17-046", // Gloriosa -- Blocker.
  "OP17-049", // Charlotte Linlin -- 7000, and +1000 on their attack.
  "OP17-045", // Kyo -- trashes 2 rather than be removed by an effect.
  "OP17-052", // Don Marlon -- 5000, and buys back a spent Event.
  // Left out: OP17-050 Streusen, the list's only 1-cost body. It has already
  // spent its [On Play] by the time anything attacks it, so what is left is a
  // 2000 body worth less than the Event that would save it. Adding it, and the
  // OP08-051 Buckin, which the pre-release list ran alongside it, is not here
  // and is not missed: rarely worth a Counter, and rarely offered one either
  // way.
  //
  // OP17-057 Fullalead is not here either, and cannot be: it is a Stage, so no
  // attack ever targets it and there is nothing for a Counter to save.
]);

/**
 * Spend the deck's scarce Counter on the board rather than only on lethal.
 *
 * The census found **99.5% of this deck's 13,592 Counter decisions shaped by no
 * rule at all**, and the probe the number predicts: 8.07 Counter windows a game
 * against OP14-020 Mihawk, 1.20 of them answered. `chooseGenericCounter`'s
 * default protected set is empty, so it declines every Character save and keeps
 * the Events for a Leader hit that would otherwise be fatal.
 */
export function createOp17XebecCounterPolicy(): PolicyModule {
  return {
    id: "op17-xebec-counter",
    decide: ({ observation }): PolicyDecision | undefined =>
      observation.phase === "counter"
        ? chooseGenericCounter(observation, observation.legalActions, {
            protectedCards: XEBEC_PROTECTED_CARDS,
            // `economicalCharacterDefense` caps a Character save at a 1000
            // shortfall, which is the right default when the Counter spent is a
            // card that could have defended the Leader instead. Here it is not:
            // this deck's Counters are two 0-cost Events, and the Leader's own
            // engine trashes a card a turn anyway, so the Event's alternative
            // use is being thrown away as engine fuel. Saving a 6000 Captain
            // John or a 12000 OP17-118 is worth more than that at any shortfall
            // the Events can actually cover.
            economicalCharacterDefense: false,
            // `counterEventBeatsCards` is deliberately left at its default,
            // where the Event stays a last resort. Setting it to 1 -- always
            // spend the Event ahead of any card line, on the dossier's "OP17-118's
            // printed 2000 Counter is the least valuable thing it does" --
            // costs points. The Events are also the Leader's preferred engine fuel, so
            // spending one early costs a turn of the draw it pays for.
          })
        : undefined,
  };
}

/**
 * Power an `[On Your Opponent's Attack]` clause in this list adds to the
 * defence, keyed by the card that prints it.
 *
 * Every entry costs **a card out of hand**, which is the resource this deck's
 * whole engine exists to accumulate, so the amount matters: the clause is worth
 * paying for exactly when it changes who wins the battle, and worth nothing at
 * all otherwise. OP17-048 Shiki is in the table at its full 3000 even though it
 * prints a debuff rather than a buff -- taking 3000 off the attacker closes the
 * same gap as adding 3000 to the defender, and `counterDemand` measures the
 * gap, not which side of it moved.
 *
 * OP17-040 Edward.Newgate is the outlier at 3000, and the only one of these
 * that can rescue a Leader battle on its own.
 */
const XEBEC_DEFENSIVE_PUMPS: ReadonlyMap<string, number> = new Map([
  ["OP17-057", 1_000], // Fullalead -- rest the Stage, trash 1.
  ["OP17-049", 1_000], // Charlotte Linlin -- once per turn, trash 1.
  ["OP17-040", 3_000], // Edward.Newgate -- once per turn, Leader only.
  ["OP17-048", 3_000], // Shiki -- once per turn, as -3000 on the attacker.
]);

// OP17-048 is entered at a flat 3000 on purpose, and the obvious refinement is
// wrong. Shiki can only name an opposing *Character*, so against a Leader swing
// it cannot touch the attacker at all -- a probe found it firing into 110 such
// battles against 11 it could reach -- and scoring it 0 there reads as an
// outright bug fix. It is not: the debuff lasts "during this turn",
// not during this battle, so a Character it hits while the Leader is swinging is
// still 3000 weaker for every attack that follows in the same turn. The clause
// is not battle-scoped and pricing it as if it were loses value.

/**
 * Do not pay a card for a pump that cannot change the battle.
 *
 * `pnpm census` reads this deck's Block phase as almost entirely unpiloted, and
 * `chooseGenericRules` answers an optional effect by taking the first option
 * that is not `skip` -- so every one of these clauses fires every time it is
 * offered. A large share of those offers cannot affect the result at all: either
 * the attack is already failing, or the gap is wider than everything the deck
 * could still add.
 *
 * Both halves are the same mistake priced twice. This deck has no printed
 * Counter on any Character, so the only things it can spend on defence are the
 * two Events, OP17-118's conditional 2000, and these four clauses -- and all of
 * them are paid for in cards from the hand the Leader spends every turn
 * refilling. A pump into a battle that was already lost, or already won, is
 * that card thrown away for nothing.
 *
 * ## The test is the pump alone, and the wider reading measures worse
 *
 * The obvious threshold is "could the battle still be saved at all" -- the pump
 * plus every Counter card left in hand. Getting that number right takes real
 * work here, because `Tactics.counterPower` sums *printed* Counter values and
 * every card in this list prints `counter: null`: the deck's actual Counter
 * supply is the `[Counter]` clauses on OP17-055 and OP17-056 and OP17-118's
 * unconditional "+2000 Counter in hand", none of which that field can see.
 *
 * Counting them, correctly, is worse; counting just one of them is worse
 * still. The pump on its own -- the version here -- is the best of the three,
 * and the reason is
 * not arithmetic. A battle whose gap takes the pump *and* two Counter Events is
 * a battle costing three cards to win one Life, and this deck's Life is not
 * where its game is: lost Life goes to hand, which is the resource it is built
 * to accumulate. So the narrow test is doing two jobs, and the second one --
 * refusing to spend the hand down to save a single hit -- is the one carrying
 * the margin. It is written as one condition because that is how it measures,
 * not because the wider reading is unavailable.
 *
 * What this rule does *not* do is judge whether a battle it can win is worth
 * winning. That is a different question with a different answer per target, and
 * bundling it here would make the measurement unreadable.
 */
export function createOp17XebecDefensiveTriggerPolicy(): PolicyModule {
  return {
    id: "op17-xebec-defensive-trigger",
    decide: ({ observation }): PolicyDecision | undefined =>
      declineHopelessPump(observation),
  };
}

function declineHopelessPump(
  observation: GameObservation,
): PolicyDecision | undefined {
  const battle = observation.activeBattle;
  if (!battle) return undefined;
  const effects = observation.legalActions.filter(
    (action) => action.type === "resolve-effect",
  );
  // Only the bare "apply this or not" shape. Once the clause is committed, the
  // decision left is which card pays, which is not this rule's business.
  if (effects.length !== 2) return undefined;
  const apply = effects.find(
    (action) =>
      action.option.kind === "confirm" && action.option.choice === "apply",
  );
  const skip = effects.find(
    (action) =>
      action.option.kind === "skip" ||
      (action.option.kind === "confirm" && action.option.choice === "done"),
  );
  if (!apply || !skip) return undefined;

  const pump = XEBEC_DEFENSIVE_PUMPS.get(apply.sourceCardNumber);
  if (pump === undefined) return undefined;

  const t = tacticsFor(observation);
  const demand = t.counterDemand(
    battle.attackPower,
    battle.targetPower + battle.counterPower,
  );
  if (demand === 0) {
    return decision(
      skip,
      "Decline the pump: this attack already fails, so the card it costs would buy nothing.",
    );
  }
  if (demand > pump) {
    return decision(
      skip,
      "Decline the pump: it cannot close this gap on its own, and a battle that needs the rest of the hand behind it costs more cards than the Life it saves.",
    );
  }
  return undefined;
}

/**
 * The clauses in this list whose cost is "trash 1 card from your hand".
 *
 * OP17-118 is deliberately absent. It also offers a choice of hand cards, but
 * that choice is the *benefit* -- which two {Rocks Pirates} cards to deploy --
 * and ranking it by what the deck can most afford to lose would deploy its
 * worst two bodies.
 */
const XEBEC_HAND_COSTS: ReadonlySet<string> = new Set([
  "OP17-039", // Leader -- the engine itself, once a turn.
  "OP17-040", // Edward.Newgate -- Leader +3000.
  "OP17-044", // Captain John -- [Activate: Main] draw 1, trash 1.
  "OP17-048", // Shiki -- -3000 on an attacker.
  "OP17-049", // Charlotte Linlin -- +1000.
  "OP17-057", // Fullalead -- +1000.
]);

/**
 * What the deck gives up, in order, when a clause asks for a card from hand.
 *
 * The Leader alone asks this once a turn, and without a ranking the answer comes
 * from `chooseGenericRules`, which takes the first option that is not `skip` --
 * whatever happens to be first in hand. That feeds the cost copies of OP17-118
 * and Counter Events: the deck throwing away its defence to pay for draws it
 * then has no way to protect.
 *
 * The ranking is the same observation as
 * {@link createOp17XebecDefensiveTriggerPolicy}, from the other side. No
 * Character in Bandai's 50 prints a Counter, so what the deck can spend on
 * defence is two Events -- OP17-055 and OP17-056 -- plus OP17-057 Fullalead,
 * which is defence that stays on the field instead of being spent. Those are
 * held. Everything else in hand is worth exactly its body, and a body is what
 * this deck has most of.
 *
 * The one strictly-dead card in the list earns the bottom rank: a second
 * Fullalead while one is already on the Stage. A player has one Stage, so
 * playing the second replaces the first and buys nothing at all.
 *
 * ## OP17-118 is fuel, and that is the whole margin
 *
 * OP17-118 prints "[printed text omitted -- pnpm card:text OP17-118]", which is unconditional in this list -- so it
 * reads exactly like a third Counter Event and the obvious ranking holds it
 * back. That version is a high-churn wash. Moving OP17-118 down into the
 * freely spent tier and changing nothing else is what makes the rule pay.
 *
 * So the 2000 Counter is not what the card is for, and holding it costs more
 * than it saves: at 10 cost it is the card the deck is least often able to
 * cast, the Leader asks for fuel every single turn, and a hand kept full by the
 * engine will offer another Counter before this one is missed. This
 * is the measurement.
 *
 * Ties keep the order the engine offered, so this rule expresses one claim --
 * which *tier* pays -- and does not smuggle in a second about which body inside
 * a tier is worth more.
 */
function trashRank(observation: GameObservation, cardNumber: string): number {
  const stageInPlay = observation.self.stage !== null;
  if (cardNumber === "OP17-057") return stageInPlay ? 0 : 4;
  if (cardNumber === "OP17-055" || cardNumber === "OP17-056") return 2;
  return 1;
}

export function createOp17XebecTrashPolicy(): PolicyModule {
  return {
    id: "op17-xebec-trash",
    decide: ({ observation }): PolicyDecision | undefined =>
      chooseTrashFuel(observation),
  };
}

function chooseTrashFuel(
  observation: GameObservation,
): PolicyDecision | undefined {
  const costs = observation.legalActions.filter(
    (action) =>
      action.type === "resolve-effect" &&
      XEBEC_HAND_COSTS.has(action.sourceCardNumber) &&
      action.option.kind === "card" &&
      action.option.owner === "self" &&
      action.option.zone === "hand",
  );
  if (costs.length < 2) return undefined;
  const best = costs.reduce((left, right) => {
    const l = trashRank(observation, cardNumberOf(left));
    const r = trashRank(observation, cardNumberOf(right));
    return r < l ? right : left;
  });
  return decision(
    best,
    "Pay the trash cost with the card the deck can most afford to lose: its Counter Events and an unplayed Fullalead are its only defence, since every Character in the list prints none.",
  );
}

function cardNumberOf(action: LegalAction): string {
  return action.type === "resolve-effect" && action.option.kind === "card"
    ? action.option.card.cardNumber
    : "";
}

/*
 * The [Unblockable] Event rule that shipped here is now `dead-keyword-grant` in
 * `format-heuristics.ts`, unchanged in what it decides.
 *
 * It was written deck-scoped because `activate-main` carried no summary of what
 * an activation buys, so no format rule could see that OP17-055's whole effect
 * is a turn-scoped [Unblockable]. The engine reports that now, as `grants` on
 * the action -- the same field `resolve-effect` already carried -- and the rule
 * moved to the scope it was always true at. Its measurement is quoted at the
 * format module, since this deck is where it was taken.
 */

/**
 * The most a Character can cost and still be a body the early Leader attacks
 * have alongside them.
 *
 * Three DON!! is what the seat has on its own turn 2, the same bound the Enel
 * keep uses and for the same reason. In Bandai's 50 it selects OP17-050
 * Streusen, OP17-045 Kyo, OP17-052 Don Marlon and OP17-054 Miss Buckingham
 * Stussy -- ten cards, where the two the dossier names by number are four.
 */
const XEBEC_EARLY_BODY_COST = 3;

/**
 * Everything in this list that can defend from hand.
 *
 * The two 0-cost Events' `[Counter]` clauses, and OP17-057 Fullalead, which is
 * defence that stays on the field once played rather than being spent. This is
 * the same set {@link trashRank} holds back from the Leader's trash cost, and
 * for the same reason: no Character in the 50 prints a Counter, so these are
 * the whole hand defence.
 */
const XEBEC_HAND_DEFENCE: ReadonlySet<string> = new Set([
  "OP17-055", // There's No Authority in the World That Lasts Forever!!!
  "OP17-056", // Rocks Pirates
  "OP17-057", // Fullalead -- the Stage, +1000 on their attack, repeatable.
]);

/**
 * The opening hand: a body to play, and a card that can say no.
 *
 * This deck was one of the seven with no keep predicate at all, so every
 * opening hand was answered by the generic "any card costs 2 or less". That
 * test is wrong here in the way it was wrong for Enel, and worse. Sixteen of
 * the 50 cost 2 or less and **twelve of them are not Characters** -- four
 * OP17-055, four OP17-056, four OP17-057 -- so the generic rule keeps 86.9% of
 * hands and a large share of the keeps are hands with nothing to play. A hand
 * of Events is not a first turn.
 *
 * ## Both dossier clauses, and why one of them is widened
 *
 * The dossier states the plan as a conjunction: "keep cheap bodies that draw --
 * OP17-050 Streusen, OP17-045 Kyo" *and* "keep at least one Event: with no
 * Character in the list printing a Counter, the two Events and OP17-057
 * Fullalead are the entire hand defence". Both halves are kept. The first is
 * widened from those two card numbers to *a Character the first two turns can
 * pay for*, because the two numbers are stale against the list this deck now
 * is: Bandai's official 50 trims the 1- and 2-drops to two copies each, so the
 * literal reading is four cards out of 50 and the conjunction keeps **24.7% of
 * hands** -- shipping three hands in four, most of them playable. Read as a
 * cost bound it is ten cards and the conjunction keeps 49.9%.
 *
 * The widened reading -- a cost bound -- is preferred over the literal two
 * card numbers, and for its keep rate rather than for its margin. Both find
 * the same points; the literal one ships **74.3%** of opening hands where
 * this one ships **50.0%**, disturbing half again as many games to arrive at
 * the same place. That is a rule working through churn, and every hand it
 * ships that was fine is paid for out of the deck's own openings.
 *
 * Either way the rule only *tightens*: a keep needs one of OP17-055, OP17-056
 * or OP17-057 in hand, all of which cost 2 or less, so every hand this keeps
 * the generic rule kept as well. Over those 144 openings it shipped **55 hands
 * the generic kept**, and kept none the generic would have shipped.
 */
export function createOp17XebecMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op17-xebec-mulligan",
    keep: (observation) =>
      observation.self.hand.some(
        (card) =>
          observation.cardFacts[card.cardNumber]?.category === "character" &&
          card.cost <= XEBEC_EARLY_BODY_COST,
      ) &&
      observation.self.hand.some((card) =>
        XEBEC_HAND_DEFENCE.has(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with a Character the early turns can play and a card that can defend from hand: this list prints no Counter on any Character, so the Events and Fullalead are all of it.",
    mulliganBecause:
      "Mulligan: a hand of cheap cards is not an opening here unless one of them is a body, and unless something in it can answer an attack.",
  });
}

/**
 * The DON!!-priced defence, and what it buys that a bigger body does not.
 *
 * Two cards in this list convert DON!! into a turn the opponent cannot use,
 * rather than into power:
 *
 *  - **OP17-044 Captain John.** Rested, under a {Rocks Pirates} Leader, it is
 *    the *only* legal attack target the opponent has -- the Leader included.
 *    `legal-actions/main/attacks.ts` drops every other target while it holds,
 *    so a board of four attackers gets one attack into a 6000 body and nothing
 *    else. It rests itself through its own `[Activate: Main]`, which also draws
 *    1, so the whole lock is 4 DON!! and a card.
 *  - **OP17-054 Miss Buckingham Stussy.** Switches one opposing attacker off
 *    for their turn, again for DON!! rather than for a card.
 *
 * The generic ladder develops the highest-cost card it can afford, which is the
 * right default for this deck -- a hand of counterless 2000 bodies is worse than
 * one large one -- and the wrong answer when what the deck is short of is a
 * turn. At 8 DON!! the ladder buys a 7-cost 9000 body; the same DON!! buys the
 * taunt *and* the attack lock, and the opponent's whole turn with it.
 *
 * The gate is the one state where a turn is worth more than a body: the
 * opponent's board can already end the game on their next turn. Anywhere short
 * of that the deck is still playing the card game its Leader wins, and the
 * larger body is worth more -- which is why the dossier's own "while your Life
 * is at or below the opponent's" is too wide to be the test. This deck spends
 * Life for cards on purpose, so it is behind on Life for most of most games.
 *
 * The rule scores **every** play candidate rather than only the two it names.
 * `prefer` compiles to `rank`, which hides every candidate below the best in its
 * action type, so a whitelist here would stop the deck developing at all in a
 * hand holding neither card. The tail term is the ladder's own order -- cost --
 * so where the lock is absent this rule is inert by construction.
 *
 * Nothing is needed for the activation: `chooseGenericRules` already answers
 * `activate-main` with "use an available Main-phase effect", so Captain John
 * rests itself on the turn it lands.
 */
const XEBEC_LOCK_PRIORITY: ReadonlyMap<string, number> = new Map([
  ["OP17-044", 40], // Captain John -- the taunt: one legal target, theirs.
  ["OP17-054", 30], // Miss Buckingham Stussy -- one attacker switched off.
]);

export function createOp17XebecLockPolicy(): PolicyModule {
  return heuristics("op17-xebec-lock", [
    prefer(
      "Buy the turn rather than the body: a rested Captain John is the opponent's only legal attack target, and Stussy switches an attacker off, both for DON!! rather than for cards.",
    )
      .when((t) => t.facingLethal)
      .by(WEIGHT.deck)
      .play((card) => XEBEC_LOCK_PRIORITY.get(card.cardNumber) ?? card.cost),
  ]);
}

/**
 * The battle the decline rule must not decline.
 *
 * {@link createOp17XebecDefensiveTriggerPolicy} prices an
 * `[On Your Opponent's Attack]` clause against the battle it is offered in: a
 * pump that cannot close the gap alone buys nothing, because the battle then
 * needs the rest of the hand behind it and this deck's Life is worth less than
 * its cards. That is the right trade while there is Life to trade.
 *
 * It stops being a trade when the Life is the last of it. "Costs more cards than
 * the Life it saves" has no meaning against a board that ends the game on its
 * next turn: there is no later battle to keep the cards for. The four clauses
 * also stack -- Newgate's 3000, Shiki's 3000, Fullalead's 1000 and Linlin's 1000
 * are offered one at a time, each as its own apply-or-skip -- so a gap none of
 * them closes alone is routinely closed by two, and a rule that judges each in
 * isolation declines all of them and then loses to the hit.
 *
 * So this runs ahead of the decline and answers the same offer with `apply` on
 * two conditions together. The attack must be aimed at this Leader with the
 * swings the opponent has left adding up to the game -- and the clauses still
 * standing on the board must between them be enough to win *this* battle.
 * Facing lethal is not on its own a reason to pay: a gap nothing on the board
 * can close is a battle lost whatever is spent on it, and spending there is the
 * decline rule being right at the worst possible moment.
 *
 * The total is taken from the board and the Stage rather than from the hand.
 * Each of these clauses is once per turn, so a source that has already fired
 * this turn is counted again and the total is an over-estimate -- which makes
 * the gate loose in the direction of paying, not of declining. The hand's two
 * Counter Events are left out: they are spent at the Counter step, not here,
 * and this rule is about whether the board can finish the battle by itself.
 *
 * It says nothing anywhere else, which is what keeps the decline rule's own
 * claim intact: this is the exception to it, not a replacement for it.
 */
export function createOp17XebecLethalPumpPolicy(): PolicyModule {
  return {
    id: "op17-xebec-lethal-pump",
    decide: ({ observation }): PolicyDecision | undefined =>
      payForTheLastLife(observation),
  };
}

function payForTheLastLife(
  observation: GameObservation,
): PolicyDecision | undefined {
  const battle = observation.activeBattle;
  if (!battle) return undefined;
  const t = tacticsFor(observation);
  if (!t.leaderUnderAttack || !t.facingLethal) return undefined;
  const effects = observation.legalActions.filter(
    (action) => action.type === "resolve-effect",
  );
  if (effects.length !== 2) return undefined;
  const apply = effects.find(
    (action) =>
      action.option.kind === "confirm" && action.option.choice === "apply",
  );
  if (!apply || !XEBEC_DEFENSIVE_PUMPS.has(apply.sourceCardNumber)) {
    return undefined;
  }
  const demand = t.counterDemand(
    battle.attackPower,
    battle.targetPower + battle.counterPower,
  );
  if (demand === 0 || demand > boardPumpTotal(observation)) return undefined;
  return decision(
    apply,
    "Pay the pump: the swings still aimed at this Leader end the game, so there is no later battle to hold the card for, and these clauses stack across the same attack.",
  );
}

/**
 * Power the `[On Your Opponent's Attack]` clauses still on the field could add
 * to one battle, if every one of them fired.
 */
function boardPumpTotal(observation: GameObservation): number {
  const sources = [
    ...observation.self.board.map((card) => card.cardNumber),
    ...(observation.self.stage ? [observation.self.stage.cardNumber] : []),
  ];
  return sources.reduce(
    (total, cardNumber) => total + (XEBEC_DEFENSIVE_PUMPS.get(cardNumber) ?? 0),
    0,
  );
}

/**
 * Keep the last OP17-118, and go on spending the rest.
 *
 * {@link createOp17XebecTrashPolicy} ranks OP17-118 into the freely-spent tier,
 * and the reason it gives is sound: the card reads like a third Counter Event
 * and holding every copy for that 2000 is worse than feeding the engine. What
 * that ranking does not distinguish is the copy the deck is spending from the
 * copy it has left.
 *
 * Across the field the deck holds OP17-118 at some point in 97.6% of games and
 * reaches the 10 DON!! it costs in 90.4% -- and casts it in about a third of
 * them, having fed a copy to a hand cost in three quarters. At 4 copies in 50
 * the spares are genuinely fuel; the last one is the deck's only way to rebuild
 * a board, which is the whole reason the archetype survives a turn it spends
 * drawing rather than developing.
 *
 * So this is one term, not a re-ranking: the *last* copy in hand is taken off
 * the table as a way to pay, and every other copy stays exactly where the trash
 * rule put it. It is written as a veto rather than a rank so the claim is
 * addressable on its own, and so the trash rule still decides which of the
 * remaining cards pays.
 *
 * `resolveWithModules` applies a veto only when something else survives it, so
 * a hand whose only payable card is the last OP17-118 still pays with it rather
 * than stalling the clause.
 */
export function createOp17XebecKeepPayoffPolicy(): PolicyModule {
  return {
    id: "op17-xebec-keep-payoff",
    veto: ({ observation }, action): string | undefined => {
      if (
        action.type !== "resolve-effect" ||
        !XEBEC_HAND_COSTS.has(action.sourceCardNumber) ||
        action.option.kind !== "card" ||
        action.option.owner !== "self" ||
        action.option.zone !== "hand" ||
        action.option.card.cardNumber !== "OP17-118"
      ) {
        return undefined;
      }
      const copies = observation.self.hand.filter(
        (card) => card.cardNumber === "OP17-118",
      ).length;
      if (copies > 1) return undefined;
      return "Keep the last OP17-118: the spare copies are the engine's fuel, but this one is the deck's only way to put a board back, and it reaches the 10 DON!! to cast it in nine games out of ten.";
    },
  };
}

/** OP17-118's printed budget, shared across the two cards it deploys. */
const XEBEC_DEPLOY_BUDGET = 9;

/**
 * Which two bodies OP17-118 puts on the board.
 *
 * The card is the deck's whole rebuild -- draw 1, then play up to two
 * {Rocks Pirates} Characters with different names and a total cost of 9 or less
 * straight out of hand -- and `mechanics/op17-on-play.ts` asks for them as one
 * `choose` with `maxTotalCost` and `distinctNames`, so the engine offers one
 * `resolve-effect` per eligible card and then asks again with the budget
 * reduced. `chooseGenericRules` answers each step with "resolve a legal
 * beneficial effect", which is the first option offered, which is hand order.
 *
 * {@link createOp17XebecTrashPolicy} deliberately leaves OP17-118 out of its
 * ranking, and says why: that choice is the *benefit*, so ranking it by what
 * the deck can most afford to lose would deploy its worst two bodies. But
 * nothing else ranks it either, so the ten-cost payoff deploys whatever the
 * hand happens to be sorted as.
 *
 * ## Why a pair, and not the best card twice
 *
 * Greedy is not the same answer here, because the budget is shared. Taking the
 * largest body first spends most of the 9 on it: OP17-048 Shiki at 7 leaves 2,
 * which reaches only the 1- and 2-drops. The pair that wins is usually the one
 * that fits two real bodies -- OP17-049 Charlotte Linlin at 5 beside OP17-042
 * Kaido at 4, which is 13000 of power *and* a [Blocker], where the greedy line
 * is the same 13000 with nothing that can block. So the rule enumerates the
 * legal pairs and scores the pair.
 *
 * Value is {@link worthInHand}, the same number `createEqualCostPlayModule` and
 * `createBoardReplacementModule` read, so what a Blocker is worth cannot drift
 * between this deck and the format rules that compare the same cards.
 *
 * The second step needs no rule of its own: with one card already taken the
 * budget and the distinct-name exclusion leave the engine offering exactly the
 * partners of that choice, and this rule re-runs against the smaller pool and
 * names the same partner it planned for.
 */
export function createOp17XebecDeployPolicy(): PolicyModule {
  return {
    id: "op17-xebec-deploy",
    decide: ({ observation }): PolicyDecision | undefined =>
      chooseDeploy(observation),
  };
}

function chooseDeploy(
  observation: GameObservation,
): PolicyDecision | undefined {
  const fromXebec = observation.legalActions.filter(
    (action) =>
      action.type === "resolve-effect" &&
      action.sourceCardNumber === "OP17-118",
  );
  // Every legal action has to belong to this decision, or the rule is choosing
  // among a subset and leaving the rest to the ladder.
  if (fromXebec.length !== observation.legalActions.length) return undefined;
  const t = tacticsFor(observation);
  const candidates = fromXebec.flatMap((action) => {
    if (action.type !== "resolve-effect") return [];
    const option = action.option;
    if (option.kind !== "card") return [];
    if (option.zone !== "hand" || option.owner !== "self") return [];
    const card = t.hand.find(
      (held) => held.instanceId === option.card.instanceId,
    );
    return card ? [{ action, card }] : [];
  });
  if (candidates.length < 2) return undefined;

  let best: { action: LegalAction; score: number } | undefined;
  for (const first of candidates) {
    let partner = 0;
    for (const second of candidates) {
      if (second.card.instanceId === first.card.instanceId) continue;
      // The printed restriction, which is on the name rather than the copy.
      if (second.card.cardNumber === first.card.cardNumber) continue;
      if (first.card.cost + second.card.cost > XEBEC_DEPLOY_BUDGET) continue;
      partner = Math.max(partner, worthInHand(second.card));
    }
    const score = worthInHand(first.card) + partner;
    if (!best || score > best.score) best = { action: first.action, score };
  }
  if (!best) return undefined;
  return decision(
    best.action,
    "Deploy the best pair the 9 cost reaches, not the biggest single body: the budget is shared, so the largest card first often leaves room for nothing but a 2-drop.",
  );
}
