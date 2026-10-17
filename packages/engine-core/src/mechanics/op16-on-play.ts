/** OP16 `[On Play]` programs. */
import { SOURCE_BINDING, restableCards } from "../mechanics.js";
import { ace118Search } from "./op16-triggers.js";
import { revealEightThousand, trashEightThousand } from "./op16-shared.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd, lookAndAddOrTrash } from "./shared.js";

export const op16OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP16-002 Izo: "[printed text omitted -- pnpm card:text OP16-002]"
      "OP16-002",
      revealEightThousand("op16-izo-reveal", {
        kind: "draw",
        player: "self",
        count: 1,
      }),
    ],
    [
      // OP16-003 Edward.Newgate: "[printed text omitted -- pnpm card:text OP16-003]"
      //
      // Two revealed, not one, so this does not use the shared template: the
      // count is the price, and the shell's biggest body asks for proof that the
      // hand still holds two more. Its `[Your Turn]` Leader buff is a static
      // aura in `static-abilities.ts`.
      "OP16-003",
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
                  zone: "hand",
                  category: "character",
                  minPower: 8000,
                  maxPower: 8000,
                },
                bind: "op16-newgate-reveal",
                min: 2,
                max: 2,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "reveal", binding: "op16-newgate-reveal" },
                    {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                      },
                      bind: "op16-newgate-debuff",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "modify-power",
                        binding: "op16-newgate-debuff",
                        amount: -6000,
                        expiresAfterTurns: 0,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-006 Shanks: "[printed text omitted -- pnpm card:text OP16-006]"
      //
      // `maxCurrentPower`, because the printed clause says "power" rather than
      // "base power": DON!! given to a Character puts it out of reach.
      "OP16-006",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 2,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCurrentPower: 4000,
                  },
                  bind: "op16-shanks-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op16-shanks-ko" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-007 Jozu: "[printed text omitted -- pnpm card:text OP16-007]"
      "OP16-007",
      revealEightThousand("op16-jozu-reveal", {
        kind: "choose",
        selector: { player: "opponent", zone: "board", category: "character" },
        bind: "op16-jozu-debuff",
        min: 0,
        max: 1,
        effect: {
          kind: "modify-power",
          binding: "op16-jozu-debuff",
          amount: -1000,
          expiresAfterTurns: 0,
        },
      }),
    ],
    [
      // OP16-008 Squard: "[printed text omitted -- pnpm card:text OP16-008]"
      //
      // The cost is a Character on the *board*, not in hand, and "base power"
      // is exactly 10000 -- the shell's Edward.Newgate. Squard itself is 7000,
      // so it can never pay with itself.
      "OP16-008",
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
                  minPower: 10_000,
                  maxPower: 10_000,
                },
                bind: "op16-squard-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op16-squard-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                        maxCurrentPower: 8000,
                      },
                      bind: "op16-squard-ko",
                      min: 0,
                      max: 1,
                      effect: { kind: "knock-out", binding: "op16-squard-ko" },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-009 Speed Jil: "[printed text omitted -- pnpm card:text OP16-009]"
      //
      // The only card in the shell that *trashes* the 8000 rather than showing
      // it, and it buys a lasting buff for it: `expiresAfterTurns: 1` on both
      // halves, so the body is still 7000 defending on the way back.
      "OP16-009",
      trashEightThousand("op16-speed-jil-cost", {
        kind: "sequence",
        effects: [
          {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Rush",
            expiresAfterTurns: 1,
          },
          {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 2000,
            expiresAfterTurns: 1,
          },
        ],
      }),
    ],
    [
      // OP16-010 Namule: "[printed text omitted -- pnpm card:text OP16-010]"
      //
      // "Base power", so `maxPower` reads the printed number and DON!! given to
      // the target does not save it.
      "OP16-010",
      revealEightThousand("op16-namule-reveal", {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxPower: 2000,
        },
        bind: "op16-namule-ko",
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: "op16-namule-ko" },
      }),
    ],
    [
      // OP16-011 Vista: "[printed text omitted -- pnpm card:text OP16-011]" Its `[DON!! x1] [When Attacking]`
      // half is in `op16-battle.ts`.
      "OP16-011",
      revealEightThousand("op16-vista-reveal", {
        kind: "draw",
        player: "self",
        count: 1,
      }),
    ],
    [
      // OP16-012 Benn.Beckman: "[printed text omitted -- pnpm card:text OP16-012]"
      //
      // Both conditions sit after the colon, so the DON!! is rested whether or
      // not they hold -- and the 10-DON!! one means this is a late-game play by
      // construction, since resting the DON!! does not remove it from the field.
      "OP16-012",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Red-Haired Pirates",
                  },
                  then: {
                    kind: "if",
                    condition: {
                      kind: "field-don",
                      player: "self",
                      operator: "gte",
                      value: 10,
                    },
                    then: {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "hand",
                        category: "character",
                        name: "Shanks",
                      },
                      bind: "op16-beckman-play",
                      min: 0,
                      max: 1,
                      effect: { kind: "play", binding: "op16-beckman-play" },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-118 Portgas.D.Ace: the `[On Play]` half of the search it also
      // prints as `[On K.O.]`. The program itself lives in `op16-triggers.ts`
      // next to the other half, so the two cannot drift.
      "OP16-118",
      ace118Search,
    ],
    [
      // OP16-021 Moby Dick: "[printed text omitted -- pnpm card:text OP16-021]" Its `[Activate: Main]` half is in `op16-main.ts`.
      //
      // No filter on what may be added -- the Stage digs for whatever the shell
      // is missing -- and no "reveal" in the printed text, so the card added
      // stays private to its owner.
      "OP16-021",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Whitebeard Pirates",
          },
          then: lookAndAdd(3, "op16-moby-look", {}).effect,
        },
      },
    ],
    [
      // OP16-030 Trafalgar Law: "[printed text omitted -- pnpm card:text OP16-030]" Its `[End of Your Turn]` half is in `op16-triggers.ts`.
      "OP16-030",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
          },
          bind: "op16-law-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "op16-law-lock",
            restriction: "cannot-refresh",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP16-035 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP16-035]"
      //
      // "Cards", so the Leader is a legal target -- `includeLeader`. The
      // DON!! go to the Leader alone, so the gift names it as the only
      // recipient; "up to 3" leaves the count to the player.
      "OP16-035",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: restableCards("opponent"),
              bind: "op16-zoro-rest",
              min: 0,
              max: 1,
              effect: { kind: "rest", binding: "op16-zoro-rest" },
            },
            {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "choose",
                    selector: { player: "self", zone: "hand" },
                    bind: "op16-zoro-cost",
                    min: 1,
                    max: 1,
                    effect: {
                      kind: "sequence",
                      effects: [
                        {
                          kind: "move",
                          binding: "op16-zoro-cost",
                          to: { player: "self", zone: "trash" },
                        },
                        {
                          kind: "give-rested-don",
                          player: "self",
                          count: 3,
                          recipient: "leader",
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    [
      // OP16-036 Mr.2.Bon.Kurei(Bentham): "[printed text omitted -- pnpm card:text OP16-036]" Its `[When Attacking]`
      // half is in `op16-battle.ts`.
      "OP16-036",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 4,
            canRest: true,
          },
          bind: "op16-bentham-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op16-bentham-rest" },
        },
      },
    ],
    [
      // OP16-037 Mr.3(Galdino): "[printed text omitted -- pnpm card:text OP16-037]"
      "OP16-037",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Impel Down",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 5,
              canRest: true,
            },
            bind: "op16-galdino-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op16-galdino-rest" },
          },
        },
      },
    ],
    [
      // OP16-050 Miss Olive: "[printed text omitted -- pnpm card:text OP16-050]"
      //
      // Olive itself costs 5 and is on the board by the time this runs, so it
      // can bounce itself -- the printed text does not exclude it, and doing so
      // is a real (if usually bad) line.
      "OP16-050",
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
                  minCost: 2,
                },
                bind: "op16-olive-bounce",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op16-olive-bounce",
                      to: { player: "self", zone: "hand" },
                    },
                    { kind: "draw", player: "self", count: 2 },
                    {
                      kind: "choose",
                      selector: { player: "self", zone: "hand" },
                      bind: "op16-olive-discard",
                      min: 1,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op16-olive-discard",
                        to: { player: "self", zone: "trash" },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-051 Mohji & Cabaji: "[printed text omitted -- pnpm card:text OP16-051]" The count is read after this card has left the
      // hand, which is what makes a 6-card hand qualify on the way in.
      "OP16-051",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "lte",
            value: 5,
          },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP16-063 Kuzan: "[printed text omitted -- pnpm card:text OP16-063]" Its `[Activate: Main]` half is in `op16-main.ts`.
      "OP16-063",
      {
        effect: { kind: "add-don", player: "self", count: 2, rested: true },
      },
    ],
    [
      // OP16-064 Koby: "[printed text omitted -- pnpm card:text OP16-064]"
      "OP16-064",
      lookAndAdd(5, "op16-koby-look", { type: "Navy", excludeName: "Koby" }),
    ],
    [
      // OP16-066 Sengoku: "[printed text omitted -- pnpm card:text OP16-066]"
      //
      // Both sentences sit inside the Leader check: the printed "Then" continues
      // the conditional, so under any other Leader the card is a plain body.
      "OP16-066",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Navy",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "add-don", player: "self", count: 2, rested: true },
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op16-sengoku-discard",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op16-sengoku-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-067 Tsuru: "[printed text omitted -- pnpm card:text OP16-067]"
      //
      // The discard is not a cost -- it comes after the search and is mandatory,
      // so the card just found is an eligible thing to pitch.
      "OP16-067",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op16-tsuru-look", { type: "Navy" }).effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op16-tsuru-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op16-tsuru-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP16-065 Sakazuki: "[printed text omitted -- pnpm card:text OP16-065]"
      //
      // `expiresAfterTurns: 1` is what makes this removal rather than tempo: a
      // −6000 that survives the opponent's turn takes most bodies off the board
      // for the Navy shell's own attacks.
      "OP16-065",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op16-sakazuki-debuff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op16-sakazuki-debuff",
            amount: -6000,
            expiresAfterTurns: 1,
          },
        }),
      },
    ],
    [
      // OP16-068 Trafalgar Law: "[printed text omitted -- pnpm card:text OP16-068]" Its `[When Attacking]` half is in
      // `op16-battle.ts`.
      "OP16-068",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // OP16-069 Donquixote Doflamingo: "[printed text omitted -- pnpm card:text OP16-069]" One clause on two
      // timings, registered in both tables.
      "OP16-069",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // OP16-070 Donquixote Rosinante: "[printed text omitted -- pnpm card:text OP16-070]"
      //
      // Net zero active DON!! this turn and +1 on the field, which is ramp the
      // Purple shell cashes in next turn. The Leader check sits after the colon,
      // so the DON!! is rested either way.
      "OP16-070",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 2,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Navy",
                  },
                  then: {
                    kind: "add-don",
                    player: "self",
                    count: 1,
                    rested: true,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-071 Benevolent King of the Waves: "[printed text omitted -- pnpm card:text OP16-071]" Its `[On K.O.]` half is in `op16-triggers.ts`.
      "OP16-071",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op16-benevolent-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op16-benevolent-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    { kind: "add-don", player: "self", count: 1, rested: true },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-072 Hannyabal: "[printed text omitted -- pnpm card:text OP16-072]"
      "OP16-072",
      lookAndAdd(5, "op16-hannyabal-look", { type: "Impel Down" }),
    ],
    [
      // OP16-074 Magellan: "[printed text omitted -- pnpm card:text OP16-074]" Its `[On K.O.]` half is in `op16-triggers.ts`.
      "OP16-074",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Impel Down",
          },
          then: { kind: "return-don", player: "opponent", count: 1 },
        },
      },
    ],
    [
      // OP16-075 Monkey.D.Garp: "[printed text omitted -- pnpm card:text OP16-075]"
      //
      // Two DON!! in different states, so two `add-don` nodes rather than one at
      // `count: 2`: only the first is usable this turn.
      "OP16-075",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Navy",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "add-don", player: "self", count: 1, rested: false },
              { kind: "add-don", player: "self", count: 1, rested: true },
            ],
          },
        },
      },
    ],
    [
      // OP16-078 Marineford: "[printed text omitted -- pnpm card:text OP16-078]" Its
      // `[Activate: Main]` half is in `op16-main.ts`.
      "OP16-078",
      lookAndAdd(5, "op16-marineford-look", { type: "Navy" }),
    ],
    [
      // OP16-082 Kin'emon: "[printed text omitted -- pnpm card:text OP16-082]"
      //
      // "Trash the rest", not bottom-of-deck: this is Black, and the four cards
      // it throws away are fuel its own archetype spends. Its printed "+3 cost"
      // is a static layer.
      "OP16-082",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Land of Wano",
          },
          then: lookAndAddOrTrash(5, "op16-kinemon-look", {
            type: "Land of Wano",
          }).effect,
        },
      },
    ],
    [
      // OP16-083 Kouzuki Oden: "[printed text omitted -- pnpm card:text OP16-083]"
      "OP16-083",
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
                  zone: "hand",
                  category: "character",
                  minCost: 8,
                },
                bind: "op16-oden-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op16-oden-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    { kind: "draw", player: "self", count: 2 },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-085 Kouzuki Momonosuke: "[printed text omitted -- pnpm card:text OP16-085]"
      "OP16-085",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            type: "Land of Wano",
            maxCost: 6,
            excludeName: "Kouzuki Momonosuke",
          },
          bind: "op16-momo-revive",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op16-momo-revive" },
        },
      },
    ],
    [
      // OP16-087 Shinobu: "[printed text omitted -- pnpm card:text OP16-087]"
      //
      // The +20 exists for exactly one card: OP16-084's own activation asks
      // whether it costs 20 or more. Shinobu trashes itself first, so the cost
      // is paid whether or not the Leader matches.
      "OP16-087",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "move",
                binding: SOURCE_BINDING,
                to: { player: "self", zone: "trash" },
              },
              {
                kind: "if",
                condition: {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Land of Wano",
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
                        name: "Kouzuki Momonosuke",
                      },
                      bind: "op16-shinobu-buff",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "modify-cost",
                        binding: "op16-shinobu-buff",
                        amount: 20,
                        expiresAfterTurns: 0,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-089 Dracule Mihawk: "[printed text omitted -- pnpm card:text OP16-089]"
      //
      // A cost debuff, not a power one: −4 cost is what puts a Character inside
      // the reach of the set's "cost N or less" removal.
      "OP16-089",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op16-mihawk-discard",
              min: 2,
              max: 2,
              effect: {
                kind: "move",
                binding: "op16-mihawk-discard",
                to: { player: "self", zone: "trash" },
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op16-mihawk-cost",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-cost",
                binding: "op16-mihawk-cost",
                amount: -4,
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
    [
      // OP16-090 Tony Tony.Chopper: "[printed text omitted -- pnpm card:text OP16-090]"
      "OP16-090",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op16-chopper-discard",
              min: 2,
              max: 2,
              effect: {
                kind: "move",
                binding: "op16-chopper-discard",
                to: { player: "self", zone: "trash" },
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 1,
              },
              bind: "op16-chopper-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op16-chopper-ko" },
            },
          ],
        },
      },
    ],
    [
      // OP16-091 Nami: "[printed text omitted -- pnpm card:text OP16-091]"
      "OP16-091",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Land of Wano",
          },
          then: lookAndAddOrTrash(4, "op16-nami-look", {
            type: "Land of Wano",
            excludeName: "Nami",
          }).effect,
        },
      },
    ],
    [
      // OP16-092 Nico Robin: "[printed text omitted -- pnpm card:text OP16-092]"
      "OP16-092",
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
                  zone: "hand",
                  category: "character",
                  minCost: 8,
                },
                bind: "op16-robin-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op16-robin-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    { kind: "draw", player: "self", count: 2 },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-093 Bartholomew Kuma: "[printed text omitted -- pnpm card:text OP16-093]"
      "OP16-093",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op16-kuma-discard",
              min: 2,
              max: 2,
              effect: {
                kind: "move",
                binding: "op16-kuma-discard",
                to: { player: "self", zone: "trash" },
              },
            },
            { kind: "give-rested-don", player: "self", count: 1 },
          ],
        },
      },
    ],
    [
      // OP16-095 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP16-095]"
      "OP16-095",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            color: "Black",
            type: "Land of Wano",
          },
          bind: "op16-luffy095-unblockable",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "op16-luffy095-unblockable",
            keyword: "Unblockable",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP16-097 Yamato: "[printed text omitted -- pnpm card:text OP16-097]"
      //
      // The order matters: the card recovered is in hand before the play, so a
      // cost-2-or-less recovery can be deployed on the same resolution.
      "OP16-097",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                category: "character",
                type: "Land of Wano",
                maxCost: 6,
              },
              bind: "op16-yamato097-recover",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op16-yamato097-recover",
                to: { player: "self", zone: "hand" },
              },
            },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                maxCost: 2,
              },
              bind: "op16-yamato097-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op16-yamato097-play" },
            },
          ],
        },
      },
    ],
    [
      // OP16-098 Yamato: "[printed text omitted -- pnpm card:text OP16-098]" Its `[Activate: Main]` half is in `op16-main.ts`.
      "OP16-098",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op16-yamato098-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op16-yamato098-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP16-108 Shiryu: "[printed text omitted -- pnpm card:text OP16-108]"
      //
      // Face-up on Life, which is what Yellow's own payoffs read: a face-up Life
      // card is a resource other cards spend, not just a buffer.
      "OP16-108",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op16-shiryu-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op16-shiryu-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "trash",
                        type: "Blackbeard Pirates",
                        maxCost: 6,
                      },
                      bind: "op16-shiryu-life",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op16-shiryu-life",
                        to: { player: "self", zone: "life", position: "top" },
                        faceUp: true,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  ],
};
