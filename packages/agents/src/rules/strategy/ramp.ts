import { never, type Heuristic } from "../heuristics.js";
import type { Tactics } from "../tactics.js";

/**
 * The DON!! ramp plan, as rules shared by the decks that play it.
 *
 * Three shipped decks trade DON!! for tempo -- OP17 Kaido, OP15 Enel and ST34
 * Katakuri -- and until now each wrote the pattern into its own file, where it
 * fired for one Leader and inherited nothing. The strategy tree cannot hold it
 * either: Kaido and Katakuri are control and Enel is aggro, and a profile
 * inherits from one parent. So this is a rule list,
 * registered per purple Leader with `registerDeckRules` as `ramp`, which gives
 * every claim its own `--disable ramp#<rule>` arm.
 *
 * Every rule here reads what the engine now says about an action -- its
 * `cost`, and the DON!! it `ramps` -- rather than a card number, so a fourth
 * ramp deck gets them without a line of policy. That is the whole reason the
 * two fields were added to the protocol.
 *
 * ## The one claim so far
 *
 * A free activation that adds *active* DON!! goes before the plays, because it
 * pays for them. `chooseGenericRules` runs plays first and reaches
 * `activate-main` only with the turn's leftovers, so a ramp deck's engine sat
 * unused: Kaido activated its ramp zero times over eleven traced turns until
 * `king-ramp-first` vetoed plays while King's activation was on offer. That
 * rule named King. This one names the shape -- adds active DON!!, costs
 * nothing, hands DON!! to no one -- and King is the card in the shipped lists
 * it describes. OP15-058 Enel's Leader looks like another and is not; see the
 * gate below for why, and for the numbers that showed it.
 *
 * Safe to veto every play: taking the activation spends its once-per-turn key,
 * the offer disappears, and the same decision point is re-entered with the
 * plays back on the table and one more DON!! to pay for them. An activation
 * that costs something -- Queen's rests two -- is deliberately not this rule's
 * business, because whether its price is worth a play is a question about the
 * deck, and `op17-kaido-policy.ts` answers it for Kaido.
 *
 * ## The gate, and why it is this one
 *
 * `ramps` is read off the program, so it says what the activation *would*
 * add. With no gate at all the rule is a clear loss for Enel, and the reason
 * is that deck's own text:
 * Enel's Leader adds DON!! and then *gives four rested DON!! to a Character*,
 * and the gift comes out of the rested pool -- which, after the plays, also
 * holds every DON!! those plays just spent. Activated first, the gift is
 * whatever a six-card DON!! deck could still add; activated last, it is four.
 * The dossier says exactly this ("play OP15-118 on the six-DON!! turn before
 * activating the Leader so its cost supplies rested DON!!").
 *
 * Gating on the DON!! deck's supply instead -- veto only while the deck can
 * pay for the whole ramp -- fixes Enel and costs Kaido about as much. King
 * with one DON!! left in the deck still adds one active DON!!,
 * and that DON!! still pays for a play only if King goes first; the supply gate
 * handed those turns back to the generic ladder's play-first order.
 *
 * So the gate is the thing that actually separates the two cards: whether the
 * activation names a card to hand DON!! to. An untargeted ramp -- King, or
 * Enel's Leader on an empty board -- puts everything it adds in the cost area
 * and belongs before the plays whatever the deck holds; a targeted one moves
 * DON!! out of the pool, and where that pool is fullest is the card's own
 * question.
 */

/** A free, untargeted activation that adds spendable DON!! is on offer. */
function freeActiveRampOffered(t: Tactics): boolean {
  return t.actions.some(
    (action) =>
      action.type === "activate-main" &&
      action.cost === undefined &&
      action.targetInstanceId === undefined &&
      (action.ramps?.active ?? 0) > 0,
  );
}

export const RAMP_RULES: readonly Heuristic[] = [
  never("Take the free DON!! before spending DON!! on a body.")
    .as("free-ramp-first")
    .when(freeActiveRampOffered)
    .play(() => true),
];
