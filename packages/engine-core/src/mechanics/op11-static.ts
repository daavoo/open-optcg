/**
 * Continuous text printed on OP-11: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import {
  cardAttributes,
  cards,
  hasCardName,
  hasCardType,
  hasCardTypeIncluding,
  type CardDatabase,
} from "@one-piece-sim/cards";
import type { PlayerId } from "@one-piece-sim/protocol";
import type { BoardCard, GameState } from "../model.js";
import { leaderHasType, restedCardCount, turnPlayer } from "./static-shared.js";
import type {
  AbilityContext,
  RemovalImmunity,
  StaticAbility,
} from "../static-abilities.js";

/**
 * OP11-046 Vinsmoke Yonji's condition: "only" Characters with a type including
 * GERMA. A universal over the board, so one off-type body switches it off;
 * Yonji is itself GERMA, so the board is never empty while it is asked.
 */
const onlyGermaCharacters = (
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): boolean =>
  state.players[playerId].board
    .filter((card) => db.require(card.cardNumber).category === "character")
    .every((card) => hasCardTypeIncluding(card.cardNumber, "GERMA"));

const handSize = (context: AbilityContext): number =>
  context.state.players[context.playerId].hand.length;

export const op11StaticAbilities: readonly StaticAbility[] = [
  // OP11-023 Arlong: −3 cost in hand behind a {Fish-Man} Leader, at 3 or
  // fewer Life, with the opponent showing 5 or more rested cards -- every one
  // a board state the Green Fish-Man deck reaches on purpose.
  //
  // A cost layer rather than a hand price, so both the price paid to play it
  // and a "cost N or less" clause reading the hand see it: OP11-035 Fisher
  // Tiger plays it as a cost-4 Character (Bandai's OP11-023#1).
  // `costZone: "hand"`, so the body on the field is priced at its printed 7.
  {
    cardNumber: "OP11-023",
    scope: "self",
    costZone: "hand",
    cost: (context) =>
      leaderHasType(context, "Fish-Man") &&
      context.state.players[context.playerId].life.length <= 3 &&
      restedCardCount({
        ...context,
        playerId: context.playerId === "p1" ? "p2" : "p1",
      }) >= 5
        ? -3
        : 0,
  },
  // OP11-001 Koby (Leader): "[printed text omitted -- pnpm card:text OP11-001]"
  //
  // That sentence is [Rush: Character], granted by the Leader to a whole type
  // rather than printed on each body -- which is what makes the Navy/SWORD deck
  // able to develop and remove in the same turn.
  {
    cardNumber: "OP11-001",
    scope: "controller-aura",
    keyword: {
      keyword: "Rush: Character",
      when: (context) =>
        !context.isLeader && hasCardType(context.card.cardNumber, "SWORD"),
    },
  },
  // OP11-096 Ripper: "[printed text omitted -- pnpm card:text OP11-096]"
  //
  // A 1-cost body that is a [Blocker] only beside another black {Navy}
  // Character, so the Koby deck's spare 1-drop walls once the board has a
  // second {Navy} body. Matched by name rather than instance, so a second
  // Ripper does not switch the first one on.
  {
    cardNumber: "OP11-096",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        !context.isLeader &&
        context.state.players[context.playerId].board.some((card) => {
          if (hasCardName(card.cardNumber, "Ripper")) return false;
          const record = context.db.require(card.cardNumber);
          return (
            record.category === "character" &&
            (record.colors ?? []).includes("Black") &&
            hasCardType(card.cardNumber, "Navy")
          );
        }),
    },
  },
  // OP11-073 Charlotte Linlin: "[printed text omitted -- pnpm card:text OP11-073]" A 10-cost 12000 body that attacks the turn it
  // lands, behind the one Leader that plays it.
  {
    cardNumber: "OP11-073",
    scope: "self",
    keyword: {
      keyword: "Rush",
      when: (context) => leaderHasType(context, "Big Mom Pirates"),
    },
  },
  // OP11-112 Megalo: "[printed text omitted -- pnpm card:text OP11-112]"
  //
  // A 3-cost 2000 Blocker that defends at 6000 behind its own Leader, which is
  // the whole shape of the Yellow Fish-Man Island shell: cheap bodies that only
  // matter on the turn they are attacked.
  {
    cardNumber: "OP11-112",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        hasCardName(
          context.state.players[context.playerId].leaderCardNumber,
          "Shirahoshi",
        )
          ? 4000
          : 0,
    },
  },
  // OP11-027 Bulge-Eyed Neptunian (`pnpm card:text OP11-027`): attacking
  // Characters the turn it is played is [Rush: Character], behind the
  // Shirahoshi Leader only.
  {
    cardNumber: "OP11-027",
    scope: "self",
    keyword: {
      keyword: "Rush: Character",
      when: (context) =>
        hasCardName(
          context.state.players[context.playerId].leaderCardNumber,
          "Shirahoshi",
        ),
    },
  },
  // OP11-046 Vinsmoke Yonji (`pnpm card:text OP11-046`): the rest half of its
  // immunity. The K.O. half is a row in `op11RemovalImmunities`.
  {
    cardNumber: "OP11-046",
    scope: "self",
    restImmune: (context) =>
      onlyGermaCharacters(context.state, context.playerId, context.db),
  },
  // OP11-057 Pedro (`pnpm card:text OP11-057`): a [Blocker] while the hand is
  // at 4 or less.
  {
    cardNumber: "OP11-057",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => !context.isLeader && handSize(context) <= 4,
    },
  },
  // OP11-058 Monkey.D.Luffy (`pnpm card:text OP11-058`): barred from attacking
  // while the hand is at 5 or more. Conditional, so it is this row rather than
  // the derived `rules.cannotAttack` ban.
  {
    cardNumber: "OP11-058",
    scope: "self",
    attackBlocked: (context) => handSize(context) >= 5,
  },
  // OP11-065 Charlotte Anana: [Blocker] with another purple Big Mom Character.
  {
    cardNumber: "OP11-065",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) =>
        context.state.players[context.playerId].board.some((candidate) => {
          if (candidate.instanceId === context.card.instanceId) return false;
          const definition = context.db.require(candidate.cardNumber);
          return (
            definition.colors?.includes("Purple") === true &&
            definition.types.includes("Big Mom Pirates")
          );
        }),
    },
  },
];

export const op11RemovalImmunities: readonly RemovalImmunity[] = [
  // OP11-005 Smoker (`pnpm card:text OP11-005`): with a DON!! given, no
  // Character without <Special> can K.O. it by an effect -- its controller's
  // own Characters included, so `from: "any"`. A Leader, an Event or a
  // <Special> Character still can.
  {
    cardNumber: "OP11-005",
    from: "any",
    koOnly: true,
    bySource: (source) =>
      source.category === "character" &&
      !cardAttributes(source).includes("Special"),
    when: (_state, _ownerId, card) =>
      ((card as BoardCard).attachedDon?.length ?? 0) >= 1,
  },
  // OP11-046 Vinsmoke Yonji: the K.O. half of its immunity.
  {
    cardNumber: "OP11-046",
    from: "opponent",
    koOnly: true,
    when: (state, ownerId) => onlyGermaCharacters(state, ownerId, cards),
  },
];
