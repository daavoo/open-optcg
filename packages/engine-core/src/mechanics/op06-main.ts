/**
 * OP06 `[Main]` Events and `[Activate: Main]` programs.
 *
 * Split by timing window like every other whole-set import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do rather
 * than quoting the card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text OP06-0xx` prints it from the local cache).
 *
 * Three OP06 identities the community decks ship stay in the modules named
 * after those decks rather than here: OP06-022 and OP06-118 (`op06-yamato.ts`)
 * and OP06-058, whose `[Main]` Event was migrated off the hand-written register
 * into this file before the set was imported and stays where it was.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, payFromHand } from "./shared.js";
import { costDebuff, koCostAtMost, powerDebuff } from "./op08-shared.js";
import {
  buffOwnCardForTurn,
  donBehind,
  restCostAtMost,
} from "./op07-shared.js";
import {
  buryOpponentCostAtMost,
  germaSwapUp,
  koPowerAtMost,
  koRestedCostAtMost,
  lifeTopToHand,
  payWithStage,
  thrillerBarkLeader,
} from "./op06-shared.js";

/** "Your Leader gains +N power during this turn." */
const buffOwnLeader = (
  amount: number,
  bind: string,
  perCards?: { binding: string; each: number },
): MechanicEffect => ({
  kind: "select",
  selector: { player: "self", zone: [], includeLeader: true },
  bind,
  count: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount,
    expiresAfterTurns: 0,
    ...(perCards ? { perCards } : {}),
  },
});

/**
 * OP06-095 Shadows Asgard, printed on the `[Main]` and the `[Counter]` alike:
 * one program, registered from both tables.
 *
 * The second buff is paid per Character K.O.'d, which is what `perCards` with
 * `each: 1` says -- the binding the `choose` filled is the count. The first
 * +1000 lands whether or not anything is K.O.'d, so it is sequenced ahead of
 * the choice rather than nested inside it.
 *
 * "Any number" is a `max` the board can never exceed: five Characters is the
 * board limit, so a wider maximum would only add options that cannot be taken.
 */
const shadowsAsgard: MechanicEffect = {
  kind: "sequence",
  effects: [
    buffOwnLeader(1_000, "op06-asgard-base"),
    {
      kind: "choose",
      selector: {
        player: "self",
        zone: "board",
        category: "character",
        type: "Thriller Bark Pirates",
        maxCost: 2,
      },
      bind: "op06-asgard-fodder",
      min: 0,
      max: 5,
      effect: {
        kind: "sequence",
        effects: [
          { kind: "knock-out", binding: "op06-asgard-fodder" },
          buffOwnLeader(1_000, "op06-asgard-bonus", {
            binding: "op06-asgard-fodder",
            each: 1,
          }),
        ],
      },
    },
  ],
};

/**
 * "Your Characters with a cost of C or less cannot be K.O.'d in battle during
 * this turn." -- OP06-096, printed on its `[Counter]` and re-run by its own
 * `[Trigger]`.
 *
 * A `select` over the whole board rather than a choice: the clause names every
 * qualifying Character. `battle-ko-immune` and not `ko-immune` -- the sentence
 * names a battle, and an effect's K.O. still kills these bodies.
 */
export const battleShield: MechanicEffect = {
  kind: "select",
  selector: {
    player: "self",
    zone: "board",
    category: "character",
    maxCost: 7,
  },
  bind: "op06-nothing-at-all",
  count: "all",
  effect: {
    kind: "restrict",
    binding: "op06-nothing-at-all",
    restriction: "battle-ko-immune",
    expiresAfterTurns: 0,
  },
};

/**
 * OP06-039 You Ain't Even Worth Killing Time!!, printed on the `[Main]` and
 * re-run by its own `[Trigger]`: one program, registered from both tables.
 *
 * The two branches read the same ceiling and differ in what they do with it,
 * which is why the rest half has no `rested` filter and the K.O. half does.
 */
/**
 * OP06-040 Shark Arrows, printed on the `[Main]` and re-run by its own
 * `[Trigger]`: one program, registered from both tables.
 */
export const sharkArrows: MechanicEffect = {
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    rested: true,
    maxCost: 3,
  },
  bind: "op06-shark-arrows",
  min: 0,
  max: 2,
  effect: { kind: "knock-out", binding: "op06-shark-arrows" },
};

/**
 * OP06-056 Ama no Murakumo Sword, printed on the `[Main]` and re-run by its own
 * `[Trigger]`: two bodies under the deck, each with its own ceiling.
 *
 * Two `choose` steps rather than one, because the ceilings differ -- and the
 * second excludes the first, since one Character cannot fill both halves of the
 * sentence. "In any order" is about where they land in the deck, which for two
 * cards going under it is not a decision worth asking.
 */
// Both picks first, then one placement: the two go under the deck together,
// in the order their owner chooses (Bandai's OP06-056#1).
export const murakumoSword: MechanicEffect = {
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
      bind: "op06-murakumo-first",
      min: 0,
      max: 1,
      effect: { kind: "sequence", effects: [] },
    },
    {
      kind: "choose",
      selector: {
        player: "opponent",
        zone: "board",
        category: "character",
        maxCost: 1,
        excludeBinding: "op06-murakumo-first",
      },
      bind: "op06-murakumo-second",
      min: 0,
      max: 1,
      effect: { kind: "sequence", effects: [] },
    },
    {
      kind: "order-to-bottom",
      binding: "op06-murakumo-first",
      also: ["op06-murakumo-second"],
      byOwner: true,
      to: { player: "owner", zone: "deck", position: "bottom" },
    },
  ],
};

export const killingTime: MechanicEffect = {
  kind: "choice",
  branches: [
    {
      id: "rest",
      label: "Rest a Character with a cost of 6 or less",
      effect: restCostAtMost(6, "op06-killing-time-rest"),
    },
    {
      id: "ko",
      label: "K.O. a rested Character with a cost of 6 or less",
      effect: koRestedCostAtMost(6, "op06-killing-time-ko"),
    },
  ],
};

/** "Trash 1 card from your opponent's hand" -- they choose which. */
const opponentDiscardsOne = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "hand" },
  bind,
  chooser: "opponent",
  min: 1,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "owner", zone: "trash" },
  },
});

/** OP06-097 Negative Hollow, printed on the `[Main]` and re-run by its own `[Trigger]`. */
export const negativeHollow: MechanicEffect = opponentDiscardsOne(
  "op06-negative-hollow",
);

export const op06MainMechanics: SetMechanics = {
  eventMain: [
    [
      // OP06-017 Meteor-Strike of Love (2): a Life card for +3000, printed on
      // the `[Main]` and the `[Counter]` alike.
      //
      // Turn-scoped rather than battle-scoped, which is what "during this
      // turn" says: the same program serves both windows, and on the Counter
      // side the raised card is the one being attacked, so the battle reads it
      // through `currentPower` rather than through the battle's own scalar.
      "OP06-017",
      {
        cost: 2,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "top" },
              bind: "op06-meteor-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op06-meteor-cost",
                    to: { player: "self", zone: "hand" },
                  },
                  buffOwnCardForTurn(3_000, "op06-meteor"),
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP06-018 Gum-Gum King Kong Gatling (2): +3000, and +1000 more while the
      // opponent is holding something big.
      //
      // The second buff is its own choice, so the two can land on different
      // cards -- which is the printed reading of two "up to 1" sentences, and
      // occasionally the right play: +3000 on the attacker and +1000 on the
      // body that has to survive the crack-back.
      "OP06-018",
      {
        cost: 2,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(3_000, "op06-gatling"),
              {
                kind: "if",
                condition: {
                  kind: "selector-count",
                  player: "opponent",
                  selector: {
                    zone: "board",
                    category: "character",
                    minCurrentPower: 7_000,
                  },
                  operator: "gte",
                  value: 1,
                },
                then: buffOwnCardForTurn(1_000, "op06-gatling-bonus"),
              },
            ],
          },
        },
      },
    ],
    [
      // OP06-019 Blue Dragon Seal Water Stream (3): removal by power rather
      // than by cost, which reaches a cheap body the opponent has pumped.
      "OP06-019",
      {
        cost: 3,
        program: { effect: koPowerAtMost(5_000, "op06-water-stream") },
      },
    ],
    [
      // OP06-039 You Ain't Even Worth Killing Time!! (4): rest a body, or kill
      // one that has already attacked. Printed on the `[Main]` and re-run by
      // its own `[Trigger]`.
      "OP06-039",
      { cost: 4, program: { effect: killingTime } },
    ],
    [
      // OP06-040 Shark Arrows (2): two cheap rested bodies at once, which is
      // what the Fish-Man deck's own rest effects set up. Printed on the
      // `[Main]` and re-run by its own `[Trigger]`.
      "OP06-040",
      { cost: 2, program: { effect: sharkArrows } },
    ],
    [
      // OP06-056 Ama no Murakumo Sword (2): two bodies under the deck, each
      // with its own ceiling.
      //
      // Two `choose` steps rather than one, because the ceilings differ -- and
      // the second excludes the first, since one Character cannot fill both
      // halves of the sentence. "In any order" is about where they land in the
      // deck, which for two cards going under it is not a decision worth
      // asking.
      "OP06-056",
      { cost: 2, program: { effect: murakumoSword } },
    ],
    [
      // OP06-057 But I Will Never Doubt a Woman's Tears!!!! (1): a small buff
      // and a coin flip on the top card of the deck.
      //
      // "A cost of 2" is exact rather than a ceiling, so it is `minCost` and
      // `maxCost` together. A public `reveal` and not a private look -- the
      // printed word is what the difference is -- and what is not played goes
      // to either end of the deck, which is the decision `order-to-bottom`'s
      // `alternate` asks.
      "OP06-057",
      {
        cost: 1,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(1_000, "op06-tears"),
              {
                kind: "look-at",
                player: "self",
                count: 1,
                bind: "op06-tears-look",
              },
              { kind: "reveal", binding: "op06-tears-look" },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op06-tears-look",
                  category: "character",
                  minCost: 2,
                  maxCost: 2,
                },
                bind: "op06-tears-play",
                min: 0,
                max: 1,
                effect: { kind: "play", binding: "op06-tears-play" },
              },
              {
                kind: "select",
                selector: {
                  player: "self",
                  zone: "deck",
                  binding: "op06-tears-look",
                },
                bind: "op06-tears-rest",
                count: "all",
                effect: {
                  kind: "order-to-bottom",
                  binding: "op06-tears-rest",
                  to: { player: "self", zone: "deck", position: "bottom" },
                  alternate: {
                    player: "self",
                    zone: "deck",
                    position: "top",
                  },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP06-058 Gravity Blade Raging Tiger (7): `pnpm card:text OP06-058`.
      //
      // Migrated off the hand-written `[Main]` Event register. The clause names Characters on both
      // sides of the table, which is what `player: "either"` says, and that is
      // also why the destination is `"owner"` rather than a fixed seat: a
      // binding filled from both boards has two owners, and each card goes
      // under its own deck.
      //
      // `maxCost` is the effective cost, which is what the branch this
      // replaces read -- unlike OP11-061 Culverin beside it, whose own branch
      // read the printed number.
      "OP06-058",
      {
        cost: 7,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "either",
              zone: "board",
              category: "character",
              maxCost: 6,
            },
            bind: "op06-gravity",
            min: 0,
            max: 2,
            effect: {
              kind: "order-to-bottom",
              binding: "op06-gravity",
              byOwner: true,
              to: { player: "owner", zone: "deck", position: "bottom" },
            },
          },
        },
      },
    ],
    [
      // OP06-077 Black Bug (4): the GERMA removal, behind the archetype's own
      // "behind on DON!!" gate. The `[Trigger]` half is the same clause a
      // cost lower and without the gate.
      "OP06-077",
      {
        cost: 4,
        program: {
          effect: {
            kind: "if",
            condition: donBehind,
            then: buryOpponentCostAtMost(5, "op06-black-bug"),
          },
        },
      },
    ],
    [
      // OP06-078 GERMA 66 (1): the archetype's search, five deep.
      //
      // `typeIncluding` and not `type`: the printed clause names a type
      // *including* "GERMA", which is the one reading that reaches both
      // {GERMA 66} and {Kingdom of GERMA} -- two of the five bodies the deck
      // wants are the second.
      "OP06-078",
      {
        cost: 1,
        program: lookAndAdd(5, "op06-germa-search", {
          typeIncluding: "GERMA",
          excludeName: "GERMA 66",
        }),
      },
    ],
    [
      // OP06-095 Shadows Asgard (2): the Leader's own buff, paid for with the
      // cheap bodies the Thriller Bark deck keeps replaying.
      "OP06-095",
      { cost: 2, program: { effect: shadowsAsgard } },
    ],
    [
      // OP06-097 Negative Hollow (2): a discard the opponent chooses.
      "OP06-097",
      { cost: 2, program: { effect: negativeHollow } },
    ],
    [
      // OP06-116 Reject (4): removal, or the last point of damage.
      //
      // The second branch is Yellow's own shape: it only reaches for the win
      // while the opponent is on their last Life card, and the Life card it
      // then adds to the hand is the price. The price sits inside the same
      // condition: off 1 Life the branch does nothing at all (Q&A OP06-116#1).
      "OP06-116",
      {
        cost: 4,
        program: {
          effect: {
            kind: "choice",
            branches: [
              {
                id: "ko",
                label: "K.O. a Character with a cost of 5 or less",
                effect: koCostAtMost(5, "op06-reject-ko"),
              },
              {
                id: "damage",
                label: "Deal 1 damage while your opponent is on 1 Life",
                effect: {
                  kind: "if",
                  condition: {
                    kind: "zone-count",
                    player: "opponent",
                    zone: "life",
                    operator: "eq",
                    value: 1,
                  },
                  then: {
                    kind: "sequence",
                    effects: [
                      { kind: "deal-damage", player: "opponent" },
                      lifeTopToHand,
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
  ],
  counterEvent: [
    [
      // OP06-017 Meteor-Strike of Love, the `[Counter]` half of the same
      // sentence: `power: 0` with an `optional` program is the type's shape for
      // a payout that depends on an answer rather than on board state -- see
      // `counterEventPower`, which reports "decided as it resolves" for it.
      "OP06-017",
      {
        cost: 2,
        power: 0,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "top" },
              bind: "op06-meteor-counter-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op06-meteor-counter-cost",
                    to: { player: "self", zone: "hand" },
                  },
                  buffOwnCardForTurn(3_000, "op06-meteor-counter"),
                ],
              },
            },
          },
        },
      },
    ],
    [
      // OP06-059 White Snake (2): a small Counter that replaces itself.
      //
      // `power: 0` and a turn-scoped `modify-power` rather than the declarative
      // battle power, because the printed clause says "during this turn" and
      // names a card the player picks -- which need not be the one being
      // attacked. The draw is why it is offered at all past the point where a
      // defense already holds: `hasOtherEffect` is derived true for it.
      "OP06-059",
      {
        cost: 2,
        power: 0,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              buffOwnCardForTurn(1_000, "op06-white-snake"),
              { kind: "draw", player: "self", count: 1 },
            ],
          },
        },
      },
    ],
    [
      // OP06-095 Shadows Asgard, the `[Counter]` half: the same program the
      // `[Main]` table registers, which is what "[Main]/[Counter]" prints.
      "OP06-095",
      { cost: 2, power: 0, program: { effect: shadowsAsgard } },
    ],
    [
      // OP06-096 ...Nothing...at All!!! (3): a Life card buys the whole board a
      // turn of surviving battles.
      //
      // Adds no power at all, which is the point: the attack lands and the
      // Character lives. `power: 0` with an `optional` program is read as
      // "decided as it resolves" rather than as a promised 0.
      "OP06-096",
      {
        cost: 3,
        power: 0,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "top" },
              bind: "op06-nothing-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "op06-nothing-cost",
                    to: { player: "self", zone: "hand" },
                  },
                  battleShield,
                ],
              },
            },
          },
        },
      },
    ],
  ],
  activateMain: [
    [
      // OP06-011 Tot Musica: rests an [Uta] for +5000, which is the Red deck's
      // whole reason to run a Leader and a Character of the same name.
      //
      // `includeLeader` because the pool prints an Uta Leader and the clause
      // names "cards" rather than Characters -- resting the Leader is a real
      // payment, and `rest` writes `leaderRested` for it. `rested: false`, so
      // an already-rested Uta is not offered as a cost that costs nothing.
      "OP06-011",
      {
        oncePerTurn: true,
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
              bind: "op06-tot-musica-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: "op06-tot-musica-cost" },
                  {
                    kind: "modify-power",
                    binding: SOURCE_BINDING,
                    amount: 5_000,
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
      // OP06-015 Lily Carnation: trades a big body for a mid-sized one out of
      // the trash, rested.
      //
      // The cost reads *current* power, so a body pumped past 6000 by DON!! is
      // a legal payment; the body it buys back is filtered on printed power,
      // because that card is still in the trash. The 2000-to-5000 window is
      // exact on both ends, which is why it is a `minPower` and a `maxPower`.
      "OP06-015",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                minCurrentPower: 6_000,
              },
              bind: "op06-lily-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "knock-out", binding: "op06-lily-cost" },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "trash",
                      category: "character",
                      type: "FILM",
                      minPower: 2_000,
                      maxPower: 5_000,
                    },
                    bind: "op06-lily",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "play",
                      binding: "op06-lily",
                      rested: true,
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
      // OP06-016 Raise Max: goes under its owner's deck to shrink something by
      // 3000, which is a 1-cost body answering a 3000-power attacker.
      //
      // Not `[Once Per Turn]`, and it does not need to be: the cost removes the
      // source from the field, so there is no second offer to withhold.
      "OP06-016",
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
                powerDebuff(3_000, "op06-raise-max"),
              ],
            },
          },
        },
      },
    ],
    [
      // OP06-020 Hody Jones (Leader): rests itself to rest one of the
      // opponent's DON!! or a cheap body, and gives up its own Life draws for
      // the turn.
      //
      // `sourceActive` rather than `[Once Per Turn]`: the cost rests the
      // Leader, which withholds the second offer on its own. The price is the
      // second sentence and it is real -- this Leader's own deck adds a Life
      // card to hand on six different clauses, and none of them resolve for
      // the rest of the turn. See `cannot-life-to-hand`.
      //
      // "DON!! cards or Characters" is one selection over two pools, which is
      // what `rest-opponent-cards` is for; every other rest in the set names
      // Characters alone.
      "OP06-020",
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
                  kind: "rest-opponent-cards",
                  player: "opponent",
                  count: 1,
                  maxCost: 3,
                  match: { category: "character" },
                },
                {
                  kind: "restrict-player",
                  player: "self",
                  restriction: "cannot-life-to-hand",
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP06-021 Perona (Leader): rest a body, or shrink one's cost by 1.
      //
      // The cost debuff is what makes the deck's own "cost N or less" removal
      // reach one step higher, which is why it is printed beside a rest rather
      // than beside a power debuff.
      "OP06-021",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "choice",
            branches: [
              {
                id: "rest",
                label: "Rest a Character with a cost of 4 or less",
                effect: restCostAtMost(4, "op06-perona-leader-rest"),
              },
              {
                id: "cost",
                label: "Give a Character −1 cost",
                effect: costDebuff(1, "op06-perona-leader-cost"),
              },
            ],
          },
        },
      },
    ],
    [
      // OP06-034 Hyouzou: rests a body, grows, and pays a Life card for it.
      //
      // The +1000 is not conditional on there being anything to rest -- the
      // printed sentence joins the two with "and" -- so it is sequenced beside
      // the choice rather than nested inside it.
      "OP06-034",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              restCostAtMost(4, "op06-hyouzou"),
              {
                kind: "modify-power",
                binding: SOURCE_BINDING,
                amount: 1_000,
                expiresAfterTurns: 0,
              },
              lifeTopToHand,
            ],
          },
        },
      },
    ],
    [
      // OP06-043 Aramaki: a card from hand and a cheap body under a deck for
      // +3000, which turns an 8000 Blocker into a body that trades up.
      //
      // Both payments are mandatory once the clause is taken, so the `choose`
      // that names the buried Character is `min: 1`. A cost that cannot be paid
      // cannot be activated (Q&A OP06-043#1), so the outer `if` withholds the
      // offer while neither field holds a cheap enough Character -- rather than
      // taking the hand card and spending the turn's use for nothing.
      "OP06-043",
      {
        oncePerTurn: true,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "selector-count",
              player: "either",
              selector: { zone: "board", category: "character", maxCost: 2 },
              operator: "gte",
              value: 1,
            },
            then: {
              kind: "optional",
              effect: payFromHand(
                { player: "self", zone: "hand" },
                "op06-aramaki-cost",
                1,
                {
                  kind: "choose",
                  selector: {
                    player: "either",
                    zone: "board",
                    category: "character",
                    maxCost: 2,
                  },
                  bind: "op06-aramaki-bury",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      {
                        kind: "move",
                        binding: "op06-aramaki-bury",
                        to: {
                          player: "owner",
                          zone: "deck",
                          position: "bottom",
                        },
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
              ),
            },
          },
        },
      },
    ],
    // The four Vinsmoke siblings that trade themselves in for their larger
    // print. One shape, four names -- see `germaSwapUp`.
    ["OP06-060", germaSwapUp("Vinsmoke Ichiji", 7, "op06-ichiji-swap")],
    ["OP06-064", germaSwapUp("Vinsmoke Niji", 5, "op06-niji-swap")],
    ["OP06-066", germaSwapUp("Vinsmoke Yonji", 4, "op06-yonji-swap")],
    ["OP06-068", germaSwapUp("Vinsmoke Reiju", 4, "op06-reiju-swap")],
    [
      // OP06-062 Vinsmoke Judge, second clause: DON!! back to rest one of the
      // opponent's DON!! -- a tempo trade the archetype is happy to make, since
      // its own payouts read *behind* on DON!!.
      //
      // `rest-don` on the opponent rests their active DON!!, which is the pool's
      // only node for it: `rest-opponent-cards` would offer their Characters
      // alongside, and this clause names DON!! alone.
      "OP06-062",
      {
        oncePerTurn: true,
        requires: { fieldDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-don", player: "self", count: 1 },
                { kind: "rest-don", player: "opponent", count: 1 },
              ],
            },
          },
        },
      },
    ],
    [
      // OP06-079 Kingdom of GERMA (Stage): a card from hand and its own rest
      // for a three-deep look at the archetype's bodies.
      //
      // `sourceActive` again in place of `[Once Per Turn]`: the Stage rests to
      // pay, so it cannot be asked twice in a turn.
      "OP06-079",
      {
        oncePerTurn: false,
        requires: { handCards: 1, sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "op06-germa-stage-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: SOURCE_BINDING },
                  lookAndAdd(3, "op06-germa-stage", {
                    typeIncluding: "GERMA",
                  }).effect,
                ],
              },
            ),
          },
        },
      },
    ],
    [
      // OP06-083 Oars: a 4-cost 7000 body that cannot attack until it eats one
      // of its own crew.
      //
      // `negate` on the source is what lifts the printed ban: the derived
      // `rules.cannotAttack` flag is read through `characterEffectsSwitchedOff`,
      // so a negated Oars may swing. Its own instance is a legal payment -- the
      // clause names {Thriller Bark Pirates} Characters and Oars is one, so the
      // printed text allows a body to eat itself, pointless as that is.
      "OP06-083",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
                type: "Thriller Bark Pirates",
              },
              bind: "op06-oars-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "knock-out", binding: "op06-oars-cost" },
                  {
                    kind: "negate",
                    binding: SOURCE_BINDING,
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
      // OP06-098 Thriller Bark (Stage): a rested DON!! and its own rest for a
      // cheap body out of the trash, rested.
      "OP06-098",
      {
        oncePerTurn: false,
        requires: { activeDon: 1, sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                { kind: "rest", binding: SOURCE_BINDING },
                {
                  kind: "if",
                  condition: thrillerBarkLeader,
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "trash",
                      category: "character",
                      type: "Thriller Bark Pirates",
                      maxCost: 2,
                    },
                    bind: "op06-thriller-bark",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "play",
                      binding: "op06-thriller-bark",
                      rested: true,
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
      // OP06-102 Kamakiri: a 1-cost Stage under a deck buys removal.
      "OP06-102",
      {
        oncePerTurn: true,
        program: {
          effect: payWithStage(
            "op06-kamakiri-cost",
            koCostAtMost(2, "op06-kamakiri"),
          ),
        },
      },
    ],
    [
      // OP06-111 Braham: the same currency as OP06-102, spent on a rest that
      // reaches twice as high.
      "OP06-111",
      {
        oncePerTurn: true,
        program: {
          effect: payWithStage(
            "op06-braham-cost",
            restCostAtMost(4, "op06-braham"),
          ),
        },
      },
    ],
    [
      // OP06-117 The Ark Maxim (Stage): rests itself and an [Enel] to sweep
      // every cheap body off the opposing board.
      //
      // Both halves of the cost are mandatory once taken, and the [Enel] is
      // filtered on `rested: false` for the reason every other rest cost here
      // is: resting a rested card pays nothing. `sourceActive` withholds the
      // second offer, which is what makes the printed `[Once Per Turn]` almost
      // redundant -- almost, because an effect could set the Stage active again.
      "OP06-117",
      {
        oncePerTurn: true,
        requires: { sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                includeLeader: true,
                name: "Enel",
                rested: false,
              },
              bind: "op06-ark-maxim-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: SOURCE_BINDING },
                  { kind: "rest", binding: "op06-ark-maxim-cost" },
                  {
                    kind: "select",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 2,
                    },
                    bind: "op06-ark-maxim",
                    count: "all",
                    effect: { kind: "knock-out", binding: "op06-ark-maxim" },
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
