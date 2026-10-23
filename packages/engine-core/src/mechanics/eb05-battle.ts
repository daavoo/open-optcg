/**
 * EB-05 `[Counter]`, `[On Your Opponent's Attack]`, `[When Attacking]` and
 * Leader watcher programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { restOwnCardCost } from "./eb04-main.js";
import { fishManOrMerfolkLeader } from "./eb05-red-green-shared.js";

export const eb05BattleMechanics: SetMechanics = {
  counterEvent: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-008 Luffy, Now's Your Chance's `[Counter]`. Printed text:
      // `pnpm card:text EB05-008`.
      //
      // The gate is on the defender's own board and known before the offer,
      // so it is `powerWhen` and the forecast says 0 while a cost-5 body is
      // out. No `target`: the Leader or any Character may take it, and with
      // no Characters at all the gate is open and the Leader takes it
      // (Bandai's EB05-008#1).
      "EB05-008",
      {
        cost: 1,
        power: 4000,
        powerWhen: {
          kind: "selector-count",
          player: "self",
          selector: { zone: "board", category: "character", minCost: 5 },
          operator: "eq",
          value: 0,
        },
      },
    ],
    [
      // EB05-009 Fight and Die with Me!!!'s `[Counter]`. Printed text:
      // `pnpm card:text EB05-009`.
      "EB05-009",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
    [
      // EB05-019's `[Counter]`. Printed text: `pnpm card:text EB05-019`.
      //
      // "Rest 1 of your cards" is the Leader, a Character, the Stage or an
      // active DON!! -- `restOwnCardCost` reads it that way -- and the power
      // is inside the cost, so `power: 0` and the program adds it. The battle
      // filter is the {Land of Wano} type on either the Leader or a Character.
      "EB05-019",
      {
        cost: 1,
        power: 0,
        program: {
          effect: restOwnCardCost("eb05-019-rest", {
            kind: "battle-power",
            player: "self",
            amount: 4000,
            target: { type: "Land of Wano" },
          }),
        },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  onOpponentAttack: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-013 Shirley. Printed text: `pnpm card:text EB05-013`.
      //
      // A rested DON!! for +2000 on a {Fish-Man} or {Merfolk} Leader under
      // attack. The battle filter is what withholds the offer when the
      // Leader is of another type or a Character is the target.
      "EB05-013",
      {
        oncePerTurn: true,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                {
                  kind: "battle-power",
                  player: "self",
                  amount: 2000,
                  target: fishManOrMerfolkLeader,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB05-017 Mermaid Cafe Dancers. Printed text: `pnpm card:text EB05-017`.
      //
      // Shirley's clause at twice the power for the body as well as a DON!!,
      // and with no `[Once Per Turn]` -- each copy can only pay once anyway,
      // because paying trashes it. Trashed, not K.O.'d.
      "EB05-017",
      {
        oncePerTurn: false,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "battle-power",
                  player: "self",
                  amount: 4000,
                  target: fishManOrMerfolkLeader,
                },
              ],
            },
          },
        },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  whenAttacking: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
