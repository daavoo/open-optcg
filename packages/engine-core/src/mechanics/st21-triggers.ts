/**
 * ST-21 `[Trigger]` and `[On K.O.]` programs the whole-product import added.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST21-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { koPowerAtMost } from "./st21-shared.js";

export const st21TriggerMechanics: SetMechanics = {
  onKo: [
    [
      // ST21-004 Jewelry Bonney: with two DON!! on it, dying draws a card.
      //
      // The gate reads the DON!! that were on the body when it left the field,
      // which is why the `[On K.O.]` pipeline hands the whole board entry to
      // the program rather than a stripped identity. So the clause pays only
      // when the opponent answered a body its controller had committed to.
      "ST21-004",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 2,
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
  ],
  trigger: [
    [
      // ST21-016: off a Life card, a K.O. of anything at 4000 power or less --
      // the removal half of a card whose `[Main]` only silences.
      "ST21-016",
      { effect: koPowerAtMost(4_000, "st21-whip-trigger-ko") },
    ],
  ],
};
