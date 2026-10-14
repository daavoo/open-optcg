import type { GameObservation } from "@one-piece-sim/protocol";
import type { Plan, SimulatedLine } from "@one-piece-sim/engine-core";
import {
  attackerPower,
  opponentLeaderId,
  targetPower,
  viableAttacks,
} from "../generic-policy.js";
import type { PolicyContext, PolicyModule } from "../policy-module.js";
import { tacticsFor } from "../tactics.js";

/**
 * DON!! allocation valued by the whole attack sequence it enables.
 *
 * The deeper of the two DON!! lookaheads. `lookahead-module.ts` scores an
 * attachment by counting the viable attacks after it, which is too shallow an
 * objective to move any deck; what is wanted is the value of the whole attack
 * *sequence*.
 *
 * Two things make that reachable. `SimulatedLine` makes the search resumable, so the line can
 * be played out to the end of the turn instead of stopping after one action. And
 * the objective is now the resource the sequence actually drains: the number of
 * Counter *cards* the defender must spend across every attack in it.
 *
 * Counting cards rather than power is what makes the objective sensitive to the
 * thing DON!! allocation controls. Against a 5000 Leader, 5000 and 6000 both cost
 * the defender one card while 7000 costs two, so spreading two DON!! across two
 * 5000 bodies is worth nothing and putting both on one 5000 body is worth a card.
 * Attack *counts* cannot see that difference; card demand can.
 *
 * The opponent's decisions inside the line are stepped with `pass`, so the value
 * is what the line *demands*, not what it achieves. That is the honest objective
 * for a single-seat planner: it cannot know which Counters the opponent holds,
 * and pricing pressure does not require it to.
 */

/** Cap on simulated actions per candidate. Turns rarely need more than this. */
const MAX_PLAYOUT_DEPTH = 8;
/** The largest single Counter card in the format. */
const MAX_COUNTER_STEP = 2_000;

function cardsDemanded(
  observation: GameObservation,
  action: Extract<GameObservation["legalActions"][number], { type: "attack" }>,
): number {
  const demand =
    attackerPower(observation, action) - targetPower(observation, action) + 1;
  return demand <= 0 ? 0 : Math.ceil(demand / MAX_COUNTER_STEP);
}

/**
 * Plays the viewer's remaining attacks out and returns the total Counter-card
 * demand of the sequence.
 *
 * The playout order mirrors what the deck policies do unprompted -- smallest
 * viable attack into the Leader first -- because the point is to value the DON!!
 * allocation under the policy that will actually pilot the turn, not under an
 * optimal one.
 */
function sequenceDemand(start: SimulatedLine): number {
  let line: SimulatedLine | undefined = start;
  let total = 0;
  for (let depth = 0; depth < MAX_PLAYOUT_DEPTH && line; depth += 1) {
    if (line.decidingPlayer !== line.viewer) {
      line = line.advanceDefault();
      continue;
    }
    const observation = line.observation;
    const attacks = viableAttacks(observation, observation.legalActions);
    if (attacks.length === 0) break;
    const leader = opponentLeaderId(observation);
    const next =
      [...attacks]
        .filter((action) => action.targetInstanceId === leader)
        .sort(
          (left, right) =>
            attackerPower(observation, left) -
            attackerPower(observation, right),
        )[0] ?? attacks[0];
    if (!next) break;
    total += cardsDemanded(observation, next);
    line = line.advance(next.actionId);
  }
  return total;
}

export function createDonSequenceModule(
  getPlan: () => Plan | undefined,
): PolicyModule {
  let cacheKey = "";
  let best = -1;
  let values = new Map<string, number>();

  const evaluate = (context: PolicyContext): void => {
    const key = `${context.observation.gameId}:${context.observation.revision}`;
    if (key === cacheKey) return;
    cacheKey = key;
    values = new Map();
    best = -1;
    const plan = getPlan();
    if (!plan) return;
    const candidates = context.actions.filter(
      (action) => action.type === "attach-don",
    );
    // With one candidate there is nothing to choose between, and the playout is
    // the expensive part.
    if (candidates.length < 2) return;
    for (const action of candidates) {
      const line = plan(action.actionId);
      if (!line) continue;
      const value = sequenceDemand(line);
      values.set(action.actionId, value);
      if (value > best) best = value;
    }
  };

  return {
    id: "don-sequence",

    rank(context: PolicyContext, action) {
      if (action.type !== "attach-don") return undefined;
      if (context.observation.phase !== "main") return undefined;
      if (getPlan() === undefined) return undefined;
      // A one-turn playout is blind to DON!! being *accumulated* toward a
      // `[DON!! xN]` condition: attaching the first of ST32's three shows no
      // restand this turn, so the line looks worthless and the attachment loses
      // to whatever creates one more attack now. Rank ability-completion above
      // every sequence value instead. Fixing this properly means searching over
      // attachments and activations together, not only attacks.
      const t = tacticsFor(context.observation);
      if (t.canCompleteDonAbility(action.targetInstanceId)) {
        return {
          score: Number.MAX_SAFE_INTEGER,
          reason:
            "Attach DON!! to switch on this unit's own [DON!! xN] ability first.",
        };
      }
      evaluate(context);
      const value = values.get(action.actionId);
      if (value === undefined || best <= 0) return undefined;
      return {
        score: value,
        reason:
          "Attach DON!! where the resulting attack sequence demands the most Counter cards.",
      };
    },
  };
}
