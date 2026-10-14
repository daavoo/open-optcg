/**
 * The two removal replacements OP07 prints.
 *
 * Both read the wider "removed from the field" rather than "K.O.'d", so they
 * answer a bounce and a bury as well as a K.O. -- see `ReplacementProgram`'s
 * `removal` field. They are kept together for the reason
 * `op13-replacements.ts` groups by the rule rather than by the set: the two
 * differ only in what they pay, and reading them side by side is what makes
 * those two prices comparable.
 *
 * Comments paraphrase what each entry has to do rather than quoting the card --
 * printed text is a runtime asset, not repo content (`pnpm card:text OP07-0xx`
 * prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { warlordLeader } from "./op07-shared.js";

export const op07ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP07-029 Basil Hawkins: the removal is answered by resting one of the
      // *opponent's* Characters, which no other replacement in the pool does.
      //
      // The price is not a resource its controller spends at all -- it is tempo
      // taken off the player who pointed the removal, which is why a 6-cost
      // 7000 gets it for nothing but a `[Once Per Turn]`. Its conditional
      // [Blocker] is a row in `static-abilities.ts`.
      "OP07-029",
      {
        opponentEffectOnly: true,
        removal: "off-field",
        oncePerTurn: true,
        label: "Rest 1 of your opponent's Characters",
        cost: { kind: "rest-opponent-characters", count: 1 },
      },
    ],
    [
      // OP07-042 Gecko Moria: a teammate buried to keep the 5-cost body.
      //
      // "Other than [Gecko Moria]" is a name, so a second copy cannot pay for
      // the first with itself -- and `protects` is absent, which is how "if
      // *this* Character would be removed" reads: each copy guards only its own
      // printing. The Leader gate is a `requires`, evaluated with the
      // threatened card's controller as `"self"`.
      "OP07-042",
      {
        opponentEffectOnly: true,
        removal: "off-field",
        oncePerTurn: true,
        requires: warlordLeader,
        label: "Place 1 of your other Characters at the bottom of your deck",
        cost: {
          kind: "bottom-deck-own-character",
          count: 1,
          match: { excludeName: "Gecko Moria" },
        },
      },
    ],
  ],
};
