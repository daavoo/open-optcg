/**
 * The System-1 scorer as a seat: an `Agent` over the in-browser model.
 *
 * Renders the decision exactly as the training corpus was rendered
 * (`render.ts`), packs it the way `data.collate` does, and takes the action
 * the model gives the highest probability. Decisions with one legal action
 * never reach the model.
 */
import type { GameObservation, LegalAction } from "@one-piece-sim/protocol";
import type { Agent } from "../rules/local.js";
import type { PackedDecision, ScorerModel } from "./model.js";
import { loadScorer, type ScorerPack } from "./pack.js";
import { prunedActions } from "./dominance.js";
import { SUPPORTED_RENDER_VERSIONS, renderDecision } from "./render.js";
import type { Tokenizer } from "./tokenizer.js";

export class ScorerAgent implements Agent {
  readonly #model: ScorerModel;
  readonly #render: number;
  readonly #tokenizer: Tokenizer;
  /** The model's last value estimate for its own seat, in [-1, 1]. */
  lastValue: number | undefined;
  lastProbabilities: number[] | undefined;

  constructor(pack: ScorerPack | { model: ScorerModel; tokenizer: Tokenizer }) {
    const loaded = "model" in pack ? pack : loadScorer(pack);
    // A model reads only the text it was trained on; one exported from an
    // older render would score every decision, just wrongly. Each supported
    // version is rendered on request, so the pack's own is the one written.
    const render = loaded.model.config.render ?? 1;
    if (!SUPPORTED_RENDER_VERSIONS.includes(render))
      throw new Error(
        `SCORER_RENDER_MISMATCH: the model reads render version ${render}, this build writes ${SUPPORTED_RENDER_VERSIONS.join(" or ")}`,
      );
    this.#render = render;
    this.#model = loaded.model;
    this.#tokenizer = loaded.tokenizer;
  }

  /**
   * The decision as the model reads it, and the legal action behind each of
   * its options: dominated actions (`dominance.ts`) are dropped first.
   */
  pack(observation: GameObservation): {
    decision: PackedDecision;
    offered: LegalAction[];
  } {
    const pruned = prunedActions(observation);
    const rendered = renderDecision(observation, this.#render);
    return {
      decision: this.packRendered({
        state: rendered.state,
        actions: rendered.actions.filter((_, i) => !pruned.has(i)),
      }),
      offered: observation.legalActions.filter((_, i) => !pruned.has(i)),
    };
  }

  packRendered(rendered: { state: string; actions: string[] }): PackedDecision {
    const { cls, sep } = this.#model.config;
    const ids: number[] = [cls];
    const positions: number[] = [0];
    const segments: number[] = [0];
    const cardRows: number[] = [-1];
    const push = (
      tokens: ReturnType<Tokenizer["encode"]>,
      segment: number,
      start: number,
    ) => {
      let card = 0;
      tokens.ids.forEach((id, index) => {
        ids.push(id);
        positions.push(start + index);
        segments.push(segment);
        cardRows.push(
          id === this.#model.config.cardSlot
            ? this.#model.cardRow(tokens.cards[card++]!)
            : -1,
        );
      });
    };
    push(this.#tokenizer.encode(rendered.state), 0, 1);
    ids.push(sep);
    positions.push(ids.length - 1);
    segments.push(0);
    cardRows.push(-1);
    const stateLength = ids.length;
    const actions: Array<[number, number]> = [];
    rendered.actions.forEach((text, k) => {
      const start = ids.length;
      push(this.#tokenizer.encode(text), k + 1, stateLength);
      actions.push([start, ids.length]);
    });
    return {
      ids: Int32Array.from(ids),
      positions: Int32Array.from(positions),
      segments: Int32Array.from(segments),
      cardRows: Int32Array.from(cardRows),
      stateLength,
      actions,
    };
  }

  score(decision: PackedDecision) {
    return this.#model.score(decision);
  }

  async chooseAction(observation: GameObservation): Promise<LegalAction> {
    if (observation.legalActions.length === 1)
      return observation.legalActions[0]!;
    const { decision, offered: legal } = this.pack(observation);
    if (legal.length === 1) return legal[0]!;
    const { probs, value } = await this.#model.score(decision);
    this.lastValue = value;
    this.lastProbabilities = probs;
    let best = 0;
    for (let k = 1; k < probs.length; k += 1)
      if (probs[k]! > probs[best]!) best = k;
    return legal[best]!;
  }
}
