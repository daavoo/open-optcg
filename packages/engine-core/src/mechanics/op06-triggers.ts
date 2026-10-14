/**
 * OP06 `[Trigger]` and `[On K.O.]` programs.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP06-0xx` prints it from the local cache).
 *
 * "Activate this card's [X] effect" is registered as the *same* program object
 * the other table holds, imported rather than rewritten: two copies of one
 * printed clause is how the two windows drift apart.
 *
 * Four OP06 identities the community decks ship keep their `[Trigger]`s in the
 * modules named after those decks: OP06-038 (`op14-mihawk.ts`), OP06-104,
 * OP06-109 and OP06-110 (`op06-yamato.ts`), plus OP06-058's, which was
 * migrated with its `[Main]` half.
 */
import { type SetMechanics } from "./registry.js";
import { koCostAtMost } from "./op08-shared.js";
import { buffOwnCardForTurn, restCostAtMost } from "./op07-shared.js";
import {
  battleShield,
  killingTime,
  murakumoSword,
  negativeHollow,
  sharkArrows,
} from "./op06-main.js";
import {
  buryOpponentCostAtMost,
  filmSearch,
  koPowerAtMost,
  playSelfWhenBehind,
  playSelfWhenOpponentBehind,
  trashFromHand,
} from "./op06-shared.js";
import { SOURCE_BINDING } from "../mechanics.js";

export const op06TriggerMechanics: SetMechanics = {
  trigger: [
    // OP06-013 Monkey.D.Luffy: the same dig its `[On Play]` runs.
    ["OP06-013", filmSearch],
    [
      // OP06-018 Gum-Gum King Kong Gatling: removal by power off a Life card,
      // where the `[Main]` half is a buff. The two halves of an Event answer
      // different boards, which is why a Trigger is worth reading before it is
      // declined.
      "OP06-018",
      { effect: koPowerAtMost(5_000, "op06-gatling-trigger") },
    ],
    [
      // OP06-019 Blue Dragon Seal Water Stream: the `[Main]`'s ceiling, one
      // step lower.
      "OP06-019",
      { effect: koPowerAtMost(4_000, "op06-water-stream-trigger") },
    ],
    [
      // OP06-023 Arlong: a rest rather than the `[On Play]`'s attack lock,
      // which is what a defensive Trigger can use -- it comes up on the
      // opponent's turn, when a lock on their Leader has already been spent.
      "OP06-023",
      { effect: restCostAtMost(4, "op06-arlong-trigger") },
    ],
    [
      // OP06-031 Hatchan: a Fish-Man body out of hand, free.
      "OP06-031",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
            maxCost: 3,
          },
          bind: "op06-hatchan",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op06-hatchan" },
        },
      },
    ],
    // OP06-039, OP06-040, OP06-056 and OP06-097: "activate this card's [Main]
    // effect", which is the same program object their `[Main]` entries hold.
    ["OP06-039", { effect: killingTime }],
    ["OP06-040", { effect: sharkArrows }],
    ["OP06-056", { effect: murakumoSword }],
    ["OP06-097", { effect: negativeHollow }],
    [
      // OP06-041 The Ark Noah: a Stage off a Life card, which brings its own
      // `[On Play]` board-wide rest with it -- the `play` node dispatches that
      // clause the same way the play action does.
      "OP06-041",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // OP06-057 But I Will Never Doubt a Woman's Tears!!!!: the hand half of
      // the `[Main]`'s deck-top gamble. "A cost of 2" is exact, so `minCost`
      // and `maxCost` together.
      "OP06-057",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            minCost: 2,
            maxCost: 2,
          },
          bind: "op06-tears-trigger",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op06-tears-trigger" },
        },
      },
    ],
    [
      // OP06-059 White Snake: a five-deep look, split between the two ends of
      // the deck in the player's own order -- which is what
      // `order-to-bottom`'s `alternate` asks, a card at a time.
      "OP06-059",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 5,
              bind: "op06-white-snake-look",
            },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op06-white-snake-look",
              },
              bind: "op06-white-snake-order",
              count: "all",
              effect: {
                kind: "order-to-bottom",
                binding: "op06-white-snake-order",
                to: { player: "self", zone: "deck", position: "bottom" },
                alternate: { player: "self", zone: "deck", position: "top" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP06-077 Black Bug: the `[Main]`'s removal a cost lower, and without
      // the DON!! gate -- a Trigger cannot wait for the right DON!! count.
      "OP06-077",
      { effect: buryOpponentCostAtMost(4, "op06-black-bug-trigger") },
    ],
    // OP06-078 GERMA 66 and OP06-116 Reject: a card, off a Life card.
    ["OP06-078", { effect: { kind: "draw", player: "self", count: 1 } }],
    ["OP06-116", { effect: { kind: "draw", player: "self", count: 1 } }],
    [
      // OP06-095 Shadows Asgard: two cards for one, which on a Purple deck
      // that wants a full trash is two-thirds of a payoff.
      "OP06-095",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            trashFromHand(1, "op06-asgard-trigger"),
          ],
        },
      },
    ],
    [
      // OP06-096 ...Nothing...at All!!!: "activate this card's [Counter]
      // effect", which is the program its `[Counter]` entry holds -- the Life
      // card the cost adds to hand is the one this Trigger came off.
      "OP06-096",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "life", position: "top" },
            bind: "op06-nothing-trigger-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op06-nothing-trigger-cost",
                  to: { player: "self", zone: "hand" },
                },
                battleShield,
              ],
            },
          },
        },
      },
    ],
    // The Land of Wano bodies that arrive off a Life card once the opponent is
    // inside three Life, and the Shandia ones that arrive once their own
    // controller is inside two. Six cards print one of the two; four of them
    // are here and two are in `op06-yamato.ts`.
    ["OP06-100", playSelfWhenOpponentBehind],
    ["OP06-103", playSelfWhenOpponentBehind],
    ["OP06-112", playSelfWhenOpponentBehind],
    ["OP06-102", playSelfWhenBehind],
    ["OP06-111", playSelfWhenBehind],
    [
      // OP06-101 O-Nami: removal by cost, where the `[On Play]` half hands out
      // [Banish].
      "OP06-101",
      { effect: koCostAtMost(5, "op06-onami-trigger") },
    ],
    [
      // OP06-108 Tenguyama Hitetsu: a vanilla 1-cost body whose whole text is
      // this Trigger -- +2000 on a {Land of Wano} card, which is a Counter the
      // deck did not have to hold in hand.
      "OP06-108",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            type: "Land of Wano",
          },
          bind: "op06-hitetsu",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op06-hitetsu",
            amount: 2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
  ],
  onKo: [
    [
      // OP06-027 Gyro: a rest on the way out, which is why a 1-cost 2000 body
      // is worth blocking with.
      "OP06-027",
      { effect: restCostAtMost(3, "op06-gyro") },
    ],
    [
      // OP06-036 Ryuma: the same removal its `[On Play]` runs -- the printed
      // clause names both windows at once.
      "OP06-036",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
            maxCost: 4,
          },
          bind: "op06-ryuma-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op06-ryuma-ko" },
        },
      },
    ],
    [
      // OP06-053 Jaguar.D.Saul: a cheap body under a deck on the way out,
      // either side's -- the printed clause names none.
      "OP06-053",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 2,
          },
          bind: "op06-saul",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op06-saul",
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // OP06-082 Inuppe: the same two-for-two its `[On Play]` runs.
      "OP06-082",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Thriller Bark Pirates",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              trashFromHand(2, "op06-inuppe-ko"),
            ],
          },
        },
      },
    ],
    [
      // OP06-084 Jigoro of the Wind: +1000 somewhere on the way out, which
      // makes a 2-cost body that blocked into a Counter as well.
      "OP06-084",
      { effect: buffOwnCardForTurn(1_000, "op06-jigoro") },
    ],
    [
      // OP06-089 Taralan: the same three cards its `[On Play]` mills.
      "OP06-089",
      { effect: { kind: "trash-top", player: "self", count: 3 } },
    ],
  ],
};
