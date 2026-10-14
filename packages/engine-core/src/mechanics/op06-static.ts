/**
 * Continuous text printed on OP-06: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName, hasCardType } from "@one-piece-sim/cards";
import { storedBasePower } from "../base-power.js";
import { fieldDonCount } from "../don.js";
import type { BoardCard } from "../model.js";
import {
  type StaticAbility,
  boardCardPower,
  opponentOf,
  type RemovalImmunity,
} from "../static-abilities.js";
import {
  attachedDon,
  fieldDon,
  leaderHasType,
  turnPlayer,
} from "./static-shared.js";

export const op06StaticAbilities: readonly StaticAbility[] = [
  // OP06-110 Nekomamushi: "[printed text omitted -- pnpm card:text OP06-110]" The pool's only continuous printing of the
  // permission -- see `attacksActive` on `StaticAbility` for why a turn flag
  // could not hold it.
  {
    cardNumber: "OP06-110",
    scope: "self",
    attacksActive: (context) => !context.isLeader && attachedDon(context) >= 2,
  },
  // OP06-002 Inazuma: "[printed text omitted -- pnpm card:text OP06-002]"
  //
  // [Banish] once the body is big enough, which on a 4-cost 5000 means two
  // DON!! -- so this is a keyword the *attacker* buys on the turn it swings,
  // and the Life card it takes never reaches a hand or opens a Trigger.
  // Reading current power from a keyword predicate is safe: power layers never
  // ask about keywords, so the two cannot recurse.
  {
    cardNumber: "OP06-002",
    scope: "self",
    keyword: {
      keyword: "Banish",
      when: (context) =>
        !context.isLeader &&
        boardCardPower(
          context.state,
          context.playerId,
          context.card as BoardCard,
          true,
          context.db,
        ) >= 7_000,
    },
  },
  // OP06-010 Douglas Bullet: "[printed text omitted -- pnpm card:text OP06-010]"
  //
  // A 6-cost 7000 that only blocks behind its own archetype's Leader, which is
  // why it is a layer here rather than printed text `hasStaticKeyword` reads.
  {
    cardNumber: "OP06-010",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => !context.isLeader && leaderHasType(context, "FILM"),
    },
  },
  // OP06-012 Bear.King: "[printed text omitted -- pnpm card:text OP06-012]"
  //
  // A body that cannot be fought off the board while the opponent is holding
  // anything sizeable -- which inverts the usual reading: the *better* their
  // board, the harder this 5-cost 6000 is to remove in battle. Base power on
  // both halves, so DON!! spent on their attacker does not switch it on and
  // the answer does not move mid-battle.
  {
    cardNumber: "OP06-012",
    scope: "self",
    battleKoImmune: (context) => {
      if (context.isLeader) return false;
      const opponentId = opponentOf(context.playerId);
      const opponent = context.state.players[opponentId];
      const leaderBase =
        storedBasePower(opponent.leaderBasePowers, context.state.turn) ??
        context.db.require(opponent.leaderCardNumber).power ??
        0;
      if (leaderBase >= 6_000) return true;
      return opponent.board.some(
        (card) =>
          (storedBasePower(card.basePowerOverrides, context.state.turn) ??
            context.db.require(card.cardNumber).power ??
            0) >= 6_000,
      );
    },
  },
  // OP06-052 Tokikake: "[printed text omitted -- pnpm card:text OP06-052]"
  //
  // `[DON!! x1]` and an empty-ish hand, which is the Navy deck's own state:
  // it spends its hand on Counters and then wants the bodies that are left to
  // survive. A battle immunity rather than a removal one -- an effect's K.O.
  // still answers it.
  {
    cardNumber: "OP06-052",
    scope: "self",
    battleKoImmune: (context) =>
      !context.isLeader &&
      attachedDon(context) >= 1 &&
      context.state.players[context.playerId].hand.length <= 4,
  },
  // OP06-054 Borsalino: "[printed text omitted -- pnpm card:text OP06-054]"
  //
  // The same hand ceiling one card higher, spent on a keyword rather than on
  // an immunity: a 2-cost 4000 Blocker for a deck that has emptied its hand.
  {
    cardNumber: "OP06-054",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].hand.length <= 5,
    },
  },
  // OP06-067 Vinsmoke Yonji: "[printed text omitted -- pnpm card:text OP06-067]"
  //
  // The GERMA condition as a stat rather than as a payoff: the archetype pays
  // its DON!! back to the DON!! deck on nearly every clause, so a 4-cost
  // Blocker is a 6000 for most of the game and a 5000 on the turn it lands
  // ahead. The tie counts, which is the common board state -- see `donBehind`
  // in `mechanics/op07-shared.ts`, the condition's declarative twin.
  {
    cardNumber: "OP06-067",
    scope: "self",
    readsDon: ["own-ceiling", "opponent"],
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        fieldDon(context) <=
          fieldDonCount(context.state, opponentOf(context.playerId))
          ? 1_000
          : 0,
    },
  },
  // OP06-072 Cosette: "[printed text omitted -- pnpm card:text OP06-072]"
  //
  // Two DON!! behind rather than level, which is the narrowest gate in the
  // set: a 1-cost 0-power body that blocks only after the deck has spent two
  // `DON!! −1` costs the opponent has not.
  {
    cardNumber: "OP06-072",
    scope: "self",
    readsDon: ["own-ceiling", "opponent"],
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        leaderHasType(context, "GERMA 66") &&
        fieldDon(context) <=
          fieldDonCount(context.state, opponentOf(context.playerId)) - 2,
    },
  },
  // OP06-085 Kumacy: "[printed text omitted -- pnpm card:text OP06-085]"
  //
  // `[DON!! x2] [Your Turn]`, and the rate is per *completed* five cards --
  // twelve in the trash pays 2000, not 2400. A 2-cost body that grows with the
  // Thriller Bark deck's own self-mill, and only on the turn it attacks.
  {
    cardNumber: "OP06-085",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        attachedDon(context) >= 2 &&
        turnPlayer(context) === context.playerId
          ? Math.floor(
              context.state.players[context.playerId].trash.length / 5,
            ) * 1_000
          : 0,
    },
  },
  // OP06-088 Sai: "[printed text omitted -- pnpm card:text OP06-088]"
  //
  // An *active* Leader, which is a real condition rather than decoration: the
  // 3-cost 4000 defends at 6000 on the opponent's turn only while its own
  // Leader has not attacked, so the deck chooses between one more attack and a
  // wall.
  {
    cardNumber: "OP06-088",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        leaderHasType(context, "Dressrosa") &&
        !context.state.players[context.playerId].leaderRested
          ? 2_000
          : 0,
    },
  },
  // OP06-113 Raki: "[printed text omitted -- pnpm card:text OP06-113]"
  //
  // Gated on a *second* Shandian body rather than on the Leader, and on one
  // that is not another Raki -- so a hand of nothing but Rakis blocks with
  // none of them.
  {
    cardNumber: "OP06-113",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].board.some(
          (card) =>
            context.db.require(card.cardNumber).category === "character" &&
            hasCardType(card.cardNumber, "Shandian Warrior") &&
            !hasCardName(card.cardNumber, "Raki"),
        ),
    },
  },
];

export const op06RemovalImmunities: readonly RemovalImmunity[] = [
  // OP06-109 Denjiro: "[printed text omitted -- pnpm card:text OP06-109]"
  //
  // The one immunity in the pool that says "by effects" and names no player,
  // so it covers its controller's own effects too and is answered before the
  // opponent-only check. Battle is still outside it, which is what a 6000 body
  // with no Counter is answered by.
  {
    cardNumber: "OP06-109",
    from: "any",
    koOnly: true,
    when: (state, ownerId, card) =>
      state.players[opponentOf(ownerId)].life.length <= 3 &&
      state.players[ownerId].board.some(
        (candidate) =>
          candidate.instanceId === card.instanceId &&
          (candidate.attachedDon?.length ?? 0) >= 2,
      ),
  },
];
