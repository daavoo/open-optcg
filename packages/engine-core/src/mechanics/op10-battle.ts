/**
 * OP10 clauses that fire inside a battle: `[When Attacking]`,
 * `[On Your Opponent's Attack]` and the `[Counter]` Events.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { opponentDiscardsAtFive } from "./op10-shared.js";
import { lookAndAdd } from "./shared.js";

/**
 * "You may return 1 of your {X} type Characters with a cost of N or more to the
 * owner's hand: <effect>" -- OP10-002 Caesar Clown's Leader clause and OP10-047
 * Koala both pay this way, and it is the Punk Hazard/Revolutionary Army shell's
 * only recurring cost.
 *
 * The payoff is nested inside the cost's `choose` so an empty board cannot buy
 * it, the reason `payFromHand` documents. "To the owner's hand" is the
 * controller's own hand here -- the Character being returned is theirs -- and
 * `player: "owner"` says so without restating which side that is.
 */
const returnOwnBodyFor = (
  type: string,
  minCost: number,
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "board",
      category: "character",
      type,
      minCost,
    },
    bind,
    min: 1,
    max: 1,
    effect: {
      kind: "sequence",
      effects: [
        { kind: "move", binding: bind, to: { player: "owner", zone: "hand" } },
        effect,
      ],
    },
  },
});

export const op10BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // OP10-002 Caesar Clown (Leader): "[printed text omitted -- pnpm card:text OP10-002]"
      //
      // `[DON!! x2]` on a *Leader*, so the gate reads the DON!! given to the
      // Leader rather than to a board entry -- see `source-attached-don`.
      "OP10-002",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "source-attached-don",
              operator: "gte",
              value: 2,
            },
            then: returnOwnBodyFor(
              "Punk Hazard",
              2,
              "op10-caesar-leader-cost",
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCurrentPower: 4_000,
                },
                bind: "op10-caesar-leader-ko",
                min: 0,
                max: 1,
                effect: {
                  kind: "knock-out",
                  binding: "op10-caesar-leader-ko",
                },
              },
            ),
          },
        },
      },
    ],
    [
      // OP10-010 Chadros.Higelyges (Brownbeard): "[printed text omitted -- pnpm card:text OP10-010]"
      //
      // A payoff for a *small* board, which is unusual enough to be worth
      // stating: the count is of the player's own Characters at current power,
      // and this Character counts itself -- a 5000 body that has been pumped past
      // 6000 is one of the "1 or less" until a second joins it.
      "OP10-010",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: {
              zone: "board",
              category: "character",
              minCurrentPower: 6_000,
            },
            operator: "lte",
            value: 1,
          },
          then: {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 1_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP10-045 Cavendish: "[printed text omitted -- pnpm card:text OP10-045]"
      //
      // The trash is the second half of the draw, not a cost, so it is mandatory
      // and comes after -- and one of the two cards just drawn is a legal
      // discard.
      "OP10-045",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op10-cavendish-discard",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op10-cavendish-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP10-047 Koala: "[printed text omitted -- pnpm card:text OP10-047]"
      "OP10-047",
      {
        oncePerTurn: false,
        program: {
          effect: returnOwnBodyFor("Revolutionary Army", 3, "op10-koala-cost", {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 3_000,
            expiresAfterTurns: 0,
          }),
        },
      },
    ],
    [
      // OP10-051 Hack: "[printed text omitted -- pnpm card:text OP10-051]"
      "OP10-051",
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
            then: lookAndAdd(3, "op10-hack-look", {
              type: "Revolutionary Army",
              category: "character",
            }).effect,
          },
        },
      },
    ],
    [
      // OP10-069 Fighting Fish: "[printed text omitted -- pnpm card:text OP10-069]"
      //
      // Two DON!! readings in one clause: one given to this Character to switch
      // the ability on, and one returned from the field to pay it. `donMinus`
      // covers the second; the first is the `[DON!! x1]` gate around it.
      "OP10-069",
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
            then: {
              kind: "if",
              condition: {
                kind: "field-don",
                player: "self",
                operator: "gte",
                value: 1,
              },
              then: {
                kind: "optional",
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "return-don", player: "self", count: 1 },
                    {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                        maxCost: 1,
                      },
                      bind: "op10-fighting-fish-ko",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "knock-out",
                        binding: "op10-fighting-fish-ko",
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
    [
      // OP10-100 Inazuma: "[printed text omitted -- pnpm card:text OP10-100]"
      //
      // A ceiling that is the *sum* of both Life piles, which is Yellow's own
      // clock: it starts wide and closes as the game goes, so the clause is worth
      // most early. Its `[Trigger]` is in `op10-triggers.ts`.
      "OP10-100",
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
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                canRest: true,
                maxCostFromZoneCount: { player: "either", zone: "life" },
              },
              bind: "op10-inazuma-rest",
              min: 0,
              max: 1,
              effect: { kind: "rest", binding: "op10-inazuma-rest" },
            },
          },
        },
      },
    ],
    [
      // OP10-118 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP10-118]"
      //
      // The cost is deck refill rather than a resource spend, which is what makes
      // it repeatable in a Black deck that mills itself. Its "[printed text omitted -- pnpm card:text OP10-118]" half is a
      // static ability.
      "OP10-118",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "trash" },
              bind: "op10-luffy-cost",
              min: 3,
              max: 3,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op10-luffy-cost",
                    to: { player: "self", zone: "deck", position: "bottom" },
                  },
                  opponentDiscardsAtFive("op10-luffy-discard"),
                ],
              },
            },
          },
        },
      },
    ],
  ],
  onBlock: [
    [
      // OP10-077 Bellamy: "[printed text omitted -- pnpm card:text OP10-077]"
      //
      // Two DON!! rested for one added: a net loss of one this turn and a net
      // gain of one from the next Refresh, paid for by having blocked. `[On
      // Block]` is its own window -- see `OnBlockProgram` -- because it fires
      // because this card blocked, not because an attack was declared.
      "OP10-077",
      {
        oncePerTurn: false,
        requires: { activeDon: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                { kind: "add-don", player: "self", count: 1, rested: false },
              ],
            },
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP10-066 Giolla: "[printed text omitted -- pnpm card:text OP10-066]"
      //
      // Resting an attacker mid-battle does not stop the attack it has already
      // declared; what it buys is one fewer attack next turn, which is why this
      // is a defensive clause on a 2-cost body.
      "OP10-066",
      {
        oncePerTurn: true,
        requires: { activeDon: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 4,
                    canRest: true,
                  },
                  bind: "op10-giolla-rest",
                  min: 0,
                  max: 1,
                  effect: { kind: "rest", binding: "op10-giolla-rest" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP10-071 Donquixote Doflamingo: "[printed text omitted -- pnpm card:text OP10-071]"
      //
      // A DON!! rested for a DON!! added: net neutral this turn and one ahead
      // from the next Refresh, which is Purple's whole ramp. Its `[On Play]` half
      // is in `op10-on-play.ts`.
      "OP10-071",
      {
        oncePerTurn: true,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                { kind: "add-don", player: "self", count: 1, rested: false },
              ],
            },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP10-018 Ten-Layer Igloo (2): "[printed text omitted -- pnpm card:text OP10-018]"
      //
      // The +3000 is the battle number the engine holds as a scalar, so it is the
      // `power` field; the −2000 is turn-scoped and lands on a card, so it is a
      // `modify-power` in the program. Two different durations in one clause,
      // which is exactly the split the two fields exist for.
      "OP10-018",
      {
        cost: 2,
        power: 3_000,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              includeLeader: true,
            },
            bind: "op10-igloo-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op10-igloo-debuff",
              amount: -2_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP10-019 Divine Departure (1): "[printed text omitted -- pnpm card:text OP10-019]"
      //
      // The Leader alone, so the power is worth nothing while a Character is
      // blocking -- `target: { isLeader: true }`, which both the offer's forecast
      // and the resolution read.
      "OP10-019",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP10-040 The Weak Do Not Have the Right to Choose How They Die (5): the
      // `[Counter]` half of a `[Main]`/`[Counter]` Event -- "[printed text omitted -- pnpm card:text OP10-040]"
      //
      // No Counter power at all: it answers an attack by removing the attacker,
      // which is only possible because the attacker rested to declare.
      "OP10-040",
      {
        cost: 5,
        power: 0,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              maxCost: 7,
            },
            bind: "op10-weak-counter-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op10-weak-counter-ko" },
          },
        },
      },
    ],
    [
      // OP10-078 I Do Not Forgive Those Who Laugh at My Family!!! (1): the
      // `[Counter]` half of its `[Main]`/`[Counter]` search. No power: it trades a
      // card in hand for a better one mid-battle rather than defending the hit.
      "OP10-078",
      {
        cost: 1,
        power: 0,
        program: lookAndAdd(3, "op10-forgive-counter-look", {
          type: "Donquixote Pirates",
          excludeName: "I Do Not Forgive Those Who Laugh at My Family!!!",
        }),
      },
    ],
    [
      // OP10-080 Little Black Bears (3): "[printed text omitted -- pnpm card:text OP10-080]"
      //
      // Both halves of the draw's gate in one `all-of`: a late-game board and a
      // hand that has been spent, which is when a 3-cost Counter is worth
      // replacing itself.
      "OP10-080",
      {
        cost: 3,
        power: 4_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                {
                  kind: "field-don",
                  player: "self",
                  operator: "gte",
                  value: 7,
                },
                {
                  kind: "zone-count",
                  player: "self",
                  zone: "hand",
                  operator: "lte",
                  value: 5,
                },
              ],
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP10-115 Let's Meet Again in the New World (2): "[printed text omitted -- pnpm card:text OP10-115]"
      //
      // The card that replaces itself only at 0 Life, which is where Yellow
      // deliberately plays from.
      "OP10-115",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "eq",
              value: 0,
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP10-117 ROOM (1): "[printed text omitted -- pnpm card:text OP10-117]"
      //
      // The condition governs the whole clause, so it gates both halves: the
      // power through `powerWhen`, which keeps the offer's forecast honest, and
      // the un-rest through the program's own `if`. Setting a Character active
      // during the opponent's turn is what makes it a Blocker again for the next
      // attack, which is the real payoff of a 1-cost Counter.
      "OP10-117",
      {
        cost: 1,
        power: 3_000,
        powerWhen: {
          kind: "zone-count",
          player: "self",
          zone: "life",
          operator: "lte",
          value: 1,
        },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 1,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                rested: true,
                maxCost: 5,
              },
              bind: "op10-room-active",
              min: 0,
              max: 1,
              effect: {
                kind: "update",
                binding: "op10-room-active",
                rested: false,
              },
            },
          },
        },
      },
    ],
  ],
};
