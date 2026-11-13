/**
 * OP-18's Purple cards, OP18-060 to OP18-078: the timed clauses and the
 * removal replacements. The continuous text is in `op18-purple-static.ts` and
 * the Leader's untimed watcher in `op18-purple-reactions.ts`.
 *
 * Every comment here names what a clause does in the engine's terms rather
 * than quoting it; read the card itself with `pnpm card:text <card>`.
 *
 * The colour has two packages. The Celestial Dragons Leader recurs bodies out
 * of the trash and refunds DON!! for them; the Water Seven / Straw Hat half
 * runs four 5-cost Stages that each draw and ramp on arrival, and Franky
 * Family Characters that spend those Stages -- K.O. one of cost 5 or less --
 * as the price of their own abilities, which is what makes the Stage's arrival
 * value repeatable.
 */
import {
  SOURCE_BINDING,
  type MechanicCondition,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus } from "./shared.js";

/** "1 of your Stages with a cost of 5 or less" -- the Franky Family's fuel. */
const OWN_STAGE_UP_TO_FIVE = {
  player: "self" as const,
  zone: "stage" as const,
  maxCost: 5,
};

/** The player has a Stage the Franky Family cost can be paid with. */
const haveStageUpToFive: MechanicCondition = {
  kind: "selector-count",
  player: "self",
  selector: { zone: "stage", maxCost: 5 },
  operator: "gte",
  value: 1,
};

/**
 * "K.O. 1 of your Stages with a cost of 5 or less: <effect>".
 *
 * The payoff nests inside the cost's `choose`, so a Stage that has left by the
 * time the clause resolves means no payoff -- the same reason `payFromHand`
 * nests. The K.O. is a real one: a Stage K.O.'d by its controller's own effect
 * still goes through the removal path.
 */
const koOwnStage = (bind: string, effect: MechanicEffect): MechanicEffect => ({
  kind: "choose",
  selector: OWN_STAGE_UP_TO_FIVE,
  bind,
  min: 1,
  max: 1,
  effect: {
    kind: "sequence",
    effects: [{ kind: "knock-out", binding: bind }, effect],
  },
});

/**
 * The `[On Play]` all four OP-18 Purple Stages print: draw 1, then up to 1
 * DON!! from the DON!! deck, rested. "Up to", so an empty DON!! deck still
 * draws and adds nothing.
 */
const stageArrival: MechanicProgram = {
  effect: {
    kind: "sequence",
    effects: [
      { kind: "draw", player: "self", count: 1 },
      { kind: "add-don", player: "self", count: 1, rested: true },
    ],
  },
};

/** "Add up to 2 Stage cards from your trash to your hand." */
const stagesFromTrash = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "trash", category: "stage" },
  bind,
  min: 0,
  max: 2,
  effect: { kind: "move", binding: bind, to: { player: "self", zone: "hand" } },
});

export const op18PurpleMechanics: SetMechanics = {
  onPlay: [
    [
      // OP18-061 Iceburg: a look-5 that keeps up to two cards, each either a
      // Stage or a {Water Seven} card, and bottoms the rest in the player's
      // order. "A total of 2" is one choice over the disjunction, not one of
      // each.
      "OP18-061",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "look-at", player: "self", count: 5, bind: "op18-061" },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op18-061",
                anyOf: [{ category: "stage" }, { type: "Water Seven" }],
              },
              bind: "op18-061-add",
              min: 0,
              max: 2,
              effect: {
                kind: "move",
                binding: "op18-061-add",
                to: { player: "self", zone: "hand" },
              },
            },
            {
              kind: "select",
              selector: { player: "self", zone: "deck", binding: "op18-061" },
              bind: "op18-061-rest",
              count: "all",
              effect: {
                kind: "order-to-bottom",
                binding: "op18-061-rest",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP18-063 Kiwi & Mozu: a Stage K.O.'d for one rested DON!!. Gated on
      // having a Stage to pay with, so a player without one is not asked a
      // question whose only answer is "no".
      "OP18-063",
      {
        effect: {
          kind: "if",
          condition: haveStageUpToFive,
          then: {
            kind: "optional",
            effect: koOwnStage("op18-063-cost", {
              kind: "add-don",
              player: "self",
              count: 1,
              rested: true,
            }),
          },
        },
      },
    ],
    [
      // OP18-064 Saint Killingham: `[Your Turn]` on the `[On Play]`, so a copy
      // played on the opponent's turn -- off its own `[On K.O.]` below, the
      // likeliest way -- locks nothing. Two independent "up to 1" picks, both
      // on the opponent's side and both on *base* power (`maxPower`), the
      // second excluding the first so one body cannot answer both.
      "OP18-064",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: donMinus(1, {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxPower: 7000,
                },
                bind: "op18-064-big",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "op18-064-big",
                  restriction: "cannot-attack",
                  expiresAfterTurns: 1,
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxPower: 5000,
                  excludeBinding: "op18-064-big",
                },
                bind: "op18-064-small",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "op18-064-small",
                  restriction: "cannot-attack",
                  expiresAfterTurns: 1,
                },
              },
            ],
          }),
        },
      },
    ],
    [
      // OP18-065 Saint Gunko: DON!! −1 for a {Celestial Dragons} Character of
      // 6000 power or less out of the trash -- which is itself a play from the
      // trash, so the OP18-060 Leader's draw answers it.
      "OP18-065",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            type: "Celestial Dragons",
            maxPower: 6000,
          },
          bind: "op18-065-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op18-065-play" },
        }),
      },
    ],
    [
      // OP18-067 Charlotte Smoothie: a {Big Mom Pirates} card from hand for
      // two draws. Gated on holding one, so a hand of nothing that can pay is
      // not prompted.
      "OP18-067",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "hand", type: "Big Mom Pirates" },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                type: "Big Mom Pirates",
              },
              bind: "op18-067-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op18-067-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  { kind: "draw", player: "self", count: 2 },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP18-068 Senor Pink: DON!! −1 to stop one opposing Character of cost 7
      // or less being rested through the opponent's next End Phase.
      "OP18-068",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 7,
          },
          bind: "op18-068-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "op18-068-lock",
            restriction: "cannot-rest",
            expiresAfterTurns: 1,
          },
        }),
      },
    ],
    [
      // OP18-070 Tom: two costs, DON!! −1 *and* a card from hand, behind one
      // "you may". Both are gated before the prompt, because `donMinus` alone
      // would take the DON!! from a player with an empty hand and then find
      // nothing to trash. The search nests inside the trash for the same
      // reason `payFromHand` nests.
      "OP18-070",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "field-don",
                player: "self",
                operator: "gte",
                value: 1,
              },
              {
                kind: "selector-count",
                player: "self",
                selector: { zone: "hand" },
                operator: "gte",
                value: 1,
              },
            ],
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op18-070-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "move",
                        binding: "op18-070-cost",
                        to: { player: "self", zone: "trash" },
                      },
                      stagesFromTrash("op18-070-add"),
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
    ["OP18-075", stageArrival],
    ["OP18-076", stageArrival],
    ["OP18-077", stageArrival],
    ["OP18-078", stageArrival],
  ],
  onKo: [
    [
      // OP18-064 Saint Killingham: DON!! −1 to play itself straight back out
      // of the trash. On either turn -- the `[Your Turn]` is printed on the
      // `[On Play]` only -- and the return is a play from the trash, so the
      // OP18-060 Leader's watcher answers it.
      "OP18-064",
      { effect: donMinus(1, { kind: "play", binding: SOURCE_BINDING }) },
    ],
  ],
  activateMain: [
    [
      // OP18-060 Saint Gunko (Leader): a card from hand for one *active* DON!!
      // out of the DON!! deck, while a Character of 8000 base power or more is
      // on the board. The gate is outermost so the activation is not offered
      // without one; trashing a card cannot change the board it reads, so
      // checking it before the cost is the same answer as after.
      "OP18-060",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                minPower: 8000,
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op18-060-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op18-060-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  { kind: "add-don", player: "self", count: 1, rested: false },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP18-066 Zambai: a Stage K.O.'d for [Rush] this turn. Not once per
      // turn; the Stage is the limit.
      "OP18-066",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: haveStageUpToFive,
            then: koOwnStage("op18-066-cost", {
              kind: "grant-keyword",
              binding: SOURCE_BINDING,
              keyword: "Rush",
              expiresAfterTurns: 0,
            }),
          },
        },
      },
    ],
    [
      // OP18-072 The Franky Family: a Stage K.O.'d for −3000 on the turn this
      // Character arrived. Both gates outermost, for the reason the Leader's
      // above gives: the K.O. cannot change either answer, and an activation
      // that could only spend a Stage for nothing should not be on offer.
      "OP18-072",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                haveStageUpToFive,
                { kind: "source-played-this-turn" },
              ],
            },
            then: koOwnStage("op18-072-cost", {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op18-072-target",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op18-072-target",
                amount: -3000,
                expiresAfterTurns: 0,
              },
            }),
          },
        },
      },
    ],
    [
      // OP18-075 Thousand Sunny: DON!! −2 and the Stage rested, to stand up a
      // rested {Straw Hat Crew} Character of 7000 current power or less. Only a
      // rested one is offered: setting an active Character active changes
      // nothing.
      "OP18-075",
      {
        oncePerTurn: false,
        requires: { fieldDon: 2, sourceActive: true },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "return-don", player: "self", count: 2 },
              { kind: "update", binding: SOURCE_BINDING, rested: true },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "Straw Hat Crew",
                  maxCurrentPower: 7000,
                  rested: true,
                },
                bind: "op18-075-stand",
                min: 0,
                max: 1,
                effect: {
                  kind: "update",
                  binding: "op18-075-stand",
                  rested: false,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP18-077 White Hobby Horse: the Stage rested for [Rush: Character] on
      // one {Straw Hat Crew} Character this turn.
      "OP18-077",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "update", binding: SOURCE_BINDING, rested: true },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "Straw Hat Crew",
                },
                bind: "op18-077-rush",
                min: 0,
                max: 1,
                effect: {
                  kind: "grant-keyword",
                  binding: "op18-077-rush",
                  keyword: "Rush: Character",
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP18-078 Mini-Merry: the Stage rested for one rested DON!! each on up
      // to four of the Leader and Characters. No `category` on the selector:
      // it would drop the Leader `includeLeader` adds, and the board holds
      // nothing but Characters anyway. Withheld with no rested DON!! to give.
      "OP18-078",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, restedDon: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "update", binding: SOURCE_BINDING, rested: true },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  includeLeader: true,
                },
                bind: "op18-078-don",
                min: 0,
                max: 4,
                effect: {
                  kind: "attach-don",
                  player: "self",
                  from: "rested",
                  count: 1,
                  target: { binding: "op18-078-don", each: true },
                },
              },
            ],
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP18-076 Shark Submerge 3: the Stage rested for +1000 this turn on the
      // Leader -- only while its power is 5000 or less -- and on up to two
      // Characters. The Leader half is not a choice: a Leader that qualifies
      // gets it.
      "OP18-076",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "update", binding: SOURCE_BINDING, rested: true },
                {
                  kind: "select",
                  selector: {
                    player: "self",
                    zone: [],
                    includeLeader: true,
                    maxCurrentPower: 5000,
                  },
                  bind: "op18-076-leader",
                  count: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op18-076-leader",
                    amount: 1000,
                    expiresAfterTurns: 0,
                  },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op18-076-characters",
                  min: 0,
                  max: 2,
                  effect: {
                    kind: "modify-power",
                    binding: "op18-076-characters",
                    amount: 1000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP18-074: +4000 to the battle while a Stage of cost 5 or more is out.
      // `powerWhen`, so the offer's forecast reads nothing without one.
      "OP18-074",
      {
        cost: 1,
        power: 4000,
        powerWhen: {
          kind: "selector-count",
          player: "self",
          selector: { zone: "stage", minCost: 5 },
          operator: "gte",
          value: 1,
        },
      },
    ],
  ],
  trigger: [
    // OP18-074: DON!! −1 for up to two Stages back out of the trash.
    ["OP18-074", { effect: donMinus(1, stagesFromTrash("op18-074-add")) }],
  ],
  replacement: [
    [
      // OP18-068 Senor Pink: once per turn, its own K.O. -- by any cause, the
      // text names none -- answered with one DON!! returned.
      "OP18-068",
      {
        opponentEffectOnly: false,
        oncePerTurn: true,
        label: "Return 1 DON!! card to your DON!! deck",
        cost: { kind: "return-don", count: 1 },
      },
    ],
    [
      // OP18-069 Sodomu & Gomora: any {The Franky Family} Character's K.O.,
      // itself included, answered with one DON!! returned *and* this Character
      // rested. Not once per turn; being rested is the limit.
      "OP18-069",
      {
        opponentEffectOnly: false,
        oncePerTurn: false,
        protects: { category: "character", type: "The Franky Family" },
        label: "Return 1 DON!! card and rest this Character",
        cost: { kind: "return-don", count: 1, restsSelf: true },
      },
    ],
    [
      // OP18-071 Trebol: a {Donquixote Pirates} Character leaving the field to
      // the opponent's effect, answered with one DON!! returned, once per
      // turn.
      "OP18-071",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        protects: { category: "character", type: "Donquixote Pirates" },
        label: "Return 1 DON!! card to your DON!! deck",
        cost: { kind: "return-don", count: 1 },
      },
    ],
  ],
};
