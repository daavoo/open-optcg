/**
 * ST-10 `[Trigger]` programs.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST10-0xx` prints it from the local cache).
 */
import { type SetMechanics } from "./registry.js";
import { rampActive } from "./st10-shared.js";

export const st10TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // ST10-016 Gum-Gum Kong Gatling: off a Life card, +1000 on the Leader
      // that outlives the turn it was taken on.
      //
      // `expiresAfterTurns` counts from the controller's turn, so 2 is "until
      // the end of your next turn" wherever the Trigger is revealed: on the
      // opponent's turn the buff lasts the rest of that attack and the
      // controller's own next turn (Bandai's ST10-016#1).
      //
      // The selector reaches only the Leader, and the choice is "up to 1", so
      // the clause can be declined -- which is the right offer on a board where
      // nothing is attacking the Leader again.
      "ST10-016",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: [], includeLeader: true },
          bind: "st10-gatling-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "st10-gatling-buff",
            amount: 1_000,
            expiresAfterTurns: 2,
          },
        },
      },
    ],
    [
      // ST10-017 Punk Vise: off a Life card, one active DON!! out of the DON!!
      // deck.
      //
      // Active rather than the rested ramp its own `[Main]` half prints: a
      // `[Trigger]` resolves on the opponent's turn, and an active DON!! there
      // is Counter money now as well as cost-area money next turn.
      "ST10-017",
      { effect: rampActive },
    ],
  ],
};
