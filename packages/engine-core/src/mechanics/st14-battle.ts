/**
 * ST-14 battle-window programs: `[When Attacking]` and the one `[Counter]`
 * Event.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST14-0xx` prints it from the local cache).
 *
 * `[DON!! xN]` is an `if` on `source-attached-don`, which is how the pool
 * expresses it: the engine has no generic gate for the printed marker, and
 * `donRequirement` on the record is read by the agents rather than by the
 * rules.
 */
import { type SetMechanics } from "./registry.js";
import { koCostAtMost } from "./op08-shared.js";
import { ownBodyAtCost, robinCostDrop } from "./st14-shared.js";

export const st14BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // ST14-002 Usopp: a DON!! on it and an 8-cost body behind it turn a
      // 3-cost swing into a K.O. of anything at cost 4 or less.
      //
      // Two gates and they ask different things -- one about this card's own
      // DON!! pile, one about the board -- so they sit in one `all-of` rather
      // than nesting.
      "ST14-002",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "source-attached-don", operator: "gte", value: 1 },
                ownBodyAtCost(8),
              ],
            },
            then: koCostAtMost(4, "st14-usopp-ko"),
          },
        },
      },
    ],
    // ST14-007 Nico Robin prints one clause for two windows; the program is in
    // `st14-shared.ts` and is registered from `st14-on-play.ts` as well.
    ["ST14-007", robinCostDrop],
  ],
  counterEvent: [
    [
      // ST14-014 Gum-Gum Giant Rifle: 3000 Counter, but only behind an 8-cost
      // body.
      //
      // `powerWhen` rather than an `if` in the program, because the condition
      // is board state the defender can read before taking the offer: the
      // forecast in the action summary then promises the 3000 only when the
      // resolution will actually add it. A conditional payout hidden in the
      // program would advertise power that never lands.
      "ST14-014",
      {
        cost: 1,
        power: 3_000,
        powerWhen: ownBodyAtCost(8),
      },
    ],
  ],
};
