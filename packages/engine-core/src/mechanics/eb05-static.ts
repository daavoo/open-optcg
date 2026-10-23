/**
 * Continuous text printed on EB-05: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import {
  type RemovalImmunity,
  type StaticAbility,
} from "../static-abilities.js";
import { leaderHasType } from "./static-shared.js";

export const eb05StaticAbilities: readonly StaticAbility[] = [
  // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
  // -- Blue and Purple: EB05-021 to EB05-040 --
  // EB05-024 Little Sadi. Printed text: `pnpm card:text EB05-024`.
  //
  // Both halves behind the one {Impel Down} Leader gate. The keyword is a row
  // here rather than read off the card, because the [Blocker] in the text is
  // conditional; the cost layer is `scope: "self"`, so it is read only on the
  // field and the card is still a 1-cost to play.
  {
    cardNumber: "EB05-024",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Impel Down") ? 2 : 0),
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader && leaderHasType(context, "Impel Down"),
    },
  },
  // -- Black and Yellow: EB05-041 to EB05-060 --
];

export const eb05RemovalImmunities: readonly RemovalImmunity[] = [
  // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
  // -- Blue and Purple: EB05-021 to EB05-040 --
  // -- Black and Yellow: EB05-041 to EB05-060 --
];
