/**
 * ST-30 program fragments more than one of its cards prints.
 *
 * Comments paraphrase what each fragment has to do rather than quoting the
 * card -- printed text is a runtime asset, not repo content
 * (`pnpm card:text ST30-0xx` prints it from the local cache).
 */
import {
  SOURCE_BINDING,
  type CardSelector,
  type MechanicEffect,
  type MechanicProgram,
} from "../mechanics.js";
import { lookAndAdd } from "./shared.js";

/**
 * "A Character card with 6000 power" -- the exact number this product is built
 * around, printed on nine of its seventeen cards.
 *
 * Closed at both ends, because the printed clause names one power and not a
 * floor: the deck's whole shape is a wall of 6000s, and a 7000 is outside every
 * one of these clauses. `minPower`/`maxPower` are printed power, which is the
 * only power a card in hand or deck has.
 */
export const sixThousandBody: Omit<CardSelector, "player" | "zone"> = {
  category: "character",
  minPower: 6_000,
  maxPower: 6_000,
};

/**
 * The product's search, printed identically on a 1-cost Character and on its
 * `[Main]` Event: five deep for one of those 6000s.
 */
export const digForSixThousand = (bind: string): MechanicProgram =>
  lookAndAdd(5, bind, sixThousandBody);

/**
 * "You may rest 1 of your DON!! cards: This Character gains [Rush] during this
 * turn."
 *
 * Printed on the product's two 4-cost 6000s, which is what lets a wall deck
 * attack the turn it develops. The cost is one active DON!! turned over rather
 * than returned, so it is `rest-don` and not `DON!! −1`; the whole clause is
 * `optional`, because a player who would rather keep the DON!! for a Counter
 * declines.
 */
export const restDonForRush: MechanicEffect = {
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
};
