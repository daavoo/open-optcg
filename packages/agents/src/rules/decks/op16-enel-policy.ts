import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  chooseGenericCounter,
  decision,
  type PolicyDecision,
  selfLeaderId,
} from "../generic-policy.js";
import { avoid, heuristics, never, prefer, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";
import type { Tactics } from "../tactics.js";

/** The DON!! ceiling five cards in this deck reward staying under. */
const DON_CEILING = 6;

/**
 * The most a Character can cost and still be on the board for the Leader's
 * second-turn activation.
 *
 * Three DON!! is what the seat has on its own turn 2 before activating, so a
 * Character at or under this is a body the Leader can give DON!! to on the turn
 * the whole gameplan turns on. In this list it selects the four 1-cost
 * Characters, because the next Character up the curve costs 4.
 */
const EARLY_BODY_COST = 3;

/**
 * OP-16 Purple Enel.
 *
 * The deck is defined by one line on its Leader: the DON!! deck is six cards
 * rather than ten. Everything else follows. Five cards check "[printed text omitted -- pnpm card:text <card>]", eight pay `DON!! −N` to push it lower, and
 * the Leader pulls DON!! back out of the deck those costs refilled.
 *
 * That makes the pilot's central judgement unusual: *spending* DON!! is often
 * the point rather than the cost. The published notes put the failure mode as
 * "spending an expensive card on turn 3 cuts the curve" -- with six DON!! total
 * there is no ramping out of a mistake.
 *
 * Written as heuristics on top of `chooseGenericRules`, like the Nami deck.
 */
export function createOp16EnelRulesPolicy(): PolicyModule {
  return heuristics("op16-enel", [
    // The vassals are the early game: one cost each, they draw, and Shura has
    // Rush while under the ceiling. Landing them is how the deck sees cards.
    prefer("Deploy a 1-cost Skypiea vassal to draw and hold the board.")
      .when((t) => t.turn <= 5)
      .by(25)
      .play((card) =>
        ["OP15-061", "OP15-066", "OP15-067"].includes(card.cardNumber),
      ),

    // Either 6-cost Enel is the deck's wall: neither can be removed by the
    // opponent's effects while under the ceiling, and both are 10000 power
    // there.
    prefer("Land a 6-cost Enel while it is removal-proof and 10000 power.")
      .when((t) => t.donOnField <= DON_CEILING)
      .by(35)
      .play((card) => ["OP15-060", "OP15-118"].includes(card.cardNumber)),

    prefer("Keep a Blocker up when the Life total is the thing under threat.")
      .when((t) => t.selfLife <= 3 || t.opponentArchetype === "aggro")
      .by(20)
      .play((card) => card.facts.keywords.includes("Blocker")),

    // OP15-060's `[Activate: Main]` buys a Blocker for a DON!! card and a card
    // out of hand, and it has no once-per-turn clause -- so left alone the
    // generic policy takes it every turn it can and empties the hand into a
    // Blocker nobody was going to attack through. It is a defensive spend, so
    // it is only worth making when there is something to defend and a hand deep
    // enough that the discard is not the next turn's play.
    never("Do not trade a card for a Blocker the Life total does not need.")
      .when((t) => t.selfLife >= 4 || t.observation.self.hand.length <= 3)
      .activate((action) => action.sourceCardNumber === "OP15-060"),

    // The published gameplan: the thunder Events are the win condition, not
    // early-game filler ("no desperdiciar eventos en turnos tempranos"). An
    // Event cast with nothing on the opposing board removes nothing, and the
    // generic policy will otherwise fire every activation it is offered -- the
    // first trace of this deck showed six Events burned on turn 2, every one of
    // them resolving with no target.
    //
    // Identifying the Event needs `sourceCardNumber` on the action; without it
    // a policy could only tell these apart by parsing `optionId`.
    // `never`, not `avoid`. Ranking only narrows *within* an action type, and
    // once the Leader ability has been used for the turn every remaining
    // activation is an Event, they all tie at the same discouraged score,
    // nothing is hidden, and the generic policy fires them anyway. Forbidding is
    // the only tier that stops it.
    //
    // "Nothing to answer" cannot mean an empty opposing board: that gate is
    // nearly never shut, since a single 1-cost searcher body keeps it open, and
    // the seat then fires three Events at one 2000-power body. Every one of
    // those Events is also 2000 of Counter for the finisher, and every
    // `DON!! −N` they pay is a DON!! off a six-card field.
    //
    // The line: a body is worth an Event when the board cannot simply beat it --
    // it out-powers this Leader, or it blocks, or it is a real investment at
    // cost 4 or more. A 2000 vassal on the other side is none of those.
    //
    // The largest single rule in this file, and the decks it gains most
    // against are the ones that punish an empty hand.
    never("Do not spend an Event on a board this deck can already beat.")
      .when(
        (t) =>
          !t.observation.opponent.board.some(
            (card) =>
              card.blocker ||
              card.cost >= 4 ||
              card.currentPower >= t.selfLeaderPower,
          ),
      )
      .activate(
        (action, t) => t.facts(action.sourceCardNumber)?.category === "event",
      ),

    // Otherwise develop the biggest body affordable, as every deck does.
    prefer("Develop the largest body the DON!! can pay for.").play(
      (card) => card.facts.power / 1000,
    ),
  ]);
}

/**
 * A `DON!! −N` cost that would be paid out of the DON!! buying this turn's attack.
 *
 * `returnDonToDeck` (engine-core/src/don.ts) pays a `DON!! −N` cost from the
 * rested pool, then the active pool, then DON!! given to the Leader, then DON!!
 * given to Characters. That order is right under the rules -- given DON!! is on
 * the field -- and unguarded it turns a turn inside out. The seat gives the
 * Leader's rested DON!! to a vassal, making it a 6000 attacker into a 5000
 * Leader, then fires Events with an empty cost area: each `DON!! −1` comes off
 * that vassal -- 6000, 5000, 4000, 3000, 2000 -- so by the ladder's attack step
 * the body beats nothing and the Leader swings alone into a Blocker. Draws
 * bought with the turn's only Life threat, and every Event spent was 2000 of
 * Counter besides.
 *
 * The ladder is why a veto is the shape: `chooseGenericRules` takes every
 * `activate-main` before it considers an attack, and a heuristics module cannot
 * reorder it. Forbidding the Event *while an armed body can still swing* lets
 * the ladder fall through to the attack; once the body has attacked it is
 * rested, `couldAttack` is false, and the same Event is offered again -- now
 * paid from DON!! that was going back to the DON!! deck at Refresh anyway,
 * which the Leader re-adds. So the rule costs no Event: it moves them after the
 * attack.
 *
 * Gated on the cost area rather than the Event: `activeDon + restedDon` below
 * `cost.returnsDon` is the only case the attached DON!! is touched. An Event
 * whose `DON!! −1` the cost area can cover fires exactly as before, so the
 * `never("Do not spend an Event on a board this deck can already beat.")`
 * gate above keeps its whole effect.
 *
 * Bandai's own feature page says the Events "consume your DON!! cards" but the
 * Leader "will immediately let you recover any DON!! cards you spend, so this
 * is not an issue" -- true of the cost area, and the exception this rule names.
 *
 * Registered on its own so `pnpm deck:ab --disable op16-enel-gift-guard`
 * prices it alone. The decks it gains most against are the ones a second
 * early Life hit matters most against; it is flat against Kaido, which strips
 * DON!! off the field on its own, so the guard's gate is rarely the thing
 * deciding an Enel turn there.
 *
 * Replayed on the trace that found it, the same turn now attacks with the
 * Leader and the 6000 vassal for two Life, and casts all four Events afterward
 * off the rested body -- the same draws, one turn's worth of Life earlier.
 */
export function createOp16EnelGiftGuardModule(): PolicyModule {
  return heuristics("op16-enel-gift-guard", [
    never(
      "Do not pay a DON!! −N cost out of DON!! that is buying an attack this turn.",
    ).activate((action, t) => {
      const returns = action.cost?.returnsDon ?? 0;
      if (returns === 0) return false;
      const self = t.observation.self;
      if (self.activeDon + self.restedDon >= returns) return false;
      const armedLeader =
        self.leader.attachedDon > 0 &&
        t.couldAttack(selfLeaderId(t.observation));
      return (
        armedLeader ||
        self.board.some(
          (card) => card.attachedDon > 0 && t.couldAttack(card.instanceId),
        )
      );
    }),
  ]);
}

/**
 * A `DON!! −N` cost paid from given DON!! after the attacks are over.
 *
 * The gift guard above holds an Event only while the armed body can still
 * swing; once it has, the same Event was being cast off its DON!!. That is
 * not free either, and the reason is posture. Given DON!! goes back to the
 * *active* pool at Refresh (`turn.ts`), while DON!! returned to the DON!!
 * deck comes back only through the Leader: one active and four rested. So
 * four Events cast off a rested vassal's DON!! turn next turn's four active
 * DON!! into one active and four rested -- the difference between a Franky or
 * a Reiju next turn and nothing. With a six-card DON!! deck there is no other
 * DON!! to make it up.
 *
 * Kept separate from the gift guard so each half carries its own number.
 *
 * Priced alone with
 * `pnpm deck:ab --disable op16-enel-don-posture`, the gift guard and the
 * Counter reserve both shipped.
 */
export function createOp16EnelDonPostureModule(): PolicyModule {
  return heuristics("op16-enel-don-posture", [
    never(
      "Do not pay a DON!! −N cost out of given DON!! that would be active next turn.",
    ).activate((action, t) => {
      const returns = action.cost?.returnsDon ?? 0;
      if (returns === 0) return false;
      const self = t.observation.self;
      if (self.activeDon + self.restedDon >= returns) return false;
      return (
        self.leader.attachedDon > 0 ||
        self.board.some((card) => card.attachedDon > 0)
      );
    }),
  ]);
}

/**
 * Which body the gift goes to once one of them has [Double Attack].
 *
 * OP15-071 Holly gives every [Ohm] and itself [Double Attack], so on a board
 * that holds Holly the Leader's four rested DON!! are not worth the same on
 * every body: on an Ohm or on Holly the 6000 they make is two Life through a
 * 5000-power Leader, on Shura or Satori it is one. `rested-don-gift` scores
 * the gift by whether it unlocks an attack and then by power, and Ohm and
 * Shura tie on both -- so between two vassals it takes the one the engine
 * listed first. This rule reads `effectiveKeywords`, the observation's view of
 * every keyword in force on a card, because the grant is an aura and nothing
 * printed on Ohm says it has it.
 *
 * Written as `avoid` on the other recipients rather than `prefer` on the
 * [Double Attack] one, and the difference is the whole rule. The Leader's
 * activation is one `activate-main` per recipient, ranked alongside the
 * Events, and the deck casts its `DON!! −N` Events *before* the activation so
 * the Leader re-adds the DON!! they returned. A bonus on the activation lifts
 * it above the Events and the turn inverts: the gift lands first, the cost
 * area is empty, and the gift guard then holds every Event. Marking the
 * lesser recipients down leaves the activation where it was in the turn and
 * only changes which body it names.
 *
 * Registered on its own so `pnpm deck:ab --disable op16-enel-double-attack-gift`
 * prices it alone. It is silent on a board without a [Double Attack] body.
 */
export function createOp16EnelDoubleAttackGiftModule(): PolicyModule {
  const doubleAttackSwinger = (
    t: Tactics,
  ): ((instanceId: string) => boolean) => {
    const swingers = new Set(
      t.observation.self.board
        .filter(
          (card) =>
            card.effectiveKeywords.includes("Double Attack") &&
            t.couldAttack(card.instanceId),
        )
        .map((card) => card.instanceId),
    );
    return (instanceId) => swingers.has(instanceId);
  };
  return heuristics("op16-enel-double-attack-gift", [
    avoid(
      "Do not give the rested DON!! to a body without [Double Attack] while one that has it can still swing: the same power takes two Life instead of one.",
    )
      .by(WEIGHT.deck)
      .activate((action, t) => {
        if (!action.donGift || action.targetInstanceId === undefined) {
          return false;
        }
        const isDoubleAttackSwinger = doubleAttackSwinger(t);
        if (isDoubleAttackSwinger(action.targetInstanceId)) return false;
        return t.observation.self.board.some((card) =>
          isDoubleAttackSwinger(card.instanceId),
        );
      }),
  ]);
}

/**
 * Where the turn's active DON!! goes once a body has [Double Attack].
 *
 * The ladder attaches after plays and activations, and among recipients the
 * format has no opinion beyond `aura-attachment` and `dead-attachment`, so the
 * DON!! goes to the Leader. With Holly on the board that is the wrong body:
 * a DON!! that lifts an Ohm from 5000 to the opposing Leader's power buys two
 * Life, and the Leader at 5000 already connects into a 5000 Leader on the
 * tie. Scored by the Life the attachment buys -- the damage the body deals
 * once it reaches the Leader -- so an Ohm two DON!! short still ranks, and a
 * body already over the line does not.
 *
 * Registered on its own so `pnpm deck:ab --disable op16-enel-double-attack-don`
 * prices it alone. Silent on a board without a [Double Attack] body.
 */
export function createOp16EnelDoubleAttackDonModule(): PolicyModule {
  return heuristics("op16-enel-double-attack-don", [
    prefer(
      "Attach the DON!! to a [Double Attack] body it lifts into the opposing Leader: the same DON!! buys two Life there.",
    )
      .by(WEIGHT.deck)
      .attachDon((action, t) => {
        const target = t.observation.self.board.find(
          (card) => card.instanceId === action.targetInstanceId,
        );
        if (
          !target ||
          !target.effectiveKeywords.includes("Double Attack") ||
          !t.couldAttack(target.instanceId)
        ) {
          return false;
        }
        const power = target.currentPower;
        const needed = t.opponentLeaderPower;
        // Already over the line: the DON!! adds nothing the attack needs.
        if (power >= needed) return false;
        // Reachable with the DON!! still in hand this turn, this one included.
        return power + t.don * 1_000 >= needed;
      }),
  ]);
}

/**
 * How many Counter Events the Main phase must leave in hand.
 *
 * Three. The curve rises from one to three and then falls off a cliff:
 * never casting a Counter Event in the Main phase is clearly worse than any
 * reserve, because the Main-phase half is a real draw. Two and three are hard
 * to tell apart, and three is the guide's upper bound.
 */
const COUNTER_RESERVE = 3;

/**
 * Keep a Counter reserve.
 *
 * Varie, El Thor, Lightning Beast Kiten and Mamaragan are the deck's Counter
 * suite -- `createOp16EnelDefensePolicy` is built on them buying 2000 where a
 * card buys 1000 -- and each is also a Main-phase cantrip. Cast in the Main
 * phase, one trades a guaranteed 2000 Counter for a random draw, and once the
 * hand is out of them the finisher is defended with 1000-Counter vassals or
 * not at all. shonentcg.com's OP-16 guide: "Save at minimum 2-3 counter
 * Events for the turn your finisher is active." Lightning Dragon has no
 * [Counter] half and is not counted or held.
 *
 * `never`, for the reason the board gate above gives: ranking cannot stop an
 * activation the generic ladder takes in offer order. The Event is still
 * offered again next turn, so the rule delays a draw; it does not forfeit
 * the card.
 *
 * Priced alone with `pnpm deck:ab --disable op16-enel-counter-reserve`, the
 * gift guard and the DON!! posture rule both shipped. See
 * {@link COUNTER_RESERVE} for the reserve height.
 */
export function createOp16EnelCounterReserveModule(): PolicyModule {
  return heuristics("op16-enel-counter-reserve", [
    never("Hold the last Counter Events for the finisher's turn.").activate(
      (action, t) => {
        const facts = t.facts(action.sourceCardNumber);
        if (facts?.category !== "event" || !facts.hasCounterEvent) return false;
        const reserve = t.hand.filter(
          (card) => card.facts.hasCounterEvent,
        ).length;
        return reserve <= COUNTER_RESERVE;
      },
    ),
  ]);
}

/**
 * The bodies this deck cannot simply replace, and so will spend cards to keep.
 *
 * `chooseGenericCounter`'s protected set is empty by default, which makes it
 * answer every attack on a Character with "Do not spend hand resources
 * protecting a replaceable Character". Three of this deck's bodies are not
 * replaceable:
 *
 *  - **OP15-118 Enel**, the win condition. Under the six-DON!! ceiling it
 *    "[printed text omitted -- pnpm card:text OP15-118]", so battle is
 *    the *only* way it ever leaves -- which makes the Counter step the whole
 *    question for the card the deck is built to land. Defending it is not a
 *    trade against removal the opponent could make anyway; there is no removal.
 *  - **The Blockers.** They are how a deck on a five-turn clock survives
 *    being raced. Which cards those are depends on the list: the feature deck
 *    runs OP09-072 Franky and OP12-063 Vinsmoke Reiju, 7000 power once four
 *    Events are in the trash; the EU Championship 26-27 S1 list runs ST10-010
 *    Trafalgar Law and OP07-064 Sanji instead. Read off the printed keyword
 *    rather than named, so both lists under this Leader protect the Blockers
 *    they actually run.
 *
 * The 1-cost vassals are deliberately absent. They cash themselves in on play --
 * `[On Play] DON!! −1: Draw 1 card` -- so a vassal that has already drawn is a
 * spent card standing on the board, and the deck runs fourteen of them.
 */
const FINISHER = "OP15-118";
/**
 * OP15-071 Holly, the EU Championship 26-27 S1 list's engine: every [Ohm] and
 * Holly itself gain [Double Attack], and both sit at 6000 base power on the
 * opponent's turn. Protected for the second job the set does -- `protectedCards`
 * also tells `chooseGenericCounter` not to spend the card as Counter -- because
 * printed at 1000 Counter it is the cheapest card in the hand to pitch, and a
 * traced game pitched both copies before either reached the board.
 */
const HOLLY = "OP15-071";

function protectedBodies(observation: GameObservation): Set<string> {
  const protectedCards = new Set([FINISHER, HOLLY]);
  for (const card of observation.self.board) {
    if (observation.cardFacts[card.cardNumber]?.keywords.includes("Blocker")) {
      protectedCards.add(card.cardNumber);
    }
  }
  return protectedCards;
}

/**
 * The Counter phase, which this deck had no rule for at all.
 *
 * `pnpm census --deck "(Purple) Enel - Official Feature Deck" --seeds 100` said
 * where to look before any of this was written: **98.7% of 19,309 Counter
 * decisions and 91.0% of 12,269 block decisions** had no rule scoped to this
 * deck. None of it is reachable from the
 * heuristics module above, because `pass` cannot be vetoed and
 * `chooseGenericRules` answers this window by passing.
 *
 * Enel's Counter suite is unusual enough that the generic defaults are wrong in
 * both directions:
 *
 * 1. **The Events are cheaper defence than the cards.** Varie, El Thor and
 *    Lightning Beast Kiten all read "[printed text omitted -- pnpm card:text OP12-063]" and cost 0, so one card buys 2000
 *    where an ordinary Counter card in this deck buys 1000.
 *    `counterEventBeatsCards: 2` is exactly that arithmetic: whenever the
 *    ordinary line needs two cards, the Event closes the same gap with one.
 *    Without it the deck passes over an Event that alone would have stopped
 *    the attack, discarding a card for +1000 *and still getting hit* -- a
 *    strictly dominated line.
 * 2. **The bodies are worth defending past the economy gate.**
 *    `economicalCharacterDefense` caps a Character save at a 1000-power
 *    shortfall while Life is spare, which is right for a deck whose bodies are
 *    spare parts and wrong for {@link protectedBodies}. See there for why
 *    OP15-118 in particular has no other answer than this one.
 *
 * Registered separately from the heuristics module, so `pnpm deck:ab --disable
 * op16-enel-defense` prices it on its own.
 *
 * The dependency is worth stating, because the two are not separable in the
 * direction they were built: `counterEventBeatsCards: 2` sends this deck to its
 * Events far more often, and until `chooseGenericCounter` read the Event's real
 * Counter power it priced every one of them at a flat 3000. Shipping this option
 * on top of the old table would have spent Events on gaps they could not close.
 */
export function createOp16EnelDefensePolicy(): (
  observation: GameObservation,
) => PolicyDecision | undefined {
  return (observation) => {
    if (observation.self.leader.cardNumber !== "OP15-058") return undefined;
    if (observation.phase !== "counter") return undefined;
    return chooseGenericCounter(observation, observation.legalActions, {
      counterEventBeatsCards: 2,
      protectedCards: protectedBodies(observation),
      economicalCharacterDefense: false,
    });
  };
}

/**
 * The mulligan, which this deck had no rule for either.
 *
 * `chooseGenericRules` keeps on "any card costs 2 or less", which twenty 0-cost
 * Events satisfy -- so it keeps every hand this deck is ever dealt, including
 * the ones holding no Character the early turns can pay for.
 *
 * Why that matters more here than "a slow start": the Leader's activation is
 * built one-per-Character in `legal-actions/main.ts`, so a hand with no early
 * body reaches turn 2 with the ability not offered at all. The mulligan below
 * stops drawing that hand.
 *
 * Registered on its own, so `pnpm deck:ab --disable op16-enel-mulligan`
 * prices this rule and not the Counter or block window.
 */
export function createOp16EnelMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op16-enel-mulligan",
    // The keep is a *Character* the early turns can pay for, not any cheap
    // card. Read off `cardFacts` rather than a card-number list: the rule is
    // about what a card is, and a list goes stale when the manifest moves. The
    // cost bound is 3 rather than 1 because that is the DON!! available on the
    // seat's own turn 2 before the activation; in this list it selects the same
    // four cards either way, since the next Character up the curve costs 4.
    keep: (observation) =>
      observation.self.hand.some(
        (card) =>
          observation.cardFacts[card.cardNumber]?.category === "character" &&
          card.cost <= EARLY_BODY_COST,
      ),
    keepBecause:
      "Keep a hand with a Character the first two turns can pay for, so the Leader has something to give DON!! to.",
    mulliganBecause:
      "Mulligan a hand of Events: with no Character on the board the Leader's activation is not offered at all.",
  });
}

/**
 * The block window, for an attack on one of this deck's own Characters.
 *
 * `pnpm census` reads most of this deck's block decisions as unpiloted, and most
 * of that number is not an opportunity: the great majority are pass-only windows
 * with no block on offer at all, which no rule could shape. The actionable ones
 * are the decisions where a Blocker *outpowers the attack* and the deck declines
 * anyway -- against one of its own Characters, where neither
 * `chooseGenericBlock` nor the format's `free-block` has a rule because both
 * open with `targetInstanceId.endsWith("-leader")`. With the rule below those
 * fall to 3, the remainder being attacks on vassals it deliberately declines.
 *
 * Read the flipped counts rather than the delta when pricing this. The rule
 * fires in roughly a tenth of games, so it cannot move a field-wide average
 * much; what it can show is whether it helps when it fires, and a lopsided
 * win/loss split is what a free trade should look like -- the Blocker
 * outpowers the attack, so nothing is given up.
 *
 * Registered on its own so `pnpm deck:ab --disable op16-enel-block` prices
 * this rule and not the Counter or mulligan window.
 */
export function createOp16EnelBlockPolicy(): (
  observation: GameObservation,
) => PolicyDecision | undefined {
  return (observation) => {
    if (observation.self.leader.cardNumber !== "OP15-058") return undefined;
    // The block window, for an attack on a Character.
    //
    // Both of `chooseGenericBlock`'s tests open with
    // `targetInstanceId.endsWith("-leader")`, and so does the format's
    // `free-block` module, so an attack on a Character has no block rule at
    // either gate: the policy watches an OP15-118 die with an untapped Franky
    // beside it.
    //
    // Restricted to {@link protectedBodies} and to a Blocker that survives, so
    // the trade is strictly free rather than merely available: the Blocker
    // outpowers the attack, so it is not K.O.'d, no Life is lost, the defended
    // body lives, and the rest it costs comes back at the next Refresh Phase.
    // Blocking rests the Blocker and a rested Blocker cannot block again this
    // turn (Comprehensive Rules 10-1-4-1), so there is no later attack in this
    // turn it was being held back for.
    //
    // Scoped to this deck rather than widened to the format because
    // format-wide it is a wash:
    // what makes it pay here is that the Counter policy above already spends
    // cards freely to keep these same three bodies alive, and a block that
    // costs nothing is strictly cheaper than the Counter line it replaces.
    if (observation.phase !== "block") return undefined;
    const battle = observation.activeBattle;
    if (!battle) return undefined;
    if (battle.targetInstanceId.endsWith("-leader")) return undefined;
    const defended = observation.self.board.find(
      (card) => card.instanceId === battle.targetInstanceId,
    );
    if (!defended || !protectedBodies(observation).has(defended.cardNumber)) {
      return undefined;
    }
    const power = new Map(
      observation.self.board.map((card) => [
        card.instanceId,
        card.currentPower,
      ]),
    );
    // Lowest power first among the survivors, the same tie-break
    // `cheapestSurvivingBlock` uses: it keeps the bigger body free for whatever
    // the opponent declares next.
    const free = observation.legalActions
      .filter(
        (action): action is Extract<LegalAction, { type: "block" }> =>
          action.type === "block" &&
          (power.get(action.blockerInstanceId) ?? 0) > battle.attackPower,
      )
      .sort(
        (left, right) =>
          (power.get(left.blockerInstanceId) ?? 0) -
          (power.get(right.blockerInstanceId) ?? 0),
      )[0];
    if (!free) return undefined;
    return decision(
      free,
      "Block with a Blocker that outpowers the attack to save one of the deck's own bodies: it survives, no Life is lost, and the rest it costs is refunded at the next Refresh Phase.",
    );
  };
}
