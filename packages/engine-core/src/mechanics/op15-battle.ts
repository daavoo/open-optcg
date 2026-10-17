/** OP15 `[When Attacking]` programs. */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";

/**
 * OP15-059 Amazon's consequence for the opponent not paying: "[printed text omitted -- pnpm card:text OP15-059]"
 *
 * Shared between the branch an opponent reaches by declining and the one
 * reached when they have no active DON!! to return at all -- the printed "if
 * they do not" covers both, and an opponent who cannot pay must not be offered
 * a choice that lets them dodge it.
 */
const amazonDebuff: MechanicEffect = {
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    includeLeader: true,
  },
  bind: "op15-amazon-debuff",
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: "op15-amazon-debuff",
    amount: -2000,
    expiresAfterTurns: 0,
  },
};

/**
 * OP15-002 Lucy (Leader): "[printed text omitted -- pnpm card:text OP15-002]"
 *
 * One clause on two timings, so one program registered twice. "Any number" is a
 * `choose` with no floor and a ceiling the hand never reaches in practice, the
 * same `max` OP06-014 Ratchet and ST16-002 Gordon use: the Dressrosa shell runs
 * several different Events, so the four-copy limit on one card is no ceiling on
 * how many sit in hand. The per-card arithmetic is `perCard`, which
 * multiplies by the size of the binding: a `choose` binds every card picked at
 * once, so the buff cannot be written as one effect per card.
 */
const lucyTrashForPower: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "hand",
      anyOf: [{ category: "event" }, { category: "stage" }],
    },
    bind: "op15-lucy-pitch",
    min: 0,
    max: 10,
    effect: {
      kind: "sequence",
      effects: [
        {
          kind: "move",
          binding: "op15-lucy-pitch",
          to: { player: "self", zone: "trash" },
        },
        {
          kind: "battle-power",
          player: "self",
          amount: 1000,
          perCard: "op15-lucy-pitch",
          target: { isLeader: true },
        },
      ],
    },
  },
};

export const op15BattleMechanics: SetMechanics = {
  onOpponentAttack: [
    [
      // OP15-002 Lucy, the defensive half of the clause it also prints on
      // `[When Attacking]`.
      "OP15-002",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: lucyTrashForPower,
      },
    ],
    [
      // OP15-057 Dressrosa Kingdom: "[printed text omitted -- pnpm card:text OP15-057]"
      //
      // Two costs, and `handCardsOfCategory` is what keeps the offer honest:
      // without it a hand of Characters would be shown a cost it cannot pay,
      // and the defender's forecast would carry 2000 they cannot reach.
      "OP15-057",
      {
        oncePerTurn: false,
        requires: {
          sourceActive: true,
          handCardsOfCategory: { categories: ["event", "stage"], count: 1 },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    anyOf: [{ category: "event" }, { category: "stage" }],
                  },
                  bind: "op15-dressrosa-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op15-dressrosa-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                { kind: "battle-power", player: "self", amount: 2000 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP15-059 Amazon: "[printed text omitted -- pnpm card:text OP15-059]"
      //
      // A tax rather than removal: the attacker picks which way to pay. The
      // `if` around the `choice` is load-bearing -- an opponent with no active
      // DON!! has nothing to return, and offering them the branch anyway would
      // let them dodge the debuff by "paying" nothing.
      "OP15-059",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "if",
                  condition: {
                    kind: "active-don",
                    player: "opponent",
                    operator: "gte",
                    value: 1,
                  },
                  then: {
                    kind: "choice",
                    chooser: "opponent",
                    branches: [
                      {
                        id: "return-don",
                        label: "Return 1 active DON!! to your DON!! deck",
                        effect: {
                          kind: "return-don",
                          player: "opponent",
                          count: 1,
                        },
                      },
                      {
                        id: "take-debuff",
                        label: "Keep your DON!! and take −2000 power",
                        effect: amazonDebuff,
                      },
                    ],
                  },
                  else: amazonDebuff,
                },
              ],
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    ["OP15-002", lucyTrashForPower],
    [
      // OP15-005 Cabaji: "[printed text omitted -- pnpm card:text OP15-005]"
      //
      // `given-don` sums the DON!! given anywhere on that player's board, Leader
      // included, which is what "any DON!! cards given" asks. The buff is
      // turn-scoped rather than battle-scoped because the printed text says
      // "during this turn", so it survives into Cabaji's own defence.
      "OP15-005",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "given-don",
            player: "opponent",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "modify-power",
            binding: "source",
            amount: 2000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP15-012 Buggy: "[printed text omitted -- pnpm card:text OP15-012]" Its `[On K.O.]` half is in
      // `op15-triggers.ts`.
      //
      // "Its owner's", so either player's rested DON!! to a card of its owner's
      // (OP15-012 Q1, Q4): one of your own spent DON!! onto the attacker
      // mid-attack, or one of the opponent's onto their board for the East
      // Blue cards that read given DON!! on opposing Characters.
      "OP15-012",
      {
        effect: {
          kind: "give-rested-don",
          player: "self",
          count: 1,
          eitherOwner: true,
        },
      },
    ],
    [
      // OP15-111 Mont Blanc Noland: "[printed text omitted -- pnpm card:text OP15-111]"
      //
      // The `[DON!! x1]` gates whether the program runs at all, which is what
      // `source-attached-don` is for -- every other `[DON!! xN]` in the engine
      // is a keyword or power layer read for the card itself.
      "OP15-111",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              name: "Kalgara",
            },
            bind: "op15-noland-rush",
            min: 0,
            max: 1,
            effect: {
              kind: "grant-keyword",
              binding: "op15-noland-rush",
              keyword: "Rush",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP15-018 Mohji: "[printed text omitted -- pnpm card:text OP15-018]"
      //
      // Both filters are on the same Character: weak *and* carrying DON!!.
      // `maxCurrentPower` rather than `maxPower`, because a DON!! given to a
      // Character raises its current power -- which is what makes this a real
      // restriction rather than free removal.
      "OP15-018",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCurrentPower: 3000,
            minGivenDon: 1,
          },
          bind: "op15-mohji-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op15-mohji-ko" },
        },
      },
    ],
  ],
};
