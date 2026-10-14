/**
 * OP-16 Green/Blue Luffy.
 *
 * Card data for these identities lives in `packages/cards/src/op16-luffy.ts`.
 */
import { type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

export const op16LuffyMechanics: SetMechanics = {
  onPlay: [
    // --- migrated from the bespoke createOnPlayEffect chain -------------------
    // OP16-054 Mr.3 / OP16-055 Bon Kurei: [On Play] Draw 1.
    ...(["OP16-054", "OP16-055"] as const).map(
      (cardNumber): [string, MechanicProgram] => [
        cardNumber,
        { effect: { kind: "draw", player: "self", count: 1 } },
      ],
    ),
    [
      // OP16-032 Magellan: [On Play] up to 1 of your opponent's Characters other
      // than [Monkey.D.Luffy] cannot be rested until the end of their next turn.
      "OP16-032",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            excludeName: "Monkey.D.Luffy",
          },
          bind: "prevent-rest-target",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "prevent-rest-target",
            restriction: "cannot-rest",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
  ],
};
