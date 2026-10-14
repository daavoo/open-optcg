/**
 * ST-30 battle-window programs: `[When Attacking]` and the two `[Counter]`
 * Events.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST30-0xx` prints it from the local cache).
 */
import { type MechanicCondition } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { powerDebuff } from "./op08-shared.js";
import { sixThousandBody } from "./st30-shared.js";

/** "If you have N or more Characters with 6000 base power". */
const sixThousandBodies = (count: number): MechanicCondition => ({
  kind: "selector-count",
  player: "self",
  selector: { zone: "board", ...sixThousandBody },
  operator: "gte",
  value: count,
});

export const st30BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // ST30-007 Portgas.D.Ace: the swing takes 1000 off a body.
      //
      // Small, and printed on the same card as a [Rush] it can buy: the
      // combination is what turns a 4-cost 6000 into an answer to a 7000 the
      // turn it lands. Its `[On Play]` half is in `st30-on-play.ts`.
      "ST30-007",
      { effect: powerDebuff(1_000, "st30-ace-debuff") },
    ],
  ],
  counterEvent: [
    [
      // ST30-015: 4000 Counter, but only off a board of two 6000s.
      //
      // `powerWhen` rather than an `if` in the program, so the offer and the
      // resolution read the same condition and the forecast in the summary
      // cannot promise power the battle will not get.
      "ST30-015",
      { cost: 1, power: 4_000, powerWhen: sixThousandBodies(2) },
    ],
    [
      // ST30-016: 3000 Counter, and a card behind the pair of names the
      // product's Leader is built out of.
      //
      // The power is unconditional and the draw is not, so the gate wraps only
      // the second half -- "Then" opens a sentence that carries its own "if".
      // Both names *and* the 6000 body, which is a narrow enough board that the
      // draw is the reward for having assembled the deck's own plan.
      "ST30-016",
      {
        cost: 1,
        power: 3_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                {
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "board",
                    ...sixThousandBody,
                    name: "Portgas.D.Ace",
                  },
                  operator: "gte",
                  value: 1,
                },
                {
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "board",
                    ...sixThousandBody,
                    name: "Monkey.D.Luffy",
                  },
                  operator: "gte",
                  value: 1,
                },
              ],
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
  ],
};
