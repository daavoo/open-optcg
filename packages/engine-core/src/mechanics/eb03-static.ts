/**
 * Continuous text printed on EB-03: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { storedBasePower } from "../base-power.js";
import {
  leaderHasType,
  leaderMulticolored,
  turnPlayer,
} from "./static-shared.js";
import type { StaticAbility, RemovalImmunity } from "../static-abilities.js";

export const eb03StaticAbilities: readonly StaticAbility[] = [
  // EB03-004 Carina: "[printed text omitted -- pnpm card:text EB03-004]"
  //
  // A 3-cost 2000 body that defends like a 6000 one, and the condition is the
  // deck's own restraint: the buff switches off the moment a big Character
  // lands beside it. Base power is what the gate reads, so attached DON!!
  // and a turn's buffs do not talk it out of its own clause, while a "base
  // power becomes" effect does -- OP06-009 Shuraiya copying a 7000 Leader
  // counts (EB03-004#1 Q&A). 004 itself is 2000, so it never disqualifies
  // itself.
  {
    cardNumber: "EB03-004",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => {
        if (context.isLeader) return 0;
        if (turnPlayer(context) === context.playerId) return 0;
        if (!leaderMulticolored(context)) return 0;
        const big = context.state.players[context.playerId].board.some(
          (card) =>
            (storedBasePower(card.basePowerOverrides, context.state.turn) ??
              context.db.require(card.cardNumber).power ??
              0) >= 6000,
        );
        return big ? 0 : 4000;
      },
    },
  },
  // EB03-018 Tashigi: "[printed text omitted -- pnpm card:text EB03-018]"
  //
  // The [Blocker] half is here and the immunity is in `isRemovalImmune`, which
  // is the split the engine draws for every card printing both: a keyword is a
  // layer and an immunity is a question the removal pipeline asks. Its
  // `[End of Your Turn]` refresh is in `eb03-triggers.ts`, and the three
  // together are what make this a body that blocks on every one of the
  // opponent's turns.
  {
    cardNumber: "EB03-018",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader && turnPlayer(context) !== context.playerId,
    },
  },
  // EB03-041 Kujyaku: "[printed text omitted -- pnpm card:text EB03-041]"
  //
  // A `board-aura`, not `controller-aura`: the buff is printed on a Character
  // and reaches its own teammates. Effective cost is what the ceiling reads --
  // the same reading `maxCost` uses everywhere else -- so a {SWORD} body lifted
  // above 6 by another card's cost layer drops out of the group, which is the
  // only reading consistent with how the format asks about cost.
  {
    cardNumber: "EB03-041",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) => {
        if (context.isLeader) return 0;
        if (turnPlayer(context) === context.playerId) return 0;
        const definition = context.db.require(context.card.cardNumber);
        if (!definition.types.includes("SWORD")) return 0;
        return (definition.cost ?? 0) <= 6 ? 2000 : 0;
      },
    },
  },
  // EB03-042 Koala: "[printed text omitted -- pnpm card:text EB03-042]"
  //
  // +4 cost on a 4-drop, so behind a {Revolutionary Army} Leader this is an
  // 8-cost body that "cost 4 or less" removal cannot see -- and it is what
  // makes the `[On K.O.]` in `eb03-triggers.ts` hard to trigger on purpose.
  {
    cardNumber: "EB03-042",
    scope: "self",
    cost: (context) => (leaderHasType(context, "Revolutionary Army") ? 4 : 0),
  },
  // EB03-044 Black Maria: "[printed text omitted -- pnpm card:text EB03-044]"
  //
  // Conditional rather than printed, so it belongs here: `hasStaticKeyword`
  // reads an unconditional [Blocker] straight off the card text, and this one
  // is only live behind a multicoloured Leader.
  {
    cardNumber: "EB03-044",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => !context.isLeader && leaderMulticolored(context),
    },
  },
];

export const eb03RemovalImmunities: readonly RemovalImmunity[] = [
  // EB03-018 Tashigi: "[printed text omitted -- pnpm card:text EB03-018]"
  //
  // `[Opponent's Turn]`, so the protection is off on its controller's own turn
  // -- which matters, because that is when the controller might want to K.O.
  // it themselves. The rest of the same printed sentence is a [Blocker] row
  // above.
  {
    cardNumber: "EB03-018",
    from: "opponent",
    when: (state, ownerId) => state.turnPlayerId !== ownerId,
  },
];
