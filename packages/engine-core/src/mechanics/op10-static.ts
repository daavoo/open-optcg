/**
 * Continuous text printed on OP-10: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName, hasCardType } from "@one-piece-sim/cards";
import {
  type StaticAbility,
  opponentOf,
  type RemovalImmunity,
  staticCostDeltaWhere,
} from "../static-abilities.js";
import {
  attachedDon,
  leaderHasType,
  restedCharacters,
  turnPlayer,
} from "./static-shared.js";

export const op10StaticAbilities: readonly StaticAbility[] = [
  {
    cardNumber: "OP10-005",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) === context.playerId ? 3000 : 0),
    },
  },
  {
    cardNumber: "OP10-011",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) !== context.playerId ? 2000 : 0),
    },
  },
  // OP10-086 Shiryu: "[printed text omitted -- pnpm card:text OP10-086]"
  // Its `[Activate: Main]` K.O. is in `op10-main.ts`.
  {
    cardNumber: "OP10-086",
    scope: "self",
    power: {
      kind: "add",
      value: (context) => (turnPlayer(context) !== context.playerId ? 2000 : 0),
    },
  },
  // OP10-108 Scratchmen Apoo: "[printed text omitted -- pnpm card:text OP10-108]"
  //
  // By name, so a second Apoo does not switch the first on; and by printed
  // colour, so a multicolour card with yellow in it counts.
  {
    cardNumber: "OP10-108",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        context.state.players[context.playerId].board.some(
          (card) =>
            card.instanceId !== context.card.instanceId &&
            !hasCardName(card.cardNumber, "Scratchmen Apoo") &&
            hasCardType(card.cardNumber, "Supernovas") &&
            (context.db.require(card.cardNumber).colors ?? []).includes(
              "Yellow",
            ),
        ),
    },
  },
  // OP10-053 Bian: "[printed text omitted -- pnpm card:text OP10-053]"
  //
  // By name, the way OP10-108 reads its partner: a second Bian is not "other
  // than [Bian]", so two copies do not switch each other on.
  {
    cardNumber: "OP10-053",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].board.some(
          (card) =>
            card.instanceId !== context.card.instanceId &&
            !hasCardName(card.cardNumber, "Bian") &&
            hasCardType(card.cardNumber, "The Tontattas"),
        ),
    },
  },
  // OP10-085 Jesus Burgess: "[printed text omitted -- pnpm card:text OP10-085]"
  //
  // Black's self-mill is what fills the trash this reads, so on the turn the
  // package has milled enough a 5-cost 6000 swings the turn it lands.
  {
    cardNumber: "OP10-085",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) =>
        !context.isLeader &&
        attachedDon(context) >= 1 &&
        context.state.players[context.playerId].trash.length >= 8,
    },
  },
  // OP10-104 Caribou: "[printed text omitted -- pnpm card:text OP10-104]"
  //
  // A battle immunity, not a removal one: an effect's K.O. still answers it.
  // The DON!! given on its controller's turn stays on it through the
  // opponent's, which is when the clause is asked.
  {
    cardNumber: "OP10-104",
    scope: "self",
    battleKoImmune: (context) =>
      !context.isLeader &&
      attachedDon(context) >= 1 &&
      leaderHasType(context, "Supernovas") &&
      context.state.players[opponentOf(context.playerId)].life.length >= 3,
  },
  // OP10-001 Smoker (Leader): "[printed text omitted -- pnpm card:text OP10-001]"
  //
  // A defensive aura on the Leader, which is what makes the deck's small bodies
  // survive a turn they cannot answer -- and what its own `[Activate: Main]`
  // reads back when it asks for a Character at 7000 power.
  {
    cardNumber: "OP10-001",
    scope: "controller-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) !== context.playerId &&
        (hasCardType(context.card.cardNumber, "Navy") ||
          hasCardType(context.card.cardNumber, "Punk Hazard"))
          ? 1000
          : 0,
    },
  },
  // OP10-038 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP10-038]"
  //
  // The Green ODYSSEY package rests its own board on purpose, so on the
  // opponent's turn this is a 6000 body defending at 8000 -- the payoff for the
  // rests its teammates' [On Play]s were gated on.
  {
    cardNumber: "OP10-038",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        restedCharacters(context) >= 2
          ? 2000
          : 0,
    },
  },
  // OP10-042 Usopp (Leader): "[printed text omitted -- pnpm card:text OP10-042]"
  //
  // Cost, not power, and it is protection: +1 cost lifts a body out of the reach
  // of "cost N or less" removal.
  //
  // The "2 or more" gate is read twice, the way Bandai's OP10-042#4-6 rulings
  // walk it. A permanent effect is processed before an effect a triggered or
  // activated ability left behind, and the turn player's permanent effects
  // before the other player's: so the gate first sees the printed cost plus
  // the opponent's continuous cost auras (only ever live on their own turn),
  // and a 1-drop never climbs into its own condition. Then the turn's cost
  // changes land on top, and a card they leave at 1 or less, this +1 included,
  // loses the +1 -- −3 on a raised 4 reaches 0, not 1, while −2 stops at 2.
  //
  // "Characters" are cards on the field, and an aura's cost layer is read in
  // every zone its predicate allows -- so the predicate asks for the board.
  // Without it a 7-cost Kyros in hand reads 8, and OP10-058 Rebecca's "cost
  // of 7 or less" reveal from hand cannot name the card the deck plays her
  // for.
  {
    cardNumber: "OP10-042",
    scope: "controller-aura",
    cost: (context) => {
      if (context.isLeader) return 0;
      const onBoard = context.state.players[context.playerId].board.find(
        (card) => card.instanceId === context.card.instanceId,
      );
      if (!onBoard || !hasCardType(context.card.cardNumber, "Dressrosa")) {
        return 0;
      }
      const printed = context.db.require(context.card.cardNumber).cost ?? 0;
      const others = (include: (ability: StaticAbility) => boolean) =>
        staticCostDeltaWhere(
          context.state,
          context.playerId,
          context.card,
          context.db,
          (ability) => ability.cardNumber !== "OP10-042" && include(ability),
        );
      const first = others(
        (ability) =>
          ability.scope === "opponent-aura" ||
          ability.scope === "opponent-board-aura",
      );
      if (printed + first < 2) return 0;
      const temporary = (onBoard.costModifiers ?? [])
        .filter((modifier) => modifier.expiresAtTurn >= context.state.turn)
        .reduce((total, modifier) => total + modifier.amount, 0);
      return printed + others(() => true) + temporary + 1 >= 2 ? 1 : 0;
    },
  },
  // OP10-113 Roronoa Zoro: "[printed text omitted -- pnpm card:text OP10-113]"
  //
  // Yellow's behind-only aggression, read live off both Life piles: a 3-cost
  // 5000 body that attacks the turn it lands, but only while losing the race.
  {
    cardNumber: "OP10-113",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) =>
        context.state.players[context.playerId].life.length <
        context.state.players[opponentOf(context.playerId)].life.length,
    },
  },
  // OP10-094 Ryuma: "[printed text omitted -- pnpm card:text OP10-094]"
  //
  // Found by the census in `test/double-attack.test.ts`: the printed-keyword
  // table in `packages/cards` skips "gains [Double Attack]" as a grant, exactly
  // as it should, and nothing here picked the grant up -- so a card in the
  // registry dealt one damage while its text said two. The same shape as
  // ST31-001 and ST21-015 one keyword over.
  {
    cardNumber: "OP10-094",
    scope: "self",
    keyword: {
      keyword: "Double Attack",
      when: (context) => attachedDon(context) >= 1,
    },
  },
];

export const op10RemovalImmunities: readonly RemovalImmunity[] = [
  // OP10-082 Kuzan: "[printed text omitted -- pnpm card:text OP10-082]"
  // Unconditional, and every kind of removal, not only a K.O.
  { cardNumber: "OP10-082", from: "opponent" },
];
