/**
 * Continuous text printed on ST-10: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st10StaticAbilities: readonly StaticAbility[] = [
  // ST10-003 Eustass"Captain"Kid (Leader): while it still holds four or more
  // Life cards, on its own turn, it attacks for 1000 less than it prints.
  //
  // A debuff on a Leader rather than a buff, which is what makes it the only
  // row here with a negative number: the card is priced as a 5-Life Leader
  // that has to take damage before it swings at its printed power. The turn
  // test is the printed `[Your Turn]`, so the penalty never applies while the
  // Leader is being attacked -- it is a cost on offence alone, and its
  // `[When Attacking]` half buys the 1000 back a DON!! at a time
  // (`mechanics/st10-battle.ts`).
  {
    cardNumber: "ST10-003",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader &&
        turnPlayer(context) === context.playerId &&
        context.state.players[context.playerId].life.length >= 4
          ? -1000
          : 0,
    },
  },
];
