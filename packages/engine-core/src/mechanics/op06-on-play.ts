/**
 * OP06 `[On Play]` programs, plus the `[On Play]`/`[On K.O.]` pairs whose two
 * clauses are one sentence.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP06-0xx` prints it from the local cache).
 *
 * Two OP06 identities were in the pool before the set was, played by the
 * community deck that ships them: OP06-033 Vander Decken IX and OP06-107
 * Kouzuki Momonosuke. Their programs stay in the modules named after that deck,
 * the same split every earlier whole-set import kept.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, payFromHand } from "./shared.js";
import {
  costDebuff,
  koCostAtMost,
  playFromHand,
  powerDebuff,
} from "./op08-shared.js";
import {
  bounceCostAtMost,
  buryCostAtMost,
  donBehind,
  payFromTrash,
} from "./op07-shared.js";
import {
  filmLeader,
  filmSearch,
  koPowerAtMost,
  koRestedCostAtMost,
  lifeTopToHand,
  lookAndPlay,
  newFishManLeader,
  payWithStage,
  thrillerBarkLeader,
  trashFromHand,
} from "./op06-shared.js";

/** "Draw 2 cards and trash 2 cards from your hand." */
const drawTwoTrashTwo: MechanicEffect = {
  kind: "sequence",
  effects: [
    { kind: "draw", player: "self", count: 2 },
    trashFromHand(2, "op06-draw-trash"),
  ],
};

export const op06OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP06-003 Emporio.Ivankov: a dig three deep for a small Revolutionary
      // Army body, played straight off the deck.
      //
      // The power ceiling is printed power, not current: the card the look
      // reaches is still in the deck, where nothing has modified it.
      "OP06-003",
      lookAndPlay(3, "op06-ivankov", {
        category: "character",
        type: "Revolutionary Army",
        maxPower: 5_000,
      }),
    ],
    [
      // OP06-004 Baron Omatsuri: pulls its own named Stage-like partner out of
      // hand for free. `playFromHand` rather than a search -- the clause names
      // the hand, and a copy in the deck is not reachable.
      "OP06-004",
      {
        effect: playFromHand({ name: "Lily Carnation" }, "op06-omatsuri"),
      },
    ],
    [
      // OP06-007 Shanks: the set's 10-cost finisher, and the widest removal in
      // it -- a ceiling most boards never climb over.
      "OP06-007",
      { effect: koPowerAtMost(10_000, "op06-shanks") },
    ],
    [
      // OP06-013 Monkey.D.Luffy: the Red/FILM package's search, printed on the
      // `[On Play]` and re-run by its own `[Trigger]`.
      "OP06-013",
      filmSearch,
    ],
    [
      // OP06-023 Arlong: a hand card for the opponent's rested Leader, locked
      // out of attacking through their next turn.
      //
      // `rested: true` on a Leader is answered by `isRested`, which reads
      // `leaderRested` off the seat in the instance id -- a Leader that has not
      // attacked is not a legal target, and offering one would spend a card for
      // nothing. `expiresAfterTurns: 1` is "until the end of your opponent's
      // next turn" counted in player-turns from this one.
      "OP06-023",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op06-arlong-cost",
            1,
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: [],
                includeLeader: true,
                rested: true,
              },
              bind: "op06-arlong-lock",
              min: 0,
              max: 1,
              effect: {
                kind: "restrict",
                binding: "op06-arlong-lock",
                restriction: "cannot-attack",
                expiresAfterTurns: 1,
              },
            },
          ),
        },
      },
    ],
    [
      // OP06-024 Ikaros Much: a free Fish-Man body, paid for with a Life card.
      //
      // Both halves sit inside the Leader gate: the printed sentence is one
      // conditional, and a deck without the Leader type gets neither the play
      // nor the Life card. That is the whole New Fish-Man Pirates bargain --
      // see `lifeTopToHand`, printed as the tail of six of its clauses.
      "OP06-024",
      {
        effect: {
          kind: "if",
          condition: newFishManLeader,
          then: {
            kind: "sequence",
            effects: [
              playFromHand(
                { category: "character", type: "Fish-Man", maxCost: 4 },
                "op06-ikaros",
              ),
              lifeTopToHand,
            ],
          },
        },
      },
    ],
    [
      // OP06-025 Camie: the Fish-Man search, four deep and over both of the
      // archetype's types. `excludeName` is the printed "other than" -- a Camie
      // that found a Camie would chain forever.
      "OP06-025",
      lookAndAdd(4, "op06-camie", {
        anyOf: [{ type: "Fish-Man" }, { type: "Merfolk" }],
        excludeName: "Camie",
      }),
    ],
    [
      // OP06-026 Koushirou: sets a <Slash> body active, and closes the Leader
      // as a target for the rest of the turn.
      //
      // `rested: true` on the target, because setting an active Character
      // active does nothing and offering it spends the decision for free. The
      // price is a player-wide restriction rather than one on this card: every
      // attacker loses the Leader as a target, which is what the printed
      // sentence says -- see `cannot-attack-leaders`.
      //
      // The attribute is read off the icon Bandai prints in the effect text.
      // The reference pipeline's HTML parse drops that icon (an `<Slash>`
      // pseudo-tag whose text content is empty), so the derived text this repo
      // sees reads "your attribute Characters" -- the icon is still on the card
      // and the clause still means <Slash>. Fixing the parse moves the text
      // hash of every card in every set, so it is not this import's change to
      // make.
      "OP06-026",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                attribute: "Slash",
                maxCost: 4,
                rested: true,
              },
              bind: "op06-koushirou",
              min: 0,
              max: 1,
              effect: {
                kind: "update",
                binding: "op06-koushirou",
                rested: false,
              },
            },
            {
              kind: "restrict-player",
              player: "self",
              restriction: "cannot-attack-leaders",
              expiresAfterTurns: 0,
            },
          ],
        },
      },
    ],
    [
      // OP06-036 Ryuma: removal for a body that has already attacked, printed
      // on the `[On Play]` and again on the `[On K.O.]`.
      "OP06-036",
      { effect: koRestedCostAtMost(4, "op06-ryuma") },
    ],
    [
      // OP06-041 The Ark Noah: a 6-cost Stage that rests the whole opposing
      // board, which is a Fish-Man turn on its own.
      //
      // `select` over the board rather than `rest-opponent-cards`: the printed
      // clause names every Character and offers no choice, and that node is for
      // the "up to N of their Characters or DON!!" shape. `canRest` skips a
      // body an effect is holding active, the same eligibility a single rest
      // has.
      "OP06-041",
      {
        effect: {
          kind: "select",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: false,
            canRest: true,
          },
          bind: "op06-ark-noah",
          count: "all",
          effect: { kind: "rest", binding: "op06-ark-noah" },
        },
      },
    ],
    [
      // OP06-045 Kuzan: draws two and puts two back under the deck, which is
      // Navy's way of trading dead cards for live ones.
      //
      // The two that go back are chosen after the draw and are mandatory, so
      // the `choose` is `min: 2` -- and "in any order" is the player's, which
      // is what `order-to-bottom` asks a card at a time.
      "OP06-045",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op06-kuzan",
              min: 2,
              max: 2,
              effect: {
                kind: "order-to-bottom",
                binding: "op06-kuzan",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // OP06-046 Sakazuki: buries a cheap body instead of K.O.ing it, so no
      // `[On K.O.]` fires. `player: "either"` is the printed clause naming no
      // side; see `buryCostAtMost`.
      "OP06-046",
      { effect: buryCostAtMost(2, "op06-sakazuki") },
    ],
    [
      // OP06-047 Charlotte Pudding: rewrites the opponent's hand -- everything
      // back into the deck, a shuffle, then five fresh cards.
      //
      // A gift as often as a punishment, which is the card: it empties a hand
      // full of answers held for a Counter, and refills a hand of one.
      "OP06-047",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "select",
              selector: { player: "opponent", zone: "hand" },
              bind: "op06-pudding",
              count: "all",
              effect: {
                kind: "move",
                binding: "op06-pudding",
                to: { player: "owner", zone: "deck", position: "bottom" },
              },
            },
            { kind: "shuffle-deck", player: "opponent" },
            { kind: "draw", player: "opponent", count: 5 },
          ],
        },
      },
    ],
    [
      // OP06-050 Tashigi: the Navy search, five deep.
      "OP06-050",
      lookAndAdd(5, "op06-tashigi", {
        type: "Navy",
        excludeName: "Tashigi",
      }),
    ],
    [
      // OP06-051 Tsuru: two cards from hand for a bounce the *opponent*
      // chooses, which is what makes it a tempo card rather than removal --
      // they will hand back their worst body.
      "OP06-051",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op06-tsuru-cost",
            2,
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "op06-tsuru",
              chooser: "opponent",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "op06-tsuru",
                to: { player: "owner", zone: "hand" },
              },
            },
          ),
        },
      },
    ],
    [
      // OP06-061 Vinsmoke Ichiji: the GERMA package's payoff shape -- a debuff
      // and [Rush] on the turn it lands, but only while the deck is behind on
      // DON!! (see `donBehind`, which counts the tie).
      "OP06-061",
      {
        effect: {
          kind: "if",
          condition: donBehind,
          then: {
            kind: "sequence",
            effects: [
              powerDebuff(2_000, "op06-ichiji"),
              {
                kind: "grant-keyword",
                binding: SOURCE_BINDING,
                keyword: "Rush",
                expiresAfterTurns: 0,
              },
            ],
          },
        },
      },
    ],
    [
      // OP06-062 Vinsmoke Judge, first clause: DON!! back, two cards from hand,
      // and up to four GERMA bodies out of the trash.
      //
      // `distinctNames` is the printed "with different card names", and the
      // power ceiling is printed power because the cards are in the trash.
      // Both payments are optional and nested, so declining either one stops
      // before the payoff rather than after it.
      "OP06-062",
      {
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
                  kind: "optional",
                  effect: payFromHand(
                    { player: "self", zone: "hand" },
                    "op06-judge-cost",
                    2,
                    {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "trash",
                        category: "character",
                        type: "GERMA 66",
                        maxPower: 4_000,
                      },
                      bind: "op06-judge",
                      min: 0,
                      max: 4,
                      distinctNames: true,
                      effect: { kind: "play", binding: "op06-judge" },
                    },
                  ),
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP06-063 Vinsmoke Sora: a card from hand for a small Vinsmoke body out
      // of the trash, while the deck is behind on DON!!.
      "OP06-063",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op06-sora-cost",
            1,
            {
              kind: "if",
              condition: donBehind,
              then: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  type: "The Vinsmoke Family",
                  maxPower: 4_000,
                },
                bind: "op06-sora",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op06-sora",
                  to: { player: "self", zone: "hand" },
                },
              },
            },
          ),
        },
      },
    ],
    [
      // OP06-065 Vinsmoke Niji: removal or a bounce, whichever the board wants,
      // behind the same DON!! gate.
      "OP06-065",
      {
        effect: {
          kind: "if",
          condition: donBehind,
          then: {
            kind: "choice",
            branches: [
              {
                id: "ko",
                label: "K.O. a Character with a cost of 2 or less",
                effect: koCostAtMost(2, "op06-niji-ko"),
              },
              {
                id: "bounce",
                label: "Return a Character with a cost of 4 or less",
                effect: bounceCostAtMost(4, "op06-niji-bounce"),
              },
            ],
          },
        },
      },
    ],
    [
      // OP06-069 Vinsmoke Reiju: two cards, behind the DON!! gate and a hand
      // ceiling. The ceiling is read after the card has left hand to be played,
      // which is the state every other zone count in the pool is read in.
      "OP06-069",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              donBehind,
              {
                kind: "zone-count",
                player: "self",
                zone: "hand",
                operator: "lte",
                value: 5,
              },
            ],
          },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP06-071 Gild Tesoro: DON!! back for two FILM bodies out of the trash,
      // which is how the Red deck rebuilds after trading its hand away.
      "OP06-071",
      {
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
                  kind: "if",
                  condition: filmLeader,
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "trash",
                      category: "character",
                      type: "FILM",
                      maxCost: 4,
                    },
                    bind: "op06-tesoro",
                    min: 0,
                    max: 2,
                    effect: {
                      kind: "move",
                      binding: "op06-tesoro",
                      to: { player: "self", zone: "hand" },
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
      // OP06-073 Shiki: a Blocker whose card draw is gated on a full DON!!
      // field, so it pays out on the turn the game is decided and not before.
      "OP06-073",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 8,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              trashFromHand(1, "op06-shiki"),
            ],
          },
        },
      },
    ],
    [
      // OP06-074 Zephyr (Navy): negates a Character for the turn, then K.O.s it
      // if what is left is small enough.
      //
      // The power is read *after* the negation, which is the printed order and
      // the whole trick: a body holding itself up with its own continuous text
      // falls under the ceiling once that text is switched off. `select` over
      // the same binding rather than a second `choose` -- "that Character" is
      // not a new decision, and a target above the ceiling simply survives.
      "OP06-074",
      {
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
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op06-zephyr",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "negate",
                        binding: "op06-zephyr",
                        expiresAfterTurns: 0,
                      },
                      {
                        kind: "select",
                        selector: {
                          player: "opponent",
                          zone: "board",
                          binding: "op06-zephyr",
                          maxCurrentPower: 5_000,
                        },
                        bind: "op06-zephyr-ko",
                        count: "all",
                        effect: {
                          kind: "knock-out",
                          binding: "op06-zephyr-ko",
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
      // OP06-075 Count Battler: DON!! back to rest two cheap bodies, which on
      // the FILM deck's own turn is two attacks that do not come back.
      "OP06-075",
      {
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
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 2,
                    rested: false,
                    canRest: true,
                  },
                  bind: "op06-battler",
                  min: 0,
                  max: 2,
                  effect: { kind: "rest", binding: "op06-battler" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP06-081 Absalom: two cards out of the trash and back under the deck --
      // Purple's second currency -- for removal that reaches either side.
      "OP06-081",
      {
        effect: payFromTrash(2, "op06-absalom-cost", {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxCost: 2,
          },
          bind: "op06-absalom",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "op06-absalom" },
        }),
      },
    ],
    [
      // OP06-082 Inuppe: two cards for two cards, on the way in and on the way
      // out. The Thriller Bark deck wants cards in the trash, so the discard is
      // half the payoff rather than half the price.
      "OP06-082",
      {
        effect: {
          kind: "if",
          condition: thrillerBarkLeader,
          then: drawTwoTrashTwo,
        },
      },
    ],
    [
      // OP06-086 Gecko Moria: two bodies out of the trash, one of them rested.
      //
      // Which one comes back rested is the player's, so it is a `choice` after
      // both picks rather than a fixed order -- the cheap body is usually the
      // one to rest, but not when it is the one that has to block. The second
      // pick excludes the first through `excludeBinding`, because one card
      // cannot fill both halves of the sentence.
      "OP06-086",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                category: "character",
                maxCost: 4,
              },
              bind: "op06-moria-big",
              min: 0,
              max: 1,
              effect: {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "trash",
                  category: "character",
                  maxCost: 2,
                  excludeBinding: "op06-moria-big",
                },
                bind: "op06-moria-small",
                min: 0,
                max: 1,
                effect: {
                  kind: "choice",
                  branches: [
                    {
                      id: "rest-small",
                      label: "Play the cheaper card rested",
                      effect: {
                        kind: "sequence",
                        effects: [
                          { kind: "play", binding: "op06-moria-big" },
                          {
                            kind: "play",
                            binding: "op06-moria-small",
                            rested: true,
                          },
                        ],
                      },
                    },
                    {
                      id: "rest-big",
                      label: "Play the costlier card rested",
                      effect: {
                        kind: "sequence",
                        effects: [
                          {
                            kind: "play",
                            binding: "op06-moria-big",
                            rested: true,
                          },
                          { kind: "play", binding: "op06-moria-small" },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ],
    [
      // OP06-089 Taralan: three cards off the top, on the way in and on the way
      // out. Self-mill is what the Thriller Bark deck's recursion reads.
      "OP06-089",
      { effect: { kind: "trash-top", player: "self", count: 3 } },
    ],
    [
      // OP06-090 Dr. Hogback: two cards back under the deck for the Thriller
      // Bark card the trash is holding -- any card, not just a Character.
      //
      // The two that pay go under the deck *before* the search reads the trash,
      // which is the printed order and matters: a card spent on the cost cannot
      // also be the card the search finds.
      "OP06-090",
      {
        effect: payFromTrash(2, "op06-hogback-cost", {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            type: "Thriller Bark Pirates",
            excludeName: "Dr. Hogback",
          },
          bind: "op06-hogback",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op06-hogback",
            to: { player: "self", zone: "hand" },
          },
        }),
      },
    ],
    [
      // OP06-091 Victoria Cindry: five cards off the top behind the Leader
      // gate, the deepest single mill in the set.
      "OP06-091",
      {
        effect: {
          kind: "if",
          condition: thrillerBarkLeader,
          then: { kind: "trash-top", player: "self", count: 5 },
        },
      },
    ],
    [
      // OP06-092 Brook: a Character trashed rather than K.O.'d, or three cards
      // out of the opponent's trash and back under their deck.
      //
      // "Trash" is a `move` and not a `knock-out`: no `[On K.O.]` fires, which
      // is the reason to print the word. Off-field replacements are still
      // offered, because leaving the board to an opponent's effect is what
      // those clauses answer.
      //
      // The three cards go back in trash order rather than through
      // `order-to-bottom`: the ordering is the *opponent's* by the printed text
      // and that node asks the player resolving the effect, so asking would put
      // the decision in the wrong hands. A chooser on `order-to-bottom` is what
      // would let it be exact; the cards are going under a deck either way.
      "OP06-092",
      {
        effect: {
          kind: "choice",
          branches: [
            {
              id: "trash",
              label: "Trash a Character with a cost of 4 or less",
              effect: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  maxCost: 4,
                },
                bind: "op06-brook",
                min: 0,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op06-brook",
                  to: { player: "owner", zone: "trash" },
                },
              },
            },
            {
              id: "bury-trash",
              label: "Your opponent buries 3 cards from their trash",
              effect: {
                kind: "select",
                selector: { player: "opponent", zone: "trash" },
                bind: "op06-brook-bury",
                count: 3,
                effect: {
                  kind: "move",
                  binding: "op06-brook-bury",
                  to: { player: "owner", zone: "deck", position: "bottom" },
                },
              },
            },
          ],
        },
      },
    ],
    [
      // OP06-093 Perona: a discard or a cost debuff, but only into a hand of
      // five or more -- the clause is written to punish a held Counter.
      "OP06-093",
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
            kind: "choice",
            branches: [
              {
                id: "discard",
                label: "Your opponent trashes 1 card from their hand",
                effect: {
                  kind: "choose",
                  selector: { player: "opponent", zone: "hand" },
                  bind: "op06-perona-discard",
                  chooser: "opponent",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op06-perona-discard",
                    to: { player: "owner", zone: "trash" },
                  },
                },
              },
              {
                id: "cost",
                label: "Give a Character −3 cost",
                effect: costDebuff(3, "op06-perona-cost"),
              },
            ],
          },
        },
      },
    ],
    [
      // OP06-099 Aisa: looks at the top Life card on either side and decides
      // which end of that stack it goes back to.
      //
      // Two branches because the player picks whose Life area, and `look-at`
      // takes a side rather than a card. The card comes back through
      // `order-to-bottom` with an `alternate`, which is the node that asks
      // "which end" -- and it asks even for a single card, unlike an ordering
      // with one destination, because the end is a decision.
      //
      // Yellow's own Life stack is a resource it reads and reorders, and the
      // opponent's is the one it is racing: a Trigger seen coming is a Trigger
      // that can be buried.
      "OP06-099",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choice",
            branches: [
              {
                id: "own-life",
                label: "Look at the top of your Life cards",
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "look-at",
                      player: "self",
                      count: 1,
                      bind: "op06-aisa",
                      zone: "life",
                    },
                    {
                      kind: "order-to-bottom",
                      binding: "op06-aisa",
                      to: { player: "owner", zone: "life", position: "bottom" },
                      alternate: {
                        player: "owner",
                        zone: "life",
                        position: "top",
                      },
                    },
                  ],
                },
              },
              {
                id: "opponent-life",
                label: "Look at the top of your opponent's Life cards",
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "look-at",
                      player: "opponent",
                      count: 1,
                      bind: "op06-aisa",
                      zone: "life",
                    },
                    {
                      kind: "order-to-bottom",
                      binding: "op06-aisa",
                      to: { player: "owner", zone: "life", position: "bottom" },
                      alternate: {
                        player: "owner",
                        zone: "life",
                        position: "top",
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
    [
      // OP06-101 O-Nami: hands [Banish] to a card for the turn, so the Life
      // card its damage takes is trashed instead of joining a hand -- and its
      // `[Trigger]` never opens. The Leader is a legal recipient, which is what
      // "Leader or Character cards" says.
      "OP06-101",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "board", includeLeader: true },
          bind: "op06-onami",
          min: 0,
          max: 1,
          effect: {
            kind: "grant-keyword",
            binding: "op06-onami",
            keyword: "Banish",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP06-114 Wyper: a 1-cost Stage under the deck buys a five-deep search
      // for the Shandia package's own Stage or a Shandian body.
      //
      // The name half reaches an OP07 Stage the pool now holds; before OP-07
      // was imported the same disjunction would have found only the type half.
      "OP06-114",
      {
        effect: payWithStage(
          "op06-wyper-cost",
          lookAndAdd(5, "op06-wyper", {
            anyOf: [{ name: "Upper Yard" }, { type: "Shandian Warrior" }],
          }).effect,
        ),
      },
    ],
    [
      // OP06-119 Sanji: reveals one card and plays it if it is a Character,
      // which at nine cost is anything the deck holds.
      //
      // A public `reveal` rather than a private look: both players learn the
      // card, and the printed word is what the difference is. What is not
      // played goes under the deck, which `order-to-bottom` resolves without a
      // decision for a single card.
      "OP06-119",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "look-at", player: "self", count: 1, bind: "op06-sanji" },
            { kind: "reveal", binding: "op06-sanji" },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op06-sanji",
                category: "character",
                maxCost: 9,
                excludeName: "Sanji",
              },
              bind: "op06-sanji-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "op06-sanji-play" },
            },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "op06-sanji",
              },
              bind: "op06-sanji-rest",
              count: "all",
              effect: {
                kind: "move",
                binding: "op06-sanji-rest",
                to: { player: "self", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
  ],
};
