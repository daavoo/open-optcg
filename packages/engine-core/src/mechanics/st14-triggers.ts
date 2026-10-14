/**
 * ST-14 `[Trigger]` programs.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST14-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { koCostAtMost } from "./op08-shared.js";
import { ownBodyAtCost } from "./st14-shared.js";

export const st14TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // ST14-014: off a Life card, a cheap body comes back out of the trash.
      //
      // To hand rather than to the board, so it costs its controller a turn's
      // DON!! to use -- which is why the ceiling is cost 2 and the Event's own
      // `[Counter]` half is the reason it is in the deck.
      "ST14-014",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            maxCost: 2,
          },
          bind: "st14-rifle-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "st14-rifle-recur",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // ST14-015: off a Life card, behind an 8-cost body, a K.O. of anything at
      // cost 5 or less.
      //
      // A wider ceiling than the same card's `[Main]` half, which stops at 2:
      // the Life card has already been paid for by the attack that revealed
      // it, so the Trigger is the better half of the card whenever the gate is
      // open.
      "ST14-015",
      {
        effect: {
          kind: "if",
          condition: ownBodyAtCost(8),
          then: koCostAtMost(5, "st14-phoenix-trigger-ko"),
        },
      },
    ],
    [
      // ST14-016: off a Life card, a K.O. of anything at cost 3 or less, with
      // no gate on the board at all.
      "ST14-016",
      { effect: koCostAtMost(3, "st14-crew-trigger-ko") },
    ],
  ],
};
