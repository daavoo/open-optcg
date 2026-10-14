import type { GameObservation } from "@one-piece-sim/protocol";
import type { PolicyModule } from "../policy-module.js";
import type { Tactics } from "../tactics.js";
import { createMulliganModule } from "../mulligan.js";
import { heuristicModules, never, WEIGHT } from "../heuristics.js";

/**
 * ## The deck's engine, in one paragraph
 *
 * Nine of ST-18's fifteen identities read "if you have 8 or more DON!! cards
 * on your field", and below that line most of them are vanilla bodies. Eight
 * DON!! is turn eight on the natural curve, and OP05-060 is how the deck gets
 * there sooner: "[Activate: Main] [Once Per Turn] You may add 1 card from the
 * top of your Life cards to your hand: If you have 0 or 3 or more DON!! cards
 * on your field, add up to 1 DON!! card from your DON!! deck and set it as
 * active." A Life card, every turn from turn two, for a DON!! that can be
 * spent the same turn.
 *
 * ## Sources
 *
 * There is no piloting write-up for this list: ST-18 is a precon with no
 * tournament record, and Bandai publishes no feature-deck page for OP05-060
 * the way it does for the ST-26 Leader. Everything here is read off the fifty
 * and off the printed text.
 */

/**
 * The opening hand: keep on anything castable by turn three.
 *
 * This is a *loosening* of the generic keep, which is `anyEarlyPlay` -- any
 * card costing 2 or less. Two facts about this fifty argue for it. Only eight
 * cards clear that bound, four OP05-076 and four OP05-068, so the generic rule
 * ships about two hands in five; and the deck does not need a turn-two play
 * the way a 2-cost bound assumes, because the thing it most wants to be doing
 * on turn two is the Leader's activation, which costs no card at all. What it
 * cannot afford is a hand whose cheapest card is a 4-drop, and the ten 3-cost
 * bodies -- four OP05-061, four OP05-067, two ST18-001 -- are the difference
 * between those two readings.
 *
 * `cost` and not "is a Character": the 1-cost card the bound keeps is
 * OP05-076, a [Main] search that is a perfectly good turn-one play, so the
 * inert-cheap-card problem `mulligan.ts` warns about does not arise here.
 *
 * A mulligan is a free redraw, so a keep is worth only the gap between the
 * hands it keeps and a fresh random five. On a deck with no searcher that gap
 * is small, and this rule is here because it states the deck's curve
 * correctly, not because the decision is worth much. Price it with
 * `pnpm deck:ab --deck "(Purple) Monkey.D.Luffy - Starter Deck 18" --disable
 * st18-luffy-mulligan --seeds 100`.
 */
export function createSt18LuffyMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "st18-luffy-mulligan",
    keep: (observation: GameObservation) =>
      observation.self.hand.some((card) => card.cost <= 3),
    keepBecause:
      "Keep a hand with a card castable by turn three: the Leader's Life-for-DON!! activation covers turn two on its own, and this deck's cheap slot is only eight cards deep.",
    mulliganBecause:
      "Mulligan a hand whose cheapest card is a 4-drop: the deck has no searcher, so a top-heavy opener stays top-heavy while the Leader is spending Life to reach eight DON!!.",
  });
}

/**
 * Do not pay the Leader's last Life card for a DON!!.
 *
 * OP05-060's activation is the deck's engine and it is almost always right to
 * take: a Life card becomes a card in hand *and* an active DON!!, which is a
 * profit on cards and on tempo at once. The one state where it is not is the
 * bottom of the Life stack, and there the arithmetic inverts completely.
 *
 * A battle wins by being declared against a player who is already on 0 Life.
 * At 1 Life a connected Leader hit takes the last card and the game continues;
 * at 0 Life the same hit ends it. So the last activation does not cost a Life
 * card, it costs *the turn the deck would have survived* -- and this deck has
 * no way to put a card back on its Life. It is the one purchase whose price is
 * the game rather than a resource.
 *
 * A `never` rather than an `avoid`: the activation is free, so any ranking
 * against it loses to the first rule that likes it, and there is no price at
 * which the trade is correct. The deck policy simply never sees the action and
 * falls through to its own next line, which is developing the board it will
 * need to survive.
 *
 * Gated on the source, not merely on the registration: every activation this
 * deck can make today is the Leader's, and a card added to the list later that
 * activates for something else should not inherit a Life floor written about
 * OP05-060's cost.
 */
const keepTheLastLifeCard = never(
  "Do not trade the last Life card for a DON!!: at 0 Life the next Leader hit wins, and this deck cannot put a card back",
)
  .as("last-life-card")
  .by(WEIGHT.deck)
  .when((t) => t.selfLife <= 1)
  .activate((action) => action.sourceCardNumber === "OP05-060");

/**
 * The Leader's ramp is on offer, and this turn has not spent its DON!! yet.
 *
 * `strategy/ramp.ts`'s `free-ramp-first` already vetoes a play while an
 * untargeted ramp is available, and deliberately excludes this one: its gate
 * is `action.cost === undefined`, and OP05-060 charges a Life card. That
 * exclusion is right in general -- a ramp that costs a resource is not free to
 * take first -- and wrong for this deck, whose whole fifty is gated on a DON!!
 * count it cannot otherwise reach.
 *
 * The Life card is paid either way. What the ordering decides is only whether
 * the DON!! it buys is spendable this turn or lands after the turn's plays
 * have already been priced at the smaller budget.
 *
 * Stands down at 1 Life, where {@link keepTheLastLifeCard} has removed the
 * activation: without that the two rules together would veto the plays with no
 * ramp left to fall through to, and the deck would stop developing on exactly
 * the turns it is trying to survive.
 */
function rampStillToTake(t: Tactics): boolean {
  if (t.selfLife <= 1) return false;
  return t.actions.some(
    (action) =>
      action.type === "activate-main" && action.sourceCardNumber === "OP05-060",
  );
}

/**
 * Ramp before the play the ramp pays for.
 *
 * The generic ladder develops first and activates afterwards, so the turn's
 * DON!! is spent at the budget it had *before* the Leader added to it. The
 * card that budget could not afford is still in hand at the end of the turn,
 * and the DON!! the Leader added goes onto an attacker instead.
 *
 * A `never` on `play-card` rather than a preference for the activation,
 * because the two are different action types and ranking never compares across
 * groups. Removing the plays leaves the activation standing, the policy takes
 * it, and the gate then closes -- so this reorders one turn rather than
 * suppressing development.
 */
const rampBeforeThePlayItPaysFor = never(
  "Take the Leader's DON!! before spending DON!! on a body: the Life card is paid either way, and only the order decides whether the DON!! is spendable this turn",
)
  .as("ramp-before-the-play")
  .by(WEIGHT.deck)
  .when(rampStillToTake)
  .play(() => true);

/** The deck's in-game rules, one module per rule so each can be disabled. */
export function createSt18LuffyModules(): PolicyModule[] {
  return heuristicModules("st18-luffy", [
    keepTheLastLifeCard,
    rampBeforeThePlayItPaysFor,
  ]);
}
