/**
 * Continuous text printed on ST-21: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardType } from "@one-piece-sim/cards";
import { attachedDon, turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st21StaticAbilities: readonly StaticAbility[] = [
  {
    // ST21-015 Roronoa Zoro: "[printed text omitted -- pnpm card:text ST21-015]" Same
    // attached-DON threshold as ST31-001 Sanji.
    cardNumber: "ST21-015",
    scope: "self",
    keyword: { keyword: "Rush", when: (context) => attachedDon(context) >= 2 },
  },
  // ST21-002 Usopp: with two DON!! on it, it defends 2000 bigger.
  //
  // `[Opponent's Turn]`, so the DON!! this card is holding pay nothing on its
  // controller's own turn and 2000 on the other one -- which is the whole
  // bargain of a deck that parks rested DON!! on its bodies: the DON!! is
  // spent, and what it buys is defence.
  {
    cardNumber: "ST21-002",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        attachedDon(context) >= 2 &&
        turnPlayer(context) !== context.playerId
          ? 2000
          : 0,
    },
  },
  // ST21-011 Franky: with two DON!! on it, on the opponent's turn, every small
  // {Straw Hat Crew} body its controller has defends 1000 bigger.
  //
  // `board-aura`, and the condition is about the *granting* copy rather than
  // the buffed card, which is why the DON!! test reads the aura's own source
  // through the board scan. Base power on the buffed side: a 4000 the DON!!
  // have already lifted is still inside the band, which is what makes the aura
  // stack with the DON!! rather than switch off as they land.
  {
    cardNumber: "ST21-011",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) !== context.playerId &&
        hasCardType(context.card.cardNumber, "Straw Hat Crew") &&
        (context.db.require(context.card.cardNumber).power ?? 0) <= 4000 &&
        context.state.players[context.playerId].board.some(
          (card) =>
            card.cardNumber === "ST21-011" &&
            (card.attachedDon?.length ?? 0) >= 2,
        )
          ? 1000
          : 0,
    },
  },
];
