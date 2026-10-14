/** OP16 `[Activate: Main]` programs and `[Main]` Events. */
import { SOURCE_BINDING } from "../mechanics.js";
import { donMinus } from "./shared.js";
import { powerEightThousand } from "./op16-shared.js";
import { type SetMechanics } from "./registry.js";

export const op16MainMechanics: SetMechanics = {
  activateMain: [
    [
      // OP16-022 Monkey.D.Luffy (Leader): `pnpm card:text OP16-022`.
      //
      // Migrated off the hand-written activation register, and off a
      // once-per-turn key of its own (`<turn>:<player>:OP16-022`) onto the one
      // every other activation uses. `every-character-matches` is the printed
      // "if the only Characters on your field are {Impel Down}", and it is
      // vacuously true on an empty board -- the same answer `board.every` gave.
      "OP16-022",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "every-character-matches",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                type: "Impel Down",
              },
            },
            then: { kind: "activate-don", player: "self", count: 2 },
          },
        },
      },
    ],
    [
      // OP16-056 Mr.3(Galdino): `pnpm card:text OP16-056`.
      //
      // Migrated off the hand-written activation register. The draw is not
      // conditional on a target existing, so it is a plain sequence: trash
      // itself, draw two, then the "up to 1" that may find nothing.
      "OP16-056",
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
                { kind: "draw", player: "self", count: 2 },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 9,
                  },
                  bind: "op16-mr3-lock",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "restrict",
                    binding: "op16-mr3-lock",
                    restriction: "cannot-attack",
                    expiresAfterTurns: 1,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-001 Portgas.D.Ace (Leader): "[printed text omitted -- pnpm card:text OP16-001]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP16-001]"
      //
      // One grant, two ways to qualify -- and the second carries a power floor
      // the first does not, which `anyOf` cannot express (it is a disjunction of
      // identities, not of whole filters). A `choice` between two branches is
      // the faithful reading: the player picks which half they are using, and
      // only one Character ever gains [Rush].
      //
      // `typeIncluding`, not `type`: "a type including "Whitebeard Pirates""
      // also reaches {Whitebeard Pirates Allies}, and the Red Ace list plays
      // two of them at exactly 8000 -- OP16-016 Ramba and OP16-017 LittleOars
      // Jr. An exact match silently dropped both from the one clause the whole
      // deck is built around.
      "OP16-001",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "choice",
            branches: [
              {
                id: "luffy",
                label: "Give a [Monkey.D.Luffy] Character [Rush]",
                effect: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    name: "Monkey.D.Luffy",
                  },
                  bind: "op16-ace-rush-luffy",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "grant-keyword",
                    binding: "op16-ace-rush-luffy",
                    keyword: "Rush",
                    expiresAfterTurns: 0,
                  },
                },
              },
              {
                id: "whitebeard",
                label:
                  "Give a Whitebeard Pirates Character with 8000 power or more [Rush]",
                effect: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    typeIncluding: "Whitebeard Pirates",
                    minCurrentPower: 8000,
                  },
                  bind: "op16-ace-rush-wb",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "grant-keyword",
                    binding: "op16-ace-rush-wb",
                    keyword: "Rush",
                    expiresAfterTurns: 0,
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-060 Sengoku (Leader): "[printed text omitted -- pnpm card:text OP16-060]"
      //
      // The whole turn, spent at once: eight DON!! back for three free bodies.
      // `distinctNames` is what enforces the printed "different card names" --
      // the set prints exactly three Admirals, so this is a one-shot payoff for
      // holding all of them.
      "OP16-060",
      {
        oncePerTurn: false,
        requires: { activeDon: 8 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 8 },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    category: "character",
                    type: "Admiral",
                  },
                  bind: "op16-sengoku-play",
                  min: 0,
                  max: 3,
                  distinctNames: true,
                  effect: { kind: "play", binding: "op16-sengoku-play" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-021 Moby Dick: "[printed text omitted -- pnpm card:text OP16-021]" Its
      // `[On Play]` half is in `op16-on-play.ts`.
      "OP16-021",
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
                { kind: "give-rested-don", player: "self", count: 1 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-063 Kuzan: "[printed text omitted -- pnpm card:text OP16-063]"
      //
      // Not a keyword removal: the Character still reads as a Blocker
      // everywhere, it simply may not be declared as one this turn. `canBlock`
      // is where that distinction lives.
      "OP16-063",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: donMinus(1, {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op16-kuzan-silence",
            min: 0,
            max: 1,
            effect: {
              kind: "restrict",
              binding: "op16-kuzan-silence",
              restriction: "cannot-block",
              expiresAfterTurns: 0,
            },
          }),
        },
      },
    ],
    [
      // OP16-078 Marineford: "[printed text omitted -- pnpm card:text OP16-078]" Its `[On Play]`
      // search is in `op16-on-play.ts`.
      "OP16-078",
      {
        oncePerTurn: false,
        requires: { fieldDon: 1, sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 1 },
                { kind: "rest", binding: SOURCE_BINDING },
                { kind: "draw", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op16-marineford-discard",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op16-marineford-discard",
                    to: { player: "self", zone: "trash" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-081 Otama: "[printed text omitted -- pnpm card:text OP16-081]"
      "OP16-081",
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
                    kind: "selector-count",
                    player: "self",
                    selector: {
                      zone: "board",
                      category: "character",
                      minCost: 8,
                    },
                    operator: "gte",
                    value: 1,
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                    },
                    bind: "op16-otama-debuff",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "op16-otama-debuff",
                      amount: -2000,
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
      // OP16-084 Kouzuki Momonosuke: "[printed text omitted -- pnpm card:text OP16-084]"
      //
      // The cost-20 clause is a condition on the *source*, and this 5-cost body
      // only reaches it through OP16-087 Shinobu's +20. `source-cost` is the
      // only way to ask: no selector can be pinned to one instance.
      //
      // Trashing itself is the whole cost, so a rested Momonosuke pays it as
      // well as an active one.
      "OP16-084",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: { kind: "source-cost", operator: "gte", value: 20 },
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
                  {
                    kind: "if",
                    condition: {
                      kind: "field-don",
                      player: "self",
                      operator: "gte",
                      value: 9,
                    },
                    then: {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "trash",
                        category: "character",
                        name: "Kouzuki Momonosuke",
                        minCost: 9,
                        maxCost: 9,
                      },
                      bind: "op16-momo084-revive",
                      min: 0,
                      max: 1,
                      effect: { kind: "play", binding: "op16-momo084-revive" },
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
      // OP16-094 Portgas.D.Ace: "[printed text omitted -- pnpm card:text OP16-094]" Its `[On K.O.]` half is in `op16-triggers.ts`.
      "OP16-094",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 1,
            type: "Land of Wano",
          },
        },
      },
    ],
    [
      // OP16-098 Yamato: "[printed text omitted -- pnpm card:text OP16-098]" Its `[On Play]`
      // half is in `op16-on-play.ts`.
      //
      // "A cost of 8" is exact, and both 8-cost Yamatos are black, so the colour
      // filter is redundant today and printed anyway -- it is what stops a
      // future off-colour Yamato being reached.
      //
      // Trashing itself is the whole cost, so a Yamato that has already
      // attacked can still make the swap -- the line the deck is built on,
      // since the 8-cost it plays arrives with [Rush] off OP16-079 and swings
      // again.
      "OP16-098",
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
                    category: "character",
                    name: "Yamato",
                    color: "Black",
                    minCost: 8,
                    maxCost: 8,
                  },
                  bind: "op16-yamato098-revive",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op16-yamato098-revive" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-047 Donquixote Doflamingo: "[printed text omitted -- pnpm card:text OP16-047]"
      //
      // The cards leave the opponent's hand, so the opponent picks them --
      // `chooser: "opponent"`, resolved one at a time, which is what "in any
      // order" means once they are placed one after another.
      "OP16-047",
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
                    kind: "zone-count",
                    player: "opponent",
                    zone: "hand",
                    operator: "gte",
                    value: 8,
                  },
                  then: {
                    kind: "choose",
                    selector: { player: "opponent", zone: "hand" },
                    bind: "op16-doflamingo-bury",
                    min: 2,
                    max: 2,
                    chooser: "opponent",
                    effect: {
                      kind: "move",
                      binding: "op16-doflamingo-bury",
                      to: {
                        player: "opponent",
                        zone: "deck",
                        position: "bottom",
                      },
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
      // OP16-049 Portgas.D.Ace: "[printed text omitted -- pnpm card:text OP16-049]" A 0-power body that turns itself into a card, once per
      // Refresh Phase rather than once per turn -- resting is the whole limit.
      "OP16-049",
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
              ],
            },
          },
        },
      },
    ],
    [
      // OP16-052 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP16-052]"
      "OP16-052",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: { kind: "give-rested-don", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP16-065 Sakazuki: "[printed text omitted -- pnpm card:text OP16-065]"
      //
      // Net +1 active DON!! per turn under a Navy Leader, which is what the
      // whole Purple Navy shell is built to spend. Its `[On Play]` half is in
      // `op16-on-play.ts`.
      "OP16-065",
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
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Navy",
                  },
                  then: {
                    kind: "add-don",
                    player: "self",
                    count: 2,
                    rested: false,
                  },
                },
              ],
            },
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // OP16-038 Let's Go!! To the Navy Headquarters!! (1):
      // `pnpm card:text OP16-038`.
      //
      // Migrated off the hand-written `[Main]` Event register, where the "five differently named"
      // gate was a hand-written `Set` over board names in the register's
      // `requires`. `distinctNames` on `selector-count` is that reading in the
      // DSL, and as the program's outermost `if` it is also what withholds the
      // offer -- the same place `bareGateCondition` looks, so a board that
      // cannot pay never sees the Event on the table.
      "OP16-038",
      {
        cost: 1,
        restDon: 6,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                category: "character",
                type: "Impel Down",
              },
              operator: "gte",
              value: 5,
              distinctNames: true,
            },
            then: {
              kind: "select",
              selector: { player: "self", zone: "board", includeLeader: true },
              bind: "op16-headquarters",
              count: "all",
              effect: {
                kind: "update",
                binding: "op16-headquarters",
                rested: false,
              },
            },
          },
        },
      },
    ],
    [
      // OP16-058 "The Prisoners Are Rioting!!": "[printed text omitted -- pnpm card:text OP16-058]"
      //
      // "All", so `select` at `count: "all"` rather than a choice, and
      // "becomes", so `set-base-power` rather than a modifier -- a 2000-power
      // Prisoner and a 4000-power one both end at 7000 rather than gaining the
      // same delta.
      "OP16-058",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "field-don",
              player: "self",
              operator: "gte",
              value: 10,
            },
            then: {
              kind: "select",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                name: "Prisoner of Impel Down",
              },
              bind: "op16-riot-set",
              count: "all",
              effect: {
                kind: "set-base-power",
                binding: "op16-riot-set",
                value: 7000,
                expiresAfterTurns: 0,
              },
            },
          },
        },
      },
    ],
    [
      // OP16-115 Black Vortex: "[printed text omitted -- pnpm card:text OP16-115]"
      //
      // The self-exclusion matters: Black Vortex prints its own Trigger, so
      // without it the Event would recur itself forever.
      "OP16-115",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Blackbeard Pirates",
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                hasTrigger: true,
                excludeName: "Black Vortex",
              },
              bind: "op16-vortex-recover",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op16-vortex-recover",
                to: { player: "self", zone: "hand" },
              },
            },
          },
        },
      },
    ],
    [
      // OP16-116 Zehahahahaha!: "[printed text omitted -- pnpm card:text OP16-116]"
      //
      // The second sentence is outside the DON!! check -- the printed "Then"
      // starts a new sentence after the conditional one closes -- so an 8-cost
      // Event cast below 10 DON!! still strips a Life card.
      "OP16-116",
      {
        cost: 8,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "if",
                condition: {
                  kind: "field-don",
                  player: "self",
                  operator: "gte",
                  value: 10,
                },
                then: {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    category: "character",
                    name: "Marshall.D.Teach",
                  },
                  bind: "op16-zehaha-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op16-zehaha-play" },
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "life",
                  position: "top",
                },
                bind: "op16-zehaha-life",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op16-zehaha-life",
                  to: { player: "opponent", zone: "hand" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-117 Black Hole: "[printed text omitted -- pnpm card:text OP16-117]"
      //
      // The cost is specifically a Trigger card, which is what Yellow's own
      // shell is full of -- `hasTrigger` on the selector is that gate, and
      // `trashFromHand` cannot express it, so the offer relies on the `min: 1`
      // choose resolving to nothing when the hand holds none.
      "OP16-117",
      {
        cost: 2,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    hasTrigger: true,
                  },
                  bind: "op16-black-hole-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "move",
                        binding: "op16-black-hole-cost",
                        to: { player: "self", zone: "trash" },
                      },
                      {
                        kind: "choose",
                        selector: {
                          player: "opponent",
                          zone: "board",
                          category: "character",
                          maxCost: 8,
                        },
                        bind: "op16-black-hole-negate",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "negate",
                          binding: "op16-black-hole-negate",
                          expiresAfterTurns: 0,
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
      // OP16-019 "Let's Show 'Em What We're Made Of!!": "[printed text omitted -- pnpm card:text OP16-019]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP16-019]"
      //
      // The 9-cost payoff the whole reveal shell is holding those Characters
      // for: two of them at once, free. `max: 2` on one choice, because the
      // printed "up to 2" is a single decision.
      "OP16-019",
      {
        cost: 9,
        program: {
          effect: {
            kind: "choose",
            selector: {
              ...powerEightThousand,
              player: "self",
              zone: "hand",
              type: "Whitebeard Pirates",
            },
            bind: "op16-show-em-play",
            min: 0,
            max: 2,
            effect: { kind: "play", binding: "op16-show-em-play" },
          },
        },
      },
    ],
    [
      // OP16-076 "The Three Admirals!!": "[printed text omitted -- pnpm card:text OP16-076]"
      //
      // Three targets on one choice, because the printed "up to 3" is a single
      // decision -- and the set only prints three Admirals, so this is the
      // payoff for assembling all of them.
      "OP16-076",
      {
        cost: 1,
        restDon: 3,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "Admiral",
            },
            bind: "op16-admirals-buff",
            min: 0,
            max: 3,
            effect: {
              kind: "modify-power",
              binding: "op16-admirals-buff",
              amount: 2000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP16-077 "Buddha" Sengoku: "[printed text omitted -- pnpm card:text OP16-077]"
      //
      // Two matches rather than one, so the shared `lookAndAdd` does not fit;
      // the discard afterwards is mandatory and can spend one of the two just
      // found.
      "OP16-077",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "look-at",
                player: "self",
                count: 5,
                bind: "op16-buddha-look",
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op16-buddha-look",
                  type: "Navy",
                },
                bind: "op16-buddha-add",
                min: 0,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op16-buddha-add",
                  to: { player: "self", zone: "hand" },
                },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op16-buddha-look",
                },
                bind: "op16-buddha-rest",
                count: "all",
                effect: {
                  kind: "move",
                  binding: "op16-buddha-rest",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
              },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op16-buddha-discard",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op16-buddha-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-099 "I've Come Here... To Cut Those Chains!!!": "[printed text omitted -- pnpm card:text OP16-099]"
      //
      // The mill comes first, so the five cards it buries are themselves
      // eligible -- which is the point of pairing them.
      "OP16-099",
      {
        cost: 1,
        restDon: 6,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "trash-top", player: "self", count: 5 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  type: "Land of Wano",
                  maxCost: 6,
                },
                bind: "op16-chains-revive",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op16-chains-revive" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-100 Hallowed Glacier Slash: "[printed text omitted -- pnpm card:text OP16-100]"
      //
      // A second attack with the Leader, for two rested DON!! and a K.O. already
      // banked -- which is why the condition is about what has *happened* this
      // turn rather than about the board. Its `[Counter]` half is registered in
      // `op16-battle.ts`.
      "OP16-100",
      {
        cost: 1,
        restDon: 2,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "character-koed-this-turn",
              player: "opponent",
            },
            then: {
              kind: "if",
              condition: {
                kind: "leader-has-name",
                player: "self",
                name: "Yamato",
              },
              then: {
                kind: "select",
                selector: { player: "self", zone: [], includeLeader: true },
                bind: "op16-glacier-leader",
                count: "all",
                effect: {
                  kind: "update",
                  binding: "op16-glacier-leader",
                  rested: false,
                },
              },
            },
          },
        },
      },
    ],
    [
      // OP16-101 Mahoroba: "[printed text omitted -- pnpm card:text OP16-101]"
      "OP16-101",
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
                  includeLeader: true,
                },
                bind: "op16-mahoroba-buff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op16-mahoroba-buff",
                  amount: 3000,
                  expiresAfterTurns: 0,
                },
              },
              {
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
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 2,
                  },
                  bind: "op16-mahoroba-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op16-mahoroba-ko" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-020 "If You're Coming with Me... Kiss Your Lives Goodbye!!":
      // "[printed text omitted -- pnpm card:text OP16-020]"
      //
      // A 0-cost Event, so `restDon` is its whole price -- declared here rather
      // than only in the program so the offer can check it is payable.
      "OP16-020",
      {
        cost: 0,
        restDon: 1,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: {
                    ...powerEightThousand,
                    player: "self",
                    zone: "hand",
                  },
                  bind: "op16-goodbye-reveal",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      { kind: "reveal", binding: "op16-goodbye-reveal" },
                      { kind: "draw", player: "self", count: 1 },
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
      // OP16-039 Gum-Gum Twin Jet Pistol: "[printed text omitted -- pnpm card:text OP16-039]"
      //
      // "Cards", so a [Monkey.D.Luffy] *Leader* is an eligible target too --
      // `includeLeader` -- which is the line the Impel Down shell is built
      // around. The second sentence has its own Leader condition and is not
      // gated on the first landing.
      "OP16-039",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  includeLeader: true,
                  name: "Monkey.D.Luffy",
                },
                bind: "op16-twin-jet-grant",
                min: 0,
                max: 1,
                effect: {
                  kind: "grant-keyword",
                  binding: "op16-twin-jet-grant",
                  keyword: "Double Attack",
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "if",
                condition: {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Impel Down",
                },
                then: {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 3,
                    canRest: true,
                  },
                  bind: "op16-twin-jet-rest-targets",
                  min: 0,
                  max: 2,
                  effect: {
                    kind: "rest",
                    binding: "op16-twin-jet-rest-targets",
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-040 Gum-Gum Hammer Rifle: "[printed text omitted -- pnpm card:text OP16-040]"
      //
      // Two separate name checks rather than one `anyOf`, because one Character
      // cannot be both and `anyOf` would let a pair of Luffys satisfy it.
      // Each reads the Leader too: a Luffy Leader with a Mr.3 Character meets
      // it, and Bandai's OP-17 Q&A has a Leader treated as having all card
      // names meet both halves on its own -- which `name`'s `hasCardName` read
      // gives each check separately.
      "OP16-040",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: {
                zone: "board",
                includeLeader: true,
                name: "Monkey.D.Luffy",
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: {
                  zone: "board",
                  includeLeader: true,
                  name: "Mr.3(Galdino)",
                },
                operator: "gte",
                value: 1,
              },
              then: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  rested: true,
                  maxCost: 6,
                },
                bind: "op16-hammer-lock",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "op16-hammer-lock",
                  restriction: "cannot-refresh",
                  expiresAfterTurns: 1,
                },
              },
            },
          },
        },
      },
    ],
    [
      // OP16-059 "We'll Change This Mission from Sneaky to Flashy!": "[printed text omitted -- pnpm card:text OP16-059]"
      //
      // Not a `lookAndAdd`: the cards found are *played*, not added to hand, so
      // the middle step binds off the look and plays rather than moves. Seven
      // rested DON!! on top of the Event's own cost makes this the turn's whole
      // action, which is why it is allowed to put two bodies down for free.
      "OP16-059",
      {
        cost: 1,
        restDon: 7,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "look-at",
                player: "self",
                count: 5,
                bind: "op16-flashy-look",
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op16-flashy-look",
                  category: "character",
                  type: "Impel Down",
                  maxPower: 6000,
                },
                bind: "op16-flashy-play",
                min: 0,
                max: 2,
                effect: { kind: "play", binding: "op16-flashy-play" },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op16-flashy-look",
                },
                bind: "op16-flashy-rest",
                count: "all",
                effect: {
                  kind: "move",
                  binding: "op16-flashy-rest",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
              },
            ],
          },
        },
      },
    ],
  ],
};
