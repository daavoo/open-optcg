/**
 * PRB-02's replacement effects.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text PRB02-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";

export const prb02ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // PRB02-002 Trafalgar Law: once a turn, shrinking by 2000 instead of
      // leaving the field to the opponent's effect.
      //
      // The same clause ST15-005 Portgas.D.Ace prints, and written the same
      // way: `removal: "off-field"` because "removed from the field" answers a
      // bounce and a bury as well as a K.O., and the penalty lands on the body
      // it saves. Its `[When Attacking]` is in `prb02-battle.ts`.
      "PRB02-002",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        label: "Give it −2000 power instead",
        cost: { kind: "power-penalty", amount: -2_000 },
      },
    ],
  ],
};
