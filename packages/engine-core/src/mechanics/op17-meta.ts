/**
 * The off-set identities the OP-17 meta lists reach for.
 *
 * Card data lives in `packages/cards/src/op17-meta.ts`. Three cards, one clause
 * each, plus OP13-031's static [Blocker], which is a `static-abilities.ts` row
 * rather than a program here -- a continuous ability is not a timing window.
 */
import { type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

export const op17MetaMechanics: SetMechanics = {
  onPlay: [
    [
      // ST16-004 Shanks: "[printed text omitted -- pnpm card:text ST16-004]"
      //
      // OP17-028 Bonk Punch & Monster's clause without the cost ceiling, so it
      // is the same program minus `maxCost`. `rested: true` is the whole
      // targeting restriction: an active Character is not a legal target, which
      // is what makes this a follow-up to the Shanks deck's own rest effects
      // rather than open removal.
      "ST16-004",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
          },
          bind: "st16-shanks-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "st16-shanks-ko" },
        },
      },
    ],
    [
      // OP13-031 Trafalgar Law: "[printed text omitted -- pnpm card:text OP13-031]"
      //
      // The colon makes the bounce a *cost*, not the first half of an "and":
      // declining it skips the play entirely, and paying it is mandatory at
      // exactly 1 -- hence `optional` around a `min: 1, max: 1` choose, rather
      // than two independent "up to" steps. The payoff is a genuine "up to", so
      // a player who pays and then has nothing worth playing is allowed to
      // resolve it for nothing, exactly as printed.
      //
      // Law itself is on the board by the time an [On Play] resolves, so it is
      // an eligible bounce target -- the text says "1 of your Characters" with
      // no exclusion, and returning Law to hand to rested-play a 5-drop is a
      // real line. `excludeSource` is deliberately absent.
      "OP13-031",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                },
                bind: "op13-law-bounce",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op13-law-bounce",
                  to: { player: "self", zone: "hand" },
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  maxCost: 5,
                },
                bind: "op13-law-play",
                min: 0,
                max: 1,
                effect: {
                  kind: "play",
                  binding: "op13-law-play",
                  rested: true,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP08-051 Buckin: "[printed text omitted -- pnpm card:text OP08-051]"
      //
      // [Your Turn] adds nothing to an [On Play] -- a card is only ever played
      // on its controller's turn -- so there is no condition to write for it.
      // The clause is kept whole rather than dropped because "up to 1" over an
      // empty candidate set has to resolve to nothing without stalling, and in
      // the Xebec list the set is always empty: it runs no [Edward Weevil].
      "OP08-051",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            name: "Edward Weevil",
          },
          bind: "op08-buckin-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op08-buckin-buff",
            amount: 2000,
            expiresAfterTurns: 0,
          },
        },
      },
    ] satisfies [string, MechanicProgram],
  ],
};
