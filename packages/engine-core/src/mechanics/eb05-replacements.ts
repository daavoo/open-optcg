/**
 * EB-05 replacement programs: "... would be ... instead" text.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type SetMechanics } from "./registry.js";

export const eb05ReplacementMechanics: SetMechanics = {
  replacement: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-061 Nami. Printed text: `pnpm card:text EB05-061`.
      //
      // OP15-098 Monkey.D.Luffy's window: "by your opponent" with no
      // "effect", so `opponentOnly` -- the opponent's removal and a battle
      // their attacker wins, never its controller's own -- and "removed from
      // the field", so a bounce or a bury as well as a K.O. `maxPower` is
      // base power. Nami herself is one of the Characters it guards (Bandai's
      // EB05-061#1), and with no Life card the price cannot be paid and the
      // save is not offered (EB05-061#2). Its `[On Play]` is in
      // `eb05-on-play.ts`.
      "EB05-061",
      {
        opponentEffectOnly: false,
        opponentOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        protects: { category: "character", maxPower: 6000 },
        label: "Add 1 card from the top of your Life cards to your hand",
        cost: { kind: "life-to-hand", count: 1 },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
