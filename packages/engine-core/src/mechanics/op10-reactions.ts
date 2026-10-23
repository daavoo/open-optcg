/**
 * The "when X happens" clauses OP-10 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const op10ReactionRules: readonly ReactionRule[] = [
  {
    // OP10-042 Usopp (Leader): "[printed text omitted -- pnpm card:text OP10-042]"
    //
    // The hand ceiling is what keeps the Leader from refilling a full grip: it
    // draws while losing bodies and stops once the hand is deep. The signal
    // covers both halves of the printed clause -- an exit from the board is a
    // removal, and a K.O. is an exit to the trash -- and cannot tell *whose*
    // effect caused it. `[Opponent's Turn]` is what makes that harmless: on the
    // other player's turn a Dressrosa body leaving this board is their doing or
    // a battle K.O., which is exactly the two cases named.
    cardNumber: "OP10-042",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "board",
      movedType: "Dressrosa",
      movedOwner: "self",
    },
    ownTurn: false,
    opponentTurn: true,
    oncePerTurn: true,
    optionalActivation: true,
    maxHandSize: 5,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
  {
    // OP10-003 Sugar (Leader), second clause: "[printed text omitted -- pnpm card:text OP10-003]"
    //
    // On the *opponent's* turn, which is when a Purple deck activates an Event:
    // every Counter it holds is one. The DON!! arrives active, so it pays for the
    // next Counter in the same window -- which is what makes the Leader's own
    // six-card DON!! deck workable. Its `[End of Your Turn]` half is a program in
    // `op10-triggers.ts`.
    cardNumber: "OP10-003",
    controller: "leader",
    signal: { kind: "event-activated", activatedBy: "self" },
    ownTurn: false,
    opponentTurn: true,
    oncePerTurn: true,
    program: {
      effect: { kind: "add-don", player: "self", count: 1, rested: false },
    },
  },
];
