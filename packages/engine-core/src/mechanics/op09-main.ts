/** OP09 `[Main]` programs: Event cards and `[Activate: Main]` abilities. */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd, payFromHand } from "./shared.js";
import { twoRestedCharacters } from "./op09-shared.js";

/**
 * "If your Leader has the {Red-Haired Pirates} type, give up to 1 of your
 * opponent's Characters −N power during this turn" -- the debuff three Red
 * cards share, differing only in the number and in what pays for it.
 */
const redHairedDebuff = (amount: number, bind: string): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "leader-has-type",
    player: "self",
    type: "Red-Haired Pirates",
  },
  then: {
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
  },
});

/** "If your Leader has the {Blackbeard Pirates} type, <effect>." */
const ifBlackbeardLeader = (effect: MechanicEffect): MechanicEffect => ({
  kind: "if",
  condition: {
    kind: "leader-has-type",
    player: "self",
    type: "Blackbeard Pirates",
  },
  then: effect,
});

/** "Give up to 1 of your opponent's Characters −N cost during this turn." */
const costDebuff = (amount: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-cost",
    binding: bind,
    amount: -amount,
    expiresAfterTurns: 0,
  },
});

export const op09MainMechanics: SetMechanics = {
  eventMain: [
    [
      // OP09-018 Get Out of Here!: two K.O.s sharing one power budget, which is
      // what `maxTotalPower` is for -- a pair of 2000s is legal and a single
      // 5000 is not, and neither `maxCurrentPower` nor `max` alone can say it.
      "OP09-018",
      {
        cost: 3,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op09-get-out-ko",
            min: 0,
            max: 2,
            maxTotalPower: 4000,
            effect: { kind: "knock-out", binding: "op09-get-out-ko" },
          },
        },
      },
    ],
    [
      // OP09-019 Nobody Hurts a Friend of Mine!!!!: the debuff, then a draw
      // that reads the board *after* it -- a Character pushed under 5000 by
      // this card's own first half no longer pays for the second.
      "OP09-019",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              redHairedDebuff(3000, "op09-friend-debuff"),
              {
                kind: "if",
                condition: {
                  kind: "selector-count",
                  player: "opponent",
                  selector: {
                    zone: "board",
                    category: "character",
                    minCurrentPower: 5000,
                  },
                  operator: "gte",
                  value: 1,
                },
                then: { kind: "draw", player: "self", count: 1 },
              },
            ],
          },
        },
      },
    ],
    [
      // OP09-020 Come On!! We'll Fight You!!: the Red-Haired search.
      "OP09-020",
      {
        cost: 1,
        program: lookAndAdd(5, "op09-come-on-looked", {
          type: "Red-Haired Pirates",
          excludeName: "Come On!! We'll Fight You!!",
        }),
      },
    ],
    [
      // OP09-040 Thunder Lance Flip Caliber Phoenix Shot: ODYSSEY removal.
      "OP09-040",
      {
        cost: 3,
        program: {
          effect: {
            kind: "if",
            condition: twoRestedCharacters,
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 4,
              },
              bind: "op09-thunder-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op09-thunder-ko" },
            },
          },
        },
      },
    ],
    [
      // OP09-057 Cross Guild: the archetype's one-cost search. Its Trigger
      // re-runs this same program; see `op09-triggers.ts`.
      "OP09-057",
      {
        cost: 1,
        program: lookAndAdd(4, "op09-cross-guild-looked", {
          type: "Cross Guild",
        }),
      },
    ],
    [
      // OP09-058 Special Muggy Ball: the Buggy bounce.
      "OP09-058",
      {
        cost: 2,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 6,
            },
            bind: "op09-muggy-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op09-muggy-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // OP09-077 Gum-Gum Lightning: Purple pays for its removal in DON!!.
      "OP09-077",
      {
        cost: 2,
        program: {
          effect: donMinus(2, {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 6000,
            },
            bind: "op09-lightning-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op09-lightning-ko" },
          }),
        },
      },
    ],
    [
      // OP09-079 Gum-Gum Jump Rope: the draw is inside the DON!! payment, so
      // declining the cost declines the whole clause.
      "OP09-079",
      {
        cost: 2,
        program: {
          effect: donMinus(2, {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 5,
                  canRest: true,
                  rested: false,
                },
                bind: "op09-jump-rope-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "op09-jump-rope-rest" },
              },
              { kind: "draw", player: "self", count: 1 },
            ],
          }),
        },
      },
    ],
    [
      // OP09-098 Black Hole: negate first, then K.O. only if *that* Character
      // is cheap enough. "That Character" is the same binding, and the cost
      // question is asked with a `selector-count` over it -- a binding filtered
      // by `maxCost` counts 0 when the card is too expensive, which is the
      // printed conditional.
      "OP09-098",
      {
        cost: 4,
        program: {
          effect: ifBlackbeardLeader({
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op09-black-hole",
            min: 0,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "negate",
                  binding: "op09-black-hole",
                  expiresAfterTurns: 0,
                },
                {
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "opponent",
                    selector: {
                      zone: "board",
                      binding: "op09-black-hole",
                      maxCost: 4,
                    },
                    operator: "gte",
                    value: 1,
                  },
                  then: {
                    kind: "knock-out",
                    binding: "op09-black-hole",
                  },
                },
              ],
            },
          }),
        },
      },
    ],
    [
      // OP09-115 Ice Block Partisan: removal aimed at the Trigger bodies Yellow
      // and Purple recur out of Life.
      "OP09-115",
      {
        cost: 1,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 3,
              hasTrigger: true,
            },
            bind: "op09-ice-block-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op09-ice-block-ko" },
          },
        },
      },
    ],
    [
      // OP09-117 Dereshi!: the Ohara draw spell -- two Trigger cards out of the
      // top five, which is what feeds the Robin Leader's own attack cost.
      "OP09-117",
      {
        cost: 3,
        program: lookAndAdd(
          5,
          "op09-dereshi-looked",
          { hasTrigger: true, excludeName: "Dereshi!" },
          2,
        ),
      },
    ],
  ],
  activateMain: [
    [
      // OP09-008 Building Snake: the body itself is the price, and it goes to
      // the bottom of the deck rather than to the trash.
      "OP09-008",
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
                  to: { player: "owner", zone: "deck", position: "bottom" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op09-snake-debuff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op09-snake-debuff",
                    amount: -3000,
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
      // OP09-011 Hongo: rests itself for the Red-Haired debuff.
      "OP09-011",
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
                redHairedDebuff(2000, "op09-hongo-debuff"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-021 Red Force: the same debuff off a Stage, one step smaller.
      "OP09-021",
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
                redHairedDebuff(1000, "op09-red-force-debuff"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-022 Lim (Leader): rests three DON!! for a rested DON!! back and a
      // free ODYSSEY body. Its "your Characters are played rested" half is a
      // static rule, in `static-abilities.ts`.
      "OP09-022",
      {
        oncePerTurn: true,
        requires: { activeDon: 3 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 3 },
              { kind: "add-don", player: "self", count: 1, rested: true },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  type: "ODYSSEY",
                  maxCost: 5,
                },
                bind: "op09-lim-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op09-lim-play" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP09-042 Buggy (Leader): five rested DON!! and a card for any Cross
      // Guild body, at any cost -- the deck's whole engine.
      "OP09-042",
      {
        oncePerTurn: false,
        requires: { activeDon: 5, handCards: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "rest-don", player: "self", count: 5 },
              payFromHand(
                { player: "self", zone: "hand" },
                "op09-buggy-cost",
                1,
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    category: "character",
                    type: "Cross Guild",
                  },
                  bind: "op09-buggy-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op09-buggy-play" },
                },
              ),
            ],
          },
        },
      },
    ],
    [
      // OP09-060 Emptee Bluffs Island: two cards to the bottom of the deck buy
      // two fresh ones, so the Stage filters rather than refills.
      "OP09-060",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, handCards: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op09-emptee-cost",
              min: 2,
              max: 2,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "order-to-bottom",
                    binding: "op09-emptee-cost",
                    to: {
                      player: "self",
                      zone: "deck",
                      position: "bottom",
                    },
                  },
                  { kind: "rest", binding: SOURCE_BINDING },
                  {
                    kind: "if",
                    condition: {
                      kind: "leader-has-type",
                      player: "self",
                      type: "Cross Guild",
                    },
                    then: { kind: "draw", player: "self", count: 2 },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP09-081 Marshall.D.Teach (Leader): switches the opponent's [On Play]
      // effects off into their own turn. Its own half -- this Leader's side
      // never gets an [On Play] either -- is a static rule.
      "OP09-081",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op09-teach-leader-cost",
              1,
              {
                kind: "restrict-player",
                player: "opponent",
                restriction: "on-play-negated",
                expiresAfterTurns: 1,
              },
            ),
          },
        },
      },
    ],
    [
      // OP09-083 Van Augur: a cost debuff is removal in Black, which pairs it
      // with the K.O.-by-cost clauses the rest of the set prints.
      "OP09-083",
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
                ifBlackbeardLeader(costDebuff(3, "op09-augur-cost")),
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-084 Catarina Devon: three keywords, one of them -- a `choice` is
      // the only node that offers alternatives without letting a player take
      // both.
      "OP09-084",
      {
        oncePerTurn: true,
        program: {
          effect: ifBlackbeardLeader({
            kind: "choice",
            branches: [
              {
                id: "double-attack",
                label: "Gain [Double Attack]",
                effect: {
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Double Attack",
                  expiresAfterTurns: 1,
                },
              },
              {
                id: "banish",
                label: "Gain [Banish]",
                effect: {
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Banish",
                  expiresAfterTurns: 1,
                },
              },
              {
                id: "blocker",
                label: "Gain [Blocker]",
                effect: {
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Blocker",
                  expiresAfterTurns: 1,
                },
              },
            ],
          }),
        },
      },
    ],
    [
      // OP09-089 Stronger: trashes itself and a card for a draw and a cost
      // debuff. Both costs are paid before the Leader gate is read.
      "OP09-089",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op09-stronger-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: SOURCE_BINDING,
                    to: { player: "owner", zone: "trash" },
                  },
                  ifBlackbeardLeader({
                    kind: "sequence",
                    effects: [
                      { kind: "draw", player: "self", count: 1 },
                      costDebuff(2, "op09-stronger-cost-debuff"),
                    ],
                  }),
                ],
              },
            ),
          },
        },
      },
    ],
    [
      // OP09-090 Doc Q: the cheapest repeatable removal in the set.
      "OP09-090",
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
                ifBlackbeardLeader({
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 1,
                  },
                  bind: "op09-doc-q-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op09-doc-q-ko" },
                }),
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-092 Marshall.D.Teach: pays out only from three cards behind, which
      // is what `hand-count-versus`'s margin exists for.
      "OP09-092",
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
                    kind: "hand-count-versus",
                    player: "self",
                    operator: "lt",
                    by: 3,
                  },
                  then: {
                    kind: "sequence",
                    effects: [
                      { kind: "draw", player: "self", count: 2 },
                      {
                        kind: "choose",
                        selector: { player: "self", zone: "hand" },
                        bind: "op09-teach-discard",
                        min: 1,
                        max: 1,
                        effect: {
                          kind: "move",
                          binding: "op09-teach-discard",
                          to: { player: "self", zone: "trash" },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP09-095 Laffitte: a DON!! and the body itself buy the deepest
      // Blackbeard search in the set.
      "OP09-095",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, activeDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                { kind: "rest", binding: SOURCE_BINDING },
                lookAndAdd(5, "op09-laffitte-looked", {
                  type: "Blackbeard Pirates",
                }).effect,
              ],
            },
          },
        },
      },
    ],
  ],
};
