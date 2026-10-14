/**
 * ST-10 battle-window programs: `[When Attacking]` and the one `[Counter]`
 * Event.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST10-0xx` prints it from the local cache).
 *
 * `[DON!! xN]` is an `if` on `source-attached-don`, which is how the pool
 * expresses it: the engine has no generic gate for the printed marker, and
 * `donRequirement` on the record is read by the agents rather than by the
 * rules.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { powerDebuff } from "./op08-shared.js";
import { donMinus } from "./shared.js";
import { bepoRamp, kidLeaderBuff } from "./st10-shared.js";

export const st10BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // ST10-003 Eustass"Captain"Kid (Leader): one DON!! back to the DON!!
      // deck for +2000 on the swing.
      //
      // The `[Your Turn]` half of the card -- a self-inflicted −1000 while its
      // Life is still high -- is continuous text with no window to fire in and
      // is a row in `../static-abilities.ts` instead. The two are printed
      // together and priced against each other: the Leader attacks for less
      // until it has taken damage, and buys the difference back a DON!! at a
      // time.
      //
      // `expiresAfterTurns: 0` is "during this turn", so the buff is spent on
      // this swing and does not defend afterwards.
      "ST10-003",
      {
        oncePerTurn: false,
        requires: { fieldDon: 1 },
        program: {
          effect: donMinus(1, {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 2_000,
            expiresAfterTurns: 0,
          }),
        },
      },
    ],
    [
      // ST10-005 Jinbe: with a DON!! on it, the swing takes 2000 off a body.
      //
      // A 2-cost 2000 with 2000 Counter, so the DON!! it needs is usually the
      // one it is attacking with -- the debuff is what lets the attack trade
      // up rather than the Character being worth the DON!! on its own.
      "ST10-005",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "source-attached-don",
              operator: "gte",
              value: 1,
            },
            then: powerDebuff(2_000, "st10-jinbe-debuff"),
          },
        },
      },
    ],
    // ST10-012 Bepo and ST10-013 Eustass"Captain"Kid print one clause for two
    // windows; the programs are in `st10-shared.ts` and are registered from
    // `st10-on-play.ts` as well.
    ["ST10-012", bepoRamp],
    ["ST10-013", kidLeaderBuff],
  ],
  counterEvent: [
    [
      // ST10-015 Gum-Gum Giant Sumo Slap: 1 DON!! for 2000 Counter and a K.O.
      // of anything at 2000 or less.
      //
      // The power is the entry's own `power`, which is what the offer promises
      // and what the resolution adds; the program carries only the K.O., so
      // nothing applies the buff twice. No `target`, because the printed clause
      // names the Leader *or* a Character and the engine's battle scalar
      // already lands on whichever of them is being attacked.
      //
      // `maxCurrentPower` on the K.O. rather than `maxPower`: on the defending
      // turn the attacker's DON!! are already on it, which is exactly the body
      // this clause is not allowed to reach.
      "ST10-015",
      {
        cost: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 2_000,
            },
            bind: "st10-sumo-slap-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "st10-sumo-slap-ko" },
          },
        },
      },
    ],
  ],
};
