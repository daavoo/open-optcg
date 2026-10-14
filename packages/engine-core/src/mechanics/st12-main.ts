/**
 * ST-12 `[Activate: Main]` programs and the one `[Main]` Event.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST12-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { restCostAtMost } from "./shared.js";
import { type SetMechanics } from "./registry.js";

/**
 * "Rest up to 1 of your opponent's Leader or Character cards with a cost of 4
 * or less" -- ST12-016 Lion Strike, printed for three windows.
 *
 * The Leader is in the target list, which is what separates this from every
 * other rest in the product: a rested Leader cannot attack, so the Event buys a
 * turn rather than a trade. A Leader carries its printed Life in `cost`, and
 * cost bounds never restrict a Leader, so the ceiling applies to the Characters
 * alone -- which is the reading the card wants.
 */
export const restLeaderOrCharacterAtFour = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    includeLeader: true,
    maxCost: 4,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

export const st12MainMechanics: SetMechanics = {
  activateMain: [
    [
      // ST12-002 Kuina: resting the body rests a 4-cost.
      //
      // Repeatable rather than `[Once Per Turn]`, and `sourceActive` is the
      // gate that stops the offer standing once it has rested -- a 3-cost 2000
      // that rests a 4-cost every turn it survives is the rate the low power
      // pays for.
      "ST12-002",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                restCostAtMost(4, "st12-kuina-rest"),
              ],
            },
          },
        },
      },
    ],
    [
      // ST12-012 Charlotte Pudding: the body picks itself up.
      //
      // No cost and no `[Once Per Turn]`, because the clause limits itself --
      // the source leaves the board. What it buys is a 2-cost 2000 with a 2000
      // Counter that can be held back out of a losing battle and replayed, and
      // in this product it is also how a body gets out of the way of the
      // Leader's own return cost.
      "ST12-012",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "move",
            binding: SOURCE_BINDING,
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // ST12-016 Lion Strike: the [Main] half. The same fragment is registered
      // for `[Counter]` in `st12-battle.ts` and for `[Trigger]` in
      // `st12-triggers.ts` -- the printed words are "activate this card's
      // [Main] effect", which is one fragment registered three times rather
      // than a node that reaches across registries.
      "ST12-016",
      {
        cost: 2,
        program: { effect: restLeaderOrCharacterAtFour("st12-lion-main") },
      },
    ],
  ],
};
