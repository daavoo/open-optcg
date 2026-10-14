/**
 * EB-03's one replacement effect: the EB03-001 Leader's K.O. protection.
 *
 * It is the first registered replacement in the pool printed on a *Leader*
 * rather than on a board Character, which is what `eligibleReplacements`'
 * pseudo-card walk exists for -- a Leader sits in no zone, so the registry's
 * board scan could not see it.
 */
import { type SetMechanics } from "./registry.js";

export const eb03ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // EB03-001 Nefeltari Vivi (Leader): "[printed text omitted -- pnpm card:text EB03-001]"
      //
      // `opponentEffectOnly: false` is the printed reading: the clause says only
      // "would be K.O.'d", so it answers battle destruction and the controller's
      // own removal as well -- the widest of the three shapes in the registry,
      // paid for by `[Once Per Turn]` and by a card out of hand every time.
      //
      // `protects` is a filter on the *threatened* card rather than on the
      // protector: this Leader guards its Characters, not itself, and a Leader
      // is never K.O.'d anyway. Base cost, so a Character shrunk below 4 by an
      // effect is still covered and one discounted onto the board is not
      // -- `minBaseCost` reads the printed number.
      "EB03-001",
      {
        opponentEffectOnly: false,
        oncePerTurn: true,
        protects: { category: "character", minBaseCost: 4 },
        label: "Trash 1 card from your hand",
        cost: { kind: "trash-from-hand", count: 1 },
      },
    ],
  ],
};
