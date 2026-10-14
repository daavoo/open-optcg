/**
 * Decisions from many games scored together.
 *
 * A seat asks for one decision and awaits it; the batcher holds each request
 * until the current task has run its course -- every game that was resumed
 * has reached its next decision by then -- and scores all of them in one pass
 * (`CompactModel.scoreMany`), on the GPU when there is one. One game alone
 * makes batches of one, which is just a decision scored a task later.
 *
 * A GPU that fails mid-run (a lost device, a driver error) is dropped and the
 * rest of the run scores on the CPU, so a run never dies of it.
 */
import type { CompactDecision } from "./compact.js";
import type { CompactGpu } from "./compact-gpu.js";
import type { CompactModel, CompactScore } from "./compact-model.js";

interface Pending {
  decision: CompactDecision;
  resolve(score: CompactScore): void;
  reject(error: unknown): void;
}

export class CompactBatcher {
  readonly model: CompactModel;
  #gpu: CompactGpu | null;
  #queue: Pending[] = [];
  #scheduled = false;

  constructor(model: CompactModel, gpu: CompactGpu | null) {
    this.model = model;
    this.#gpu = gpu;
  }

  /** Whether batches still go to the GPU. */
  get onGpu(): boolean {
    return this.#gpu !== null;
  }

  score(decision: CompactDecision): Promise<CompactScore> {
    return new Promise((resolve, reject) => {
      this.#queue.push({ decision, resolve, reject });
      if (this.#scheduled) return;
      this.#scheduled = true;
      setTimeout(() => {
        void this.#flush();
      }, 0);
    });
  }

  async #flush(): Promise<void> {
    const batch = this.#queue;
    this.#queue = [];
    this.#scheduled = false;
    try {
      const scores = await this.#scoreAll(batch.map((p) => p.decision));
      batch.forEach((p, i) => {
        p.resolve(scores[i]!);
      });
    } catch (error) {
      for (const p of batch) p.reject(error);
    }
  }

  async #scoreAll(decisions: CompactDecision[]): Promise<CompactScore[]> {
    const gpu = this.#gpu;
    if (gpu) {
      try {
        return await this.model.scoreMany(decisions, (stage) => gpu.run(stage));
      } catch (error) {
        console.warn(
          "Learned model: the GPU failed, scoring on the CPU",
          error,
        );
        this.#gpu = null;
      }
    }
    return decisions.map((decision) => this.model.score(decision));
  }
}
