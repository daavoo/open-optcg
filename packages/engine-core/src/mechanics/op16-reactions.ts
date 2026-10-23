/**
 * The "when X happens" clauses OP-16 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const op16ReactionRules: readonly ReactionRule[] = [
  {
    // OP16-041 Buggy (Leader): "[printed text omitted -- pnpm card:text OP16-041]"
    //
    // "Removed from the field" rather than K.O.'d, so any move off the board
    // counts -- a bounce and a deck-bottom do too, which is why this watches the
    // signal rather than hanging off `[On K.O.]`. Not gated on the turn: the
    // opponent removing one is the common case.
    cardNumber: "OP16-041",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "board",
      movedType: "Impel Down",
      movedOwner: "self",
    },
    ownTurn: false,
    oncePerTurn: true,
    optionalActivation: true,
    leaderAttachedDon: 1,
    program: {
      effect: {
        kind: "optional",
        effect: {
          kind: "choose",
          selector: {
            player: "self",
            zone: "hand",
            category: "character",
            name: "Prisoner of Impel Down",
          },
          bind: "op16-buggy-prisoner",
          min: 1,
          max: 1,
          effect: { kind: "play", binding: "op16-buggy-prisoner" },
        },
      },
    },
  },
];
