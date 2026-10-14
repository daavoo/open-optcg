/** OP08 `[Main]` programs: Event cards and `[Activate: Main]` abilities. */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lifeToHandCost, payFromHand } from "./shared.js";
import {
  costDebuff,
  donMinusOne,
  koCostAtMost,
  playFromHand,
  powerDebuff,
  rampActive,
  revealTwoWhitebeard,
  whitebeardLeader,
} from "./op08-shared.js";

/** `[DON!! x N]` on the card carrying the clause. */
const givenDon = (value: number) =>
  ({ kind: "source-attached-don", operator: "gte", value }) as const;

/**
 * "Rest up to 1 of your opponent's Characters (with a cost of C or less)."
 *
 * `rested: false` alongside `canRest`, so the offer never points at a body that
 * is already down -- resting a rested Character is not a payout.
 */
const restOneOpponent = (bind: string, maxCost?: number): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    canRest: true,
    rested: false,
    ...(maxCost === undefined ? {} : { maxCost }),
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

/**
 * "You may rest N of your Characters: <effect>" -- the Minks package's price,
 * printed on both of its Events.
 *
 * The payoff is nested inside the `choose` for the reason `payFromHand` gives:
 * a board that cannot fill the cost must not reach the effect.
 */
const restOwnCharacters = (
  count: number,
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
      canRest: true,
      rested: false,
    },
    bind,
    min: count,
    max: count,
    effect: {
      kind: "sequence",
      effects: [{ kind: "rest", binding: bind }, effect],
    },
  },
});

/**
 * "If your Leader has the {Animal Kingdom Pirates} or {Big Mom Pirates} type"
 * -- the Purple package's gate, printed on its two-colour Leaders' payoffs.
 */
const kingdomOrBigMomLeader = {
  kind: "any-of",
  conditions: [
    {
      kind: "leader-has-type",
      player: "self",
      type: "Animal Kingdom Pirates",
    },
    { kind: "leader-has-type", player: "self", type: "Big Mom Pirates" },
  ],
} as const;

/**
 * "You may place 3 cards from your trash at the bottom of your deck in any
 * order: <effect>" -- OP08-094's price, printed on both of its halves.
 *
 * The cards come back into the deck rather than out of the game, so a Black
 * deck that has filled its trash is paying with the resource it has most of.
 */
export const buryThreeFromTrash = (
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "choose",
    selector: { player: "self", zone: "trash" },
    bind,
    min: 3,
    max: 3,
    effect: {
      kind: "sequence",
      effects: [
        {
          kind: "order-to-bottom",
          binding: bind,
          to: { player: "self", zone: "deck", position: "bottom" },
        },
        effect,
      ],
    },
  },
});

/** OP08-019's clause, printed on `[Main]` and `[Counter]` alike. */
export const munchMunchMutation: MechanicEffect = {
  kind: "sequence",
  effects: [
    powerDebuff(3_000, "op08-munch-debuff"),
    {
      kind: "choose",
      selector: { player: "self", zone: "board", category: "character" },
      bind: "op08-munch-buff",
      min: 0,
      max: 1,
      effect: {
        kind: "modify-power",
        binding: "op08-munch-buff",
        amount: 3_000,
        expiresAfterTurns: 0,
      },
    },
  ],
};

/** OP08-094's clause, printed on `[Main]` and `[Counter]` alike. */
export const imperialFlame: MechanicEffect = buryThreeFromTrash(
  "op08-imperial-bury",
  koCostAtMost(2, "op08-imperial-ko"),
);

export const op08MainMechanics: SetMechanics = {
  eventMain: [
    [
      // OP08-018 Cloven Rose: three small buffs and one debuff, in the printed
      // order -- the debuff is read after the buffs, which matters only to a
      // Character that is on both ends of it and cannot be.
      "OP08-018",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                },
                bind: "op08-cloven-buff",
                min: 0,
                max: 3,
                effect: {
                  kind: "modify-power",
                  binding: "op08-cloven-buff",
                  amount: 1_000,
                  expiresAfterTurns: 0,
                },
              },
              powerDebuff(2_000, "op08-cloven-debuff"),
            ],
          },
        },
      },
    ],
    [
      // OP08-019 Munch-Munch Mutation: the same program on both timings.
      "OP08-019",
      { cost: 3, program: { effect: munchMunchMutation } },
    ],
    [
      // OP08-037 Garchu: a Minks body rests to turn one of theirs over, which
      // is what feeds the set's "7 or more rested cards" clauses.
      "OP08-037",
      {
        cost: 1,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                type: "Minks",
                canRest: true,
                rested: false,
              },
              bind: "op08-garchu-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: "op08-garchu-cost" },
                  restOneOpponent("op08-garchu-rest"),
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP08-038 We Would Never Sell a Comrade to an Enemy!!!: two bodies down
      // for a board that survives every removal Event until their next turn
      // ends. `ko-immune` is the opponent-effects reading, which is exactly
      // what the clause names -- a lost fight still kills.
      //
      // "None of your Characters" is read at resolution: a Character played
      // afterwards is not one of them, which is what `select` over the board
      // says and a player-wide flag would not.
      "OP08-038",
      {
        cost: 1,
        program: {
          effect: restOwnCharacters(2, "op08-comrade-cost", {
            kind: "select",
            selector: { player: "self", zone: "board", category: "character" },
            bind: "op08-comrade-guard",
            count: "all",
            effect: {
              kind: "restrict",
              binding: "op08-comrade-guard",
              restriction: "ko-immune",
              expiresAfterTurns: 1,
            },
          }),
        },
      },
    ],
    [
      // OP08-053 Thank You...for Loving Me!!: the Whitebeard search, and the
      // only one in the set whose leftovers may go back to the *top*.
      "OP08-053",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: whitebeardLeader,
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "look-at",
                  player: "self",
                  count: 3,
                  bind: "op08-thankyou",
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "deck",
                    binding: "op08-thankyou",
                    anyOf: [
                      { typeIncluding: "Whitebeard Pirates" },
                      { name: "Monkey.D.Luffy" },
                    ],
                  },
                  bind: "op08-thankyou-add",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op08-thankyou-add",
                    to: { player: "self", zone: "hand" },
                  },
                },
                {
                  kind: "select",
                  selector: {
                    player: "self",
                    zone: "deck",
                    binding: "op08-thankyou",
                  },
                  bind: "op08-thankyou-rest",
                  count: "all",
                  effect: {
                    kind: "order-to-bottom",
                    binding: "op08-thankyou-rest",
                    to: { player: "self", zone: "deck", position: "top" },
                    alternate: {
                      player: "self",
                      zone: "deck",
                      position: "bottom",
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-055 Phoenix Brand: removal that buries rather than K.O.s, so
      // nothing keyed on a K.O. fires and the card is gone for good. Reaches
      // either side of the table, like every "1 Character" in this set.
      "OP08-055",
      {
        cost: 4,
        program: {
          effect: revealTwoWhitebeard("op08-phoenix-reveal", {
            kind: "choose",
            selector: {
              player: "either",
              zone: "board",
              category: "character",
              maxCost: 6,
            },
            bind: "op08-phoenix-bury",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op08-phoenix-bury",
              to: { player: "owner", zone: "deck", position: "bottom" },
            },
          }),
        },
      },
    ],
    [
      // OP08-075 Candy Maiden: the price is declared on the entry so the offer
      // knows it, and the Life cards go face-down afterwards -- information
      // spent, not Life.
      "OP08-075",
      {
        cost: 1,
        donMinus: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              restOneOpponent("op08-candy-rest", 2),
              {
                kind: "select",
                selector: { player: "self", zone: "life", faceUp: true },
                bind: "op08-candy-life",
                count: "all",
                effect: {
                  kind: "update",
                  binding: "op08-candy-life",
                  faceUp: false,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP08-076 It's to Die For...: one DON!! always, a second against a board
      // with a real body on it. Current power, so a Character pumped past 6000
      // by its own controller pays for the second half too.
      "OP08-076",
      {
        cost: 3,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              rampActive,
              {
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
                then: rampActive,
              },
            ],
          },
        },
      },
    ],
    [
      // OP08-077 Conquest of the Sea: the set's board wipe, priced at six DON!!
      // and two more off the field.
      "OP08-077",
      {
        cost: 6,
        donMinus: 2,
        program: {
          effect: {
            kind: "if",
            condition: kingdomOrBigMomLeader,
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 6,
              },
              bind: "op08-conquest-ko",
              min: 0,
              max: 2,
              effect: { kind: "knock-out", binding: "op08-conquest-ko" },
            },
          },
        },
      },
    ],
    [
      // OP08-094 Imperial Flame: the same program on both timings.
      "OP08-094",
      { cost: 2, program: { effect: imperialFlame } },
    ],
    [
      // OP08-095 Iron Body Fang Flash: a buff that holds through the
      // opponent's turn, bought with a trash the Black deck fills anyway.
      "OP08-095",
      {
        cost: 2,
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
                zone: "board",
                category: "character",
              },
              bind: "op08-iron-body",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op08-iron-body",
                amount: 2_000,
                expiresAfterTurns: 1,
              },
            },
          },
        },
      },
    ],
    [
      // OP08-097 Heliceratops: the cost debuff and the kill are one sentence,
      // so the K.O. reads the board *after* the debuff -- which is the only way
      // anything is ever at cost 0 to be killed by it.
      "OP08-097",
      {
        cost: 3,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Animal Kingdom Pirates",
            },
            then: {
              kind: "sequence",
              effects: [
                costDebuff(2, "op08-helice-cost"),
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 0,
                  },
                  bind: "op08-helice-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op08-helice-ko" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-117 Burn Blade: the set's biggest Event removal, paid for with a
      // Life card that goes to the trash rather than to the hand.
      "OP08-117",
      {
        cost: 5,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "top" },
              bind: "op08-burn-blade-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op08-burn-blade-life",
                    to: { player: "owner", zone: "trash" },
                  },
                  koCostAtMost(7, "op08-burn-blade-ko"),
                ],
              },
            },
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // OP08-001 Tony Tony.Chopper (Leader): three rested DON!! across three
      // bodies, one each.
      //
      // `attach-don` over a `choose` rather than `give-rested-don`, for the
      // reason OP06-022 Yamato's Leader gives: the printed text names
      // Characters only, and `give-rested-don` offers the Leader alongside them
      // -- which on this Leader is not a hypothetical, because it carries both
      // of the types its own clause names. `each` is what hands one DON!! to
      // every card chosen rather than the whole pile to one.
      "OP08-001",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              anyOf: [{ type: "Animal" }, { type: "Drum Kingdom" }],
            },
            bind: "op08-chopper-leader-don",
            min: 0,
            max: 3,
            effect: {
              kind: "attach-don",
              player: "self",
              from: "rested",
              count: 1,
              target: { binding: "op08-chopper-leader-don", each: true },
            },
          },
        },
      },
    ],
    [
      // OP08-002 Marco (Leader): a filtered draw and a debuff, for a DON!! on
      // the Leader. `[DON!! x1]` is read as attached DON!! -- the Leader's own
      // pile -- not as the field total.
      "OP08-002",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: givenDon(1),
            then: {
              kind: "sequence",
              effects: [
                { kind: "draw", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op08-marco-back",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "order-to-bottom",
                    binding: "op08-marco-back",
                    to: { player: "self", zone: "deck", position: "top" },
                    alternate: {
                      player: "self",
                      zone: "deck",
                      position: "bottom",
                    },
                  },
                },
                powerDebuff(2_000, "op08-marco-debuff"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-008 Dalton: [Rush] bought with a Life card that joins the hand,
      // which is the Drum Kingdom deck's whole exchange rate.
      "OP08-008",
      {
        oncePerTurn: true,
        requires: { lifeCards: 1 },
        program: {
          effect: {
            kind: "if",
            condition: givenDon(1),
            then: lifeToHandCost({
              kind: "grant-keyword",
              binding: SOURCE_BINDING,
              keyword: "Rush",
              expiresAfterTurns: 0,
            }).effect,
          },
        },
      },
    ],
    [
      // OP08-010 Hiking Bear: buffs an {Animal} body other than itself.
      "OP08-010",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: givenDon(1),
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                type: "Animal",
                excludeSource: true,
              },
              bind: "op08-hiking-buff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op08-hiking-buff",
                amount: 1_000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP08-016 Dr.Hiriluk: a 0-power body that rests to make every Chopper on
      // the board a real attacker. "All of", so no choice -- `select`.
      "OP08-016",
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
                    kind: "leader-has-name",
                    player: "self",
                    name: "Tony Tony.Chopper",
                  },
                  then: {
                    kind: "select",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      name: "Tony Tony.Chopper",
                    },
                    bind: "op08-hiriluk-buff",
                    count: "all",
                    effect: {
                      kind: "modify-power",
                      binding: "op08-hiriluk-buff",
                      amount: 2_000,
                      expiresAfterTurns: 0,
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-021 Carrot (Leader): the rest that starts the Minks lock.
      "OP08-021",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: "board", category: "character", type: "Minks" },
              operator: "gte",
              value: 1,
            },
            then: restOneOpponent("op08-carrot-rest", 5),
          },
        },
      },
    ],
    [
      // OP08-032 Milky: a 0-power body that turns itself into a DON!!.
      "OP08-032",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, restedDon: 1 },
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
                    kind: "leader-has-type",
                    player: "self",
                    type: "Minks",
                  },
                  then: { kind: "activate-don", player: "self", count: 1 },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-039 Zou: the same DON!! refund off a Stage. Its
      // `[End of Your Turn]` half is registered below.
      "OP08-039",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, restedDon: 1 },
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
                    kind: "leader-has-type",
                    player: "self",
                    type: "Minks",
                  },
                  then: { kind: "activate-don", player: "self", count: 1 },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-041 Aphelandra: buys itself back to hand to bury a 1-drop. The
      // return is the cost, so it happens whether or not the Leader gate lets
      // the second half through -- which is what the printed colon says.
      "OP08-041",
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
                  to: { player: "owner", zone: "hand" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Kuja Pirates",
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 1,
                    },
                    bind: "op08-aphelandra-bury",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op08-aphelandra-bury",
                      to: { player: "owner", zone: "deck", position: "bottom" },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-044 Kingdew: pays in information -- two cards shown, none spent.
      "OP08-044",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: {
            match: { typeIncluding: "Whitebeard Pirates" },
            count: 2,
          },
        },
        program: {
          effect: revealTwoWhitebeard("op08-kingdew-reveal", {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 2_000,
            expiresAfterTurns: 0,
          }),
        },
      },
    ],
    [
      // OP08-057 King (Leader): two DON!! back for one of two payouts, and the
      // draw half is gated on a hand this Leader has usually emptied.
      "OP08-057",
      {
        oncePerTurn: true,
        requires: { fieldDon: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 2 },
                {
                  kind: "choice",
                  branches: [
                    {
                      id: "draw",
                      label: "Draw 1 card (with 5 or less cards in hand)",
                      effect: {
                        kind: "if",
                        condition: {
                          kind: "zone-count",
                          player: "self",
                          zone: "hand",
                          operator: "lte",
                          value: 5,
                        },
                        then: { kind: "draw", player: "self", count: 1 },
                      },
                    },
                    {
                      id: "cost",
                      label: "Give 1 of their Characters -2 cost this turn",
                      effect: costDebuff(2, "op08-king-leader-cost"),
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-059 Alber: trades itself for the 7-cost King out of hand, once the
      // board is at ten DON!!. Trashed, not K.O.'d -- nothing keyed on a K.O.
      // fires.
      "OP08-059",
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
                  to: { player: "owner", zone: "trash" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "all-of",
                    conditions: [
                      {
                        kind: "leader-has-type",
                        player: "self",
                        type: "Animal Kingdom Pirates",
                      },
                      {
                        kind: "field-don",
                        player: "self",
                        operator: "gte",
                        value: 10,
                      },
                    ],
                  },
                  then: playFromHand(
                    { name: "King", maxCost: 7 },
                    "op08-alber-king",
                  ),
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-062 Charlotte Katakuri: the 2-cost body that becomes the 6-cost
      // one, priced off the *opponent's* DON!! -- `maxCostFromFieldDon`, which
      // is the only reading that lets the deck cheat a turn ahead.
      "OP08-062",
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
                  to: { player: "owner", zone: "trash" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Big Mom Pirates",
                  },
                  then: playFromHand(
                    {
                      name: "Charlotte Katakuri",
                      minCost: 3,
                      maxCostFromFieldDon: "opponent",
                    },
                    "op08-katakuri-chain",
                  ),
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-064 Charlotte Cracker: a DON!! for a free 5-cost body, which is
      // why Biscuit Warrior is printed without a copy limit.
      "OP08-064",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: donMinusOne(
            playFromHand({ name: "Biscuit Warrior" }, "op08-cracker-biscuit"),
          ),
        },
      },
    ],
    [
      // OP08-074 Black Maria: five DON!! now against a debt squared up at the
      // end of the turn -- see `equalize-don-at-end-of-turn` for why the number
      // cannot be fixed here. The gate is on a *second* copy, not on this one.
      "OP08-074",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                name: "Black Maria",
                excludeSource: true,
              },
              operator: "eq",
              value: 0,
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "add-don", player: "self", count: 5, rested: true },
                { kind: "equalize-don-at-end-of-turn", player: "self" },
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-079 Kaido: only on the turn it lands, which is what makes a
      // 9-cost body a removal spell rather than a permanent engine. The
      // opponent's discard is theirs to choose.
      "OP08-079",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op08-kaido-cost",
              1,
              {
                kind: "if",
                condition: { kind: "source-played-this-turn" },
                then: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                        maxCost: 7,
                      },
                      bind: "op08-kaido-trash",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op08-kaido-trash",
                        to: { player: "owner", zone: "trash" },
                      },
                    },
                    {
                      kind: "choose",
                      chooser: "opponent",
                      selector: { player: "opponent", zone: "hand" },
                      bind: "op08-kaido-their-trash",
                      min: 1,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op08-kaido-their-trash",
                        to: { player: "owner", zone: "trash" },
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
      // OP08-082 Sasaki: the DON!! rest is the cost and the self-rest is
      // optional, which is the shape OP10-065 Sugar established -- an active
      // Sasaki can pay and stay up.
      "OP08-082",
      {
        oncePerTurn: false,
        requires: { activeDon: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 1 },
              {
                kind: "optional",
                effect: {
                  kind: "update",
                  binding: SOURCE_BINDING,
                  rested: true,
                },
              },
              costDebuff(2, "op08-sasaki-cost"),
            ],
          },
        },
      },
    ],
    [
      // OP08-084 Jack: rests for a filtered draw and a kill. Its printed
      // "+4 cost" is a continuous layer, in `static-abilities.ts`.
      "OP08-084",
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
                { kind: "draw", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op08-jack-trash",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op08-jack-trash",
                    to: { player: "self", zone: "trash" },
                  },
                },
                koCostAtMost(3, "op08-jack-ko"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP08-087 Scratchmen Apoo: a repeatable cost debuff, which is what makes
      // the set's "cost N or less" removal reach a size it is not printed for.
      "OP08-087",
      {
        oncePerTurn: true,
        program: { effect: costDebuff(1, "op08-apoo-cost") },
      },
    ],
    [
      // OP08-101 Charlotte Angel: a Life card spent now for one paid back when
      // the turn ends -- see `deck-top-to-life-at-end-of-turn`, which is booked
      // because the card that comes back is whatever is on top by then.
      "OP08-101",
      {
        oncePerTurn: true,
        requires: { lifeCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "top" },
              bind: "op08-angel-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op08-angel-life",
                    to: { player: "owner", zone: "trash" },
                  },
                  {
                    kind: "if",
                    condition: {
                      kind: "leader-has-type",
                      player: "self",
                      type: "Big Mom Pirates",
                    },
                    then: {
                      kind: "deck-top-to-life-at-end-of-turn",
                      player: "self",
                      count: 1,
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
      // OP08-103 Charlotte Custard: the cheapest of the Yellow Life exchanges,
      // and the buff holds through the opponent's turn.
      "OP08-103",
      {
        oncePerTurn: true,
        requires: { lifeCards: 1 },
        program: lifeToHandCost({
          kind: "choose",
          selector: { player: "self", zone: "board", category: "character" },
          bind: "op08-custard-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op08-custard-buff",
            amount: 1_000,
            expiresAfterTurns: 1,
          },
        }),
      },
    ],
    [
      // OP08-107 Nitro: "your [Charlotte Pudding] cards" is the Leader as well
      // as the Characters, which is what `includeLeader` says.
      "OP08-107",
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
                    includeLeader: true,
                    name: "Charlotte Pudding",
                  },
                  bind: "op08-nitro-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op08-nitro-buff",
                    amount: 2_000,
                    expiresAfterTurns: 0,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP08-039 Zou: the Stage's other half -- a Minks body back up for the
      // opponent's turn, which is what makes the deck's rests affordable.
      "OP08-039",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Minks",
            rested: true,
          },
          bind: "op08-zou-active",
          min: 0,
          max: 1,
          effect: { kind: "update", binding: "op08-zou-active", rested: false },
        },
      },
    ],
  ],
};
