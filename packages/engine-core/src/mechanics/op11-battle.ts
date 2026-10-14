/**
 * OP11 clauses that fire inside a battle: `[When Attacking]`,
 * `[On Your Opponent's Attack]` and the `[Counter]` Events.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { grantAttackActive } from "./op11-shared.js";
import { donMinus, guessDeckTopCost, payFromHand } from "./shared.js";

/** "Up to 1 of your Leader or Character cards gains +1000 power during this turn." */
const ownLeaderOrCharacterBuff = (
  amount: number,
  bind: string,
  expiresAfterTurns = 0,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "board", includeLeader: true },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount,
    expiresAfterTurns,
  },
});

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- the second
 * half OP11-019 and OP11-020 share, and the reason both are 2-cost Counters
 * rather than 1-cost ones.
 */
const bigBodyRider = (bind: string): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "selector-count",
    player: "opponent",
    selector: {
      zone: "board",
      category: "character",
      minCurrentPower: 6_000,
    },
    operator: "gte",
    value: 1,
  },
  then: ownLeaderOrCharacterBuff(1_000, bind),
});

export const op11BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // OP11-006 Zephyr: "[printed text omitted -- pnpm card:text OP11-006]"
      //
      // An attribute-scoped debuff, which is what makes this a sideboard card
      // rather than a staple: −5000 is enormous, and it reaches nothing at all
      // against a board without <Special>.
      "OP11-006",
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
                attribute: "Special",
              },
              bind: "op11-zephyr-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op11-zephyr-debuff",
                amount: -5_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP11-010 Hibari: "[printed text omitted -- pnpm card:text OP11-010]"
      //
      // The second half names the Leader alone -- `zone: []` with
      // `includeLeader`, the idiom for text that reaches only the Leader -- and it
      // is what turns the Leader's own swing into removal against a board of
      // active Blockers.
      "OP11-010",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "modify-power",
                binding: SOURCE_BINDING,
                amount: 1_000,
                expiresAfterTurns: 0,
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: [],
                  includeLeader: true,
                  type: "Navy",
                },
                bind: "op11-hibari-leader",
                min: 0,
                max: 1,
                effect: {
                  kind: "grant-attack-active",
                  binding: "op11-hibari-leader",
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP11-013 Prince Grus: "[printed text omitted -- pnpm card:text OP11-013]"
      //
      // "All of", so no choice at all: `select` with `count: "all"`. Current
      // power, so a small Blocker pumped past 2000 by its own controller keeps
      // the ability -- and `cannot-block` switches the ability off without
      // touching the printed keyword, which is what OP16-063 Kuzan established.
      "OP11-013",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "select",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 2_000,
            },
            bind: "op11-grus-lock",
            count: "all",
            effect: {
              kind: "restrict",
              binding: "op11-grus-lock",
              restriction: "cannot-block",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP11-050 Gotti: "[printed text omitted -- pnpm card:text OP11-050]"
      //
      // Two destinations for one target, which is a real decision: the hand gives
      // the card back and the deck bottom takes it out of the game for good.
      "OP11-050",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand", type: "Firetank Pirates" },
              "op11-gotti-cost",
              1,
              {
                kind: "choose",
                selector: {
                  player: "either",
                  zone: "board",
                  category: "character",
                  maxCost: 1,
                },
                bind: "op11-gotti-target",
                min: 0,
                max: 1,
                effect: {
                  kind: "choice",
                  branches: [
                    {
                      id: "hand",
                      label: "Return it to the owner's hand",
                      effect: {
                        kind: "move",
                        binding: "op11-gotti-target",
                        to: { player: "owner", zone: "hand" },
                      },
                    },
                    {
                      id: "deck",
                      label: "Place it at the bottom of the owner's deck",
                      effect: {
                        kind: "move",
                        binding: "op11-gotti-target",
                        to: {
                          player: "owner",
                          zone: "deck",
                          position: "bottom",
                        },
                      },
                    },
                  ],
                },
              },
            ),
          },
        },
      },
    ],
    [
      // OP11-084 Kuzan: "[printed text omitted -- pnpm card:text OP11-084]" Its
      // `[On Play]` mill is in `op11-on-play.ts`.
      "OP11-084",
      {
        oncePerTurn: false,
        program: {
          effect: grantAttackActive("op11-kuzan-target", {
            type: "Navy",
            includeLeader: true,
          }),
        },
      },
    ],
    [
      // OP11-118 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP11-118]"
      //
      // The DON!! is not conditional on the return finding a target, so it is
      // sequenced after rather than nested inside it.
      "OP11-118",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op11-luffy-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  {
                    kind: "choose",
                    selector: {
                      player: "either",
                      zone: "board",
                      category: "character",
                      maxCost: 4,
                    },
                    bind: "op11-luffy-bounce",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op11-luffy-bounce",
                      to: { player: "owner", zone: "hand" },
                    },
                  },
                  { kind: "give-rested-don", player: "self", count: 1 },
                ],
              },
            ),
          },
        },
      },
    ],
    [
      // OP11-119 Koby: "[printed text omitted -- pnpm card:text OP11-119]"
      //
      // The buff outlives the turn -- `expiresAfterTurns: 1` -- so it is defence
      // bought on the attack, which is what an 8-cost body with no other
      // protection needs.
      "OP11-119",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "trash" },
              bind: "op11-koby-cost",
              min: 2,
              max: 2,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op11-koby-cost",
                    to: { player: "self", zone: "deck", position: "bottom" },
                  },
                  ownLeaderOrCharacterBuff(1_000, "op11-koby-buff", 1),
                ],
              },
            },
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP11-025 Ishilly: "[printed text omitted -- pnpm card:text OP11-025]"
      "OP11-025",
      {
        oncePerTurn: true,
        requires: { activeDon: 1, sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                { kind: "rest", binding: SOURCE_BINDING },
                { kind: "battle-power", player: "self", amount: 1_000 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-043 Vinsmoke Ichiji: "[printed text omitted -- pnpm card:text OP11-043]"GERMA"[printed text omitted -- pnpm card:text OP11-043]"
      //
      // "Only" is a universal, which no count can express -- see
      // `every-character-matches`. A single off-type body switches the whole
      // clause off, which is what the GERMA shell pays for its consistency.
      "OP11-043",
      {
        oncePerTurn: true,
        requires: {
          everyCharacterMatches: { zone: "board", typeIncluding: "GERMA" },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "battle-power", player: "self", amount: 1_000 },
                { kind: "trash-top", player: "self", count: 2 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-049 Carrot: "[printed text omitted -- pnpm card:text OP11-049]"
      //
      // The Leader alone, so the buff is worth nothing while a Character is being
      // attacked -- `target: { isLeader: true }`, the same restriction the Counter
      // Events carry. Its `[On Play]` look is in `op11-on-play.ts`.
      "OP11-049",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "battle-power",
                  player: "self",
                  amount: 1_000,
                  target: { isLeader: true },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-073 Charlotte Linlin: "[printed text omitted -- pnpm card:text OP11-073]"
      //
      // "During this turn", not this battle, so it is a `modify-power` on the
      // Leader rather than a `battle-power` scalar: the +2000 defends every later
      // attack of the turn too, which is what makes a 5-DON!! price worth paying.
      // Its printed [Rush] is a static ability.
      "OP11-073",
      {
        oncePerTurn: true,
        requires: { fieldDon: 5 },
        program: {
          effect: donMinus(
            5,
            guessDeckTopCost({
              kind: "select",
              selector: { player: "self", zone: [], includeLeader: true },
              bind: "op11-linlin-leader",
              count: "all",
              effect: {
                kind: "modify-power",
                binding: "op11-linlin-leader",
                amount: 2_000,
                expiresAfterTurns: 0,
              },
            }),
          ),
        },
      },
    ],
    [
      // OP11-088 Shu: "[printed text omitted -- pnpm card:text OP11-088]"
      //
      // A question about the *attacker* rather than about the board, which is
      // what `battle-attacker` exists for: a Leader swing does not qualify (the
      // clause says Character) and neither does a <Strike> body. +5000 on a 5000
      // Blocker answers almost any single attack in the format, which is why the
      // gate is this narrow.
      "OP11-088",
      {
        oncePerTurn: true,
        requires: {
          battleAttacker: { filter: { isLeader: false }, attribute: "Slash" },
        },
        program: {
          effect: {
            kind: "optional",
            effect: { kind: "battle-power", player: "self", amount: 5_000 },
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP11-019 Glorp Web!! (2) and OP11-020 X Calibur (2) print the same
      // Counter: "[printed text omitted -- pnpm card:text OP11-020]"
      //
      // The rider is turn-scoped where the +2000 is battle-scoped, which is the
      // whole reason the two halves are modelled differently: `power` is the
      // battle scalar and `modify-power` is what survives into the next attack.
      "OP11-019",
      {
        cost: 2,
        power: 2_000,
        program: { effect: bigBodyRider("op11-glorp-rider") },
      },
    ],
    [
      "OP11-020",
      {
        cost: 2,
        power: 2_000,
        program: { effect: bigBodyRider("op11-calibur-rider") },
      },
    ],
    [
      // OP11-038 Gum-Gum Elephant Gatling (1): "[printed text omitted -- pnpm card:text OP11-038]"
      "OP11-038",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP11-039 Vagabond Drill (1): "[printed text omitted -- pnpm card:text OP11-039]"
      //
      // Two types on the *battle* target, which needs the disjunction on
      // `BattleTargetFilter`: the engine holds a battle's power as one scalar, so
      // the buff cannot simply be applied twice.
      "OP11-039",
      {
        cost: 1,
        power: 3_000,
        target: { anyOfTypes: ["Fish-Man", "Merfolk"] },
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 3,
              canRest: true,
            },
            bind: "op11-vagabond-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op11-vagabond-rest" },
          },
        },
      },
    ],
    [
      // OP11-059 Gum-Gum King Cobra (1): "[printed text omitted -- pnpm card:text OP11-059]"
      //
      // Both halves are battle-scoped, so the second is another `battle-power`
      // rather than a modifier on a card: "that card" is the one carrying this
      // side of the battle, which is the only card the scalar can reach anyway.
      "OP11-059",
      {
        cost: 1,
        power: 2_000,
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
            then: { kind: "battle-power", player: "self", amount: 2_000 },
          },
        },
      },
    ],
    [
      // OP11-080 Gear Two (1): "[printed text omitted -- pnpm card:text OP11-080]"
      "OP11-080",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP11-097 "After All These Years I'm Losing My Edge!!!" (1): "[printed text omitted -- pnpm card:text OP11-097]"
      //
      // A 1000 Counter that replaces itself once Black has milled ten cards --
      // which is what every other card in that package spends its turns doing.
      "OP11-097",
      {
        cost: 1,
        power: 1_000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "trash",
              operator: "gte",
              value: 10,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                category: "character",
                color: "Black",
                maxCost: 3,
              },
              bind: "op11-edge-recur",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op11-edge-recur",
                to: { player: "self", zone: "hand" },
              },
            },
          },
        },
      },
    ],
    [
      // OP11-114 Gum-Gum Fire-Fist Pistol Red Hawk (1): "[printed text omitted -- pnpm card:text OP11-114]"
      "OP11-114",
      { cost: 1, power: 3_000, target: { isLeader: true } },
    ],
    [
      // OP11-115 "You're Just Not My Type!" (1): "[printed text omitted -- pnpm card:text OP11-115]"
      //
      // A 4000 Counter for one DON!!, and the price is the Leader: `powerWhen`
      // keeps the offer's own forecast honest behind any other Leader, where it
      // adds nothing at all.
      "OP11-115",
      {
        cost: 1,
        power: 4_000,
        powerWhen: {
          kind: "leader-has-name",
          player: "self",
          name: "Shirahoshi",
        },
      },
    ],
  ],
};
