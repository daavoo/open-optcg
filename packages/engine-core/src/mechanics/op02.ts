/**
 * OP-02 identities the pool carries without the set.
 *
 * OP-02 is block 1 and is not imported whole; its cards arrive one at a time
 * through the audit's community pass. OP02-013 Portgas.D.Ace stays
 * Standard-legal through a Super Parallel `X` printing, which never rotates.
 * Card data lives in `packages/cards/src/generated-community.ts`, and printed
 * text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

export const op02Mechanics: SetMechanics = {
  onPlay: [
    [
      // OP02-013 Portgas.D.Ace: up to two −3000 debuffs for the turn, then
      // [Rush] on itself under a Whitebeard Pirates Leader. The Leader gate
      // covers only the second sentence, so the debuffs resolve under any
      // Leader and the program stays on offer with an empty opposing board.
      "OP02-013",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op02-ace-debuff",
              min: 0,
              max: 2,
              effect: {
                kind: "modify-power",
                binding: "op02-ace-debuff",
                amount: -3_000,
                expiresAfterTurns: 0,
              },
            },
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Whitebeard Pirates",
              },
              then: {
                kind: "grant-keyword",
                binding: SOURCE_BINDING,
                keyword: "Rush",
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
  ],
};
