/**
 * OP12 `[Main]` Events and `[Activate: Main]` abilities.
 */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { revealTwoEvents } from "./op12-shared.js";
import { giveDonToRayleigh } from "./shared.js";
import { lookAndAdd, lookAndAddOrTrash } from "./shared.js";

/** "Give up to 2 rested DON!! cards to your Leader or 1 of your Characters." */
const giveTwoRestedDon: MechanicEffect = {
  kind: "give-rested-don",
  player: "self",
  count: 2,
};

/**
 * The `[Main]` programs of the OP12 Events whose `[Trigger]` reads "[printed text omitted -- pnpm card:text <card>]".
 */
export const op12EventPrograms: Record<string, MechanicProgram> = {
  // OP12-097 "Captains Assembled": "[printed text omitted -- pnpm card:text OP12-097]"
  "OP12-097": lookAndAddOrTrash(3, "op12-captains-look", {
    type: "Revolutionary Army",
    excludeName: "Captains Assembled",
  }),
};

export const op12MainMechanics: SetMechanics = {
  activateMain: [
    [
      // OP12-020 Roronoa Zoro (Leader): `pnpm card:text OP12-020`.
      //
      // Migrated off the hand-written activation register, and off two
      // once-per-turn keys of its own. The `[DON!! x3]` is
      // `source-attached-don` -- which reads a Leader's pile, not a board
      // entry -- and "if this Leader battles your opponent's Character during
      // this turn" is `leader-battled-character`, the note `resolveBattle`
      // leaves for any Leader that does.
      //
      // `sourceRested` is the gate the register carried and the text does not:
      // setting an active Leader active does nothing, and taking the offer
      // would still spend the turn's use *and* the attack restriction the
      // clause charges for.
      //
      // That restriction is a `restrict-player` rather than a `restrict` on the
      // Leader: `restrict` writes its flag onto a `BoardCard`, and a Leader has
      // none.
      "OP12-020",
      {
        oncePerTurn: true,
        requires: { sourceRested: true },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "source-attached-don", operator: "gte", value: 3 },
                { kind: "leader-battled-character", player: "self" },
              ],
            },
            then: {
              kind: "sequence",
              effects: [
                {
                  kind: "select",
                  selector: {
                    player: "self",
                    zone: [],
                    includeLeader: true,
                  },
                  bind: "op12-zoro-leader",
                  count: "all",
                  effect: {
                    kind: "update",
                    binding: "op12-zoro-leader",
                    rested: false,
                  },
                },
                {
                  kind: "restrict-player",
                  player: "self",
                  restriction: "leader-cannot-attack-characters",
                  maxBaseCost: 7,
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-026 Kuina: `pnpm card:text OP12-026`.
      //
      // Migrated off the hand-written activation register.
      //
      // Two readings the branch this replaces had drifted on: the rest names a
      // *base* cost of 4 or less, where the branch filtered on the effective
      // one, and the DON!! goes to a "[Roronoa Zoro] Leader", where the branch
      // paid whatever Leader was there. Both are now what the card prints.
      //
      // `attach-don` at the Leader rather than `give-rested-don`: the text
      // names one recipient, and `give-rested-don` would offer the board as
      // well.
      "OP12-026",
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
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxBaseCost: 4,
                    rested: false,
                    canRest: true,
                  },
                  bind: "op12-kuina-rest",
                  min: 0,
                  max: 1,
                  effect: { kind: "rest", binding: "op12-kuina-rest" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-name",
                    player: "self",
                    name: "Roronoa Zoro",
                  },
                  then: {
                    kind: "attach-don",
                    player: "self",
                    from: "rested",
                    count: 3,
                    target: "leader",
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-028 Kouzuki Hiyori: `pnpm card:text OP12-028`.
      //
      // Migrated off the hand-written activation register. The Leader gate is
      // outermost, which is both what the sentence says and what withholds the
      // offer: without [Roronoa Zoro] the whole clause resolves to nothing, and
      // a rest of the Character and a DON!! would be spent on it.
      //
      // The search's disjunction is the printed one -- a <Slash> card or a
      // green Event -- where the branch this replaces hardcoded the single
      // green Event the deck happens to run (OP12-039).
      "OP12-028",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, activeDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Roronoa Zoro",
            },
            then: {
              // No `optional` around the body, though the text reads "you
              // may": the gate has to be the program's outermost node for
              // `bareGateCondition` to withhold the offer, and
              // `alreadyOptedIn` unwraps only an `optional` that *is* the whole
              // program. Wrapping the body would ask "apply?" the instant the
              // player clicks the activation -- a question with no new
              // information behind it, and one the branch this replaces never
              // asked. Clicking the activation is the yes.
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                { kind: "rest", binding: SOURCE_BINDING },
                lookAndAdd(5, "op12-hiyori-look", {
                  anyOf: [
                    { attribute: "Slash" },
                    { category: "event", color: "Green" },
                  ],
                }).effect,
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-046 Zephyr(Navy): `pnpm card:text OP12-046`.
      //
      // Migrated off the hand-written activation register, which offered one
      // action per legal target and so put the choice in the `optionId`. It is
      // a `choose` now, and the trash happens first -- the card is paying for
      // itself, and once it is in the trash it cannot be the Character it
      // returns.
      //
      // The outermost `if` is what the register's per-target loop did
      // implicitly: with nothing in range there was no action at all, and the
      // Character was never trashed for a bounce that could not happen.
      "OP12-046",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "either",
              selector: {
                zone: "board",
                category: "character",
                maxCost: 5,
                excludeSource: true,
              },
              operator: "gte",
              value: 1,
            },
            then: {
              // No `optional` around the body, though the text reads "you
              // may": the gate has to be the program's outermost node for
              // `bareGateCondition` to withhold the offer, and
              // `alreadyOptedIn` unwraps only an `optional` that *is* the whole
              // program. Wrapping the body would ask "apply?" the instant the
              // player clicks the activation -- a question with no new
              // information behind it, and one the branch this replaces never
              // asked. Clicking the activation is the yes.
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
                    player: "either",
                    zone: "board",
                    category: "character",
                    maxCost: 5,
                  },
                  bind: "op12-zephyr",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op12-zephyr",
                    to: { player: "owner", zone: "hand" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-001 Silvers Rayleigh (Leader): "[printed text omitted -- pnpm card:text OP12-001]"
      //
      // The deckbuilding restriction printed above it is enforced by
      // `validateDeck` through `deckCostLimit`, not here: it is a rule about a
      // deck list rather than about a game.
      "OP12-001",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: { match: { category: "event" }, count: 2 },
        },
        program: revealTwoEvents("op12-rayleigh-reveal", {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            maxPower: 4_000,
          },
          bind: "op12-rayleigh-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op12-rayleigh-buff",
            amount: 2_000,
            expiresAfterTurns: 0,
          },
        }),
      },
    ],
    [
      // OP12-004 Kouzuki Oden: "[printed text omitted -- pnpm card:text OP12-004]"
      "OP12-004",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: { match: { category: "event" }, count: 2 },
        },
        program: revealTwoEvents("op12-oden-reveal", {
          kind: "modify-power",
          binding: SOURCE_BINDING,
          amount: 2_000,
          expiresAfterTurns: 0,
        }),
      },
    ],
    [
      // OP12-013 Hatchan: "[printed text omitted -- pnpm card:text OP12-013]"
      "OP12-013",
      {
        oncePerTurn: false,
        requires: {
          sourceActive: true,
          restedDon: 1,
          handCardsMatching: { match: { category: "event" }, count: 2 },
        },
        program: revealTwoEvents("op12-hatchan-reveal", {
          kind: "sequence",
          effects: [
            { kind: "rest", binding: SOURCE_BINDING },
            giveTwoRestedDon,
          ],
        }),
      },
    ],
    [
      // OP12-014 Boa Hancock: "[printed text omitted -- pnpm card:text OP12-014]" Its
      // `[On Play]` search is in `op12-on-play.ts`.
      "OP12-014",
      {
        oncePerTurn: false,
        requires: { restedDon: 1 },
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
                giveTwoRestedDon,
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-022 Inuarashi: "[printed text omitted -- pnpm card:text OP12-022]"
      //
      // A 6-cost body that rests itself to keep an attacker down for two turns
      // rather than one -- see `cannot-refresh`, and OP11-028's own note on why
      // the window is `expiresAfterTurns: 1`.
      "OP12-022",
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
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    rested: true,
                    maxCost: 5,
                  },
                  bind: "op12-inuarashi-lock",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "restrict",
                    binding: "op12-inuarashi-lock",
                    restriction: "cannot-refresh",
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
      // OP12-041 Sanji (Leader): "[printed text omitted -- pnpm card:text OP12-041]"
      //
      // The Event's own printed cost is not paid -- one DON!! buys the whole card
      // -- which is what `activate-event` is for. Its `[When Attacking]` half is
      // in `op12-battle.ts`.
      "OP12-041",
      {
        oncePerTurn: true,
        requires: {
          fieldDon: 1,
          handCardsMatching: {
            match: {
              category: "event",
              type: "Straw Hat Crew",
              maxBaseCost: 3,
            },
            count: 1,
          },
        },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "field-don",
              player: "self",
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "return-don", player: "self", count: 1 },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "hand",
                      category: "event",
                      type: "Straw Hat Crew",
                      maxBaseCost: 3,
                    },
                    bind: "op12-sanji-event",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "activate-event",
                      binding: "op12-sanji-event",
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
      // OP12-044 Sakazuki: "[printed text omitted -- pnpm card:text OP12-044]"
      "OP12-044",
      {
        oncePerTurn: true,
        requires: { handCards: 1, restedDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op12-sakazuki-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op12-sakazuki-cost",
                    to: { player: "self", zone: "trash" },
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
      // OP12-051 Hina: "[printed text omitted -- pnpm card:text OP12-051]"
      "OP12-051",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op12-hina-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: SOURCE_BINDING },
                  {
                    kind: "move",
                    binding: "op12-hina-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxBaseCost: 4,
                    },
                    bind: "op12-hina-lock",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "restrict",
                      binding: "op12-hina-lock",
                      restriction: "cannot-block",
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
      // OP12-080 Baratie (Stage): "[printed text omitted -- pnpm card:text OP12-080]"
      //
      // The Stage buries *itself*, which is why its own `[Trigger]` plays it back:
      // the two halves are a loop. Its Trigger is in `op12-triggers.ts`.
      "OP12-080",
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
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-name",
                    player: "self",
                    name: "Sanji",
                  },
                  then: lookAndAdd(3, "op12-baratie-look", {
                    category: "event",
                  }).effect,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-091 Poker: "[printed text omitted -- pnpm card:text OP12-091]"
      //
      // A trash of fewer than 3 cannot pay, so the count is the program's
      // outermost `if`: that withholds the offer rather than spending the
      // `[Once Per Turn]` on a cost nobody can pay.
      "OP12-091",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: { zone: "trash" },
              operator: "gte",
              value: 3,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "choose",
                selector: { player: "self", zone: "trash" },
                bind: "op12-poker-cost",
                min: 3,
                max: 3,
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "op12-poker-cost",
                      to: { player: "self", zone: "deck", position: "bottom" },
                    },
                    {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "board",
                        category: "character",
                        type: "SMILE",
                      },
                      bind: "op12-poker-buff",
                      min: 0,
                      max: 2,
                      effect: {
                        kind: "modify-power",
                        binding: "op12-poker-buff",
                        amount: 2_000,
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
      // OP12-101 Jewelry Bonney: "[printed text omitted -- pnpm card:text OP12-101]"
      //
      // The Leader alone, and only a {Supernovas} one -- `zone: []` with
      // `includeLeader` and a type filter. The buff outlives the turn, so it is
      // defence rather than reach. The Leader's type is also the outermost
      // `if`, so the activation is not offered where resting Bonney buys
      // nothing.
      "OP12-101",
      {
        oncePerTurn: false,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Supernovas",
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: SOURCE_BINDING },
                  {
                    kind: "select",
                    selector: {
                      player: "self",
                      zone: [],
                      includeLeader: true,
                      type: "Supernovas",
                    },
                    bind: "op12-bonney-leader",
                    count: "all",
                    effect: {
                      kind: "modify-power",
                      binding: "op12-bonney-leader",
                      amount: 1_000,
                      expiresAfterTurns: 1,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
  eventMain: [
    [
      // OP12-016 "To Never Doubt--That Is Power!" (0): "[printed text omitted -- pnpm card:text OP12-016]"
      //
      // "[printed text omitted -- pnpm card:text OP12-016]" is
      // [Unblockable] spelled out -- activating a Blocker is the only way to
      // block -- so it is granted as the keyword, on the card the DON!! went to.
      "OP12-016",
      {
        cost: 0,
        program: {
          effect: giveDonToRayleigh(2, "op12-never-doubt", {
            kind: "grant-keyword",
            binding: "op12-never-doubt",
            keyword: "Unblockable",
            expiresAfterTurns: 0,
          }),
        },
      },
    ],
    [
      // OP12-017 "Color of Observation Haki" (0): "[printed text omitted -- pnpm card:text OP12-017]"
      "OP12-017",
      {
        cost: 0,
        program: {
          effect: giveDonToRayleigh(
            1,
            "op12-observation",
            lookAndAdd(4, "op12-observation-look", {
              anyOf: [
                { color: "Red", category: "event" },
                { category: "character", minCost: 3 },
              ],
            }).effect,
          ),
        },
      },
    ],
    [
      // OP12-019 "Color of Arms Haki" (0): "[printed text omitted -- pnpm card:text OP12-019]"
      "OP12-019",
      {
        cost: 0,
        program: {
          effect: giveDonToRayleigh(1, "op12-arms", {
            kind: "choose",
            selector: { player: "self", zone: "board", includeLeader: true },
            bind: "op12-arms-buff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op12-arms-buff",
              amount: 1_000,
              expiresAfterTurns: 0,
            },
          }),
        },
      },
    ],
    [
      // OP12-038 Two-Sword Style Rashomon (1): "[printed text omitted -- pnpm card:text OP12-038]"
      //
      // Two K.O.s for one card, which is why the DON!! price is steep for a 1-cost
      // Event: `restDon` is declared on the offer so a player who cannot pay is
      // never handed the removal for free.
      "OP12-038",
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
              maxBaseCost: 4,
            },
            bind: "op12-rashomon-ko",
            min: 0,
            max: 2,
            effect: { kind: "knock-out", binding: "op12-rashomon-ko" },
          },
        },
      },
    ],
    [
      // OP12-037 Demon Aura Nine Sword Style Asura (1): `pnpm card:text OP12-037`.
      //
      // Migrated off the hand-written `[Main]` Event register. `rest-opponent-cards` is the node
      // this card's imperative `rest-opponent-card` pending effect was the
      // model for, so the offer it raises -- every unrested, restable
      // Character plus one interchangeable "a DON!!" option -- is the same
      // decision the branch used to build by hand.
      "OP12-037",
      {
        cost: 1,
        restDon: 3,
        program: {
          effect: { kind: "rest-opponent-cards", player: "opponent", count: 2 },
        },
      },
    ],
    [
      // OP12-039 Luffy Is the Man Who Will Become the King of Pirates!!! (3): `pnpm card:text OP12-039`.
      //
      // `{ zone: [], includeLeader: true }` is the idiom for text that names
      // only the Leader, and `update` is what reaches `leaderRested` -- where a
      // Leader keeps the flag a board Character keeps on itself.
      //
      // The clause names a "[Roronoa Zoro] Leader", and the branch this
      // replaces set *any* Leader active: it was only ever reachable in a Zoro
      // list, so the gate cost nothing there and was simply dropped. As the
      // program's outermost `if` it is also what withholds the offer, so no
      // other Leader is handed an Event that would trash for nothing.
      "OP12-039",
      {
        cost: 3,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Roronoa Zoro",
            },
            then: {
              kind: "select",
              selector: { player: "self", zone: [], includeLeader: true },
              bind: "op12-three-thousand-worlds",
              count: "all",
              effect: {
                kind: "update",
                binding: "op12-three-thousand-worlds",
                rested: false,
              },
            },
          },
        },
      },
    ],
    [
      // OP12-058 "I Will Make Whitebeard the King of the Pirates" (9): "[printed text omitted -- pnpm card:text OP12-058]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP12-058]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP12-058]"
      //
      // A 9-cost Event that plays a 9-cost body off the top of the deck -- and
      // the reveal happens whether or not it hits, which is what makes it a
      // gamble rather than a search. The play selects over the *deck* restricted
      // to the card the reveal bound.
      "OP12-058",
      {
        cost: 9,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-type-including",
              player: "self",
              text: "Whitebeard Pirates",
            },
            then: {
              kind: "select",
              selector: { player: "self", zone: "deck", position: "top" },
              bind: "op12-whitebeard-top",
              count: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "reveal", binding: "op12-whitebeard-top" },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "deck",
                      binding: "op12-whitebeard-top",
                      category: "character",
                      typeIncluding: "Whitebeard Pirates",
                      maxCost: 9,
                    },
                    bind: "op12-whitebeard-play",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "sequence",
                      effects: [
                        { kind: "play", binding: "op12-whitebeard-play" },
                        {
                          kind: "grant-keyword",
                          binding: "op12-whitebeard-play",
                          keyword: "Rush",
                          expiresAfterTurns: 0,
                        },
                      ],
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
      // OP12-059 Concasser (1): "[printed text omitted -- pnpm card:text OP12-059]"
      // Its `[Counter]` half is in `op12-battle.ts`.
      "OP12-059",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Sanji",
            },
            then: { kind: "draw", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP12-060 Boeuf Burst (3): "[printed text omitted -- pnpm card:text OP12-060]"
      //
      // The printed bullet list is exactly a `choice`: two different things, one
      // of which is taken. The hand ceiling is inside its own branch, so choosing
      // the draw with a full hand gets nothing -- which is what the text says.
      "OP12-060",
      {
        cost: 3,
        program: {
          effect: {
            kind: "if",
            condition: { kind: "leader-multicolored", player: "self" },
            then: {
              kind: "choice",
              branches: [
                {
                  id: "bounce",
                  label:
                    "Return up to 1 of your opponent's Characters with a cost of 4 or less",
                  effect: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 4,
                    },
                    bind: "op12-boeuf-bounce",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "op12-boeuf-bounce",
                      to: { player: "owner", zone: "hand" },
                    },
                  },
                },
                {
                  id: "draw",
                  label: "Draw 2 cards, at 6 or less cards in hand",
                  effect: {
                    kind: "if",
                    condition: {
                      kind: "zone-count",
                      player: "self",
                      zone: "hand",
                      operator: "lte",
                      value: 6,
                    },
                    then: { kind: "draw", player: "self", count: 2 },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP12-078 Brochette Blow (3): "[printed text omitted -- pnpm card:text OP12-078]"
      //
      // Only the draw is behind the catch-up gate; the debuff is not, which is
      // what the sentence break says.
      "OP12-078",
      {
        cost: 3,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "if",
                condition: {
                  kind: "field-don-versus",
                  player: "self",
                  operator: "lte",
                },
                then: { kind: "draw", player: "self", count: 1 },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "op12-brochette-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op12-brochette-debuff",
                  amount: -3_000,
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP12-079 "Luffy Is the Man Who Will Be King of the Pirates!!!" (1): "[printed text omitted -- pnpm card:text OP12-079]"
      //
      // No filter on what may be added, unlike every other search in the set.
      "OP12-079",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Sanji",
            },
            then: lookAndAdd(3, "op12-king-look", {}).effect,
          },
        },
      },
    ],
    [
      // OP12-096 Ursa Shock (4): "[printed text omitted -- pnpm card:text OP12-096]"
      //
      // One K.O. at one of two ceilings, so it is an `if`/`else` rather than two
      // choices: the wider reading replaces the narrower one rather than adding to
      // it.
      "OP12-096",
      {
        cost: 4,
        program: {
          effect: {
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
            then: koOpponentUpToCost(6, "op12-ursa-wide"),
            else: koOpponentUpToCost(4, "op12-ursa-narrow"),
          },
        },
      },
    ],
    [
      // OP12-097 "Captains Assembled" (1), whose `[Trigger]` activates the same
      // clause.
      "OP12-097",
      { cost: 1, program: op12EventPrograms["OP12-097"]! },
    ],
    [
      // OP12-116 "We'll Ring the Bell Waiting for You!!" (3): "[printed text omitted -- pnpm card:text OP12-116]"
      //
      // "A total of up to 2" across both halves of the disjunction, which is what
      // one `choose` with `max: 2` over an `anyOf` selector says.
      "OP12-116",
      {
        cost: 3,
        program: lookAndAdd(
          5,
          "op12-bell-look",
          {
            anyOf: [
              { type: "Shandian Warrior", category: "character" },
              { name: "Mont Blanc Noland" },
            ],
          },
          2,
        ),
      },
    ],
    [
      // OP12-117 Slam Gibson (1): "[printed text omitted -- pnpm card:text OP12-117]"
      //
      // Face-*down*, unlike OP11-116's face-up version: the Character becomes a
      // Life card whose identity nobody knows, so a Trigger on it is a surprise
      // for whoever attacks into it. Either board, so pointing it at your own body
      // buys Life.
      "OP12-117",
      {
        cost: 1,
        restDon: 5,
        program: {
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
                player: "either",
                zone: "board",
                category: "character",
                maxCost: 9,
              },
              bind: "op12-slam-gibson",
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
                      binding: "op12-slam-gibson",
                      to: { player: "owner", zone: "life", position: "top" },
                    },
                  },
                  {
                    id: "bottom",
                    label: "Add it to the bottom of the owner's Life cards",
                    effect: {
                      kind: "move",
                      binding: "op12-slam-gibson",
                      to: { player: "owner", zone: "life", position: "bottom" },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
};

/** "K.O. up to 1 of your opponent's Characters with a cost of N or less." */
function koOpponentUpToCost(cost: number, bind: string): MechanicEffect {
  return {
    kind: "choose",
    selector: {
      player: "opponent",
      zone: "board",
      category: "character",
      maxCost: cost,
    },
    bind,
    min: 0,
    max: 1,
    effect: { kind: "knock-out", binding: bind },
  };
}

export { koOpponentUpToCost };
