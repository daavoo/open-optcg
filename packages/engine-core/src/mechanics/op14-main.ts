/** OP14 `[Main]` programs: Event cards and `[Activate: Main]` abilities. */
import {
  OWN_CARDS_ZONES,
  SOURCE_BINDING,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAddOrTrash, lookAndAdd } from "./shared.js";
import { costZeroOrEightPlusBody } from "./op14-shared.js";

/**
 * "You may rest N of your cards: <effect>."
 *
 * Green's recurring price, printed on OP14-020's Leader, OP14-029, OP14-036,
 * OP14-037 and OP14-038. "Your cards" is the Leader and the Characters, and the
 * payoff is nested inside the cost's `choose` so a board that cannot pay never
 * reaches it. The rest goes through the `rest` node rather than `update`,
 * because that is what the set's own "when this Character becomes rested"
 * clauses are listening for -- paying this price is meant to switch them on.
 */
const restOwnCards = (count: number, bind: string, effect: MechanicEffect) => ({
  kind: "optional" as const,
  effect: {
    kind: "choose" as const,
    selector: {
      player: "self" as const,
      // "your cards", so the Stage pays as readily as a Character. See
      // `OWN_CARDS_ZONES`.
      zone: OWN_CARDS_ZONES,
      includeLeader: true,
      rested: false,
    },
    bind,
    min: count,
    max: count,
    effect: {
      kind: "sequence" as const,
      effects: [{ kind: "rest" as const, binding: bind }, effect],
    },
  },
});

/**
 * The two Black search Events' `[Main]` programs, exported so their identical
 * `[Trigger]` -- "[printed text omitted -- pnpm card:text <card>]" -- can reference the same
 * program rather than restate it. Keyed by card number for the same reason the
 * registry is.
 */
export const op14EventPrograms: Record<string, MechanicProgram> = {
  // OP14-097 "[printed text omitted -- pnpm card:text OP14-097]": "[printed text omitted -- pnpm card:text OP14-097]"
  "OP14-097": lookAndAddOrTrash(3, "op14-pirate-king", {
    type: "Thriller Bark Pirates",
    excludeName: "Hurry Up and Make Me the Pirate King!",
  }),
  // OP14-099 "Disappointed?": "[printed text omitted -- pnpm card:text OP14-099]"Baroque Works"[printed text omitted -- pnpm card:text OP14-099]"
  "OP14-099": lookAndAddOrTrash(3, "op14-disappointed", {
    typeIncluding: "Baroque Works",
    excludeName: "Disappointed?",
  }),
};

export const op14MainMechanics: SetMechanics = {
  eventMain: [
    [
      // OP14-017 Chambres: "[printed text omitted -- pnpm card:text OP14-017]"
      //
      // Mandatory and aimed across the table: this is removal-adjacent rather
      // than a buff, because it drops the big body to the small one's number
      // for the turn. `maxPower` is printed power, which is what "base power"
      // means before anything modifies it.
      "OP14-017",
      {
        cost: 3,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxPower: 9000,
            },
            bind: "op14-chambres",
            min: 2,
            max: 2,
            effect: {
              kind: "swap-base-power",
              first: "op14-chambres",
              scope: "turn",
            },
          },
        },
      },
    ],
    [
      // OP14-019 "I Have a Plan to Take Down One of the Four Emperors!!":
      // "[printed text omitted -- pnpm card:text OP14-019]"
      "OP14-019",
      {
        cost: 1,
        program: lookAndAdd(4, "op14-plan", {
          category: "character",
          anyOf: [{ type: "Supernovas" }, { type: "Straw Hat Crew" }],
        }),
      },
    ],
    [
      // OP14-037 For Fun: "[printed text omitted -- pnpm card:text OP14-037]"
      "OP14-037",
      {
        cost: 1,
        program: {
          effect: restOwnCards(3, "op14-forfun-cost", {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              rested: true,
              maxPower: 7000,
            },
            bind: "op14-forfun-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op14-forfun-ko" },
          }),
        },
      },
    ],
    [
      // OP14-038 "I Never Bother to Remember the Faces of Trash": "[printed text omitted -- pnpm card:text OP14-038]"
      "OP14-038",
      {
        cost: 1,
        program: {
          effect: restOwnCards(2, "op14-faces-cost", {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxPower: 7000,
                  canRest: true,
                },
                bind: "op14-faces-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "op14-faces-rest" },
              },
            ],
          }),
        },
      },
    ],
    [
      // OP14-057 "Don't Worry!! I'm Here!!": "[printed text omitted -- pnpm card:text OP14-057]"
      //
      // `includeLeader` with an `anyOf` on the types means the Leader is only
      // reached when it carries one of them, which is what the printed
      // "[printed text omitted -- pnpm card:text OP14-057]" says.
      "OP14-057",
      {
        cost: 2,
        program: {
          effect: {
            kind: "select",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
            },
            bind: "op14-dontworry",
            count: "all",
            effect: {
              kind: "modify-power",
              binding: "op14-dontworry",
              amount: 1000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP14-058 Ocean Current Shoulder Throw: "[printed text omitted -- pnpm card:text OP14-058]"
      //
      // `restDon` pays the three as the Event is played, so the cost is taken
      // before anything resolves. "with 6000 base power" is exact, not a
      // ceiling, so the bound is written both ways.
      "OP14-058",
      {
        cost: 2,
        restDon: 3,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  type: "Fish-Man",
                  maxCost: 3,
                },
                bind: "op14-throw-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op14-throw-play" },
              },
              {
                kind: "choice",
                branches: [
                  {
                    id: "theirs",
                    label: "Return 1 of your opponent's 6000-power Characters",
                    effect: {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                        minPower: 6000,
                        maxPower: 6000,
                      },
                      bind: "op14-throw-theirs",
                      min: 1,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op14-throw-theirs",
                        to: { player: "opponent", zone: "hand" },
                      },
                    },
                  },
                  {
                    id: "own",
                    label: "Return 1 of your 6000-power Characters",
                    effect: {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "board",
                        category: "character",
                        minPower: 6000,
                        maxPower: 6000,
                      },
                      bind: "op14-throw-own",
                      min: 1,
                      max: 1,
                      effect: {
                        kind: "move",
                        binding: "op14-throw-own",
                        to: { player: "self", zone: "hand" },
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
    ],
    [
      // OP14-059 "Please Take Me with You!! I Can Be of Great Help to You!!":
      // "[printed text omitted -- pnpm card:text OP14-059]"
      //
      // The hand-size test is read *after* the Event has left the hand to be
      // played, which is how the printed timing works and what makes a 3-card
      // hand the real threshold.
      "OP14-059",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Jinbe",
            },
            then: {
              kind: "if",
              condition: {
                kind: "zone-count",
                player: "self",
                zone: "hand",
                operator: "lte",
                value: 2,
              },
              then: { kind: "draw", player: "self", count: 2 },
            },
          },
        },
      },
    ],
    [
      // OP14-076 Ever White: "[printed text omitted -- pnpm card:text OP14-076]"
      //
      // Two DON!! rested for one added rested: not ramp, but a way to keep the
      // DON!! *count* on the field up while spending it, which is what
      // OP14-068 Trebol and OP14-070 Buffalo read.
      "OP14-076",
      {
        cost: 1,
        restDon: 2,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Donquixote Pirates",
            },
            then: { kind: "add-don", player: "self", count: 1, rested: true },
          },
        },
      },
    ],
    [
      // OP14-096 Ground Death: "[printed text omitted -- pnpm card:text OP14-096]"
      "OP14-096",
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
              maxCost: 5,
            },
            bind: "op14-grounddeath",
            min: 0,
            max: 1,
            effect: {
              kind: "negate",
              binding: "op14-grounddeath",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    ["OP14-097", { cost: 1, program: op14EventPrograms["OP14-097"]! }],
    [
      // OP14-098 Crescent Cutlass: "[printed text omitted -- pnpm card:text OP14-098]"Baroque Works"[printed text omitted -- pnpm card:text OP14-098]"
      "OP14-098",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: costZeroOrEightPlusBody,
            then: {
              kind: "select",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                typeIncluding: "Baroque Works",
              },
              bind: "op14-cutlass",
              count: "all",
              effect: {
                kind: "modify-cost",
                binding: "op14-cutlass",
                amount: 3,
                expiresAfterTurns: 1,
              },
            },
          },
        },
      },
    ],
    ["OP14-099", { cost: 1, program: op14EventPrograms["OP14-099"]! }],
  ],
  activateMain: [
    [
      // OP14-001 Trafalgar Law (Leader): "[printed text omitted -- pnpm card:text OP14-001]"
      //
      // The set's signature clause: a 2000-power body that swaps with a 9000 one
      // attacks as a 9000 and leaves the 9000 as a 2000 that nothing wanted to
      // attack with anyway. Gated on two eligible bodies so the ability is never
      // offered as a no-op -- `choose` with `min: 2` over one card resolves to
      // nothing, and a `[Once Per Turn]` spent on nothing is a real loss.
      "OP14-001",
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
                anyOf: [{ type: "Supernovas" }, { type: "Heart Pirates" }],
              },
              operator: "gte",
              value: 2,
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                anyOf: [{ type: "Supernovas" }, { type: "Heart Pirates" }],
              },
              bind: "op14-law-swap",
              min: 2,
              max: 2,
              effect: {
                kind: "swap-base-power",
                first: "op14-law-swap",
                scope: "turn",
              },
            },
          },
        },
      },
    ],
    [
      // OP14-005 Killer: "[printed text omitted -- pnpm card:text OP14-005]"
      //
      // Rested DON!! is DON!! that has already been spent this turn, so this is
      // the Red package's way of turning a used DON!! back into power -- which
      // is what its "5000 power or more" gates are bought with.
      "OP14-005",
      {
        oncePerTurn: true,
        program: {
          effect: { kind: "give-rested-don", player: "self", count: 1 },
        },
      },
    ],
    [
      // OP14-020 Dracule Mihawk (Leader): "[printed text omitted -- pnpm card:text OP14-020]"
      //
      // The restriction is inside the conditional sentence: no cost-5 body, no
      // DON!! and no lock-out. Green's whole plan is to rest its own board for
      // DON!! and then attack with what is already down, which is why giving up
      // the turn's plays is a price worth paying.
      "OP14-020",
      {
        oncePerTurn: true,
        program: {
          effect: restOwnCards(1, "op14-mihawk-cost", {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "either",
              selector: { zone: "board", category: "character", minCost: 5 },
              operator: "gte",
              value: 1,
            },
            then: {
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
          }),
        },
      },
    ],
    [
      // OP14-029 Tashigi: "[printed text omitted -- pnpm card:text OP14-029]"
      //
      // The buff outlasts the turn, which is what makes it a defensive card:
      // Tashigi is an 8000 body on the turn it is used and on the answer to it.
      "OP14-029",
      {
        oncePerTurn: true,
        program: {
          effect: restOwnCards(2, "op14-tashigi-cost", {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 2000,
            expiresAfterTurns: 1,
          }),
        },
      },
    ],
    [
      // OP14-040 Jinbe (Leader): "[printed text omitted -- pnpm card:text OP14-040]"
      //
      // No `[Once Per Turn]`, so `requires` has to stop it being offered with
      // nothing behind it -- an activation that changes nothing is a legal
      // action a rules agent will take forever. The two halves of that are a
      // card to trash and a rested DON!! to move.
      "OP14-040",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op14-jinbe-leader-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op14-jinbe-leader-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "give-rested-don",
                    player: "self",
                    count: 2,
                    anyOfTypes: ["Fish-Man", "Merfolk"],
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP14-046 Koala: "[printed text omitted -- pnpm card:text OP14-046]"
      //
      // A 0-power body that exists to be spent. The trash comes first, so Koala
      // is not itself a legal target for the buff -- which matters, because it
      // has the {Foolshout Island} type and would not have qualified anyway.
      "OP14-046",
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
                    includeLeader: true,
                    anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
                  },
                  bind: "op14-koala-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op14-koala-buff",
                    amount: 2000,
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
      // OP14-079 Crocodile (Leader): "[printed text omitted -- pnpm card:text OP14-079]"Baroque Works"[printed text omitted -- pnpm card:text OP14-079]"
      //
      // −10 cost is what makes "a cost of 0" a real category: the Leader creates
      // the targets OP14-090 and OP14-094 read. The `if` gate keeps the ability
      // off the table with no Baroque Works body to spend -- and spending one is
      // itself a payoff, because the whole package prints an `[On K.O.]`.
      "OP14-079",
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
                typeIncluding: "Baroque Works",
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  typeIncluding: "Baroque Works",
                },
                bind: "op14-croc-leader-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "knock-out",
                      binding: "op14-croc-leader-cost",
                    },
                    {
                      kind: "choose",
                      selector: {
                        player: "opponent",
                        zone: "board",
                        category: "character",
                      },
                      bind: "op14-croc-leader-cost-down",
                      min: 0,
                      max: 1,
                      effect: {
                        kind: "modify-cost",
                        binding: "op14-croc-leader-cost-down",
                        amount: -10,
                        expiresAfterTurns: 0,
                      },
                    },
                    {
                      kind: "optional",
                      effect: { kind: "trash-top", player: "self", count: 2 },
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
      // OP14-080 Gecko Moria (Leader): "[printed text omitted -- pnpm card:text OP14-080]"
      //
      // The Character it eats is the point rather than the price: every Thriller
      // Bark body in the set prints a Trigger or an [On K.O.] that puts it back.
      "OP14-080",
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
                type: "Thriller Bark Pirates",
              },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  category: "character",
                  type: "Thriller Bark Pirates",
                },
                bind: "op14-moria-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "sequence",
                  effects: [
                    { kind: "knock-out", binding: "op14-moria-cost" },
                    {
                      kind: "select",
                      selector: {
                        player: "self",
                        zone: "board",
                        includeLeader: true,
                      },
                      bind: "op14-moria-buff",
                      count: "all",
                      effect: {
                        kind: "modify-power",
                        binding: "op14-moria-buff",
                        amount: 1000,
                        expiresAfterTurns: 0,
                      },
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
      // OP14-083 Ms. Wednesday: "[printed text omitted -- pnpm card:text OP14-083]"
      //
      // Exact cost 0, which the OP14-079 Leader manufactures; without it this is
      // a 1-cost body with nothing to point at, so it is gated rather than
      // offered as a repeatable no-op.
      "OP14-083",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "opponent",
              selector: { zone: "board", category: "character", maxCost: 0 },
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
                  {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 0,
                    },
                    bind: "op14-wednesday",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "op14-wednesday",
                      amount: -3000,
                      expiresAfterTurns: 0,
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
      // OP14-105 Gorgon Sisters: "[printed text omitted -- pnpm card:text OP14-105]"
      //
      // The cost spends nothing -- the three cards stay in hand and only their
      // identities become public -- which is what makes this repeatable turn
      // after turn off the same hand. The DON!! runs out in board order when
      // there is not enough for everyone, which is what "up to 1 each" means.
      "OP14-105",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: {
            match: {
              anyOf: [{ type: "Amazon Lily" }, { type: "Kuja Pirates" }],
            },
            count: 3,
          },
        },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                anyOf: [{ type: "Amazon Lily" }, { type: "Kuja Pirates" }],
              },
              bind: "op14-gorgon-reveal",
              min: 3,
              max: 3,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "reveal", binding: "op14-gorgon-reveal" },
                  {
                    kind: "attach-don",
                    player: "self",
                    from: "rested",
                    count: 1,
                    target: "leader",
                  },
                  {
                    kind: "select",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                    },
                    bind: "op14-gorgon-board",
                    count: "all",
                    effect: {
                      kind: "attach-don",
                      player: "self",
                      from: "rested",
                      count: 1,
                      target: { binding: "op14-gorgon-board", each: true },
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
      // OP14-114 Ran: "[printed text omitted -- pnpm card:text OP14-114]"
      "OP14-114",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "give-rested-don",
            player: "self",
            count: 1,
            type: "Kuja Pirates",
          },
        },
      },
    ],
  ],
};
