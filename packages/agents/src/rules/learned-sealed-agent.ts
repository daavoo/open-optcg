import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import {
  ACTION_FEATURE_SIZE,
  encodeAction,
  encodeObservation,
  OBSERVATION_SIZE,
} from "../../../../ml/bridge/encode.js";
import type { Agent } from "./local.js";

/**
 * One `nn.Linear` from a trained `_mlp(...)` block (`ml/python/candidate_policy.py`),
 * row-major (`weight[out][in]`) so a plain nested loop reproduces `torch`'s
 * `x @ weight.T + bias` without a tensor library.
 */
export interface LearnedPolicyLayer {
  inDim: number;
  outDim: number;
  weight: readonly (readonly number[])[];
  bias: readonly number[];
}

/**
 * The actor half of a trained `CandidateActorCriticPolicy` checkpoint,
 * exported by `ml/python/export_web_policy.py`. Only the actor -- the critic
 * only matters for training, not for choosing a move.
 */
export interface LearnedSealedPolicyWeights {
  globalSize: number;
  rowSize: number;
  numSlots: number;
  contextLayers: readonly LearnedPolicyLayer[];
  slotLayers: readonly LearnedPolicyLayer[];
}

function linear(input: readonly number[], layer: LearnedPolicyLayer): number[] {
  const out = new Array<number>(layer.outDim);
  for (let o = 0; o < layer.outDim; o += 1) {
    let sum = layer.bias[o]!;
    const row = layer.weight[o]!;
    for (let i = 0; i < layer.inDim; i += 1) sum += row[i]! * input[i]!;
    out[o] = sum;
  }
  return out;
}

function tanh(values: readonly number[]): number[] {
  return values.map(Math.tanh);
}

/**
 * `context_net = _mlp(global_size, [256, 256], Tanh, out=None)`: every
 * `Linear` -- including the last -- is followed by `Tanh`, because `_mlp`
 * only appends an unactivated final layer when `out` is given.
 */
function contextForward(
  global: readonly number[],
  layers: readonly LearnedPolicyLayer[],
): number[] {
  let x = global as number[];
  for (const layer of layers) x = tanh(linear(x, layer));
  return x;
}

/**
 * `slot_net = _mlp(hidden + row_size, [128], Tanh, out=1)`: the hidden
 * `Linear` is followed by `Tanh`, but the final `Linear(128, 1)` (`out=1`) is
 * not -- it produces a raw score, not a squashed activation.
 */
function slotScore(
  context: readonly number[],
  row: readonly number[],
  layers: readonly LearnedPolicyLayer[],
): number {
  const [hidden, output] = layers;
  if (!hidden || !output) throw new Error("LEARNED_SEALED_POLICY_MALFORMED");
  const combined = [...context, ...row];
  const activated = tanh(linear(combined, hidden));
  return linear(activated, output)[0]!;
}

/**
 * Plays OP17 sealed with a trained pointer-policy checkpoint instead of the
 * hand-written rules chain -- greedy over the legal actions of the moment,
 * no training-time exploration noise. See `ml/README.md` for how it was
 * trained and measured against `RegistryRulesAgent(SEALED_LEADER)`.
 *
 * Reuses `ml/bridge/encode.ts` directly rather than reimplementing the
 * encoding: the model's weights are only meaningful read against the exact
 * feature layout they were trained on, so a second implementation would be a
 * standing risk of silent drift, not a convenience.
 */
export class LearnedSealedAgent implements Agent {
  readonly #weights: LearnedSealedPolicyWeights;

  constructor(weights: LearnedSealedPolicyWeights) {
    if (weights.globalSize !== OBSERVATION_SIZE) {
      throw new Error(
        `LEARNED_SEALED_POLICY_STALE: checkpoint expects a ${weights.globalSize}-float ` +
          `observation, encode.ts now produces ${OBSERVATION_SIZE}. Re-export the ` +
          "checkpoint with export_web_policy.py.",
      );
    }
    if (weights.rowSize !== ACTION_FEATURE_SIZE) {
      throw new Error(
        `LEARNED_SEALED_POLICY_STALE: checkpoint expects a ${weights.rowSize}-float ` +
          `action row, encode.ts now produces ${ACTION_FEATURE_SIZE}. Re-export the ` +
          "checkpoint with export_web_policy.py.",
      );
    }
    this.#weights = weights;
  }

  async chooseAction(observation: GameObservation): Promise<LegalAction> {
    const legal = observation.legalActions;
    if (legal.length === 0) throw new Error("NO_LEGAL_ACTION");
    // Same ordering `rl-server.ts` fed the model during training (sorted by
    // `actionId`, truncated to the padded slot count -- never hit in
    // practice, since legal-action counts measured well under `numSlots`).
    const candidates = [...legal]
      .sort((left, right) => left.actionId.localeCompare(right.actionId))
      .slice(0, this.#weights.numSlots);

    const global = encodeObservation(observation);
    const context = contextForward(global, this.#weights.contextLayers);

    let best = candidates[0]!;
    let bestScore = -Infinity;
    for (const action of candidates) {
      const row = encodeAction(observation, action);
      const score = slotScore(context, row, this.#weights.slotLayers);
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  }
}
