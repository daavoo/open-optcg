/**
 * OP17 battle-window programs: `[Counter]` Events, `[On Your Opponent's
 * Attack]`, `[When Attacking]` and the Leader watchers.
 */
import { SOURCE_BINDING, restableCards } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, trashForBattlePower } from "./shared.js";

export const op17BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // OP17-017 Ga Ha Ha Ha!!: "[printed text omitted -- pnpm card:text OP17-017]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP17-017]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP17-017]"
      //
      // The buff only reaches the battle when the thing being attacked is itself a
      // Whitebeard Pirates card. The debuff half is a free choice over the
      // opponent's side and runs afterwards, so it lands even when the buff is 0.
      "OP17-017",
      {
        cost: 1,
        power: 2_000,
        target: { type: "Whitebeard Pirates" },
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              includeLeader: true,
            },
            bind: "op17-gura-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-gura-debuff",
              amount: -2_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP17-097 "I'll Feed on This Rage...": "[printed text omitted -- pnpm card:text OP17-097]"
      "OP17-097",
      {
        cost: 1,
        power: 3_000,
        target: { isLeader: true },
      },
    ],
    [
      // OP17-098 Gum-Gum Kong Pistol: "[printed text omitted -- pnpm card:text OP17-098]"
      "OP17-098",
      {
        cost: 1,
        power: 3_000,
        target: { isLeader: true },
      },
    ],
    [
      // OP17-078 Drunken Dragon Bagua: "[Counter] Give up to 1 of your Leader or
      // Character cards +4000 power during this battle."
      //
      // No `target` filter: "[printed text omitted -- pnpm card:text OP17-078]" is always whatever
      // the attack is pointed at.
      "OP17-078",
      { cost: 2, power: 4_000 },
    ],
    [
      // OP17-115 "There's Still A Code Of Honour? You Clowns!": "[printed text omitted -- pnpm card:text OP17-115]"
      //
      // Name-restricted, like the [Enel] Counters: worth 4000 when a Charlotte
      // Linlin is the card being attacked and nothing at all otherwise.
      "OP17-115",
      {
        cost: 1,
        power: 4_000,
        target: { name: "Charlotte Linlin" },
      },
    ],
    [
      // OP17-036 "Withdraw Now And Allow Me To Save Face": "[printed text omitted -- pnpm card:text OP17-036]"
      "OP17-036",
      { cost: 1, power: 4_000, target: { name: "Shanks" } },
    ],
    [
      // OP17-117 Maser Saber: "[Counter] Up to 1 of your [Charlotte Linlin]
      // cards gains +3000 power during this battle." Its `[Trigger]` half is
      // in `triggerPrograms`, below.
      "OP17-117",
      { cost: 1, power: 3_000, target: { name: "Charlotte Linlin" } },
    ],
    [
      // OP17-055 / OP17-056: "[Counter] Up to 1 of your Leader with a type
      // including Rocks Pirates or up to 1 of your Characters with a type
      // including Rocks Pirates gains +2000 power during this battle."
      "OP17-055",
      { cost: 0, power: 2_000, target: { type: "Rocks Pirates" } },
    ],
    ["OP17-056", { cost: 0, power: 2_000, target: { type: "Rocks Pirates" } }],
    [
      // OP17-096 "I'm Luffy!! The Man Who Will Be King of the Pirates!!":
      // "[printed text omitted -- pnpm card:text OP17-096]"
      //
      // The condition is read in `counterEventPower` (engine.ts), which is the
      // one seam every offer and resolution already goes through; `power` here
      // is unreachable but kept so the table's shape stays uniform.
      "OP17-096",
      { cost: 1, power: 4_000 },
    ],
    [
      // OP17-018 "The Power to Destroy the World": "[printed text omitted -- pnpm card:text OP17-018]"
      //
      // The condition is read in `counterEventPower` (engine.ts), the same
      // seam OP17-096 uses.
      "OP17-018",
      { cost: 1, power: 4_000 },
    ],
    [
      // OP17-116 Fulgora: "[printed text omitted -- pnpm card:text OP17-116]"
      "OP17-116",
      { cost: 1, power: 4_000 },
    ],
    [
      // OP17-037 "Are You That Afraid of the New Era?!!": "[printed text omitted -- pnpm card:text OP17-037]"
      //
      // The power is paid for, not printed flat, so `power` here is
      // unreachable -- `counterEventPower` returns `undefined` for it, the
      // same "decided as it resolves" reading OP11-079 already established for
      // a Counter whose number depends on a choice rather than board state.
      // The whole clause lives in `program`, which resolves *after* the
      // (here, zero) `power` is added -- see the interface doc. "1 of your
      // cards" names no category, so `includeLeader` folds the Leader into
      // the same rest-cost pool as the board.
      "OP17-037",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: restableCards("self"),
                  bind: "op17-037-cost",
                  min: 1,
                  max: 1,
                  effect: { kind: "rest", binding: "op17-037-cost" },
                },
                { kind: "battle-power", player: "self", amount: 3_000 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-076 "Wo Ro Ro Ro Ro!! I Think I've Sobered Up!!": "[printed text omitted -- pnpm card:text OP17-076]" Its printed Trigger,
      // "DON!! −1: Draw 2 cards", is `triggerPrograms`, below, reusing the
      // existing `donMinus` helper for the cost.
      "OP17-076",
      {
        cost: 0,
        power: 0,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op17-076-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-076-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                { kind: "battle-power", player: "self", amount: 3_000 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-038 "I Think He's Seen An Ugly Future": "[printed text omitted -- pnpm card:text OP17-038]" Identical shape to OP17-076, above.
      // Its `[Main]` half is in `eventMainPrograms`, above.
      "OP17-038",
      {
        cost: 0,
        power: 0,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op17-038-counter-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-038-counter-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                { kind: "battle-power", player: "self", amount: 3_000 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-077 Gundari Meteor Shower: "[Counter] DON!! −1: Your Leader Gains
      // +4000 power during this battle."
      //
      // No "you may" -- mandatory whenever the DON!! is there, which is board
      // state visible before the Counter is even offered, so unlike 037/076
      // this one *is* a deterministic forecast; see `counterEventPower`.
      "OP17-077",
      {
        cost: 1,
        // Unreachable: `counterEventPower` computes this deterministically
        // from board state (see engine.ts) and its return value is what the
        // resolution site adds, so `program` below pays only the DON!! -- it
        // must not *also* add the power, or the two would double it.
        power: 0,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "active-don",
              player: "self",
              operator: "gte",
              value: 1,
            },
            then: { kind: "return-don", player: "self", count: 1 },
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP17-014 Whitey Bay: "[printed text omitted -- pnpm card:text OP17-014]"
      //
      // The one entry with no `[Once Per Turn]`, and it does not need one: the cost
      // is the Character itself, so the ability is once per copy by construction.
      // "Up to 1 of your Leaders" is narrower than the rest of the table -- a
      // blocking Character gains nothing from it, which is what `isLeader` says.
      "OP17-014",
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
                  kind: "battle-power",
                  player: "self",
                  amount: 1_000,
                  target: { isLeader: true },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-057 Fullalead: "[printed text omitted -- pnpm card:text OP17-057]"
      //
      // A Stage, not a board Character, which is the whole reason the source scan
      // looks at `stage` as well as `board`. Its cost rests itself, so the offer
      // needs the Stage to be active; a Stage rests only for this, and refreshes
      // in its controller's Refresh phase.
      //
      // The printed text spells the Leader and the Character halves out separately
      // and both carry the same type restriction, so the two collapse into one
      // filter.
      "OP17-057",
      {
        oncePerTurn: false,
        requires: { handCards: 1, sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op17-fullalead-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-fullalead-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                {
                  kind: "battle-power",
                  player: "self",
                  amount: 1_000,
                  target: { type: "Rocks Pirates" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-064 King: "[printed text omitted -- pnpm card:text OP17-064]"
      //
      // Prints the short `[On Opponent's Attack]` spelling, which is why the clause
      // is registered under both markers: the coverage ratchet matches literally.
      // `[Blocker]` needs nothing here -- printed keywords come off card text.
      "OP17-064",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: trashForBattlePower(2_000, "op17-king-cost"),
      },
    ],
    [
      // OP17-072 Black Maria: "[printed text omitted -- pnpm card:text OP17-072]"
      //
      // The same template as King at a cost of 2 instead of 9, and the pair is what
      // forced the dispatch to guard per source: both can be on the board, and a
      // guard keyed on the kind of effect would have silently dropped the second.
      "OP17-072",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: trashForBattlePower(1_000, "op17-black-maria-cost"),
      },
    ],
    [
      // OP17-001 Edward.Newgate, the Leader: "[printed text omitted -- pnpm card:text OP17-001]"
      //
      // The same template as King and Black Maria at a cost of 4, with no
      // target restriction -- both the Leader and every Character are eligible,
      // which is `trashForBattlePower`'s default (`target` omitted).
      "OP17-001",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: trashForBattlePower(4_000, "op17-newgate001-cost"),
      },
    ],
    [
      // OP17-049 Charlotte Linlin: "[printed text omitted -- pnpm card:text OP17-049]" Its `[On Play]` half
      // is `onPlayPrograms`, above.
      "OP17-049",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: trashForBattlePower(1_000, "op17-linlin049-cost"),
      },
    ],
    [
      // OP17-033 Lucky Roux: "[printed text omitted -- pnpm card:text OP17-033]"
      //
      // No `[Once Per Turn]` -- the cost is the Character itself, so a second use
      // needs a second copy, the same shape as OP17-014 Whitey Bay.
      "OP17-033",
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
                    player: "opponent",
                    zone: "board",
                    includeLeader: true,
                  },
                  bind: "op17-lucky-roux-target",
                  min: 0,
                  max: 1,
                  effect: { kind: "rest", binding: "op17-lucky-roux-target" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-048 Shiki: dual-timed with `whenAttackingPrograms`, above, which
      // carries the printed text and the reasoning. The programs are identical
      // -- "your opponent" always means this card's opponent regardless of
      // which side of the attack it is reacting from -- and the two tables
      // share one `[Once Per Turn]` key by construction (same turn, same
      // controller, same source instance).
      "OP17-048",
      {
        oncePerTurn: true,
        requires: { handCardsOfType: { type: "Rocks Pirates", count: 1 } },
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
                    type: "Rocks Pirates",
                  },
                  bind: "op17-shiki048-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-shiki048-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op17-shiki048-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op17-shiki048-target",
                    amount: -3_000,
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
      // OP17-058 Kaido, the Leader: dual-timed with `whenAttackingPrograms`,
      // above, which carries the printed text and the reasoning -- including
      // why the cost is `donMinus` over a `fieldDon` gate.
      "OP17-058",
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
            bind: "op17-kaido058-target",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-kaido058-target",
              amount: -2_000,
              expiresAfterTurns: 0,
            },
          }),
        },
      },
    ],
  ],
  leaderWatcher: [
    [
      "OP17-040",
      {
        oncePerTurn: true,
        requires: { handCards: 1, leaderType: "Rocks Pirates" },
        program: trashForBattlePower(3_000, "op17-newgate040-cost", {
          isLeader: true,
        }),
      },
    ],
  ],
  whenAttacking: [
    [
      // OP17-011 Blamenco: "[printed text omitted -- pnpm card:text OP17-011]"
      //
      // `source-attached-don` is what makes this an `if` rather than a plain
      // `choose`: the debuff should not even attempt to fire without 2 DON!!
      // actually attached to Blamenco himself, which no existing condition
      // could ask.
      "OP17-011",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 2,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "op17-blamenco-target",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-blamenco-target",
              amount: -4_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // OP17-039 Rocks.D.Xebec, the Leader: "[printed text omitted -- pnpm card:text OP17-039]"
      //
      // The reveal stays private to its own controller through `look-at`, the
      // same simplification the "reveal N cards from hand" pattern documents
      // elsewhere: the gameplay-relevant half (gating the draw on the revealed
      // card's type) is fully modelled, and the card is never moved, so nothing
      // about the deck's order changes either way.
      "OP17-039",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op17-xebec039-cost",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op17-xebec039-cost",
                  to: { player: "self", zone: "trash" },
                },
              },
              {
                kind: "look-at",
                player: "self",
                count: 1,
                bind: "op17-xebec039-reveal",
              },
              {
                kind: "if",
                condition: {
                  kind: "selector-count",
                  player: "self",
                  selector: {
                    zone: "deck",
                    binding: "op17-xebec039-reveal",
                    type: "Rocks Pirates",
                  },
                  operator: "gte",
                  value: 1,
                },
                then: { kind: "draw", player: "self", count: 2 },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-026 Fugar: "[printed text omitted -- pnpm card:text OP17-026]"
      "OP17-026",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Red-Haired Pirates",
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 2,
            },
            bind: "op17-fugar-target",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op17-fugar-target" },
          },
        },
      },
    ],
    [
      // OP17-068 Sasaki: "[printed text omitted -- pnpm card:text OP17-068]"
      "OP17-068",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op17-sasaki-cost",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op17-sasaki-cost",
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
                  count: 2,
                  rested: true,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP17-099 Charlotte Linlin, the Leader: "[printed text omitted -- pnpm card:text OP17-099]"
      //
      // The opponent picks the branch, not the cards -- `choice`'s new
      // `chooser` field. "Your" throughout stays this Leader's controller: the
      // first branch mills their own hand for a Life card, the second reaches
      // into "your opponent's hand" from that same controller's point of view,
      // which is the chooser's own hand. Bandai's OP-17 Q&A has this Leader's
      // controller trash that card at random without looking, which is
      // `pick-from-hand`'s `"random"`: the engine RNG picks it, so nothing about
      // the hand is shown to either side. Gated on having a hand card to pay
      // with, the same `if` guard OP14-061 Vergo's optional DON!! cost uses, so
      // an empty hand is never offered a no-op prompt.
      "OP17-099",
      {
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
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "op17-linlin099-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-linlin099-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                {
                  kind: "choice",
                  chooser: "opponent",
                  branches: [
                    {
                      id: "mill-then-life",
                      label:
                        "Trash 1 card from your hand, then add a card from the top of your deck to the top of your Life cards",
                      effect: {
                        kind: "sequence",
                        effects: [
                          {
                            kind: "choose",
                            selector: { player: "self", zone: "hand" },
                            bind: "op17-linlin099-mill",
                            min: 1,
                            max: 1,
                            effect: {
                              kind: "move",
                              binding: "op17-linlin099-mill",
                              to: { player: "self", zone: "trash" },
                            },
                          },
                          {
                            kind: "choose",
                            selector: {
                              player: "self",
                              zone: "deck",
                              position: "top",
                            },
                            bind: "op17-linlin099-life",
                            min: 0,
                            max: 1,
                            effect: {
                              kind: "move",
                              binding: "op17-linlin099-life",
                              to: {
                                player: "self",
                                zone: "life",
                                position: "top",
                              },
                            },
                          },
                        ],
                      },
                    },
                    {
                      id: "opponent-discards",
                      label: "Trash 1 card at random from your opponent's hand",
                      effect: {
                        kind: "pick-from-hand",
                        player: "opponent",
                        pick: "random",
                        bind: "op17-linlin099-discard",
                        effect: {
                          kind: "move",
                          binding: "op17-linlin099-discard",
                          to: { player: "opponent", zone: "trash" },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP17-048 Shiki: "[printed text omitted -- pnpm card:text OP17-048]" [Rush: Character] is printed
      // keyword text and needs no program.
      //
      // Registered under both this table and `onOpponentAttackPrograms`, below
      // -- printed on both timings, one `[Once Per Turn]` budget shared between
      // them the way the dispatch site's shared key format lets it. `requires`'
      // new `handCardsOfType` is what makes an offer here always resolve to
      // something: without it a hand with no Rocks Pirates card would still
      // show "you may", and paying nothing for nothing would be free to accept.
      "OP17-048",
      {
        oncePerTurn: true,
        requires: { handCardsOfType: { type: "Rocks Pirates", count: 1 } },
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
                    type: "Rocks Pirates",
                  },
                  bind: "op17-shiki048-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "op17-shiki048-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                  },
                  bind: "op17-shiki048-target",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "op17-shiki048-target",
                    amount: -3_000,
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
      // OP17-058 Kaido, the Leader: "[printed text omitted -- pnpm card:text OP17-058]"
      //
      // Also registered under `onOpponentAttackPrograms`, sharing its
      // `[Once Per Turn]` budget the same way OP17-048 does.
      //
      // `donMinus`, and `fieldDon` rather than `activeDon`, for the two halves
      // of the printed cost. `DON!! -N` returns DON!! from the *field* and
      // `returnDonToDeck` takes rested DON!! first, so gating on active DON!!
      // asked for a resource the cost does not spend -- and this Leader's
      // windows arrive after a turn spent tapping out, so a Kaido at 0 active
      // and 10 rested DON!! was never offered the debuff at all. `DON!! -N`
      // also prints "(You may return ...)", which makes it a cost the
      // controller chooses to pay; both windows here open on their own, so
      // without `donMinus`'s `optional` the ramp deck was forced to hand a
      // DON!! back on every attack it saw. The two together are what the
      // clause is: an offer, payable out of whatever is on the field.
      "OP17-058",
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
            bind: "op17-kaido058-target",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op17-kaido058-target",
              amount: -2_000,
              expiresAfterTurns: 0,
            },
          }),
        },
      },
    ],
  ],
};
