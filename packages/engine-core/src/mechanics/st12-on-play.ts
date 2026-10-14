/**
 * ST-12 `[On Play]` programs.
 *
 * Split by timing window like every other whole-product import; see
 * `mechanics/README.md`. Comments paraphrase what each program has to do
 * rather than quoting the card -- printed text is a runtime asset, not repo
 * content (`pnpm card:text ST12-0xx` prints it from the local cache).
 */
import { lookAndReplace } from "./shared.js";
import { revealAndPlayCostTwo } from "./st12-shared.js";
import { type SetMechanics } from "./registry.js";

export const st12OnPlayMechanics: SetMechanics = {
  onPlay: [
    [
      // ST12-003 Dracule Mihawk: on an empty-ish board, a free body out of
      // hand.
      //
      // The gate is on *your* Characters, and it counts this card, which has
      // already arrived when the clause resolves -- so "2 or less" is really
      // "one other body at most". That is what stops the clause from being a
      // way to go wide: it only pays when the board is behind.
      //
      // `anyOf` because the printed filter is a disjunction of a type and an
      // attribute, which no single field can say, and `excludeName` is the
      // card's own name so it cannot chain into a second copy.
      "ST12-003",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "selector-count",
            player: "self",
            selector: { zone: "board", category: "character" },
            operator: "lte",
            value: 2,
          },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: "hand",
              category: "character",
              maxCost: 4,
              excludeName: "Dracule Mihawk",
              anyOf: [{ type: "Muggy Kingdom" }, { attribute: "Slash" }],
            },
            bind: "st12-mihawk-play",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "st12-mihawk-play", rested: true },
          },
        },
      },
    ],
    [
      // ST12-007 Rika: two DON!! turned over set a <Slash> body active again,
      // but only while the opponent is still at 3 Life or more.
      //
      // The Life gate is the card's whole design: it pays while the race is
      // young and stops paying once it has been won down, which is the opposite
      // of what most tempo clauses do. `rest-don` is the printed ➁ -- the DON!!
      // stay on the field, unlike a DON!! −N -- and the outer `if` withholds an
      // offer nothing could pay.
      "ST12-007",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 2,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 2 },
                {
                  kind: "if",
                  condition: {
                    kind: "zone-count",
                    player: "opponent",
                    zone: "life",
                    operator: "gte",
                    value: 3,
                  },
                  then: {
                    kind: "choose",
                    selector: {
                      player: "self",
                      zone: "board",
                      category: "character",
                      attribute: "Slash",
                      maxCost: 4,
                      rested: true,
                    },
                    bind: "st12-rika-refresh",
                    min: 0,
                    max: 1,
                    effect: {
                      kind: "update",
                      binding: "st12-rika-refresh",
                      rested: false,
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
      // ST12-010 Emporio.Ivankov: the top card of the deck, played for free if
      // it is a 2-cost body.
      //
      // The same fragment its [When Attacking] half and ST12-013 Zeff print;
      // see `st12-shared.ts` for why the cost is exactly 2.
      "ST12-010",
      { effect: revealAndPlayCostTwo("st12-ivankov-play") },
    ],
    [
      // ST12-013 Zeff: a three-card sort of the top of the deck.
      //
      // Top or bottom, so it is a dig as well as a sort -- and it is what makes
      // this card's own [When Attacking] reveal answerable, which is the pair
      // the 5 cost is priced on.
      "ST12-013",
      { effect: lookAndReplace(3, "st12-zeff-look", true) },
    ],
    [
      // ST12-014 Duval: the same three-card sort at 2 cost, behind a [Blocker].
      //
      // The keyword is derived from the printed text and needs no program. A
      // 1000-power body that blocks once and sets the next three draws up is
      // what a Blue deck spends turn two on.
      "ST12-014",
      { effect: lookAndReplace(3, "st12-duval-look", true) },
    ],
  ],
};
