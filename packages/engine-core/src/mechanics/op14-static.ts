/**
 * Continuous text printed on OP-14: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { cardAttributes, hasCardTypeIncluding } from "@one-piece-sim/cards";
import { storedBasePower } from "../base-power.js";
import type { BoardCard } from "../model.js";
import {
  type StaticAbility,
  boardCardPower,
  opponentOf,
} from "../static-abilities.js";
import {
  always,
  anyCharacterAtZeroCost,
  anyCharacterWithCost,
  attachedDon,
  fullBaroqueTrash,
  handTrashedThisTurn,
  turnPlayer,
} from "./static-shared.js";

export const op14StaticAbilities: readonly StaticAbility[] = [
  // OP14-004 Cavendish: "[printed text omitted -- pnpm card:text OP14-004]" A 2-cost 2000 body that becomes a threat the
  // moment three DON!! land on it, which is the Red/Supernovas plan in one
  // card. Reading its own current power from a *keyword* predicate is safe:
  // power layers never ask about keywords, so the two cannot recurse.
  {
    cardNumber: "OP14-004",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) =>
        !context.isLeader &&
        boardCardPower(
          context.state,
          context.playerId,
          context.card as BoardCard,
          true,
          context.db,
        ) >= 5000,
    },
  },
  // OP14-011 Bartolomeo: "[printed text omitted -- pnpm card:text OP14-011]"
  {
    cardNumber: "OP14-011",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => attachedDon(context) >= 2,
    },
  },
  // OP14-020 Dracule Mihawk (Leader): "[printed text omitted -- pnpm card:text OP14-020]" A printed fact about the
  // other Leader, so it is read straight off the card database rather than off
  // any board state -- and through `cardAttributes`, because a Leader can print
  // two attribute icons in one slash-joined field.
  {
    cardNumber: "OP14-020",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader &&
        cardAttributes(
          context.db.require(
            context.state.players[opponentOf(context.playerId)]
              .leaderCardNumber,
          ),
        ).includes("Slash")
          ? 1000
          : 0,
    },
  },
  // OP14-026 Kouzuki Oden: "[printed text omitted -- pnpm card:text OP14-026]" Green's bargain: the Characters it rests for
  // DON!! defend better than the ones it leaves standing.
  {
    cardNumber: "OP14-026",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        "rested" in context.card &&
        context.card.rested
          ? 2000
          : 0,
    },
  },
  // OP14-027 Shanks: "[printed text omitted -- pnpm card:text OP14-027]"
  //
  // The layer is read for the *opponent's* Characters, so it is an
  // `opponent-board-aura` -- the scope filter finds a Shanks across the table
  // and this predicate asks whether that copy is rested and whose turn it is.
  // "[Opponent's Turn]" is relative to Shanks' controller, which from here is
  // the player being asked about: their own turn.
  {
    cardNumber: "OP14-027",
    scope: "opponent-board-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) === context.playerId &&
        context.state.players[opponentOf(context.playerId)].board.some(
          (card) => card.cardNumber === "OP14-027" && card.rested,
        )
          ? -1000
          : 0,
    },
  },
  // OP14-034 Monkey.D.Luffy: "[printed text omitted -- pnpm card:text OP14-034]"
  //
  // Base cost, so the aura reads printed cost and nothing this deck does to its
  // own costs moves a Character into or out of it. Luffy itself is a 3-cost
  // body and so is not a member of its own group. Its `[Once Per Turn]`
  // replacement is registered in `op14-replacements.ts`.
  {
    cardNumber: "OP14-034",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) => {
        if (context.isLeader) return 0;
        if (turnPlayer(context) !== context.playerId) return 0;
        const definition = context.db.require(context.card.cardNumber);
        return definition.colors?.includes("Green") &&
          definition.types.includes("Straw Hat Crew") &&
          (definition.cost ?? 0) >= 4
          ? 1000
          : 0;
      },
    },
  },
  // OP14-045 Kuroobi and OP14-049 Jinbe: "[printed text omitted -- pnpm card:text OP14-049]"
  //
  // Not a reaction with a window of its own: the clause reads "during this
  // turn", so once a hand trash has happened the keyword is simply on for the
  // rest of the turn -- which is what `handTrashedByEffectOnTurn` records. Blue
  // pays for most of what it does with hand trashes, so a Jinbe played after
  // its own [On Play] discard attacks the turn it lands.
  {
    cardNumber: "OP14-045",
    scope: "self",
    keyword: { keyword: "Rush", when: handTrashedThisTurn },
  },
  {
    cardNumber: "OP14-049",
    scope: "self",
    keyword: { keyword: "Rush", when: handTrashedThisTurn },
  },
  // OP14-053 Vista: "[printed text omitted -- pnpm card:text OP14-053]"
  //
  // A `set-base`, so it replaces printed power before anything else -- which is
  // what "becomes" means, and what lets a 3-cost Blocker defend as a 5000. The
  // Leader's *base* power, so DON!! given to the Leader does not travel.
  {
    cardNumber: "OP14-053",
    scope: "self",
    power: {
      kind: "set-base",
      value: (context) => {
        if (context.isLeader) return undefined;
        if (turnPlayer(context) === context.playerId) return undefined;
        const player = context.state.players[context.playerId];
        if (player.hand.length > 7) return undefined;
        return (
          storedBasePower(player.leaderBasePowers, context.state.turn) ??
          context.db.require(player.leaderCardNumber).power ??
          0
        );
      },
    },
  },
  // OP14-086 Miss Doublefinger(Zala): "[printed text omitted -- pnpm card:text OP14-086]"Baroque Works" gain +2 cost."
  //
  // Two layers on one card and two rows here, because the power half is about
  // this Character and the cost half reaches the whole group -- including
  // Doublefinger itself, which is a Baroque Works body. The cost buff lifts the
  // board out of "cost N or less" removal, which is what Black is buying with a
  // full trash.
  //
  // "Your Characters" are the ones on the field. A Baroque Works card in hand
  // or in the trash keeps its printed cost, which is what leaves OP14-090 Mr.1
  // inside OP14-091 Mr.2's "cost of 5 or less" and a 4-cost inside OP14-084
  // Ms. All Sunday's "cost of 4 or less" while Doublefinger is out.
  {
    cardNumber: "OP14-086",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (fullBaroqueTrash(context) ? 1000 : 0),
    },
  },
  {
    cardNumber: "OP14-086",
    scope: "board-aura",
    cost: (context) =>
      !context.isLeader &&
      context.state.players[context.playerId].board.some(
        (card) => card.instanceId === context.card.instanceId,
      ) &&
      fullBaroqueTrash(context) &&
      hasCardTypeIncluding(context.card.cardNumber, "Baroque Works")
        ? 2
        : 0,
  },
  // OP14-090 Mr.1(Daz.Bonez): "[printed text omitted -- pnpm card:text OP14-090]"
  //
  // That sentence is [Rush: Character] spelled out. Either field counts, and
  // both halves are things this deck makes true on purpose -- see
  // `costZeroOrEightPlusBody` in `mechanics/op14-shared.ts`, the program-side
  // twin of this predicate.
  {
    cardNumber: "OP14-090",
    scope: "self",
    keyword: {
      keyword: "Rush: Character",
      when: (context) =>
        anyCharacterWithCost(context, 8) || anyCharacterAtZeroCost(context),
    },
  },
  // Rush.
  {
    cardNumber: "OP14-015",
    scope: "self",
    keyword: { keyword: "Rush", when: always },
  },
];
