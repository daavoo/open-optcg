/**
 * Continuous text printed on ST-16: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName } from "@one-piece-sim/cards";
import { leaderHasType, restedCardCount } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st16StaticAbilities: readonly StaticAbility[] = [
  // ST16-003 Charlotte Katakuri: behind a {FILM} Leader, on a board that has
  // spent its turn, +2000.
  //
  // "Six or more rested cards" counts everything the Refresh Phase rule
  // enumerates -- Leader, Characters, Stage and the cost area -- so a rested
  // DON!! counts. That is the reading `rested-cards` takes in `mechanics.ts`
  // and what makes the threshold reachable at all: no board of Characters gets
  // to six on its own.
  {
    cardNumber: "ST16-003",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        leaderHasType(context, "FILM") &&
        restedCardCount(context) >= 6
          ? 2000
          : 0,
    },
  },
  // ST16-005 Monkey.D.Luffy: +1000 while its controller has a rested [Uta].
  //
  // Rested, not merely present: the Uta this names is the product's own
  // ST16-001, whose activation does not rest it -- so what turns this on is
  // Uta having blocked or attacked, which is the turn this body wants the
  // extra 1000 anyway.
  {
    cardNumber: "ST16-005",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].board.some(
          (card) => card.rested && hasCardName(card.cardNumber, "Uta"),
        )
          ? 1000
          : 0,
    },
  },
];
