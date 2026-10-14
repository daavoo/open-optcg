import type { PolicyModule } from "../policy-module.js";
import { heuristics, never, preferAmong, WEIGHT } from "../heuristics.js";
import { createMulliganModule } from "../mulligan.js";
import { optionCard, optionCurrentPower } from "../generic-policy.js";
import { selfLeaderId } from "../tactics.js";
import type { Tactics } from "../tactics.js";

/**
 * (Green/Yellow) Yamato, `packages/decks/src/op06-yamato-manifest.ts`.
 *
 * ## How the deck works
 *
 * The Leader has [Double Attack] and one `[Activate: Main]`: once the opponent
 * is at 3 or less Life, give up to two *rested* DON!! to one Character. Rested
 * DON!! is DON!! the turn has already spent on plays, so the gift is a second
 * use of the same resource, and it is the deck's only way of paying for the
 * `[DON!! x2]` texts its Characters print -- ST28-005 Yamato's +3000, ST28-002
 * Izo's [Blocker], OP06-109 Denjiro's K.O. immunity, OP06-110 Nekomamushi's
 * leave to attack active Characters. ST28-004 Kouzuki Momonosuke is the other
 * outlet: its own `[Activate: Main]` returns two given DON!! to the cost area
 * for [Rush] and +1000, so two DON!! the Leader has already spent become a
 * 7000 attack on the turn Momonosuke lands. Four Characters print "[Trigger]
 * If your opponent has 3 or less Life cards, play this card", which is why the
 * plan is to get the opponent to three as fast as [Double Attack] allows and
 * then keep swinging: from there the damage taken refills the board.
 */

/**
 * ST28-005 Yamato, and the whole of what
 * `packages/decks/src/op06-yamato-manifest.ts` can do on turn 1.
 *
 * A 1-cost body that looks five deep for a {Land of Wano} card costing 2 or
 * more -- which is every other {Land of Wano} card in the list, and the reason
 * the search's own cost floor is not a restriction here. Four copies.
 */
const YAMATO_SEARCHER = "ST28-005";

/** OP06-022 Yamato, the Leader whose gift {@link createOp06YamatoGiftModule} places. */
const YAMATO_LEADER = "OP06-022";

/**
 * ST28-004 Kouzuki Momonosuke: "[Activate: Main] [Once Per Turn] You may
 * return 2 total of your currently given DON!! cards to your cost area rested:
 * This Character gains [Rush] and +1000 power during this turn."
 */
const RUSH_MOMONOSUKE = "ST28-004";

/** "If your opponent has 3 or less Life cards", the number the whole list reads. */
const THRESHOLD = 3;

/**
 * Characters on the board before a turn is worth spending on power instead.
 *
 * Below it the deck is still assembling the board its Triggers refill, and the
 * removal decks it loses worst to are taking a body a turn out of it.
 */
const BOARD_WIDTH_TO_PRESS = 3;

/** PRB02-016 Otama: rest, Life card to hand, +3000 on one card this turn. */
const OTAMA = "PRB02-016";

/** The Leader gives two DON!!, and a given DON!! is +1000 on its controller's turn. */
const GIFT_POWER = 2_000;

/** ST28-005's `[DON!! x2] [Your Turn] +3000`, on top of the two DON!!'s own +2000. */
const SEARCHER_DON_TEXT_POWER = 3_000;

/**
 * The opening hand: keep on the searcher, ship everything else.
 *
 * The generic keep is `anyEarlyPlay` -- any card costing 2 or less -- and this
 * deck has fourteen of those: 4x ST28-005 at 1, 4x PRB02-016 Otama at 2, 4x
 * ST28-002 Izo at 2, 2x OP06-115 at 0. So the generic bound keeps almost every
 * opening hand, and this rule keeps roughly a third of them: four copies of
 * ST28-005 in fifty cards is a 34.8% chance of opening one.
 *
 * `mulligan.ts`'s table says a tightening pays in proportion to how much of the
 * cheap slot is *Events* -- a cost bound cannot tell a body from a [Counter] --
 * and by that reading this deck should read flat: twelve of its fourteen
 * cheap cards are Characters. It pays anyway, because a cheap Character is not
 * the same as a cheap *play*: eight of the twelve here do nothing on the turn
 * they land.
 *
 *  - **PRB02-016 Otama** is a 0-power body whose `[Activate: Main]` costs a
 *    Life card, and it has no Life to spend on turn 1 worth spending.
 *  - **ST28-002 Izo** is a 2-cost 1000 whose `[On Play]` gives the Leader
 *    [Banish] *during this turn* -- on turn 1 or 2 there is no attack for the
 *    keyword to matter to, and its [Blocker] needs two given DON!! the deck
 *    does not have that early.
 *
 * So what a cost bound gets wrong is cards that cannot *act*, and an Event is
 * only the most obvious way for a cheap card to be inert.
 *
 * Price it with `pnpm deck:ab --deck "(Green/Yellow) Yamato - Official
 * Feature Deck" --disable op06-yamato-mulligan --seeds 250`.
 */
export function createOp06YamatoMulliganModule(): PolicyModule {
  return createMulliganModule({
    id: "op06-yamato-mulligan",
    keep: (observation) =>
      observation.self.hand.some((card) => card.cardNumber === YAMATO_SEARCHER),
    keepBecause:
      "Keep a hand with ST28-005: it plays on turn 1 and digs five deep for a {Land of Wano} card, which is the only search in the list.",
    mulliganBecause:
      "Mulligan a hand with no ST28-005: the other cheap cards are a Counter Event and a 0-power Otama, neither of which does anything on turn 1.",
  });
}

/**
 * Where the Leader's two rested DON!! go.
 *
 * The gift is written as a `choose` over the deck's own Characters, so it
 * reaches the pilot as a `resolve-effect` with one option per body and no
 * `donGift` on it -- the shape `rested-don-gift` reads is `give-rested-don`,
 * which names the Leader too and this clause does not. Unranked, the generic
 * ladder takes the first body the engine lists, which is the oldest card on
 * the board: most often a 1000-power Izo standing beside an attacker the two
 * DON!! would have put over the opposing Leader.
 *
 * Every candidate is scored, `skip` included, because `preferAmong` hides
 * only what it scores and the survivors go back to offer order. The bands,
 * in the order the deck's plan ranks them:
 *
 *  1. **ST28-004 the turn it lands.** It cannot attack yet, and its own
 *     activation returns exactly these two DON!! for [Rush] and +1000: the
 *     gift becomes a 7000 attack that did not exist, and the DON!! were
 *     rested already. Above every other use, because an extra attack is worth
 *     more than +2000 on one that was happening anyway.
 *  2. **A body the gift lifts to the opposing Leader's power**, ST28-005
 *     counted at its `[DON!! x2]` +3000 as well. The attacker wins ties, so
 *     reaching the Leader's power is a whole attack the board did not have.
 *  3. **A body that can still attack**, largest first: +2000 on a hit that
 *     was already connecting raises the Counter it demands.
 *  4. **A body whose `[DON!! x2]` text outlives the turn** -- Izo's [Blocker],
 *     Denjiro's immunity -- even though it has no swing left. A given DON!!
 *     stays until the controller's next Refresh Phase, so the text is on for
 *     the opponent's whole turn while the +1000 is not.
 *  5. **Anything else** that can hold DON!!, and `skip` last: the DON!! are
 *     rested either way, so giving them is never worse than keeping them.
 */
export function createOp06YamatoGiftModule(): PolicyModule {
  return heuristics("op06-yamato-gift", [
    preferAmong(
      "Give the Leader's rested DON!! where they buy an attack: a just-played ST28-004 that returns them for [Rush], then the body they lift to the opposing Leader's power, then the largest attacker left, then a [DON!! x2] text that stays on through the opponent's turn.",
    )
      .by(WEIGHT.deck)
      .effect((action, t) => {
        if (action.sourceCardNumber !== YAMATO_LEADER) return false;
        const option = optionCard(action);
        if (!option) return -1;
        const body = t.observation.self.board.find(
          (card) => card.instanceId === option.card.instanceId,
        );
        if (!body) return -1;
        return giftRecipientScore(
          body.cardNumber,
          option.card.instanceId,
          optionCurrentPower(action),
          t,
        );
      }),
  ]);
}

function giftRecipientScore(
  cardNumber: string,
  instanceId: string,
  power: number,
  t: Tactics,
): number {
  const board = t.observation.self.board.find(
    (card) => card.instanceId === instanceId,
  );
  const canSwing = t.couldAttack(instanceId);
  if (cardNumber === RUSH_MOMONOSUKE && !canSwing && board?.rested === false) {
    return 1_000;
  }
  const gift =
    GIFT_POWER +
    (cardNumber === YAMATO_SEARCHER && t.needsDonForAbility(instanceId)
      ? SEARCHER_DON_TEXT_POWER
      : 0);
  if (canSwing) {
    const lifts =
      power < t.opponentLeaderPower && power + gift >= t.opponentLeaderPower;
    return (lifts ? 500 : 100) + power / 1_000;
  }
  if (t.needsDonForAbility(instanceId)) return 50;
  return 1;
}

/**
 * ST28-004's activation is a [Rush] purchase, and only that.
 *
 * It returns two given DON!! -- 2000 power somewhere on the board -- for [Rush]
 * and +1000 on itself. On the turn it is played that is the trade the card is
 * for: a 6000 body that could not attack becomes a 7000 that can. On any later
 * turn it already has its attack, so the clause takes 2000 off the board to
 * put 1000 back -- and the generic ladder takes every `[Activate: Main]` it
 * is offered. `couldAttack` is the engine's own reading of whether the body
 * has a swing this turn, which is what separates the two turns.
 */
export function createOp06YamatoRushModule(): PolicyModule {
  return heuristics("op06-yamato-rush", [
    never(
      "ST28-004 can already attack this turn, so [Rush] buys nothing and returning two given DON!! is 2000 power off the board for 1000 back.",
    ).activate(
      (action, t) =>
        action.sourceCardNumber === RUSH_MOMONOSUKE &&
        t.couldAttack(action.sourceInstanceId),
    ),
  ]);
}

/**
 * Otama's Life-for-a-card is priced against the Triggers in that Life.
 *
 * Every Life card this deck holds is a possible free Character once the
 * opponent is at 3 or less, and ST28-004's +1000 only switches on at 2 Life or
 * less. Above that, the activation sells a Life card the plan still wants for a
 * card in hand and +3000 the turn has to use at once; at 2 or less the Life
 * was going to be spent anyway and the card is the better half.
 */
export function createOp06YamatoOtamaModule(): PolicyModule {
  return heuristics("op06-yamato-otama", [
    never(
      "Otama would spend a Life card at 3 or more Life: that card is a Trigger the plan is waiting to flip, and the deck is not yet at the 2 Life where ST28-004 pays for being low.",
    ).activate(
      (action, t) => action.sourceCardNumber === OTAMA && t.selfLife >= 3,
    ),
  ]);
}

/**
 * A turn that loads the Leader beats a turn that adds another body.
 *
 * The generic ladder develops before it attaches -- plays, then activations,
 * then `attach-don` -- so the Leader is only ever offered what the turn's
 * plays left over, and `don-threshold` can rank an attachment the ladder has
 * already spent the DON!! for. `rank` never compares across action types, so
 * the preference is unreachable until the play is refused: this is the veto
 * that makes it reachable.
 *
 * Why this deck and not the format. The Leader has [Double Attack], so a
 * Counter card forced out of the defender's hand is bought against an attack
 * worth two Life cards rather than one, and the Leader pays nothing to swing
 * -- it is not a body that can be K.O.'d for resting. Against that, the cost
 * of skipping a play is a body this deck would rather have: the trade is
 * priced by the plan, not by the rules, which is why it ships for OP06-022
 * alone until it has a sign somewhere else.
 *
 * The condition is the whole claim, in `tactics`' own arithmetic: the DON!!
 * this play would spend is DON!! that would otherwise push the Leader across
 * a Counter threshold. Counter is spent in whole cards, so 5000 and 6000 both
 * cost the defender one and a DON!! between them buys nothing; only a play
 * that costs a *card* of pressure is refused.
 */
export function createOp06YamatoLoadLeaderModule(): PolicyModule {
  return heuristics("op06-yamato-load-leader", [
    never(
      "The DON!! this play would spend is what pushes the Leader across a Counter threshold, and a [Double Attack] swing buys that card against two Life cards rather than one.",
    )
      .when(
        (t) =>
          t.observation.phase === "main" &&
          // The deck's own clock: below the threshold the Triggers are asleep
          // and a body is worth more than pressure.
          t.opponentLife <= THRESHOLD &&
          // Nothing to load if the Leader has no swing left in it.
          t.couldAttack(selfLeaderId(t.observation)) &&
          // Only from a board that is already wide. The four Triggers that
          // play themselves need bodies to protect, and the removal decks
          // this list is worst against are eating one a turn -- a turn spent
          // not developing into that is a turn of the plan given up. Three
          // Characters is the width at which the next one is pressure rather
          // than the plan.
          t.observation.self.board.length >= BOARD_WIDTH_TO_PRESS &&
          // And only while this seat is the faster one. The clock is what the
          // pressure is buying; behind on it, the deck needs bodies to slow
          // the opponent down, and refusing them loses the game faster.
          t.race.role === "beatdown",
      )
      .play((card, t) => {
        const leaderPower = t.selfLeaderPower;
        const loaded = t.cardsToSurviveLeaderHit(leaderPower + t.don * 1_000);
        const afterPlay = t.cardsToSurviveLeaderHit(
          leaderPower + Math.max(t.don - card.cost, 0) * 1_000,
        );
        return loaded > afterPlay;
      }),
  ]);
}
