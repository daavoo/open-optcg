/**
 * OP09 battle-window programs: `[Counter]` Events,
 * `[On Your Opponent's Attack]` and `[When Attacking]`.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinusOrMore, lookAndAdd, payFromHand } from "./shared.js";
import { threeRestedCharacters, twoRestedCharacters } from "./op09-shared.js";

/** "Give up to 1 of your opponent's Characters −N power during this turn." */
const debuffOneCharacter = (amount: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount: -amount,
    expiresAfterTurns: 0,
  },
});

/** `[DON!! x N]` on the card carrying the clause. */
const givenDon = (value: number) =>
  ({ kind: "source-attached-don", operator: "gte", value }) as const;

export const op09BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // OP09-039 Gum-Gum Cuatro Jet Cross Shock Bazooka: the buff lasts the
      // *turn*, not the battle, and it may land on a card the attack is not
      // pointed at -- so it is a `modify-power` on a chosen card rather than
      // the battle scalar `power` would add. Both gates are read first.
      "OP09-039",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "leader-has-type", player: "self", type: "ODYSSEY" },
                twoRestedCharacters,
              ],
            },
            then: {
              kind: "choose",
              selector: { player: "self", zone: "board", includeLeader: true },
              bind: "op09-bazooka-buff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op09-bazooka-buff",
                amount: 2000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP09-041 Soul Franky Swing Arm Boxing Solid: a battle-scoped buff --
      // the engine's Counter scalar -- and then the ODYSSEY refresh, which is
      // what makes a rested board attack again.
      "OP09-041",
      {
        cost: 1,
        power: 2000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "leader-has-type", player: "self", type: "ODYSSEY" },
                twoRestedCharacters,
              ],
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                rested: true,
              },
              bind: "op09-solid-refresh",
              min: 0,
              max: 2,
              effect: {
                kind: "update",
                binding: "op09-solid-refresh",
                rested: false,
              },
            },
          },
        },
      },
    ],
    [
      // OP09-059 Murder at the Steam Bath: the mill is paid in the player's own
      // deck, one card for each one trashed from hand -- Blue's price for the
      // biggest Counter in the set.
      "OP09-059",
      {
        cost: 2,
        power: 3000,
        program: {
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "op09-steam-bath-trash",
            min: 0,
            max: 2,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op09-steam-bath-trash",
                  to: { player: "self", zone: "trash" },
                },
                // One `trash-top` per card trashed: the binding's size is the
                // count, and the node takes a constant, so the sequence is
                // written out to the printed maximum and each step only runs
                // while the matching card was actually spent.
                {
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "self",
                    selector: {
                      zone: "trash",
                      binding: "op09-steam-bath-trash",
                    },
                    operator: "gte",
                    value: 1,
                  },
                  then: { kind: "trash-top", player: "self", count: 1 },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "self",
                    selector: {
                      zone: "trash",
                      binding: "op09-steam-bath-trash",
                    },
                    operator: "gte",
                    value: 2,
                  },
                  then: { kind: "trash-top", player: "self", count: 1 },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-078 Gum-Gum Giant: the Robin deck's Counter. `powerWhen` keeps the
      // forecast honest -- off a non-Straw Hat Leader the Event adds nothing,
      // and the defender can see that before paying for it.
      "OP09-078",
      {
        cost: 1,
        donMinus: 2,
        trashFromHand: 1,
        power: 4000,
        powerWhen: {
          kind: "leader-has-type",
          player: "self",
          type: "Straw Hat Crew",
        },
        program: {
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op09-giant-cost",
            1,
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Straw Hat Crew",
              },
              then: { kind: "draw", player: "self", count: 2 },
            },
          ),
        },
      },
    ],
    [
      // OP09-097 Black Vortex: no Counter power at all -- it answers an attack
      // by switching the attacker's text off and taking 4000 off it, which is
      // the same thing from the other end.
      "OP09-097",
      {
        cost: 2,
        power: 0,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              includeLeader: true,
            },
            bind: "op09-vortex",
            min: 0,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "negate",
                  binding: "op09-vortex",
                  expiresAfterTurns: 0,
                },
                {
                  kind: "modify-power",
                  binding: "op09-vortex",
                  amount: -4000,
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-116 Never Underestimate the Power of Miracles!!: the plain
      // battle-scoped Counter its Trigger half is written around.
      "OP09-116",
      { cost: 1, power: 2000 },
    ],
  ],
  onOpponentAttack: [
    [
      // OP09-001 Shanks (Leader): a free debuff every turn the opponent
      // attacks, which is what makes the Leader a 5000 that answers 6000s.
      "OP09-001",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                includeLeader: true,
              },
              bind: "op09-shanks-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op09-shanks-debuff",
                amount: -1000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP09-023 Adio: a rested DON!! buys 2000 in the battle, which is the
      // ODYSSEY answer to a Counter-light hand.
      "OP09-023",
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
                { kind: "battle-power", player: "self", amount: 2000 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-032 Donquixote Rosinante: stands itself back up, so one body
      // blocks twice a turn.
      "OP09-032",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "update",
              binding: SOURCE_BINDING,
              rested: false,
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    [
      // OP09-003 Shachi & Penguin: the debuff clears a blocker out of the way
      // before the attack resolves.
      "OP09-003",
      { effect: debuffOneCharacter(2000, "op09-shachi-debuff") },
    ],
    [
      // OP09-010 Bonk Punch: its own [On Play] is in `op09-on-play.ts`.
      "OP09-010",
      {
        effect: {
          kind: "if",
          condition: givenDon(1),
          then: {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 2000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP09-013 Yasopp: the second half of a card whose [On Play] buys the
      // Leader a turn of armour.
      "OP09-013",
      {
        effect: {
          kind: "if",
          condition: givenDon(1),
          then: debuffOneCharacter(1000, "op09-yasopp-debuff"),
        },
      },
    ],
    [
      // OP09-027 Sabo: ODYSSEY draws off a board it has already spent.
      "OP09-027",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: threeRestedCharacters,
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP09-044 Izo: a search on the attack, paid for with a card.
      "OP09-044",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op09-izo-looked", {
              anyOf: [
                { type: "Land of Wano" },
                { typeIncluding: "Whitebeard Pirates" },
              ],
            }).effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op09-izo-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op09-izo-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP09-050 Nami: digs for the Blue Events the deck answers attacks with.
      "OP09-050",
      lookAndAdd(5, "op09-nami-looked", {
        category: "event",
        color: "Blue",
      }),
    ],
    [
      // OP09-062 Nico Robin (Leader): a Trigger card out of hand buys a rested
      // DON!!, which is the deck's whole ramp. The offer is gated on the hand
      // actually holding one -- a hand-size floor would offer a cost that
      // cannot be paid. Its [Banish] half is printed text, read by
      // `resolveBattle`.
      "OP09-062",
      {
        oncePerTurn: false,
        requires: {
          handCardsMatching: { match: { hasTrigger: true }, count: 1 },
        },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand", hasTrigger: true },
              "op09-robin-leader-cost",
              1,
              { kind: "add-don", player: "self", count: 1, rested: true },
            ),
          },
        },
      },
    ],
    [
      // OP09-073 Brook: two debuffs for one DON!! returned, which is Purple's
      // trade of ramp for removal.
      "OP09-073",
      {
        effect: donMinusOrMore(1, {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op09-brook-debuff",
          min: 0,
          max: 2,
          effect: {
            kind: "modify-power",
            binding: "op09-brook-debuff",
            amount: -2000,
            expiresAfterTurns: 0,
          },
        }),
      },
    ],
    [
      // OP09-088 Shiryu: two cards for two cards, which in Black is a profit --
      // the trash is a resource the rest of the set reads back.
      "OP09-088",
      {
        oncePerTurn: false,
        requires: { handCards: 2 },
        program: {
          effect: {
            kind: "if",
            condition: givenDon(1),
            then: {
              kind: "optional",
              effect: payFromHand(
                { player: "self", zone: "hand" },
                "op09-shiryu-cost",
                2,
                { kind: "draw", player: "self", count: 2 },
              ),
            },
          },
        },
      },
    ],
  ],
};
