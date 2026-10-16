/**
 * ULTRA DECK -The Monster Trio- [ST-24], the three cards the product adds that
 * were not already in the pool.
 *
 * Small enough to be one file rather than the four-way split by timing window
 * the bigger products take; see `mechanics/README.md`. ST24-004 Law & Bepo is
 * in `op14-mihawk.ts` and ST24-005 X.Drake is one of the imperative entries in
 * `effects.ts`; both stay where they are.
 *
 * The product is a DON!! engine: three of its five cards set a DON!! back
 * active, each at a different price and in a different window, which is what
 * makes a five-card supplement worth reading together.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST24-00x` prints it from the local cache).
 */
import { SOURCE_BINDING } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { lookAndAdd } from "./shared.js";

export const st24Mechanics: SetMechanics = {
  onPlay: [
    [
      // ST24-001 Capone"Gang"Bege: a [Blocker] that cycles a card off a board
      // that has already spent its turn.
      //
      // "Six or more rested cards" counts everything the Refresh Phase rule
      // enumerates -- Leader, Characters, Stage and the cost area -- so a
      // rested DON!! counts. That is what makes it a late-turn play rather than
      // a development one: the deck rests its own DON!! to buy the rest of this
      // product's effects.
      "ST24-001",
      {
        effect: {
          kind: "if",
          condition: {
            kind: "rested-cards",
            player: "self",
            operator: "gte",
            value: 6,
          },
          then: {
            kind: "sequence",
            effects: [
              { kind: "draw", player: "self", count: 1 },
              {
                kind: "choose",
                selector: { player: "self", zone: "hand" },
                bind: "st24-bege-trash",
                min: 1,
                max: 1,
                effect: {
                  kind: "move",
                  binding: "st24-bege-trash",
                  to: { player: "self", zone: "trash" },
                },
              },
            ],
          },
        },
      },
    ],
    // ST24-002 Kid & Killer: five deep for a {Supernovas} card. Its
    // `[On Your Opponent's Attack]` half is below.
    ["ST24-002", lookAndAdd(5, "st24-kid-killer", { type: "Supernovas" })],
  ],
  onOpponentAttack: [
    [
      // ST24-002 Kid & Killer: the body itself is the price of a DON!! set back
      // active mid-battle.
      //
      // `activate-don` is the inverse of `rest-don` and the only way to get
      // DON!! back without drawing from the DON!! deck -- which on the
      // opponent's turn is Counter money. The `[On Your Opponent's Attack]`
      // offer gate has no field for rested DON!!, so the prompt stands on an
      // all-active cost area; declining costs nothing, and the body is only
      // spent by a player who takes it.
      //
      // The trash is a `move` rather than a `knock-out`: the printed word is
      // trash, so nothing keyed on a K.O. fires -- including this product's own
      // [On K.O.] draws.
      "ST24-002",
      {
        oncePerTurn: false,
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "sequence",
              effects: [
                {
                  kind: "move",
                  binding: SOURCE_BINDING,
                  to: { player: "self", zone: "trash" },
                },
                { kind: "activate-don", player: "self", count: 1 },
              ],
            },
          },
        },
      },
    ],
  ],
  onEndOfYourTurn: [
    [
      // ST24-003 Basil Hawkins: a DON!! set active as the turn closes.
      //
      // The cheapest of the product's three ways to do it and the only free
      // one: the DON!! is back before the opponent's turn starts, so what a
      // 3-cost body buys here is one more Counter every turn it survives.
      "ST24-003",
      { effect: { kind: "activate-don", player: "self", count: 1 } },
    ],
  ],
};
