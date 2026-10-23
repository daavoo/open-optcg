/**
 * Continuous text printed on ST-26: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName } from "@one-piece-sim/cards";
import { storedBasePower } from "../base-power.js";
import type { StaticAbility } from "../static-abilities.js";

export const st26StaticAbilities: readonly StaticAbility[] = [
  // ST26-001 Soba Mask: "If you have a [San-Gorou] or [Sanji] Character with
  // 7000 base power or more, give this card in your hand −5 cost."
  //
  // A cost layer, live in hand -- which is where the clause says it applies,
  // so `costZone: "hand"`.
  //
  // "Base power": the printed power, or one an effect set (Bandai's
  // ST23-002#1 reads the same words that way), rather than `currentPower`:
  // DON!! given to San-Gorou and this turn's modifiers do not lift a 6000
  // body into the gate.
  {
    cardNumber: "ST26-001",
    scope: "self",
    costZone: "hand",
    cost: (context) =>
      context.state.players[context.playerId].board.some((board) => {
        const definition = context.db.require(board.cardNumber);
        return (
          definition.category === "character" &&
          (storedBasePower(board.basePowerOverrides, context.state.turn) ??
            definition.power ??
            0) >= 7000 &&
          (hasCardName(board.cardNumber, "San-Gorou") ||
            hasCardName(board.cardNumber, "Sanji"))
        );
      })
        ? -5
        : 0,
  },
];
