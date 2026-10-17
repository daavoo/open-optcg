/**
 * Continuous text printed on OP-15: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName, hasCardType } from "@one-piece-sim/cards";
import {
  type StaticAbility,
  boardCardPower,
  opponentOf,
  type RemovalImmunity,
} from "../static-abilities.js";
import {
  attachedDon,
  boardHasName,
  fieldDon,
  isNamedOrSelf,
  leaderHasType,
  ownLeaderPower,
  trashEventCountOf,
  turnPlayer,
} from "./static-shared.js";
import { fieldDonCount } from "../don.js";

export const op15StaticAbilities: readonly StaticAbility[] = [
  // OP15-011 Pearl: "[printed text omitted -- pnpm card:text OP15-011]" One clause granting two
  // things, so both layers carry the same predicate. Its `[On K.O.]` removal is
  // a mechanic program.
  {
    cardNumber: "OP15-011",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        leaderHasType(context, "East Blue")
          ? 2000
          : 0,
    },
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        turnPlayer(context) !== context.playerId &&
        leaderHasType(context, "East Blue"),
    },
  },
  // OP15-070 Fuza: "[printed text omitted -- pnpm card:text OP15-070]"
  //
  // A `board-aura`, because the grant reaches teammates rather than only the
  // printed card -- and it has to name both halves itself: the aura is asked
  // about every card its controller has, so the predicate is "this card is a
  // [Shura], or it is Fuza". `set-base` rather than a modifier, because the
  // printed text says "become", and 6000 replaces 4000 rather than adding to it.
  {
    cardNumber: "OP15-070",
    scope: "board-aura",
    keyword: {
      keyword: "Unblockable",
      when: (context) => isNamedOrSelf(context, "Shura", "OP15-070"),
    },
    power: {
      kind: "set-base",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        isNamedOrSelf(context, "Shura", "OP15-070")
          ? 6000
          : undefined,
    },
  },
  // OP15-080 Oars: "[printed text omitted -- pnpm card:text OP15-080]"
  //
  // Both halves are read live off the board, and the second is what stops a
  // player stacking 0-power bodies: a second Oars switches every copy off, this
  // one included, which is why the count is "no *other*" rather than "at most
  // one". Its `[On K.O.]` recursion is a mechanic program.
  {
    cardNumber: "OP15-080",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => {
        const board = context.state.players[context.playerId].board;
        const moria = board.some(
          (card) =>
            hasCardName(card.cardNumber, "Gecko Moria") &&
            boardCardPower(context.state, context.playerId, card) >= 10_000,
        );
        const otherOars = board.some(
          (card) =>
            card.instanceId !== context.card.instanceId &&
            hasCardName(card.cardNumber, "Oars"),
        );
        return moria && !otherOars ? 7000 : 0;
      },
    },
  },
  // OP15-006 Cavendish: "[printed text omitted -- pnpm card:text OP15-006]"
  //
  // The same four-Events-in-trash count OP15-021 below reads, on the other
  // side of the card: there it takes 3 off the price in hand, here it puts a
  // 4-cost 4000 body at 6000 for the rest of the game.
  {
    cardNumber: "OP15-006",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (trashEventCountOf(context) >= 4 ? 2000 : 0),
    },
  },
  // OP15-021 "Just Watch Me, Ace!!!": "[printed text omitted -- pnpm card:text OP15-021]" A discount read off the trash,
  // which the Dressrosa Event shell fills on its own.
  //
  // A `costZone: "hand"` layer, so it answers "cost N or less" clauses that
  // read the hand and, through `staticHandCostDelta`, the price paid to
  // activate the Event.
  {
    cardNumber: "OP15-021",
    scope: "self",
    costZone: "hand",
    cost: (context) => (trashEventCountOf(context) >= 4 ? -3 : 0),
  },
  // OP15-102 Gan.Fall: "[printed text omitted -- pnpm card:text OP15-102]" The threshold is
  // current power, so a Character pushed there by DON!! turns the discount on.
  {
    cardNumber: "OP15-102",
    scope: "self",
    costZone: "hand",
    cost: (context) =>
      context.state.players[context.playerId].board.some(
        (card) =>
          hasCardType(card.cardNumber, "Sky Island") &&
          boardCardPower(context.state, context.playerId, card) >= 7000,
      )
        ? -3
        : 0,
  },
  // OP15-071 Holly: "[printed text omitted -- pnpm card:text OP15-071]"
  //
  // The exact shape OP15-070 Fuza prints for [Shura] and [Unblockable]: a
  // `board-aura` reaching a named group *and* the card granting it, which is not
  // a member of that group by name.
  {
    cardNumber: "OP15-071",
    scope: "board-aura",
    keyword: {
      keyword: "Double Attack",
      when: (context) => isNamedOrSelf(context, "Ohm", "OP15-071"),
    },
    power: {
      kind: "set-base",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        isNamedOrSelf(context, "Ohm", "OP15-071")
          ? 6000
          : undefined,
    },
  },
  // OP15-001 Krieg (Leader): "[printed text omitted -- pnpm card:text OP15-001]"
  //
  // An `opponent-aura`: the layer is read for the *opponent's* Characters while
  // Krieg is the other player's Leader. Three conditions at once -- a DON!!
  // given to Krieg, the opponent's turn from Krieg's point of view, and a board
  // of nothing but {East Blue} on Krieg's side.
  {
    cardNumber: "OP15-001",
    scope: "opponent-aura",
    power: {
      kind: "add",
      value: (context) => {
        if (context.isLeader) return 0;
        const kriegPlayerId = opponentOf(context.playerId);
        const krieg = context.state.players[kriegPlayerId];
        // "[Opponent's Turn]" is from Krieg's side: the debuff is live while
        // the Character's own controller is the turn player.
        if (turnPlayer(context) !== context.playerId) return 0;
        if (krieg.leaderAttachedDon.length < 1) return 0;
        const characters = krieg.board.filter(
          (card) =>
            context.db.require(card.cardNumber).category === "character",
        );
        const onlyEastBlue =
          characters.length > 0 &&
          characters.every((card) => hasCardType(card.cardNumber, "East Blue"));
        return onlyEastBlue ? -2000 : 0;
      },
    },
  },
  // OP15-024 Usopp: "[Opponent's Turn] This Character ... gains [Blocker]."
  // and, in the same clause, cannot be rested by the opponent's effects.
  {
    cardNumber: "OP15-024",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => turnPlayer(context) !== context.playerId,
    },
    restImmune: (context) => turnPlayer(context) !== context.playerId,
  },
  // OP15-051 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP15-051]" A defensive body that
  // only holds the line for the archetype it is printed for.
  {
    cardNumber: "OP15-051",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        leaderHasType(context, "Dressrosa")
          ? 3000
          : 0,
    },
  },
  // OP15-088 Pirates Docking Six: "This Character gains +6 cost." A 5-cost body
  // that sits at 11 for anything reading cost -- which is what keeps it out of
  // range of the "cost N or less" removal a 7000-power Character would
  // otherwise invite.
  {
    cardNumber: "OP15-088",
    scope: "self",
    cost: () => 6,
  },
  // OP15-053 Rebecca: "[printed text omitted -- pnpm card:text OP15-053]" A 1-cost
  // 0-power body that becomes a Blocker the moment a DON!! is given to it.
  {
    cardNumber: "OP15-053",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => attachedDon(context) >= 1,
    },
  },
  // OP15-087 Nico Robin: "[printed text omitted -- pnpm card:text OP15-087]" Black's self-mill is what turns this on, so the
  // count is read live rather than at play time.
  {
    cardNumber: "OP15-087",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        context.state.players[context.playerId].trash.length >= 10,
    },
  },
  // OP15-092 Monkey.D.Luffy: printed text `pnpm card:text OP15-092`. Three
  // tiers read off the controller's trash, each live rather than counted at
  // play time, so a self-mill turns them on mid-turn and a trash recursion can
  // switch them back off.
  //
  // At 10 the body becomes a 9000 and gains +10 cost: a 7-cost printed at 7000
  // sits at 17, which is a giant for every "cost of 12 or more" clause in the
  // Elbaph shell and a [Blocker] under the OP17-079 Leader.
  {
    cardNumber: "OP15-092",
    scope: "self",
    power: {
      kind: "set-base",
      value: (context) =>
        context.state.players[context.playerId].trash.length >= 10
          ? 9000
          : undefined,
    },
    cost: (context) =>
      context.state.players[context.playerId].trash.length >= 10 ? 10 : 0,
  },
  // At 20, the Leader's base power becomes 7000 on the opponent's turn. A
  // Character rewriting its Leader, so `board-aura` for the reason EB04-003
  // gives, and `set-base` because "becomes" is a replacement: DON!! and
  // modifiers still stack on top.
  {
    cardNumber: "OP15-092",
    scope: "board-aura",
    power: {
      kind: "set-base",
      value: (context) => {
        if (!context.isLeader) return undefined;
        if (turnPlayer(context) === context.playerId) return undefined;
        return context.state.players[context.playerId].trash.length >= 20
          ? 7000
          : undefined;
      },
    },
  },
  // At 30, +1000 on top of the 9000 the first tier already set.
  {
    cardNumber: "OP15-092",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.state.players[context.playerId].trash.length >= 30 ? 1000 : 0,
    },
  },
  // OP15-067 Shura: [Rush] while at 6 or less DON!! on the field.
  {
    cardNumber: "OP15-067",
    scope: "self",
    readsDon: ["own-ceiling"],
    keyword: {
      keyword: "Rush",
      when: (context) => fieldDon(context) <= 6,
    },
  },
  // OP15-119 Monkey.D.Luffy: [Rush] at 6 or more DON!! on the field. Its
  // Event/[Blocker] reaction is a signal rule in `card-mechanics.ts`.
  {
    cardNumber: "OP15-119",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => fieldDon(context) >= 6,
    },
  },
  // OP15-068 Heavenly Warriors: [Blocker] while at 6 or less DON!! on the
  // field -- OP15-067 Shura's ceiling, on a keyword the purple ramp-down deck
  // wants on defence instead of offence.
  {
    cardNumber: "OP15-068",
    scope: "self",
    readsDon: ["own-ceiling"],
    keyword: {
      keyword: "Blocker",
      when: (context) => fieldDon(context) <= 6,
    },
  },
  // OP15-050 Bobby Funk: +3000 while its controller has a [Kelly Funk]
  // Character. Read live, so the buff leaves with the brother.
  {
    cardNumber: "OP15-050",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (boardHasName(context, "Kelly Funk") ? 3000 : 0),
    },
  },
  // OP15-013 Pincers: −2 cost in hand while its controller's Leader is at 0
  // power or less -- current power, which the Red Alabasta package spends its
  // own Leader down to.
  {
    cardNumber: "OP15-013",
    scope: "self",
    costZone: "hand",
    cost: (context) => (ownLeaderPower(context) <= 0 ? -2 : 0),
  },
  // OP15-060 and OP15-118 Enel: +2000 power while at 6 or less DON!! on the
  // field. The removal immunity on the same clause lives in `isRemovalImmune`.
  {
    cardNumber: "OP15-060",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (fieldDon(context) <= 6 ? 2000 : 0),
    },
  },
  {
    cardNumber: "OP15-118",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (fieldDon(context) <= 6 ? 2000 : 0),
    },
  },
];

export const op15RemovalImmunities: readonly RemovalImmunity[] = [
  // Both 6-cost Enel Characters -- OP15-060 and OP15-118 -- read "[printed text
  // omitted -- pnpm card:text OP15-118]" while their controller is at 6 or
  // less DON!!.
  {
    cardNumber: "OP15-060",
    from: "opponent",
    readsDon: ["own-ceiling"],
    when: (state, ownerId) => fieldDonCount(state, ownerId) <= 6,
  },
  {
    cardNumber: "OP15-118",
    from: "opponent",
    readsDon: ["own-ceiling"],
    when: (state, ownerId) => fieldDonCount(state, ownerId) <= 6,
  },
];
