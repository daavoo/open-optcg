/**
 * OP11's K.O. replacement.
 *
 * One card, and it is the only one in the pool whose cost is paid by resting a
 * *Stage* or the Leader rather than a Character -- see `rest-own-cards`' `zones`.
 */
import { type SetMechanics } from "./registry.js";

export const op11ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP11-110 Fukaboshi: "[printed text omitted -- pnpm card:text OP11-110]"
      //
      // "Would be K.O.'d", with no "by your opponent's effect" and no
      // "[Once Per Turn]": battle destruction is inside it, and the protection is
      // repeatable for as long as there is something active to rest. What the
      // deck pays is its own Stage -- OP11-117 Fish-Man Island, whose own
      // `[Activate: Main]` also wants to be active -- or the Leader, which in
      // this archetype cannot attack anyway (OP11-022 prints "This Leader cannot
      // attack"), making the Leader the cheapest body in the game to rest.
      //
      // Both halves are named cards in zones no `match` can reach on its own: a
      // Stage is not on the board and a Leader is in no zone at all.
      "OP11-110",
      {
        opponentEffectOnly: false,
        oncePerTurn: false,
        label: "Rest your Fish-Man Island or your Shirahoshi Leader",
        cost: {
          kind: "rest-own-cards",
          count: 1,
          match: {
            anyOf: [{ name: "Fish-Man Island" }, { name: "Shirahoshi" }],
          },
          zones: ["stage"],
          includeLeader: true,
        },
      },
    ],
  ],
};
