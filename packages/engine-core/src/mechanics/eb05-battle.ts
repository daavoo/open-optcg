/**
 * EB-05 `[Counter]`, `[On Your Opponent's Attack]`, `[When Attacking]` and
 * Leader watcher programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { koThrillerBarkFor } from "./eb05-main.js";
import { turnLifeFaceUp } from "./op11-shared.js";
import { type SetMechanics } from "./registry.js";
import { payFromHand } from "./shared.js";

export const eb05BattleMechanics: SetMechanics = {
  counterEvent: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
    [
      // EB05-048 Hedgehog Stinger (1). Printed text:
      // `pnpm card:text EB05-048`. A flat +3000 that lands only while the
      // Leader is the card being attacked. Its `[Main]` half is in
      // `eb05-main.ts`.
      "EB05-048",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // EB05-049 Special Hollow (1). Printed text: `pnpm card:text EB05-049`.
      //
      // `power: 0` with the buff inside the paid K.O., because the +4000 is
      // bought: the forecast must not promise it to a board with no
      // {Thriller Bark Pirates} Character to pay with. "Your Leader or
      // Characters" names no narrower card than the battle's, so the buff
      // carries no filter.
      "EB05-049",
      {
        cost: 1,
        power: 0,
        program: {
          effect: koThrillerBarkFor("eb05-049-counter-cost", {
            kind: "battle-power",
            player: "self",
            amount: 4_000,
          }),
        },
      },
    ],
    [
      // EB05-060 Take Care of Lilith!!! (1). Printed text:
      // `pnpm card:text EB05-060`.
      //
      // The price is turning the top Life card face-up, which a card already
      // face-up cannot pay (`turnLifeFaceUp` selects a face-down top card
      // only), so `power: 0` and the buff inside the cost.
      "EB05-060",
      {
        cost: 1,
        power: 0,
        program: turnLifeFaceUp("eb05-060-counter-cost", {
          kind: "battle-power",
          player: "self",
          amount: 4_000,
        }),
      },
    ],
  ],
  onOpponentAttack: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
    [
      // EB05-046 Yamato. Printed text: `pnpm card:text EB05-046`.
      //
      // Not `[Once Per Turn]`, so it is offered on every attack. The trash
      // count is read inside the paid cost, after the card has landed there:
      // nine in the trash plus the one paid is ten (Bandai's EB05-046#1).
      // `set-leader-base-power` because "becomes 7000" does not stack with
      // another such clause -- the highest live one applies.
      "EB05-046",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb05-046-cost",
              1,
              {
                kind: "if",
                condition: {
                  kind: "zone-count",
                  player: "self",
                  zone: "trash",
                  operator: "gte",
                  value: 10,
                },
                then: {
                  kind: "set-leader-base-power",
                  player: "self",
                  value: 7_000,
                  expiresAfterTurns: 0,
                },
              },
            ),
          },
        },
      },
    ],
  ],
  whenAttacking: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
    [
      // EB05-053 Charlotte Praline. Printed text: `pnpm card:text EB05-053`.
      //
      // The gate reads the opponent's hand when the attack is declared; the
      // card added goes on top of Life face-down, and "up to" lets the
      // player keep it. Its `[Trigger]` is in `eb05-triggers.ts`.
      "EB05-053",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "opponent",
              zone: "hand",
              operator: "gte",
              value: 9,
            },
            then: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb05-053-life",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb05-053-life",
                to: { player: "self", zone: "life", position: "top" },
              },
            },
          },
        },
      },
    ],
  ],
};
