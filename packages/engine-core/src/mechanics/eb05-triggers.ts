/**
 * EB-05 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type SetMechanics } from "./registry.js";
import { asOnPlayTrigger, drawAndDiscard, lookAndAdd } from "./shared.js";

export const eb05TriggerMechanics: SetMechanics = {
  trigger: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-025 Domino. Printed text: `pnpm card:text EB05-025`.
      //
      // "Activate this card's [On Play]": the same program as the `[On Play]`
      // in `eb05-on-play.ts`, marked with `asOnPlayTrigger` so a negation of
      // [On Play] effects reaches it too.
      "EB05-025",
      asOnPlayTrigger(
        lookAndAdd(3, "eb05-025-trigger-look", { type: "Impel Down" }),
      ),
    ],
    [
      // EB05-029 Kimono Sleeve Cage. Printed text: `pnpm card:text EB05-029`.
      //
      // The plain refill: the trash is mandatory, and after two draws the
      // hand can always pay it.
      "EB05-029",
      { effect: drawAndDiscard(2, 1, "eb05-029-trigger-trash") },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  onKo: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-022 Octopako. Printed text: `pnpm card:text EB05-022`.
      //
      // Unconditional and answering any K.O., battle or effect, so a bare
      // program rather than an `OnKoProgram`.
      "EB05-022",
      { effect: { kind: "draw", player: "self", count: 2 } },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  onEndOfYourTurn: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
