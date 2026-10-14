/**
 * ST-29 `[On Play]` and `[On K.O.]` programs.
 *
 * The starter is 17 cards and splits the same way the main sets do, by the
 * timing window a clause fires in: this file, `st29-main.ts`,
 * `st29-battle.ts` and `st29-triggers.ts`. Two of the product's clauses are
 * continuous text with no window to fire in -- one a power layer in
 * `../static-abilities.ts`, one a replacement in `st29-replacements.ts`. See
 * `mechanics/README.md`.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST29-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { lookAndAdd } from "./shared.js";
import { restByOpponentLife } from "./st29-battle.js";

export const st29OnPlayMechanics: SetMechanics = {
  onPlay: [
    // ST29-002 Usopp prints one clause for two windows; the program is in
    // `st29-battle.ts` and is registered from there as well.
    ["ST29-002", restByOpponentLife],
    [
      // ST29-004 Sanji: four deep for a {Straw Hat Crew} card.
      //
      // The card added is any category, not only a Character: the deck's Events
      // carry the type too, and the printed word is "card".
      "ST29-004",
      lookAndAdd(4, "st29-sanji", { type: "Straw Hat Crew" }),
    ],
  ],
  onKo: [
    [
      // ST29-007 Tony Tony.Chopper: dying trades a Life card for a card from
      // hand put back on top of the Life stack.
      //
      // Both halves are one payment, so the whole clause is `optional` and the
      // second half sits inside the first: a player who cannot spare a Life
      // card is offered nothing, and one who takes it has already agreed to
      // both. `position: "edge"` is the printed "top or bottom", which is the
      // two ends of the stack and no card between them.
      //
      // The Life card joins the hand, so the swap costs the Life total one and
      // the hand nothing -- it is the Yellow deck converting a dead body into
      // a Life card it chose.
      "ST29-007",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "life", position: "edge" },
            bind: "st29-chopper-life",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "st29-chopper-life",
                  to: { player: "self", zone: "hand" },
                },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "st29-chopper-bank",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "st29-chopper-bank",
                    to: { player: "self", zone: "life", position: "top" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
};
