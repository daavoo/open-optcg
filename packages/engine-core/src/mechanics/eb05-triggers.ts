/**
 * EB-05 `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type MechanicEffect, SOURCE_BINDING } from "../mechanics.js";
import { atlasSearch } from "./eb05-on-play.js";
import { seraphimTrigger } from "./op08-triggers.js";
import { type SetMechanics } from "./registry.js";
import {
  asOnPlayTrigger,
  drawAndDiscard,
  lookAndAdd,
  restCostAtMost,
  lookAndAddOrTrash,
} from "./shared.js";
import { playCharacterFromHand } from "./eb05-shared.js";

/** "Play this card." -- EB05-051 Ahiru's and EB05-056 Nico Olvia's `[Trigger]`. */
const playThisCard: MechanicEffect = { kind: "play", binding: SOURCE_BINDING };

/**
 * "Play up to N Character cards with <power> power and <filter> from your
 * hand" -- the shape EB05-054, EB05-057 and EB05-059 print as their
 * `[Trigger]`, differing in the count, the power band and the filter.
 *
 * Power is printed power: a card in hand has nothing to modify it.
 */
const playFromHand = (
  bind: string,
  max: number,
  filter: {
    minPower?: number;
    maxPower: number;
    type?: string;
    hasTrigger?: boolean;
  },
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "self",
    zone: "hand",
    category: "character",
    ...filter,
  },
  bind,
  min: 0,
  max,
  effect: { kind: "play", binding: bind },
});

export const eb05TriggerMechanics: SetMechanics = {
  trigger: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-016 Nico Robin's `[Trigger]`. Printed text:
      // `pnpm card:text EB05-016`.
      "EB05-016",
      { effect: restCostAtMost(6, "eb05-016-rest") },
    ],
    [
      // EB05-019's `[Trigger]`. Printed text: `pnpm card:text EB05-019`.
      //
      // The count is the opponent's -- the attacker whose hit flipped this
      // card -- so it pays out late in the race, when they are close to
      // winning. Printed power, which is what a card in hand has.
      "EB05-019",
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
          then: playCharacterFromHand(
            { type: "Land of Wano", maxPower: 6000 },
            "eb05-019-play",
          ),
        },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-025 Domino. Printed text: `pnpm card:text EB05-025`.
      //
      // "Activate this card's [On Play]": the same program as the `[On Play]`
      // in `eb05-on-play.ts`, marked with `asOnPlayTrigger` so a negation of
      // [On Play] effects reaches it too.
      "EB05-025",
      asOnPlayTrigger(
        lookAndAdd(3, "eb05-025-trigger-look", { type: "Impel Down" }),
      ),
    ],
    [
      // EB05-029 Kimono Sleeve Cage. Printed text: `pnpm card:text EB05-029`.
      //
      // The plain refill: the trash is mandatory, and after two draws the
      // hand can always pay it.
      "EB05-029",
      { effect: drawAndDiscard(2, 1, "eb05-029-trigger-trash") },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
    // EB05-050 Atlas. Printed text: `pnpm card:text EB05-050`. The `[On Play]`
    // itself, marked so a negation of `[On Play]` effects reaches it too.
    ["EB05-050", asOnPlayTrigger(atlasSearch)],
    // EB05-051 Ahiru. Printed text: `pnpm card:text EB05-051`. Played off
    // the Life card, its `[On Play]` then resolves as any play's does.
    ["EB05-051", { effect: playThisCard }],
    [
      // EB05-052 Gloriosa. Printed text: `pnpm card:text EB05-052`.
      //
      // Mandatory trash after the draw, so the hand the two draws produce is
      // the hand the trash is paid from.
      "EB05-052",
      { effect: drawAndDiscard(2, 1, "eb05-052-trash") },
    ],
    // EB05-053 Charlotte Praline. Printed text: `pnpm card:text EB05-053`.
    // The OP08 Seraphim shape: the Life gate is read inside the paid trash.
    ["EB05-053", seraphimTrigger("eb05-053-trigger-cost")],
    [
      // EB05-054 Charlotte Brulee. Printed text: `pnpm card:text EB05-054`.
      //
      // Exactly 4000, so the band is written from both ends; "up to 2" is
      // one `choose` of two, which cannot pick the same card twice.
      "EB05-054",
      {
        effect: playFromHand("eb05-054-play", 2, {
          minPower: 4_000,
          maxPower: 4_000,
          type: "Big Mom Pirates",
        }),
      },
    ],
    // EB05-055 Nami. Printed text: `pnpm card:text EB05-055`. The same
    // Seraphim shape as EB05-053.
    ["EB05-055", seraphimTrigger("eb05-055-trigger-cost")],
    // EB05-056 Nico Olvia. Printed text: `pnpm card:text EB05-056`.
    ["EB05-056", { effect: playThisCard }],
    [
      // EB05-057 Nojiko. Printed text: `pnpm card:text EB05-057`.
      //
      // The Life gate counts after the Trigger's own card has left Life,
      // which is the total the player is actually on when it resolves.
      "EB05-057",
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
          then: playFromHand("eb05-057-play", 1, {
            maxPower: 6_000,
            hasTrigger: true,
          }),
        },
      },
    ],
    [
      // EB05-059 Charlotte Pudding!!. Printed text: `pnpm card:text EB05-059`.
      //
      // The draw lands first, so the card it finds is already a candidate
      // for the play.
      "EB05-059",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            playFromHand("eb05-059-play", 1, {
              minPower: 4_000,
              maxPower: 4_000,
              hasTrigger: true,
            }),
          ],
        },
      },
    ],
  ],
  onKo: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-004 Baby 5's `[On K.O.]`. Printed text: `pnpm card:text EB05-004`.
      //
      // Any K.O., on either turn, and the body comes in rested -- so on the
      // opponent's turn it is a fresh body that cannot block, and on its
      // controller's own it cannot attack. Printed power for a card in hand.
      "EB05-004",
      {
        effect: playCharacterFromHand(
          { maxPower: 6000 },
          "eb05-004-play",
          true,
        ),
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-022 Octopako. Printed text: `pnpm card:text EB05-022`.
      //
      // Unconditional and answering any K.O., battle or effect, so a bare
      // program rather than an `OnKoProgram`.
      "EB05-022",
      { effect: { kind: "draw", player: "self", count: 2 } },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
    [
      // EB05-043 Perona. Printed text: `pnpm card:text EB05-043`.
      //
      // One printed "K.O. or rest", so a `choice` of two branches over the
      // same cost-6 ceiling: either may find nothing, which is the "up to".
      // Behind an empty board the choice is not asked at all. The rest branch
      // carries `canRest`, the K.O. branch does not need it.
      "EB05-043",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "opponent",
            selector: { zone: "board", category: "character", maxCost: 6 },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "choice",
            branches: [
              {
                id: "ko",
                label:
                  "K.O. up to 1 of your opponent's Characters with a cost of 6 or less",
                effect: {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 6,
                  },
                  bind: "eb05-043-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "eb05-043-ko" },
                },
              },
              {
                id: "rest",
                label:
                  "Rest up to 1 of your opponent's Characters with a cost of 6 or less",
                effect: {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 6,
                    canRest: true,
                  },
                  bind: "eb05-043-rest",
                  min: 0,
                  max: 1,
                  effect: { kind: "rest", binding: "eb05-043-rest" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB05-045 Ms. Monday. Printed text: `pnpm card:text EB05-045`.
      //
      // The leftovers go to the trash rather than the bottom of the deck,
      // which in a Black list is fuel rather than a loss. The substring type
      // reaches {Former Baroque Works} cards as well.
      "EB05-045",
      lookAndAddOrTrash(3, "eb05-045-look", { typeIncluding: "Baroque Works" }),
    ],
  ],
  onEndOfYourTurn: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-007 Monet's `[End of Your Turn]`. Printed text:
      // `pnpm card:text EB05-007`.
      //
      // One turn of expiry, booked at the end of this turn, is "until the end
      // of your opponent's next End Phase": the 1000-power body defends at
      // 6000 through the opponent's whole turn.
      "EB05-007",
      {
        effect: {
          kind: "modify-power",
          binding: SOURCE_BINDING,
          amount: 5000,
          expiresAfterTurns: 1,
        },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
