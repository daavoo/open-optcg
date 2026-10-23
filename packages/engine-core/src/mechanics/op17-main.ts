/** OP17 `[Main]` programs: Event cards and `[Activate: Main]` abilities. */
import { SOURCE_BINDING, restableCards } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { elbaphGiantOut, lifeToHandCost, lookAndAdd } from "./shared.js";

export const op17MainMechanics: SetMechanics = {
  eventMain: [
    [
      // OP17-097 "I'll Feed on This Rage and Use It to Bring the World to Ruin!!!":
      // "[printed text omitted -- pnpm card:text OP17-097]"
      //
      // Every Character, not a choice, so `select` with `count: "all"`. Lowering
      // cost is what makes the opponent's board reachable by "cost N or less"
      // removal, which is the point of the card.
      "OP17-097",
      {
        cost: 1,
        program: {
          effect: {
            kind: "select",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op17-rage-all",
            count: "all",
            effect: {
              kind: "modify-cost",
              binding: "op17-rage-all",
              amount: -1,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP17-098 Gum-Gum Kong Pistol: "[printed text omitted -- pnpm card:text OP17-098]"
      //
      // `restDon` pays the six as part of playing the Event, so the cost is taken
      // before the condition is read -- which is how a printed "you may <cost>:"
      // resolves. The Elbaph gate is shared with the rest of that package.
      "OP17-098",
      {
        cost: 1,
        restDon: 6,
        program: {
          effect: {
            kind: "if",
            condition: elbaphGiantOut,
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCost: 6,
              },
              bind: "op17-kong-ko",
              min: 0,
              max: 2,
              effect: { kind: "knock-out", binding: "op17-kong-ko" },
            },
          },
        },
      },
    ],
    [
      // OP17-078 Drunken Dragon Bagua: "[printed text omitted -- pnpm card:text OP17-078]"
      //
      // Purple's ramp shape: three DON!! now, paid for with two cards and two
      // DON!! that were already on the field. The costs are taken as the Event is
      // played -- `restDon` for the DON!! and a mandatory `choose` for the hand --
      // and the Leader gate is read afterwards, which is how a printed
      // "you may <cost>:" resolves. `trashFromHand` is what keeps the offer honest
      // about the second cost.
      "OP17-078",
      {
        cost: 2,
        restDon: 2,
        trashFromHand: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op17-bagua-cost",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op17-bagua-cost",
                  to: { player: "self", zone: "trash" },
                },
              },
              {
                kind: "if",
                condition: {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Animal Kingdom Pirates",
                },
                then: {
                  kind: "add-don",
                  player: "self",
                  count: 3,
                  rested: true,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-115 "There's Still A Code Of Honour? You Clowns!": "[printed text omitted -- pnpm card:text OP17-115]"
      //
      // The first card in the pool to grant a keyword to a Leader, which is why
      // `grant-keyword` and `hasKeyword` learned to find one -- a Leader is in no
      // zone and has no BoardCard to hold the flag. Selecting rather than choosing:
      // there is one Leader, so there is nothing to decide, and under any other
      // Leader the selector is empty and the Event resolves for nothing, which is
      // what its printed text says happens.
      "OP17-115",
      {
        cost: 1,
        program: {
          effect: {
            kind: "select",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              category: "leader",
              name: "Charlotte Linlin",
            },
            bind: "op17-honour-leader",
            count: 1,
            effect: {
              kind: "grant-keyword",
              binding: "op17-honour-leader",
              keyword: "Unblockable",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP17-019 "I Don't have Time to Chat with Snot-Nosed Brats": "[printed text omitted -- pnpm card:text OP17-019]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP17-019]"
      "OP17-019",
      {
        cost: 1,
        program: lookAndAdd(5, "op17-019-look", {
          typeIncluding: "Whitebeard Pirates",
        }),
      },
    ],
    [
      // OP17-037 "Are You That Afraid of the New Era?!!": "[printed text omitted -- pnpm card:text OP17-037]" Its `[Counter]` half is
      // in `counterEventPrograms`, above.
      "OP17-037",
      {
        cost: 1,
        program: lookAndAdd(5, "op17-037-look", {
          typeIncluding: "Red-Haired Pirates",
        }),
      },
    ],
    [
      // OP17-038 "I Think He's Seen An Ugly Future": "[printed text omitted -- pnpm card:text OP17-038]" Its `[Counter]`
      // half is in `counterEventPrograms`, below.
      //
      // "4 of your cards" is the same unqualified phrase OP17-037's Counter
      // prints for its own rest cost ("1 of your cards"), which that card's
      // registration reads as the Leader-and-board pool rather than DON!! --
      // the format spells out "DON!! cards" whenever it means the DON!! pool
      // (OP17-036/055/056 all do), so unqualified "cards" here is read the same
      // way for consistency. Wrapped in an `if` on `selector-count` rather than
      // an `EventMainProgram.restDon`-style pre-gate (no such field exists for
      // a board/Leader pool): with fewer than 4 eligible cards the whole clause
      // is unreachable and the Main step is offered no `optional`, matching how
      // OP17-090's failed-condition K.O. offers nothing rather than a costed
      // step nobody can pay.
      "OP17-038",
      {
        cost: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "self",
              selector: restableCards("self"),
              operator: "gte",
              value: 4,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "choose",
                    selector: restableCards("self"),
                    bind: "op17-038-cost",
                    min: 4,
                    max: 4,
                    effect: { kind: "rest", binding: "op17-038-cost" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      canRest: true,
                    },
                    bind: "op17-038-target",
                    min: 0,
                    max: 1,
                    effect: { kind: "rest", binding: "op17-038-target" },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP17-077 Kundali Dragon Swarm: "[printed text omitted -- pnpm card:text OP17-077]" The same shape OP17-078 already established, down to
      // the 3 DON!!. Its `[Counter]` half is in `counterEventPrograms`, above.
      "OP17-077",
      {
        cost: 1,
        restDon: 3,
        trashFromHand: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op17-077-cost",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op17-077-cost",
                  to: { player: "self", zone: "trash" },
                },
              },
              {
                kind: "if",
                condition: {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Animal Kingdom Pirates",
                },
                then: {
                  kind: "add-don",
                  player: "self",
                  count: 3,
                  rested: true,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-036 "Withdraw Now And Allow Me To Save Face": "[printed text omitted -- pnpm card:text OP17-036]"
      "OP17-036",
      {
        cost: 1,
        restDon: 6,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "opponent", zone: "board" },
                bind: "op17-036-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "op17-036-rest" },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  rested: true,
                  maxCost: 6,
                },
                bind: "op17-036-ko",
                min: 0,
                max: 2,
                effect: { kind: "knock-out", binding: "op17-036-ko" },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-055 "There's No Authority in the World That Lasts Forever!!!":
      // "[printed text omitted -- pnpm card:text OP17-055]"
      //
      // `includeLeader`, because a bare bracketed name reaches whichever cards
      // carry it and OP17-039 is itself named Rocks.D.Xebec. OP17-036's
      // "[printed text omitted -- pnpm card:text OP17-036]" is the same construction and is
      // read the same way -- see its Leader test in `test/op17.test.ts` -- and
      // reading this one narrowly would have made the clause nearly dead,
      // since the only Character of the name costs 10.
      //
      // The Leader keeps a granted keyword on the player rather than on a
      // BoardCard it does not have; `grant-keyword` in `mechanics.ts` handles
      // that, and [Unblockable] is one of the two keywords it can hold.
      "OP17-055",
      {
        cost: 0,
        restDon: 1,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              name: "Rocks.D.Xebec",
            },
            bind: "op17-055-target",
            min: 0,
            max: 1,
            effect: {
              kind: "grant-keyword",
              binding: "op17-055-target",
              keyword: "Unblockable",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP17-056 "Rocks Pirates": "[printed text omitted -- pnpm card:text OP17-056]"
      "OP17-056",
      {
        cost: 0,
        restDon: 5,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 6,
            },
            bind: "op17-056-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op17-056-bounce",
              to: { player: "opponent", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // OP17-018 "The Power to Destroy the World": "[printed text omitted -- pnpm card:text OP17-018]" Its
      // `[Counter]` half is in `counterEventPrograms`/`counterEventPower`
      // (engine.ts), the same shape OP17-096 established for a board-state
      // condition the declarative table cannot carry.
      "OP17-018",
      {
        cost: 1,
        restDon: 2,
        program: {
          effect: {
            kind: "choose",
            selector: { player: "opponent", zone: "stage" },
            bind: "op17-018-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op17-018-ko" },
          },
        },
      },
    ],
    [
      // OP17-116 Fulgora: the same "[Main]" template as OP17-018, over
      // {@link CardZone}'s new "stage" selector.
      "OP17-116",
      {
        cost: 1,
        restDon: 2,
        program: {
          effect: {
            kind: "choose",
            selector: { player: "opponent", zone: "stage" },
            bind: "op17-116-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op17-116-ko" },
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // OP17-020 Shanks, the Leader: "[printed text omitted -- pnpm card:text OP17-020]"
      //
      // "[printed text omitted -- pnpm card:text OP17-020]" is
      // `restrict: "cannot-refresh"` at `expiresAfterTurns: 1`, the same clause
      // OP15-077 Lightning Dragon already prints. The cost is an alternative
      // between two payments, so it is a `choice` of which one to pay -- but
      // unlike a selection `choice`, an unpayable branch cannot simply resolve
      // to nothing on its own: `rest-don` happily rests zero DON!! for a player
      // with none active. Each branch's own `if` gate is what keeps picking an
      // unaffordable branch from paying nothing and still landing the effect.
      "OP17-020",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choice",
              branches: [
                {
                  id: "hand",
                  label: "Trash 1 card from your hand",
                  effect: {
                    kind: "if",
                    condition: {
                      kind: "zone-count",
                      player: "self",
                      zone: "hand",
                      operator: "gte",
                      value: 1,
                    },
                    then: {
                      kind: "sequence",
                      effects: [
                        {
                          kind: "choose",
                          selector: { player: "self", zone: "hand" },
                          bind: "op17-shanks020-hand",
                          min: 1,
                          max: 1,
                          effect: {
                            kind: "move",
                            binding: "op17-shanks020-hand",
                            to: { player: "self", zone: "trash" },
                          },
                        },
                        {
                          kind: "choose",
                          selector: {
                            player: "opponent",
                            zone: "board",
                            category: "character",
                            rested: true,
                          },
                          bind: "op17-shanks020-target-hand",
                          min: 0,
                          max: 1,
                          effect: {
                            kind: "restrict",
                            binding: "op17-shanks020-target-hand",
                            restriction: "cannot-refresh",
                            expiresAfterTurns: 1,
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  id: "don",
                  label: "Rest 1 of your DON!! cards",
                  effect: {
                    kind: "if",
                    condition: {
                      kind: "active-don",
                      player: "self",
                      operator: "gte",
                      value: 1,
                    },
                    then: {
                      kind: "sequence",
                      effects: [
                        { kind: "rest-don", player: "self", count: 1 },
                        {
                          kind: "choose",
                          selector: {
                            player: "opponent",
                            zone: "board",
                            category: "character",
                            rested: true,
                          },
                          bind: "op17-shanks020-target-don",
                          min: 0,
                          max: 1,
                          effect: {
                            kind: "restrict",
                            binding: "op17-shanks020-target-don",
                            restriction: "cannot-refresh",
                            expiresAfterTurns: 1,
                          },
                        },
                      ],
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
      // OP17-044 Captain John: "[printed text omitted -- pnpm card:text OP17-044]" Its taunt clause ("[printed text omitted -- pnpm card:text OP17-044]") is the attack-target filter in `engine.ts`'s `mainActions`,
      // alongside the existing OP12-020 Zoro restriction it is modelled on --
      // unlike Zoro's, this one also removes the Leader as a legal target.
      "OP17-044",
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
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op17-captainjohn-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-captainjohn-cost",
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
      // OP17-010 Fossa: "[printed text omitted -- pnpm card:text OP17-010]"
      //
      // Two conditions, both counts over the board, so both are `selector-count`.
      // The self-count is `eq 0` with `excludeSource`, which is what "no *other*
      // [Fossa]" means. It reads the Leader too and names no category: Bandai's
      // OP-17 Q&A has a Leader treated as having all card names count as
      // another [Fossa], and `name` answers through `hasCardName`, which is
      // what honours that Leader. "[printed text omitted -- pnpm card:text OP17-010]" is one
      // turn beyond this one, hence `expiresAfterTurns: 1`.
      "OP17-010",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "opponent",
              selector: {
                zone: "board",
                category: "character",
                minCurrentPower: 10_000,
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
                  name: "Fossa",
                  excludeSource: true,
                },
                operator: "eq",
                value: 0,
              },
              then: {
                kind: "sequence",
                effects: [
                  {
                    kind: "grant-keyword",
                    binding: SOURCE_BINDING,
                    keyword: "Blocker",
                    expiresAfterTurns: 1,
                  },
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
      },
    ],
    [
      // OP17-030 Monkey D. Luffy: "[printed text omitted -- pnpm card:text OP17-030]"
      //
      // Its [On Play] half is registered separately in `onPlayPrograms`.
      // `requires` keeps the activation off the list when there is no rested DON!!
      // to set active, so a repeatable-looking no-op is never offered.
      "OP17-030",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "hand",
              operator: "lte",
              value: 5,
            },
            then: { kind: "activate-don", player: "self", count: 1 },
          },
        },
      },
    ],
    [
      // OP17-053 Barbell: "[printed text omitted -- pnpm card:text OP17-053]"
      "OP17-053",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "op17-barbell-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op17-barbell-cost",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "modify-power",
                    binding: SOURCE_BINDING,
                    amount: 3_000,
                    expiresAfterTurns: 0,
                  },
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP17-101 Caribou: "[printed text omitted -- pnpm card:text OP17-101]"
      //
      // `lifeToHandCost` is the shared shape for paying with a Life card; the
      // text names the top card, so the bottom one is not a way to pay.
      "OP17-101",
      {
        oncePerTurn: true,
        program: lifeToHandCost(
          {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op17-caribou-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-caribou-debuff",
              amount: -3_000,
              expiresAfterTurns: 0,
            },
          },
          "top",
        ),
      },
    ],
    [
      // OP17-034 Rockstar: "[printed text omitted -- pnpm card:text OP17-034]"
      //
      // The opening condition gates both sentences. `leader-power` reads the
      // opponent's Leader through `currentPower`, so DON!! given to it counts --
      // which is usually how a 5000 Leader gets to 6000 in the first place.
      //
      // The second sentence is gated again on your own Leader's type, and sets a
      // base power rather than adding to one: two of this set's cards printing the
      // clause in a turn leave the Leader at the later number.
      "OP17-034",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-power",
              player: "opponent",
              operator: "gte",
              value: 6_000,
            },
            then: {
              kind: "sequence",
              effects: [
                { kind: "activate-don", player: "self", count: 1 },
                {
                  kind: "if",
                  condition: {
                    kind: "leader-has-type",
                    player: "self",
                    type: "Red-Haired Pirates",
                  },
                  then: {
                    kind: "set-leader-base-power",
                    player: "self",
                    value: 6_000,
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
      // OP17-063 Kaido: "[printed text omitted -- pnpm card:text OP17-063]"
      //
      // The DON!! is an unconditional payment -- there is no "you may" in front
      // of it -- so it is a plain `return-don`, not `donMinus`'s optional-cost
      // wrapper; whether the rest of the sentence does anything is gated
      // separately by `source-played-this-turn`, the new condition this card
      // needed. Its own "+1000 Counter" static clause is `handCounterPower` in
      // `static-abilities.ts`, read at the Counter step.
      //
      // `fieldDon`, not `activeDon`: `returnDonToDeck` pays `DON!! -1` from
      // rested DON!! first, and "if this Character was played on this turn"
      // means the only turn the K.O. can ever fire is the turn a cost-10 body
      // emptied the cost area. Gating on active DON!! made the clause
      // unreachable in the position it is printed for.
      "OP17-063",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "return-don", player: "self", count: 1 },
              {
                kind: "if",
                condition: { kind: "source-played-this-turn" },
                then: {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCost: 6,
                  },
                  bind: "op17-kaido063-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "negate",
                        binding: "op17-kaido063-target",
                        expiresAfterTurns: 0,
                      },
                      { kind: "knock-out", binding: "op17-kaido063-target" },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-025 Building Snake: "[printed text omitted -- pnpm card:text OP17-025]"
      //
      // Not `give-rested-don`: that node's `type` filter matches printed types,
      // and "Shanks" is a name, so it would never recognise the Leader it is
      // meant for. The clause only ever moves DON!! to the Leader, never to a
      // Character, so a plain conditional `attach-don` says exactly what is
      // printed.
      "OP17-025",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-name",
              player: "self",
              name: "Shanks",
            },
            then: {
              kind: "attach-don",
              player: "self",
              from: "rested",
              count: 1,
              target: "leader",
            },
          },
        },
      },
    ],
    [
      // OP17-054 Miss Buckingham Stussy: "[printed text omitted -- pnpm card:text OP17-054]"
      //
      // Not `[Once Per Turn]` -- resting the Character itself is the real limit,
      // as `requires.activeDon` is for the DON!! half.
      "OP17-054",
      {
        oncePerTurn: false,
        requires: { activeDon: 3 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 3 },
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: { player: "opponent", zone: "board" },
                  bind: "op17-stussy-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "restrict",
                    binding: "op17-stussy-target",
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
      // OP17-061 Lead Performers: "[printed text omitted -- pnpm card:text OP17-061]"
      "OP17-061",
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
                    zone: "hand",
                    anyOf: [
                      { name: "King" },
                      { name: "Queen" },
                      { name: "Jack" },
                    ],
                  },
                  bind: "op17-lead-performers-play",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "play",
                    binding: "op17-lead-performers-play",
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
