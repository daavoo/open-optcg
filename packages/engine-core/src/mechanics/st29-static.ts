/**
 * Continuous text printed on ST-29: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { type StaticAbility, opponentOf } from "../static-abilities.js";

export const st29StaticAbilities: readonly StaticAbility[] = [
  // ST29-003 Kaku: while its controller is level on Life or behind, +1000.
  //
  // A comparison rather than a threshold, which is what makes it a 4-cost 6000
  // for most of a game the deck is losing and a 5000 while it is ahead. The
  // whole product is shaped this way -- its Leader, two of its Events and this
  // body all open as the Life total falls.
  {
    cardNumber: "ST29-003",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].life.length <=
          context.state.players[opponentOf(context.playerId)].life.length
          ? 1000
          : 0,
    },
  },
];
