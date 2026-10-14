/**
 * PRB-02 `[Trigger]` programs.
 *
 * The set prints no `[On K.O.]` or `[End of Your Turn]` this file has to carry:
 * PRB02-008 Marco's `[On K.O.]` draw is in `op16-nami.ts` and PRB02-015
 * Shiryu's in `st27.ts`, both there since before the set was imported. See
 * `mechanics/README.md`.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

export const prb02TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // PRB02-012 Nami: "[Trigger] Play this card."
      //
      // The 2-cost body comes down for free off a Life card, and playing it
      // runs its own `[On Play]` -- the five-deep Straw Hat search in
      // `prb02-on-play.ts`.
      "PRB02-012",
      { effect: { kind: "play", binding: SOURCE_BINDING } },
    ],
    [
      // PRB02-017 Boa Hancock: "[Trigger] K.O. up to 1 of your opponent's
      // Characters with a cost of 4 or less."
      //
      // Cost, not power, and effective cost rather than base: the card says
      // "a cost of 4 or less" with no "base", so a body a static layer has made
      // more expensive is out of reach. That is the same reading `maxCost`
      // takes everywhere else, and it is the half of this card's two clauses
      // that fires without being paid for.
      "PRB02-017",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 4,
          },
          bind: "prb02-hancock-trigger",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "prb02-hancock-trigger" },
        },
      },
    ],
  ],
};
