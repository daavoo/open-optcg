/**
 * The four replacements OP05 prints.
 *
 * Kept together for the reason `op13-replacements.ts` groups by the rule: the
 * four differ in what they protect and what they pay, and reading them side by
 * side is what makes the prices comparable. Two shapes are new to the registry
 * here -- a penalty paid *by the threatened card* (OP05-001) and a Life card
 * trashed (OP05-100) -- and none of the four is scoped to "by your opponent's
 * effect", so all four answer battle destruction too.
 *
 * Comments paraphrase what each entry has to do rather than quoting the card --
 * printed text is a runtime asset, not repo content (`pnpm card:text OP05-0xx`
 * prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";

export const op05ReplacementMechanics: SetMechanics = {
  replacement: [
    [
      // OP05-001 Sabo (Leader): with a DON!! given to it, on the opponent's
      // turn, once, a Character of 5000 or more shrinks by 1000 instead of
      // dying. Current power -- a body that has been debuffed under 5000 is
      // outside the clause, which is what the opponent's −N Events are for.
      "OP05-001",
      {
        opponentEffectOnly: false,
        oncePerTurn: true,
        opponentTurnOnly: true,
        leaderAttachedDon: 1,
        protects: { category: "character", minCurrentPower: 5_000 },
        label: "Give it −1000 power",
        cost: { kind: "power-penalty", amount: -1_000 },
      },
    ],
    [
      // OP05-030 Donquixote Rosinante: on the opponent's turn, a rested
      // Character is saved by trashing this one. Not itself -- a Rosinante that
      // is the rested body under threat cannot trash itself for itself, the
      // same line OP15-094 Zoro's `excludesSelf` draws. Its [Blocker] is
      // printed text.
      "OP05-030",
      {
        opponentEffectOnly: false,
        oncePerTurn: false,
        opponentTurnOnly: true,
        protects: { category: "character", rested: true },
        excludesSelf: true,
        label: "Trash Donquixote Rosinante",
        cost: { kind: "trash-self" },
      },
    ],
    [
      // OP05-032 Pica: once a turn, another Character of cost 3 or more rests
      // instead of Pica dying -- and Pica's own `[End of Your Turn]` stands it
      // back up, so the deck's biggest Blocker is very hard to remove. "Other
      // than [Pica]" is a name, so a second copy cannot pay for the first.
      "OP05-032",
      {
        opponentEffectOnly: false,
        oncePerTurn: true,
        label: "Rest 1 of your other Characters with a cost of 3 or more",
        cost: {
          kind: "rest-own-cards",
          count: 1,
          match: { category: "character", minCost: 3, excludeName: "Pica" },
        },
      },
    ],
    [
      // OP05-100 Enel: once a turn, the top card of its controller's Life is
      // trashed instead of Enel leaving the field -- a K.O., a bounce, a bury,
      // anything -- unless a [Monkey.D.Luffy] Character is on either board,
      // which switches the clause off entirely. Its [Rush] is printed text.
      "OP05-100",
      {
        opponentEffectOnly: false,
        oncePerTurn: true,
        removal: "off-field",
        requires: {
          kind: "selector-count",
          player: "either",
          selector: {
            zone: "board",
            category: "character",
            name: "Monkey.D.Luffy",
          },
          operator: "eq",
          value: 0,
        },
        label: "Trash the top card of your Life",
        cost: { kind: "trash-life", count: 1 },
      },
    ],
  ],
};
