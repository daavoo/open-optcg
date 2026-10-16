/**
 * The "when X happens" clauses EB-01 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";
import { drawOneTrashOne } from "./reaction-shared.js";

export const eb01ReactionRules: readonly ReactionRule[] = [
  {
    // EB01-047 Laboon: "[Once Per Turn] When a Character is K.O.'d, draw 1 card
    // and trash 1 card from your hand."
    //
    // No printed timing marker beyond the once-per-turn, so it is a rule here
    // rather than an entry in any of the clause registries -- the same reading
    // OP07-031 above takes.
    //
    // `to: "trash"` is the "K.O.'d" half: a Character bounced to hand or buried
    // in the deck also leaves the board, and this clause does not answer those.
    // Deliberately no `movedOwner`, no `bySource` and no `ownTurn`, because the
    // printed sentence carries none of them: a 2-drop that draws off *any*
    // Character dying, on either side and on either turn, which is what makes
    // it worth a slot in a deck that trades.
    cardNumber: "EB01-047",
    controller: "board",
    signal: { kind: "card-moved", from: "board", to: "trash", ko: true },
    ownTurn: false,
    oncePerTurn: true,
    program: { effect: drawOneTrashOne },
  },
];
