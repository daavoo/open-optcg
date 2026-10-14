/**
 * Program fragments printed on more than one OP12 card.
 *
 * OP12 "Legacy of the Master" is built around two repeated costs. The Red
 * Rayleigh deck reveals Events out of hand -- a cost that spends nothing but
 * information -- and its 0-cost Events pay by *giving* active DON!! to a named
 * Character instead of by spending it.
 */
import { type MechanicEffect, type MechanicProgram } from "../mechanics.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * OP12-001 Silvers Rayleigh's Leader, OP12-003 Crocus, OP12-004 Kouzuki Oden,
 * OP12-009 Jinbe, OP12-013 Hatchan and OP12-015 Monkey.D.Luffy. The whole Red
 * deck is built on it, and so is its deckbuilding restriction: the Leader bars
 * cards with a cost of 5 or more, which is what leaves room for the Events this
 * cost is paid with.
 *
 * A reveal spends nothing -- the cards stay in hand -- so the price is purely
 * that the opponent learns two of them. That is why every card that prints it
 * can afford to print it repeatedly.
 */
export const revealTwoEvents = (
  bind: string,
  effect: MechanicEffect,
): MechanicProgram => ({
  effect: {
    kind: "optional",
    effect: {
      kind: "choose",
      selector: { player: "self", zone: "hand", category: "event" },
      bind,
      min: 2,
      max: 2,
      effect: {
        kind: "sequence",
        effects: [{ kind: "reveal", binding: bind }, effect],
      },
    },
  },
});
