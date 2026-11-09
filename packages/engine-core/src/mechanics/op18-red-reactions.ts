/**
 * The "when X happens" clauses OP-18's red cards print with no timing marker:
 * reaction rules `card-mechanics.ts` dispatches off the signal stream.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const op18RedReactionRules: readonly ReactionRule[] = [
  {
    // OP18-001 Karoo, the Leader: `pnpm card:text OP18-001`.
    //
    // A K.O. is an exit from the board to the trash, and only this player's
    // own {Alabasta} Characters count. No turn window is printed, so it pays
    // out on either turn -- a trade on defence draws as well as one on attack.
    // The draw is mandatory, so the once-per-turn use goes on the first K.O.
    cardNumber: "OP18-001",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "board",
      to: "trash",
      ko: true,
      movedOwner: "self",
      movedType: "Alabasta",
    },
    ownTurn: false,
    oncePerTurn: true,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
];
