/**
 * EB-01 fragments more than one of its cards prints.
 *
 * See `mechanics/README.md` for how the set is split.
 */
import { type MechanicCondition, type MechanicEffect } from "../mechanics.js";

/**
 * "If your Leader's type includes \"Baroque Works\"" -- EB01-035, EB01-037's
 * neighbours and EB01-038 all gate on it.
 *
 * The substring form rather than the exact one, which is what the printed
 * quotation marks mean: it also reaches {Former Baroque Works}, the type
 * EB01-061 Bon Clay is printed with.
 */
export const baroqueWorksLeader: MechanicCondition = {
  kind: "leader-type-including",
  player: "self",
  text: "Baroque Works",
};

/** "If your Leader has the {Water Seven} type" -- EB01-031 and EB01-033. */
export const waterSevenLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "Water Seven",
};

/** "If your Leader has the {Impel Down} type" -- EB01-028 and EB01-036. */
export const impelDownLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "Impel Down",
};

/**
 * "Add up to 1 DON!! card from your DON!! deck and set it as active."
 *
 * Printed on EB01-021's Leader, EB01-034 and EB01-061, and on EB01-039's
 * `[Trigger]`. The rested twin is EB01-036's, which is the same node with
 * `rested: true` and is the price that clause pays for firing off a K.O.
 */
export const addActiveDon = (count: number): MechanicEffect => ({
  kind: "add-don",
  player: "self",
  count,
  rested: false,
});

/**
 * "K.O. up to 1 of your opponent's Characters with a cost of N or less."
 *
 * Five of the set's clauses are this and nothing else, at five different
 * ceilings, so the ceiling is the only thing worth naming at each call site.
 */
export const koCostAtMost = (
  maxCost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: bind },
});

/**
 * "Give up to 1 of your opponent's Characters −N power during this turn."
 *
 * `expiresAfterTurns: 0` throughout: every printing in this set says "during
 * this turn", so none of them survives into the opponent's own turn.
 */
export const debuffOpponentCharacter = (
  amount: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount: -amount,
    expiresAfterTurns: 0,
  },
});
