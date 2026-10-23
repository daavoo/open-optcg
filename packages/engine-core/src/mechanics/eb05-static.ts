/**
 * Continuous text printed on EB-05: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 *
 * Printed text for any card here is `pnpm card:text <CARD>`.
 */
import {
  cardBasePower,
  opponentOf,
  type AbilityContext,
  type RemovalImmunity,
  type StaticAbility,
} from "../static-abilities.js";

/**
 * "If your opponent has a Character with 8000 base power or more" -- EB05-046
 * Yamato's gate. Base power through `cardBasePower`, so DON!! and +N buffs on
 * an opposing body do not switch it on, and a "base power becomes" setter
 * does.
 */
const opponentHasBigBase = (context: AbilityContext): boolean => {
  const opponent = opponentOf(context.playerId);
  return context.state.players[opponent].board.some(
    (card) =>
      (cardBasePower(context.state, opponent, card, context.db) ?? 0) >= 8_000,
  );
};

export const eb05StaticAbilities: readonly StaticAbility[] = [
  // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
  // -- Blue and Purple: EB05-021 to EB05-040 --
  // -- Black and Yellow: EB05-041 to EB05-060 --
  // EB05-046 Yamato: printed text `pnpm card:text EB05-046`.
  //
  // One printed gate buys both the keyword and the +3000, so the two halves
  // read the same predicate. The `[On Your Opponent's Attack]` half is in
  // `eb05-battle.ts`.
  {
    cardNumber: "EB05-046",
    scope: "self",
    keyword: { keyword: "Blocker", when: opponentHasBigBase },
    power: {
      kind: "add",
      value: (context) => (opponentHasBigBase(context) ? 3_000 : 0),
    },
  },
  // EB05-047 Ripley: printed text `pnpm card:text EB05-047`.
  //
  // An unconditional cost layer on the field, the same shape OP17's giants
  // print: a 4-cost body that answers "cost 12 or more" gates and is out of
  // reach of "cost N or less" removal. Its `[On Play]` is in
  // `eb05-on-play.ts`.
  { cardNumber: "EB05-047", scope: "self", cost: () => 12 },
];

export const eb05RemovalImmunities: readonly RemovalImmunity[] = [
  // -- Red and Green: EB05-001 to EB05-020, and EB05-061 --
  // -- Blue and Purple: EB05-021 to EB05-040 --
  // -- Black and Yellow: EB05-041 to EB05-060 --
];
