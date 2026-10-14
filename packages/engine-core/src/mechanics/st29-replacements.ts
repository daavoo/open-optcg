/**
 * ST-29's one replacement effect.
 *
 * A clause with no printed timing marker: "if your {Egghead} Character would be
 * K.O.'d by your opponent's effect, you may <pay> instead". It sits in its own
 * file rather than beside the Triggers because the registry that dispatches it
 * is a different one -- see `ReplacementProgram` in `types.ts`.
 *
 * Comments paraphrase what the program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST29-008` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";

export const st29ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // ST29-008 Nami: a 3-cost 1000 body that answers the opponent's removal
      // for the whole {Egghead} board, and pays with information rather than
      // with a card.
      //
      // `turn-life-face-up` is the printed cost: the Life total does not move,
      // and what the opponent gains is knowing what their next attack turns
      // over -- which in this deck is usually a Trigger that plays a body for
      // free, so the price is smaller than it reads.
      //
      // No `[Once Per Turn]`, so the only limit is the face-down Life left to
      // turn. `protects` filters the *threatened* card, and Nami carries the
      // {Egghead} type herself, so she is inside her own aura.
      "ST29-008",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        protects: { category: "character", type: "Egghead" },
        label: "Turn 1 of your Life cards face-up",
        cost: { kind: "turn-life-face-up" },
      },
    ],
  ],
};
