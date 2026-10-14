import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  decision,
  type PolicyDecision,
} from "../generic-policy.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { PolicyModule } from "../policy-module.js";
import { createMulliganModule } from "../mulligan.js";
import { heuristicModules, never } from "../heuristics.js";

/**
 * ## The deck's engine, in one paragraph
 *
 * OP09-081's Leader charges a card from hand for every piece of interaction it
 * sells: "[Activate: Main] You may trash 1 card from your hand: Your opponent's
 * [On Play] effects are negated until the end of your opponent's next turn."
 * The bill for that is printed on the same Leader -- "Your [On Play] effects
 * are negated" -- which is why the fifty contains almost no [On Play] text at
 * all, and why every payoff in it reads the *trash* instead: OP09-086 Jesus
 * Burgess is +1000 for every 4 cards in it, PRB02-014 Sabo costs 3 rather than
 * 6 at 15, and ST27-003 Kuzan and ST27-005 Marshall.D.Teach both pull cards
 * back out of it. The deck spends its hand on purpose and is paid in the trash.
 *
 * ## Sources
 *
 * Bandai's own recommended-deck page
 * (https://en.onepiece-cardgame.com/feature/deck/deck_076.php, retrieved
 * 2026-09-07) is both where the list comes from and the only piloting write-up
 * that exists for it. Its claims are in the dossier
 * (`llm/dossiers/st27.ts`); the one below is the opening hand, which that page
 * says nothing about.
 */

/**
 * The bodies this deck's opening hand is actually looking for.
 *
 * All three cost 4, and between them they are twelve of the fifty: OP09-086
 * Jesus Burgess, PRB02-015 Shiryu and EB01-048 Laboon. Four is where the curve
 * starts -- everything cheaper is a 0- or 1000-power utility card and
 * everything above it is a 5-, 6- or 7-drop -- so a hand with none of them has
 * no turn-four play and nothing to protect the Leader with while it waits.
 *
 * OP09-096 My Era...Begins!! is in the list because it is the one card that
 * turns a hand without a body into a hand with one: a 1-cost [Main] that digs
 * 3 for a {Blackbeard Pirates} card and trashes the rest, which is both halves
 * of what this deck wants. It is the only searcher in the fifty.
 */
const ST27_KEEPABLE = [
  "OP09-086",
  "PRB02-015",
  "EB01-048",
  "OP09-096",
] as const;

/**
 * The opening hand: keep on a 4-cost body or on the searcher.
 *
 * The generic keep is `anyEarlyPlay` -- any card costing 2 or less -- and in
 * this fifty that bound is nearly vacuous: twenty of the fifty cards cost 1 or
 * 2, so it keeps almost everything. Worse, it keeps for the wrong reason. Three
 * of those five cheap slots are engine pieces with no board presence at all --
 * OP09-089 Stronger and OP09-090 Doc Q are printed at 0 power and OP09-099
 * Fullalead is a Stage -- so "this hand can act on turn two" says nothing about
 * whether it can act on turn four, which is the turn this deck's curve starts.
 *
 * The Leader is why the distinction bites harder here than the count suggests.
 * Its activation eats a card from hand every time it fires, and the deck has no
 * repeatable draw, so an opening hand is closer to the whole game's resources
 * than it is in most lists. A keep is a statement about whether there is a body
 * at the end of it.
 *
 * PRB02-014 Sabo is deliberately out of the predicate although it is a Blocker
 * the deck badly wants. Its -3 needs 15 cards in the trash, which is a turn-six
 * state at the earliest; in an opening hand it is a 6-drop, and keeping on it
 * would be reading the discount as though it were unconditional -- the same
 * mistake ST-26's predicate avoids with Soba Mask.
 *
 * Expect it to be a wash. It is here because
 * `DECKS_ON_THE_GENERIC_MULLIGAN` is ratcheted and a new deck has to bring a
 * real keep -- and because the generic bound is genuinely wrong about this
 * fifty even though being wrong about it costs almost nothing. A seat that
 * trashes its own hand nine times a game does not care much which hand it
 * started with, and `leader-negation-price` below is what stops that.
 */
export function createSt27TeachMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st27-teach-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        (ST27_KEEPABLE as readonly string[]).includes(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with a 4-cost body (OP09-086, PRB02-015, EB01-048) or with OP09-096, the deck's only searcher: this curve starts at four, and the Leader spends the rest of the hand.",
    mulliganBecause:
      "Mulligan a hand of cheap engine pieces with no 4-cost body and no OP09-096: twenty of this fifty cost 2 or less, but three of those five slots are 0-power utility or a Stage, so acting on turn two says nothing about turn four.",
  });
}

/**
 * The hand size at or below which the Leader's negation is not worth its card.
 *
 * Four, and the exact height barely matters: heights that behave very
 * differently in play land within a fraction of a point of each other. What
 * this rule is worth is "stop taking the clause reflexively", not the
 * particular floor. See the rule below for why four and not higher.
 */
const LEADER_NEGATION_HAND_FLOOR = 4;

/**
 * Do not spend the Leader's negation down to an empty hand.
 *
 * Found by instrumenting the seat rather than by reading the code. Over 40
 * games against ST-26 the deck took OP09-081's `[Activate: Main]` **374
 * times** -- 9.4 a game -- against 284 `play-card` actions in the same sample.
 * It was trashing more cards than it played, and it did so because the clause
 * is repeatable, costs no DON!!, and is therefore offered at every Main-phase
 * decision: the generic ladder takes an optional clause it has no rule for,
 * every time, which is what `heuristics.ts` warns a free repeatable activation
 * will do.
 *
 * The clause is not a mistake to take -- it is the deck's best interaction, and
 * Bandai's own page calls timing it the deck's main way to break up an
 * opponent's plan. What no seat can see is whether the opponent's next turn
 * holds an `[On Play]` worth a card, so "the right time" is not a condition a
 * rule can read. What a rule *can* read is the price, and the price is what was
 * wrong: a hand of one is a deck with no turn.
 *
 * So this is a floor rather than a schedule. It is deliberately not "once per
 * turn": the engine has no once-per-turn signal for a repeatable activation
 * (`leaderReactionSpent` answers a different clause), and a floor caps the
 * count anyway -- each activation costs a card, so the hand walks down to the
 * floor and stops.
 *
 * This rule is worth more than the rest of this file put together, which says
 * less about the rule than about what it replaces: an unpriced free repeatable
 * activation is the single most expensive thing a generic ladder can be
 * handed. It also gates everything else here -- every other rule in this file
 * is about spending a resource well, and none of them can matter while the
 * seat is throwing that resource away nine times a game.
 *
 * A floor of 4, a floor of 6 and never activating at all are within a
 * fraction of a point of each other. Four is kept on the tie-break rather
 * than on the margin: it is the only one of the three that leaves the printed
 * clause reachable, and a rule that switches a card off entirely should have
 * to win to earn that.
 */
const priceTheLeaderNegation = never(
  "Trashing another card for the Leader's [On Play] negation costs more than the negation is worth once the hand is this short: the deck has no repeatable draw, and a hand of one is a turn with no play in it.",
)
  .as("leader-negation-price")
  .when((tactics) => tactics.hand.length <= LEADER_NEGATION_HAND_FLOOR)
  .activate((action) => action.sourceCardNumber === "OP09-081");

/**
 * Do not pay for a negation that is already up.
 *
 * The Leader's clause is `oncePerTurn: false` and costs no DON!!, so the engine
 * offers it again the moment it has resolved -- and a second payment in the
 * same Main phase writes the same expiry the first one did. It buys nothing at
 * all; it is not a mistimed card but a burnt one.
 *
 * Nothing stopped that before, because the state it would have to read was not
 * in the observation: `onPlayNegatedUntilTurn` lived on the engine's
 * `PlayerState` and `observe()` never projected it. This rule ships with the
 * field, as `opponent.onPlayNegated`, merged with the static half so a reader
 * asks "do their [On Play] effects resolve" rather than "which clause switched
 * them off".
 *
 * The window is one turn wide by construction. `restrict-player` writes
 * `until = turn + 1`, which is the opponent's next turn, so a negation paid
 * last turn has already expired by this Main phase -- the only waste this can
 * catch is the second activation within one turn, which the hand floor already
 * bounds to hands of six or more.
 *
 * It is worth more the lower the floor sits, which is what it should be -- a
 * shorter floor allows more repeats for it to catch -- and it interacts with
 * the floor above: most of what a floor below 4 buys is suppressing this waste
 * rather than pricing the card. Four stays the peak with this rule in place.
 *
 * What it is *not* is a timing rule, and timing is not available. Whether the
 * opponent's next turn holds an `[On Play]` worth a card is not a condition
 * any gate here can read: an exemption for a live trash purchase, and a gate
 * on the opponent's next turn being big, both collapse to roughly the value of
 * never activating at all. The clause's whole margin over never using it is a
 * point or so spread across every activation, so what pays is spending it
 * rarely and never twice -- not spending it at a moment.
 */
const doNotRepayALiveNegation = never(
  "Their [On Play] effects are already negated, and a second payment writes the same expiry the first one did: this trashes a card for nothing.",
)
  .as("negation-already-up")
  .when((tactics) => tactics.observation.opponent.onPlayNegated)
  .activate((action) => action.sourceCardNumber === "OP09-081");

/** The deck's in-game rules, one module per rule so each can be disabled. */
export function createSt27TeachModules(): PolicyModule[] {
  return heuristicModules("st27-teach", [
    priceTheLeaderNegation,
    doNotRepayALiveNegation,
    requireAKillerForTheDebuff,
  ]);
}

/** The Leader whose seat this file pilots. */
const ST27_LEADER = "OP09-081";

/**
 * A card in hand, priced for the question "which of these do I trash?".
 *
 * Returns `undefined` for anything that is not a self-owned hand card, which is
 * what discriminates a *cost* from every other choice the deck is offered. Three
 * clauses in the list open this decision -- the Leader's negation, OP09-099
 * Fullalead's search and OP09-089 Stronger's -- and all three offer the whole
 * hand and nothing else. The removal and recursion clauses offer board or trash
 * cards, sometimes mixed with a `confirm`, so they never satisfy the
 * all-options test below.
 */
function pitchValue(
  observation: GameObservation,
  action: LegalAction,
): { power: number; counter: number } | undefined {
  if (action.type !== "resolve-effect") return undefined;
  const option = action.option;
  if (option.kind !== "card") return undefined;
  if (option.zone !== "hand" || option.owner !== "self") return undefined;
  const held = observation.self.hand.find(
    (card) => card.instanceId === option.card.instanceId,
  );
  if (!held) return undefined;
  // A card that is not a body is worth no power on the field, which is what
  // puts the two 1-cost Events and the Stage at the front of the pitch order.
  return { power: option.card.power ?? 0, counter: held.currentCounter };
}

/**
 * Which card pays a trash cost.
 *
 * The second half of the decision `leader-negation-price` above answers the
 * first half of: once the seat has decided to pay, the engine asks *which*
 * card, offering the whole hand and nothing else -- and the generic ladder
 * takes the first offered, which is hand order. Three clauses open it (the
 * Leader's negation, OP09-099 Fullalead's search and OP09-089 Stronger's), and
 * `pnpm census` puts it at roughly a fifth of `main:resolve-effect`, the deck's
 * largest surface at 18.99 decisions a game and 93.3% unruled.
 *
 * Smallest body first, least Counter to break the tie -- the same order
 * OP17-001 Newgate uses.
 *
 * The opposite reading is tempting and wrong, and it is worth saying why.
 * Newgate pitches its smallest bodies because its cheap cards *are* small
 * bodies, whereas three of this deck's five cheap slots are its engine --
 * OP09-096 My Era, the OP09-099 Fullalead Stage and OP09-095 Laffitte are the
 * only card advantage in the fifty, all cost 1, and print 0 or 1000 power.
 * "Smallest body first" pitches exactly those and keeps a 10-cost OP09-093 the
 * deck casts once a game if ever.
 *
 * It is still right, for the same reason the `dead-ramp` reading elsewhere is:
 * a searcher in *hand* is not card advantage yet, and this deck trashes so
 * often that the engine piece it pitches now is one it redraws. What it cannot
 * redraw is a turn -- and a hand pitched down to its 1-costs has no body to
 * put on the board, which against the aggressive lists is the game. The
 * 10-cost OP09-093 a "dearest first" order would dump is also the deck's only
 * 12000 body and its best Counter-phase Blocker.
 */
export function createSt27TeachPitchPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== ST27_LEADER) return undefined;
    const priced = observation.legalActions.map((action) => ({
      action,
      value: pitchValue(observation, action),
    }));
    // Every option has to be a hand card, or this is not a pay-a-cost decision
    // and the rule would be choosing among a subset -- the `rankAmong` trap in
    // the audit playbook, in `decide` form.
    if (priced.some((entry) => entry.value === undefined)) return undefined;
    if (priced.length < 2) return undefined;
    const ranked = priced as {
      action: LegalAction;
      value: { power: number; counter: number };
    }[];
    const best = ranked.reduce((left, right) => {
      if (right.value.power !== left.value.power) {
        return right.value.power < left.value.power ? right : left;
      }
      return right.value.counter < left.value.counter ? right : left;
    });
    return decision(
      best.action,
      "Pay the trash cost with the smallest body in hand: a hand pitched down to its 1-costs has no board to put down, and this deck redraws an engine piece far more easily than a turn.",
    );
  };
}

/**
 * Every clause in the list that lowers an opponent's cost.
 *
 * EB01-048 Laboon (-4), OP09-083 Van Augur (-3) and OP09-089 Stronger (-2). A
 * cost debuff is not removal on its own: nothing in this deck reads an
 * opponent's cost except the two K.O. clauses below, so a debuff with nothing
 * to convert it changes no board.
 *
 * Stronger is in the set, and the argument for exempting it is real -- it
 * draws a card, and it trashes *itself* rather than resting, so unlike the
 * other two it gives up no block. Exempting it costs half the rule; see the
 * veto below for why.
 */
const ST27_COST_DEBUFFS = new Set(["EB01-048", "OP09-083", "OP09-089"]);

/** The two clauses that turn a lowered cost into a dead Character. */
const ST27_COST_KILLERS = new Set(["ST27-005", "OP09-090"]);

/**
 * Do not spend a cost debuff with nothing to convert it.
 *
 * Bandai's own page states the combination as the deck's mid-game: "K.O. your
 * opponent's Characters with the [Activate: Main] effects of OP09-090 Doc Q and
 * ST27-005 Marshall.D.Teach. Combine with effects that reduce the cost of your
 * opponent's Characters to K.O. them one after another." The debuffs are the
 * enablers, and the ceilings they enable -- cost 1 or less, cost 3 or less --
 * reach almost nothing in this format on their own.
 *
 * The generic ladder cannot see the combination. `inert-activation` already
 * vetoes an activation whose every selection finds nothing, which covers an
 * empty opposing board; it cannot cover an activation that selects a real
 * target and buys nothing, and that is what a debuff is when no K.O. clause is
 * standing. So the seat rested a 5000 Laboon or a 6000 Van Augur -- giving up
 * the block, which for a deck at this win rate is most of what those bodies do
 * -- to lower a cost nothing would read.
 *
 * The gate is "is there an *active* ST27-005 or OP09-090 on my board", because
 * both K.O. clauses pay by resting themselves: a rested one cannot fire this
 * turn, so the debuff has nothing to convert it even though the card is out.
 *
 * The veto covers all three debuffs including OP09-089 Stronger, and
 * exempting Stronger costs half of what the rule is worth. What the exemption
 * argument misses is that Stronger's card is a *replacement* and not a profit:
 * it trashes one from hand and itself to draw one, so a Stronger spent with no
 * K.O. standing has turned a body and a card into a card and a debuff nothing
 * reads.
 */
const requireAKillerForTheDebuff = never(
  "Resting a body to lower an opponent's cost buys nothing while no ST27-005 or OP09-090 is standing to K.O. what the debuff put in range -- and it gives up the block, which is most of what a 5000 or 6000 body does here.",
)
  .as("debuff-needs-a-killer")
  .when(
    (tactics) =>
      !tactics.observation.self.board.some(
        (card) => ST27_COST_KILLERS.has(card.cardNumber) && !card.rested,
      ),
  )
  .activate((action) => ST27_COST_DEBUFFS.has(action.sourceCardNumber));

/**
 * Cards this deck will not feed to a Counter, because spending one costs it the
 * game plan rather than a card.
 *
 * `chooseGenericCounter` ships an empty protected set, so an unpiloted seat
 * values a card in hand at its printed Counter and nothing else -- and this
 * deck's Counter values run the wrong way against its card values. PRB02-014
 * Sabo prints one of the list's only two 2000s, so it is among the first cards
 * the generic policy reaches for; it is also a 6000 [Blocker] that costs 3 once
 * the trash is deep, which is the body this deck most wants on the board in the
 * turns it is trying to survive.
 *
 * The other three are the 4-cost bodies the mulligan keeps, for the reason the
 * pitch rule refuses to trash them: this deck's losing games are the ones where
 * it has no board, and a 1000 Counter is a poor price for the only turn-4 play
 * in hand.
 */
const ST27_PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  "OP09-086",
  "PRB02-015",
  "EB01-048",
  "PRB02-014",
]);

/**
 * The Counter phase, which is a whole decision rather than a narrowing and so
 * cannot be a heuristic.
 *
 * `pnpm census` reads this deck's `counter:counter` at 2.91 decisions a game
 * and **100.0% no rule at all** -- the largest wholly unpiloted surface it has
 * left, now that the Main phase is piloted.
 *
 * `counterEventBeatsCards` is deliberately unset, unlike ST-26's and ST-33's:
 * this fifty prints no [Counter] Event at all, so the knob has nothing to
 * answer and setting it would be a rule that cannot fire.
 *
 * Protecting the three 4-cost bodies and protecting them plus Sabo are worth
 * the same to within what this instrument can separate, so Sabo is in the set
 * on the argument rather than on a margin: what pays is protecting the deck's
 * bodies at all, not which four.
 */
export function createSt27TeachDefensePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== ST27_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: ST27_PROTECTED_FROM_COUNTER,
    });
  };
}
