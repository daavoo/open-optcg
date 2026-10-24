/**
 * Continuous text printed on the generated ST31–ST36 pool: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { cardAttributes } from "@one-piece-sim/cards";
import {
  always,
  attachedDon,
  handTrashedThisTurn,
  totalGivenDon,
  turnPlayer,
} from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const formatStaticAbilities: readonly StaticAbility[] = [
  // ST31-003 Brook: "[printed text omitted -- pnpm card:text ST31-003]"
  //
  // The `[Opponent's Turn]` prefix governs both halves, so both layers carry the
  // same `turnPlayer` test. Blocking only ever happens on the opponent's turn, so
  // the keyword's gate changes no line of play by itself -- but `observe`
  // publishes `blocker` per board card, and a Brook that reads as a Blocker on
  // its controller's own turn is a fact neither seat's agent should be shown.
  {
    cardNumber: "ST31-003",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        turnPlayer(context) !== context.playerId &&
        totalGivenDon(context.state, context.playerId) >= 3,
    },
  },
  {
    cardNumber: "ST31-003",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        totalGivenDon(context.state, context.playerId) >= 3
          ? 3000
          : 0,
    },
  },
  {
    cardNumber: "ST31-001",
    scope: "self",
    keyword: { keyword: "Rush", when: (context) => attachedDon(context) >= 2 },
  },
  {
    cardNumber: "ST31-004",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => totalGivenDon(context.state, context.playerId) >= 3,
    },
  },
  {
    cardNumber: "ST32-005",
    scope: "self",
    keyword: { keyword: "Rush: Character", when: always },
  },
  {
    cardNumber: "ST32-004",
    scope: "self",
    keyword: {
      keyword: "Rush: Character",
      when: (context) =>
        cardAttributes(
          context.db.require(
            context.state.players[context.playerId].leaderCardNumber,
          ),
        ).includes("Slash"),
    },
  },
  // ST35-004 Koala: "[printed text omitted -- pnpm card:text ST35-004]" One clause,
  // unconditional, so both halves are always live -- but the [Blocker] is
  // phrased as a grant, and `cardFacts` reads granted keywords as somebody's
  // cost to pay. An unconditional grant has no cost, so it belongs here.
  {
    cardNumber: "ST35-004",
    scope: "self",
    cost: () => 1,
    keyword: { keyword: "Blocker", when: always },
  },
  // ST33-004 Borsalino: −3 cost in hand on a turn a card in its controller's
  // hand was trashed by an effect -- either player's: an opponent's effect
  // that makes them trash counts (Bandai's ST33-004#1). A cost layer, so a
  // "cost N or less" clause reading the hand sees the discount as well.
  {
    cardNumber: "ST33-004",
    scope: "self",
    costZone: "hand",
    cost: (context) => (handTrashedThisTurn(context) ? -3 : 0),
  },
];
