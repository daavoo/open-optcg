/**
 * OP13 `[Main]` Events and `[Activate: Main]` abilities.
 */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { anyGivenDon, addRestedDon, trashAtLeast } from "./op13-shared.js";
import { turnLifeFaceUp } from "./op11-shared.js";
import { lookAndAdd, lookAndAddOrTrash } from "./shared.js";

/** "If your Leader is [Imu]" -- the Black Mary Geoise deck's gate. */
const imuLeader = {
  kind: "leader-has-name",
  player: "self",
  name: "Imu",
} as const;

/** "Up to 1 of your [X] cards gains +N power during this turn." */
const buffNamed = (
  name: string,
  amount: number,
  bind: string,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "board", includeLeader: true, name },
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
 * The `[Main]` programs of the OP13 Events whose `[Trigger]` reads "[printed text omitted -- pnpm card:text <card>]".
 */
export const op13EventPrograms: Record<string, MechanicProgram> = {
  // OP13-020 Meteor Fist: "[printed text omitted -- pnpm card:text OP13-020]"
  "OP13-020": {
    effect: {
      kind: "choose",
      selector: { player: "opponent", zone: "board", category: "character" },
      bind: "op13-meteor-debuff",
      min: 0,
      max: 1,
      effect: {
        kind: "modify-power",
        binding: "op13-meteor-debuff",
        amount: -5_000,
        expiresAfterTurns: 0,
      },
    },
  },
  // OP13-096 "[printed text omitted -- pnpm card:text OP13-096]": "[printed text omitted -- pnpm card:text OP13-096]"
  "OP13-096": lookAndAddOrTrash(3, "op13-elders-look", {
    type: "Celestial Dragons",
    excludeName: "The Five Elders Are at Your Service!!!",
  }),
  // OP13-116 "The One Who Is the Most Free Is the Pirate King!!!": "[printed text omitted -- pnpm card:text OP13-116]"
  //
  // Both halves: the `[Trigger]` reads "activate this card's [Main] effect",
  // and `eventMain` below points at this same program for the `[Main]`.
  "OP13-116": lookAndAdd(5, "op13-pirate-king-look", {
    type: "Supernovas",
    category: "character",
  }),
};

export const op13MainMechanics: SetMechanics = {
  activateMain: [
    [
      // OP13-081 Koala: `pnpm card:text OP13-081`.
      //
      // Migrated off the hand-written activation register, which offered one
      // action per (trash card x recipient) pair -- a board of five bodies and
      // a ten-card trash was sixty actions for one clause. Both halves are
      // choices now, asked one at a time.
      //
      // The trash card is the cost, so the gift is nested inside its `choose`:
      // an empty trash buys nothing rather than paying out for free. Its
      // static "+3 cost under a {Revolutionary Army} Leader" is a printed
      // layer and lives in `static-abilities.ts`.
      "OP13-081",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "trash" },
              bind: "op13-koala-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op13-koala-cost",
                    to: { player: "self", zone: "deck", position: "bottom" },
                  },
                  { kind: "give-rested-don", player: "self", count: 1 },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP13-015 Makino: "[printed text omitted -- pnpm card:text OP13-015]"
      //
      // "Cards", so the Leader is a legal target -- and behind the OP13-001 Leader
      // it usually is.
      "OP13-015",
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
                buffNamed("Monkey.D.Luffy", 2_000, "op13-makino-buff"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP13-022 Windmill Village (Stage): "[printed text omitted -- pnpm card:text OP13-022]"
      "OP13-022",
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
                    maxPower: 2_000,
                  },
                  bind: "op13-windmill-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op13-windmill-buff",
                    amount: 1_000,
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
      // OP13-026 Sunny-Kun: "[printed text omitted -- pnpm card:text OP13-026]"
      //
      // The buff outlives the turn, so a 1-cost body defends at 4000 on the way
      // back -- which is what a rested DON!! buys in a deck that sets its own
      // DON!! active again.
      "OP13-026",
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
                {
                  kind: "modify-power",
                  binding: SOURCE_BINDING,
                  amount: 2_000,
                  expiresAfterTurns: 1,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP13-079 Imu (Leader): "[printed text omitted -- pnpm card:text OP13-079]"
      //
      // Two ways to pay for the same card, and the Black deck wants both: a body
      // in the trash is what its own "7 or more cards in your trash" immunities
      // read. The rest of the Leader's text is not an activation: the Event cost
      // bar is a deck-construction rule (`deckEventCostLimit`, enforced in
      // `packages/decks`), and the Stage played at the start of the game is
      // setup (`openingStageType`, played by `createGame`).
      "OP13-079",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: ["board", "hand"],
                anyOf: [
                  { zone: "board", type: "Celestial Dragons" },
                  { zone: "hand" },
                ],
              },
              bind: "op13-imu-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op13-imu-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  { kind: "draw", player: "self", count: 1 },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP13-082 Five Elders: "[printed text omitted -- pnpm card:text OP13-082]"
      //
      // The whole board is spent and rebuilt: the Characters that go to the trash
      // are what the play draws from, which is why the two halves are one clause.
      // "Different card names" is `distinctNames`, and "with 5000 power" is exact
      // -- both bounds -- so the 12000 body playing this cannot bring itself back.
      "OP13-082",
      {
        oncePerTurn: false,
        requires: { activeDon: 1, handCards: 1 },
        program: {
          effect: {
            kind: "if",
            condition: imuLeader,
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op13-elders-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "rest-don", player: "self", count: 1 },
                    {
                      kind: "move",
                      binding: "op13-elders-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "board",
                        category: "character",
                      },
                      bind: "op13-elders-wipe",
                      count: "all",
                      effect: {
                        kind: "move",
                        binding: "op13-elders-wipe",
                        to: { player: "self", zone: "trash" },
                      },
                    },
                    {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "trash",
                        category: "character",
                        type: "Five Elders",
                        minPower: 5_000,
                        maxPower: 5_000,
                      },
                      bind: "op13-elders-revive",
                      min: 0,
                      max: 5,
                      distinctNames: true,
                      effect: { kind: "play", binding: "op13-elders-revive" },
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
      // OP13-099 The Empty Throne (Stage): "[printed text omitted -- pnpm card:text OP13-099]"
      //
      // The ceiling is the DON!! *count*, not what is unspent, so the play is free
      // -- see `maxCostFromFieldDon`. Its own "[Your Turn] +1000 to your Leader at
      // 19 cards in the trash" half is a static ability.
      "OP13-099",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, activeDon: 3 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                { kind: "rest-don", player: "self", count: 3 },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    category: "character",
                    color: "Black",
                    type: "Five Elders",
                    maxCostFromFieldDon: "self",
                  },
                  bind: "op13-throne-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op13-throne-play" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP13-102 Edison: "[printed text omitted -- pnpm card:text OP13-102]"
      //
      // Only the draw is behind the Life comparison; the rest is not, which is
      // what the sentence break says. Its `[Trigger]` is the same pair without the
      // gate.
      "OP13-102",
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
                  kind: "if",
                  condition: {
                    kind: "life-versus",
                    player: "self",
                    operator: "lte",
                  },
                  then: { kind: "draw", player: "self", count: 1 },
                },
                restOpponentUpToCost(3, "op13-edison-rest"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP13-120 Sabo: "[printed text omitted -- pnpm card:text OP13-120]"
      //
      // +2 cost is protection from "cost N or less" removal, and it lasts through
      // the turn that removal would come on.
      "OP13-120",
      {
        oncePerTurn: true,
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
                bind: "op13-sabo-cost",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-cost",
                  binding: "op13-sabo-cost",
                  amount: 2,
                  expiresAfterTurns: 1,
                },
              },
              {
                kind: "attach-don",
                player: "self",
                from: "rested",
                count: 1,
                target: "leader",
              },
            ],
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // OP13-019 But Ace Here Said You Deserved It!! (1): `pnpm card:text OP13-019`.
      //
      // Migrated off the hand-written `[Main]` Event register. The debuff and the K.O. are two
      // separate "up to 1" choices, and the second reads power *after* the
      // first landed -- which is what `maxCurrentPower` asks and what made the
      // imperative `reduce-power` carry an `afterKoPowerAtMost` field to chain
      // the two.
      "OP13-019",
      {
        cost: 1,
        restDon: 4,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "op13-ace-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op13-ace-debuff",
                  amount: -3000,
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCurrentPower: 3000,
                },
                bind: "op13-ace-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "op13-ace-ko" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP13-021 Gum-Gum Gatling Gun (1): `pnpm card:text OP13-021`.
      //
      // Migrated off the hand-written `[Main]` Event register. The gift half names "[Monkey.D.Luffy]"
      // cards, which is the Leader as well as the board -- so it is
      // `give-rested-don`, whose offer already spans both, rather than a
      // `choose` feeding `attach-don`: that node's binding lookup searches the
      // board only, so a Leader picked for it would be paid nothing.
      "OP13-021",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "give-rested-don",
                player: "self",
                count: 1,
                name: "Monkey.D.Luffy",
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "op13-gatling-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op13-gatling-debuff",
                  amount: -2000,
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP13-040 I Know You're Strong... So I'll Go All Out from the Very
      // Start!!! (1): `pnpm card:text OP13-040`.
      //
      // Migrated off the hand-written `[Main]` Event register. `expiresAfterTurns: 1` is the
      // imperative `expiresAtTurn: state.turn + 1` -- the restriction has to
      // outlive this turn to reach the opponent's next Refresh Phase, which is
      // the whole clause.
      "OP13-040",
      {
        cost: 1,
        restDon: 2,
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
            bind: "op13-all-out",
            min: 0,
            max: 2,
            effect: {
              kind: "restrict",
              binding: "op13-all-out",
              restriction: "cannot-refresh",
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // OP13-116 The One Who Is the Most Free Is the Pirate King!!! (1):
      // `pnpm card:text OP13-116`.
      //
      // The `[Main]` half, which used to build a `search-top-five` pending
      // effect by hand from a row in the hand-written Event register. It is
      // the same program the `[Trigger]` has always run -- the Trigger reads
      // "activate this card's [Main] effect" -- so the two now share one entry
      // rather than one declarative and one imperative reading of the same
      // sentence.
      "OP13-116",
      { cost: 1, program: op13EventPrograms["OP13-116"]! },
    ],
    [
      // OP13-020 Meteor Fist (3), whose `[Trigger]` activates the same clause.
      "OP13-020",
      { cost: 3, program: op13EventPrograms["OP13-020"]! },
    ],
    [
      // OP13-038 Gum-Gum Elephant Gun (2): "[printed text omitted -- pnpm card:text OP13-038]"
      //
      // The DON!! comes back after the turn's spending, which is what makes a
      // 2-cost Event cost nothing in practice.
      "OP13-038",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              restOpponentUpToCost(5, "op13-elephant-rest"),
              { kind: "activate-don-at-end-of-turn", player: "self", count: 2 },
            ],
          },
        },
      },
    ],
    [
      // OP13-057 "If I Bowed Down to Power, What's the Point in Living?" (1):
      // "[printed text omitted -- pnpm card:text OP13-057]"
      //
      // "Your opponent cannot activate [Blocker] when your Leader attacks" is
      // [Unblockable] on the Leader: activating a Blocker is the only way to
      // block, so the two readings are the same board. Its `[Counter]` half is in
      // `op13-battle.ts`.
      "OP13-057",
      {
        cost: 1,
        restDon: 1,
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
              kind: "select",
              selector: { player: "self", zone: [], includeLeader: true },
              bind: "op13-bowed-leader",
              count: "all",
              effect: {
                kind: "grant-keyword",
                binding: "op13-bowed-leader",
                keyword: "Unblockable",
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP13-058 Phoenix Pyreapple (1): "[printed text omitted -- pnpm card:text OP13-058]"
      "OP13-058",
      {
        cost: 1,
        restDon: 1,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 3_000,
            },
            bind: "op13-pyreapple-bury",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op13-pyreapple-bury",
              to: { player: "owner", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
    [
      // OP13-059 Brilliant Punk (4): "[printed text omitted -- pnpm card:text OP13-059]"
      //
      // The cost is one of the controller's own bodies -- which in the Blue
      // Whitebeard deck is a way to replay an [On Play] rather than a loss.
      "OP13-059",
      {
        cost: 4,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
              },
              bind: "op13-punk-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op13-punk-cost",
                    to: { player: "owner", zone: "hand" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "either",
                      zone: "board",
                      category: "character",
                      maxCost: 6,
                    },
                    bind: "op13-punk-bounce",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op13-punk-bounce",
                      to: { player: "owner", zone: "hand" },
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
      // OP13-075 "Guess We'll Have Another Scrap..." (1): "[printed text omitted -- pnpm card:text OP13-075]"
      "OP13-075",
      {
        cost: 1,
        restDon: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                {
                  kind: "leader-has-name",
                  player: "self",
                  name: "Gol.D.Roger",
                },
                anyGivenDon,
              ],
            },
            then: addRestedDon,
          },
        },
      },
    ],
    [
      // OP13-077 "Go All the Way to the Top!!" (1): "[printed text omitted -- pnpm card:text OP13-077]"
      //
      // Two removals for one card, at two different printed-power ceilings -- so
      // two `choose`s rather than one with a count of two.
      "OP13-077",
      {
        cost: 1,
        restDon: 3,
        program: {
          effect: {
            kind: "if",
            condition: anyGivenDon,
            then: {
              kind: "sequence",
              effects: [
                koOpponentMaxPower(4_000, "op13-top-ko-four"),
                koOpponentMaxPower(3_000, "op13-top-ko-three"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP13-096 "[printed text omitted -- pnpm card:text OP13-096]" (1), whose `[Trigger]`
      // activates the same clause.
      "OP13-096",
      { cost: 1, program: op13EventPrograms["OP13-096"]! },
    ],
    [
      // OP13-097 "The World's Equilibrium Cannot Be Maintained Forever" (1):
      // "[printed text omitted -- pnpm card:text OP13-097]"
      //
      // Five rested DON!! for a 6-cost removal on a 1-cost Event, and the price of
      // the discount is playing nothing off-type -- see `every-character-matches`.
      "OP13-097",
      {
        cost: 1,
        restDon: 5,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "every-character-matches",
              player: "self",
              selector: { zone: "board", type: "Celestial Dragons" },
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxBaseCost: 6,
              },
              bind: "op13-equilibrium-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op13-equilibrium-ko" },
            },
          },
        },
      },
    ],
    [
      // OP13-098 "Never Existed... in the First Place..." (1): "[printed text omitted -- pnpm card:text OP13-098]"
      //
      // The only Stage removal in the set, and it names one cost exactly -- both
      // bounds. Its `[Counter]` half is in `op13-battle.ts`.
      "OP13-098",
      {
        cost: 1,
        restDon: 1,
        program: {
          effect: {
            kind: "if",
            condition: imuLeader,
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "stage",
                minBaseCost: 7,
                maxBaseCost: 7,
              },
              bind: "op13-never-existed",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op13-never-existed" },
            },
          },
        },
      },
    ],
    [
      // OP13-117 Gum-Gum Dawn Stamp (5): "[printed text omitted -- pnpm card:text OP13-117]"
      //
      // Information for removal, which is Yellow's trade: the opponent learns what
      // is under their next attack and loses a body for it.
      "OP13-117",
      {
        cost: 5,
        program: turnLifeFaceUp("op13-dawn-stamp-cost", {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxBaseCost: 6,
          },
          bind: "op13-dawn-stamp-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op13-dawn-stamp-ko" },
        }),
      },
    ],
  ],
};

/** "Rest up to 1 of your opponent's Characters with a cost of N or less." */
function restOpponentUpToCost(cost: number, bind: string): MechanicEffect {
  return {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      maxCost: cost,
      canRest: true,
    },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "rest", binding: bind },
  };
}

/** "K.O. up to 1 of your opponent's Characters with N base power or less." */
function koOpponentMaxPower(power: number, bind: string): MechanicEffect {
  return {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      maxPower: power,
    },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "knock-out", binding: bind },
  };
}

export { koOpponentMaxPower, restOpponentUpToCost, trashAtLeast };
