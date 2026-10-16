/**
 * OP-03 identities the pool carries without the set.
 *
 * OP-03 has no series import; its cards arrive one at a time through the
 * audit's community pass, from whichever reprint page a shipped list needs.
 * Card data lives in `packages/cards/src/generated-community.ts`, and printed
 * text for any card here is `pnpm card:text <CARD>`. Once the set comes in
 * whole, these rows move into its per-window `op03-*.ts` modules.
 */
import { trashForBattlePower } from "./shared.js";
import { type SetMechanics } from "./registry.js";

export const op03Mechanics: SetMechanics = {
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
  ],
  trigger: [
    [
      // OP03-072's [Trigger]: one DON!! from the DON!! deck, set active.
      "OP03-072",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
  ],
};
