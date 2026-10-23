/**
 * EB-05 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { restCostAtMost } from "./shared.js";
import { playCharacterFromHand } from "./eb05-red-green-shared.js";

export const eb05TriggerMechanics: SetMechanics = {
  trigger: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-016 Nico Robin's `[Trigger]`. Printed text:
      // `pnpm card:text EB05-016`.
      "EB05-016",
      { effect: restCostAtMost(6, "eb05-016-rest") },
    ],
    [
      // EB05-019's `[Trigger]`. Printed text: `pnpm card:text EB05-019`.
      //
      // The count is the opponent's -- the attacker whose hit flipped this
      // card -- so it pays out late in the race, when they are close to
      // winning. Printed power, which is what a card in hand has.
      "EB05-019",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "life",
            operator: "lte",
            value: 3,
          },
          then: playCharacterFromHand(
            { type: "Land of Wano", maxPower: 6000 },
            "eb05-019-play",
          ),
        },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  onKo: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-004 Baby 5's `[On K.O.]`. Printed text: `pnpm card:text EB05-004`.
      //
      // Any K.O., on either turn, and the body comes in rested -- so on the
      // opponent's turn it is a fresh body that cannot block, and on its
      // controller's own it cannot attack. Printed power for a card in hand.
      "EB05-004",
      {
        effect: playCharacterFromHand(
          { maxPower: 6000 },
          "eb05-004-play",
          true,
        ),
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  onEndOfYourTurn: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-007 Monet's `[End of Your Turn]`. Printed text:
      // `pnpm card:text EB05-007`.
      //
      // One turn of expiry, booked at the end of this turn, is "until the end
      // of your opponent's next End Phase": the 1000-power body defends at
      // 6000 through the opponent's whole turn.
      "EB05-007",
      {
        effect: {
          kind: "modify-power",
          binding: SOURCE_BINDING,
          amount: 5000,
          expiresAfterTurns: 1,
        },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
