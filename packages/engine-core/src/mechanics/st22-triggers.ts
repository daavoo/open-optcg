/**
 * ST-22 `[Trigger]` programs.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST22-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";

export const st22TriggerMechanics: SetMechanics = {
  trigger: [
    // ST22-016 Take That Back!!: a card.
    ["ST22-016", { effect: { kind: "draw", player: "self", count: 1 } }],
    [
      // ST22-017 Fire Fist: a cost-3-or-less Character back to its owner's
      // hand. "Up to 1 Character" names neither side, so the selector reaches
      // both and the card goes to its owner.
      "ST22-017",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 3,
          },
          bind: "st22-fire-fist-bounce",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "st22-fire-fist-bounce",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
  ],
};
