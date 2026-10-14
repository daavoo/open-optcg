/**
 * ST-30 `[Trigger]` programs.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST30-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { digForSixThousand } from "./st30-shared.js";

export const st30TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // ST30-015: off a Life card, a K.O. of anything at 6000 power or less.
      //
      // `maxCurrentPower`, because a Trigger resolves mid-attack: the attacker
      // is carrying its DON!! at that moment, and that is exactly the body this
      // ceiling is not allowed to reach.
      "ST30-015",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 6_000,
          },
          bind: "st30-whitebeard-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "st30-whitebeard-ko" },
        },
      },
    ],
    [
      // ST30-017: the printed words are "activate this card's [Main] effect",
      // which is the same fragment registered twice rather than a node that
      // reaches across registries. See `st30-main.ts`.
      "ST30-017",
      digForSixThousand("st30-trouble-trigger"),
    ],
  ],
};
