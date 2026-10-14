/**
 * OP05 `[On Play]` programs.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP05-0xx` prints it from the local cache).
 *
 * Three OP05 identities were in the pool before the set was: OP05-066 Jinbe
 * and OP05-070 Fra-Nosuke are rows in `static-abilities.ts` (played by ST-26)
 * and OP05-077 Gamma Knife is in `op16-enel.ts`. None is registered here.
 */
import { type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd, payFromHand } from "./shared.js";
import { koCostAtMost, playFromHand, powerDebuff } from "./op08-shared.js";
import { buryCostAtMost, payFromTrash } from "./op07-shared.js";
import {
  blackCharacterFromTrash,
  debuffLeaderOrCharacter,
  eightFieldDon,
  koCostAtMostOpponentLife,
  koPowerAtMost,
  multicoloredLeader,
  opponentCharacterToLife,
  revolutionaryArmyLeader,
} from "./op05-shared.js";

/**
 * "Look at 5 cards from the top of your deck and place them at the top or
 * bottom of the deck in any order" -- OP05-055 X.Drake, and the tail of
 * OP05-043 Ulti after its one card is taken. The same split placement EB03-023
 * Kaya prints, which is what `alternate` on `order-to-bottom` is for.
 */
const placeTopOrBottom = (binding: string, bind: string): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: "deck", binding },
  bind,
  count: "all",
  effect: {
    kind: "order-to-bottom",
    binding: bind,
    to: { player: "self", zone: "deck", position: "top" },
    alternate: { player: "self", zone: "deck", position: "bottom" },
  },
});

/**
 * "Draw N cards and place N cards from your hand at the bottom of your deck in
 * any order" -- OP05-054 Monkey.D.Garp at two; OP05-046 Dalmatian's `[On K.O.]`
 * prints the same at one.
 */
export const drawThenBottom = (
  count: number,
  bind: string,
): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind,
      min: count,
      max: count,
      effect: {
        kind: "order-to-bottom",
        binding: bind,
        to: { player: "self", zone: "deck", position: "bottom" },
      },
    },
  ],
});

/**
 * "Up to 1 of your {Dressrosa} type Characters gains +2000 power during this
 * turn" -- OP05-090 Riku Doldo III, printed on its `[On Play]` and its
 * `[On K.O.]` alike, so one program is registered from both tables.
 */
export const rikuBuff: MechanicEffect = {
  kind: "choose",
  selector: {
    player: "self",
    zone: "board",
    category: "character",
    type: "Dressrosa",
  },
  bind: "op05-riku-buff",
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: "op05-riku-buff",
    amount: 2_000,
    expiresAfterTurns: 0,
  },
};

export const op05OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP05-005 Karasu: −1000 across the table, Leader included, behind a
      // Revolutionary Army Leader. Its `[When Attacking]` half is in
      // `op05-battle.ts`.
      "OP05-005",
      {
        effect: {
          kind: "if",
          condition: revolutionaryArmyLeader,
          then: debuffLeaderOrCharacter(1_000, "op05-karasu-debuff"),
        },
      },
    ],
    [
      // OP05-006 Koala: −3000 on one Character behind the same Leader.
      "OP05-006",
      {
        effect: {
          kind: "if",
          condition: revolutionaryArmyLeader,
          then: powerDebuff(3_000, "op05-koala-debuff"),
        },
      },
    ],
    [
      // OP05-007 Sabo: up to two Characters whose *combined* current power fits
      // under 4000 -- a running budget, which is what `maxTotalPower` is for.
      "OP05-007",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op05-sabo-ko",
          min: 0,
          max: 2,
          maxTotalPower: 4_000,
          effect: { kind: "knock-out", binding: "op05-sabo-ko" },
        },
      },
    ],
    [
      // OP05-009 Toh-Toh: a card if the controller's Leader has been debuffed to
      // nothing -- `leader-power`, because a Leader is in no zone a selector
      // can count.
      "OP05-009",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-power",
            player: "self",
            operator: "lte",
            value: 0,
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    // OP05-010 Nico Robin and OP05-011 Bartholomew Kuma: Red's small removal,
    // at 1000 and 2000 current power.
    ["OP05-010", { effect: koPowerAtMost(1_000, "op05-robin-ko") }],
    ["OP05-011", { effect: koPowerAtMost(2_000, "op05-kuma-ko") }],
    [
      // OP05-015 Belo Betty: a five-deep dig for a Revolutionary Army card other
      // than itself.
      "OP05-015",
      lookAndAdd(5, "op05-betty-look", {
        type: "Revolutionary Army",
        excludeName: "Belo Betty",
      }),
    ],
    [
      // OP05-042 Issho: one Character of cost 7 or less sits out its
      // controller's next turn. `expiresAfterTurns: 1` is how the pool writes
      // "until the start of your next turn" -- the restriction only ever
      // matters on the opponent's turn in between.
      "OP05-042",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 7,
          },
          bind: "op05-issho-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "op05-issho-lock",
            restriction: "cannot-attack",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP05-043 Ulti: behind a multicolour Leader, look at three, keep one, and
      // put the rest back at either end of the deck in any order.
      "OP05-043",
      {
        effect: {
          kind: "if",
          condition: multicoloredLeader,
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "look-at",
                player: "self",
                count: 3,
                bind: "op05-ulti-look",
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op05-ulti-look",
                },
                bind: "op05-ulti-add",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op05-ulti-add",
                  to: { player: "self", zone: "hand" },
                },
              },
              placeTopOrBottom("op05-ulti-look", "op05-ulti-rest"),
            ],
          },
        },
      },
    ],
    [
      // OP05-050 Hina: a card while the hand is at five or fewer.
      "OP05-050",
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
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    // OP05-051 Borsalino: Blue's biggest bury, at cost 4, either side.
    ["OP05-051", { effect: buryCostAtMost(4, "op05-borsalino-bury") }],
    // OP05-054 Monkey.D.Garp: two in, two to the bottom.
    ["OP05-054", { effect: drawThenBottom(2, "op05-garp-bottom") }],
    [
      // OP05-055 X.Drake: the top five, rearranged across both ends. Its
      // [Blocker] is printed text.
      "OP05-055",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 5,
              bind: "op05-drake-look",
            },
            placeTopOrBottom("op05-drake-look", "op05-drake-place"),
          ],
        },
      },
    ],
    [
      // OP05-056 X.Barrels: another of the controller's own Characters under the
      // deck buys a card. Nested, so an empty board buys nothing.
      "OP05-056",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              excludeSource: true,
            },
            bind: "op05-barrels-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op05-barrels-cost",
                  to: { player: "owner", zone: "deck", position: "bottom" },
                },
                { kind: "draw", player: "self", count: 1 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP05-063 O-Robi: removal at cost 3 once the Purple deck has reached
      // eight DON!!.
      "OP05-063",
      {
        effect: {
          kind: "if",
          condition: eightFieldDon,
          then: koCostAtMost(3, "op05-robi-ko"),
        },
      },
    ],
    [
      // OP05-064 Killer: a five-deep dig for a Kid Pirates card other than itself.
      "OP05-064",
      lookAndAdd(5, "op05-killer-look", {
        type: "Kid Pirates",
        excludeName: "Killer",
      }),
    ],
    [
      // OP05-068 Chopa-Emon: a purple Straw Hat body of 6000 or less stands
      // back up, behind the same eight-DON!! gate. Current power, so a debuffed
      // 7000 qualifies.
      "OP05-068",
      {
        effect: {
          kind: "if",
          condition: eightFieldDon,
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              color: "Purple",
              type: "Straw Hat Crew",
              maxCurrentPower: 6_000,
              rested: true,
            },
            bind: "op05-chopaemon-stand",
            min: 0,
            max: 1,
            effect: {
              kind: "update",
              binding: "op05-chopaemon-stand",
              rested: false,
            },
          },
        },
      },
    ],
    [
      // OP05-072 Hone-Kichi: −2000 on up to two Characters at eight DON!!.
      "OP05-072",
      {
        effect: {
          kind: "if",
          condition: eightFieldDon,
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op05-honekichi-debuff",
            min: 0,
            max: 2,
            effect: {
              kind: "modify-power",
              binding: "op05-honekichi-debuff",
              amount: -2_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP05-073 Miss Doublefinger(Zala): a hand card for a rested DON!! from
      // the DON!! deck. Its `[Trigger]` is in `op05-triggers.ts`.
      "OP05-073",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op05-zala-cost",
            1,
            { kind: "add-don", player: "self", count: 1, rested: true },
          ),
        },
      },
    ],
    [
      // OP05-079 Viola: the *opponent* puts three of their own trash cards under
      // their deck, in an order of their choosing -- so the pick is theirs. A
      // trash of fewer than three simply cannot pay and nothing moves, which is
      // the reading every fixed-count `choose` in the pool takes.
      "OP05-079",
      {
        effect: {
          kind: "choose",
          selector: { player: "opponent", zone: "trash" },
          bind: "op05-viola-bury",
          min: 3,
          max: 3,
          chooser: "opponent",
          effect: {
            kind: "order-to-bottom",
            binding: "op05-viola-bury",
            to: { player: "opponent", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    // OP05-085 Nefeltari Cobra: a card off the top into the trash -- Black's
    // fuel. Its [Blocker] is printed text.
    ["OP05-085", { effect: { kind: "trash-top", player: "self", count: 1 } }],
    // OP05-090 Riku Doldo III: the Dressrosa buff, shared with its `[On K.O.]`.
    ["OP05-090", { effect: rikuBuff }],
    [
      // OP05-091 Rebecca: a black 3-to-7 out of the trash other than another
      // Rebecca, then a black 3-or-less out of hand rested. Sequenced rather
      // than nested: the second half is printed as its own sentence and does
      // not depend on the first finding anything.
      "OP05-091",
      {
        effect: {
          kind: "sequence",
          effects: [
            blackCharacterFromTrash(3, 7, "op05-rebecca-recover", "Rebecca"),
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                color: "Black",
                maxCost: 3,
              },
              bind: "op05-rebecca-play",
              min: 0,
              max: 1,
              effect: {
                kind: "play",
                binding: "op05-rebecca-play",
                rested: true,
              },
            },
          ],
        },
      },
    ],
    [
      // OP05-093 Rob Lucci: three trash cards under the deck buy two K.O.s, at
      // cost 2 and cost 1. Two `choose` steps because the two ceilings differ;
      // a K.O.'d body is gone before the second is asked, so the two cannot
      // name the same card.
      "OP05-093",
      {
        effect: payFromTrash(3, "op05-lucci-cost", {
          kind: "sequence",
          effects: [
            koCostAtMost(2, "op05-lucci-ko-two"),
            koCostAtMost(1, "op05-lucci-ko-one"),
          ],
        }),
      },
    ],
    [
      // OP05-101 Ohm: a five-deep dig for [Holly], and the Holly it finds -- or
      // one already in hand -- played straight away. Its +1000 is a row in
      // `static-abilities.ts`.
      "OP05-101",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op05-ohm-look", { name: "Holly" }).effect,
            playFromHand({ name: "Holly" }, "op05-ohm-play"),
          ],
        },
      },
    ],
    // OP05-102 Gedatsu: the Sky Island removal, ceiling read off the opponent's
    // Life.
    ["OP05-102", { effect: koCostAtMostOpponentLife("op05-gedatsu-ko") }],
    [
      // OP05-103 Kotori: the same removal, only beside a [Hotori].
      "OP05-103",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "board", name: "Hotori" },
            operator: "gte",
            value: 1,
          },
          then: koCostAtMostOpponentLife("op05-kotori-ko"),
        },
      },
    ],
    [
      // OP05-104 Conis: the controller's Stage under the deck buys a card and
      // costs a card. Nested, so no Stage means no draw.
      "OP05-104",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "stage" },
            bind: "op05-conis-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op05-conis-cost",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                { kind: "draw", player: "self", count: 1 },
                payFromHand(
                  { player: "self", zone: "hand" },
                  "op05-conis-trash",
                  1,
                  {
                    kind: "sequence",
                    effects: [],
                  },
                ),
              ],
            },
          },
        },
      },
    ],
    [
      // OP05-106 Shura: a five-deep dig for a Sky Island card other than itself.
      // Its `[Trigger]` is in `op05-triggers.ts`.
      "OP05-106",
      lookAndAdd(5, "op05-shura-look", {
        type: "Sky Island",
        excludeName: "Shura",
      }),
    ],
    [
      // OP05-111 Hotori: a [Kotori] out of hand pays for the Life-stack removal
      // -- and Kotori's own `[On Play]` then sees this Hotori on the board,
      // which is the pair the two cards are printed as. Nested: no Kotori, no
      // removal.
      "OP05-111",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand", name: "Kotori" },
            bind: "op05-hotori-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "play", binding: "op05-hotori-cost" },
                opponentCharacterToLife(3, "op05-hotori-target"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP05-117 Upper Yard (Stage): a five-deep dig for a Sky Island card, on a
      // 1-cost Stage -- the card three OP-06 and OP-08 programs search for by
      // name.
      "OP05-117",
      lookAndAdd(5, "op05-upper-yard-look", { type: "Sky Island" }),
    ],
    [
      // OP05-118 Kaido: four cards once the opponent is down to three Life.
      "OP05-118",
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
          then: { kind: "draw", player: "self", count: 4 },
        },
      },
    ],
    [
      // OP05-119 Monkey.D.Luffy: ten DON!! back for every other Character under
      // the deck and an extra turn. The bury is a `select` of the whole rest of
      // the board -- "all of your Characters except this Character" leaves
      // nothing to choose -- placed in the controller's order.
      "OP05-119",
      {
        effect: donMinus(10, {
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                excludeSource: true,
              },
              bind: "op05-luffy-bury",
              count: "all",
              effect: {
                kind: "order-to-bottom",
                binding: "op05-luffy-bury",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
            { kind: "extra-turn", player: "self" },
          ],
        }),
      },
    ],
  ],
  onKo: [
    // OP05-046 Dalmatian: a card in and a card under, when it dies.
    ["OP05-046", { effect: drawThenBottom(1, "op05-dalmatian-bottom") }],
    // OP05-090 Riku Doldo III: the same buff its `[On Play]` printed.
    ["OP05-090", { effect: rikuBuff }],
    [
      // OP05-112 Captain McKinley: a 1-cost Sky Island body out of hand when it
      // dies. Its [Blocker] is printed text.
      "OP05-112",
      {
        effect: playFromHand(
          { category: "character", type: "Sky Island", minCost: 1, maxCost: 1 },
          "op05-mckinley-play",
        ),
      },
    ],
  ],
};
