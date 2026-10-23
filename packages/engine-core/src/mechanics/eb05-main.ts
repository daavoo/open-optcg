/**
 * EB-05 `[Main]` Events and `[Activate: Main]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { drawAndDiscard, lifeToHandCost, payFromHand } from "./shared.js";
import {
  anyCharacterPower,
  revealFromHand,
  shirahoshiLeaderActive,
} from "./eb05-shared.js";

export const eb05MainMechanics: SetMechanics = {
  eventMain: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-008 Luffy, Now's Your Chance. Printed text:
      // `pnpm card:text EB05-008`.
      //
      // Two costs in one "you may": an active DON!! given to the Leader, and
      // two red Events shown from hand. The Event itself is in the trash by
      // the time its effect runs, so the two have to be other cards -- and
      // that half is the outermost gate, so the Event is not offered over a
      // hand that cannot show them. The DON!! half is checked inside, after
      // the Event's own DON!! is paid: a player whose only active DON!! paid
      // for the Event has nothing left to give.
      //
      // The DON!! goes to the Leader rather than being spent, so it stays on
      // the field as +1000 on the Leader's turn. Only a rested Character can
      // take the −7000, which is what makes this a follow-up to a rest.
      "EB05-008",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: "hand", category: "event", color: "Red" },
              operator: "gte",
              value: 2,
            },
            then: {
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
                    {
                      kind: "attach-don",
                      player: "self",
                      from: "active",
                      count: 1,
                      target: "leader",
                    },
                    revealFromHand(
                      { category: "event", color: "Red" },
                      2,
                      "eb05-008-reveal",
                      {
                        kind: "choose",
                        selector: {
                          player: "opponent",
                          zone: "board",
                          category: "character",
                          rested: true,
                        },
                        bind: "eb05-008-debuff",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "modify-power",
                          binding: "eb05-008-debuff",
                          amount: -7000,
                          expiresAfterTurns: 0,
                        },
                      },
                    ),
                  ],
                },
              },
            },
          },
        },
      },
    ],
    [
      // EB05-009 Fight and Die with Me!!!. Printed text:
      // `pnpm card:text EB05-009`.
      //
      // "All of your Characters" as they stand when it resolves: a Character
      // played afterwards was not one of them. `maxPower` is base power, so a
      // 3000 body already pumped past 4000 still qualifies and a 5000 one
      // debuffed under it does not. One turn of expiry is the printed "until
      // the end of your opponent's next End Phase" -- the +1000 is up while the
      // opponent attacks into it.
      "EB05-009",
      {
        cost: 1,
        program: {
          effect: {
            kind: "select",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              maxPower: 4000,
            },
            bind: "eb05-009-team",
            count: "all",
            effect: {
              kind: "modify-power",
              binding: "eb05-009-team",
              amount: 1000,
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // EB05-020 My name is Shirahoshi!!. Printed text:
      // `pnpm card:text EB05-020`.
      //
      // The cost is resting the Leader, and only a Leader named [Shirahoshi]
      // that is still active can pay it -- both are one selector, which is
      // the outermost gate. Nothing stops it on the first turn (Bandai's
      // EB05-020#1): the Leader is active and the Event costs the one DON!!
      // the first player has.
      "EB05-020",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: shirahoshiLeaderActive,
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "select",
                selector: { ...shirahoshiLeaderActive, player: "self" },
                bind: "eb05-020-leader",
                count: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "rest", binding: "eb05-020-leader" },
                    { kind: "draw", player: "self", count: 2 },
                  ],
                },
              },
            },
          },
        },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-029 Kimono Sleeve Cage (5). Printed text:
      // `pnpm card:text EB05-029`.
      //
      // The hand card is a cost, so the payoff is nested inside it
      // (`payFromHand`) and `trashFromHand: 1` lets the offer see there is a
      // card behind the Event to pay with. Negation and bounce land on the
      // same pick, in printed order, so the target's own text is already off
      // when it leaves the field. `maxCost` is the cost as the board reads it.
      "EB05-029",
      {
        cost: 5,
        trashFromHand: 1,
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb05-029-cost",
              1,
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 6,
                },
                bind: "eb05-029-bounce",
                min: 0,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "negate",
                      binding: "eb05-029-bounce",
                      expiresAfterTurns: 0,
                    },
                    {
                      kind: "move",
                      binding: "eb05-029-bounce",
                      to: { player: "owner", zone: "hand" },
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
      // EB05-030 Take Care, Everybody. (2). Printed text:
      // `pnpm card:text EB05-030`.
      //
      // The bounce names no side, so `player: "either"` and the card goes to
      // its owner's hand. The [Nami] gate is the whole clause, so a wrong
      // Leader is never offered the Event's `[Main]` half. Its `[Counter]`
      // half is in `eb05-battle.ts`.
      "EB05-030",
      {
        cost: 2,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Nami",
            },
            then: {
              kind: "choose",
              selector: {
                player: "either",
                zone: "board",
                category: "character",
                maxCost: 5,
              },
              bind: "eb05-030-bounce",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb05-030-bounce",
                to: { player: "owner", zone: "hand" },
              },
            },
          },
        },
      },
    ],
    [
      // EB05-039 Pink Hornet (1). Printed text: `pnpm card:text EB05-039`.
      //
      // `donMinus: 1` on the entry, so the offer knows the price and the
      // DON!! goes back before the program runs. The Leader gate is the whole
      // program, which withholds the offer behind any other Leader rather
      // than charging a DON!! for nothing. Its `[Counter]` half is in
      // `eb05-battle.ts`.
      "EB05-039",
      {
        cost: 1,
        donMinus: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "The Vinsmoke Family",
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "eb05-039-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "eb05-039-debuff",
                amount: -4_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // EB05-040 You Need Me, Don't You?! (0). Printed text:
      // `pnpm card:text EB05-040`.
      //
      // The cost is an *active* DON!! (`from: "active"`), so the default
      // rested-first return would pay with DON!! already spent; the
      // `active-don` gate keeps a player with none from reaching the payoff.
      // The {Donquixote Pirates} gate is outermost: the cost cannot change
      // the Leader, and outermost is what withholds the offer behind any
      // other Leader rather than inviting a DON!! spent for nothing. Its
      // `[Counter]` half is in `eb05-battle.ts`.
      "EB05-040",
      {
        cost: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Donquixote Pirates",
                },
                {
                  kind: "active-don",
                  player: "self",
                  operator: "gte",
                  value: 1,
                },
              ],
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "return-don",
                    player: "self",
                    count: 1,
                    from: "active",
                  },
                  drawAndDiscard(3, 1, "eb05-040-trash"),
                ],
              },
            },
          },
        },
      },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
  activateMain: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-001 Jewelry Bonney. Printed text: `pnpm card:text EB05-001`.
      //
      // Current power, on the Leader as on a Character: the floor is what the
      // card has now, so a 5000 Leader is out of reach and one already pushed
      // under 6000 drops out. One turn of expiry is "until the end of your
      // opponent's next End Phase", so the −1000 is still there when the
      // opponent attacks with it. Its `[On Play]` is in `eb05-on-play.ts`.
      "EB05-001",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              includeLeader: true,
              minCurrentPower: 6000,
            },
            bind: "eb05-001-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "eb05-001-debuff",
              amount: -1000,
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // EB05-005 Belo Betty. Printed text: `pnpm card:text EB05-005`.
      //
      // The source trashes itself, so it pays first and the payoff follows in
      // the same "you may"; a Belo Betty that is not on the field is not an
      // activation that can be offered at all. Trashed, not K.O.'d, so nothing
      // keyed on a K.O. answers it.
      "EB05-005",
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
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "eb05-005-debuff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "eb05-005-debuff",
                    amount: -2000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB05-006 Miss Buckingham Stussy. Printed text:
      // `pnpm card:text EB05-006`.
      //
      // The Life card is paid before the mode is chosen, so the player picks
      // with the card in hand (Bandai's EB05-006#2). Neither mode names a side:
      // the +3000 may go on an opposing Character and the −4000 on one of
      // the player's own (EB05-006#1), so both read `"either"`.
      "EB05-006",
      {
        oncePerTurn: true,
        requires: { lifeCards: 1 },
        program: lifeToHandCost(
          {
            kind: "choice",
            branches: [
              {
                id: "plus-3000",
                label: "Give up to 1 Character +3000 power during this turn",
                effect: anyCharacterPower("eb05-006-plus", 3000),
              },
              {
                id: "minus-4000",
                label: "Give up to 1 Character −4000 power during this turn",
                effect: anyCharacterPower("eb05-006-minus", -4000),
              },
            ],
          },
          "top",
        ),
      },
    ],
    [
      // EB05-010 Nico Robin (Leader). Printed text: `pnpm card:text EB05-010`.
      //
      // Current power, so a Wisdom body pumped past 6000 is out of reach. The
      // selector does not filter on `rested`: setting an active Character
      // active is a pick the text allows and that changes nothing. The
      // Leader's K.O. watcher is a reaction rule in `eb05-reactions.ts`.
      "EB05-010",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              attribute: "Wisdom",
              maxCurrentPower: 6000,
            },
            bind: "eb05-010-active",
            min: 0,
            max: 1,
            effect: {
              kind: "update",
              binding: "eb05-010-active",
              rested: false,
            },
          },
        },
      },
    ],
    [
      // EB05-014 Shirahoshi. Printed text: `pnpm card:text EB05-014`.
      //
      // Resting itself is the price, so `sourceActive` gates the offer and
      // the clause repeats only as often as something sets it active again.
      // Current power for the 6000 ceiling. Its `[On Play]` is in
      // `eb05-on-play.ts`.
      "EB05-014",
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
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    type: "Neptunian",
                    maxCurrentPower: 6000,
                  },
                  bind: "eb05-014-rush",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "grant-keyword",
                    binding: "eb05-014-rush",
                    keyword: "Rush",
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    [
      // EB05-031 Vinsmoke Reiju. Printed text: `pnpm card:text EB05-031`.
      //
      // The source trashing itself is the cost and the DON!! are the payoff.
      // The 8000 check is outermost: the cost cannot change the opponent's
      // board, and outermost withholds the offer while no such Character is
      // there rather than inviting a body thrown away for nothing.
      // `minPower` reads base power, which is what the clause names -- a
      // buffed 7000 does not qualify. "Up to 4" is however many the DON!!
      // deck still holds.
      "EB05-031",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "opponent",
              selector: {
                zone: "board",
                category: "character",
                minPower: 8_000,
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: SOURCE_BINDING,
                    to: { player: "self", zone: "trash" },
                  },
                  { kind: "add-don", player: "self", count: 4, rested: false },
                ],
              },
            },
          },
        },
      },
    ],
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
