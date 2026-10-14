/**
 * ST-22's two replacement effects, clauses with no printed timing marker: "if
 * this Character would be <removed> by your opponent's effect, you may <pay>
 * instead". They sit in their own file because the registry that dispatches
 * them is a different one -- see `ReplacementProgram` in `types.ts`.
 *
 * Comments paraphrase what the program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST22-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";

export const st22ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // ST22-005 Kouzuki Oden: two cards from hand answer any removal the
      // opponent's effects aim at him -- a K.O., a bounce or a bury alike,
      // which is what `"off-field"` reads. No `[Once Per Turn]`: it is
      // repeatable for as long as the hand can pay. Its `[Activate: Main]` is
      // in `st22-main.ts`.
      "ST22-005",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        label: "Trash 2 cards from your hand",
        cost: { kind: "trash-from-hand", count: 2 },
      },
    ],
    [
      // ST22-012 Marco: once a turn, a card from hand answers an effect K.O.
      // Only a K.O. -- a bounce goes through -- which is the `"ko"` default.
      "ST22-012",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        label: "Trash 1 card from your hand",
        cost: { kind: "trash-from-hand", count: 1 },
      },
    ],
  ],
};
