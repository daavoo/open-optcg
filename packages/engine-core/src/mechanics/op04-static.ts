/**
 * Continuous text printed on the OP-04 identities still in the pool: the rows
 * `static-abilities.ts` folds into power, cost and keyword queries. See
 * `op04.ts` for why the set is here only in part.
 */
import { hasCardType } from "@one-piece-sim/cards";
import type { StaticAbility } from "../static-abilities.js";

export const op04StaticAbilities: readonly StaticAbility[] = [
  // OP04-096 Corrida Coliseum: "[printed text omitted -- pnpm card:text OP04-096]"
  //
  // Attacking Characters on the turn a card is played is exactly
  // [Rush: Character], so the Stage hands that keyword to its controller's
  // {Dressrosa} Characters while their Leader has the type. The Leader is
  // read live, so the aura switches off with the Leader rather than with the
  // Stage being played.
  {
    cardNumber: "OP04-096",
    scope: "stage-aura",
    keyword: {
      keyword: "Rush: Character",
      when: (context) =>
        !context.isLeader &&
        hasCardType(context.card.cardNumber, "Dressrosa") &&
        hasCardType(
          context.state.players[context.playerId].leaderCardNumber,
          "Dressrosa",
        ),
    },
  },
];
