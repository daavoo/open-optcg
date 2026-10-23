/**
 * The "when X happens" clauses EB-05 prints with no timing marker: each is a
 * reaction rule `card-mechanics.ts` dispatches off the signal stream. A clause
 * with a marker is a program in this set's other modules.
 */
import type { ReactionRule } from "../reaction-rules.js";
import { deckTopToLife } from "./eb05-shared.js";

export const eb05ReactionRules: readonly ReactionRule[] = [
  // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
  {
    // EB05-010 Nico Robin (Leader). Printed text: `pnpm card:text EB05-010`.
    //
    // Either turn, any cause of K.O. -- the clause names neither -- for one of
    // its controller's own <Wisdom> Characters that does not print [Blocker].
    // Printed, because Bandai's EB05-010#1 rules that a [Blocker] whose
    // ability has been negated still counts as having it. A "when ..."
    // clause, not one that "can be activated", so it is mandatory and spends
    // its `[Once Per Turn]` use on the first such K.O. (Bandai's ST10-014#2);
    // "up to 1" is a choice inside it, so banking nothing still spends the
    // use. The banked card goes on face-down.
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
    program: { effect: deckTopToLife("eb05-010-life") },
  },
  // -- Blue and Purple: EB05-021 to EB05-040 --
  // -- Black and Yellow: EB05-041 to EB05-060 --
];
