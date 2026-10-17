/**
 * OP17's removal replacements: "if <a Character> would be <removed>, you may
 * <pay> instead."
 *
 * Registered here rather than as hand-written branches in `removal.ts` so all
 * three removal paths offer them: the `knock-out` node, the `move` node for a
 * bounce or a bury, and battle destruction. A branch in `removal.ts` is only
 * ever asked by the older `ko-character` pending effect.
 *
 * Bandai's OP-17 Q&A (OP17-015 Q1, OP17-021 Q3, OP17-023 Q2, OP17-095 Q2) rules
 * that one payment protects every Character one effect removes at the same
 * time; the `knock-out` and `move` nodes carry that for every registered entry.
 *
 * Comments paraphrase what each entry has to do rather than quoting the card --
 * printed text is a runtime asset, not repo content (`pnpm card:text OP17-0xx`
 * prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";

export const op17ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP17-015 Marco: when the opponent's effect would remove one of your
      // Characters from the field, you may K.O. Marco instead.
      //
      // OP16-014 Marco's shape with the wider "removed from the field"
      // reading, so a bounce or a bury is answered as well as a K.O. -- Marco's
      // own bounce included, which is the one case where offering Marco for
      // Marco saves anything. `ko-self` runs the real removal pipeline, so his
      // `[On K.O.]` recursion fires.
      "OP17-015",
      {
        opponentEffectOnly: true,
        removal: "off-field",
        oncePerTurn: false,
        protects: { category: "character" },
        label: "K.O. Marco",
        cost: { kind: "ko-self" },
      },
    ],
    [
      // OP17-021 Crone Oli: when the opponent's effect would remove one of
      // your Characters whose type includes "Red-Haired Pirates", you may rest
      // 1 of your Characters instead.
      //
      // "A type including" is the substring reading, which is what reaches
      // {Red-Haired Pirates Allies} -- Crone Oli's own type and OP17-026
      // Fugar's. The card rested is any of the controller's -- Leader, Character,
      // Stage or DON!! -- Oli herself included.
      "OP17-021",
      {
        opponentEffectOnly: true,
        removal: "off-field",
        oncePerTurn: false,
        protects: {
          category: "character",
          typeIncluding: "Red-Haired Pirates",
        },
        label: "Rest 1 of your cards",
        cost: { kind: "rest-own-cards", count: 1 },
      },
    ],
    [
      // OP17-023 Nami: when one of your {East Blue} or {Straw Hat Crew}
      // Characters would be K.O.'d, you may rest Nami instead.
      //
      // No "by your opponent's effect": a lost battle and its controller's own
      // K.O. are both answered. K.O. only, so a bounce goes through. Nami is
      // both types herself, so an active Nami can save herself.
      "OP17-023",
      {
        opponentEffectOnly: false,
        oncePerTurn: false,
        protects: {
          category: "character",
          anyOf: [{ type: "East Blue" }, { type: "Straw Hat Crew" }],
        },
        label: "Rest Nami",
        cost: { kind: "rest-self" },
      },
    ],
    [
      // OP17-043 Ganzui: when Ganzui would be removed from the field, you may
      // trash 2 cards from your hand instead.
      //
      // Guards its own printing only (`protects` absent), and names no source:
      // its controller's own removal and a lost battle are answered too. Its
      // `[On Play]` is in `op17-on-play.ts`.
      "OP17-043",
      {
        opponentEffectOnly: false,
        removal: "off-field",
        oncePerTurn: false,
        label: "Trash 2 cards from your hand",
        cost: { kind: "trash-from-hand", count: 2 },
      },
    ],
    [
      // OP17-095 Roronoa Zoro: when the opponent's effect would remove one of
      // your Characters from the field, you may place 3 cards from your trash
      // at the bottom of your deck instead.
      //
      // Any Character of yours, Zoro included. Payable only while the trash
      // holds 3 cards, which `eligibleReplacements` checks.
      "OP17-095",
      {
        opponentEffectOnly: true,
        removal: "off-field",
        oncePerTurn: false,
        protects: { category: "character" },
        label: "Place 3 cards from your trash at the bottom of your deck",
        cost: { kind: "bury-from-trash", count: 3 },
      },
    ],
  ],
};
