/**
 * OP11 `[Main]` Events and `[Activate: Main]` abilities.
 */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  grantAttackActive,
  opponentPlacesAtBottom,
  turnLifeFaceDown,
  turnLifeFaceUp,
} from "./op11-shared.js";
import {
  donMinus,
  guessDeckTopCost,
  lookAndAdd,
  lookAndAddOrTrash,
  payFromHand,
} from "./shared.js";

/** "If your Leader has the {Fish-Man} or {Merfolk} type" -- Green's gate. */
const fishManOrMerfolkLeader = {
  kind: "any-of",
  conditions: [
    { kind: "leader-has-type", player: "self", type: "Fish-Man" },
    { kind: "leader-has-type", player: "self", type: "Merfolk" },
  ],
} as const;

/** "If your Leader is [Shirahoshi]" -- the Yellow package's gate. */
const shirahoshiLeader = {
  kind: "leader-has-name",
  player: "self",
  name: "Shirahoshi",
} as const;

/**
 * The `[Main]` programs of the OP11 Events whose `[Trigger]` reads "[printed text omitted -- pnpm card:text <card>]", so `op11-triggers.ts` points at the same program.
 */
export const op11EventPrograms: Record<string, MechanicProgram> = {
  // OP11-060 "Let's Crash This Wedding!!!": "[printed text omitted -- pnpm card:text OP11-060]"
  "OP11-060": {
    effect: {
      kind: "if",
      condition: { kind: "leader-multicolored", player: "self" },
      then: lookAndAdd(5, "op11-wedding-look", {
        type: "Straw Hat Crew",
        excludeName: "Let's Crash This Wedding!!!",
      }).effect,
    },
  },
  // OP11-099 "[printed text omitted -- pnpm card:text OP11-099]": "[printed text omitted -- pnpm card:text OP11-099]"
  "OP11-099": lookAndAddOrTrash(3, "op11-officer-look", {
    type: "Navy",
    excludeName: "I'm Gonna Be a Navy Officer!!!",
  }),
  // OP11-075 Jaguar.D.Saul's `[Trigger]` reads "[printed text omitted -- pnpm card:text OP11-075]", which is the same shape one clause deeper: the program lives with
  // the [On Play] in `op11-on-play.ts` and the Trigger points at it.
};

export const op11MainMechanics: SetMechanics = {
  activateMain: [
    [
      // OP11-066 Charlotte Oven: `pnpm card:text OP11-066`.
      //
      // Migrated off the hand-written activation register. The guess is the
      // same eleven-branch `choice` the rest of Big Mom's package already uses;
      // the DON!! at the end is outside the `if`, because the printed "Then,
      // add up to 1 DON!! card ... and rest it" is paid whether or not the
      // guess landed.
      "OP11-066",
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
                guessDeckTopCost({
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxBaseCost: 3,
                  },
                  bind: "op11-oven-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op11-oven-ko" },
                }),
                { kind: "add-don", player: "self", count: 1, rested: true },
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-071 Charlotte Perospero: `pnpm card:text OP11-071`.
      //
      // Migrated off the hand-written activation register. The trash is a cost,
      // so the payoff is nested inside it -- `payFromHand` -- and an empty hand
      // buys nothing rather than getting the guess for free.
      "OP11-071",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op11-perospero-cost",
              1,
              guessDeckTopCost({
                kind: "sequence",
                effects: [
                  { kind: "draw", player: "self", count: 1 },
                  { kind: "add-don", player: "self", count: 1, rested: false },
                ],
              }),
            ),
          },
        },
      },
    ],
    [
      // OP11-004 Kujyaku: "[printed text omitted -- pnpm card:text OP11-004]" Its `[On Play]`
      // search is in `op11-on-play.ts`.
      "OP11-004",
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
                    player: "self",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op11-kujyaku-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op11-kujyaku-buff",
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
      // OP11-007 Tashigi: "[printed text omitted -- pnpm card:text OP11-007]"
      "OP11-007",
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
                    kind: "leader-has-type",
                    player: "self",
                    type: "Navy",
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      type: "Navy",
                    },
                    bind: "op11-tashigi-buff",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "op11-tashigi-buff",
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
      // OP11-014 Borsalino: "[printed text omitted -- pnpm card:text OP11-014]"
      //
      // The Navy/SWORD package's whole plan: an active Blocker is normally safe,
      // and this is what reaches it.
      "OP11-014",
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
                grantAttackActive("op11-borsalino-target", {
                  type: "Navy",
                  includeLeader: true,
                }),
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-016 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP11-016]"
      //
      // `restedDon: 1` keeps the once-per-turn use from being spent with nothing
      // rested to give.
      "OP11-016",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: { kind: "give-rested-don", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP11-022 Shirahoshi (Leader): "[printed text omitted -- pnpm card:text OP11-022]"
      //
      // A Leader that cannot attack (the printed sentence is read straight off
      // the text by `canAttack`) and develops instead. The cost ceiling is the
      // DON!! count rather than what is left unspent, so the play is free -- see
      // `maxCostFromFieldDon`.
      "OP11-022",
      {
        oncePerTurn: true,
        requires: { activeDon: 1 },
        program: turnLifeFaceUp("op11-shirahoshi-cost", {
          kind: "sequence",
          effects: [
            { kind: "rest-don", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                anyOf: [{ type: "Neptunian" }, { name: "Megalo" }],
                maxCostFromFieldDon: "self",
              },
              bind: "op11-shirahoshi-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op11-shirahoshi-play" },
            },
          ],
        }),
      },
    ],
    [
      // OP11-030 Shirahoshi: "[printed text omitted -- pnpm card:text OP11-030]"
      "OP11-030",
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
                lookAndAdd(5, "op11-shirahoshi-look", {
                  anyOf: [{ type: "Neptunian" }, { type: "Fish-Man Island" }],
                }).effect,
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-031 Jinbe: "[printed text omitted -- pnpm card:text OP11-031]"
      //
      // That sentence is [Rush: Character], granted rather than printed.
      "OP11-031",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
            },
            bind: "op11-jinbe-rush",
            min: 0,
            max: 1,
            effect: {
              kind: "grant-keyword",
              binding: "op11-jinbe-rush",
              keyword: "Rush: Character",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP11-034 Hatchan: "[printed text omitted -- pnpm card:text OP11-034]"
      //
      // "Cannot be rested" is removal that leaves the body on the field: a
      // Character that cannot rest cannot declare an attack and cannot block --
      // see `canAttack` and `canBlock`, which read the same flag.
      "OP11-034",
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
                  condition: fishManOrMerfolkLeader,
                  then: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 3,
                    },
                    bind: "op11-hatchan-lock",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "restrict",
                      binding: "op11-hatchan-lock",
                      restriction: "cannot-rest",
                      expiresAfterTurns: 1,
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
      // OP11-044 Vinsmoke Judge: "[printed text omitted -- pnpm card:text OP11-044]"
      //
      // "All of", so no choice: `select` with `count: "all"` takes every match at
      // once.
      "OP11-044",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op11-judge-cost",
              1,
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "GERMA 66",
                },
                bind: "op11-judge-buff",
                count: "all",
                effect: {
                  kind: "modify-power",
                  binding: "op11-judge-buff",
                  amount: 1_000,
                  expiresAfterTurns: 0,
                },
              },
            ),
          },
        },
      },
    ],
    [
      // OP11-070 Charlotte Pudding: "[printed text omitted -- pnpm card:text OP11-070]"
      //
      // Information, and Purple's guessing package is what pays it out: knowing
      // the top card is what makes OP11-074's guess a certainty.
      "OP11-070",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, fieldDon: 1 },
        program: {
          effect: donMinus(1, {
            kind: "sequence",
            effects: [
              { kind: "rest", binding: SOURCE_BINDING },
              {
                kind: "look-at",
                player: "opponent",
                count: 1,
                bind: "op11-pudding-peek",
              },
            ],
          }),
        },
      },
    ],
    [
      // OP11-072 Charlotte Mont-d'or: "[printed text omitted -- pnpm card:text OP11-072]"
      "OP11-072",
      {
        oncePerTurn: true,
        requires: { sourceActive: true, fieldDon: 1 },
        program: {
          effect: donMinus(1, {
            kind: "sequence",
            effects: [
              { kind: "rest", binding: SOURCE_BINDING },
              opponentPlacesAtBottom({ zone: "trash" }, 2, "op11-montdor-bury"),
              {
                kind: "select",
                selector: { player: "self", zone: "life", position: "top" },
                bind: "op11-montdor-life",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "op11-montdor-life",
                  to: { player: "self", zone: "hand" },
                },
              },
            ],
          }),
        },
      },
    ],
    [
      // OP11-074 Streusen: "[printed text omitted -- pnpm card:text OP11-074]"
      //
      // The guess is a `choice` of eleven branches -- see `guessDeckTopCost`.
      "OP11-074",
      {
        oncePerTurn: true,
        requires: { sourceActive: true, fieldDon: 1 },
        program: {
          effect: donMinus(1, {
            kind: "sequence",
            effects: [
              { kind: "rest", binding: SOURCE_BINDING },
              guessDeckTopCost({
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 4,
                  canRest: true,
                },
                bind: "op11-streusen-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "op11-streusen-rest" },
              }),
            ],
          }),
        },
      },
    ],
    [
      // OP11-082 Aramaki: "[printed text omitted -- pnpm card:text OP11-082]"
      "OP11-082",
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
                    kind: "leader-has-type",
                    player: "self",
                    type: "Navy",
                  },
                  then: grantAttackActive("op11-aramaki-target", {
                    type: "Navy",
                  }),
                },
                { kind: "trash-top", player: "self", count: 2 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-086 Coribou: "[printed text omitted -- pnpm card:text OP11-086]"
      //
      // Coribou is in the trash by the time the play runs, and it is not a
      // [Caribou], so no exclusion is needed: the name filter does the work.
      "OP11-086",
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
                    player: "self",
                    zone: "trash",
                    name: "Caribou",
                    maxCost: 4,
                  },
                  bind: "op11-coribou-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op11-coribou-play" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-103 Long-Jaw Neptunian: "[printed text omitted -- pnpm card:text OP11-103]"
      "OP11-103",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "if",
            condition: shirahoshiLeader,
            then: turnLifeFaceDown("op11-longjaw-cost", {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 3,
                  },
                  bind: "op11-longjaw-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op11-longjaw-ko" },
                },
              ],
            }).effect,
          },
        },
      },
    ],
    [
      // OP11-107 Topknot Neptunian: "[printed text omitted -- pnpm card:text OP11-107]"
      //
      // A Blocker that blocks on the opponent's turn and is active again for the
      // next one -- booked against itself through `at-end-of-turn`, because
      // nothing on the card does it *now*.
      "OP11-107",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: shirahoshiLeader,
            then: turnLifeFaceDown("op11-topknot-cost", {
              kind: "at-end-of-turn",
              binding: SOURCE_BINDING,
              action: "set-active",
            }).effect,
          },
        },
      },
    ],
    [
      // OP11-117 Fish-Man Island (Stage): "[printed text omitted -- pnpm card:text OP11-117]"
      //
      // Face-*up*, unlike the Characters in the package: this Stage is what puts
      // a Trigger back on show for the Leader's own cost to spend again.
      "OP11-117",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: shirahoshiLeader,
            then: turnLifeFaceUp("op11-island-cost", {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                anyOf: [
                  { type: "Neptunian" },
                  { type: "Fish-Man" },
                  { type: "Merfolk" },
                ],
              },
              bind: "op11-island-buff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op11-island-buff",
                amount: 1_000,
                expiresAfterTurns: 0,
              },
            }).effect,
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // OP11-081 Cognac Mama-Mash (6): `pnpm card:text OP11-081`.
      //
      // Migrated off the hand-written `[Main]` Event register, where the guess was the imperative
      // `st34-guess-cost` pending effect with a `"cognac"` outcome tag. The
      // reading is the same one the rest of Big Mom's guessing package already
      // uses declaratively -- eleven branches, the reveal inside each of them
      // so the card is not public before the guess is made.
      //
      // `maxBaseCost`, matching the branch this replaces, which read the
      // printed cost off the card database.
      "OP11-081",
      {
        cost: 6,
        program: {
          effect: guessDeckTopCost({
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxBaseCost: 8,
            },
            bind: "op11-cognac-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op11-cognac-ko" },
          }),
        },
      },
    ],
    [
      // OP11-061 Gum-Gum Jet Culverin (3): `pnpm card:text OP11-061`.
      //
      // Migrated off the hand-written `[Main]` Event register. `maxBaseCost`, not `maxCost`: the
      // branch this replaces read the printed cost off the card database
      // rather than the effective one, so a Character an aura has made more
      // expensive is still in range.
      "OP11-061",
      {
        cost: 3,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxBaseCost: 4,
            },
            bind: "op11-culverin",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op11-culverin",
              to: { player: "owner", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
    [
      // OP11-018 Honesty Impact (6): "[printed text omitted -- pnpm card:text OP11-018]"
      //
      // The debuff feeds the K.O.: "6000 power or less" is current power, so a
      // 10000 body that has just taken −4000 is in range. That is the whole card.
      "OP11-018",
      {
        cost: 6,
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
                bind: "op11-honesty-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op11-honesty-debuff",
                  amount: -4_000,
                  expiresAfterTurns: 0,
                },
              },
              koCurrentPowerAtMost(6_000, "op11-honesty-ko"),
            ],
          },
        },
      },
    ],
    [
      // OP11-037 Ancient Weapon Poseidon (1): "[printed text omitted -- pnpm card:text OP11-037]"
      "OP11-037",
      {
        cost: 1,
        program: lookAndAdd(4, "op11-poseidon-look", {
          category: "character",
          anyOf: [{ type: "Neptunian" }, { type: "Fish-Man Island" }],
        }),
      },
    ],
    [
      // OP11-038 Gum-Gum Elephant Gatling (1): "[printed text omitted -- pnpm card:text OP11-038]" Its `[Counter]` half is in `op11-battle.ts`.
      "OP11-038",
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
              maxCost: 5,
              canRest: true,
            },
            bind: "op11-gatling-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op11-gatling-rest" },
          },
        },
      },
    ],
    [
      // OP11-060 "Let's Crash This Wedding!!!" (1), whose `[Trigger]` activates
      // the same clause.
      "OP11-060",
      { cost: 1, program: op11EventPrograms["OP11-060"]! },
    ],
    [
      // OP11-080 Gear Two (1): "[printed text omitted -- pnpm card:text OP11-080]" Its `[Counter]` half is in `op11-battle.ts`.
      //
      // Two rested for one added *rested*: a net loss this turn and net neutral
      // from the next Refresh, which only a Leader that pays blue is allowed to
      // take at all.
      "OP11-080",
      {
        cost: 1,
        restDon: 2,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-color",
              player: "self",
              color: "Blue",
            },
            then: { kind: "add-don", player: "self", count: 1, rested: true },
          },
        },
      },
    ],
    [
      // OP11-098 Blue Hole (3): "[printed text omitted -- pnpm card:text OP11-098]"
      //
      // The cost is the deck rather than the hand, which is Black's currency: the
      // trash it fills is what OP11-097 and OP11-119 read back.
      "OP11-098",
      {
        cost: 3,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "trash-top", player: "self", count: 3 },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 2,
                  },
                  bind: "op11-blue-hole-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op11-blue-hole-ko" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-099 "[printed text omitted -- pnpm card:text OP11-099]" (1), whose `[Trigger]` activates
      // the same clause.
      "OP11-099",
      { cost: 1, program: op11EventPrograms["OP11-099"]! },
    ],
    [
      // OP11-114 Gum-Gum Fire-Fist Pistol Red Hawk (1): "[printed text omitted -- pnpm card:text OP11-114]" Its `[Counter]` half is in `op11-battle.ts`.
      //
      // Early removal: the combined-Life gate closes as the game goes, which is
      // the opposite of every other Yellow clause in the set.
      "OP11-114",
      {
        cost: 1,
        restDon: 3,
        program: {
          effect: {
            kind: "if",
            condition: { kind: "combined-life", operator: "gte", value: 5 },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxBaseCost: 5,
              },
              bind: "op11-red-hawk-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op11-red-hawk-ko" },
            },
          },
        },
      },
    ],
    [
      // OP11-116 Merman Combat Ultramarine (6): "[printed text omitted -- pnpm card:text OP11-116]"
      //
      // Removal that is also a gift: the Character leaves the field but becomes a
      // Life card for its own owner, so pointing it at your own body is a way to
      // buy Life. Face-up, so a `[Trigger]` on it is public.
      "OP11-116",
      {
        cost: 6,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "either",
              zone: "board",
              category: "character",
              maxCost: 6,
            },
            bind: "op11-ultramarine",
            min: 0,
            max: 1,
            effect: {
              kind: "choice",
              branches: [
                {
                  id: "top",
                  label: "Add it to the top of the owner's Life cards",
                  effect: {
                    kind: "move",
                    binding: "op11-ultramarine",
                    to: { player: "owner", zone: "life", position: "top" },
                    faceUp: true,
                  },
                },
                {
                  id: "bottom",
                  label: "Add it to the bottom of the owner's Life cards",
                  effect: {
                    kind: "move",
                    binding: "op11-ultramarine",
                    to: { player: "owner", zone: "life", position: "bottom" },
                    faceUp: true,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
};

/** "K.O. up to 1 of your opponent's Characters with N power or less." */
function koCurrentPowerAtMost(power: number, bind: string): MechanicEffect {
  return {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      maxCurrentPower: power,
    },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "knock-out", binding: bind },
  };
}
