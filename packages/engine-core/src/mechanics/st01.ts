/**
 * ST-01's one card in the pool: ST01-011 Brook, a block-1 starter card
 * reprinted in block 4 and so Standard-legal, which the current Sabo (OP13-004)
 * field plays. Its record lives in `packages/cards/src/generated-community.ts`,
 * stamped by the audit's community pass. Printed text is
 * `pnpm card:text ST01-011`.
 */
import { type SetMechanics } from "./registry.js";

export const st01Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST01-011 Brook: up to 2 rested DON!! to the Leader or one Character.
      // `give-rested-don` hands its whole count to the one recipient chosen,
      // which is the printed "or 1 of your Characters".
      "ST01-011",
      { effect: { kind: "give-rested-don", player: "self", count: 2 } },
    ],
  ],
};
