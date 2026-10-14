import type { GameObservation } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { PolicyModule } from "../policy-module.js";
import { createMulliganModule } from "../mulligan.js";
import {
  heuristicModules,
  mustAct,
  never,
  preferAmong,
  WEIGHT,
} from "../heuristics.js";
import type { Tactics } from "../tactics.js";

/**
 * ## The deck's engine, in one paragraph
 *
 * OP09-061's Leader turns a *payment* into a *profit*, once per turn. Ten of
 * the fifty main-deck cards return DON!! from the field to the DON!! deck --
 * six of them as the printed "you may return 1 or more", four as a fixed
 * `DON!! -2` -- and the Leader answers "when 2 or more DON!! cards on your
 * field are returned" by adding one DON!! back active and one back rested. So
 * the first return of two each turn costs one net DON!! and gains a card's
 * worth of effect; a return of *one* pays the same card and gains nothing from
 * the Leader; and the second return of the turn is full price, because the
 * clause is [Once Per Turn]. The Leader's other clause, "[DON!! x1] All of
 * your Characters gain +1 cost", is the bill for that, and it is why the deck
 * would rather spend DON!! than hold it.
 *
 * Every rule below follows from that paragraph.
 *
 * ## Sources
 *
 * Bandai's own feature-deck guide for this Leader
 * (https://en.onepiece-cardgame.com/feature/deck/deck_052.php, retrieved
 * 2026-09-07) is the only piloting write-up that exists for it -- ST-26 is a
 * precon and has no tournament record. Its two concrete claims are the two
 * rules here: use OP09-076 Roronoa Zoro to "deliberately return more than two
 * DON!! cards" and so switch the Leader on, and spend OP09-077 Gum-Gum
 * Lightning "at essentially 1 cost, without actually reducing your DON!!
 * cards -- but only before triggering your Leader's effect that turn".
 */

/**
 * The 3-cost bodies this Leader wants on the board first.
 *
 * ST26-002 Tony Tony.Chopper, ST26-003 Nico Robin and OP09-076 Roronoa Zoro
 * are the same turn: a body that returns DON!!, which is what the Leader
 * OP09-061 refunds, and nets a DON!! on the turn the field is smallest.
 * Everything else these lists can cast before turn four either costs nothing
 * to the plan or costs the plan a turn. Zoro is the one Bandai's feature-deck
 * guide and the community guide both name as the opening ramp, and the
 * starter and the maintainer's list both run four.
 */
const EARLY_RETURNS = ["ST26-002", "ST26-003", "OP09-076"];

/**
 * The opening hand: keep on a 3-cost DON!!-return body, ship everything else.
 *
 * The generic keep is `anyEarlyPlay` -- any card costing 2 or less -- and in
 * this fifty that bound picks out exactly the six cards that are *not* plays:
 * four OP09-077 Gum-Gum Lightning, which is a [Main] Event needing a target
 * that does not exist on turn two, and two OP09-078 Gum-Gum Giant, which is a
 * [Counter] and never a play at all. There is no 1- or 2-cost Character in the
 * deck, so the generic rule keeps a hand of Events and ships a hand of bodies,
 * which is exactly backwards.
 *
 * ST26-001 Soba Mask is deliberately not in the predicate although it can cost
 * 2. Its discount needs a [San-Gorou] or [Sanji] Character at 7000 base power
 * already on the board, and the only card in the deck that supplies one is a
 * 6-cost vanilla -- so in an opening hand Soba Mask is a 7-drop, not a cheap
 * one. Keeping on it would be reading the printed −5 as though it were
 * unconditional.
 *
 * Ten of ST-26's fifty, so this keeps about two thirds of its opening hands;
 * the deck has no searcher, so a keep is a statement about the curve and
 * nothing else.
 */
export function createSt26LuffyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st26-luffy-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        EARLY_RETURNS.includes(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with ST26-002, ST26-003 or OP09-076: a 3-cost body that returns DON!!, which is the cost OP09-061's once-per-turn refund is printed to answer.",
    mulliganBecause:
      "Mulligan a hand with no ST26-002, ST26-003 or OP09-076: the only cards costing 2 or less in this deck are Events -- a [Main] removal with nothing to remove yet, and a [Counter] that is never a play.",
  });
}

/**
 * Return two DON!! rather than one, so the Leader's refund pays for it.
 *
 * The rule the whole deck is built on, and it did not exist as a decision
 * until `return-don-choice` did: all six "return 1 or more" Characters were
 * implemented as a fixed return of 1, which is the one count the Leader cannot
 * answer. With every legal count now offered, the generic ladder takes the
 * first -- `return:1` -- which is the same wrong answer by a different route.
 *
 * Two, not more. The Leader pays a flat "add 1 active and 1 rested" for "2 or
 * more returned", so 2 is the exact threshold and every DON!! above it is
 * given away for nothing. That is why this is `preferAmong` scored over *all*
 * the counts rather than a `prefer` on the one it likes: the rule has an
 * opinion about every candidate in the group -- 2 best, then 1, then
 * descending -- and `rankAmong` leaves every other `resolve-effect` option in
 * the deck untouched, which a `prefer` here would hide.
 *
 * The count is read off the typed `don-return-count` descriptor rather than
 * parsed out of `optionId`, which the protocol says is opaque.
 *
 * Gated on the refund still being available. Once OP09-061 has paid out this
 * turn a second return of two costs a full extra DON!! for the same payoff, so
 * past that point the printed floor is correct and this rule steps aside --
 * `t.leaderReactionSpent` is what makes the difference sayable, and it was
 * added to the observation for exactly this rule. The gate is on the *reason*
 * to return two rather than on the card, so it is right for all six "1 or
 * more" Characters and not only the two this deck plays.
 *
 * Price it with `pnpm deck:ab --deck "(Purple/Black) Monkey.D.Luffy - Starter
 * Deck 26" --disable st26-luffy#return-count`.
 *
 * The gate is most of what it is worth. Ungated -- always two, whether or not
 * the refund was still there -- the rule is worth roughly half as much, so
 * knowing when to stop asking for two is about as valuable as asking for it
 * at all. That is the argument for `leaderReactionSpent`
 * being on the observation: this deck's central decision is not "return two",
 * it is "return two *once*".
 *
 * The engine change underneath both numbers is not measured this way and does
 * not need to be -- returning a fixed 1 where the card says "1 or more" was
 * wrong about the printed text, and correct card behaviour is not a win-rate
 * question.
 */
const returnTwoForTheRefund = preferAmong(
  "Return exactly 2 DON!!: the Leader refunds 2 for a return of 2 or more, so 2 is the threshold and anything above it is given away",
)
  .as("return-count")
  .by(WEIGHT.deck)
  .when((t) => !t.leaderReactionSpent)
  .effect((action) => {
    const option = action.option;
    if (option.kind !== "don-return-count") return false;
    // Ordinal, and it has to score every count so none is left for the generic
    // ladder to take first-offered: 2 above 1, and 1 above everything larger.
    if (option.count === 2) return 3;
    if (option.count === 1) return 2;
    return 1 / option.count;
  });

/**
 * OP05-119 Monkey.D.Luffy: `[On Play] DON!! −10`, every other Character of
 * yours to the bottom of the deck, then an extra turn.
 */
const FINISHER = "OP05-119";

/**
 * Read off the hand and the active DON!!, not off the offered plays: the
 * resolver judges every other action against the plays that survive the veto,
 * and {@link finisherLast} vetoes this one, so by then it is no longer offered.
 * Its printed cost is the price -- OP09-061's +1 applies to Characters on the
 * field, not in hand.
 */
const finisherCastable = (t: Tactics): boolean =>
  t.observation.self.activeDon >= 10 &&
  t.observation.self.hand.some((card) => card.cardNumber === FINISHER);

const attackOffered = (t: Tactics): boolean =>
  t.observation.legalActions.some((action) => action.type === "attack");

/**
 * Swing with everything before casting OP05-119, the extra-turn finisher.
 *
 * Its `[On Play]` buries every other Character, so a body still able to attack
 * when it is cast loses that attack for nothing: it leaves the board either
 * way. The generic ladder develops before it attacks and casts the dearest card
 * first, which is exactly the finisher at the top of the turn -- every attack
 * of the board it is about to bury unspent. Bandai's guide for the Leader says
 * the same: play it "after you've attacked with all your Characters".
 *
 * Everything but an attack waits while the finisher is castable, not only the
 * finisher itself: it needs all ten DON!! on the field, active, so a body
 * played or a DON!! attached first prices it out of the turn.
 */
const finisherLast = never(
  "Attack with everything before OP05-119: its On Play buries the rest of the board, so an attack not made first is lost",
)
  .as("finisher-last")
  .when((t) => finisherCastable(t) && attackOffered(t))
  .action((action) => action.type !== "attack" && action.type !== "pass");

/**
 * The other half of {@link finisherLast}: while the finisher is castable and
 * an attack is still on offer, the turn may not end. Without it the ladder,
 * having declined a hopeless attack, ends the turn with the finisher in hand --
 * and a hopeless attack costs nothing here, because the body making it is
 * about to leave the board.
 */
const finisherLastAttack = mustAct(
  "Do not end the turn holding a castable OP05-119 while a body can still swing: the attack is free, the body is buried either way",
)
  .as("finisher-last-attack")
  .when(finisherCastable)
  .insteadOfPass(attackOffered);

/** ST26-003 Nico Robin: `[On Play] DON!! −2`, add 1 active DON!!; Counter +2000. */
const ROBIN = "ST26-003";

/**
 * Hold Nico Robin as a Counter rather than casting her for one DON!!.
 *
 * Robin and OP09-076 Zoro are the same turn on the board -- three DON!!, a
 * return of two that the Leader refunds, one DON!! back from the card -- and
 * differ only in hand: Zoro prints no Counter, Robin prints the deck's
 * largest, 2000. With Zoro in hand the ladder already ramps with Zoro, so
 * this only speaks on a turn where Robin is the one ramp body on offer, and
 * there the trade is one DON!! a turn sooner, plus a 4000 body, against a
 * Leader hit or a Character saved later. The DON!! phase reaches the same
 * field a turn later regardless, and the card spent as Counter is not.
 */
const holdRobin = never(
  "Keep ST26-003 Nico Robin for her 2000 Counter: on the board she buys one DON!!, which OP09-076 Zoro buys without spending a Counter card",
)
  .as("hold-robin")
  .play((card) => card.cardNumber === ROBIN);

/** The deck's in-game rules, one module per rule so each can be disabled. */
export function createSt26LuffyModules(): PolicyModule[] {
  return heuristicModules("st26-luffy", [
    returnTwoForTheRefund,
    finisherLast,
    finisherLastAttack,
    holdRobin,
  ]);
}

/**
 * Cards this deck will not spend as Counter, because spending one costs it the
 * plan rather than a card. Kept so the arm behind
 * {@link createSt26LuffyDefensePolicy} can be re-run; see the note at its
 * would-be registration in `registry.ts`.
 *
 * `chooseGenericCounter` ships an empty protected set, so an unpiloted seat
 * values a card in hand at its printed Counter and nothing else -- and this
 * deck's two highest Counter values, 2000 apiece, are printed on the two bodies
 * that pay the Leader. OP09-070 Nami and ST26-003 Nico Robin are the deck's
 * cheap DON!!-return enablers; feeding either to a Leader hit buys 2000 now and
 * gives up a refund turn.
 *
 * OP09-076 Roronoa Zoro, the third enabler and the one Bandai's guide names, is
 * deliberately absent: it prints no Counter at all, so it was never at risk and
 * listing it would be a rule that cannot fire.
 *
 * Nothing else is protected. The vanillas are exactly what the deck wants to
 * spend -- OP05-065, OP09-063 and ST14-010 do nothing in hand and nothing on
 * the board that a Counter card does not do better in the moment.
 */
const PROTECTED_CARDS: ReadonlySet<string> = new Set(["OP09-070", "ST26-003"]);

/**
 * The Counter phase, which is a whole decision rather than a narrowing and so
 * cannot be a heuristic.
 *
 * The census reads this deck's `counter:counter` at 4.96 decisions per game and
 * **100.0% no rule at all** -- the largest wholly unpiloted surface it has, and
 * the one the generic fallback answers with an empty protected set.
 *
 * Registered apart from the heuristics above so `pnpm deck:ab --disable
 * st26-luffy-defense` measures the two halves separately.
 */
export function createSt26LuffyDefensePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== "OP09-061") return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: PROTECTED_CARDS,
      // OP09-078 Gum-Gum Giant is the same shape ST33's Event is, which is why
      // that deck sets this and why it is set here: the Event costs `DON!! -2`
      // and one card from hand, adds +4000, and *draws 2*. So it replaces
      // itself and profits a card, where a two-card Counter line spends two --
      // and +4000 is two to four ordinary Counter cards' worth of power in one
      // action. Bandai's guide calls it the card that "lets you swap out
      // unneeded cards", which is the same observation from the other side.
      //
      // Two, not one: against a single 1000-Counter line the Event is still a
      // DON!! -2 on the opponent's turn, and this deck would rather hold the
      // DON!! than win a battle it was going to win anyway.
      counterEventBeatsCards: 2,
    });
  };
}
