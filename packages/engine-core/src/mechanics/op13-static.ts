/**
 * Continuous text printed on OP-13: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardType } from "@one-piece-sim/cards";
import {
  fieldDon,
  leaderHasType,
  saboAura,
  totalGivenDon,
  trashAtLeastCount,
  turnPlayer,
} from "./static-shared.js";
import type { StaticAbility, RemovalImmunity } from "../static-abilities.js";

export const op13StaticAbilities: readonly StaticAbility[] = [
  // OP13-009 Curly.Dadan: "[printed text omitted -- pnpm card:text OP13-009]"
  //
  // "other than this card" is by instance, not by card number: two copies of
  // Dadan switch each other on, which is why the filter compares instance ids
  // rather than excluding OP13-009 by number.
  {
    cardNumber: "OP13-009",
    scope: "self",
    keyword: {
      keyword: "Double Attack",
      when: (context) =>
        context.state.players[context.playerId].board.some(
          (card) =>
            card.instanceId !== context.card.instanceId &&
            hasCardType(card.cardNumber, "Mountain Bandits"),
        ),
    },
  },
  // OP13-004 Sabo Leader: -1000 at 4+ Life, and a +1000 aura to everything the
  // controller has while a cost 8+ Character is on the field.
  {
    cardNumber: "OP13-004",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader &&
        context.state.players[context.playerId].life.length >= 4
          ? -1000
          : 0,
    },
  },
  {
    cardNumber: "OP13-004",
    scope: "controller-aura",
    power: { kind: "add", value: (context) => (saboAura(context) ? 1000 : 0) },
  },
  // OP13-031 Trafalgar Law: "[printed text omitted -- pnpm card:text OP13-031]"
  //
  // Its own controller's Life, not the combined count -- the same reading
  // OP13-004 Sabo's Life gate above takes. A `self` keyword layer rather than a
  // printed [Blocker] on the card, so the Character stops blocking the moment a
  // Life card comes back (OP17-037's Life gain, a Trigger that banks one), which
  // a printed keyword could not express.
  {
    cardNumber: "OP13-031",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].life.length <= 1,
    },
  },
  // OP13-112 Vegapunk: `pnpm card:text OP13-112`.
  //
  // "A total of" counts the DON!! given to the Leader and to every Character
  // alike, which is what `totalGivenDon` sums. Given DON!! stay on their cards
  // through the opponent's turn, so the DON!! that powered its controller's
  // attacks are what keep the keyword on when the blocks are asked for.
  {
    cardNumber: "OP13-112",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        totalGivenDon(context.state, context.playerId) >= 2,
    },
  },
  // OP13-003 Gol.D.Roger (Leader): one DON!! of each DON!! Phase goes onto
  // the Leader once the field has any, and the Leader is 2000 smaller until
  // the field holds ten.
  //
  // Both halves are the Leader's own text, so OP13-064's negation of its
  // controller's Leader switches both off through `abilitiesFor`, the
  // same as any other Leader clause. That is the deck's plan: at ten DON!! the
  // -2000 is already gone, and landing OP13-064 for DON!! -3 would bring it
  // back at seven if the negation did not.
  {
    cardNumber: "OP13-003",
    scope: "self",
    readsDon: ["own-ceiling"],
    power: {
      kind: "add",
      value: (context) => (fieldDon(context) <= 9 ? -2000 : 0),
    },
    donPhaseDonToLeader: (context) => context.isLeader,
  },
  // OP13-068 Douglas Bullet: "[printed text omitted -- pnpm card:text OP13-068]" A 3-cost body that defends at 6000 once
  // the Purple deck has ramped, which is what the rest of its package does.
  {
    cardNumber: "OP13-068",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (fieldDon(context) >= 8 ? 2000 : 0),
    },
  },
  // OP13-080 St. Ethanbaron V. Nusjuro: "[printed text omitted -- pnpm card:text OP13-080]" The immunity is in `CONDITIONAL_REMOVAL_IMMUNE`;
  // this is the keyword half.
  {
    cardNumber: "OP13-080",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => trashAtLeastCount(context, 7),
    },
  },
  // OP13-084 St. Shepherd Ju Peter: "[printed text omitted -- pnpm card:text OP13-084]"
  //
  // "Becomes", not "gains", so it is a `set-base` layer rather than an `add` --
  // and it raises a 5000 body while *lowering* the 12000 one, which is what makes
  // this an aura over the whole type rather than a buff. `[Your Turn]` only: on
  // the opponent's turn the printed numbers are back.
  {
    cardNumber: "OP13-084",
    scope: "board-aura",
    power: {
      kind: "set-base",
      value: (context) =>
        turnPlayer(context) === context.playerId &&
        trashAtLeastCount(context, 10) &&
        !context.isLeader &&
        hasCardType(context.card.cardNumber, "Five Elders")
          ? 7000
          : undefined,
    },
  },
  // OP13-089 St. Topman Warcury and OP13-091 St. Marcus Mars: "[printed text omitted -- pnpm card:text OP13-091]"
  {
    cardNumber: "OP13-089",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => trashAtLeastCount(context, 7),
    },
  },
  {
    cardNumber: "OP13-091",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => trashAtLeastCount(context, 7),
    },
  },
  // OP13-099 The Empty Throne (Stage): "[printed text omitted -- pnpm card:text OP13-099]"
  //
  // Nineteen cards is most of a game's mill, and this is the Stage that says the
  // Black deck has got there. A Stage granting an aura to its own Leader is the
  // first of its kind; `board-aura` reads the Stage area too.
  {
    cardNumber: "OP13-099",
    scope: "stage-aura",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader &&
        turnPlayer(context) === context.playerId &&
        trashAtLeastCount(context, 19)
          ? 1000
          : 0,
    },
  },
  // OP13-119 Portgas.D.Ace: "[printed text omitted -- pnpm card:text OP13-119]" Behind-only aggression, the same shape OP12-107 prints.
  {
    cardNumber: "OP13-119",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) =>
        context.state.players[context.playerId].life.length <= 3,
    },
  },
  { cardNumber: "ST35-005", scope: "self", cost: () => 3 },
  {
    cardNumber: "OP13-081",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Revolutionary Army") ? 3 : 0),
  },
];

export const op13RemovalImmunities: readonly RemovalImmunity[] = [
  // The Five Elders: "[printed text omitted -- pnpm card:text OP13-080]" Five
  // bodies print it, and the Black deck's own mill is what turns it on --
  // OP13-086 and OP13-087 trash cards for no other reason.
  ...["OP13-080", "OP13-083", "OP13-084", "OP13-089", "OP13-091"].map(
    (cardNumber): RemovalImmunity => ({
      cardNumber,
      from: "opponent",
      when: (state, ownerId) => state.players[ownerId].trash.length >= 7,
    }),
  ),
];
