/**
 * OP09 fragments printed on more than one of its cards.
 *
 * The ODYSSEY package is built on one gate -- a board this player has already
 * rested -- and eleven of its cards read it, so it is written once here.
 */
import { type MechanicCondition } from "../mechanics.js";

/**
 * "You have N or more rested Characters."
 *
 * Deliberately not the `rested-cards` condition, which counts every rested card
 * the player controls: the Leader, the Stage and the rested DON!! pile as well.
 * The ODYSSEY clauses name Characters, and an ODYSSEY board with three DON!!
 * spent would otherwise clear a gate its own text says it has not.
 */
export const restedCharacters = (value: number): MechanicCondition => ({
  kind: "selector-count",
  player: "self",
  selector: { zone: "board", category: "character", rested: true },
  operator: "gte",
  value,
});

export const twoRestedCharacters = restedCharacters(2);
export const threeRestedCharacters = restedCharacters(3);
