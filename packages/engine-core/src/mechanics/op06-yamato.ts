/**
 * (Green/Yellow) Yamato: the {Land of Wano} threshold package.
 *
 * Card data for these identities lives in `packages/cards/src/op06-yamato.ts`;
 * the deck's four continuous clauses are static layers in
 * `../static-abilities.ts` instead, and OP06-104 Kikunojo's two clauses were
 * already implemented in `op16-nami.ts`.
 *
 * Six programs here read the *opponent's* Life total and every one of them
 * wants it at 3 or less, so they share `opponentBehind`. ST28-001 Ashura Doji
 * is the one clause pointed the other way and keeps its own condition inline,
 * where the asymmetry is visible.
 */
import { SOURCE_BINDING, type MechanicCondition } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, trashForBattlePower } from "./shared.js";
// The Land of Wano Trigger six of the set's bodies print, defined once beside
// the rest of OP-06 now that the whole set is in the pool.
import { playSelfWhenOpponentBehind } from "./op06-shared.js";

/** "If your opponent has 3 or less Life cards" -- the deck's own threshold. */
const opponentBehind: MechanicCondition = {
  kind: "zone-count",
  player: "opponent",
  zone: "life",
  operator: "lte",
  value: 3,
};

/** "If your Leader has the {Land of Wano} type" -- ST-28's two gated clauses. */
const wanoLeader: MechanicCondition = {
  kind: "leader-has-type",
  player: "self",
  type: "Land of Wano",
};

/**
 * "[printed text omitted -- pnpm card:text <card>]"
 *
 * Three of the list's Characters print it verbatim -- OP06-109, OP06-110 and,
 * with the Leader gate added, ST28-003 -- and OP06-104 Kikunojo prints it too,
 * from `op16-nami.ts`. It is the whole reason the deck wants the opponent low:
 * the damage that crosses the threshold is also what refills the board.
 */
/**
 * OP06-118 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP06-118]"
 *
 * The same clause on two timings at two prices -- 1 DON!! `[When Attacking]`,
 * 2 DON!! `[Activate: Main]` -- with a separate `[Once Per Turn]` budget each,
 * so a 9000 body can attack, un-rest for one DON!!, and still un-rest again
 * later for two. `rest-don` takes what is there rather than failing, so the
 * offer is gated on the DON!! by `requires` and the cost is wrapped in
 * `optional` inside it: the payment and the payout have to be one decision, or
 * a player who declines gets the un-rest for free.
 */
const zoroSetActive = (donCost: number) => ({
  oncePerTurn: true,
  requires: { activeDon: donCost },
  program: {
    effect: {
      kind: "optional" as const,
      effect: {
        kind: "sequence" as const,
        effects: [
          {
            kind: "rest-don" as const,
            player: "self" as const,
            count: donCost,
          },
          { kind: "update" as const, binding: SOURCE_BINDING, rested: false },
        ],
      },
    },
  },
});

/**
 * OP08-023 Carrot: "[printed text omitted -- pnpm card:text OP08-023]"
 *
 * One printed clause on two timings, so it is one program registered twice.
 * The target must *already* be rested -- `rested: true`, not the `canRest`
 * every "rest up to 1" clause filters on -- because this clause rests nothing
 * itself: it holds down a body the deck's own attacks already turned over.
 * `cannot-refresh` at `expiresAfterTurns: 1` is how the pool writes "[printed text omitted -- pnpm card:text OP08-023]".
 */
const carrotRestLock = {
  effect: {
    kind: "choose" as const,
    selector: {
      player: "opponent" as const,
      zone: "board" as const,
      category: "character",
      rested: true,
      maxCost: 7,
    },
    bind: "carrot-lock",
    min: 0,
    max: 1,
    effect: {
      kind: "restrict" as const,
      binding: "carrot-lock",
      restriction: "cannot-refresh" as const,
      expiresAfterTurns: 1,
    },
  },
};

export const op06YamatoMechanics: SetMechanics = {
  activateMain: [
    [
      // OP06-022 Yamato (Leader): "[printed text omitted -- pnpm card:text OP06-022]"
      //
      // `attach-don` over a `choose` rather than `give-rested-don`, because the
      // printed text names Characters only -- `give-rested-don` offers the
      // Leader alongside them, which this clause does not. Two DON!! to one
      // Character, so the `count` is on the DON!! and the `max` is on the card.
      //
      // This is the deck's second use of DON!! in a turn: the pile it spends
      // has already paid for a play or an attacker and rested, and every other
      // card in the list can only reach active DON!!.
      "OP06-022",
      {
        oncePerTurn: true,
        requires: { restedDon: 1 },
        program: {
          effect: {
            kind: "if",
            condition: opponentBehind,
            then: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "board",
                category: "character",
              },
              bind: "yamato-don-target",
              min: 0,
              max: 1,
              effect: {
                kind: "attach-don",
                player: "self",
                from: "rested",
                count: 2,
                target: { binding: "yamato-don-target" },
              },
            },
          },
        },
      },
    ],
    ["OP06-118", zoroSetActive(2)],
    [
      // PRB02-016 Otama: "[printed text omitted -- pnpm card:text PRB02-016]"
      //
      // Not `[Once Per Turn]`, and it does not need to be: the cost rests the
      // source, so `sourceActive` withholds the second offer. Both halves of
      // the cost are mandatory and the payoff is nested inside the Life
      // `choose`, which is what makes an unpayable cost an unreachable payoff
      // rather than a free +3000 -- the shape `payFromHand` documents.
      //
      // "[printed text omitted -- pnpm card:text PRB02-016]" is `position: "edge"`, the same
      // reading `lifeToHandCost` gives it.
      "PRB02-016",
      {
        oncePerTurn: false,
        requires: { sourceActive: true, lifeCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { player: "self", zone: "life", position: "edge" },
              bind: "otama-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "rest", binding: SOURCE_BINDING },
                  {
                    kind: "move",
                    binding: "otama-life",
                    to: { player: "self", zone: "hand" },
                  },
                  {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      includeLeader: true,
                    },
                    bind: "otama-buff",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "modify-power",
                      binding: "otama-buff",
                      amount: 3000,
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
      // ST28-004 Kouzuki Momonosuke: "[printed text omitted -- pnpm card:text ST28-004]"
      //
      // The pool's first "return given DON!! to the cost area" -- see
      // `return-given-don` in `../mechanics.ts`. The DON!! stays on the field,
      // so what is spent is 2000 power somewhere else on the board plus the
      // right to give those two again this turn; what is bought is a 7000
      // [Rush] body the turn it lands. `givenDon` gates the offer, because
      // there is nothing to return on an empty board and the clause is
      // `[Once Per Turn]`.
      "ST28-004",
      {
        oncePerTurn: true,
        requires: { givenDon: 2 },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "return-given-don", player: "self", count: 2 },
                {
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Rush",
                  expiresAfterTurns: 0,
                },
                {
                  kind: "modify-power",
                  binding: SOURCE_BINDING,
                  amount: 1000,
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      },
    ],
  ],
  whenAttacking: [
    ["OP06-118", zoroSetActive(1)],
    ["OP08-023", carrotRestLock],
  ],
  onPlay: [
    [
      // OP06-107 Kouzuki Momonosuke: "[printed text omitted -- pnpm card:text OP06-107]"
      //
      // The deck's own Character goes into its own Life, face-up, which makes
      // it a Trigger whose timing its controller chose. `excludeName` reads the
      // printed name, so ST28-004 -- the same name on a different card number
      // -- is excluded too, which is what the bracketed name means.
      //
      // Face-up matters twice: the opponent can see what the next attack turns
      // over, and a face-up Life card is what ST36-005's redirect and
      // OP12-102's replacement read. `faceUp: true` is not the default.
      "OP06-107",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Land of Wano",
            excludeName: "Kouzuki Momonosuke",
          },
          bind: "momo-to-life",
          min: 0,
          max: 1,
          effect: {
            kind: "choice",
            branches: [
              {
                id: "top",
                label: "Add it to the top of your Life cards face-up",
                effect: {
                  kind: "move",
                  binding: "momo-to-life",
                  to: { player: "owner", zone: "life", position: "top" },
                  faceUp: true,
                },
              },
              {
                id: "bottom",
                label: "Add it to the bottom of your Life cards face-up",
                effect: {
                  kind: "move",
                  binding: "momo-to-life",
                  to: { player: "owner", zone: "life", position: "bottom" },
                  faceUp: true,
                },
              },
            ],
          },
        },
      },
    ],
    ["OP08-023", carrotRestLock],
    [
      // ST28-001 Ashura Doji: "[printed text omitted -- pnpm card:text ST28-001]"
      //
      // The list's only removal, and the only clause in it that wants the
      // opponent's Life *high* -- so it is written inline rather than through
      // `opponentBehind`, where the reversed operator is easy to misread.
      //
      // "base cost" is `maxBaseCost`: a Character whose cost an effect raised
      // out of range is still eligible, which is the opposite of what `maxCost`
      // would answer.
      "ST28-001",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              wanoLeader,
              {
                kind: "zone-count",
                player: "opponent",
                zone: "life",
                operator: "gte",
                value: 3,
              },
            ],
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxBaseCost: 5,
            },
            bind: "ashura-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "ashura-ko" },
          },
        },
      },
    ],
    [
      // ST28-002 Izo: "[printed text omitted -- pnpm card:text ST28-002]"
      //
      // A `select` over the Leader rather than an `if` plus a grant, so the
      // type gate and the target are the same read: under a Leader without the
      // type the selector is empty and the clause does nothing, which is what
      // its printed text says. The same shape OP17-115's Leader grant uses.
      //
      // [Banish] on a [Double Attack] Leader is the deck's answer to its own
      // plan: two Life cards taken without handing back two Triggers.
      "ST28-002",
      {
        effect: {
          kind: "select",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            category: "leader",
            type: "Land of Wano",
          },
          bind: "izo-leader",
          count: 1,
          effect: {
            kind: "grant-keyword",
            binding: "izo-leader",
            keyword: "Banish",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // ST28-005 Yamato: "[printed text omitted -- pnpm card:text ST28-005]"
      //
      // The "cost of 2 or more" floor excludes ST28-005 itself, so the deck's
      // only searcher cannot find another copy of itself -- every other {Land
      // of Wano} card in the list is cost 2 or more and reachable.
      "ST28-005",
      lookAndAdd(5, "yamato-search", { type: "Land of Wano", minCost: 2 }),
    ],
  ],
  counterEvent: [
    [
      // OP06-115 "You're the One Who Should Disappear.": "[printed text omitted -- pnpm card:text OP06-115]"
      //
      // `power: 0` with the buff inside the program, because the payout depends
      // on a choice: a defender who declines the trash gets nothing, and the
      // offer's forecast must not promise power the resolution will not add.
      "OP06-115",
      {
        cost: 0,
        power: 0,
        program: trashForBattlePower(3000, "disappear-cost"),
      },
    ],
  ],
  trigger: [
    ["OP06-109", playSelfWhenOpponentBehind],
    ["OP06-110", playSelfWhenOpponentBehind],
    [
      // ST28-003 Kin'emon: "[printed text omitted -- pnpm card:text ST28-003]"
      //
      // The same Trigger as OP06-109 and OP06-110 with the Leader gate added,
      // which is what an ST-28 exclusive can assume and an OP-06 booster card
      // cannot. Kin'emon prints no other text at all.
      "ST28-003",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [wanoLeader, opponentBehind],
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // PRB02-016 Otama: "[printed text omitted -- pnpm card:text PRB02-016]"
      //
      // `canRest` rather than `rested: false`: a Character that an effect has
      // barred from resting is not a legal target, and offering it would be an
      // option that resolves to nothing.
      "PRB02-016",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            canRest: true,
            maxCost: 4,
          },
          bind: "otama-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "otama-rest" },
        },
      },
    ],
    [
      // OP06-115 "You're the One Who Should Disappear.": "[printed text omitted -- pnpm card:text OP06-115]"
      //
      // The condition is on the Life total *after* the damage that turned this
      // Trigger over, which is why "0 Life cards" is reachable at all: the card
      // is in the hand or resolving, and the Life zone behind it is empty.
      //
      // The discard is what follows the Life card, not a cost for it: an
      // empty hand still banks the deck's top card (Q&A OP06-115#1), and
      // simply has nothing to trash afterwards -- the `choose` skips. A player
      // who declines the Life card does not discard either, since the trash
      // is the second half of the one "you may".
      "OP06-115",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "self",
            zone: "life",
            operator: "lte",
            value: 0,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "select",
                  selector: { player: "self", zone: "deck", position: "top" },
                  bind: "disappear-new-life",
                  count: 1,
                  effect: {
                    kind: "move",
                    binding: "disappear-new-life",
                    to: { player: "self", zone: "life", position: "top" },
                    faceUp: false,
                  },
                },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "disappear-trigger-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "disappear-trigger-cost",
                    to: { player: "self", zone: "trash" },
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
