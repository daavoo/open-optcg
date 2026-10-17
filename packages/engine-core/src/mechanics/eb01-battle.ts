/**
 * EB-01 `[Counter]` Events, `[When Attacking]` and `[On Your Opponent's Attack]`
 * programs -- the clauses that fire inside a battle.
 *
 * See `mechanics/README.md` for how the set is split; the `[On Play]`s are in
 * `eb01-on-play.ts`, the `[Main]`s and `[Activate: Main]`s in `eb01-main.ts`
 * and the rest in `eb01-triggers.ts`.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd } from "./shared.js";
import {
  addActiveDon,
  baroqueWorksLeader,
  debuffOpponentCharacter,
  impelDownLeader,
  koCostAtMost,
} from "./eb01-shared.js";
import { brookCostThenKo, cavendishRamp } from "./eb01-on-play.js";

/**
 * "Return up to 1 Character with a cost of N or less to the owner's hand."
 *
 * EB01-026 prints it at 3 on a `[When Attacking]`. `player: "either"` because
 * the text names no side, and `to.player: "owner"` so a Character taken from
 * either board goes back to *its* owner.
 */
const bounceCostAtMost = (maxCost: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "either",
    zone: "board",
    category: "character",
    maxCost,
  },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "owner", zone: "hand" },
  },
});

export const eb01BattleMechanics: SetMechanics = {
  whenAttacking: [
    [
      // EB01-001 Kouzuki Oden (Leader): "[DON!! x1] [When Attacking] If you have
      // a {Land of Wano} type Character with a cost of 5 or more, this Leader
      // gains +1000 power until the start of your next turn."
      //
      // `expiresAfterTurns: 1` is what "until the start of your next turn"
      // means in player-turns: the buff has to survive the opponent's whole
      // turn, so it is still there when they attack into this Leader. A
      // `expiresAfterTurns: 0` would drop it the moment the turn ended, which
      // is the defensive half of the card and the reason it is printed this way.
      "EB01-001",
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
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "board",
                    category: "character",
                    type: "Land of Wano",
                    minCost: 5,
                  },
                  operator: "gte",
                  value: 1,
                },
              ],
            },
            then: {
              kind: "modify-power",
              binding: SOURCE_BINDING,
              amount: 1_000,
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // EB01-003 Kid & Killer: "[When Attacking] If your opponent has 2 or less
      // Life cards, this Character gains +2000 power during this turn."
      //
      // A [Rush] body that only grows once the race is nearly over, which is
      // what makes it a closer rather than a tempo play.
      "EB01-003",
      {
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
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // EB01-004 Koza: "[When Attacking] You may give your 1 active Leader
      // −5000 power during this turn: Give up to 1 of your opponent's
      // Characters −3000 power during this turn."
      //
      // The cost names an *active* Leader, so a Leader that has already
      // attacked cannot pay -- which is what stops the clause being free on the
      // turn the Leader swings too. `min: 1` makes it a real cost rather than
      // an "up to", and the whole thing is `optional` because it is a "you may".
      "EB01-004",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: [],
              includeLeader: true,
              rested: false,
            },
            bind: "eb01-koza-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "modify-power",
                  binding: "eb01-koza-cost",
                  amount: -5_000,
                  expiresAfterTurns: 0,
                },
                debuffOpponentCharacter(3_000, "eb01-koza"),
              ],
            },
          },
        },
      },
    ],
    [
      // EB01-006 Tony Tony.Chopper: "[DON!! x2] [When Attacking] Give up to 1 of
      // your opponent's Characters −3000 power during this turn."
      "EB01-006",
      {
        oncePerTurn: false,
        requires: { activeDon: 2 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "source-attached-don",
              operator: "gte",
              value: 2,
            },
            then: debuffOpponentCharacter(3_000, "eb01-chopper"),
          },
        },
      },
    ],
    [
      // EB01-012 Cavendish, the `[When Attacking]` half of one printed clause --
      // see `eb01-on-play.ts`, which registers the same fragment for `[On Play]`.
      "EB01-012",
      { effect: cavendishRamp },
    ],
    [
      // EB01-026 Prince Bellett: "[DON!! x1] [When Attacking] If you have 1 or
      // less cards in your hand, return up to 1 Character with a cost of 3 or
      // less to the owner's hand."
      //
      // The empty-hand gate is the card: it is a 2-drop that only does anything
      // once its controller has run out, which is the Impel Down plan.
      "EB01-026",
      {
        // No `requires`: [DON!! x1] counts the DON!! given to Bellett, which
        // the program's own condition reads, and says nothing about DON!!
        // left active to spend.
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "source-attached-don", operator: "gte", value: 1 },
                {
                  kind: "zone-count",
                  player: "self",
                  zone: "hand",
                  operator: "lte",
                  value: 1,
                },
              ],
            },
            then: bounceCostAtMost(3, "eb01-bellett"),
          },
        },
      },
    ],
    [
      // EB01-046 Brook, the `[When Attacking]` half -- see `eb01-on-play.ts`.
      "EB01-046",
      { effect: brookCostThenKo },
    ],
    [
      // EB01-061 Mr.2.Bon.Kurei(Bentham): "[When Attacking] Select up to 1 of
      // your opponent's Characters. This Character's base power becomes the
      // same as the selected Character's power during this turn."
      //
      // `copy-power` reads the target's *current* power -- the printed sentence
      // says "the selected Character's power", not its base -- so pointing a
      // 1000-power body at the biggest thing across the table is the whole
      // card. Taken once, when this resolves: "becomes" is not "is always equal
      // to". The target is always a defender here, so the DON!! given to it is
      // dormant and does not travel; only its printed power and its static
      // layers do.
      "EB01-061",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "eb01-bentham",
          min: 0,
          max: 1,
          effect: {
            kind: "copy-power",
            from: "eb01-bentham",
            to: SOURCE_BINDING,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // EB01-002 Izo: "[On Your Opponent's Attack] [Once Per Turn] You may trash
      // 1 card from your hand: If your Leader has the {Land of Wano} or
      // {Whitebeard Pirates} type, give up to 1 of your opponent's Leader or
      // Character cards −2000 power during this turn."
      //
      // The debuff reaches the Leader as well as the board, which is what makes
      // it a defence: the card it most often answers is the attacking Leader.
      // The cost is paid before the Leader gate is read, which is the printed
      // order.
      "EB01-002",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb01-izo-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "eb01-izo-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "if",
                    condition: {
                      kind: "any-of",
                      conditions: [
                        {
                          kind: "leader-has-type",
                          player: "self",
                          type: "Land of Wano",
                        },
                        {
                          kind: "leader-has-type",
                          player: "self",
                          type: "Whitebeard Pirates",
                        },
                      ],
                    },
                    then: {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        includeLeader: true,
                      },
                      bind: "eb01-izo",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "modify-power",
                        binding: "eb01-izo",
                        amount: -2_000,
                        expiresAfterTurns: 0,
                      },
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
      // EB01-034 Ms. Wednesday: "[On Your Opponent's Attack] [Once Per Turn]
      // DON!! −1: If your Leader's type includes \"Baroque Works\", add up to 1
      // DON!! card from your DON!! deck and set it as active."
      //
      // A DON!! for a DON!! on the face of it, which is why the timing is the
      // point: the DON!! returned is one already spent this turn and the one
      // added is active *now*, inside the opponent's attack, where it can pay
      // for a Counter.
      "EB01-034",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: donMinus(1, {
            kind: "if",
            condition: baroqueWorksLeader,
            then: addActiveDon(1),
          }),
        },
      },
    ],
    [
      // EB01-037 Mr. 9: "[On Your Opponent's Attack] [Once Per Turn] DON!! −1:
      // K.O. up to 1 of your opponent's Characters with a cost of 2 or less."
      //
      // Removal on the defender's turn, which is what separates it from the
      // set's other 2-cost ceilings: the body it answers is one that has
      // already been declared as an attacker.
      "EB01-037",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: donMinus(1, koCostAtMost(2, "eb01-mr9")),
        },
      },
    ],
  ],
  counterEvent: [
    [
      // EB01-009 Just Shut Up and Come with Us!!!!: "[Counter] Look at 5 cards
      // from the top of your deck and play up to 1 {Animal} type Character card
      // with a cost of 3 or less. Then, place the rest at the bottom of your
      // deck in any order."
      //
      // `power: 0`: the Event adds nothing to the battle itself. What it buys is
      // a body mid-combat -- which can block a *later* attack this turn, and is
      // why a Counter with no Counter power is worth the card.
      "EB01-009",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "look-at", player: "self", count: 5, bind: "eb01-009" },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "eb01-009",
                  category: "character",
                  type: "Animal",
                  maxCost: 3,
                },
                bind: "eb01-009-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "eb01-009-play" },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "eb01-009",
                },
                bind: "eb01-009-rest",
                count: "all",
                effect: {
                  kind: "order-to-bottom",
                  binding: "eb01-009-rest",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB01-010 There's No Way You Could Defeat Me!!: "[Counter] K.O. up to 1
      // of your opponent's Characters with 6000 base power or less."
      //
      // `maxPower` is printed power, which is what "base power" names: a body
      // pumped past 6000 for the turn is still a legal target, and that is the
      // whole reason the clause is worth holding against a DON!!-heavy swing.
      "EB01-010",
      {
        cost: 3,
        power: 0,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 6_000,
            },
            bind: "eb01-010",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "eb01-010" },
          },
        },
      },
    ],
    [
      // EB01-019 Off-White: "[Counter] Up to 1 of your Leader or Character cards
      // gains +4000 power during this battle. Then, look at 3 cards from the top
      // of your deck; reveal up to 1 {Donquixote Pirates} type Character card
      // and add it to your hand. Then, place the rest at the bottom of your deck
      // in any order."
      //
      // The power is the `power` field rather than a node in the program: the
      // engine holds a battle's power as a scalar on each side, so the defender's
      // +4000 lands on whichever card the battle put there. The search is what
      // the program runs afterwards.
      "EB01-019",
      {
        cost: 2,
        power: 4_000,
        program: lookAndAdd(3, "eb01-019", {
          category: "character",
          type: "Donquixote Pirates",
        }),
      },
    ],
    [
      // EB01-028 Gum-Gum Champion Rifle: "[Counter] If your Leader has the
      // {Impel Down} type, up to 1 of your Leader or Character cards gains
      // +2000 power during this battle. Then, your opponent returns 1 of their
      // active Characters to the owner's hand."
      //
      // `powerWhen` rather than a gate inside the program: the Leader type is
      // board state the defender can read before the offer is made, so the
      // action summary can promise the right number. A gate that lives in the
      // program would have to advertise +2000 and then add nothing.
      //
      // The bounce is mandatory and names the opponent's *active* Characters:
      // a board that has spent everything attacking has nothing to give back,
      // which is what keeps the clause from being a blowout.
      "EB01-028",
      {
        cost: 1,
        power: 2_000,
        powerWhen: impelDownLeader,
        program: {
          effect: {
            kind: "if",
            condition: impelDownLeader,
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                rested: false,
              },
              chooser: "opponent",
              bind: "eb01-028",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb01-028",
                to: { player: "owner", zone: "hand" },
              },
            },
          },
        },
      },
    ],
    [
      // EB01-029 Sorry. I'm a Goner.: "[Counter] Reveal 1 card from the top of
      // your deck. If the revealed card has a cost of 4 or more, return up to 1
      // of your Characters to the owner's hand. Then, place the revealed card at
      // the bottom of your deck."
      //
      // A Counter that saves a Character rather than winning the battle, so
      // `power: 0`: the body leaves the fight instead of surviving it. The
      // reveal is a real gamble -- `deck-top-cost` reads the card the player has
      // just turned over, and a cheap one means the card did nothing.
      "EB01-029",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "reveal-deck-top", player: "self" },
              {
                kind: "if",
                condition: {
                  kind: "deck-top-cost",
                  player: "self",
                  operator: "gte",
                  value: 4,
                },
                then: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                  },
                  bind: "eb01-029",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "eb01-029",
                    to: { player: "owner", zone: "hand" },
                  },
                },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  position: "top",
                },
                bind: "eb01-029-bottom",
                count: "all",
                effect: {
                  kind: "move",
                  binding: "eb01-029-bottom",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB01-038 Oh Come My Way: "[Counter] DON!! −1: If your Leader's type
      // includes \"Baroque Works\", select 1 of your Characters. Change the
      // attack target to the selected Character."
      //
      // The defender choosing what the attack hits without resting anything --
      // a [Blocker] pays by going rested and this pays a DON!! instead, which is
      // why it can point the attack at a Character that has already blocked.
      "EB01-038",
      {
        cost: 1,
        donMinus: 1,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: baroqueWorksLeader,
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
              },
              bind: "eb01-038",
              min: 1,
              max: 1,
              effect: { kind: "redirect-attack", binding: "eb01-038" },
            },
          },
        },
      },
    ],
    [
      // EB01-050 ...I Want to Live!!: "[Counter] If you have 30 or more cards in
      // your trash, add up to 1 card from the top of your deck to the top of
      // your Life cards."
      //
      // A Life card back, which no Counter power can buy: the clause does not
      // win the battle, it undoes one. The 30-card gate is what makes it a late
      // card in a deck built to fill its own trash.
      "EB01-050",
      {
        cost: 3,
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "trash",
              operator: "gte",
              value: 30,
            },
            then: {
              kind: "select",
              selector: { player: "self", zone: "deck", position: "top" },
              bind: "eb01-050",
              count: "all",
              effect: {
                kind: "move",
                binding: "eb01-050",
                to: { player: "self", zone: "life", position: "top" },
              },
            },
          },
        },
      },
    ],
  ],
};
