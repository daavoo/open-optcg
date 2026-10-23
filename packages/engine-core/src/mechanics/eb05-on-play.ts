/**
 * EB-05 `[On Play]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type SetMechanics } from "./registry.js";
import { lookAndAdd, restCostAtMost } from "./shared.js";
import {
  playCharacterFromHand,
  revealFromHand,
} from "./eb05-red-green-shared.js";

export const eb05OnPlayMechanics: SetMechanics = {
  onPlay: [
    // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
    [
      // EB05-001 Jewelry Bonney. Printed text: `pnpm card:text EB05-001`.
      //
      // One gate over both halves: the draw and the free plays are a single
      // sentence behind the {Supernovas} Leader, so a Bonney behind another
      // Leader is a 5-cost 7000 and nothing else. The draw comes first, so the
      // two cards it finds are candidates for the plays. `maxPower` is printed
      // power, which is what a card in hand has.
      "EB05-001",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "Supernovas",
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 2 },
              {
                kind: "choose",
                selector: {
                  player: "self",
                  zone: "hand",
                  category: "character",
                  maxPower: 2000,
                },
                bind: "eb05-001-play",
                min: 0,
                max: 2,
                effect: { kind: "play", binding: "eb05-001-play" },
              },
            ],
          },
        },
      },
    ],
    [
      // EB05-002 Doll. Printed text: `pnpm card:text EB05-002`.
      //
      // The OP10 "look 5, add up to 2" search for {Navy} at cost 2 or more,
      // then a trash that is not optional: once the search has resolved the
      // hand always holds a card unless it was empty to begin with, and which
      // card goes is the player's decision -- a `choose` with `min: 1`.
      "EB05-002",
      {
        effect: {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "eb05-002-look", { type: "Navy", minCost: 2 }, 2)
              .effect,
            {
              kind: "choose",
              selector: { player: "self", zone: "hand" },
              bind: "eb05-002-trash",
              min: 1,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb05-002-trash",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // EB05-004 Baby 5. Printed text: `pnpm card:text EB05-004`.
      //
      // The two Events are shown, not spent, so a hand of Events pays this
      // every time a copy lands. Its `[On K.O.]` is in `eb05-triggers.ts`.
      "EB05-004",
      {
        effect: {
          kind: "optional",
          effect: revealFromHand({ category: "event" }, 2, "eb05-004-reveal", {
            kind: "draw",
            player: "self",
            count: 2,
          }),
        },
      },
    ],
    [
      // EB05-005 Belo Betty. Printed text: `pnpm card:text EB05-005`.
      //
      // Both facts at once -- the {Revolutionary Army} type *and* a printed
      // [Trigger] -- so the selector's two conjunctive fields rather than the
      // OP05-002 Leader's `anyOf`. Belo Betty herself prints no [Trigger] and
      // so is never one of the three. Its `[Activate: Main]` is in
      // `eb05-main.ts`.
      "EB05-005",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            type: "Revolutionary Army",
            hasTrigger: true,
          },
          bind: "eb05-005-buff",
          min: 0,
          max: 3,
          effect: {
            kind: "modify-power",
            binding: "eb05-005-buff",
            amount: 2000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
    [
      // EB05-007 Monet. Printed text: `pnpm card:text EB05-007`.
      //
      // "A total of 3" is one pool: an Event and a {Punk Hazard} Character
      // both count toward the same three, so the selector is a disjunction and
      // a card that is both is still one card. Its `[End of Your Turn]` is in
      // `eb05-triggers.ts`.
      "EB05-007",
      {
        effect: {
          kind: "optional",
          effect: revealFromHand(
            { anyOf: [{ category: "event" }, { type: "Punk Hazard" }] },
            3,
            "eb05-007-reveal",
            { kind: "draw", player: "self", count: 1 },
          ),
        },
      },
    ],
    [
      // EB05-011 Otohime. Printed text: `pnpm card:text EB05-011`.
      //
      // The price is turning the top Life card face-down, which only a
      // face-up top card can pay (Bandai's EB05-011#1): a Life card is
      // face-down unless something like the OP11-022 Shirahoshi Leader turned
      // it over. Both halves of the gate are the program's outermost
      // condition, so a Leader of another name, or a face-down top card, asks
      // nothing at all.
      "EB05-011",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              { kind: "leader-has-name", player: "self", name: "Shirahoshi" },
              {
                kind: "selector-count",
                player: "self",
                selector: { zone: "life", position: "top", faceUp: true },
                operator: "gte",
                value: 1,
              },
            ],
          },
          then: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: {
                player: "self",
                zone: "life",
                position: "top",
                faceUp: true,
              },
              bind: "eb05-011-life",
              min: 1,
              max: 1,
              effect: {
                kind: "sequence",
                effects: [
                  { kind: "update", binding: "eb05-011-life", faceUp: false },
                  restCostAtMost(5, "eb05-011-rest"),
                ],
              },
            },
          },
        },
      },
    ],
    [
      // EB05-012 Camie. Printed text: `pnpm card:text EB05-012`.
      "EB05-012",
      { effect: restCostAtMost(6, "eb05-012-rest") },
    ],
    [
      // EB05-014 Shirahoshi. Printed text: `pnpm card:text EB05-014`.
      //
      // "Up to a total of 2" across a name and a type, so one `choose` over a
      // disjunction rather than two searches: two [Megalo], two {Neptunian}
      // or one of each (Bandai's EB05-014#1). Unlike the bottom-of-deck
      // searches, everything not taken is trashed. Its `[Activate: Main]` is
      // in `eb05-main.ts`.
      "EB05-014",
      {
        effect: {
          kind: "sequence",
          effects: [
            {
              kind: "look-at",
              player: "self",
              count: 5,
              bind: "eb05-014-look",
            },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "deck",
                binding: "eb05-014-look",
                anyOf: [{ name: "Megalo" }, { type: "Neptunian" }],
              },
              bind: "eb05-014-add",
              min: 0,
              max: 2,
              effect: {
                kind: "move",
                binding: "eb05-014-add",
                to: { player: "self", zone: "hand" },
              },
            },
            {
              kind: "select",
              selector: {
                player: "self",
                zone: "deck",
                binding: "eb05-014-look",
              },
              bind: "eb05-014-rest",
              count: "all",
              effect: {
                kind: "move",
                binding: "eb05-014-rest",
                to: { player: "self", zone: "trash" },
              },
            },
          ],
        },
      },
    ],
    [
      // EB05-016 Nico Robin. Printed text: `pnpm card:text EB05-016`.
      //
      // `[Your Turn]` on an `[On Play]`: a Robin that reaches the field on the
      // opponent's turn -- off EB05-004 Baby 5's `[On K.O.]`, say -- plays
      // nothing. `turn-player` is the gate, outermost so the clause is never
      // offered there. Its `[Trigger]` is in `eb05-triggers.ts`.
      "EB05-016",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "self" },
          then: playCharacterFromHand(
            { maxCost: 5, attribute: "Wisdom" },
            "eb05-016-play",
          ),
        },
      },
    ],
    [
      // EB05-018 Rebecca. Printed text: `pnpm card:text EB05-018`.
      //
      // Only a rested Character can be held down, and `cannot-refresh` for
      // one turn is the opponent's next Refresh Phase -- the same reading
      // OP15-025 Kuro's lock has.
      "EB05-018",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            rested: true,
            maxCost: 6,
          },
          bind: "eb05-018-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "eb05-018-lock",
            restriction: "cannot-refresh",
            expiresAfterTurns: 1,
          },
        },
      },
    ],
    [
      // EB05-061 Nami. Printed text: `pnpm card:text EB05-061`.
      //
      // Effective cost, as every "cost of N or less" on a card in hand reads.
      // Its replacement is in `eb05-replacements.ts`.
      "EB05-061",
      {
        effect: playCharacterFromHand(
          { color: "Red", maxCost: 2 },
          "eb05-061-play",
        ),
      },
    ],
    // -- Blue and Purple: EB05-021 to EB05-040 --
    // -- Black and Yellow: EB05-041 to EB05-060 --
  ],
};
