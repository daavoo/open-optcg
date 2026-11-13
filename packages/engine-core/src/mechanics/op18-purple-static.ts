/**
 * Continuous text on OP-18's Purple cards: the rows `static-abilities.ts`
 * folds into power and keyword queries.
 */
import { hasCardName } from "@one-piece-sim/cards";
import type { AbilityContext, StaticAbility } from "../static-abilities.js";
import { turnPlayer } from "./static-shared.js";

/** On the opponent's turn, behind a [Sugar] Leader -- OP18-071's one gate. */
const sugarDefending = (context: AbilityContext): boolean =>
  turnPlayer(context) !== context.playerId &&
  hasCardName(
    context.state.players[context.playerId].leaderCardNumber,
    "Sugar",
  );

export const op18PurpleStaticAbilities: readonly StaticAbility[] = [
  // OP18-071 Trebol: +2000 and [Blocker] on the opponent's turn behind a
  // [Sugar] Leader. One gate for both halves, so the body that blocks is the
  // body that has the power to survive it.
  {
    cardNumber: "OP18-071",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (sugarDefending(context) ? 2000 : 0),
    },
    keyword: { keyword: "Blocker", when: sugarDefending },
  },
];
