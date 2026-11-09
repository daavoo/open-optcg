/**
 * The "when X happens" clauses OP-18's Black cards print with no timing marker
 * beyond a turn window: reaction rules `card-mechanics.ts` dispatches off the
 * signal stream.
 */
import type { ReactionRule } from "../reaction-rules.js";

export const op18BlackReactionRules: readonly ReactionRule[] = [
  {
    // OP18-080 Van Augur: `pnpm card:text OP18-080`, the [Your Turn] half.
    //
    // The Japanese text names the card trashed precisely -- a card from your
    // *hand*, trashed by your [Marshall.D.Teach] Leader's effect -- which is
    // what both Teach Leaders charge (OP09-081's activation, OP16-080's
    // redirect). A cost is part of the effect it pays for, so the trash the
    // activation charges is the event this watches.
    //
    // "No other [Van Augur]" is read before the [Once Per Turn] use is spent:
    // with a second copy out, neither has anything to do this turn.
    cardNumber: "OP18-080",
    controller: "board",
    signal: {
      kind: "card-moved",
      from: "hand",
      to: "trash",
      sourceLeaderName: "Marshall.D.Teach",
    },
    ownTurn: true,
    oncePerTurn: true,
    condition: {
      kind: "selector-count",
      player: "self",
      selector: {
        zone: "board",
        category: "character",
        name: "Van Augur",
        excludeSource: true,
      },
      operator: "eq",
      value: 0,
    },
    program: { effect: { kind: "draw", player: "self", count: 1 } },
  },
];
