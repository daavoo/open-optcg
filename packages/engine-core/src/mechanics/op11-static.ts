/**
 * Continuous text printed on OP-11: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName, hasCardType } from "@one-piece-sim/cards";
import { leaderHasType, turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const op11StaticAbilities: readonly StaticAbility[] = [
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
