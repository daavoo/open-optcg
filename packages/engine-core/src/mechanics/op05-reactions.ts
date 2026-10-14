/**
 * The "when X happens" clauses OP-05 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import type { ReactionRule } from "../reaction-rules.js";

export const op05ReactionRules: readonly ReactionRule[] = [
  // --- OP-05 "Awakening of the New Era" ------------------------------------
  //
  // Five clauses with no printed marker beyond a turn window, dispatched off
  // the signal stream like every rule above. Printed text is a runtime asset:
  // `pnpm card:text OP05-0xx` prints it from the local cache.
  {
    // OP05-053 Mozambia: +2000 for the turn the first time its controller draws
    // by an effect on their own turn. The `card-drawn` signal is what tells an
    // effect's draw from the Draw Phase's, which is the whole clause.
    cardNumber: "OP05-053",
    controller: "board",
    signal: { kind: "card-drawn", drawnBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "modify-power",
        binding: SOURCE_BINDING,
        amount: 2_000,
        expiresAfterTurns: 0,
      },
    },
  },
  {
    // OP05-074 Eustass"Captain"Kid: a DON!! back, active, the first time one
    // goes home on its controller's turn -- the Purple Kid package's engine,
    // where every Event pays `DON!! −1`. Its [Blocker] is printed text.
    cardNumber: "OP05-074",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: { kind: "add-don", player: "self", count: 1, rested: false },
    },
  },
  {
    // OP05-098 Enel (Leader): when the last Life card goes, the top of the deck
    // becomes Life again and a hand card is trashed for it. `condition` reads
    // the count *before* the once-per-turn key is spent, so a Life card lost at
    // three does not use up the turn's one reprieve; `movedOwner: "self"`
    // because the opponent's Life going to zero is not this Leader's.
    cardNumber: "OP05-098",
    controller: "leader",
    signal: { kind: "card-moved", from: "life", movedOwner: "self" },
    ownTurn: false,
    opponentTurn: true,
    oncePerTurn: true,
    condition: {
      kind: "zone-count",
      player: "self",
      zone: "life",
      operator: "eq",
      value: 0,
    },
    program: {
      effect: {
        kind: "sequence",
        effects: [
          {
            kind: "select",
            selector: { player: "self", zone: "deck", position: "top" },
            bind: "op05-enel-leader-life",
            count: 1,
            effect: {
              kind: "move",
              binding: "op05-enel-leader-life",
              to: { player: "self", zone: "life", position: "top" },
            },
          },
          {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "op05-enel-leader-trash",
            min: 1,
            max: 1,
            effect: {
              kind: "move",
              binding: "op05-enel-leader-trash",
              to: { player: "self", zone: "trash" },
            },
          },
        ],
      },
    },
  },
  {
    // OP05-107 Lieutenant Spacey: +2000 the first time a Life card reaches its
    // controller's hand on their own turn -- which in Yellow is the Leader's
    // own "add a Life card to your hand" costs, not damage.
    cardNumber: "OP05-107",
    controller: "board",
    signal: {
      kind: "card-moved",
      from: "life",
      to: "hand",
      movedOwner: "self",
    },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "modify-power",
        binding: SOURCE_BINDING,
        amount: 2_000,
        expiresAfterTurns: 0,
      },
    },
  },
  {
    // OP05-109 Pagaya: two cards in and two out whenever a [Trigger] resolves,
    // either player's -- the printed clause names no side and no turn. A
    // single `choose` of two rather than two of one: the draw has just landed,
    // so the hand always holds at least the two the clause asks for.
    cardNumber: "OP05-109",
    controller: "board",
    signal: { kind: "trigger-activated" },
    ownTurn: false,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "sequence",
        effects: [
          { kind: "draw", player: "self", count: 2 },
          {
            kind: "choose",
            selector: { player: "self", zone: "hand" },
            bind: "op05-pagaya-trash",
            min: 2,
            max: 2,
            effect: {
              kind: "move",
              binding: "op05-pagaya-trash",
              to: { player: "self", zone: "trash" },
            },
          },
        ],
      },
    },
  },
];
