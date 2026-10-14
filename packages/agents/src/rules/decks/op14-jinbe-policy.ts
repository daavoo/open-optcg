/**
 * (Blue) Jinbe's policy, behind the OP14-040 Leader.
 *
 * The Leader's [Activate: Main] trashes a card from hand to give up to two
 * rested DON!! to a {Fish-Man} or {Merfolk} Leader or Character, as often as
 * the hand and the rested DON!! allow. The list is built to feed it: three
 * 1-cost 3000s (OP14-042 Arlong, OP14-050 Chew, OP14-051 Hatchan) that the
 * gift turns into 5000 and 7000 attackers on turn two, 3- and 4-cost bodies
 * that draw or play another on the way in or out, and OP14-054 Fisher Tiger's
 * three cards to refill the hand the Leader spends.
 */
import type { GameObservation } from "@one-piece-sim/protocol";
import { heuristics, never, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import type { PolicyModule } from "../policy-module.js";

/** The 1-cost Fish-Man 3000s the Leader's first gift goes on. */
const ONE_DROPS = new Set(["OP14-042", "OP14-050", "OP14-051"]);

/** The 3- and 4-cost bodies that follow them. */
const CURVE_BODIES = new Set(["OP14-043", "OP14-045", "OP14-047", "OP14-056"]);

export function createOp14JinbeMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op14-jinbe-mulligan",
    keep: (observation) => {
      const hand = observation.self.hand;
      return (
        hand.some((card) => ONE_DROPS.has(card.cardNumber)) &&
        hand.some((card) => CURVE_BODIES.has(card.cardNumber))
      );
    },
    keepBecause:
      "Keep a 1-cost Fish-Man and a 3- or 4-cost body: the Leader's gift needs a cheap attacker on the board from the second turn.",
    mulliganBecause:
      "Mulligan a hand missing a 1-cost Fish-Man or a 3- or 4-cost body: the Leader has nothing to give its DON!! to.",
  });
}

const JINBE_LEADER = "OP14-040";
const KUROOBI = "OP14-045";
const BIG_JINBE = "OP14-049";
const WADATSUMI = "OP14-056";

/** The one body in the fifty the gift cannot land on: Koala is not a Fish-Man. */
const NOT_FISH_MAN = new Set(["OP14-046"]);

/**
 * How far past the opposing Leader's power a gift is still worth a card.
 *
 * The attacker wins ties, so a body at the Leader's power already connects;
 * one more gift makes the defender spend a 2000 Counter to stop it, which is a
 * card for a card. Past that the Leader is paying a card for nothing.
 */
const GIFT_MARGIN = 2000;

type BoardCard = GameObservation["self"]["board"][number];

/**
 * Whether a body will have an attack to spend the DON!! on once this
 * activation's own discard has happened.
 *
 * `couldAttack` is the engine's answer before the discard, and the discard is
 * what switches three of the fifty on: Kuroobi and the 8-cost Jinbe gain
 * [Rush] once a card has been trashed from hand by an effect this turn, and
 * Wadatsumi's "cannot attack" is negated by the same trash.
 */
function swingsAfterDiscard(card: BoardCard): boolean {
  if (NOT_FISH_MAN.has(card.cardNumber)) return false;
  if (card.couldAttack) return true;
  if (card.rested) return false;
  if (card.cardNumber === KUROOBI || card.cardNumber === BIG_JINBE) {
    return card.summoningSick === true;
  }
  return card.cardNumber === WADATSUMI && card.summoningSick !== true;
}

/**
 * The order the deck gives cards up in, first spent first. The Leader pays a
 * card per gift and Fisher Tiger trims the hand to five, so this is read at
 * both.
 *
 * OP14-057 is a +1000 the deck mostly wants for its [Trigger], and the 1-cost
 * 3000s carry no Counter and are the weakest card in hand once the opening
 * turns are over. The top end and the Counters are kept longest: Koala,
 * Wadatsumi and The Macro Gang are the 2000s, OP14-058 is the only +3000
 * Counter, Fisher Tiger is the refill, and the 8-cost Jinbe is the finisher.
 */
export const OP14_JINBE_PITCH_ORDER: readonly (readonly string[])[] = [
  ["OP14-057"],
  ["OP14-050", "OP14-051"],
  ["OP14-042"],
  [KUROOBI],
  ["OP14-043", "OP14-047"],
  ["OP14-055"],
  [WADATSUMI],
  ["OP14-046"],
  ["OP14-058"],
  ["OP14-054"],
  [BIG_JINBE],
];

/**
 * The hand size at or below which a gift is only worth a card when it makes
 * an attack connect at all.
 *
 * Every gift is a card out of the hand the deck defends with, and the margin
 * it buys past the opposing Leader is answered by one Counter card. With a
 * full hand that trade is card for card; with five or fewer, the card paid is
 * one of the last few Counters, and the next turn's hits land on the Leader.
 */
const HAND_FLOOR = 5;

/**
 * The cards the deck does not give up for a margin: the only +3000 Counter,
 * the refill, and the finisher. Whichever card the gift costs is the cheapest
 * in hand by {@link OP14_JINBE_PITCH_ORDER}, so a hand of nothing else is the
 * one where the next gift would spend one of these.
 */
const KEEPERS = new Set(["OP14-058", "OP14-054", BIG_JINBE]);

function handHoldsOnlyKeepers(hand: GameObservation["self"]["hand"]): boolean {
  return hand.every((card) => KEEPERS.has(card.cardNumber));
}

/**
 * The Leader's activation.
 *
 * The activation is offered whenever the hand holds a card, and the ladder
 * takes a free-looking repeatable activation every time it is offered: it
 * emptied the hand on turn one for gifts nothing could attack with, fired it
 * with no rested DON!! to give, and kept stacking DON!! on a Leader already far
 * past the opposing one. Each activation is a card, so it is taken only while
 * there is a rested DON!! to move and a Fish-Man with an attack to come that
 * is not yet past the opposing Leader by {@link GIFT_MARGIN} -- or, when the
 * hand is at {@link HAND_FLOOR} or below or every card left in it is one of
 * {@link KEEPERS}, a Fish-Man the gift is what makes connect at all. Which card pays
 * is {@link OP14_JINBE_PITCH_ORDER}'s question, registered beside this.
 */
export function createOp14JinbeLeaderModule(): PolicyModule {
  return heuristics("op14-jinbe-leader", [
    never(
      "Trash a card for the Leader's gift only with a rested DON!! to give and a Fish-Man that can still attack and is not yet past the opposing Leader.",
    )
      .by(WEIGHT.deck)
      .as("gift-gate")
      .activate((action, t) => {
        if (action.sourceCardNumber !== JINBE_LEADER) return false;
        const self = t.observation.self;
        if (t.observation.turn <= 2 || self.restedDon === 0) return true;
        const target = t.observation.opponent.leader.currentPower;
        // Only a body that does not yet connect is worth a card the deck
        // keeps: then the gift is a whole attack, not a bigger Counter ask.
        const ceiling =
          handHoldsOnlyKeepers(self.hand) || self.hand.length <= HAND_FLOOR
            ? target
            : target + GIFT_MARGIN;
        const leaderWants =
          self.leader.couldAttack && self.leader.currentPower < ceiling;
        const bodyWants = self.board.some(
          (card) => swingsAfterDiscard(card) && card.currentPower < ceiling,
        );
        return !leaderWants && !bodyWants;
      }),
  ]);
}

/**
 * OP14-049 Jinbe's [On Play] and OP14-058's [Main] each return a Character to
 * its owner's hand, and "a Character" names no side, so the engine offers the
 * controller's own board as a branch of its own. The ladder took it in offer
 * order and bounced its own board. Nothing in this fifty wants to come back to
 * hand -- The Macro Gang is the deck's own 6000 base-power body and has no
 * text to replay -- so only the opponent's side, or nothing, is returned.
 */
const BOUNCERS = new Set([BIG_JINBE, "OP14-058"]);

export function createOp14JinbeBounceModule(): PolicyModule {
  return heuristics("op14-jinbe-bounce", [
    never("Do not return your own Character to hand.")
      .by(WEIGHT.deck)
      .as("own-bounce")
      .effect(
        (action) =>
          BOUNCERS.has(action.sourceCardNumber) &&
          action.option.kind === "mode" &&
          action.option.mode === "own",
      ),
  ]);
}
