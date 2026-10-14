/**
 * Continuous text printed on ST-25: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { turnPlayer, twoBaseCostFiveCharacters } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st25StaticAbilities: readonly StaticAbility[] = [
  // ST25-001 Alvida, ST25-002 Cabaji and ST25-005 Mohji: the same condition
  // as OP12-042, and on the two Blockers it grants the keyword as well as the
  // cost. A Blocker gained this way is a Blocker from the moment the second
  // big body lands, so it can block that same opponent's turn.
  {
    cardNumber: "ST25-001",
    scope: "self",
    cost: (context) => (twoBaseCostFiveCharacters(context) ? 1 : 0),
  },
  {
    cardNumber: "ST25-002",
    scope: "self",
    cost: (context) => (twoBaseCostFiveCharacters(context) ? 1 : 0),
  },
  {
    cardNumber: "ST25-002",
    scope: "self",
    keyword: { keyword: "Blocker", when: twoBaseCostFiveCharacters },
  },
  // ST25-002 Cabaji's [Opponent's Turn] buff: unconditional, so the 1000 body
  // defends as a 6000 even before the Blocker turns on.
  {
    cardNumber: "ST25-002",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) !== context.playerId ? 5000 : 0),
    },
  },
  {
    cardNumber: "ST25-005",
    scope: "self",
    cost: (context) => (twoBaseCostFiveCharacters(context) ? 1 : 0),
  },
  {
    cardNumber: "ST25-005",
    scope: "self",
    keyword: { keyword: "Blocker", when: twoBaseCostFiveCharacters },
  },
];
