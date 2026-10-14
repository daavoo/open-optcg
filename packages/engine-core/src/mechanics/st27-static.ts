/**
 * Continuous text printed on ST-27: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { leaderHasType } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st27StaticAbilities: readonly StaticAbility[] = [
  // ST27-004 Sanjuan.Wolf: behind a {Blackbeard Pirates} Leader it blocks, and
  // costs 1 more for every four cards in its controller's trash.
  //
  // Two rows, because the two halves have different shapes: a keyword and a
  // cost. The cost climbs in whole steps of four, which is the deck's own mill
  // read back -- and raising its own cost is protection, lifting a body out of
  // the reach of the "cost N or less" removal this list is otherwise full of.
  // Its `[On Play]` discard is in `mechanics/st27.ts`.
  {
    cardNumber: "ST27-004",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader && leaderHasType(context, "Blackbeard Pirates"),
    },
  },
  {
    cardNumber: "ST27-004",
    scope: "self",
    cost: (context) =>
      !context.isLeader && leaderHasType(context, "Blackbeard Pirates")
        ? Math.floor(context.state.players[context.playerId].trash.length / 4)
        : 0,
  },
];
