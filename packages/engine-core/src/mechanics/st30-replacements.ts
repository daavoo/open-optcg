/**
 * ST-30's two replacement effects.
 *
 * Both are clauses with no printed timing marker: "if your Character with 6000
 * base power would be removed from the field by your opponent's effect, you may
 * <pay> instead". They sit in one file because the pair is what makes their two
 * prices comparable -- the same protection, over the same board, bought once
 * with the protector's life and once with its turn.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST30-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { sixThousandBody } from "./st30-shared.js";

export const st30ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // ST30-009 LittleOars Jr.: a 1-cost 2000 that dies in a 6000's place and
      // draws off it.
      //
      // `removal: "off-field"` is the printed "removed from the field", which
      // is wider than a K.O.: a bounce to hand and a bury into the deck are
      // answered too, and in a wall deck those are what the opponent reaches
      // for. `trash-self-and-draw` rather than `ko-self`, because the printed
      // word is trash -- nothing keyed on a K.O. fires off it.
      //
      // `protects` names the 6000s and this body is a 2000, so it can never
      // save itself.
      "ST30-009",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: sixThousandBody,
        label: "Trash LittleOars Jr. and draw 1 card",
        cost: { kind: "trash-self-and-draw", draw: 1 },
      },
    ],
    [
      // ST30-011 Buggy: the same protection, paid with the rest of its own
      // turn rather than with its life.
      //
      // `rest-self` is the cheapest cost in the registry and the only one whose
      // protector survives paying -- but this card is also a [Blocker], so the
      // rest is a real price: a Buggy that has answered a removal cannot block
      // the attack that follows it. That is why the two entries here are worth
      // reading together.
      "ST30-011",
      {
        opponentEffectOnly: true,
        oncePerTurn: false,
        removal: "off-field",
        protects: sixThousandBody,
        label: "Rest Buggy",
        cost: { kind: "rest-self" },
      },
    ],
  ],
};
