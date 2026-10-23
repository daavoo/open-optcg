/**
 * EB-05 `[On Play]` programs.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`; the repo carries
 * the derived rules and not the words.
 */
import { type MechanicProgram } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import {
  donMinus,
  drawAndDiscard,
  lookAndAdd,
  payFromHand,
  restCostAtMost,
} from "./shared.js";
import {
  deckTopToLife,
  playCharacterFromHand,
  revealFromHand,
} from "./eb05-shared.js";

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
    [
      // EB05-021 Alvida. Printed text: `pnpm card:text EB05-021`.
      //
      // Three steps in printed order, and the lock is last on purpose: the
      // free play happens first, so the ban cannot stop it, and the ban is
      // written before any [On Play] of the played card resolves -- that
      // card's own clause waits for this program to finish, which is Bandai's
      // EB05-021#1 ruling (ST25-003's free play finds the ban already up).
      // `maxCost` rather than the printed cost, because a discount the board
      // is applying is real and the free play is the payoff.
      "EB05-021",
      {
        effect: {
          kind: "sequence",
          effects: [
            { kind: "draw", player: "self", count: 2 },
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                type: "Cross Guild",
                maxCost: 8,
              },
              bind: "eb05-021-play",
              min: 0,
              max: 1,
              effect: { kind: "play", binding: "eb05-021-play" },
            },
            {
              kind: "restrict-player",
              player: "self",
              restriction: "cannot-play-characters",
              expiresAfterTurns: 0,
            },
          ],
        },
      },
    ],
    [
      // EB05-023 Osome. Printed text: `pnpm card:text EB05-023`.
      //
      // The two Events are a cost, so the draw is nested inside the cost's
      // `choose` (`payFromHand`): a hand with one Event cannot pay, and the
      // draw is then unreachable rather than free.
      "EB05-023",
      {
        effect: {
          kind: "optional",
          effect: payFromHand(
            { player: "self", zone: "hand", category: "event" },
            "eb05-023-cost",
            2,
            { kind: "draw", player: "self", count: 3 },
          ),
        },
      },
    ],
    [
      // EB05-025 Domino. Printed text: `pnpm card:text EB05-025`.
      //
      // The house look-three shape. The same program is the card's
      // `[Trigger]` in `eb05-triggers.ts`, which prints only "activate this
      // card's [On Play]".
      "EB05-025",
      lookAndAdd(3, "eb05-025-look", { type: "Impel Down" }),
    ],
    [
      // EB05-027 Hibari. Printed text: `pnpm card:text EB05-027`.
      //
      // The refill is mandatory and comes first, then the bury. The bury
      // names no side, so `player: "either"` and `to.player: "owner"`: a
      // small Character of this player's own is a legal answer, and it goes
      // under its owner's deck rather than this player's.
      "EB05-027",
      {
        effect: {
          kind: "sequence",
          effects: [
            drawAndDiscard(3, 2, "eb05-027-trash"),
            {
              kind: "choose",
              selector: {
                player: "either",
                zone: "board",
                category: "character",
                maxCost: 2,
              },
              bind: "eb05-027-bury",
              min: 0,
              max: 1,
              effect: {
                kind: "move",
                binding: "eb05-027-bury",
                to: { player: "owner", zone: "deck", position: "bottom" },
              },
            },
          ],
        },
      },
    ],
    [
      // EB05-028 Boa Hancock. Printed text: `pnpm card:text EB05-028`.
      //
      // The opponent trashes, so the opponent picks (`chooser`) -- Bandai's
      // EB05-028#1 ruling, and the rule for anything leaving a hand. Exactly
      // four: the gate guarantees nine cards behind the pick, so `min` and
      // `max` agree.
      "EB05-028",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "zone-count",
            player: "opponent",
            zone: "hand",
            operator: "gte",
            value: 9,
          },
          then: {
            kind: "choose",
            selector: { player: "opponent", zone: "hand" },
            chooser: "opponent",
            bind: "eb05-028-discard",
            min: 4,
            max: 4,
            effect: {
              kind: "move",
              binding: "eb05-028-discard",
              to: { player: "owner", zone: "trash" },
            },
          },
        },
      },
    ],
    [
      // EB05-031 Vinsmoke Reiju. Printed text: `pnpm card:text EB05-031`.
      //
      // `DON!! −1` is the cost and the Leader gate is read after it, in
      // printed order: a Purple deck can want the return for its own sake,
      // so paying under the wrong Leader is a legal (if empty) line. The mill
      // is mandatory once the gate holds.
      "EB05-031",
      {
        effect: donMinus(1, {
          kind: "if",
          condition: {
            kind: "leader-has-type",
            player: "self",
            type: "The Vinsmoke Family",
          },
          then: { kind: "trash-top", player: "self", count: 10 },
        }),
      },
    ],
    [
      // EB05-033 Nico Robin. Printed text: `pnpm card:text EB05-033`.
      //
      // One condition over the whole clause, "Then" sentence included --
      // Bandai's EB05-033#1 ruling: a failed gate adds no DON!! either.
      // `field-don-versus` with `by: 6` is "at least 6 fewer than the
      // opponent". The DON!! go in rested and "up to 4" is however many the
      // DON!! deck still holds.
      "EB05-033",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "leader-has-type",
                player: "self",
                type: "Straw Hat Crew",
              },
              {
                kind: "field-don-versus",
                player: "self",
                operator: "lt",
                by: 6,
              },
            ],
          },
          then: {
            kind: "sequence",
            effects: [
              drawAndDiscard(3, 2, "eb05-033-trash"),
              { kind: "add-don", player: "self", count: 4, rested: true },
            ],
          },
        },
      },
    ],
    [
      // EB05-034 Sugar. Printed text: `pnpm card:text EB05-034`.
      //
      // The DON!! count is read inside `donMinus`, after the two DON!! have
      // gone back -- Bandai's EB05-034#1 ruling: seven or eight on the field
      // before paying is six or fewer after, and the debuff does not happen.
      "EB05-034",
      {
        effect: donMinus(2, {
          kind: "if",
          condition: {
            kind: "field-don",
            player: "self",
            operator: "gte",
            value: 7,
          },
          then: {
            kind: "choose",
            selector: {
              player: "opponent",
              zone: "board",
              category: "character",
            },
            bind: "eb05-034-debuff",
            min: 0,
            max: 1,
            effect: {
              kind: "modify-power",
              binding: "eb05-034-debuff",
              amount: -4_000,
              expiresAfterTurns: 0,
            },
          },
        }),
      },
    ],
    [
      // EB05-035 Speed. Printed text: `pnpm card:text EB05-035`.
      //
      // Both halves sit behind the one `DON!! −1`: the dig finds up to two
      // {SMILE} cards, and the play that follows reads the hand the dig
      // produced, so a card found here can be played in the same clause.
      // `maxPower` is base power, which is what a card in hand has.
      "EB05-035",
      {
        effect: donMinus(1, {
          kind: "sequence",
          effects: [
            lookAndAdd(5, "eb05-035-look", { type: "SMILE" }, 2).effect,
            {
              kind: "choose",
              selector: {
                player: "self",
                zone: "hand",
                category: "character",
                type: "SMILE",
                maxPower: 5_000,
              },
              bind: "eb05-035-play",
              min: 0,
              max: 2,
              effect: { kind: "play", binding: "eb05-035-play" },
            },
          ],
        }),
      },
    ],
    [
      // EB05-036 Tsuru. Printed text: `pnpm card:text EB05-036`.
      //
      // Both payouts behind the {Navy} gate; the DON!! comes in rested, so it
      // is ramp for next turn and not a play this turn.
      "EB05-036",
      {
        effect: {
          kind: "if",
          condition: { kind: "leader-has-type", player: "self", type: "Navy" },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              { kind: "add-don", player: "self", count: 1, rested: true },
            ],
          },
        },
      },
    ],
    [
      // EB05-037 Black Maria. Printed text: `pnpm card:text EB05-037`.
      "EB05-037",
      lookAndAdd(3, "eb05-037-look", { type: "Animal Kingdom Pirates" }),
    ],
    [
      // EB05-038 Russian. Printed text: `pnpm card:text EB05-038`.
      //
      // "Your [Senor Pink] cards" reaches the Leader as well as the board, so
      // `includeLeader`; `name` reads the derived identity, so an alias
      // answers too.
      "EB05-038",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            includeLeader: true,
            name: "Senor Pink",
          },
          bind: "eb05-038-buff",
          min: 0,
          max: 1,
          effect: {
            kind: "modify-power",
            binding: "eb05-038-buff",
            amount: 3_000,
            expiresAfterTurns: 0,
          },
        },
      },
    ],
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
