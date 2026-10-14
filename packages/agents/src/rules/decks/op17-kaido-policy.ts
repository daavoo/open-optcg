import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  decision,
  isOptionCardIn,
  opponentLeaderId,
  optionCard,
  type PolicyDecision,
} from "../generic-policy.js";
import {
  avoid,
  heuristics,
  never,
  prefer,
  WEIGHT,
  type Heuristic,
} from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { Tactics } from "../tactics.js";

const KAIDO_LEADER = "OP17-058";
/**
 * EB04-031 King: "[printed text omitted -- pnpm card:text EB04-031]"
 *
 * Free, once a turn, and the reason the deck reaches ten DON!! early. The
 * engine withholds the offer when the name gate fails, so an offered King
 * activation is always worth taking.
 */
const KING = "EB04-031";
/**
 * EB04-032 Queen: "[printed text omitted -- pnpm card:text EB04-032]"
 *
 * Not free: two active DON!! now for three rested ones that stand up next turn.
 * A gain of one DON!! per turn, paid for with this turn's spending power.
 */
const QUEEN_RAMP = "EB04-032";
/**
 * OP17-073 Basil Hawkins, OP17-074 Yamato and OP17-060 Ulti & Page One: a body
 * that adds a DON!! on the way in, which is the ramp this deck most wants
 * because it leaves something on the table.
 */
const RAMP_BODIES = ["OP17-073", "OP17-074", "OP17-060"];
/** OP17-078 Drunken Dragon Bagua: rest 2 DON!! and trash 2 for 3 rested DON!!. */
const BULK_RAMP_EVENT = "OP17-078";
/**
 * OP17-062 Kaido, which watches DON!! going back to the DON!! deck and answers
 * each one with an active DON!! from the deck and a rested one stood up. Every
 * `DON!! −N` in this list is cheaper while it is on the board, and the Leader's
 * is the one paid most often.
 */
const RETURN_PAYOFF = "OP17-062";
/**
 * OP17-075 X.Drake: "[printed text omitted -- pnpm card:text OP17-075]"
 *
 * `DON!! −N` *returns* the DON!! to the DON!! deck rather than resting it, so
 * this is two DON!! off the field of the deck whose plan is the field's DON!!
 * count -- see `drakeDonIsThePlan` below.
 */
const DISCARD_BODY = "OP17-075";
/**
 * OP17-068 Sasaki: "[printed text omitted -- pnpm card:text OP17-068]"
 */
const ATTACK_RAMP = "OP17-068";
/**
 * OP17-062 Kaido: "[printed text omitted -- pnpm card:text OP17-062]"
 */
const REFUND_KAIDO = "OP17-062";
/**
 * OP08-074 Black Maria: "[printed text omitted -- pnpm card:text OP08-074]"
 *
 * Five rested DON!! now, and at the end of the turn the field goes back to the
 * opponent's count -- see `black-maria-only-from-behind` below.
 */
const BLACK_MARIA = "OP08-074";
/**
 * OP15-078 Mamaragan: "[printed text omitted -- pnpm card:text OP15-078]"
 *
 * Cast in the Main phase it is a card and a rest for two DON!! off the field;
 * held, it is a +1000 Counter that draws.
 */
const MAMARAGAN = "OP15-078";
/**
 * ST34-004 Charlotte Linlin: "[printed text omitted -- pnpm card:text ST34-004]"
 *
 * The tournament list's third cost-10. Its `DON!! −4` is paid out of the field a
 * 10-cost play has just rested, so it is a Life card bought with DON!! the turn
 * had already spent -- and its "trash 1 card from your hand" is a brick's job.
 */
const LINLIN = "ST34-004";
/** A full DON!! field. The DON!! deck is ten, so the ramp cannot pass this. */
const DON_CAP = 10;

/**
 * The cards the deck cannot replace and cannot protect for a DON!!.
 *
 * Deliberately not King or EB04-030 Kaido: both print "[printed text omitted -- pnpm card:text EB04-030]", which answers battle destruction as well as removal, so spending a
 * card from hand on them buys what a DON!! already buys. The three here have no
 * such clause, cost 10, and are the whole of the deck's late game.
 */
const PROTECTED_CARDS: ReadonlySet<string> = new Set([
  "OP17-062",
  "OP17-063",
  "OP17-061",
  "OP17-069",
  LINLIN,
]);

/**
 * The cheap pieces that make a keepable opening hand.
 *
 * The ramp bodies and Queen, plus OP17-075 X.Drake and OP17-068 Sasaki, the only
 * other cards Bandai's list can cast in the first three turns. Not the
 * tournament list's OP07-077: it looks at five cards for one, so a hand whose
 * only early play is the dig has not yet found the ramp it is keeping for.
 */
const OPENING_ENGINE = [QUEEN_RAMP, DISCARD_BODY, ATTACK_RAMP, ...RAMP_BODIES];

/**
 * OP-17 Purple Kaido, the DON!! ramp deck.
 *
 * ## The engine, in one paragraph
 *
 * Everything before the cost-10 turn converts DON!! into more DON!!. EB04-032
 * Queen turns two active DON!! into one rested one, which still stands up in
 * the next Refresh Phase, so it is a loss now for a gain next turn; EB04-031
 * King adds one active and one rested DON!! every turn, for free, as long as no
 * second [King] is on the board; OP17-073, OP17-074, OP17-060, OP17-068 and
 * OP17-078 buy DON!! with cards. The payoff is a cost-10 body a turn earlier than the format
 * expects -- OP17-062 Kaido, whose own reaction hands a DON!! back every time
 * one is returned to the DON!! deck, or OP17-063 Kaido, which negates and
 * K.O.s a cost-6-or-less Character on the turn it lands. The Leader itself is
 * not ramp: "DON!! −1: give up to 1 opposing Character −2000 power", once per
 * turn, on either player's attack, is removal support that also feeds
 * OP17-062's reaction.
 *
 * King protects itself rather than needing protection: it cancels a K.O. by
 * returning a DON!! to the DON!! deck, and it does not say "by your opponent's
 * effect", so battle destruction counts too.
 *
 * Sources for the plan: Bandai's own feature-deck page for this list
 * (https://en.onepiece-cardgame.com/feature/deck/deck_110.php, retrieved
 * 1 Sep 2026), the OPDeckGuide mini guide whose "Your Best Curve" section is
 * the sequencing the first two rules below encode
 * (https://opdeckguide.com/deck-guides/kaido-op17/, retrieved 26 Aug 2026),
 * and Thornberry Media's assessment of the same shell
 * (https://www.thornberrymedia.com/post/op-17-kaido-deck-list). Restated for
 * the LLM seat in `packages/agents/src/llm/dossiers/op17-kaido.ts`.
 *
 * ## Why this file exists
 *
 * The deck had no policy, and `chooseGenericRules` pilots a ramp deck exactly
 * backwards: its Main ladder plays the **highest-cost affordable card** and only
 * looks at `activate-main` once nothing is affordable. One traced game
 * (`pnpm trace:match --p1 "(Purple) Kaido - Official Feature Deck" --p2 "(Red)
 * Monkey.D.Luffy - Starter Deck 31" --seed rules-benchmark-2`) is the argument:
 * over eleven turns the seat activated the ramp **zero** times -- Queen sat on
 * the board from turn 1 having never converted a DON!!, King was never
 * activated, OP07-077 was never cast -- and reached ten DON!! on the natural
 * schedule, which is the one schedule the deck cannot win on. The whole-field
 * unpiloted seat won **30.8%** of the format six.
 *
 * ## How the two modules compose
 *
 * `pnpm deck:ab --deck "(Purple) Kaido - Official Feature Deck" --disable
 * op17-kaido --disable op17-kaido-defense`: treatment is
 * as-shipped, control is the same agent minus both modules, so the comparison
 * is paired on one build rather than across two.
 *
 * The matchups that move are the ones the ramp decides.
 *
 * The two `prefer` rules and the vetoes are load-bearing *together* rather
 * than separately, and dropping the ranking alone is catastrophic. The veto
 * stops the deck spending DON!! before it ramps, and without the ranking the
 * generic ladder answers "some activation, then" with whichever one it is
 * offered first -- OP17-061 Lead Performers trashing itself, most often. A
 * veto that redirects a choice has to say what to redirect it *to*.
 *
 * ## The Leader's DON!! −1
 *
 * `debuffDecidesTheBattle`, below, was added with the engine fix that made the
 * ability reachable at all: both of its windows were gated on
 * `requires: { activeDon: 1 }` while the printed cost is `DON!! −1`, which
 * `returnDonToDeck` pays out of rested DON!! -- so the clause had never fired
 * on a turn this deck had spent its DON!!, which is every turn.
 *
 * Unblocking it without a rule takes the deck to near-zero: the generic
 * ladder reaches `resolve-effect` as "resolve a legal beneficial effect", took
 * the offer on every attack either player declared, and handed a DON!! back
 * each turn for -2000 on a card that was not in the battle -- which halves the
 * growth rate of a deck whose plan is the DON!! count. With the rule in place
 * the fix is a clear gain instead.
 *
 * ## Where the deck still loses
 *
 * Less than it did. The list this file was written against was the
 * OPDeckGuide one, and the gap was in the 50 as much as in the ladder. Both
 * halves of that have now been acted on:
 *
 *  - the 50 is Bandai's own feature deck
 *    (https://en.onepiece-cardgame.com/feature/deck/deck_110.php), which is a
 *    clear upgrade on the OPDeckGuide list with this policy unchanged.
 *  - the new list brought eight clauses that buy something with a DON!! off
 *    the field or a card out of hand, and `createOp17KaidoEconomyPolicy`
 *    below is what prices them. It is the largest single rule for this deck.
 *
 * The tournament field plays a different 50 around the same ramp core, and
 * this file pilots it too: "(Purple) Kaido - Open OPTCG" runs OP07-077, ST34-004, OP07-076, OP15-078, OP08-077, OP08-074 and
 * EB04-030 where Bandai's runs OP17-060, OP17-068, OP17-069 and OP17-078.
 * What those cards need from the policy is `KAIDO_FIELD_LIST_RULES` and
 * `search:op17-kaido`; every rule written against Bandai's cards is silent on
 * the ones it does not name.
 *
 * What is left after that is structural: a deck whose plan is to reach turn 10
 * alive is behind a field of starter-deck aggro, and the three matchups this
 * seat still loses at better than 90% -- OP17 Ace, OP17 Sabo, OP17 Shanks --
 * are the three that end before the ramp pays.
 */
export function createOp17KaidoRulesPolicy(): PolicyModule {
  return heuristics("op17-kaido", [
    // --- Ramp before development ------------------------------------------
    //
    // "Take King's free DON!! before spending DON!! on a body" lived here as
    // `king-ramp-first` until 2026-09-05. It is `ramp#free-ramp-first` now, in
    // `strategy/ramp.ts`, written about the shape rather than the card: an
    // activation that costs nothing and adds active DON!!, which the engine
    // reports on the action as `cost` and `ramps`. For this deck that is King
    // and only King, so the two are the same veto and the move is behaviour-
    // preserving; the arm is recorded on the ramp rule.
    //
    // Queen's conversion is the opposite case: it *costs* two active DON!!, so
    // taking it on a turn whose DON!! was going to be spent is a play given up
    // for one DON!! next turn. Only convert what this turn cannot use.
    never("Convert Queen's DON!! only with DON!! this turn cannot spend.")
      .as("queen-ramp-with-spare-don")
      .when(
        (t) =>
          t.cheapestAffordablePlay > 0 && t.don - 2 < t.cheapestAffordablePlay,
      )
      .activate((action) => action.sourceCardNumber === QUEEN_RAMP),

    // Among activations, the ramp comes first: King (free), then Queen, then
    // the 1-cost dig. `rank` keeps the generic ladder as the chooser and only
    // narrows what it is choosing between.
    prefer("Ramp first among the Main phase's activations.")
      .as("ramp-activation-order")
      .by(WEIGHT.deck)
      .activate((action) => {
        if (action.sourceCardNumber === KING) return 3;
        if (action.sourceCardNumber === QUEEN_RAMP) return 2;
        if (action.sourceCardNumber === BULK_RAMP_EVENT) return 1;
        return false;
      }),

    // --- Finding King -----------------------------------------------------
    //
    // The archetype's weakness list is "highly dependent on playing 6c King
    // exactly on curve". The tournament list answers it with four OP07-077, a
    // 1-cost dig five deep, and what that dig takes is `search:op17-kaido` in
    // `search-values.ts`. Bandai's list has no search, so for it what is left
    // of the claim is the veto below and the mulligan.

    avoid("A second [King] switches the first one's ramp off.")
      .as("no-second-king")
      .by(WEIGHT.deck)
      .when((t) => t.copiesOnBoard(KING) >= 1)
      .play((card) => card.cardNumber === KING),

    // Nothing here narrows *which body to play*, and that is deliberate. Two
    // readings look obvious and both are large losses -- "play King ahead of
    // a bigger body", and "lead the 3-cost slot with OP17-074 Yamato". They
    // were the reason #61 built `preferAmong` at all, and they stay wrong
    // even with the tier no longer hiding the cards a rule does not name:
    //
    //  - preferring Yamato over Basil Hawkins in the 3-cost slot is a large
    //    loss in every matchup, and inverting it -- Hawkins over Yamato -- is
    //    a smaller loss. That both directions lose is the finding: both are
    //    4-ofs in all eight published tournament lists because the deck wants
    //    both, and the generic ladder's cost sort already takes whichever the
    //    turn offers. Forcing either order loses.
    //  - preferring a [Blocker] over a non-blocking body while `selfLife <= 2`
    //    also loses. At two Life this deck's answer is its cost-10 bodies, not
    //    a 1000-power [Blocker]. Gating the same rule on
    //    `incomingLeaderAttacks >= selfLife` instead changes nothing.
    //
    // Note that a rule naming a *single* card cannot bite at all under
    // `preferAmong`, which compares only the candidates one rule scored: it
    // has nothing to outrank and is a documented no-op. Making such a claim
    // real needs a total order over every play.
    //
    // The pattern across all four is the finding worth keeping: every
    // narrowing of *which body to play* costs this deck. Its generic ladder
    // already plays the largest affordable body, which is what a deck of
    // 12000s wants, and the ramp ordering above is the only place a rule has
    // paid. The next thing to try is not another play rule.

    // --- Attachments -------------------------------------------------------
    //
    // DON!! given to a card leaves the cost pool, and this deck's costs are its
    // whole plan: +1000 power on a Leader that is not winning a battle is the
    // worst thing spare DON!! can become while the ramp is still unspent.
    never("Do not power up while a ramp activation is unspent.")
      .as("ramp-before-power")
      .when((t) => t.activationOffered(KING) || t.activationOffered(QUEEN_RAMP))
      .attachDon(() => true),
  ]);
}

/**
 * What a card and a DON!! are worth to this deck, which the generic ladder
 * cannot know.
 *
 * `chooseGenericRules` resolves an optional clause by taking the first non-skip
 * option -- "resolve a legal beneficial effect". That is right for a clause
 * whose cost is already sunk and wrong for every clause in Bandai's list whose
 * cost is paid out of the deck's own plan, and Bandai's list holds eight of
 * them.
 *
 * OP17-075 X.Drake's `DON!! −2` is the one that matters: it is offered in most
 * games, often more than once, and the generic ladder takes it every time. That
 * is two DON!! *off the field*
 * per firing -- `DON!! −N` returns them to the DON!! deck rather than resting
 * them -- traded for one card of the opponent's choosing out of a hand they can
 * refill. A deck whose whole plan is to reach ten DON!! several turns early
 * cannot pay that price one and a half times a game; the natural progression
 * only adds one DON!! a turn.
 *
 * Registered as its own module so `pnpm deck:ab --deck "(Purple) Kaido -
 * Official Feature Deck" --disable op17-kaido-economy` measures it apart from
 * the ramp ordering in `op17-kaido`.
 */
export function createOp17KaidoEconomyPolicy(): PolicyModule {
  return heuristics("op17-kaido-economy", [
    // --- Spending DON!! off the field --------------------------------------
    //
    // The two states where the two DON!! are genuinely spare, and no others:
    //
    //  - the field is at the cap. The DON!! deck is ten and the field cannot
    //    hold more, so the ramp has nowhere left to put a DON!! and returning
    //    two makes room the deck refills for free -- King alone adds two a
    //    turn.
    //  - the opponent is holding one card. Then "trash 1 card from your
    //    opponent's hand" is their whole hand rather than their worst card,
    //    which is the only version of this clause worth a turn of ramp.
    //
    // Not gated on OP17-062 Kaido's refund, although it halves the price: the
    // refund is [Once Per Turn] and every other `DON!! −N` in the deck --
    // the Leader's debuff, OP17-061, OP17-063, OP17-069 -- wants the same one
    // firing, and each of those buys removal or Life rather than one card.
    //
    // Reads the offer's `cost` rather than its `optionId`: the engine now says
    // what accepting an optional clause pays, and "this option returns DON!! to
    // the DON!! deck" is the fact the rule is about. The card gate stays,
    // because the *price* this rule tolerates is X.Drake's -- a `DON!! −1` that
    // draws (OP17-069) or K.O.s is a different trade, priced elsewhere.
    never("Two DON!! off the field is more than one card out of a full hand.")
      .as("drake-don-is-the-plan")
      .when((t) => t.fieldDon < DON_CAP && t.opponentHandCount > 1)
      .effect(
        (action) =>
          action.sourceCardNumber === DISCARD_BODY &&
          (action.cost?.returnsDon ?? 0) > 0,
      ),

    // --- Spending cards ----------------------------------------------------
    //
    // Sasaki's two rested DON!! cost two cards, and this deck's cards are its
    // Counter. Worth it while the ramp still has somewhere to go and the hand
    // is deep enough that two leaving it is not the whole defence; at the cap
    // the DON!! arrive with nothing to spend them on and the trade is two cards
    // for nothing.
    never("Two cards for two DON!! only with cards to spare and room to ramp.")
      .as("sasaki-cards-are-counter")
      .when((t) => t.fieldDon >= DON_CAP || t.hand.length < 4)
      .effect(
        (action) =>
          action.sourceCardNumber === ATTACK_RAMP &&
          (action.cost?.trashesFromHand ?? 0) > 0,
      ),

    // Which cards pay a hand cost. Four clauses in this list take one -- Queen
    // and Basil Hawkins one card, Sasaki and Drunken Dragon Bagua two -- and
    // the generic ladder pays every one of them with whichever card the engine
    // offered first. The deck has a right answer: its own bricks. A card that
    // cannot be cast this turn is doing nothing, a card with a Counter is the
    // defence the archetype is short of, and King is the engine everything else
    // is ramping towards.
    //
    // `prefer` rather than `preferAmong`, and it scores every hand option
    // rather than only the ones it likes: a rule that scores just its winner
    // hides nothing, and the generic first-offer default keeps winning.
    prefer("Pay a hand cost with the brick, not with the Counter.")
      .as("hand-costs-paid-with-bricks")
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (!HAND_COST_CLAUSES.has(action.sourceCardNumber)) return false;
        if (!isOptionCardIn(action, "self", "hand")) return false;
        return discardValue(action, t);
      }),
  ]);
}

/**
 * The clauses that take a card out of hand as a cost, and only those.
 *
 * Scoped by card number on purpose: OP17-061 Lead Performers also offers a
 * choice over cards in hand, and that one *plays* a [King], [Queen] or [Jack],
 * so the rule below would pick the worst of them exactly backwards.
 */
const HAND_COST_CLAUSES: ReadonlySet<string> = new Set([
  QUEEN_RAMP,
  ATTACK_RAMP,
  BULK_RAMP_EVENT,
  "OP17-073",
  LINLIN,
]);

/** How willing this deck is to trash a given card in hand, higher first. */
function discardValue(
  action: Extract<LegalAction, { type: "resolve-effect" }>,
  t: Tactics,
): number {
  const option = optionCard(action);
  if (!option) return 0;
  const { cardNumber } = option.card;
  // An Event prints no cost of its own on the card facts; treat it as free, so
  // a 0-cost Counter Event is never mistaken for a brick.
  const cost = option.card.cost ?? 0;
  const counter = option.card.counter ?? 0;
  let score = 0;
  // A card this turn cannot cast is doing nothing; the deck's bricks are its
  // cost-9-and-10 bodies and there are eighteen of them.
  if (cost > t.don) score += 40;
  score += cost;
  // Counter is the density the archetype is short of -- fifteen of the fifty
  // print none -- so a 2000 Counter is worth more in hand than a 1000.
  score -= counter / 100;
  // King is what the ramp is for, and a second one is switched off by the
  // first, which is what makes the spare copy the right thing to trash.
  if (cardNumber === KING && t.copiesOnBoard(KING) === 0) score -= 60;
  // The cost-10 Kaidos are the payoff, but only once there is a turn to cast
  // them on; before that they are the bricks the clause exists to convert.
  if (cardNumber === REFUND_KAIDO && t.donOnField >= 8) score -= 40;
  return score;
}

/**
 * How much the deck wants each of its finishers back on the turn it can cast one.
 *
 * Only the cost-9-and-10 bodies appear, because they are the only cards that
 * share the brick band for most of a game; a number here is a rank among them
 * and nothing else.
 */
const PAYOFF_KEEP_ORDER: ReadonlyMap<string, number> = new Map([
  [REFUND_KAIDO, 4],
  ["OP17-063", 3],
  [LINLIN, 3],
  ["OP17-061", 2],
  ["OP17-069", 1],
]);

/**
 * The Life total from which this seat judges a Leader hit against the board
 * that refreshes after it, rather than against what can still swing this turn.
 *
 * The field default is 2, and it prices a Leader hit at roughly "worth a card",
 * because the Life card taken goes to the defender's hand. That exchange rate
 * is wrong for this 50: eighteen of its fifty cost 9 or 10, so the card a Life
 * hit hands this seat is often one it cannot cast for several turns, while
 * fifteen print no Counter at all. A deck that cannot use what Life buys should
 * not be selling it at that price.
 *
 * Five is this Leader's starting Life, so in practice the refreshed board is
 * what every Leader hit is judged against, and the threshold only re-enters
 * once OP17-061 has healed above five. That is the claim, stated plainly: this
 * seat does not get to treat a nonlethal hit as free, because the board that
 * takes the rest of its Life is the one standing after the hit, not the one
 * that can still swing before it.
 *
 * The other half of the argument is the archetype's: every published assessment
 * names a fast aggro start as this deck's worst matchup, and an aggro board
 * grows an attacker a turn, so the Counter that answers a hit costs one card
 * now and three later.
 */
const REFRESHED_BOARD_HORIZON_AT_LIFE = 5;

/** The Leader's debuff, in the only terms that decide whether to pay for it. */
const LEADER_DEBUFF = 2_000;

/**
 * Whether the Leader's `DON!! −1` changes the battle it is offered in.
 *
 * "[printed text omitted -- pnpm card:text <card>]" Both
 * windows open on their own, on every attack either player declares, so the
 * offer arrives many times a game and is not worth a DON!! in all of them.
 *
 * **Defending**, it is worth one whenever a Character's attack would land.
 * Either the 2000 takes the attack out of range, or it comes off the
 * shortfall the Counter step is about to price: a 3001 gap is two Counter
 * cards and a 1001 gap is one, so the DON!! buys a card back out of the hand
 * the deck has to defend with. Asking only "does -2000 alone decide this
 * battle" prices the second case at nothing, and that is most of the
 * battles a Leader at low Life is asked to survive.
 *
 * **Attacking**, it only matters against a Character, and only when 2000 is
 * what the attack is short by. A Leader attacking a Leader is untouched by it
 * either way, and so is a battle already decided.
 *
 * The generic ladder cannot make that call: `resolve-effect` reaches it as
 * "resolve a legal beneficial effect", which takes the offer every turn. The
 * engine is right to offer it -- the debuff does land -- so the judgement
 * belongs here.
 */
function debuffDecidesTheBattle(observation: GameObservation): boolean {
  const battle = observation.activeBattle;
  if (!battle) return false;
  // The attacker wins ties, so an attack lands on `>=`, not `>`.
  const lands = (attack: number, defence: number): boolean => attack >= defence;
  const defence = battle.targetPower + battle.counterPower;
  if (observation.turnPlayer !== observation.viewer) {
    // Defending: the 2000 comes off the attacker, so an attack led by a Leader
    // -- which the clause cannot target -- is unaffected by paying for it.
    if (battle.attackerInstanceId === opponentLeaderId(observation))
      return false;
    return lands(battle.attackPower, defence);
  }
  // Attacking: the 2000 comes off the target, so it only matters against a
  // Character, and only when 2000 is what this attack is short by.
  if (battle.targetInstanceId === opponentLeaderId(observation)) return false;
  return (
    !lands(battle.attackPower, defence) &&
    lands(battle.attackPower, defence - LEADER_DEBUFF)
  );
}

/**
 * The opening hand: a way to reach King on curve.
 *
 * The generic rule keeps any hand with a cost-2-or-less card, which in this
 * deck is only EB04-032 Queen and OP07-077 -- and throws away a hand holding
 * two 3-cost ramp bodies. What this deck needs from an opening hand is a way to
 * reach King, not a cheap card.
 */
export function createOp17KaidoMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op17-kaido-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        OPENING_ENGINE.includes(card.cardNumber),
      ),
    keepBecause: "Keep a hand with a ramp piece to reach King on curve.",
    mulliganBecause: "Mulligan a hand with no way to ramp.",
  });
}

/**
 * The Counter phase, which is a `decide` rather than a narrowing and so cannot
 * live in the heuristics module above.
 *
 * Registered separately so `pnpm deck:ab --disable op17-kaido-defense`
 * measures the two halves apart.
 */
export function createOp17KaidoDefensePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== KAIDO_LEADER) return undefined;
    const actions = observation.legalActions;

    const leaderOffer = actions.filter(
      (action) =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === KAIDO_LEADER &&
        (action.optionId === "apply" || action.optionId === "skip"),
    );
    if (leaderOffer.length === 2) {
      const pay = debuffDecidesTheBattle(observation);
      return decision(
        leaderOffer.find(
          (action) =>
            action.type === "resolve-effect" &&
            action.optionId === (pay ? "apply" : "skip"),
        )!,
        pay
          ? "Spend the Leader's DON!! on the 2000 that decides this battle."
          : "Keep the DON!! on the field: -2000 changes nothing here.",
      );
    }

    if (observation.phase === "counter") {
      return chooseGenericCounter(observation, actions, {
        protectedCards: PROTECTED_CARDS,
      });
    }
    return undefined;
  };
}

/**
 * Whether one card out of hand stops the attack outright.
 *
 * The price of a Life card is what the whole horizon question turns on, and it
 * is not a constant: the same hit costs one Counter card early and three once
 * the attacks have grown. Buying Life back is worth it at one card and is the
 * hand this deck needs for its own turn at three, so the wider horizon is
 * offered only where the purchase is cheap.
 *
 * Reads `counterPower` off the offered action rather than re-deriving it from
 * the hand: the engine states what each card adds, and a second copy of that
 * arithmetic is the drift `tactics.ts` exists to prevent.
 */
function oneCardStopsIt(
  observation: GameObservation,
  actions: readonly LegalAction[],
): boolean {
  const battle = observation.activeBattle;
  if (!battle) return false;
  const required =
    battle.attackPower - battle.targetPower - battle.counterPower + 1;
  return actions.some(
    (action) =>
      action.type === "counter" && (action.counterPower ?? 0) >= required,
  );
}

/**
 * The same Counter phase, judged against the board that refreshes after the hit
 * rather than against what can still swing this turn.
 *
 * Ordered ahead of `op17-kaido-defense`, and it speaks only where the two
 * horizons actually disagree: it asks the shared Counter policy both ways and
 * returns nothing unless the wider reading picks a different action. So the
 * module is additive rather than a second copy of the Counter phase -- every
 * decision it stays silent on is answered by the defense policy underneath,
 * unchanged, and `pnpm deck:ab --deck "(Purple) Kaido - Official Feature Deck"
 * --disable op17-kaido-counter-horizon --seeds 100` prices exactly the
 * decisions it flipped.
 *
 * It declines the Leader's `DON!! -1` offer in the same shape the defense policy
 * does, so a decision it does not own falls through untouched.
 */
export function createOp17KaidoCounterHorizonPolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== KAIDO_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    const actions = observation.legalActions;
    // The Leader's own apply/skip offer arrives inside this phase too, and
    // `debuffDecidesTheBattle` in the defense policy is what answers it.
    const answersTheDebuff = actions.some(
      (action) =>
        action.type === "resolve-effect" &&
        action.sourceCardNumber === KAIDO_LEADER,
    );
    if (answersTheDebuff) return undefined;
    if (!oneCardStopsIt(observation, actions)) return undefined;
    const atFieldDefault = chooseGenericCounter(observation, actions, {
      protectedCards: PROTECTED_CARDS,
    });
    const widened = chooseGenericCounter(observation, actions, {
      protectedCards: PROTECTED_CARDS,
      refreshedBoardHorizonAtLife: REFRESHED_BOARD_HORIZON_AT_LIFE,
    });
    if (widened.action.actionId === atFieldDefault.action.actionId)
      return undefined;
    return widened;
  };
}

/**
 * The two decisions the probe found this deck answering by first offer.
 *
 * A 126-game probe of every `resolve-effect` no rule of this deck's touched put
 * OP17-061 Lead Performers' free play at 0.67 a game, and a scan of the seat's
 * own turn-ends found 49 of 489 (10%) where the Leader's `DON!! -1` would have
 * turned a losing attack into a winning one and the turn ended instead.
 *
 * One module per rule (`op17-kaido-effects#<name>`), so `pnpm deck:ab --deck
 * "(Purple) Kaido - Official Feature Deck" --disable op17-kaido-effects#<name>
 * --seeds 100` prices each alone.
 */
export const KAIDO_EFFECT_RULES: readonly Heuristic[] = [
  // OP17-061 Lead Performers trashes itself to put a [King], [Queen] or [Jack]
  // straight onto the board, and the generic ladder took whichever the engine
  // listed first. The play is free, so size is the default order -- both 9-cost
  // bodies are 10000 with an [On Play] -- and King is the exception: a 7000 that
  // adds two DON!! a turn beats a 10000 while the ramp still has somewhere to
  // go, and is switched off by a second copy of itself.
  //
  // Note what this clause is not. Lead Performers costs 9 and trashes itself
  // from the *board*, so reaching it means having already paid more than King's
  // own six -- the free play is late-game conversion, never acceleration.
  //
  // Scores every candidate rather than only its winner, so the generic
  // first-offer default cannot win by silence. Expect it to be small: the
  // clause fires under once a game, and a free body is a free body -- the
  // rule only decides *which*.
  prefer("Free-play King while its ramp still pays, else the biggest body.")
    .as("lead-performers-picks-king")
    .by(WEIGHT.deck)
    .effect((action, t) => {
      if (action.sourceCardNumber !== "OP17-061") return false;
      if (!isOptionCardIn(action, "self", "hand")) return false;
      const card = optionCard(action)?.card;
      if (!card) return false;
      const rampPays = t.fieldDon < DON_CAP && t.copiesOnBoard(KING) === 0;
      if (card.cardNumber === KING) return rampPays ? 100 : 1;
      return (card.cost ?? 0) + 2;
    }),

  // Which brick pays, once `hand-costs-paid-with-bricks` has settled that a
  // brick is paying. Its score and this one's are summed.
  //
  // `discardValue` separates the cards this turn cannot cast from the ones it
  // can, and then orders within that band by cost -- so the dearest card in
  // hand pays first. Cost is the right question for the band and the wrong one
  // inside it: every card in it is equally dead *now*, and what separates them
  // is what the deck gives up on the turn it can finally cast one. Ordering by
  // cost answers that exactly backwards, because this deck's most expensive
  // card is also the one it is ramping towards.
  //
  // The order below is the deck's own: OP17-062 is the cost-10 body the list
  // runs four of and casts by default, OP17-063 answers a specific board,
  // OP17-061 needs a [King]/[Queen]/[Jack] still in hand to be worth its nine,
  // and OP17-069 is the 9-drop the tournament lists cut first. Every value is
  // far below the band's own bonus, so this reorders within the bricks without
  // ever making one cheaper to pay than a card the turn could cast.
  avoid("Trash the brick the deck will miss least on its payoff turn.")
    .as("payoff-outlives-the-brick-band")
    .by(WEIGHT.deck)
    .effect((action) => {
      if (!HAND_COST_CLAUSES.has(action.sourceCardNumber)) return false;
      if (!isOptionCardIn(action, "self", "hand")) return false;
      const cardNumber = optionCard(action)?.card.cardNumber;
      return cardNumber ? (PAYOFF_KEEP_ORDER.get(cardNumber) ?? false) : false;
    }),

  // There is deliberately no rule declaring the attack the Leader's -2000
  // would win. The Leader's `DON!! -1` is offered on an attack this seat
  // declares, so an attack it would win has to be declared first -- and the
  // ladder only ever declares attacks that already win, so the two never
  // meet. The surface is real: over 84 probe games the seat ended **49 of 489
  // turns** holding an attack that -2000 would have carried, 36 of them
  // against a body costing 4 or more.
  //
  // A rule that closes it is still a wash, and it is not free: it rests an
  // attacker and spends a DON!! card off the field of the deck whose plan is
  // the DON!! count. The trade is priced as "the attack wins", and what it
  // actually costs is the *next* turn's debuff, which is once per turn and is
  // this deck's only removal support. A rule that knew the debuff was
  // otherwise unspent this turn could tell the free version from the
  // expensive one; nothing in `GameObservation` says so.
];

/**
 * The tournament list's DON!! economy: the two cards in it that turn DON!! on
 * the field into something else, and that the generic ladder takes whenever it
 * is offered them. Neither is in Bandai's list, so both rules are silent for
 * it by construction.
 *
 * One module per rule (`op17-kaido-field#<name>`), so `pnpm deck:ab --deck
 * "(Purple) Kaido - Open OPTCG" --disable
 * op17-kaido-field#<name>` prices each alone.
 */
export const KAIDO_FIELD_LIST_RULES: readonly Heuristic[] = [
  // Black Maria adds five rested DON!! and then, at the end of the turn,
  // returns DON!! until the field is level with the opponent's. So what it
  // lends is only ever this turn's `DON!! −N` costs, and the price is that the
  // turn ends level. From behind or level that price is nothing -- the field
  // was already at or under the opponent's -- and every `DON!! −N` the deck
  // pays that turn is paid out of DON!! the clause was going to take back
  // anyway. From ahead it gives the lead back: a ramp deck whose plan is being
  // ahead on DON!! hands the difference to the DON!! deck, and the DON!! deck
  // refills the field at two a turn.
  never("Black Maria's DON!! go back at the end of the turn; not from ahead.")
    .as("black-maria-only-from-behind")
    .when((t) => t.fieldDon > t.opponentFieldDon)
    .activate((action) => action.sourceCardNumber === BLACK_MARIA),

  // Mamaragan cast in the Main phase is a card and a rest for two DON!! off
  // the field, the same trade `drake-don-is-the-plan` prices for X.Drake, and
  // it is held to the floor the Leader's `DON!! −1` is: the field has to reach
  // six next turn after paying. Held instead, the same card is a +1000 Counter
  // that draws while the field is at six or less -- which is exactly the field
  // this rule is refusing to spend.
  never("Keep Mamaragan's two DON!! while the ramp still needs them.")
    .as("mamaragan-don-floor")
    .when((t) => !fieldSurvivesReturning(t.observation, 2))
    .activate((action) => action.sourceCardNumber === MAMARAGAN),
];

/**
 * The DON!! the field must still reach next turn for a `DON!! −N` this deck
 * pays off its own plan to be worth paying.
 *
 * Bandai's guide for this list states the rule and no threshold -- "avoid using
 * your Leader effect until you've gathered enough DON!! cards" -- so the number
 * is measured rather than printed, and it is not the one the sentence suggests.
 * Six is where this deck's curve is still compounding: below it every DON!! is
 * buying the next body on the way to King and the cost-9 band, and a 2000 that
 * wins one battle is not worth a turn of that. Above it the field is deep
 * enough that a single DON!! is change.
 */
const DON_FLOOR = 6;

/**
 * Whether the field still reaches {@link DON_FLOOR} next turn after `returned`
 * DON!! go back to the DON!! deck.
 */
function fieldSurvivesReturning(
  observation: GameObservation,
  returned: number,
): boolean {
  // OP17-062 Kaido answers a DON!! returning to the deck by adding one back as
  // active and standing a rested one up, so while it is on the board the cost
  // is not a cost: the field ends the exchange level and the active pool ahead.
  // The floor has nothing to protect, and applying it here would refuse the one
  // board this Leader's clause is free on.
  if (
    observation.self.board.some((card) => card.cardNumber === RETURN_PAYOFF)
  ) {
    return true;
  }
  const field = observation.self.activeDon + observation.self.restedDon;
  // `DON!! −N` returns the DON!! to the DON!! *deck*, so paying takes them off
  // the field and puts them back in the pile the refresh draws from; the
  // reading is what the field stands at next turn, not what it holds now.
  return (
    field - returned + Math.min(2, observation.self.donDeckCount + returned) >=
    DON_FLOOR
  );
}

/**
 * The Leader's `DON!! −1`, priced against the turn it delays.
 *
 * `debuffDecidesTheBattle` answers "does the 2000 change this battle" and
 * nothing else, so it pays out of a four-DON!! field as readily as out of a
 * full one -- and a DON!! taken off this deck's field early is a turn of the
 * plan, not a rounding error.
 *
 * Registered apart from `op17-kaido-defense` so `deck:ab --disable
 * op17-kaido-leader-floor` prices the floor while the shipped Leader policy
 * stands as the control. Vetoing `apply` leaves `skip` as the only offer, which
 * the defense policy then declines to answer and the ladder takes.
 */
export function createOp17KaidoLeaderFloorPolicy(): PolicyModule {
  return heuristics("op17-kaido-leader-floor", [
    never(
      "Keep the DON!! while the ramp still needs it more than the battle does.",
    )
      .as("leader-debuff-don-floor")
      .when((t) => !fieldSurvivesReturning(t.observation, 1))
      .effect(
        (action) =>
          action.sourceCardNumber === KAIDO_LEADER &&
          action.optionId === "apply",
      ),
  ]);
}
