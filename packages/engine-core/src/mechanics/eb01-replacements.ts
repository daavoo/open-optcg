/**
 * EB-01's one replacement effect: EB01-008 LittleOars Jr.'s K.O. protection.
 *
 * See `mechanics/README.md` for how the set is split.
 */
import { type SetMechanics } from "./registry.js";

export const eb01ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // EB01-008 LittleOars Jr.: "[Once Per Turn] If this Character would be
      // K.O.'d by an effect, you may trash 1 Event or Stage card from your hand
      // instead."
      //
      // `effectOnly` rather than `opponentEffectOnly`: the printed clause says
      // "by an effect" and names no side, so it answers the controller's own
      // removal too but not a lost fight -- the OP09-012 Monster reading.
      //
      // No `protects`, so it guards only its own printing, which is what "this
      // Character" means. The cost names two categories at once, which is what
      // the `match` disjunction is for: a hand of Characters cannot pay, and
      // that is the whole restraint on a 7000 body that will not die.
      "EB01-008",
      {
        opponentEffectOnly: false,
        effectOnly: true,
        oncePerTurn: true,
        label: "Trash 1 Event or Stage card from your hand",
        cost: {
          kind: "trash-from-hand",
          count: 1,
          match: { anyOf: [{ category: "event" }, { category: "stage" }] },
        },
      },
    ],
  ],
};
