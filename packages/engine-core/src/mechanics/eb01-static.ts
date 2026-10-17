/**
 * Continuous text printed on EB-01: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardType } from "@one-piece-sim/cards";
import { attachedDon, turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const eb01StaticAbilities: readonly StaticAbility[] = [
  // EB01-024 Hamlet: printed text `pnpm card:text EB01-024`.
  //
  // A Character granting its own side an aura, so `board-aura`: live while
  // Hamlet is on the board, applied to every one of its controller's
  // {SMILE} Characters -- Hamlet is one -- while that player holds 4 or
  // fewer cards.
  {
    cardNumber: "EB01-024",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        hasCardType(context.card.cardNumber, "SMILE") &&
        context.state.players[context.playerId].hand.length <= 4
          ? 1000
          : 0,
    },
  },
  // EB01-014 Sanji: "[DON!! x1] [Your Turn] This Character gains +1000 power for
  // every 3 of your rested DON!! cards."
  //
  // Rested DON!! is what the controller has already spent this turn, so the
  // layer grows as the turn goes on: the body is at its largest attacking last,
  // which is the opposite of how a DON!!-hungry board usually wants to order
  // its attacks. Floored division -- "for every 3" pays nothing for the first
  // two.
  {
    cardNumber: "EB01-014",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 1 && turnPlayer(context) === context.playerId
          ? Math.floor(
              context.state.players[context.playerId].restedDon.length / 3,
            ) * 1000
          : 0,
    },
  },
  // EB01-058 Mont Blanc Cricket: "[DON!! x1] [Your Turn] If you have 2 or less
  // Life cards, this Character gains +2000 power."
  //
  // The controller's own Life, not the opponent's: a 2-drop that doubles once
  // its own side is behind, which is the Sky Island package's shape.
  {
    cardNumber: "EB01-058",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 1 &&
        turnPlayer(context) === context.playerId &&
        context.state.players[context.playerId].life.length <= 2
          ? 2000
          : 0,
    },
  },
];
