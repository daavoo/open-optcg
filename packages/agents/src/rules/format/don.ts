/**
 * Format rules about DON!!: what to attach it to, what to spend it on, and
 * which activation is worth paying for.
 *
 * One of the files `format-heuristics.ts` is the map of; see that file for what
 * lives where and why the split is by decision rather than by deck.
 */
import {
  heuristics,
  never,
  prefer,
  preferAmong,
  WEIGHT,
  type Heuristic,
} from "../heuristics.js";
import { optionCard, targetPower } from "../generic-policy.js";
import type { PolicyModule } from "../policy-module.js";
import { selfLeaderId, type Tactics } from "../tactics.js";
import { isWorthRemoving } from "./shared.js";
import type { LegalAction } from "@one-piece-sim/protocol";
import { cards } from "@one-piece-sim/cards";
import {
  getOnPlayMechanicProgram,
  mechanicProgramsByClause,
  programBuffsOwnPowerForTheTurn,
} from "@one-piece-sim/engine-core";

/** Turn by which all ten DON!! are normally on the field. */
const RAMP_TURNS = 6;

/** Power a given DON!! adds during its controller's turn (CR 6-5-5-2). */
const DON_POWER = 1_000;

/**
 * DON!! a seat draws in its own DON!! Phase.
 *
 * `turn.ts` reads `state.turn === 2 ? 1 : 2` -- the second turn of the game is
 * the one exception, and no DON!! deck is down to its last two cards that
 * early, so the steady-state figure is the only one a late-game rule needs.
 */
const DON_DRAWN_PER_TURN = 2;

/**
 * Never spend the last payable DON!! on an attachment.
 *
 * A DON!! given to a Leader or Character is +1000 power for one turn. The same
 * DON!! spent on a Character is a permanent body, and -- for the several Leaders
 * whose ability consumes rested DON!! -- also fuel. When the pool is down to the
 * cost of the cheapest thing in hand, the attachment is strictly the worse half
 * of that trade.
 *
 * Three exclusions, all because the trade genuinely reverses:
 *
 *  - **Closing turns.** Once the opponent is at one Life, +1000 power on an
 *    attack that has to connect beats a body that will never attack.
 *  - **After the ramp.** The fundamental is explicitly an *early-game* rule --
 *    the guides phrase it as reserving DON!! for Character plays "in the early
 *    game", and all ten DON!! are normally down by turn 5-6, after which the
 *    binding constraint is reach rather than payment. ST36's policy deliberately
 *    builds one oversized Leader attack from turn 8, and that is a considered
 *    line rather than the ordering mistake this rule targets.
 *  - **A Leader still assembling a board-wide `[DON!! xN]` aura.** The first
 *    paragraph's price -- "+1000 power for one turn" -- is what an attachment is
 *    ordinarily worth, and it is not what this one is worth: the DON!! buys the
 *    clause, which is +1000 on the Leader *and* on every Character.
 *    `dead-attachment` below and `counter-event-reserve` in `format/defence.ts`
 *    carve the same exemption from the same argument; this one is narrower than
 *    theirs on purpose -- see the comment at the rule for what narrows it.
 *    `couldAttack` is required alongside `canCompleteDonAbility` for the same
 *    reason it is there: text bought by a unit with no swing left this turn is
 *    returned at the next Refresh having done nothing.
 *
 * Without the exemption the shape to watch for is a *deadlock*. A Leader whose
 * `[DON!! x1]` gives the whole board +1000 has two rules with an opinion about
 * the same DON!!: `aura-before-bodies` in `strategy/archetypes.ts` vetoes the
 * turn's last play so the DON!! can switch the aura on, and this rule vetoes the
 * attachment as "the last one that can pay for a play". Both candidates gone,
 * the ladder falls through to `attack` and the Leader swings without either.
 * Two rules can each be individually defensible and jointly choose a third thing
 * neither wanted, and a veto tier is where that happens.
 */
export function createDonReservationModule(): PolicyModule {
  return heuristics("don-reservation", [
    never(
      "Develop before powering up: this DON!! is the last one that can pay for a play.",
    )
      .when(
        (t) =>
          t.attachmentBlocksAllDevelopment &&
          t.opponentLife > 1 &&
          t.turn <= RAMP_TURNS &&
          t.observation.phase === "main",
      )
      // Narrowed to a Leader whose clause buys power for the *whole board*, which
      // is the same text gate `aura-attachment` uses and the same reason: that
      // DON!! is +1000 on every card the seat has, and the play it displaces is
      // displaced by one decision rather than lost. Registered format-wide but
      // reachable by two decks, both OP13-004's.
      //
      // The narrowing is what makes the exemption's argument true: an unmet
      // `[DON!! xN]` on a 2000-power *Character* is worth only the text on that
      // one body, where a Leader clause that buffs the whole board is worth
      // +1000 on every card the seat has. The exemption is only as strong as
      // what the text buys, so it is gated on the wide clause. See
      // `aura-before-bodies`, the rule this exists to unblock.
      .attachDon((action, t) => {
        const leaderId = selfLeaderId(t.observation);
        if (action.targetInstanceId !== leaderId) return true;
        if (
          !t.facts(t.observation.self.leader.cardNumber)?.rules
            .buffsAllCharacters
        )
          return true;
        return !(t.canCompleteDonAbility(leaderId) && t.couldAttack(leaderId));
      }),
  ]);
}

/**
 * A DON!! given to a Character is +1000 power **for this turn only**. If that
 * Character will not win a battle this turn, the DON!! bought nothing at all.
 *
 * Two states qualify, and both were traced in one ST34 turn against ST32
 * (`pnpm trace:match --p1 "(Purple) Charlotte Katakuri - Starter Deck 34"
 * --p2 "(Green) Roronoa Zoro - Starter Deck 32" --seed rules-benchmark-7`),
 * where the deck put two DON!! on a 1-cost 2000-power Brulee and then ended its
 * turn without attacking with it:
 *
 *  - **The Character is offered no attack.** Summoning sickness, already rested,
 *    or nothing legal to swing at. The attachment expires unused.
 *  - **The Character is offered attacks and loses all of them anyway.** The
 *    attacker wins ties, so the DON!! has to *reach* the defender's power, not
 *    approach it.
 *
 * The second is priced against every DON!! still in the cost area, not against
 * this one. The decision is offered once per DON!!, so a one-DON!! reading
 * vetoes a body three short on the first attachment, on the second and on the
 * third, and the swing the sequence would have bought is never assembled -- a
 * 9000-power body with four DON!! available never becomes the 13000 the
 * position wanted. The veto has to be sound over the sequence it forecloses,
 * and `self.activeDon` is that bound.
 *
 * `no-hopeless-attack` says the second half of this about the attack itself.
 * This says it about the DON!! one step earlier, which is where the resource is
 * actually spent -- and unlike that rule it does not have to wait for the
 * attachment options to run out, because it is judging them.
 *
 * Three things it deliberately leaves alone:
 *
 *  - **The Leader.** A Leader attachment is the standard way to make a Leader
 *    hit cost the defender another Counter card, and `don-threshold` already
 *    prices those.
 *  - **A unit whose `[DON!! xN]` ability this turn can still switch on.**
 *    `canCompleteDonAbility` is that question, and the second half of it is
 *    load-bearing: a given DON!! goes back to the cost area at the next Refresh
 *    Phase (CR 6-2-3), so a condition that cannot be met inside this main phase
 *    is not going to be met by adding to it later. Short of the count the
 *    attachment buys only 6-5-5-2's +1000, which is what this rule is already
 *    pricing -- and a card printed at low power *because* its text is gated is
 *    the worst body on the board to put it on.
 *  - **Anything at all once the attachment is the only thing left.** `never`
 *    removes candidates; a turn with nothing but hopeless attachments left
 *    falls through to the policy's own next line, which is `pass`.
 *
 * ## What the DON!! is actually saved for
 *
 * Not a later turn -- the pool refreshes anyway. It stays *active into the
 * opponent's turn*, which is the only DON!! a [Counter] Event can be paid with
 * (see `Tactics.cheapestCounterEventInHand`, and `counter-event-reserve`,
 * which exists for the same reason). So the decks that gain are the ones
 * holding cheap [Counter] Events, and a mirror match hands both seats the same
 * upside and cancels it: measure this rule against a field, not a mirror.
 */
/**
 * The shortfall this attachment leaves, against the easiest target the body is
 * offered, or `undefined` when the question does not arise -- the Leader, a
 * `[DON!! xN]` that can still switch on, a body whose power cannot be read.
 *
 * `Infinity` means no attack is offered at all, which no amount of DON!! fixes.
 */
function attachmentShortfall(
  action: Extract<LegalAction, { type: "attach-don" }>,
  t: Tactics,
): number | undefined {
  const target = action.targetInstanceId;
  if (target === selfLeaderId(t.observation)) return undefined;
  if (t.canCompleteDonAbility(target)) return undefined;
  const power = t.ownCurrentPower(target);
  if (power === undefined) return undefined;
  const attacks = t.actions.filter(
    (candidate) =>
      candidate.type === "attack" && candidate.attackerInstanceId === target,
  );
  if (attacks.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(
    ...attacks.map((attack) =>
      attack.type === "attack"
        ? targetPower(t.observation, attack) - power
        : Number.POSITIVE_INFINITY,
    ),
  );
}

export function createDeadAttachmentModule(): PolicyModule {
  return heuristics("dead-attachment", [
    never(
      "This DON!! expires at end of turn and buys no battle: the Character it would go on cannot win an attack this turn, even with every DON!! still in the cost area.",
    )
      .when((t) => t.observation.phase === "main")
      .attachDon((action, t) => {
        const shortfall = attachmentShortfall(action, t);
        if (shortfall === undefined) return false;
        return shortfall > 1_000 * t.observation.self.activeDon;
      }),
  ]);
}
/**
 * The first turn on which an attack is legal.
 *
 * Comprehensive Rules 6-5-6-1, "neither player can battle on their first turn":
 * `legal-actions/main/attacks.ts` offers no attack at all while
 * `state.turn <= 2`, and `couldAttackThisTurn` returns false for every unit on
 * both sides. So the two opening turns of a game contain no battle.
 */
const FIRST_ATTACK_TURN = 3;

/**
 * Do not give the Leader DON!! on a turn that has no battle in it.
 *
 * Two Comprehensive Rules, and they are easy to run together because one is
 * about the power and the other about the card:
 *
 *  - **6-5-5-2.** A card gains +1000 "during your turn" for each DON!! given to
 *    it. Not afterwards: `battle.ts` prices a defender with
 *    `includeAttachedDon: false`, and `observe` gates the field on
 *    `viewer === turnPlayer`.
 *  - **6-2-3.** The DON!! card itself stays under the card it was given to
 *    until your next Refresh Phase, and comes back rested.
 *
 * So the power lasts one turn while the DON!! is spent for two, and the turn it
 * is spent through is the opponent's -- the one turn a [Counter] Event needs
 * active DON!! to be cast on. Now put that next to 6-5-6-1, "neither player can
 * battle on their first turn", which `legal-actions/main/attacks.ts` reads as
 * "no attack is offered while `state.turn <= 2`".
 *
 * On turns 1 and 2 an attachment therefore buys +1000 on a card that cannot
 * attack and cannot be attacked, and pays for it with the DON!! that would
 * otherwise have been active while the opponent swings. There is nothing on the
 * other side of the trade at all: it is dominated on both turns, not merely a
 * poor price. That is also why this rule is worth having as well as
 * `counter-event-reserve`, which reaches the same DON!! only once
 * `donOnField >= 4`.
 *
 * It was the fallthrough in `chooseGenericRules` -- "Convert unused DON!! into
 * attack power", reached whenever the opening hand has nothing castable -- and
 * it fired in roughly one opening in two: 185 of the first 2591 attachments in
 * a mirror sweep of the roster, 176 of them onto the Leader, by 24 of the 27
 * decks. It is the play a person watching the app notices first.
 * `attachmentBlocksAllDevelopment` already covers the opening where there *is*
 * something to cast instead; this is the rest of it.
 *
 * Two things it deliberately leaves alone:
 *
 *  - **A Character.** Its power is read outside a battle in a way a Leader's is
 *    not -- "K.O. one Character with a power of 2000 or less" is checked on the
 *    opponent's turn, and 6-5-5-2 has already taken the +1000 away by then, so
 *    the DON!! does not even buy the dodge; but a Character can also be given
 *    DON!! to meet a `[DON!! xN]` condition that *is* still met on the
 *    opponent's turn, because 8-3-2-3 counts the cards and 6-2-3 leaves them
 *    there. The Leader is the target in all but 9 of those 185 openings anyway,
 *    so nothing is given up by staying off the case the argument does not
 *    cover.
 *  - **A Leader still assembling a `[DON!! xN]` ability that could swing this
 *    turn**, which is the `canCompleteDonAbility && couldAttack` pair that
 *    `don-reservation` and `counter-event-reserve` already carve from the same
 *    argument: there the DON!! buys text rather than power. `couldAttack` is
 *    false for every unit on turns 1 and 2, so on the turns this rule fires the
 *    exemption is inert by construction rather than by a second opinion about
 *    the text. Written out anyway: the day the gate widens is the day it stops
 *    being inert.
 */
export function createPreCombatAttachmentModule(): PolicyModule {
  return heuristics("pre-combat-attachment", [
    never(
      "Neither player can battle before turn 3, and a given DON!! is +1000 only during your own turn: this buys nothing and leaves the DON!! under the card while the opponent attacks.",
    )
      .when((t) => t.observation.phase === "main" && t.turn < FIRST_ATTACK_TURN)
      .attachDon((action, t) => {
        if (action.targetInstanceId !== selfLeaderId(t.observation))
          return false;
        return !(
          t.canCompleteDonAbility(action.targetInstanceId) &&
          t.couldAttack(action.targetInstanceId)
        );
      }),
  ]);
}

/**
 * Cards whose whole worth is an `[On Play]` power boost that expires with the
 * turn, and whose body cannot read a battle either.
 *
 * Two halves, and both are needed. `programBuffsOwnPowerForTheTurn` answers the
 * first from the program rather than the printed text: every leaf of the
 * `[On Play]` is a positive `modify-power` with `expiresAfterTurns: 0` over the
 * controller's own card, so a turn with no battle in it reads none of it. The
 * second half is printed power 0 -- a body that loses every battle it is put in
 * and wins none, so nothing on the board reads the card afterwards either.
 *
 * Without the power test this would be a curve rule rather than a dominance
 * one: OP08-051 Buckin and P-020 Helmeppo print the same dead `[On Play]` on a
 * 2000-power body, and a 2000-power body on turn 2 is ordinary development
 * whose rider merely goes unread. Whether to develop it is a judgement the
 * ladder already makes; this is only about the card that buys nothing at all.
 *
 * Computed once from the registry, because the answer is a property of the card
 * rather than of the position.
 */
const DEAD_OPENING_PLAYS: ReadonlySet<string> = new Set(
  [...(mechanicProgramsByClause().get("[On Play]") ?? [])].filter(
    (cardNumber) => {
      const program = getOnPlayMechanicProgram(cardNumber);
      if (program === undefined) return false;
      if (!programBuffsOwnPowerForTheTurn(program)) return false;
      return cards.get(cardNumber)?.power === 0;
    },
  ),
);

/**
 * Do not spend a card on turns 1 and 2 for an `[On Play]` no battle can read.
 *
 * The play-side sibling of `pre-combat-attachment` above, on the same
 * Comprehensive Rule: 6-5-6-1, "neither player can battle on their first turn",
 * which `legal-actions/main/attacks.ts` reads as offering no attack at all
 * while `state.turn <= 2`. A power boost that expires at end of turn is
 * therefore guaranteed to be read by nothing on either of those turns.
 *
 * What makes it a dominance argument rather than a tempo one is the body. The
 * cards in {@link DEAD_OPENING_PLAYS} print 0 power, so the board they leave
 * behind loses every battle it is put in: the card is spent in full and buys
 * nothing now and nothing later. Held instead, the same card is still a Counter
 * in hand, and still the same boost on a turn that has a battle to spend it in.
 *
 * From a real game: OP-09 Robin opened turn 2 by searching with OP17-113, then
 * playing its singleton OP09-106 Nico Olvia -- a 0-power, 2000-Counter card --
 * to give its Leader +3000 on a turn the rules do not allow an attack on, and
 * passed. `chooseGenericRules` develops the highest-cost legal card, and on
 * that turn Olvia was the only card left it could afford.
 *
 * Format-wide, because none of it is about a deck: the engine resolves printed
 * text the same way whoever holds the card, and the turn bound is a rule of the
 * game. The pool holds six cards whose `[On Play]` is only a this-turn boost
 * and one of them prints 0 power, so today the rule reaches exactly Olvia --
 * but the gate is written as the property, not as the card number, because the
 * next set that prints the shape needs no second opinion about it.
 */
export function createDeadOpeningPlayModule(): PolicyModule {
  return heuristics("dead-opening-play", [
    never(
      "Neither player can battle before turn 3, so this card's [On Play] power boost expires unread -- and its 0-power body wins no battle afterwards. Held, it is still a Counter card and still that boost on a turn with a battle in it.",
    )
      .when((t) => t.observation.phase === "main" && t.turn < FIRST_ATTACK_TURN)
      .play((card) => DEAD_OPENING_PLAYS.has(card.cardNumber)),
  ]);
}

/**
 * Among DON!! attachments, prefer the one that crosses a Counter threshold.
 *
 * Prefer allocations that reach the 5k, 7k or 9k Counter thresholds. The
 * reason those numbers and not others is that Counter is spent in whole cards
 * against a 5000 Leader: 5000 and 6000 both cost one card, 7000 and 8000 cost
 * two, 9000 costs three. A DON!! put on a 6000 body buys a card out of the
 * defender's hand; the same DON!! put on a 5000 body buys nothing at all.
 *
 * Ranks attachments against each other only, so which target a deck favours among
 * equally threshold-crossing options, and whether to attach at all rather than
 * develop or attack, both stay with the deck policy.
 *
 * Note what "unranked" means here: because `rank` hides everything below the best
 * candidate in its group, returning `false` does not leave a candidate alone -- it
 * removes it as soon as any sibling scores. A target that cannot attack this turn
 * is therefore dropped, not merely ignored, which is correct for this rule and was
 * *not* correct for units still assembling a `[DON!! xN]` ability.
 */
export function createDonThresholdModule(): PolicyModule {
  return heuristics("don-threshold", [donThresholdRule()]);
}

/**
 * The rule itself, so the strategy profiles can reuse it at their own weight.
 *
 * It is exported rather than copied because the arithmetic is the point and a
 * second copy with different rounding is exactly the drift `combat.ts` exists to
 * prevent. Note where it ended up registered: format-wide it is a wash made of
 * two significant opposite deck effects, but "drain the defender's Counter cards"
 * is precisely an *aggro* plan -- so `strategy/archetypes.ts` claims it for the
 * `aggro` profile, which is the widest scope on which it is actually true.
 */
export function donThresholdRule(
  weight: number = WEIGHT.format,
  name?: string,
): Heuristic {
  const rule = prefer(
    "Attach DON!! where it crosses a Counter threshold rather than into one.",
  ).by(weight);
  return (name === undefined ? rule : rule.as(name))
    .when((t) => t.observation.phase === "main")
    .attachDon((action, t) => {
      // Completing a `[DON!! xN]` condition outranks any power threshold: that
      // DON!! is buying an ability, and the ability is why the deck is built.
      // `canCompleteDonAbility` rather than `needsDonForAbility`, because the
      // top score has to be reserved for a DON!! that actually finishes the
      // count. A unit two DON!! short with one left to spend is buying nothing,
      // and scoring it here does not merely overrate it -- `rank` hides every
      // lower candidate, so it takes the Leader attachment off the table too.
      //
      // Scoring it rather than abstaining is the point. `rank` hides everything
      // below the best candidate in its group, so a candidate the rule merely
      // has *no opinion* about is hidden as soon as any other candidate scores.
      // Abstaining here left ST32's `[DON!! x3]` Zoro Leader losing its
      // attachment to whichever Character happened to be sitting on 6000.
      if (t.canCompleteDonAbility(action.targetInstanceId)) return 4;
      if (!t.canAttack(action.targetInstanceId)) return false;
      const power = t.ownCurrentPower(action.targetInstanceId);
      if (power === undefined) return false;
      const gained =
        t.cardsToSurviveLeaderHit(power + 1_000) -
        t.cardsToSurviveLeaderHit(power);
      return gained > 0 ? gained : false;
    });
}

/**
 * Put the DON!! that switches on a whole-board Leader aura down *before* the
 * turn's bodies, when the turn can afford both.
 *
 * ## The finding
 *
 * Written as a veto on plays rather than as a preference for the attachment,
 * because a preference cannot express this. `rank` and `rankAmong` both hide
 * candidates *within* an action type, and the cross-type order is fixed by
 * `chooseGenericRules`: plays, then activations, then attachments, then attacks.
 * So a `prefer(...).attachDon(...)` rule can only ever choose *which* unit gets
 * the DON!! once the ladder has run out of plays -- it can never move the
 * attachment ahead of one. `strategy/archetypes.ts`'s `switch-on-the-aura` rule
 * for OP13-004 is written exactly that way, and this is what it does in practice:
 * over the recorded games of one matchup, in the 42 positions offering both an
 * aura-completing Leader attachment and a play, the rules agent attached **4**
 * times (10%) and developed 38 times. The human who won every recorded game of
 * that matchup attached in 4 of 8 (50%); the model, in 6 of 32 (19%).
 *
 * The inverse shows the same mechanism from the other side. `st31-policy.ts`
 * expresses the same claim as a `decide`, which *can* reorder types -- and that
 * seat attached in 20 of 30 such positions (67%) where the human attached in
 * **0 of 16**. So the layer is not biased one way; it is at the extreme in both
 * directions, and which extreme depends on whether the deck's author happened to
 * reach for `decide` or for `prefer`.
 *
 * ## Why a veto is the honest tier for it
 *
 * The gate makes this pure sequencing rather than a trade: it fires only when
 * there is enough active DON!! to attach *and* still make the most expensive
 * affordable play. So the play the veto hides this decision is still on offer at
 * the next one, one DON!! poorer, and the turn ends with the same board plus an
 * aura it would otherwise have switched on after the plays -- or not at all.
 * That is a dominance argument, not an estimate, which is what lets a rule this
 * broad be registered at format scope.
 *
 * The argument has a second half, and it is about what stands between the two
 * actions rather than about DON!!. `chooseGenericRules` runs plays, then
 * activations, then attachments, so hiding the plays does not hand the decision
 * to the attachment -- it hands it to any `[Activate: Main]` on offer, and an
 * activation may rest or spend the whole pool. Where one exists the deferral
 * this rule promises is not a deferral at all, so the rule stands down and lets
 * the ladder develop.
 *
 * ## Scope
 *
 * `EVERY_DECK`, gated on the Leader's printed text, which is the widest scope
 * the claim is true at: a Leader whose `[DON!! xN]` clause reads "all of your
 * Characters" is buying power for the whole board with that DON!!, and one whose
 * clause buys something for a single unit is not. OP13-004 reads "[printed text omitted -- pnpm card:text OP13-004]"; ST21-001's `[DON!! x1]` gives
 * rested DON!! to one Character and is correctly left alone.
 *
 * The one thing this cannot read at format scope is the *rest* of the clause's
 * condition -- OP13-004 also needs a cost-8 Character on the board, and whether
 * that holds is deck knowledge. So the attachment may occasionally buy only the
 * Leader's own +1000 rather than the aura. That is the residual this rule pays
 * for its scope, and it is bounded by the DON!!-headroom gate: the cost is one
 * DON!! on the Leader, which is also 1000 power on the Leader's own attack.
 *
 * ## Containment
 *
 * The gate is a text match, so a deck whose Leader has no board-wide
 * `[DON!! xN]` clause cannot reach the rule at all. Only the two OP13-004
 * lists can, which is what makes a format-wide registration safe here: every
 * other column of `pnpm heuristic:ab --module aura-attachment` is a zero-flip
 * control by construction rather than by luck.
 */
export function createAuraAttachmentModule(): PolicyModule {
  return heuristics("aura-attachment", [
    never(
      "Switch the Leader's board-wide aura on before spending the turn on a body: the turn can afford both.",
    )
      .by(WEIGHT.format)
      .when((t) => {
        const observation = t.observation;
        if (observation.phase !== "main") return false;
        if (observation.turnPlayer !== observation.viewer) return false;
        const leaderId = selfLeaderId(observation);
        if (!t.canCompleteDonAbility(leaderId)) return false;
        // The clause has to be buying power for the whole board. A Leader
        // ability that names one unit is a different rule and not this one.
        if (
          !t.facts(observation.self.leader.cardNumber)?.rules.buffsAllCharacters
        )
          return false;
        // With no Character out, the aura is the Leader's own +1000, which the
        // ordinary attachment rules already price.
        if (observation.self.board.length === 0) return false;
        const attaches = observation.legalActions.some(
          (action) =>
            action.type === "attach-don" &&
            action.targetInstanceId === leaderId,
        );
        if (!attaches) return false;
        // `chooseGenericRules` runs plays, then activations, then attachments.
        // So an activation sits between the action this rule hides and the
        // attachment it hides it for, and an `[Activate: Main]` may rest or
        // spend arbitrarily much DON!! -- OP17-098 Gum-Gum Kong Gun costs 1 and
        // rests 6. When one is on offer, hiding the plays does not defer them
        // by one DON!!; it hands the turn to the activation, and the aura this
        // rule exists to switch on is never switched on at all. The action
        // carries no DON!! cost to price, so the honest gate is the whole
        // class: with an activation in the ladder the promise below is not one
        // this rule can make.
        const activates = observation.legalActions.some(
          (action) => action.type === "activate-main",
        );
        if (activates) return false;
        // The headroom that makes this sequencing rather than a trade: after
        // the attachment the most expensive play now affordable must still be
        // affordable. Without it the rule would be spending a body for an aura,
        // which is a judgement call and not a dominance argument.
        const affordable = t.affordablePlays
          .map((action) => t.playedCard(action)?.cost ?? 0)
          .sort((left, right) => right - left);
        const dearest = affordable[0] ?? 0;
        return observation.self.activeDon - 1 >= dearest;
      })
      .play(() => true),
  ]);
}

/**
 * Among the attacks aimed at the opposing Leader, declare the smallest first.
 *
 * The claim is the most widely-agreed piece of public advice about this game:
 * "attack with your weakest relevant threat first. Force the opponent to spend
 * Blockers and counter cards early, then send your most important attacker into
 * a depleted defense" (shonentcg.com's attack-and-battle guide, retrieved
 * 2026-08-31; the same rule appears in every beginner-to-intermediate primer).
 * The arithmetic behind it is this engine's own: Counter is spent in whole
 * cards, the defender must decide each battle before seeing the next, and an
 * attack's power freezes at declaration -- so the cards spent stopping a 5000
 * swing are not available against the 9000 one that follows, while the reverse
 * order lets one card answer the small attack after the big one has already
 * been paid for.
 *
 * Two deck policies state the same claim for themselves -- `st31-policy.ts`
 * ("Pressure the opposing Leader with the smallest viable ST31 attack") and
 * `st32-policy.ts` ("Use the smallest attack that still connects, keeping the
 * larger ones back"). Without it at format scope `chooseGenericRules` takes
 * `attacks.find(...)`, the first Leader attack the engine offers, which is board
 * order -- the oldest Character.
 *
 * `preferAmong` rather than `prefer`, which matters here: `prefer` compares
 * against the best score in the whole `attack` type, so scoring only Leader
 * attacks would hide every attack aimed at a Character -- including the ones
 * `threat-removal` exists to promote. `rankAmong` orders the Leader attacks
 * against each other and leaves the rest untouched, which is exactly the claim:
 * "if you are attacking the Leader, attack with the smallest one that connects".
 *
 * Restricted to attacks that can actually win their battle. An attack below the
 * Leader's power takes no Life whatever the order, and `no-hopeless-attack`
 * already removes it; scoring it here would only rank the useless attacks
 * against each other.
 *
 * ## The DON!!-giver, and why it is not reordered
 *
 * Four cards print a `[When Attacking]` that gives a rested DON!! to your
 * Leader or another Character, so the order of two attacks decides whether
 * that DON!! arrives before or after the card it is meant to help swings. It
 * is tempting to promote such an attacker, and it is wrong in this format:
 * the DON!!-giver is also the *biggest* body -- ST21-014 is a 6000 -- so
 * moving it earlier inverts the weakest-first rule above in exactly the spot
 * that rule is worth the most, and hands the defender the cheap answer while
 * its hand is still full. One DON!! of extra power on a later swing does not
 * buy back the Counter cards the large attack spends going first.
 *
 * That changes if the promotion can be gated on the recipient actually needing
 * the DON!! to cross a threshold, which is a comparison this module cannot
 * currently make. `rested-don-gift` is the other half of the same problem: it
 * puts the DON!! on a card that can still spend it, without reordering
 * anything.
 *
 * ## The ST32 exclusion
 *
 * One deck is worse for this rule, which is what
 * {@link ATTACK_ORDER_EXCLUDED_LEADERS} is for. ST32's own policy already
 * decides its attacks -- "Use the smallest attack that still connects, keeping
 * the larger ones back" -- and it decides them from the candidates this rule has
 * already narrowed, against a plan that prices an attack by more than its power
 * (its Leader restands when it battles a Character). The rule and the deck agree
 * about the claim and disagree about which attack satisfies it, and the deck's
 * version wins. Excluding the Leader whose policy owns the choice costs
 * nothing -- ST32 keeps the attacks its own policy picks -- and it is written as
 * a named exclusion rather than buried in the gate so the next reader can see a
 * known conflict rather than an oversight. The mechanism behind the disagreement
 * is not pinned down; when it is, the exclusion should go.
 */

/**
 * A rested DON!! handed to a card that has already swung is worth nothing.
 *
 * The `resolve-effect` sibling of {@link createDeadAttachmentModule}, and the
 * same arithmetic, which the Comprehensive Rules state outright:
 *
 *  - **6-5-5-2**: "Leader cards and Character cards gain 1000 power *during your
 *    turn* for each DON!! card given to them."
 *  - **6-2-3**: the Refresh Phase returns "all DON!! cards given to cards in
 *    your Leader area and Character area ... to your cost area".
 *
 * So the DON!! is not banked for defence and not banked for a later turn: a gift
 * onto a spent Character or a Leader that has attacked buys exactly 0 power, and
 * the choice cannot be taken back. `donPowerApplies` is the engine's spelling of
 * 6-5-5-2 and this rule is the pilot's.
 *
 * Nothing else has an opinion here, so the first offer wins: a `[When Attacking]`
 * that gives a rested DON!! away lands it on the Leader that has just swung. The
 * `give-rested-don` option names one of *your own* cards, so `threat-removal` and every
 * `chooseEffect` branch that filters for a search result or a card in hand
 * passes over it, and both the deck ladder and `chooseGenericRules` end at
 * "take the first non-skip option". First offered is the Leader, because the
 * engine builds `eligibleInstanceIds` as Leader-then-board.
 *
 * Eligible is "can still convert it into power this turn":
 *
 *  - **The attacker of the battle in progress.** Rested, and rested by its own
 *    declaration: CR 7-1-1-1 rests the attacker, and only then does 7-1-1-3 fire
 *    `[When Attacking]`. The power comparison is two steps later, at the Damage
 *    Step -- CR 7-1-4-1, "compare the power of the attacking card and the card
 *    being attacked" -- so DON!! given during the Attack Step is on the card when
 *    it counts. The gift is +1000 on the hit already declared, which is why this
 *    rule cannot simply filter on `rested`.
 *
 *    Self-selection is legal for the same reason it is unremarkable: the card is
 *    still a Character in the Character area, and the format's templating spells
 *    out an exclusion when it wants one -- "other than this Character"
 *    (OP04-005), "other than [Roronoa Zoro]" (ST21-015, in this very deck).
 *    ST21-014 says only "[printed text omitted -- pnpm card:text ST21-014]".
 *  - **A Leader that has not attacked, or an active Character** that is not
 *    summoning-sick and under no attack or rest lock.
 *
 * Ranked with `preferAmong`, so it orders the gift's own options and leaves
 * every other effect choice alone: an attack that was not viable and becomes
 * viable is a whole extra swing and outranks +1000 on one already connecting,
 * and the declared battle outranks a swing the pilot has yet to commit to.
 *
 * The offer had to learn to say what it was. A `give-rested-don` node raised by
 * the mechanic DSL reports `effectKind: "mechanic-choice"`, so nothing but the
 * summary text separated this choice from a search or a K.O. -- exactly the
 * failure `LegalAction.grants` was added for. `donGift` is that field for DON!!,
 * and it carries the printed count so the rank below prices the gift rather
 * than assuming one.
 *
 * Format scope rather than ST31's, per the widest-scope rule in
 * `.claude/skills/audit-deck-policy`: the rule names a rule of the game, four
 * cards in the pool print the clause (ST21-014, OP14-101, OP15-114 and the
 * ST21-001 Leader's `[Activate: Main]`), and the engine resolves printed text
 * whoever is holding it.
 *
 * Whether to activate the ability at all is a separate decision and a separate
 * rule: see {@link createDeadGiftActivationModule}, which runs at the
 * activation, where a clause that pays with the card printing it can still be
 * declined.
 *
 * ## Who receives the gift
 *
 * The attacker mid-battle, ahead of one that has not swung yet: +1000 on a hit
 * already declared is collected for certain, while the same DON!! on a later
 * swing can still be blocked, answered, or made irrelevant by the first
 * attack's outcome. That tie-break is load-bearing -- the reordering question
 * at {@link createAttackOrderModule} turns on it -- and the opposite
 * preference is clearly worse.
 *
 * When measuring this rule, read it on a deck that draws the card. Four cards
 * in the pool print the clause and most matchups never see one, so a
 * field-wide number is noise around a rule that is inert for almost every
 * column.
 *
 * ## Two action shapes
 *
 * The clause reaches a policy two ways. The mechanic DSL raises it as a
 * `resolve-effect` carrying `donGift`; OP15-058's is hard-coded in legal-action
 * generation instead and names its recipient in `targetInstanceId`. Both are
 * read here, because a rule that saw only the first would leave Purple Enel --
 * the one registered deck whose Leader prints the clause -- choosing by the
 * order the engine lists bodies in.
 *
 * Expect the second shape to decide little: a vassal is usually played before
 * the finisher and so listed before it, which is the target this rule would
 * choose anyway. It is read for the same reason `free-block` and the
 * `couldAttack` rung of `op16-enel` exist -- the gift it redirects is settled by
 * arithmetic rather than preference -- and so that `pnpm census` reports the
 * decision as piloted rather than silent.
 */
function restedDonGiftTarget(
  action: LegalAction,
  t: Tactics,
):
  | {
      instanceId: string;
      power: number;
      gift: number;
      canStillSwing: boolean;
      /**
       * Whether the gift is the whole of what the action does, and so whether
       * declining it on the gift alone gives up nothing else.
       *
       * False for OP15-058's activation, which also adds DON!! from the DON!!
       * deck. That ramp is worth taking even when every recipient is spent, so
       * the `never` below must not reach it -- and with a non-empty board the
       * engine offers no un-targeted variant to fall back to, so forbidding
       * every target forbids the ramp.
       */
      giftIsWholeAction: boolean;
    }
  | undefined {
  // Two action shapes carry a gift. A `give-rested-don` choice raised by the
  // mechanic DSL arrives as `resolve-effect` and names its recipient in the
  // option; OP15-058's hard-coded `[Activate: Main]` arrives as
  // `activate-main` and names it in `targetInstanceId`. Before the second was
  // read here this module was silent for Purple Enel -- the one registered deck
  // whose Leader prints the clause -- and its gift fell to whichever body the
  // engine listed first.
  const gifted =
    action.type === "resolve-effect" && action.donGift
      ? (() => {
          const option = optionCard(action);
          if (!option || option.owner !== "self") return undefined;
          return {
            instanceId: option.card.instanceId,
            power: option.currentPower ?? option.card.power ?? 0,
            gift: action.donGift.count * 1_000,
            giftIsWholeAction: true,
          };
        })()
      : action.type === "activate-main" &&
          action.donGift &&
          action.targetInstanceId !== undefined
        ? {
            instanceId: action.targetInstanceId,
            power:
              t.observation.self.board.find(
                (card) => card.instanceId === action.targetInstanceId,
              )?.currentPower ?? 0,
            gift: action.donGift.count * 1_000,
            giftIsWholeAction: action.ramps === undefined,
          }
        : undefined;
  if (!gifted) return undefined;
  const { instanceId, power, gift, giftIsWholeAction } = gifted;
  if (instanceId === t.observation.activeBattle?.attackerInstanceId) {
    return { instanceId, power, gift, canStillSwing: true, giftIsWholeAction };
  }
  // A recipient that is neither the Leader nor a body on the board is one this
  // rule has no reading of, so it abstains rather than scoring it.
  if (
    instanceId !== selfLeaderId(t.observation) &&
    !t.observation.self.board.some((card) => card.instanceId === instanceId)
  ) {
    return undefined;
  }
  // Every other recipient is asked of `couldAttack`, which is the engine's own
  // `couldAttackThisTurn`. Spelled out from the observation's fields instead,
  // this stopped at "rested", and so called a Leader on turn 2 -- a turn in
  // which neither player may battle at all -- a body with a swing to come.
  return {
    instanceId,
    power,
    gift,
    canStillSwing: t.couldAttack(instanceId),
    giftIsWholeAction,
  };
}

/**
 * Whether a rested DON!! given to any of the controller's own cards could still
 * be turned into something before the turn ends.
 *
 * Asked of an activation, where no recipient has been named yet, so it has to
 * hold for the whole board at once. Two ways a gift pays: power on an attack
 * this turn, and meeting a `[DON!! xN]` condition, which is the one use that
 * outlives the turn's own battles -- a Character whose text switches on at one
 * DON!! keeps it through the opponent's turn, where the +1000 is gone by
 * 6-5-5-2. `needsDonForAbility` cannot say whether *this* gift is enough to
 * meet the count, and answering "maybe" by declining to veto is the safe way
 * round: a gift wrongly allowed wastes a DON!! that was returning at Refresh
 * anyway, and one wrongly forbidden throws away the ability.
 *
 * Deliberately not `canCompleteDonAbility`, which is the sharper question
 * everywhere an attachment is being priced but the wrong one here: it measures
 * the shortfall against the *active* DON!! pool, and a gift is paid out of
 * rested DON!! an effect is moving. The count this asks about is one the
 * activation itself would change.
 */
function givenDonBuysNothing(t: Tactics): boolean {
  return [
    selfLeaderId(t.observation),
    ...t.observation.self.board.map((card) => card.instanceId),
  ].every(
    (instanceId) =>
      !t.couldAttack(instanceId) && !t.needsDonForAbility(instanceId),
  );
}

/**
 * The two bands {@link createRestedDonGiftModule} sorts recipients into: a body
 * with an attack left in it this turn, and one without. Ordinal, not power --
 * the gap has to survive a 10000-power body on the wrong side of it.
 */
const CANNOT_SWING = 1;

const CAN_SWING = 10;

/**
 * Do not pay for a rested DON!! nothing on the board can spend.
 *
 * {@link createRestedDonGiftModule} answers "who takes the gift", which is the
 * only question left once the ability has been activated -- and for a clause
 * that pays with the card printing it, that is one decision too late.
 * OP16-021 Moby Dick's `[Activate: Main]` is `sequence[move(source -> trash),
 * give-rested-don]`, so the Stage is in the trash before the recipient choice
 * is raised and every branch of it, `skip` included, is worth the same
 * nothing. This is that earlier decision, and it is registered on its own so
 * `pnpm deck:ab --disable dead-gift-activation` measures it apart from the
 * ranking it sits beside.
 *
 * It fires only where declining gives up nothing else:
 *
 *  - **The gift is the whole payoff.** `programRestedDonGift` reports
 *    `donGift` on the activation only for a program that is the gift plus
 *    prices; anything that also draws, ramps or removes is worth taking on the
 *    rest of it. 15 of the pool's 301 `[Activate: Main]` programs qualify.
 *  - **No recipient is named.** `targetInstanceId` set is OP15-058's
 *    hard-coded shape, where the ranking below is what should answer, and
 *    `ramps` is set there besides.
 *  - **The gift is charged for** (`priced`). Ten of those fifteen programs are
 *    a bare gift with no price, and refusing one of those is not the same
 *    claim: nothing was spent, so taking it and leaving it are both worth
 *    nothing and the rule would only be adding noise to a coin flip. The
 *    three it does reach -- OP16-021 Moby Dick and OP12-014 Boa Hancock trash
 *    themselves, ST31-005 Thousand Sunny rests itself -- are the ones where
 *    declining is strictly better.
 *  - **Nothing could convert it.** Power on an attack this turn, or a
 *    `[DON!! xN]` condition -- the one use that outlives the turn's battles.
 *
 * The board where all three hold at once is commonest on the two turns in which
 * nobody may battle -- Comprehensive Rules 6-5-6-1 bars a battle on either
 * player's first turn -- which is exactly when a 1-cost Stage is cheap enough to
 * be on the table, and when the DON!! it buys goes back to the cost area at the
 * next Refresh (6-2-3) having bought nothing.
 */
export function createDeadGiftActivationModule(): PolicyModule {
  return heuristics("dead-gift-activation", [
    never(
      "Do not pay for a rested DON!! nothing on this board can spend: the gift is all this activation buys, and no card can attack or switch on a [DON!! xN] ability this turn.",
    ).activate((action, t) => {
      if (!action.donGift) return false;
      if (action.targetInstanceId !== undefined) return false;
      if (action.ramps !== undefined) return false;
      if (action.donGift.priced !== true) return false;
      return givenDonBuysNothing(t);
    }),
  ]);
}

export function createRestedDonGiftModule(): PolicyModule {
  return heuristics("rested-don-gift", [
    never(
      "This DON!! expires at end of turn and the card it would go on cannot attack again, so the gift buys no power at all.",
    ).action((action, t) => {
      const target = restedDonGiftTarget(action, t);
      // `giftIsWholeAction`, because forbidding is only sound when the gift is
      // all the action buys. OP15-058's activation also adds DON!! from the
      // DON!! deck, and with a non-empty board every variant of it names a
      // recipient -- so vetoing the wasted gift would veto the ramp with it.
      return target?.giftIsWholeAction === true && !target.canStillSwing;
    }),

    preferAmong(
      "Give the rested DON!! where it still buys a swing: an attack it makes viable first, then the battle already declared.",
    )
      .by(WEIGHT.format)
      .action((action, t) => {
        const target = restedDonGiftTarget(action, t);
        if (!target) return false;
        // A body that cannot swing is scored rather than skipped, and this is
        // the whole reason the rule can be the only one ranking this choice.
        // `preferAmong` hides only the candidates it scored, so a recipient
        // left unscored stays in the running for whoever picks from the
        // survivors -- which, for an activation no ladder answers, is the
        // generic policy taking the first body the engine listed. Given DON!!
        // return at the controller's next Refresh Phase, so DON!! handed to a
        // body that cannot attack again this turn buys one turn of defence and
        // no offence at all: last among recipients, never absent from the list.
        if (!target.canStillSwing) return CANNOT_SWING;
        const opponentLeaderPower = t.observation.opponent.leader.currentPower;
        const unlocksAnAttack =
          target.power < opponentLeaderPower &&
          target.power + target.gift >= opponentLeaderPower;
        const attacking =
          target.instanceId === t.observation.activeBattle?.attackerInstanceId;
        // Ordinal tiers, then power as the tie-break, scaled to thousands to
        // match the other power-shaped ranks in this file. `CAN_SWING` is the
        // floor of the whole band, so the largest body that cannot attack
        // again still ranks below the smallest one that can.
        return (
          CAN_SWING +
          (unlocksAnAttack ? 100 : 0) +
          (attacking ? 10 : 0) +
          target.power / 1_000
        );
      }),
  ]);
}

/**
 * Do not pay for an activation whose every selection would find nothing.
 *
 * An "up to N" clause is legal to activate whatever the board looks like --
 * 8-4-4-1 lets a player choose 0 -- so the engine offers a `[Main]` program
 * whose only effect is a selection even when that selection has no candidate.
 * `chooseGenericRules` fires the first `activate-main` it is offered, which
 * means it pays the cost, moves the Event out of hand and resolves nothing.
 *
 * This was found five times before it was found once. Each of these is the same
 * sentence written for one card:
 *
 *  - `op13-sabo`: "Do not rest six DON!! for a K.O. with nothing in range."
 *    (deleted; this replaces it)
 *  - `op16-enel`: "Do not spend an Event with nothing on the board to answer"
 *    -- from a trace with **six Events burned on turn 2, every one of them
 *    resolving with no target**.
 *  - `op17-shanks`: "Do not pay the Leader's cost with no rested Character to
 *    freeze."
 *  - `op17-xebec`: the unblockable Event.
 *
 * That one is `dead-keyword-grant`'s to answer rather than this one's: an
 * [Unblockable] grant always finds its target, it is the *keyword* that is
 * dead.
 *
 * So it is registered at the widest scope that is true, per the audit-deck-policy
 * playbook, and the engine answers the question rather than each deck
 * re-deriving it: `selectsNothing` on the action is set when every card
 * selection the program makes comes back empty. See its doc comment in
 * `protocol` for why the engine reports this instead of withholding the action
 * -- an empty selection still pays the cost, so declining is a policy's call and
 * not a rules fact.
 *
 * ## It replaces `dead-main-event`
 *
 * {@link createDeadMainEventModule} is the sixth writing of the same rule and
 * the closest to this one: format-wide, and from the same kind of trace (an
 * OP17-097 cast into an empty board on turn 1). It answers the question by
 * *reading the printed English* -- a regex for "your opponent's Characters"
 * over the `[Main]` clause -- which bounds it in three ways this is not:
 *
 *  - it only fires when the opposing board is **entirely empty**, so it misses
 *    the commoner case of a board with nothing matching "with a cost of 6 or
 *    less";
 *  - it is Events only, so no `[Activate: Main]` on a Leader or Stage;
 *  - it can only recognise clauses aimed at opposing Characters, because that
 *    is the phrase it greps for.
 *
 * Asking the selector instead has none of those bounds and cannot drift from
 * the text, since it *is* the text as the engine compiled it. Everything
 * a printed-text rule could catch, this catches: OP17-097's "[printed text omitted -- pnpm card:text OP17-097]" is a `select` over the opposing board, which finds nothing when
 * that board is empty. One rule answers the question rather than two, because
 * two rules answering one question is how they drift.
 *
 * `never`, not `avoid`, for the reason `op16-enel` gives: ranking only narrows
 * *within* an action type, and when every remaining activation is an inert
 * Event they all tie at the same discouraged score, nothing is hidden, and the
 * generic policy fires one anyway. Forbidding is the only tier that stops it.
 * Nothing is stranded by that -- `never` removes candidates and the turn falls
 * through to the policy's own next line.
 *
 * Expect a field-wide wash and a large effect on the two decks holding the
 * cards these rules are about, which is what a rule about specific cards looks
 * like on a symmetric instrument.
 *
 * It covers what two deck rules would otherwise each state for themselves:
 * `op13-sabo`'s Kong Gun position is provably the same test, and the pair of
 * tests in `test/format-heuristics.test.ts` poses it.
 *
 * ## Reading a price
 *
 * The flag cannot be set by "every step of the program selects nothing", because
 * that misses the shape printed text actually uses -- "<price>: <payoff>", built
 * as one `sequence` with the price in front. A price step selects nothing by
 * selecting nothing at all, so the naive walk calls the whole program inert.
 * `stepIsPriceOnly` in `engine-core`'s `mechanics.ts` tells the two apart:
 * OP13-007 Ace & Sabo & Luffy activated into an empty opposing board trashes a
 * Character to give a DON!! the same decision offers for free, and that is a
 * price in front of a payoff rather than a program with nothing to find.
 *
 * Only non-selection prices are read. **OP17-020 Shanks** pays with a `choose`
 * over its own hand, so an empty *hand* makes the program non-inert for the
 * wrong reason; a price that is itself a selection is the half of the analysis
 * still outstanding.
 *
 * ## What it still does not cover
 *
 *  - **OP15-075 and the rest of Enel's Events** buff your own board, and the
 *    selector includes the Leader, so they always find a target. Enel's rule is
 *    about whether the buff is *worth* anything, which is a judgement rather
 *    than an emptiness -- and no widening of an emptiness test reaches it.
 *
 * It stands on a dominance argument rather than on a rate. What it saves is one
 * wasted activation -- a 1-cost body, a DON!! -- in a position that is rare even
 * on the decks holding the cards, which is below what a win rate can resolve.
 */
export function createInertActivationModule(): PolicyModule {
  return heuristics("inert-activation", [
    never(
      "Every selection this activation makes would find nothing: the cost is paid and the card is spent for no effect.",
    ).activate((action) => action.selectsNothing === true),
  ]);
}

/**
 * Do not pay for DON!! the DON!! deck cannot supply.
 *
 * OP09-062 Robin's Leader reads `[When Attacking]` trash 1 card with a [Trigger]
 * from your hand, add 1 rested DON!! from your DON!! deck. With all ten DON!! on
 * the field the DON!! deck is empty, so the add does nothing and the trashed
 * Counter card buys nothing -- on that attack and on every attack for the rest
 * of the game.
 *
 * This is `generic-ladder-always-applies` in its purest form: `chooseGenericRules`
 * answers a `resolve-effect` by taking the first non-`skip` option, and it
 * cannot know that this particular payoff has run out. Nothing about the clause
 * changes -- what changed is the board, ten turns in.
 *
 * ## Why this is a dominance argument and not a judgement
 *
 * `ramps` is set on the acceptance only when adding DON!! is the *whole* of what
 * accepting buys (see `donAddedByOptionalPayoff`), and `cost` only when
 * accepting pays something. With the DON!! deck at zero, accepting therefore
 * pays a real price for an effect that provably cannot happen; declining pays
 * nothing and leaves the same board. There is no board state in which accepting
 * is worth more.
 *
 * The scan that check requires, since "provably free" has to be checked rather
 * than asserted: the engine's only DON!!-keyed reactions are
 * `ON_DON_RETURNED_REACTIONS` in `don.ts` (OP17-062 Kaido, OP14-068 Trebol),
 * and both fire on DON!! *returned to the deck*, never on DON!! added. So an
 * add that adds nothing cannot be the trigger for something else either. The
 * one adjacent shape -- clauses that *count* the DON!! on the field -- is
 * unaffected, because a failed add changes that count by zero whether it is
 * attempted or not.
 *
 * `never`, not `avoid`, for `inert-activation`'s reason: ranking narrows only
 * within an action type, and the `skip` this steers towards is the same type, so
 * a discouraged `apply` would still tie and still be taken.
 *
 * ## Reach
 *
 * **Five** optionals in the pool have DON!! out of the DON!! deck as their whole
 * payoff -- OP05-077 (no cost, so out of reach of this rule and rightly so),
 * OP09-062, OP09-076, OP10-071 and OP10-077 -- and exactly one of them is in a
 * shipped deck: OP09-062, as Robin's Leader. So this
 * is registered format-wide because the claim is true format-wide, and can
 * only be measured on the one deck that can see it.
 *
 * That deck feels it out of proportion to how narrow the rule is. The DON!!
 * deck starts at nine and empties around turn six, and this Leader attacks
 * every turn from turn three, so the veto fires several times a game -- and
 * several Counter cards a game is not a rounding error in a deck whose Life
 * total is four.
 */
export function createDeadRampModule(): PolicyModule {
  return heuristics("dead-ramp", [
    never(
      "The DON!! deck is empty, so this clause adds no DON!! at all and accepting only pays its cost.",
    ).effect((action, t) => {
      // Both halves are required. `ramps` says the payoff is nothing but
      // DON!! out of the DON!! deck; `cost` says accepting is not free. An
      // acceptance that pays nothing is a no-op either way and is left alone,
      // which also guarantees `skip` -- which carries neither field -- always
      // survives.
      if (action.ramps === undefined || action.cost === undefined) {
        return false;
      }
      // A `DON!! -N` cost *refills* the DON!! deck: `returnDonToDeck` pushes
      // the returned cards back onto it, so the clause can be a legitimate
      // swap of N DON!! on the field for one active DON!! even with the deck
      // empty at the moment of the offer. OP09-076 is exactly that card, and
      // reading `donDeckCount` alone vetoed it wrongly. Resting DON!! moves
      // nothing to the deck, so `restsDon` is not netted off.
      return (
        t.observation.self.donDeckCount + (action.cost.returnsDon ?? 0) === 0
      );
    }),
  ]);
}

/**
 * The DON!! a turn is about to draw anyway, bought a second time.
 *
 * `dead-ramp` answers the DON!! deck at zero. This answers the deck at one or
 * two, where the add still succeeds and still buys nothing, because next turn's
 * draw was going to fetch those same cards.
 *
 * The position is `open-optcg-trace(9).jsonl` turn 7: OP09-062 Robin's Leader
 * attacking with `activeDon: 0`, `restedDon: 9`, `donDeckCount: 1`. Accepting
 * trashed a 1000-Counter OP17-114 Sweet 3 Generals to move the last DON!! card
 * out of the deck and onto the field **rested**. The seat's next Main Phase
 * would have drawn it regardless, and it arrives active either way.
 *
 * ## The arithmetic
 *
 * Write `F` for the DON!! on the field, `D` for the DON!! deck, `A` for what
 * this clause adds and `{@link DON_DRAWN_PER_TURN}` for the turn's draw. The
 * field the seat next spends from is
 *
 * - declining: `F + min(DRAW, D)`
 * - accepting: `F + A + min(DRAW, D - A)`
 *
 * With `D <= DRAW` both are `F + D`: the deck runs out inside the draw either
 * way, so every card in it is on the field next turn whether this pays for it
 * or not. With `D > DRAW` accepting is `F + A + DRAW` against `F + DRAW`, a
 * real turn of acceleration, and the rule is silent. The threshold is exactly
 * the draw, and it does not depend on `A`.
 *
 * ## Why rested is the whole of it
 *
 * Only for a *rested* add. Active DON!! is spendable on the turn it arrives, so
 * a clause that adds it is buying a turn of tempo the draw cannot give back;
 * `ramps.active > 0` leaves this rule. Rested DON!! cannot pay a cost this turn
 * and cannot pay a Counter on the opponent's, and the Refresh Phase sets it
 * active at the same moment it would have set the drawn card active. Between
 * the two there is nothing it can do.
 *
 * ## What accepting still changes
 *
 * Not quite `dead-ramp`'s dominance, and the difference is worth stating: there
 * the add provably did not happen, so the field count was identical either way.
 * Here it does happen, and the field carries one more DON!! until the next
 * Refresh. Two families of printed text can read that, and neither is a reason
 * to pay a card for it.
 *
 *  - `field-don` and `field-don-versus` gates, which count DON!! on a field.
 *    **None of the sixteen card numbers in the one shipped deck that reaches
 *    this decision print either**, over every program
 *    `mechanicProgramsByClause` registers. An opponent's `field-don-versus`
 *    clause does read this seat's count, and moving it up helps and hurts in
 *    equal measure.
 *  - Trashing is itself a payoff for OP17-102 Charlotte Oven, whose `[On K.O.]`
 *    plays a 4000-power-or-less Character back out of the trash. Stocking that
 *    deliberately is foreclosed here, and cannot be told apart at this
 *    decision: the card the clause charges is chosen one decision later, so a
 *    fed Oven and a spent Counter look the same from here.
 *
 * Against both: the payoff is *zero*, and the price is a card a four-Life deck
 * Counters with.
 *
 * ## Reach
 *
 * `donAddedByOptionalPayoff` answers two programs in the whole pool with a
 * *rested* add as the whole payoff: OP05-073 Zala's `[On Play]` and OP09-062's
 * `[When Attacking]`, and only the second is in a shipped deck. Registered
 * format-wide anyway, for the reason `dead-ramp` is: what the clause buys is a
 * fact about the DON!! deck, not about the deck that plays it.
 *
 * `never`, not `avoid`, for the same reason the siblings give: ranking narrows
 * within an action type, and the `skip` this steers towards is the same type,
 * so a discouraged `apply` would still tie and still be taken.
 */
export function createCappedRampModule(): PolicyModule {
  return heuristics("capped-ramp", [
    never(
      "Next turn's DON!! draw empties the DON!! deck anyway, so this rested DON!! is already coming and accepting only pays its cost.",
    ).effect((action, t) => {
      // Same pair `dead-ramp` requires: `ramps` says the payoff is nothing but
      // DON!! out of the DON!! deck, `cost` says accepting is not free.
      if (action.ramps === undefined || action.cost === undefined) return false;
      if (action.ramps.active > 0 || action.ramps.rested === 0) return false;
      // A `DON!! -N` cost pushes its DON!! back onto the deck through
      // `returnDonToDeck`, so the deck this clause draws from is the one it
      // has just refilled.
      const donDeck =
        t.observation.self.donDeckCount + (action.cost.returnsDon ?? 0);
      // An empty deck is `dead-ramp`'s range, and its reason is the accurate
      // one there -- the add does not happen at all. Leaving zero out keeps
      // each veto attributable to the rule whose argument it is.
      return donDeck > 0 && donDeck <= DON_DRAWN_PER_TURN;
    }),
  ]);
}

/**
 * `dead-ramp`'s sibling one zone over: do not flip a [Trigger] whose only
 * payoff is DON!! out of a DON!! deck that has run out.
 *
 * OP05-077 Gamma Knife's [Trigger] is "add 1 DON!! from your DON!! deck, set as
 * active". Flipped off Life with the DON!! deck at zero it adds nothing, and the
 * card it spends is a 2-cost Event giving an opposing Character −5000 -- which
 * declining would have put in hand instead.
 *
 * ## Why `dead-ramp` cannot see it
 *
 * That rule requires both `ramps` and `cost` on a `resolve-effect`, and the
 * `cost` half is what excludes this: a free acceptance was reasoned to be a
 * no-op either way. That is true of a `[Main]` activation and false of a
 * [Trigger], because a [Trigger] is not free. Activating sends the card to the
 * trash and reveals it; declining puts the same card in hand. The price is the
 * card, and it is not written in the program.
 *
 * It is also asked one decision too late. `optional(add-don)` raises its
 * `resolve-effect` only after the Trigger has been activated and the card has
 * left the Life area, so by then both branches are worth the same nothing.
 * The decision worth having is the `resolve-trigger` above it, which is why
 * the engine reports `ramps` there too.
 *
 * ## Why this is a dominance argument and not a judgement
 *
 * `ramps` is set only when adding DON!! is the *whole* of what activating buys
 * (`donAddedByOptionalPayoff`), so declining cannot throw away a draw or a
 * K.O. in the same program. With the DON!! deck at zero the add provably
 * cannot happen, and `skip` reaches the same board with the card in hand. No
 * board state prices activating higher.
 *
 * The two scans that "provably free" requires were run by the siblings this
 * follows and hold here unchanged: the engine's only DON!!-keyed reactions are
 * `ON_DON_RETURNED_REACTIONS` in `don.ts` and both fire on DON!! *returned*,
 * never on DON!! added; and the one clause that reads an activation itself,
 * "when a [Trigger] activates" (OP13-106 Conney), is printed by 28 cards of
 * which none appears in a selectable deck. A `DON!! -N` cost refills the DON!!
 * deck through `returnDonToDeck` and would make the swap legitimate at
 * `donDeckCount === 0` -- no [Trigger] in the pool pays one, and the netting is
 * written out anyway so the gate stays true if one arrives.
 *
 * `never`, not `avoid`, for `inert-trigger`'s reason: ranking narrows within an
 * action type, and the `skip` this steers towards is the same type, so a
 * discouraged `activate` would still tie and still be taken.
 */
export function createDeadRampTriggerModule(): PolicyModule {
  return heuristics("dead-ramp-trigger", [
    never(
      "The DON!! deck is empty, so this Trigger adds no DON!! at all and activating it trashes the card that declining keeps in hand.",
    ).trigger((action, t) => {
      // `skip` is the option this rule steers towards, and it carries no
      // `ramps`; the guard states that rather than relying on it.
      if (action.optionId === "skip") return false;
      if (action.ramps === undefined) return false;
      return t.observation.self.donDeckCount === 0;
    }),
  ]);
}

/**
 * The widest K.O. a single turn's DON!! is allowed to buy, in DON!! cards.
 *
 * A gap this rule closes is paid twice: once in the DON!! that goes under the
 * body instead of under the Leader, and again in the Counter the defender
 * spends to undo it. Reaching a body's power exactly leaves the K.O. one
 * Counter card short of failing whatever the gap was, so a wide reach buys the
 * same fragile K.O. as a narrow one at several times the price -- and the DON!!
 * it spends came off a Leader swing the defender also has to answer.
 */
const MAX_KO_REACH = 2;

/**
 * The DON!! a body still needs to arm itself with its first K.O., or undefined
 * when it already has one or none is within this turn's reach.
 *
 * Counted in DON!! cards rather than power because that is what the decision
 * spends. A battle is won on the tie (CR 7-2-2-1), so reaching the target's
 * power exactly is a K.O. and the shortfall rounds up in thousands.
 *
 * A body that already beats some target is not a candidate, and that is the
 * whole shape of the rule rather than a detail of it. Each unit gets one
 * attack, so the second DON!! under a body that can already K.O. something
 * does not buy a second K.O. -- it upgrades the one attack that body was
 * always going to make to a bigger target, which is the trade
 * {@link MAX_KO_REACH} is capped against. Without this the rule walks a single
 * body up the opposing board, spending four DON!! on one attack while the
 * other bodies stay at printed power with nothing they can beat.
 */
function donToArmAKo(instanceId: string, t: Tactics): number | undefined {
  const power = t.ownCurrentPower(instanceId);
  if (power === undefined) return undefined;
  let best: number | undefined;
  for (const target of t.observation.opponent.board) {
    if (!isWorthRemoving(target, t)) continue;
    const shortfall = target.currentPower - power;
    if (shortfall <= 0) return undefined;
    const needed = Math.ceil(shortfall / DON_POWER);
    if (needed > MAX_KO_REACH || needed > t.don) continue;
    if (best === undefined || needed < best) best = needed;
  }
  return best;
}

/**
 * Where the turn's DON!! goes while a K.O. is one or two DON!! away.
 *
 * The ladder attaches after plays and activations and has no opinion about the
 * recipient, so `chooseGenericRules` takes the first attachment the engine
 * offers -- which is the Leader, every time, for every deck. A seat with nine
 * spare DON!! therefore swings its Leader at 14000 into a 6000 body and leaves
 * four Characters at printed power with nothing to attack, when one DON!! on
 * one of them and two on another would have taken two Characters off the board
 * and still left six for the Leader.
 *
 * What makes the swap pay is that power buys K.O.s in steps, not continuously.
 * The eleventh thousand of a Leader's attack buys nothing the tenth did not --
 * {@link Tactics.counterCardsNeeded} is the same past the point where the
 * defender is already out of cards -- while the thousand that lifts a 4000 body
 * onto a 5000 target converts an attack that cannot win into one that K.O.s.
 * So the first DON!! that completes a K.O. is worth strictly more than the last
 * DON!! on a Leader that is already past the defender's Counter, and this
 * prefers the cheapest such completion so the turn buys as many of them as its
 * DON!! allows.
 *
 * Scored by how little is still owed, so the rule empties the cheapest K.O.
 * first and then goes quiet for that body -- the next attachment is judged
 * fresh against whichever body is still unarmed. When nothing is within
 * {@link MAX_KO_REACH}, or every body that was has reached a target, no
 * attachment scores and the Leader gets the DON!! as before.
 *
 * It ranks rather than vetoes the Leader because the two are the same action
 * type, and the rule's claim is a comparison between recipients rather than a
 * judgement that powering up the Leader is wrong.
 *
 * Paired with `threat-removal`, which is what aims the attack the DON!! is
 * bought for: both read {@link isWorthRemoving}, so the DON!! can only go to a
 * K.O. the attack rules will take.
 */
export function createKoReachAttachmentModule(): PolicyModule {
  return heuristics("ko-reach-attachment", [
    prefer(
      "Attach the DON!! to the Character closest to K.O.ing a rested opposing body: a thousand that completes a K.O. beats a thousand on a Leader swing that already connects.",
    )
      .when((t) => t.observation.phase === "main")
      .attachDon((action, t) => {
        // The Leader is the recipient this rule exists to divert from, and it
        // attacks once: a K.O. it can reach is one `threat-removal` already
        // aims it at without any attachment.
        if (action.targetInstanceId === selfLeaderId(t.observation))
          return false;
        if (!t.couldAttack(action.targetInstanceId)) return false;
        const needed = donToArmAKo(action.targetInstanceId, t);
        if (needed === undefined) return false;
        // Cheapest completion first, and every scored candidate stays above the
        // unscored Leader.
        return MAX_KO_REACH + 1 - needed;
      }),
  ]);
}
