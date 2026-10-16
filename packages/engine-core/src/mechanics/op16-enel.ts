/**
 * OP-16 Purple Enel: the six-card DON!! deck.
 *
 * Card data for these identities lives in `packages/cards/src/op16-enel.ts`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, skypieaDrawOnPlay } from "./shared.js";

export const op16EnelMechanics: SetMechanics = {
  eventMain: [
    [
      // OP15-075 El Thor: "[printed text omitted -- pnpm card:text OP15-075]"
      "OP15-075",
      {
        cost: 0,
        donMinus: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Enel",
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    includeLeader: true,
                  },
                  bind: "thor-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "thor-buff",
                    amount: 1_000,
                    expiresAfterTurns: 0,
                  },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCurrentPower: 3_000,
                  },
                  bind: "thor-target",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "thor-target" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP15-076 Lightning Beast Kiten: "[printed text omitted -- pnpm card:text OP15-076]"
      "OP15-076",
      {
        cost: 0,
        donMinus: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Enel",
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "draw", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "kiten-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "kiten-target",
                    amount: -1_000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP15-077 Lightning Dragon: "[printed text omitted -- pnpm card:text OP15-077]"
      "OP15-077",
      {
        cost: 0,
        donMinus: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  rested: true,
                  maxCurrentPower: 6_000,
                },
                bind: "dragon-target",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "dragon-target",
                  restriction: "cannot-refresh",
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-078 Mamaragan: "[printed text omitted -- pnpm card:text OP15-078]"
      "OP15-078",
      {
        cost: 0,
        donMinus: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  rested: false,
                  maxCurrentPower: 5_000,
                },
                bind: "mamaragan-target",
                min: 0,
                max: 1,
                effect: {
                  kind: "update",
                  binding: "mamaragan-target",
                  rested: true,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP15-074 Varie: "[printed text omitted -- pnpm card:text OP15-074]"
      //
      // The cost bump is protection, not a buff: it lifts a Character out of
      // range of the "cost N or less" removal the format leans on, and it has to
      // survive the opponent's turn to do that, hence `expiresAfterTurns: 1`
      // rather than the `0` a during-this-turn effect uses.
      "OP15-074",
      {
        cost: 0,
        donMinus: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Enel",
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "draw", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                  },
                  bind: "varie-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-cost",
                    binding: "varie-target",
                    amount: 2,
                    expiresAfterTurns: 1,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP13-076 Divine Departure: "[printed text omitted -- pnpm card:text OP13-076]"
      //
      // `restDon` rather than `donMinus`: this cost rests DON!! on the field, it
      // does not return it to the DON!! deck, which matters because the payoff
      // then asks whether any DON!! is *given* to a Leader or Character.
      "OP13-076",
      {
        cost: 0,
        restDon: 5,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "given-don",
              player: "self",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "departure-target",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "departure-target",
                amount: -8_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP05-077 Gamma Knife: "[printed text omitted -- pnpm card:text OP05-077]"
      "OP05-077",
      {
        cost: 2,
        donMinus: 1,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "gamma-target",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "gamma-target",
              amount: -5_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // OP15-061 Ohm: "[printed text omitted -- pnpm card:text OP15-061]"
      "OP15-061",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "lte",
            value: 6,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "ohm-target",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "ohm-target",
              amount: -1_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP15-066 Satori: "[printed text omitted -- pnpm card:text OP15-066]"
      //
      // The engine's convention for a look-and-reorder is that unselected cards
      // return to the bottom in reveal order, so this is expressed as choosing up
      // to one of the top two to send to the bottom.
      "OP15-066",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "lte",
            value: 6,
          },
          then: {
            kind: "choose",
            selector: { player: "self", zone: "deck", limit: 2 },
            bind: "satori-look",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "satori-look",
              to: { player: "self", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // OP15-060 Enel: "[printed text omitted -- pnpm card:text OP15-060]"
      //
      // Not once per turn -- the printed text has no such clause -- but each use
      // costs a DON!! card out of a six-card deck and a card out of hand, which
      // is the real limit.
      //
      // The DON!! −1 is not wrapped in `optional` the way an `[On Play]` cost is:
      // there the trigger is automatic so the "may" has to live in the cost,
      // whereas here choosing to activate *is* the "may", and having chosen it
      // the cost is paid.
      "OP15-060",
      {
        oncePerTurn: false,
        requires: { fieldDon: 1, handCards: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "return-don", player: "self", count: 1 },
              {
                kind: "grant-keyword",
                binding: SOURCE_BINDING,
                keyword: "Blocker",
                expiresAfterTurns: 1,
              },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "enel-blocker-discard",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "enel-blocker-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
  ],
  onPlay: [
    // --- OP-16 Purple Enel --------------------------------------------------------
    ["OP15-061", skypieaDrawOnPlay],
    ["OP15-066", skypieaDrawOnPlay],
    ["OP15-067", skypieaDrawOnPlay],
    ["OP15-063", skypieaDrawOnPlay],
    [
      // OP09-072 Franky: "[printed text omitted -- pnpm card:text OP09-072]"
      //
      // Both halves of the cost sit before the colon, so neither is optional once
      // the effect is taken: the draw lives inside the `choose` rather than after
      // it, because a `choose` whose eligible set is smaller than its `min` is
      // skipped while anything sequenced after it still runs -- which would hand
      // an empty-handed player two cards for a cost they could not pay. The
      // `zone-count` gate then keeps the whole effect off the table in that case,
      // rather than offering a DON!! −2 that buys nothing. `[Blocker]` needs no
      // program: it is read off the printed text by the same static-ability pass
      // that grants OP12-063's.
      "OP09-072",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "gte",
            value: 1,
          },
          then: donMinus(2, {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "franky-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "franky-cost",
                  to: { player: "self", zone: "trash" },
                },
                { kind: "draw", player: "self", count: 2 },
              ],
            },
          }),
        },
      },
    ],
    [
      // OP16-073 Borsalino: "[printed text omitted -- pnpm card:text OP16-073]"
      //
      // The only card in the deck that puts DON!! back into a six-card DON!!
      // deck's worth of field presence without the Leader ability, which is why
      // the guide calls it a DON!! extender rather than a body.
      "OP16-073",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "add-don", player: "self", count: 1, rested: false },
            { kind: "add-don", player: "self", count: 1, rested: true },
          ],
        },
      },
    ],
    [
      // OP10-067 Senor Pink: "[printed text omitted -- pnpm card:text OP10-067]"
      "OP10-067",
      {
        effect: donMinus(1, {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                category: "event",
                color: "Purple",
                maxCost: 5,
              },
              bind: "pink-recover",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "pink-recover",
                to: { player: "self", zone: "hand" },
              },
            },
            // The printed clause sets a DON!! already on the field active;
            // it adds none from the DON!! deck, so the DON!! −1 stays paid.
            { kind: "activate-don", player: "self", count: 1 },
          ],
        }),
      },
    ],
  ],
  onKo: [
    [
      // OP15-063 Gedatsu: "[printed text omitted -- pnpm card:text OP15-063]"
      //
      // Reads current power, not printed: a 4000-power body already given −2000
      // by Kiten is in range, which is how the vassal trades up.
      "OP15-063",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "lte",
            value: 6,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 2_000,
            },
            bind: "gedatsu-target",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "gedatsu-target" },
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // OP05-077 Gamma Knife: "[printed text omitted -- pnpm card:text OP05-077]" Nothing to do with its [Main] half, and the
      // refund the Enel dossier counts on when the card is hit off Life.
      "OP05-077",
      {
        effect: {
          kind: "optional",
          effect: { kind: "add-don", player: "self", count: 1, rested: false },
        },
      },
    ],
  ],
};
