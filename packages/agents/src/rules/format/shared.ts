/**
 * Helpers more than one family of format rule reads.
 *
 * Nothing here is a rule. A helper earns a place in this file by being read
 * from two families and no other way -- the split is by decision, so a helper
 * crossing it is the exception and is meant to look like one.
 *
 * One of the files `format-heuristics.ts` is the map of; see that file for what
 * lives where and why the split is by decision rather than by deck.
 */
import { type HandCard, type Tactics } from "../tactics.js";
import type { GameObservation } from "@one-piece-sim/protocol";

/**
 * Cards whose bottoming clause is written in the mechanic DSL rather than as the
 * `bottom-deck-character` effect `own-board-removal` in `format/replacement.ts`
 * reads.
 *
 * A `choose` in the DSL reports `effectKind: "mechanic-choice"` whatever it
 * selects, so the kind alone cannot say "this option bottoms a card".
 * OP06-058's `[Main]` is written in the DSL and its `[Trigger]` raises the
 * imperative effect, which is why both readings are needed at once.
 *
 * Card-keyed for the reason `gloriosa-bottom-opponent` in `format/selection.ts`
 * is: the DSL says nothing in the offered action about *where* a chosen card is
 * going, so there is no shape to match on. What would retire this list is the
 * option descriptor carrying the destination -- then the rule could read "a
 * self-owned card headed under a deck" directly, which is what it means.
 */
export const BOTH_BOARDS_BOTTOM_CARDS: ReadonlySet<string> = new Set([
  "OP06-058",
]);

/**
 * What a [Blocker] is worth beyond its power, in thousands.
 *
 * The unit is {@link createAreaReplacementChoiceModule}'s: a body to give up is
 * scored at `-power / 1000`, so this says "the block is worth about 4000 power
 * of body". Calibrated to what it must and must not do, from both sides:
 *
 *  - It has to beat the gaps the format actually prints between a Blocker and a
 *    vanilla body of the same cost. Blockers are printed small *because* they
 *    block -- OP17-074 Yamato is a cost-3 1000, against 4000 for a cost-3
 *    vanilla -- so anything under 3.0 leaves the Blocker still the cheapest
 *    thing on the board to give up in the common case.
 *  - It must not protect a Blocker at any price. It prices the block, not the
 *    Blocker: a 1000 [Blocker] is worth 5000 of body, so it is kept ahead of the
 *    format's 4000s and given up ahead of a 6000. Trading the board's biggest
 *    body away to keep a small block is the mirror of the fault this fixes, and
 *    both directions are pinned in `test/format-area-limit.test.ts`.
 */
export const BLOCKER_WORTH_IN_THOUSANDS = 4;

export type BoardCard = GameObservation["self"]["board"][number];

/**
 * Whether a body on the board can still use [Blocker] on the opponent's next
 * turn -- which is narrower than holding the keyword:
 *
 *  - **`blocker`, not `CardFacts.keywords`.** The observation's board field is
 *    the state of this card *instance*: it goes false for a printed Blocker
 *    whose text is negated, which is a body with no block to lose.
 *  - **Not rested.** A Main-phase decision happens on the controller's own
 *    turn, and the Refresh Phase that would stand the Blocker up is at the
 *    start of the controller's *next* turn (CR 6-2-3) -- so a Blocker already
 *    rested cannot block anything on the turn in between.
 *  - **Not rest-locked through the opponent's turn.** Resting is the cost of
 *    the block, so a Character that cannot be rested cannot use [Blocker] at
 *    all -- the reason `cannotRestUntilTurn` is in the observation. The lock is
 *    stated inclusively -- "through and including this turn number" -- and the
 *    block it would stop is on the turn after this one.
 *
 * Shared by the two rules that price a body on a full board -- the veto on
 * playing into it and the choice of which body to give up -- so they cannot
 * drift apart on what counts as a block.
 */
export function blockStillAvailable(card: BoardCard, turn: number): boolean {
  if (!card.blocker || card.rested) return false;
  return (card.cannotRestUntilTurn ?? -1) < turn + 1;
}

/**
 * What a card is worth arriving from the hand, in thousands: {@link worthOnBoard}
 * asked one step earlier, before the body is on the field to read `blocker` off.
 *
 * Printed keywords rather than the instance's, because a card in hand has no
 * instance state yet -- which is also why there is no rested or rest-lock term
 * here. The two are the same judgement from either side of the play, and the
 * rules that compare a card in hand against a body on the field
 * ({@link createBoardReplacementModule}) or against another card in hand
 * ({@link createEqualCostPlayModule}) read this one so they cannot drift apart
 * on what a Blocker is worth.
 */
export function worthInHand(card: HandCard): number {
  return (
    card.facts.power / 1000 +
    (card.facts.keywords.includes("Blocker") ? BLOCKER_WORTH_IN_THOUSANDS : 0)
  );
}

/**
 * Whether a rested opposing Character is worth an attack that could have gone
 * at the Leader instead.
 *
 * Read from both sides of the same judgement, which is why it is here rather
 * than beside either one: `threat-removal` in `format/attacks.ts` asks it of a
 * target to decide whether to aim an attack at it, and `ko-reach-attachment`
 * in `format/don.ts` asks it of the same target to decide whether a DON!! that
 * brings a body up to its power is worth more than the +1000 on a swing at the
 * Leader. Two answers to "is this body worth removing" would let the DON!! go
 * to a K.O. the attack rules then decline to take.
 */
export function isWorthRemoving(
  card: GameObservation["opponent"]["board"][number],
  t: Tactics,
): boolean {
  if (!card.rested) return false;
  if (!(card.blocker || card.cost >= 4)) return false;
  // A Character held down through the opponent's next Refresh Phase neither
  // attacks nor blocks on the turn this rule is buying protection from, so the
  // removal premium it prices in does not exist -- the Leader hit is worth
  // more. Without this, a seat freezes a rested body with an [Activate: Main]
  // and then spends its only attack K.O.ing the same body: two payments for one
  // turn of denial, and the Life hit given up for it.
  if ((card.cannotRefreshUntilTurn ?? -1) >= t.turn + 1) return false;
  return !t.koRefundsDefender(card.instanceId);
}
