/**
 * Continuous text printed on OP-08: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName } from "@one-piece-sim/cards";
import {
  type StaticAbility,
  opponentOf,
  type RemovalImmunity,
} from "../static-abilities.js";
import {
  attachedDon,
  hawkArmed,
  trashHasName,
  turnPlayer,
} from "./static-shared.js";

export const op08StaticAbilities: readonly StaticAbility[] = [
  // OP08-006 Chessmarimo: "[printed text omitted -- pnpm card:text OP08-006]"
  //
  // The pair it is made of has to be in the *trash*, which is where the two
  // 3- and 4-cost bodies that print each other's names end up: the deck plays
  // them, trades them off and then lands this as the payoff.
  {
    cardNumber: "OP08-006",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) === context.playerId &&
        trashHasName(context, "Kuromarimo") &&
        trashHasName(context, "Chess")
          ? 2_000
          : 0,
    },
  },
  // OP08-013 Robson: "[printed text omitted -- pnpm card:text OP08-013]"
  //
  // A keyword the card buys with DON!! rather than one it is printed with, so
  // it is a layer here rather than something `hasStaticKeyword` reads off the
  // text -- two DON!! on a 3-cost 4000 is what makes it a turn-three attacker.
  {
    cardNumber: "OP08-013",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => !context.isLeader && attachedDon(context) >= 2,
    },
  },
  // OP08-020 Drum Kingdom: "[printed text omitted -- pnpm card:text OP08-020]"
  //
  // A Stage, so the aura is `stage-aura`: a Stage sits in its own area and a
  // board scan never sees it. `[Opponent's Turn]` makes it a defensive layer
  // only -- the bodies block a size up and attack at their printed number.
  {
    cardNumber: "OP08-020",
    scope: "stage-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) !== context.playerId &&
        context.db
          .require(context.card.cardNumber)
          .types.includes("Drum Kingdom")
          ? 1_000
          : 0,
    },
  },
  // OP08-083 Sheepshead: "[printed text omitted -- pnpm card:text OP08-083]"
  //
  // Read for the *opponent's* Characters, so it is an `opponent-board-aura`:
  // the scope filter finds a Sheepshead across the table and this predicate
  // asks whether that copy has the DON!! and whose turn it is. `[Your Turn]` is
  // relative to Sheepshead's controller, which from here is the opponent of the
  // player being asked about.
  //
  // The whole Black package is built on this: a board at -1 cost is a board the
  // set's "cost 0" removal can finally see.
  {
    cardNumber: "OP08-083",
    scope: "opponent-board-aura",
    cost: (context) =>
      !context.isLeader &&
      turnPlayer(context) !== context.playerId &&
      context.state.players[opponentOf(context.playerId)].board.some(
        (card) =>
          card.cardNumber === "OP08-083" &&
          (card.attachedDon?.length ?? 0) >= 1,
      )
        ? -1
        : 0,
  },
  // OP08-084 Jack: "[printed text omitted -- pnpm card:text OP08-084]"
  //
  // Unconditional, which is unusual for a cost layer and is the point: an
  // 11-cost body is outside every "cost N or less" answer in the format, so the
  // only way to move it is a lost fight.
  {
    cardNumber: "OP08-084",
    scope: "self",
    cost: (context) => (context.isLeader ? 0 : 4),
  },
  // OP08-093 X.Drake: "[printed text omitted -- pnpm card:text OP08-093]"
  //
  // The same protection one DON!! at a time, on a 4-drop that would otherwise
  // sit exactly inside the set's own removal.
  {
    cardNumber: "OP08-093",
    scope: "self",
    cost: (context) => (!context.isLeader && attachedDon(context) >= 1 ? 2 : 0),
  },
  // OP08-114 S-Hawk: "[printed text omitted -- pnpm card:text OP08-114]"
  //
  // Two layers on one card and two rows here, because the two halves answer
  // different questions: `battleKoImmune` is about losing a fight to a <Slash>
  // card, and the power layer is about the number. Both are behind the same
  // printed gate -- a DON!! on the card and fewer Life cards than the opponent,
  // which is the Seraphim's "only from behind" clause again.
  {
    cardNumber: "OP08-114",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (hawkArmed(context) ? 2_000 : 0),
    },
  },
  {
    cardNumber: "OP08-114",
    scope: "self",
    battleKoImmune: (context, attacker) =>
      hawkArmed(context) && attacker.attributes.includes("Slash"),
  },
];

export const op08RemovalImmunities: readonly RemovalImmunity[] = [
  // OP08-029 Pekoms: "[printed text omitted -- pnpm card:text OP08-029]"
  //
  // A 4-cost 6000 that makes the whole cheap half of the Minks board
  // unanswerable by effects while it stands up -- and the deck rests its own
  // Characters for value all the time, so keeping this one active is a real
  // cost. "Other than [Pekoms]" is printed, so a second copy protects neither
  // itself nor the first. `when` is asked of the granting copy, so only an
  // active one grants anything.
  {
    cardNumber: "OP08-029",
    from: "opponent",
    protects: (definition) =>
      definition.category === "character" &&
      definition.types.includes("Minks") &&
      (definition.cost ?? 0) <= 3 &&
      !hasCardName(definition.cardNumber, "Pekoms"),
    when: (_state, _ownerId, source) => !("rested" in source && source.rested),
  },
];
