/**
 * OP-04 "Kingdoms of Intrigue", for the identities still in the pool.
 *
 * OP-04 is block 1 and rotated out of Standard, so the set is not imported
 * whole. Three of its cards stay legal by Bandai's block-number ruling and the
 * OP10-042 Usopp feature deck plays all three; their records are in
 * `packages/cards/src/generated-community.ts`, stamped by the audit's
 * community pass. Printed text for any card here is `pnpm card:text <CARD>`.
 *
 * OP04-077 Ideo prints nothing but [Blocker], which `cardFacts` derives, and
 * OP04-096 Corrida Coliseum is continuous, so it is a row in
 * `op04-static.ts` instead of a program here.
 */
import { type SetMechanics } from "./registry.js";

export const op04Mechanics: SetMechanics = {
  onPlay: [
    [
      // OP04-083 Sabo: "[printed text omitted -- pnpm card:text OP04-083]"
      //
      // `effect-ko-immune` rather than OP10-070 Trebol's `ko-immune`: the
      // clause names no player, so its controller's own K.O. effects are
      // stopped too. It lands on the Characters on the field when it resolves
      // -- Sabo among them -- and a body played afterwards is not covered.
      // `expiresAfterTurns: 1` runs through the opponent's turn, which is
      // where "until the start of your next turn" ends.
      //
      // The trash is the second half of the draw, not a cost, so it is
      // mandatory and may take the cards just drawn.
      "OP04-083",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
              },
              bind: "op04-sabo-protected",
              count: "all",
              effect: {
                kind: "restrict",
                binding: "op04-sabo-protected",
                restriction: "effect-ko-immune",
                expiresAfterTurns: 1,
              },
            },
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op04-sabo-discard",
              min: 2,
              max: 2,
              effect: {
                kind: "move",
                binding: "op04-sabo-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
  ],
};
