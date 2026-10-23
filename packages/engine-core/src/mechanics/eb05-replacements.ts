/**
 * EB-05 replacement programs: "... would be ... instead" text.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type SetMechanics } from "./registry.js";

export const eb05ReplacementMechanics: SetMechanics = {
  replacement: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  damageReplacement: [
    // -- Black and Yellow: EB05-041 to EB05-060 --
    // EB05-052 Gloriosa. Printed text: `pnpm card:text EB05-052`.
    //
    // A replacement on its controller's damage rather than on a Character's
    // removal, so it is not in `replacement` above: `damage-replacement.ts`
    // offers it before battle damage checks a Life card -- and before a
    // Leader on 0 Life loses -- and before an effect's `deal-damage` moves
    // one. Paying trashes Gloriosa, which is not a K.O.
    ["EB05-052", { cost: "trash-self" }],
  ],
};
