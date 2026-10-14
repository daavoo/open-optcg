/**
 * EB-01 `[On Play]` programs.
 *
 * The extra booster is 61 cards and splits the same way the main sets do, by
 * the timing window a clause fires in: this file, `eb01-main.ts`,
 * `eb01-battle.ts`, `eb01-triggers.ts` and `eb01-shared.ts`. See
 * `mechanics/README.md`.
 *
 * One identity was in the pool before the set was -- EB01-048 Laboon, played by
 * the ST-27 Teach list -- and it prints no clause this file would carry.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import { SOURCE_BINDING, type MechanicEffect } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus, lifeToHandCost } from "./shared.js";
import {
  baroqueWorksLeader,
  koCostAtMost,
  waterSevenLeader,
} from "./eb01-shared.js";

/**
 * "Give up to 1 of your opponent's Characters −N cost during this turn."
 *
 * EB01-042 pays −2 and EB01-046 −1, and both print it as the tail of a longer
 * clause. `expiresAfterTurns: 0` for the same reason the power debuffs take it:
 * "during this turn" does not reach the opponent's own turn.
 */
export const costDebuff = (amount: number, bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "opponent", zone: "board", category: "character" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "modify-cost",
    binding: bind,
    amount: -amount,
    expiresAfterTurns: 0,
  },
});

/**
 * EB01-046 Brook's whole clause, printed on two timings.
 *
 * The order is the card: the cost debuff runs first and the K.O. reads "cost of
 * 0" afterwards, so a 1-cost body the first half just knocked down is a legal
 * target for the second. Writing them the other way round would make the two
 * halves independent and the card far worse than it reads.
 */
const brookCostThenKo: MechanicEffect = {
  kind: "sequence",
  effects: [costDebuff(1, "eb01-brook-cost"), koCostAtMost(0, "eb01-brook-ko")],
};

/**
 * EB01-012 Cavendish's clause, printed on `[On Play]` and `[When Attacking]`.
 *
 * "you have no other [Cavendish] Characters" is a count of the board excluding
 * the source, which is what `excludeSource` says -- the copy that is resolving
 * the clause never counts against itself.
 */
const cavendishRamp: MechanicEffect = {
  kind: "if",
  condition: {
    kind: "all-of",
    conditions: [
      { kind: "leader-has-type", player: "self", type: "Supernovas" },
      {
        kind: "selector-count",
        player: "self",
        selector: {
          zone: "board",
          category: "character",
          name: "Cavendish",
          excludeSource: true,
        },
        operator: "eq",
        value: 0,
      },
    ],
  },
  then: { kind: "activate-don", player: "self", count: 2 },
};

export const eb01OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // EB01-002 Izo: "[On Play] Give up to 1 rested DON!! card to your Leader
      // or 1 of your Characters."
      "EB01-002",
      { effect: { kind: "give-rested-don", player: "self", count: 1 } },
    ],
    [
      // EB01-012 Cavendish, the `[On Play]` half -- see `cavendishRamp`.
      "EB01-012",
      { effect: cavendishRamp },
    ],
    [
      // EB01-015 Scratchmen Apoo: "[On Play] Rest up to 1 of your opponent's
      // Characters with a cost of 2 or less."
      "EB01-015",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 2,
            rested: false,
          },
          bind: "eb01-apoo",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "eb01-apoo" },
        },
      },
    ],
    [
      // EB01-023 Edward Weevil: "[On Play] Draw 1 card."
      "EB01-023",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // EB01-027 Mr.1(Daz.Bonez): "[On Play] Draw 2 cards and trash 1 card from
      // your hand."
      //
      // The trash is mandatory and the draw happens first, so the card spent
      // may be one of the two just drawn -- which is what makes this a filter
      // rather than a cost.
      "EB01-027",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb01-daz-trash",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb01-daz-trash",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // EB01-031 Kalifa: "[On Play] DON!! −1: If your Leader has the
      // {Water Seven} type, add up to 2 Character cards with a cost of 4 or
      // less from your trash to your hand."
      //
      // "up to 2" is one `choose` with `max: 2` rather than two of one: the
      // printed clause is a single selection, and two nodes would let the same
      // card be picked twice.
      "EB01-031",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: waterSevenLeader,
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "trash",
              category: "character",
              maxCost: 4,
            },
            bind: "eb01-kalifa",
            min: 0,
            max: 2,
            effect: {
              kind: "move",
              binding: "eb01-kalifa",
              to: { player: "self", zone: "hand" },
            },
          },
        }),
      },
    ],
    [
      // EB01-033 Blueno: "[On Play] DON!! −1: If your Leader has the
      // {Water Seven} type, play up to 1 {Water Seven} type Character card with
      // a cost of 5 other than [Blueno] from your hand or trash."
      //
      // "a cost of 5" is exact, not a ceiling, so the band is closed at both
      // ends -- this is the clause that fetches the package's 5-drops and
      // nothing cheaper.
      "EB01-033",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: waterSevenLeader,
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: ["hand", "trash"],
              category: "character",
              type: "Water Seven",
              minCost: 5,
              maxCost: 5,
              excludeName: "Blueno",
            },
            bind: "eb01-blueno",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "eb01-blueno" },
          },
        }),
      },
    ],
    [
      // EB01-035 Ms. Monday: "[On Play] If your Leader's type includes
      // \"Baroque Works\", up to 1 of your Leader or Character cards gains
      // +1000 power during this turn."
      "EB01-035",
      {
        effect: {
          kind: "if",
          condition: baroqueWorksLeader,
          then: {
            kind: "choose",
            selector: { player: "self", zone: "board", includeLeader: true },
            bind: "eb01-monday",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "eb01-monday",
              amount: 1_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // EB01-043 Spandine: "[On Play] You may place 3 cards with a type
      // including \"CP\" from your trash at the bottom of your deck in any
      // order: Play up to 1 Character card with a type including \"CP\" and a
      // cost of 4 or less other than [Spandine] from your trash rested."
      //
      // The cost is exactly 3 cards, so `min` and `max` agree: a trash with two
      // left cannot part-pay. It is also what makes the clause self-limiting --
      // the bodies it recurs are the same ones it buries.
      "EB01-043",
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
            bind: "eb01-spandine-cost",
            min: 3,
            max: 3,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "order-to-bottom",
                  binding: "eb01-spandine-cost",
                  to: { player: "self", zone: "deck", position: "bottom" },
                },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "trash",
                    category: "character",
                    typeIncluding: "CP",
                    maxCost: 4,
                    excludeName: "Spandine",
                  },
                  bind: "eb01-spandine-play",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "play",
                    binding: "eb01-spandine-play",
                    rested: true,
                  },
                },
              ],
            },
          },
        },
      },
    ],
    [
      // EB01-045 Brook: "[On Play] If your opponent has a Character with a cost
      // of 0, this Character gains [Rush] during this turn."
      //
      // The grant is on the source, so it is the card that can attack the turn
      // it lands -- and only against a board the opponent has already shrunk.
      "EB01-045",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "opponent",
            selector: {
              zone: "board",
              category: "character",
              minCost: 0,
              maxCost: 0,
            },
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "grant-keyword",
            binding: SOURCE_BINDING,
            keyword: "Rush",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // EB01-046 Brook, the `[On Play]` half -- see `brookCostThenKo`.
      "EB01-046",
      { effect: brookCostThenKo },
    ],
    [
      // EB01-049 T-Bone: "[On Play] K.O. up to 1 of your opponent's Characters
      // with a cost of 2 or less."
      "EB01-049",
      { effect: koCostAtMost(2, "eb01-tbone") },
    ],
    [
      // EB01-052 Viola: "[On Play] Choose one: • Look at all of your opponent's
      // Life cards and place them back in their Life area in any order. • Turn
      // all of your Life cards face-down."
      //
      // The first branch is `order-to-bottom` pointed at the Life area rather
      // than the deck: the node's job is "the player puts these back in an
      // order they choose", and the destination is what says where. Looking is
      // the point -- the order barely matters, and knowing the opponent's Life
      // is what the card sells.
      //
      // The second branch un-reveals Life that an effect has turned face-up,
      // which is what makes it worth printing beside the first.
      "EB01-052",
      {
        effect: {
          kind: "choice",
          branches: [
            {
              id: "look",
              label: "Look at your opponent's Life cards and reorder them",
              effect: {
                kind: "select",
                selector: { player: "opponent", zone: "life" },
                bind: "eb01-viola-look",
                count: "all",
                effect: {
                  kind: "order-to-bottom",
                  binding: "eb01-viola-look",
                  to: { player: "opponent", zone: "life", position: "bottom" },
                },
              },
            },
            {
              id: "hide",
              label: "Turn all of your Life cards face-down",
              effect: {
                kind: "select",
                selector: { player: "self", zone: "life", faceUp: true },
                bind: "eb01-viola-hide",
                count: "all",
                effect: {
                  kind: "update",
                  binding: "eb01-viola-hide",
                  faceUp: false,
                },
              },
            },
          ],
        },
      },
    ],
    [
      // EB01-053 Gastino: "[On Play] Place up to 1 of your opponent's
      // Characters with a cost of 3 or less at the top or bottom of your
      // opponent's Life cards face-up."
      //
      // Removal that hands the opponent a Life card, so the top/bottom choice
      // is the whole decision: the top is the card their next attack loses, the
      // bottom is one they may never reach. `faceUp` because the text says so,
      // and a face-up Life card is one both seats can see coming.
      "EB01-053",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 3,
          },
          bind: "eb01-gastino",
          min: 0,
          max: 1,
          effect: {
            kind: "choice",
            branches: [
              {
                id: "top",
                label: "Place it on top of their Life cards",
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "eb01-gastino",
                      to: {
                        player: "opponent",
                        zone: "life",
                        position: "top",
                      },
                    },
                    {
                      kind: "update",
                      binding: "eb01-gastino",
                      faceUp: true,
                    },
                  ],
                },
              },
              {
                id: "bottom",
                label: "Place it at the bottom of their Life cards",
                effect: {
                  kind: "sequence",
                  effects: [
                    {
                      kind: "move",
                      binding: "eb01-gastino",
                      to: {
                        player: "opponent",
                        zone: "life",
                        position: "bottom",
                      },
                    },
                    {
                      kind: "update",
                      binding: "eb01-gastino",
                      faceUp: true,
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
      // EB01-054 Gan.Fall: "[On Play] If your opponent has 1 or less Life
      // cards, K.O. up to 1 of your opponent's Characters with a cost of 3 or
      // less."
      //
      // A Blocker that only removes once the opponent is already low, which is
      // the half of the card that decides when it is worth holding.
      "EB01-054",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "life",
            operator: "lte",
            value: 1,
          },
          then: koCostAtMost(3, "eb01-ganfall"),
        },
      },
    ],
    [
      // EB01-056 Charlotte Flampe: "[On Play] You may add 1 card from the top
      // or bottom of your Life cards to your hand: Draw 1 card."
      //
      // `lifeToHandCost` is the shared shape: `position: "edge"` is what "the
      // top or bottom" means, and the two ends are the only Life cards any
      // clause in the pool may name.
      "EB01-056",
      lifeToHandCost({ kind: "draw", player: "self", count: 1 }),
    ],
    [
      // EB01-061 Mr.2.Bon.Kurei(Bentham): "[On Play] Add up to 1 DON!! card
      // from your DON!! deck and set it as active."
      "EB01-061",
      { effect: { kind: "add-don", player: "self", count: 1, rested: false } },
    ],
  ],
};

export { cavendishRamp, brookCostThenKo };
