/**
 * (Black) Monkey.D.Luffy -- OP-17 Elbaph giants.
 *
 * How the deck works: every giant prints "+12 cost" on itself, so one on the
 * board satisfies "a Character with a cost of 12 or more" for the whole team.
 * That single condition is what the rest of the list is priced on -- six
 * different 2-drops read 5000 instead of 2000, OP17-093 gains [Rush], and the
 * Leader grants [Blocker] to every Character at cost 12 or more, which is the
 * giants themselves. The enabling clause reads "there is", not "you have", so
 * an opposing giant switches the team on as well; but the [Blocker] grant is
 * the Leader's own and reaches only this seat's board.
 *
 * So the giants are not bodies that happen to be big. Each one is the buff on
 * every other card, and the wall, at once. Losing the last one drops the whole
 * board to its printed 2000s and leaves nothing that can block; losing one of
 * two halves the wall. The generic defence prices a Character save at one
 * ordinary Counter card because a body "can simply be played again", and never
 * blocks for a Character at all -- both of `chooseGenericBlock`'s tests and the
 * format's `free-block` open with `targetInstanceId.endsWith("-leader")`. In the
 * mirror against the OP-17 Sabo list, whose own Loki and Saul swing at the
 * giants every turn, that meant watching the enabler die with an active 11000
 * Loki beside it. The two modules here close exactly that gap and nothing
 * else: the Main-phase ladder is the generic one.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import { incomingLeaderDamage } from "../combat.js";
import {
  chooseGenericCounter,
  decision,
  type PolicyDecision,
} from "../generic-policy.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * The bodies whose removal takes power off the rest of the board.
 *
 * Every Character of this seat's at cost 12 or more, because that is the
 * number the team reads: each one is the "+12 cost" the 2-drops' +3000 and the
 * Leader's [Blocker] grant are asking for. Read off the board rather than
 * named, because two cards in the tournament list reach 12 only conditionally
 * -- OP15-088 Pirates Docking Six prints +6 and is a 12 only beside ST14-017
 * Thousand Sunny, and OP15-092 Monkey.D.Luffy gains +10 only from 10 cards in
 * the trash -- and while below it they buff nothing and are ordinary bodies.
 *
 * Plus OP17-093 Monkey.D.Luffy, the deck's one 8000 [Rush] attacker: it is not
 * an enabler, but it is the card the 2-drops' 5000s are meant to clear a path
 * for, and the only body in the list that a 2-drop cannot replace.
 */
const RUSH_LUFFY = "OP17-093";
const GIANT_COST = 12;

export function op17LuffyProtectedCards(
  observation: GameObservation,
): ReadonlySet<string> {
  return new Set([
    RUSH_LUFFY,
    ...observation.self.board
      .filter((card) => card.currentCost >= GIANT_COST)
      .map((card) => card.cardNumber),
  ]);
}

/**
 * Block an attack on one of the protected bodies with a Blocker that outpowers
 * it.
 *
 * The block is free in the sense `free-block` means: the Blocker's power
 * already exceeds the attack, so it survives, the attacked body is untouched,
 * and the rest it costs is refunded at the seat's next Refresh Phase. What it
 * gives up is a block later this same turn, so the rule stays out of the way
 * when the Leader would need the Blocker to live: if the attacks that can still
 * reach the Leader this turn already cover the seat's Life, the Blocker is kept
 * for `chooseGenericBlock` to spend where it must.
 *
 * Loki is the Blocker this is written around. It reads 11000 during the
 * opponent's turn, which is more than anything in the OP-17 lists swings for
 * short of a DON!!-loaded Leader, so it stops an attack on Saul or on the other
 * Loki without a card leaving hand.
 */
export function createOp17LuffyBlockPolicy(): PolicyModule {
  return {
    id: "op17-luffy-block",
    decide: ({ observation }): PolicyDecision | undefined => {
      if (observation.phase !== "block") return undefined;
      const battle = observation.activeBattle;
      if (!battle || battle.targetInstanceId.endsWith("-leader")) {
        return undefined;
      }
      const defended = observation.self.board.find(
        (card) => card.instanceId === battle.targetInstanceId,
      );
      if (
        !defended ||
        (defended.currentCost < GIANT_COST &&
          defended.cardNumber !== RUSH_LUFFY)
      ) {
        return undefined;
      }
      // A body the attack cannot beat needs no help.
      if (battle.attackPower < battle.targetPower + battle.counterPower) {
        return undefined;
      }
      if (incomingLeaderDamage(observation) >= observation.self.lifeCount) {
        return undefined;
      }
      const power = new Map(
        observation.self.board.map((card) => [
          card.instanceId,
          card.currentPower,
        ]),
      );
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
        "Block with a Blocker that outpowers the attack to save a giant: it survives, the giant keeps the rest of the board at 5000, and the rest it costs is refunded at the next Refresh Phase.",
      );
    },
  };
}

/**
 * Spend whatever Counter it takes to keep a protected body on the board.
 *
 * `chooseGenericCounter`'s default caps a Character save at a 1000 shortfall,
 * one ordinary Counter card, which is the field's price for a body that can
 * simply be played again. None of these can. A giant is the +3000 on every
 * 2-drop beside it and the Leader's [Blocker] grant at once, so the cards spent
 * saving it are spent on the whole board, and OP17-093 is the one attacker in
 * the list a 2-drop cannot stand in for. The cap is therefore off: the save is
 * priced as `willSpendToSaveCharacter` prices an uncapped deck, and the Life
 * guard beside it is unchanged -- no giant is worth the cards that stop a
 * lethal Leader hit.
 */
export function createOp17LuffyCounterPolicy(): PolicyModule {
  return {
    id: "op17-luffy-counter",
    decide: ({ observation }): PolicyDecision | undefined =>
      observation.phase === "counter"
        ? chooseGenericCounter(observation, observation.legalActions, {
            protectedCards: op17LuffyProtectedCards(observation),
            economicalCharacterDefense: false,
          })
        : undefined,
  };
}

/**
 * Which card in hand pays a trash cost, in the order this deck spends them.
 *
 * Three clauses in both lists raise the choice -- OP17-082 Sanji's "trash 2
 * cards from your hand", OP17-086 Nami's "trash 1 {Elbaph} type card", and
 * OP17-081 Gerd's "trash 1 card" -- and with no rule the answer was hand order,
 * which puts Loki in the trash as readily as a spare Nami.
 *
 * The order follows from what the trash is for in this deck. OP17-093 plays a
 * cost-2-or-less Character from it and OP15-088 Pirates Docking Six a
 * cost-2-or-less {Straw Hat Crew} one, so a cheap Straw Hat trashed is a card
 * the deck plays again, not a card lost; and every card trashed counts toward
 * OP15-092's thresholds. A giant trashed is the one card nothing but Gerd
 * brings back, and it is what every other card in the list is waiting for.
 *
 *  - Spent first: the 1000-Counter Straw Hats both recursion clauses replay.
 *  - Then the 2000-Counter ones and the cards that are only one piece of a
 *    plan -- Sanji, Zoro, Chopper, Thousand Sunny, OP15-092.
 *  - Then the bodies that are worth a turn by themselves -- OP17-093, Docking
 *    Six -- and the 4000 [Counter] Event.
 *  - Kept: the giants.
 */
export const OP17_LUFFY_PITCH_ORDER: readonly (readonly string[])[] = [
  ["OP17-086", "OP17-087", "OP17-080"],
  ["OP17-082", "OP17-095", "OP17-084", "ST14-017", "OP15-092"],
  ["OP17-093", "OP15-088", "OP17-096", "OP17-085", "OP17-092"],
  ["OP17-119", "OP17-089", "OP17-094", "OP17-081"],
];
