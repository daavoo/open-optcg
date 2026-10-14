/**
 * ST-22 fragments more than one of its cards prints.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST22-0xx` prints it from the local cache).
 */
import { type MechanicEffect } from "../mechanics.js";

/**
 * Reveal the top card of your deck and, if its type includes "Whitebeard
 * Pirates", run `then` -- the product's currency, printed on five cards with
 * five different payoffs.
 *
 * The card stays where it is: unlike `revealTopThen`, nothing on these cards
 * places it afterwards, so a hit that draws takes the revealed card itself.
 * A `select` over the top position rather than a `look-at`, because the reveal
 * is public and `look-at` emits a private one -- the OP15-065 Goro shape.
 */
export const revealTopWhitebeard = (
  bind: string,
  then: MechanicEffect,
): MechanicEffect => ({
  kind: "sequence",
  effects: [
    {
      kind: "select",
      selector: { player: "self", zone: "deck", position: "top" },
      bind,
      count: "all",
      effect: { kind: "reveal", binding: bind },
    },
    {
      kind: "if",
      condition: {
        kind: "selector-count",
        player: "self",
        selector: {
          zone: "deck",
          binding: bind,
          typeIncluding: "Whitebeard Pirates",
        },
        operator: "gte",
        value: 1,
      },
      then,
    },
  ],
});
