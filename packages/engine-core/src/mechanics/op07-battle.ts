/**
 * OP07 battle-window clauses: `[Counter]` Events, `[When Attacking]` and
 * `[On Your Opponent's Attack]`.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP07-0xx` prints it from the local cache).
 *
 * OP07-056 Slave Arrow is deliberately absent: it was in the pool before the
 * set was, as a card a community deck ships, and both halves of it are
 * implemented as card-number branches in `legal-actions/counter.ts` and
 * `actions/activate-counter-event.ts`. It is named in
 * `LEGACY_IMPERATIVE_CARDS`, and registering a program for it here would be a
 * second implementation of the same clause rather than a migration.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lifeToHandCost, trashForBattlePower } from "./shared.js";
import { costDebuff, deckTopToLife, koCostAtMost } from "./op08-shared.js";
import {
  addDonRested,
  blazeSlice,
  cpCard,
  donBehind,
  lifeAtMost,
  restCostAtMost,
  trashAtLeastTen,
} from "./op07-shared.js";

/** "If you have 3 or more Characters" -- OP07-034 and OP07-035's payoff gate. */
const threeOwnCharacters = {
  kind: "selector-count",
  player: "self",
  selector: { zone: "board", category: "character" },
  operator: "gte",
  value: 3,
} as const;

export const op07BattleMechanics: SetMechanics = {
  counterEvent: [
    [
      // OP07-018 KEEP OUT (1): +2000 that outlives the battle.
      //
      // `power: 0` with the work in the program, because the printed words are
      // "until the end of your next turn" rather than "during this battle": a
      // battle-scoped scalar would vanish the moment the fight ended, and this
      // clause is meant to leave a body standing for the controller's own turn
      // as well. The committed clause summary reads the same way, so the offer
      // promises no Counter power the resolution will not add.
      "OP07-018",
      {
        cost: 1,
        power: 0,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              category: "character",
              type: "Revolutionary Army",
            },
            bind: "op07-keepout-buff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "op07-keepout-buff",
              amount: 2_000,
              expiresAfterTurns: 1,
            },
          },
        },
      },
    ],
    [
      // OP07-035 Karmic Punishment (1): 2000, and 3000 on a wide board.
      //
      // The second half is "that card gains an additional +1000", which is the
      // same battle scalar again -- so it is a `battle-power` in the program
      // rather than a second number in the entry, and the engine's own
      // forecast resolves the board condition for real.
      "OP07-035",
      {
        cost: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "if",
            condition: threeOwnCharacters,
            then: { kind: "battle-power", player: "self", amount: 1_000 },
          },
        },
      },
    ],
    [
      // OP07-055 Snake Dance (2): the set's biggest Counter, paid for by
      // picking one of the controller's own Characters back up.
      //
      // "Up to 1", so the return is declinable and the power lands either way:
      // Bandai prints the bounce as an upside on this deck -- every Kuja body
      // carries an `[On Play]` -- rather than as a cost.
      "OP07-055",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "board", category: "character" },
            bind: "op07-snake-bounce",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op07-snake-bounce",
              to: { player: "owner", zone: "hand" },
            },
          },
        },
      },
    ],
    [
      // OP07-075 Slow-Slow Beam (1): `DON!! −1` for a debuff on both of the
      // opponent's ends at once.
      //
      // Not a Counter buff at all -- the power moves on the *attacker's* side of
      // the table -- so `power: 0` and two `choose` steps, one per printed
      // half. "Up to 1 each" is what makes them two: a single selector with
      // `includeLeader` would let both go on the Leader.
      //
      // The `DON!! −1` is declared on the entry rather than paid in the
      // program, which is how every other priced Counter in the pool reads it:
      // the offer has to know the price, and `activate-counter-event.ts` pays
      // it before the program runs.
      "OP07-075",
      {
        cost: 1,
        donMinus: 1,
        power: 0,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: { player: "opponent", zone: [], includeLeader: true },
                bind: "op07-beam-leader",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op07-beam-leader",
                  amount: -2_000,
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "op07-beam-character",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op07-beam-character",
                  amount: -2_000,
                  expiresAfterTurns: 0,
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP07-076 Slow-Slow Beam Sword (2): `DON!! −1` for 2000 and a rest.
      //
      // The rest has no cost ceiling at all, which is unusual for the set and
      // is what makes this a two-for-one on the opponent's next turn as well as
      // this one.
      "OP07-076",
      {
        cost: 2,
        donMinus: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              canRest: true,
            },
            bind: "op07-sword-rest",
            min: 0,
            max: 1,
            effect: { kind: "rest", binding: "op07-sword-rest" },
          },
        },
      },
    ],
    [
      // OP07-094 Shave (1): 2000, and a "CP" body back in hand off a deep
      // trash.
      //
      // The trash is read *after* this Event has been trashed as part of being
      // played, so a deck sitting on nine crosses the line by casting it --
      // which is what `counterEventForecastPower` accounts for.
      "OP07-094",
      {
        cost: 1,
        power: 2_000,
        program: {
          effect: {
            kind: "if",
            condition: trashAtLeastTen,
            then: {
              kind: "choose",
              selector: {
                ...cpCard,
                player: "self",
                zone: "board",
                category: "character",
              },
              bind: "op07-shave-bounce",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op07-shave-bounce",
                to: { player: "owner", zone: "hand" },
              },
            },
          },
        },
      },
    ],
    [
      // OP07-095 Iron Body (2): 4000, and 6000 off a deep trash. Both halves
      // are the same battle scalar, so the second is a `battle-power`.
      "OP07-095",
      {
        cost: 2,
        power: 4_000,
        program: {
          effect: {
            kind: "if",
            condition: trashAtLeastTen,
            then: { kind: "battle-power", player: "self", amount: 2_000 },
          },
        },
      },
    ],
    [
      // OP07-115 I Re-Quasar Helllp!! (1): 3000, but only from two Life or
      // fewer.
      //
      // `powerWhen` rather than a program: the payout is a plain number gated
      // on board state the defender can see before the offer is made, so the
      // forecast in the action summary stays honest -- above the ceiling it
      // reads "adds nothing to this battle" instead of promising 3000.
      "OP07-115",
      { cost: 1, power: 3_000, powerWhen: lifeAtMost(2) },
    ],
    [
      // OP07-116 Blaze Slice (1): the `[Counter]` half of the set's only
      // dual-window Event. The same program is registered for its `[Main]` half
      // in `op07-main.ts`.
      "OP07-116",
      { cost: 1, power: 0, program: blazeSlice },
    ],
  ],
  whenAttacking: [
    [
      // OP07-011 Bluejam: `[DON!! x1]` buys removal on the swing.
      //
      // Current power, which is what "2000 power or less" means about a card
      // already on the board -- a body this set's own debuffs have shrunk is
      // inside it.
      "OP07-011",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCurrentPower: 2_000,
            },
            bind: "op07-bluejam-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op07-bluejam-ko" },
          },
        },
      },
    ],
    [
      // OP07-034 Roronoa Zoro: a 1-cost 2000 that swings for 4000 on a wide
      // board, which is the Red rush deck's whole plan.
      "OP07-034",
      {
        effect: {
          kind: "if",
          condition: threeOwnCharacters,
          then: {
            kind: "modify-power",
            binding: SOURCE_BINDING,
            amount: 2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP07-039 Edward Weevil: `[DON!! x1]` for a look three deep, placed at
      // either end.
      //
      // A `look-at` rather than a draw: the cards stay in the deck and the
      // player chooses the order and the split, which is what "at the top or
      // bottom of the deck in any order" is. `order-to-bottom`'s `alternate` is
      // the pool's shape for that split.
      "OP07-039",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "source-attached-don",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "sequence",
            effects: [
              {
                kind: "look-at",
                player: "self",
                count: 3,
                bind: "op07-weevil-look",
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op07-weevil-look",
                },
                bind: "op07-weevil-place",
                count: "all",
                effect: {
                  kind: "order-to-bottom",
                  binding: "op07-weevil-place",
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
      },
    ],
    [
      // OP07-059 Foxy (Leader): `DON!! −3` holds the other Leader *and* a
      // Character down through a whole Refresh Phase.
      //
      // The Leader half is what the clause is for and what nothing in the pool
      // could express before it: a Leader is in no zone and has no board entry
      // to write `cannot-refresh` onto, so the hold lives on the player -- see
      // `PlayerState.leaderCannotRefreshUntilTurn`. It is mandatory ("select
      // your opponent's rested Leader") and so a `select` rather than a
      // `choose`, which also makes it a no-op against a Leader that is still
      // active; the Character half is the printed "up to 1".
      //
      // `DON!! −3` is paid inside the program, because a `[When Attacking]`
      // entry has no cost line for the engine to pay: the `field-don` gate is
      // what keeps declining and being unable to pay from collapsing into one
      // answer.
      "OP07-059",
      {
        oncePerTurn: false,
        requires: { fieldDon: 3 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 3 },
                {
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "self",
                    selector: {
                      zone: "board",
                      category: "character",
                      type: "Foxy Pirates",
                    },
                    operator: "gte",
                    value: 3,
                  },
                  then: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "select",
                        selector: {
                          player: "opponent",
                          zone: [],
                          includeLeader: true,
                          rested: true,
                        },
                        bind: "op07-foxy-leader",
                        count: "all",
                        effect: {
                          kind: "restrict",
                          binding: "op07-foxy-leader",
                          restriction: "cannot-refresh",
                          expiresAfterTurns: 1,
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
                        bind: "op07-foxy-character",
                        min: 0,
                        max: 1,
                        effect: {
                          kind: "restrict",
                          binding: "op07-foxy-character",
                          restriction: "cannot-refresh",
                          expiresAfterTurns: 1,
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
      // OP07-068 Hamburg: `[DON!! x1]` and behind on DON!! -- a 5-cost body
      // that pays back a DON!! every time it swings.
      "OP07-068",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "source-attached-don", operator: "gte", value: 1 },
              donBehind,
            ],
          },
          then: addDonRested,
        },
      },
    ],
    [
      // OP07-079 Rob Lucci (Leader): two cards off the top of the deck for a
      // cost debuff, every turn the Leader swings.
      //
      // The mill is the point as much as the price: the whole Black package
      // reads the trash count back, and this is what fills it. Declinable, and
      // the payoff is nested behind the trash so declining keeps both halves.
      "OP07-079",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "sequence",
            effects: [
              { kind: "trash-top", player: "self", count: 2 },
              costDebuff(1, "op07-lucci-leader-debuff"),
            ],
          },
        },
      },
    ],
    [
      // OP07-091 Monkey.D.Luffy: a small body trashed, then the trash emptied
      // back into the deck for power.
      //
      // "Trash", not "K.O.": nothing keyed on a K.O. fires, which is the whole
      // difference between this and the set's other removal. The buff is
      // +1000 per completed *three* cards placed, which is what `perCards`
      // carries -- eight cards is four thousand, not eight.
      "OP07-091",
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
                maxCost: 2,
              },
              bind: "op07-luffy-trash",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "op07-luffy-trash",
                to: { player: "owner", zone: "trash" },
              },
            },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                category: "character",
                minCost: 4,
              },
              bind: "op07-luffy-bury",
              min: 0,
              // "Any number", which the deck's own mill makes a real range: the
              // ceiling is the largest a trash can plausibly reach rather than
              // a printed figure.
              max: 50,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "order-to-bottom",
                    binding: "op07-luffy-bury",
                    to: { player: "self", zone: "deck", position: "bottom" },
                  },
                  {
                    kind: "modify-power",
                    binding: SOURCE_BINDING,
                    amount: 1_000,
                    expiresAfterTurns: 0,
                    perCards: { binding: "op07-luffy-bury", each: 3 },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    [
      // OP07-106 Fuza: `[DON!! x1]` and one Life left. The narrowest gate in
      // the Yellow package and the cheapest removal behind it.
      "OP07-106",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "source-attached-don", operator: "gte", value: 1 },
              lifeAtMost(1),
            ],
          },
          then: koCostAtMost(3, "op07-fuza-ko"),
        },
      },
    ],
    [
      // OP07-112 Lucy: a Life card into hand buys a rest, and from one Life the
      // card pays itself back.
      //
      // `lifeCardsMatching` gates the offer on there being a card at an edge of
      // the Life stack to spend: without it the `[Once Per Turn]` would be
      // spent on a prompt with nothing behind it. The refill is read *after*
      // the payment, which is the printed order and is why a player at two Life
      // does not get it.
      "OP07-112",
      {
        oncePerTurn: true,
        requires: {
          lifeCardsMatching: { match: { position: "edge" }, count: 1 },
        },
        program: lifeToHandCost({
          kind: "sequence",
          effects: [
            restCostAtMost(4, "op07-lucy-rest"),
            {
              kind: "if",
              condition: lifeAtMost(1),
              then: deckTopToLife("op07-lucy-refill"),
            },
          ],
        }),
      },
    ],
  ],
  onOpponentAttack: [
    [
      // OP07-010 Baccarat: a card from hand for +2000 in the open battle, once
      // a turn, on top of the printed [Blocker].
      //
      // The buff may land on the Leader or on a Character, which is what the
      // battle scalar already means: whichever of them this player has in the
      // fight is the card that carries their power.
      "OP07-010",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: trashForBattlePower(2_000, "op07-baccarat-cost"),
      },
    ],
    [
      // OP07-019 Jewelry Bonney (Leader): a rested DON!! rests one of the
      // opponent's cards mid-attack.
      //
      // A rest during the block step is not a block: it takes the card out of
      // the *next* attack, and against a Leader it takes the opponent's own
      // swing away. `canRest` is what keeps an already-rested card, or one an
      // effect has protected, out of the offer -- resting a rested card is not
      // a payout, and taking the offer would spend the turn's one use.
      "OP07-019",
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
                    player: "opponent",
                    zone: "board",
                    includeLeader: true,
                    canRest: true,
                  },
                  bind: "op07-bonney-rest",
                  min: 0,
                  max: 1,
                  effect: { kind: "rest", binding: "op07-bonney-rest" },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP07-024 Koala: rests itself to hand [Blocker] to something bigger.
      //
      // A 3-cost 0-power body turning into a 5-cost Fish-Man's block is the
      // Green deck's answer to a swing it cannot afford to take, and the cost
      // is exactly the block Koala itself could have made. No `[Once Per Turn]`
      // is printed and none is needed: the cost is the card, so it is once per
      // copy per turn by construction.
      "OP07-024",
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
                    type: "Fish-Man",
                    maxCost: 5,
                  },
                  bind: "op07-koala-grant",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "grant-keyword",
                    binding: "op07-koala-grant",
                    keyword: "Blocker",
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
};
