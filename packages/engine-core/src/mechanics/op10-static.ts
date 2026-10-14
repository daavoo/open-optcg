/**
 * Continuous text printed on OP-10: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardType } from "@one-piece-sim/cards";
import {
  type StaticAbility,
  opponentOf,
  type RemovalImmunity,
} from "../static-abilities.js";
import { attachedDon, restedCharacters, turnPlayer } from "./static-shared.js";

export const op10StaticAbilities: readonly StaticAbility[] = [
  {
    cardNumber: "OP10-005",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) === context.playerId ? 3000 : 0),
    },
  },
  {
    cardNumber: "OP10-011",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) !== context.playerId ? 2000 : 0),
    },
  },
  // OP10-001 Smoker (Leader): "[printed text omitted -- pnpm card:text OP10-001]"
  //
  // A defensive aura on the Leader, which is what makes the deck's small bodies
  // survive a turn they cannot answer -- and what its own `[Activate: Main]`
  // reads back when it asks for a Character at 7000 power.
  {
    cardNumber: "OP10-001",
    scope: "controller-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) !== context.playerId &&
        (hasCardType(context.card.cardNumber, "Navy") ||
          hasCardType(context.card.cardNumber, "Punk Hazard"))
          ? 1000
          : 0,
    },
  },
  // OP10-038 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP10-038]"
  //
  // The Green ODYSSEY package rests its own board on purpose, so on the
  // opponent's turn this is a 6000 body defending at 8000 -- the payoff for the
  // rests its teammates' [On Play]s were gated on.
  {
    cardNumber: "OP10-038",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        restedCharacters(context) >= 2
          ? 2000
          : 0,
    },
  },
  // OP10-042 Usopp (Leader): "[printed text omitted -- pnpm card:text OP10-042]"
  //
  // Cost, not power, and it is protection: +1 cost lifts a body out of the reach
  // of "cost N or less" removal. Printed cost is what the "2 or more" gate reads,
  // because the effective one would include this very buff and let a 1-drop
  // climb into its own condition.
  //
  // "Characters" are cards on the field, and an aura's cost layer is read in
  // every zone its predicate allows -- so the predicate asks for the board.
  // Without it a 7-cost Kyros in hand reads 8, and OP10-058 Rebecca's "cost
  // of 7 or less" reveal from hand cannot name the card the deck plays her
  // for.
  {
    cardNumber: "OP10-042",
    scope: "controller-aura",
    cost: (context) =>
      !context.isLeader &&
      context.state.players[context.playerId].board.some(
        (card) => card.instanceId === context.card.instanceId,
      ) &&
      hasCardType(context.card.cardNumber, "Dressrosa") &&
      (context.db.require(context.card.cardNumber).cost ?? 0) >= 2
        ? 1
        : 0,
  },
  // OP10-113 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP10-113]"
  //
  // Yellow's behind-only aggression, read live off both Life piles: a 3-cost
  // 5000 body that attacks the turn it lands, but only while losing the race.
  {
    cardNumber: "OP10-113",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) =>
        context.state.players[context.playerId].life.length <
        context.state.players[opponentOf(context.playerId)].life.length,
    },
  },
  // OP10-094 Kaido: "[printed text omitted -- pnpm card:text OP10-094]"
  //
  // Found by the census in `test/double-attack.test.ts`: the printed-keyword
  // table in `packages/cards` skips "gains [Double Attack]" as a grant, exactly
  // as it should, and nothing here picked the grant up -- so a card in the
  // registry dealt one damage while its text said two. The same shape as
  // ST31-001 and ST21-015 one keyword over.
  {
    cardNumber: "OP10-094",
    scope: "self",
    keyword: {
      keyword: "Double Attack",
      when: (context) => attachedDon(context) >= 1,
    },
  },
];

export const op10RemovalImmunities: readonly RemovalImmunity[] = [
  // OP10-082 Kuzan: "[printed text omitted -- pnpm card:text OP10-082]"
  // Unconditional, and every kind of removal, not only a K.O.
  { cardNumber: "OP10-082", from: "opponent" },
];
