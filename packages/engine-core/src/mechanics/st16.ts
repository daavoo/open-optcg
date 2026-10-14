/**
 * ULTRA DECK -The Three Brothers- [ST-16], the five cards the product adds.
 *
 * Small enough to be one file rather than the four-way split by timing window
 * the bigger products take; see `mechanics/README.md`. ST16-004 Shanks was in
 * the pool before the product was, played by an OP17 list, and its `[On Play]`
 * stays in `op17-meta.ts`. Two of the five are continuous text and are rows in
 * `../static-abilities.ts`.
 *
 * Comments paraphrase what each program has to do rather than quoting the card
 * -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST16-00x` prints it from the local cache).
 */
import { type CardSelector } from "../mechanics.js";
import { type SetMechanics } from "./registry.js";
import { payFromHand } from "./shared.js";

/** "A {Music} type card" -- the fuel ST16-002 burns. */
const musicCard: Omit<CardSelector, "player" | "zone"> = { type: "Music" };

export const st16Mechanics: SetMechanics = {
  activateMain: [
    [
      // ST16-001 Uta: once a turn, a {FILM} card out of hand moves a rested
      // DON!! onto the Leader or a Character.
      //
      // `give-rested-don` rather than `attach-don`, because the printed clause
      // names the Leader and `attach-don` only reaches the board.
      // `handCardsMatching` gates the offer on a {FILM} card actually being
      // there: a hand-size floor would prompt a hand that cannot pay, and
      // taking that prompt would spend the turn's one use on nothing.
      "ST16-001",
      {
        oncePerTurn: true,
        requires: {
          handCardsMatching: { match: { type: "FILM" }, count: 1 },
          restedDon: 1,
        },
        program: {
          effect: {
            kind: "optional",
            effect: payFromHand(
              { player: "self", zone: "hand", type: "FILM" },
              "st16-uta-cost",
              1,
              { kind: "give-rested-don", player: "self", count: 1 },
            ),
          },
        },
      },
    ],
  ],
  onOpponentAttack: [
    [
      // ST16-002 Gordon: any number of {Music} cards out of hand, +1000 each,
      // for the battle in progress.
      //
      // `battle-power` with `perCard`, so the size of the binding the `choose`
      // filled is the multiplier -- the printed clause pays per card, and a
      // `choose` binds every card at once. Battle-scoped, which is what "during
      // this battle" says: a turn-scoped modifier would leave the defender at
      // the raised number for every later attack in the turn.
      //
      // The maximum is a hand the pool cannot exceed rather than a printed
      // number; "any number" has no ceiling but a hand does.
      "ST16-002",
      {
        oncePerTurn: false,
        requires: { handCardsMatching: { match: musicCard, count: 1 } },
        program: {
          effect: {
            kind: "optional",
            effect: {
              kind: "choose",
              selector: { ...musicCard, player: "self", zone: "hand" },
              bind: "st16-gordon",
              min: 1,
              max: 10,
              effect: {
                kind: "sequence",
                effects: [
                  {
                    kind: "move",
                    binding: "st16-gordon",
                    to: { player: "self", zone: "trash" },
                  },
                  {
                    kind: "battle-power",
                    player: "self",
                    amount: 1_000,
                    perCard: "st16-gordon",
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ],
};
