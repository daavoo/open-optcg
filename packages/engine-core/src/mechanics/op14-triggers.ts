/** OP14 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs. */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  restableCards,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  donMinus,
  lookAndAdd,
  payFromHand,
  playThrillerBarkFromTrashRested,
} from "./shared.js";
import {
  kujaTriggerPlay,
  playTriggerBodyFromHand,
  topDeckToLife,
} from "./op14-shared.js";
import { op14EventPrograms } from "./op14-main.js";

/**
 * "Draw N cards and trash N cards from your hand" -- OP14-085
 * Miss.Goldenweek and OP14-089 Ryuma print the symmetric form, and three
 * other cards print it with different numbers.
 *
 * The draw happens first, so a card just drawn may be one of the ones thrown
 * away; the discard is mandatory, which is what makes this rummaging rather
 * than card advantage.
 */
const drawThenDiscard = (draw: number, discard: number): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: draw },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind: "op14-draw-discard",
      min: discard,
      max: discard,
      effect: {
        kind: "move",
        binding: "op14-draw-discard",
        to: { player: "self", zone: "trash" },
      },
    },
  ],
});

/** "Add up to 1 DON!! card from your DON!! deck and rest it." */
const addRestedDon: MechanicEffect = {
  kind: "add-don",
  player: "self",
  count: 1,
  rested: true,
};

export const op14TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // OP14-018 Time for the Counterattack: "[printed text omitted -- pnpm card:text OP14-018]"
      "OP14-018",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            color: "Red",
            maxPower: 2000,
          },
          bind: "op14-counterattack-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op14-counterattack-play" },
        },
      },
    ],
    [
      // OP14-019 "I Have a Plan to Take Down One of the Four Emperors!!":
      // "[Trigger] Draw 1 card."
      "OP14-019",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP14-036 "Strive to Surpass me, Roronoa Zoro!!!": "[printed text omitted -- pnpm card:text OP14-036]"
      //
      // "your cards" is the Leader and the Characters, and resting your own is
      // not merely a price in Green -- it is what the set's "when this Character
      // becomes rested" package is built to be paid with.
      "OP14-036",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: restableCards("self"),
            bind: "op14-surpass-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: "op14-surpass-cost" },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxPower: 7000,
                    canRest: true,
                  },
                  bind: "op14-surpass-rest",
                  min: 0,
                  max: 1,
                  effect: { kind: "rest", binding: "op14-surpass-rest" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP14-057 "Don't Worry!! I'm Here!!": "[Trigger] Draw 2 cards."
      "OP14-057",
      { effect: { kind: "draw", player: "self", count: 2 } },
    ],
    [
      // OP14-059 "Please Take Me with You!! I Can Be of Great Help to You!!":
      // "[printed text omitted -- pnpm card:text OP14-059]"
      //
      // "1 Character", either side's: returning your own is how a Blue deck
      // re-uses an [On Play] off a Life card.
      "OP14-059",
      {
        effect: {
          kind: "choice",
          branches: [
            {
              id: "theirs",
              label: "Return 1 of your opponent's Characters",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 4,
                },
                bind: "op14-help-theirs",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op14-help-theirs",
                  to: { player: "opponent", zone: "hand" },
                },
              },
            },
            {
              id: "own",
              label: "Return 1 of your Characters",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  maxCost: 4,
                },
                bind: "op14-help-own",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op14-help-own",
                  to: { player: "self", zone: "hand" },
                },
              },
            },
            { id: "none", label: "Return nothing" },
          ],
        },
      },
    ],
    // The Thriller Bark recursion Trigger, printed identically on five more
    // cards in this set. `playThrillerBarkFromTrashRested` is the shared
    // fragment; OP14-102, OP14-110 and OP14-111 already reference it from
    // `op16-nami.ts`, the module named after the deck that plays them.
    ["OP14-082", playThrillerBarkFromTrashRested],
    ["OP14-089", playThrillerBarkFromTrashRested],
    ["OP14-100", playThrillerBarkFromTrashRested],
    ["OP14-109", playThrillerBarkFromTrashRested],
    ["OP14-117", playThrillerBarkFromTrashRested],
    [
      // OP14-097 "[printed text omitted -- pnpm card:text OP14-097]": "[printed text omitted -- pnpm card:text OP14-097]" The same program the Event's own `[Main]`
      // entry runs, referenced rather than restated so the two cannot drift.
      "OP14-097",
      op14EventPrograms["OP14-097"]!,
    ],
    [
      // OP14-099 "Disappointed?": "[printed text omitted -- pnpm card:text OP14-099]"
      "OP14-099",
      op14EventPrograms["OP14-099"]!,
    ],
    [
      // OP14-103 Gloriosa (Grandma Nyon): "[Trigger] Play this card."
      "OP14-103",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP14-106 Salome: "[Trigger] Play this card."
      "OP14-106",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    // "[printed text omitted -- pnpm card:text OP14-106]"
    ["OP14-105", kujaTriggerPlay],
    ["OP14-107", kujaTriggerPlay],
    ["OP14-113", kujaTriggerPlay],
    ["OP14-114", kujaTriggerPlay],
    ["OP14-115", kujaTriggerPlay],
    // "[printed text omitted -- pnpm card:text OP14-115]"
    ["OP14-112", playTriggerBodyFromHand],
    ["OP14-118", playTriggerBodyFromHand],
    [
      // OP14-116 Salamander: "[Trigger] Draw 1 card."
      "OP14-116",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
  ],
  onKo: [
    [
      // OP14-010 Basil Hawkins: "[printed text omitted -- pnpm card:text OP14-010]"
      //
      // A search that *plays* rather than adds to hand, so it is written out
      // rather than reusing `lookAndAdd`: only the middle step differs.
      "OP14-010",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 5,
              bind: "op14-hawkins",
            },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op14-hawkins",
                category: "character",
                type: "Supernovas",
                maxPower: 2000,
                excludeName: "Basil Hawkins",
              },
              bind: "op14-hawkins-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op14-hawkins-play" },
            },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op14-hawkins",
              },
              bind: "op14-hawkins-rest",
              count: "all",
              effect: {
                kind: "move",
                binding: "op14-hawkins-rest",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP14-024 Kin'emon: "[printed text omitted -- pnpm card:text OP14-024]"
      // "Cards", not Characters: the Leader and the Stage are legal targets.
      "OP14-024",
      {
        effect: {
          kind: "choose",
          selector: restableCards("opponent"),
          bind: "op14-kinemon-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op14-kinemon-rest" },
        },
      },
    ],
    [
      // OP14-033 Perona: "[printed text omitted -- pnpm card:text OP14-033]"
      "OP14-033",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: restableCards("self"),
            bind: "op14-perona033-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: "op14-perona033-cost" },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    category: "character",
                    color: "Green",
                    maxCost: 5,
                  },
                  bind: "op14-perona033-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op14-perona033-play" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP14-043 Aladine: "[On K.O.] Draw 1 card."
      "OP14-043",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP14-045 Kuroobi: "[On K.O.] Draw 1 card." Its other clause -- [Rush]
      // while a card has been trashed from hand by an effect this turn -- is a
      // static keyword layer.
      "OP14-045",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP14-051 Hatchan: "[printed text omitted -- pnpm card:text OP14-051]"
      //
      // The `[DON!! x2]` is read against the DON!! Hatchan was carrying when it
      // died, not against an empty board -- see `source-attached-don`, which the
      // K.O. paths feed the whole board entry for exactly this clause.
      "OP14-051",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 2,
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP14-062 Gladius: "[printed text omitted -- pnpm card:text OP14-062]"
      //
      // "K.O. **or** rest" is a `choice`, not two optionals: taking both would
      // be two effects for one payment. Base power, so a Character pumped past
      // 6000 for the turn is still a legal target.
      "OP14-062",
      {
        effect: donMinus(1, {
          kind: "choice",
          branches: [
            {
              id: "ko",
              label: "K.O. 1 Character with 6000 base power or less",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxPower: 6000,
                },
                bind: "op14-gladius-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op14-gladius-ko" },
              },
            },
            {
              id: "rest",
              label: "Rest 1 Character with 6000 base power or less",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxPower: 6000,
                  canRest: true,
                },
                bind: "op14-gladius-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "op14-gladius-rest" },
              },
            },
          ],
        }),
      },
    ],
    [
      // OP14-063 Sugar: "[printed text omitted -- pnpm card:text OP14-063]"
      "OP14-063",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "opponent",
            operator: "gte",
            value: 6,
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              type: "Donquixote Pirates",
              maxCost: 5,
            },
            bind: "op14-sugar-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op14-sugar-play" },
          },
        },
      },
    ],
    [
      // OP14-064 Giolla: "[printed text omitted -- pnpm card:text OP14-064]"
      //
      // Base power exactly 0, which is written as both bounds: the clause is
      // Purple's answer to the 0-power utility bodies the format runs, not a
      // ceiling on small ones.
      "OP14-064",
      {
        effect: {
          kind: "sequence",
          effects: [
            addRestedDon,
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                minPower: 0,
                maxPower: 0,
              },
              bind: "op14-giolla-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op14-giolla-ko" },
            },
          ],
        },
      },
    ],
    [
      // OP14-065 Senor Pink: "[printed text omitted -- pnpm card:text OP14-065]" Mandatory, and theirs, which is the
      // only DON!! denial in the set.
      "OP14-065",
      { effect: { kind: "return-don", player: "opponent", count: 1 } },
    ],
    [
      // OP14-067 Dellinger: "[printed text omitted -- pnpm card:text OP14-067]"
      "OP14-067",
      {
        effect: {
          kind: "sequence",
          effects: [
            addRestedDon,
            lookAndAdd(5, "op14-dellinger", { type: "Donquixote Pirates" })
              .effect,
          ],
        },
      },
    ],
    [
      // OP14-072 Baby 5: "[printed text omitted -- pnpm card:text OP14-072]"
      "OP14-072",
      { effect: donMinus(1, topDeckToLife) },
    ],
    [
      // OP14-074 Monet: "[printed text omitted -- pnpm card:text OP14-074]"
      "OP14-074",
      {
        effect: {
          kind: "sequence",
          effects: [
            drawThenDiscard(2, 1),
            { kind: "add-don", player: "self", count: 2, rested: true },
          ],
        },
      },
    ],
    [
      // OP14-075 Lao.G: "[printed text omitted -- pnpm card:text OP14-075]"
      "OP14-075",
      {
        effect: {
          kind: "sequence",
          effects: [
            addRestedDon,
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op14-laog-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op14-laog-debuff",
                amount: -2000,
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
    [
      // OP14-081 Spider Mice: "[printed text omitted -- pnpm card:text OP14-081]"
      //
      // Base cost, so the +2/+3/+4 cost buffs this deck's own Black package
      // hands out do not protect a target from it, and the OP14-079 Leader's
      // −10 does not create one either.
      "OP14-081",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            minBaseCost: 1,
            maxBaseCost: 1,
          },
          bind: "op14-spidermice-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op14-spidermice-ko" },
        },
      },
    ],
    [
      // OP14-082 Oinkchuck: "[printed text omitted -- pnpm card:text OP14-082]"
      //
      // A cost buff is protection: it lifts the whole board out of "cost N or
      // less" removal for a turn.
      "OP14-082",
      {
        effect: {
          kind: "select",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Thriller Bark Pirates",
          },
          bind: "op14-oinkchuck",
          count: "all",
          effect: {
            kind: "modify-cost",
            binding: "op14-oinkchuck",
            amount: 4,
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP14-085 Miss.Goldenweek(Marianne): "[printed text omitted -- pnpm card:text OP14-085]"
      "OP14-085",
      { effect: drawThenDiscard(2, 2) },
    ],
    [
      // OP14-088 Miss.MerryChristmas(Drophy): "[printed text omitted -- pnpm card:text OP14-088]"Baroque Works"[printed text omitted -- pnpm card:text OP14-088]"
      "OP14-088",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-type-including",
            player: "self",
            text: "Baroque Works",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "stage",
                  minCost: 1,
                  maxCost: 1,
                },
                bind: "op14-merry-stage",
                min: 0,
                max: 1,
                // `knock-out` rather than `move`: the K.O. node is the one that
                // knows how to take a card out of the Stage zone, which is a
                // single field rather than an array (OP17-018/116 print the
                // same clause).
                effect: { kind: "knock-out", binding: "op14-merry-stage" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP14-089 Ryuma: "[printed text omitted -- pnpm card:text OP14-089]"
      "OP14-089",
      { effect: drawThenDiscard(2, 2) },
    ],
    [
      // OP14-091 Mr.2.Bon.Kurei(Bentham): "[printed text omitted -- pnpm card:text OP14-091]"Baroque Works"[printed text omitted -- pnpm card:text OP14-091]"
      //
      // Two zones in one selection, which is what the array form of `zone` is
      // for -- the printed clause offers a single choice across both.
      "OP14-091",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: ["hand", "trash"],
            category: "character",
            typeIncluding: "Baroque Works",
            maxCost: 5,
            excludeName: "Mr.2.Bon.Kurei(Bentham)",
          },
          bind: "op14-bentham-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op14-bentham-play" },
        },
      },
    ],
    [
      // OP14-093 Mr.4(Babe): "[printed text omitted -- pnpm card:text OP14-093]"Baroque Works"[printed text omitted -- pnpm card:text OP14-093]"
      "OP14-093",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            typeIncluding: "Baroque Works",
            maxCost: 8,
          },
          bind: "op14-babe-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op14-babe-recur",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP14-100 Absalom: "[printed text omitted -- pnpm card:text OP14-100]"
      "OP14-100",
      lookAndAdd(3, "op14-absalom", { type: "Thriller Bark Pirates" }),
    ],
    [
      // OP14-115 Rindo: "[printed text omitted -- pnpm card:text OP14-115]"
      //
      // Yellow's Life-cycling: the card just buried is the one the damage takes
      // straight back off, so the net effect is to run a card off the top of the
      // deck through the Trigger window. `[Opponent's Turn]` is a `turn-player`
      // gate, the same way EB03-055's `[On K.O.]` reads it.
      //
      // "Up to 1" makes the Life card optional and the damage not: Bandai's
      // OP14-115 Q&A rules that declining the add still takes the damage.
      "OP14-115",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "opponent" },
          then: {
            kind: "sequence",
            effects: [topDeckToLife, { kind: "deal-damage", player: "self" }],
          },
        },
      },
    ],
    [
      // OP14-120 Crocodile: "[printed text omitted -- pnpm card:text OP14-120]"
      //
      // By the time this dispatches Crocodile is already in the trash, so
      // `play`'s `SOURCE_BINDING` finds it there and brings it straight back --
      // the same recursion OP17-015 Marco prints.
      "OP14-120",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op14-croc-cost",
            1,
            { kind: "play", binding: SOURCE_BINDING },
          ),
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP14-022 Usopp: "[printed text omitted -- pnpm card:text OP14-022]"
      "OP14-022",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "FILM" },
              {
                kind: "leader-has-type",
                player: "self",
                type: "Straw Hat Crew",
              },
            ],
          },
          then: { kind: "activate-don", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP14-023 Kikunojo: "[printed text omitted -- pnpm card:text OP14-023]"
      //
      // `update` rather than the `rest` node's inverse: setting a card active is
      // not a board event anything watches, unlike resting one.
      "OP14-023",
      { effect: { kind: "update", binding: SOURCE_BINDING, rested: false } },
    ],
    [
      // OP14-039 Coffin Boat (Stage): "[printed text omitted -- pnpm card:text OP14-039]"
      "OP14-039",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Dracule Mihawk",
          },
          then: { kind: "activate-don", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP14-054 Fisher Tiger: "[printed text omitted -- pnpm card:text OP14-054]" The price of its own [On Play]
      // draw-3, and it is paid every turn the Character survives.
      "OP14-054",
      { effect: { kind: "trash-hand-down-to", player: "self", size: 5 } },
    ],
    [
      // OP14-071 Pica: "[printed text omitted -- pnpm card:text OP14-071]"
      "OP14-071",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Donquixote Pirates",
          },
          then: { kind: "add-don", player: "self", count: 1, rested: false },
        },
      },
    ],
  ],
};
