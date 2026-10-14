/**
 * Ending the Main phase, and saying what is being left on the table.
 *
 * The last of the five kinds of offer, and the only one that reads the others:
 * the summary counts the plays, activations and attacks already offered, so it
 * is built from the finished list rather than from the board.
 */

import type { GameState } from "../../model.js";
import type { LegalAction, PlayerId } from "@one-piece-sim/protocol";

/**
 * What ending the turn would give up.
 *
 * The action carries these as fields and the LLM agent's instructions tell it
 * to audit all four before passing, but a caller that reads summaries saw only
 * "End turn". Stating them is what makes an expiring DON!! visible at the one
 * decision where it is still spendable.
 */
function endTurnSummary(
  activeDon: number,
  plays: number,
  activations: number,
  attacks: number,
  connectingAttacks: number,
): string {
  const unused = [
    activeDon > 0 ? `${activeDon} active DON!! (which expire unspent)` : "",
    plays > 0 ? `${plays} card${plays === 1 ? "" : "s"} playable` : "",
    activations > 0
      ? `${activations} ability${activations === 1 ? "" : "s"} activatable`
      : "",
    attacks > 0
      ? `${attacks} attack${attacks === 1 ? "" : "s"} declarable${connectingAttacks > 0 ? `, ${connectingAttacks} of which beat${connectingAttacks === 1 ? "s" : ""} its target as the board stands` : ""}`
      : "",
  ].filter(Boolean);
  return unused.length === 0
    ? "End turn (nothing left to do)"
    : `End turn, giving up ${unused.join(", ")}`;
}

export function passOffer(
  state: GameState,
  playerId: PlayerId,
  actions: readonly LegalAction[],
): LegalAction {
  const player = state.players[playerId];
  return {
    actionId: `r${state.revision}:pass`,
    type: "pass",
    unspentActiveDon: player.activeDon.length,
    availablePlayCount: actions.filter((action) => action.type === "play-card")
      .length,
    availableActivationCount: actions.filter(
      (action) => action.type === "activate-main",
    ).length,
    eligibleAttackCount: actions.filter((action) => action.type === "attack")
      .length,
    summary: endTurnSummary(
      player.activeDon.length,
      actions.filter((action) => action.type === "play-card").length,
      actions.filter((action) => action.type === "activate-main").length,
      actions.filter((action) => action.type === "attack").length,
      // Not all declarable attacks are worth declaring, and the count alone
      // does not separate them: a 2000 body that cannot reach a 5000 Leader is
      // in `eligibleAttackCount` beside a swing that takes a Life. Recorded
      // games ended a main phase with a connecting attack unused while the
      // reasoning cited the attacks that could not connect, so the half that
      // matters is stated separately. `counterShortfall > 0` is exactly "wins
      // unless the defender pays".
      actions.filter(
        (action) =>
          action.type === "attack" && (action.counterShortfall ?? 0) > 0,
      ).length,
    ),
  };
}
