/**
 * The one K.O. replacement OP09 prints.
 *
 * Kept in its own module for the same reason the other sets' are: a replacement
 * is offered from inside a suspended battle or effect, and reading the whole
 * family side by side is what makes the prices comparable.
 */
import { type SetMechanics } from "./registry.js";

export const op09ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP09-012 Monster: guards its partner rather than itself, and pays by
      // going to the trash -- not `ko-self`, because a card trashed by an
      // effect was not K.O.'d, so nothing keyed on a K.O. fires.
      //
      // "By an effect" with no side named, so `effectOnly`: the controller's
      // own removal is inside it and a lost fight is not.
      "OP09-012",
      {
        opponentEffectOnly: false,
        effectOnly: true,
        oncePerTurn: false,
        protects: { name: "Bonk Punch" },
        label: "Trash Monster",
        cost: { kind: "trash-self" },
      },
    ],
  ],
};
