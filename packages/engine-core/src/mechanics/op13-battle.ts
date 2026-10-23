/**
 * OP13 clauses that fire inside a battle: `[When Attacking]`,
 * `[On Your Opponent's Attack]` and the `[Counter]` Events.
 */
import {
  SOURCE_BINDING,
  type BattleTargetFilter,
  type MechanicEffect,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { trashAtLeast } from "./op13-shared.js";
import { turnLifeFaceUp } from "./op11-shared.js";
import { payFromHand } from "./shared.js";

/**
 * OP13-001 Monkey.D.Luffy's Leader clause: "[printed text omitted -- pnpm card:text OP13-001]"
 *
 * "Any number" is a decision with as many answers as there are active DON!!, and
 * the gate caps that at five -- so the clause is a `choice` with one branch per
 * DON!! spent, each resting that many and paying 2000 for each. A `choice`
 * offers every branch it has, so the branches are cut to the active count
 * before it is reached: a ladder of `if`s picks the `choice` with exactly as
 * many branches as there are DON!! to rest, and a player with two active is
 * offered two. "You may" is the `optional` around it -- resting none is the
 * answer that keeps DON!! for a [Counter] Event.
 *
 * The buff is battle-scoped, which is what makes this a defensive clause: the
 * DON!! is gone for the rest of the turn either way.
 *
 * "This Leader or up to 1 of your {Straw Hat Crew} type Characters" is the
 * card being attacked, since that is the only card on this side whose power a
 * battle reads -- so the buff carries the same filter the clause's gate does,
 * and an attack on a Character outside the crew (OP15-035 Laboon, an
 * {Animal}) is not offered a payment that would buy nothing.
 */
const LUFFY_LEADER_TARGET: BattleTargetFilter = {
  anyOf: [{ isLeader: true }, { type: "Straw Hat Crew" }],
};

const LUFFY_LEADER_MAX_REST = 5;

function luffyLeaderChoice(available: number): MechanicEffect {
  return {
    kind: "choice",
    branches: Array.from({ length: available }, (_, index) => {
      const count = index + 1;
      return {
        id: `rest-${count}`,
        label: `Rest ${count} DON!! for +${count * 2000} power`,
        effect: {
          kind: "sequence",
          effects: [
            { kind: "rest-don", player: "self", count },
            {
              kind: "battle-power",
              player: "self",
              amount: count * 2_000,
              target: LUFFY_LEADER_TARGET,
            },
          ],
        },
      };
    }),
  };
}

function luffyLeaderLadder(available: number): MechanicEffect {
  if (available === 1) return luffyLeaderChoice(1);
  return {
    kind: "if",
    condition: {
      kind: "active-don",
      player: "self",
      operator: "gte",
      value: available,
    },
    then: luffyLeaderChoice(available),
    else: luffyLeaderLadder(available - 1),
  };
}

const luffyLeaderBranches: MechanicEffect = {
  kind: "optional",
  effect: luffyLeaderLadder(LUFFY_LEADER_MAX_REST),
};

/** OP13-039 Gum-Gum Snake Shot's clause, shared by its Counter and its Trigger. */
export const snakeShotEffect: MechanicEffect = {
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    rested: true,
    maxCost: 4,
  },
  bind: "op13-snake-shot-ko",
  min: 0,
  max: 1,
  effect: { kind: "knock-out", binding: "op13-snake-shot-ko" },
};

export const op13BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // OP13-044 Curiel: "[printed text omitted -- pnpm card:text OP13-044]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP13-044]"Whitebeard Pirates"." Its `[On K.O.]` half is in
      // `op13-triggers.ts`.
      //
      // The type filter reaches both halves, which is what `give-rested-don`'s own
      // type filters do -- and "a type including" is why {Whitebeard Pirates
      // Allies} and {Former Whitebeard Pirates} qualify too.
      "OP13-044",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 1,
            typeIncluding: "Whitebeard Pirates",
          },
        },
      },
    ],
    [
      // OP13-045 Haruta: "[printed text omitted -- pnpm card:text OP13-045]"
      //
      // A 1-cost body that refills a spent hand -- and only a spent one, which is
      // what stops it drawing every turn.
      "OP13-045",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 4,
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP13-053 Marshall.D.Teach: "[printed text omitted -- pnpm card:text OP13-053]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP13-053]"
      //
      // The cost is a body off the *board*, not out of hand, and what it buys is
      // [Banish]: the Life card this attack takes is trashed rather than given to
      // the opponent's hand.
      "OP13-053",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                typeIncluding: "Whitebeard Pirates",
              },
              bind: "op13-teach-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op13-teach-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  { kind: "draw", player: "self", count: 1 },
                  {
                    kind: "grant-keyword",
                    binding: SOURCE_BINDING,
                    keyword: "Banish",
                    expiresAfterTurns: 0,
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP13-055 Rakuyo: "[printed text omitted -- pnpm card:text OP13-055]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP13-055]"
      //
      // "All of", so no choice: `select` with `count: "all"`.
      "OP13-055",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 4,
            },
            then: {
              kind: "select",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                typeIncluding: "Whitebeard Pirates",
              },
              bind: "op13-rakuyo-buff",
              count: "all",
              effect: {
                kind: "modify-power",
                binding: "op13-rakuyo-buff",
                amount: 1_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP13-056 LittleOars Jr.: "[printed text omitted -- pnpm card:text OP13-056]"Whitebeard Pirates", draw 1 card."
      "OP13-056",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-type-including",
              player: "self",
              text: "Whitebeard Pirates",
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP13-062 Crocus: "[printed text omitted -- pnpm card:text OP13-062]" Its
      // `[On Play]` half is in `op13-on-play.ts`.
      "OP13-062",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 3_000,
            },
            bind: "op13-crocus-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op13-crocus-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // OP13-080 St. Ethanbaron V. Nusjuro: "[printed text omitted -- pnpm card:text OP13-080]" Its trash-gated immunity and [Rush] are static.
      "OP13-080",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: trashAtLeast(10),
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op13-nusjuro-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op13-nusjuro-debuff",
                amount: -2_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP13-114 S-Snake: the `[When Attacking]` half of its "[On Play]/[When
      // Attacking]" clause -- the same program, registered in both tables.
      "OP13-114",
      {
        oncePerTurn: false,
        program: turnLifeFaceUp("op13-snake-attack-cost", {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op13-snake-attack-debuff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op13-snake-attack-debuff",
            amount: -2_000,
            expiresAfterTurns: 0,
          },
        }),
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP13-001 Monkey.D.Luffy (Leader): see `luffyLeaderBranches`. `[DON!! x1]`
      // gates the whole clause, and the "5 or less active DON!!" ceiling is what
      // makes it a late-turn defence rather than a first-turn one.
      "OP13-001",
      {
        oncePerTurn: false,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "source-attached-don", operator: "gte", value: 1 },
                {
                  kind: "active-don",
                  player: "self",
                  operator: "lte",
                  value: 5,
                },
                { kind: "battle-target", filter: LUFFY_LEADER_TARGET },
              ],
            },
            then: luffyLeaderBranches,
          },
        },
      },
    ],
    [
      // OP13-002 Portgas.D.Ace (Leader): "[printed text omitted -- pnpm card:text OP13-002]"
      //
      // A debuff on *their* card that lasts the battle, so it is written as
      // `battle-power` on the attacker's side rather than as a `modify-power`,
      // whose shortest life is the rest of the turn: a turn-long −2000 on a
      // Character that has not attacked yet would follow it into its own attack
      // later that turn, when this once-per-turn clause can no longer answer it.
      // The attacker is the only card the debuff can change anything on before
      // the battle ends, so it is the card the engine gives it to -- the same
      // reading `battle-power` makes of "up to 1 of your Leader or Characters".
      //
      // Its second clause -- "[printed text omitted -- pnpm card:text OP13-002]" -- is
      // a pair of signal-driven reactions in `card-mechanics.ts`.
      "OP13-002",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op13-ace-leader-cost",
              1,
              { kind: "battle-power", player: "opponent", amount: -2_000 },
            ),
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP13-039 Gum-Gum Snake Shot (2): "[printed text omitted -- pnpm card:text OP13-039]"
      //
      // No Counter power at all: it answers an attack by removing the attacker,
      // which only works because declaring rested it. Its `[Trigger]` activates
      // the same clause.
      "OP13-039",
      { cost: 2, power: 0, program: { effect: snakeShotEffect } },
    ],
    [
      // OP13-019 Gum-Gum Elephant Gun (1): `pnpm card:text OP13-019`.
      //
      // The `[Counter]` half of a dual-purpose Event, whose `[Main]` half the
      // `[Main]` table registers separately. Its power is printed for the
      // Leader alone, so it adds nothing while a Character is the card being
      // attacked -- `target: { isLeader: true }`, which both the offer and the
      // resolution read through `counterEventPower`.
      "OP13-019",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP13-040 I Know You're Strong... So I'll Go All Out from the Very
      // Start!!! (1): the same Leader-only `[Counter]` half, past the rest-lock
      // its `[Main]` half prints.
      "OP13-040",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP13-057 "If I Bowed Down to Power, What's the Point in Living?" (1):
      // "[printed text omitted -- pnpm card:text OP13-057]"
      "OP13-057",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP13-058 Phoenix Pyreapple (1): the same `[Counter]`.
      "OP13-058",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP13-075 "Guess We'll Have Another Scrap..." (1): the same `[Counter]`.
      "OP13-075",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP13-077 "Go All the Way to the Top!!" (1): the same `[Counter]`.
      "OP13-077",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP13-097 "The World's Equilibrium Cannot Be Maintained Forever" (1): the
      // same `[Counter]`.
      "OP13-097",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP13-098 "Never Existed... in the First Place..." (1): "[printed text omitted -- pnpm card:text OP13-098]"
      //
      // A 4000 Counter for one DON!!, and the price is the Leader: `powerWhen`
      // keeps the offer's forecast honest behind any other one.
      "OP13-098",
      {
        cost: 1,
        power: 4_000,
        powerWhen: { kind: "leader-has-name", player: "self", name: "Imu" },
      },
    ],
    [
      // OP13-115 Paper Art Afterimage (2): "[printed text omitted -- pnpm card:text OP13-115]"
      //
      // The rider is turn-scoped where the +3000 is battle-scoped, and it only
      // turns on once the opponent is nearly dead -- which is when Yellow is
      // defending its own last turn.
      "OP13-115",
      {
        cost: 2,
        power: 3_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "opponent",
              zone: "life",
              operator: "lte",
              value: 2,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                includeLeader: true,
              },
              bind: "op13-afterimage-rider",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op13-afterimage-rider",
                amount: 1_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
  ],
};
