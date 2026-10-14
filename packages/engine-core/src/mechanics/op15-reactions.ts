/**
 * The "when X happens" clauses OP-15 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";
import { op15LuffyReveal } from "./reaction-shared.js";

export const op15ReactionRules: readonly ReactionRule[] = [
  {
    // OP15-119 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP15-119]"
    //
    // The opponent activating an Event or a [Blocker] -- the same two signals
    // OP06-048 Zeff watches, with no turn gate and no `[Once Per Turn]`
    // printed, so every answer the opponent spends is paid for again.
    cardNumber: "OP15-119",
    controller: "board",
    signal: { kind: "blocker-activated", activatedBy: "opponent" },
    ownTurn: false,
    oncePerTurn: false,
    program: { effect: op15LuffyReveal },
  },
  {
    cardNumber: "OP15-119",
    controller: "board",
    signal: { kind: "event-activated", activatedBy: "opponent" },
    ownTurn: false,
    oncePerTurn: false,
    program: { effect: op15LuffyReveal },
  },
];
