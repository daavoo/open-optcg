/**
 * Continuous text printed on OP-18's red cards: the rows `static-abilities.ts`
 * folds into power and keyword queries. A clause with a timing marker is a
 * program in `op18-red.ts`.
 */
import { hasCardName, hasCardType } from "@one-piece-sim/cards";
import type { BoardCard } from "../model.js";
import {
  type AbilityContext,
  type StaticAbility,
  boardCardPower,
} from "../static-abilities.js";
import { fieldHasName, leaderHasType, turnPlayer } from "./static-shared.js";

/**
 * "Your Characters with both the {Animal} and {Alabasta} types" -- the subject
 * of OP18-001's and OP18-011's auras. Derived identity, so a card that answers
 * to both types through its record counts.
 */
const animalAlabastaCharacter = (context: AbilityContext): boolean =>
  !context.isLeader &&
  context.db.require(context.card.cardNumber).category === "character" &&
  hasCardType(context.card.cardNumber, "Animal") &&
  hasCardType(context.card.cardNumber, "Alabasta");

/**
 * OP18-004's own current power. Safe from a keyword predicate for the reason
 * OP06-002 gives: power layers never ask about keywords.
 */
const ownPower = (context: AbilityContext): number =>
  context.isLeader
    ? 0
    : boardCardPower(
        context.state,
        context.playerId,
        context.card as BoardCard,
        true,
        context.db,
      );

const alabastaLeader = (context: AbilityContext): boolean =>
  leaderHasType(context, "Alabasta");

export const op18RedStaticAbilities: readonly StaticAbility[] = [
  // OP18-001 Karoo, the Leader: `pnpm card:text OP18-001`. Its K.O. draw is a
  // reaction rule in `op18-red-reactions.ts`.
  {
    cardNumber: "OP18-001",
    scope: "controller-aura",
    power: {
      kind: "add",
      value: (context) => (animalAlabastaCharacter(context) ? 1_000 : 0),
    },
    keyword: { keyword: "Rush", when: animalAlabastaCharacter },
  },
  // OP18-004 Karoo: `pnpm card:text OP18-004`. Three thresholds on the same
  // live power, each a keyword row of its own because a row carries one.
  {
    cardNumber: "OP18-004",
    scope: "self",
    keyword: { keyword: "Rush", when: (context) => ownPower(context) >= 5_000 },
  },
  {
    cardNumber: "OP18-004",
    scope: "self",
    keyword: {
      keyword: "Banish",
      when: (context) => ownPower(context) >= 6_000,
    },
  },
  {
    cardNumber: "OP18-004",
    scope: "self",
    keyword: {
      keyword: "Unblockable",
      when: (context) => ownPower(context) >= 7_000,
    },
  },
  // OP18-005 Kung Fu Jugon: `pnpm card:text OP18-005`. Counts every copy on
  // its controller's board, itself included: "every [Kung Fu Jugon]" names no
  // "other", so a lone copy is a 1000.
  {
    cardNumber: "OP18-005",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) === context.playerId
          ? 1_000 *
            context.state.players[context.playerId].board.filter((card) =>
              hasCardName(card.cardNumber, "Kung Fu Jugon"),
            ).length
          : 0,
    },
  },
  // OP18-006 Koza: `pnpm card:text OP18-006`. "If you have" reads the whole
  // field, the Leader included.
  {
    cardNumber: "OP18-006",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (fieldHasName(context, "Nefeltari Vivi") ? 1_000 : 0),
    },
    keyword: {
      keyword: "Rush",
      when: (context) => fieldHasName(context, "Nefeltari Vivi"),
    },
  },
  // OP18-007 Smoker: `pnpm card:text OP18-007`.
  {
    cardNumber: "OP18-007",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (leaderHasType(context, "Navy") ? 1_000 : 0),
    },
    keyword: {
      keyword: "Banish",
      when: (context) => leaderHasType(context, "Navy"),
    },
  },
  // OP18-008 Chaka and OP18-013 Pell: [Rush] behind an {Alabasta} Leader.
  {
    cardNumber: "OP18-008",
    scope: "self",
    keyword: { keyword: "Rush", when: alabastaLeader },
  },
  {
    cardNumber: "OP18-013",
    scope: "self",
    keyword: { keyword: "Rush", when: alabastaLeader },
  },
  // OP18-011 Nefeltari Vivi: `pnpm card:text OP18-011`. The archetype aura is
  // a `board-aura` -- live while Vivi is on the board -- and the defensive
  // half is her own, on the opponent's turn.
  {
    cardNumber: "OP18-011",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) => (animalAlabastaCharacter(context) ? 1_000 : 0),
    },
  },
  {
    cardNumber: "OP18-011",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId ? 6_000 : 0,
    },
    keyword: {
      keyword: "Blocker",
      when: (context) => turnPlayer(context) !== context.playerId,
    },
  },
];
