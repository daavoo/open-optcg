import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";

/**
 * A Counter played onto a card other than the one being attacked.
 *
 * The rules allow it (Bandai's rules Q&A, Keywords 4), so the engine offers
 * it, after every other Counter-step offer. It leaves the battle's defense
 * where it is, and nothing the shipped agents weigh in a Counter step is
 * about another card's power for the rest of a battle, so they never take it:
 * every agent's entry point leaves these out before it decides, which keeps
 * their choices exactly what they were before the offers existed.
 */
export function isAsideCounter(action: LegalAction): boolean {
  return action.type === "counter" && action.targetInstanceId !== undefined;
}

/** `observation` without the aside Counter offers. See {@link isAsideCounter}. */
export function withoutAsideCounters(
  observation: GameObservation,
): GameObservation {
  return observation.legalActions.some(isAsideCounter)
    ? {
        ...observation,
        legalActions: observation.legalActions.filter(
          (action) => !isAsideCounter(action),
        ),
      }
    : observation;
}
