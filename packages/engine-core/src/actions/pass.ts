/**
 * `pass`: end the Block step, the Counter step, or the turn.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import { resolveBattle } from "../battle.js";
import { endTurn } from "../turn.js";
import type { ActionContext } from "./context.js";

export function applyPass({ state, events, db }: ActionContext<"pass">): void {
  if (state.phase === "block") {
    state.phase = "counter";
  } else if (state.phase === "counter") {
    resolveBattle(state, events, db);
  } else {
    endTurn(state, events, db);
  }
}
