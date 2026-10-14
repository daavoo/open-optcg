/**
 * Fragments more than one ST-12 card prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content (`pnpm card:text
 * ST12-0xx` prints it from the local cache).
 */
import { type MechanicEffect } from "../mechanics.js";
import { revealTopThen } from "./shared.js";

/**
 * "Reveal 1 card from the top of your deck and play up to 1 Character card
 * with a cost of 2. Then, place the rest at the top or bottom of your deck" --
 * the product's engine, printed on two Characters and its Counter Event.
 *
 * Exactly 2, not "2 or less": the deck is built with a shelf of 2-cost bodies
 * for it to find, and a 1-cost is as much a miss as a 5-cost. `rested` is the
 * only thing the three printings differ in.
 */
export const revealAndPlayCostTwo = (
  bind: string,
  rested = false,
): MechanicEffect =>
  revealTopThen(bind, {
    kind: "choose",
    selector: {
      player: "self",
      zone: "deck",
      binding: bind,
      category: "character",
      minCost: 2,
      maxCost: 2,
    },
    bind: `${bind}-play`,
    min: 0,
    max: 1,
    effect: {
      kind: "play",
      binding: `${bind}-play`,
      ...(rested ? { rested } : {}),
    },
  });
