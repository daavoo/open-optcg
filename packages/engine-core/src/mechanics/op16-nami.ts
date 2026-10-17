/**
 * OP-16 Blue/Yellow Nami: the Thriller Bark recursion package.
 *
 * Card data for these identities lives in `packages/cards/src/op16-nami.ts`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  asOnPlayTrigger,
  lifeToHandCost,
  playThrillerBarkFromTrashRested,
  preventCostSixAttack,
  rayleighRemoval,
  thrillerBarkInTrash,
} from "./shared.js";

export const op16NamiMechanics: SetMechanics = {
  activateMain: [
    [
      // P-096 Girl: "[printed text omitted -- pnpm card:text P-096]"
      //
      // The recipient is any card named Nami, with no category, so the Nami
      // Leader the deck is built on qualifies alongside a Nami Character --
      // `give-rested-don` is the node that offers the Leader.
      "P-096",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 1,
            name: "Nami",
          },
        },
      },
    ],
    [
      // OP15-114 Wyper: "[printed text omitted -- pnpm card:text OP15-114]"
      //
      // The `give-rested-don` node with its type filter: only a {Sky Island}
      // Leader or a {Sky Island} Character is offered, and "up to" lets the
      // activation decline. The pre-`give-rested-don` shape was Characters-only
      // -- `attach-don` targets either the Leader or a binding, not a choice
      // between them -- so the Leader half was unreachable.
      "OP15-114",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 1,
            type: "Sky Island",
          },
        },
      },
    ],
  ],
  onPlay: [
    [
      "EB03-053",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "attach-don",
              player: "self",
              from: "rested",
              count: 1,
              target: "leader",
            },
            {
              kind: "if",
              condition: {
                kind: "zone-count",
                player: "opponent",
                zone: "life",
                operator: "gte",
                value: 3,
              },
              then: {
                kind: "optional",
                effect: {
                  kind: "select",
                  selector: {
                    player: "opponent",
                    zone: "life",
                    position: "top",
                  },
                  bind: "opponent-life",
                  count: 1,
                  effect: {
                    kind: "move",
                    binding: "opponent-life",
                    to: { player: "opponent", zone: "hand" },
                  },
                },
              },
            },
          ],
        },
      },
    ],
    [
      "EB03-055",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "select",
            selector: { player: "self", zone: "life", position: "top" },
            bind: "trashed-life",
            count: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "trashed-life",
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Straw Hat Crew",
                  },
                  then: {
                    kind: "select",
                    selector: { player: "self", zone: "deck", limit: 2 },
                    bind: "replacement-life",
                    count: 2,
                    effect: {
                      kind: "move",
                      binding: "replacement-life",
                      to: { player: "self", zone: "life", position: "top" },
                      faceUp: false,
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
      // OP16-119 Marshall.D.Teach: "[printed text omitted -- pnpm card:text OP16-119]"
      //
      // The reason to spend eight DON!! on this body is the Life card, and for a
      // while the engine gave you the body only: an LLM run stated the Life gain in
      // its rationale, gained none, and lost two turns later.
      //
      // The three cards stay in the deck while they are looked at -- `look-at`
      // binds them so that "the rest" is still nameable once one of them has left
      // for Life, which no combination of zone and count can express. "In any
      // order" resolves as the order they were looked at, the same simplification
      // the `search-top-five` pending effect makes for the four cards that print
      // it.
      "OP16-119",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "look-at", player: "self", count: 3, bind: "teach-looked" },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "deck",
                binding: "teach-looked",
              },
              bind: "teach-life",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "teach-life",
                to: { player: "self", zone: "life", position: "top" },
                faceUp: false,
              },
            },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "teach-looked",
              },
              bind: "teach-rest",
              count: 3,
              effect: {
                kind: "move",
                binding: "teach-rest",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP14-104 Gecko Moria: "[printed text omitted -- pnpm card:text OP14-104]"
      //
      // The mode is asked first and the card second, so declining is one action
      // rather than a branch chosen and then abandoned. Each branch selects with
      // `min: 0`, so a branch taken with an empty trash resolves to nothing
      // instead of presenting a choice with no options.
      "OP14-104",
      {
        effect: {
          kind: "choice",
          branches: [
            {
              id: "play",
              label: "Play a Thriller Bark Character from your trash",
              effect: {
                kind: "choose",
                selector: thrillerBarkInTrash,
                bind: "moria-target",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "moria-target" },
              },
            },
            {
              id: "life",
              label:
                "Add a Thriller Bark Character from your trash face-up to the top of your Life cards",
              effect: {
                kind: "choose",
                selector: thrillerBarkInTrash,
                bind: "moria-target",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "moria-target",
                  to: { player: "self", zone: "life", position: "top" },
                  faceUp: true,
                },
              },
            },
            { id: "skip", label: "Select no card" },
          ],
        },
      },
    ],
    [
      "OP15-114",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "select",
            selector: { player: "self", zone: "life", position: "top" },
            bind: "face-up-life",
            count: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "update", binding: "face-up-life", faceUp: true },
                {
                  kind: "select",
                  selector: { player: "opponent", zone: "board", limit: 5 },
                  bind: "opponent-board",
                  count: 5,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "modify-power",
                        binding: "opponent-board",
                        amount: -2000,
                        expiresAfterTurns: 0,
                      },
                      {
                        kind: "select",
                        selector: {
                          player: "opponent",
                          zone: "board",
                          maxCurrentPower: 0,
                          limit: 5,
                        },
                        bind: "zero-power",
                        count: 5,
                        effect: { kind: "knock-out", binding: "zero-power" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
    // --- OP-15 Blue/Yellow Nami --------------------------------------------------
    [
      // P-096 Girl: [On Play] Draw 1 card and trash 1 card from your hand.
      "P-096",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "girl-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "girl-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP15-047 Sanji: [On Play] Up to 1 of your Characters gains [Unblockable]
      // during this turn.
      "OP15-047",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", category: "character" },
          bind: "unblockable-target",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "unblockable-target",
            keyword: "Unblockable",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP09-112 Belo Betty: [On Play] If you have 2 or less Life cards, draw 1.
      "OP09-112",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 2,
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP13-054 Yamato: [On Play] If you have 3 or less Life cards, draw 2 cards.
      // [printed text omitted -- pnpm card:text OP13-054]
      //
      // "Then" makes the second clause depend on the first having resolved, so the
      // DON!! gift sits inside the conditional rather than beside it.
      "OP13-054",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 3,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
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
            ],
          },
        },
      },
    ],
    [
      // OP14-108 Silvers Rayleigh: [On Play] If your Leader is multicolored and
      // [printed text omitted -- pnpm card:text OP14-108]
      "OP14-108",
      rayleighRemoval,
    ],
    [
      "OP13-042",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "discard",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "discard",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "optional",
                    effect: {
                      kind: "attach-don",
                      player: "self",
                      from: "rested",
                      count: 2,
                      target: "leader",
                    },
                  },
                  {
                    kind: "choose",
                    selector: { player: "self", zone: "board" },
                    bind: "don-target",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "attach-don",
                      player: "self",
                      from: "rested",
                      count: 2,
                      target: { binding: "don-target" },
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
      "EB04-058",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 2,
          },
          then: {
            kind: "select",
            selector: { player: "self", zone: "deck", position: "top" },
            bind: "new-life",
            count: 1,
            effect: {
              kind: "move",
              binding: "new-life",
              to: { player: "self", zone: "life", position: "top" },
              faceUp: false,
            },
          },
        },
      },
    ],
    [
      "OP15-113",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "discard",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "discard",
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "select",
                  selector: { player: "self", zone: "deck", position: "top" },
                  bind: "new-life",
                  count: 1,
                  effect: {
                    kind: "move",
                    binding: "new-life",
                    to: { player: "self", zone: "life", position: "top" },
                    faceUp: false,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    ["OP14-111", preventCostSixAttack],
    [
      "OP06-106",
      lifeToHandCost({
        kind: "choose",
        selector: { player: "self", zone: "hand" },
        bind: "replacement-life",
        min: 0,
        max: 1,
        effect: {
          kind: "move",
          binding: "replacement-life",
          to: { player: "self", zone: "life", position: "top" },
        },
      }),
    ],
    [
      "OP11-106",
      lifeToHandCost({
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxCost: 5,
        },
        bind: "ko-target",
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: "ko-target" },
      }),
    ],
  ],
  onKo: [
    ["PRB02-008", { effect: { kind: "draw", player: "self", count: 2 } }],
    [
      "OP06-104",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "life",
            operator: "lte",
            value: 3,
          },
          then: {
            kind: "select",
            selector: { player: "self", zone: "deck", position: "top" },
            bind: "new-life",
            count: 1,
            effect: {
              kind: "move",
              binding: "new-life",
              to: { player: "self", zone: "life", position: "top" },
              faceUp: false,
            },
          },
        },
      },
    ],
    ["OP14-111", preventCostSixAttack],
    [
      "OP14-110",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            maxCost: 4,
            hasTrigger: true,
            excludeName: "Dr. Hogback",
            excludeSource: true,
          },
          bind: "free-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "free-play" },
        },
      },
    ],
    [
      // EB03-055 Nico Robin: "[printed text omitted -- pnpm card:text EB03-055]"
      //
      // `[Opponent's Turn]` is a real gate, not decoration: trading Robin off on
      // your own turn deals nothing. An `[On K.O.]` is dispatched from wherever the
      // Character died and has no reaction rule to hang a turn check on, which is
      // what the `turn-player` condition is for.
      //
      // The damage itself is the only one in the format dealt outside the battle
      // steps; `dealDamage` in `life.ts` is the primitive, and the Trigger the
      // damaged Life card may carry is settled by `settleEffectDamage` on the way
      // out of the action.
      "EB03-055",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "opponent" },
          then: {
            kind: "optional",
            effect: { kind: "deal-damage", player: "opponent" },
          },
        },
      },
    ],
    [
      // EB03-053 Nami: "[printed text omitted -- pnpm card:text EB03-053]"
      //
      // The face-up flip is the cost, so it is a `choose` with `min: 1` rather
      // than a `select`: an empty selection skips the whole clause, where a
      // `select` would bind nothing and let the play resolve unpaid.
      "EB03-053",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "life",
              position: "top",
              faceUp: false,
            },
            bind: "nami-life-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "update", binding: "nami-life-cost", faceUp: true },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    category: "character",
                    maxPower: 6000,
                  },
                  bind: "nami-free-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "nami-free-play" },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  trigger: [
    ["OP14-102", playThrillerBarkFromTrashRested],
    ["OP14-110", playThrillerBarkFromTrashRested],
    // Perona prints the same Trigger as Kumacy and Dr. Hogback. It went
    // unregistered while its [On Play]/[On K.O.] were implemented, so the card
    // counted as covered and the Trigger silently added it to hand instead.
    ["OP14-111", playThrillerBarkFromTrashRested],
    [
      // OP06-104 Kikunojo: "[printed text omitted -- pnpm card:text OP06-104]"
      "OP06-104",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "life",
            operator: "lte",
            value: 3,
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // OP14-104 Gecko Moria: "[printed text omitted -- pnpm card:text OP14-104]" Wider than its own [On Play]: any
      // Character, not only {Thriller Bark Pirates}, and it arrives active.
      "OP14-104",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            maxCost: 4,
            excludeSource: true,
          },
          bind: "free-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "free-play" },
        },
      },
    ],
    [
      // OP09-112 Belo Betty: "[printed text omitted -- pnpm card:text OP09-112]"
      //
      // Needs `SOURCE_BINDING`, which is why it went unregistered until the DSL
      // had one: a program that cannot name its own card cannot express "play this
      // card", and a program that no-ops would still have been offered.
      "OP09-112",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Revolutionary Army",
          },
          then: {
            kind: "if",
            condition: { kind: "combined-life", operator: "lte", value: 5 },
            then: { kind: "play", binding: SOURCE_BINDING },
          },
        },
      },
    ],
    // OP14-108 Silvers Rayleigh: [Trigger] Activate this card's [On Play] effect.
    ["OP14-108", asOnPlayTrigger(rayleighRemoval)],
    [
      // OP16-119 Marshall.D.Teach: "[printed text omitted -- pnpm card:text OP16-119]"
      //
      // Both halves are offered even when only one has a target, because negating
      // and K.O.ing are separate "up to 1"s: the best line against a protected
      // Character is to negate the protection and K.O. the same card.
      "OP16-119",
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
              bind: "teach-negate",
              min: 0,
              max: 1,
              effect: {
                kind: "negate",
                binding: "teach-negate",
                expiresAfterTurns: 0,
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 5,
              },
              bind: "teach-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "teach-ko" },
            },
          ],
        },
      },
    ],
  ],
};
