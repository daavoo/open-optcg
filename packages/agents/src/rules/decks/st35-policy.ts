import type { CardFacts, GameObservation } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import { WEIGHT, never, prefer, type Heuristic } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { RulesPolicy } from "../policy-chain.js";
import type { Tactics } from "../tactics.js";
import { isElbaphSaboList } from "./op13-sabo-policy.js";

/**
 * ST-35 Red/Black Sabo, the {Revolutionary Army} aura deck.
 *
 * ## The engine, in one paragraph
 *
 * OP13-004 Sabo prints `[DON!! x1] If you have a Character with a cost of 8 or
 * more, your Leader and all of your Characters gain +1000 power`, and takes
 * −1000 while it still holds four Life. So the deck's whole plan is two
 * conditions held together: one DON!! attached to the Leader, and one cost-8
 * body on the field. It reaches the first without spending a turn on it --
 * ST35-004, ST35-005, OP13-005, P-105 and OP13-081 each *give a rested DON!! to
 * the Leader*, and DON!! become rested by being spent, so the gift is paid for
 * by the turn's own costs and is self-sequencing (the engine does not offer
 * OP13-081's activation until `restedDon` is non-empty). It reaches the second
 * with static cost text rather than with expensive cards: nothing in the list is
 * *printed* at 8, and five cards get there anyway -- ST35-004 at 7 `+1 cost`,
 * ST35-005 at 5 `+3`, OP13-081 at 5 `+3`, OP12-093 at 4 `+4`, P-105 at 4 `+4`.
 * A 4-cost Morley is what switches +1000 on for the whole team.
 *
 * Every rule below follows from that paragraph.
 *
 * ## Why this file is rules and not a ladder
 *
 * It was a 200-line first-match-wins `decide` ladder until issue #170, holding a
 * twelve-entry `CARD_PRIORITY` card-number → integer map and citing no
 * measurement for any of it. Two things that cost:
 *
 *  - **The order was the behaviour, and unstated.** Its play ordering was very
 *    nearly cost-descending, which is what `chooseGenericRules` already does;
 *    the only claims inside those twelve integers were "prefer the cards that
 *    reach cost 8" and an unexplained demotion of OP13-005 Inazuma below a
 *    2-cost body. The first is {@link ST35_RULES}'s `aura-enabler`, stated as
 *    the Leader's own condition rather than as a table. The second is not
 *    carried over: nothing in the paragraph above justifies it, and a table
 *    entry no one can explain is the kind of thing this migration exists to
 *    stop being invisible.
 *  - **One branch swallowed every effect decision in the game.** `chooseEffect`
 *    ran before the phase check, so it answered `resolve-effect` in the block
 *    and trigger phases too, with nothing else reached. Its last branch, "name
 *    the opponent's strongest board Character", is `chooseStrongestOpponentTarget`
 *    in the format band; running ahead of the generic ladder also meant running
 *    ahead of `chooseDonReturn` and `chooseKeywordGrantTarget`. That branch is
 *    deleted rather than migrated, since the generic ladder tries all three in
 *    order.
 *
 * What is left is seven claims about this deck's own cards, each named so that
 * `pnpm deck:ab --deck "(Red/Black) Sabo - Starter Deck 35" --disable
 * st35#<rule> --seeds 100` prices it alone.
 *
 * ## What the migration removed
 *
 * The deleted `chooseEffect` branch had been answering every effect decision
 * in the game, so `pnpm census` reads `main:resolve-effect` as almost wholly
 * unruled here now. That 0.0% was never coverage; it was one branch with no
 * opinion holding the phase shut, which is the failure issue #170 is about.
 * Piloting that surface is the next change, and it is now visible.
 *
 * ## Two of the rules are exact zeros
 *
 * `koala-recycle` and `aura-enabler` change nothing, and are kept anyway.
 * Both state a condition the deck is built on and both are *reachable* -- neither appears
 * in `pnpm census`'s silent-module list -- they simply agree with what the
 * generic ladder was going to do anyway in almost every position it reaches.
 * `koala-recycle` agrees because the engine happens to build the Leader gift
 * first; `aura-enabler` agrees because this deck's cost-8 bodies are also its
 * biggest, so `develop-largest` reaches for the same card. Neither agreement is
 * a property of the rules, and the first list change that breaks one is a change
 * nobody would connect to a card table. A fire rate is not an effect, and an
 * effect of zero is not a reason to stop saying the thing.
 */

/** Cost the Leader's `[DON!! x1]` aura asks one Character to reach. */
const AURA_COST = 8;

/** OP13-081 Koala's `[Activate: Main]`, and OP13-019 Ace's `[Main]`. */
const KOALA = "OP13-081";
const ACE_EVENT = "OP13-019";

/** The two `[When Attacking]` clauses that pay two cards off the deck. */
const KARASU = "ST35-003";
const BELO_BETTY = "OP12-090";

/** P-105 Sabo's `[On Play]`, which pays a Life card. */
const SABO_BLOCKER = "P-105";

/** Hand size at which Karasu's discard clause switches on. */
const KARASU_HAND_GATE = 7;

/**
 * Power OP13-019's `[Main]` reaches: −3000, then K.O. 3000 or less.
 *
 * The two halves may name different Characters, so 6000 is the ceiling only for
 * a board where one body takes both. Read as "is anything in range at all",
 * which is the question the activation is worth asking.
 */
const ACE_EVENT_REACH = 6_000;

/**
 * Printed static cost boost, or 0 -- `+1 cost`, `+3 cost`, `+4 cost`.
 *
 * Read off the printed text rather than kept as a card list, so a
 * {Revolutionary Army} card added to the list later is an enabler without an
 * edit here. Every boost in this deck is conditional on the Leader having the
 * {Revolutionary Army} type, which OP13-004 does -- these rules are registered
 * for that Leader only, so the condition is a constant here and the number is
 * the whole of it.
 *
 * It cannot be read off the observation instead: a board Character reports
 * `currentCost` with its boosts applied, but a card in *hand* reports
 * `currentCost` as what the engine will charge to play it, which is a different
 * number computed a different way. There is no "cost this would have once it
 * lands" field, and the printed text is what the engine's own
 * `effectiveCost` is built from.
 */
function printedCostBoost(facts: CardFacts): number {
  return facts.rules.costBoosts[0] ?? 0;
}

/** Whether this card would land as the cost-8 body the Leader's aura wants. */
function enablesAura(facts: CardFacts): boolean {
  return facts.cost + printedCostBoost(facts) >= AURA_COST;
}

/** Whether the aura's cost-8 half is already satisfied by the board. */
function auraAlreadyEnabled(t: Tactics): boolean {
  return t.observation.self.board.some((card) => card.currentCost >= AURA_COST);
}

/** Whether OP13-019's `[Main]` would actually remove something. */
function aceEventInRange(t: Tactics): boolean {
  return t.observation.opponent.board.some(
    (card) => card.currentPower <= ACE_EVENT_REACH,
  );
}

/**
 * Characters worth spending a Counter card to keep on the field.
 *
 * OP13-004 Sabo hands its controller's Leader *and every Character* +1000 while
 * two things hold together: a DON!! given to the Leader, and a Character whose
 * effective cost is 8 or more. Nothing in this list is printed at cost 8 --
 * Morley is a 4, both Koalas and Kuma are 5s and 7s -- they each get there
 * through a static `+N cost`, so losing the one inflated body on the field
 * switches the aura off for the whole team. That is what makes them worth a
 * Counter card and the vanilla bodies not.
 *
 * OP13-008 Emporio.Ivankov is deliberately absent: its printed job is to be
 * trashed in place of another {Revolutionary Army} Character, so spending a
 * Counter to keep it alive buys nothing the card was not already going to do.
 *
 * Without a `counter` branch the phase falls through to `chooseGenericRules`,
 * whose `protectedCards` defaults to empty and whose Character branch requires
 * membership -- so the deck defends its Leader and never pays to keep an aura
 * enabler alive. This set is the largest single lever for this deck, and the
 * reason to look for a missing `protectedCards` before tuning anything else.
 */
const ST35_PROTECTED_CARDS: ReadonlySet<string> = new Set([
  "ST35-004",
  "ST35-005",
  "OP13-081",
  "OP12-093",
  "P-105",
  "OP13-017",
  "ST35-001",
]);

/**
 * The deck's own knowledge, one named rule per claim.
 *
 * `rank` and `veto` only, so `chooseGenericRules` still makes every decision and
 * these only narrow what it is choosing between. See `heuristics.ts` for why
 * that containment is the point, and for what `prefer` hides.
 */
export const ST35_RULES: readonly Heuristic[] = [
  // ST35-003 Karasu: `[When Attacking] You may trash 2 cards from the top of
  // [printed text omitted -- pnpm card:text ST35-003]
  // opponent trashes 1 card`. Below seven the clause is two cards off the deck
  // for nothing, and `chooseGenericRules` takes every optional clause offered.
  //
  // Expect it to read flat; it is kept because the clause it declines is
  // provably dead below seven cards.
  never(
    "Do not pay Karasu's two cards off the deck below the hand size its discard needs.",
  )
    .as("karasu-mill")
    .when((t) => t.opponentHandCount < KARASU_HAND_GATE)
    .effect(
      (action) =>
        action.sourceCardNumber === KARASU &&
        action.option.kind === "confirm" &&
        action.option.choice === "apply",
    ),

  // OP12-090 Belo Betty pays the same two cards for `−2 cost` on an opposing
  // Character, and this list has nothing that reads cost: ST35-001 K.O.s by
  // *base power* (2000 or less) and OP13-019 by power (3000 or less). So the
  // clause is unconditionally two cards for nothing here -- unlike Karasu's,
  // which has a hand size that makes it live.
  //
  // The same wash as its sibling above, and kept on the same argument.
  never(
    "Do not pay Belo Betty's two cards for a cost reduction nothing in this list reads.",
  )
    .as("betty-mill")
    .effect(
      (action) =>
        action.sourceCardNumber === BELO_BETTY &&
        action.option.kind === "confirm" &&
        action.option.choice === "apply",
    ),

  // P-105's `[On Play]` is `You may add 1 card from the top or bottom of your
  // [printed text omitted -- pnpm card:text P-105]
  // of your Characters`. The Life card buys the DON!! gift, so with an empty
  // rested pool it buys nothing at all -- and at one Life it is the last one.
  //
  // The largest of the three vetoes, because Life in this deck is also the
  // Leader's own -1000
  // clause: below four Life the Leader is a 5000 rather than a 4000, so a Life
  // card spent for nothing is paid for twice.
  never(
    "Do not spend a Life card on a DON!! gift with no rested DON!! to give, or on the last Life.",
  )
    .as("life-for-don")
    .when((t) => t.observation.self.restedDon === 0 || t.selfLife <= 1)
    .effect(
      (action) =>
        action.sourceCardNumber === SABO_BLOCKER &&
        action.option.kind !== "skip",
    ),

  // OP13-019 rests four DON!! and the engine only offers it at five or more
  // active, so taking it is the whole turn's development. Worth it only when it
  // removes something: the −3000 and the K.O. may name different Characters, so
  // anything at 6000 or less is in range.
  //
  // It fires rarely and is almost never wrong when it does.
  //
  // What it deliberately does *not* have is a sibling forcing the activation
  // ahead of development. The engine offers OP13-019 only at
  // `activeDon.length >= 5`, so a play made first can spend the activation
  // out of existence -- a true fact about the engine, and the reason the old
  // ladder tested the activation above its play branch. It is still the wrong
  // rule: the activation costs the deck
  // four rested DON!! *and* the turn's development, and this list would rather
  // have a cost-8 body on the field than a −3000 and a K.O. on a 3000. Holding
  // the Event costs nothing -- it stays in hand for its `[Counter]` half, which
  // is +3000 on the Leader -- while the turn spent not developing does not come
  // back. So the ordering to keep is the generic one, develop first, and the
  // activation is taken with whatever DON!! is left.
  never("Do not rest four DON!! for a −3000 and a K.O. with nothing in range.")
    .as("dead-ace-event")
    .when((t) => !aceEventInRange(t))
    .activate((action) => action.sourceCardNumber === ACE_EVENT),

  // OP13-081 Koala is the cheap half of the plan: a card out of the trash for a
  // rested DON!! on the Leader, once per turn, which is the aura's DON!! half
  // paid for with a card the deck has already spent. Ranked above OP13-019
  // within `activate-main`: Koala before Ace, and never the other way round.
  // An unordered `find` over the two hands it to the Event every time.
  //
  // Where the DON!! lands is `koala-gift-leader` below. The card is written in
  // the mechanic DSL, so the recipient is a choice the activation opens rather
  // than part of the activation itself, and the claim is split across two
  // rules.
  //
  // Flat when the target was part of
  // this rule: the engine happened to build the Leader gift before the
  // Character gifts, so the generic ladder's first-offered was already this.
  // Kept because that is an accident of construction order and this is the
  // claim.
  prefer(
    "Recycle a trash card for a rested DON!! on the Leader, switching on Sabo's aura.",
  )
    .as("koala-recycle")
    .by(WEIGHT.deck)
    .activate((action) => action.sourceCardNumber === KOALA),

  // The other half: the `[DON!! x1]` aura reads DON!! on the *Leader*, and a
  // DON!! given to a Character does not satisfy it. Without this the choice
  // falls to the generic ladder's first-offered, which is the Leader only by
  // the order `give-rested-don` happens to build its options in.
  prefer("Aim Koala's rested DON!! at the Leader, where Sabo's aura reads it.")
    .as("koala-gift-leader")
    .by(WEIGHT.deck)
    .effect(
      (action, t) =>
        action.sourceCardNumber === KOALA &&
        action.optionId === `${t.observation.viewer}-leader`,
    ),

  // The Leader's own condition, as a rule rather than as five card numbers.
  // Gated on the board not already holding one: a second cost-8 body adds
  // nothing to an aura that is already on, and the deck would rather have the
  // biggest body at that point.
  //
  // Expect it to change almost nothing: it fires -- it is absent from
  // `pnpm census`'s silent-module list -- but agrees with `develop-largest`
  // nearly everywhere, because every enabler in this list is also one of the
  // deck's biggest bodies. The exception it exists for is OP13-017
  // Monkey.D.Dragon,
  // the deck's only 7000 and not an enabler: printed at 6 with no static cost
  // text, it stops at 6. `test/st35-policy.test.ts` poses that hand.
  prefer(
    "Land the cost-8 body the Leader's [DON!! x1] aura needs before anything else.",
  )
    .as("aura-enabler")
    .when((t) => !auraAlreadyEnabled(t))
    .by(WEIGHT.deck)
    .play((card) => enablesAura(card.facts)),

  // The total-order rule that keeps every other play in the running. Without one
  // the `prefer` above hides every non-enabler play whenever an enabler is
  // affordable, which is the failure mode `heuristics.ts` records for OP-17
  // Kaido. Power rather than cost, because this deck's cheap bodies are its
  // good ones -- a 4-cost Morley is a cost-8 enabler.
  //
  // The largest single
  // contribution in this file, and the one that makes the case that a
  // twelve-integer card table is worth less than one sentence: without it the
  // generic ladder develops the highest-*cost* card, and in a deck whose good
  // bodies are cheap that is the wrong order.
  prefer("Develop the largest body the DON!! can pay for.")
    .as("develop-largest")
    .play((card) => card.facts.power / 1_000),
];

/**
 * The opening hand: Koala, Kuma, or a Sabo the aura plan can switch on.
 *
 * Gated on {@link isElbaphSaboList} for the same reason the policy below is.
 * OP13-004 fronts two shipped decks, and the four cards this rule keeps for are
 * cards the OP-17 Elbaph list does not contain -- so ungated it mulligans every
 * one of that deck's opening hands. That was the live bug, and it is the reason
 * `mulligan.ts` exists as one shape rather than twelve copies.
 */
export function createSt35MulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st35-mulligan",
    applies: (context) => !isElbaphSaboList(context.observation),
    keep: (observation) =>
      observation.self.hand.some((card) =>
        ["ST35-004", "ST35-005", "OP13-081", "P-105"].includes(card.cardNumber),
      ),
    keepBecause: "Keep an ST35 engine or high-cost aura enabler.",
    mulliganBecause: "Mulligan for Koala, Kuma, or Sabo.",
  });
}

/**
 * The Counter phase, which is `chooseGenericCounter` with this deck's protected
 * set and nothing else.
 *
 * Kept as a `decide` module rather than dissolved into rules because it is not a
 * claim about narrowing candidates: `protectedCards` parameterises the generic
 * policy's own Counter arithmetic, which is where that arithmetic belongs. See
 * {@link ST35_PROTECTED_CARDS} for what this set is worth.
 */
export function createSt35DefensePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== "OP13-004") return undefined;
    // OP13-004 is the Leader of two shipped decks and `registerPolicy` keys on
    // the Leader, so this file would pilot the OP-17 Elbaph list as well. See
    // `op13-sabo-policy.ts` for that deck's own policy and for why card identity
    // is the only discriminator available here.
    if (isElbaphSaboList(observation)) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: ST35_PROTECTED_CARDS,
    });
  };
}
