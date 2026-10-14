/**
 * Continuous text printed on ST-28: the rows `static-abilities.ts` folds
 * into power, cost and keyword queries. A clause with no timing marker lives
 * here; one with a marker is a program in this set's other modules.
 *
 * The (Green/Yellow) Yamato list's continuous clauses are mostly `[DON!! x2]`
 * -- the deck's own DON!! is the switch on most of its board. Its timed
 * clauses are in `op06-yamato.ts`.
 */
import { attachedDon, lowLife, turnPlayer } from "./static-shared.js";
import type { StaticAbility } from "../static-abilities.js";

export const st28StaticAbilities: readonly StaticAbility[] = [
  // ST28-005 Yamato: "[printed text omitted -- pnpm card:text ST28-005]"
  //
  // A 1-cost 0-power body that becomes a 3000 attacker for two DON!! it was
  // going to spend anyway -- and only on its controller's turn, so it defends
  // at 0 and is answered by anything. That asymmetry is why the list runs it
  // for the search rather than for the body.
  {
    cardNumber: "ST28-005",
    scope: "self",
    power: {
      kind: "add",
      value: (context) =>
        !context.isLeader &&
        turnPlayer(context) === context.playerId &&
        attachedDon(context) >= 2
          ? 3000
          : 0,
    },
  },
  // ST28-002 Izo: "[printed text omitted -- pnpm card:text ST28-002]" Unlike the
  // power layer above it this one has no `[Your Turn]`, which is the whole
  // point: a Blocker is only ever wanted on the opponent's turn.
  {
    cardNumber: "ST28-002",
    scope: "self",
    keyword: {
      keyword: "Blocker",
      when: (context) => attachedDon(context) >= 2,
    },
  },
  // ST28-004 Kouzuki Momonosuke: "[printed text omitted -- pnpm card:text ST28-004]"
  //
  // A Character buffing its own controller's *Leader*, so it is a
  // `board-aura` -- the scope filter finds a copy on the board and this
  // predicate asks the two questions the clause prints. `controller-aura`
  // cannot express it: that scope is live while `cardNumber` is the Leader, and
  // this text is printed on a Character.
  {
    cardNumber: "ST28-004",
    scope: "board-aura",
    power: {
      kind: "add",
      value: (context) =>
        context.isLeader &&
        turnPlayer(context) === context.playerId &&
        lowLife(context, 2)
          ? 1000
          : 0,
    },
  },
];
