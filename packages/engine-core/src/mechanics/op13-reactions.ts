/**
 * The "when X happens" clauses OP-13 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import { SOURCE_BINDING } from "../mechanics.js";
import type { ReactionRule } from "../reaction-rules.js";

export const op13ReactionRules: readonly ReactionRule[] = [
  {
    // OP13-002 Portgas.D.Ace (Leader), second clause: "[printed text omitted -- pnpm card:text OP13-002]"
    //
    // Two unrelated facts behind one printed clause, so two rules that share the
    // once-per-turn key: damage is a card leaving the Life area, and the K.O. is a
    // Character of the controller's own leaving the board for the trash. The
    // `[DON!! x1]` gate reads the DON!! given to the Leader.
    cardNumber: "OP13-002",
    controller: "leader",
    signal: { kind: "card-moved", from: "life", movedOwner: "self" },
    ownTurn: false,
    oncePerTurn: true,
    leaderAttachedDon: 1,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
  {
    cardNumber: "OP13-002",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "board",
      to: "trash",
      movedOwner: "self",
      movedMinPower: 6000,
    },
    ownTurn: false,
    oncePerTurn: true,
    leaderAttachedDon: 1,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
  {
    // OP13-078 Oro Jackson (Stage): "[printed text omitted -- pnpm card:text OP13-078]"Roger Pirates"[printed text omitted -- pnpm card:text OP13-078]"
    //
    // The first *Stage* in this table, which is what `controller: "stage"` is for.
    // The signal cannot say whose effect removed the Character -- it reports the
    // move, not its cause -- so this fires on any exit from its controller's
    // board, including a K.O. in battle. The narrower reading would need the
    // removal's actor to reach the signal stream; the wider one is what the same
    // trade-off already buys OP16-041 Buggy and OP10-042 Usopp.
    cardNumber: "OP13-078",
    controller: "stage",
    signal: {
      kind: "card-moved",
      from: "board",
      movedTypeIncluding: "Roger Pirates",
      movedOwner: "self",
    },
    ownTurn: false,
    oncePerTurn: true,
    program: {
      effect: { kind: "add-don", player: "self", count: 1, rested: true },
    },
  },
  {
    // OP13-100 Jewelry Bonney (Leader): "[printed text omitted -- pnpm card:text OP13-100]"
    //
    // `hasTrigger` is a printed fact, which is what makes the Yellow Egghead
    // deck's Trigger-heavy build a resource: every body it plays is also a ramp
    // trigger. `[Your Turn]` excludes the Characters that arrive off a Trigger or
    // a Counter on the opponent's turn.
    cardNumber: "OP13-100",
    controller: "leader",
    signal: {
      kind: "card-played",
      category: "character",
      playedBy: "self",
      hasTrigger: true,
    },
    ownTurn: true,
    oncePerTurn: true,
    program: { effect: { kind: "give-rested-don", player: "self", count: 2 } },
  },
  {
    // OP13-106 Conney: "[printed text omitted -- pnpm card:text OP13-106]"
    //
    // The only clause in the pool that watches a *Trigger resolving* rather than a
    // card moving, and the signal is raised where the Trigger is resolved -- see
    // `trigger-activated` in `MechanicSignal`. On the opponent's turn only, which
    // is the only turn a Blocker matters on, and the Trigger that grants it is
    // usually one of this deck's own Life cards.
    cardNumber: "OP13-106",
    controller: "board",
    signal: { kind: "trigger-activated" },
    ownTurn: false,
    opponentTurn: true,
    oncePerTurn: false,
    program: {
      effect: {
        kind: "grant-keyword",
        binding: SOURCE_BINDING,
        keyword: "Blocker",
        expiresAfterTurns: 0,
      },
    },
  },
];
