/**
 * Giving a DON!! card to the Leader or to a Character.
 *
 * One of the five kinds of offer the Main phase makes; `index.ts` composes them.
 */
import { actionCardLabel, leaderInstanceId } from "../../board.js";
import type { GameState } from "../../model.js";
import type { CardDatabase } from "@one-piece-sim/cards";
import type { LegalAction, PlayerId } from "@one-piece-sim/protocol";

export function donOffers(
  state: GameState,
  playerId: PlayerId,
  db: CardDatabase,
): LegalAction[] {
  const player = state.players[playerId];
  const actions: LegalAction[] = [];
  if (player.activeDon.length > 0) {
    for (const targetInstanceId of [
      leaderInstanceId(playerId),
      ...player.board.map((card) => card.instanceId),
    ]) {
      const target = actionCardLabel(
        state,
        playerId,
        targetInstanceId,
        true,
        db,
      );
      actions.push({
        actionId: `r${state.revision}:attach:${targetInstanceId}`,
        type: "attach-don",
        targetInstanceId,
        // Two separate rules, and saying only one of them is how this label
        // came to promise a defensive boost that does not exist. Comprehensive
        // Rules 6-5-5-2: a given DON!! is +1000 power *during your turn* --
        // which is why `battle.ts` prices a defender with
        // `includeAttachedDon: false` and `observe` gates the field on
        // `viewer === turnPlayer`. 6-2-3: the DON!! card itself stays under the
        // card it was given to until your next Refresh Phase. So the power is
        // gone at end of turn while the DON!! is still spent, and cannot pay
        // for a [Counter] Event on the way back round.
        summary: `Attach 1 DON!! to ${target} (+1000 power during this turn only; the DON!! stays under it until your next Refresh, so it cannot pay for a [Counter] Event)`,
      });
    }
  }
  return actions;
}
