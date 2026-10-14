/**
 * EB-02 fragments more than one of its cards prints.
 *
 * Printed text for any card named here is `pnpm card:text <CARD>`.
 */
import type { MechanicCondition, MechanicProgram } from "../mechanics.js";
import { lookAndAdd } from "./shared.js";

/**
 * "[Main] Look at 4 cards from the top of your deck; reveal up to 1 card with a
 * cost of 4 or more and add it to your hand. Then, place the rest at the bottom
 * of your deck in any order."
 *
 * The booster's one-per-colour cycle: EB02-008, 020, 031, 040, 050 and 058 are
 * six 2-cost {Music} Events with identical text in six different colours, and
 * each prints "[Trigger] Activate this card's [Main] effect" beside it -- so
 * twelve registered clauses share this one program rather than twelve copies of
 * it.
 *
 * The floor is a cost *floor*, which is what makes the cycle a card at all: it
 * digs past the cheap interaction a deck is full of and finds the body or the
 * Event worth four DON!!.
 */
export const musicSearch: MechanicProgram = lookAndAdd(4, "eb02-music", {
  minCost: 4,
});

/**
 * "If the number of DON!! cards on your field is equal to or less than the
 * number on your opponent's field" -- EB02-035, EB02-037, EB02-039 and
 * EB02-041.
 *
 * Purple's own gate, and the booster prints it four times: the colour pays for
 * its tempo by returning DON!! to the DON!! deck, so a board that is *behind*
 * on DON!! is the board that has been spending. Read on the whole field, which
 * is what "on your field" means everywhere else in the pool -- active, rested
 * and given to a card all count.
 */
export const donParity: MechanicCondition = {
  kind: "field-don-versus",
  player: "self",
  operator: "lte",
};

/** "If your Leader has the {Straw Hat Crew} type" -- five cards in the set. */
export const strawHatLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "Straw Hat Crew",
};
