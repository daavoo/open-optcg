import { describe, expect, it } from "vitest";
import { createGame, observe } from "@one-piece-sim/engine-core";
import {
  chooseGenericRules,
  chooseWithPolicies,
  type RulesPolicy,
} from "@one-piece-sim/agents/local";

import { resolveDeck } from "@one-piece-sim/decks";

function openingObservation() {
  const state = createGame({
    gameId: "policy-chain",
    p1: resolveDeck("(Red) Monkey.D.Luffy - Starter Deck 31"),
    p2: resolveDeck("(Green) Roronoa Zoro - Starter Deck 32"),
    seed: "policy-chain-seed",
  });
  return observe(state, state.activePlayer);
}

describe("rules policy composition", () => {
  it("uses the first deck-specific override that returns a decision", () => {
    const observation = openingObservation();
    const overrideAction = observation.legalActions.find(
      (action) =>
        action.type === "mulligan-decision" && action.decision === "keep",
    )!;
    const skipped: RulesPolicy = () => undefined;
    const override: RulesPolicy = () => ({
      action: overrideAction,
      reasons: ["deck override"],
    });

    const result = chooseWithPolicies(observation, [skipped, override]);

    expect(result.action.actionId).toBe(overrideAction.actionId);
    expect(result.reasons).toEqual(["deck override"]);
  });

  it("uses generic rules when no deck policy applies", () => {
    const observation = openingObservation();
    const expected = chooseGenericRules(observation);

    const result = chooseWithPolicies(observation, [() => undefined]);

    expect(result).toEqual(expected);
  });
});
