/**
 * The small scorer as a seat: an `Agent` over `CompactModel`.
 *
 * Prunes the provably dominated actions as training did (`dominance.ts`),
 * encodes the decision exactly as the training games were encoded
 * (`compact.ts`), and takes the action the model gives the highest
 * probability. Decisions with one legal action never reach the model.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import type { Agent } from "../rules/local.js";
import {
  compactDecision,
  type CompactContext,
  type CompactDecision,
} from "./compact.js";
import type { CompactBatcher } from "./compact-batch.js";
import type { CompactModel, CompactScore } from "./compact-model.js";
import { prunedActions } from "./dominance.js";
import { loadCompact, type CompactPack } from "./pack.js";

export class CompactScorerAgent implements Agent {
  readonly #model: CompactModel;
  /** Scores through a batcher (and its GPU) when given one, else the model directly. */
  readonly #batcher: CompactBatcher | undefined;
  /** The model's last value estimate for its own seat, in [-1, 1]. */
  lastValue: number | undefined;
  lastProbabilities: number[] | undefined;

  readonly #context: CompactContext;

  /** `context.ownDeck` is the seat's own list, which the model reads the
      cards it has yet to draw from; a seat without it plays without them. */
  constructor(
    pack: CompactPack | CompactModel | CompactBatcher,
    context: CompactContext = {},
  ) {
    if ("onGpu" in pack) {
      this.#batcher = pack;
      this.#model = pack.model;
    } else this.#model = "score" in pack ? pack : loadCompact(pack);
    this.#context = context;
  }

  /** The same model as a seat that knows its own deck list. */
  withDeck(ownDeck: Record<string, number>): CompactScorerAgent {
    return new CompactScorerAgent(this.#batcher ?? this.#model, { ownDeck });
  }

  #score(decision: CompactDecision): CompactScore | Promise<CompactScore> {
    return this.#batcher
      ? this.#batcher.score(decision)
      : this.#model.score(decision);
  }

  async chooseAction(observation: GameObservation): Promise<LegalAction> {
    if (observation.legalActions.length === 1)
      return observation.legalActions[0]!;
    const pruned = prunedActions(observation);
    const offered = observation.legalActions.filter((_, i) => !pruned.has(i));
    if (offered.length === 1) return offered[0]!;
    const { probs, value } = await this.#score(
      compactDecision(observation, offered, this.#model.rows, this.#context),
    );
    this.lastValue = value;
    this.lastProbabilities = probs;
    let best = 0;
    for (let k = 1; k < probs.length; k += 1)
      if (probs[k]! > probs[best]!) best = k;
    return offered[best]!;
  }
}
