/**
 * OP12's removal replacement.
 *
 * Comments paraphrase what the entry has to do rather than quoting the card --
 * printed text is a runtime asset, not repo content (`pnpm card:text OP12-070`
 * prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";

export const op12ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP12-070 Sanji: when the opponent's effect would remove this Character
      // from the field, you may return 1 DON!! from your field to your DON!!
      // deck instead.
      //
      // EB04-030 Kaido's price on a narrower window: only an opponent's effect,
      // so a lost battle still K.O.s it, and "removed from the field" so a
      // bounce is answered as well. Guards its own printing only, and is not
      // once per turn -- it is payable for as long as a DON!! is on the field.
      // The DON!! it returns raises the same `don-returned` signal OP12-072
      // Zeff reads.
      "OP12-070",
      {
        opponentEffectOnly: true,
        removal: "off-field",
        oncePerTurn: false,
        label: "Return 1 DON!! card to your DON!! deck",
        cost: { kind: "return-don", count: 1 },
      },
    ],
  ],
};
