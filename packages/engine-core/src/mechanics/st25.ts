/**
 * STARTER DECK -Blue Buggy- [ST-25], the five cards the product adds to the
 * OP-09 Buggy core it is built on.
 *
 * Small enough to be one file rather than the four-way split by timing window
 * the bigger products take; see `mechanics/README.md`. The three "2 or more
 * Characters with a base cost of 5 or more" clauses (ST25-001, ST25-002,
 * ST25-005) and ST25-002's `[Opponent's Turn]` buff are continuous, so they are
 * rows in `static-abilities.ts` rather than programs here.
 *
 * The product exists to reach OP09-051 Buggy's board of five 5-cost
 * Characters: three 4-cost bodies that count as 5 once two real 5-costs are
 * out, and two cards that put Cross Guild bodies from hand onto the field
 * without paying for them.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST25-00x` prints it from the local cache).
 */
import { SOURCE_BINDING, type MechanicCondition } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { drawAndDiscard, payFromHand } from "./shared.js";

const buggyLeader: MechanicCondition = {
  kind: "leader-has-name",
  player: "self",
  name: "Buggy",
};

export const st25Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST25-001 Alvida: behind a Buggy Leader, draw three and trash two.
      "ST25-001",
      {
        effect: {
          kind: "if",
          condition: buggyLeader,
          then: drawAndDiscard(3, 2, "st25-alvida-discard"),
        },
      },
    ],
    [
      // ST25-003 Crocodile & Mihawk: draw two, trash one, then a free Cross
      // Guild body of cost 4 or less from hand. The refill comes first, so
      // the card it draws can be the one it plays -- ST25-004 Buggy is the
      // line Bandai's deck page names.
      "ST25-003",
      {
        effect: {
          kind: "sequence",
          effects: [
            drawAndDiscard(2, 1, "st25-croc-mihawk-discard"),
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                type: "Cross Guild",
                maxCost: 4,
              },
              bind: "st25-croc-mihawk-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "st25-croc-mihawk-play" },
            },
          ],
        },
      },
    ],
  ],
  activateMain: [
    [
      // ST25-004 Buggy: trash a card and this Character to play a Cross Guild
      // body of cost 6 or less from hand. Both costs are paid before the
      // Leader gate is read, as OP09-089 Stronger's are: the Leader condition
      // sits after the colon, so a non-Buggy Leader still pays and gets
      // nothing. Trashing itself is what makes it once per copy.
      "ST25-004",
      {
        oncePerTurn: false,
        requires: { handCards: 1 },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand" },
              "st25-buggy-cost",
              1,
              {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: SOURCE_BINDING,
                    to: { player: "owner", zone: "trash" },
                  },
                  {
                    kind: "if",
                    condition: buggyLeader,
                    then: {
                      kind: "choose",
                      selector: {
                        player: "self",
                        zone: "hand",
                        category: "character",
                        type: "Cross Guild",
                        maxCost: 6,
                      },
                      bind: "st25-buggy-play",
                      min: 0,
                      max: 1,
                      effect: { kind: "play", binding: "st25-buggy-play" },
                    },
                  },
                ],
              },
            ),
          },
        },
      },
    ],
  ],
  onKo: [
    [
      // ST25-005 Mohji: behind a Buggy Leader, a card back for the K.O. while
      // the hand is short. Both conditions are read when the clause resolves.
      "ST25-005",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              buggyLeader,
              {
                kind: "zone-count",
                player: "self",
                zone: "hand",
                operator: "lte",
                value: 3,
              },
            ],
          },
          then: { kind: "draw", player: "self", count: 1 },
        },
      },
    ],
  ],
  replacement: [
    [
      // ST25-003 Crocodile & Mihawk: once a turn, a card from hand instead of
      // a Cross Guild Character leaving the field to an opponent's effect.
      // "Removed from the field" is wider than a K.O. -- OP09-051's bottom-deck
      // is exactly the kind of removal it answers -- and Crocodile & Mihawk
      // carries the type, so it protects itself as well.
      "ST25-003",
      {
        opponentEffectOnly: true,
        oncePerTurn: true,
        removal: "off-field",
        protects: { category: "character", type: "Cross Guild" },
        label: "Trash 1 card from your hand",
        cost: { kind: "trash-from-hand", count: 1 },
      },
    ],
  ],
};
