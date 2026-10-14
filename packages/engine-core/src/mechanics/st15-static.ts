/**
 * Continuous text printed on ST-15: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { leaderHasType } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st15StaticAbilities: readonly StaticAbility[] = [
  {
    // ST15-005 Portgas.D.Ace: [Rush] while the Leader's type includes
    // "Whitebeard Pirates".
    //
    // Continuous text rather than a grant, so there is nothing to resolve and
    // no turn flag to write: the keyword is simply on whenever the gate reads
    // true, and off again the moment the Leader is a different one. Paired with
    // the once-a-turn save in `st15.ts`, this is a 5-cost that attacks the turn
    // it lands and survives the answer.
    cardNumber: "ST15-005",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => leaderHasType(context, "Whitebeard Pirates"),
    },
  },
];
