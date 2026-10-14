/**
 * `[Main]` programs for the `P-` promos: the `[Activate: Main]` abilities and
 * the `[Main]` halves of their Events.
 *
 * Split by timing window like every other import; see `mechanics/README.md`.
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text P-0xx` prints it from the local cache).
 */
import { SOURCE_BINDING, type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { costDebuff, powerDebuff, restLock } from "./op08-shared.js";
import { lifeToHandCost, lookAndReplace, payFromHand } from "./shared.js";
import { buryCost, sortFiveDeep } from "./promo-shared.js";

/** "If your Leader is [Uta], <effect>." -- the {FILM} Events' shared gate. */
const ifUtaLeader = (
  effect: MechanicProgram["effect"],
): MechanicProgram["effect"] => ({
  kind: "if",
  condition: { kind: "leader-has-name", player: "self", name: "Uta" },
  then: effect,
});

/**
 * P-002's whole-hand refresh, and P-057's and P-058's `[Main]` halves -- each
 * printed on a card whose `[Trigger]` re-runs the same program.
 */
export const handRefresh: MechanicProgram = {
  effect: {
    kind: "select",
    selector: { player: "self", zone: "hand" },
    bind: "p002-hand",
    count: "all",
    effect: {
      kind: "sequence",
      effects: [
        {
          kind: "move",
          binding: "p002-hand",
          to: { player: "self", zone: "deck" },
        },
        { kind: "shuffle-deck", player: "self" },
        {
          kind: "draw",
          player: "self",
          count: 0,
          perCards: { binding: "p002-hand", each: 1 },
        },
      ],
    },
  },
};

/** P-057's rest-lock, printed on its `[Main]` and its `[Trigger]` alike. */
export const utaRestLock: MechanicProgram = {
  effect: ifUtaLeader(restLock(4, "p057-lock", 2)),
};

/** P-058's refresh of the {FILM} board, at the end of the turn. */
export const utaRefreshAtEndOfTurn: MechanicProgram = {
  effect: ifUtaLeader({
    kind: "select",
    selector: {
      player: "self",
      zone: "board",
      category: "character",
      type: "FILM",
    },
    bind: "p058-film",
    count: "all",
    // The debt is booked against the cards the binding holds, and paid when
    // the turn ends -- which is what makes this the Event that lets a {FILM}
    // board attack and still block. A `update: { rested: false }` here would
    // set them active now, on a turn they have not attacked with yet.
    effect: {
      kind: "at-end-of-turn",
      binding: "p058-film",
      action: "set-active",
    },
  }),
};

export const promoMainMechanics: SetMechanics = {
  activateMain: [
    [
      // P-073 Sabo: once a turn, a Life card into hand buys this body +1000 for
      // the turn.
      //
      // Yellow's trade, at the smallest rate it is printed at: one Life for
      // 1000 power is a bad exchange on its own, and what makes it a card is
      // that the Life goes to *hand*, so the turn it is spent it is also a
      // Counter. `position: "edge"` is the printed "top or bottom", which is
      // the choice `lifeToHandCost` exists for -- taking from the bottom leaves
      // the known top card where it is.
      //
      // `requires.lifeCards` withholds the activation from a seat with an empty
      // Life stack, rather than offering a cost nothing can pay.
      "P-073",
      {
        oncePerTurn: true,
        requires: { lifeCards: 1 },
        program: lifeToHandCost({
          kind: "modify-power",
          binding: SOURCE_BINDING,
          amount: 1_000,
          expiresAfterTurns: 0,
        }),
      },
    ],
    [
      // P-074 Portgas.D.Ace: the body goes back to hand, and the top five cards
      // of the deck are sorted.
      //
      // Five deep and either end, which is the deepest look in the promo pool,
      // and the price is a whole body off the board. That is the reading the
      // card wants: it is a 3-cost that is cast, blocks or attacks once, and is
      // then cashed in for the rest of the game's draws when the board no
      // longer needs it.
      //
      // Repeatable rather than `[Once Per Turn]`, because the clause limits
      // itself -- the source leaves the field -- and the look resolves after
      // the return, as printed.
      "P-074",
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
                  to: { player: "owner", zone: "hand" },
                },
                lookAndReplace(5, "p074-sort", true),
              ],
            },
          },
        },
      },
    ],
    [
      // P-005 Kaido: two DON!! back to the DON!! deck buy [Banish] for the
      // turn, so the damage this 8000 deals takes the Life card out of the
      // game rather than handing over a Trigger.
      "P-005",
      {
        oncePerTurn: false,
        requires: { fieldDon: 2 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "field-don",
              player: "self",
              operator: "gte",
              value: 2,
            },
            then: {
              kind: "optional",
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "return-don", player: "self", count: 2 },
                  {
                    kind: "grant-keyword",
                    binding: SOURCE_BINDING,
                    keyword: "Banish",
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
      // P-008 Yamato: resting itself rests a cheap opposing body.
      //
      // Not "up to": the printed clause rests one, so the `choose` is `min: 1`
      // and the whole thing sits inside the `optional` that pays for it --
      // which means a board with nothing cheap enough is simply not worth
      // taking, rather than a cost paid for nothing.
      "P-008",
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
                    maxCost: 2,
                    canRest: true,
                  },
                  bind: "p008-rest",
                  min: 1,
                  max: 1,
                  effect: { kind: "rest", binding: "p008-rest" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // P-011 Uta (Leader): once a turn, one DON!! turned over buys +2000 on a
      // Character with no printed effect box.
      //
      // `noBaseEffect` reads `rules.hasPrintedEffect`, so a Character whose
      // only text is a `[Trigger]` -- which sits in its own field -- is a legal
      // target. The clause is the Leader's whole reason to run vanilla bodies.
      "P-011",
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
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    noBaseEffect: true,
                  },
                  bind: "p011-buff",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "modify-power",
                    binding: "p011-buff",
                    amount: 2_000,
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
      // P-013 Gordon: burying itself buys −3000 on an opposing body for the
      // turn -- the largest power debuff a 1-cost can pay for, and it costs
      // the body.
      "P-013",
      {
        oncePerTurn: false,
        program: { effect: buryCost(powerDebuff(3_000, "p013-debuff")) },
      },
    ],
    [
      // P-033 Monkey.D.Luffy: the same self-bury, for a card.
      "P-033",
      {
        oncePerTurn: false,
        program: {
          effect: buryCost({ kind: "draw", player: "self", count: 1 }),
        },
      },
    ],
    [
      // P-062 Hody & Hyouzou: once a turn, a cheap opposing body is rested,
      // this Character grows, and the top Life card joins the hand.
      //
      // Three halves in one clause and none of them is a cost, so they
      // sequence flat. The Life card is a real price -- the Life total drops
      // by one -- which is what a repeatable-looking rest is paying.
      "P-062",
      {
        oncePerTurn: true,
        requires: { lifeCards: 1 },
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
                  maxCost: 4,
                  canRest: true,
                },
                bind: "p062-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "p062-rest" },
              },
              {
                kind: "modify-power",
                binding: SOURCE_BINDING,
                amount: 1_000,
                expiresAfterTurns: 0,
              },
              {
                kind: "select",
                selector: { player: "self", zone: "life", position: "top" },
                bind: "p062-life",
                count: 1,
                effect: {
                  kind: "move",
                  binding: "p062-life",
                  to: { player: "self", zone: "hand" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // P-068 Sanji: trashing itself buys the same five-deep sort P-049 gets
      // for free on arrival.
      "P-068",
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
                  trashedNotKoed: true,
                },
                sortFiveDeep("p068-sort").effect,
              ],
            },
          },
        },
      },
    ],
    [
      // P-069 Koala: once a turn, a rested DON!! moves onto the Leader or a
      // Character, free.
      "P-069",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: { kind: "give-rested-don", player: "self", count: 1 },
        },
      },
    ],
    [
      // P-076 Sakazuki (Leader): once a turn, a {Navy} card out of hand buys
      // −1 cost on an opposing body for the turn.
      //
      // Small on its own; what it is for is the "cost N or less" removal the
      // Black half of this Leader's deck runs. `handCardsMatching` gates the
      // offer on a {Navy} card actually being there.
      "P-076",
      {
        oncePerTurn: true,
        requires: { handCardsMatching: { match: { type: "Navy" }, count: 1 } },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand", type: "Navy" },
              "p076-cost",
              1,
              costDebuff(1, "p076-debuff"),
            ),
          },
        },
      },
    ],
    [
      // P-081 Dracule Mihawk: returning itself to hand plays a 5-cost
      // {Cross Guild} body out of hand, but only off a board three deep in
      // them.
      //
      // The return is the cost and the count is the effect, so the three are
      // counted *after* Mihawk has left: the board it needs is three others
      // beside it. "with a cost of 5" is exact rather than a ceiling, so the
      // band is closed at both ends.
      "P-081",
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
                  to: { player: "owner", zone: "hand" },
                },
                {
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "self",
                    selector: {
                      zone: "board",
                      category: "character",
                      color: "Blue",
                      type: "Cross Guild",
                    },
                    operator: "gte",
                    value: 3,
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "hand",
                      category: "character",
                      type: "Cross Guild",
                      minCost: 5,
                      maxCost: 5,
                    },
                    bind: "p081-play",
                    min: 0,
                    max: 1,
                    effect: { kind: "play", binding: "p081-play" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // P-091 Shirahoshi: resting itself lets a {Neptunian} body attack a
      // Character the turn it was played.
      //
      // [Rush: Character] granted for the turn, which is the keyword that
      // sentence spells out. Its `[On Play]` half is in `promo-on-play.ts`.
      "P-091",
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
                    player: "self",
                    zone: "board",
                    category: "character",
                    type: "Neptunian",
                  },
                  bind: "p091-rush",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "grant-keyword",
                    binding: "p091-rush",
                    keyword: "Rush: Character",
                    expiresAfterTurns: 0,
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
    // P-002 I Smell Adventure!!!: the whole hand back under the deck, and the
    // same number back. Its `[Trigger]` re-runs the same program.
    ["P-002", { cost: 1, program: handRefresh }],
    [
      // P-024 I'm Gonna Be King of the Pirates!!: the Leader gains 1000 for
      // every Character its controller has.
      //
      // `perCards` on the modifier rather than a `battle-power`, because the
      // printed words are "during this turn": a `[Main]` Event is played with
      // no battle open at all.
      "P-024",
      {
        cost: 2,
        program: {
          effect: {
            kind: "select",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
            },
            bind: "p024-crew",
            count: "all",
            effect: {
              kind: "select",
              selector: { player: "self", zone: [], includeLeader: true },
              bind: "p024-leader",
              count: 1,
              effect: {
                kind: "modify-power",
                binding: "p024-leader",
                amount: 1_000,
                expiresAfterTurns: 0,
                perCards: { binding: "p024-crew", each: 1 },
              },
            },
          },
        },
      },
    ],
    // P-057 Fleeting Lullaby: two rested opposing bodies held down through the
    // opponent's Refresh Phase, behind the named Leader.
    ["P-057", { cost: 3, program: utaRestLock }],
    // P-058 Where the Wind Blows: the {FILM} board comes back active at the
    // end of the turn, so every one of them has attacked and can still block.
    ["P-058", { cost: 2, program: utaRefreshAtEndOfTurn }],
    [
      // P-060 Tot Musica: resting an [Uta] rests two of the opponent's DON!!.
      //
      // `rest-opponent-cards` reaches the DON!! area, which no `choose` over a
      // `CardZone` can: DON!! sits in the cost area and is not a zone at all.
      // The cost names the card by name, so any [Uta] its controller has --
      // Leader or Character -- can pay it.
      "P-060",
      {
        cost: 2,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                includeLeader: true,
                name: "Uta",
                rested: false,
              },
              bind: "p060-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: "p060-cost" },
                  {
                    kind: "rest-opponent-cards",
                    player: "opponent",
                    count: 2,
                    // The printed clause names DON!! alone. This node is still
                    // the right one -- nothing else in the DSL can rest a DON!!
                    // -- and `donOnly` is what keeps the Character half off the
                    // offer.
                    donOnly: true,
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
