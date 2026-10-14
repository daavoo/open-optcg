/**
 * (Green) Jinbe's policy, behind the OP11-021 Leader.
 *
 * The Leader's [End of Your Turn], at 6 or fewer cards in hand, sets one
 * {Fish-Man} or {Merfolk} Character and one DON!! active: the body blocks on
 * the opponent's turn and the DON!! pays there, for a 1-cost Counter Event
 * (OP11-039 Vagabond Drill, OP11-038 Gum-Gum Elephant Gatling) or for the
 * DON!! OP11-024 Aladine and OP11-035 Fisher Tiger rest to put a body into
 * play from hand when the opponent's effect K.O.s them. OP11-030 Shirahoshi
 * rests a DON!! and itself to dig, and the Leader can stand it up again. The
 * rest of the deck rests the opposing board -- OP11-031 Jinbe, Fisher Tiger,
 * OP06-035 Hody Jones and the Events -- so its 7000 and 8000 bodies attack
 * into rested Characters.
 */
import {
  chooseGenericCounter,
  type PolicyDecision,
} from "../generic-policy.js";
import { surplusCardClosesLeaderHit } from "../format/defence.js";
import { heuristics, mustAct } from "../heuristics.js";
import type { PolicyModule } from "../policy-module.js";

/**
 * Spend one Counter card on a Leader hit whenever one card stops it.
 *
 * The generic Counter step spends on a Leader hit only to survive the turn,
 * and holds the card otherwise -- which prices a Life card in hand as worth
 * the Counter card it cost. Here it is worth less than nothing. Two thirds of
 * the list are 5- to 7-cost bodies, so the hand outruns the DON!! from the
 * middle turns and the cards held are cards that cannot be cast; and the
 * Leader's `[End of Your Turn]` does nothing above 6 cards in hand. A hit
 * absorbed adds a card to that hand, a Counter spent removes one, so declining
 * a one-card save costs a Life and moves the hand two cards further from the
 * Leader's ceiling.
 */
export function createOp11JinbeCounterModule(): PolicyModule {
  return heuristics("op11-jinbe-counter", [
    mustAct(
      "Spend the one Counter card that stops this Leader hit: the hand is past what the DON!! can cast, and the Leader needs it at 6 or fewer.",
    )
      .when((t) => surplusCardClosesLeaderHit(t.observation))
      .insteadOfPass((t) => surplusCardClosesLeaderHit(t.observation)),
  ]);
}

/**
 * The bodies worth Counter cards to keep, and how much Counter each is worth.
 *
 * The same arithmetic as the Leader-hit save: a Counter card in this hand is
 * usually a card the DON!! cannot cast, so it is cheap to spend, and every body
 * on the board is one the hand was struggling to pay for. The 6- and 7-cost
 * attackers rest the opposing board on the way in and are what close the game,
 * so they are worth a second card; the 4- to 6-cost bodies behind them one.
 * Aladine replaces itself only off the opponent's *effect*, so a K.O. in
 * battle is a plain loss. The 1-costs have done their work on the turn they
 * were played.
 */
const DEFEND: ReadonlyMap<string, number> = new Map([
  ["OP06-035", 3000],
  ["OP11-031", 3000],
  ["OP11-035", 3000],
  ["OP11-024", 2000],
  ["OP10-030", 2000],
  ["OP11-032", 2000],
  ["OP11-033", 2000],
]);

/** Spend Counter cards to keep the bodies in {@link DEFEND} on the board. */
export function createOp11JinbeDefendModule(): PolicyModule {
  return {
    id: "op11-jinbe-defend",
    decide: ({ observation }): PolicyDecision | undefined =>
      observation.phase === "counter"
        ? chooseGenericCounter(observation, observation.legalActions, {
            protectedCards: new Set(DEFEND.keys()),
            characterDefensePower: (cardNumber) => DEFEND.get(cardNumber) ?? 0,
          })
        : undefined,
  };
}
