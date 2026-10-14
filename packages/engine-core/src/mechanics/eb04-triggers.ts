/**
 * EB-04 `[Trigger]` and `[On K.O.]` programs -- the two windows a card reaches
 * without being played.
 *
 * The booster's Triggers come in two shapes and the split is worth reading
 * together: three of them draw or remove, and two of them (EB04-051, EB04-055)
 * *play the card itself* behind a Life gate. Those two are why this set rewards
 * a low Life total rather than a full one -- a flipped Life card that becomes a
 * body is only a bargain once there is little Life left to protect.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { eb04FingerPistolKo, restOwnCardCost } from "./eb04-main.js";
import {
  playFromHandUpToCost,
  restOpponentCharacterUpToCost,
} from "./eb04-on-play.js";

/**
 * "Draw 2 cards and trash 1 card from your hand."
 *
 * The `[Trigger]` half of EB04-041 and EB04-060, and the same shape EB04-059
 * prints. Written here rather than shared with the `[On Play]` copy in
 * `eb04-on-play.ts` only because the bindings differ; if a third window ever
 * needs it the two should collapse.
 */
const triggerDrawTwoTrashOne = (bind: string): MechanicEffect => ({
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

export const eb04TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // EB04-020 Shark Brick Fist. Printed text: `pnpm card:text EB04-020`.
      //
      // A cost ceiling of 4 rather than a power one: the Trigger answers a
      // developing board, not a finished one, which is the whole difference
      // between this and the `[Counter]` half in `eb04-battle.ts`.
      "EB04-020",
      { effect: restOpponentCharacterUpToCost("eb04-020-trigger-rest", 4) },
    ],
    [
      // EB04-027 Boa Hancock. Printed text: `pnpm card:text EB04-027`.
      //
      // `hasTrigger: true` on the target is printed and is the point: the free
      // body has to be another Trigger card, so the flip that produced it also
      // reloads the Life stack's next one. `maxPower` reads the printed number
      // because the card is in hand.
      //
      // Its `[On Play]` half is in `eb04-on-play.ts`.
      "EB04-027",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            maxPower: 5_000,
            hasTrigger: true,
          },
          bind: "eb04-027-trigger-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "eb04-027-trigger-play" },
        },
      },
    ],
    [
      // EB04-041 Stealth Black. Printed text: `pnpm card:text EB04-041`.
      //
      // Unconditional, unlike the `[Main]` half in `eb04-main.ts`: a 3-cost
      // Event that always replaces itself off a Life flip, which is what makes
      // it a reasonable slot in a deck that cannot always meet the Leader gate.
      "EB04-041",
      { effect: triggerDrawTwoTrashOne("eb04-041-trigger-trash") },
    ],
    [
      // EB04-049 Finger Pistol Yellow Lotus. Printed text:
      // `pnpm card:text EB04-049`.
      //
      // "Activate this card's [Main] effect" is one program run twice, not a
      // copy: `eb04FingerPistolKo` is the same value the `[Main]` offer in
      // `eb04-main.ts` carries, so the mill cost and the base-cost ceiling
      // cannot drift apart between the two windows.
      //
      // The 4 cost is *not* paid here -- a Trigger activates the effect, not
      // the card -- which is what makes this the set's best Life card and why
      // the cost is only declared on the `[Main]` offer.
      "EB04-049",
      { effect: eb04FingerPistolKo },
    ],
    [
      // EB04-051 Emet. Printed text: `pnpm card:text EB04-051`.
      //
      // A board-wide −3000 and then, at zero Life, an 8-cost 7000 for free --
      // the two halves are sequenced because the debuff resolves whatever the
      // Life total is. `select` with `count: "all"` over the opponent's board is
      // the "all of your opponent's Characters": mandatory text with no choice
      // in it.
      //
      // The Life gate is exactly 0, not "2 or less": this is the card the deck
      // flips on the turn it is about to lose, and `play` on `SOURCE_BINDING` is
      // the "play this card" idiom -- from wherever the flip left it.
      //
      // Its continuous "cannot attack unless" half is a row in
      // `static-abilities.ts`.
      "EB04-051",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "eb04-051-debuff",
              count: "all",
              effect: {
                kind: "modify-power",
                binding: "eb04-051-debuff",
                amount: -3_000,
                expiresAfterTurns: 0,
              },
            },
            {
              kind: "if",
              condition: {
                kind: "zone-count",
                player: "self",
                zone: "life",
                operator: "eq",
                value: 0,
              },
              then: { kind: "play", binding: SOURCE_BINDING },
            },
          ],
        },
      },
    ],
    [
      // EB04-055 Bartholomew Kuma. Printed text:
      // `pnpm card:text EB04-055`.
      //
      // `combined-life` is the printed "you and your opponent have a total of 5
      // or less Life cards" -- one number across the table, which no
      // `zone-count` can say. It reads as a race clock: the Trigger comes on
      // late in a game either player might be winning, not only in one this
      // deck is losing.
      //
      // Both the Leader type and the combined total are required, so
      // `all-of` rather than two nested `if`s -- the two are one gate.
      // Its `[On K.O.]` half is registered below.
      "EB04-055",
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
      // EB04-060 Gum-Gum Hawk Gatling. Printed text:
      // `pnpm card:text EB04-060`.
      //
      // The same draw-two-trash-one every 2-cost Yellow Event in this set
      // prints, and unconditional: its `[Main]` half in `eb04-main.ts` is the
      // one that costs Life.
      "EB04-060",
      { effect: triggerDrawTwoTrashOne("eb04-060-trigger-trash") },
    ],
  ],
  onKo: [
    [
      // EB04-015 Jinbe. Printed text: `pnpm card:text EB04-015`.
      //
      // The rest is a cost paid *after* this body has already left the field,
      // which is why `restOwnCardCost` reaches the Leader and a Stage as well
      // as the board: on the turn Jinbe trades, the board it left may be empty.
      //
      // The colour filter is printed and is not decoration -- "green Character
      // card" rather than a type, so a Fish-Man Leader's off-colour bodies do
      // not qualify. `anyOf` on the two types is the printed "{Fish-Man} or
      // {Merfolk}", read of the Leader.
      "EB04-015",
      {
        effect: restOwnCardCost("eb04-015-rest", {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "Fish-Man" },
              { kind: "leader-has-type", player: "self", type: "Merfolk" },
            ],
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              color: "Green",
              maxCost: 6,
            },
            bind: "eb04-015-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "eb04-015-play" },
          },
        }),
      },
    ],
    [
      // EB04-055 Bartholomew Kuma. Printed text:
      // `pnpm card:text EB04-055`.
      //
      // Free and unconditional, unlike this card's `[Trigger]` above: a 4-cost
      // 5000 that leaves a body behind whenever it trades, which is what makes
      // it the Revolutionary Army deck's floor rather than its ceiling.
      "EB04-055",
      {
        effect: playFromHandUpToCost(
          "eb04-055-ko-play",
          "Revolutionary Army",
          4,
        ),
      },
    ],
  ],
};
