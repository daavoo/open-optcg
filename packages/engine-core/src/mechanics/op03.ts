/**
 * OP-03 identities the pool carries without the set.
 *
 * OP-03 has no series import; its cards arrive one at a time through the
 * audit's community pass, from whichever reprint page a shipped list needs.
 * Card data lives in `packages/cards/src/generated-community.ts`, and printed
 * text for any card here is `pnpm card:text <CARD>`. Once the set comes in
 * whole, these rows move into its per-window `op03-*.ts` modules.
 */
import { payFromHand } from "./shared.js";
import { type SetMechanics } from "./registry.js";

export const op03Mechanics: SetMechanics = {
  counterEvent: [
    [
      // OP03-072 Gum-Gum Jet Gatling (0): a hand card for +3000, the same
      // clause as OP05-037 and read the same way -- the card is the whole
      // price, so `trashFromHand` gates the offer and the program pays it.
      "OP03-072",
      {
        cost: 0,
        trashFromHand: 1,
        power: 3_000,
        program: {
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op03-jet-gatling-cost",
            1,
            { kind: "sequence", effects: [] },
          ),
        },
      },
    ],
  ],
  trigger: [
    [
      // OP03-072's [Trigger]: one DON!! from the DON!! deck, set active.
      "OP03-072",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
  ],
};
