/** OP14 `[On Play]` programs. */
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd, lookAndAddOrTrash } from "./shared.js";
import {
  costZeroOrEightPlusBody,
  opponentLifeToHand,
  topDeckToLife,
} from "./op14-shared.js";

export const op14OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP14-013 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP14-013]"
      //
      // "other than [Monkey.D.Luffy]" is a name exclusion, not a card-number
      // one: every Luffy in the pool answers to it, which is what stops this
      // 0-power body from finding a second copy of itself.
      "OP14-013",
      lookAndAdd(5, "op14-luffy013", {
        type: "Supernovas",
        excludeName: "Monkey.D.Luffy",
      }),
    ],
    [
      // OP14-014 Eustass"Captain"Kid: "[printed text omitted -- pnpm card:text OP14-014]" [Blocker] is printed, so `hasStaticKeyword`
      // reads it off the text.
      "OP14-014",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Supernovas",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              color: "Red",
              maxPower: 2000,
            },
            bind: "op14-kid-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op14-kid-play" },
          },
        },
      },
    ],
    [
      // OP14-024 Kin'emon: "[printed text omitted -- pnpm card:text OP14-024]"
      //
      // The restriction is unconditional and lands even when there was no
      // rested DON!! to set: the printed "Then" is a sequence, not a payoff.
      "OP14-024",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "activate-don", player: "self", count: 3 },
            {
              kind: "restrict-player",
              player: "self",
              restriction: "cannot-play-characters",
              expiresAfterTurns: 0,
            },
          ],
        },
      },
    ],
    [
      // OP14-025 Kuro: "[printed text omitted -- pnpm card:text OP14-025]"
      "OP14-025",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-name", player: "self", name: "Kuro" },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              type: "East Blue",
              maxCost: 6,
            },
            bind: "op14-kuro-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op14-kuro-play" },
          },
        },
      },
    ],
    [
      // OP14-031 Nami: "[printed text omitted -- pnpm card:text OP14-031]"
      //
      // The DON!! comes back *after* the turn's attacks, which is why it is
      // booked rather than paid now -- see `activate-don-at-end-of-turn`.
      "OP14-031",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 8,
                canRest: true,
              },
              bind: "op14-nami-rest",
              min: 0,
              max: 2,
              effect: { kind: "rest", binding: "op14-nami-rest" },
            },
            { kind: "activate-don-at-end-of-turn", player: "self", count: 5 },
          ],
        },
      },
    ],
    [
      // OP14-033 Perona: "[printed text omitted -- pnpm card:text OP14-033]"
      //
      // Green's lock half: a Character that cannot be rested cannot be attacked
      // into by the Leader's own rest effects, and cannot block.
      "OP14-033",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 5,
          },
          bind: "op14-perona033-lock",
          min: 0,
          max: 2,
          effect: {
            kind: "restrict",
            binding: "op14-perona033-lock",
            restriction: "cannot-rest",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP14-039 Coffin Boat (Stage): "[printed text omitted -- pnpm card:text OP14-039]"
      "OP14-039",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Dracule Mihawk",
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP14-042 Arlong: "[printed text omitted -- pnpm card:text OP14-042]"
      //
      // "a card", not a Character: an Event or a Stage at cost 2 is a legal find.
      "OP14-042",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Fish-Man",
          },
          then: lookAndAdd(4, "op14-arlong", { minCost: 2 }).effect,
        },
      },
    ],
    [
      // OP14-043 Aladine: "[printed text omitted -- pnpm card:text OP14-043]"
      "OP14-043",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            maxCost: 3,
            anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
          },
          bind: "op14-aladine-play",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op14-aladine-play" },
        },
      },
    ],
    [
      // OP14-044 Edward.Newgate: "[printed text omitted -- pnpm card:text OP14-044]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP14-044]"
      //
      // The reveal is public and the card stays on the deck -- it is not drawn,
      // and the two cards that follow come off the top *over* it. `look-at`
      // binds it so the condition can name it; `reveal` is what makes the
      // identity public rather than private to the looker.
      "OP14-044",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "look-at", player: "self", count: 1, bind: "op14-wb-top" },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op14-wb-top",
              },
              bind: "op14-wb-show",
              count: "all",
              effect: { kind: "reveal", binding: "op14-wb-show" },
            },
            {
              kind: "if",
              condition: {
                kind: "selector-count",
                player: "self",
                selector: {
                  zone: "deck",
                  binding: "op14-wb-top",
                  typeIncluding: "Whitebeard Pirates",
                },
                operator: "gte",
                value: 1,
              },
              then: {
                kind: "sequence",
                effects: [
                  { kind: "draw", player: "self", count: 2 },
                  {
                    kind: "choose",
                    selector: { player: "self", zone: "hand" },
                    bind: "op14-wb-discard",
                    min: 1,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op14-wb-discard",
                      to: { player: "self", zone: "trash" },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    [
      // OP14-047 Shirahoshi: "[printed text omitted -- pnpm card:text OP14-047]"
      //
      // The draw comes first, so the card drawn is a legal thing to play.
      "OP14-047",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                maxCost: 3,
                anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
              },
              bind: "op14-shirahoshi-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op14-shirahoshi-play" },
            },
          ],
        },
      },
    ],
    [
      // OP14-048 Shiryu: "[printed text omitted -- pnpm card:text OP14-048]"
      //
      // The whole hand, including anything the bounce did not touch -- an
      // 8-cost body that costs the rest of the turn's plays.
      "OP14-048",
      {
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
              bind: "op14-shiryu-bounce",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op14-shiryu-bounce",
                to: { player: "opponent", zone: "hand" },
              },
            },
            {
              kind: "select",
              selector: { player: "self", zone: "hand" },
              bind: "op14-shiryu-dump",
              count: "all",
              effect: {
                kind: "move",
                binding: "op14-shiryu-dump",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP14-049 Jinbe: "[printed text omitted -- pnpm card:text OP14-049]"
      //
      // "1 Character", not "1 of your opponent's": either side is a legal
      // target, which is how this doubles as a way to re-use an [On Play].
      // Gated on having the DON!! so declining and being unable to pay stay
      // different things.
      "OP14-049",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 2,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                { kind: "draw", player: "self", count: 2 },
                {
                  kind: "choice",
                  branches: [
                    {
                      id: "own",
                      label: "Return 1 of your Characters",
                      effect: {
                        kind: "choose",
                        selector: {
                          player: "self",
                          zone: "board",
                          category: "character",
                          maxCost: 7,
                        },
                        bind: "op14-jinbe-own",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "move",
                          binding: "op14-jinbe-own",
                          to: { player: "self", zone: "hand" },
                        },
                      },
                    },
                    {
                      id: "theirs",
                      label: "Return 1 of your opponent's Characters",
                      effect: {
                        kind: "choose",
                        selector: {
                          player: "opponent",
                          zone: "board",
                          category: "character",
                          maxCost: 7,
                        },
                        bind: "op14-jinbe-theirs",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "move",
                          binding: "op14-jinbe-theirs",
                          to: { player: "opponent", zone: "hand" },
                        },
                      },
                    },
                    { id: "none", label: "Return nothing" },
                  ],
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP14-050 Chew: "[printed text omitted -- pnpm card:text OP14-050]"
      "OP14-050",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Fish-Man",
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP14-052 Hannyabal: "[printed text omitted -- pnpm card:text OP14-052]"
      //
      // The payoff is nested inside the cost, so a hand that cannot pay three
      // never reaches the free play -- and the three trashed cards leave before
      // the play is chosen, which is what makes this a real price.
      "OP14-052",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "op14-hannyabal-cost",
            min: 3,
            max: 3,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op14-hannyabal-cost",
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "hand",
                    category: "character",
                    type: "Impel Down",
                    maxCost: 6,
                  },
                  bind: "op14-hannyabal-play",
                  min: 0,
                  max: 1,
                  effect: { kind: "play", binding: "op14-hannyabal-play" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP14-054 Fisher Tiger: "[printed text omitted -- pnpm card:text OP14-054]" Its `[End of Your Turn]` half -- the hand-size
      // ceiling that pays for this -- is registered separately.
      "OP14-054",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Fish-Man",
          },
          then: { kind: "draw", player: "self", count: 3 },
        },
      },
    ],
    [
      // OP14-063 Sugar: "[printed text omitted -- pnpm card:text OP14-063]"
      "OP14-063",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // OP14-069 Donquixote Doflamingo: "[printed text omitted -- pnpm card:text OP14-069]"
      //
      // The Leader gate sits inside the first branch only, which is what the
      // printed bullet says -- the lock half works under any Leader.
      "OP14-069",
      {
        effect: donMinus(3, {
          kind: "choice",
          branches: [
            {
              id: "ko",
              label: "K.O. 1 Character with a cost of 8 or less",
              effect: {
                kind: "if",
                condition: {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Donquixote Pirates",
                },
                then: {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 8,
                  },
                  bind: "op14-doflamingo-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "op14-doflamingo-ko" },
                },
              },
            },
            {
              id: "lock",
              label: "Lock 3 Characters with a cost of 7 or less",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 7,
                },
                bind: "op14-doflamingo-lock",
                min: 0,
                max: 3,
                effect: {
                  kind: "restrict",
                  binding: "op14-doflamingo-lock",
                  restriction: "cannot-rest",
                  expiresAfterTurns: 1,
                },
              },
            },
          ],
        }),
      },
    ],
    [
      // OP14-072 Baby 5: "[printed text omitted -- pnpm card:text OP14-072]" Its `[On K.O.]` half is registered separately.
      "OP14-072",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
    [
      // OP14-074 Monet: "[printed text omitted -- pnpm card:text OP14-074]"
      "OP14-074",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Donquixote Pirates",
          },
          then: { kind: "add-don", player: "self", count: 1, rested: false },
        },
      },
    ],
    [
      // OP14-081 Spider Mice: "[printed text omitted -- pnpm card:text OP14-081]" Black's self-mill, which its own trash-count payoffs read back.
      "OP14-081",
      { effect: { kind: "trash-top", player: "self", count: 3 } },
    ],
    [
      // OP14-084 Ms. All Sunday: "[printed text omitted -- pnpm card:text OP14-084]"Baroque Works"[printed text omitted -- pnpm card:text OP14-084]"Baroque Works"[printed text omitted -- pnpm card:text OP14-084]"Baroque Works"[printed text omitted -- pnpm card:text OP14-084]"
      //
      // Two separate "up to 1"s, resolved one after the other, so the same
      // Character cannot fill both: the first has left the trash by the time
      // the second is chosen. "a cost of 1" is exact, not a ceiling.
      "OP14-084",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-type-including",
            player: "self",
            text: "Baroque Works",
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  typeIncluding: "Baroque Works",
                  maxCost: 4,
                },
                bind: "op14-sunday-four",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op14-sunday-four" },
              },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  typeIncluding: "Baroque Works",
                  minCost: 1,
                  maxCost: 1,
                },
                bind: "op14-sunday-one",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op14-sunday-one" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP14-087 Miss.Valentine(Mikita): "[printed text omitted -- pnpm card:text OP14-087]"Baroque Works"[printed text omitted -- pnpm card:text OP14-087]"Baroque Works"[printed text omitted -- pnpm card:text OP14-087]"
      //
      // Trashing the rest rather than bottoming it is the Black variant, and it
      // feeds the trash-count payoffs the same way OP14-081 does.
      "OP14-087",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-type-including",
            player: "self",
            text: "Baroque Works",
          },
          then: lookAndAddOrTrash(4, "op14-valentine", {
            typeIncluding: "Baroque Works",
            excludeName: "Miss.Valentine(Mikita)",
          }).effect,
        },
      },
    ],
    [
      // OP14-090 Mr.1(Daz.Bonez): "[printed text omitted -- pnpm card:text OP14-090]" Exact cost 0, which the OP14-079 Leader's
      // −10 cost is what produces.
      "OP14-090",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 0,
            canRest: true,
          },
          bind: "op14-mr1-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op14-mr1-rest" },
        },
      },
    ],
    [
      // OP14-094 Mr.5(Gem): "[printed text omitted -- pnpm card:text OP14-094]"
      "OP14-094",
      {
        effect: {
          kind: "if",
          condition: costZeroOrEightPlusBody,
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op14-mr5-discard",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op14-mr5-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP14-103 Gloriosa (Grandma Nyon): "[printed text omitted -- pnpm card:text OP14-103]"
      //
      // "top or bottom" is `position: "edge"`, the same two-ended selection
      // `lifeToHandCost` uses. The card put back goes face-down, as a Life card
      // dealt at setup does. Written out rather than reusing `lifeToHandCost`
      // because the payoff has to see the card the cost just added to the hand:
      // trading a Life card for a Counter and putting the Counter back would be
      // no trade at all, and nesting the payoff inside the cost's `choose` is
      // what lets the same hand hold both.
      "OP14-103",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "life", position: "edge" },
            bind: "op14-gloriosa-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op14-gloriosa-cost",
                  to: { player: "self", zone: "hand" },
                },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op14-gloriosa-back",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op14-gloriosa-back",
                    to: { player: "self", zone: "life", position: "top" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP14-107 Shakuyaku: "[printed text omitted -- pnpm card:text OP14-107]"
      "OP14-107",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "life",
            operator: "lte",
            value: 3,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op14-shakuyaku-discard",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op14-shakuyaku-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP14-112 Boa Hancock: "[printed text omitted -- pnpm card:text OP14-112]"
      //
      // Both halves sit under the one Leader gate: the printed "Then" continues
      // the same conditional sentence.
      "OP14-112",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "The Seven Warlords of the Sea",
          },
          then: {
            kind: "sequence",
            effects: [topDeckToLife, opponentLifeToHand],
          },
        },
      },
    ],
    [
      // OP14-113 Marguerite: "[printed text omitted -- pnpm card:text OP14-113]"
      //
      // The hand discard is mandatory and comes after the search, so the card
      // just found is a legal thing to throw away.
      "OP14-113",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "op14-marguerite", {
              anyOf: [{ type: "Amazon Lily" }, { type: "Kuja Pirates" }],
            }).effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op14-marguerite-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op14-marguerite-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP14-120 Crocodile: "[printed text omitted -- pnpm card:text OP14-120]"
      //
      // The draw's gate says "your opponent has", so unlike the shared
      // `costZeroOrEightPlusBody` it reads one side of the table only.
      "OP14-120",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 9,
              },
              bind: "op14-croc-lock",
              min: 0,
              max: 1,
              effect: {
                kind: "restrict",
                binding: "op14-croc-lock",
                restriction: "cannot-attack",
                expiresAfterTurns: 1,
              },
            },
            {
              kind: "if",
              condition: {
                kind: "any-of",
                conditions: [
                  {
                    kind: "selector-count",
                    player: "opponent",
                    selector: {
                      zone: "board",
                      category: "character",
                      maxCost: 0,
                    },
                    operator: "gte",
                    value: 1,
                  },
                  {
                    kind: "selector-count",
                    player: "opponent",
                    selector: {
                      zone: "board",
                      category: "character",
                      minCost: 8,
                    },
                    operator: "gte",
                    value: 1,
                  },
                ],
              },
              then: { kind: "draw", player: "self", count: 1 },
            },
          ],
        },
      },
    ],
  ],
};
