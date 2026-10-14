/**
 * Program fragments printed on more than one OP13 card.
 *
 * OP13 "Carrying On His Will" runs three engines that repeat a shape: Green's
 * FILM package sets its own DON!! active, Purple's Roger Pirates package gates
 * everything on "if you have any DON!! cards given", and Black's Five Elders
 * package reads its own trash depth.
 */
import { type MechanicCondition, type MechanicEffect } from "../mechanics.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the gate the whole Purple Roger Pirates
 * package hangs on (OP13-061, 062, 063, 066, 072, 075, 076, 077).
 *
 * DON!! *given* to the Leader or to a Character, not DON!! sitting in the cost
 * area: the deck's own clauses push DON!! onto cards and then read it back, so
 * the two halves have to count the same thing. `field-don` would answer yes on
 * any turn at all and make every gate in the package free.
 */
export const anyGivenDon: MechanicCondition = {
  kind: "given-don",
  player: "self",
  operator: "gte",
  value: 1,
};

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- Green's gate,
 * printed on OP13-027, OP13-034 and OP13-037.
 */
export const filmOrStrawHatLeader: MechanicCondition = {
  kind: "any-of",
  conditions: [
    { kind: "leader-has-type", player: "self", type: "FILM" },
    { kind: "leader-has-type", player: "self", type: "Straw Hat Crew" },
  ],
};

/**
 * "If you have N or more cards in your trash" -- the Five Elders' own gate,
 * printed at 7 for their removal immunity and at 10 for their payoffs.
 */
export const trashAtLeast = (count: number): MechanicCondition => ({
  kind: "zone-count",
  player: "self",
  zone: "trash",
  operator: "gte",
  value: count,
});

/** "Set up to N of your DON!! cards as active" -- Green's whole plan. */
export const setDonActive = (count: number): MechanicEffect => ({
  kind: "activate-don",
  player: "self",
  count,
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" --
 * OP13-108 Jewelry Bonney's price for a 10000 body with [Rush].
 *
 * A card for them and a Life card gone: in Yellow's own plan that trade is worth
 * making, because the deck wins by getting the opponent's Life low and then
 * closing.
 */
export const opponentLifeToTheirHand = (bind: string): MechanicEffect => ({
  kind: "select",
  selector: { player: "opponent", zone: "life", position: "top" },
  bind,
  count: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "owner", zone: "hand" },
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the Purple
 * package's ramp, which arrives rested so it pays from the next Refresh.
 */
export const addRestedDon: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: true,
};
