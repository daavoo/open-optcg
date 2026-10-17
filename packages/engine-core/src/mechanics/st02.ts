/**
 * ST-02's one card in the pool: ST02-007 Jewelry Bonney, a block-1 starter
 * card reprinted in block 4 on the PRB-02 page and so Standard-legal. Its
 * record lives in `packages/cards/src/generated-community.ts`, stamped by the
 * audit's community pass. Printed text is `pnpm card:text ST02-007`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { lookAndAdd } from "./shared.js";
import { type SetMechanics } from "./registry.js";

export const st02Mechanics: SetMechanics = {
  activateMain: [
    [
      // ST02-007 Jewelry Bonney: an active DON!! and its own rest for a
      // five-deep {Supernovas} dig -- OP05-034 Baby 5's price and shape. No
      // once-per-turn clause is printed; resting the source is what limits it
      // to one use while it stays rested, so `requires` carries both costs.
      "ST02-007",
      {
        oncePerTurn: false,
        requires: { activeDon: 1, sourceActive: true },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 1 },
              { kind: "rest", binding: SOURCE_BINDING },
              lookAndAdd(5, "st02-bonney-look", { type: "Supernovas" }).effect,
            ],
          },
        },
      },
    ],
  ],
};
