/**
 * The "when X happens" clauses EB-05 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";
import { bankDeckTopOnLife } from "./eb03-on-play.js";

export const eb05ReactionRules: readonly ReactionRule[] = [
  // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
  {
    // EB05-010 Nico Robin (Leader). Printed text: `pnpm card:text EB05-010`.
    //
    // Either turn, any cause of K.O. -- the clause names neither -- for one of
    // its controller's own <Wisdom> Characters that does not print [Blocker].
    // Printed, because Bandai's EB05-010#1 rules that a [Blocker] whose
    // ability has been negated still counts as having it. "Up to 1" is the
    // declinable `[Once Per Turn]` offer: passing keeps the use for a later
    // K.O. that turn. The banked card goes on face-down.
    cardNumber: "EB05-010",
    controller: "leader",
    signal: {
      kind: "card-moved",
      from: "board",
      to: "trash",
      ko: true,
      movedOwner: "self",
      movedAttribute: "Wisdom",
      movedLacksKeyword: "Blocker",
    },
    ownTurn: false,
    oncePerTurn: true,
    program: { effect: bankDeckTopOnLife("eb05-010-life") },
  },
  // -- Blue and Purple: EB05-021 to EB05-040 --
  // -- Black and Yellow: EB05-041 to EB05-060 --
];
