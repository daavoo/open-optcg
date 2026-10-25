import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { chooseGenericCounter } from "../generic-policy.js";
import type { PolicyDecision } from "../generic-policy.js";
import type { RulesPolicy } from "../policy-chain.js";
import {
  WEIGHT,
  heuristics,
  never,
  prefer,
  preferAmong,
} from "../heuristics.js";
import type { Tactics } from "../tactics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

const ACE_LEADER = "OP16-001";
/** OP16-015 Monkey.D.Luffy's `[On Your Opponent's Attack]`. */
const SEVEN_THOUSAND = "OP16-015";
/** The two searchers, both 1 cost. */
const SEARCHERS = ["OP13-016", "OP16-021"];
/** OP17-005 Edward.Newgate: 12000, and 6 DON!! while the discount is live. */
const BIG_NEWGATE = "OP17-005";

/** The Leader's `[Rush]` grant, either half of the printed "or". */
const isLeaderRushGrant = (action: LegalAction): boolean =>
  action.type === "activate-main" && action.sourceCardNumber === ACE_LEADER;

/** One of the two branches of that grant, by its printed id. */
const isRushBranch = (action: LegalAction, mode: string): boolean =>
  action.type === "resolve-effect" &&
  action.sourceCardNumber === ACE_LEADER &&
  action.option.kind === "mode" &&
  action.option.mode === mode;

/** The grant's target choice: one of the player's own board Characters. */
const rushTarget = (action: LegalAction) =>
  action.type === "resolve-effect" &&
  action.sourceCardNumber === ACE_LEADER &&
  action.option.kind === "card" &&
  action.option.owner === "self" &&
  action.option.zone === "board"
    ? action.option
    : undefined;

/**
 * The player's own Characters that [Rush] would actually unlock.
 *
 * `summoningSick` is the engine's own answer to "barred from attacking only
 * because it was played this turn and has no Rush", which is exactly the set
 * the grant is for. A body that can already attack gains nothing from it.
 */
function rushWorthyBodies(
  observation: GameObservation,
): GameObservation["self"]["board"] {
  return observation.self.board.filter((card) => card.summoningSick === true);
}

/** Whether any such body is a legal target for the {Whitebeard Pirates} half. */
function hasRushWorthyWhitebeard(observation: GameObservation): boolean {
  return rushWorthyBodies(observation).some((card) => {
    const facts = observation.cardFacts[card.cardNumber];
    return (
      card.power >= 8000 &&
      (facts?.types ?? []).some((type) => type.includes("Whitebeard Pirates"))
    );
  });
}

/** Whether any such body answers to [Monkey.D.Luffy]. */
function hasRushWorthyLuffy(observation: GameObservation): boolean {
  return rushWorthyBodies(observation).some(
    (card: GameObservation["self"]["board"][number]) =>
      observation.cardFacts[card.cardNumber]?.name === "Monkey.D.Luffy",
  );
}

/**
 * Power the 7000 clause would actually add to the card under attack.
 *
 * "[printed text omitted -- pnpm card:text <card>]", so it moves the
 * battle only when the target is one of those two and its base power is under
 * 7000. A DON!! already attached still counts on top, which is why this reads
 * base power rather than current: `becomes` replaces the base, not the total.
 *
 * `basePower` before `power`: the observation's `power` is the *printed*
 * figure, and this clause is the one card in the list that replaces it. The
 * clause is not `[Once Per Turn]` and the override it writes lasts the whole
 * turn, so from the second attack of a turn on, printed power is a base the
 * board left behind -- read it and every later attack is quoted the same
 * 2000 the first one bought, for a card out of hand that buys nothing.
 */
function sevenThousandGain(t: Tactics): number {
  const battle = t.observation.activeBattle;
  if (!battle) return 0;
  const luffy = t.observation.self.board.find(
    (card) => card.cardNumber === SEVEN_THOUSAND,
  );
  if (battle.targetInstanceId === `${t.observation.viewer}-leader`) {
    const leader = t.observation.self.leader;
    return Math.max(0, 7000 - (leader.basePower ?? leader.power));
  }
  if (luffy && battle.targetInstanceId === luffy.instanceId) {
    return Math.max(0, 7000 - (luffy.basePower ?? luffy.power));
  }
  return 0;
}

/**
 * OP-16 Red Ace, the Whitebeard Pirates aggro deck.
 *
 * ## The engine, in one paragraph
 *
 * The Leader prints `[Activate: Main] [Once Per Turn] Up to 1 of your
 * [printed text omitted -- pnpm card:text <card>]
 * this turn.` That single clause is the deck: a body played this turn attacks
 * this turn, so the opponent never gets a window in which a fresh 8000 is only
 * a blocker. Everything else in the list feeds "8000 power" as a currency --
 * as a Rush target, as the reveal cost on OP16-010, OP16-011 and OP16-003, and
 * as a 2000 Counter through OP16-118's static. The deck's own defence is
 * therefore *cards in hand*, not blockers, which is what makes throwing one
 * away expensive.
 *
 * Source for the plan: Bandai's feature-deck page for the archetype
 * (https://en.onepiece-cardgame.com/feature/deck/deck_102.php) and the OP-17
 * previews for the Leader, both restated in
 * `packages/agents/src/llm/dossiers/op16-ace.ts`.
 *
 * ## Why this file exists
 *
 * Without it every decision fell through to `chooseGenericRules`, which fires
 * the first `activate-main` it is offered and answers a choice with the first
 * option. For this Leader that is wrong in three specific ways, all three of
 * them visible in one traced game (`pnpm trace:match --p1 "(Red)
 * Portgas.D.Ace - Official Feature Deck" --p2 "(Red) Monkey.D.Luffy -
 * Starter Deck 31" --seed rules-benchmark-2`):
 *
 *  - **Turn 2**: activated the Rush grant with nothing on the board but two
 *    1-cost bodies, took the [Monkey.D.Luffy] branch, and had no target at all.
 *    The `[Once Per Turn]` use was spent on nothing.
 *  - **Turn 6**: played Vista, an 8000-power {Whitebeard Pirates} body that
 *    needed the grant to attack, then gave [Rush] to a Monkey.D.Luffy that had
 *    been on the board since turn 4 and could already attack. Vista sat idle
 *    for a turn; the grant bought zero attacks.
 *  - **Turn 9**: paid OP16-015's cost twice against 9000-power attacks into a
 *    5000 Leader. 7000 does not stop 9000, so both times it trashed an
 *    8000-power Character -- a 2000 Counter with Ace on the board -- and took
 *    the hit anyway. It lost that game on Life with cards still in hand.
 *
 * `rank` and `veto` only: the generic policy still decides, these rules narrow
 * what it decides between.
 *
 * Where these pay is the matchups the deck was worst in -- ST31 aggro and
 * ST32 Zoro -- which is what recovering a wasted attack per turn looks like
 * in a race. Against the decks it already beat above 95% there is nothing
 * left to win.
 */
export function createOp16AceRulesPolicy(): PolicyModule {
  return heuristics("op16-ace", [
    // Turn 2 of the trace. `up to 1` means the engine offers the activation
    // whatever the board looks like, and the `[Once Per Turn]` key is spent on
    // acceptance -- so an activation with no body to unlock is a use thrown
    // away, and this deck wants that use every turn from four DON!! on.
    never("Do not spend the Rush grant with nothing it would unlock.")
      .when((t) => rushWorthyBodies(t.observation).length === 0)
      .action(isLeaderRushGrant),

    // Turn 6 of the trace, and the single most valuable rule here. The two
    // branches are not interchangeable: one names [Monkey.D.Luffy] and carries
    // no power floor, the other takes any 8000-power Whitebeard Pirate. Take
    // whichever branch has a body that cannot otherwise attack, and prefer the
    // Whitebeard half when both do -- an 8000 attacking is worth more than a
    // 6000 attacking, and the deck runs sixteen of the former to four of the
    // latter.
    prefer("Rush the fresh 8000 rather than a body that can already attack.")
      .when((t) => hasRushWorthyWhitebeard(t.observation))
      .by(WEIGHT.deck)
      .action((action) => isRushBranch(action, "whitebeard")),
    never("Do not take the Luffy branch with no Luffy it would unlock.")
      .when(
        (t) =>
          !hasRushWorthyLuffy(t.observation) &&
          hasRushWorthyWhitebeard(t.observation),
      )
      .action((action) => isRushBranch(action, "luffy")),

    // Within the chosen branch, the target is the fresh body, and among fresh
    // bodies the biggest -- a Rush attack is a Counter-card demand on the
    // defender, and `cardsToSurviveLeaderHit` is not linear in power.
    prefer("Point the grant at the biggest body that cannot attack yet.")
      .by(WEIGHT.deck)
      .action((action, t) => {
        const option = rushTarget(action);
        if (!option) return false;
        const body = t.observation.self.board.find(
          (card) => card.instanceId === option.card.instanceId,
        );
        if (!body) return false;
        // Already able to attack: the grant buys nothing, so rank it below
        // every fresh body rather than vetoing -- with only such targets
        // offered, one of them still has to be chosen.
        if (body.summoningSick !== true) return 0;
        return 1 + body.power / 1000;
      }),

    // Turn 9 of the trace. The clause buys +2000 on the Leader (or +1000 on the
    // Character) and costs a Character card out of hand -- which with OP16-118
    // on the board is a 2000 Counter, i.e. the same defence for the same price
    // *and* a card kept for a future battle. So it is only worth paying when the
    // buff alone closes the gap; when it does not, the Counters in hand are
    // doing the work either way and the trashed card is gone for nothing.
    never("Do not pay for 7000 when 7000 does not save the target.")
      .when((t) => {
        const battle = t.observation.activeBattle;
        if (!battle) return true;
        // `counterShortfall` of 0 is an attack that already fails -- the
        // defender turns it away for free, so buying power for it is the same
        // card thrown away as buying power that falls short. It reads 0 for
        // every attack under 7000 once this clause has already been paid for
        // this turn, which is the position a second attack arrives in.
        if (battle.counterShortfall === 0) return true;
        return battle.counterShortfall > sevenThousandGain(t);
      })
      .effect(
        (action) =>
          action.sourceCardNumber === SEVEN_THOUSAND &&
          action.option.kind === "confirm",
      ),

    // When it *is* worth paying, pay with the copy that is worth least as a
    // Counter. Vista and Marco print none at all; Thatch and LittleOars Jr. do,
    // and OP16-118's static lifts every one of them to 2000 while it is out --
    // so the ordering is by the Counter actually available, not by the printed
    // number.
    prefer("Pay the 7000 with the card that is worth least as a Counter.")
      .by(1)
      .effect((action, t) => {
        if (
          action.sourceCardNumber !== SEVEN_THOUSAND ||
          action.option.kind !== "card" ||
          action.option.zone !== "hand"
        ) {
          return false;
        }
        const chosen = action.option.card;
        const held = t.hand.find(
          (card) => card.instanceId === chosen.instanceId,
        );
        return held ? 4 - held.counter / 1000 : false;
      }),

    // The archetype's stated weakness is consistency -- a hand of 7- and 8-cost
    // bodies with nothing to do until turn 6. Both searchers cost 1, so they
    // fit alongside the turn's real play rather than instead of it, and Garp
    // digs four deep for anything costing 3 or more, which is 42 of the 50.
    //
    // `preferAmong` rather than `prefer`, and the sentence above is why: "fit
    // alongside the turn's real play rather than instead of it" is what the
    // rule always meant, and `prefer` does the opposite. `rank` hides every
    // candidate below the best of its action type, and this module has no
    // total-order play rule to keep the others in the running -- so for the
    // first six turns the deck could play a searcher and nothing else.
    preferAmong("Land a 1-cost searcher early; the deck bricks without one.")
      .when((t) => t.turn <= 6)
      .by(WEIGHT.subArchetype)
      .play((card) => SEARCHERS.includes(card.cardNumber)),

    // OP17-005 prices itself at 6 while the opponent has a 10000-power body, and
    // 12000 with [Rush] for six DON!! is the best turn this deck has. Ranked
    // above the rest of the top end rather than forced, because the discount is
    // the opponent's board's business and can vanish before the turn comes.
    //
    // "Rather than forced" was the intent and not the behaviour until this
    // became `preferAmong`: under `rank` the rule hid every other play whenever
    // the opponent had a 10000-power body on the table.
    //
    // The gain from both conversions is where the deck has close games to win
    // -- ST31 and ST32 -- with the matchups it already wins above 90% flat.
    preferAmong("Take the discounted 12000 while the discount is live.")
      .when((t) =>
        t.observation.opponent.board.some((card) => card.power >= 10_000),
      )
      .by(WEIGHT.deck)
      .play((card) => card.cardNumber === BIG_NEWGATE),
  ]);
}

/** OP16-015 Monkey.D.Luffy, the card the dossier puts above every other keep. */
const ACE_KEYSTONE = "OP16-015";

/**
 * The two 1-cost cards that dig, one a Character and one a Stage.
 *
 * The other 1-cost Character in the list, OP13-007 Ace & Sabo & Luffy, is not
 * here: it is a -3000 debuff that trashes itself, which is a Counter-step
 * effect rather than a first turn, and it finds nothing. It is also the card
 * that makes this predicate more than a tightening of the generic keep -- a
 * hand whose only cheap card is OP13-007 passes "any card costs 2 or less" and
 * fails this.
 */
const ACE_SEARCHERS: ReadonlySet<string> = new Set([
  "OP13-016", // Monkey.D.Garp, 1 -- look at 4, take a cost-3-or-more card.
  "OP16-021", // Moby Dick, 1 -- the Stage: look at 3, take 1.
]);

/**
 * The power the deck's own cards ask each other about.
 *
 * Four separate clauses in this list read "a Character card with 8000 power":
 * OP16-011 Vista draws off revealing one, OP16-014 Marco trashes one on its
 * `[On K.O.]`, OP16-118 turns every one of them in hand -- and every bigger
 * body -- into a 2000 Counter, and OP16-003 needs two revealed. Eighteen of the 50 are at exactly 8000, so
 * "an 8000 body for the searcher to find more of" is a real category in this
 * deck rather than a proxy for expensive.
 */
const WHITEBEARD_BODY_POWER = 8_000;

/**
 * The opening hand: the keystone, or a searcher with something to find.
 *
 * This deck went into the change as the best in the field -- top of the
 * featured decks' rules-agent round-robin, and no keep predicate at all, which #172
 * flags as a standing warning that its opening hand may matter less than the
 * arithmetic suggests. The arithmetic is mild to begin with: twelve of
 * the 50 cost 2 or less, so the generic keep is true on 76.3% of hands, and
 * this rule keeps 72.4%.
 *
 * What makes it worth measuring anyway is that the two rules disagree in *both*
 * directions rather than one being a tightening of the other:
 *
 *  - a hand whose only cheap card is OP13-007 Ace & Sabo & Luffy is a generic
 *    keep and shipped here -- it is a self-trashing -3000, not a turn.
 *  - a hand with OP16-015 and nothing under 3 cost is a generic **mulligan**
 *    and kept here, because the dossier is unambiguous that this is the card
 *    the deck is looking for: the Leader names [Monkey.D.Luffy] as a Rush
 *    target with no power floor, OP16-015 prices itself at 2 behind six DON!!
 *    and an Ace Leader, and its `[On Your Opponent's Attack]` puts the Leader at
 *    7000 base for a turn.
 *
 * The rest is the dossier's second clause: "keep a hand with a 1-cost
 * searcher -- OP13-016 Monkey.D.Garp or OP16-021 Moby Dick -- and at least one
 * 8000-power body for it to find more of. The archetype's known weakness is
 * bricking on a hand of 7- and 8-drops."
 *
 * ## Measurement
 *
 * Price it with `pnpm deck:ab --deck "(Red) Portgas.D.Ace - OP17 Whitebeard
 * Pirates" --disable op16-ace-mulligan` over the whole field, and read which
 * matchups move rather than the headline: it pays where this deck is weakest
 * rather than uniformly.
 *
 * ## The keystone clause loosens the keep, and that is the half that pays
 *
 * Most mulligan predicates only ever *tighten* the generic keep. The
 * `ACE_KEYSTONE` line is the one that loosens it, and it is where the margin
 * is: most of what this rule does is refuse to throw away a hand holding the
 * deck's best card, which no cost bound can express.
 */
export function createOp16AceMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op16-ace-mulligan",
    keep: (observation) => {
      const hand = observation.self.hand;
      if (hand.some((card) => card.cardNumber === ACE_KEYSTONE)) return true;
      return (
        hand.some((card) => ACE_SEARCHERS.has(card.cardNumber)) &&
        hand.some(
          (card) =>
            observation.cardFacts[card.cardNumber]?.power ===
            WHITEBEARD_BODY_POWER,
        )
      );
    },
    keepBecause:
      "Keep OP16-015 above everything else, or a 1-cost searcher with an 8000 body for it to find more of.",
    mulliganBecause:
      "Mulligan: no keystone, and nothing that digs alongside something worth digging for -- this archetype's known failure is a hand of 7- and 8-drops that does nothing before turn 6.",
  });
}

/**
 * The bodies this deck defends, because losing one costs it a turn rather than
 * a card.
 *
 * The Leader's grant gives [Rush] to one body a turn, and that is the only way
 * this list attacks with something the turn it arrives. A body that survives to
 * the next turn attacks again without the grant, which leaves the grant free
 * for the *next* card out of hand -- so a big body on the board is not a card,
 * it is an attack every turn for as long as it lives, and the grant it releases
 * is a second one. That is what the Counter step is being asked to buy, and it
 * is why the generic answer -- an empty protected set, so "do not spend hand
 * resources protecting a replaceable Character" on every Character this deck
 * ever plays -- is the wrong one here.
 *
 * Six cards rather than the whole top end. Everything at 8000 or more that the
 * Leader can grant [Rush] to is in, and the 5-cost Ace is in for a different
 * reason: its static is what turns the rest of the hand into 2000 Counters, so
 * it is the card that pays for every later save.
 *
 * The set is read twice by `chooseGenericCounter`, and both readings are wanted.
 * It names the Characters worth defending on the board, and it also breaks ties
 * among equal-length Counter lines toward keeping these cards in hand -- which
 * for the ones printing no Counter at all is inert, and for Thatch and Kingdew
 * is the same preference stated once.
 */
const ACE_PROTECTED_FROM_COUNTER: ReadonlySet<string> = new Set([
  "OP17-005", // Edward.Newgate, 12000 -- the largest Rush target in the list.
  "OP16-003", // Edward.Newgate, 10000, and [Double Attack].
  "OP16-005", // Thatch, 8000.
  "OP17-006", // Kingdew, 8000.
  "OP16-011", // Vista, 8000.
  "OP16-014", // Marco, 8000.
  "OP16-118", // Portgas.D.Ace, 6000 -- the Counter static the rest depends on.
]);

/**
 * The Counter phase, which `pnpm census` reads at 2.44 `counter:counter`
 * decisions a game and **100.0% no rule at all** -- the deck's largest wholly
 * unpiloted surface, and the one its own manifest calls its whole defensive
 * plan.
 *
 * `counterEventBeatsCards` is unset because this fifty prints no [Counter]
 * Event; the knob would be a rule that cannot fire.
 *
 * `economicalCharacterDefense` is off, which is the rule as much as the set is.
 * On, a Character is defended only when one Counter card closes the gap and the
 * Leader is out of danger this turn -- a price that suits a deck whose bodies
 * are interchangeable and whose Counters are its defence. This deck is the
 * other way round on both halves. Its bodies are not interchangeable, because
 * the Leader unlocks one a turn and the board is what it attacks with; and its
 * hand is not its defence in the way that test assumes, since 24 of the 50
 * print no Counter at all, so the cards being "saved" are frequently cards that
 * could never have been spent. A two-card line for a 12000 body that swings
 * every turn it lives is a trade this deck wants and no other caller does.
 */
export function createOp16AceDefensePolicy(): RulesPolicy {
  return (observation: GameObservation): PolicyDecision | undefined => {
    if (observation.self.leader.cardNumber !== ACE_LEADER) return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      protectedCards: ACE_PROTECTED_FROM_COUNTER,
      economicalCharacterDefense: false,
    });
  };
}
