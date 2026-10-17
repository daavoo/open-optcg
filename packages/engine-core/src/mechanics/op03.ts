/**
 * OP-03 identities the pool carries without the set.
 *
 * OP-03 has no series import; its cards arrive one at a time through the
 * audit's community pass, from whichever reprint page a list needs.
 * Card data lives in `packages/cards/src/generated-community.ts`, and printed
 * text for any card here is `pnpm card:text <CARD>`. Once the set comes in
 * whole, these rows move into its per-window `op03-*.ts` modules.
 */
import { lookAndAdd, trashForBattlePower } from "./shared.js";
import { type SetMechanics } from "./registry.js";

export const op03Mechanics: SetMechanics = {
  onPlay: [
    [
      // OP03-008 Buggy: a five-deep dig for a red Event. Its battle immunity
      // is continuous text, a row in `op03-static.ts`.
      "OP03-008",
      lookAndAdd(5, "op03-buggy-look", { color: "Red", category: "event" }),
    ],
    [
      // OP03-048 Nojiko: a bounce of a cost-5-or-less Character under a Nami
      // Leader. The gate is the whole clause, so it sits outermost and the
      // engine withholds the program under any other Leader.
      "OP03-048",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-name", player: "self", name: "Nami" },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 5,
            },
            bind: "op03-nojiko-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op03-nojiko-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP03-072 Gum-Gum Jet Gatling (0): a hand card for +3000, the same
      // clause as OP05-037 and read the same way. The trash may be declined,
      // and then nothing gains power (OP03-072#1 Q&A), so the power is inside
      // the paid program; `trashFromHand` keeps the offer to a hand that can
      // pay.
      "OP03-072",
      {
        cost: 0,
        trashFromHand: 1,
        power: 0,
        program: trashForBattlePower(3000, "op03-jet-gatling-cost"),
      },
    ],
    [
      // OP03-097 Six King Pistol (0): the same clause as OP03-072, word for
      // word, so it is the same program.
      "OP03-097",
      {
        cost: 0,
        trashFromHand: 1,
        power: 0,
        program: trashForBattlePower(3000, "op03-six-king-pistol-cost"),
      },
    ],
  ],
  trigger: [
    [
      // OP03-072's [Trigger]: one DON!! from the DON!! deck, set active.
      "OP03-072",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // OP03-097's [Trigger]: a card, then a K.O. of a cost-1-or-less
      // Character. The draw happens whether or not there is a target.
      "OP03-097",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 1,
              },
              bind: "op03-six-king-pistol-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op03-six-king-pistol-ko" },
            },
          ],
        },
      },
    ],
  ],
};
