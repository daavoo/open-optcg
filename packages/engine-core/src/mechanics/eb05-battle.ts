/**
 * EB-05 `[Counter]`, `[On Your Opponent's Attack]`, `[When Attacking]` and
 * Leader watcher programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type SetMechanics } from "./registry.js";

export const eb05BattleMechanics: SetMechanics = {
  counterEvent: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-030 Take Care, Everybody. (2). Printed text:
      // `pnpm card:text EB05-030`.
      //
      // `power: 0` with the buff in the program, because it is "during this
      // turn" on any of the player's cards rather than battle power on the
      // defended one: a +1000 on a Character not in this battle is legal and
      // lasts the turn. The draw comes first, in printed order.
      "EB05-030",
      {
        cost: 2,
        power: 0,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  includeLeader: true,
                },
                bind: "eb05-030-buff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "eb05-030-buff",
                  amount: 1_000,
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB05-039 Pink Hornet (1). Printed text: `pnpm card:text EB05-039`.
      //
      // `donMinus: 1` on the entry, which is how a priced Counter tells its
      // offer the cost. The buff is on the Leader only (`isLeader`), so while
      // a Character is the one defended it adds nothing to this battle.
      "EB05-039",
      { cost: 1, donMinus: 1, power: 4_000, target: { isLeader: true } },
    ],
    [
      // EB05-040 You Need Me, Don't You?! (0). Printed text:
      // `pnpm card:text EB05-040`.
      "EB05-040",
      { cost: 0, power: 2_000, target: { isLeader: true } },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  onOpponentAttack: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  whenAttacking: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-021 Alvida. Printed text: `pnpm card:text EB05-021`.
      //
      // No cost and no gate, so every attack negates one Character for the
      // turn -- the text of a Blocker or a removal immunity is what this
      // answers. Its `[On Play]` half is in `eb05-on-play.ts`.
      "EB05-021",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "eb05-021-negate",
            min: 0,
            max: 1,
            effect: {
              kind: "negate",
              binding: "eb05-021-negate",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
