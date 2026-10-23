/**
 * OP09 `[On Play]` programs.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP09-0xx` prints it from the local cache).
 *
 * Seven OP09 identities were in the pool before the set was, played by the
 * community decks that ship them: OP09-069 and OP09-072 (`op12-rosinante.ts`,
 * `op16-enel.ts`), OP09-093, OP09-096 and OP09-099 (`op16-teach.ts`) and
 * OP09-112 (`op16-nami.ts`). Their programs stay in the modules named after
 * those decks, the same split OP14 kept -- see `mechanics/README.md`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  donMinus,
  donMinusOrMore,
  drawAndDiscard,
  lifeToHandCost,
  lookAndAdd,
  paidToHand,
} from "./shared.js";
import { twoRestedCharacters } from "./op09-shared.js";

export const op09OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP09-002 Uta: the set's Red-Haired search.
      "OP09-002",
      lookAndAdd(5, "op09-uta-looked", { type: "Red-Haired Pirates" }),
    ],
    [
      // OP09-005 Silvers Rayleigh: refills only against a board of big bodies.
      // The gate reads base power (`minPower`), as "base power" does
      // everywhere else in the pool.
      "OP09-005",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "opponent",
            selector: { zone: "board", category: "character", minPower: 5000 },
            operator: "gte",
            value: 2,
          },
          then: drawAndDiscard(2, 1, "op09-refill-discard"),
        },
      },
    ],
    [
      // OP09-007 Heat: props up a Leader that has been pushed below 5000, so
      // the ceiling is current power rather than the printed number.
      "OP09-007",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: [],
            includeLeader: true,
            maxCurrentPower: 4000,
          },
          bind: "op09-heat-leader",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op09-heat-leader",
            amount: 1000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP09-009 Benn.Beckman: trashes rather than K.O.s, so nothing keyed on a
      // K.O. fires -- a `move` to the owner's trash, not `knock-out` (Bandai's
      // OP09-009 ruling).
      "OP09-009",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 6000,
          },
          bind: "op09-beckman-trash",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op09-beckman-trash",
            to: { player: "owner", zone: "trash" },
          },
        },
      },
    ],
    [
      // OP09-010 Bonk Punch: puts its own [Monster] out of hand for free.
      "OP09-010",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "hand", name: "Monster" },
          bind: "op09-bonk-monster",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op09-bonk-monster" },
        },
      },
    ],
    [
      // OP09-013 Yasopp: the buff survives into the opponent's turn, which is
      // `expiresAfterTurns: 1`.
      "OP09-013",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: [], includeLeader: true },
          bind: "op09-yasopp-leader",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op09-yasopp-leader",
            amount: 1000,
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP09-014 Limejuice: switches a small [Blocker] off for the turn without
      // removing the keyword -- `cannot-block`, the restriction OP16-063 added.
      // `keyword` reads granted [Blocker] too, which is what the text names.
      "OP09-014",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            keyword: "Blocker",
            maxCurrentPower: 4000,
          },
          bind: "op09-limejuice-blocker",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "op09-limejuice-blocker",
            restriction: "cannot-block",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP09-023 Adio: the ODYSSEY Leader's refund for a field it rested.
      "OP09-023",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "ODYSSEY",
          },
          then: { kind: "activate-don", player: "self", count: 3 },
        },
      },
    ],
    [
      // OP09-024 Usopp: ODYSSEY pays for its card draw with a rested board.
      "OP09-024",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: drawAndDiscard(2, 2, "op09-refill-discard"),
        },
      },
    ],
    [
      // OP09-026 Sakazuki: the archetype's removal, on the same gate.
      "OP09-026",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 5,
            },
            bind: "op09-sakazuki-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op09-sakazuki-ko" },
          },
        },
      },
    ],
    [
      // OP09-030 Trafalgar Law: the bounce is a cost, so the free play is
      // nested inside the `choose` that pays it -- a sequence would hand the
      // payoff to a player with no Character to return.
      "OP09-030",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "board", category: "character" },
            bind: "op09-law-bounce",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op09-law-bounce",
                  to: { player: "owner", zone: "hand" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    type: "ODYSSEY",
                    category: "character",
                    maxCost: 3,
                    excludeName: "Trafalgar Law",
                  },
                  bind: "op09-law-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op09-law-play" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-033 Nico Robin: a turn-scoped immunity written onto the bodies it
      // reached, which is what `ko-immune` is for. It covers the whole side of
      // the board, so `select` with `count: "all"` rather than a `choose`.
      "OP09-033",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: {
            kind: "select",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              anyOf: [{ type: "ODYSSEY" }, { type: "Straw Hat Crew" }],
            },
            bind: "op09-robin-immune",
            count: "all",
            effect: {
              kind: "restrict",
              binding: "op09-robin-immune",
              restriction: "ko-immune",
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // OP09-034 Perona: the Thriller Bark search, with a mandatory discard
      // after the leftovers go back.
      "OP09-034",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op09-perona-looked", {
              anyOf: [
                { name: "Dracule Mihawk" },
                { type: "Thriller Bark Pirates" },
              ],
            }).effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op09-perona-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op09-perona-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP09-035 Portgas.D.Ace: tempo on the ODYSSEY gate.
      "OP09-035",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 5,
              canRest: true,
              rested: false,
            },
            bind: "op09-ace-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op09-ace-rest" },
          },
        },
      },
    ],
    [
      // OP09-036 Monkey.D.Luffy: one rest across two pools no selector spans,
      // which is exactly what `rest-opponent-cards` exists for. The printed
      // cost ceiling applies to the Character half; the node offers a DON!!
      // only while the opponent has one.
      "OP09-036",
      {
        effect: {
          kind: "if",
          condition: twoRestedCharacters,
          then: {
            // `player` names whose cards are rested, which is the opponent's --
            // the same reading OP12-037 and OP14-020's Leader use.
            kind: "rest-opponent-cards",
            player: "opponent",
            count: 1,
            maxCost: 6,
          },
        },
      },
    ],
    [
      // OP09-037 Lim: the ODYSSEY search half; its own end-of-turn refresh is
      // in `op09-triggers.ts`.
      "OP09-037",
      lookAndAdd(5, "op09-lim-looked", {
        type: "ODYSSEY",
        excludeName: "Lim",
      }),
    ],
    [
      // OP09-046 Crocodile: Cross Guild's free 5-drop. The second half of the
      // disjunction is a substring type, which also reaches Former Baroque
      // Works.
      "OP09-046",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            maxCost: 5,
            anyOf: [
              { type: "Cross Guild" },
              { typeIncluding: "Baroque Works" },
            ],
          },
          bind: "op09-crocodile-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op09-crocodile-play" },
        },
      },
    ],
    [
      // OP09-048 Dracule Mihawk: Cross Guild's draw-2-discard-1 blocker.
      "OP09-048",
      { effect: drawAndDiscard(2, 1, "op09-refill-discard") },
    ],
    [
      // OP09-051 Buggy: the bury, then a self-bury unless the board is already
      // five big bodies. The `else` is the "if you do not have" half -- a
      // condition the DSL can only ask in the positive.
      "OP09-051",
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
              bind: "op09-buggy-bury",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op09-buggy-bury",
                to: { player: "owner", zone: "deck", position: "bottom" },
              },
            },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: {
                  zone: "board",
                  category: "character",
                  minCost: 5,
                },
                operator: "gte",
                value: 5,
              },
              then: { kind: "sequence", effects: [] },
              else: {
                kind: "move",
                binding: SOURCE_BINDING,
                to: { player: "owner", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP09-053 Mohji: finds Richie and puts it out in one clause, so the play
      // step reads the hand after the search has added to it.
      "OP09-053",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op09-mohji-looked", { name: "Richie" }).effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand", name: "Richie" },
              bind: "op09-mohji-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op09-mohji-play" },
            },
          ],
        },
      },
    ],
    [
      // OP09-056 Mr.3(Galdino): the four-deep Cross Guild search.
      "OP09-056",
      lookAndAdd(4, "op09-galdino-looked", {
        excludeName: "Mr.3(Galdino)",
        anyOf: [{ type: "Cross Guild" }, { typeIncluding: "Baroque Works" }],
      }),
    ],
    [
      // OP09-064 Killer: DON!! −1 to stand the Kid Pirates Leader back up.
      "OP09-064",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "self",
            zone: [],
            includeLeader: true,
            type: "Kid Pirates",
            rested: true,
          },
          bind: "op09-killer-leader",
          min: 0,
          max: 1,
          effect: {
            kind: "update",
            binding: "op09-killer-leader",
            rested: false,
          },
        }),
      },
    ],
    [
      // OP09-065 Sanji: "1 or more DON!!" is a floor the engine reads as one --
      // returning more buys nothing, so the offer is the cheapest legal price.
      "OP09-065",
      {
        effect: donMinusOrMore(1, {
          kind: "sequence",
          effects: [
            {
              kind: "grant-keyword",
              binding: SOURCE_BINDING,
              keyword: "Rush",
              expiresAfterTurns: 0,
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 6,
                canRest: true,
                rested: false,
              },
              bind: "op09-sanji-rest",
              min: 0,
              max: 1,
              effect: { kind: "rest", binding: "op09-sanji-rest" },
            },
          ],
        }),
      },
    ],
    [
      // OP09-066 Jean Bart: pays out only while behind on DON!!.
      "OP09-066",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don-versus",
            player: "self",
            operator: "lt",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 3,
            },
            bind: "op09-jean-bart-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op09-jean-bart-ko" },
          },
        },
      },
    ],
    [
      // OP09-070 Nami: turns returned DON!! into given DON!!.
      "OP09-070",
      {
        effect: donMinusOrMore(1, {
          kind: "give-rested-don",
          player: "self",
          count: 2,
        }),
      },
    ],
    [
      // OP09-075 Eustass"Captain"Kid: the Life card comes off the top only, so
      // this cannot reuse `lifeToHandCost`'s top-or-bottom `edge`.
      "OP09-075",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "life", position: "top" },
            bind: "op09-kid-life",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op09-kid-life",
                  to: { player: "self", zone: "hand" },
                },
                paidToHand("op09-kid-life", [
                  {
                    kind: "if",
                    condition: {
                      kind: "leader-has-type",
                      player: "self",
                      type: "Kid Pirates",
                    },
                    then: {
                      kind: "add-don",
                      player: "self",
                      count: 1,
                      rested: false,
                    },
                  },
                ]),
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-076 Roronoa Zoro: the deck's ramp body -- one DON!! back, one
      // active DON!! added.
      "OP09-076",
      {
        effect: donMinusOrMore(1, {
          kind: "add-don",
          player: "self",
          count: 1,
          rested: false,
        }),
      },
    ],
    [
      // OP09-085 Gecko Moria: the Thriller Bark recursion, two costs cheaper
      // than the shared 4-cost target.
      "OP09-085",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            type: "Thriller Bark Pirates",
            maxCost: 2,
          },
          bind: "op09-moria-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op09-moria-play", rested: true },
        },
      },
    ],
    [
      // OP09-087 Charlotte Pudding: the opponent picks which card goes, which
      // is the rule for anything trashed out of a hand.
      "OP09-087",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "hand",
            operator: "gte",
            value: 5,
          },
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            bind: "op09-pudding-discard",
            min: 1,
            max: 1,
            chooser: "opponent",
            effect: {
              kind: "move",
              binding: "op09-pudding-discard",
              to: { player: "opponent", zone: "trash" },
            },
          },
        },
      },
    ],
    [
      // OP09-101 Kuzan: the burial into the opponent's own Life is the cost,
      // and the card goes in face-up, so the top/bottom decision is a real
      // `choice` between two destinations.
      "OP09-101",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 3,
          },
          bind: "op09-kuzan-life",
          min: 1,
          max: 1,
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choice",
                branches: [
                  {
                    id: "top",
                    label: "Place it on top of their Life cards",
                    effect: {
                      kind: "move",
                      binding: "op09-kuzan-life",
                      faceUp: true,
                      to: {
                        player: "opponent",
                        zone: "life",
                        position: "top",
                      },
                    },
                  },
                  {
                    id: "bottom",
                    label: "Place it at the bottom of their Life cards",
                    effect: {
                      kind: "move",
                      binding: "op09-kuzan-life",
                      faceUp: true,
                      to: {
                        player: "opponent",
                        zone: "life",
                        position: "bottom",
                      },
                    },
                  },
                ],
              },
              {
                kind: "choose",
                selector: { player: "opponent", zone: "hand" },
                bind: "op09-kuzan-discard",
                min: 1,
                max: 1,
                chooser: "opponent",
                effect: {
                  kind: "move",
                  binding: "op09-kuzan-discard",
                  to: { player: "opponent", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP09-102 Professor Clover: the Robin deck's Trigger-finder. Its own
      // [Trigger] re-runs this clause, which `op09-triggers.ts` registers.
      "OP09-102",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Nico Robin",
          },
          then: lookAndAdd(3, "op09-clover-looked", { hasTrigger: true })
            .effect,
        },
      },
    ],
    [
      // OP09-103 Koala: Life pays for a free Revolutionary Army body, and the
      // draw is conditional on that body actually landing. A `choose` that
      // picks nothing still runs its effect, so the draw also asks whether the
      // bound card reached the board: choosing no body draws nothing (Bandai's
      // OP09-103 ruling).
      "OP09-103",
      lifeToHandCost({
        kind: "choose",
        selector: {
          player: "self",
          zone: "hand",
          category: "character",
          type: "Revolutionary Army",
          maxCost: 4,
        },
        bind: "op09-koala-play",
        min: 0,
        max: 1,
        effect: {
          kind: "sequence",
          effects: [
            { kind: "play", binding: "op09-koala-play" },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: { zone: "board", binding: "op09-koala-play" },
                operator: "gte",
                value: 1,
              },
              then: { kind: "draw", player: "self", count: 1 },
            },
          ],
        },
      }),
    ],
    [
      // OP09-104 Sabo: banks a Character into Life face-up, then trades a Life
      // card back for the card in hand.
      "OP09-104",
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
                type: "Revolutionary Army",
              },
              bind: "op09-sabo-life",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op09-sabo-life",
                faceUp: true,
                to: { player: "self", zone: "life", position: "top" },
              },
            },
            {
              kind: "if",
              condition: {
                kind: "zone-count",
                player: "self",
                zone: "life",
                operator: "gte",
                value: 2,
              },
              then: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "life",
                  position: "edge",
                },
                bind: "op09-sabo-take",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op09-sabo-take",
                  to: { player: "self", zone: "hand" },
                },
              },
            },
          ],
        },
      },
    ],
    [
      // OP09-106 Nico Olvia: the Leader push the Robin deck opens on.
      "OP09-106",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: [],
            includeLeader: true,
            name: "Nico Robin",
          },
          bind: "op09-olvia-leader",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op09-olvia-leader",
            amount: 3000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP09-107 Nico Robin: takes a Life card off the top of the opponent's
      // stack without dealing damage, so no Trigger fires.
      "OP09-107",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "life",
            operator: "gte",
            value: 3,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "life",
              position: "top",
            },
            bind: "op09-robin-life",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op09-robin-life",
              to: { player: "owner", zone: "trash" },
            },
          },
        },
      },
    ],
    [
      // OP09-110 Pierre: the Yellow rummage.
      "OP09-110",
      { effect: drawAndDiscard(2, 2, "op09-refill-discard") },
    ],
    [
      // OP09-114 Lindbergh: small removal, gated on the combined Life clock
      // Yellow's OP09 package shares.
      "OP09-114",
      {
        effect: {
          kind: "if",
          condition: { kind: "combined-life", operator: "lte", value: 5 },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 2000,
            },
            bind: "op09-lindbergh-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op09-lindbergh-ko" },
          },
        },
      },
    ],
    [
      // OP09-119 Monkey.D.Luffy: the 9-cost Purple finisher.
      "OP09-119",
      {
        effect: donMinusOrMore(1, {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "grant-keyword",
              binding: SOURCE_BINDING,
              keyword: "Rush",
              expiresAfterTurns: 0,
            },
          ],
        }),
      },
    ],
  ],
};
