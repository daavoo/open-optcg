/**
 * Continuous text printed on ST-19: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 */
import { attachedDon, turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st19StaticAbilities: readonly StaticAbility[] = [
  // PRB02-015 Shiryu: "If your Leader has the {Blackbeard Pirates} type, this
  // Character gains [Blocker] and +4 cost."
  //
  // Both halves of one printed sentence, so both read the same gate. The +4 is
  // not a drawback the way a hand price would be -- it applies on the field,
  // where a 4-cost body reading as an 8-cost is out of reach of every
  // "cost N or less" removal in the pool, and this Character's whole job is to
  // block and be traded on its own terms. It also puts Shiryu outside
  // ST27-005's own "cost of 3 or less" K.O., which is the printed text and not
  // an accident of the layer.
  //
  // The `[On K.O.]` half is a program in `mechanics/st27.ts`; only these two
  // are continuous.
  {
    // ST19-004 Hina: +4 cost on the opponent's turn, with a DON!! given to it.
    //
    // A cost layer with no power on it, which is unusual and is the point: the
    // deck's own removal reads cost, and so does most of Black's, so four cost
    // in the window where the opponent's effects resolve is what stops a 4-cost
    // 6000 being answered by the removal aimed at 4-costs. Continuous text, so
    // there is nothing to resolve and no flag to write.
    cardNumber: "ST19-004",
    scope: "self",
    cost: (context) =>
      !context.isLeader &&
      turnPlayer(context) !== context.playerId &&
      attachedDon(context) >= 1
        ? 4
        : 0,
  },
];
