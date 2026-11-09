/**
 * Continuous text printed on OP-18's Green cards: the rows
 * `static-abilities.ts` folds into power, Counter and keyword queries.
 *
 * Comments paraphrase the clause rather than quoting it -- printed text is a
 * runtime asset (`pnpm card:text OP18-0xx` prints it from the local cache).
 */
import { hasCardName } from "@one-piece-sim/cards";
import { type StaticAbility } from "../static-abilities.js";
import { turnPlayer } from "./static-shared.js";

export const op18GreenStaticAbilities: readonly StaticAbility[] = [
  // OP18-021 Franky, the Leader: every Stage in its controller's hand counts
  // as a +3000 Counter card. A Stage prints no Counter at all, so this is the
  // only way one reaches the Counter step; the Leader's own activation is what
  // plays them back out.
  {
    cardNumber: "OP18-021",
    scope: "controller-aura",
    handCounter: { category: "stage", amount: 3000 },
  },
  // OP18-027 Zoro & Sogeking: on the opponent's turn, an active
  // [Monkey.D.Luffy] Leader holding 3 or more given DON!! has its base power
  // become 7000.
  //
  // A `board-aura` read for the Leader alone: the clause is the Character's,
  // live while it stands on the field, and its subject is the Leader beside
  // it. Given DON!! stay on the Leader through the opponent's turn -- they go
  // back only in their owner's Refresh Phase -- which is what makes the gate
  // reachable at all. "Active" matters against OP18-022's own Leader, whose
  // restand holds it rested through the next Refresh Phase.
  {
    cardNumber: "OP18-027",
    scope: "board-aura",
    power: {
      kind: "set-base",
      value: (context) => {
        if (!context.isLeader) return undefined;
        if (turnPlayer(context) === context.playerId) return undefined;
        const player = context.state.players[context.playerId];
        if (player.leaderRested) return undefined;
        if (!hasCardName(player.leaderCardNumber, "Monkey.D.Luffy")) {
          return undefined;
        }
        return player.leaderAttachedDon.length >= 3 ? 7000 : undefined;
      },
    },
  },
  // OP18-030 Nami: −2000 to itself while rested on the opponent's turn. The
  // price of a 4-cost 6000: it defends at full power only if it did not swing.
  {
    cardNumber: "OP18-030",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        turnPlayer(context) !== context.playerId &&
        "rested" in context.card &&
        context.card.rested
          ? -2000
          : 0,
    },
  },
];
