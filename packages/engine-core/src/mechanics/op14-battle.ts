/**
 * OP14 battle-window programs: `[Counter]` Events,
 * `[On Your Opponent's Attack]`, `[When Attacking]`, and the set's new
 * "when this Character becomes rested" clause.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, payFromHand, trashForBattlePower } from "./shared.js";
import { sourceAtFivePower, topDeckToLife } from "./op14-shared.js";

/**
 * "Give up to 1 of your opponent's Characters −N power during this turn" --
 * the attack-time debuff four Red cards print at three different numbers.
 */
const debuffOneOpponentCharacter = (
  amount: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount,
    expiresAfterTurns: 0,
  },
});

/**
 * "Up to 1 of your Leader or Character cards gains +N power during this
 * battle", as the payoff of a `[Counter]` whose power is conditional.
 *
 * A `CounterEventProgram`'s `power` is a constant added before the program
 * runs, so a Counter that only pays out under a condition has to write the
 * buff as a `battle-power` node inside its program instead. The attacker's
 * forecast still sees it: `programBattlePower` walks both branches of an `if`
 * deliberately, so a defender is never promised less than they can reach.
 */
const conditionalCounterPower = (amount: number): MechanicEffect => ({
  kind: "battle-power",
  player: "self",
  amount,
});

export const op14BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // OP14-018 Time for the Counterattack: "[printed text omitted -- pnpm card:text OP14-018]"
      //
      // Either field counts -- the text does not say "you have" -- and it is
      // *current* power, so a Character the Red deck has just pumped past 8000
      // switches its own Counter on.
      "OP14-018",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "either",
              selector: {
                zone: "board",
                category: "character",
                minCurrentPower: 8000,
              },
              operator: "gte",
              value: 1,
            },
            then: conditionalCounterPower(4000),
          },
        },
      },
    ],
    [
      // OP14-036 "Strive to Surpass me, Roronoa Zoro!!!": "[printed text omitted -- pnpm card:text OP14-036]"
      //
      // Resting one of your own cards mid-defence is a real cost in Green -- it
      // is a card that will not refresh -- and it is also what the set's
      // "when this Character becomes rested" clauses are waiting for, though
      // those are all `[Your Turn]` and so stay quiet here.
      "OP14-036",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                includeLeader: true,
                rested: false,
              },
              bind: "op14-surpass-counter",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: "op14-surpass-counter" },
                  conditionalCounterPower(4000),
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP14-037 For Fun: "[printed text omitted -- pnpm card:text OP14-037]"
      "OP14-037",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
    [
      // OP14-038 "I Never Bother to Remember the Faces of Trash": "[printed text omitted -- pnpm card:text OP14-038]"
      "OP14-038",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
    [
      // OP14-058 Ocean Current Shoulder Throw: "[printed text omitted -- pnpm card:text OP14-058]"
      "OP14-058",
      {
        cost: 2,
        power: 3000,
        target: { isLeader: true },
        program: { effect: { kind: "draw", player: "self", count: 1 } },
      },
    ],
    [
      // OP14-076 Ever White: "[printed text omitted -- pnpm card:text OP14-076]"
      "OP14-076",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
    [
      // OP14-077 Penta-Chromatic String: "[printed text omitted -- pnpm card:text OP14-077]"
      //
      // The DON!! half is Purple paying itself back for defending: a rested
      // DON!! still counts on the field, which is what OP14-068 Trebol and the
      // `DON!! −N` costs across the colour read.
      "OP14-077",
      {
        cost: 2,
        power: 4000,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "opponent",
              selector: {
                zone: "board",
                category: "character",
                minCurrentPower: 6000,
              },
              operator: "gte",
              value: 1,
            },
            then: { kind: "add-don", player: "self", count: 1, rested: true },
          },
        },
      },
    ],
    [
      // OP14-078 Bullet String: "[printed text omitted -- pnpm card:text OP14-078]"
      //
      // "That card" is the one the first half just buffed, which is the card
      // carrying this side of the battle -- `bind-battle-target` is what names
      // it, because `battle-power` writes a scalar rather than touching a card.
      // The second +2000 outlasts the battle, so a Character that survives this
      // fight is still up 2000 for the next one this turn.
      "OP14-078",
      {
        cost: 2,
        power: 0,
        program: {
          effect: donMinus(1, {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Donquixote Pirates",
            },
            then: {
              kind: "sequence",
              effects: [
                conditionalCounterPower(2000),
                {
                  kind: "bind-battle-target",
                  player: "self",
                  bind: "op14-bullet-target",
                  effect: {
                    kind: "modify-power",
                    binding: "op14-bullet-target",
                    amount: 2000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          }),
        },
      },
    ],
    [
      // OP14-096 Ground Death: "[printed text omitted -- pnpm card:text OP14-096]"
      "OP14-096",
      {
        cost: 1,
        power: 0,
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
            then: conditionalCounterPower(4000),
          },
        },
      },
    ],
    [
      // OP14-098 Crescent Cutlass: "[printed text omitted -- pnpm card:text OP14-098]"
      "OP14-098",
      { cost: 1, power: 3000, target: { isLeader: true } },
    ],
    [
      // OP14-116 Salamander: "[printed text omitted -- pnpm card:text OP14-116]"
      //
      // A 4-cost Counter that leaves a body behind, which is why it is worth
      // the DON!! on the defensive turn.
      "OP14-116",
      {
        cost: 4,
        power: 2000,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              maxCost: 4,
              anyOf: [{ type: "Amazon Lily" }, { type: "Kuja Pirates" }],
            },
            bind: "op14-salamander-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op14-salamander-play" },
          },
        },
      },
    ],
    [
      // OP14-117 Brick Bat: "[printed text omitted -- pnpm card:text OP14-117]"
      //
      // The type restriction is on the card being attacked, so this does nothing
      // while a non-Thriller-Bark body is blocking -- the same reading every
      // other targeted Counter in the pool gets.
      "OP14-117",
      { cost: 1, power: 3000, target: { type: "Thriller Bark Pirates" } },
    ],
    [
      // OP14-118 "You'll Frighten Me... ♡": "[printed text omitted -- pnpm card:text OP14-118]"
      //
      // No power at all: a Counter that answers the *next* attack instead of
      // this one, which is what Yellow's behind-only payoffs are for.
      "OP14-118",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 2,
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                rested: false,
              },
              bind: "op14-frighten",
              min: 0,
              max: 1,
              effect: {
                kind: "restrict",
                binding: "op14-frighten",
                restriction: "cannot-attack",
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP14-009 Trafalgar Law: "[printed text omitted -- pnpm card:text OP14-009]"
      //
      // The defensive half of the set's swap: a 5000 Leader under attack becomes
      // a 10000 one for the length of that fight by borrowing this Character's
      // own body. "During this battle" is why the swap is battle-scoped -- a
      // turn-scoped one would defend every later attack that turn too.
      //
      // "1 Character" is unqualified, so either side's is a legal partner; in
      // practice it is this Law, and the `choose` offers whatever is there.
      "OP14-009",
      {
        oncePerTurn: true,
        requires: { handCards: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op14-law009-cost",
              2,
              {
                kind: "select",
                selector: { player: "self", zone: [], includeLeader: true },
                bind: "op14-law009-leader",
                count: "all",
                effect: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op14-law009-body",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "swap-base-power",
                    first: "op14-law009-leader",
                    second: "op14-law009-body",
                    scope: "battle",
                  },
                },
              },
            ),
          },
        },
      },
    ],
    [
      // OP14-060 Donquixote Doflamingo (Leader): "[printed text omitted -- pnpm card:text OP14-060]"
      //
      // Redirection without a [Blocker]: the chosen card does not rest, and the
      // Leader may take a hit meant for a Character or the other way round.
      // `requires.fieldDon` keeps the offer off the table with no DON!! to pay.
      "OP14-060",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    includeLeader: true,
                    excludeAttackTarget: true,
                    anyOf: [
                      { type: "Donquixote Pirates" },
                      { category: "leader" },
                    ],
                  },
                  bind: "op14-doffy-redirect",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "redirect-attack",
                    binding: "op14-doffy-redirect",
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP14-119 Dracule Mihawk: "[printed text omitted -- pnpm card:text OP14-119]"
      "OP14-119",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: trashForBattlePower(2000, "op14-mihawk119-cost"),
      },
    ],
  ],
  whenAttacking: [
    [
      // OP14-002 Urouge: "[printed text omitted -- pnpm card:text OP14-002]"
      //
      // The power is read at declaration, after the attacker's own DON!! is
      // counted -- which is what a 3-cost 2000 body is buying with three DON!!.
      "OP14-002",
      {
        effect: {
          kind: "if",
          condition: sourceAtFivePower,
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxPower: 3000,
                },
                bind: "op14-urouge-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op14-urouge-ko" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP14-006 Shachi & Penguin: "[printed text omitted -- pnpm card:text OP14-006]"
      "OP14-006",
      {
        effect: {
          kind: "if",
          condition: sourceAtFivePower,
          then: debuffOneOpponentCharacter(-2000, "op14-shachi-debuff"),
        },
      },
    ],
    [
      // OP14-012 Bepo: "[printed text omitted -- pnpm card:text OP14-012]"
      //
      // Rested DON!! given mid-attack is power on a card that has already been
      // paid for, which is how Red keeps two threats live off one turn's DON!!.
      "OP14-012",
      {
        effect: {
          kind: "if",
          condition: sourceAtFivePower,
          then: { kind: "give-rested-don", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP14-013 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP14-013]" Its `[On Play]`
      // search is registered separately.
      "OP14-013",
      { effect: debuffOneOpponentCharacter(-1000, "op14-luffy013-debuff") },
    ],
    [
      // OP14-016 X.Drake: "[printed text omitted -- pnpm card:text OP14-016]"
      //
      // The `[DON!! x1]` is a gate on this clause firing at all, which is what
      // `source-attached-don` is for -- not a power layer.
      "OP14-016",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 1,
          },
          then: debuffOneOpponentCharacter(-2000, "op14-drake-debuff"),
        },
      },
    ],
    [
      // OP14-080 Gecko Moria (Leader): "[printed text omitted -- pnpm card:text OP14-080]"
      //
      // Three cards for one Life is a bad trade on its face; it is priced for
      // the Thriller Bark package, which wants those three cards in the trash
      // for its recursion Triggers and its Leader's own `[Activate: Main]`.
      "OP14-080",
      {
        oncePerTurn: false,
        requires: { handCards: 3 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op14-moria-attack-cost",
              3,
              topDeckToLife,
            ),
          },
        },
      },
    ],
  ],
  whenRested: [
    [
      // OP14-021 Issho: "[printed text omitted -- pnpm card:text OP14-021]"
      //
      // "If you do" makes the lock conditional on the Life card actually
      // moving, so the payoff is nested inside the cost's `choose` rather than
      // sequenced after it -- a player with no Life gets neither half.
      "OP14-021",
      {
        yourTurnOnly: true,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "top" },
              bind: "op14-issho-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op14-issho-life",
                    to: { player: "self", zone: "hand" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: ["board", "stage"],
                      rested: true,
                    },
                    bind: "op14-issho-lock",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "restrict",
                      binding: "op14-issho-lock",
                      restriction: "cannot-refresh",
                      expiresAfterTurns: 1,
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
      // OP14-027 Shanks: "[printed text omitted -- pnpm card:text OP14-027]"
      //
      // Attacking with Shanks rests it, so this fires on the attack as well as
      // on the deck's own rest effects -- which is why the attack declaration is
      // one of this registry's two dispatch sites.
      "OP14-027",
      {
        yourTurnOnly: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 7000,
              canRest: true,
            },
            bind: "op14-shanks-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op14-shanks-rest" },
          },
        },
      },
    ],
    [
      // OP14-028 Johnny: "[printed text omitted -- pnpm card:text OP14-028]"
      "OP14-028",
      {
        yourTurnOnly: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              maxCost: 2,
            },
            bind: "op14-johnny-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op14-johnny-ko" },
          },
        },
      },
    ],
    [
      // OP14-032 Humandrill: "[printed text omitted -- pnpm card:text OP14-032]"
      "OP14-032",
      {
        yourTurnOnly: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 4,
              canRest: true,
            },
            bind: "op14-humandrill-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op14-humandrill-rest" },
          },
        },
      },
    ],
    [
      // OP14-035 Yosaku: "[printed text omitted -- pnpm card:text OP14-035]"
      "OP14-035",
      {
        yourTurnOnly: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              maxCost: 4,
            },
            bind: "op14-yosaku-lock",
            min: 0,
            max: 1,
            effect: {
              kind: "restrict",
              binding: "op14-yosaku-lock",
              restriction: "cannot-refresh",
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // OP14-070 Buffalo: "[printed text omitted -- pnpm card:text OP14-070]"
      //
      // The narrowest trigger in the registry, and the only one that is not
      // `[Your Turn]`: it answers an *opposing Character's* effect, which in
      // practice is a rest-to-disable aimed at this [Blocker]. Paying a DON!!
      // to stand back up is Purple's shape -- and OP14-068 Trebol pays that
      // DON!! straight back.
      "OP14-070",
      {
        yourTurnOnly: false,
        source: "opponent-character-effect",
        program: {
          effect: {
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
                    kind: "update",
                    binding: SOURCE_BINDING,
                    rested: false,
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP14-119 Dracule Mihawk: "[printed text omitted -- pnpm card:text OP14-119]"
      //
      // A 9-cost body that locks a card down every time it attacks. Its
      // `[On Your Opponent's Attack]` half is registered above.
      "OP14-119",
      {
        yourTurnOnly: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 9,
            },
            bind: "op14-mihawk119-lock",
            min: 0,
            max: 1,
            effect: {
              kind: "restrict",
              binding: "op14-mihawk119-lock",
              restriction: "cannot-rest",
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
  ],
};
