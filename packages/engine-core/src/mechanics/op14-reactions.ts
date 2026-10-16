/**
 * The "when X happens" clauses OP-14 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const op14ReactionRules: readonly ReactionRule[] = [
  {
    // OP14-041 Boa Hancock (Leader): "[printed text omitted -- pnpm card:text OP14-041]"
    //
    // On the *other* player's turn, which is when this Leader's own Characters
    // reach the board -- every Kuja body in OP14 prints "[printed text omitted -- pnpm card:text OP14-041]", and OP14-116
    // Salamander plays one off a Counter. Not once per turn: a defensive turn
    // that flips two Triggers draws two.
    cardNumber: "OP14-041",
    controller: "leader",
    signal: { kind: "card-played", category: "character", playedBy: "self" },
    ownTurn: false,
    opponentTurn: true,
    oncePerTurn: false,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
  {
    // OP14-041 Boa Hancock (Leader), second clause: "[printed text omitted -- pnpm card:text OP14-041]"
    //
    // A Life-strip paid for by losing a body, which is why the Kuja package is
    // full of Characters that come back off a Trigger. `ko` is what makes this a
    // K.O. rather than any exit from the board, or a trash -- the printed text
    // says K.O.'d, unlike OP16-041 Buggy's "removed from the field" above.
    cardNumber: "OP14-041",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "board",
      to: "trash",
      ko: true,
      movedOwner: "self",
      movedAnyOfTypes: ["Amazon Lily", "Kuja Pirates"],
      movedMinPower: 5000,
    },
    ownTurn: false,
    oncePerTurn: true,
    leaderAttachedDon: 1,
    program: {
      effect: {
        kind: "select",
        selector: { player: "opponent", zone: "life", position: "top" },
        bind: "op14-hancock-life",
        count: "all",
        effect: {
          kind: "move",
          binding: "op14-hancock-life",
          to: { player: "opponent", zone: "hand" },
        },
      },
    },
  },
];
