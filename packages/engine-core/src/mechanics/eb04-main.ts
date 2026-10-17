/**
 * EB-04 main-phase programs: `[Activate: Main]` on Characters, and `[Main]` on
 * Events.
 *
 * The booster's Events are almost all 1-cost split cards -- a `[Main]` half and
 * a `[Counter]` half printed on the same slot -- so nine of them appear here and
 * seven of the same nine again in `eb04-battle.ts`. The split is by timing
 * window, not by card, which is why a comment on one half names where the other
 * lives.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import {
  SOURCE_BINDING,
  type MechanicEffect,
  restableCards,
} from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { giveDonToRayleigh, lookAndAddOrTrash, payFromHand } from "./shared.js";

/**
 * "You may rest 1 of your cards: <effect>."
 *
 * EB04-015's `[On K.O.]` and EB04-019's `[Main]`. "1 of your cards" is not
 * "1 of your Characters": the Leader and a Stage qualify, which is what makes
 * the cost payable on an empty board and is why `includeLeader` is set.
 *
 * `canRest: true` rather than `rested: false`, because resting is what is being
 * paid: a card under a "cannot be rested" effect cannot pay, and that is a
 * restriction the pool already models in one place.
 */
export const restOwnCardCost = (
  bind: string,
  effect: MechanicEffect,
): MechanicEffect => ({
  kind: "optional",
  effect: {
    kind: "choose",
    selector: restableCards("self"),
    bind,
    min: 1,
    max: 1,
    effect: {
      kind: "sequence",
      effects: [{ kind: "rest", binding: bind }, effect],
    },
  },
});

/**
 * "You may trash this Character: play up to 1 <type> Character card with a cost
 * of N or less from your hand or trash."
 *
 * EB04-039's `[Activate: Main]` (from hand only, at 5) and EB04-047's (hand or
 * trash, at 3). Both trade a body on the board for a body out of a hidden zone,
 * and both are written with the payoff after the trash rather than nested,
 * because the cost is the source itself: a source that cannot be trashed is not
 * a position the activation can be offered from at all.
 */
const trashSelfToPlay = (
  bind: string,
  zones: readonly ("hand" | "trash")[],
  type: string,
  maxCost: number,
  excludeName?: string,
): MechanicEffect => ({
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
          zone: zones,
          category: "character",
          type,
          maxCost,
          ...(excludeName === undefined ? {} : { excludeName }),
        },
        bind,
        min: 0,
        max: 1,
        effect: { kind: "play", binding: bind },
      },
    ],
  },
});

/** "Give up to 1 of your opponent's Characters −N power during this turn." */
const debuffOpponentCharacter = (
  bind: string,
  amount: number,
): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-power",
    binding: bind,
    amount,
    expiresAfterTurns: 0,
  },
});

/**
 * EB04-049's payload, shared between its `[Main]` half above and the
 * `[Trigger]` that re-activates it.
 *
 * The mill is the cost and the K.O. is what it buys, so the K.O. is nested
 * behind `trash-top` inside one `optional`: a player who declines pays nothing,
 * and a player who pays cannot then be given the K.O. for free.
 */
export const eb04FingerPistolKo: MechanicEffect = {
  kind: "optional",
  effect: {
    kind: "sequence",
    effects: [
      { kind: "trash-top", player: "self", count: 2 },
      {
        kind: "choose",
        selector: {
          player: "opponent",
          zone: "board",
          category: "character",
          maxBaseCost: 5,
        },
        bind: "eb04-049-ko",
        min: 0,
        max: 1,
        effect: { kind: "knock-out", binding: "eb04-049-ko" },
      },
    ],
  },
};

export const eb04MainMechanics: SetMechanics = {
  activateMain: [
    [
      // EB04-012 Kikunojo. Printed text: `pnpm card:text EB04-012`.
      //
      // A 7-drop that un-taps the Leader the turn it lands, which is only
      // legal because of the "was played on this turn" gate: `[Once Per Turn]`
      // alone would let a Kikunojo sitting on the board restand the Leader
      // every turn thereafter. Two conditions, both printed, and neither
      // implies the other -- a Kikunojo played behind the wrong Leader still
      // spends nothing.
      //
      // The Leader is reached with `{ zone: [], includeLeader: true }`, the
      // only selector shape that names it, and set active by `update` rather
      // than by an "activate" node -- `update` is what the Leader branch of the
      // resolver understands.
      "EB04-012",
      {
        oncePerTurn: true,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "source-played-this-turn" },
                {
                  kind: "leader-has-type",
                  player: "self",
                  type: "Land of Wano",
                },
              ],
            },
            then: {
              kind: "select",
              selector: { player: "self", zone: [], includeLeader: true },
              bind: "eb04-012-leader",
              count: "all",
              effect: {
                kind: "update",
                binding: "eb04-012-leader",
                rested: false,
              },
            },
          },
        },
      },
    ],
    [
      // EB04-014 Kozuki Sukiyaki. Printed text: `pnpm card:text EB04-014`.
      //
      // `attach-don` at the Leader rather than `give-rested-don`: the printed
      // text names one recipient, and `give-rested-don` would offer the board's
      // Characters as well -- a choice this card does not have. The same
      // distinction OP06-035's note makes, from the other side.
      //
      // `requires: { restedDon: 1 }` so the activation is not offered with no
      // rested DON!! to move: the once-per-turn budget is the real cost of a
      // 3-cost 0-power body whose only output is this.
      "EB04-014",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
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
              count: 1,
              target: "leader",
            },
          },
        },
      },
    ],
    [
      // EB04-016 Bird Neptunian. Printed text: `pnpm card:text EB04-016`.
      //
      // The second sentence is a self-imposed lock, not a cost: it closes the
      // door behind the activation, so a board of these cannot chain into an
      // arbitrary number of active DON!!. `restrict-player` with
      // `cannot-activate-don-by-character` is that exact rule, and
      // `requires: { donActivationAllowed: true }` is what stops the engine
      // offering the activation once the lock is up -- the two halves have to
      // agree or the card would spend its window for nothing.
      //
      // Not `[Once Per Turn]`: the printed text has no such marker, and it does
      // not need one. The lock is the limit. Its `[When Attacking]` half is in
      // `eb04-battle.ts`.
      "EB04-016",
      {
        oncePerTurn: false,
        requires: { donActivationAllowed: true, restedDon: 1 },
        program: {
          effect: {
            kind: "sequence",
            effects: [
              { kind: "activate-don", player: "self", count: 1 },
              {
                kind: "restrict-player",
                player: "self",
                restriction: "cannot-activate-don-by-character",
                expiresAfterTurns: 0,
              },
            ],
          },
        },
      },
    ],
    [
      // EB04-021 Igaram. Printed text: `pnpm card:text EB04-021`.
      //
      // `give-rested-don` here and not `attach-don`, the mirror of EB04-014:
      // this text names "your Leader or 1 of your Characters", which is the
      // choice that node exists to offer. Its `[On Play]` half is in
      // `eb04-on-play.ts`.
      "EB04-021",
      {
        oncePerTurn: true,
        requires: { handCards: 1, restedDon: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb04-021-don-cost",
              1,
              {
                kind: "give-rested-don",
                player: "self",
                count: 1,
                from: "rested",
              },
            ),
          },
        },
      },
    ],
    [
      // EB04-024 Terracotta. Printed text: `pnpm card:text EB04-024`.
      //
      // Two costs in one clause -- rest this Character *and* trash a card --
      // so the hand payment is the outer `choose` and the rest sits inside its
      // payoff. Written that way round on purpose: a player with an empty hand
      // must not have rested the body for nothing, and `payFromHand`'s nesting
      // is the only shape that guarantees it. The rest still happens before the
      // grant, which is the printed order.
      "EB04-024",
      {
        oncePerTurn: false,
        requires: { handCards: 1, sourceActive: true },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "eb04-024-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: SOURCE_BINDING },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      type: "Alabasta",
                    },
                    bind: "eb04-024-unblockable",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "grant-keyword",
                      binding: "eb04-024-unblockable",
                      keyword: "Unblockable",
                      expiresAfterTurns: 0,
                    },
                  },
                ],
              },
            ),
          },
        },
      },
    ],
    [
      // EB04-036 Foxy. Printed text: `pnpm card:text EB04-036`.
      //
      // Rested, so the DON!! is next turn's rather than this turn's: an 8-drop
      // that ramps on the turn after it lands. Ungated, unlike this card's
      // `[On Play]` (in `eb04-on-play.ts`), which is the asymmetry the printed
      // text draws -- the ramp works behind any Leader and the removal does
      // not.
      "EB04-036",
      {
        oncePerTurn: true,
        program: {
          effect: { kind: "add-don", player: "self", count: 1, rested: true },
        },
      },
    ],
    [
      // EB04-039 Eustass"Captain"Kid. Printed text:
      // `pnpm card:text EB04-039`.
      //
      // Hand only -- the printed text says "from your hand", where EB04-047's
      // says "from your hand or trash", and that one word is the whole
      // difference between the two activations. Its `[On Play]` half is in
      // `eb04-on-play.ts`.
      "EB04-039",
      {
        oncePerTurn: false,
        program: {
          effect: trashSelfToPlay("eb04-039-play", ["hand"], "Kid Pirates", 5),
        },
      },
    ],
    [
      // EB04-045 Ginny. Printed text: `pnpm card:text EB04-045`.
      //
      // "If there are 2 or more Characters with a cost of 8 or more" names no
      // side, so the count is `player: "either"` -- the opponent's 8-drops turn
      // this on too, which is what makes a 1-cost body relevant in a late
      // board state rather than only in its own deck's.
      //
      // `minCost` rather than `minBaseCost`: cost is what the board currently
      // says, and the pool is full of auras that move it.
      "EB04-045",
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
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "either",
                    selector: {
                      zone: "board",
                      category: "character",
                      minCost: 8,
                    },
                    operator: "gte",
                    value: 2,
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      includeLeader: true,
                      type: "Revolutionary Army",
                    },
                    bind: "eb04-045-buff",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "eb04-045-buff",
                      amount: 1_000,
                      expiresAfterTurns: 0,
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
      // EB04-047 Helmeppo. Printed text: `pnpm card:text EB04-047`.
      //
      // Recursion out of the trash, which is why the name exclusion matters
      // twice: this card is itself {SWORD} at cost 3, and the cost is trashing
      // it -- so without `excludeName` the activation would replay the card
      // that just paid for it, from the pile it landed in.
      "EB04-047",
      {
        oncePerTurn: false,
        program: {
          effect: trashSelfToPlay(
            "eb04-047-play",
            ["hand", "trash"],
            "SWORD",
            3,
            "Helmeppo",
          ),
        },
      },
    ],
  ],
  eventMain: [
    [
      // EB04-028 Ice Time (5). Printed text: `pnpm card:text EB04-028`.
      //
      // The trash is a cost, not a step before the payoff: the imperative
      // `navy-discard` this replaces ended the whole clause on a skip, so the
      // payoff is nested inside the cost's `choose` -- the `payFromHand` shape
      // -- and declining reaches nothing.
      //
      // `trashFromHand: 1` is the gate the offer needs: the Event is on its way
      // out of the hand and cannot be the card its own cost discards.
      //
      // The {Navy} Leader gate is outermost rather than where the sentence puts
      // it, after the cost. It is `bareGateCondition`'s reading either way --
      // the whole clause is unreachable without it -- and outermost is what
      // withholds the offer, so no Leader is invited to trash a card for
      // nothing. The branch this replaces dropped the gate entirely.
      "EB04-028",
      {
        cost: 5,
        trashFromHand: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Navy",
            },
            then: {
              kind: "optional",
              effect: payFromHand(
                { player: "self", zone: "hand" },
                "eb04-ice-time-cost",
                1,
                {
                  kind: "choose",
                  selector: {
                    player: "opponent",
                    zone: "board",
                    category: "character",
                    maxCurrentPower: 10_000,
                  },
                  bind: "eb04-ice-time",
                  min: 0,
                  max: 2,
                  effect: {
                    kind: "restrict",
                    binding: "eb04-ice-time",
                    restriction: "cannot-attack",
                    expiresAfterTurns: 1,
                  },
                },
              ),
            },
          },
        },
      },
    ],
    [
      // EB04-008 Distorted Future (1). Printed text:
      // `pnpm card:text EB04-008`.
      //
      // The Life gate is on the `[Main]` half only: the `[Counter]` half in
      // `eb04-battle.ts` is unconditional, so a hand of these is always live on
      // defence and only becomes removal once this deck has spent its own Life
      // down to two. That is the Bonney ladder again, from a card outside the
      // feature deck.
      "EB04-008",
      {
        cost: 1,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "zone-count",
              player: "self",
              zone: "life",
              operator: "lte",
              value: 2,
            },
            then: debuffOpponentCharacter("eb04-008-debuff", -3_000),
          },
        },
      },
    ],
    [
      // EB04-009 It's My Student's Farewell. I Want It to Be Proper. (0).
      // Printed text: `pnpm card:text EB04-009`.
      //
      // The fourth card on the OP12 Rayleigh chassis, and the reason
      // `giveDonToRayleigh` moved into `shared.ts`: a 0-cost Event whose price
      // is DON!! *given* to a named Character rather than spent, so the board
      // keeps the power. One DON!! here where the OP12 trio pay one or two.
      //
      // Its `[Counter]` half is in `eb04-battle.ts`, and shares
      // `rayleighOrCharacter` with those three.
      "EB04-009",
      {
        cost: 0,
        program: {
          effect: giveDonToRayleigh(
            1,
            "eb04-009-don",
            debuffOpponentCharacter("eb04-009-debuff", -2_000),
          ),
        },
      },
    ],
    [
      // EB04-019 Eleclaw (1). Printed text: `pnpm card:text EB04-019`.
      //
      // −3 cost rather than −3000 power, which is what makes this Green rather
      // than Red: the target survives at a cost this deck's own removal and
      // EB04-017's aura can reach. Both the rest and the Leader gate are
      // printed, and the gate is inside the cost for the same reason
      // EB04-022's is -- "you may rest: if X" pays first and checks second.
      //
      // Its `[Counter]` half is in `eb04-battle.ts`.
      "EB04-019",
      {
        cost: 1,
        program: {
          effect: restOwnCardCost("eb04-019-rest", {
            kind: "if",
            condition: {
              kind: "leader-has-type",
              player: "self",
              type: "Minks",
            },
            then: {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
              },
              bind: "eb04-019-cost",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-cost",
                binding: "eb04-019-cost",
                amount: -3,
                expiresAfterTurns: 0,
              },
            },
          }),
        },
      },
    ],
    [
      // EB04-029 I Heard the Sound...of a Lady's Teardrops Falling (1).
      // Printed text: `pnpm card:text EB04-029`.
      //
      // `lookAndAddOrTrash` rather than `lookAndAdd`: the leftovers are
      // trashed, not bottomed, so a miss costs this deck three cards of deck --
      // the price of a three-deep dig that can find either half of the Sanji
      // package. The `anyOf` is the printed disjunction: the named Character,
      // or any Event, which includes another copy of this card.
      //
      // Its `[Counter]` half is in `eb04-battle.ts`.
      "EB04-029",
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
            then: lookAndAddOrTrash(3, "eb04-029-look", {
              anyOf: [{ name: "Sanji" }, { category: "event" }],
            }).effect,
          },
        },
      },
    ],
    [
      // EB04-040 Flame Dragon Torch (1). Printed text:
      // `pnpm card:text EB04-040`.
      //
      // `restDon: 6` is declared on the offer rather than left inside the
      // program: six rested DON!! is the whole price of a 1-cost card that
      // buffs and rests, and an Event offered without it would hand both halves
      // over free. The rest of the opponent's Character has no cost ceiling at
      // all -- the DON!! is the ceiling.
      //
      // Its `[Counter]` half is in `eb04-battle.ts`.
      "EB04-040",
      {
        cost: 1,
        restDon: 6,
        program: {
          effect: {
            kind: "sequence",
            effects: [
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "board",
                  includeLeader: true,
                  name: "Kaido",
                },
                bind: "eb04-040-buff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "eb04-040-buff",
                  amount: 3_000,
                  expiresAfterTurns: 0,
                },
              },
              {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                  canRest: true,
                },
                bind: "eb04-040-rest",
                min: 0,
                max: 1,
                effect: { kind: "rest", binding: "eb04-040-rest" },
              },
            ],
          },
        },
      },
    ],
    [
      // EB04-041 Stealth Black (3). Printed text:
      // `pnpm card:text EB04-041`.
      //
      // Two gates and no cost beyond the 3: the Leader has to be the named one
      // *and* four DON!! have to be on the field, which together mean this is a
      // turn-four card at the earliest. `zone: ["hand", "trash"]` is the
      // printed "from your hand or trash", and `maxPower` reads the printed
      // 6000 because a card in either of those zones has nothing else to read.
      //
      // Its `[Trigger]` half is in `eb04-triggers.ts`.
      "EB04-041",
      {
        cost: 3,
        program: {
          effect: {
            kind: "if",
            condition: {
              kind: "all-of",
              conditions: [
                { kind: "leader-has-name", player: "self", name: "Sanji" },
                {
                  kind: "field-don",
                  player: "self",
                  operator: "gte",
                  value: 4,
                },
              ],
            },
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: ["hand", "trash"],
                category: "character",
                name: "Sanji",
                maxPower: 6_000,
              },
              bind: "eb04-041-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb04-041-play" },
            },
          },
        },
      },
    ],
    [
      // EB04-049 Finger Pistol Yellow Lotus (4). Printed text:
      // `pnpm card:text EB04-049`.
      //
      // `maxBaseCost` rather than `maxCost`: "base cost of 5 or less" is the
      // printed number, so a 6-drop the opponent's own aura discounted is still
      // out of range and a 5-drop this deck raised is still in it. The
      // distinction is the reason the two fields exist.
      //
      // Its `[Trigger]` half re-runs this program through `activate-event`;
      // see `eb04-triggers.ts`.
      "EB04-049",
      {
        cost: 4,
        program: { effect: eb04FingerPistolKo },
      },
    ],
    [
      // EB04-050 I'll Whip You Into Shape. ♡ (1). Printed text:
      // `pnpm card:text EB04-050`.
      //
      // `grant-attack-active` is the printed "can also attack active
      // Characters" -- a widening of what may be declared, not a keyword, which
      // is why it is its own node. The `[Counter]` half in `eb04-battle.ts` is
      // what makes the slot playable on a turn this half is dead.
      "EB04-050",
      {
        cost: 1,
        program: {
          effect: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "board",
              includeLeader: true,
              type: "SWORD",
            },
            bind: "eb04-050-attacker",
            min: 0,
            max: 1,
            effect: {
              kind: "grant-attack-active",
              binding: "eb04-050-attacker",
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // EB04-060 Gum-Gum Hawk Gatling (2). Printed text:
      // `pnpm card:text EB04-060`.
      //
      // `lifeToHandCost` is the printed "top or bottom of your Life cards":
      // `position: "edge"` is exactly those two, and a one-card Life stack
      // resolves to that card rather than to nothing.
      //
      // The Life card put back goes in **face-up**, which is the opposite of
      // every other Life-stacking clause in the pool (see EB04-054's note on
      // `faceUp: false`). Printed, and the point: a face-up {Egghead} body is a
      // Trigger the opponent can see and this deck can plan a turn around, and
      // the card traded away for it was one they could not.
      //
      // Its `[Trigger]` half is in `eb04-triggers.ts`.
      "EB04-060",
      {
        cost: 2,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "edge" },
              bind: "eb04-060-life-cost",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "eb04-060-life-cost",
                    to: { player: "self", zone: "hand" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "hand",
                      category: "character",
                      type: "Egghead",
                    },
                    bind: "eb04-060-to-life",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "move",
                      binding: "eb04-060-to-life",
                      to: { player: "self", zone: "life", position: "top" },
                      faceUp: true,
                    },
                  },
                  debuffOpponentCharacter("eb04-060-debuff", -1_000),
                ],
              },
            },
          },
        },
      },
    ],
  ],
};
