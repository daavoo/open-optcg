/**
 * OP11 `[On Play]` programs.
 *
 * OP11 "A Fist of Divine Speed" is a whole 119-card series, split by timing
 * window the way OP10 and OP14-OP17 are: see `mechanics/README.md`.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  grantAttackActive,
  opponentPlacesAtBottom,
  placeAtTopOrBottom,
  turnLifeFaceDown,
} from "./op11-shared.js";
import {
  donMinus,
  haveNamed,
  lookAndAdd,
  lookAndAddOrTrash,
  paidToHand,
  payFromHand,
} from "./shared.js";

/** "Rest up to 1 of your opponent's Characters with a cost of N or less." */
const restOpponentUpToCost = (cost: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: {
    player: "opponent",
    zone: "board",
    category: "character",
    maxCost: cost,
    canRest: true,
  },
  bind,
  min: 0,
  max: 1,
  effect: { kind: "rest", binding: bind },
});

/** "If your Leader has the {Fish-Man} or {Merfolk} type" -- Green's gate. */
const fishManOrMerfolkLeader = {
  kind: "any-of",
  conditions: [
    { kind: "leader-has-type", player: "self", type: "Fish-Man" },
    { kind: "leader-has-type", player: "self", type: "Merfolk" },
  ],
} as const;

export const op11OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // OP11-002 Ain: "[printed text omitted -- pnpm card:text OP11-002]"
      //
      // The two halves are printed together because the debuff *feeds* the K.O.:
      // "0 power or less" is current power, so a 1000-power body that has just
      // taken −1000 is a legal target. `maxCurrentPower` is the only reading
      // that makes the card work.
      "OP11-002",
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
              },
              bind: "op11-ain-debuff",
              min: 0,
              max: 1,
              effect: {
                kind: "modify-power",
                binding: "op11-ain-debuff",
                amount: -1_000,
                expiresAfterTurns: 0,
              },
            },
            {
              kind: "choose",
              selector: {
                player: "opponent",
                zone: "board",
                category: "character",
                maxCurrentPower: 0,
              },
              bind: "op11-ain-ko",
              min: 0,
              max: 1,
              effect: { kind: "knock-out", binding: "op11-ain-ko" },
            },
          ],
        },
      },
    ],
    [
      // OP11-004 Kujyaku: "[printed text omitted -- pnpm card:text OP11-004]"
      "OP11-004",
      lookAndAdd(5, "op11-kujyaku-look", {
        type: "Navy",
        excludeName: "Kujyaku",
      }),
    ],
    [
      // OP11-008 Doll: "[printed text omitted -- pnpm card:text OP11-008]"
      //
      // −6000 for one card in hand is the biggest debuff in the set, which is
      // what pays for a 4-cost 1000-power Blocker.
      "OP11-008",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op11-doll-cost",
            1,
            {
              kind: "if",
              condition: {
                kind: "leader-has-type",
                player: "self",
                type: "Navy",
              },
              then: {
                kind: "choose",
                selector: {
                  player: "opponent",
                  zone: "board",
                  category: "character",
                },
                bind: "op11-doll-debuff",
                min: 0,
                max: 1,
                effect: {
                  kind: "modify-power",
                  binding: "op11-doll-debuff",
                  amount: -6_000,
                  expiresAfterTurns: 0,
                },
              },
            },
          ),
        },
      },
    ],
    [
      // OP11-010 Hibari: "[printed text omitted -- pnpm card:text OP11-010]" Its `[When Attacking]` half is in
      // `op11-battle.ts`.
      "OP11-010",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
          },
          bind: "op11-hibari-debuff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "op11-hibari-debuff",
            amount: -2_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // OP11-028 Lord of the Coast: "[printed text omitted -- pnpm card:text OP11-028]"
      //
      // A rest that lasts: the Character stays rested through the refresh, so it
      // cannot block or attack on the turn after either. `expiresAfterTurns: 1`
      // is what carries it past the refresh that would otherwise clear it.
      "OP11-028",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
          },
          bind: "op11-lord-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "op11-lord-lock",
            restriction: "cannot-refresh",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // OP11-029 Charlotte Praline: "[printed text omitted -- pnpm card:text OP11-029]"
      "OP11-029",
      { effect: restOpponentUpToCost(1, "op11-praline-rest") },
    ],
    [
      // OP11-031 Jinbe: "[printed text omitted -- pnpm card:text OP11-031]" Its `[Activate: Main]` half is in `op11-main.ts`.
      "OP11-031",
      {
        effect: {
          kind: "if",
          condition: fishManOrMerfolkLeader,
          then: restOpponentUpToCost(5, "op11-jinbe-rest"),
        },
      },
    ],
    [
      // OP11-035 Fisher Tiger: "[printed text omitted -- pnpm card:text OP11-035]" No cost ceiling at all, which is what a 6-cost body buys.
      "OP11-035",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            canRest: true,
          },
          bind: "op11-tiger-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "op11-tiger-rest" },
        },
      },
    ],
    [
      // OP11-036 Spotted Neptunian: "[printed text omitted -- pnpm card:text OP11-036]"
      //
      // A type or a name, so the disjunction is `anyOf`: a Shirahoshi that is
      // not a {Neptunian} still qualifies, and a card that is both is one card.
      "OP11-036",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Shirahoshi",
          },
          then: lookAndAdd(5, "op11-spotted-look", {
            anyOf: [{ type: "Neptunian" }, { name: "Shirahoshi" }],
          }).effect,
        },
      },
    ],
    [
      // OP11-042 Vito: "[printed text omitted -- pnpm card:text OP11-042]"
      //
      // A 3-cost 4000 body that attacks the turn it lands, for one on-type card.
      // The cost's `match` is what keeps a hand of off-type cards from paying it.
      "OP11-042",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            {
              player: "self",
              zone: "hand",
              type: "Firetank Pirates",
            },
            "op11-vito-cost",
            1,
            {
              kind: "grant-keyword",
              binding: SOURCE_BINDING,
              keyword: "Rush",
              expiresAfterTurns: 0,
            },
          ),
        },
      },
    ],
    [
      // OP11-047 Vinsmoke Reiju: "[printed text omitted -- pnpm card:text OP11-047]"GERMA"[printed text omitted -- pnpm card:text OP11-047]"
      //
      // The leftovers are trashed rather than buried, which is the Blue GERMA
      // shell's own resource: OP11-043 Ichiji reads its trash back.
      "OP11-047",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "The Vinsmoke Family",
          },
          then: lookAndAddOrTrash(5, "op11-reiju-look", {
            typeIncluding: "GERMA",
          }).effect,
        },
      },
    ],
    [
      // OP11-048 Capone"Gang"Bege: "[printed text omitted -- pnpm card:text OP11-048]"
      "OP11-048",
      lookAndAdd(4, "op11-bege-look", {
        anyOf: [{ type: "Firetank Pirates" }, { type: "Straw Hat Crew" }],
        minCost: 2,
      }),
    ],
    [
      // OP11-049 Carrot: "[printed text omitted -- pnpm card:text OP11-049]"
      //
      // No card is added to hand and none is trashed: the whole clause is
      // information plus where each of the three goes. Each card may go to
      // either end, in the player's order, which is the split `order-to-bottom`
      // carries through `alternate` -- the same placement OP05-055 X.Drake
      // prints.
      "OP11-049",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "look-at", player: "self", count: 3, bind: "op11-carrot" },
            placeAtTopOrBottom("op11-carrot", "op11-carrot-place"),
          ],
        },
      },
    ],
    [
      // OP11-051 Sanji: "[printed text omitted -- pnpm card:text OP11-051]"
      //
      // Either board, and printed power -- so a body pumped past 5000 for the
      // turn is still a legal target, and returning one of your own is a real
      // line for picking an [On Play] back up.
      "OP11-051",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            maxPower: 5_000,
          },
          bind: "op11-sanji-bounce",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op11-sanji-bounce",
            to: { player: "owner", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP11-054 Nami: "[printed text omitted -- pnpm card:text OP11-054]"
      //
      // Net one card and a big look at the deck, for a Leader that pays two
      // colours. The two cards go back in the player's order, each to either
      // end -- the top being a setup for a search, the bottom a way to bury
      // dead weight.
      "OP11-054",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-multicolored", player: "self" },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 3 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op11-nami-back",
                min: 2,
                max: 2,
                effect: {
                  kind: "order-to-bottom",
                  binding: "op11-nami-back",
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
      // OP11-056 Brook: "[printed text omitted -- pnpm card:text OP11-056]"
      //
      // Exactly 1, not "or less": both bounds, and printed cost, so a 1-drop
      // raised to 2 by a cost buff has climbed out of reach.
      "OP11-056",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "either",
            zone: "board",
            category: "character",
            minBaseCost: 1,
            maxBaseCost: 1,
          },
          bind: "op11-brook-bury",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op11-brook-bury",
            to: { player: "owner", zone: "deck", position: "bottom" },
          },
        },
      },
    ],
    [
      // OP11-063 Little Sadi: "[printed text omitted -- pnpm card:text OP11-063]"
      "OP11-063",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Impel Down",
          },
          then: restOpponentUpToCost(3, "op11-sadi-rest"),
        }),
      },
    ],
    [
      // OP11-069 Charlotte Brulee: "[printed text omitted -- pnpm card:text OP11-069]"
      //
      // Life for DON!! -- Purple's ramp, paid in the resource that loses the
      // game. The Life card is not lost; it joins the hand.
      "OP11-069",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "life", position: "top" },
            bind: "op11-brulee-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op11-brulee-cost",
                  to: { player: "self", zone: "hand" },
                },
                paidToHand("op11-brulee-cost", [
                  {
                    kind: "if",
                    condition: {
                      kind: "leader-has-type",
                      player: "self",
                      type: "Big Mom Pirates",
                    },
                    then: {
                      kind: "add-don",
                      player: "self",
                      count: 1,
                      rested: false,
                    },
                  },
                ]),
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-070 Charlotte Pudding: "[printed text omitted -- pnpm card:text OP11-070]" Its `[Activate: Main]` half is in `op11-main.ts`.
      "OP11-070",
      lookAndAdd(5, "op11-pudding-look", {
        type: "Big Mom Pirates",
        minCost: 2,
      }),
    ],
    [
      // OP11-075 Jaguar.D.Saul: "[printed text omitted -- pnpm card:text OP11-075]" Its `[Trigger]`
      // activates the same clause, so both point at one program -- see
      // `op11EventPrograms`' counterpart in `op11-triggers.ts`.
      "OP11-075",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "leader-has-name",
                player: "self",
                name: "Nico Robin",
              },
              { kind: "field-don", player: "self", operator: "gte", value: 7 },
            ],
          },
          then: { kind: "draw", player: "self", count: 2 },
        },
      },
    ],
    [
      // OP11-076 Hannyabal: "[printed text omitted -- pnpm card:text OP11-076]"
      "OP11-076",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Impel Down",
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              type: "Impel Down",
              maxCost: 3,
            },
            bind: "op11-hannyabal-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "op11-hannyabal-play" },
          },
        },
      },
    ],
    [
      // OP11-083 Caribou: "[Blocker] [On Play] Trash 2 cards from your hand."
      //
      // Mandatory, and the price of a 1-cost Blocker: Black spends its hand and
      // reads the trash back.
      "OP11-083",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "hand" },
          bind: "op11-caribou-trash",
          // A printed count with no "up to", so `exhaustive`: a hand of one
          // trashes that one (Bandai's OP11-083#1).
          min: 0,
          max: 2,
          exhaustive: true,
          effect: {
            kind: "move",
            binding: "op11-caribou-trash",
            to: { player: "self", zone: "trash" },
          },
        },
      },
    ],
    [
      // OP11-084 Kuzan: "[printed text omitted -- pnpm card:text OP11-084]" Its
      // `[When Attacking]` half is in `op11-battle.ts`.
      "OP11-084",
      { effect: { kind: "trash-top", player: "self", count: 3 } },
    ],
    [
      // OP11-085 Kurozumi Orochi: "[printed text omitted -- pnpm card:text OP11-085]"
      "OP11-085",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "trash",
            type: "SMILE",
            maxCost: 5,
          },
          bind: "op11-orochi-recur",
          min: 0,
          max: 1,
          effect: {
            kind: "move",
            binding: "op11-orochi-recur",
            to: { player: "self", zone: "hand" },
          },
        },
      },
    ],
    [
      // OP11-086 Coribou: "[printed text omitted -- pnpm card:text OP11-086]" Its
      // `[Activate: Main]` half is in `op11-main.ts`.
      "OP11-086",
      {
        effect: {
          kind: "choose",
          selector: { player: "self", zone: "hand" },
          bind: "op11-coribou-trash",
          min: 1,
          max: 1,
          effect: {
            kind: "move",
            binding: "op11-coribou-trash",
            to: { player: "self", zone: "trash" },
          },
        },
      },
    ],
    [
      // OP11-091 Berry Good: "[printed text omitted -- pnpm card:text OP11-091]"
      //
      // Anti-recursion, aimed at a Counter-Event pile rather than at the board.
      "OP11-091",
      {
        effect: opponentPlacesAtBottom(
          { zone: "trash", category: "event" },
          3,
          "op11-berry-good",
        ),
      },
    ],
    [
      // OP11-092 Helmeppo: "[printed text omitted -- pnpm card:text OP11-092]"
      //
      // The body is borrowed rather than recurred: it attacks this turn and then
      // leaves. The debt is booked against the card the play chose -- see
      // `at-end-of-turn`, which is what a clause owed by a *different* card than
      // the one it is printed on needs.
      "OP11-092",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "op11-helmeppo-cost",
            1,
            {
              kind: "sequence",
              effects: [
                { kind: "draw", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "trash",
                    category: "character",
                    type: "SWORD",
                    maxCost: 8,
                    excludeName: "Helmeppo",
                  },
                  bind: "op11-helmeppo-play",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "sequence",
                    effects: [
                      { kind: "play", binding: "op11-helmeppo-play" },
                      {
                        kind: "at-end-of-turn",
                        binding: "op11-helmeppo-play",
                        action: "bury",
                      },
                    ],
                  },
                },
              ],
            },
          ),
        },
      },
    ],
    [
      // OP11-095 Monkey.D.Garp: "[printed text omitted -- pnpm card:text OP11-095]"
      //
      // "If there is a Character" names no side, so an opposing 9-drop switches
      // the K.O. on exactly as Garp itself does -- which at 8 cost it does not,
      // so the clause is really about the giants this deck plays beside it.
      "OP11-095",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "trash", type: "Navy" },
            bind: "op11-garp-cost",
            min: 3,
            max: 3,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "op11-garp-cost",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                {
                  kind: "attach-don",
                  player: "self",
                  from: "rested",
                  count: 1,
                  target: "leader",
                },
                {
                  kind: "if",
                  condition: {
                    kind: "selector-count",
                    player: "either",
                    selector: {
                      zone: "board",
                      category: "character",
                      minCost: 9,
                    },
                    operator: "gte",
                    value: 1,
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "opponent",
                      zone: "board",
                      category: "character",
                      maxCost: 7,
                    },
                    bind: "op11-garp-ko",
                    min: 0,
                    max: 1,
                    effect: { kind: "knock-out", binding: "op11-garp-ko" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // OP11-100 Otohime: "[printed text omitted -- pnpm card:text OP11-100]"
      "OP11-100",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Shirahoshi",
          },
          then: turnLifeFaceDown("op11-otohime-cost", {
            kind: "draw",
            player: "self",
            count: 1,
          }).effect,
        },
      },
    ],
    [
      // OP11-104 Shirley: "[printed text omitted -- pnpm card:text OP11-104]"
      //
      // "The rest" is placed card by card: each to either end, in the
      // player's order, the same split OP11-049 Carrot uses.
      "OP11-104",
      turnLifeFaceDown("op11-shirley-cost", {
        kind: "sequence",
        effects: [
          { kind: "look-at", player: "self", count: 3, bind: "op11-shirley" },
          {
            kind: "choose",
            selector: {
              player: "self",
              zone: "deck",
              binding: "op11-shirley",
              type: "Fish-Man Island",
            },
            bind: "op11-shirley-add",
            min: 0,
            max: 1,
            effect: {
              kind: "move",
              binding: "op11-shirley-add",
              to: { player: "self", zone: "hand" },
            },
          },
          placeAtTopOrBottom("op11-shirley", "op11-shirley-rest"),
        ],
      }),
    ],
    [
      // OP11-108 Neptune: "[printed text omitted -- pnpm card:text OP11-108]"
      "OP11-108",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Shirahoshi",
          },
          then: turnLifeFaceDown("op11-neptune-cost", {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op11-neptune-trash",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "op11-neptune-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          }).effect,
        },
      },
    ],
    [
      // OP11-109 Pappag: "[printed text omitted -- pnpm card:text OP11-109]"
      //
      // A named partner on the board, like OP10's Scotch/Rock pair -- and net
      // zero cards, so what it buys is the choice of which two to keep.
      "OP11-109",
      {
        effect: {
          kind: "if",
          condition: haveNamed("Camie"),
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "op11-pappag-trash",
                min: 2,
                max: 2,
                effect: {
                  kind: "move",
                  binding: "op11-pappag-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    [
      // OP11-119 Koby: "[printed text omitted -- pnpm card:text OP11-119]"
      //
      // No type and no Leader, unlike the rest of the Navy/SWORD package: an
      // 8-cost 9000 body that hands the right to one of its own teammates. Its
      // `[When Attacking]` half is in `op11-battle.ts`.
      "OP11-119",
      { effect: grantAttackActive("op11-koby-target") },
    ],
    [
      // OP11-110 Fukaboshi: "[printed text omitted -- pnpm card:text OP11-110]" Its replacement clause is in
      // `op11-replacements.ts`.
      "OP11-110",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choice",
            branches: [
              {
                id: "top",
                label: "Add the top card of your Life cards to your hand",
                effect: fukaboshi("top"),
              },
              {
                id: "bottom",
                label: "Add the bottom card of your Life cards to your hand",
                effect: fukaboshi("bottom"),
              },
            ],
          },
        },
      },
    ],
  ],
};

/** One end of OP11-110 Fukaboshi's Life cost, and the K.O. it buys. */
function fukaboshi(position: "top" | "bottom"): MechanicEffect {
  return {
    kind: "choose",
    selector: { player: "self", zone: "life", position },
    bind: "op11-fukaboshi-cost",
    min: 1,
    max: 1,
    effect: {
      kind: "sequence",
      effects: [
        {
          kind: "move",
          binding: "op11-fukaboshi-cost",
          to: { player: "self", zone: "hand" },
        },
        paidToHand("op11-fukaboshi-cost", [
          {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
              maxCost: 1,
            },
            bind: "op11-fukaboshi-ko",
            min: 0,
            max: 1,
            effect: { kind: "knock-out", binding: "op11-fukaboshi-ko" },
          },
        ]),
      ],
    },
  };
}
