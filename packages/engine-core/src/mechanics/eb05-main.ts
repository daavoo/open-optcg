/**
 * EB-05 `[Main]` Events and `[Activate: Main]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { drawAndDiscard, payFromHand } from "./shared.js";

export const eb05MainMechanics: SetMechanics = {
  eventMain: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-029 Kimono Sleeve Cage (5). Printed text:
      // `pnpm card:text EB05-029`.
      //
      // The hand card is a cost, so the payoff is nested inside it
      // (`payFromHand`) and `trashFromHand: 1` lets the offer see there is a
      // card behind the Event to pay with. Negation and bounce land on the
      // same pick, in printed order, so the target's own text is already off
      // when it leaves the field. `maxCost` is the cost as the board reads it.
      "EB05-029",
      {
        cost: 5,
        trashFromHand: 1,
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb05-029-cost",
              1,
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 6,
                },
                bind: "eb05-029-bounce",
                min: 0,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "negate",
                      binding: "eb05-029-bounce",
                      expiresAfterTurns: 0,
                    },
                    {
                      kind: "move",
                      binding: "eb05-029-bounce",
                      to: { player: "owner", zone: "hand" },
                    },
                  ],
                },
              },
            ),
          },
        },
      },
    ],
    [
      // EB05-030 Take Care, Everybody. (2). Printed text:
      // `pnpm card:text EB05-030`.
      //
      // The bounce names no side, so `player: "either"` and the card goes to
      // its owner's hand. The [Nami] gate is the whole clause, so a wrong
      // Leader is never offered the Event's `[Main]` half. Its `[Counter]`
      // half is in `eb05-battle.ts`.
      "EB05-030",
      {
        cost: 2,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Nami",
            },
            then: {
              kind: "choose",
              selector: {
                player: "either",
                zone: "board",
                category: "character",
                maxCost: 5,
              },
              bind: "eb05-030-bounce",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb05-030-bounce",
                to: { player: "owner", zone: "hand" },
              },
            },
          },
        },
      },
    ],
    [
      // EB05-039 Pink Hornet (1). Printed text: `pnpm card:text EB05-039`.
      //
      // `donMinus: 1` on the entry, so the offer knows the price and the
      // DON!! goes back before the program runs. The Leader gate is the whole
      // program, which withholds the offer behind any other Leader rather
      // than charging a DON!! for nothing. Its `[Counter]` half is in
      // `eb05-battle.ts`.
      "EB05-039",
      {
        cost: 1,
        donMinus: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "The Vinsmoke Family",
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "eb05-039-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "eb05-039-debuff",
                amount: -4_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // EB05-040 You Need Me, Don't You?! (0). Printed text:
      // `pnpm card:text EB05-040`.
      //
      // The cost is an *active* DON!! (`from: "active"`), so the default
      // rested-first return would pay with DON!! already spent; the
      // `active-don` gate keeps a player with none from reaching the payoff.
      // The {Donquixote Pirates} gate is outermost: the cost cannot change
      // the Leader, and outermost is what withholds the offer behind any
      // other Leader rather than inviting a DON!! spent for nothing. Its
      // `[Counter]` half is in `eb05-battle.ts`.
      "EB05-040",
      {
        cost: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Donquixote Pirates",
                },
                {
                  kind: "active-don",
                  player: "self",
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
                  {
                    kind: "return-don",
                    player: "self",
                    count: 1,
                    from: "active",
                  },
                  drawAndDiscard(3, 1, "eb05-040-trash"),
                ],
              },
            },
          },
        },
      },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  activateMain: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-031 Vinsmoke Reiju. Printed text: `pnpm card:text EB05-031`.
      //
      // The source trashing itself is the cost and the DON!! are the payoff.
      // The 8000 check is outermost: the cost cannot change the opponent's
      // board, and outermost withholds the offer while no such Character is
      // there rather than inviting a body thrown away for nothing.
      // `minPower` reads base power, which is what the clause names -- a
      // buffed 7000 does not qualify. "Up to 4" is however many the DON!!
      // deck still holds.
      "EB05-031",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "opponent",
              selector: {
                zone: "board",
                category: "character",
                minPower: 8_000,
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: SOURCE_BINDING,
                    to: { player: "self", zone: "trash" },
                  },
                  { kind: "add-don", player: "self", count: 4, rested: false },
                ],
              },
            },
          },
        },
      },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
