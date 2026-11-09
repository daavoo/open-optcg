/**
 * The "when X happens" clause OP-18's Purple cards print with no timing
 * marker: a reaction rule `card-mechanics.ts` dispatches off the signal
 * stream.
 */
import type { ReactionRule } from "../reaction-rules.js";
import { drawAndDiscard } from "./shared.js";

export const op18PurpleReactionRules: readonly ReactionRule[] = [
  {
    // OP18-060 Saint Gunko (Leader): once per turn, a Character of its
    // controller's reaching the board out of the trash draws 2 and trashes 1.
    // On either turn -- the clause names none -- and mandatory, since it is
    // printed as "when ..., do ..." rather than as a "you may".
    cardNumber: "OP18-060",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "trash",
      to: "board",
      movedOwner: "self",
    },
    ownTurn: false,
    oncePerTurn: true,
    program: { effect: drawAndDiscard(2, 1, "op18-060-discard") },
  },
];
