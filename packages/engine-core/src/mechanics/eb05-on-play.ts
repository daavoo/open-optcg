/**
 * EB-05 `[On Play]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type MechanicEffect, type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { drawAndDiscard, lookAndAdd, payFromHand } from "./shared.js";

/**
 * EB05-050 Atlas's `[On Play]`, which its `[Trigger]` in `eb05-triggers.ts`
 * activates as printed.
 *
 * `attribute` reads the printed icon of a card still in the deck, so a
 * multi-attribute card with <Wisdom> among its icons qualifies.
 */
export const atlasSearch: MechanicProgram = lookAndAdd(4, "eb05-050-look", {
  attribute: "Wisdom",
});

/**
 * "Add up to 1 card from the top of your deck to the top of your Life cards."
 *
 * EB05-055 Nami's `[On Play]` and EB05-060 Take Care of Lilith!!!'s `[Main]`.
 * A `choose` over the single top card rather than a bare move: the printed "up
 * to" lets the player keep the Life total where it is, and an empty deck
 * resolves to nothing.
 */
export const deckTopToLife = (bind: string): MechanicEffect => ({
  kind: "choose",
  selector: { player: "self", zone: "deck", position: "top" },
  bind,
  min: 0,
  max: 1,
  effect: {
    kind: "move",
    binding: bind,
    to: { player: "self", zone: "life", position: "top" },
  },
});

export const eb05OnPlayMechanics: SetMechanics = {
  onPlay: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
    [
      // EB05-042 Shinobu. Printed text: `pnpm card:text EB05-042`.
      //
      // Mandatory on both halves: the trash is a `choose` with `min` equal to
      // `max`, so which two cards go is the decision and how many is not.
      "EB05-042",
      { effect: drawAndDiscard(2, 2, "eb05-042-trash") },
    ],
    [
      // EB05-044 Ms. Father's Day. Printed text: `pnpm card:text EB05-044`.
      //
      // Two gates joined in one `all-of`, so a board that fails either never
      // reaches the debuff. The Leader half is the substring reading of
      // "Baroque Works" -- {Former Baroque Works} answers it too. The board
      // half is effective cost, so a Character the opponent's own effects
      // pushed down to 0 switches the clause on.
      "EB05-044",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "leader-type-including",
                player: "self",
                text: "Baroque Works",
              },
              {
                kind: "selector-count",
                player: "opponent",
                selector: { zone: "board", category: "character", maxCost: 0 },
                operator: "gte",
                value: 1,
              },
            ],
          },
          then: {
            kind: "select",
            selector: { player: "opponent", zone: [], includeLeader: true },
            bind: "eb05-044-leader",
            count: "all",
            effect: {
              kind: "modify-power",
              binding: "eb05-044-leader",
              amount: -1_000,
              expiresAfterTurns: 0,
            },
          },
        },
      },
    ],
    [
      // EB05-045 Ms. Monday. Printed text: `pnpm card:text EB05-045`.
      //
      // No `excludeSource`: she may K.O. herself (Bandai's EB05-045#1), which
      // is how her own `[On K.O.]` search is bought. `min: 0` is the printed
      // "up to" -- K.O.ing nothing is legal too (EB05-045#2).
      "EB05-045",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            typeIncluding: "Baroque Works",
          },
          bind: "eb05-045-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "eb05-045-ko" },
        },
      },
    ],
    [
      // EB05-047 Ripley. Printed text: `pnpm card:text EB05-047`.
      //
      // The play is nested inside the paid trash, so a player with no other
      // card in hand is never handed the recursion for free. The trash is
      // read after the cost is paid, so a cost-2 Character trashed to pay it
      // is itself a legal pick. Printed cost, because a card in the trash has
      // nothing to modify it.
      "EB05-047",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand" },
            "eb05-047-cost",
            1,
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "trash",
                category: "character",
                maxCost: 2,
              },
              bind: "eb05-047-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb05-047-play" },
            },
          ),
        },
      },
    ],
    // EB05-050 Atlas. Printed text: `pnpm card:text EB05-050`.
    ["EB05-050", atlasSearch],
    [
      // EB05-051 Ahiru. Printed text: `pnpm card:text EB05-051`.
      //
      // The ceiling is the two Life piles summed and read when the clause
      // resolves -- `maxCostFromZoneCount` over `"either"` -- so it shrinks as
      // the game does. Effective cost, and `canRest` keeps a protected
      // Character off the list.
      "EB05-051",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCostFromZoneCount: { player: "either", zone: "life" },
            canRest: true,
          },
          bind: "eb05-051-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "eb05-051-rest" },
        },
      },
    ],
    [
      // EB05-055 Nami. Printed text: `pnpm card:text EB05-055`.
      //
      // `[Your Turn]` is the outer gate, which is what keeps her own
      // `[Trigger]` play -- on the opponent's turn -- from also banking a Life
      // card. The Leader gate reads attributes, so a Leader printing <Wisdom>
      // among several icons answers it.
      "EB05-055",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "turn-player", player: "self" },
              {
                kind: "leader-has-attribute",
                player: "self",
                attribute: "Wisdom",
              },
            ],
          },
          then: deckTopToLife("eb05-055-life"),
        },
      },
    ],
    [
      // EB05-056 Nico Olvia. Printed text: `pnpm card:text EB05-056`.
      //
      // The Leader gate sits inside the paid trash: the card goes whether or
      // not the draw follows, so behind any other Leader the cost buys
      // nothing. `hasTrigger` is the printed filter on the card paid.
      "EB05-056",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand", hasTrigger: true },
            "eb05-056-cost",
            1,
            {
              kind: "if",
              condition: {
                kind: "leader-has-name",
                player: "self",
                name: "Nico Robin",
              },
              then: { kind: "draw", player: "self", count: 2 },
            },
          ),
        },
      },
    ],
  ],
};
