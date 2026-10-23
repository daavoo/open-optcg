/**
 * Continuous text printed on PRB-02: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { leaderHasType, turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const prb02StaticAbilities: readonly StaticAbility[] = [
  // PRB02-014 Sabo: −3 cost in hand with 15 or more cards in the trash.
  //
  // A cost layer rather than a hand price, so both the price paid to play it
  // and a "cost N or less" clause reading the hand see it: EB01-042 Scarlet
  // trashing herself to reach 15 plays it as a cost-3 Character (Bandai's
  // PRB02-014#1). `costZone: "hand"`, so the body on the field is priced at
  // its printed 6.
  {
    cardNumber: "PRB02-014",
    scope: "self",
    costZone: "hand",
    cost: (context) =>
      context.state.players[context.playerId].trash.length >= 15 ? -3 : 0,
  },
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
