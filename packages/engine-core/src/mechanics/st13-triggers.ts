/**
 * ST-13's `[Trigger]`s, its two `[Counter]` Events and ST13-002's
 * `[End of Your Turn]` sweep.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST13-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import {
  digForABrother,
  restBackIntoLife,
  swapTopOfLife,
} from "./st13-shared.js";

export const st13TriggerMechanics: SetMechanics = {
  onEndOfYourTurn: [
    [
      // ST13-002 Portgas.D.Ace, the Leader: everything face-up on Life burns at
      // the end of its own turn.
      //
      // The price of the cheapest banking clause in the product, and it is
      // unconditional -- there is no "you may". So this Leader's stack is a
      // one-turn loan: a 5-cost brother goes on top face-up and either comes
      // back off through a 2-cost body that same turn or is trashed.
      //
      // Every face-up card, not just the one this Leader put there, which is
      // what makes it read badly beside ST13-001's banking and ST13-009's
      // face-down cost -- and why the three Leaders are three decks rather than
      // a choice of statline.
      "ST13-002",
      {
        effect: {
          kind: "select",
          selector: { player: "self", zone: "life", faceUp: true },
          bind: "st13-ace-sweep",
          count: "all",
          effect: {
            kind: "move",
            binding: "st13-ace-sweep",
            to: { player: "self", zone: "trash" },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // ST13-017 Flame Dragon King: 4000 in the battle, and the Life stack
      // re-ordered afterwards.
      //
      // 4000 at 2 cost is the top of the printed Counter rate, and the second
      // sentence is why the card is in *this* deck rather than any Yellow one:
      // it arrives during the opponent's attack step, which is exactly when
      // knowing and arranging the stack is worth the most.
      //
      // The look is over the whole stack, so `restBackIntoLife` places every
      // card and nothing leaves.
      "ST13-017",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "look-at",
                player: "self",
                count: "all",
                bind: "st13-flame-read",
                zone: "life",
              },
              restBackIntoLife("st13-flame-read"),
            ],
          },
        },
      },
    ],
    [
      // ST13-018 Gum-Gum Jet Spear: 2000 in the battle, and a card at 0 Life.
      //
      // The floor is the opposite of every other Life gate in the product: this
      // one pays only once the stack is *empty*, which is the position
      // ST13-003's Leader deliberately plays to. In any other deck the second
      // sentence never resolves and the card is a plain 2000 Counter.
      "ST13-018",
      {
        cost: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 0,
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // ST13-017 Flame Dragon King and ST13-018 Gum-Gum Jet Spear print the
      // same `[Trigger]`: a card off either end of Life into hand, and a card
      // out of hand onto the top of it. See `swapTopOfLife` -- it is a swap
      // rather than a gain, and what it changes is which card is on top.
      "ST13-017",
      { effect: swapTopOfLife("st13-flame-swap") },
    ],
    ["ST13-018", { effect: swapTopOfLife("st13-spear-swap") }],
    [
      // ST13-019 The Three Brothers' Bond: the printed words are "activate this
      // card's [Main] effect", which is the same fragment registered again
      // rather than a node that reaches across registries. See `st13-main.ts`.
      "ST13-019",
      { effect: digForABrother("st13-bond-trigger") },
    ],
  ],
};
