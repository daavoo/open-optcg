/** OP15 `[On K.O.]` and `[Trigger]` programs. */
import { SOURCE_BINDING } from "../mechanics.js";
import {
  absalomRecursion,
  embarrassingLock,
  impactDialKo,
} from "./op15-shared.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd } from "./shared.js";

export const op15TriggerMechanics: SetMechanics = {
  onKo: [
    [
      // OP15-012 Buggy: "[On K.O.] Draw 1 card." Its `[When Attacking]` half is
      // in `op15-battle.ts`.
      "OP15-012",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP15-042 Kyros: "[printed text omitted -- pnpm card:text OP15-042]"
      //
      // By the time this dispatches Kyros is already in the trash, so
      // `SOURCE_BINDING` finds it there -- the same path OP17-015 Marco's
      // self-recursion takes.
      "OP15-042",
      {
        effect: {
          kind: "move",
          binding: SOURCE_BINDING,
          to: { player: "self", zone: "hand" },
        },
      },
    ],
    [
      // OP15-044 Koala: "[printed text omitted -- pnpm card:text OP15-044]"
      "OP15-044",
      lookAndAdd(3, "op15-koala-look", {
        type: "Dressrosa",
        category: "event",
      }),
    ],
    [
      // OP15-048 Chinjao: "[printed text omitted -- pnpm card:text OP15-048]"
      //
      // Only on the opponent's turn: a Chinjao you K.O. yourself gives them
      // nothing. The card leaves *their* hand, so they choose it -- the rule for
      // anything discarded out of a hand, which is what `chooser` is for.
      "OP15-048",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "opponent" },
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            bind: "op15-chinjao-bury",
            min: 1,
            max: 1,
            chooser: "opponent",
            effect: {
              kind: "move",
              binding: "op15-chinjao-bury",
              to: { player: "opponent", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
    [
      // OP15-011 Pearl: "[printed text omitted -- pnpm card:text OP15-011]"
      //
      // `maxPower` is printed power, which is what "base power" means -- a
      // Character pumped past 6000 this turn is still a legal target, and one
      // whose *base* was raised is not. Its `[Opponent's Turn]` keyword and
      // power layer are in `static-abilities.ts`.
      "OP15-011",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "East Blue",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 6000,
            },
            bind: "op15-pearl-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op15-pearl-ko" },
          },
        },
      },
    ],
    [
      // OP15-023 Arlong: "[printed text omitted -- pnpm card:text OP15-023]"
      //
      // "Cards", not "Characters": the Leader is a legal target too, and locking
      // a rested Leader down for a turn is the harder half of this clause.
      // `includeLeader` is what puts it on the table.
      "OP15-023",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            includeLeader: true,
            rested: true,
          },
          bind: "op15-arlong-lock",
          min: 0,
          max: 2,
          effect: {
            kind: "restrict",
            binding: "op15-arlong-lock",
            restriction: "cannot-refresh",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP15-024 Usopp: "[printed text omitted -- pnpm card:text OP15-024]"
      //
      // "Cards", so the Leader is a legal target: the printed ceiling bounds
      // the Characters, and a Leader prints no cost for it to bind. That
      // reading is right, but the reason given here was not -- a Leader's
      // record carries Bandai's Life figure in `cost`, so `maxCost` read 4 or
      // 5, not 0, and this clause qualified only because 7 is above both. See
      // `canBeTargeted` in queries.ts, which now exempts a Leader outright.
      "OP15-024",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            includeLeader: true,
            maxCost: 7,
            canRest: true,
          },
          bind: "op15-usopp-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op15-usopp-rest" },
        },
      },
    ],
    [
      // OP15-041 Orlumbus: "[On K.O.] Draw 1 card." Its `[Activate: Main]` half
      // is in `op15-main.ts`.
      "OP15-041",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP15-079 Absalom, shared with its `[Trigger]` below.
      "OP15-079",
      absalomRecursion,
    ],
    [
      // OP15-110 Braham: "[printed text omitted -- pnpm card:text OP15-110]"
      //
      // Yellow trading a body for Life, which is the resource its own payoffs
      // spend. "Up to" is a real decline: banking the top card costs a draw.
      "OP15-110",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Shandian Warrior",
          },
          then: {
            kind: "choose",
            selector: { player: "self", zone: "deck", position: "top" },
            bind: "op15-braham-life",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op15-braham-life",
              to: { player: "self", zone: "life", position: "top" },
            },
          },
        },
      },
    ],
    [
      // OP15-080 Oars: "[printed text omitted -- pnpm card:text OP15-080]"
      //
      // Oars is itself in the trash by the time this dispatches and may be one
      // of the three cards, but then it is no longer in the trash and is not
      // played (Bandai's OP15-080#1) -- so the play re-finds it there rather
      // than reaching for it wherever it went. `min: 3` makes a trash too
      // shallow to pay resolve to nothing.
      "OP15-080",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "trash" },
                bind: "op15-oars-cost",
                min: 3,
                max: 3,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op15-oars-cost",
                      to: { player: "self", zone: "deck", position: "bottom" },
                    },
                    {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "trash",
                        binding: SOURCE_BINDING,
                      },
                      bind: "op15-oars-self",
                      count: "all",
                      effect: { kind: "play", binding: "op15-oars-self" },
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
      // OP15-082 Charlotte Lola: "[printed text omitted -- pnpm card:text OP15-082]"
      //
      // "Your Character cards" in your trash -- the mill this card's own
      // `[On Play]` performs is what stocks it.
      "OP15-082",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            maxCost: 8,
          },
          bind: "op15-lola-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op15-lola-recur",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP15-084 Dr. Hogback: "[printed text omitted -- pnpm card:text OP15-084]"
      //
      // A refill that only fires from behind, so the count is checked after the
      // K.O. -- Hogback is already in the trash by the time this dispatches and
      // was never in hand, so nothing about the count is ambiguous.
      "OP15-084",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "hand",
            operator: "lte",
            value: 6,
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
  ],
  trigger: [
    [
      // OP15-079 Absalom: "[printed text omitted -- pnpm card:text OP15-079]"
      // Literally the same program, registered twice.
      "OP15-079",
      absalomRecursion,
    ],
    [
      // OP15-097: "[printed text omitted -- pnpm card:text OP15-097]"
      "OP15-097",
      embarrassingLock,
    ],
    [
      // OP15-019 Barrier Bulls: "[printed text omitted -- pnpm card:text OP15-019]" A narrower clause than its
      // `[Main]`, so the two are written separately.
      "OP15-019",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op15-barrier-debuff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op15-barrier-debuff",
            amount: -4000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP15-037 "[printed text omitted -- pnpm card:text OP15-037]":
      // "[Trigger] Draw 1 card."
      "OP15-037",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // OP15-117 "Heso!!": "[printed text omitted -- pnpm card:text OP15-117]" A narrower clause than its `[Main]`, so the two are
      // written separately rather than shared.
      "OP15-117",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Sky Island",
          },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP15-056 "Would You Let Me Eat the Flame-Flame Fruit?": "[Trigger] Draw
      // 2 cards." Far narrower than its 7-cost `[Main]`, so the two are written
      // separately.
      "OP15-056",
      { effect: { kind: "draw", player: "self", count: 2 } },
    ],
    [
      // OP15-115 Impact Dial: "[printed text omitted -- pnpm card:text OP15-115]" The `[Main]` half adds a Life
      // card to hand on top; the Trigger is the removal alone.
      "OP15-115",
      { effect: impactDialKo },
    ],
    [
      // OP15-103 Genbo: "[printed text omitted -- pnpm card:text OP15-103]"
      //
      // A Trigger fires from Life, so the card is in no zone a selector reaches
      // when this runs -- `SOURCE_BINDING` is the only handle on it, and `play`
      // moves it to the board from wherever it is. The Life check happens after
      // the draw and after this card has left Life, which is what makes "2 or
      // less" reachable at all.
      "OP15-103",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "if",
              condition: {
                kind: "zone-count",
                player: "self",
                zone: "life",
                operator: "lte",
                value: 2,
              },
              then: { kind: "play", binding: SOURCE_BINDING },
            },
          ],
        },
      },
    ],
    [
      // OP15-104 Conis: "[printed text omitted -- pnpm card:text OP15-104]" Unlike its `[On Play]`, no Life comparison gates it -- a Trigger
      // only fires from behind by definition.
      "OP15-104",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op15-conis-trigger-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op15-conis-trigger-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP15-106 Octoballoon: "[printed text omitted -- pnpm card:text OP15-106]"
      //
      // "Character or Stage" is a category disjunction, which is what `anyOf`'s
      // `category` clause exists for: `category` alone would drop one half.
      "OP15-106",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                color: "Yellow",
                anyOf: [{ category: "character" }, { category: "stage" }],
                maxCost: 2,
              },
              bind: "op15-octoballoon-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op15-octoballoon-play" },
            },
          ],
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP15-025 Kuro: "[printed text omitted -- pnpm card:text OP15-025]" The `[On Play]` half is in
      // `op15-on-play.ts`.
      //
      // `source-played-this-turn` is what makes this "at the end of *this*
      // turn" rather than every turn Kuro survives: the clause is set up by the
      // On Play and fires once.
      //
      // "Rested Character", not "your opponent's" -- the printed text names no
      // side, and the DON!! Kuro pushes across is what makes the opponent's
      // board the realistic target.
      "OP15-025",
      {
        effect: {
          kind: "if",
          condition: { kind: "source-played-this-turn" },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              minGivenDon: 3,
            },
            bind: "op15-kuro-lock",
            min: 0,
            max: 1,
            effect: {
              kind: "restrict",
              binding: "op15-kuro-lock",
              restriction: "cannot-refresh",
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
  ],
};
