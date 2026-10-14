/**
 * The off-set identities the OP-17 Red/Green Luffy & Ace list reaches for.
 *
 * Card data lives in `packages/cards/src/op17-luffy-ace.ts`, except ST21-017,
 * whose data sits with the rest of the ST-21 pool in `cards/src/st21-cards.ts`
 * -- its program is here rather than in `st21.ts` because this is the deck that
 * plays it and the clause reads against this Leader's board.
 *
 * The Leader's own two clauses are continuous, so they are layers in
 * `static-abilities.ts` rather than programs here: the −2000 self-penalty, and
 * the "[Opponent's Turn] all of your [Portgas.D.Ace] and [Monkey.D.Luffy] cards
 * gain +3000" that turns the list's 6000s into 9000s on defence.
 *
 * The list's OP12 and OP13 slots are not here: the whole-set imports own their
 * programs, OP12-015's [On Play] and OP12-018's [Counter] included. The one
 * thing those imports left is OP12-015's untimed "+2000 while you have 2 or
 * more given DON!! cards" -- a continuous clause, so it is a layer in
 * `static-abilities.ts` beside the Leader's, and this deck is the first shipped
 * list to play the card and therefore the first to require it.
 */
import { SOURCE_BINDING, type MechanicProgram } from "../mechanics.js";
import { lookAndAdd } from "./shared.js";
import { type SetMechanics } from "./registry.js";

/**
 * "[printed text omitted -- pnpm card:text <card>]" -- ST21-017 Gum-Gum Mole
 * Pistol, printed again as its `[Trigger]`, so it is written once and
 * registered twice.
 *
 * The two halves are sequenced, not nested: the debuff lands whether or not the
 * K.O. condition holds, and -- this is the point of the card -- the debuff is
 * what *creates* the K.O.'s target. A 7000-power body is at 2000 after the
 * −5000 and is then in range of the second half, which is why `maxCurrentPower`
 * is the right filter for it: "2000 power or less" is read after the modifier,
 * not off the printed card. `maxPower` would read the printed number and the
 * combo would never fire.
 *
 * The gate between them, "[printed text omitted -- pnpm card:text ST21-017]", is
 * `minCurrentPower` on the player's own board -- current power again, so DON!!
 * given to a 5000 satisfies it. In this deck it is close to free: the building
 * rule (nothing above 6000) means the list's payoff bodies sit exactly on the
 * threshold.
 */
const molePistol: MechanicProgram = {
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
        bind: "st21-017-debuff",
        min: 0,
        max: 1,
        effect: {
          kind: "modify-power",
          binding: "st21-017-debuff",
          amount: -5000,
          expiresAfterTurns: 0,
        },
      },
      {
        kind: "if",
        condition: {
          kind: "selector-count",
          player: "self",
          selector: {
            zone: "board",
            category: "character",
            minCurrentPower: 6000,
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
            maxCurrentPower: 2000,
          },
          bind: "st21-017-ko",
          min: 0,
          max: 1,
          effect: { kind: "knock-out", binding: "st21-017-ko" },
        },
      },
    ],
  },
};

export const op17LuffyAceMechanics: SetMechanics = {
  onPlay: [
    [
      // ST30-012 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text ST30-012]"
      //
      // The `[When Attacking]` half is registered below, and the two are what
      // make this a 4-cost that removes a [Blocker] and swings the turn it
      // lands. Gated on `active-don` before the `optional`, the same shape
      // OP16-006 uses: without the gate a player with no active DON!! is
      // offered a cost they cannot pay and would take [Rush] for free.
      "ST30-012",
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
                  kind: "grant-keyword",
                  binding: SOURCE_BINDING,
                  keyword: "Rush",
                  expiresAfterTurns: 0,
                },
              ],
            },
          },
        },
      } satisfies MechanicProgram,
    ],
    [
      // EB02-017 Nami: "[printed text omitted -- pnpm card:text EB02-017]"
      //
      // Word for word OP01-016 Nami's clause, which this list also runs four of:
      // eight copies of the same five-deep dig, which is how a deck this
      // top-heavy in threats finds them. `excludeName` is the printed "other
      // than [Nami]" and matters here -- both Namis are {Straw Hat Crew}, so
      // without it each would search up the other.
      "EB02-017",
      lookAndAdd(5, "eb02-017-look", {
        type: "Straw Hat Crew",
        excludeName: "Nami",
      }),
    ],
    [
      // EB04-002 Jewelry Bonney: "[printed text omitted -- pnpm card:text EB04-002]"
      //
      // The same template one card shallower, over a disjunction of two types.
      // Written as `anyOf` rather than two `type` filters because the fields on
      // a selector stay conjunctive: `{ type: "Egghead", ... }` and
      // `{ type: "Straw Hat Crew" }` together would find only a card that is
      // both. Nothing in this list is {Egghead} -- Bonney herself is, and she is
      // excluded by name -- so in practice this is a four-deep {Straw Hat Crew}
      // search, but the clause is implemented as printed.
      "EB04-002",
      lookAndAdd(4, "eb04-002-look", {
        anyOf: [{ type: "Egghead" }, { type: "Straw Hat Crew" }],
        excludeName: "Jewelry Bonney",
      }),
    ],
    [
      // P-135 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text P-135]"
      //
      // The [Blocker] is a printed keyword and needs no program: `cardFacts`
      // reads it off the text. What is here is the tempo half -- and note that
      // it is *mandatory* text with an "up to 1" target, so no `optional`
      // wrapper: declining is the `min: 0`, not a separate prompt.
      //
      // `canRest: true` keeps an already-rested Character, or one the opponent
      // has protected, out of the offer; without it the clause is offered
      // against a board it cannot change.
      "P-135",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            maxCost: 5,
            canRest: true,
          },
          bind: "p-135-rest",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "p-135-rest" },
        },
      } satisfies MechanicProgram,
    ],
  ],
  whenAttacking: [
    [
      // ST30-012 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text ST30-012]"
      //
      // The `keyword` filter's only user in the pool, and the reason it exists:
      // no other selector field can ask whether a Character *can block*.
      // Printed, aura-granted and turn-granted [Blocker] all answer yes, which
      // is what the text names -- the clause is written to clear a path for the
      // attack it fires on, and a Character blocking off a granted keyword
      // blocks exactly as one printing it does.
      //
      // Paired with `canRest: true`, so a [Blocker] already rested -- one that
      // blocked last turn and has not refreshed -- is not offered: it is no
      // longer in the way, and resting it again buys nothing.
      "ST30-012",
      {
        effect: {
          kind: "choose",
          selector: {
            player: "opponent",
            zone: "board",
            category: "character",
            keyword: "Blocker",
            canRest: true,
          },
          bind: "st30-012-rest-blocker",
          min: 0,
          max: 1,
          effect: { kind: "rest", binding: "st30-012-rest-blocker" },
        },
      } satisfies MechanicProgram,
    ],
  ],
  eventMain: [
    [
      // ST21-017 Gum-Gum Mole Pistol, "[Main]". See `molePistol` above.
      "ST21-017",
      { cost: 4, program: molePistol },
    ],
  ],
  trigger: [
    [
      // ST21-017: "[printed text omitted -- pnpm card:text ST21-017]" Literally the
      // same program, registered twice -- the shape `op15-shared.ts` documents.
      "ST21-017",
      molePistol,
    ],
  ],
};
