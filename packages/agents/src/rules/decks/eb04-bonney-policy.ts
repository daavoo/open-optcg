import { AREA_REPLACEMENT_KINDS } from "../format-heuristics.js";
import { optionCard } from "../generic-policy.js";
import { avoid, heuristics, never } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * What this deck's engine is, in one paragraph, because every rule below
 * follows from it.
 *
 * Every other deck in the field protects its Life. This one spends it. The
 * Leader reads "[Opponent's Turn] If you have 1 or less Life cards, this
 * Leader gains +2000 power", and its "[Activate: Main] [Once Per Turn]" half
 * trades a Life card for a card in hand only "if you have 2 or more Life
 * cards" -- so the two printed clauses share one threshold from opposite
 * sides, the trade stops at 1 and the +2000 switches on there. Below that
 * floor the list pays the Life back: EB04-054 Kuma and EB04-058 Borsalino each
 * bank a card from the deck onto Life on play "if you have 2 or less Life
 * cards", OP12-119 Kuma buys one for a card from hand, and EB04-052 Sanji's
 * `[On K.O.]` replaces itself at 2 or less. At 1 or less the payoffs turn on:
 * the Leader defends at 7000, EB04-061 costs nine instead of ten, and
 * OP07-107 Franky's `[Trigger]` -- four copies, plus eight more triggers in
 * OP13-108 and OP07-114 -- plays itself off the Life card the hit just moved.
 *
 * So Life here is a resource with a floor at 1, and a Leader hit taken is a
 * card into hand, a step toward a 7000 Leader, and a chance at a free body.
 * That is the opposite of what `chooseGenericCounter` assumes, which is why
 * the defensive rule below exists.
 */

/**
 * The two searchers in `packages/decks/src/eb04-bonney-manifest.ts`, and the
 * whole of what this deck can do before turn 3.
 *
 * EB04-002 Jewelry Bonney digs four for an {Egghead} or {Straw Hat Crew} card;
 * OP07-114 digs five for an {Egghead} one, and 46 of the 50 slots carry that
 * type. Eight cards, both costing 1.
 *
 * EB04-056 Pacifista is the deck's third cheap card and deliberately not here.
 * It is a 1-cost 1000-power body whose only text is a [Blocker] that switches on
 * at exactly 0 Life -- on turn 1 it is a blank, and holding a hand for it keeps
 * openings that dig for nothing.
 */
const BONNEY_SEARCHERS: ReadonlySet<string> = new Set(["EB04-002", "OP07-114"]);

/** EB04-056 Pacifista, the four-card wall {@link createEb04BonneyWallModule} keeps. */
const PACIFISTA = "EB04-056";

/**
 * What one Pacifista is worth on the turn its [Blocker] is about to switch on,
 * in thousands. The same figure `replacement-blocker` pays for a block already
 * available, because it is the same block one turn early.
 */
const WALL_WORTH_IN_THOUSANDS = 4;

/**
 * The opening hand, by the deck tech's own advice: "prioritize searchers
 * (Jewelry Bonney EB04-002, Lilith, Sanji) for consistency early". Bandai's 50
 * plays two of those three names, plus OP07-114 in the same role.
 *
 * The list is top-heavy in a way no other deck in this repo is -- two 7-drops, a
 * 9 and a 10 -- and it has no ramp, so what an opening hand is for is finding
 * them. Only twelve of the fifty cost 2 or less, which is the tightest cheap
 * slot in the field after OP17-039 Xebec's, and four of those twelve are the
 * Pacifista that does nothing on turn 1.
 *
 * `mulligan.ts` records what separates the decks a keep predicate pays on:
 * what the cheap slot is made of, not how big it is. This deck's is 8 cards
 * that dig and 4 that are blank until 0 Life, which is the Xebec shape rather
 * than the Black Luffy one -- a cost bound here keeps hands whose only cheap
 * card cannot act.
 *
 * The effect is small and needs a large arm to see:
 * `pnpm deck:ab --deck "(Red/Yellow) Jewelry Bonney - Official Feature Deck"
 * --disable eb04-bonney-mulligan --seeds 250`. Worth naming what it costs to
 * buy: the rule ships a large share of opening hands, which is a big instrument
 * for a small effect. The untried direction is a *loosening* -- keeping on any
 * card the first two turns can actually play, rather than on a searcher
 * specifically. `mulligan.ts` records that a loosening is the one shape a cost
 * bound cannot express.
 */
export function createEb04BonneyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "eb04-bonney-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) =>
        BONNEY_SEARCHERS.has(card.cardNumber),
      ),
    keepBecause:
      "Keep a hand with a 1-cost searcher: it plays on turn 1 and digs for the top end this list has no other way to find.",
    mulliganBecause:
      "Mulligan a hand with no searcher: the deck has no ramp, and its other cheap card is a Pacifista that is blank until 0 Life.",
  });
}

/**
 * Do not spend a Counter card on a Leader hit while there are 2 or more Life
 * cards. Take the Life instead.
 *
 * Bandai's own feature-deck page for this list -- the source
 * `eb04-bonney-manifest.ts` is transcribed from -- states the rule as a
 * sequencing instruction: "Focus on gathering Counters in your hand, instead
 * of needlessly defending against your opponent's attacks, until your Life
 * cards become 1 or less." The same page prices the alternative: the Leader's
 * 7000 on defence at 1 Life is more efficient than paying its Counter
 * arithmetic at 5000. Both halves are the printed text quoted in the engine
 * paragraph at the top of this file.
 *
 * `chooseGenericCounter` asserts the opposite, and not by accident:
 * `mustPreventCurrentLeaderHit` widens its horizon to `nextTurnLeaderDamage`
 * once the defender is at 2 Life or less, so against any developed board every
 * Leader hit at 2 Life reads "must prevent" and the seat pays. That is the
 * right default for twenty-five decks whose Life is a buffer. For this one the
 * Life is the resource the Leader converts, and the hit the policy was paying
 * to stop is the one that turns the Leader into a 7000 the same attack can no
 * longer beat.
 *
 * Unguarded, the seat holds at 2 Life and spends its whole hand of Counter cards
 * never leaving it, ending the turn empty against a board of 6000s that a 7000
 * Leader would have bounced for free. `pnpm census --deck "(Red/Yellow) Jewelry
 * Bonney - Official Feature Deck"` shows why nothing else catches it:
 * `counter:counter` is this deck's largest fully unpiloted surface.
 *
 * ## The floor is the safety property, not a lethality test
 *
 * The rule never spends the last Life card: it stops at `selfLife < 2`, and
 * it prices the hit in front of it with `battle.lifeCost` rather than at 1, so
 * a [Double Attack] at 2 Life is defended like any other lethal hit. Below the
 * floor `chooseGenericCounter` is in charge again, defending a Leader that by
 * then reads 7000 -- which is the printed threshold doing the work from the
 * other side.
 *
 * `facingLethal` is deliberately *not* the gate, though it is the obvious one
 * to reach for. It is true whenever the turn's remaining attacks would empty
 * the Life stack, which at 2 Life against two attackers is exactly the
 * position the trace shows and exactly where the rule is meant to fire --
 * gating on it would leave the rule silent in its own motivating case. The
 * floor is the stronger invariant anyway: a rule that cannot take the last
 * Life card cannot lose the game by declining.
 *
 * ## Scope
 *
 * Deck-scoped, and section 6 of the audit playbook is the reason it is not
 * wider. The property it names is "my Leader is stronger, and my bodies pay
 * out, at a lower Life total than I am at" -- a fact about this deck's own
 * printed text, which `Tactics` has no primitive for: it exposes `selfLife`
 * and `facingLethal`, but nothing that prices the defender's Leader at a Life
 * total it has not reached yet. A derived "Leader power at N Life" field would
 * let this be an `EVERY_DECK` rule gated on the Leader gaining power below its
 * current Life, and OP17-039 Xebec and OP13-108's own low-Life clauses are the
 * candidates that would then inherit it. Until that field exists, widening
 * this by hand would mean re-deriving static-ability arithmetic in the policy,
 * which is the drift `tactics.ts` exists to prevent.
 *
 * A `never` rather than a `rank`: the choice it overrides is whether to Counter
 * at all, and `rank` only reorders candidates of one kind -- it cannot promote
 * `pass` over a Counter card. `counter-budget` in `format-heuristics.ts` is the
 * same shape for the same reason, and this rule is its price taken to the floor
 * for one deck: that module caps a non-lethal Leader hit at two cards on the
 * argument that a Life taken becomes a card in hand, and here the Life taken is
 * worth strictly more than that.
 *
 * The deck holds no [Counter] Event -- all thirteen slots are Characters and
 * one searcher Event with no Counter half -- so vetoing `counter` covers the
 * whole of this deck's Counter surface, and there is nothing to reserve.
 *
 * Read the per-matchup rows when pricing this, not the total. The rule only
 * pays when someone is attacking the Leader, so the field should sort that
 * way -- the decks that race this one hardest at the top, and the ones that
 * barely attack the Leader flat or slightly negative. Rows that contradicted
 * that story would be reason to distrust the rule however large its total
 * (the audit playbook's "prefer the mechanism you can state").
 *
 * Worth naming what it does *not* buy. The rule declines Counter; it does not
 * teach the deck to use the Blocker it declines with. `counter-over-dying-
 * block` in `format-heuristics.ts` passes a block whose Blocker dies to the
 * attack whenever the hand can pay instead, and prices "dies" from board
 * power alone -- so a 6000 Borsalino in front of a 6000 attack reads as dead
 * when a single 1000-Counter card would make it a 7000 that survives. The
 * same trace this rule was read off shows that four times in one turn. That
 * is a separate, format-wide mispricing, measured on its own.
 */
export function createEb04BonneyLifeFloorModule(): PolicyModule {
  return heuristics("eb04-bonney-life-floor", [
    never(
      "Take the Life rather than Counter: this Leader gains +2000 at 1 Life and the list pays the Life back.",
    )
      .when((t) => {
        const battle = t.observation.activeBattle;
        if (!battle?.targetInstanceId.endsWith("-leader")) return false;
        // At the floor the trade is over: the +2000 is already switched on and
        // there is no Life card left to spend.
        if (t.selfLife < 2) return false;
        // `lifeCost` rather than 1, so a [Double Attack] at 2 Life is not
        // declined into an empty Life stack.
        if (t.selfLife - battle.lifeCost < 1) return false;
        // A hit that already fails to connect costs no Life, so there is
        // nothing here to prefer over a Counter card.
        return battle.attackPower >= battle.targetPower + battle.counterPower;
      })
      .counter(() => true),
  ]);
}

/**
 * Do not give up a body to stop a Leader hit this deck is trying to take.
 *
 * The block half of {@link createEb04BonneyLifeFloorModule}'s doctrine, and it
 * exists because that rule leaves the block window resting on a promise it then
 * breaks. `counter-over-dying-block` in `format-heuristics.ts` passes a
 * block whose Blocker dies to the attack *on the strength of* a Counter line
 * the hand can pay, and it checks that the Counter window will honour the line
 * by reading the same `leaderCounterBudget`. The life-floor rule vetoes that
 * line without going through that helper, so for this deck the block window
 * now declines with the reason "the hand holds the Counter power to stop it
 * instead" while the Counter window spends nothing.
 *
 * That is the false-promise shape the shared budget was introduced to remove:
 * two windows, one resource, and a promise made in the first only real if the
 * second honours it. Here the *outcome* is the one this deck wants -- take the
 * Life -- so nothing looks wrong from the outside, and that is precisely the
 * risk: what the life floor is worth would be partly held up by a stale
 * promise, and a later repair of `counter-over-dying-block` would hand this
 * deck back the dying block without anything failing.
 *
 * So the block is declined here, by the deck, for the deck's own reason. What
 * makes the trade wrong is not that the Blocker dies -- it is that the thing
 * bought by dying is a Life card this list is spending on purpose, and one
 * that arrives in hand on the way past.
 *
 * ## Only the dying block
 *
 * `createFreeBlockModule` blocks when the Blocker strictly outpowers the
 * attack *and* no further Leader attack can land this turn, and it costs no
 * deck in the format anything.
 * A block like that absorbs the hit and keeps the body, so it is not a Life-
 * for-body trade at all and this rule must not reach it: the veto is gated on
 * the offered Blocker failing to survive, which leaves every surviving block in
 * the running. `EB04-058 Borsalino` at 6000 in front of a 5000 attack is the
 * case that has to keep working.
 *
 * Redirects are excluded for a different reason: a redirect moves the attack
 * onto another card rather than resting a Blocker, so the cost is a second body
 * and not this deck's Blocker at all. This deck fields no redirect, so the
 * clause is a guard rather than a behaviour.
 *
 * ## Expect it to change nothing
 *
 * That is the whole argument for the rule's shape. The positions it can bite in
 * are the ones `counter-over-dying-block` does *not* already pass for its own
 * reason -- a hand that cannot pay the shortfall, or a line over budget -- and
 * in rules-versus-rules play those are rare. `pnpm census` confirms it is not
 * merely unreachable: the rule is absent from `silentModules`, and the deck's
 * `block:block` surface moves from 71.7% to 67.4% "no rule at all" with it
 * registered.
 *
 * So this ships on a dominance argument rather than a win, which is
 * the same footing `createFreeBlockModule` is kept on. Two things it buys that
 * a win rate cannot show:
 *
 *  - **The life floor above stops depending on a stale promise.** Without
 *    this rule the block window declines only because another module believes a
 *    Counter line is coming, and that belief is now false for this deck.
 *  - **It is the prerequisite for repairing that module.** Teaching
 *    `counter-over-dying-block` to read a deck's Counter vetoes -- the honest
 *    fix -- would otherwise hand this deck back the dying block at 2 Life and
 *    give away part of the life floor's gain. With the decline stated here, the
 *    repair is safe to make.
 *
 * If this rule ever measures materially negative, that means the dying block
 * was worth taking after all -- which would contradict the Leader's printed
 * text, so check the block window before believing it.
 */
export function createEb04BonneyDyingBlockModule(): PolicyModule {
  return heuristics("eb04-bonney-dying-block", [
    never(
      "Give up the Life rather than the body: this deck is spending Life on purpose, and a Blocker that dies here buys the one resource it wants to lose.",
    )
      .when((t) => {
        const battle = t.observation.activeBattle;
        if (!battle?.targetInstanceId.endsWith("-leader")) return false;
        if (t.selfLife < 2) return false;
        if (t.selfLife - battle.lifeCost < 1) return false;
        return battle.attackPower >= battle.targetPower + battle.counterPower;
      })
      .block((action, t) => {
        const battle = t.observation.activeBattle;
        if (!battle) return false;
        const blocker = t.observation.self.board.find(
          (card) => card.instanceId === action.blockerInstanceId,
        );
        // A Blocker the attack cannot beat is `free-block`'s case, not this
        // one: it keeps the body and the Life both. Ties go to the defender's
        // K.O., so surviving needs strictly more power.
        return (blocker?.currentPower ?? 0) <= battle.attackPower;
      }),
  ]);
}

/**
 * Do not tear down the wall to make room, while the wall is one hit from
 * switching on.
 *
 * EB04-056 Pacifista is a 1-cost 1000-power body whose only printed text is a
 * [Blocker] that turns on at *exactly* 0 Life, and the list runs four of them.
 * That is the deck's last-ditch wall: four bodies to soak four attacks on the
 * turn it would otherwise lose, and the reason the mulligan rule above calls
 * them blank rather than cheap.
 *
 * Both shared rules that price a body for the area limit read it as a 1000,
 * and each is right by its own terms:
 *
 *  - `replacement-blocker` credits a block that is *available*, which at 1 Life
 *    this is not -- `blocker` is false until the Life stack empties. That gate
 *    is what stops that rule reading as "never trash a Blocker", so it must not
 *    be loosened for this card.
 *  - `area-replacement-choice` then scores the body at its power and adds a
 *    point for a duplicated name, on the argument that a second copy of a name
 *    is worth less than the first. For a card whose whole function is to be
 *    four of a kind that argument is inverted: the fourth Pacifista is the
 *    fourth attack the wall absorbs.
 *
 * What neither can see is that the block is one Life card away rather than
 * unavailable. The hit that takes this deck to 0 lands *during* the opponent's
 * attack step, so the Pacifista stand up as Blockers for the remaining attacks
 * of the very turn that switched them on -- which is the turn the deck is
 * playing toward. `conditionalKeywords` says the card prints a [Blocker] it can
 * switch on and does not say what switches it, so a format rule reading that
 * field would credit every conditional keyword whether or not its gate is
 * reachable. This deck knows its own card, which is why the rule is keyed to
 * the number and scoped here.
 *
 * Gated at 1 Life rather than 2: at 2 the wall is two hits away and a Pacifista
 * really is the least of the board. The credit matches the one
 * `replacement-blocker` pays for a block in hand, because what is being priced
 * is the same block, one turn early.
 */
export function createEb04BonneyWallModule(): PolicyModule {
  return heuristics("eb04-bonney-wall", [
    avoid(
      "Keep the Pacifista: at 1 Life its [Blocker] is one hit from switching on, and the deck runs four of them for that turn.",
    )
      .when((t) => t.selfLife <= 1)
      .effect((action) => {
        if (!AREA_REPLACEMENT_KINDS.includes(action.effectKind)) return false;
        const option = optionCard(action);
        if (!option || option.owner !== "self" || option.zone !== "board") {
          return false;
        }
        if (option.card.cardNumber !== PACIFISTA) return false;
        return WALL_WORTH_IN_THOUSANDS;
      }),
  ]);
}
