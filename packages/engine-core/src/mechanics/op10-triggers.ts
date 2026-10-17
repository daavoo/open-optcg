/**
 * OP10 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { op10EventPrograms } from "./op10-main.js";
import { donMinus, lookAndAdd, payFromHand } from "./shared.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the Trigger OP10-097 and
 * OP10-116 share.
 *
 * The trash is mandatory and comes after the draw, so one of the two cards just
 * drawn is a legal discard: net one card, chosen from three.
 */
const drawTwoTrashOne = (bind: string): MechanicEffect => ({
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: 2 },
    {
      kind: "choose",
      selector: { player: "self", zone: "hand" },
      bind,
      min: 1,
      max: 1,
      effect: {
        kind: "move",
        binding: bind,
        to: { player: "self", zone: "trash" },
      },
    },
  ],
});

/** "Rest up to 1 of your opponent's Characters with a cost of N or less." */
const restOpponentUpToCost = (cost: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost: cost,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

export const op10TriggerMechanics: SetMechanics = {
  onKo: [
    [
      // OP10-035 Brook: "[printed text omitted -- pnpm card:text OP10-035]"
      //
      // The Leader is a legal target, and a rested Leader cannot attack -- which
      // on a 3-cost body traded in battle is the whole point. `includeLeader` is
      // how a Leader is named at all: it sits in no zone.
      "OP10-035",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            includeLeader: true,
            maxCost: 5,
            canRest: true,
          },
          bind: "op10-brook-ko-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op10-brook-ko-rest" },
        },
      },
    ],
    [
      // OP10-055 Marco: "[printed text omitted -- pnpm card:text OP10-055]"
      "OP10-055",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 4,
          },
          bind: "op10-marco-bounce",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op10-marco-bounce",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP10-062 Violet: "[printed text omitted -- pnpm card:text OP10-062]"
      //
      // The DON!! is returned before the Leader is checked, which is the printed
      // order: paying and then finding the wrong Leader is a real way to spend a
      // DON!! for nothing, and `donMinus` keeps the payment optional.
      "OP10-062",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Donquixote Pirates",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              category: "event",
              color: "Purple",
            },
            bind: "op10-violet-recur",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op10-violet-recur",
              to: { player: "self", zone: "hand" },
            },
          },
        }),
      },
    ],
    [
      // OP10-090 Franky: "[printed text omitted -- pnpm card:text OP10-090]"
      //
      // Rested, so the body it brings back cannot block this turn -- which is
      // what separates this from the same clause on an [On Play].
      "OP10-090",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            type: "Dressrosa",
            maxCost: 3,
            excludeSource: true,
          },
          bind: "op10-franky-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "play",
            binding: "op10-franky-recur",
            rested: true,
          },
        },
      },
    ],
    [
      // OP10-106 Killer: "[printed text omitted -- pnpm card:text OP10-106]"
      //
      // Two types as a disjunction rather than two searches: a card that is both
      // is still one card, and running the selector twice would offer it twice.
      "OP10-106",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Supernovas",
          },
          then: lookAndAdd(3, "op10-killer-look", {
            anyOf: [{ type: "Supernovas" }, { type: "Kid Pirates" }],
          }).effect,
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP10-003 Sugar (Leader): "[printed text omitted -- pnpm card:text OP10-003]"
      //
      // Current power, so DON!! given to a Character counts toward the 6000 --
      // which is what a Purple board that has just attacked with it looks like.
      // Its `[Opponent's Turn]` event watcher is in `op10-watchers.ts`.
      "OP10-003",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              type: "Donquixote Pirates",
              minCurrentPower: 6_000,
            },
            operator: "gte",
            value: 1,
          },
          then: { kind: "activate-don", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP10-037 Lim: "[printed text omitted -- pnpm card:text OP10-037]"
      //
      // The engine that makes the Green ODYSSEY package's "if you have 2 or more
      // rested Characters" gates payable: rest on your turn, come back at the end
      // of it. Its replacement clause is in `op10-replacements.ts`.
      "OP10-037",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "ODYSSEY",
            rested: true,
          },
          bind: "op10-lim-active",
          min: 0,
          max: 1,
          effect: { kind: "update", binding: "op10-lim-active", rested: false },
        },
      },
    ],
    [
      // OP10-072 Donquixote Rosinante: "[printed text omitted -- pnpm card:text OP10-072]"
      "OP10-072",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 7,
          },
          then: { kind: "activate-don", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP10-112 Eustass"Captain"Kid: "[printed text omitted -- pnpm card:text OP10-112]"
      //
      // The draw is not a refill -- it is a filter, and it only turns on once the
      // opponent is two hits from losing, which is when this 8-drop has been
      // doing its other half's work.
      "OP10-112",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "life",
            operator: "lte",
            value: 2,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op10-kid-end-discard",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op10-kid-end-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // OP10-018 Ten-Layer Igloo: "[printed text omitted -- pnpm card:text OP10-018]"
      //
      // The turn rather than the battle: a Trigger resolves from a damaged Life
      // card, and the battle that revealed it is already decided.
      "OP10-018",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", includeLeader: true },
          bind: "op10-igloo-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op10-igloo-trigger",
            amount: 1_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP10-020 Gum-Gum UFO: "[printed text omitted -- pnpm card:text OP10-020]"
      //
      // Current power -- `maxCurrentPower` -- since the text says "power", not
      // "base power": a Character the opponent has pumped with DON!! on their
      // own turn is out of reach, and one debuffed down to 3000 is in it.
      "OP10-020",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 3_000,
          },
          bind: "op10-ufo-trigger-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op10-ufo-trigger-ko" },
        },
      },
    ],
    [
      // OP10-039 Gum-Gum Dragon Fire Pistol Twister Star: "[printed text omitted -- pnpm card:text OP10-039]"
      "OP10-039",
      { effect: restOpponentUpToCost(5, "op10-twister-trigger-rest") },
    ],
    [
      // OP10-041 Radio Knife: "[printed text omitted -- pnpm card:text OP10-041]" A narrower clause than its
      // `[Main]`, so the two are written separately.
      "OP10-041",
      { effect: restOpponentUpToCost(4, "op10-radio-trigger-rest") },
    ],
    [
      // OP10-059 Fo...llow...Me...and...I...Will...Gui...de...You: "[printed text omitted -- pnpm card:text OP10-059]"
      "OP10-059",
      op10EventPrograms["OP10-059"]!,
    ],
    [
      // OP10-060 Barrier-Barrier Pistol: "[printed text omitted -- pnpm card:text OP10-060]"
      "OP10-060",
      op10EventPrograms["OP10-060"]!,
    ],
    [
      // OP10-061 Special Long-Range Attack!! Bagworm: "[printed text omitted -- pnpm card:text OP10-061]"
      //
      // "1 Character", either side -- wider than its own `[Main]`, which names
      // the opponent's. Returning your own 2-drop off a Trigger is a real line:
      // it picks an [On Play] back up for free.
      "OP10-061",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 2,
          },
          bind: "op10-bagworm-trigger",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op10-bagworm-trigger",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP10-079 God Thread: "[printed text omitted -- pnpm card:text OP10-079]"
      "OP10-079",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // OP10-080 Little Black Bears: "[printed text omitted -- pnpm card:text OP10-080]"
      "OP10-080",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // OP10-096 There's No Longer Any Need for the Seven Warlords of the
      // Sea!!!: "[printed text omitted -- pnpm card:text OP10-096]"
      "OP10-096",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            type: "The Seven Warlords of the Sea",
            maxCost: 4,
          },
          bind: "op10-warlords-trigger-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op10-warlords-trigger-ko" },
        },
      },
    ],
    [
      // OP10-097 Gum-Gum Rhino Schneider: "[printed text omitted -- pnpm card:text OP10-097]"
      "OP10-097",
      { effect: drawTwoTrashOne("op10-rhino-trigger-discard") },
    ],
    [
      // OP10-098 Liberation: "[printed text omitted -- pnpm card:text OP10-098]"
      //
      // "Up to 1 of each" is two independent choices, not one of two: the Leader
      // and a Character can both be switched off. A Leader is named through
      // `includeLeader` with `zone: []` -- the idiom for text that reaches only
      // the Leader.
      "OP10-098",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: [],
                includeLeader: true,
              },
              bind: "op10-liberation-negate-leader",
              min: 0,
              max: 1,
              effect: {
                kind: "negate",
                binding: "op10-liberation-negate-leader",
                expiresAfterTurns: 0,
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op10-liberation-negate-character",
              min: 0,
              max: 1,
              effect: {
                kind: "negate",
                binding: "op10-liberation-negate-character",
                expiresAfterTurns: 0,
              },
            },
          ],
        },
      },
    ],
    [
      // OP10-100 Inazuma: "[printed text omitted -- pnpm card:text OP10-100]"
      //
      // Both halves in one `all-of`: a 4-cost body off a Trigger, but only late,
      // when the combined Life pile has run down to five.
      "OP10-100",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "leader-has-type",
                player: "self",
                type: "Revolutionary Army",
              },
              { kind: "combined-life", operator: "lte", value: 5 },
            ],
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // OP10-110 Heat & Wire: "[printed text omitted -- pnpm card:text OP10-110]"
      "OP10-110",
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
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // OP10-113 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP10-113]"
      //
      // The trash is paid before the Leader is read, which is the printed order.
      // Its "[Rush] while behind on Life" half is a static ability.
      "OP10-113",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op10-zoro-trigger-cost",
            1,
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Supernovas",
              },
              then: { kind: "play", binding: SOURCE_BINDING },
            },
          ),
        },
      },
    ],
    [
      // OP10-115 Let's Meet Again in the New World: "[printed text omitted -- pnpm card:text OP10-115]"
      //
      // A ceiling that closes as the opponent's Life runs down, which is the
      // opposite of every other Yellow clause in the set: this one is worth most
      // while they are still healthy.
      "OP10-115",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCostFromZoneCount: { player: "opponent", zone: "life" },
          },
          bind: "op10-meet-again-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op10-meet-again-ko" },
        },
      },
    ],
    [
      // OP10-116 Damned Punk: "[printed text omitted -- pnpm card:text OP10-116]"
      "OP10-116",
      { effect: drawTwoTrashOne("op10-damned-trigger-discard") },
    ],
    [
      // OP10-117 ROOM: "[Trigger] Draw 1 card."
      "OP10-117",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
  ],
};
