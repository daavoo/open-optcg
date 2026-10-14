/**
 * Continuous text printed on ST-13: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import type { StaticAbility } from "../static-abilities.js";

export const st13StaticAbilities: readonly StaticAbility[] = [
  {
    // ST13-003 Monkey.D.Luffy (Leader): a damaged *face-up* Life card goes to
    // the bottom of the deck instead of into the hand.
    //
    // Every other Leader's Life stack is a second hand that pays out as it is
    // spent. This one's does not: the whole deck is built on putting 5-cost
    // brothers onto Life face-up, and under this Leader each of them is gone
    // for good the moment it is hit. What the price buys is the activation
    // beside it, which is the only clause in the pool that rebuilds a Life
    // stack from nothing.
    //
    // Face-down cards are untouched, which is the printed word and also the
    // out: ST13-005 banks face-down and ST13-009 turns a face-up card back
    // down, so a player under this Leader has two ways to make the stack behave
    // normally again.
    cardNumber: "ST13-003",
    scope: "self",
    faceUpLifeGoesToDeckBottom: (context) => context.isLeader,
  },
];
