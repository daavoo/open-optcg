/**
 * The opening-hand decision, which both seats take before Life is dealt.
 *
 * One of the per-phase offer generators `getLegalActions` dispatches to.
 */
import { type GameState } from "../model.js";
import { type LegalAction } from "@one-piece-sim/protocol";

export function mulliganActions(state: GameState): LegalAction[] {
  return (["keep", "mulligan"] as const).map((decision) => ({
    actionId: `r${state.revision}:mulligan:${decision}`,
    type: "mulligan-decision",
    decision,
    summary: decision === "keep" ? "Keep opening hand" : "Mulligan hand",
  }));
}
