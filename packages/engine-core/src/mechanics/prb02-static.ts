/**
 * Continuous text printed on PRB-02: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { leaderHasType, turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const prb02StaticAbilities: readonly StaticAbility[] = [
  // PRB02-001 Koby: "[printed text omitted -- pnpm card:text PRB02-001]"
  //
  // The defensive half of the card: a 5000 that defends at 6000 behind a
  // {Navy} Leader. Its [When Attacking] lives in `mechanics/prb02-battle.ts`.
  {
    cardNumber: "PRB02-001",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) !== context.playerId &&
        leaderHasType(context, "Navy")
          ? 1000
          : 0,
    },
  },
  {
    cardNumber: "PRB02-015",
    scope: "self",
    cost: (context) =>
      !context.isLeader && leaderHasType(context, "Blackbeard Pirates") ? 4 : 0,
  },
  {
    cardNumber: "PRB02-015",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader && leaderHasType(context, "Blackbeard Pirates"),
    },
  },
];
