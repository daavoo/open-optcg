/**
 * Continuous text printed on ST-14: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardType, cards } from "@one-piece-sim/cards";
import {
  attachedDon,
  ownCharacterWithCost,
  turnPlayer,
} from "./static-shared.js";
import {
  type StaticAbility,
  costOf,
  type RemovalImmunity,
} from "../static-abilities.js";

export const st14StaticAbilities: readonly StaticAbility[] = [
  // ST14-001 Monkey.D.Luffy (Leader): with a DON!! on it, every Character its
  // controller has costs 1 more, and an 8-cost body among them is worth +1000
  // on the Leader.
  //
  // Two rows, because the two halves have different subjects: the cost buff
  // reaches the whole board and the power is the Leader's own. Both sit behind
  // the printed `[DON!! x1]`, which heads the block and so gates the block --
  // and the pairing is the product in one card, because raising a board's cost
  // is what every other payoff here reads.
  {
    cardNumber: "ST14-001",
    scope: "controller-aura",
    cost: (context) =>
      !context.isLeader &&
      context.state.players[context.playerId].leaderAttachedDon.length >= 1
        ? 1
        : 0,
  },
  {
    cardNumber: "ST14-001",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader &&
        attachedDon(context) >= 1 &&
        ownCharacterWithCost(context, 8)
          ? 1000
          : 0,
    },
  },
  // ST14-009 Franky: with a DON!! on it, on the opponent's turn, behind a
  // 6-cost body, it defends 2000 bigger.
  //
  // The other half of the same sentence -- it stops answering to the
  // opponent's K.O. effects -- is an entry in `CONDITIONAL_REMOVAL_IMMUNE`,
  // because only a power layer fits here. `[Opponent's Turn]` makes the whole
  // clause defensive: this is a 5-cost body that attacks as a 6000 and blocks
  // as an 8000 nothing can remove.
  {
    cardNumber: "ST14-009",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        attachedDon(context) >= 1 &&
        turnPlayer(context) !== context.playerId &&
        ownCharacterWithCost(context, 6)
          ? 2000
          : 0,
    },
  },
  // ST14-012 Monkey.D.Luffy: a 10-cost body on the board gives this one
  // [Rush].
  //
  // Its own effective cost counts, and at a printed 8 it needs two of the
  // product's cost buffs to get there by itself -- which is the line the deck
  // is built to reach.
  {
    cardNumber: "ST14-012",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => !context.isLeader && ownCharacterWithCost(context, 10),
    },
  },
  // ST14-017 Thousand Sunny (Stage): every black {Straw Hat Crew} Character
  // its controller has costs 1 more.
  //
  // `stage-aura`, the scope that is live while this exact card is its
  // controller's Stage. Unconditional, and it stacks with the Leader's own +1:
  // two rows of +1 are what put a printed 6-cost body over the 8-cost line the
  // product's payoffs read. Its `[On Play]` half is in
  // `mechanics/st14-on-play.ts`.
  {
    cardNumber: "ST14-017",
    scope: "stage-aura",
    cost: (context) =>
      !context.isLeader &&
      context.db.require(context.card.cardNumber).colors?.includes("Black") ===
        true &&
      hasCardType(context.card.cardNumber, "Straw Hat Crew")
        ? 1
        : 0,
  },
];

export const st14RemovalImmunities: readonly RemovalImmunity[] = [
  // ST14-009 Franky: a DON!! on it, an opponent's turn and a 6-cost body on the
  // board, and it stops answering to their K.O. effects.
  //
  // The +2000 half of the same sentence is a power row above. `koOnly`,
  // because the printed word is K.O. -- the deck's own Leader is what makes
  // the 6-cost gate easy, and a bounce is still the answer to this body.
  {
    cardNumber: "ST14-009",
    from: "opponent",
    koOnly: true,
    when: (state, ownerId, card) =>
      state.turnPlayerId !== ownerId &&
      state.players[ownerId].board.some(
        (candidate) =>
          candidate.instanceId === card.instanceId &&
          (candidate.attachedDon?.length ?? 0) >= 1,
      ) &&
      state.players[ownerId].board.some(
        (candidate) => costOf(state, ownerId, candidate, cards) >= 6,
      ),
  },
];
