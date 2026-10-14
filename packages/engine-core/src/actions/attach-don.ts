/**
 * `attach-don`: Give one active DON!! to the Leader or a Character.
 *
 * One of the eleven handlers `applyAction` dispatches to; see
 * `actions/index.ts` for the table and the contract they share.
 */
import { attachDon } from "../pending.js";
import { type ActionContext } from "./context.js";

export function applyAttachDon({
  state,
  events,
  activePlayer,
  offered,
}: ActionContext<"attach-don">): void {
  const player = state.players[activePlayer];
  const don = player.activeDon.splice(0, 1);
  attachDon(state, activePlayer, offered.targetInstanceId, don);
  events.push({
    type: "don-attached",
    playerId: activePlayer,
    targetInstanceId: offered.targetInstanceId,
    count: don.length,
  });
}
