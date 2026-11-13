/**
 * Continuous text printed on OP-18's Black cards: the rows `static-abilities.ts`
 * folds into power, cost, keyword and hand-price queries. A clause with a
 * timing marker is a program in `op18-black.ts`.
 */
import { hasCardName, hasCardType } from "@one-piece-sim/cards";
import { type StaticAbility, costOf } from "../static-abilities.js";
import {
  anyCharacterWithCost,
  ELBAPH_COST,
  leaderHasType,
  turnPlayer,
} from "./static-shared.js";

/** OP18-081 Oars's gate: a Character named [Gecko Moria] on its own board. */
const hasMoriaCharacter: NonNullable<StaticAbility["keyword"]>["when"] = (
  context,
) =>
  context.state.players[context.playerId].board.some((card) =>
    hasCardName(card.cardNumber, "Gecko Moria"),
  );

export const op18BlackStaticAbilities: readonly StaticAbility[] = [
  // OP18-081 Oars: two keywords on one condition, so two rows reading the
  // same predicate -- a row carries one keyword.
  {
    cardNumber: "OP18-081",
    scope: "self",
    keyword: { keyword: "Double Attack", when: hasMoriaCharacter },
  },
  {
    cardNumber: "OP18-081",
    scope: "self",
    keyword: { keyword: "Blocker", when: hasMoriaCharacter },
  },
  // OP18-086 Goldberg, OP18-089 Dorry, OP18-091 Brogy: the unconditional
  // `+12 cost` the OP17 Elbaph giants print, read only while on the field.
  { cardNumber: "OP18-086", scope: "self", cost: () => ELBAPH_COST },
  { cardNumber: "OP18-089", scope: "self", cost: () => ELBAPH_COST },
  { cardNumber: "OP18-091", scope: "self", cost: () => ELBAPH_COST },
  // OP18-087 Stansen: the same +12, plus +2000 while every Character its
  // controller has is at 12 or more. Stansen is one of them, and its own +12
  // is what lets it count itself; a single low-cost teammate switches it off.
  {
    cardNumber: "OP18-087",
    scope: "self",
    cost: () => ELBAPH_COST,
    power: {
      kind: "add",
      value: (context) =>
        context.state.players[context.playerId].board.every(
          (card) =>
            costOf(context.state, context.playerId, card, context.db) >=
            ELBAPH_COST,
        )
          ? 2000
          : 0,
    },
  },
  // OP18-092 Roronoa Zoro: the OP17 Elbaph payoff (either side's 12-cost
  // body counts -- the text says "if there is", not "if you have"),
  // plus [Rush] once its controller's trash is 10 deep.
  {
    cardNumber: "OP18-092",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        anyCharacterWithCost(context, ELBAPH_COST) ? 3000 : 0,
    },
    keyword: {
      keyword: "Rush",
      when: (context) =>
        context.state.players[context.playerId].trash.length >= 10,
    },
  },
  // OP18-097 Abyss Pentagram (Stage): OP05-097 Mary Geoise's discount,
  // behind a {Celestial Dragons} Leader, for {Holy Knights of God} or
  // {Five Elders} Characters. No turn gate is printed; the `turnPlayer` check
  // holds the discount to paying a card's cost from hand, which happens only
  // in its controller's own Main Phase. Printed cost, as Mary Geoise reads: a
  // hand card has no other.
  {
    cardNumber: "OP18-097",
    scope: "stage-aura",
    handPlayDiscount: (context) => {
      const card = context.db.require(context.card.cardNumber);
      return leaderHasType(context, "Celestial Dragons") &&
        turnPlayer(context) === context.playerId &&
        card.category === "character" &&
        (card.cost ?? 0) >= 2 &&
        (hasCardType(context.card.cardNumber, "Holy Knights of God") ||
          hasCardType(context.card.cardNumber, "Five Elders"))
        ? 1
        : 0;
    },
  },
];
