/**
 * ST-26 "Monkey.D.Luffy", the Purple/Black starter deck.
 *
 * Card data for the five ST26 identities lives in
 * `packages/cards/src/generated-community.ts`, stamped by the audit's
 * community pass; the deck's OP09 slots are programs in `op09-*.ts`. Printed
 * text for any card here is `pnpm card:text <CARD>`.
 *
 * Four of the five print the same `DON!! −2` cost, which is the deck's whole
 * shape: the OP09-061 Leader refunds two DON!! -- one active, one rested --
 * the first time two or more go back in a turn, so each body below is priced
 * as if the pair it returns were partly free. They are still written with the
 * shared `donMinus`: the refund is the Leader's clause, not theirs, and none
 * of them may assume it fired.
 *
 * ST26-001's continuous half, and the whole text of OP05-066 and OP05-070, are
 * continuous rather than timed, so they are rows in `../static-abilities.ts`
 * instead of programs here.
 */
import { type MechanicCondition } from "../mechanics.js";
import { donMinus } from "./shared.js";
import { type SetMechanics } from "./registry.js";

/**
 * "If your Leader is multicolored and your opponent has 5 or more DON!! cards
 * on their field" plus the "{Straw Hat Crew} type Leader" the payoff names --
 * ST26-005's whole gate.
 *
 * Read *outside* the `DON!! −2`, so the two DON!! are never offered for a
 * clause that would resolve to nothing. The opponent's count is the only half
 * paying the cost could move, and it moves the other player's field, not this
 * one's.
 */
const st26LuffyGate: MechanicCondition = {
  kind: "all-of",
  conditions: [
    { kind: "leader-multicolored", player: "self" },
    { kind: "field-don", player: "opponent", operator: "gte", value: 5 },
    { kind: "leader-has-type", player: "self", type: "Straw Hat Crew" },
  ],
};

/**
 * ST26-005 Monkey.D.Luffy's payoff, shared by its `[On Play]` and its
 * `[When Attacking]`: one printed clause that fires in two windows, so one
 * program registered twice rather than two readings that could drift.
 *
 * `set-leader-base-power` rather than a `+N`, for the reason the node's own
 * comment gives: "becomes 7000" replaces, so it stacks with nothing -- a
 * second copy this turn leaves the Leader at 7000 rather than doubling, and a
 * higher "becomes" already on the Leader outranks it (rule 4-9-2-1). `expiresAfterTurns: 1`
 * is the printed "until the end of your opponent's next End Phase", which is
 * what makes this a defensive card on a 5000 Leader as much as an offensive
 * one.
 */
const st26LuffyProgram = {
  effect: {
    kind: "if" as const,
    condition: st26LuffyGate,
    then: donMinus(2, {
      kind: "set-leader-base-power" as const,
      player: "self" as const,
      value: 7_000,
      expiresAfterTurns: 1,
    }),
  },
};

export const st26Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST26-001 Soba Mask: "[On Play] Return all of your [San-Gorou] and
      // [Sanji] Characters to the owner's hand."
      //
      // Mandatory and unbounded, so `select` with `count: "all"` rather than a
      // `choose`: the printed text offers no number and no opt-out. That is the
      // price of the static half in `../static-abilities.ts`, which makes this
      // a 2-cost 9000 while a San-Gorou is out -- the body it then picks up.
      //
      // Soba Mask answers to neither name, so it never bounces itself; the
      // selector is left unfiltered by source for that reason rather than by
      // `excludeSource`, which would hide a real interaction if a later
      // printing ever named it.
      "ST26-001",
      {
        effect: {
          kind: "select",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            anyOf: [{ name: "San-Gorou" }, { name: "Sanji" }],
          },
          bind: "st26-soba-mask-return",
          count: "all",
          effect: {
            kind: "move",
            binding: "st26-soba-mask-return",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // ST26-002 Tony Tony.Chopper: "[On Play] DON!! −2: Rest up to 1 of your
      // opponent's DON!! cards or Characters with a cost of 1 or less."
      //
      // `maxCost` rather than `match`: the ceiling is printed onto the
      // Character half alone, and the DON!! half is offered unfiltered -- which
      // is the whole point of the clause on turn three, where the opponent has
      // no 1-cost body but always has DON!!.
      "ST26-002",
      {
        effect: donMinus(2, {
          kind: "rest-opponent-cards",
          player: "opponent",
          count: 1,
          maxCost: 1,
        }),
      },
    ],
    [
      // ST26-003 Nico Robin: "[On Play] DON!! −2: Add up to 1 DON!! card from
      // your DON!! deck and set it as active."
      //
      // Two DON!! back for one active is a loss on its own, and reads as one
      // only until the Leader's refund is counted: OP09-061 answers the same
      // two-DON!! return with one active and one rested, so the pair is a
      // 3-cost body that nets even on DON!! and ahead on board.
      "ST26-003",
      {
        effect: donMinus(2, {
          kind: "add-don",
          player: "self",
          count: 1,
          rested: false,
        }),
      },
    ],
    [
      // ST26-004 General Franky: "[On Play] DON!! −2: Give up to 2 of your
      // opponent's Characters −2000 power during this turn."
      //
      // "Up to 2" over one `choose`, not two of one: the printed clause picks
      // both at once, so a player may not see the first debuff resolve before
      // naming the second.
      "ST26-004",
      {
        effect: donMinus(2, {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "st26-franky-debuff",
          min: 0,
          max: 2,
          effect: {
            kind: "modify-power",
            binding: "st26-franky-debuff",
            amount: -2_000,
            expiresAfterTurns: 0,
          },
        }),
      },
    ],
    ["ST26-005", st26LuffyProgram],
  ],
  whenAttacking: [
    [
      // The other half of ST26-005's printed "[On Play]/[When Attacking]".
      // `oncePerTurn: false`: the text prints no such limit, and the two
      // windows are separate occasions -- playing it and then attacking with it
      // fires the clause twice, which changes nothing, because "becomes 7000"
      // replaces.
      "ST26-005",
      { oncePerTurn: false, program: st26LuffyProgram },
    ],
  ],
};
