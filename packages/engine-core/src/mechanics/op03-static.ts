/**
 * Continuous text printed on the OP-03 identities the pool carries: the rows
 * `static-abilities.ts` folds into its queries. See `op03.ts` for why the set
 * is here only in part.
 */
import { cardAttributes } from "@one-piece-sim/cards";
import type { StaticAbility } from "../static-abilities.js";

export const op03StaticAbilities: readonly StaticAbility[] = [
  // OP03-008 Buggy: survives losing a battle to a <Slash> attacker -- the
  // same attribute reading as OP08-114 S-Hawk, without S-Hawk's gate. Only
  // the defending card is K.O.'d in battle, so the attacker is the card the
  // attribute is read off.
  {
    cardNumber: "OP03-008",
    scope: "self",
    battleKoImmune: (context, attacker) =>
      cardAttributes(context.db.require(attacker.cardNumber)).includes("Slash"),
  },
];
