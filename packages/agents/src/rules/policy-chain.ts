import type { GameObservation } from "@one-piece-sim/protocol";
import { chooseGenericRules, type PolicyDecision } from "./generic-policy.js";
import {
  decideModule,
  resolveWithModules,
  type PolicyModule,
} from "./policy-module.js";

export type RulesPolicy = (
  observation: GameObservation,
) => PolicyDecision | undefined;

/**
 * Legacy first-match-wins chaining, kept so existing call sites and tests keep
 * working. It now routes through the module resolver: each policy becomes a
 * `decide`-only module, which is exactly first-match-wins, so behaviour is
 * unchanged while new work can use scoring modules instead.
 */
export function chooseWithPolicies(
  observation: GameObservation,
  policies: readonly RulesPolicy[],
): PolicyDecision {
  return chooseWithModules(
    observation,
    policies.map((policy, index) => decideModule(`policy-${index}`, policy)),
  );
}

export function chooseWithModules(
  observation: GameObservation,
  modules: readonly PolicyModule[],
): PolicyDecision {
  if (modules.length === 0) return chooseGenericRules(observation);
  return resolveWithModules(observation, modules);
}
