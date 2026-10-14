/**
 * The "when X happens" clauses OP-11 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";
import { camieTrashBothLives } from "./reaction-shared.js";

export const op11ReactionRules: readonly ReactionRule[] = [
  {
    // OP11-102 Camie: "[printed text omitted -- pnpm card:text OP11-102]"
    //
    // Two rules for one printed clause -- an Event and a Trigger are different
    // signals -- sharing the once-per-turn key, which is keyed by card number.
    // `[Your Turn]` is what makes it answerable at all: on the controller's own
    // turn, an opponent's Event is a Counter and an opponent's Trigger is one this
    // deck's own attack turned over.
    //
    // The trade is symmetrical and that is the point: Yellow wants its own Life
    // low, and the opponent's Life is what it is racing.
    cardNumber: "OP11-102",
    controller: "board",
    signal: { kind: "event-activated", activatedBy: "opponent" },
    ownTurn: true,
    oncePerTurn: true,
    program: { effect: camieTrashBothLives },
  },
  {
    cardNumber: "OP11-102",
    controller: "board",
    signal: { kind: "trigger-activated" },
    ownTurn: true,
    oncePerTurn: true,
    program: { effect: camieTrashBothLives },
  },
  {
    // OP11-077 Randolph: "[printed text omitted -- pnpm card:text OP11-077]"
    //
    // The first *Character* in this table rather than a Leader, which is what
    // `controller: "board"` is for. +2 cost is protection: it lifts a body out of
    // the reach of "cost N or less" removal, and it lasts through the opponent's
    // next turn, which is when that removal would be pointed at it.
    //
    // The DON!! that pays for it is the deck's own `DON!! −N` costs, so this
    // fires as a side effect of the Purple engine doing what it already does.
    cardNumber: "OP11-077",
    controller: "board",
    signal: { kind: "don-returned", returnedBy: "self" },
    ownTurn: true,
    oncePerTurn: true,
    program: {
      effect: {
        kind: "choose",
        selector: {
          player: "self",
          zone: "board",
          category: "character",
          type: "Big Mom Pirates",
        },
        bind: "op11-randolph-target",
        min: 0,
        max: 1,
        effect: {
          kind: "modify-cost",
          binding: "op11-randolph-target",
          amount: 2,
          expiresAfterTurns: 1,
        },
      },
    },
  },
  {
    cardNumber: "OP11-041",
    controller: "leader",
    signal: { kind: "card-moved", from: "life" },
    ownTurn: true,
    oncePerTurn: true,
    maxHandSize: 7,
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
];
