/**
 * OP12's removal replacements.
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
    [
      // OP12-027 Koushirou: when the opponent's effect would K.O. another of
      // your <Slash> Characters of cost 5 or less, you may rest this Character
      // instead.
      //
      // A registry entry so every K.O. path offers it -- the declarative
      // `knock-out` node as well as the imperative removals -- and offers it
      // once per threatened card: two active copies each answer the other's
      // K.O. out of one two-target removal (Bandai's OP12-027#1 ruling).
      // "Other than this Character" is the instance, so a second Koushirou is
      // covered.
      "OP12-027",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        protects: { category: "character", attribute: "Slash", maxCost: 5 },
        excludesSelf: true,
        label: "Rest Koushirou",
        cost: { kind: "rest-self" },
      },
    ],
  ],
};
