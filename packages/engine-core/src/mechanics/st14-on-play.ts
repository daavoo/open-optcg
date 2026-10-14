/**
 * ST-14 `[On Play]` programs.
 *
 * The starter is 17 cards and splits the same way the main sets do, by the
 * timing window a clause fires in: this file, `st14-main.ts`, `st14-battle.ts`
 * and `st14-triggers.ts`. Four of the product's clauses are continuous text
 * with no window to fire in and are rows in `../static-abilities.ts` instead.
 * See `mechanics/README.md`.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST14-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { koCostAtMost } from "./op08-shared.js";
import { ownBodyAtCost, robinCostDrop } from "./st14-shared.js";

export const st14OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // ST14-003 Sanji: behind a 6-cost body, K.O. anything at cost 5 or less.
      //
      // The gate and the ceiling are both effective cost, so the product's own
      // cost buffs count twice over: they carry the controller's board over
      // the gate, and the opponent's own buffs lift theirs out of reach.
      "ST14-003",
      {
        effect: {
          kind: "if",
          condition: ownBodyAtCost(6),
          then: koCostAtMost(5, "st14-sanji-ko"),
        },
      },
    ],
    [
      // ST14-006 Nami: a 3-cost [Blocker] that replaces itself, but only from a
      // hand that is not already full and only behind an 8-cost body.
      //
      // Both halves of the printed condition sit in one `all-of`: the hand
      // ceiling is what stops the deck refilling a grip it has not spent, and
      // is read *after* the card has left the hand to be played.
      "ST14-006",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "zone-count",
                player: "self",
                zone: "hand",
                operator: "lte",
                value: 6,
              },
              ownBodyAtCost(8),
            ],
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    // ST14-007 Nico Robin prints one clause for two windows; the program is in
    // `st14-shared.ts` and is registered from `st14-battle.ts` as well.
    ["ST14-007", robinCostDrop],
    [
      // ST14-017 Thousand Sunny (Stage): a card, behind a Leader of the type.
      //
      // The rest of the Stage -- +1 cost to the whole black {Straw Hat Crew}
      // board -- is continuous and is a `stage-aura` row in
      // `../static-abilities.ts`. Only this half has a window to fire in, and
      // a Stage reaches it the same way a Character does: `play-card`
      // dispatches an `[On Play]` for both categories.
      "ST14-017",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Straw Hat Crew",
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
  ],
};
