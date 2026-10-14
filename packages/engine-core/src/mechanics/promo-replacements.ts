/**
 * The one replacement effect the `P-` promos print.
 *
 * A clause with no printed timing marker: "if your <filter> Character would be
 * removed from the field by your opponent's effect, you may <pay> instead". It
 * sits in its own file because the registry that dispatches it is a different
 * one -- see `ReplacementProgram` in `types.ts`.
 *
 * Comments paraphrase what the program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text P-111` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";

export const promoReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // P-111 Nico Robin: once a turn, the whole {Straw Hat Crew} board stops
      // answering the opponent's removal for the price of one DON!! turned
      // over.
      //
      // `rest-don` is the cheapest recurring cost in the registry -- the DON!!
      // is back next Refresh, so what it really spends is this turn's Counter
      // money. `[Once Per Turn]` is what keeps it from answering a whole
      // sweep, and it is the only limit: the cost is payable every turn.
      //
      // `removal: "off-field"` is the printed "removed from the field", wider
      // than a K.O.: a bounce and a bury are answered too. `protects` filters
      // the *threatened* card, and Robin carries the type herself, so she is
      // inside her own clause.
      "P-111",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        protects: { category: "character", type: "Straw Hat Crew" },
        label: "Rest 1 of your DON!! cards",
        cost: { kind: "rest-don", count: 1 },
      },
    ],
  ],
};
