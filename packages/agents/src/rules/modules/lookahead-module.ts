import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import type { Simulate } from "@one-piece-sim/engine-core";
import { viableAttacks } from "../generic-policy.js";
import type { PolicyContext, PolicyModule } from "../policy-module.js";

/**
 * One-ply lookahead for DON!! allocation, expressed as a veto.
 *
 * `analysis/human-test-01-manual-vs-rules.md` names this as the largest gap
 * between the rules agents and a human line: the agents attach DON!! to the
 * first legal target rather than to the target that unlocks an attack. Every
 * deck policy re-implements its own static heuristic for this and none of them
 * can see the consequence.
 *
 * A simulator turns that into a measurement. The module deliberately does *not*
 * take the decision over: an earlier draft claimed the whole decision point via
 * `owns`, which meant it scored only DON!! actions and left attacks at zero --
 * ST35 dropped from 56.8% to 0.0% because its agent could no longer attack.
 * Instead it removes the attachments that a one-ply search shows to be strictly
 * worse and lets each deck policy pick from what survives, keeping every other
 * judgement where it already lives.
 */

interface AttackReach {
  viable: number;
  leaderReach: boolean;
  surplus: number;
}

function reach(observation: GameObservation): AttackReach {
  const attacks = viableAttacks(observation, observation.legalActions);
  const opponentLeaderId = `${observation.viewer === "p1" ? "p2" : "p1"}-leader`;
  return {
    viable: attacks.length,
    leaderReach: attacks.some(
      (action) => action.targetInstanceId === opponentLeaderId,
    ),
    // Power above the opposing Leader forces Counter cards out of hand, so it
    // is a tiebreak but must never outweigh a whole extra attack.
    surplus: observation.self.board
      .filter((card) => !card.rested)
      .reduce(
        (total, card) =>
          total +
          Math.max(
            0,
            card.currentPower - observation.opponent.leader.currentPower,
          ),
        0,
      ),
  };
}

const rank = (value: AttackReach): number =>
  value.viable * 1_000_000 +
  (value.leaderReach ? 100_000 : 0) +
  Math.min(value.surplus, 99_000);

export function createDonLookaheadModule(
  getSimulate: () => Simulate | undefined,
): PolicyModule {
  // Cached per decision point: `veto` is called once per action and the
  // simulation is the expensive part.
  let cacheKey = "";
  let best = -1;
  let ranks = new Map<string, number>();

  const evaluate = (context: PolicyContext): void => {
    const key = `${context.observation.gameId}:${context.observation.revision}`;
    if (key === cacheKey) return;
    cacheKey = key;
    ranks = new Map();
    best = -1;
    const simulate = getSimulate();
    if (!simulate) return;
    for (const action of context.actions) {
      if (action.type !== "attach-don") continue;
      const after = simulate(action.actionId);
      if (!after) continue;
      const value = rank(reach(after));
      ranks.set(action.actionId, value);
      if (value > best) best = value;
    }
  };

  return {
    id: "don-lookahead",

    veto(context: PolicyContext, action: LegalAction): string | undefined {
      if (action.type !== "attach-don") return undefined;
      if (context.observation.phase !== "main") return undefined;
      if (getSimulate() === undefined) return undefined;
      // With a play still affordable, deploying usually beats powering up and
      // the deck policy is better placed to judge that. Stay out of it.
      if (context.actions.some((candidate) => candidate.type === "play-card")) {
        return undefined;
      }
      evaluate(context);
      const value = ranks.get(action.actionId);
      if (value === undefined || value >= best) return undefined;
      return "A different DON!! attachment unlocks a strictly better attack set.";
    },
  };
}
