/**
 * The "when X happens" clauses EB-03 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const eb03ReactionRules: readonly ReactionRule[] = [
  {
    // EB03-033 Charlotte Brulee: "[printed text omitted -- pnpm card:text EB03-033]"
    //
    // The same signal EB04-035 above watches, read on the *other* turn: a DON!!
    // returned to the DON!! deck by the controller's own effect. On the
    // opponent's turn the only way that happens is a `DON!! −N` paid inside a
    // Counter, a Trigger or an `[On K.O.]`, so this is a refund on defending --
    // and the DON!! comes back rested, which is what keeps it from paying for
    // the same defence twice.
    cardNumber: "EB03-033",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: false,
    opponentTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "if",
        condition: {
          kind: "leader-has-type",
          player: "self",
          type: "Big Mom Pirates",
        },
        then: { kind: "add-don", player: "self", count: 1, rested: true },
      },
    },
  },
];
