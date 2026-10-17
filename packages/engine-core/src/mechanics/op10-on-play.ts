/**
 * OP10 `[On Play]` programs.
 *
 * OP10 "Royal Blood" is a whole 119-card series, so its programs are split by
 * the timing window they fire in, the way OP14-OP17 are: see
 * `mechanics/README.md`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  lifeEndToHand,
  restDressrosaLeaderOrStage,
  restOwnLeaderOrStage,
  trashOpponentLifeTop,
} from "./op10-shared.js";
import { donMinus, lookAndAdd, payFromHand } from "./shared.js";

/** "If you have 2 or more rested Characters" -- the Green ODYSSEY package's gate. */
const twoRestedCharacters = {
  kind: "selector-count",
  player: "self",
  selector: { zone: "board", category: "character", rested: true },
  operator: "gte",
  value: 2,
} as const;

export const op10OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP10-004 Vergo: "[printed text omitted -- pnpm card:text OP10-004]"
      //
      // `excludeName` is the "other than [Vergo]": a second copy of this card is
      // not what the search is for.
      "OP10-004",
      lookAndAdd(5, "op10-vergo-look", {
        type: "Punk Hazard",
        excludeName: "Vergo",
      }),
    ],
    [
      // OP10-006 Caesar Clown: "[printed text omitted -- pnpm card:text OP10-006]"
      //
      // The play comes *after* the search, and out of hand rather than out of
      // the looked-at cards -- so the Smiley just added is a legal thing to
      // play, which is the whole combo. A Smiley already in hand is equally
      // legal, which is why the second half is its own `choose` over the hand
      // instead of reading the search's binding.
      "OP10-006",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op10-caesar-look", { name: "Smiley" }).effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand", name: "Smiley" },
              bind: "op10-caesar-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op10-caesar-play" },
            },
          ],
        },
      },
    ],
    [
      // OP10-007 Ceaser Soldier: "[printed text omitted -- pnpm card:text OP10-007]"
      "OP10-007",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            type: "Punk Hazard",
            maxCost: 2,
          },
          bind: "op10-soldier-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op10-soldier-play" },
        },
      },
    ],
    [
      // OP10-008 Scotch: "[printed text omitted -- pnpm card:text OP10-008]"
      //
      // "If you don't have" is a board question, so it counts [Rock] on the
      // player's own board and nowhere else -- a Rock in the trash or in hand
      // does not switch the clause off. OP10-017 Rock prints the mirror of this.
      "OP10-008",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "board", name: "Rock" },
            operator: "eq",
            value: 0,
          },
          then: {
            kind: "choose",
            selector: { player: "self", zone: "hand", name: "Rock" },
            bind: "op10-scotch-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op10-scotch-play" },
          },
        },
      },
    ],
    [
      // OP10-017 Rock: "[printed text omitted -- pnpm card:text OP10-017]"
      "OP10-017",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "board", name: "Scotch" },
            operator: "eq",
            value: 0,
          },
          then: {
            kind: "choose",
            selector: { player: "self", zone: "hand", name: "Scotch" },
            bind: "op10-rock-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op10-rock-play" },
          },
        },
      },
    ],
    [
      // OP10-009 Smiley: "[printed text omitted -- pnpm card:text OP10-009]"
      "OP10-009",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Punk Hazard",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op10-smiley-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op10-smiley-debuff",
              amount: -3_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP10-015 Mocha: "[printed text omitted -- pnpm card:text OP10-015]"
      "OP10-015",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op10-mocha-debuff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op10-mocha-debuff",
            amount: -1_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP10-023 Issho: "[printed text omitted -- pnpm card:text OP10-023]"
      //
      // `canRest` keeps an already-rested Character -- and one the opponent has
      // protected from resting -- out of the offer, so neither pick is a no-op.
      "OP10-023",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-type", player: "self", type: "Navy" },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 5,
              canRest: true,
            },
            bind: "op10-issho-rest",
            min: 0,
            max: 2,
            effect: { kind: "rest", binding: "op10-issho-rest" },
          },
        },
      },
    ],
    [
      // OP10-024 Edward.Newgate: "[printed text omitted -- pnpm card:text OP10-024]"
      //
      // The order is load-bearing: the Character this rests is a legal target
      // for the K.O. that follows, which is what the two halves are printed
      // together for.
      "OP10-024",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                  canRest: true,
                },
                bind: "op10-newgate-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "op10-newgate-rest" },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  rested: true,
                  maxCost: 3,
                },
                bind: "op10-newgate-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op10-newgate-ko" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP10-025 Enel: "[printed text omitted -- pnpm card:text OP10-025]"
      //
      // The trash is the second half of the draw rather than a cost, so it is a
      // mandatory `choose` of exactly 2 after the cards land -- and the three
      // just drawn are legal discards.
      "OP10-025",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 3 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op10-enel-discard",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op10-enel-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP10-029 Dracule Mihawk: "[printed text omitted -- pnpm card:text OP10-029]"
      //
      // `update: { rested: false }` rather than `rest`'s inverse: setting a card
      // active is not a board event anything in the pool watches for, and the
      // Character this un-rests is one of the two the gate just counted.
      "OP10-029",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "ODYSSEY",
              rested: true,
              maxCost: 5,
            },
            bind: "op10-mihawk-active",
            min: 0,
            max: 1,
            effect: {
              kind: "update",
              binding: "op10-mihawk-active",
              rested: false,
            },
          },
        },
      },
    ],
    [
      // OP10-033 Nami: "[printed text omitted -- pnpm card:text OP10-033]"
      //
      // Not a spend but a theft of tempo: the opponent starts their next turn one
      // DON!! short. See `hold-don-from-refresh`, which is the only node in the
      // DSL that writes a rule the next Refresh Phase reads.
      "OP10-033",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              type: "ODYSSEY",
              rested: true,
            },
            operator: "gte",
            value: 2,
          },
          then: { kind: "hold-don-from-refresh", player: "opponent", count: 1 },
        },
      },
    ],
    [
      // OP10-043 Moocy: "[printed text omitted -- pnpm card:text OP10-043]"
      //
      // [Banish] trashes the Life card its damage takes instead of handing it to
      // the opponent, so a Luffy that connects costs them a card outright rather
      // than trading Life for hand. Turn-scoped, so `grant-keyword`.
      "OP10-043",
      restDressrosaLeaderOrStage("op10-moocy-cost", {
        kind: "choose",
        selector: {
          player: "self",
          zone: "board",
          category: "character",
          name: "Monkey.D.Luffy",
        },
        bind: "op10-moocy-banish",
        min: 0,
        max: 1,
        effect: {
          kind: "grant-keyword",
          binding: "op10-moocy-banish",
          keyword: "Banish",
          expiresAfterTurns: 0,
        },
      }),
    ],
    [
      // OP10-070 Trebol: "[printed text omitted -- pnpm card:text OP10-070]"
      //
      // Printed power, so a 1000-power body pumped for the turn keeps the
      // protection -- `maxPower`. `select` with `count: "all"` is "all of your
      // Characters": no choice, every match at once. The protection lands on the
      // Characters that are on the field when this resolves, which is what a
      // lasting effect names; a body played afterwards is not covered.
      "OP10-070",
      {
        effect: {
          kind: "select",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            maxPower: 1_000,
          },
          bind: "op10-trebol-protected",
          count: "all",
          effect: {
            kind: "restrict",
            binding: "op10-trebol-protected",
            restriction: "ko-immune",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP10-044 Cub: "[printed text omitted -- pnpm card:text OP10-044]"
      "OP10-044",
      restDressrosaLeaderOrStage("op10-cub-cost", {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxCost: 1,
        },
        bind: "op10-cub-bounce",
        min: 0,
        max: 1,
        effect: {
          kind: "move",
          binding: "op10-cub-bounce",
          to: { player: "owner", zone: "hand" },
        },
      }),
    ],
    [
      // OP10-048 Sai: the same clause Cub prints, on a 3-cost 5000 body.
      "OP10-048",
      restDressrosaLeaderOrStage("op10-sai-cost", {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxCost: 1,
        },
        bind: "op10-sai-bounce",
        min: 0,
        max: 1,
        effect: {
          kind: "move",
          binding: "op10-sai-bounce",
          to: { player: "owner", zone: "hand" },
        },
      }),
    ],
    [
      // OP10-046 Kyros: "[printed text omitted -- pnpm card:text OP10-046]"
      //
      // "1 Character", with no side named -- so either board, and the card goes
      // back to whichever hand owns it. Returning your own Character is a real
      // line here: a 9000 body for 7 that can pick up an [On Play] of your own.
      "OP10-046",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 5,
          },
          bind: "op10-kyros-bounce",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op10-kyros-bounce",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP10-052 Bartolomeo: "[printed text omitted -- pnpm card:text OP10-052]"
      //
      // The bottom of the deck rather than the hand, which is what makes this
      // answer a recursion target rather than delaying it.
      "OP10-052",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 1,
          },
          bind: "op10-bartolomeo-bury",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op10-bartolomeo-bury",
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // OP10-056 Mansherry: "[printed text omitted -- pnpm card:text OP10-056]"
      //
      // Two costs, both mandatory once the "you may" is taken, so the second is
      // nested inside the first. The 4-cost {Dressrosa} body is checked first,
      // outermost: a cost that cannot be paid in full cannot be started, so a
      // player with nothing to give back is not offered the rest at all. Resting
      // the Leader or Stage moves nothing the check reads. The returned
      // Character is the player's own, which is why the cost is worth paying at
      // all -- an [On Play] body picked back up.
      "OP10-056",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              type: "Dressrosa",
              minCost: 4,
            },
            operator: "gte",
            value: 1,
          },
          then: restDressrosaLeaderOrStage("op10-mansherry-rest", {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "Dressrosa",
              minCost: 4,
            },
            bind: "op10-mansherry-return",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op10-mansherry-return",
                  to: { player: "owner", zone: "hand" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 4,
                  },
                  bind: "op10-mansherry-bounce",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op10-mansherry-bounce",
                    to: { player: "owner", zone: "hand" },
                  },
                },
              ],
            },
          }).effect,
        },
      },
    ],
    [
      // OP10-057 Leo: "[printed text omitted -- pnpm card:text OP10-057]"
      //
      // The cost names no type, unlike the rest of the package -- see
      // `restOwnLeaderOrStage`. The final trash is mandatory and comes after the
      // search, so a card just added can be the one that goes.
      "OP10-057",
      restOwnLeaderOrStage("op10-leo-cost", {
        kind: "if",
        condition: { kind: "leader-has-name", player: "self", name: "Usopp" },
        then: {
          kind: "sequence",
          effects: [
            lookAndAdd(
              5,
              "op10-leo-look",
              { type: "Dressrosa", excludeName: "Leo" },
              2,
            ).effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op10-leo-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op10-leo-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      }),
    ],
    [
      // OP10-058 Rebecca: "[printed text omitted -- pnpm card:text OP10-058]"
      //
      // The reveal binds the pair; the first play is a choice among them, and
      // "the other card" is then whatever the binding still has *in hand* --
      // the played one has left, so no "exclude the card just picked" filter is
      // needed. The second play is mandatory and gated on cost 4, so revealing a
      // 7-drop and a 5-drop plays one and leaves the other in hand, exactly as
      // printed.
      "OP10-058",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "either",
            selector: { zone: "board", category: "character", minCost: 8 },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  type: "Dressrosa",
                  maxCost: 7,
                  excludeName: "Rebecca",
                },
                bind: "op10-rebecca-revealed",
                min: 0,
                max: 2,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "reveal", binding: "op10-rebecca-revealed" },
                    {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "hand",
                        binding: "op10-rebecca-revealed",
                      },
                      bind: "op10-rebecca-play",
                      min: 1,
                      max: 1,
                      effect: { kind: "play", binding: "op10-rebecca-play" },
                    },
                    {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "hand",
                        binding: "op10-rebecca-revealed",
                        maxCost: 4,
                      },
                      bind: "op10-rebecca-other",
                      count: 1,
                      effect: {
                        kind: "play",
                        binding: "op10-rebecca-other",
                        rested: true,
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
      // OP10-063 Vinsmoke Sanji: "[printed text omitted -- pnpm card:text OP10-063]"GERMA"[printed text omitted -- pnpm card:text OP10-063]"GERMA"[printed text omitted -- pnpm card:text OP10-063]"
      //
      // The substring reading on both halves: {Kingdom of GERMA} and
      // {The Vinsmoke Family} bodies print the first and not the second, and
      // `typeIncluding` is what reaches the compound type.
      "OP10-063",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-type-including",
            player: "self",
            text: "GERMA",
          },
          then: lookAndAdd(5, "op10-sanji-look", { typeIncluding: "GERMA" })
            .effect,
        },
      },
    ],
    [
      // OP10-071 Donquixote Doflamingo: "[printed text omitted -- pnpm card:text OP10-071]"
      //
      // Its `[On Your Opponent's Attack]` half is in `op10-battle.ts`.
      "OP10-071",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            type: "Donquixote Pirates",
            maxCost: 5,
          },
          bind: "op10-doflamingo-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op10-doflamingo-play" },
        }),
      },
    ],
    [
      // OP10-072 Donquixote Rosinante: "[printed text omitted -- pnpm card:text OP10-072]"
      //
      // Its `[End of Your Turn]` half is in `op10-triggers.ts`.
      "OP10-072",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand", category: "event" },
            "op10-rosinante-cost",
            1,
            { kind: "draw", player: "self", count: 2 },
          ),
        },
      },
    ],
    [
      // OP10-076 Baby 5: "[printed text omitted -- pnpm card:text OP10-076]"
      "OP10-076",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op10-baby5-cost",
            1,
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Donquixote Pirates",
              },
              then: {
                kind: "add-don",
                player: "self",
                count: 1,
                rested: false,
              },
            },
          ),
        },
      },
    ],
    [
      // OP10-081 Usopp: "[printed text omitted -- pnpm card:text OP10-081]"
      //
      // The self-mill is not a cost -- it fires whether or not the K.O. found a
      // target -- and Black's payoffs read the trash count back, so it lands
      // through `trash-top` in deck order.
      "OP10-081",
      restDressrosaLeaderOrStage("op10-usopp-cost", {
        kind: "sequence",
        effects: [
          {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 2,
            },
            bind: "op10-usopp-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op10-usopp-ko" },
          },
          { kind: "trash-top", player: "self", count: 2 },
        ],
      }),
    ],
    [
      // OP10-095 Roronoa Zoro: the same clause Usopp prints, two costs deeper --
      // "[printed text omitted -- pnpm card:text OP10-095]"
      "OP10-095",
      restDressrosaLeaderOrStage("op10-zoro-cost", {
        kind: "sequence",
        effects: [
          {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 4,
            },
            bind: "op10-zoro-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op10-zoro-ko" },
          },
          { kind: "trash-top", player: "self", count: 2 },
        ],
      }),
    ],
    [
      // OP10-107 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP10-107]"
      //
      // "With a cost of 5" exactly, and printed cost: `minBaseCost` and
      // `maxBaseCost` together, so a discount on the card in hand cannot make a
      // 6-drop bankable.
      "OP10-107",
      lifeEndToHand("op10-bonney-cost", {
        kind: "choose",
        selector: {
          player: "self",
          zone: "hand",
          category: "character",
          type: "Supernovas",
          minBaseCost: 5,
          maxBaseCost: 5,
        },
        bind: "op10-bonney-bank",
        min: 0,
        max: 1,
        effect: {
          kind: "move",
          binding: "op10-bonney-bank",
          to: { player: "self", zone: "life", position: "top" },
          faceUp: true,
        },
      }),
    ],
    [
      // OP10-110 Heat & Wire: "[printed text omitted -- pnpm card:text OP10-110]"
      //
      // A ceiling that moves with the game rather than a printed constant, which
      // is `maxCostFromZoneCount`: Yellow's clauses scale with Life because Life
      // is what it spends.
      "OP10-110",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            canRest: true,
            maxCostFromZoneCount: { player: "opponent", zone: "life" },
          },
          bind: "op10-heat-wire-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op10-heat-wire-rest" },
        },
      },
    ],
    [
      // OP10-112 Eustass"Captain"Kid: "[printed text omitted -- pnpm card:text OP10-112]"
      //
      // An 8-cost 9000 body that arrives rested if it wants the Life card, which
      // is the trade the card is priced on. Its `[End of Your Turn]` half is in
      // `op10-triggers.ts`.
      "OP10-112",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest", binding: SOURCE_BINDING },
              trashOpponentLifeTop("op10-kid-life"),
            ],
          },
        },
      },
    ],
    [
      // OP10-119 Trafalgar Law: "[printed text omitted -- pnpm card:text OP10-119]"
      //
      // Face-down, so the reveal is the only time the card is public: it goes
      // under the opponent's attacks as an unknown, and this is the one clause
      // in the pool that reveals a card and then hides it again. The DON!! half
      // names the Leader alone rather than "Leader or Character", so it is
      // `attach-don`'s `target: "leader"` rather than a `give-rested-don`
      // choice.
      "OP10-119",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                type: "Supernovas",
              },
              bind: "op10-law-bank",
              min: 0,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "reveal", binding: "op10-law-bank" },
                  {
                    kind: "move",
                    binding: "op10-law-bank",
                    to: { player: "self", zone: "life", position: "top" },
                  },
                ],
              },
            },
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Supernovas",
              },
              then: {
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
    ],
  ],
};
