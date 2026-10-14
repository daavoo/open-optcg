/**
 * Continuous text printed on OP-16: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardType, hasCardTypeIncluding } from "@one-piece-sim/cards";
import { type StaticAbility, costOf } from "../static-abilities.js";
import {
  attachedDon,
  opposingLeaderPower,
  turnPlayer,
} from "./static-shared.js";

export const op16StaticAbilities: readonly StaticAbility[] = [
  // OP16-003 Edward.Newgate: "[printed text omitted -- pnpm card:text OP16-003]"
  //
  // A `board-aura` that only ever reaches the Leader, which is what the
  // `isLeader` guard says -- and only on its controller's own turn, because the
  // clause is what closes a game rather than what defends one.
  {
    cardNumber: "OP16-003",
    scope: "board-aura",
    keyword: {
      keyword: "Double Attack",
      when: (context) =>
        context.isLeader && turnPlayer(context) === context.playerId,
    },
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader && turnPlayer(context) === context.playerId ? 2000 : 0,
    },
  },
  // Impel Down conditional power.
  // OP16-054 Mr.1: "[printed text omitted -- pnpm card:text OP16-054]" [Your Turn] is read from the card's
  // controller, so a blocking Mr.1 is a plain 2000 on the attacker's turn.
  {
    cardNumber: "OP16-054",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 1 &&
        turnPlayer(context) === context.playerId &&
        context.state.players[context.playerId].hand.length >= 5
          ? 3000
          : 0,
    },
  },
  {
    cardNumber: "OP16-027",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (attachedDon(context) >= 1 ? 2000 : 0),
    },
  },
  // OP16-034 Monkey.D.Luffy: "[DON!! x1] [Your Turn] This Character gains +1000
  // power for every Character card you have with a different card name." Same
  // controller-relative [Your Turn] gate as OP16-054 above.
  {
    cardNumber: "OP16-034",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 1 && turnPlayer(context) === context.playerId
          ? new Set(
              context.state.players[context.playerId].board.map(
                (candidate) => context.db.require(candidate.cardNumber).name,
              ),
            ).size * 1000
          : 0,
    },
  },
  // OP16-082 Kin'emon: "This Character gains +3 cost." A 4-cost body that sits
  // at 7 for anything reading cost, which is what keeps it out of the range of
  // the removal a 6000-power Character would otherwise invite.
  //
  // "This Character" is the card on the field. In the trash it is a 4-cost
  // Character card, which is what puts it inside the "cost of 6 or less" that
  // OP16-085, OP16-097 and OP16-099 play or recover from there.
  {
    cardNumber: "OP16-082",
    scope: "self",
    cost: (context) =>
      context.state.players[context.playerId].board.some(
        (card) => card.instanceId === context.card.instanceId,
      )
        ? 3
        : 0,
  },
  // OP16-079 Yamato (Leader): the Black Land of Wano deck's whole tempo. Its
  // trash engine (OP16-085, OP16-096, OP16-098, OP16-099) plays bodies back
  // out of the trash, and this is what lets each of them attack on arrival.
  {
    cardNumber: "OP16-079",
    scope: "self",
    trashPlayRush: (context, cardNumber) =>
      context.db.require(cardNumber).category === "character" &&
      hasCardType(cardNumber, "Land of Wano"),
  },
  // OP16-113 Boa Marigold: "[printed text omitted -- pnpm card:text OP16-113]" Yellow's behind-only defence, read live off Life.
  {
    cardNumber: "OP16-113",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        context.state.players[context.playerId].life.length <= 2,
    },
  },
  // OP16-080 Marshall.D.Teach (Leader): "[printed text omitted -- pnpm card:text OP16-080]"
  //
  // A `controller-aura` on cost rather than power: raising every Character by 1
  // on the opponent's turn is what puts them out of reach of "cost N or less"
  // removal, which is the only window that removal is used in.
  {
    cardNumber: "OP16-080",
    scope: "controller-aura",
    cost: (context) =>
      !context.isLeader &&
      context.db.require(context.card.cardNumber).category === "character" &&
      turnPlayer(context) !== context.playerId
        ? 1
        : 0,
  },
  // OP16-017 LittleOars Jr.: "[printed text omitted -- pnpm card:text OP16-017]"Whitebeard Pirates"[printed text omitted -- pnpm card:text OP16-017]"
  //
  // A penalty rather than a buff, and the only card in the Red Ace list whose
  // printed 8000 is conditional -- which matters more than the 4000 does,
  // because 8000 is the floor the Leader's [Rush] grant and every "[printed text omitted -- pnpm card:text OP16-017]" cost read. Without an 8-cost Whitebeard
  // Pirate out, this is a 4000-power body that qualifies for none of them.
  //
  // `excludeSelf` in spirit but not in code: LittleOars Jr. costs 4, so it can
  // never satisfy its own condition, and spelling out an exclusion that the
  // cost check already makes true would be noise. `effectiveCost` rather than
  // printed cost, because the question is what the Character on the board costs
  // now -- an OP17-005 Newgate played for 6 still reads 10 there, since the
  // discount is a hand price and never a board one.
  //
  // Its printed [Blocker] is derived from the text by `KEYWORD_MARKERS`, so it
  // needs no row of its own.
  {
    cardNumber: "OP16-017",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.state.players[context.playerId].board.some(
          (card) =>
            hasCardTypeIncluding(card.cardNumber, "Whitebeard Pirates") &&
            costOf(context.state, context.playerId, card, context.db) >= 8,
        )
          ? 0
          : -4000,
    },
  },
  // OP16-036 Mr.2.Bon.Kurei(Bentham): "[printed text omitted -- pnpm card:text OP16-036]"
  //
  // The OP16-055 clause one set later, without the `[DON!! x1]` gate: a
  // 1000-power body that hits for whatever it is pointed at. A static layer
  // rather than a mechanic program for the same reason 055 is -- "becomes" is
  // read continuously while the attack is open, and a turn-scoped modifier
  // applied at declaration would still be there when the Character defends.
  //
  // What it copies is the Leader's *power*, not its printed power: only the
  // left-hand side of the clause says "base power". `opposingLeaderPower`
  // folds that Leader's static layers and modifiers, so a Leader defending
  // above its printed number is copied at the number it is defending with.
  {
    cardNumber: "OP16-036",
    scope: "self",
    implementsClause: "[When Attacking]",
    power: {
      kind: "add",
      value: (context) =>
        context.state.activeAttack?.attackerInstanceId ===
        context.card.instanceId
          ? opposingLeaderPower(context) -
            (context.db.require(context.card.cardNumber).power ?? 0)
          : 0,
    },
  },
  // OP16-055 Bon Kurei: while attacking, becomes the opponent Leader's power.
  {
    cardNumber: "OP16-055",
    scope: "self",
    implementsClause: "[When Attacking]",
    power: {
      kind: "add",
      value: (context) =>
        attachedDon(context) >= 1 &&
        context.state.activeAttack?.attackerInstanceId ===
          context.card.instanceId
          ? opposingLeaderPower(context) -
            (context.db.require(context.card.cardNumber).power ?? 0)
          : 0,
    },
  },
];
