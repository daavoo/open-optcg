/**
 * ST-06's one card in the pool: ST06-008 Hina, a block-1 starter card
 * reprinted in block 4 on the PRB-02 page and so Standard-legal. Its record
 * lives in `packages/cards/src/generated-community.ts`, stamped by the audit's
 * community pass. Printed text is `pnpm card:text ST06-008`.
 */
import { type SetMechanics } from "./registry.js";

export const st06Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST06-008 Hina: −4 cost on one opposing Character for the turn, the
      // setup the black removal that reads cost is built around.
      "ST06-008",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "st06-hina-cost",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-cost",
            binding: "st06-hina-cost",
            amount: -4,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
  ],
};
