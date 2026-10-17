/**
 * OP12 clauses that fire inside a battle: `[When Attacking]`, `[On Block]`,
 * `[On Your Opponent's Attack]` and the `[Counter]` Events.
 */
import { type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { rayleighOrCharacter } from "./shared.js";
import { donMinus, payFromHand } from "./shared.js";

/** "If your Leader has the {Revolutionary Army} type" -- Black's gate. */
const revolutionaryArmyLeader = {
  kind: "leader-has-type",
  player: "self",
  type: "Revolutionary Army",
} as const;

/** "Rest up to 1 of your opponent's Characters with a base cost of N or less." */
const restOpponentUpToBaseCost = (
  cost: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxBaseCost: cost,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

export const op12BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // OP12-024 Gyukimaru: "[printed text omitted -- pnpm card:text OP12-024]"
      //
      // "Given" DON!! -- attached to the Leader or to a Character, not sitting in
      // the cost area -- which is what `given-don` counts. Its own "if this
      // Character is active, it cannot be K.O.'d by your opponent's effects" half
      // is a static ability.
      "OP12-024",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "given-don",
              player: "self",
              operator: "gte",
              value: 3,
            },
            then: restOpponentUpToBaseCost(6, "op12-gyukimaru-rest"),
          },
        },
      },
    ],
    [
      // OP12-041 Sanji (Leader): "[printed text omitted -- pnpm card:text OP12-041]"
      //
      // A catch-up ramp that arrives *rested*, so it pays from the next Refresh
      // rather than this turn -- which is what stops the Leader ramping itself out
      // of its own gate mid-turn. Its `[Activate: Main]` half is in
      // `op12-main.ts`.
      "OP12-041",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "field-don-versus",
              player: "self",
              operator: "lte",
            },
            then: { kind: "add-don", player: "self", count: 1, rested: true },
          },
        },
      },
    ],
    [
      // OP12-081 Koala (Leader): "[printed text omitted -- pnpm card:text OP12-081]"
      //
      // No printed timing marker, but the window is exactly `[When Attacking]`:
      // the clause fires on this Leader's own declaration. What it adds is a
      // question about the *target* -- a swing into a Character pays nothing --
      // which is what `battle-target` asks. The other half of the card is a
      // signal-driven reaction in `card-mechanics.ts`.
      "OP12-081",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "battle-target", filter: { isLeader: true } },
                {
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "board",
                    category: "character",
                    minCost: 8,
                  },
                  operator: "gte",
                  value: 2,
                },
              ],
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP12-085 Karasu: "[printed text omitted -- pnpm card:text OP12-085]"
      //
      // Its own +3 cost behind the same Leader is a static ability.
      "OP12-085",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                revolutionaryArmyLeader,
                {
                  kind: "zone-count",
                  player: "opponent",
                  zone: "hand",
                  operator: "gte",
                  value: 5,
                },
              ],
            },
            then: {
              kind: "choose",
              selector: { player: "opponent", zone: "hand" },
              chooser: "opponent",
              bind: "op12-karasu-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op12-karasu-discard",
                to: { player: "owner", zone: "trash" },
              },
            },
          },
        },
      },
    ],
  ],
  onBlock: [
    [
      // OP12-033 Helmeppo: "[printed text omitted -- pnpm card:text OP12-033]"
      //
      // The second `[On Block]` in the pool, after OP10-077 Bellamy, and the one
      // that shows why the window is its own registry: this fires *because*
      // Helmeppo blocked, and a Blocker that survives the battle has taken a card
      // off the opponent's next turn as well.
      "OP12-033",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 5,
              canRest: true,
            },
            bind: "op12-helmeppo-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op12-helmeppo-rest" },
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP12-008 Shanks: "[printed text omitted -- pnpm card:text OP12-008]"
      //
      // A debuff rather than a buff, so it is a `modify-power` on their card rather
      // than power on this battle -- and it lasts the whole turn, which answers
      // every later attack too.
      "OP12-008",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op12-shanks-cost",
              1,
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  includeLeader: true,
                },
                bind: "op12-shanks-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op12-shanks-debuff",
                  amount: -2_000,
                  expiresAfterTurns: 0,
                },
              },
            ),
          },
        },
      },
    ],
    [
      // OP12-069 Crocodile: "[printed text omitted -- pnpm card:text OP12-069]"Baroque Works"[printed text omitted -- pnpm card:text OP12-069]"
      //
      // The Leader's type gates the offer as well as the buff: the DON!! −1
      // would otherwise be paid for nothing behind any other Leader.
      "OP12-069",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1, leaderTypeIncluding: "Baroque Works" },
        program: {
          effect: donMinus(1, {
            kind: "if",
            condition: {
              kind: "leader-type-including",
              player: "self",
              text: "Baroque Works",
            },
            then: { kind: "battle-power", player: "self", amount: 2_000 },
          }),
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP12-016 "To Never Doubt--That Is Power!" (0): "[printed text omitted -- pnpm card:text OP12-016]"
      //
      // A 0-cost Counter, which is what the Leader's "no cards costing 5 or more"
      // restriction buys: a hand of these is a hand of free +2000s. The target is
      // a disjunction -- see `rayleighOrCharacter`.
      "OP12-016",
      { cost: 0, power: 2_000, target: rayleighOrCharacter },
    ],
    [
      // OP12-018 "Color of the Supreme King Haki" (0): "[printed text omitted -- pnpm card:text OP12-018]"
      //
      // The second half is a board-wide debuff for one rested DON!!, and it is
      // turn-scoped: it answers every later attack of the turn as well, and it can
      // put a whole board inside a "power N or less" K.O.
      "OP12-018",
      {
        cost: 0,
        power: 2_000,
        target: rayleighOrCharacter,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "active-don",
              player: "self",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest-don", player: "self", count: 1 },
                  {
                    kind: "select",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      includeLeader: true,
                    },
                    bind: "op12-supreme-debuff",
                    count: "all",
                    effect: {
                      kind: "modify-power",
                      binding: "op12-supreme-debuff",
                      amount: -1_000,
                      expiresAfterTurns: 0,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP12-019 "Color of Arms Haki" (0): the same `[Counter]` half its two
      // siblings print.
      "OP12-019",
      { cost: 0, power: 2_000, target: rayleighOrCharacter },
    ],
    [
      // OP12-037 Demon Aura Nine Sword Style Asura (1): the `[Counter]` half of
      // a dual-purpose Event, past the rest its `[Main]` half prints. The power
      // is printed for the Leader alone, so it adds nothing while a Character
      // is the card being attacked -- `target: { isLeader: true }`, read by the
      // offer and the resolution alike through `counterEventPower`.
      "OP12-037",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP12-038 Two-Sword Style Rashomon (1): "[printed text omitted -- pnpm card:text OP12-038]"
      "OP12-038",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP12-059 Concasser (1): "[printed text omitted -- pnpm card:text OP12-059]"
      //
      // A 4000 Counter for one DON!!, priced on a trash the deck fills with its
      // own 0-and-1-cost Events. Both gates are read before the offer: the trash
      // count through `powerWhen`, the Leader through `target`.
      "OP12-059",
      {
        cost: 1,
        power: 4_000,
        target: { isLeader: true },
        powerWhen: {
          kind: "selector-count",
          player: "self",
          selector: { zone: "trash", category: "event" },
          operator: "gte",
          value: 4,
        },
      },
    ],
    [
      // OP12-117 Slam Gibson (1): "[printed text omitted -- pnpm card:text OP12-117]"
      "OP12-117",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
  ],
};
