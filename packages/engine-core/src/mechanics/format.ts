/**
 * The ST31-ST36 format pool -- cards that come straight out of the generated
 * card list rather than out of a hand-written set module.
 */
import { type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

export const formatMechanics: SetMechanics = {
  onPlay: [
    [
      "ST35-002",
      {
        effect: {
          kind: "choose",
          selector: { player: "opponent", zone: "board" },
          bind: "power-target",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "power-target",
            amount: -3000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    ...(["ST35-004", "ST35-005"] as const).map(
      (cardNumber): [string, MechanicProgram] => [
        cardNumber,
        {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "optional",
                effect: {
                  kind: "attach-don",
                  player: "self",
                  from: "rested",
                  count: 1,
                  target: "leader",
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: ["hand", "trash"],
                  category: "character",
                  type: "Revolutionary Army",
                  maxCurrentPower: 4000,
                  excludeSource: true,
                },
                bind: "free-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "free-play" },
              },
            ],
          },
        },
      ],
    ),
    [
      "OP13-005",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "attach-don",
            player: "self",
            from: "rested",
            count: 1,
            target: "leader",
          },
        },
      },
    ],
    [
      // EB04-026 Bluegrass: [On Play] place up to 1 of your opponent's Characters
      // [printed text omitted -- pnpm card:text EB04-026]
      "EB04-026",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 1,
          },
          bind: "bottom-deck-target",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "bottom-deck-target",
            to: { player: "opponent", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // ST36-003 Scratchmen Apoo: the draw always happens; only the base
      // power waits on a {Supernovas} Leader (Bandai's ST36-003#1). A base
      // power setter, so it meets OP17's setters under rule 4-9-2-1.
      "ST36-003",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Supernovas",
              },
              then: {
                kind: "set-leader-base-power",
                player: "self",
                value: 7000,
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
    [
      "OP12-098",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "select",
              selector: { player: "self", zone: "deck", position: "top" },
              bind: "top-deck",
              count: 1,
              effect: {
                kind: "move",
                binding: "top-deck",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
  ],
};
