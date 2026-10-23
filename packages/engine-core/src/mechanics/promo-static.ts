/**
 * Continuous text printed on the `P-` promos: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 *
 * Not a set and not a design: promos are printed one at a time in event packs
 * and magazine inserts, so the rows are grouped by the shape of the layer
 * rather than by anything the cards share.
 */
import { hasCardType } from "@one-piece-sim/cards";
import {
  attachedDon,
  buggyCostBandBan,
  leaderHasType,
  lowLife,
  turnPlayer,
} from "./static-shared.js";
import {
  type StaticAbility,
  opponentOf,
  type RemovalImmunity,
} from "../static-abilities.js";
import { fieldDonCount } from "../don.js";

export const promoStaticAbilities: readonly StaticAbility[] = [
  // P-084 Buggy: under its controller's [Buggy] Leader, no Character with a
  // cost of 3 or 4 can attack -- on either side of the table, which is two
  // rows, the way OP05-040 Birdcage pairs its two Stage scopes. Each row reads
  // the Leader on the Buggy's own side. "This Character cannot attack" is the
  // derived `cannotAttack` flag and needs no row; the `[On Play]` is in
  // `promo-on-play.ts`.
  {
    cardNumber: "P-084",
    scope: "board-aura",
    attackBlocked: (context) => buggyCostBandBan(context, context.playerId),
  },
  {
    cardNumber: "P-084",
    scope: "opponent-board-aura",
    attackBlocked: (context) =>
      buggyCostBandBan(context, opponentOf(context.playerId)),
  },
  // P-105 Sabo: [Blocker] only under a {Revolutionary Army} Leader.
  {
    cardNumber: "P-105",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => leaderHasType(context, "Revolutionary Army"),
    },
  },
  {
    cardNumber: "P-105",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Revolutionary Army") ? 4 : 0),
  },
  // Five promos whose whole text is a keyword behind a DON!! count. Read
  // through `attachedDon`, which is the card's own pile -- two copies on one
  // board can be paid differently, so the gate is per instance.
  {
    cardNumber: "P-001",
    scope: "self",
    keyword: { keyword: "Rush", when: (context) => attachedDon(context) >= 2 },
  },
  {
    cardNumber: "P-003",
    scope: "self",
    keyword: {
      keyword: "Double Attack",
      when: (context) => attachedDon(context) >= 2,
    },
  },
  {
    cardNumber: "P-004",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => attachedDon(context) >= 1,
    },
  },
  // P-113 Jewelry Bonney: [Blocker] and +2000, but only on the other player's
  // turn and only with two DON!! on it. Two rows for one sentence, because a
  // keyword and a power layer are different shapes. Its `[Trigger]` is in
  // `mechanics/promo-triggers.ts`.
  {
    cardNumber: "P-113",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        attachedDon(context) >= 2 && turnPlayer(context) !== context.playerId,
    },
  },
  {
    cardNumber: "P-113",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 2 && turnPlayer(context) !== context.playerId
          ? 2000
          : 0,
    },
  },
  // Four promos that cannot lose a fight to a named attacker. `battleKoImmune`
  // rather than `isRemovalImmune`: these answer a lost battle and say nothing
  // about a removal effect, and keeping the two apart is what leaves the
  // bodies beatable.
  {
    // P-007 Monkey.D.Luffy: safe from <Strike>, and only from a Leader or a
    // Character -- an Event with the attribute is outside it, which is what a
    // 4-cost 5000 is answered by.
    cardNumber: "P-007",
    scope: "self",
    battleKoImmune: (context, attacker) =>
      attachedDon(context) >= 1 && attacker.attributes.includes("Strike"),
  },
  {
    // P-025 Smoker: the inverted reading -- safe from every Character *without*
    // <Special>, so the attribute it names is the one that gets through. The
    // Leader is outside it either way: the clause says Characters.
    cardNumber: "P-025",
    scope: "self",
    battleKoImmune: (context, attacker) =>
      attachedDon(context) >= 1 &&
      !attacker.isLeader &&
      !attacker.attributes.includes("Special"),
  },
  {
    // P-052 Dracule Mihawk: safe from <Slash>, from cards of any kind.
    cardNumber: "P-052",
    scope: "self",
    battleKoImmune: (context, attacker) =>
      attachedDon(context) >= 1 && attacker.attributes.includes("Slash"),
  },
  {
    // P-054 Monkey.D.Garp: the same, for <Strike>.
    cardNumber: "P-054",
    scope: "self",
    battleKoImmune: (context, attacker) =>
      attachedDon(context) >= 1 && attacker.attributes.includes("Strike"),
  },
  // Promos whose power moves with the board.
  {
    // P-006 Monkey.D.Luffy: +2000 on its controller's turn with two DON!! on
    // it -- a 3-cost that attacks as a 5000 and blocks as a 3000.
    cardNumber: "P-006",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 2 && turnPlayer(context) === context.playerId
          ? 2000
          : 0,
    },
  },
  {
    // P-027 General Franky: an aura over its controller's small bodies, live
    // only on the other player's turn -- so a board of 2000s blocks at 3000.
    // Base power, so a body the DON!! have already lifted is still inside it.
    //
    // The card's other sentence, the [Franky] name it also answers to, is a
    // derived fact (`nameAliases`) rather than a layer here.
    cardNumber: "P-027",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) !== context.playerId &&
        (context.db.require(context.card.cardNumber).power ?? 0) <= 3000
          ? 1000
          : 0,
    },
  },
  {
    // P-034 Sanji: +2000 on its controller's turn, once their own Life is
    // down to two -- Yellow's behind-only shape on a promo.
    cardNumber: "P-034",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 1 &&
        turnPlayer(context) === context.playerId &&
        lowLife(context, 2)
          ? 2000
          : 0,
    },
  },
  {
    // P-039 Bellamy: +2000 at zero Life, which is the last turn it will ever
    // attack -- and it prints [Banish], so that attack ends the game rather
    // than handing over a Trigger.
    cardNumber: "P-039",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 2 && lowLife(context, 0) ? 2000 : 0,
    },
  },
  {
    // P-044 Sabo: +2000 with a DON!! on it and a hand of 4 or less.
    //
    // No turn-player test, unlike P-050 below: the printed clause names no
    // window, so the body defends at 6000 as well as attacking at one. The
    // printed marker list carries no timing bracket at all, which is why the
    // card-support ratchet cannot see a gap here -- a continuous clause with
    // nothing to schedule is exactly the shape that goes silently unrun.
    cardNumber: "P-044",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        attachedDon(context) >= 1 &&
        context.state.players[context.playerId].hand.length <= 4
          ? 2000
          : 0,
    },
  },
  {
    // P-050 Sanji: +4000 on its controller's turn from an empty-ish hand --
    // the largest conditional buff on a 3-cost in the pool, and a [Blocker]
    // besides, so the hand it needs to be small is the hand that would have
    // Countered instead.
    cardNumber: "P-050",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 1 &&
        turnPlayer(context) === context.playerId &&
        context.state.players[context.playerId].hand.length <= 3
          ? 4000
          : 0,
    },
  },
  {
    // P-078 Adio: +1000 off two rested {ODYSSEY} bodies, which the Green
    // package rests for its own effects.
    cardNumber: "P-078",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.state.players[context.playerId].board.filter(
          (card) => card.rested && hasCardType(card.cardNumber, "ODYSSEY"),
        ).length >= 2
          ? 1000
          : 0,
    },
  },
  {
    // P-092 Koby: −3000 on the other player's turn. A penalty rather than a
    // buff, and the price of the Leader base-power rewrite its
    // `[When Attacking]` half buys (`mechanics/promo-battle.ts`): a 7-cost
    // 7000 that defends as a 4000.
    cardNumber: "P-092",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId ? -3000 : 0,
    },
  },
  {
    // P-032 Sengoku: an aura over the *other* player's whole board, −2 cost
    // while its controller is the turn player and a DON!! is on it.
    //
    // `opponent-board-aura`: the subject is the cards of the player being
    // asked about and the source is across the table, which no controller- or
    // board-scoped aura can express. Cost rather than power, so what it does
    // is drop the opposing board into the reach of "cost N or less" removal.
    cardNumber: "P-032",
    scope: "opponent-board-aura",
    cost: (context) =>
      !context.isLeader &&
      turnPlayer(context) !== context.playerId &&
      context.state.players[context.playerId === "p1" ? "p2" : "p1"].board.some(
        (card) =>
          card.cardNumber === "P-032" && (card.attachedDon?.length ?? 0) >= 1,
      )
        ? -2
        : 0,
  },
];

export const promoRemovalImmunities: readonly RemovalImmunity[] = [
  // P-104 Shanks: while either cost area is full at ten, the opponent's effects
  // cannot take it off the field.
  //
  // Either field, which is the Elbaph reading rather than "you have": a mirror
  // where both decks ramp switches it on for both copies. Not `koOnly` -- the
  // printed words are "removed from the field", so a bounce and a bury are
  // answered as well as a K.O., which is what an 8-cost 10000 is priced on.
  {
    cardNumber: "P-104",
    from: "opponent",
    readsDon: ["opponent"],
    when: (state, ownerId) =>
      fieldDonCount(state, ownerId) >= 10 ||
      fieldDonCount(state, opponentOf(ownerId)) >= 10,
  },
];
