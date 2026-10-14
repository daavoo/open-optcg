/**
 * EB-03's `[Trigger]`, `[On K.O.]` and `[End of Your Turn]` clauses.
 *
 * The set's K.O. clauses are what make its bodies awkward to answer: five of
 * the six pay their controller for dying, which is why so many of them are
 * cheap. See `mechanics/README.md`.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { donMinus } from "./shared.js";
import { bankDeckTopOnLife } from "./eb03-on-play.js";
import { playVanillaBody } from "./shared.js";
import { namiServantSearch, shrinkOne } from "./eb03-main.js";

export const eb03TriggerMechanics: SetMechanics = {
  trigger: [
    [
      // EB03-060's `[Trigger]`: "[printed text omitted -- pnpm card:text EB03-060]"
      //
      // The same program its `[Main]` runs, because that is exactly what the
      // clause says -- including the [Nami] Leader gate, which a Trigger does
      // not waive. Registered rather than shared by reference to the
      // `eventMain` entry so the two clauses are separately claimable.
      "EB03-060",
      namiServantSearch,
    ],
    [
      // EB03-011's `[Trigger]`: "[printed text omitted -- pnpm card:text EB03-011]"
      //
      // The same shrink the EB03-001 Leader hands out, off a Life card instead
      // -- and the Event's own `[Counter]` half is in `eb03-battle.ts`.
      "EB03-011",
      { effect: shrinkOne(2_000, "eb03-011-trigger-shrink") },
    ],
    [
      // EB03-020's `[Trigger]`: "[printed text omitted -- pnpm card:text EB03-020]"
      //
      // `rested: true` is not decoration: a Character that is already active is
      // not a legal target for "set as active", and offering one is an action
      // that changes nothing.
      "EB03-020",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "board",
            category: "character",
            rested: true,
          },
          bind: "eb03-020-refresh",
          min: 0,
          max: 1,
          effect: {
            kind: "update",
            binding: "eb03-020-refresh",
            rested: false,
          },
        },
      },
    ],
    [
      // EB03-054's `[Trigger]`: "[printed text omitted -- pnpm card:text EB03-054]"
      //
      // A 3-cost body off a Life card for one card in hand. `optional` is the
      // printed "you may", and the discard is nested inside it so declining
      // leaves the card in Life's place -- the ordinary Trigger outcome.
      "EB03-054",
      {
        effect: {
          kind: "optional",
          effect: {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "eb03-054-cost",
            min: 1,
            max: 1,
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: "eb03-054-cost",
                  to: { player: "self", zone: "trash" },
                },
                { kind: "play", binding: SOURCE_BINDING },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-058's `[Trigger]`: "[printed text omitted -- pnpm card:text EB03-058]"
      //
      // Free rather than paid, and gated on the Leader instead: the [Vegapunk]
      // deck is the only one that gets a 5-cost body out of a damaged Life card.
      "EB03-058",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "leader-has-name",
            player: "self",
            name: "Vegapunk",
          },
          then: { kind: "play", binding: SOURCE_BINDING },
        },
      },
    ],
    [
      // EB03-059's `[Trigger]`: "[printed text omitted -- pnpm card:text EB03-059]"
      //
      // The exclusion is by *name*, so it reads a card's derived identity: a
      // Character whose text also treats it as [Monkey.D.Luffy] is out of reach
      // too, which is the only reading that matches how the pool prints names.
      "EB03-059",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 6,
            excludeName: "Monkey.D.Luffy",
          },
          bind: "eb03-059-lock",
          min: 0,
          max: 1,
          effect: {
            kind: "restrict",
            binding: "eb03-059-lock",
            restriction: "cannot-attack",
            expiresAfterTurns: 0,
          },
        },
      },
    ],
  ],
  onKo: [
    [
      // EB03-007 Baccarat: "[printed text omitted -- pnpm card:text EB03-007]"
      //
      // A [Blocker] that leaves a body behind when it dies, which is what makes
      // it awkward to attack into: the vanilla it fetches is the same target
      // EB03-003 and EB03-039 reach for.
      "EB03-007",
      { effect: playVanillaBody("hand", "eb03-baccarat-body") },
    ],
    [
      // EB03-034 Charlotte Linlin: "[printed text omitted -- pnpm card:text EB03-034]"
      //
      // A DON!! returned to buy a Life card back: the 7-cost body pays for its
      // own removal, and the price is the tempo the deck spent getting there.
      "EB03-034",
      { effect: donMinus(1, bankDeckTopOnLife("eb03-linlin-bank")) },
    ],
    [
      // EB03-042 Koala: "[printed text omitted -- pnpm card:text EB03-042]"
      //
      // `[Opponent's Turn]` is a real gate here rather than flavour: the clause
      // answers *their* removal and their battles, and does nothing when its
      // controller K.O.s it on their own turn. `turn-player` is what asks it.
      //
      // The exclusion is global rather than per branch because a [Nico Robin]
      // is never a [Koala]: the printed "other than [Koala]" narrows the
      // {Revolutionary Army} half, and applying it to both changes nothing.
      "EB03-042",
      {
        effect: {
          kind: "if",
          condition: { kind: "turn-player", player: "opponent" },
          then: {
            kind: "choose",
            selector: {
              player: "self",
              zone: ["hand", "trash"],
              category: "character",
              maxCost: 6,
              excludeName: "Koala",
              anyOf: [{ type: "Revolutionary Army" }, { name: "Nico Robin" }],
            },
            bind: "eb03-koala-body",
            min: 0,
            max: 1,
            effect: { kind: "play", binding: "eb03-koala-body" },
          },
        },
      },
    ],
    [
      // EB03-046 Miss Doublefinger(Zala): "[printed text omitted -- pnpm card:text EB03-046]"
      //
      // Self-mill on death, which is a cost in most decks and fuel in the Black
      // one that plays it: two more cards in the trash is two more for
      // EB03-043's cost and EB03-045's gate.
      "EB03-046",
      { effect: { kind: "trash-top", player: "self", count: 2 } },
    ],
    [
      // EB03-047 Miss.Valentine(Mikita): "[printed text omitted -- pnpm card:text EB03-047]"
      "EB03-047",
      { effect: { kind: "draw", player: "self", count: 1 } },
    ],
    [
      // EB03-057 Yamato: "[printed text omitted -- pnpm card:text EB03-057]"
      //
      // Trashing a Life card is not damage: the card does not reach the
      // opponent's hand, so no `[Trigger]` on it fires. That is the whole
      // difference between this clause and an attack, and it is why the body is
      // worth trading off.
      "EB03-057",
      {
        effect: {
          kind: "select",
          selector: { player: "opponent", zone: "life", position: "top" },
          bind: "eb03-yamato-life",
          count: 1,
          effect: {
            kind: "move",
            binding: "eb03-yamato-life",
            to: { player: "owner", zone: "trash" },
          },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // EB03-018 Tashigi: "[printed text omitted -- pnpm card:text EB03-018]"
      //
      // The pair of costs is what the `if` guards: a `rest-don` with nothing
      // active to rest is a no-op, and without the gate the Character would set
      // itself active for free. Together with the continuous half in
      // `static-abilities.ts` -- immune to the opponent's effects and a
      // [Blocker] on their turn -- this is a body that blocks every turn.
      "EB03-018",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "all-of",
            conditions: [
              {
                kind: "active-don",
                player: "self",
                operator: "gte",
                value: 1,
              },
              {
                kind: "zone-count",
                player: "self",
                zone: "hand",
                operator: "gte",
                value: 1,
              },
            ],
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: { player: "self", zone: "hand" },
                  bind: "eb03-tashigi-cost",
                  min: 1,
                  max: 1,
                  effect: {
                    kind: "move",
                    binding: "eb03-tashigi-cost",
                    to: { player: "self", zone: "trash" },
                  },
                },
                { kind: "update", binding: SOURCE_BINDING, rested: false },
              ],
            },
          },
        },
      },
    ],
    [
      // EB03-061 Uta: "[printed text omitted -- pnpm card:text EB03-061]"
      //
      // The Character it refreshes is a {FILM} one and has to be rested for the
      // clause to do anything, so both filters are on the selector -- and the
      // DON!! cost is guarded the same way EB03-018's is.
      "EB03-061",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "active-don",
            player: "self",
            operator: "gte",
            value: 1,
          },
          then: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                { kind: "rest-don", player: "self", count: 1 },
                {
                  kind: "choose",
                  selector: {
                    player: "self",
                    zone: "board",
                    category: "character",
                    type: "FILM",
                    rested: true,
                  },
                  bind: "eb03-uta-refresh",
                  min: 0,
                  max: 1,
                  effect: {
                    kind: "update",
                    binding: "eb03-uta-refresh",
                    rested: false,
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
