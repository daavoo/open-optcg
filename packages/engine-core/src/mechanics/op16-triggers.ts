/** OP16 `[On K.O.]`, `[Trigger]` and `[End of Your Turn]` programs. */
import { SOURCE_BINDING, type MechanicProgram } from "../mechanics.js";
import { powerEightThousand } from "./op16-shared.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd } from "./shared.js";

/**
 * The Blackbeard Characters whose `[Trigger]` prints "[printed text omitted -- pnpm card:text <card>]".
 *
 * Five of them in OP16, which is the set's whole Yellow plan: bodies that pay
 * off both when they die and when they are dealt as damage. Each shape is
 * written once and registered under both clauses, so the two cannot drift.
 */
const blackbeardLeader = {
  kind: "leader-has-type",
  player: "self",
  type: "Blackbeard Pirates",
} as const;

/**
 * OP16-102 Avalo Pizarro.
 *
 * No category on the selector: every card named Fullalead (OP09-099, OP17-057)
 * is a Stage, so the name is the whole filter.
 */
const pizarroRecursion: MechanicProgram = {
  effect: {
    kind: "sequence",
    effects: [
      { kind: "draw", player: "self", count: 1 },
      {
        kind: "choose",
        selector: {
          player: "self",
          zone: ["hand", "trash"],
          name: "Fullalead",
        },
        bind: "op16-pizarro-play",
        min: 0,
        max: 1,
        effect: { kind: "play", binding: "op16-pizarro-play" },
      },
    ],
  },
};

/** OP16-103 Van Augur. */
const vanAugurRecursion: MechanicProgram = {
  effect: {
    kind: "if",
    condition: blackbeardLeader,
    then: {
      kind: "sequence",
      effects: [
        { kind: "draw", player: "self", count: 1 },
        {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            includeLeader: true,
          },
          bind: "op16-augur-debuff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op16-augur-debuff",
            amount: -3000,
            expiresAfterTurns: 0,
          },
        },
      ],
    },
  },
};

/** OP16-106 Sanjuan.Wolf. */
const sanjuanRecursion: MechanicProgram = {
  effect: {
    kind: "if",
    condition: blackbeardLeader,
    then: {
      kind: "sequence",
      effects: [
        { kind: "draw", player: "self", count: 1 },
        {
          kind: "choose",
          // "up to 1 of your **Leader** or Character cards": the Leader is a
          // legal target and was missing here, which made the clause do nothing
          // at all from an empty board -- exactly the position a Trigger off the
          // last Life card is resolved in. `test/op16-teach.test.ts` pins it.
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
          },
          bind: "op16-sanjuan-set",
          min: 0,
          max: 1,
          effect: {
            kind: "set-base-power",
            binding: "op16-sanjuan-set",
            value: 7000,
            expiresAfterTurns: 0,
          },
        },
      ],
    },
  },
};

/** OP16-109 Doc Q. */
const docQRecursion: MechanicProgram = {
  effect: {
    kind: "if",
    condition: blackbeardLeader,
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
            maxCost: 1,
          },
          bind: "op16-doc-q-ko",
          min: 0,
          max: 2,
          effect: { kind: "knock-out", binding: "op16-doc-q-ko" },
        },
      ],
    },
  },
};

/** OP16-110 Vasco Shot. */
const vascoRecursion: MechanicProgram = {
  effect: {
    kind: "sequence",
    effects: [
      { kind: "draw", player: "self", count: 1 },
      {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxCost: 6,
          canRest: true,
        },
        bind: "op16-vasco-rest",
        min: 0,
        max: 1,
        effect: { kind: "rest", binding: "op16-vasco-rest" },
      },
    ],
  },
};

/**
 * OP16-114 Laffitte: "[printed text omitted -- pnpm card:text OP16-114]", printed again as its `[Trigger]`.
 */
const laffitteKo: MechanicProgram = {
  effect: {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      maxCost: 4,
    },
    bind: "op16-laffitte-ko",
    min: 0,
    max: 1,
    effect: { kind: "knock-out", binding: "op16-laffitte-ko" },
  },
};

/**
 * OP16-118 Portgas.D.Ace: "[printed text omitted -- pnpm card:text OP16-118]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP16-118]"
 *
 * The "or" is a disjunction of identities over one card, which is exactly
 * `anyOf`; the shared `lookAndAdd` takes it as its match filter.
 *
 * `typeIncluding`, not `type`: the printed clause reads "a type including
 * "Whitebeard Pirates"", which also reaches {Whitebeard Pirates Allies}. An
 * exact match dropped OP16-016 Ramba and OP16-017 LittleOars Jr. from the
 * search, and the Red Ace list plays four of the latter.
 */
export const ace118Search: MechanicProgram = lookAndAdd(5, "op16-ace118-look", {
  anyOf: [{ name: "Monkey.D.Luffy" }, { typeIncluding: "Whitebeard Pirates" }],
});

export const op16TriggerMechanics: SetMechanics = {
  onKo: [
    [
      // OP16-013 McGuy: "[printed text omitted -- pnpm card:text OP16-013]" A 6-cost 8000 body that trades up when it
      // dies -- "base power", so DON!! on the target does not save it.
      "OP16-013",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxPower: 8000,
          },
          bind: "op16-mcguy-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op16-mcguy-ko" },
        },
      },
    ],
    [
      // OP16-014 Marco: "[printed text omitted -- pnpm card:text OP16-014]"
      //
      // Marco is in the trash by the time this dispatches, so `SOURCE_BINDING`
      // finds it there -- the same recursion OP17-015 Marco prints one set
      // later. Its printed removal-replacement clause is handled in
      // `removal.ts`, which reaches this program through the ordinary K.O.
      // pipeline.
      "OP16-014",
      {
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
                bind: "op16-marco-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op16-marco-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    { kind: "play", binding: SOURCE_BINDING },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-071 Benevolent King of the Waves: "[printed text omitted -- pnpm card:text OP16-071]" Its `[On Play]` half is in
      // `op16-on-play.ts`; this half is free.
      "OP16-071",
      { effect: { kind: "add-don", player: "self", count: 1, rested: true } },
    ],
    [
      // OP16-074 Magellan: "[printed text omitted -- pnpm card:text OP16-074]" Four, unconditionally -- the reason an
      // opponent thinks twice about answering a 10000-power body at all.
      "OP16-074",
      { effect: { kind: "return-don", player: "opponent", count: 4 } },
    ],
    [
      // OP16-094 Portgas.D.Ace: "[printed text omitted -- pnpm card:text OP16-094]" They choose which, as the rule for anything discarded out
      // of a hand requires.
      "OP16-094",
      {
        effect: {
          kind: "choose",
          selector: { player: "opponent", zone: "hand" },
          bind: "op16-ace-discard",
          min: 2,
          max: 2,
          chooser: "opponent",
          effect: {
            kind: "move",
            binding: "op16-ace-discard",
            to: { player: "opponent", zone: "trash" },
          },
        },
      },
    ],
    [
      // OP16-096 Yamato: "[printed text omitted -- pnpm card:text OP16-096]"
      "OP16-096",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            category: "character",
            name: "Yamato",
            maxCost: 6,
          },
          bind: "op16-yamato096-revive",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op16-yamato096-revive" },
        },
      },
    ],
    [
      // OP16-102 Avalo Pizarro: "[printed text omitted -- pnpm card:text OP16-102]" Shared with its `[Trigger]`, which
      // prints "[printed text omitted -- pnpm card:text OP16-102]".
      "OP16-102",
      pizarroRecursion,
    ],
    [
      // OP16-103 Van Augur: "[printed text omitted -- pnpm card:text OP16-103]"
      // Shared with its `[Trigger]`.
      //
      // The `[Opponent's Turn]` gate is on the `[On K.O.]` only: a Trigger
      // always fires on the opponent's turn by definition, so the same program
      // reads correctly from both.
      "OP16-103",
      vanAugurRecursion,
    ],
    [
      // OP16-106 Sanjuan.Wolf: "[printed text omitted -- pnpm card:text OP16-106]" Shared with its
      // `[Trigger]`.
      "OP16-106",
      sanjuanRecursion,
    ],
    [
      // OP16-107 Jesus Burgess: "[printed text omitted -- pnpm card:text OP16-107]"
      //
      // A gift, and a real cost to them: a card off the top of Life is a card
      // they no longer take damage through, but it is also one fewer Trigger.
      "OP16-107",
      {
        effect: {
          kind: "choose",
          selector: { player: "opponent", zone: "life", position: "top" },
          bind: "op16-burgess-life",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op16-burgess-life",
            to: { player: "opponent", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP16-109 Doc Q: "[printed text omitted -- pnpm card:text OP16-109]" Shared with its `[Trigger]`.
      "OP16-109",
      docQRecursion,
    ],
    [
      // OP16-110 Vasco Shot: "[printed text omitted -- pnpm card:text OP16-110]" Shared with its
      // `[Trigger]`.
      "OP16-110",
      vascoRecursion,
    ],
    [
      // OP16-114 Laffitte: "[printed text omitted -- pnpm card:text OP16-114]" Shared with its `[Trigger]`, which prints
      // "[printed text omitted -- pnpm card:text OP16-114]".
      "OP16-114",
      laffitteKo,
    ],
    [
      // OP16-118 Portgas.D.Ace: the `[On K.O.]` half of "[printed text omitted -- pnpm card:text OP16-118]"Whitebeard
      // Pirates"[printed text omitted -- pnpm card:text OP16-118]" One clause on two timings.
      "OP16-118",
      ace118Search,
    ],
    [
      // OP16-024 Inazuma: untimed text that reads as an `[On K.O.]` scoped to
      // the opponent's effects (`pnpm card:text OP16-024`) -- EB01-057
      // Shirahoshi's shape. `opponentEffectOnly` keeps a lost fight and its
      // controller's own removal from paying out. Any opposing Character may be
      // named; one already rested is a legal choice that changes nothing.
      "OP16-024",
      {
        opponentEffectOnly: true,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op16-inazuma-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op16-inazuma-rest" },
          },
        },
      },
    ],
    [
      // OP16-031 Buggy: "[printed text omitted -- pnpm card:text OP16-031]"
      "OP16-031",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            name: "Prisoner of Impel Down",
          },
          bind: "op16-buggy-prisoner",
          min: 0,
          max: 1,
          effect: { kind: "play", binding: "op16-buggy-prisoner" },
        },
      },
    ],
    [
      // OP16-043 Usopp: "[printed text omitted -- pnpm card:text OP16-043]"
      //
      // The cost is a *Leader or Stage*, which is an unusual pair -- neither is
      // a board Character, so the selector reaches the Stage zone and the Leader
      // together and filters both on the type.
      "OP16-043",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "stage",
                  includeLeader: true,
                  type: "Dressrosa",
                  canRest: true,
                },
                bind: "op16-usopp-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "rest", binding: "op16-usopp-cost" },
                    {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                        maxCost: 5,
                      },
                      bind: "op16-usopp-bounce",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op16-usopp-bounce",
                        to: { player: "opponent", zone: "hand" },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // OP16-030 Trafalgar Law: "[printed text omitted -- pnpm card:text OP16-030]"
      //
      // A whole-board refresh, so `select` at `count: "all"` rather than a
      // choice: the printed text names no target and offers no decline. Law
      // itself costs 8 and is never among them.
      "OP16-030",
      {
        effect: {
          kind: "select",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            color: "Green",
            maxCost: 5,
          },
          bind: "op16-law-refresh",
          count: "all",
          effect: {
            kind: "update",
            binding: "op16-law-refresh",
            rested: false,
          },
        },
      },
    ],
  ],
  trigger: [
    [
      // The five Blackbeard Characters whose `[Trigger]` prints "[printed text omitted -- pnpm card:text <card>]" -- literally the same programs, registered
      // twice each rather than copied.
      "OP16-102",
      pizarroRecursion,
    ],
    ["OP16-103", vanAugurRecursion],
    ["OP16-106", sanjuanRecursion],
    ["OP16-109", docQRecursion],
    ["OP16-110", vascoRecursion],
    ["OP16-114", laffitteKo],
    [
      // OP16-104 Catarina Devon: "[printed text omitted -- pnpm card:text OP16-104]"
      // Its `[When Attacking]` half is in `op16-battle.ts`.
      "OP16-104",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                category: "character",
                type: "Blackbeard Pirates",
                minCost: 1,
                maxCost: 1,
              },
              bind: "op16-devon-revive",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op16-devon-revive" },
            },
          ],
        },
      },
    ],
    [
      // OP16-111 Boa Sandersonia: "[printed text omitted -- pnpm card:text OP16-111]" The Life count is read after this card has left Life,
      // which is what makes "2 or less" reachable.
      "OP16-111",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 2,
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // OP16-113 Boa Marigold: "[printed text omitted -- pnpm card:text OP16-113]" Its conditional [Blocker] is a static layer.
      "OP16-113",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Kuja Pirates",
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // OP16-115 Black Vortex: "[printed text omitted -- pnpm card:text OP16-115]" Far wider than
      // its `[Main]`, and the only clause in the pool that can negate a Leader,
      // which is why `includeLeader` is on the selector.
      "OP16-115",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            includeLeader: true,
          },
          bind: "op16-vortex-negate",
          min: 0,
          max: 1,
          effect: {
            kind: "negate",
            binding: "op16-vortex-negate",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP16-116 Zehahahahaha!: "[printed text omitted -- pnpm card:text OP16-116]"
      "OP16-116",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op16-zehaha-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op16-zehaha-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP16-117 Black Hole: "[printed text omitted -- pnpm card:text OP16-117]"
      "OP16-117",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            type: "Blackbeard Pirates",
          },
          bind: "op16-black-hole-recover",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op16-black-hole-recover",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP16-105 Gecko Moria: "[printed text omitted -- pnpm card:text OP16-105]"
      //
      // Three separate "up to 1"s, one per name, so three choices rather than
      // one at `max: 3`: a trash holding two Absaloms may only give up one.
      "OP16-105",
      {
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
            kind: "sequence",
            effects: (["Absalom", "Dr. Hogback", "Perona"] as const).map(
              (name, index) => ({
                kind: "choose" as const,
                selector: {
                  player: "self" as const,
                  zone: "trash" as const,
                  category: "character",
                  name,
                  maxCost: 4,
                },
                bind: `op16-moria-revive-${index}`,
                min: 0,
                max: 1,
                effect: {
                  kind: "play" as const,
                  binding: `op16-moria-revive-${index}`,
                },
              }),
            ),
          },
        },
      },
    ],
    [
      // OP16-107 Jesus Burgess: "[printed text omitted -- pnpm card:text OP16-107]" A different clause from its `[On K.O.]`, so it is
      // written separately -- and `SOURCE_BINDING` is the only handle on a card
      // resolving out of Life.
      "OP16-107",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op16-burgess-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op16-burgess-cost",
                      to: { player: "self", zone: "trash" },
                    },
                    { kind: "play", binding: SOURCE_BINDING },
                  ],
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP16-108 Shiryu: "[Trigger] Draw 2 cards."
      "OP16-108",
      { effect: { kind: "draw", player: "self", count: 2 } },
    ],
    [
      // OP16-101 Mahoroba: "[printed text omitted -- pnpm card:text OP16-101]"
      "OP16-101",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "trash", name: "Yamato" },
          bind: "op16-mahoroba-recover",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op16-mahoroba-recover",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP16-019 "Let's Show 'Em What We're Made Of!!": "[printed text omitted -- pnpm card:text OP16-019]" A far narrower clause than its
      // 9-cost `[Main]`, so the two are written separately.
      "OP16-019",
      {
        effect: {
          kind: "select",
          selector: { player: "self", zone: [], includeLeader: true },
          bind: "op16-show-em-leader",
          count: "all",
          effect: {
            kind: "modify-power",
            binding: "op16-show-em-leader",
            amount: 1000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP16-039 Gum-Gum Twin Jet Pistol: "[printed text omitted -- pnpm card:text OP16-039]" No choice and no "up to": a Leader that is already rested stays
      // rested, and there is nothing else it could name.
      "OP16-039",
      {
        effect: {
          kind: "select",
          selector: { player: "opponent", zone: [], includeLeader: true },
          bind: "op16-twin-jet-rest",
          count: "all",
          effect: { kind: "rest", binding: "op16-twin-jet-rest" },
        },
      },
    ],
    [
      // OP16-057 "Captain Buggy's Our Savior!!": "[printed text omitted -- pnpm card:text OP16-057]"
      "OP16-057",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op16-savior-discard",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op16-savior-discard",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
  ],
};
