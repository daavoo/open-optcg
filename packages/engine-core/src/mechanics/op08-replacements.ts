/**
 * The one K.O. replacement OP08 prints.
 *
 * Split out like every other set's replacements; see `mechanics/README.md`.
 */
import { type SetMechanics } from "./registry.js";

export const op08ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP08-045 Thatch: "[printed text omitted -- pnpm card:text OP08-045]"
      //
      // Not a cost the controller pays for a save: the card dies either way and
      // the "instead" is what it dies *into* -- the trash rather than a K.O.,
      // which is why nothing keyed on a K.O. fires, plus a card. That is the
      // whole reason a 4-cost 5000 with no other text is playable: answering it
      // costs the opponent a card and gains them nothing.
      //
      // `alsoAnyKo` is the printed "or K.O.'d", which reaches a lost fight and
      // the controller's own removal alike; the `off-field` half stays behind
      // `opponentEffectOnly`, exactly as printed.
      "OP08-045",
      {
        opponentEffectOnly: true,
        alsoAnyKo: true,
        removal: "off-field",
        oncePerTurn: false,
        label: "Trash Thatch and draw 1 card",
        cost: { kind: "trash-self-and-draw", draw: 1 },
      },
    ],
  ],
};
