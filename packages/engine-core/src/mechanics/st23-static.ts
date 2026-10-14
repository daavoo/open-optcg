/**
 * Continuous text printed on ST-23: the rows `static-abilities.ts` folds into
 * power, cost and keyword queries. A clause with no timing marker lives here;
 * one with a marker is a program in `st23.ts`. Printed text for any card here
 * is `pnpm card:text <CARD>`.
 */
import { boardCardPower, type StaticAbility } from "../static-abilities.js";

export const st23StaticAbilities: readonly StaticAbility[] = [
  // ST23-001 Uta: −4 cost in hand while you have a Character with 10000 power
  // or more.
  //
  // "Power", not "base power", so a Character's current power: given DON!!
  // and this turn's boosts count, which is how a Red-Haired board reaches
  // 10000. Read through `boardCardPower`, the board-power body `currentPower`
  // shares, so the layer does not reach back into the query that called it.
  // Given DON!! pay out on their controller's turn only -- the turn Uta is
  // played from hand -- which is `donPowerApplies`.
  {
    cardNumber: "ST23-001",
    scope: "self",
    costZone: "hand",
    cost: (context) =>
      context.state.players[context.playerId].board.some(
        (board) =>
          context.db.require(board.cardNumber).category === "character" &&
          boardCardPower(
            context.state,
            context.playerId,
            board,
            context.state.turnPlayerId === context.playerId,
            context.db,
          ) >= 10000,
      )
        ? -4
        : 0,
  },
  // ST23-002 Shanks: −3 cost in hand while your opponent has a Character with
  // 8000 base power or more.
  //
  // "Base power", so printed power, the reading ST26-001 Soba Mask takes:
  // DON!! and modifiers on the opposing body do not bring it into the gate.
  {
    cardNumber: "ST23-002",
    scope: "self",
    costZone: "hand",
    cost: (context) => {
      const opponent = context.playerId === "p1" ? "p2" : "p1";
      return context.state.players[opponent].board.some((board) => {
        const definition = context.db.require(board.cardNumber);
        return (
          definition.category === "character" && (definition.power ?? 0) >= 8000
        );
      })
        ? -3
        : 0;
    },
  },
];
