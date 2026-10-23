/**
 * EB-05 `[Main]` Events and `[Activate: Main]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type MechanicEffect } from "../mechanics.js";
import { deckTopToLife } from "./eb05-on-play.js";
import { type SetMechanics } from "./registry.js";

/**
 * "You may K.O. 1 of your {Thriller Bark Pirates} type Characters: <effect>"
 * -- both halves of EB05-049 Special Hollow.
 *
 * The payoff nests inside the cost's `choose`, whose `min: 1` against a board
 * with no such Character skips the whole clause: an unpayable cost reaches
 * nothing. A K.O. rather than a trash, so the paid Character's own `[On K.O.]`
 * (EB05-043 Perona's, for one) fires.
 */
export const koThrillerBarkFor = (
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "board",
      category: "character",
      type: "Thriller Bark Pirates",
    },
    bind,
    min: 1,
    max: 1,
    effect: {
      kind: "sequence",
      effects: [{ kind: "knock-out", binding: bind }, effect],
    },
  },
});

export const eb05MainMechanics: SetMechanics = {
  eventMain: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
    [
      // EB05-048 Hedgehog Stinger (1). Printed text:
      // `pnpm card:text EB05-048`.
      //
      // Both prices -- a rested DON!! and a Baroque Works body -- are one
      // optional cost, so the gate on an active DON!! is outside the prompt
      // and the K.O. pick is the prompt's own `min: 1`: a player who cannot
      // pay both never reaches the payoff. The payoff is a `cannot-block`
      // on the opponent's Characters at cost 0 when it resolves, which is
      // the set the Baroque Works package's cost reducers have just made.
      "EB05-048",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "active-don",
              player: "self",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  typeIncluding: "Baroque Works",
                },
                bind: "eb05-048-ko",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "rest-don", player: "self", count: 1 },
                    { kind: "knock-out", binding: "eb05-048-ko" },
                    {
                      kind: "select",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                        maxCost: 0,
                      },
                      bind: "eb05-048-no-block",
                      count: "all",
                      effect: {
                        kind: "restrict",
                        binding: "eb05-048-no-block",
                        restriction: "cannot-block",
                        expiresAfterTurns: 0,
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
    [
      // EB05-049 Special Hollow (1). Printed text: `pnpm card:text EB05-049`.
      //
      // −3 cost for the turn on one opposing Character -- the set-up for a
      // "cost N or less" removal later in the same turn. Its `[Counter]` half
      // is in `eb05-battle.ts`.
      "EB05-049",
      {
        cost: 1,
        program: {
          effect: koThrillerBarkFor("eb05-049-main-cost", {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "eb05-049-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-cost",
              binding: "eb05-049-debuff",
              amount: -3,
              expiresAfterTurns: 0,
            },
          }),
        },
      },
    ],
    [
      // EB05-059 Charlotte Pudding!! (1). Printed text:
      // `pnpm card:text EB05-059`.
      //
      // The protected set is fixed when the Event resolves: Characters that
      // are {Big Mom Pirates} with 4000 *base* power then. Base power reads
      // `cardBasePower`, so a Character whose base OP17-112 Charlotte Linlin
      // has raised to 8000 on this turn is not one of them (Bandai's
      // EB05-059#1). `expiresAfterTurns: 1` is the printed "until the end of
      // your opponent's next End Phase".
      "EB05-059",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "Big Mom Pirates",
                  minPower: 4_000,
                  maxPower: 4_000,
                },
                bind: "eb05-059-protected",
                count: "all",
                effect: {
                  kind: "restrict",
                  binding: "eb05-059-protected",
                  restriction: "battle-ko-immune",
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB05-060 Take Care of Lilith!!! (1). Printed text:
      // `pnpm card:text EB05-060`.
      //
      // "Trash" rather than K.O., so the Egghead body's `[On K.O.]` does not
      // fire. The cost floor is effective cost, the reading "a cost of 5 or
      // more" gives a card on the field. The Life add nests inside the paid
      // trash. Its `[Counter]` half is in `eb05-battle.ts`.
      "EB05-060",
      {
        cost: 1,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                type: "Egghead",
                minCost: 5,
              },
              bind: "eb05-060-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "eb05-060-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  deckTopToLife("eb05-060-life"),
                ],
              },
            },
          },
        },
      },
    ],
  ],
  activateMain: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
    [
      // EB05-057 Nojiko. Printed text: `pnpm card:text EB05-057`.
      //
      // The recipient filter is a disjunction of attributes, and a card
      // printing several qualifies on any of them (Bandai's EB05-057#1).
      // `restedDon: 1` gates the offer, so the `[Once Per Turn]` is never
      // spent on a gift with nothing to give.
      "EB05-057",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 1,
            anyOfAttributes: ["Special", "Wisdom"],
          },
        },
      },
    ],
  ],
};
