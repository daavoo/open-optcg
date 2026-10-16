/**
 * EB-03 `[On Play]` programs.
 *
 * The set is 62 cards and splits the same way the eight main sets do, by the
 * timing window a clause fires in: this file, `eb03-main.ts`,
 * `eb03-battle.ts`, `eb03-triggers.ts` and `eb03-replacements.ts`. See
 * `mechanics/README.md`.
 *
 * Six of the set's identities were in the pool before the set was, played by
 * four community decks and the sealed pool, and their programs stay in the
 * modules named after those decks -- EB03-032 and EB03-035 in the imperative
 * register, EB03-053 and EB03-055 in `life.ts`, EB03-060 in `effects.ts` and
 * EB03-062 in `op12-rosinante.ts`. Nothing here re-registers them.
 */
import { type SetMechanics } from "./registry.js";
import { donMinus, lookAndAdd, playVanillaBody } from "./shared.js";

/**
 * "Add up to 1 card from the top of your deck to the top of your Life cards."
 *
 * EB03-054's `[On Play]` and EB03-052's activation both end on it, and the
 * banked card goes on face-down -- a Life card added by an effect is not
 * revealed, which is why nothing here sets `faceUp`.
 */
export const bankDeckTopOnLife = (bind: string) =>
  ({
    kind: "select",
    selector: { player: "self", zone: "deck", position: "top" },
    bind,
    count: 1,
    effect: {
      kind: "move",
      binding: bind,
      to: { player: "self", zone: "life", position: "top" },
    },
  }) as const;

/**
 * "Up to 1 of your {SWORD} type Leader or Character cards can also attack
 * active Characters during this turn" -- EB03-008 Hibari's `[On Play]` and its
 * `[When Attacking]`, which are one printed clause on two timings.
 *
 * Exported so `eb03-battle.ts` registers the same fragment rather than a copy:
 * a fix to the reading has to reach both windows, and the merge refuses a
 * second registration of the same clause anyway.
 */
export const swordAttacksActive = {
  effect: {
    kind: "choose",
    selector: {
      player: "self",
      zone: "board",
      includeLeader: true,
      type: "SWORD",
    },
    bind: "eb03-hibari-target",
    min: 0,
    max: 1,
    effect: {
      kind: "grant-attack-active",
      binding: "eb03-hibari-target",
      expiresAfterTurns: 0,
    },
  },
} as const;

export const eb03OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // EB03-003 Uta: "[printed text omitted -- pnpm card:text EB03-003]"
      //
      // The draw is what pays for the body, so both halves sit inside the
      // Leader gate: a deck not led by [Uta] gets a 7000 body and nothing else.
      "EB03-003",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-name", player: "self", name: "Uta" },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              playVanillaBody("hand", "eb03-uta-body"),
            ],
          },
        },
      },
    ],
    [
      // EB03-005 Sugar: "[printed text omitted -- pnpm card:text EB03-005]"
      //
      // Rested, so the body it fetches cannot attack on the turn it arrives:
      // the clause is a board, not tempo.
      "EB03-005",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-name", player: "self", name: "Sugar" },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              type: "Donquixote Pirates",
              maxPower: 6_000,
            },
            bind: "eb03-sugar-body",
            min: 0,
            max: 1,
            effect: {
              kind: "play",
              binding: "eb03-sugar-body",
              rested: true,
            },
          },
        },
      },
    ],
    [
      // EB03-006 Nami: "[printed text omitted -- pnpm card:text EB03-006]"
      //
      // The cost is a penalty on the Leader that has to still be *active*, and
      // it is written as the `choose` that pays it rather than as a condition:
      // the interpreter skips a `min: 1` choose it cannot fill, so a rested
      // Leader means no cost is paid and -- because the draw is nested inside
      // it -- no card is drawn either. A `select` would bind nothing and hand
      // over the draw for free.
      "EB03-006",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              category: "leader",
              rested: false,
            },
            bind: "eb03-nami-leader",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "modify-power",
                  binding: "eb03-nami-leader",
                  amount: -5_000,
                  expiresAfterTurns: 0,
                },
                { kind: "draw", player: "self", count: 1 },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-008 Hibari: "[printed text omitted -- pnpm card:text EB03-008]"
      //
      // One program on two timings -- see `eb03-battle.ts`, which registers the
      // same fragment for the `[When Attacking]` half. The {SWORD} filter is
      // on the selector rather than on the Leader, so it reads the same for the
      // Leader and for a Character: `includeLeader` adds the Leader as a
      // candidate and the type test then applies to it too.
      "EB03-008",
      swordAttacksActive,
    ],
    [
      // EB03-010 Monet: "[printed text omitted -- pnpm card:text EB03-010]"
      //
      // The ceiling belongs to the Character half alone, which is why it is an
      // `anyOf` branch rather than the selector's own `maxPower`: an Event
      // prints no power, so a top-level ceiling would exclude the whole second
      // half of the printed disjunction.
      "EB03-010",
      lookAndAdd(5, "eb03-monet-looked", {
        anyOf: [
          { category: "character", maxPower: 1_000 },
          { category: "event" },
        ],
      }),
    ],
    [
      // EB03-016 Kouzuki Hiyori: "[printed text omitted -- pnpm card:text EB03-016]"
      "EB03-016",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Kouzuki Oden",
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // EB03-017 Jewelry Bonney: "[printed text omitted -- pnpm card:text EB03-017]"
      //
      // Both sentences sit inside the {Supernovas} gate: the printed "Then"
      // continues the conditional sentence rather than starting a new clause,
      // which is how every other "If <gate>, <effect>. Then, <effect>" card in
      // the pool is read.
      //
      // The freeze outlives the turn -- `expiresAfterTurns: 1` -- because the
      // printed duration runs to the end of the opponent's *next* End Phase, so
      // a body held active cannot block on the turn in between.
      "EB03-017",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Supernovas",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "activate-don", player: "self", count: 1 },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 8,
                },
                bind: "eb03-bonney-freeze",
                min: 0,
                max: 1,
                effect: {
                  kind: "restrict",
                  binding: "eb03-bonney-freeze",
                  restriction: "cannot-rest",
                  expiresAfterTurns: 1,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB03-021 Alvida: "[printed text omitted -- pnpm card:text EB03-021]"
      //
      // Two targets with different filters, so two `choose` nodes: the first is
      // the opponent's and reads printed power, the second names no side at all
      // and so reaches either board. Both are "up to 1", so the second still
      // happens when the first finds nothing -- which is the case on a board of
      // one big body.
      "EB03-021",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "eb03-alvida-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "eb03-alvida-cost",
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxPower: 4_000,
                  },
                  bind: "eb03-alvida-small",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "eb03-alvida-small",
                    to: { player: "owner", zone: "deck", position: "bottom" },
                  },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "either",
                    zone: "board",
                    category: "character",
                    maxBaseCost: 3,
                  },
                  bind: "eb03-alvida-cheap",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "eb03-alvida-cheap",
                    to: { player: "owner", zone: "deck", position: "bottom" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-022 Isuka: "[printed text omitted -- pnpm card:text EB03-022]"
      //
      // "1 Character", with no side named, so `player: "either"` -- and the
      // destination is the *owner's* deck, which is the only reading that works
      // for a binding whose two halves have different owners.
      "EB03-022",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 4,
          },
          bind: "eb03-isuka-bury",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "eb03-isuka-bury",
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // EB03-023 Kaya: "[printed text omitted -- pnpm card:text EB03-023]"
      //
      // The first clause in the pool that does not send every looked-at card to
      // one end of the deck, which is what `alternate` on `order-to-bottom` is
      // for: the split point and the order are one decision, and the engine
      // offers its two ends -- all five to the top, all five to the bottom.
      "EB03-023",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 5,
              bind: "eb03-kaya-looked",
            },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "eb03-kaya-looked",
              },
              bind: "eb03-kaya-place",
              count: "all",
              effect: {
                kind: "order-to-bottom",
                binding: "eb03-kaya-place",
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
    ],
    [
      // EB03-024 Nefeltari Vivi: "[printed text omitted -- pnpm card:text EB03-024]"
      //
      // The ban is the price of the free play and lands whether or not a body
      // was found: the printed "Then" is unconditional. `restrict-player` with
      // no `minBaseCost` bars every Character, which is what stops the clause
      // from being a discount on a second body in the same turn.
      "EB03-024",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                maxCost: 5,
                anyOf: [{ type: "Alabasta" }, { type: "Straw Hat Crew" }],
              },
              bind: "eb03-vivi-body",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb03-vivi-body" },
            },
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
      // EB03-025 Hina: "[printed text omitted -- pnpm card:text EB03-025]"
      //
      // "6000 base power" is exact rather than a ceiling, so `minPower` and
      // `maxPower` are both 6000 -- the same shape OP16's Whitebeard shell
      // uses for its own exact reading.
      "EB03-025",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "eb03-hina-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "eb03-hina-cost",
                  to: { player: "self", zone: "trash" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "either",
                    zone: "board",
                    category: "character",
                    minPower: 6_000,
                    maxPower: 6_000,
                  },
                  bind: "eb03-hina-bounce",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "eb03-hina-bounce",
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
      // EB03-026 Boa Hancock: "[printed text omitted -- pnpm card:text EB03-026]"
      //
      // The opponent chooses which card goes, so `chooser: "opponent"`, and the
      // gate counts *their* hand: at five cards a discard is a real cost, below
      // it the clause does nothing at all.
      "EB03-026",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "hand",
            operator: "gte",
            value: 5,
          },
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            bind: "eb03-hancock-bury",
            min: 1,
            max: 1,
            chooser: "opponent",
            effect: {
              kind: "move",
              binding: "eb03-hancock-bury",
              to: { player: "owner", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
    [
      // EB03-027 Marguerite: "[printed text omitted -- pnpm card:text EB03-027]"
      "EB03-027",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            minPower: 7_000,
            maxPower: 7_000,
          },
          bind: "eb03-marguerite-bounce",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "eb03-marguerite-bounce",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // EB03-028 Yu: "[printed text omitted -- pnpm card:text EB03-028]"
      //
      // Not a cost and not optional -- the discard is the whole clause -- so
      // `min: 1` and no `optional` wrapper.
      "EB03-028",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "hand" },
          bind: "eb03-yu-discard",
          min: 1,
          max: 1,
          effect: {
            kind: "move",
            binding: "eb03-yu-discard",
            to: { player: "self", zone: "trash" },
          },
        },
      },
    ],
    [
      // EB03-031 Vinsmoke Reiju: "[printed text omitted -- pnpm card:text EB03-031]"
      //
      // The Event is already spent, so this is a second use of one rather than
      // a discount on a first -- which is why `activate-event` had to learn to
      // read the trash. `[Your Turn]` is not a further gate here: a Character
      // is only ever played on its controller's own turn.
      "EB03-031",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: { kind: "leader-has-name", player: "self", name: "Sanji" },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              category: "event",
              maxCost: 7,
            },
            bind: "eb03-reiju-event",
            min: 0,
            max: 1,
            effect: {
              kind: "activate-event",
              binding: "eb03-reiju-event",
              mainOnly: true,
            },
          },
        }),
      },
    ],
    [
      // EB03-034 Charlotte Linlin: "[printed text omitted -- pnpm card:text EB03-034]"
      //
      // Draw first, then bank: the card just drawn is a legal choice for the
      // one that goes back on top, which is what makes the clause a filter
      // rather than a cost.
      "EB03-034",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 1 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb03-linlin-stack",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb03-linlin-stack",
                to: { player: "self", zone: "deck", position: "top" },
              },
            },
            { kind: "add-don", player: "self", count: 1, rested: false },
          ],
        },
      },
    ],
    [
      // EB03-036 Baby 5: "[printed text omitted -- pnpm card:text EB03-036]"
      //
      // `max: 2` makes the printed "up to 2" a real choice: each K.O. is
      // offered one at a time and the player may stop after the first.
      "EB03-036",
      {
        effect: donMinus(1, {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxBaseCost: 3,
          },
          bind: "eb03-baby5-ko",
          min: 0,
          max: 2,
          effect: { kind: "knock-out", binding: "eb03-baby5-ko" },
        }),
      },
    ],
    [
      // EB03-037 Lim: "[printed text omitted -- pnpm card:text EB03-037]"
      //
      // "All of your {ODYSSEY} type Leader and Character cards" is a `select`
      // over the whole board plus the Leader rather than a `choose`: nothing is
      // being picked. The buff outlives the turn, so it is defence as much as
      // offence -- `expiresAfterTurns: 1`.
      "EB03-037",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 7,
          },
          then: {
            kind: "select",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              type: "ODYSSEY",
            },
            bind: "eb03-lim-buff",
            count: "all",
            effect: {
              kind: "modify-power",
              binding: "eb03-lim-buff",
              amount: 1_000,
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // EB03-039 Ulti: "[printed text omitted -- pnpm card:text EB03-039]"
      //
      // The trash is mandatory and the body comes out of the trash the discard
      // just fed, so the order matters: a vanilla Character pitched here is a
      // legal target for the play that follows.
      "EB03-039",
      {
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
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "eb03-ulti-discard",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "eb03-ulti-discard",
                  to: { player: "self", zone: "trash" },
                },
              },
              playVanillaBody("trash", "eb03-ulti-body"),
            ],
          },
        },
      },
    ],
    [
      // EB03-041 Kujyaku: "[printed text omitted -- pnpm card:text EB03-041]"
      //
      // The cost is a {Navy} card rather than any card, so the `choose` that
      // pays it carries the type: a hand with nothing Navy in it cannot fill a
      // `min: 1`, and the interpreter skips the node -- and with it the draw.
      "EB03-041",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand", type: "Navy" },
            bind: "eb03-kujyaku-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "eb03-kujyaku-cost",
                  to: { player: "self", zone: "trash" },
                },
                { kind: "draw", player: "self", count: 2 },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-043 Stussy: "[printed text omitted -- pnpm card:text EB03-043]"
      //
      // The cost is two cards out of the trash and back into the deck "in any
      // order", which is `order-to-bottom` -- and it is paid before the K.O. is
      // offered, so a trash with one CP card in it buys nothing.
      "EB03-043",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              typeIncluding: "CP",
            },
            bind: "eb03-stussy-cost",
            min: 2,
            max: 2,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "order-to-bottom",
                  binding: "eb03-stussy-cost",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 4,
                  },
                  bind: "eb03-stussy-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "eb03-stussy-ko" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-044 Black Maria: "[printed text omitted -- pnpm card:text EB03-044]"
      //
      // The search and the play are one clause: the Stage the look just found
      // is in hand by the time the play is offered, which is the whole point of
      // the sentence. A copy already in hand is just as legal a target.
      "EB03-044",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "eb03-maria-looked", { name: "Onigashima Island" })
              .effect,
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                name: "Onigashima Island",
              },
              bind: "eb03-maria-stage",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb03-maria-stage" },
            },
          ],
        },
      },
    ],
    [
      // EB03-045 Perona: "[printed text omitted -- pnpm card:text EB03-045]"
      //
      // The DON!! comes out of the rested pile and may land on the Leader or on
      // a Character, which is exactly what `give-rested-don` with no filter
      // asks. The recursion behind it is gated on a full trash, so it is a late
      // clause: ten cards is a deck that has already been mining itself.
      "EB03-045",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "give-rested-don", player: "self", count: 1 },
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
                  player: "self",
                  zone: "trash",
                  category: "character",
                  type: "Thriller Bark Pirates",
                  maxCost: 2,
                  excludeSource: true,
                },
                bind: "eb03-perona-body",
                min: 0,
                max: 1,
                effect: {
                  kind: "play",
                  binding: "eb03-perona-body",
                  rested: true,
                },
              },
            },
          ],
        },
      },
    ],
    [
      // EB03-046 Miss Doublefinger(Zala): "[printed text omitted -- pnpm card:text EB03-046]"
      //
      // "There is a Character" names no side, so either board answers it -- and
      // the two ends of the printed range are two conditions rather than one:
      // cost 0 exactly, or cost 8 and up.
      "EB03-046",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "any-of",
            conditions: [
              {
                kind: "selector-count",
                player: "either",
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
                player: "either",
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
      },
    ],
    [
      // EB03-047 Miss.Valentine(Mikita): "[printed text omitted -- pnpm card:text EB03-047]"
      "EB03-047",
      { effect: { kind: "trash-top", player: "self", count: 3 } },
    ],
    [
      // EB03-048 Rebecca: "[printed text omitted -- pnpm card:text EB03-048]"
      //
      // The search finds any {Dressrosa} Stage and the play is capped at cost 1,
      // which is the printed asymmetry rather than a simplification: the Stage
      // it digs for and the Stage it can afford to put down are two different
      // filters.
      "EB03-048",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "eb03-rebecca-looked", {
              category: "stage",
              type: "Dressrosa",
            }).effect,
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "stage",
                type: "Dressrosa",
                minCost: 1,
                maxCost: 1,
              },
              bind: "eb03-rebecca-stage",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb03-rebecca-stage" },
            },
          ],
        },
      },
    ],
    [
      // EB03-050 Conis: "[printed text omitted -- pnpm card:text EB03-050]"
      "EB03-050",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Sky Island",
          },
          bind: "eb03-conis-target",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "eb03-conis-target",
            keyword: "Double Attack",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // EB03-051 Charlotte Smoothie: "[printed text omitted -- pnpm card:text EB03-051]"
      //
      // The Life cards turn face-down whether or not anything was K.O.'d, and
      // they turn *all* the way down -- a `select` over the whole zone. That is
      // the cost of the removal: a Yellow deck reads its own Life, and this
      // spends the information.
      "EB03-051",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "life", faceUp: true },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 2,
                },
                bind: "eb03-smoothie-ko",
                min: 0,
                max: 1,
                effect: { kind: "knock-out", binding: "eb03-smoothie-ko" },
              },
              {
                kind: "select",
                selector: { player: "self", zone: "life" },
                bind: "eb03-smoothie-life",
                count: "all",
                effect: {
                  kind: "update",
                  binding: "eb03-smoothie-life",
                  faceUp: false,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // EB03-054 Nico Robin: "[printed text omitted -- pnpm card:text EB03-054]"
      //
      // A Life card spent for a Life card: the trash is the cost and the bank
      // is the payout, so the net is a fresh face-down card off the deck. Worth
      // taking when the Life card showing is one the opponent has already seen.
      "EB03-054",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "life", position: "edge" },
            bind: "eb03-robin-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "eb03-robin-cost",
                  to: { player: "self", zone: "trash" },
                },
                bankDeckTopOnLife("eb03-robin-bank"),
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-056 Belo Betty: "[printed text omitted -- pnpm card:text EB03-056]"
      //
      // The price is information rather than a card: the Life total does not
      // move, and what the opponent gains is knowing what their next attack
      // turns over. Payable only while a face-down Life card is left to turn.
      "EB03-056",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "life",
              position: "edge",
              faceUp: false,
            },
            bind: "eb03-betty-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "update",
                  binding: "eb03-betty-cost",
                  faceUp: true,
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxBaseCost: 3,
                  },
                  bind: "eb03-betty-ko",
                  min: 0,
                  max: 1,
                  effect: { kind: "knock-out", binding: "eb03-betty-ko" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-057 Yamato: "[printed text omitted -- pnpm card:text EB03-057]"
      //
      // The DON!! goes to the Leader and nowhere else, which is `attach-don`
      // rather than `give-rested-don`: the latter offers every Character too.
      "EB03-057",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Land of Wano",
          },
          then: {
            kind: "attach-don",
            player: "self",
            from: "rested",
            count: 3,
            target: "leader",
          },
        },
      },
    ],
    [
      // EB03-058 Lilith: "[printed text omitted -- pnpm card:text EB03-058]"
      //
      // `[Your Turn]` adds nothing to an `[On Play]` -- a Character is played on
      // its controller's turn -- and the Life gate is the real clause: the draw
      // arrives while the deck is behind.
      "EB03-058",
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
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
    [
      // EB03-059 S-Snake: "[printed text omitted -- pnpm card:text EB03-059]"
      //
      // The banked card goes on *face-up*, which is the clause: the opponent
      // can see the Trigger coming and still has to attack into it. A Character
      // with a `[Trigger]` is what `hasTrigger` asks, and it reads the derived
      // fact rather than the words.
      "EB03-059",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "leader-has-type", player: "self", type: "Egghead" },
              {
                kind: "zone-count",
                player: "self",
                zone: "life",
                operator: "gte",
                value: 2,
              },
            ],
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              hasTrigger: true,
            },
            bind: "eb03-snake-bank",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "eb03-snake-bank",
              to: { player: "self", zone: "life", position: "top" },
              faceUp: true,
            },
          },
        },
      },
    ],
  ],
};
