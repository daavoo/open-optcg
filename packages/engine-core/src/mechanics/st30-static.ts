/**
 * Continuous text printed on ST-30: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { hasCardName } from "@one-piece-sim/cards";
import { turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st30StaticAbilities: readonly StaticAbility[] = [
  // ST30-001 Luffy & Ace (Leader): "[printed text omitted -- pnpm card:text ST30-001]"
  //
  // Two clauses, two layers, the same split OP13-004 Sabo takes: a `self` layer
  // for what the Leader does to itself and a `controller-aura` for what it does
  // to everything else.
  //
  // The first is a *penalty*, and it is the deck's whole building rule -- the
  // shipped list is 6000-power bodies and under precisely so this never fires.
  // It is written anyway rather than assumed away: an Extra Regulation build,
  // or a Character handed base power by an opponent's effect, can turn it on,
  // and a Leader silently 2000 too big would be invisible in every battle.
  //
  // "7000 base power" reads printed power, the same simplification OP14-003 and
  // OP17-112 take for their own base-power gates -- and the same reason: a
  // layer that asked what another card's *layered* base power was would have to
  // fold the table it is part of.
  {
    cardNumber: "ST30-001",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader &&
        context.state.players[context.playerId].board.some(
          (card) => (context.db.require(card.cardNumber).power ?? 0) >= 7000,
        )
          ? -2000
          : 0,
    },
  },
  {
    cardNumber: "ST30-001",
    scope: "controller-aura",
    power: {
      kind: "add",
      value: (context) => {
        // "[Opponent's Turn]": live exactly while the cards' own controller is
        // not the turn player. This is a defensive buff -- it turns the deck's
        // 6000s into 9000s to be attacked into, and does nothing on the turn
        // they attack.
        if (turnPlayer(context) === context.playerId) return 0;
        // The Leader is named "Luffy & Ace", not [Monkey.D.Luffy], so it is
        // not one of "your [Monkey.D.Luffy] cards" and buffs itself here by
        // neither name. `hasCardName` is what makes that call rather than a
        // string compare -- a card answers to every name it prints.
        return hasCardName(context.card.cardNumber, "Portgas.D.Ace") ||
          hasCardName(context.card.cardNumber, "Monkey.D.Luffy")
          ? 3000
          : 0;
      },
    },
  },
  // ST30-003 Edward.Newgate: on its controller's turn, every Character of
  // theirs printed at exactly 6000 attacks 1000 bigger.
  //
  // `board-aura`, because the buff reaches its teammates rather than only
  // itself -- and it reaches Newgate too, which is a 6000. Printed power on
  // both sides of the question: the clause names base power, so a body the
  // DON!! have already lifted is still inside it and one debuffed below is
  // too. `[Your Turn]` makes it purely offensive, which is what a wall deck is
  // buying at 8 cost.
  {
    cardNumber: "ST30-003",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) === context.playerId &&
        context.db.require(context.card.cardNumber).power === 6000
          ? 1000
          : 0,
    },
  },
];
